import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { provisionStage11Accounts } from "../lib/stage11-seed.js";
import { runStage11Smoke } from "../lib/stage11-smoke.js";
import goldenResult from "../../packages/calculation-engine/tests/golden/expected/all-major-rules-combined.json" with { type: "json" };
import {
  assertStage11SeedEnvironment,
  parseStage11Accounts,
  stage11AccountRoles
} from "../../apps/backend/src/stage11-seed-contract.js";

async function removeTestDirectory(directory: string): Promise<void> {
  const absolute = resolve(directory);
  if (!absolute.startsWith(`${resolve(tmpdir())}${sep}niedax-stage11-account-test-`))
    throw new Error("Unsafe test cleanup");
  await rm(absolute, { recursive: true });
}

describe("persistent TEST credentials", () => {
  it("preserves generated secrets across repeated and concurrent provisioning", async () => {
    const directory = await mkdtemp(join(tmpdir(), "niedax-stage11-account-test-"));
    try {
      const [first, second] = await Promise.all([
        provisionStage11Accounts(directory),
        provisionStage11Accounts(directory)
      ]);
      expect(first).toEqual(second);
      expect(new Set(Object.values(first).map((account) => account.password)).size).toBe(4);
      expect(await provisionStage11Accounts(directory)).toEqual(first);
      expect(
        JSON.parse(await readFile(join(directory, "data/test/secrets/accounts.json"), "utf8"))
      ).toEqual(first);
      await writeFile(
        join(directory, "data/test/secrets/accounts.json"),
        JSON.stringify({ ...first, viewer: { ...first.viewer, username: "normal.viewer" } })
      );
      await expect(provisionStage11Accounts(directory)).rejects.toThrow(
        "Invalid persistent TEST account configuration"
      );
    } finally {
      await removeTestDirectory(directory);
    }
  });

  it("rejects a normal/disposable identity before provisioning", () => {
    const safe = {
      NIEDAX_ENV: "test",
      NIEDAX_TEST_PROJECT: "niedax-test",
      PGHOST: "postgres",
      PGUSER: "niedax_generator_app"
    };
    expect(() => assertStage11SeedEnvironment(safe)).not.toThrow();
    for (const changed of [
      { NIEDAX_ENV: "production" },
      { NIEDAX_TEST_PROJECT: "niedax-stage10-1-2" },
      { PGHOST: "normal-db" },
      { PGUSER: "postgres" }
    ])
      expect(() => assertStage11SeedEnvironment({ ...safe, ...changed })).toThrow("Refusing seed");
  });
});

