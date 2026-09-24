import { resolve } from "node:path";
import { Pool } from "pg";

import { loadRuntimeConfig } from "../config.js";
import { assertStage11SeedEnvironment } from "../stage11-seed-contract.js";
import { seedStage11 } from "../stage11-seed.js";

assertStage11SeedEnvironment(process.env);
const config = loadRuntimeConfig();
const pool = new Pool({ ...config.database, max: 4, ssl: false, connectionTimeoutMillis: 5_000 });
try {
  // Read credentials from a pipe: never command arguments, environment, image layers or logs.
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.from(chunk as Uint8Array);
    size += buffer.length;
    if (size > 16_384) throw new Error("TEST credential input is too large");
    chunks.push(buffer);
  }
  let accounts: unknown;
  try {
    accounts = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("TEST credential input is invalid JSON");
  }
  const report = await seedStage11(
    pool,
    config.sessionPepper,
    accounts,
    resolve("../../catalogue/imports/niedax-p0-2022")
  );
  process.stdout.write(`${JSON.stringify(report)}\n`);
} catch (error) {
  // Preserve useful bounded categories while excluding request payloads and credentials.
  const code =
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string" &&
    /^[A-Z0-9_]+$/u.test(error.code)
      ? error.code
      : "SEED_FAILED";
  process.stderr.write(
    `Persistent TEST seed failed (${code}); inspect TEST state and seed prerequisites.\n`
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
