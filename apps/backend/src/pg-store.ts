import type { Pool } from "pg";

import type { AppRole, SessionIdentity, UserRecord, UserStore } from "./domain.js";

interface UserRow {
  id: string;
  username: string;
  display_name: string;
  role: AppRole;
  enabled: boolean;
  password_hash: string;
}

function mapUser(row: UserRow): UserRecord {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    enabled: row.enabled,
    passwordHash: row.password_hash
  };
}

export class PgUserStore implements UserStore {
  public constructor(private readonly pool: Pool) {}

  public async ping(): Promise<void> {
    await this.pool.query("SELECT 1");
  }

  public async countAdministrators(): Promise<number> {
    const result = await this.pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM users WHERE role = 'administrator'"
    );
    return Number(result.rows[0]?.count ?? "0");
  }

  public async findUserByUsername(username: string): Promise<UserRecord | null> {
    const result = await this.pool.query<UserRow>(
      `SELECT id, username, display_name, role, enabled, password_hash
         FROM users WHERE username = $1`,
      [username]
    );
    return result.rows[0] ? mapUser(result.rows[0]) : null;
  }

  public async findSession(sessionHash: string): Promise<SessionIdentity | null> {
    const result = await this.pool.query<UserRow & { session_hash: string; expires_at: Date }>(
      `SELECT s.token_hash AS session_hash, s.expires_at,
              u.id, u.username, u.display_name, u.role, u.enabled, u.password_hash
         FROM sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = $1
          AND s.revoked_at IS NULL
          AND s.expires_at > now()
          AND u.enabled = true`,
      [sessionHash]
    );
    const row = result.rows[0];
    if (!row) return null;
    await this.pool.query("UPDATE sessions SET last_seen_at = now() WHERE token_hash = $1", [
      sessionHash
    ]);
    return { sessionHash: row.session_hash, expiresAt: row.expires_at, user: mapUser(row) };
  }

  public async createSession(input: {
    sessionHash: string;
    userId: string;
    expiresAt: Date;
  }): Promise<void> {
    await this.pool.query(
      "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)",
      [input.sessionHash, input.userId, input.expiresAt]
    );
  }

  public async revokeSession(sessionHash: string): Promise<void> {
    await this.pool.query(
      "UPDATE sessions SET revoked_at = coalesce(revoked_at, now()) WHERE token_hash = $1",
      [sessionHash]
    );
  }

  public async createUser(input: {
    username: string;
    displayName: string;
    role: AppRole;
    passwordHash: string;
    createdBy: string | null;
  }): Promise<UserRecord> {
    const result = await this.pool.query<UserRow>(
      `INSERT INTO users
         (username, display_name, role, password_hash, password_algorithm, created_by, updated_by)
       VALUES ($1, $2, $3, $4, 'argon2id-v1', $5, $5)
       RETURNING id, username, display_name, role, enabled, password_hash`,
      [input.username, input.displayName, input.role, input.passwordHash, input.createdBy]
    );
    const row = result.rows[0];
    if (!row) throw new Error("User insert returned no row");
    return mapUser(row);
  }

  public async setUserEnabled(
    userId: string,
    enabled: boolean,
    updatedBy: string
  ): Promise<UserRecord | null> {
    const result = await this.pool.query<UserRow>(
      `UPDATE users SET enabled = $2, updated_at = now(), updated_by = $3
        WHERE id = $1
        RETURNING id, username, display_name, role, enabled, password_hash`,
      [userId, enabled, updatedBy]
    );
    if (!enabled) {
      await this.pool.query(
        "UPDATE sessions SET revoked_at = coalesce(revoked_at, now()) WHERE user_id = $1",
        [userId]
      );
    }
    return result.rows[0] ? mapUser(result.rows[0]) : null;
  }

  public async setUserRole(
    userId: string,
    role: AppRole,
    updatedBy: string
  ): Promise<UserRecord | null> {
    const result = await this.pool.query<UserRow>(
      `UPDATE users SET role = $2, updated_at = now(), updated_by = $3
        WHERE id = $1
        RETURNING id, username, display_name, role, enabled, password_hash`,
      [userId, role, updatedBy]
    );
    return result.rows[0] ? mapUser(result.rows[0]) : null;
  }
}
