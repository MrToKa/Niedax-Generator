import { createHash, randomUUID } from "node:crypto";

import {
  ExportArtifactV2Schema,
  type AppRole,
  type ExportArtifactV2,
  type ExportRequestV1
} from "@niedax/domain";
import {
  buildEnglishExportContextV3,
  EXCEL_RENDERER_VERSION,
  type WorkbookMapping
} from "@niedax/export";
import type { Pool, PoolClient } from "pg";

import { hasCapability, projectAccessScope } from "./authorization-policy.js";
import type { ExportReply, ExportRepository } from "./export-service.js";
import { XLSX_MEDIA_TYPE } from "./export-service.js";
import { ProjectApplicationError } from "./project-errors.js";
import {
  loadStoredDetail,
  revisionChecksum,
  type RevisionActor,
  type StoredRevisionV2Detail
} from "./revision-repository.js";

interface ArtifactRow {
  readonly id: string;
  readonly revision_id: string;
  readonly status: "pending" | "ready" | "failed";
  readonly created_at: Date;
  readonly content_hash: string | null;
  readonly content_length: number | null;
  readonly file_name: string | null;
  readonly failure_code: string | null;
}

const METADATA_COLUMNS =
  "artifact.id,artifact.revision_id,artifact.status,artifact.created_at,artifact.content_hash,artifact.content_length,artifact.file_name,artifact.failure_code";

function artifactDto(row: ArtifactRow, correlationId: string): ExportArtifactV2 {
  return ExportArtifactV2Schema.parse({
    schemaVersion: "export-artifact/v2",
    correlationId,
    exportId: row.id,
    revisionId: row.revision_id,
    status: row.status,
    format: "xlsx",
    language: "en",
    downloadPath: row.status === "ready" ? `/api/v1/exports/${row.id}/download` : null,
    contentHash: row.content_hash,
    contentLength: row.content_length,
    fileName: row.file_name,
    createdAt: row.created_at.toISOString(),
    failureCode: row.failure_code,
    expiresAt: null
  });
}

