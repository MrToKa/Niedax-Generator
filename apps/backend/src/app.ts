import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";

import { getCalculationEngineReadiness } from "@niedax/calculation-engine";
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

const SESSION_COOKIE = "niedax_session";

interface BuildAppOptions {
  readonly store: UserStore;
  readonly sessionPepper: string;
  readonly cookieSecure?: boolean;
  readonly logger?: boolean;
  readonly catalogService?: CatalogAdminService;
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
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message, correlationId: correlationId(request) }
      });
    }
    if (error instanceof CatalogImportError) {
      return reply.status(422).send({
        error: { code: error.code, message: error.message, correlationId: correlationId(request) }
      });
    }
    request.log.error({ err: error }, "request failed");
    return reply.status(500).send({
      error: {
        code: "INTERNAL_ERROR",
        message: "The request could not be completed",
        correlationId: correlationId(request)
      }
    });
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
      return { user: result.user };
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
    return { user: toPublicUser(identity.user) };
  });

  app.post<{
    Body: { username: string; displayName: string; password: string; role: AppRole };
  }>(
    "/api/v1/admin/users",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["username", "displayName", "password", "role"],
          properties: {
            username: { type: "string", minLength: 3, maxLength: 64 },
            displayName: { type: "string", minLength: 2, maxLength: 100 },
            password: { type: "string", minLength: PASSWORD_MIN_LENGTH, maxLength: 1024 },
            role: { enum: ["administrator", "reviewer"] }
          }
        }
      }
    },
    async (request, reply) => {
      const actor = await requireIdentity(request, auth);
      const user = await auth.createUser(actor, request.body);
      return reply.status(201).send({ user });
    }
  );

  app.patch<{ Params: { id: string }; Body: { enabled: boolean } }>(
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
          required: ["enabled"],
          properties: { enabled: { type: "boolean" } }
        }
      }
    },
    async (request) => {
      const actor = await requireIdentity(request, auth);
      return { user: await auth.setEnabled(actor, request.params.id, request.body.enabled) };
    }
  );

  app.patch<{ Params: { id: string }; Body: { role: AppRole } }>(
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
          required: ["role"],
          properties: { role: { enum: ["administrator", "reviewer"] } }
        }
      }
    },
    async (request) => {
      const actor = await requireIdentity(request, auth);
      return { user: await auth.setRole(actor, request.params.id, request.body.role) };
    }
  );

  app.post<{ Body: { files: CatalogUploadFile[] } }>(
    "/api/v1/admin/catalog-imports/preview",
    { schema: { body: catalogUploadBodySchema } },
    async (request) => {
      const actor = await requireAdministrator(request, auth);
      void actor;
      return requireCatalog(options).preview(request.body.files);
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
          correlationId: correlationId(request),
          reason: request.body.reason
        })
      };
    }
  );

  app.get("/api/v1/admin/catalog-versions", async (request) => {
    await requireAdministrator(request, auth);
    return { versions: await requireCatalog(options).listVersions() };
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
      await requireAdministrator(request, auth);
      const report = await requireCatalog(options).exportLatestReport(request.params.id);
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

function correlationId(request: FastifyRequest): string {
  const provided = request.headers["x-correlation-id"];
  return typeof provided === "string" && /^[A-Za-z0-9._:-]{1,128}$/u.test(provided)
    ? provided
    : request.id;
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
  if (identity.user.role !== "administrator") {
    throw new AppError(403, "ADMINISTRATOR_REQUIRED", "Administrator role required");
  }
  return identity;
}
