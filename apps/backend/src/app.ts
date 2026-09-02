import { randomUUID } from "node:crypto";

import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";

import { getCalculationEngineReadiness } from "@niedax/calculation-engine";
import {
  ADMIN_USER_LIST_RESPONSE_V2,
  ADMIN_USER_RESPONSE_V2,
  APP_ROLES,
  AUTHENTICATED_IDENTITY_RESPONSE_V2,
  AdminUserListResponseV2Schema,
  AdminUserResponseV2Schema,
  AuthenticatedIdentityResponseV2Schema,
  CreateAdminUserRequestV2Schema,
  UpdateAdminUserRoleRequestV2Schema,
  UpdateAdminUserStatusRequestV2Schema
} from "@niedax/domain";
import {
  CatalogImportError,
  createXlsxTemplate,
  exportValidationIssuesCsv
} from "@niedax/catalog-import";
import applicationPackage from "../../../package.json" with { type: "json" };
import catalogueManifest from "../../../catalogue/manifest.json" with { type: "json" };
import rulesManifest from "../../../rules/manifest.json" with { type: "json" };
import { AppError, AuthService, PASSWORD_MIN_LENGTH } from "./auth-service.js";
import type { CatalogAdminService, CatalogUploadFile } from "./catalog-service.js";
import type { AppRole, SessionIdentity, UserStore } from "./domain.js";
import { toPublicUser } from "./domain.js";
import { ProjectApplicationError } from "./project-errors.js";
import { canAdministerCatalog } from "./authorization-policy.js";
import { registerProjectRoutes } from "./project-routes.js";
import type { ProjectOperations } from "./project-service.js";
import { registerRevisionRoutes } from "./revision-routes.js";
import type { RevisionOperations } from "./revision-service.js";

const SESSION_COOKIE = "niedax_session";

