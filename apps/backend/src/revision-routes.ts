import {
  ApproveProjectRevisionRequestV2Schema,
  CheckProjectRevisionRequestV2Schema,
  DatabaseIdV2Schema,
  IdempotencyKeySchema,
  SaveProjectRevisionRequestV2Schema,
  type ApproveProjectRevisionRequestV2,
  type CheckProjectRevisionRequestV2,
  type SaveProjectRevisionRequestV2
} from "@niedax/domain";
import type { FastifyInstance, FastifyRequest } from "fastify";

import type { AuthService } from "./auth-service.js";
import type { SessionIdentity } from "./domain.js";
import { ProjectApplicationError } from "./project-errors.js";
import type { RevisionActor } from "./revision-repository.js";
import type { RevisionOperations } from "./revision-service.js";

const SESSION_COOKIE = "niedax_session";

interface RevisionRouteOptions {
  readonly auth: AuthService;
  readonly service: RevisionOperations;
  readonly correlationId: (request: FastifyRequest) => string;
}

interface SafeParser<T> {
  safeParse(value: unknown):
    | { readonly success: true; readonly data: T }
    | {
        readonly success: false;
        readonly error: {
          readonly issues: readonly {
            readonly path: readonly PropertyKey[];
            readonly code: string;
            readonly message: string;
          }[];
        };
      };
}

async function requireIdentity(
  request: FastifyRequest,
  auth: AuthService
): Promise<SessionIdentity> {
  const identity = await auth.resolveSession(request.cookies[SESSION_COOKIE]);
  if (!identity) {
    throw new ProjectApplicationError(401, "AUTHENTICATION_REQUIRED", "Authentication required");
  }
  return identity;
}

function actor(identity: SessionIdentity): RevisionActor {
  return {
    id: identity.user.id,
    username: identity.user.username,
    displayName: identity.user.displayName,
    role: identity.user.role
  };
}

function parsed<T>(schema: SafeParser<T>, value: unknown, expectedVersion: string): T {
  const version =
    value && typeof value === "object" && "schemaVersion" in value
      ? (value as { readonly schemaVersion?: unknown }).schemaVersion
      : undefined;
  if (typeof version === "string" && version !== expectedVersion) {
    throw new ProjectApplicationError(
      422,
      "UNSUPPORTED_SCHEMA_VERSION",
      "The request schema version is not supported"
    );
  }
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  throw new ProjectApplicationError(422, "VALIDATION_FAILED", "Request validation failed", {
    kind: "validation",
    issues: result.error.issues.map((issue) => ({
      path: issue.path.filter(
        (part): part is string | number => typeof part === "string" || typeof part === "number"
      ),
      code: issue.code.toLocaleUpperCase("en-US"),
      message: issue.message
    }))
  });
}

function resourceId(value: string, parameter: "projectId" | "revisionId"): string {
  const result = DatabaseIdV2Schema.safeParse(value);
  if (result.success) return result.data;
  throw new ProjectApplicationError(422, "VALIDATION_FAILED", `${parameter} is invalid`, {
    kind: "validation",
    issues: [{ path: [parameter], code: "INVALID_UUID", message: "Expected a UUID" }]
  });
}

function pagination(query: unknown): { readonly limit: number; readonly cursor: string | null } {
  const values =
    query && typeof query === "object" && !Array.isArray(query)
      ? (query as Readonly<Record<string, unknown>>)
      : {};
  const unknown = Object.keys(values).filter((key) => key !== "limit" && key !== "cursor");
  const limitValue = values.limit ?? "100";
  const limit =
    typeof limitValue === "string" && /^[1-9][0-9]*$/u.test(limitValue)
      ? Number(limitValue)
      : Number.NaN;
  const cursorValue = values.cursor;
  const cursor = cursorValue === undefined ? null : DatabaseIdV2Schema.safeParse(cursorValue);
  if (unknown.length === 0 && Number.isInteger(limit) && limit <= 100) {
    if (cursor === null) return { limit, cursor: null };
    if (cursor.success) return { limit, cursor: cursor.data };
  }
  throw new ProjectApplicationError(422, "VALIDATION_FAILED", "Pagination is invalid", {
    kind: "validation",
    issues: [
      {
        path: unknown.length > 0 ? ["query", unknown[0] ?? "unknown"] : ["query"],
        code: "INVALID_PAGINATION",
        message: "Use only limit=1..100 and an optional UUID cursor"
      }
    ]
  });
}

