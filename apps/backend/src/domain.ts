export type AppRole = "administrator" | "reviewer";

export interface UserRecord {
  readonly id: string;
  readonly username: string;
  readonly displayName: string;
  readonly role: AppRole;
  readonly enabled: boolean;
  readonly passwordHash: string;
}

export interface SessionIdentity {
  readonly sessionHash: string;
  readonly user: UserRecord;
  readonly expiresAt: Date;
}

export interface PublicUser {
  readonly id: string;
  readonly username: string;
  readonly displayName: string;
  readonly role: AppRole;
}

export interface UserStore {
  ping(): Promise<void>;
  countAdministrators(): Promise<number>;
  findUserByUsername(username: string): Promise<UserRecord | null>;
  findSession(sessionHash: string): Promise<SessionIdentity | null>;
  createSession(input: { sessionHash: string; userId: string; expiresAt: Date }): Promise<void>;
  revokeSession(sessionHash: string): Promise<void>;
  createUser(input: {
    username: string;
    displayName: string;
    role: AppRole;
    passwordHash: string;
    createdBy: string | null;
  }): Promise<UserRecord>;
  setUserEnabled(userId: string, enabled: boolean, updatedBy: string): Promise<UserRecord | null>;
  setUserRole(userId: string, role: AppRole, updatedBy: string): Promise<UserRecord | null>;
}

export function toPublicUser(user: UserRecord): PublicUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role
  };
}