interface BuildAppOptions {
  readonly store: UserStore;
  readonly sessionPepper: string;
  readonly cookieSecure?: boolean;
  readonly logger?: boolean;
  readonly catalogService?: CatalogAdminService;
  readonly projectService?: ProjectOperations;
  readonly revisionService?: RevisionOperations;
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? false,
    trustProxy: true,
    bodyLimit: 35 * 1024 * 1024
  });
  const auth = new AuthService(options.store, options.sessionPepper);

  await app.register(cookie);
  await app.register(rateLimit, { global: false });

  app.addHook("onSend", async (request, reply) => {
    reply.header("x-correlation-id", correlationId(request));
  });

  app.addHook("onRequest", async (request) => {
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) return;
    const csrf = request.headers["x-niedax-csrf"];
    const origin = request.headers.origin;
    const host = request.headers["x-forwarded-host"] ?? request.headers.host;
    let originHost: string | undefined;
    try {
      originHost = origin ? new URL(origin).host : undefined;
    } catch {
      originHost = undefined;
    }
    if (csrf !== "1" || !originHost || originHost !== host) {
      throw new AppError(403, "CSRF_REJECTED", "Same-origin request validation failed");
    }
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ProjectApplicationError) {
      return reply
        .status(error.statusCode)
        .send(
          errorEnvelope(
            request,
            normalizedErrorCode(error.statusCode, error.code),
            error.message,
            error.details
          )
        );
    }
    if (error instanceof AppError) {
      return reply
        .status(error.statusCode)
        .send(
          errorEnvelope(request, normalizedErrorCode(error.statusCode, error.code), error.message)
        );
    }
    if (error instanceof CatalogImportError) {
      return reply.status(422).send(errorEnvelope(request, "CATALOG_IMPORT_FAILED", error.message));
    }
    const clientError = publicClientError(error);
    if (clientError) {
      return reply.status(clientError.statusCode).send(
        errorEnvelope(
          request,
          normalizedErrorCode(clientError.statusCode, clientError.code),
          clientError.message,
          {
            kind: "validation",
            issues: [{ path: [], code: clientError.code, message: clientError.message }]
          }
        )
      );
    }
    request.log.error({ err: error }, "request failed");
    return reply
      .status(500)
      .send(errorEnvelope(request, "INTERNAL_ERROR", "The request could not be completed"));
  });

  app.get(
    "/api/v1/health/live",
    {
      schema: {
        response: {
          200: { type: "object", properties: { status: { const: "ok" } }, required: ["status"] }
        }
      }
    },
    async () => ({ status: "ok" as const })
  );

  app.get("/api/v1/health/ready", async (_request, reply) => {
    try {
      await options.store.ping();
      return { status: "ready" as const, database: "connected" as const };
    } catch {
      return reply.status(503).send({ status: "not-ready", database: "unavailable" });
    }
  });

  app.get("/api/v1/version", async () => ({
    application: applicationPackage.version,
    catalogue: catalogueManifest.version,
    rules: rulesManifest.version,
    calculationEngine: getCalculationEngineReadiness()
  }));

  app.post<{ Body: { username: string; password: string } }>(
    "/api/v1/auth/login",
    {
      config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["username", "password"],
          properties: {
            username: { type: "string", minLength: 1, maxLength: 64 },
            password: { type: "string", minLength: 1, maxLength: 1024 }
          }
        }
      }
    },
    async (request, reply) => {
      const result = await auth.login(request.body.username, request.body.password);
      reply.setCookie(SESSION_COOKIE, result.token, {
        expires: result.expiresAt,
        httpOnly: true,
        path: "/",
        sameSite: "lax",
        secure: options.cookieSecure ?? false
      });
      return AuthenticatedIdentityResponseV2Schema.parse({
        schemaVersion: AUTHENTICATED_IDENTITY_RESPONSE_V2,
        correlationId: correlationId(request),
        user: result.user
      });
    }
  );

  app.post("/api/v1/auth/logout", async (request, reply) => {
    await auth.logout(request.cookies[SESSION_COOKIE]);
    reply.clearCookie(SESSION_COOKIE, {
      path: "/",
      sameSite: "lax",
      secure: options.cookieSecure ?? false
    });
    return reply.status(204).send();
  });

  app.get("/api/v1/auth/me", async (request) => {
    const identity = await requireIdentity(request, auth);
    return AuthenticatedIdentityResponseV2Schema.parse({
      schemaVersion: AUTHENTICATED_IDENTITY_RESPONSE_V2,
      correlationId: correlationId(request),
      user: toPublicUser(identity.user)
    });
  });

  app.get<{ Querystring: { limit?: number; cursor?: string } }>(
    "/api/v1/admin/users",
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
      const actor = await requireIdentity(request, auth);
      const result = await auth.listUsers(actor, {
        limit: request.query.limit ?? 50,
        cursor: request.query.cursor ?? null
      });
      return AdminUserListResponseV2Schema.parse({
        schemaVersion: ADMIN_USER_LIST_RESPONSE_V2,
        correlationId: correlationId(request),
        ...result
      });
    }
  );

  app.post<{
    Body: {
      schemaVersion: "create-admin-user-request/v2";
      username: string;
      displayName: string;
      password: string;
      role: AppRole;
    };
  }>(
    "/api/v1/admin/users",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["schemaVersion", "username", "displayName", "password", "role"],
          properties: {
            schemaVersion: { const: "create-admin-user-request/v2" },
            username: {
              type: "string",
              minLength: 3,
              maxLength: 64,
              pattern: "^[a-z0-9][a-z0-9._-]{2,63}$"
            },
            displayName: { type: "string", minLength: 2, maxLength: 100 },
            password: { type: "string", minLength: PASSWORD_MIN_LENGTH, maxLength: 1024 },
            role: { enum: APP_ROLES }
          }
        }
      }
    },
    async (request, reply) => {
      const actor = await requireIdentity(request, auth);
      const command = CreateAdminUserRequestV2Schema.safeParse(request.body);
      if (!command.success) {
        throw new AppError(400, "VALIDATION_FAILED", "Request validation failed");
      }
      const user = await auth.createUser(actor, command.data, correlationId(request));
      return reply.status(201).send(
        AdminUserResponseV2Schema.parse({
          schemaVersion: ADMIN_USER_RESPONSE_V2,
          correlationId: correlationId(request),
          user
        })
      );
    }
  );

  app.patch<{
    Params: { id: string };
    Body: { schemaVersion: "update-admin-user-status-request/v2"; enabled: boolean };
  }>(
    "/api/v1/admin/users/:id/status",
    {
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string", format: "uuid" } }
        },
        body: {
          type: "object",
          additionalProperties: false,
          required: ["schemaVersion", "enabled"],
          properties: {
            schemaVersion: { const: "update-admin-user-status-request/v2" },
            enabled: { type: "boolean" }
          }
        }
      }
    },
    async (request) => {
      const actor = await requireIdentity(request, auth);
      const command = UpdateAdminUserStatusRequestV2Schema.safeParse(request.body);
      if (!command.success) {
        throw new AppError(400, "VALIDATION_FAILED", "Request validation failed");
      }
      const user = await auth.setEnabled(
        actor,
        request.params.id,
        command.data.enabled,
        correlationId(request)
      );
      return AdminUserResponseV2Schema.parse({
        schemaVersion: ADMIN_USER_RESPONSE_V2,
        correlationId: correlationId(request),
        user
      });
    }
  );

  app.patch<{
    Params: { id: string };
    Body: { schemaVersion: "update-admin-user-role-request/v2"; role: AppRole };
  }>(
    "/api/v1/admin/users/:id/role",
    {
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string", format: "uuid" } }
        },
        body: {
          type: "object",
          additionalProperties: false,
          required: ["schemaVersion", "role"],
          properties: {
            schemaVersion: { const: "update-admin-user-role-request/v2" },
            role: { enum: APP_ROLES }
          }
        }
      }
    },
    async (request) => {
      const actor = await requireIdentity(request, auth);
      const command = UpdateAdminUserRoleRequestV2Schema.safeParse(request.body);
      if (!command.success) {
        throw new AppError(400, "VALIDATION_FAILED", "Request validation failed");
      }
      const user = await auth.setRole(
        actor,
        request.params.id,
        command.data.role,
        correlationId(request)
      );
      return AdminUserResponseV2Schema.parse({
        schemaVersion: ADMIN_USER_RESPONSE_V2,
        correlationId: correlationId(request),
        user
      });
    }
  );

  app.post<{ Body: { files: CatalogUploadFile[] } }>(
    "/api/v1/admin/catalog-imports/preview",
    { schema: { body: catalogUploadBodySchema } },
    async (request) => {
      const actor = await requireAdministrator(request, auth);
      return requireCatalog(options).preview(request.body.files, actor.user.role);
    }
  );

  app.post<{ Body: { files: CatalogUploadFile[] } }>(
    "/api/v1/admin/catalog-imports",
    { schema: { body: catalogUploadBodySchema } },
    async (request, reply) => {
      const actor = await requireAdministrator(request, auth);
      const draft = await requireCatalog(options).importDraft({
        files: request.body.files,
        actorId: actor.user.id,
        actorRole: actor.user.role,
        correlationId: correlationId(request)
      });
      return reply.status(201).send({ catalog: draft });
    }
  );

  app.post<{ Params: { id: string } }>(
    "/api/v1/admin/catalog-versions/:id/validate",
    { schema: { params: uuidParamsSchema } },
    async (request) => {
      const actor = await requireAdministrator(request, auth);
      return {
        catalog: await requireCatalog(options).validate({
          catalogVersionId: request.params.id,
          actorId: actor.user.id,
          actorRole: actor.user.role,
          correlationId: correlationId(request)
        })
      };
    }
  );

  app.post<{
    Params: { id: string };
    Body: { contentHash: string; reason: string };
  }>(
    "/api/v1/admin/catalog-versions/:id/approve",
    { schema: { params: uuidParamsSchema, body: transitionBodySchema } },
    async (request) => {
      const actor = await requireAdministrator(request, auth);
      return {
        catalog: await requireCatalog(options).approve({
          catalogVersionId: request.params.id,
          actorId: actor.user.id,
          actorRole: actor.user.role,
          correlationId: correlationId(request),
          reason: request.body.reason,
          contentHash: request.body.contentHash
        })
      };
    }
  );

  app.post<{
    Params: { id: string };
    Body: { contentHash: string; reason: string };
  }>(
    "/api/v1/admin/catalog-versions/:id/activate",
    { schema: { params: uuidParamsSchema, body: transitionBodySchema } },
    async (request) => {
      const actor = await requireAdministrator(request, auth);
      return {
        catalog: await requireCatalog(options).activate({
          catalogVersionId: request.params.id,
          actorId: actor.user.id,
          actorRole: actor.user.role,
          correlationId: correlationId(request),
          reason: request.body.reason,
          contentHash: request.body.contentHash
        })
      };
    }
  );

  app.post<{ Params: { id: string }; Body: { reason: string } }>(
    "/api/v1/admin/catalog-versions/:id/archive",
    {
      schema: {
        params: uuidParamsSchema,
        body: {
          type: "object",
          additionalProperties: false,
          required: ["reason"],
          properties: { reason: { type: "string", minLength: 1, maxLength: 2000 } }
        }
      }
    },
    async (request) => {
      const actor = await requireAdministrator(request, auth);
      return {
        catalog: await requireCatalog(options).archive({
          catalogVersionId: request.params.id,
          actorId: actor.user.id,
          actorRole: actor.user.role,
          correlationId: correlationId(request),
          reason: request.body.reason
        })
      };
    }
  );

  app.get("/api/v1/admin/catalog-versions", async (request) => {
    const actor = await requireAdministrator(request, auth);
    return { versions: await requireCatalog(options).listVersions(actor.user.role) };
  });

  app.get("/api/v1/admin/catalog-import-template.xlsx", async (request, reply) => {
    await requireAdministrator(request, auth);
    reply.type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    reply.header("content-disposition", 'attachment; filename="niedax-catalog-import-v1.xlsx"');
    return createXlsxTemplate();
  });

  app.get<{ Params: { id: string } }>(
    "/api/v1/admin/catalog-versions/:id/report.csv",
    { schema: { params: uuidParamsSchema } },
    async (request, reply) => {
      const actor = await requireAdministrator(request, auth);
      const report = await requireCatalog(options).exportLatestReport(
        request.params.id,
        actor.user.role
      );
      if (!report)
        throw new AppError(404, "CATALOG_REPORT_NOT_FOUND", "Validation report not found");
      reply.type("text/csv; charset=utf-8");
      reply.header(
        "content-disposition",
        `attachment; filename="catalog-validation-${request.params.id}.csv"`
      );
      return exportValidationIssuesCsv(report.issues);
    }
  );

  app.get<{
    Querystring: {
      system: string;
      height_mm: string;
      width_mm: string;
      material_code: string;
      finish_code: string;
    };
  }>(
    "/api/v1/catalog/products",
    {
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          required: ["system", "height_mm", "width_mm", "material_code", "finish_code"],
          properties: {
            system: { type: "string", minLength: 1, maxLength: 64 },
            height_mm: { type: "string", pattern: "^[0-9]+(?:\\.[0-9]+)?$" },
            width_mm: { type: "string", pattern: "^[0-9]+(?:\\.[0-9]+)?$" },
            material_code: { type: "string", minLength: 1, maxLength: 128 },
            finish_code: { type: "string", minLength: 1, maxLength: 32 }
          }
        }
      }
    },
    async (request) => {
      await requireIdentity(request, auth);
      return {
        products: await requireCatalog(options).findSelectableProducts({
          system: request.query.system,
          heightMm: Number(request.query.height_mm),
          widthMm: Number(request.query.width_mm),
          materialCode: request.query.material_code,
          finishCode: request.query.finish_code
        })
      };
    }
  );

  app.get("/api/v1/catalog/options", async (request) => {
    await requireIdentity(request, auth);
    return { options: await requireCatalog(options).listSelectionOptions() };
  });

  if (options.projectService) {
    registerProjectRoutes(app, {
      auth,
      service: options.projectService,
      correlationId
    });
  }

  if (options.revisionService) {
    registerRevisionRoutes(app, {
      auth,
      service: options.revisionService,
      correlationId
    });
  }

  return app;
}

const uuidParamsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id"],
  properties: { id: { type: "string", format: "uuid" } }
} as const;

const catalogUploadBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["files"],
  properties: {
    files: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "contentBase64"],
        properties: {
          name: { type: "string", minLength: 1, maxLength: 255 },
          contentBase64: { type: "string", minLength: 1, maxLength: 35 * 1024 * 1024 }
        }
      }
    }
  }
} as const;

const transitionBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["contentHash", "reason"],
  properties: {
    contentHash: { type: "string", pattern: "^sha256:[0-9a-f]{64}$" },
    reason: { type: "string", minLength: 1, maxLength: 2000 }
  }
} as const;

const correlationIds = new WeakMap<object, string>();
const CORRELATION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u;

function correlationId(request: FastifyRequest): string {
  const existing = correlationIds.get(request);
  if (existing) return existing;
  const provided = request.headers["x-correlation-id"];
  const selected =
    typeof provided === "string" && CORRELATION_PATTERN.test(provided)
      ? provided
      : CORRELATION_PATTERN.test(request.id)
        ? request.id
        : randomUUID();
  correlationIds.set(request, selected);
  return selected;
}

type PublicErrorCode =
  | "VALIDATION_FAILED"
  | "INVALID_USERNAME"
  | "INVALID_DISPLAY_NAME"
  | "WEAK_PASSWORD"
  | "CONFLICT_STALE_VERSION"
  | "INVALID_STATE_TRANSITION"
  | "AUTHENTICATION_REQUIRED"
  | "FORBIDDEN"
  | "RESOURCE_NOT_FOUND"
  | "CATALOG_SNAPSHOT_MISSING"
  | "RULE_SNAPSHOT_MISSING"
  | "UNSUPPORTED_SCHEMA_VERSION"
  | "IDEMPOTENCY_KEY_CONFLICT"
  | "CALCULATION_FAILED"
  | "CATALOG_IMPORT_FAILED"
  | "EXPORT_FAILED"
  | "INTERNAL_ERROR";