function idempotencyKey(request: FastifyRequest): string {
  const result = IdempotencyKeySchema.safeParse(request.headers["idempotency-key"]);
  if (result.success) return result.data;
  throw new ProjectApplicationError(
    422,
    "VALIDATION_FAILED",
    "A valid Idempotency-Key header is required",
    {
      kind: "validation",
      issues: [
        {
          path: ["headers", "idempotency-key"],
          code: "IDEMPOTENCY_KEY_REQUIRED",
          message: "Use an opaque 8 to 128 character idempotency key"
        }
      ]
    }
  );
}

function markReplay(
  reply: { header(name: string, value: string): unknown },
  replayed: boolean
): void {
  if (replayed) reply.header("idempotency-replayed", "true");
}

export function registerRevisionRoutes(app: FastifyInstance, options: RevisionRouteOptions): void {
  app.get<{ Params: { projectId: string }; Querystring: Record<string, unknown> }>(
    "/api/v1/projects/:projectId/revisions",
    async (request) => {
      const identity = await requireIdentity(request, options.auth);
      const page = pagination(request.query);
      return options.service.listRevisions(
        actor(identity),
        resourceId(request.params.projectId, "projectId"),
        options.correlationId(request),
        page.limit,
        page.cursor
      );
    }
  );

  app.post<{ Params: { projectId: string }; Body: unknown }>(
    "/api/v1/projects/:projectId/revisions",
    async (request, reply) => {
      const identity = await requireIdentity(request, options.auth);
      const body = parsed<SaveProjectRevisionRequestV2>(
        SaveProjectRevisionRequestV2Schema,
        request.body,
        "save-project-revision-request/v2"
      );
      const result = await options.service.saveRevision(
        actor(identity),
        resourceId(request.params.projectId, "projectId"),
        body,
        idempotencyKey(request),
        options.correlationId(request)
      );
      markReplay(reply, result.replayed);
      return reply.status(result.statusCode).send(result.body);
    }
  );

  app.get<{ Params: { revisionId: string } }>("/api/v1/revisions/:revisionId", async (request) => {
    const identity = await requireIdentity(request, options.auth);
    return options.service.getRevision(
      actor(identity),
      resourceId(request.params.revisionId, "revisionId"),
      options.correlationId(request)
    );
  });

  app.post<{ Params: { revisionId: string }; Body: unknown }>(
    "/api/v1/revisions/:revisionId/check",
    async (request, reply) => {
      const identity = await requireIdentity(request, options.auth);
      const body = parsed<CheckProjectRevisionRequestV2>(
        CheckProjectRevisionRequestV2Schema,
        request.body,
        "check-project-revision-request/v2"
      );
      const result = await options.service.checkRevision(
        actor(identity),
        resourceId(request.params.revisionId, "revisionId"),
        body,
        idempotencyKey(request),
        options.correlationId(request)
      );
      markReplay(reply, result.replayed);
      return reply.status(result.statusCode).send(result.body);
    }
  );

  app.post<{ Params: { revisionId: string }; Body: unknown }>(
    "/api/v1/revisions/:revisionId/approve",
    async (request, reply) => {
      const identity = await requireIdentity(request, options.auth);
      const body = parsed<ApproveProjectRevisionRequestV2>(
        ApproveProjectRevisionRequestV2Schema,
        request.body,
        "approve-project-revision-request/v2"
      );
      const result = await options.service.approveRevision(
        actor(identity),
        resourceId(request.params.revisionId, "revisionId"),
        body,
        idempotencyKey(request),
        options.correlationId(request)
      );
      markReplay(reply, result.replayed);
      return reply.status(result.statusCode).send(result.body);
    }
  );

  app.get<{ Params: { projectId: string }; Querystring: Record<string, unknown> }>(
    "/api/v1/projects/:projectId/revision-audit",
    async (request) => {
      const identity = await requireIdentity(request, options.auth);
      const page = pagination(request.query);
      return options.service.listAuditEvents(
        actor(identity),
        resourceId(request.params.projectId, "projectId"),
        options.correlationId(request),
        page.limit,
        page.cursor
      );
    }
  );
}
