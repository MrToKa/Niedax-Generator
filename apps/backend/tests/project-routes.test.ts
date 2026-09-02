import { describe, expect, it, vi } from "vitest";

import {
  EditorCatalogResponseV2Schema,
  ErrorEnvelopeV1Schema,
  ProjectDraftResponseV2Schema,
  ProjectListResponseV3Schema,
  ProjectValidationResponseV2Schema,
  type CalculateProjectDraftResponseV2,
  type CurrentCalculationResponseV2
} from "@niedax/domain";

import { buildApp } from "../src/app.js";
import type { UserStore } from "../src/domain.js";
import { ProjectApplicationError } from "../src/project-errors.js";
import type { ProjectOperations } from "../src/project-service.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const ownerId = "22222222-2222-4222-8222-222222222222";
const correlationId = "stage7-http-correlation";
const hash = `sha256:${"1".repeat(64)}`;

const draft = {
  code: "P-0001",
  name: "Проект",
  description: null,
  defaultLocale: "bg" as const,
  defaultReservePercent: "0",
  cableLoad: null,
  routes: [],
  connections: [],
  accessoryProductIds: [],
  manualItems: []
};

const projectResponse = ProjectDraftResponseV2Schema.parse({
  schemaVersion: "project-draft-response/v2",
  correlationId,
  catalogSnapshot: { snapshotId: projectId, version: "2022-p0", contentHash: hash },
  ruleSnapshot: { snapshotId: ownerId, version: "2022-p0", contentHash: hash },
  project: {
    id: projectId,
    ownerId,
    ownerDisplayName: "Stage 7 Reviewer",
    status: "draft",
    draftVersion: 1,
    createdAt: "2026-09-01T08:00:00.000Z",
    updatedAt: "2026-09-01T08:00:00.000Z",
    ...draft
  }
});

const validationResponse = ProjectValidationResponseV2Schema.parse({
  schemaVersion: "project-validation-response/v2",
  correlationId,
  projectId,
  draftVersion: 1,
  blockingErrors: [],
  warnings: [],
  engineeringReview: [],
  canCalculate: true
});

const currentResponse: CurrentCalculationResponseV2 = {
  schemaVersion: "current-calculation-response/v2",
  correlationId,
  projectId,
  calculation: null
};

