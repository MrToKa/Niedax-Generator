import { describe, expect, it, vi } from "vitest";

import { ErrorEnvelopeV1Schema } from "@niedax/domain";
import { buildApp } from "../src/app.js";
import type { AppRole, UserStore } from "../src/domain.js";
import {
  RevisionApplicationService,
  type RevisionOperations,
  type RevisionRepository
} from "../src/revision-service.js";

const projectId = "10000000-0000-4000-8000-000000000001";
const revisionId = "10000000-0000-4000-8000-000000000002";
const runId = "10000000-0000-4000-8000-000000000003";
const actorId = "10000000-0000-4000-8000-000000000004";
const fingerprint = `sha256:${"1".repeat(64)}`;
const correlationId = "stage8-http-correlation";

function store(role: AppRole = "reviewer"): UserStore {
  const user = {
    id: actorId,
    username: `stage8.${role}`,
    displayName: `Stage 8 ${role}`,
    role,
    enabled: true,
    passwordHash: "unused",
    createdAt: new Date("2026-09-02T08:00:00.000Z"),
    updatedAt: new Date("2026-09-02T08:00:00.000Z")
  };
  return {
    ping: async () => undefined,
    countAdministrators: async () => 1,
    findUserByUsername: async () => null,
    findSession: async (sessionHash) => ({
      sessionHash,
      user,
      expiresAt: new Date("2099-01-01T00:00:00.000Z")
    }),
    createSession: async () => undefined,
    revokeSession: async () => undefined,
    listUsers: async () => ({ users: [user], nextCursor: null }),
    recordUserAdministrationRejection: async () => undefined,
    createUser: async () => user,
    setUserEnabled: async () => user,
    setUserRole: async () => user
  };
}

const mutationBody = {
  schemaVersion: "project-revision-response/v2",
  correlationId,
  revision: {}
} as never;

function operations(): RevisionOperations {
  return {
    listRevisions: vi.fn(async (_actor, requestedProjectId, requestCorrelationId) => ({
      schemaVersion: "project-revision-list-response/v2",
      correlationId: requestCorrelationId,
      projectId: requestedProjectId,
      revisions: [],
      nextCursor: null
    })),
    getRevision: vi.fn(async () => mutationBody),
    listAuditEvents: vi.fn(async (_actor, requestedProjectId, requestCorrelationId) => ({
      schemaVersion: "project-revision-audit-list-response/v2",
      correlationId: requestCorrelationId,
      projectId: requestedProjectId,
      events: [],
      nextCursor: null
    })),
    saveRevision: vi.fn(async () => ({
      statusCode: 201,
      body: mutationBody,
      replayed: false
    })),
    checkRevision: vi.fn(async () => ({
      statusCode: 200,
      body: mutationBody,
      replayed: true
    })),
    approveRevision: vi.fn(async () => ({
      statusCode: 200,
      body: mutationBody,
      replayed: false
    }))
  };
}

const headers = {
  host: "localhost:8080",
  origin: "http://localhost:8080",
  "x-niedax-csrf": "1",
  "x-correlation-id": correlationId,
  cookie: "niedax_session=test-session"
};

const saveRequest = {
  schemaVersion: "save-project-revision-request/v2",
  expectedDraftVersion: 3,
  expectedLatestRevisionNumber: 0,
  calculationRunId: runId,
  inputFingerprint: fingerprint,
  name: "Issued for review",
  comment: null
};
const checkRequest = {
  schemaVersion: "check-project-revision-request/v2",
  expectedStatus: "calculated",
  expectedLatestRevisionNumber: 1,
  inputFingerprint: fingerprint,
  comment: null
};
const approveRequest = {
  schemaVersion: "approve-project-revision-request/v2",
  expectedStatus: "checked",
  expectedLatestRevisionNumber: 1,
  inputFingerprint: fingerprint,
  comment: "Approved"
};

