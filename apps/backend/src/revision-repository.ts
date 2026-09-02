import { createHash } from "node:crypto";

import {
  CalculationInputV1Schema,
  CalculationInputV2Schema,
  CalculationResultV2Schema,
  ProjectDraftInputV2Schema,
  ProjectRevisionDetailV2Schema,
  ProjectRevisionResponseV2Schema,
  ProjectRevisionSnapshotV2Schema,
  ProjectRevisionSummaryV2Schema,
  ProjectV2Schema,
  RetainedProjectRevisionDetailV1Schema,
  RetainedProjectRevisionSummaryV1Schema,
  RevisionActorSnapshotV2Schema,
  RevisionLifecycleEventV2Schema,
  RevisionV1Schema,
  RevisionWarningSummaryV2Schema,
  type AppRole,
  type ApproveProjectRevisionRequestV2,
  type CheckProjectRevisionRequestV2,
  type ProjectRevisionActionsV2,
  type ProjectRevisionDetailV2,
  type ProjectRevisionResponseV2,
  type ProjectRevisionSummaryV2,
  type RetainedProjectRevisionDetailV1,
  type RetainedProjectRevisionSummaryV1,
  type RevisionActorSnapshotV2,
  type RevisionLifecycleEventV2,
  type SaveProjectRevisionRequestV2
} from "@niedax/domain";
import type { Pool, PoolClient } from "pg";

import { hasCapability, projectAccessScope } from "./authorization-policy.js";
import { ProjectApplicationError } from "./project-errors.js";

type JsonRecord = Record<string, unknown>;

export interface RevisionActor {
  readonly id: string;
  readonly username: string;
  readonly displayName: string;
  readonly role: AppRole;
}

export type StoredRevisionV2Summary = Omit<ProjectRevisionSummaryV2, "actions">;
export type StoredRevisionSummary = StoredRevisionV2Summary | RetainedProjectRevisionSummaryV1;

export interface StoredRevisionV2Detail {
  readonly summary: StoredRevisionV2Summary;
  readonly snapshot: ProjectRevisionDetailV2["snapshot"];
  readonly checksums: ProjectRevisionDetailV2["checksums"];
  readonly lifecycleEvents: readonly RevisionLifecycleEventV2[];
}

export type StoredRevisionDetail = StoredRevisionV2Detail | RetainedProjectRevisionDetailV1;

export interface RevisionMutationResult {
  readonly statusCode: number;
  readonly response: ProjectRevisionResponseV2;
  readonly replayed: boolean;
}

interface RejectedTransitionResult {
  readonly rejection: ProjectApplicationError;
}

type RejectedTransitionReason = "FORBIDDEN" | "CONFLICT_STALE_VERSION" | "INVALID_STATE_TRANSITION";

export type RevisionResponseFactory = (detail: StoredRevisionV2Detail) => ProjectRevisionResponseV2;

interface ProjectSnapshotRow {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly status: "draft" | "calculated" | "checked" | "approved" | "archived";
  readonly default_locale: "bg" | "en";
  readonly default_spare_percent: string;
  readonly cable_load_kg_per_m: string | null;
  readonly draft_version: number;
  readonly owner_id: string | null;
  readonly owner_display_name: string | null;
  readonly active_catalog_version_id: string;
  readonly active_rule_set_id: string;
  readonly created_at: Date;
  readonly updated_at: Date;
  readonly document_payload: unknown;
}

interface CalculationRow {
  readonly id: string;
  readonly calculated_draft_version: number;
  readonly input_fingerprint: string;
  readonly engine_version: string;
  readonly catalog_version_id: string;
  readonly catalog_snapshot_version: string;
  readonly catalog_snapshot_content_hash: string;
  readonly rule_set_id: string;
  readonly rule_snapshot_version: string;
  readonly rule_snapshot_content_hash: string;
  readonly input_payload: unknown;
  readonly result_payload: unknown;
}

interface RevisionRow {
  readonly id: string;
  readonly project_id: string;
  readonly revision_number: number;
  readonly name: string;
  readonly comment: string | null;
  readonly status: "calculated" | "checked" | "approved" | "archived";
  readonly engine_version: string;
  readonly input_fingerprint: string;
  readonly calculation_run_id: string;
  readonly source_draft_version: number;
  readonly catalog_snapshot_id: string;
  readonly catalog_snapshot_version: string;
  readonly catalog_snapshot_content_hash: string;
  readonly rule_snapshot_id: string;
  readonly rule_snapshot_version: string;
  readonly rule_snapshot_content_hash: string;
  readonly approval_ready: boolean;
  readonly warning_summary: unknown;
  readonly created_by: string;
  readonly created_by_snapshot: unknown;
  readonly created_at: Date;
  readonly checked_at: Date | null;
  readonly approved_at: Date | null;
  readonly project_checksum: string;
  readonly input_checksum: string;
  readonly snapshot_checksum: string;
  readonly result_checksum: string;
  readonly bom_checksum: string;
  readonly warnings_checksum: string;
  readonly revision_checksum: string;
  readonly project_snapshot: unknown;
  readonly input_snapshot: unknown;
  readonly calculation_result_snapshot: unknown;
  readonly latest_revision_number: number | null;
}

interface RetainedRevisionRow {
  readonly id: string;
  readonly project_id: string;
  readonly revision_number: number;
  readonly name: string | null;
  readonly description: string | null;
  readonly status: "calculated" | "checked" | "approved" | "archived";
  readonly engine_version: string;
  readonly input_fingerprint: string;
  readonly input_checksum: string;
  readonly snapshot_checksum: string;
  readonly bom_checksum: string;
  readonly input_snapshot: unknown;
  readonly calculation_result_snapshot: unknown;
  readonly created_by: string | null;
  readonly created_by_snapshot: unknown;
  readonly created_at: Date;
  readonly checked_at: Date | null;
  readonly approved_at: Date | null;
  readonly latest_revision_number: number | null;
}

interface LifecycleRow {
  readonly id: string;
  readonly project_id: string;
  readonly revision_id: string;
  readonly action:
    | "revision.saved"
    | "revision.checked"
    | "revision.approved"
    | "revision.archived"
    | "revision.authorization_rejected"
    | "revision.transition_rejected";
  readonly outcome: "succeeded" | "rejected";
  readonly actor_id: string | null;
  readonly actor_snapshot: unknown;
  readonly created_at: Date;
  readonly correlation_id: string;
  readonly prior_status: "calculated" | "checked" | "approved" | "archived" | null;
  readonly resulting_status: "calculated" | "checked" | "approved" | "archived" | null;
  readonly reason_code: string | null;
  readonly comment: string | null;
  readonly input_fingerprint: string;
  readonly engine_version: string;
}

interface AuditLifecycleRow extends LifecycleRow {
  readonly catalog_snapshot_id: string;
  readonly catalog_snapshot_version: string;
  readonly catalog_snapshot_content_hash: string;
  readonly rule_snapshot_id: string;
  readonly rule_snapshot_version: string;
  readonly rule_snapshot_content_hash: string;
}

interface RejectionTargetRow {
  readonly project_id: string;
  readonly status: "calculated" | "checked" | "approved" | "archived";
  readonly input_fingerprint: string;
  readonly engine_version: string;
  readonly catalog_snapshot_id: string;
  readonly rule_snapshot_id: string;
}

