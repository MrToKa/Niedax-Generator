import { createHash, randomBytes } from "node:crypto";

import { hash, verify } from "@node-rs/argon2";

import type { AppRole, PublicUser, SessionIdentity, UserStore } from "./domain.js";
import { toPublicUser } from "./domain.js";

const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;
export const PASSWORD_MIN_LENGTH = 6;

export class AppError extends Error {
  public constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
  }
}

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function validatePassword(password: string, username: string): string[] {
  const failures: string[] = [];
  if (password.length < PASSWORD_MIN_LENGTH) {
    failures.push(`at least ${PASSWORD_MIN_LENGTH} characters`);
  }
  if (!/[a-z]/u.test(password)) failures.push("a lowercase letter");
  if (!/[A-Z]/u.test(password)) failures.push("an uppercase letter");
  if (!/[0-9]/u.test(password)) failures.push("a number");
  if (!/[^A-Za-z0-9]/u.test(password)) failures.push("a symbol");
  if (username.length >= 3 && password.toLowerCase().includes(username.toLowerCase())) {
    failures.push("must not contain the username");
  }
  return failures;
}

export async function hashPassword(password: string): Promise<string> {
  return hash(password, {
    algorithm: 2,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
    outputLen: 32
  });
}

export class AuthService {
  public constructor(
    private readonly store: UserStore,
    private readonly sessionPepper: string,
    private readonly now: () => Date = () => new Date()
  ) {}

  public async login(
    usernameInput: string,
    password: string
  ): Promise<{ token: string; user: PublicUser; expiresAt: Date }> {
    const username = normalizeUsername(usernameInput);
    const user = await this.store.findUserByUsername(username);
    if (!user || !user.enabled || !(await verify(user.passwordHash, password))) {
      throw new AppError(401, "INVALID_CREDENTIALS", "Invalid username or password");
    }
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(this.now().getTime() + SESSION_DURATION_MS);
    await this.store.createSession({
      sessionHash: this.hashSession(token),
      userId: user.id,
      expiresAt
    });
    return { token, expiresAt, user: toPublicUser(user) };
  }

  public async logout(token: string | undefined): Promise<void> {
    if (token) await this.store.revokeSession(this.hashSession(token));
  }

  public async resolveSession(token: string | undefined): Promise<SessionIdentity | null> {
    if (!token) return null;
    return this.store.findSession(this.hashSession(token));
  }

  public async createInitialAdministrator(input: {
    username: string;
    displayName: string;
    password: string;
  }): Promise<PublicUser> {
    if ((await this.store.countAdministrators()) > 0) {
      throw new AppError(409, "ADMINISTRATOR_EXISTS", "An administrator already exists");
    }
    return this.createUser(null, { ...input, role: "administrator" });
  }

  public async createUser(
    actor: SessionIdentity | null,
    input: { username: string; displayName: string; password: string; role: AppRole }
  ): Promise<PublicUser> {
    if (actor && actor.user.role !== "administrator") {
      throw new AppError(403, "FORBIDDEN", "Administrator role required");
    }
    const username = normalizeUsername(input.username);
    if (!/^[a-z0-9][a-z0-9._-]{2,63}$/u.test(username)) {
      throw new AppError(400, "INVALID_USERNAME", "Username format is invalid");
    }
    const displayName = input.displayName.trim();
    if (displayName.length < 2 || displayName.length > 100) {
      throw new AppError(400, "INVALID_DISPLAY_NAME", "Display name must be 2 to 100 characters");
    }
    const failures = validatePassword(input.password, username);
    if (failures.length > 0) {
      throw new AppError(400, "WEAK_PASSWORD", `Password requires ${failures.join(", ")}`);
    }
    const user = await this.store.createUser({
      username,
      displayName,
      role: input.role,
      passwordHash: await hashPassword(input.password),
      createdBy: actor?.user.id ?? null
    });
    return toPublicUser(user);
  }

  public async setEnabled(
    actor: SessionIdentity,
    userId: string,
    enabled: boolean
  ): Promise<PublicUser> {
    this.requireAdministrator(actor);
    if (actor.user.id === userId && !enabled) {
      throw new AppError(
        409,
        "SELF_DISABLE",
        "Administrators cannot disable their current account"
      );
    }
    const user = await this.store.setUserEnabled(userId, enabled, actor.user.id);
    if (!user) throw new AppError(404, "USER_NOT_FOUND", "User not found");
    return toPublicUser(user);
  }

  public async setRole(actor: SessionIdentity, userId: string, role: AppRole): Promise<PublicUser> {
    this.requireAdministrator(actor);
    if (actor.user.id === userId && role !== "administrator") {
      throw new AppError(
        409,
        "SELF_DEMOTION",
        "Administrators cannot demote their current account"
      );
    }
    const user = await this.store.setUserRole(userId, role, actor.user.id);
    if (!user) throw new AppError(404, "USER_NOT_FOUND", "User not found");
    return toPublicUser(user);
  }

  private requireAdministrator(actor: SessionIdentity): void {
    if (actor.user.role !== "administrator") {
      throw new AppError(403, "FORBIDDEN", "Administrator role required");
    }
  }

  private hashSession(token: string): string {
    return createHash("sha256").update(token).update(this.sessionPepper).digest("hex");
  }
}