function normalizedErrorCode(statusCode: number, code: string): PublicErrorCode {
  const accepted = new Set<PublicErrorCode>([
    "VALIDATION_FAILED",
    "INVALID_USERNAME",
    "INVALID_DISPLAY_NAME",
    "WEAK_PASSWORD",
    "CONFLICT_STALE_VERSION",
    "INVALID_STATE_TRANSITION",
    "AUTHENTICATION_REQUIRED",
    "FORBIDDEN",
    "RESOURCE_NOT_FOUND",
    "CATALOG_SNAPSHOT_MISSING",
    "RULE_SNAPSHOT_MISSING",
    "UNSUPPORTED_SCHEMA_VERSION",
    "IDEMPOTENCY_KEY_CONFLICT",
    "CALCULATION_FAILED",
    "CATALOG_IMPORT_FAILED",
    "EXPORT_FAILED",
    "INTERNAL_ERROR"
  ]);
  if (accepted.has(code as PublicErrorCode)) return code as PublicErrorCode;
  if (statusCode === 401) return "AUTHENTICATION_REQUIRED";
  if (statusCode === 403) return "FORBIDDEN";
  if (statusCode === 404) return "RESOURCE_NOT_FOUND";
  if (statusCode === 409) return "CONFLICT_STALE_VERSION";
  if (statusCode >= 400 && statusCode < 500) return "VALIDATION_FAILED";
  return "INTERNAL_ERROR";
}

