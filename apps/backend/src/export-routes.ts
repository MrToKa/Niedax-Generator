import {
  CreateExportRequestV1Schema,
  DatabaseIdV2Schema,
  ExportRequestV1Schema,
  IdempotencyKeySchema
} from "@niedax/domain";
import type { FastifyInstance, FastifyRequest } from "fastify";

import type { AuthService } from "./auth-service.js";
import type { ExportOperations } from "./export-service.js";
import { XLSX_MEDIA_TYPE } from "./export-service.js";
import { ProjectApplicationError } from "./project-errors.js";
import type { RevisionActor } from "./revision-repository.js";

export function registerExportRoutes(
  app: FastifyInstance,
  options: {
    readonly auth: AuthService;
    readonly service: ExportOperations;
    readonly correlationId: (request: FastifyRequest) => string;
  }
): void {
  async function actor(request: FastifyRequest): Promise<RevisionActor> {
    const identity = await options.auth.resolveSession(request.cookies.niedax_session);
    if (!identity)
      throw new ProjectApplicationError(401, "AUTHENTICATION_REQUIRED", "Authentication required");
    const { id, role, username, displayName } = identity.user;
    return { id, role, username, displayName };
  }
  function resourceId(value: string): string {
    const parsed = DatabaseIdV2Schema.safeParse(value);
    if (!parsed.success)
      throw new ProjectApplicationError(422, "VALIDATION_FAILED", "Expected a resource UUID");
    return parsed.data;
  }
  function emptyQuery(request: FastifyRequest): void {
    if (request.query && Object.keys(request.query).length > 0) {
      throw new ProjectApplicationError(
        422,
        "VALIDATION_FAILED",
        "This export route accepts no query parameters"
      );
    }
  }

  app.post<{ Params: { revisionId: string }; Body: unknown }>(
    "/api/v1/revisions/:revisionId/exports",
    { bodyLimit: 4_096, config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const identity = await actor(request);
      emptyQuery(request);
      const revisionId = resourceId(request.params.revisionId);
      if (
        request.body &&
        typeof request.body === "object" &&
        "schemaVersion" in request.body &&
        typeof request.body.schemaVersion === "string" &&
        request.body.schemaVersion !== "export-request/v1"
      ) {
        throw new ProjectApplicationError(
          422,
          "UNSUPPORTED_SCHEMA_VERSION",
          "The export request schema version is not supported"
        );
      }
      const parsed = CreateExportRequestV1Schema.safeParse(request.body);
      const key = IdempotencyKeySchema.safeParse(request.headers["idempotency-key"]);
      if (!parsed.success || !key.success || parsed.data.revisionId !== revisionId) {
        throw new ProjectApplicationError(
          422,
          "VALIDATION_FAILED",
          "Export request, revision ID or Idempotency-Key is invalid"
        );
      }
      const command = ExportRequestV1Schema.parse({
        ...parsed.data,
        correlationId: options.correlationId(request),
        idempotencyKey: key.data
      });
      const result = await options.service.request(identity, command);
      if (result.replayed) reply.header("idempotency-replayed", "true");
      reply.header("cache-control", "private, no-store");
      return reply.status(result.statusCode).send(result.body);
    }
  );

  app.get<{ Params: { revisionId: string } }>(
    "/api/v1/revisions/:revisionId/exports",
    async (request, reply) => {
      const identity = await actor(request);
      emptyQuery(request);
      reply.header("cache-control", "private, no-store");
      return options.service.list(
        identity,
        resourceId(request.params.revisionId),
        options.correlationId(request)
      );
    }
  );

  app.get<{ Params: { exportId: string } }>("/api/v1/exports/:exportId", async (request, reply) => {
    const identity = await actor(request);
    emptyQuery(request);
    reply.header("cache-control", "private, no-store");
    return options.service.get(
      identity,
      resourceId(request.params.exportId),
      options.correlationId(request)
    );
  });

  app.get<{ Params: { exportId: string } }>(
    "/api/v1/exports/:exportId/download",
    async (request, reply) => {
      const identity = await actor(request);
      emptyQuery(request);
      const { artifact, bytes } = await options.service.download(
        identity,
        resourceId(request.params.exportId),
        options.correlationId(request)
      );
      if (!artifact.fileName || !artifact.contentHash)
        throw new ProjectApplicationError(500, "EXPORT_FAILED", "Export metadata unavailable");
      reply.type(XLSX_MEDIA_TYPE);
      reply.header(
        "content-disposition",
        `attachment; filename="${artifact.fileName}"; filename*=UTF-8''${encodeURIComponent(artifact.fileName)}`
      );
      reply.header("content-length", bytes.length);
      reply.header("etag", `"${artifact.contentHash}"`);
      reply.header("x-content-sha256", artifact.contentHash);
      reply.header("x-content-type-options", "nosniff");
      reply.header("cache-control", "private, no-store");
      return reply.send(bytes);
    }
  );
}
