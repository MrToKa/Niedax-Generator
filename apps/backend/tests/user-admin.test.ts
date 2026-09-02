import { randomUUID } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import {
  ADMIN_USER_LIST_RESPONSE_V2,
  APP_ROLES,
  AdminUserListResponseV2Schema,
  AuthenticatedIdentityResponseV2Schema,
  ErrorEnvelopeV1Schema,
  type AppRole
} from "@niedax/domain";

import { buildApp } from "../src/app.js";
import { hashPassword } from "../src/auth-service.js";
import { capabilitiesForRole } from "../src/authorization-policy.js";
import type { SessionIdentity, UserRecord, UserStore } from "../src/domain.js";

const pepper = "stage8-user-admin-test-pepper";
const password = "Stage8-Accounts-42!";
const timestamp = new Date("2026-09-02T08:00:00.000Z");
const ids = {
  designer: "10000000-0000-4000-8000-000000000101",
  reviewer: "10000000-0000-4000-8000-000000000102",
  administrator: "10000000-0000-4000-8000-000000000103",
  viewer: "10000000-0000-4000-8000-000000000104"
} as const;

let passwordHash: string;

beforeAll(async () => {
  passwordHash = await hashPassword(password);
});

interface TestStore extends UserStore {
  readonly users: Map<string, UserRecord>;
  readonly rejections: Array<{
    readonly targetUserId: string | null;
    readonly requestedAction: "user.create" | "user.role" | "user.status";
  }>;
}

function testStore(): TestStore {
  const users = new Map<string, UserRecord>(
    APP_ROLES.map((role) => {
      const user: UserRecord = {
        id: ids[role],
        username: `stage8.${role}`,
        displayName: `Stage 8 ${role}`,
        role,
        enabled: true,
        passwordHash,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      return [user.id, user];
    })
  );
  const sessions = new Map<string, SessionIdentity>();
  const rejections: TestStore["rejections"] = [];
  return {
    users,
    rejections,
    ping: async () => undefined,
    countAdministrators: async () =>
      [...users.values()].filter((user) => user.role === "administrator").length,
    findUserByUsername: async (username) =>
      [...users.values()].find((user) => user.username === username) ?? null,
    findSession: async (hash) => sessions.get(hash) ?? null,
    createSession: async ({ sessionHash, userId, expiresAt }) => {
      const user = users.get(userId);
      if (!user) throw new Error("Unknown test user");
      sessions.set(sessionHash, { sessionHash, user, expiresAt });
    },
    revokeSession: async (hash) => {
      sessions.delete(hash);
    },
    listUsers: async ({ limit, cursor }) => {
      const ordered = [...users.values()].sort((left, right) =>
        left.username.localeCompare(right.username)
      );
      const start = cursor ? ordered.findIndex((user) => user.id === cursor) + 1 : 0;
      const page = ordered.slice(Math.max(0, start), Math.max(0, start) + limit);
      return {
        users: page,
        nextCursor: ordered.length > start + limit ? (page.at(-1)?.id ?? null) : null
      };
    },
    recordUserAdministrationRejection: async (input) => {
      rejections.push({
        targetUserId: input.targetUserId,
        requestedAction: input.requestedAction
      });
    },
    createUser: async (input) => {
      const user: UserRecord = {
        id: randomUUID(),
        username: input.username,
        displayName: input.displayName,
        role: input.role,
        enabled: true,
        passwordHash: input.passwordHash,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      users.set(user.id, user);
      return user;
    },
    setUserEnabled: async (input) => {
      const prior = users.get(input.userId);
      if (!prior) return null;
      const user = { ...prior, enabled: input.enabled, updatedAt: timestamp };
      users.set(user.id, user);
      if (!input.enabled) {
        for (const [hash, session] of sessions) {
          if (session.user.id === user.id) sessions.delete(hash);
        }
      }
      return user;
    },
    setUserRole: async (input) => {
      const prior = users.get(input.userId);
      if (!prior) return null;
      const user = { ...prior, role: input.role, updatedAt: timestamp };
      users.set(user.id, user);
      for (const [hash, session] of sessions) {
        if (session.user.id === user.id) sessions.delete(hash);
      }
      return user;
    }
  };
}

const mutationHeaders = (cookie?: string) => ({
  host: "localhost:8080",
  origin: "http://localhost:8080",
  "x-niedax-csrf": "1",
  ...(cookie ? { cookie } : {})
});

async function login(
  app: Awaited<ReturnType<typeof buildApp>>,
  role: AppRole
): Promise<{ readonly cookie: string; readonly body: unknown }> {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    headers: mutationHeaders(),
    payload: { username: `stage8.${role}`, password }
  });
  expect(response.statusCode).toBe(200);
  const setCookie = response.headers["set-cookie"];
  if (typeof setCookie !== "string") throw new Error("Login cookie missing");
  return { cookie: setCookie.split(";", 1)[0] ?? "", body: response.json() };
}

