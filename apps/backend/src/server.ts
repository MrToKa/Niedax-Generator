import { Pool } from "pg";

import { buildApp } from "./app.js";
import { PgCatalogAdminRepository } from "./catalog-repository.js";
import { CatalogAdminService } from "./catalog-service.js";
import { loadRuntimeConfig } from "./config.js";
import { PgUserStore } from "./pg-store.js";
import { PgProjectRepository } from "./project-repository.js";
import { ProjectApplicationService } from "./project-service.js";

const config = loadRuntimeConfig();
const pool = new Pool({
  host: config.database.host,
  port: config.database.port,
  database: config.database.database,
  user: config.database.user,
  password: config.database.password,
  max: config.database.max,
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 30_000,
  ssl: false
});
const app = await buildApp({
  store: new PgUserStore(pool),
  sessionPepper: config.sessionPepper,
  cookieSecure: config.cookieSecure,
  logger: true,
  catalogService: new CatalogAdminService(new PgCatalogAdminRepository(pool)),
  projectService: new ProjectApplicationService(new PgProjectRepository(pool))
});

let stopping = false;
async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  app.log.info({ signal }, "graceful shutdown started");
  await app.close();
  await pool.end();
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error({ err: error }, "backend startup failed");
  await pool.end();
  process.exitCode = 1;
}
