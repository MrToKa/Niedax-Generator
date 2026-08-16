import { readFile } from "node:fs/promises";
import path from "node:path";

import { Pool } from "pg";

import { databaseConfig } from "./config.js";

const seedFile = process.env.DATABASE_SEED_FILE ?? path.resolve("database/seeds/development.sql");
const sql = await readFile(seedFile, "utf8");
const pool = new Pool(databaseConfig());

try {
  await pool.query(sql);
  process.stdout.write(`Seed applied idempotently from ${path.basename(seedFile)}.\n`);
} finally {
  await pool.end();
}