async function transaction<T>(
  pool: Pool,
  operation: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const value = await operation(client);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function currentActor(
  client: PoolClient,
  actor: RevisionActor,
  create: boolean
): Promise<RevisionActor> {
  const result = await client.query<{ role: AppRole; enabled: boolean }>(
    "SELECT role,enabled FROM users WHERE id = $1 FOR SHARE",
    [actor.id]
  );
  const user = result.rows[0];
  if (!user?.enabled)
    throw new ProjectApplicationError(401, "AUTHENTICATION_REQUIRED", "Authentication required");
  if (!hasCapability(user.role, create ? "export:create" : "export:read")) {
    throw new ProjectApplicationError(403, "FORBIDDEN", "The export action is not permitted");
  }
  return { ...actor, role: user.role };
}

async function readableRevision(client: PoolClient, actor: RevisionActor, revisionId: string) {
  const access = projectAccessScope(actor.role, "read");
  const result = await client.query<{
    project_id: string;
    snapshot_schema_version: string;
    input_fingerprint: string;
  }>(
    `SELECT revision.project_id,revision.snapshot_schema_version,revision.input_fingerprint
       FROM revisions revision JOIN projects project ON project.id = revision.project_id
      WHERE revision.id = $1 AND ($2::boolean OR project.owner_id = $3)
      FOR SHARE OF project,revision`,
    [revisionId, access === "all", actor.id]
  );
  const revision = result.rows[0];
  if (!revision) throw new ProjectApplicationError(404, "RESOURCE_NOT_FOUND", "Revision not found");
  return revision;
}

/** Recompute hashes only, never quantities; these are the exact Stage 8 checksum definitions. */
export function verifyExportRevisionEvidence(detail: StoredRevisionV2Detail): void {
  const { summary, snapshot, checksums } = detail;
  const input = snapshot.calculationInput;
  const result = snapshot.calculationResult;
  const expected = {
    projectChecksum: revisionChecksum(snapshot.project),
    inputChecksum: revisionChecksum(input),
    snapshotChecksum: revisionChecksum({
      project: snapshot.project,
      catalog: {
        schemaVersion: "catalog-revision-snapshot/v2",
        reference: input.catalogSnapshot,
        products: input.products,
        compatibilityRelations: input.compatibilityRelations
      },
      rules: {
        schemaVersion: "rule-template-revision-snapshot/v2",
        reference: input.ruleSnapshot,
        rules: input.rules,
        assemblyTemplates: input.assemblyTemplates
      }
    }),
    resultChecksum: revisionChecksum(result),
    bomChecksum: revisionChecksum(result.bomLines),
    warningsChecksum: revisionChecksum(result.warnings)
  };
  const revisionHash = revisionChecksum({
    schemaVersion: "revision-snapshot/v2",
    projectId: summary.projectId,
    revisionNumber: summary.revisionNumber,
    name: summary.name,
    comment: summary.comment,
    author: summary.authorSnapshot,
    createdAt: summary.createdAt,
    sourceDraftVersion: summary.sourceDraftVersion,
    calculationRunId: summary.calculationRunId,
    inputFingerprint: summary.inputFingerprint,
    engineVersion: summary.engineVersion,
    catalogSnapshot: summary.catalogSnapshot,
    ruleSnapshot: summary.ruleSnapshot,
    approvalReady: summary.approvalReady,
    warningSummary: summary.warningSummary,
    ...expected
  });
  if (
    Object.entries(expected).some(
      ([key, value]) => checksums[key as keyof typeof expected] !== value
    ) ||
    checksums.revisionChecksum !== revisionHash ||
    result.inputFingerprint !== summary.inputFingerprint
  ) {
    throw new ProjectApplicationError(
      500,
      "EXPORT_FAILED",
      "Saved revision integrity verification failed"
    );
  }
}

export class PgExportRepository implements ExportRepository {
  public constructor(private readonly pool: Pool) {}

  public async request(
    actor: RevisionActor,
    request: ExportRequestV1,
    mapping: WorkbookMapping | null
  ): Promise<ExportReply> {
    return transaction(this.pool, async (client) => {
      const actualActor = await currentActor(client, actor, true);
      const revision = await readableRevision(client, actualActor, request.revisionId);
      const scope = `export.create:${request.revisionId}:${actor.id}`;
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [scope]);
      const requestHash = revisionChecksum({
        revisionId: request.revisionId,
        inputFingerprint: request.inputFingerprint,
        format: request.format,
        language: request.language,
        schemaVersion: request.schemaVersion
      });
      const existing = await client.query<{
        request_hash: string;
        response_status: number;
        response_payload: unknown;
      }>(
        "SELECT request_hash,response_status,response_payload FROM idempotency_records WHERE scope=$1 AND idempotency_key=$2",
        [scope, request.idempotencyKey]
      );
      const replay = existing.rows[0];
      if (replay) {
        if (replay.request_hash !== requestHash)
          throw new ProjectApplicationError(
            409,
            "IDEMPOTENCY_KEY_CONFLICT",
            "The idempotency key was already used for different request content"
          );
        return {
          statusCode: replay.response_status,
          body: ExportArtifactV2Schema.parse(replay.response_payload),
          replayed: true
        };
      }
      if (revision.snapshot_schema_version !== "revision-snapshot/v2") {
        throw new ProjectApplicationError(
          422,
          "UNSUPPORTED_SCHEMA_VERSION",
          "This saved revision version has no lossless Excel export mapping"
        );
      }
      if (revision.input_fingerprint !== request.inputFingerprint) {
        throw new ProjectApplicationError(
          409,
          "CONFLICT_STALE_VERSION",
          "The saved revision fingerprint does not match"
        );
      }
      if (!mapping)
        throw new ProjectApplicationError(
          503,
          "EXPORT_FAILED",
          "The approved Change Order template and column mapping are unavailable"
        );
      const detail = await loadStoredDetail(client, request.revisionId);
      verifyExportRevisionEvidence(detail);
      const capturedAt = new Date().toISOString();
      const context = buildEnglishExportContextV3({
        schemaVersion: "english-export-context/v3",
        language: "en",
        capturedAt,
        revision: {
          id: detail.summary.id,
          projectId: detail.summary.projectId,
          revisionNumber: detail.summary.revisionNumber,
          name: detail.summary.name,
          comment: detail.summary.comment,
          authorSnapshot: detail.summary.authorSnapshot,
          createdAt: detail.summary.createdAt,
          sourceDraftVersion: detail.summary.sourceDraftVersion,
          status: detail.summary.status,
          checkedAt: detail.summary.checkedAt,
          approvedAt: detail.summary.approvedAt
        },
        snapshot: detail.snapshot,
        checksums: detail.checksums,
        lifecycle: detail.lifecycleEvents
          .filter((event) => event.outcome === "succeeded")
          .map((event) => ({
            action: event.action,
            occurredAt: event.occurredAt,
            actorSnapshot: event.actorSnapshot,
            comment: event.comment,
            priorStatus: event.priorStatus,
            resultingStatus: event.resultingStatus
          })),
        versions: {
          templateId: mapping.templateId,
          templateSha256: mapping.templateSha256,
          mappingVersion: mapping.mappingVersion,
          rendererVersion: EXCEL_RENDERER_VERSION
        }
      });
      const cacheIdentity = revisionChecksum({
        revision: context.revision,
        checksums: context.checksums,
        lifecycle: context.lifecycle,
        format: request.format,
        language: request.language,
        versions: context.versions
      });
      // Different actors must also serialize the shared evidence cache after source authorization.
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        `export.cache:${cacheIdentity}`
      ]);
      const cached = await client.query<ArtifactRow>(
        `SELECT ${METADATA_COLUMNS} FROM export_artifacts artifact WHERE revision_id=$1 AND cache_identity=$2
          AND status IN ('pending','ready')`,
        [request.revisionId, cacheIdentity]
      );
      let row = cached.rows[0];
      if (!row) {
        const created = await client.query<ArtifactRow>(
          `INSERT INTO export_artifacts (revision_id,requested_by,correlation_id,cache_identity,context_payload,created_at)
            VALUES ($1,$2,$3,$4,$5,$6) RETURNING id,revision_id,status,created_at,content_hash,content_length,file_name,failure_code`,
          [request.revisionId, actor.id, request.correlationId, cacheIdentity, context, capturedAt]
        );
        row = created.rows[0];
      }
      if (!row) throw new Error("Export insertion returned no artifact");
      const body = artifactDto(row, request.correlationId);
      const statusCode = row.status === "ready" ? 200 : 202;
      await client.query(
        `INSERT INTO idempotency_records
        (scope,idempotency_key,request_hash,resource_type,resource_id,response_status,response_schema_version,response_payload)
        VALUES ($1,$2,$3,'export',$4,$5,$6,$7)`,
        [scope, request.idempotencyKey, requestHash, row.id, statusCode, body.schemaVersion, body]
      );
      return { statusCode, body, replayed: false };
    });
  }

  public async list(actor: RevisionActor, revisionId: string, correlationId: string) {
    return transaction(this.pool, async (client) => {
      const actualActor = await currentActor(client, actor, false);
      const revision = await readableRevision(client, actualActor, revisionId);
      const result = await client.query<ArtifactRow>(
        `SELECT ${METADATA_COLUMNS}
        FROM export_artifacts artifact WHERE revision_id=$1 ORDER BY created_at DESC,id DESC LIMIT 20`,
        [revisionId]
      );
      return {
        supported: revision.snapshot_schema_version === "revision-snapshot/v2",
        canCreate: hasCapability(actualActor.role, "export:create"),
        artifacts: result.rows.map((row) => artifactDto(row, correlationId))
      };
    });
  }

  private async read(
    client: PoolClient,
    actor: RevisionActor,
    exportId: string,
    correlationId: string
  ) {
    const actualActor = await currentActor(client, actor, false);
    const result = await client.query<ArtifactRow>(
      `SELECT ${METADATA_COLUMNS} FROM export_artifacts artifact WHERE id=$1`,
      [exportId]
    );
    const row = result.rows[0];
    if (!row) throw new ProjectApplicationError(404, "RESOURCE_NOT_FOUND", "Export not found");
    try {
      await readableRevision(client, actualActor, row.revision_id);
    } catch (error) {
      if (error instanceof ProjectApplicationError && error.statusCode === 404) {
        throw new ProjectApplicationError(404, "RESOURCE_NOT_FOUND", "Export not found");
      }
      throw error;
    }
    return artifactDto(row, correlationId);
  }

  public async get(actor: RevisionActor, exportId: string, correlationId: string) {
    return transaction(this.pool, (client) => this.read(client, actor, exportId, correlationId));
  }

  public async download(actor: RevisionActor, exportId: string, correlationId: string) {
    return transaction(this.pool, async (client) => {
      const artifact = await this.read(client, actor, exportId, correlationId);
      if (artifact.status === "pending")
        throw new ProjectApplicationError(
          409,
          "INVALID_STATE_TRANSITION",
          "The export is still being prepared"
        );
      if (artifact.status === "failed")
        throw new ProjectApplicationError(
          500,
          "EXPORT_FAILED",
          "The export could not be generated"
        );
      const result = await client.query<{ content_bytes: Buffer }>(
        "SELECT content_bytes FROM export_artifacts WHERE id=$1 AND status='ready'",
        [exportId]
      );
      const bytes = result.rows[0]?.content_bytes;
      if (!bytes)
        throw new ProjectApplicationError(500, "EXPORT_FAILED", "The ready export is unavailable");
      return { artifact, bytes };
    });
  }

  public async claim() {
    return transaction(this.pool, async (client) => {
      // Exhausted leases are finalized in bounded batches so a crash never leaves jobs pending forever.
      await client.query(`UPDATE export_artifacts SET status='failed',failure_code='RECOVERY_EXHAUSTED',
        completed_at=now(),claim_token=NULL,lease_until=NULL WHERE id IN
        (SELECT id FROM export_artifacts WHERE status='pending' AND attempts>=3
          AND (lease_until IS NULL OR lease_until<now()) ORDER BY created_at,id LIMIT 4 FOR UPDATE SKIP LOCKED)`);
      const token = randomUUID();
      const result = await client.query<{ id: string; context_payload: unknown }>(
        `UPDATE export_artifacts SET attempts=attempts+1,claim_token=$1,lease_until=now()+interval '2 minutes'
         WHERE id=(SELECT id FROM export_artifacts WHERE status='pending' AND attempts<3
           AND (lease_until IS NULL OR lease_until<now()) ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED)
         RETURNING id,context_payload`,
        [token]
      );
      const row = result.rows[0];
      return row ? { exportId: row.id, claimToken: token, context: row.context_payload } : null;
    });
  }

  public async finalize(
    exportId: string,
    claimToken: string,
    bytes: Buffer,
    fileName: string
  ): Promise<void> {
    await this.pool.query(
      `UPDATE export_artifacts SET status='ready',completed_at=now(),
      content_bytes=$3,content_length=$4,content_hash=$5,file_name=$6,media_type=$7,claim_token=NULL,lease_until=NULL
      WHERE id=$1 AND claim_token=$2 AND status='pending'`,
      [
        exportId,
        claimToken,
        bytes,
        bytes.length,
        `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
        fileName,
        XLSX_MEDIA_TYPE
      ]
    );
  }

  public async failAttempt(exportId: string, claimToken: string): Promise<void> {
    await this.pool.query(
      `UPDATE export_artifacts SET
      status=CASE WHEN attempts>=3 THEN 'failed' ELSE 'pending' END,
      completed_at=CASE WHEN attempts>=3 THEN now() ELSE NULL END,
      failure_code=CASE WHEN attempts>=3 THEN 'RENDER_FAILED' ELSE NULL END,
      claim_token=NULL,lease_until=NULL WHERE id=$1 AND claim_token=$2 AND status='pending'`,
      [exportId, claimToken]
    );
  }
}
