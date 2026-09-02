import type { Pool, PoolClient, QueryResult } from "pg";

import type {
  AppRole,
  SessionIdentity,
  UserAdministrationContext,
  UserListPage,
  UserRecord,
  UserStore
} from "./domain.js";
import { UserStoreInvariantError } from "./domain.js";

interface UserRow {
  id: string;
  username: string;
  display_name: string;
  role: AppRole;
  enabled: boolean;
  password_hash: string;
  created_at: Date;
  updated_at: Date;
}

function isUsernameUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { readonly code?: unknown; readonly constraint?: unknown };
  return candidate.code === "23505" && candidate.constraint === "users_username_key";
}

function mapUser(row: UserRow): UserRecord {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    enabled: row.enabled,
    passwordHash: row.password_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function inTransaction<T>(
  pool: Pool,
  operation: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function actorSnapshot(context: UserAdministrationContext): Readonly<Record<string, unknown>> {
  const actor = context.actor?.user;
  return actor
    ? {
        schemaVersion: "user-actor-snapshot/v1",
        id: actor.id,
        username: actor.username,
        displayName: actor.displayName,
        role: actor.role
      }
    : {};
}

function targetSnapshot(user: UserRecord): Readonly<Record<string, unknown>> {
  return {
    schemaVersion: "admin-user-snapshot/v1",
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    enabled: user.enabled
  };
}

async function appendAdministrationAudit(
  client: PoolClient,
  input: {
    readonly context: UserAdministrationContext;
    readonly target: UserRecord;
    readonly action: "user.created" | "user.role_changed" | "user.enabled" | "user.disabled";
    readonly priorRole: AppRole | null;
    readonly resultingRole: AppRole | null;
    readonly priorEnabled: boolean | null;
    readonly resultingEnabled: boolean | null;
  }
): Promise<void> {
  await client.query(
    `INSERT INTO user_administration_audit_events (
       schema_version, actor_id, actor_role, actor_snapshot, target_user_id,
       target_user_snapshot, action, prior_role, resulting_role, prior_enabled,
       resulting_enabled, correlation_id, reason_code, outcome, metadata
     ) VALUES (
       'user-administration-audit-event/v1',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NULL,
       'succeeded','{}'::jsonb
     )`,
    [
      input.context.actor?.user.id ?? null,
      input.context.actor?.user.role ?? null,
      actorSnapshot(input.context),
      input.target.id,
      targetSnapshot(input.target),
      input.action,
      input.priorRole,
      input.resultingRole,
      input.priorEnabled,
      input.resultingEnabled,
      input.context.correlationId
    ]
  );
}

async function assertCanRemoveEnabledAdministrator(
  client: PoolClient,
  target: UserRecord
): Promise<void> {
  if (target.role !== "administrator" || !target.enabled) return;
  const enabled = await client.query<{ id: string }>(
    `SELECT id FROM users
      WHERE role = 'administrator' AND enabled = true
      ORDER BY id
      FOR UPDATE`
  );
  if ((enabled.rowCount ?? 0) <= 1) throw new UserStoreInvariantError("LAST_ENABLED_ADMINISTRATOR");
}

async function requireCurrentAdministrator(
  client: PoolClient,
  context: UserAdministrationContext,
  expectedActorId?: string
): Promise<NonNullable<UserAdministrationContext["actor"]>["user"]> {
  const actor = context.actor?.user;
  if (
    !actor ||
    actor.role !== "administrator" ||
    (expectedActorId !== undefined && actor.id !== expectedActorId)
  ) {
    throw new UserStoreInvariantError("ADMINISTRATOR_ACTOR_REQUIRED");
  }
  const current = await client.query(
    `SELECT 1 FROM users
      WHERE id = $1 AND role = 'administrator' AND enabled = true
      FOR SHARE`,
    [actor.id]
  );
  if (current.rowCount !== 1) {
    throw new UserStoreInvariantError("ADMINISTRATOR_ACTOR_REQUIRED");
  }
  return actor;
}

const USER_COLUMNS = `id, username, display_name, role, enabled, password_hash,
                      created_at, updated_at`;

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
      `SELECT ${USER_COLUMNS} FROM users WHERE username = $1`,
      [username]
    );
    return result.rows[0] ? mapUser(result.rows[0]) : null;
  }

  public async findSession(sessionHash: string): Promise<SessionIdentity | null> {
    const result = await this.pool.query<UserRow & { session_hash: string; expires_at: Date }>(
      `SELECT s.token_hash AS session_hash, s.expires_at,
              u.id, u.username, u.display_name, u.role, u.enabled, u.password_hash,
              u.created_at, u.updated_at
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
    await this.pool.query(
      "UPDATE sessions SET last_seen_at = greatest(last_seen_at, now()) WHERE token_hash = $1",
      [sessionHash]
    );
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

  public async listUsers(input: {
    limit: number;
    cursor: string | null;
    administration: UserAdministrationContext;
  }): Promise<UserListPage> {
    return inTransaction(this.pool, async (client) => {
      await requireCurrentAdministrator(client, input.administration);
      const limit = Math.min(100, Math.max(1, Math.trunc(input.limit)));
      const result = await client.query<UserRow>(
        `SELECT ${USER_COLUMNS}
           FROM users listed
          WHERE $2::uuid IS NULL
             OR EXISTS (
               SELECT 1 FROM users cursor_user
                WHERE cursor_user.id = $2
                  AND (listed.username, listed.id) > (cursor_user.username, cursor_user.id)
             )
          ORDER BY listed.username, listed.id
          LIMIT $1`,
        [limit + 1, input.cursor]
      );
      const hasMore = result.rows.length > limit;
      const users = result.rows.slice(0, limit).map(mapUser);
      return {
        users,
        nextCursor: hasMore ? (users.at(-1)?.id ?? null) : null
      };
    });
  }

  public async recordUserAdministrationRejection(input: {
    actor: SessionIdentity;
    targetUserId: string | null;
    requestedAction: "user.create" | "user.role" | "user.status";
    correlationId: string;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO user_administration_audit_events (
         schema_version,actor_id,actor_role,actor_snapshot,target_user_id,target_user_snapshot,
         action,prior_role,resulting_role,prior_enabled,resulting_enabled,correlation_id,
         reason_code,outcome,metadata
       ) VALUES (
         'user-administration-audit-event/v1',$1,$2,$3,$4,'{}'::jsonb,
         'user.authorization_rejected',NULL,NULL,NULL,NULL,$5,'FORBIDDEN','rejected',$6
       )`,
      [
        input.actor.user.id,
        input.actor.user.role,
        actorSnapshot({ actor: input.actor, correlationId: input.correlationId }),
        input.targetUserId,
        input.correlationId,
        { requestedAction: input.requestedAction }
      ]
    );
  }

  public async createUser(input: {
    username: string;
    displayName: string;
    role: AppRole;
    passwordHash: string;
    createdBy: string | null;
    administration: UserAdministrationContext;
  }): Promise<UserRecord> {
    return inTransaction(this.pool, async (client) => {
      const actor = input.administration.actor?.user ?? null;
      if (actor === null) {
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended('users.initial-administrator', 0))"
        );
        const existingAdministrator = await client.query(
          "SELECT 1 FROM users WHERE role = 'administrator' LIMIT 1"
        );
        if (
          input.role !== "administrator" ||
          input.createdBy !== null ||
          existingAdministrator.rowCount !== 0
        ) {
          throw new UserStoreInvariantError("INITIAL_ADMINISTRATOR_EXISTS");
        }
      } else {
        await requireCurrentAdministrator(
          client,
          input.administration,
          input.createdBy ?? undefined
        );
        if (input.createdBy !== actor.id) {
          throw new UserStoreInvariantError("ADMINISTRATOR_ACTOR_REQUIRED");
        }
      }
      let result: QueryResult<UserRow>;
      try {
        result = await client.query<UserRow>(
          `INSERT INTO users
             (username, display_name, role, password_hash, password_algorithm, created_by, updated_by)
           VALUES ($1, $2, $3, $4, 'argon2id-v1', $5, $5)
           RETURNING ${USER_COLUMNS}`,
          [input.username, input.displayName, input.role, input.passwordHash, input.createdBy]
        );
      } catch (error) {
        if (isUsernameUniqueViolation(error)) {
          throw new UserStoreInvariantError("USERNAME_ALREADY_EXISTS");
        }
        throw error;
      }
      const row = result.rows[0];
      if (!row) throw new Error("User insert returned no row");
      const user = mapUser(row);
      await appendAdministrationAudit(client, {
        context: input.administration,
        target: user,
        action: "user.created",
        priorRole: null,
        resultingRole: user.role,
        priorEnabled: null,
        resultingEnabled: user.enabled
      });
      return user;
    });
  }

  public async setUserEnabled(input: {
    userId: string;
    enabled: boolean;
    updatedBy: string;
    administration: UserAdministrationContext;
  }): Promise<UserRecord | null> {
    return inTransaction(this.pool, async (client) => {
      const actor = await requireCurrentAdministrator(
        client,
        input.administration,
        input.updatedBy
      );
      if (actor.id === input.userId && !input.enabled) {
        throw new UserStoreInvariantError("CURRENT_ADMINISTRATOR_PROTECTED");
      }
      const current = await client.query<UserRow>(
        `SELECT ${USER_COLUMNS} FROM users WHERE id = $1 FOR UPDATE`,
        [input.userId]
      );
      const currentRow = current.rows[0];
      if (!currentRow) return null;
      const prior = mapUser(currentRow);
      if (prior.enabled === input.enabled) return prior;
      if (!input.enabled) await assertCanRemoveEnabledAdministrator(client, prior);
      const result = await client.query<UserRow>(
        `UPDATE users SET enabled = $2, updated_at = now(), updated_by = $3
          WHERE id = $1
          RETURNING ${USER_COLUMNS}`,
        [input.userId, input.enabled, input.updatedBy]
      );
      const row = result.rows[0];
      if (!row) throw new Error("User status update returned no row");
      const user = mapUser(row);
      if (!input.enabled) {
        await client.query(
          "UPDATE sessions SET revoked_at = coalesce(revoked_at, now()) WHERE user_id = $1",
          [input.userId]
        );
      }
      await appendAdministrationAudit(client, {
        context: input.administration,
        target: user,
        action: input.enabled ? "user.enabled" : "user.disabled",
        priorRole: prior.role,
        resultingRole: user.role,
        priorEnabled: prior.enabled,
        resultingEnabled: user.enabled
      });
      return user;
    });
  }

  public async setUserRole(input: {
    userId: string;
    role: AppRole;
    updatedBy: string;
    administration: UserAdministrationContext;
  }): Promise<UserRecord | null> {
    return inTransaction(this.pool, async (client) => {
      const actor = await requireCurrentAdministrator(
        client,
        input.administration,
        input.updatedBy
      );
      if (actor.id === input.userId && input.role !== "administrator") {
        throw new UserStoreInvariantError("CURRENT_ADMINISTRATOR_PROTECTED");
      }
      const current = await client.query<UserRow>(
        `SELECT ${USER_COLUMNS} FROM users WHERE id = $1 FOR UPDATE`,
        [input.userId]
      );
      const currentRow = current.rows[0];
      if (!currentRow) return null;
      const prior = mapUser(currentRow);
      if (prior.role === input.role) return prior;
      if (input.role !== "administrator") {
        await assertCanRemoveEnabledAdministrator(client, prior);
      }
      const result = await client.query<UserRow>(
        `UPDATE users SET role = $2, updated_at = now(), updated_by = $3
          WHERE id = $1
          RETURNING ${USER_COLUMNS}`,
        [input.userId, input.role, input.updatedBy]
      );
      const row = result.rows[0];
      if (!row) throw new Error("User role update returned no row");
      const user = mapUser(row);
      await client.query(
        "UPDATE sessions SET revoked_at = coalesce(revoked_at, now()) WHERE user_id = $1",
        [input.userId]
      );
      await appendAdministrationAudit(client, {
        context: input.administration,
        target: user,
        action: "user.role_changed",
        priorRole: prior.role,
        resultingRole: user.role,
        priorEnabled: prior.enabled,
        resultingEnabled: user.enabled
      });
      return user;
    });
  }
}
