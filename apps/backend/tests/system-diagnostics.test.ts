import { describe, expect, it, vi } from "vitest";
import {
  APP_ROLES,
  OperationalMetricsSchema,
  SystemInfoSchema,
  featureEnabled,
  resolveFeatureFlags,
  type AppRole
} from "@niedax/domain";
import { buildApp } from "../src/app.js";
import type { UserStore } from "../src/domain.js";
import { loadRuntimeIdentity, OperationalMetrics } from "../src/system-diagnostics.js";
import { safeErrorDetails } from "../src/safe-logging.js";

const identity = loadRuntimeIdentity({
  NIEDAX_ENV: "test",
  NIEDAX_GIT_COMMIT: "a".repeat(40),
  NIEDAX_BUILD_TIMESTAMP: "2026-09-24T12:00:00.000Z"
});
const active = {
  catalogues: [
    { id: "11000000-0000-4000-8000-000000000011", scope: "stage11-synthetic", version: "S11-SYN-1" }
  ],
  ruleSets: [
    {
      id: "22000000-0000-4000-8000-000000000011",
      scope: "stage11-synthetic",
      version: "S11-RULES-1",
      catalogVersionId: "11000000-0000-4000-8000-000000000011"
    }
  ]
};
const headers = {
  cookie: "niedax_session=synthetic-session",
  "x-correlation-id": "stage11-correlation-01"
};
function store(role: AppRole = "administrator"): UserStore {
  return {
    ping: async () => undefined,
    countAdministrators: async () => 1,
    findUserByUsername: async () => null,
    findSession: async () => ({
      sessionHash: "synthetic-hash",
      expiresAt: new Date("2099-01-01"),
      user: {
        id: "33000000-0000-4000-8000-000000000011",
        username: "synthetic-user",
        displayName: "Synthetic user",
        role,
        enabled: true,
        passwordHash: "not-a-password",
        createdAt: new Date(),
        updatedAt: new Date()
      }
    }),
    createSession: async () => undefined,
    revokeSession: async () => undefined,
    listUsers: async () => ({ users: [], nextCursor: null }),
    recordUserAdministrationRejection: async () => undefined,
    createUser: async () => {
      throw new Error("not used");
    },
    setUserEnabled: async () => null,
    setUserRole: async () => null
  };
}

