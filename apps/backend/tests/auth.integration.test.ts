import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { AuthService, validatePassword } from "../src/auth-service.js";
import type { AppError } from "../src/auth-service.js";
import type { AppRole, SessionIdentity, UserRecord, UserStore } from "../src/domain.js";
import { UserStoreInvariantError } from "../src/domain.js";

class MemoryStore implements UserStore {
  public readonly users = new Map<string, UserRecord>();
  public readonly sessions = new Map<string, SessionIdentity>();
  public now = new Date("2026-08-13T12:00:00Z");

  public async ping(): Promise<void> {}
  public async countAdministrators(): Promise<number> {
    return [...this.users.values()].filter((user) => user.role === "administrator").length;
  }
  public async findUserByUsername(username: string): Promise<UserRecord | null> {
    return [...this.users.values()].find((user) => user.username === username) ?? null;
  }
  public async findSession(hash: string): Promise<SessionIdentity | null> {
    const session = this.sessions.get(hash);
    return session && session.expiresAt > this.now && session.user.enabled ? session : null;
  }
  public async createSession(input: {
    sessionHash: string;
    userId: string;
    expiresAt: Date;
  }): Promise<void> {
    const user = this.users.get(input.userId);
    if (!user) throw new Error("Unknown user");
    this.sessions.set(input.sessionHash, {
      sessionHash: input.sessionHash,
      user,
      expiresAt: input.expiresAt
    });
  }
  public async revokeSession(hash: string): Promise<void> {
    this.sessions.delete(hash);
  }
  public async listUsers(input: { limit: number; cursor: string | null }) {
    const users = [...this.users.values()].sort((left, right) =>
      left.username.localeCompare(right.username)
    );
    const start = input.cursor
      ? Math.max(0, users.findIndex((user) => user.id === input.cursor) + 1)
      : 0;
    const page = users.slice(start, start + input.limit);
    return {
      users: page,
      nextCursor: users.length > start + input.limit ? (page.at(-1)?.id ?? null) : null
    };
  }
  public async recordUserAdministrationRejection(): Promise<void> {
    return undefined;
  }
  public async createUser(input: {
    username: string;
    displayName: string;
    role: AppRole;
    passwordHash: string;
    createdBy: string | null;
  }): Promise<UserRecord> {
    if ([...this.users.values()].some((user) => user.username === input.username)) {
      throw new UserStoreInvariantError("USERNAME_ALREADY_EXISTS");
    }
    const user: UserRecord = {
      id: randomUUID(),
      username: input.username,
      displayName: input.displayName,
      role: input.role,
      enabled: true,
      passwordHash: input.passwordHash,
      createdAt: this.now,
      updatedAt: this.now
    };
    this.users.set(user.id, user);
    return user;
  }
  public async setUserEnabled(input: {
    userId: string;
    enabled: boolean;
  }): Promise<UserRecord | null> {
    const existing = this.users.get(input.userId);
    if (!existing) return null;
    if (
      !input.enabled &&
      existing.enabled &&
      existing.role === "administrator" &&
      [...this.users.values()].filter((user) => user.enabled && user.role === "administrator")
        .length <= 1
    ) {
      throw new UserStoreInvariantError("LAST_ENABLED_ADMINISTRATOR");
    }
    const user = { ...existing, enabled: input.enabled, updatedAt: this.now };
    this.users.set(input.userId, user);
    if (!input.enabled) {
      for (const [hash, session] of this.sessions)
        if (session.user.id === input.userId) this.sessions.delete(hash);
    }
    return user;
  }
  public async setUserRole(input: { userId: string; role: AppRole }): Promise<UserRecord | null> {
    const existing = this.users.get(input.userId);
    if (!existing) return null;
    if (
      input.role !== "administrator" &&
      existing.enabled &&
      existing.role === "administrator" &&
      [...this.users.values()].filter((user) => user.enabled && user.role === "administrator")
        .length <= 1
    ) {
      throw new UserStoreInvariantError("LAST_ENABLED_ADMINISTRATOR");
    }
    const user = { ...existing, role: input.role, updatedAt: this.now };
    this.users.set(input.userId, user);
    for (const [hash, session] of this.sessions)
      if (session.user.id === input.userId) this.sessions.delete(hash);
    return user;
  }
}

const strongPassword = "Local-Foundation-42!";

describe("password policy", () => {
  it("accepts a six-character password that meets the complexity requirements", () => {
    expect(validatePassword("Aa1!xy", "local.admin")).toEqual([]);
  });

  it("rejects a five-character password", () => {
    expect(validatePassword("Aa1!x", "local.admin")).toContain("at least 6 characters");
  });
});

