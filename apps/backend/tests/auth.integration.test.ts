import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { AuthService, validatePassword } from "../src/auth-service.js";
import type { AppError } from "../src/auth-service.js";
import type { AppRole, SessionIdentity, UserRecord, UserStore } from "../src/domain.js";

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
  public async createUser(input: {
    username: string;
    displayName: string;
    role: AppRole;
    passwordHash: string;
    createdBy: string | null;
  }): Promise<UserRecord> {
    const user: UserRecord = {
      id: randomUUID(),
      username: input.username,
      displayName: input.displayName,
      role: input.role,
      enabled: true,
      passwordHash: input.passwordHash
    };
    this.users.set(user.id, user);
    return user;
  }
  public async setUserEnabled(id: string, enabled: boolean): Promise<UserRecord | null> {
    const existing = this.users.get(id);
    if (!existing) return null;
    const user = { ...existing, enabled };
    this.users.set(id, user);
    if (!enabled) {
      for (const [hash, session] of this.sessions)
        if (session.user.id === id) this.sessions.delete(hash);
    }
    return user;
  }
  public async setUserRole(id: string, role: AppRole): Promise<UserRecord | null> {
    const existing = this.users.get(id);
    if (!existing) return null;
    const user = { ...existing, role };
    this.users.set(id, user);
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
});