describe("Stage 11 operational diagnostics", () => {
  it("retains version compatibility and distinguishes active DB versions from manifests", async () => {
    const app = await buildApp({
      store: store("viewer"),
      sessionPepper: "synthetic-pepper",
      identity,
      diagnosticsStore: { activeVersions: async () => active }
    });
    try {
      const version = (await app.inject("/api/v1/version")).json();
      expect(version).toMatchObject({
        application: "0.1.0",
        catalogue: "0.1.0",
        rules: "0.1.0",
        ...identity
      });
      expect((await app.inject("/api/v1/system/info")).statusCode).toBe(401);
      const response = await app.inject({ url: "/api/v1/system/info", headers });
      expect(response.statusCode).toBe(200);
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(SystemInfoSchema.parse(response.json())).toMatchObject({
        active,
        migrationState: "not-exposed",
        repository: { catalogue: "0.1.0", rules: "0.1.0" }
      });
    } finally {
      await app.close();
    }
  });

  it("preserves cheap liveness and reports failed database readiness safely", async () => {
    const ping = vi.fn(async () => {
      throw new Error("postgres://hidden-credential");
    });
    const app = await buildApp({
      store: { ...store(), ping },
      sessionPepper: "synthetic-pepper",
      identity
    });
    try {
      expect((await app.inject("/api/v1/health/live")).statusCode).toBe(200);
      expect(ping).not.toHaveBeenCalled();
      expect((await app.inject("/api/v1/health/ready")).statusCode).toBe(503);
      const response = await app.inject({ url: "/api/v1/system/metrics", headers });
      const metrics = OperationalMetricsSchema.parse(response.json());
      expect(metrics).toMatchObject({
        databaseReadiness: "unavailable",
        requestCount: 2,
        serverErrorCount: 1,
        criticalApplicationErrorCount: 0,
        build: identity.build
      });
      expect(metrics.uptimeSeconds).toBeGreaterThanOrEqual(0);
      expect(response.body).not.toContain("hidden-credential");
    } finally {
      await app.close();
    }
  });

  it.each(APP_ROLES)("metrics flag cannot grant metrics permission to %s", async (role) => {
    const app = await buildApp({ store: store(role), sessionPepper: "synthetic-pepper", identity });
    try {
      expect((await app.inject("/api/v1/system/metrics")).statusCode).toBe(401);
      expect((await app.inject({ url: "/api/v1/system/metrics", headers })).statusCode).toBe(
        role === "administrator" ? 200 : 403
      );
    } finally {
      await app.close();
    }
  });

  it("enforces disabled metrics on the server even for administrators", async () => {
    const ping = vi.fn(async () => undefined);
    const app = await buildApp({
      store: { ...store(), ping },
      sessionPepper: "synthetic-pepper",
      identity: { ...identity, featureFlags: { operationalMetrics: false } }
    });
    try {
      expect((await app.inject({ url: "/api/v1/system/metrics", headers })).statusCode).toBe(404);
      expect(ping).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it("correlates unexpected errors without logging credentials, bodies, URL queries or error messages", async () => {
    const lines: string[] = [];
    const metrics = new OperationalMetrics();
    const app = await buildApp({
      store: store(),
      sessionPepper: "synthetic-pepper",
      identity,
      metrics,
      logger: true,
      loggerStream: {
        write: (line) => {
          lines.push(line);
        }
      },
      diagnosticsStore: {
        activeVersions: async () => {
          // Construct the synthetic signature at runtime, as in the scanner's own fixtures.
          const syntheticConnection = [
            "postgresql",
            "://",
            "hidden-user",
            ":",
            "hidden-password",
            "@example.invalid/synthetic"
          ].join("");
          throw new Error(`${syntheticConnection} private-upload`);
        }
      }
    });
    try {
      const response = await app.inject({
        url: "/api/v1/system/info?password=hidden-query",
        headers: { ...headers, authorization: "Bearer hidden-auth" }
      });
      expect(response.statusCode).toBe(500);
      expect(response.json()).toMatchObject({
        correlationId: headers["x-correlation-id"],
        error: { code: "INTERNAL_ERROR", message: "The request could not be completed" }
      });
      expect(response.headers["x-correlation-id"]).toBe(headers["x-correlation-id"]);
      await app.inject({ url: "/api/v1/missing?password=hidden-query", headers });
      app.log.info(
        {
          password: "hidden-password",
          body: { value: "private-upload" },
          headers: { authorization: "hidden-auth" }
        },
        "redaction check"
      );
      const logged = lines.join("");
      for (const secret of [
        "hidden-user",
        "hidden-password",
        "hidden-auth",
        "synthetic-session",
        "hidden-query",
        "private-upload"
      ])
        expect(logged).not.toContain(secret);
      const failure = lines
        .map((line) => JSON.parse(line) as Record<string, unknown>)
        .find((line) => line.msg === "request failed");
      expect(failure).toMatchObject({
        NIEDAX_ENV: "test",
        buildVersion: "0.1.0",
        gitCommit: "a".repeat(40),
        correlationId: headers["x-correlation-id"],
        route: "/api/v1/system/info",
        method: "GET",
        role: "administrator",
        errorCode: "INTERNAL_ERROR"
      });
      expect(metrics.snapshot(identity.build)).toMatchObject({
        serverErrorCount: 1,
        criticalApplicationErrorCount: 1
      });
    } finally {
      await app.close();
    }
  });

  it("keeps bounded source locations without exception message or cause data", () => {
    const error = new Error("private exception");
    error.stack =
      "Error: private exception\n    at handler (/workspace/app.ts:42:9)\n    at secret SQL or cookie value";
    expect(safeErrorDetails(error)).toEqual({
      type: "Error",
      message: "Details suppressed",
      stack: "app.ts:42:9"
    });
  });

  it("counts background export recovery failures without high-cardinality dimensions", () => {
    const metrics = new OperationalMetrics();
    metrics.exportWorkerFailure();
    expect(metrics.snapshot(identity.build)).toMatchObject({
      exportWorkerFailureCount: 1,
      criticalApplicationErrorCount: 1
    });
  });
});

describe("central runtime identity and feature configuration", () => {
  it("has typed environment defaults, strict overrides and safe unknown flag lookups", () => {
    expect(resolveFeatureFlags("test")).toEqual({ operationalMetrics: true });
    expect(resolveFeatureFlags("development")).toEqual({ operationalMetrics: true });
    expect(resolveFeatureFlags("production")).toEqual({ operationalMetrics: false });
    expect(resolveFeatureFlags("test", { operationalMetrics: false })).toEqual({
      operationalMetrics: false
    });
    expect(() => resolveFeatureFlags("test", { unknown: true })).toThrow();
    expect(() => resolveFeatureFlags("test", { operationalMetrics: "true" })).toThrow();
    expect(featureEnabled(identity.featureFlags, "unknown")).toBe(false);
    expect(featureEnabled(identity.featureFlags, "toString")).toBe(false);
  });
  it.each([
    { NIEDAX_ENV: "wrong-environment" },
    { NIEDAX_GIT_COMMIT: "private-value" },
    { NIEDAX_BUILD_TIMESTAMP: "private-value" },
    { NIEDAX_FEATURE_FLAGS: "private-value" },
    { NIEDAX_FEATURE_FLAGS: '{"unknown":true}' }
  ])("fails closed on invalid configuration without echoing it", (environment) => {
    expect(() => loadRuntimeIdentity(environment)).toThrow(
      "Invalid build metadata or NIEDAX_FEATURE_FLAGS configuration"
    );
  });
  it("supports missing build metadata honestly for existing local runtimes", () => {
    expect(loadRuntimeIdentity({ NIEDAX_FEATURE_FLAGS: "" })).toMatchObject({
      build: { gitCommit: null, buildTimestamp: null, environment: "development" }
    });
  });
});