function safeMessage(message: string): string {
  const trimmed = message.trim();
  return (trimmed || "The request could not be completed").slice(0, 2_000);
}

function errorEnvelope(
  request: FastifyRequest,
  code: PublicErrorCode,
  message: string,
  details: unknown = null
): {
  readonly schemaVersion: "error-envelope/v1";
  readonly correlationId: string;
  readonly error: {
    readonly code: PublicErrorCode;
    readonly message: string;
    readonly details: unknown;
  };
} {
  return {
    schemaVersion: "error-envelope/v1",
    correlationId: correlationId(request),
    error: { code, message: safeMessage(message), details }
  };
}

interface PublicClientError {
  readonly statusCode: 400 | 413 | 415 | 422 | 429;
  readonly code: string;
  readonly message: string;
}

function publicClientError(error: unknown): PublicClientError | null {
  if (!error || typeof error !== "object") return null;
  const candidate = error as {
    readonly statusCode?: unknown;
    readonly code?: unknown;
    readonly validation?: unknown;
  };
  if (candidate.statusCode === 429) {
    return {
      statusCode: 429,
      code: "RATE_LIMIT_EXCEEDED",
      message: "Too many requests"
    };
  }
  switch (candidate.code) {
    case "FST_ERR_VALIDATION":
      if (
        Array.isArray(candidate.validation) &&
        candidate.validation.some(
          (issue: unknown) =>
            typeof issue === "object" &&
            issue !== null &&
            "instancePath" in issue &&
            "keyword" in issue &&
            (issue as { readonly instancePath?: unknown }).instancePath === "/schemaVersion" &&
            (issue as { readonly keyword?: unknown }).keyword === "const"
        )
      ) {
        return {
          statusCode: 422,
          code: "UNSUPPORTED_SCHEMA_VERSION",
          message: "The request schema version is not supported"
        };
      }
      return {
        statusCode: 400,
        code: "REQUEST_VALIDATION_FAILED",
        message: "Request validation failed"
      };
    case "FST_ERR_CTP_INVALID_JSON_BODY":
      return {
        statusCode: 400,
        code: "INVALID_JSON_BODY",
        message: "Request body is not valid JSON"
      };
    case "FST_ERR_CTP_BODY_TOO_LARGE":
      return {
        statusCode: 413,
        code: "PAYLOAD_TOO_LARGE",
        message: "Request body is too large"
      };
    case "FST_ERR_CTP_INVALID_MEDIA_TYPE":
      return {
        statusCode: 415,
        code: "UNSUPPORTED_MEDIA_TYPE",
        message: "Content type is not supported"
      };
    default:
      return null;
  }
}

function requireCatalog(options: BuildAppOptions): CatalogAdminService {
  if (!options.catalogService) {
    throw new AppError(503, "CATALOG_SERVICE_UNAVAILABLE", "Catalog administration is unavailable");
  }
  return options.catalogService;
}

async function requireIdentity(
  request: FastifyRequest,
  auth: AuthService
): Promise<SessionIdentity> {
  const identity = await auth.resolveSession(request.cookies[SESSION_COOKIE]);
  if (!identity) throw new AppError(401, "AUTHENTICATION_REQUIRED", "Authentication required");
  return identity;
}

async function requireAdministrator(
  request: FastifyRequest,
  auth: AuthService
): Promise<SessionIdentity> {
  const identity = await requireIdentity(request, auth);
  if (!canAdministerCatalog(identity.user.role)) {
    throw new AppError(403, "ADMINISTRATOR_REQUIRED", "Administrator role required");
  }
  return identity;
}
