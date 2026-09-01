import { describe, expect, it } from "vitest";

import { ErrorEnvelopeV1Schema } from "@niedax/domain";

import { buildApp } from "../src/app.js";
import type { UserStore } from "../src/domain.js";

const emptyStore: UserStore = {
  ping: async () => undefined,
  countAdministrators: async () => 0,
  findUserByUsername: async () => null,
  findSession: async () => null,
  createSession: async () => undefined,
  revokeSession: async () => undefined,
  createUser: async () => {
    throw new Error("not used");
  },
  setUserEnabled: async () => null,
  setUserRole: async () => null
};

const mutationHeaders = {
  host: "localhost:8080",
  origin: "http://localhost:8080",
  "x-niedax-csrf": "1"
};

describe("foundation HTTP API", () => {
  it("serves liveness without a database query", async () => {
    const app = await buildApp({
      store: {
        ...emptyStore,
        ping: async () => {
          throw new Error("offline");
        }
      },
      sessionPepper: "test"
    });
    const response = await app.inject({ method: "GET", url: "/api/v1/health/live" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
    await app.close();
  });

  it("reports readiness and consistent versions", async () => {
    const app = await buildApp({ store: emptyStore, sessionPepper: "test" });
    const ready = await app.inject({ method: "GET", url: "/api/v1/health/ready" });
    const version = await app.inject({ method: "GET", url: "/api/v1/version" });
    expect(ready.json()).toEqual({ status: "ready", database: "connected" });
    expect(version.json()).toMatchObject({
      application: "0.1.0",
      catalogue: "0.1.0",
      rules: "0.1.0"
    });
    await app.close();
  });

  it("has no public registration route", async () => {
    const app = await buildApp({ store: emptyStore, sessionPepper: "test" });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      headers: mutationHeaders,
      payload: {}
    });
    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it("returns a stable 400 response for invalid request schemas", async () => {
    const app = await buildApp({ store: emptyStore, sessionPepper: "test" });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: mutationHeaders,
      payload: { username: "missing-password" }
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      schemaVersion: "error-envelope/v1",
      correlationId: expect.any(String),
      error: {
        code: "VALIDATION_FAILED",
        message: "Request validation failed",
        details: { kind: "validation" }
      }
    });
    expect(ErrorEnvelopeV1Schema.safeParse(response.json()).success).toBe(true);
    await app.close();
  });

  it("preserves malformed JSON and unsupported media type client errors", async () => {
    const app = await buildApp({ store: emptyStore, sessionPepper: "test" });
    const malformed = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: { ...mutationHeaders, "content-type": "application/json" },
      payload: '{"username":'
    });
    expect(malformed.statusCode).toBe(400);
    expect(malformed.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
    expect(ErrorEnvelopeV1Schema.safeParse(malformed.json()).success).toBe(true);

    const unsupported = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: { ...mutationHeaders, "content-type": "application/xml" },
      payload: "<login />"
    });
    expect(unsupported.statusCode).toBe(415);
    expect(unsupported.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
    expect(ErrorEnvelopeV1Schema.safeParse(unsupported.json()).success).toBe(true);
    await app.close();
  });

  it("returns a stable 429 response when the login rate limit is exceeded", async () => {
    const app = await buildApp({ store: emptyStore, sessionPepper: "test" });
    const attempt = () =>
      app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        headers: mutationHeaders,
        payload: { username: "unknown.user", password: "incorrect" }
      });
    for (let index = 0; index < 5; index += 1) {
      expect((await attempt()).statusCode).toBe(401);
    }
    const limited = await attempt();
    expect(limited.statusCode).toBe(429);
    expect(limited.headers["retry-after"]).toBeTruthy();
    expect(limited.json()).toMatchObject({
      schemaVersion: "error-envelope/v1",
      correlationId: expect.any(String),
      error: {
        code: "VALIDATION_FAILED",
        message: "Too many requests"
      }
    });
    expect(ErrorEnvelopeV1Schema.safeParse(limited.json()).success).toBe(true);
    await app.close();
  });
});
