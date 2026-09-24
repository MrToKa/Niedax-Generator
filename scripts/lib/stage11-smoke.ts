import { randomUUID } from "node:crypto";

import {
  AuthenticatedIdentityResponseV2Schema,
  CalculateProjectDraftResponseV2Schema,
  OperationalMetricsSchema,
  ProjectDraftResponseV2Schema,
  ProjectListResponseV3Schema,
  SystemInfoSchema
} from "../../packages/domain/src/index.js";
import { parseStage11Accounts, type Stage11Accounts } from "./stage11-seed.js";

/** Small real HTTP workflow. Errors contain only fixed stage names/statuses, never response bodies. */
export async function runStage11Smoke(options: {
  baseUrl: string;
  accounts: Stage11Accounts;
  expectedGitCommit?: string;
  fetch?: typeof fetch;
}) {
  const accounts = parseStage11Accounts(options.accounts);
  const base = new URL(options.baseUrl);
  if (
    !["http:", "https:"].includes(base.protocol) ||
    base.username ||
    base.password ||
    base.pathname !== "/" ||
    base.search ||
    base.hash
  )
    throw new Error("Invalid TEST smoke origin");
  const request = options.fetch ?? fetch;
  let stage = "gateway";
  const cookieJars: string[] = [];
  const call = async (path: string, cookie = "", body?: unknown) => {
    const response = await request(new URL(path, base), {
      method: body === undefined ? "GET" : "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
      headers: {
        accept: "application/json",
        ...(cookie ? { cookie } : {}),
        ...(body === undefined
          ? {}
          : {
              "content-type": "application/json",
              origin: base.origin,
              "x-niedax-csrf": "1",
              "idempotency-key": `stage11-smoke-${randomUUID()}`
            })
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    if (!response.ok) throw new Error("Unexpected HTTP status");
    return response;
  };
  try {
    const frontend = await call("/");
    const html = await frontend.text();
    if (
      !frontend.headers.get("content-type")?.includes("text/html") ||
      !html.includes("<title>Niedax Generator</title>")
    )
      throw new Error("Frontend entry document missing");
    stage = "frontend-assets";
    const asset = /src="(\/_next\/static\/[^"\s]+\.js)"/u.exec(html)?.[1];
    if (!asset) throw new Error("Frontend bundle reference missing");
    const bundle = await call(asset);
    if (!(await bundle.text()).length) throw new Error("Frontend bundle empty");
    stage = "liveness";
    if (((await (await call("/api/v1/health/live")).json()) as { status?: string }).status !== "ok")
      throw new Error("Liveness failed");
    stage = "readiness";
    const ready = (await (await call("/api/v1/health/ready")).json()) as {
      status?: string;
      database?: string;
    };
    if (ready.status !== "ready" || ready.database !== "connected")
      throw new Error("Readiness failed");
    let designerCookie = "";
    let administratorCookie = "";
    // Two sessions suffice for the functional and administrator checks and retain
    // the normal production login rate limit. Four-role existence is seed-verified.
    for (const role of ["administrator", "designer"] as const) {
      stage = `authentication-${role}`;
      const login = await call("/api/v1/auth/login", "", accounts[role]);
      const identity = AuthenticatedIdentityResponseV2Schema.parse(await login.json());
      const cookie = login.headers.get("set-cookie")?.split(";")[0];
      if (
        !cookie ||
        identity.user.role !== role ||
        identity.user.username !== accounts[role].username
      )
        throw new Error("TEST role authentication differs");
      cookieJars.push(cookie);
      if (role === "designer") designerCookie = cookie;
      if (role === "administrator") administratorCookie = cookie;
    }
    stage = "system-info";
    const info = SystemInfoSchema.parse(
      await (await call("/api/v1/system/info", designerCookie)).json()
    );
    if (
      info.schemaVersion !== "system-info/v1" ||
      info.build.environment !== "test" ||
      !info.build.application ||
      !info.build.gitCommit ||
      !/^[a-f0-9]{40}$/u.test(info.build.gitCommit) ||
      !info.build.buildTimestamp ||
      !Number.isFinite(Date.parse(info.build.buildTimestamp)) ||
      (options.expectedGitCommit !== undefined &&
        info.build.gitCommit !== options.expectedGitCommit) ||
      !info.active.catalogues.length ||
      !info.active.ruleSets.length ||
      !info.active.ruleSets.every((rule) =>
        info.active.catalogues.some((catalog) => catalog.id === rule.catalogVersionId)
      )
    )
      throw new Error("TEST identity or active catalog/rules missing");
    stage = "metrics-feature-policy";
    const metricsResponse = await request(new URL("/api/v1/system/metrics", base), {
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
      headers: { cookie: administratorCookie }
    });
    if (info.featureFlags.operationalMetrics) {
      if (!metricsResponse.ok) throw new Error("Enabled metrics unavailable");
      const metrics = OperationalMetricsSchema.parse(await metricsResponse.json());
      if (metrics.databaseReadiness !== "ready" || metrics.build.gitCommit !== info.build.gitCommit)
        throw new Error("Metrics runtime identity differs");
    } else if (metricsResponse.status !== 404) throw new Error("Disabled metrics are available");
    stage = "demo-project";
    let projectId: string | undefined;
    let cursor: string | null = null;
    for (let page = 0; page < 100; page++) {
      const list = ProjectListResponseV3Schema.parse(
        await (
          await call(
            `/api/v1/projects?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
            designerCookie
          )
        ).json()
      );
      projectId = list.projects.find((project) => project.code === "S11-DEMO-KL")?.id;
      if (projectId || !list.nextCursor) break;
      cursor = list.nextCursor;
    }
    if (!projectId) throw new Error("Deterministic TEST demo unavailable");
    const draft = ProjectDraftResponseV2Schema.parse(
      await (await call(`/api/v1/projects/${projectId}`, designerCookie)).json()
    );
    stage = "demo-calculation";
    const calculation = CalculateProjectDraftResponseV2Schema.parse(
      await (
        await call(`/api/v1/projects/${projectId}/calculations`, designerCookie, {
          schemaVersion: "calculate-project-draft-request/v2",
          expectedDraftVersion: draft.project.draftVersion
        })
      ).json()
    );
    if (
      calculation.calculation.run.status !== "succeeded" ||
      calculation.calculation.stale ||
      calculation.calculation.projectId !== projectId ||
      !calculation.calculation.result.bomLines.length
    )
      throw new Error("TEST calculation contract failed");
    return {
      schemaVersion: "stage11-smoke/v1",
      timestamp: new Date().toISOString(),
      environment: "test",
      passed: true,
      applicationVersion: info.build.application,
      gitCommit: info.build.gitCommit,
      catalogVersions: info.active.catalogues.map((item) => item.version),
      ruleVersions: info.active.ruleSets.map((item) => item.version),
      authentication: "administrator-and-designer-passed",
      functionalCheck: "designer-demo-calculation",
      approvedRevisionMutated: false
    };
  } catch {
    throw new Error(`Persistent TEST smoke failed at ${stage}; response and credentials withheld`);
  } finally {
    for (const cookie of cookieJars)
      await call("/api/v1/auth/logout", cookie, {}).catch(() => undefined);
  }
}
