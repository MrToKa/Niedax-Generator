import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { Pool } from "pg";

import { catalogSheetNames, parseCsvBundle, type CatalogSheetName } from "@niedax/catalog-import";
import { PgCatalogAdminRepository } from "./catalog-repository.js";
import { CatalogAdminService, runCatalogPipelineForActiveScope } from "./catalog-service.js";
import { loadRuntimeConfig } from "./config.js";

function option(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
}

const actorId = option("--actor-id");
if (
  !actorId ||
  !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(actorId)
) {
  throw new Error("--actor-id must identify the documented development/test administrator");
}
const sourceDirectory = resolve(option("--source") ?? "../../catalogue/imports/niedax-p0-2022");
const approve = process.argv.includes("--approve");
const activate = process.argv.includes("--activate");
const reason = option("--reason")?.trim() ?? "";
if ((approve || activate) && !reason)
  throw new Error("--reason is required for approval or activation");
if (activate && !approve)
  throw new Error("--activate requires --approve in the same explicit command");

const csvFiles: Partial<Record<CatalogSheetName, string>> = {};
let fileSizeBytes = 0;
for (const sheet of catalogSheetNames) {
  const value = await readFile(resolve(sourceDirectory, `${sheet}.csv`), "utf8");
  csvFiles[sheet] = value;
  fileSizeBytes += Buffer.byteLength(value);
}
const parsed = parseCsvBundle(csvFiles);
const config = loadRuntimeConfig();
const pool = new Pool({
  host: config.database.host,
  port: config.database.port,
  database: config.database.database,
  user: config.database.user,
  password: config.database.password,
  max: 1,
  connectionTimeoutMillis: 5_000,
  ssl: false
});

try {
  const actor = await pool.query<{ role: string; enabled: boolean }>(
    "SELECT role, enabled FROM users WHERE id = $1",
    [actorId]
  );
  if (actor.rows[0]?.role !== "administrator" || !actor.rows[0].enabled) {
    throw new Error("Catalog seed actor must be an enabled administrator");
  }
  const repository = new PgCatalogAdminRepository(pool);
  const service = new CatalogAdminService(repository);
  const pipeline = await runCatalogPipelineForActiveScope(parsed, repository);
  if (!pipeline.report.valid) {
    throw new Error(
      `Canonical dataset is invalid: ${pipeline.report.counts.errors} errors, ${pipeline.report.counts.conflicts} conflicts`
    );
  }
  const correlationId = `catalog-seed-${pipeline.bundle.contentHash.slice(-16)}`;
  const draft = await repository.saveDraft({
    actorId,
    correlationId,
    fileName: "catalogue/imports/niedax-p0-2022/*.csv",
    mediaType: "text/csv-bundle",
    fileSizeBytes,
    parsed,
    pipeline
  });
  const validated = await service.validate({
    catalogVersionId: draft.id,
    actorId,
    actorRole: "administrator",
    correlationId
  });
  let status = validated.status;
  if (approve) {
    const approved = await service.approve({
      catalogVersionId: draft.id,
      actorId,
      actorRole: "administrator",
      correlationId,
      reason,
      contentHash: pipeline.bundle.contentHash
    });
    status = approved.status;
  }
  if (activate) {
    const active = await service.activate({
      catalogVersionId: draft.id,
      actorId,
      actorRole: "administrator",
      correlationId,
      reason,
      contentHash: pipeline.bundle.contentHash
    });
    status = active.status;
  }
  process.stdout.write(
    `${JSON.stringify(
      {
        catalogVersionId: draft.id,
        status,
        contentHash: pipeline.bundle.contentHash,
        counts: pipeline.report.counts,
        correlationId
      },
      null,
      2
    )}\n`
  );
} finally {
  await pool.end();
}
