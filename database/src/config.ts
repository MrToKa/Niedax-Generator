import { readFileSync } from "node:fs";

import type { PoolConfig } from "pg";

function readPassword(): string {
  const secretFile = process.env.PGPASSWORD_FILE;
  if (secretFile) {
    const password = readFileSync(secretFile, "utf8").trim();
    if (!password) throw new Error("Configured PostgreSQL password file is empty");
    return password;
  }
  if (process.env.NODE_ENV === "test" && process.env.ALLOW_EPHEMERAL_TEST_PASSWORD === "1") {
    const password = process.env.PGPASSWORD;
    if (password) return password;
  }
  throw new Error("PGPASSWORD_FILE is required outside isolated tests");
}

export function databaseConfig(): PoolConfig {
  return {
    host: process.env.PGHOST ?? "postgres",
    port: Number(process.env.PGPORT ?? "5432"),
    database: process.env.PGDATABASE ?? "niedax_generator",
    user: process.env.PGUSER ?? "niedax_generator_migrator",
    password: readPassword(),
    max: 2,
    connectionTimeoutMillis: 5_000,
    ssl: false
  };
}