describe("Stage 8 user administration HTTP API", () => {
  it.each(APP_ROLES)("returns backend-owned role and capabilities for %s", async (role) => {
    const app = await buildApp({ store: testStore(), sessionPepper: pepper });
    const authenticated = await login(app, role);
    expect(AuthenticatedIdentityResponseV2Schema.safeParse(authenticated.body).success).toBe(true);
    expect(authenticated.body).toMatchObject({
      schemaVersion: "authenticated-identity-response/v2",
      user: { role, capabilities: capabilitiesForRole(role) }
    });
    const me = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: { cookie: authenticated.cookie }
    });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ user: { role, capabilities: capabilitiesForRole(role) } });
    await app.close();
  });

  it("lets an Administrator create all roles and page the bounded user list", async () => {
    const store = testStore();
    const app = await buildApp({ store, sessionPepper: pepper });
    const administrator = await login(app, "administrator");

    for (const role of APP_ROLES) {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/admin/users",
        headers: mutationHeaders(administrator.cookie),
        payload: {
          schemaVersion: "create-admin-user-request/v2",
          username: `created.${role}`,
          displayName: `Created ${role}`,
          password: `Created-${role}-42!`,
          role
        }
      });
      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({ user: { role, enabled: true } });
    }

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/admin/users?limit=2",
      headers: { cookie: administrator.cookie }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ schemaVersion: ADMIN_USER_LIST_RESPONSE_V2 });
    expect(AdminUserListResponseV2Schema.safeParse(response.json()).success).toBe(true);
    expect(response.json().users).toHaveLength(2);
    expect(response.json().nextCursor).toEqual(expect.any(String));
    await app.close();
  });

  it("rejects an unsupported user-administration payload version with the stable error", async () => {
    const app = await buildApp({ store: testStore(), sessionPepper: pepper });
    const administrator = await login(app, "administrator");
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/admin/users",
      headers: mutationHeaders(administrator.cookie),
      payload: {
        schemaVersion: "create-admin-user-request/v1",
        username: "unsupported.version",
        displayName: "Unsupported Version",
        password: "Unsupported-Version-42!",
        role: "viewer"
      }
    });
    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({
      schemaVersion: "error-envelope/v1",
      error: { code: "UNSUPPORTED_SCHEMA_VERSION" }
    });
    await app.close();
  });

  it("rejects a username outside the shared lowercase contract before persistence", async () => {
    const store = testStore();
    const initialSize = store.users.size;
    const app = await buildApp({ store, sessionPepper: pepper });
    const administrator = await login(app, "administrator");
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/admin/users",
      headers: mutationHeaders(administrator.cookie),
      payload: {
        schemaVersion: "create-admin-user-request/v2",
        username: "Uppercase.User",
        displayName: "Uppercase User",
        password: "Uppercase-User-42!",
        role: "viewer"
      }
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
    expect(store.users.size).toBe(initialSize);
    await app.close();
  });

  it("preserves a weak-password failure as a bounded public error envelope", async () => {
    const store = testStore();
    const initialSize = store.users.size;
    const app = await buildApp({ store, sessionPepper: pepper });
    const administrator = await login(app, "administrator");
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/admin/users",
      headers: mutationHeaders(administrator.cookie),
      payload: {
        schemaVersion: "create-admin-user-request/v2",
        username: "weak.password",
        displayName: "Weak Password",
        password: "abcdef",
        role: "viewer"
      }
    });

    expect(response.statusCode).toBe(400);
    const envelope = ErrorEnvelopeV1Schema.parse(response.json());
    expect(envelope.error.code).toBe("WEAK_PASSWORD");
    expect(store.users.size).toBe(initialSize);
    await app.close();
  });

  it.each(["designer", "reviewer", "viewer"] as const)(
    "rejects forged user-administration requests from %s without mutation",
    async (role) => {
      const store = testStore();
      const initialSize = store.users.size;
      const administratorBefore = store.users.get(ids.administrator);
      const app = await buildApp({ store, sessionPepper: pepper });
      const authenticated = await login(app, role);
      const requests = [
        app.inject({
          method: "GET",
          url: "/api/v1/admin/users",
          headers: { cookie: authenticated.cookie }
        }),
        app.inject({
          method: "POST",
          url: "/api/v1/admin/users",
          headers: mutationHeaders(authenticated.cookie),
          payload: {
            schemaVersion: "create-admin-user-request/v2",
            username: "forbidden.user",
            displayName: "Forbidden User",
            password: "Forbidden-User-42!",
            role: "viewer"
          }
        }),
        app.inject({
          method: "PATCH",
          url: `/api/v1/admin/users/${ids.administrator}/role`,
          headers: mutationHeaders(authenticated.cookie),
          payload: { schemaVersion: "update-admin-user-role-request/v2", role: "viewer" }
        }),
        app.inject({
          method: "PATCH",
          url: `/api/v1/admin/users/${ids.administrator}/status`,
          headers: mutationHeaders(authenticated.cookie),
          payload: { schemaVersion: "update-admin-user-status-request/v2", enabled: false }
        })
      ];
      for (const response of await Promise.all(requests)) {
        expect(response.statusCode).toBe(403);
        expect(response.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
      }
      expect(store.users.size).toBe(initialSize);
      expect(store.users.get(ids.administrator)).toEqual(administratorBefore);
      expect(store.rejections).toHaveLength(3);
      expect(store.rejections).toEqual(
        expect.arrayContaining([
          { targetUserId: null, requestedAction: "user.create" },
          { targetUserId: ids.administrator, requestedAction: "user.role" },
          { targetUserId: ids.administrator, requestedAction: "user.status" }
        ])
      );
      await app.close();
    }
  );

  it("invalidates an existing cookie when an Administrator changes its user's role", async () => {
    const store = testStore();
    const app = await buildApp({ store, sessionPepper: pepper });
    const viewer = await login(app, "viewer");
    const administrator = await login(app, "administrator");
    const changed = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/users/${ids.viewer}/role`,
      headers: mutationHeaders(administrator.cookie),
      payload: { schemaVersion: "update-admin-user-role-request/v2", role: "reviewer" }
    });
    expect(changed.statusCode).toBe(200);
    expect(changed.json()).toMatchObject({ user: { id: ids.viewer, role: "reviewer" } });
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/v1/auth/me",
          headers: { cookie: viewer.cookie }
        })
      ).statusCode
    ).toBe(401);
    await app.close();
  });
});