interface IdempotencyRow {
  readonly request_hash: string;
  readonly response_status: number;
  readonly response_payload: unknown;
}

function asIso(value: Date): string {
  return value.toISOString();
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  const record = value as JsonRecord;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
    .join(",")}}`;
}

export function revisionChecksum(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalize(value), "utf8").digest("hex")}`;
}

async function inTransaction<T>(
  pool: Pool,
  operation: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function lockIdempotencyScope(client: PoolClient, scope: string): Promise<void> {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [scope]);
}

async function replay(
  client: PoolClient,
  scope: string,
  key: string,
  requestHash: string
): Promise<RevisionMutationResult | null> {
  const result = await client.query<IdempotencyRow>(
    `SELECT request_hash,response_status,response_payload
       FROM idempotency_records
      WHERE scope = $1 AND idempotency_key = $2`,
    [scope, key]
  );
  const existing = result.rows[0];
  if (!existing) return null;
  if (existing.request_hash !== requestHash) {
    throw new ProjectApplicationError(
      409,
      "IDEMPOTENCY_KEY_CONFLICT",
      "The idempotency key was already used for different request content"
    );
  }
  if (existing.response_payload === null) {
    throw new ProjectApplicationError(
      500,
      "INTERNAL_ERROR",
      "The stored idempotency result is incomplete"
    );
  }
  return {
    statusCode: existing.response_status,
    response: ProjectRevisionResponseV2Schema.parse(existing.response_payload),
    replayed: true
  };
}

async function recordIdempotency(
  client: PoolClient,
  input: {
    readonly scope: string;
    readonly key: string;
    readonly requestHash: string;
    readonly revisionId: string;
    readonly statusCode: number;
    readonly response: ProjectRevisionResponseV2;
  }
): Promise<void> {
  await client.query(
    `INSERT INTO idempotency_records (
       scope,idempotency_key,request_hash,resource_type,resource_id,response_status,
       response_schema_version,response_payload
     ) VALUES ($1,$2,$3,'revision',$4,$5,$6,$7)`,
    [
      input.scope,
      input.key,
      input.requestHash,
      input.revisionId,
      input.statusCode,
      input.response.schemaVersion,
      input.response
    ]
  );
}

function actorSnapshot(actor: RevisionActor): RevisionActorSnapshotV2 {
  return RevisionActorSnapshotV2Schema.parse({
    id: actor.id,
    username: actor.username,
    displayName: actor.displayName,
    role: actor.role
  });
}