describe("TEST smoke safe failure paths", () => {
  const password = "Test-only-generated-example!A7".repeat(2);
  const accounts = parseStage11Accounts(
    Object.fromEntries(
      stage11AccountRoles.map((role) => [role, { username: `test.${role}`, password }])
    )
  );

  it.each([true, false])(
    "verifies the real transport contracts and metrics flag %s without saving a revision",
    async (metricsEnabled) => {
      const projectId = "a1100000-0000-4000-8000-000000000001";
      const ownerId = "a1100000-0000-4000-8000-000000000002";
      const runId = "a1100000-0000-4000-8000-000000000003";
      const catalogId = "a1100000-0000-4000-8000-000000000004";
      const ruleId = "a1100000-0000-4000-8000-000000000005";
      const timestamp = "2026-09-24T10:00:00Z";
      const build = {
        environment: "test",
        application: "0.1.0",
        gitCommit: "a".repeat(40),
        buildTimestamp: timestamp
      };
      const summary = {
        id: projectId,
        ownerId,
        ownerDisplayName: "TEST Designer",
        code: "S11-DEMO-KL",
        name: "TEST demo",
        description: null,
        status: "draft",
        defaultLocale: "bg",
        defaultReservePercent: "0",
        draftVersion: 1,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      const json = (body: unknown, headers: Record<string, string> = {}) =>
        new Response(JSON.stringify(body), {
          headers: { "content-type": "application/json", ...headers }
        });
      const paths: string[] = [];
      const request = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
        const path = new URL(String(input)).pathname;
        paths.push(path);
        switch (path) {
          case "/":
            return new Response(
              '<html><head><title>Niedax Generator</title><script src="/_next/static/chunks/app.js"></script></head></html>',
              { headers: { "content-type": "text/html" } }
            );
          case "/_next/static/chunks/app.js":
            return new Response("runtime();");
          case "/api/v1/health/live":
            return json({ status: "ok" });
          case "/api/v1/health/ready":
            return json({ status: "ready", database: "connected" });
          case "/api/v1/auth/login": {
            const credential = JSON.parse(String(init?.body)) as { username: string };
            return json(
              {
                schemaVersion: "authenticated-identity-response/v2",
                correlationId: "smoke-test",
                user: {
                  id: ownerId,
                  username: credential.username,
                  displayName: "TEST user",
                  role: credential.username.split(".")[1],
                  capabilities: []
                }
              },
              { "set-cookie": "niedax_session=test-token; HttpOnly" }
            );
          }
          case "/api/v1/system/info":
            return json({
              schemaVersion: "system-info/v1",
              build,
              featureFlags: { operationalMetrics: metricsEnabled },
              repository: { catalogue: "2022-p0", rules: "2022-p0" },
              active: {
                catalogues: [{ id: catalogId, scope: "p0", version: "2022-p0" }],
                ruleSets: [
                  { id: ruleId, catalogVersionId: catalogId, scope: "p0", version: "2022-p0" }
                ]
              },
              migrationState: "not-exposed"
            });
          case "/api/v1/system/metrics":
            return metricsEnabled
              ? json({
                  schemaVersion: "operational-metrics/v1",
                  uptimeSeconds: 1,
                  requestCount: 1,
                  serverErrorCount: 0,
                  criticalApplicationErrorCount: 0,
                  exportWorkerFailureCount: 0,
                  databaseReadiness: "ready",
                  build
                })
              : new Response(null, { status: 404 });
          case "/api/v1/projects":
            return json({
              schemaVersion: "project-list-response/v3",
              correlationId: "smoke-test",
              projects: [{ ...summary, editorState: "editable" }],
              nextCursor: null
            });
          case `/api/v1/projects/${projectId}`:
            return json({
              schemaVersion: "project-draft-response/v2",
              correlationId: "smoke-test",
              catalogSnapshot: goldenResult.catalogSnapshot,
              ruleSnapshot: goldenResult.ruleSnapshot,
              project: {
                ...summary,
                cableLoad: null,
                routes: [],
                connections: [],
                manualItems: [],
                accessoryProductIds: []
              }
            });
          case `/api/v1/projects/${projectId}/calculations`:
            return json({
              schemaVersion: "calculate-project-draft-response/v2",
              correlationId: "smoke-test",
              calculation: {
                projectId,
                draftVersion: 1,
                stale: false,
                run: {
                  id: runId,
                  status: "succeeded",
                  engineVersion: goldenResult.engineVersion,
                  inputFingerprint: goldenResult.inputFingerprint,
                  catalogSnapshot: goldenResult.catalogSnapshot,
                  ruleSnapshot: goldenResult.ruleSnapshot,
                  startedAt: timestamp,
                  completedAt: timestamp
                },
                result: { ...goldenResult, calculationRunId: runId }
              }
            });
          case "/api/v1/auth/logout":
            return new Response(null, { status: 204 });
          default:
            throw new Error("Unexpected request");
        }
      });
      const report = await runStage11Smoke({
        baseUrl: "http://127.0.0.1:18080",
        accounts,
        expectedGitCommit: build.gitCommit,
        fetch: request
      });
      expect(report.passed).toBe(true);
      expect(paths.filter((path) => path === "/api/v1/auth/logout")).toHaveLength(2);
      expect(paths.some((path) => path.includes("revisions"))).toBe(false);
      expect(JSON.stringify(report)).not.toContain(password);
    }
  );

  it("does not emit response bodies or follow a credential redirect", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(`sensitive ${password}`, {
        status: 302,
        headers: { location: "https://outside.invalid" }
      })
    );
    await expect(
      runStage11Smoke({ baseUrl: "http://127.0.0.1:18080", accounts, fetch: request })
    ).rejects.toThrow("Persistent TEST smoke failed at gateway; response and credentials withheld");
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0]?.[1]?.redirect).toBe("manual");
  });

  it("rejects embedded URL credentials and unrecognized TEST account names", async () => {
    const request = vi.fn<typeof fetch>();
    await expect(
      runStage11Smoke({ baseUrl: "http://name:password@127.0.0.1:18080", accounts, fetch: request })
    ).rejects.toThrow("Invalid TEST smoke origin");
    expect(request).not.toHaveBeenCalled();
    expect(() =>
      parseStage11Accounts({ ...accounts, viewer: { username: "test.viewer", password: "short" } })
    ).toThrow("Invalid persistent TEST account configuration");
  });
});
