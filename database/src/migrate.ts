import path from "node:path";

import { Pool, type PoolClient } from "pg";

import { databaseConfig } from "./config.js";
import { loadMigrationFiles, validateAppliedMigrations } from "./migration-files.js";

type Command = "status" | "up" | "verify";

async function ensureMetadata(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY,
      checksum char(64) NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function run(command: Command): Promise<void> {
  const migrationsDirectory = process.env.MIGRATIONS_DIR ?? path.resolve("database/migrations");
  const files = await loadMigrationFiles(migrationsDirectory);
  const pool = new Pool(databaseConfig());
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(hashtext('niedax_generator_migrations'))");
    await ensureMetadata(client);
    const result = await client.query<{ filename: string; checksum: string }>(
      "SELECT filename, checksum FROM schema_migrations ORDER BY applied_at, filename"
    );
    validateAppliedMigrations(files, result.rows);
    const pending = files.slice(result.rows.length);

    if (command === "status") {
      process.stdout.write(`Applied: ${result.rows.length}; pending: ${pending.length}\n`);
      for (const migration of pending) process.stdout.write(`  pending ${migration.filename}\n`);
      return;
    }
    if (command === "verify") {
      if (pending.length > 0) throw new Error(`${pending.length} migration(s) remain pending`);
      process.stdout.write(`Migration history verified (${files.length} applied).\n`);
      return;
    }

    for (const migration of pending) {
      process.stdout.write(`Applying ${migration.filename}\n`);
      await client.query("BEGIN");
      try {
        await client.query(migration.sql);
        await client.query("INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)", [
          migration.filename,
          migration.checksum
        ]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
    process.stdout.write(`Migrations complete; applied ${pending.length}.\n`);
  } finally {
    await client
      .query("SELECT pg_advisory_unlock(hashtext('niedax_generator_migrations'))")
      .catch(() => undefined);
    client.release();
    await pool.end();
  }
}

const command = (process.argv[2] ?? "up") as Command;
if (!["status", "up", "verify"].includes(command))
  throw new Error(`Unknown migration command: ${command}`);
await run(command);