function storedLifecycleActorSnapshot(value: unknown): RevisionActorSnapshotV2 | null {
  const parsed = RevisionActorSnapshotV2Schema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function draftFromPayload(payload: unknown): ReturnType<typeof ProjectDraftInputV2Schema.parse> {
  if (!payload || typeof payload !== "object" || !("draft" in payload)) {
    throw new ProjectApplicationError(
      422,
      "UNSUPPORTED_SCHEMA_VERSION",
      "The project does not have a supported Stage 7 draft snapshot"
    );
  }
  return ProjectDraftInputV2Schema.parse((payload as { readonly draft: unknown }).draft);
}

function projectSnapshot(row: ProjectSnapshotRow) {
  const draft = draftFromPayload(row.document_payload);
  return ProjectV2Schema.parse({
    id: row.id,
    ownerId: row.owner_id,
    ownerDisplayName: row.owner_display_name,
    status: row.status,
    draftVersion: row.draft_version,
    createdAt: asIso(row.created_at),
    updatedAt: asIso(row.updated_at),
    ...draft
  });
}

async function lockWritableProject(
  client: PoolClient,
  projectId: string,
  actor: RevisionActor
): Promise<ProjectSnapshotRow> {
  const access = projectAccessScope(actor.role, "saveRevision");
  if (access === "none") {
    throw new ProjectApplicationError(403, "FORBIDDEN", "Revision save is forbidden");
  }
  const result = await client.query<ProjectSnapshotRow>(
    `SELECT project.id,project.code,project.name,project.description,project.status,
            project.default_locale,project.default_spare_percent::text,
            project.cable_load_kg_per_m::text,project.draft_version,project.owner_id,
            owner.display_name AS owner_display_name,project.active_catalog_version_id,
            project.active_rule_set_id,project.created_at,project.updated_at,
            document.payload AS document_payload
       FROM projects project
       LEFT JOIN users owner ON owner.id = project.owner_id
      LEFT JOIN project_draft_documents document ON document.project_id = project.id
      WHERE project.id = $1
        AND ($2::boolean OR ($3::boolean AND project.owner_id = $4))
      FOR UPDATE OF project`,
    [projectId, access === "all", access === "owned", actor.id]
  );
  const project = result.rows[0];
  if (!project) {
    throw new ProjectApplicationError(404, "RESOURCE_NOT_FOUND", "Project not found");
  }
  return project;
}

async function requireReadableProject(
  client: PoolClient,
  projectId: string,
  actor: RevisionActor
): Promise<void> {
  const access = projectAccessScope(actor.role, "readHistory");
  if (access === "none") {
    throw new ProjectApplicationError(403, "FORBIDDEN", "Revision history is forbidden");
  }
  const result = await client.query(
    `SELECT 1
       FROM projects
      WHERE id = $1
        AND ($2::boolean OR ($3::boolean AND owner_id = $4))`,
    [projectId, access === "all", access === "owned", actor.id]
  );
  if (result.rowCount !== 1) {
    throw new ProjectApplicationError(404, "RESOURCE_NOT_FOUND", "Project not found");
  }
}

function warningSummary(result: ReturnType<typeof CalculationResultV2Schema.parse>) {
  return RevisionWarningSummaryV2Schema.parse({
    totalCount: result.warnings.length,
    blocksApprovalCount: result.warnings.filter(
      (warning) => warning.approvalImpact === "blocksApproval"
    ).length,
    reviewRequiredCount: result.warnings.filter(
      (warning) => warning.approvalImpact === "reviewRequired"
    ).length
  });
}

function summaryFromRow(row: RevisionRow): StoredRevisionV2Summary {
  return {
    recordVersion: "revision/v2",
    id: row.id,
    projectId: row.project_id,
    revisionNumber: row.revision_number,
    name: row.name,
    comment: row.comment,
    authorId: row.created_by,
    authorSnapshot: RevisionActorSnapshotV2Schema.parse(row.created_by_snapshot),
    createdAt: asIso(row.created_at),
    status: row.status,
    inputFingerprint: row.input_fingerprint,
    engineVersion: row.engine_version,
    calculationRunId: row.calculation_run_id,
    sourceDraftVersion: row.source_draft_version,
    catalogSnapshot: {
      snapshotId: row.catalog_snapshot_id,
      version: row.catalog_snapshot_version,
      contentHash: row.catalog_snapshot_content_hash
    },
    ruleSnapshot: {
      snapshotId: row.rule_snapshot_id,
      version: row.rule_snapshot_version,
      contentHash: row.rule_snapshot_content_hash
    },
    checkedAt: row.checked_at ? asIso(row.checked_at) : null,
    approvedAt: row.approved_at ? asIso(row.approved_at) : null,
    approvalReady: row.approval_ready,
    warningSummary: RevisionWarningSummaryV2Schema.parse(row.warning_summary),
    isLatest: row.revision_number === row.latest_revision_number
  };
}

const RETAINED_ACTIONS = {
  check: { allowed: false, reason: "unsupportedVersion" },
  approve: { allowed: false, reason: "unsupportedVersion" }
} as const;

function retainedAuthorDisplayName(snapshot: unknown): string | null {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return null;
  const displayName = (snapshot as JsonRecord).displayName;
  return typeof displayName === "string" && displayName.trim().length >= 2
    ? displayName.slice(0, 100)
    : null;
}

function retainedSummaryFromRow(row: RetainedRevisionRow): RetainedProjectRevisionSummaryV1 {
  const retainedComment = row.description?.trim() || null;
  return RetainedProjectRevisionSummaryV1Schema.parse({
    recordVersion: "revision/v1",
    id: row.id,
    projectId: row.project_id,
    revisionNumber: row.revision_number,
    name: row.name && row.name.trim() ? row.name : null,
    comment: retainedComment === null ? null : retainedComment.slice(0, 10_000),
    commentTruncated: retainedComment !== null && retainedComment.length > 10_000,
    authorId: row.created_by,
    authorDisplayName: retainedAuthorDisplayName(row.created_by_snapshot),
    createdAt: asIso(row.created_at),
    status: row.status,
    inputFingerprint: row.input_fingerprint,
    engineVersion: row.engine_version,
    checkedAt: row.checked_at ? asIso(row.checked_at) : null,
    approvedAt: row.approved_at ? asIso(row.approved_at) : null,
    isLatest: row.revision_number === row.latest_revision_number,
    actions: RETAINED_ACTIONS
  });
}

const REVISION_SELECT = `
  SELECT revision.id,revision.project_id,revision.revision_number,revision.name,
         revision.comment,revision.status,revision.engine_version,revision.input_fingerprint,
         revision.calculation_run_id,revision.source_draft_version,
         revision.catalog_snapshot_id,revision.catalog_snapshot_version,
         revision.catalog_snapshot_content_hash,revision.rule_snapshot_id,
         revision.rule_snapshot_version,revision.rule_snapshot_content_hash,
         revision.approval_ready,revision.warning_summary,revision.created_by,
         revision.created_by_snapshot,revision.created_at,revision.checked_at,
         revision.approved_at,revision.project_checksum,revision.input_checksum,
         revision.snapshot_checksum,revision.result_checksum,revision.bom_checksum,
         revision.warnings_checksum,revision.revision_checksum,revision.project_snapshot,
         revision.input_snapshot,revision.calculation_result_snapshot,
         (SELECT max(latest.revision_number) FROM revisions latest
           WHERE latest.project_id = revision.project_id
             AND latest.status <> 'archived')::integer
           AS latest_revision_number
    FROM revisions revision`;

const RETAINED_REVISION_SELECT = `
  SELECT revision.id,revision.project_id,revision.revision_number,revision.name,
         revision.description,revision.status,revision.engine_version,revision.input_fingerprint,
         revision.input_checksum,revision.snapshot_checksum,revision.bom_checksum,
         revision.input_snapshot,revision.calculation_result_snapshot,revision.created_by,
         revision.created_by_snapshot,revision.created_at,revision.checked_at,revision.approved_at,
         (SELECT max(latest.revision_number) FROM revisions latest
           WHERE latest.project_id = revision.project_id
             AND latest.status <> 'archived')::integer
           AS latest_revision_number
    FROM revisions revision`;

async function loadLifecycleEvents(
  client: PoolClient,
  summary: StoredRevisionV2Summary
): Promise<readonly RevisionLifecycleEventV2[]> {
  const result = await client.query<LifecycleRow>(
    `SELECT id,project_id,revision_id,action,outcome,actor_id,actor_snapshot,created_at,
            correlation_id,prior_status,resulting_status,reason_code,comment,
            input_fingerprint,engine_version
       FROM revision_lifecycle_events
      WHERE revision_id = $1
        AND (
          outcome = 'succeeded'
          OR id IN (
            SELECT rejected.id
              FROM revision_lifecycle_events rejected
             WHERE rejected.revision_id = $1 AND rejected.outcome = 'rejected'
             ORDER BY rejected.created_at DESC,rejected.id DESC
             LIMIT greatest(
               0,
               100 - (
                 SELECT count(*)::integer
                   FROM revision_lifecycle_events succeeded
                  WHERE succeeded.revision_id = $1 AND succeeded.outcome = 'succeeded'
               )
             )
          )
        )
      ORDER BY created_at,id
      `,
    [summary.id]
  );
  return result.rows.map((row) =>
    RevisionLifecycleEventV2Schema.parse({
      schemaVersion: "revision-lifecycle-event/v2",
      id: row.id,
      projectId: row.project_id,
      revisionId: row.revision_id,
      action: row.action,
      outcome: row.outcome,
      actorId: row.actor_id,
      actorSnapshot: storedLifecycleActorSnapshot(row.actor_snapshot),
      occurredAt: asIso(row.created_at),
      correlationId: row.correlation_id,
      priorStatus: row.prior_status,
      resultingStatus: row.resulting_status,
      reasonCode: row.reason_code,
      comment: row.comment,
      inputFingerprint: row.input_fingerprint,
      engineVersion: row.engine_version,
      catalogSnapshot: summary.catalogSnapshot,
      ruleSnapshot: summary.ruleSnapshot
    })
  );
}

async function loadStoredDetail(
  client: PoolClient,
  revisionId: string
): Promise<StoredRevisionV2Detail> {
  const result = await client.query<RevisionRow>(
    `${REVISION_SELECT}
      WHERE revision.id = $1 AND revision.snapshot_schema_version = 'revision-snapshot/v2'`,
    [revisionId]
  );
  const row = result.rows[0];
  if (!row) throw new ProjectApplicationError(404, "RESOURCE_NOT_FOUND", "Revision not found");
  const summary = summaryFromRow(row);
  return {
    summary,
    snapshot: ProjectRevisionSnapshotV2Schema.parse({
      schemaVersion: "project-revision-snapshot/v2",
      project: row.project_snapshot,
      calculationInput: row.input_snapshot,
      calculationResult: row.calculation_result_snapshot
    }),
    checksums: {
      projectChecksum: row.project_checksum,
      inputChecksum: row.input_checksum,
      snapshotChecksum: row.snapshot_checksum,
      resultChecksum: row.result_checksum,
      bomChecksum: row.bom_checksum,
      warningsChecksum: row.warnings_checksum,
      revisionChecksum: row.revision_checksum
    },
    lifecycleEvents: await loadLifecycleEvents(client, summary)
  };
}

async function loadRetainedDetail(
  client: PoolClient,
  revisionId: string
): Promise<RetainedProjectRevisionDetailV1> {
  const result = await client.query<RetainedRevisionRow>(
    `${RETAINED_REVISION_SELECT}
      WHERE revision.id = $1 AND revision.snapshot_schema_version = 'revision-snapshot/v1'`,
    [revisionId]
  );
  const row = result.rows[0];
  if (!row) throw new ProjectApplicationError(404, "RESOURCE_NOT_FOUND", "Revision not found");
  const summary = retainedSummaryFromRow(row);
  const inputSnapshot = CalculationInputV1Schema.parse(row.input_snapshot);
  const calculationResult = RevisionV1Schema.shape.calculationResult.parse(
    row.calculation_result_snapshot
  );
  return RetainedProjectRevisionDetailV1Schema.parse({
    recordVersion: "revision/v1",
    summary,
    revision: RevisionV1Schema.parse({
      schemaVersion: "revision/v1",
      revisionId: row.id,
      revisionNumber: row.revision_number,
      projectId: row.project_id,
      status: row.status,
      inputFingerprint: row.input_fingerprint,
      calculationResult,
      createdAt: asIso(row.created_at),
      checkedAt: row.checked_at ? asIso(row.checked_at) : null,
      approvedAt: row.approved_at ? asIso(row.approved_at) : null
    }),
    inputSnapshot,
    checksums: {
      inputChecksum: row.input_checksum,
      snapshotChecksum: row.snapshot_checksum,
      bomChecksum: row.bom_checksum
    }
  });
}

async function insertLifecycleEvent(
  client: PoolClient,
  input: {
    readonly projectId: string;
    readonly revisionId: string;
    readonly action: "revision.saved" | "revision.checked" | "revision.approved";
    readonly actor: RevisionActor;
    readonly priorStatus: "calculated" | "checked" | null;
    readonly resultingStatus: "calculated" | "checked" | "approved";
    readonly correlationId: string;
    readonly comment: string | null;
    readonly inputFingerprint: string;
    readonly engineVersion: string;
    readonly catalogSnapshotId: string;
    readonly ruleSnapshotId: string;
    readonly occurredAt: string;
    readonly metadata: JsonRecord;
  }
): Promise<void> {
  await client.query(
    `INSERT INTO revision_lifecycle_events (
       schema_version,project_id,revision_id,action,actor_id,actor_role,actor_snapshot,
       prior_status,resulting_status,correlation_id,comment,reason_code,input_fingerprint,
       engine_version,catalog_snapshot_id,rule_snapshot_id,outcome,metadata,created_at
     ) VALUES (
       'revision-lifecycle-event/v2',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NULL,$11,$12,$13,$14,
       'succeeded',$15,$16
     )`,
    [
      input.projectId,
      input.revisionId,
      input.action,
      input.actor.id,
      input.actor.role,
      actorSnapshot(input.actor),
      input.priorStatus,
      input.resultingStatus,
      input.correlationId,
      input.comment,
      input.inputFingerprint,
      input.engineVersion,
      input.catalogSnapshotId,
      input.ruleSnapshotId,
      input.metadata,
      input.occurredAt
    ]
  );
}

function staleError(
  expected: string | number,
  actual: string | number | null,
  message: string
): ProjectApplicationError {
  return new ProjectApplicationError(409, "CONFLICT_STALE_VERSION", message, {
    kind: "conflict",
    expectedVersion: String(expected),
    actualVersion: actual === null ? null : String(actual)
  });
}

function stale(expected: string | number, actual: string | number | null, message: string): never {
  throw staleError(expected, actual, message);
}

async function insertRejectedAttempt(
  client: PoolClient,
  input: {
    readonly actor: RevisionActor;
    readonly revisionId: string;
    readonly requestedAction: "revision.checked" | "revision.approved";
    readonly reasonCode: RejectedTransitionReason;
    readonly correlationId: string;
    readonly attemptHash: string;
    readonly requestHash: string;
    readonly revision: RejectionTargetRow;
  }
): Promise<void> {
  await client.query(
    `INSERT INTO revision_lifecycle_events (
       schema_version,project_id,revision_id,action,actor_id,actor_role,actor_snapshot,
       prior_status,resulting_status,correlation_id,comment,reason_code,input_fingerprint,
       engine_version,catalog_snapshot_id,rule_snapshot_id,outcome,metadata,
       attempt_hash,request_hash
     ) VALUES (
       'revision-lifecycle-event/v2',$1,$2,$3,$4,$5,$6,$7,NULL,$8,NULL,$9,$10,$11,$12,$13,
       'rejected',$14,$15,$16
     )
     ON CONFLICT (revision_id,actor_id,attempt_hash) WHERE outcome = 'rejected'
     DO NOTHING`,
    [
      input.revision.project_id,
      input.revisionId,
      input.reasonCode === "FORBIDDEN"
        ? "revision.authorization_rejected"
        : "revision.transition_rejected",
      input.actor.id,
      input.actor.role,
      actorSnapshot(input.actor),
      input.revision.status,
      input.correlationId,
      input.reasonCode,
      input.revision.input_fingerprint,
      input.revision.engine_version,
      input.revision.catalog_snapshot_id,
      input.revision.rule_snapshot_id,
      { requestedAction: input.requestedAction },
      input.attemptHash,
      input.requestHash
    ]
  );
}

export class PgRevisionRepository {
  public constructor(private readonly pool: Pool) {}

  public async listRevisions(
    projectId: string,
    actor: RevisionActor,
    limit = 100,
    cursor: string | null = null
  ): Promise<readonly StoredRevisionSummary[]> {
    const client = await this.pool.connect();
    try {
      await requireReadableProject(client, projectId, actor);
      const result = await client.query<RevisionRow>(
        `${REVISION_SELECT}
          WHERE revision.project_id = $1
            AND revision.snapshot_schema_version = 'revision-snapshot/v2'
            AND (
              $2::uuid IS NULL
              OR revision.revision_number < (
                SELECT cursor_revision.revision_number
                  FROM revisions cursor_revision
                 WHERE cursor_revision.id = $2 AND cursor_revision.project_id = $1
              )
            )
          ORDER BY revision.revision_number DESC
          LIMIT $3`,
        [projectId, cursor, limit]
      );
      const retained = await client.query<RetainedRevisionRow>(
        `${RETAINED_REVISION_SELECT}
          WHERE revision.project_id = $1
            AND revision.snapshot_schema_version = 'revision-snapshot/v1'
            AND (
              $2::uuid IS NULL
              OR revision.revision_number < (
                SELECT cursor_revision.revision_number
                  FROM revisions cursor_revision
                 WHERE cursor_revision.id = $2 AND cursor_revision.project_id = $1
              )
            )
          ORDER BY revision.revision_number DESC
          LIMIT $3`,
        [projectId, cursor, limit]
      );
      return [...result.rows.map(summaryFromRow), ...retained.rows.map(retainedSummaryFromRow)]
        .sort((left, right) => right.revisionNumber - left.revisionNumber)
        .slice(0, limit);
    } finally {
      client.release();
    }
  }

  public async getRevision(
    revisionId: string,
    actor: RevisionActor
  ): Promise<StoredRevisionDetail> {
    const client = await this.pool.connect();
    try {
      const access = projectAccessScope(actor.role, "readHistory");
      if (access === "none") {
        throw new ProjectApplicationError(403, "FORBIDDEN", "Revision history is forbidden");
      }
      const visible = await client.query<{
        project_id: string;
        snapshot_schema_version: string;
      }>(
        `SELECT revision.project_id,revision.snapshot_schema_version
           FROM revisions revision
           JOIN projects project ON project.id = revision.project_id
          WHERE revision.id = $1
            AND revision.snapshot_schema_version IN ('revision-snapshot/v1','revision-snapshot/v2')
            AND ($2::boolean OR ($3::boolean AND project.owner_id = $4))`,
        [revisionId, access === "all", access === "owned", actor.id]
      );
      const record = visible.rows[0];
      if (!record) {
        throw new ProjectApplicationError(404, "RESOURCE_NOT_FOUND", "Revision not found");
      }
      return record.snapshot_schema_version === "revision-snapshot/v2"
        ? loadStoredDetail(client, revisionId)
        : loadRetainedDetail(client, revisionId);
    } finally {
      client.release();
    }
  }

  public async listAuditEvents(
    projectId: string,
    actor: RevisionActor,
    limit = 100,
    cursor: string | null = null
  ): Promise<readonly RevisionLifecycleEventV2[]> {
    const client = await this.pool.connect();
    try {
      await requireReadableProject(client, projectId, actor);
      const result = await client.query<AuditLifecycleRow>(
        `SELECT event.id,event.project_id,event.revision_id,event.action,event.outcome,
                event.actor_id,event.actor_snapshot,event.created_at,event.correlation_id,
                event.prior_status,event.resulting_status,event.reason_code,event.comment,
                event.input_fingerprint,event.engine_version,
                revision.catalog_snapshot_id,revision.catalog_snapshot_version,
                revision.catalog_snapshot_content_hash,revision.rule_snapshot_id,
                revision.rule_snapshot_version,revision.rule_snapshot_content_hash
           FROM revision_lifecycle_events event
           JOIN revisions revision ON revision.id = event.revision_id
          WHERE event.project_id = $1
            AND revision.snapshot_schema_version = 'revision-snapshot/v2'
            AND (
              $2::uuid IS NULL
              OR (event.created_at,event.id) < (
                SELECT cursor_event.created_at,cursor_event.id
                  FROM revision_lifecycle_events cursor_event
                 WHERE cursor_event.id = $2 AND cursor_event.project_id = $1
              )
            )
          ORDER BY event.created_at DESC,event.id DESC
          LIMIT $3`,
        [projectId, cursor, limit]
      );
      return result.rows.map((row) =>
        RevisionLifecycleEventV2Schema.parse({
          schemaVersion: "revision-lifecycle-event/v2",
          id: row.id,
          projectId: row.project_id,
          revisionId: row.revision_id,
          action: row.action,
          outcome: row.outcome,
          actorId: row.actor_id,
          actorSnapshot: storedLifecycleActorSnapshot(row.actor_snapshot),
          occurredAt: asIso(row.created_at),
          correlationId: row.correlation_id,
          priorStatus: row.prior_status,
          resultingStatus: row.resulting_status,
          reasonCode: row.reason_code,
          comment: row.comment,
          inputFingerprint: row.input_fingerprint,
          engineVersion: row.engine_version,
          catalogSnapshot: {
            snapshotId: row.catalog_snapshot_id,
            version: row.catalog_snapshot_version,
            contentHash: row.catalog_snapshot_content_hash
          },
          ruleSnapshot: {
            snapshotId: row.rule_snapshot_id,
            version: row.rule_snapshot_version,
            contentHash: row.rule_snapshot_content_hash
          }
        })
      );
    } finally {
      client.release();
    }
  }

  public async recordRejectedAttempt(input: {
    readonly actor: RevisionActor;
    readonly revisionId: string;
    readonly requestedAction: "revision.checked" | "revision.approved";
    readonly reasonCode: RejectedTransitionReason;
    readonly correlationId: string;
    readonly attemptHash: string;
    readonly requestHash: string;
  }): Promise<boolean> {
    return inTransaction(this.pool, async (client) => {
      const access = projectAccessScope(input.actor.role, "readHistory");
      if (access === "none") return false;
      const visibleTarget = await client.query<RejectionTargetRow>(
        `SELECT revision.project_id,revision.status,revision.input_fingerprint,
                revision.engine_version,revision.catalog_snapshot_id,revision.rule_snapshot_id
           FROM revisions revision
           JOIN projects project ON project.id = revision.project_id
          WHERE revision.id = $1
            AND revision.snapshot_schema_version = 'revision-snapshot/v2'
            AND ($2::boolean OR ($3::boolean AND project.owner_id = $4))`,
        [input.revisionId, access === "all", access === "owned", input.actor.id]
      );
      const visibleRevision = visibleTarget.rows[0];
      if (!visibleRevision) return false;
      const projectLock = await client.query("SELECT 1 FROM projects WHERE id = $1 FOR UPDATE", [
        visibleRevision.project_id
      ]);
      if (projectLock.rowCount !== 1) return false;
      const target = await client.query<RejectionTargetRow>(
        `SELECT revision.project_id,revision.status,revision.input_fingerprint,
                revision.engine_version,revision.catalog_snapshot_id,revision.rule_snapshot_id
           FROM revisions revision
           JOIN projects project ON project.id = revision.project_id
          WHERE revision.id = $1
            AND revision.snapshot_schema_version = 'revision-snapshot/v2'
            AND ($2::boolean OR ($3::boolean AND project.owner_id = $4))`,
        [input.revisionId, access === "all", access === "owned", input.actor.id]
      );
      const revision = target.rows[0];
      if (!revision) return false;
      const scope = `${input.requestedAction}:${input.revisionId}:${input.actor.id}`;
      await lockIdempotencyScope(client, scope);
      const priorRejection = await client.query<{
        readonly request_hash: string;
      }>(
        `SELECT request_hash
           FROM revision_lifecycle_events
          WHERE revision_id = $1
            AND actor_id = $2
            AND outcome = 'rejected'
            AND attempt_hash = $3
          LIMIT 1`,
        [input.revisionId, input.actor.id, input.attemptHash]
      );
      const priorAttempt = priorRejection.rows[0];
      if (priorAttempt && priorAttempt.request_hash !== input.requestHash) {
        throw new ProjectApplicationError(
          409,
          "IDEMPOTENCY_KEY_CONFLICT",
          "The idempotency key was already used for different request content"
        );
      }
      if (priorAttempt) return true;
      await insertRejectedAttempt(client, { ...input, revision });
      return true;
    });
  }

  public async recordRejectedSaveAttempt(input: {
    readonly actor: RevisionActor;
    readonly projectId: string;
    readonly correlationId: string;
  }): Promise<boolean> {
    return inTransaction(this.pool, async (client) => {
      const access = projectAccessScope(input.actor.role, "readHistory");
      if (access === "none") return false;
      const target = await client.query(
        `SELECT id FROM projects
          WHERE id = $1
            AND ($2::boolean OR ($3::boolean AND owner_id = $4))`,
        [input.projectId, access === "all", access === "owned", input.actor.id]
      );
      if (target.rowCount !== 1) return false;
      await client.query(
        `INSERT INTO project_audit_events (
           project_id,actor_id,action,correlation_id,metadata,actor_role,actor_snapshot,
           outcome,reason_code
         ) VALUES (
           $1,$2,'revision.save_authorization_rejected',$3,$4,$5,$6,'rejected','FORBIDDEN'
         )`,
        [
          input.projectId,
          input.actor.id,
          input.correlationId,
          { requestedAction: "revision.saved" },
          input.actor.role,
          actorSnapshot(input.actor)
        ]
      );
      return true;
    });
  }

  public async saveRevision(input: {
    readonly actor: RevisionActor;
    readonly projectId: string;
    readonly request: SaveProjectRevisionRequestV2;
    readonly idempotencyKey: string;
    readonly correlationId: string;
    readonly requestHash: string;
    readonly responseFactory: RevisionResponseFactory;
  }): Promise<RevisionMutationResult> {
    return inTransaction(this.pool, async (client) => {
      const project = await lockWritableProject(client, input.projectId, input.actor);
      const scope = `revision.save:${input.projectId}:${input.actor.id}`;
      await lockIdempotencyScope(client, scope);
      const existing = await replay(client, scope, input.idempotencyKey, input.requestHash);
      if (existing) return existing;
      if (project.draft_version !== input.request.expectedDraftVersion) {
        stale(
          input.request.expectedDraftVersion,
          project.draft_version,
          "The project draft version changed before the revision was saved"
        );
      }
      const latestResult = await client.query<{ latest: number }>(
        `SELECT coalesce(max(revision_number),0)::integer AS latest
           FROM revisions WHERE project_id = $1`,
        [input.projectId]
      );
      const latest = latestResult.rows[0]?.latest ?? 0;
      if (latest !== input.request.expectedLatestRevisionNumber) {
        stale(
          input.request.expectedLatestRevisionNumber,
          latest,
          "The latest project revision changed before the revision was saved"
        );
      }
      const calculationResult = await client.query<CalculationRow>(
        `SELECT calculation.id,calculation.calculated_draft_version,
                calculation.input_fingerprint,calculation.engine_version,
                calculation.catalog_version_id,catalog.version AS catalog_snapshot_version,
                catalog.content_hash AS catalog_snapshot_content_hash,
                calculation.rule_set_id,rules.version AS rule_snapshot_version,
                rules.content_hash AS rule_snapshot_content_hash,
                calculation.input_payload,calculation.result_payload
           FROM calculation_drafts calculation
           JOIN catalog_versions catalog ON catalog.id = calculation.catalog_version_id
           JOIN rule_sets rules ON rules.id = calculation.rule_set_id
          WHERE calculation.id = $1 AND calculation.project_id = $2
            AND calculation.status = 'succeeded'
            AND calculation.calculation_schema_version = 'calculation-input/v2'
            AND calculation.result_schema_version = 'calculation-result/v2'
          FOR SHARE OF calculation`,
        [input.request.calculationRunId, input.projectId]
      );
      const calculation = calculationResult.rows[0];
      if (!calculation) {
        throw new ProjectApplicationError(
          409,
          "INVALID_STATE_TRANSITION",
          "The exact successful transient calculation is no longer current"
        );
      }
      if (calculation.calculated_draft_version !== input.request.expectedDraftVersion) {
        stale(
          input.request.expectedDraftVersion,
          calculation.calculated_draft_version,
          "The transient calculation belongs to a different project draft"
        );
      }
      if (calculation.input_fingerprint !== input.request.inputFingerprint) {
        stale(
          input.request.inputFingerprint,
          calculation.input_fingerprint,
          "The transient calculation fingerprint does not match"
        );
      }
      const calculationInput = CalculationInputV2Schema.parse(calculation.input_payload);
      const result = CalculationResultV2Schema.parse(calculation.result_payload);
      if (
        calculation.id !== calculationInput.invocation.calculationRunId ||
        calculation.id !== result.calculationRunId ||
        calculation.input_fingerprint !== calculationInput.invocation.inputFingerprint ||
        calculation.input_fingerprint !== result.inputFingerprint ||
        calculation.engine_version !== result.engineVersion ||
        calculation.catalog_version_id !== calculationInput.catalogSnapshot.snapshotId ||
        calculation.catalog_version_id !== result.catalogSnapshot.snapshotId ||
        calculation.catalog_snapshot_version !== calculationInput.catalogSnapshot.version ||
        calculation.catalog_snapshot_version !== result.catalogSnapshot.version ||
        calculation.catalog_snapshot_content_hash !==
          calculationInput.catalogSnapshot.contentHash ||
        calculation.catalog_snapshot_content_hash !== result.catalogSnapshot.contentHash ||
        calculation.rule_set_id !== calculationInput.ruleSnapshot.snapshotId ||
        calculation.rule_set_id !== result.ruleSnapshot.snapshotId ||
        calculation.rule_snapshot_version !== calculationInput.ruleSnapshot.version ||
        calculation.rule_snapshot_version !== result.ruleSnapshot.version ||
        calculation.rule_snapshot_content_hash !== calculationInput.ruleSnapshot.contentHash ||
        calculation.rule_snapshot_content_hash !== result.ruleSnapshot.contentHash ||
        calculation.catalog_version_id !== project.active_catalog_version_id ||
        calculation.rule_set_id !== project.active_rule_set_id ||
        calculationInput.project.id !== input.projectId
      ) {
        stale(
          input.request.inputFingerprint,
          calculation.input_fingerprint,
          "The persisted transient calculation evidence is inconsistent"
        );
      }
      const savedProject = projectSnapshot(project);
      const catalogSnapshot = {
        schemaVersion: "catalog-revision-snapshot/v2",
        reference: calculationInput.catalogSnapshot,
        products: calculationInput.products,
        compatibilityRelations: calculationInput.compatibilityRelations
      };
      const ruleTemplateSnapshot = {
        schemaVersion: "rule-template-revision-snapshot/v2",
        reference: calculationInput.ruleSnapshot,
        rules: calculationInput.rules,
        assemblyTemplates: calculationInput.assemblyTemplates
      };
      const warnings = warningSummary(result);
      const createdAt = new Date().toISOString();
      const nextNumber = latest + 1;
      const author = actorSnapshot(input.actor);
      const projectChecksum = revisionChecksum(savedProject);
      const inputChecksum = revisionChecksum(calculationInput);
      const snapshotChecksum = revisionChecksum({
        project: savedProject,
        catalog: catalogSnapshot,
        rules: ruleTemplateSnapshot
      });
      const resultChecksum = revisionChecksum(result);
      const bomChecksum = revisionChecksum(result.bomLines);
      const warningsChecksum = revisionChecksum(result.warnings);
      const completeRevisionChecksum = revisionChecksum({
        schemaVersion: "revision-snapshot/v2",
        projectId: input.projectId,
        revisionNumber: nextNumber,
        name: input.request.name,
        comment: input.request.comment,
        author,
        createdAt,
        sourceDraftVersion: input.request.expectedDraftVersion,
        calculationRunId: calculation.id,
        inputFingerprint: calculation.input_fingerprint,
        engineVersion: calculation.engine_version,
        catalogSnapshot: calculationInput.catalogSnapshot,
        ruleSnapshot: calculationInput.ruleSnapshot,
        approvalReady: result.summary.approvalReady,
        warningSummary: warnings,
        projectChecksum,
        inputChecksum,
        snapshotChecksum,
        resultChecksum,
        bomChecksum,
        warningsChecksum
      });
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO revisions (
           project_id,revision_number,name,description,comment,status,calculation_schema_version,
           engine_version,snapshot_schema_version,input_fingerprint,input_checksum,
           snapshot_checksum,bom_checksum,input_snapshot,catalog_snapshot,
           rule_template_snapshot,calculation_result_snapshot,idempotency_key,correlation_id,
           created_by,created_by_snapshot,created_at,updated_at,calculation_run_id,
           source_draft_version,project_snapshot,catalog_snapshot_id,catalog_snapshot_version,
           catalog_snapshot_content_hash,rule_snapshot_id,rule_snapshot_version,
           rule_snapshot_content_hash,approval_ready,warning_summary,project_checksum,
           result_checksum,warnings_checksum,revision_checksum
         ) VALUES (
           $1,$2,$3,NULL,$4,'calculated','calculation-input/v2',$5,'revision-snapshot/v2',$6,
           $7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$18,$19,$20,$21,$22,$23,$24,
           $25,$26,$27,$28,$29,$30,$31,$32,$33
         ) RETURNING id`,
        [
          input.projectId,
          nextNumber,
          input.request.name,
          input.request.comment,
          calculation.engine_version,
          calculation.input_fingerprint,
          inputChecksum,
          snapshotChecksum,
          bomChecksum,
          calculationInput,
          catalogSnapshot,
          ruleTemplateSnapshot,
          result,
          input.idempotencyKey,
          input.correlationId,
          input.actor.id,
          author,
          createdAt,
          calculation.id,
          input.request.expectedDraftVersion,
          savedProject,
          calculationInput.catalogSnapshot.snapshotId,
          calculationInput.catalogSnapshot.version,
          calculationInput.catalogSnapshot.contentHash,
          calculationInput.ruleSnapshot.snapshotId,
          calculationInput.ruleSnapshot.version,
          calculationInput.ruleSnapshot.contentHash,
          result.summary.approvalReady,
          warnings,
          projectChecksum,
          resultChecksum,
          warningsChecksum,
          completeRevisionChecksum
        ]
      );
      const revisionId = inserted.rows[0]?.id;
      if (!revisionId) throw new Error("Revision insert returned no ID");
      for (const [lineOrder, line] of result.bomLines.entries()) {
        await client.query(
          `INSERT INTO revision_bom_lines_v2 (
             revision_id,line_identity,line_order,kind,category,live_product_id,product_id,
             manual_input_id,product_code,description_en,unit,technical_quantity_value,
             technical_quantity_unit,reserve_quantity_value,reserve_quantity_unit,
             reserved_quantity_value,reserved_quantity_unit,package_increment_value,package_increment_unit,
             package_count_value,package_count_unit,packaging_overage_value,packaging_overage_unit,
             ordered_quantity_value,ordered_quantity_unit,total_spare_quantity_value,total_spare_quantity_unit,
             section_detail,
             included_items_snapshot,source_refs_snapshot,warning_ids_snapshot,
             trace_step_ids_snapshot,status,provenance_snapshot,line_snapshot,created_at
           ) VALUES (
             $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,
             $20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36
           )`,
          [
            revisionId,
            line.id,
            lineOrder,
            line.kind,
            line.category,
            line.productId,
            line.productId,
            line.manualInputId,
            line.productCode,
            line.descriptionEn,
            line.unit,
            line.technicalQuantity.value,
            line.technicalQuantity.unit,
            line.reserveQuantity.value,
            line.reserveQuantity.unit,
            line.reservedQuantity.value,
            line.reservedQuantity.unit,
            line.packageIncrement.value,
            line.packageIncrement.unit,
            line.packageCount?.value ?? null,
            line.packageCount?.unit ?? null,
            line.packagingOverage.value,
            line.packagingOverage.unit,
            line.orderedQuantity.value,
            line.orderedQuantity.unit,
            line.totalSpareQuantity.value,
            line.totalSpareQuantity.unit,
            line.sectionDetail,
            JSON.stringify(line.includedItems),
            JSON.stringify(line.sourceRefs),
            JSON.stringify(line.warningIds),
            JSON.stringify(line.traceStepIds),
            line.status,
            line.provenance,
            line,
            createdAt
          ]
        );
      }
      for (const [warningOrder, warning] of result.warnings.entries()) {
        await client.query(
          `INSERT INTO revision_warnings_v2 (
             revision_id,warning_identity,warning_order,code,kind,severity,approval_impact,
             subject_kind,subject_id,path_snapshot,message_key,effect,rule_id,product_id,
             template_id,override_id,source_refs_snapshot,warning_payload,created_at
           ) VALUES (
             $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19
           )`,
          [
            revisionId,
            warning.id,
            warningOrder,
            warning.code,
            warning.kind,
            warning.severity,
            warning.approvalImpact,
            warning.subject.kind,
            warning.subject.id,
            warning.path === null ? null : JSON.stringify(warning.path),
            warning.messageKey,
            warning.effect,
            warning.ruleId,
            warning.productId,
            warning.templateId,
            warning.overrideId,
            JSON.stringify(warning.sourceRefs),
            warning,
            createdAt
          ]
        );
      }
      await insertLifecycleEvent(client, {
        projectId: input.projectId,
        revisionId,
        action: "revision.saved",
        actor: input.actor,
        priorStatus: null,
        resultingStatus: "calculated",
        correlationId: input.correlationId,
        comment: input.request.comment,
        inputFingerprint: calculation.input_fingerprint,
        engineVersion: calculation.engine_version,
        catalogSnapshotId: calculation.catalog_version_id,
        ruleSnapshotId: calculation.rule_set_id,
        occurredAt: createdAt,
        metadata: {
          revisionNumber: nextNumber,
          sourceDraftVersion: input.request.expectedDraftVersion,
          approvalReady: result.summary.approvalReady,
          warningSummary: warnings
        }
      });
      const response = input.responseFactory(await loadStoredDetail(client, revisionId));
      await recordIdempotency(client, {
        scope,
        key: input.idempotencyKey,
        requestHash: input.requestHash,
        revisionId,
        statusCode: 201,
        response
      });
      return { statusCode: 201, response, replayed: false };
    });
  }

  public async checkRevision(input: {
    readonly actor: RevisionActor;
    readonly revisionId: string;
    readonly request: CheckProjectRevisionRequestV2;
    readonly idempotencyKey: string;
    readonly correlationId: string;
    readonly requestHash: string;
    readonly attemptHash: string;
    readonly responseFactory: RevisionResponseFactory;
  }): Promise<RevisionMutationResult> {
    return this.transition({ ...input, action: "revision.checked" });
  }

  public async approveRevision(input: {
    readonly actor: RevisionActor;
    readonly revisionId: string;
    readonly request: ApproveProjectRevisionRequestV2;
    readonly idempotencyKey: string;
    readonly correlationId: string;
    readonly requestHash: string;
    readonly attemptHash: string;
    readonly responseFactory: RevisionResponseFactory;
  }): Promise<RevisionMutationResult> {
    return this.transition({ ...input, action: "revision.approved" });
  }

  private async transition(input: {
    readonly actor: RevisionActor;
    readonly revisionId: string;
    readonly request: CheckProjectRevisionRequestV2 | ApproveProjectRevisionRequestV2;
    readonly idempotencyKey: string;
    readonly correlationId: string;
    readonly requestHash: string;
    readonly attemptHash: string;
    readonly responseFactory: RevisionResponseFactory;
    readonly action: "revision.checked" | "revision.approved";
  }): Promise<RevisionMutationResult> {
    const capability = input.action === "revision.checked" ? "revision:check" : "revision:approve";
    if (!hasCapability(input.actor.role, capability)) {
      throw new ProjectApplicationError(403, "FORBIDDEN", "Revision transition is forbidden");
    }
    const outcome = await inTransaction<RevisionMutationResult | RejectedTransitionResult>(
      this.pool,
      async (client) => {
        const targetResult = await client.query<{ project_id: string }>(
          `SELECT project_id FROM revisions
          WHERE id = $1 AND snapshot_schema_version = 'revision-snapshot/v2'`,
          [input.revisionId]
        );
        const target = targetResult.rows[0];
        if (!target)
          throw new ProjectApplicationError(404, "RESOURCE_NOT_FOUND", "Revision not found");
        const projectLock = await client.query(
          `SELECT 1 FROM projects
          WHERE id = $1
          FOR UPDATE`,
          [target.project_id]
        );
        if (projectLock.rowCount !== 1) {
          throw new ProjectApplicationError(404, "RESOURCE_NOT_FOUND", "Revision not found");
        }
        const scope = `${input.action}:${input.revisionId}:${input.actor.id}`;
        await lockIdempotencyScope(client, scope);
        const existing = await replay(client, scope, input.idempotencyKey, input.requestHash);
        if (existing) return existing;
        const priorRejection = await client.query<{
          readonly reason_code: string;
          readonly request_hash: string;
        }>(
          `SELECT reason_code,request_hash
           FROM revision_lifecycle_events
          WHERE revision_id = $1
            AND actor_id = $2
            AND outcome = 'rejected'
            AND attempt_hash = $3
          LIMIT 1`,
          [input.revisionId, input.actor.id, input.attemptHash]
        );
        const priorAttempt = priorRejection.rows[0];
        if (priorAttempt && priorAttempt.request_hash !== input.requestHash) {
          throw new ProjectApplicationError(
            409,
            "IDEMPOTENCY_KEY_CONFLICT",
            "The idempotency key was already used for different request content"
          );
        }
        const priorReason = priorAttempt?.reason_code;
        if (
          priorReason === "FORBIDDEN" ||
          priorReason === "CONFLICT_STALE_VERSION" ||
          priorReason === "INVALID_STATE_TRANSITION"
        ) {
          return {
            rejection: new ProjectApplicationError(
              priorReason === "FORBIDDEN" ? 403 : 409,
              priorReason,
              "The same previously rejected revision attempt cannot become successful"
            )
          };
        }
        const revisionResult = await client.query<RevisionRow>(
          `${REVISION_SELECT}
          WHERE revision.id = $1 AND revision.snapshot_schema_version = 'revision-snapshot/v2'
          FOR UPDATE OF revision`,
          [input.revisionId]
        );
        const row = revisionResult.rows[0];
        if (!row)
          throw new ProjectApplicationError(404, "RESOURCE_NOT_FOUND", "Revision not found");
        const rejectTransition = async (
          rejection: ProjectApplicationError
        ): Promise<RejectedTransitionResult> => {
          await insertRejectedAttempt(client, {
            actor: input.actor,
            revisionId: input.revisionId,
            requestedAction: input.action,
            reasonCode: rejection.code as Exclude<RejectedTransitionReason, "FORBIDDEN">,
            correlationId: input.correlationId,
            attemptHash: input.attemptHash,
            requestHash: input.requestHash,
            revision: row
          });
          return { rejection };
        };
        if (
          input.request.expectedLatestRevisionNumber !== row.revision_number ||
          row.latest_revision_number !== row.revision_number
        ) {
          return rejectTransition(
            staleError(
              input.request.expectedLatestRevisionNumber,
              row.latest_revision_number,
              "Only the latest non-archived revision can advance"
            )
          );
        }
        if (row.input_fingerprint !== input.request.inputFingerprint) {
          return rejectTransition(
            staleError(
              input.request.inputFingerprint,
              row.input_fingerprint,
              "The saved revision fingerprint does not match"
            )
          );
        }
        const expectedStatus = input.action === "revision.checked" ? "calculated" : "checked";
        const resultingStatus = input.action === "revision.checked" ? "checked" : "approved";
        if (row.status !== expectedStatus) {
          return rejectTransition(
            new ProjectApplicationError(
              409,
              "INVALID_STATE_TRANSITION",
              `The revision cannot transition from ${row.status} to ${resultingStatus}`,
              {
                kind: "stateTransition",
                currentStatus: row.status,
                requestedStatus: resultingStatus
              }
            )
          );
        }
        if (input.action === "revision.approved") {
          if (!row.approval_ready) {
            return rejectTransition(
              new ProjectApplicationError(
                409,
                "INVALID_STATE_TRANSITION",
                "The saved calculation is not ready for approval",
                {
                  kind: "stateTransition",
                  currentStatus: row.status,
                  requestedStatus: "approved"
                }
              )
            );
          }
          const blockers = await client.query<{ count: number }>(
            `SELECT count(*)::integer AS count
             FROM revision_warnings_v2
            WHERE revision_id = $1 AND approval_impact = 'blocksApproval'`,
            [input.revisionId]
          );
          if ((blockers.rows[0]?.count ?? 0) > 0) {
            return rejectTransition(
              new ProjectApplicationError(
                409,
                "INVALID_STATE_TRANSITION",
                "A saved warning blocks approval",
                {
                  kind: "stateTransition",
                  currentStatus: row.status,
                  requestedStatus: "approved"
                }
              )
            );
          }
        }
        const occurredAt = new Date().toISOString();
        if (input.action === "revision.approved") {
          await client.query(
            `INSERT INTO approvals (
             revision_id,decision,actor_id,actor_role,actor_snapshot,comment,reason,
             decided_at,correlation_id,idempotency_key
           ) VALUES ($1,'approved',$2,$3,$4,$5,NULL,$6,$7,$8)`,
            [
              input.revisionId,
              input.actor.id,
              input.actor.role,
              actorSnapshot(input.actor),
              input.request.comment,
              occurredAt,
              input.correlationId,
              input.idempotencyKey
            ]
          );
        }
        await client.query(
          input.action === "revision.checked"
            ? `UPDATE revisions
                SET status = 'checked',checked_at = $2,updated_at = $2
              WHERE id = $1`
            : `UPDATE revisions
                SET status = 'approved',approved_at = $2,updated_at = $2
              WHERE id = $1`,
          [input.revisionId, occurredAt]
        );
        await insertLifecycleEvent(client, {
          projectId: row.project_id,
          revisionId: row.id,
          action: input.action,
          actor: input.actor,
          priorStatus: expectedStatus,
          resultingStatus,
          correlationId: input.correlationId,
          comment: input.request.comment,
          inputFingerprint: row.input_fingerprint,
          engineVersion: row.engine_version,
          catalogSnapshotId: row.catalog_snapshot_id,
          ruleSnapshotId: row.rule_snapshot_id,
          occurredAt,
          metadata: { revisionNumber: row.revision_number }
        });
        const response = input.responseFactory(await loadStoredDetail(client, input.revisionId));
        await recordIdempotency(client, {
          scope,
          key: input.idempotencyKey,
          requestHash: input.requestHash,
          revisionId: input.revisionId,
          statusCode: 200,
          response
        });
        return { statusCode: 200, response, replayed: false };
      }
    );
    if ("rejection" in outcome) throw outcome.rejection;
    return outcome;
  }
}

export function withRevisionActions(
  detail: StoredRevisionV2Detail,
  actions: ProjectRevisionActionsV2
): ProjectRevisionDetailV2 {
  return ProjectRevisionDetailV2Schema.parse({
    ...detail,
    summary: ProjectRevisionSummaryV2Schema.parse({ ...detail.summary, actions })
  });
}
