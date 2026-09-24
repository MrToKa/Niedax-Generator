import type { FastifyRequest } from "fastify";
import type { SessionIdentity } from "./domain.js";

const actors = new WeakMap<FastifyRequest, { actorId: string; role: string }>();

export function recordRequestIdentity(request: FastifyRequest, identity: SessionIdentity): void {
  actors.set(request, { actorId: identity.user.id, role: identity.user.role });
}

export function safeRequestContext(request: FastifyRequest): Record<string, unknown> {
  const params = request.params as Record<string, unknown> | undefined;
  const uuid = (value: unknown) =>
    typeof value === "string" && /^[a-f0-9-]{36}$/u.test(value) ? value : null;
  return {
    method: request.method,
    route: request.routeOptions.url ?? "unmatched",
    ...actors.get(request),
    projectId: uuid(params?.projectId),
    revisionId: uuid(params?.revisionId)
  };
}

// Database and dependency exceptions may contain credentials, SQL or request data in
// messages/cause objects. Keep only the error class and bounded source locations.
export function safeErrorDetails(error: unknown): { type: string; message: string; stack: string } {
  if (!(error instanceof Error)) return { type: "Error", message: "Details suppressed", stack: "" };
  return {
    type: ["Error", "TypeError", "RangeError", "SyntaxError"].includes(error.name)
      ? error.name
      : "Error",
    message: "Details suppressed",
    stack: (error.stack ?? "")
      .split("\n")
      .slice(1, 13)
      .map((line) => /^\s+at .*[\\/]([A-Za-z0-9._-]+:\d+:\d+)\)?$/u.exec(line)?.[1])
      .filter((frame): frame is string => Boolean(frame))
      .join("\n")
  };
}

export const SAFE_LOG_REDACTION = {
  paths: [
    "password",
    "passwordHash",
    "sessionPepper",
    "token",
    "cookie",
    "authorization",
    "headers",
    "body",
    "req.headers",
    "req.body",
    "res.headers",
    "*.password",
    "*.passwordHash",
    "*.sessionPepper",
    "*.token",
    "*.cookie",
    "*.authorization"
  ],
  censor: "[REDACTED]"
};
