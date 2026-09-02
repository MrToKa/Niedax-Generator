import {
  CalculateProjectDraftRequestV2Schema,
  CreateProjectDraftRequestV2Schema,
  DatabaseIdV2Schema,
  IdempotencyKeySchema,
  ReplaceProjectDraftRequestV2Schema,
  ValidateProjectDraftRequestV2Schema,
  type CalculateProjectDraftRequestV2,
  type CreateProjectDraftRequestV2,
  type ReplaceProjectDraftRequestV2,
  type ValidateProjectDraftRequestV2
} from "@niedax/domain";
import type { FastifyInstance, FastifyRequest } from "fastify";

import type { AuthService } from "./auth-service.js";
import type { SessionIdentity } from "./domain.js";
import { ProjectApplicationError } from "./project-errors.js";
import type { ProjectActor } from "./project-repository.js";
import type { ProjectOperations } from "./project-service.js";

const SESSION_COOKIE = "niedax_session";

interface ProjectRouteOptions {
  readonly auth: AuthService;
  readonly service: ProjectOperations;
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

function actor(identity: SessionIdentity): ProjectActor {
  return {
    id: identity.user.id,
    role: identity.user.role,
    displayName: identity.user.displayName
  };
}

function parsed<T>(schema: SafeParser<T>, value: unknown, expectedVersion?: string): T {
  if (expectedVersion) {
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
  }
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  throw new ProjectApplicationError(422, "VALIDATION_FAILED", "Request validation failed", {
    kind: "validation",
    issues: result.error.issues.map((item) => ({
      path: item.path.filter(
        (part): part is string | number => typeof part === "string" || typeof part === "number"
      ),
      code: item.code.toLocaleUpperCase("en-US"),
      message: item.message
    }))
  });
}

function projectId(request: FastifyRequest<{ Params: { projectId: string } }>): string {
  const result = DatabaseIdV2Schema.safeParse(request.params.projectId);
  if (result.success) return result.data;
  throw new ProjectApplicationError(422, "VALIDATION_FAILED", "Project ID is invalid", {
    kind: "validation",
    issues: [{ path: ["projectId"], code: "INVALID_UUID", message: "Expected a project UUID" }]
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
  replayed?: boolean
): void {
  if (replayed) reply.header("idempotency-replayed", "true");
}

export function registerProjectRoutes(app: FastifyInstance, options: ProjectRouteOptions): void {
  app.get<{ Querystring: { limit?: number; cursor?: string } }>(
    "/api/v1/projects",
    {
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
            cursor: { type: "string", format: "uuid" }
          }
        }
      }
    },
    async (request) => {
      const identity = await requireIdentity(request, options.auth);
      return options.service.listProjects(
        actor(identity),
        { limit: request.query.limit ?? 50, cursor: request.query.cursor ?? null },
        options.correlationId(request)
      );
    }
  );

  app.post<{ Body: unknown }>("/api/v1/projects", async (request, reply) => {
    const identity = await requireIdentity(request, options.auth);
    const body = parsed<CreateProjectDraftRequestV2>(
      CreateProjectDraftRequestV2Schema,
      request.body,
      "create-project-draft-request/v2"
    );
    const result = await options.service.createProject(
      actor(identity),
      body,
      idempotencyKey(request),
      options.correlationId(request)
    );
    markReplay(reply, result.replayed);
    return reply.status(result.statusCode).send(result.body);
  });

  app.get<{ Params: { projectId: string } }>("/api/v1/projects/:projectId", async (request) => {
    const identity = await requireIdentity(request, options.auth);
    return options.service.getProject(
      actor(identity),
      projectId(request),
      options.correlationId(request)
    );
  });

  app.get<{ Params: { projectId: string } }>(
    "/api/v1/projects/:projectId/access",
    async (request) => {
      const identity = await requireIdentity(request, options.auth);
      return options.service.getProjectAccess(
        actor(identity),
        projectId(request),
        options.correlationId(request)
      );
    }
  );

  app.put<{ Params: { projectId: string }; Body: unknown }>(
    "/api/v1/projects/:projectId/draft",
    async (request, reply) => {
      const identity = await requireIdentity(request, options.auth);
      const body = parsed<ReplaceProjectDraftRequestV2>(
        ReplaceProjectDraftRequestV2Schema,
        request.body,
        "replace-project-draft-request/v2"
      );
      const result = await options.service.replaceProject(
        actor(identity),
        projectId(request),
        body,
        idempotencyKey(request),
        options.correlationId(request)
      );
      markReplay(reply, result.replayed);
      return reply.status(result.statusCode).send(result.body);
    }
  );

  app.post<{ Params: { projectId: string }; Body: unknown }>(
    "/api/v1/projects/:projectId/validation",
    async (request) => {
      const identity = await requireIdentity(request, options.auth);
      const body = parsed<ValidateProjectDraftRequestV2>(
        ValidateProjectDraftRequestV2Schema,
        request.body,
        "validate-project-draft-request/v2"
      );
      return options.service.validateProject(
        actor(identity),
        projectId(request),
        body,
        options.correlationId(request)
      );
    }
  );

  app.post<{ Params: { projectId: string }; Body: unknown }>(
    "/api/v1/projects/:projectId/calculations",
    async (request, reply) => {
      const identity = await requireIdentity(request, options.auth);
      const body = parsed<CalculateProjectDraftRequestV2>(
        CalculateProjectDraftRequestV2Schema,
        request.body,
        "calculate-project-draft-request/v2"
      );
      const result = await options.service.calculateProject(
        actor(identity),
        projectId(request),
        body,
        idempotencyKey(request),
        options.correlationId(request)
      );
      markReplay(reply, result.replayed);
      return reply.status(result.statusCode).send(result.body);
    }
  );

  app.get<{ Params: { projectId: string } }>(
    "/api/v1/projects/:projectId/calculation",
    async (request) => {
      const identity = await requireIdentity(request, options.auth);
      return options.service.getCurrentCalculation(
        actor(identity),
        projectId(request),
        options.correlationId(request)
      );
    }
  );

  app.get("/api/v1/catalog/editor-context", async (request) => {
    const identity = await requireIdentity(request, options.auth);
    return options.service.getEditorCatalog(actor(identity), options.correlationId(request));
  });
}