describe("authentication and authorization foundation", () => {
  it("supports login, expiry, and explicit logout revocation", async () => {
    const store = new MemoryStore();
    const auth = new AuthService(store, "test-pepper", () => store.now);
    await auth.createInitialAdministrator({
      username: "local.admin",
      displayName: "Local Admin",
      password: strongPassword
    });
    const login = await auth.login("LOCAL.ADMIN", strongPassword);
    expect((await auth.resolveSession(login.token))?.user.role).toBe("administrator");
    store.now = new Date(login.expiresAt.getTime() + 1);
    expect(await auth.resolveSession(login.token)).toBeNull();
    store.now = new Date("2026-08-13T12:00:00Z");
    const nextLogin = await auth.login("local.admin", strongPassword);
    await auth.logout(nextLogin.token);
    expect(await auth.resolveSession(nextLogin.token)).toBeNull();
  });

  it("lets an administrator create and disable a reviewer", async () => {
    const store = new MemoryStore();
    const auth = new AuthService(store, "test-pepper", () => store.now);
    await auth.createInitialAdministrator({
      username: "local.admin",
      displayName: "Local Admin",
      password: strongPassword
    });
    const login = await auth.login("local.admin", strongPassword);
    const actor = await auth.resolveSession(login.token);
    if (!actor) throw new Error("Expected administrator session");
    const reviewer = await auth.createUser(actor, {
      username: "project.reviewer",
      displayName: "Project Reviewer",
      password: "Reviewer-Foundation-42!",
      role: "reviewer"
    });
    const disabled = await auth.setEnabled(actor, reviewer.id, false);
    expect(disabled).toMatchObject({ id: reviewer.id, role: "reviewer" });
    expect(store.users.get(reviewer.id)?.enabled).toBe(false);
  });

  it("maps a duplicate normalized username to a stable safe conflict", async () => {
    const store = new MemoryStore();
    const auth = new AuthService(store, "test-pepper", () => store.now);
    await auth.createInitialAdministrator({
      username: "local.admin",
      displayName: "Local Admin",
      password: strongPassword
    });
    const login = await auth.login("local.admin", strongPassword);
    const actor = await auth.resolveSession(login.token);
    if (!actor) throw new Error("Expected administrator session");
    const sizeBefore = store.users.size;

    await expect(
      auth.createUser(actor, {
        username: " LOCAL.ADMIN ",
        displayName: "Duplicate Local Admin",
        password: "Duplicate-Local-42!",
        role: "viewer"
      })
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "VALIDATION_FAILED",
      message: "Username is already in use"
    });
    expect(store.users.size).toBe(sizeBefore);
  });

  it("denies administrator actions to reviewers", async () => {
    const store = new MemoryStore();
    const auth = new AuthService(store, "test-pepper", () => store.now);
    const administrator = await auth.createInitialAdministrator({
      username: "local.admin",
      displayName: "Local Admin",
      password: strongPassword
    });
    const adminRecord = store.users.get(administrator.id);
    if (!adminRecord) throw new Error("Expected administrator");
    const reviewer = await store.createUser({
      username: "reviewer",
      displayName: "Reviewer",
      passwordHash: "unused",
      role: "reviewer",
      createdBy: adminRecord.id
    });
    const actor: SessionIdentity = {
      sessionHash: "test",
      user: reviewer,
      expiresAt: new Date("2027-01-01T00:00:00Z")
    };
    await expect(
      auth.createUser(actor, {
        username: "another.user",
        displayName: "Another User",
        password: "Another-Foundation-42!",
        role: "reviewer"
      })
    ).rejects.toEqual(
      expect.objectContaining<Partial<AppError>>({ statusCode: 403, code: "FORBIDDEN" })
    );
  });

  it("rejects a missing actor at the internal user-administration boundary", async () => {
    const store = new MemoryStore();
    const auth = new AuthService(store, "test-pepper", () => store.now);
    await auth.createInitialAdministrator({
      username: "local.admin",
      displayName: "Local Admin",
      password: strongPassword
    });
    const userCount = store.users.size;

    await expect(
      auth.createUser(null as unknown as SessionIdentity, {
        username: "missing.actor",
        displayName: "Missing Actor",
        password: "Missing-Actor-42!",
        role: "administrator"
      })
    ).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
    expect(store.users.size).toBe(userCount);
  });

  it("lets an administrator create and page every canonical Stage 8 role", async () => {
    const store = new MemoryStore();
    const auth = new AuthService(store, "test-pepper", () => store.now);
    await auth.createInitialAdministrator({
      username: "local.admin",
      displayName: "Local Admin",
      password: strongPassword
    });
    const login = await auth.login("local.admin", strongPassword);
    const actor = await auth.resolveSession(login.token);
    if (!actor) throw new Error("Expected administrator session");

    for (const role of ["designer", "reviewer", "administrator", "viewer"] as const) {
      const user = await auth.createUser(actor, {
        username: `stage8.${role}`,
        displayName: `Stage 8 ${role}`,
        password: `Stage8-${role}-42!`,
        role
      });
      expect(user.role).toBe(role);
    }

    const firstPage = await auth.listUsers(actor, { limit: 2, cursor: null });
    expect(firstPage.users).toHaveLength(2);
    expect(firstPage.nextCursor).not.toBeNull();
    const secondPage = await auth.listUsers(actor, {
      limit: 100,
      cursor: firstPage.nextCursor
    });
    expect([...firstPage.users, ...secondPage.users].map((user) => user.role)).toEqual(
      expect.arrayContaining(["designer", "reviewer", "administrator", "viewer"])
    );
  });

  it.each(["designer", "reviewer", "viewer"] as const)(
    "denies every user administration operation to %s",
    async (role) => {
      const store = new MemoryStore();
      const auth = new AuthService(store, "test-pepper", () => store.now);
      const administrator = await auth.createInitialAdministrator({
        username: "local.admin",
        displayName: "Local Admin",
        password: strongPassword
      });
      const administratorRecord = store.users.get(administrator.id);
      if (!administratorRecord) throw new Error("Expected administrator");
      const user = await store.createUser({
        username: `stage8.${role}`,
        displayName: `Stage 8 ${role}`,
        passwordHash: "unused",
        role,
        createdBy: administrator.id
      });
      const actor: SessionIdentity = {
        sessionHash: "forged-session-for-policy-test",
        user,
        expiresAt: new Date("2027-01-01T00:00:00Z")
      };

      const forbidden = expect.objectContaining<Partial<AppError>>({
        statusCode: 403,
        code: "FORBIDDEN"
      });
      await expect(auth.listUsers(actor, { limit: 50, cursor: null })).rejects.toEqual(forbidden);
      await expect(
        auth.createUser(actor, {
          username: "forbidden.user",
          displayName: "Forbidden User",
          password: "Forbidden-Foundation-42!",
          role: "viewer"
        })
      ).rejects.toEqual(forbidden);
      await expect(auth.setRole(actor, administrator.id, "viewer")).rejects.toEqual(forbidden);
      await expect(auth.setEnabled(actor, administrator.id, false)).rejects.toEqual(forbidden);
    }
  );

  it("revokes active sessions immediately after role or enabled-state changes", async () => {
    const store = new MemoryStore();
    const auth = new AuthService(store, "test-pepper", () => store.now);
    await auth.createInitialAdministrator({
      username: "local.admin",
      displayName: "Local Admin",
      password: strongPassword
    });
    const administratorLogin = await auth.login("local.admin", strongPassword);
    const administrator = await auth.resolveSession(administratorLogin.token);
    if (!administrator) throw new Error("Expected administrator session");
    const reviewerPassword = "Reviewer-Foundation-42!";
    const reviewer = await auth.createUser(administrator, {
      username: "role.session.reviewer",
      displayName: "Role Session Reviewer",
      password: reviewerPassword,
      role: "reviewer"
    });
    const reviewerLogin = await auth.login(reviewer.username, reviewerPassword);
    expect(await auth.resolveSession(reviewerLogin.token)).not.toBeNull();
    await auth.setRole(administrator, reviewer.id, "viewer");
    expect(await auth.resolveSession(reviewerLogin.token)).toBeNull();

    const viewerLogin = await auth.login(reviewer.username, reviewerPassword);
    expect((await auth.resolveSession(viewerLogin.token))?.user.role).toBe("viewer");
    await auth.setEnabled(administrator, reviewer.id, false);
    expect(await auth.resolveSession(viewerLogin.token)).toBeNull();
  });

  it("protects both the current and last enabled Administrator", async () => {
    const store = new MemoryStore();
    const auth = new AuthService(store, "test-pepper", () => store.now);
    const administrator = await auth.createInitialAdministrator({
      username: "local.admin",
      displayName: "Local Admin",
      password: strongPassword
    });
    const login = await auth.login("local.admin", strongPassword);
    const actor = await auth.resolveSession(login.token);
    if (!actor) throw new Error("Expected administrator session");

    await expect(auth.setEnabled(actor, administrator.id, false)).rejects.toEqual(
      expect.objectContaining<Partial<AppError>>({ statusCode: 409, code: "SELF_DISABLE" })
    );
    await expect(auth.setRole(actor, administrator.id, "reviewer")).rejects.toEqual(
      expect.objectContaining<Partial<AppError>>({ statusCode: 409, code: "SELF_DEMOTION" })
    );
    await expect(
      store.setUserEnabled({ userId: administrator.id, enabled: false })
    ).rejects.toEqual(expect.objectContaining({ code: "LAST_ENABLED_ADMINISTRATOR" }));
    await expect(store.setUserRole({ userId: administrator.id, role: "viewer" })).rejects.toEqual(
      expect.objectContaining({ code: "LAST_ENABLED_ADMINISTRATOR" })
    );
  });
});
