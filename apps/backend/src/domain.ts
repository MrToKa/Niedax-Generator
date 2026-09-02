import type { AdminUserSummaryV2, AppRole, AuthenticatedUserV2 } from "@niedax/domain";

import { capabilitiesForRole } from "./authorization-policy.js";

export type { AppRole } from "@niedax/domain";

export interface UserRecord {
  readonly id: string;
  readonly username: string;
  readonly displayName: string;
  readonly role: AppRole;
  readonly enabled: boolean;
  readonly passwordHash: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface SessionIdentity {
  readonly sessionHash: string;
  readonly user: UserRecord;
  readonly expiresAt: Date;
}

export type PublicUser = AuthenticatedUserV2;

export interface UserListPage {
  readonly users: readonly UserRecord[];
  readonly nextCursor: string | null;
}

export interface UserAdministrationContext {
  readonly actor: SessionIdentity | null;
  readonly correlationId: string;
}

export class UserStoreInvariantError extends Error {
  public constructor(
    public readonly code:
      | "LAST_ENABLED_ADMINISTRATOR"
      | "INITIAL_ADMINISTRATOR_EXISTS"
      | "ADMINISTRATOR_ACTOR_REQUIRED"
      | "CURRENT_ADMINISTRATOR_PROTECTED"
      | "USERNAME_ALREADY_EXISTS"
  ) {
    super(code);
  }
}

export interface UserStore {
  ping(): Promise<void>;
  countAdministrators(): Promise<number>;
  findUserByUsername(username: string): Promise<UserRecord | null>;
  findSession(sessionHash: string): Promise<SessionIdentity | null>;
  createSession(input: { sessionHash: string; userId: string; expiresAt: Date }): Promise<void>;
  revokeSession(sessionHash: string): Promise<void>;
  listUsers(input: {
    limit: number;
    cursor: string | null;
    administration: UserAdministrationContext;
  }): Promise<UserListPage>;
  recordUserAdministrationRejection(input: {
    actor: SessionIdentity;
    targetUserId: string | null;
    requestedAction: "user.create" | "user.role" | "user.status";
    correlationId: string;
  }): Promise<void>;
  createUser(input: {
    username: string;
    displayName: string;
    role: AppRole;
    passwordHash: string;
    createdBy: string | null;
    administration: UserAdministrationContext;
  }): Promise<UserRecord>;
  setUserEnabled(input: {
    userId: string;
    enabled: boolean;
    updatedBy: string;
    administration: UserAdministrationContext;
  }): Promise<UserRecord | null>;
  setUserRole(input: {
    userId: string;
    role: AppRole;
    updatedBy: string;
    administration: UserAdministrationContext;
  }): Promise<UserRecord | null>;
}

export function toPublicUser(user: UserRecord): PublicUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    capabilities: capabilitiesForRole(user.role)
  };
}

export function toAdminUser(user: UserRecord): AdminUserSummaryV2 {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    enabled: user.enabled,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString()
  };
}