function store(): UserStore {
  const user = {
    id: ownerId,
    username: "stage7.reviewer",
    displayName: "Stage 7 Reviewer",
    role: "reviewer" as const,
    enabled: true,
    passwordHash: "unused",
    createdAt: new Date("2026-09-01T08:00:00.000Z"),
    updatedAt: new Date("2026-09-01T08:00:00.000Z")
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

function service(): ProjectOperations {
  return {
    listProjects: vi.fn(async (_actor, _page, requestCorrelationId) =>
      ProjectListResponseV3Schema.parse({
        schemaVersion: "project-list-response/v3",
        correlationId: requestCorrelationId,
        projects: [],
        nextCursor: null
      })
    ),
    createProject: vi.fn(async (_actor, _request, _key, requestCorrelationId) => ({
      statusCode: 201,
      body: { ...projectResponse, correlationId: requestCorrelationId },
      replayed: false
    })),
    getProject: vi.fn(async (_actor, _projectId, requestCorrelationId) => ({
      ...projectResponse,
      correlationId: requestCorrelationId
    })),
    getProjectAccess: vi.fn(async (_actor, requestedProjectId, requestCorrelationId) => ({
      schemaVersion: "project-access-response/v2",
      correlationId: requestCorrelationId,
      projectId: requestedProjectId,
      access: {
        canEditDraft: true,
        canValidate: true,
        canCalculate: true,
        canSaveRevision: true,
        canReadHistory: true
      }
    })),
    replaceProject: vi.fn(async (_actor, _projectId, _request, _key, requestCorrelationId) => ({
      statusCode: 200,
      body: { ...projectResponse, correlationId: requestCorrelationId },
      replayed: true
    })),
    validateProject: vi.fn(async (_actor, _projectId, _request, requestCorrelationId) => ({
      ...validationResponse,
      correlationId: requestCorrelationId
    })),
    calculateProject: vi.fn(async (_actor, _projectId, _request, _key, requestCorrelationId) => ({
      statusCode: 200,
      body: {
        schemaVersion: "calculate-project-draft-response/v2",
        correlationId: requestCorrelationId,
        calculation: {}
      } as unknown as CalculateProjectDraftResponseV2,
      replayed: true
    })),
    getCurrentCalculation: vi.fn(async (_actor, _projectId, requestCorrelationId) => ({
      ...currentResponse,
      correlationId: requestCorrelationId
    })),
    getEditorCatalog: vi.fn(async (_actor, requestCorrelationId) =>
      EditorCatalogResponseV2Schema.parse({
        schemaVersion: "editor-catalog-response/v2",
        correlationId: requestCorrelationId,
        catalogSnapshot: { snapshotId: projectId, version: "2022-p0", contentHash: hash },
        ruleSnapshot: { snapshotId: ownerId, version: "2022-p0", contentHash: hash },
        products: [],
        assemblyTemplates: [],
        compatibilityRelations: []
      })
    )
  };
}

const authenticated = {
  host: "localhost:8080",
  origin: "http://localhost:8080",
  "x-niedax-csrf": "1",
  "x-correlation-id": correlationId,
  cookie: "niedax_session=test-session"
};

describe("Stage 7 project HTTP routes", () => {
  it("requires authentication and emits a strict, bounded correlation envelope", async () => {
    const app = await buildApp({
      store: store(),
      sessionPepper: "test",
      projectService: service()
    });
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/projects",
      headers: { "x-correlation-id": "req-1" }
    });
    expect(response.statusCode).toBe(401);
    const body = ErrorEnvelopeV1Schema.parse(response.json());
    expect(body.schemaVersion).toBe("error-envelope/v1");
    expect(body.correlationId).toHaveLength(36);
    expect(body.error.code).toBe("AUTHENTICATION_REQUIRED");
    await app.close();
  });

  it("requires CSRF and Idempotency-Key for project mutations", async () => {
    const operations = service();
    const app = await buildApp({
      store: store(),
      sessionPepper: "test",
      projectService: operations
    });
    const noCsrf = await app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: { cookie: authenticated.cookie },
      payload: { schemaVersion: "create-project-draft-request/v2", draft }
    });
    expect(noCsrf.statusCode).toBe(403);
    expect(ErrorEnvelopeV1Schema.parse(noCsrf.json()).error.code).toBe("FORBIDDEN");

    const noKey = await app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: authenticated,
      payload: { schemaVersion: "create-project-draft-request/v2", draft }
    });
    expect(noKey.statusCode).toBe(422);
    expect(ErrorEnvelopeV1Schema.parse(noKey.json()).error.code).toBe("VALIDATION_FAILED");
    expect(operations.createProject).not.toHaveBeenCalled();
    await app.close();
  });

  it("rejects unsupported versions before invoking the application service", async () => {
    const operations = service();
    const app = await buildApp({
      store: store(),
      sessionPepper: "test",
      projectService: operations
    });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: { ...authenticated, "idempotency-key": "project-create-0001" },
      payload: { schemaVersion: "create-project-draft-request/v3", draft }
    });
    expect(response.statusCode).toBe(422);
    expect(ErrorEnvelopeV1Schema.parse(response.json()).error.code).toBe(
      "UNSUPPORTED_SCHEMA_VERSION"
    );
    expect(operations.createProject).not.toHaveBeenCalled();
    await app.close();
  });

  it("wires the list, create, get, replace, validate, calculate, current, and editor operations", async () => {
    const operations = service();
    const app = await buildApp({
      store: store(),
      sessionPepper: "test",
      projectService: operations
    });
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/api/v1/projects?limit=2&cursor=${projectId}`,
          headers: authenticated
        })
      ).statusCode
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/api/v1/projects/${projectId}/access`,
          headers: authenticated
        })
      ).statusCode
    ).toBe(200);
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: { ...authenticated, "idempotency-key": "project-create-0001" },
      payload: { schemaVersion: "create-project-draft-request/v2", draft }
    });
    expect(created.statusCode).toBe(201);
    expect(ProjectDraftResponseV2Schema.safeParse(created.json()).success).toBe(true);
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/api/v1/projects/${projectId}`,
          headers: authenticated
        })
      ).statusCode
    ).toBe(200);
    const replaced = await app.inject({
      method: "PUT",
      url: `/api/v1/projects/${projectId}/draft`,
      headers: { ...authenticated, "idempotency-key": "project-replace-0001" },
      payload: { schemaVersion: "replace-project-draft-request/v2", expectedDraftVersion: 1, draft }
    });
    expect(replaced.statusCode).toBe(200);
    expect(replaced.headers["idempotency-replayed"]).toBe("true");
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/v1/projects/${projectId}/validation`,
          headers: authenticated,
          payload: { schemaVersion: "validate-project-draft-request/v2", expectedDraftVersion: 1 }
        })
      ).statusCode
    ).toBe(200);
    const calculated = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/calculations`,
      headers: { ...authenticated, "idempotency-key": "project-calculate-0001" },
      payload: { schemaVersion: "calculate-project-draft-request/v2", expectedDraftVersion: 1 }
    });
    expect(calculated.statusCode).toBe(200);
    expect(calculated.headers["idempotency-replayed"]).toBe("true");
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/api/v1/projects/${projectId}/calculation`,
          headers: authenticated
        })
      ).statusCode
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/v1/catalog/editor-context",
          headers: authenticated
        })
      ).statusCode
    ).toBe(200);
    expect(operations.listProjects).toHaveBeenCalledWith(
      expect.objectContaining({ role: "reviewer" }),
      { limit: 2, cursor: projectId },
      expect.any(String)
    );
    expect(operations.createProject).toHaveBeenCalledOnce();
    expect(operations.getProject).toHaveBeenCalledOnce();
    expect(operations.getProjectAccess).toHaveBeenCalledOnce();
    expect(operations.replaceProject).toHaveBeenCalledOnce();
    expect(operations.validateProject).toHaveBeenCalledOnce();
    expect(operations.calculateProject).toHaveBeenCalledOnce();
    expect(operations.getCurrentCalculation).toHaveBeenCalledOnce();
    expect(operations.getEditorCatalog).toHaveBeenCalledOnce();
    await app.close();
  });

  it("maps stale and ownership failures without leaking service internals", async () => {
    const operations = service();
    operations.getProject = vi.fn(async () => {
      throw new ProjectApplicationError(403, "FORBIDDEN", "Project access is forbidden");
    });
    operations.replaceProject = vi.fn(async () => {
      throw new ProjectApplicationError(409, "CONFLICT_STALE_VERSION", "Draft is stale", {
        kind: "conflict",
        expectedVersion: "1",
        actualVersion: "2"
      });
    });
    const app = await buildApp({
      store: store(),
      sessionPepper: "test",
      projectService: operations
    });
    const forbidden = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}`,
      headers: authenticated
    });
    expect(ErrorEnvelopeV1Schema.parse(forbidden.json()).error.code).toBe("FORBIDDEN");
    const stale = await app.inject({
      method: "PUT",
      url: `/api/v1/projects/${projectId}/draft`,
      headers: { ...authenticated, "idempotency-key": "project-replace-stale" },
      payload: { schemaVersion: "replace-project-draft-request/v2", expectedDraftVersion: 1, draft }
    });
    const staleBody = ErrorEnvelopeV1Schema.parse(stale.json());
    expect(stale.statusCode).toBe(409);
    expect(staleBody.error).toMatchObject({
      code: "CONFLICT_STALE_VERSION",
      details: { kind: "conflict", expectedVersion: "1", actualVersion: "2" }
    });
    await app.close();
  });
});
