import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";

import { getCalculationEngineReadiness } from "@niedax/calculation-engine";
import applicationPackage from "../../../package.json" with { type: "json" };
import catalogueManifest from "../../../catalogue/manifest.json" with { type: "json" };
import rulesManifest from "../../../rules/manifest.json" with { type: "json" };
import { AppError, AuthService } from "./auth-service.js";
import type { AppRole, SessionIdentity, UserStore } from "./domain.js";
import { toPublicUser } from "./domain.js";

const SESSION_COOKIE = "niedax_session";

interface BuildAppOptions {
  readonly store: UserStore;
  readonly sessionPepper: string;
  readonly cookieSecure?: boolean;
  readonly logger?: boolean;
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? false,
    trustProxy: true
  });
  const auth = new AuthService(options.store, options.sessionPepper);

  await app.register(cookie);
  await app.register(rateLimit, { global: false });

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
      return reply
        .status(error.statusCode)
        .send({ error: { code: error.code, message: error.message } });
    }
    request.log.error({ err: error }, "request failed");
    return reply.status(500).send({
      error: { code: "INTERNAL_ERROR", message: "The request could not be completed" }
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
            password: { type: "string", minLength: 14, maxLength: 1024 },
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

  return app;
}

async function requireIdentity(
  request: FastifyRequest,
  auth: AuthService
): Promise<SessionIdentity> {
  const identity = await auth.resolveSession(request.cookies[SESSION_COOKIE]);
  if (!identity) throw new AppError(401, "AUTHENTICATION_REQUIRED", "Authentication required");
  return identity;
}
