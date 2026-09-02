import { describe, expect, it, vi } from "vitest";

import type { Pool, PoolClient } from "pg";

import type { SessionIdentity, UserRecord } from "../src/domain.js";
import { UserStoreInvariantError } from "../src/domain.js";
import { PgUserStore } from "../src/pg-store.js";

const administrator: UserRecord = {
  id: "10000000-0000-4000-8000-000000000001",
  username: "local.admin",
  displayName: "Local Administrator",
  role: "administrator",
  enabled: true,
  passwordHash: "test-only",
  createdAt: new Date("2026-09-02T08:00:00.000Z"),
  updatedAt: new Date("2026-09-02T08:00:00.000Z")
};
const identity: SessionIdentity = {
  sessionHash: "pg-store-unit-session",
  user: administrator,
  expiresAt: new Date("2027-01-01T00:00:00.000Z")
};

function insertFailurePool(insertError: unknown): {
  readonly pool: Pool;
  readonly query: ReturnType<typeof vi.fn>;
  readonly release: ReturnType<typeof vi.fn>;
} {
  const query = vi.fn(async (statement: string) => {
    if (statement === "BEGIN" || statement === "ROLLBACK") return { rows: [], rowCount: null };
    if (statement.includes("SELECT 1 FROM users")) return { rows: [{}], rowCount: 1 };
    if (statement.includes("INSERT INTO users")) throw insertError;
    throw new Error(`Unexpected SQL in PgUserStore test: ${statement}`);
  });
  const release = vi.fn();
  const client = { query, release } as unknown as PoolClient;
  return {
    pool: { connect: vi.fn(async () => client) } as unknown as Pool,
    query,
    release
  };
}

function createInput() {
  return {
    username: "duplicate.user",
    displayName: "Duplicate User",
    role: "viewer" as const,
    passwordHash: "test-only",
    createdBy: administrator.id,
    administration: {
      actor: identity,
      correlationId: "pg-store-duplicate-user"
    }
  };
}

describe("PgUserStore create-user conflicts", () => {
  it("maps only the username constraint unique violation to a store invariant", async () => {
    const fixture = insertFailurePool({
      code: "23505",
      constraint: "users_username_key",
      detail: "must never cross the repository boundary"
    });

    await expect(new PgUserStore(fixture.pool).createUser(createInput())).rejects.toEqual(
      new UserStoreInvariantError("USERNAME_ALREADY_EXISTS")
    );
    expect(fixture.query).toHaveBeenCalledWith("ROLLBACK");
    expect(fixture.release).toHaveBeenCalledOnce();
  });

  it.each([
    { code: "23505", constraint: "users_pkey" },
    { code: "23503", constraint: "users_created_by_fkey" }
  ])("does not disguise an unrelated PostgreSQL failure %#", async (databaseError) => {
    const fixture = insertFailurePool(databaseError);

    await expect(new PgUserStore(fixture.pool).createUser(createInput())).rejects.toBe(
      databaseError
    );
    expect(fixture.query).toHaveBeenCalledWith("ROLLBACK");
    expect(fixture.release).toHaveBeenCalledOnce();
  });
});