describe("Stage 8 revision HTTP routes", () => {
  it("requires authentication for revision history", async () => {
    const app = await buildApp({
      store: store(),
      sessionPepper: "test",
      revisionService: operations()
    });
    const result = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/revisions`
    });
    expect(result.statusCode).toBe(401);
    expect(ErrorEnvelopeV1Schema.parse(result.json()).error.code).toBe("AUTHENTICATION_REQUIRED");
    await app.close();
  });

  it("requires same-origin CSRF evidence and a valid idempotency key", async () => {
    const service = operations();
    const app = await buildApp({ store: store(), sessionPepper: "test", revisionService: service });
    const missingCsrf = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/revisions`,
      headers: { cookie: headers.cookie },
      payload: saveRequest
    });
    expect(missingCsrf.statusCode).toBe(403);
    const missingKey = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/revisions`,
      headers,
      payload: saveRequest
    });
    expect(missingKey.statusCode).toBe(422);
    expect(service.saveRevision).not.toHaveBeenCalled();
    await app.close();
  });

  it("rejects unsupported versions and unknown request keys before service mutation", async () => {
    const service = operations();
    const app = await buildApp({ store: store(), sessionPepper: "test", revisionService: service });
    const unsupported = await app.inject({
      method: "POST",
      url: `/api/v1/revisions/${revisionId}/check`,
      headers: { ...headers, "idempotency-key": "check-key-0001" },
      payload: { ...checkRequest, schemaVersion: "check-project-revision-request/v3" }
    });
    expect(unsupported.statusCode).toBe(422);
    expect(ErrorEnvelopeV1Schema.parse(unsupported.json()).error.code).toBe(
      "UNSUPPORTED_SCHEMA_VERSION"
    );
    const unknown = await app.inject({
      method: "POST",
      url: `/api/v1/revisions/${revisionId}/approve`,
      headers: { ...headers, "idempotency-key": "approve-key-0001" },
      payload: { ...approveRequest, actorRole: "administrator" }
    });
    expect(unknown.statusCode).toBe(422);
    expect(service.checkRevision).not.toHaveBeenCalled();
    expect(service.approveRevision).not.toHaveBeenCalled();
    await app.close();
  });

  it("wires bounded list/detail/audit and save/check/approve with correlation and replay", async () => {
    const service = operations();
    const app = await buildApp({ store: store(), sessionPepper: "test", revisionService: service });
    const list = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/revisions?limit=100`,
      headers
    });
    const detail = await app.inject({
      method: "GET",
      url: `/api/v1/revisions/${revisionId}`,
      headers
    });
    const audit = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/revision-audit?limit=100`,
      headers
    });
    const save = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/revisions`,
      headers: { ...headers, "idempotency-key": "save-key-0001" },
      payload: saveRequest
    });
    const check = await app.inject({
      method: "POST",
      url: `/api/v1/revisions/${revisionId}/check`,
      headers: { ...headers, "idempotency-key": "check-key-0001" },
      payload: checkRequest
    });
    const approve = await app.inject({
      method: "POST",
      url: `/api/v1/revisions/${revisionId}/approve`,
      headers: { ...headers, "idempotency-key": "approve-key-0001" },
      payload: approveRequest
    });
    expect([
      list.statusCode,
      detail.statusCode,
      audit.statusCode,
      save.statusCode,
      check.statusCode,
      approve.statusCode
    ]).toEqual([200, 200, 200, 201, 200, 200]);
    expect(check.headers["idempotency-replayed"]).toBe("true");
    expect(service.saveRevision).toHaveBeenCalledWith(
      expect.objectContaining({ role: "reviewer" }),
      projectId,
      saveRequest,
      "save-key-0001",
      correlationId
    );
    await app.close();
  });

  it.each(["designer", "viewer"] as const)(
    "returns authoritative 403 and zero repository calls for direct %s approval",
    async (role) => {
      const repository: RevisionRepository = {
        listRevisions: vi.fn(async () => []),
        getRevision: vi.fn(async () => {
          throw new Error("not used");
        }),
        listAuditEvents: vi.fn(async () => []),
        recordRejectedAttempt: vi.fn(async () => true),
        recordRejectedSaveAttempt: vi.fn(async () => true),
        saveRevision: vi.fn(async () => {
          throw new Error("not used");
        }),
        checkRevision: vi.fn(async () => {
          throw new Error("must not be called");
        }),
        approveRevision: vi.fn(async () => {
          throw new Error("must not be called");
        })
      };
      const app = await buildApp({
        store: store(role),
        sessionPepper: "test",
        revisionService: new RevisionApplicationService(repository)
      });
      const result = await app.inject({
        method: "POST",
        url: `/api/v1/revisions/${revisionId}/approve`,
        headers: { ...headers, "idempotency-key": "approve-key-0001" },
        payload: approveRequest
      });
      expect(result.statusCode).toBe(403);
      expect(ErrorEnvelopeV1Schema.parse(result.json()).error.code).toBe("FORBIDDEN");
      expect(repository.approveRevision).not.toHaveBeenCalled();
      expect(repository.checkRevision).not.toHaveBeenCalled();
      expect(repository.recordRejectedAttempt).toHaveBeenCalledOnce();
      await app.close();
    }
  );

  it("rejects unbounded or unknown history query parameters", async () => {
    const service = operations();
    const app = await buildApp({ store: store(), sessionPepper: "test", revisionService: service });
    for (const url of [
      `/api/v1/projects/${projectId}/revisions?limit=101`,
      `/api/v1/projects/${projectId}/revision-audit?includeSecurityEvents=true`
    ]) {
      const result = await app.inject({ method: "GET", url, headers });
      expect(result.statusCode).toBe(422);
      expect(ErrorEnvelopeV1Schema.parse(result.json()).error.code).toBe("VALIDATION_FAILED");
    }
    expect(service.listRevisions).not.toHaveBeenCalled();
    expect(service.listAuditEvents).not.toHaveBeenCalled();
    await app.close();
  });
});
