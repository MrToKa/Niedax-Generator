import { describe, expect, it } from "vitest";

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
      headers: { host: "localhost:8080", origin: "http://localhost:8080", "x-niedax-csrf": "1" },
      payload: {}
    });
    expect(response.statusCode).toBe(404);
    await app.close();
  });
});
