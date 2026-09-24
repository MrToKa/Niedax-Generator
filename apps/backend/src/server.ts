import { Pool } from "pg";

import { buildApp } from "./app.js";
import { PgCatalogAdminRepository } from "./catalog-repository.js";
import { CatalogAdminService } from "./catalog-service.js";
import { loadRuntimeConfig } from "./config.js";
import { PgUserStore } from "./pg-store.js";
import { PgProjectRepository } from "./project-repository.js";
import { ProjectApplicationService } from "./project-service.js";
import { PgRevisionRepository } from "./revision-repository.js";
import { RevisionApplicationService } from "./revision-service.js";
import { PgExportRepository } from "./export-repository.js";
import { ExportApplicationService } from "./export-service.js";
import { OperationalMetrics, PgSystemDiagnosticsStore } from "./system-diagnostics.js";
import { safeErrorDetails } from "./safe-logging.js";

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
const exportService = new ExportApplicationService(new PgExportRepository(pool));
const metrics = new OperationalMetrics();
const app = await buildApp({
  identity: config.identity,
  diagnosticsStore: new PgSystemDiagnosticsStore(pool),
  metrics,
  store: new PgUserStore(pool),
  sessionPepper: config.sessionPepper,
  cookieSecure: config.cookieSecure,
  logger: true,
  catalogService: new CatalogAdminService(new PgCatalogAdminRepository(pool)),
  projectService: new ProjectApplicationService(new PgProjectRepository(pool)),
  revisionService: new RevisionApplicationService(new PgRevisionRepository(pool)),
  exportService
});
exportService.startWorker(() => {
  metrics.exportWorkerFailure();
  app.log.error({ errorCode: "EXPORT_WORKER_UNAVAILABLE" }, "Export recovery will retry");
});

let stopping = false;
async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  app.log.info({ signal }, "graceful shutdown started");
  await app.close();
  await exportService.stopWorker();
  await pool.end();
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error(
    { error: safeErrorDetails(error), errorCode: "BACKEND_STARTUP_FAILED" },
    "backend startup failed"
  );
  await exportService.stopWorker();
  await pool.end();
  process.exitCode = 1;
}
