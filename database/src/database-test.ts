import { readFile } from "node:fs/promises";

import { Pool } from "pg";

import { databaseConfig } from "./config.js";

const testFile = process.env.DATABASE_TEST_FILE ?? "/app/tests/foundation.sql";
const sql = await readFile(testFile, "utf8");
const pool = new Pool(databaseConfig());
try {
  await pool.query(sql);
  process.stdout.write("Database foundation assertions passed.\n");
} finally {
  await pool.end();
}
