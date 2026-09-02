import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { Pool, type PoolClient } from "pg";

import { databaseConfig } from "./config.js";

const ids = {
  catalog: "00000000-0000-4000-8000-000000000001",
  ruleSet: "00000000-0000-4000-8000-000000000101",
  laterCatalog: "20000000-0000-4000-8000-000000000701",
  laterRuleSet: "20000000-0000-4000-8000-000000000702",
  product: "00000000-0000-4000-8000-000000000305",
  designer: "20000000-0000-4000-8000-000000000951",
  reviewer: "20000000-0000-4000-8000-000000000952",
  administrator: "20000000-0000-4000-8000-000000000953",
  viewer: "20000000-0000-4000-8000-000000000954",
  invalidUser: "20000000-0000-4000-8000-000000000955",
  unauditedUser: "20000000-0000-4000-8000-000000000956",
  project: "20000000-0000-4000-8000-000000000801",
  readyRun: "20000000-0000-4000-8000-000000000871",
  readyRevision: "20000000-0000-4000-8000-000000000901",
  missingAuditRun: "20000000-0000-4000-8000-000000000872",
  missingAuditRevision: "20000000-0000-4000-8000-000000000902",
  incompleteRun: "20000000-0000-4000-8000-000000000875",
  incompleteRevision: "20000000-0000-4000-8000-000000000905",
  blockingRun: "20000000-0000-4000-8000-000000000873",
  blockingRevision: "20000000-0000-4000-8000-000000000903",
  notReadyRun: "20000000-0000-4000-8000-000000000874",
  notReadyRevision: "20000000-0000-4000-8000-000000000904",
  preapprovedRun: "20000000-0000-4000-8000-000000000876",
  preapprovedRevision: "20000000-0000-4000-8000-000000000906"
} as const;

type JsonObject = Record<string, unknown>;

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  const object = value as JsonObject;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(object[key])}`)
    .join(",")}}`;
}

function checksum(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalize(value), "utf8").digest("hex")}`;
}

function databaseErrorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { readonly code?: unknown }).code)
    : undefined;
}

async function expectDatabaseError(
  label: string,
  operation: () => Promise<unknown>,
  expectedCodes: readonly string[]
): Promise<void> {
  try {
    await operation();
  } catch (error) {
    assert.ok(
      expectedCodes.includes(databaseErrorCode(error) ?? ""),
      `${label}: unexpected PostgreSQL error ${databaseErrorCode(error) ?? "unknown"}`
    );
    return;
  }
  assert.fail(`${label}: expected PostgreSQL to reject the operation`);
}

async function expectCommitError(
  pool: Pool,
  label: string,
  operation: (client: PoolClient) => Promise<void>,
  expectedCodes: readonly string[]
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await operation(client);
    await client.query("COMMIT");
    assert.fail(`${label}: expected transaction commit to fail`);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    assert.ok(
      expectedCodes.includes(databaseErrorCode(error) ?? ""),
      `${label}: unexpected PostgreSQL error ${databaseErrorCode(error) ?? "unknown"}`
    );
  } finally {
    client.release();
  }
}

function buildBomLine(
  lineIdentity = "stage8-ready-line",
  packageCount: { readonly value: string; readonly unit: "packages" } | null = {
    value: "2",
    unit: "packages"
  }
) {
  return {
    id: lineIdentity,
    kind: "catalog",
    category: "anchor",
    productId: ids.product,
    manualInputId: null,
    productCode: "SYN-NX-ANCHOR-M8",
    descriptionEn: "Stage 8 immutable synthetic anchor snapshot",
    unit: "pcs",
    technicalQuantity: { value: "10", unit: "pcs" },
    reserveQuantity: { value: "1", unit: "pcs" },
    reservedQuantity: { value: "11", unit: "pcs" },
    packageIncrement: { value: "10", unit: "pcs" },
    packageCount,
    packagingOverage: { value: "9", unit: "pcs" },
    orderedQuantity: { value: "20", unit: "pcs" },
    totalSpareQuantity: { value: "10", unit: "pcs" },
    sectionDetail: null,
    includedItems: [],
    sourceRefs: [
      {
        kind: "catalog",
        sourceId: "stage8-source",
        document: "synthetic-stage8-fixture",
        page: "fixture-1"
      }
    ],
    status: "catalogConfirmed",
    warningIds: [],
    traceStepIds: ["stage8-trace-step"],
    provenance: {
      catalogSnapshotId: ids.catalog,
      ruleSnapshotId: ids.ruleSet,
      ruleIds: [],
      formulaIds: ["stage8-test-formula-reference"]
    }
  } as const;
}

function buildBlockingWarning() {
  return {
    id: "stage8-blocking-warning",
    code: "ENGINEERING_CHECK_REQUIRED",
    kind: "engineering",
    severity: "blocking",
    subject: { kind: "project", id: ids.project },
    path: null,
    messageKey: "stage8.engineeringCheckRequired",
    effect: "Synthetic Stage 8 warning blocks approval.",
    approvalImpact: "blocksApproval",
    ruleId: null,
    productId: null,
    templateId: null,
    sourceRefs: [],
    overrideId: null
  } as const;
}

type BomLine = ReturnType<typeof buildBomLine>;
type RevisionWarning = ReturnType<typeof buildBlockingWarning>;

interface RevisionArtifacts {
  readonly revisionId: string;
  readonly revisionNumber: number;
  readonly runId: string;
  readonly inputFingerprint: string;
  readonly approvalReady: boolean;
  readonly projectSnapshot: JsonObject;
  readonly inputSnapshot: JsonObject;
  readonly catalogSnapshot: JsonObject;
  readonly ruleTemplateSnapshot: JsonObject;
  readonly resultSnapshot: JsonObject;
  readonly warningSummary: JsonObject;
  readonly bomLines: readonly BomLine[];
  readonly warnings: readonly RevisionWarning[];
  readonly inputChecksum: string;
  readonly projectChecksum: string;
  readonly snapshotChecksum: string;
  readonly bomChecksum: string;
  readonly resultChecksum: string;
  readonly warningsChecksum: string;
  readonly revisionChecksum: string;
}

function buildRevisionArtifacts(input: {
  readonly revisionId: string;
  readonly revisionNumber: number;
  readonly runId: string;
  readonly approvalReady: boolean;
  readonly bomLines?: readonly BomLine[];
  readonly warnings?: readonly RevisionWarning[];
}): RevisionArtifacts {
  const inputFingerprint = checksum({ kind: "stage8-input-fingerprint", runId: input.runId });
  const catalogReference = {
    snapshotId: ids.catalog,
    version: "0.1.0",
    contentHash: `sha256:${"a".repeat(64)}`
  };
  const ruleReference = {
    snapshotId: ids.ruleSet,
    version: "0.1.0",
    contentHash: `sha256:${"c".repeat(64)}`
  };
  const projectSnapshot: JsonObject = {
    id: ids.project,
    draftVersion: 1,
    name: "Stage 8 synthetic project",
    fixture: true
  };
  const inputSnapshot: JsonObject = {
    schemaVersion: "calculation-input/v2",
    invocation: { calculationRunId: input.runId, inputFingerprint },
    project: { id: ids.project, code: "SYN-STAGE8" },
    catalogSnapshot: catalogReference,
    products: [],
    compatibilityRelations: [],
    ruleSnapshot: ruleReference,
    rules: [],
    assemblyTemplates: [],
    manualItems: [],
    productQuantityAdjustments: [],
    linePolicies: []
  };
  const catalogSnapshot: JsonObject = {
    schemaVersion: "catalog-revision-snapshot/v2",
    reference: catalogReference,
    products: [],
    compatibilityRelations: []
  };
  const ruleTemplateSnapshot: JsonObject = {
    schemaVersion: "rule-template-revision-snapshot/v2",
    reference: ruleReference,
    rules: [],
    assemblyTemplates: []
  };
  const bomLines = input.bomLines ?? [];
  const warnings = input.warnings ?? [];
  const resultSnapshot: JsonObject = {
    schemaVersion: "calculation-result/v2",
    engineVersion: "0.1.0",
    calculationRunId: input.runId,
    inputFingerprint,
    catalogSnapshot: catalogReference,
    ruleSnapshot: ruleReference,
    bomLines,
    warnings,
    summary: {
      bomLineCount: bomLines.length,
      warningCount: warnings.length,
      approvalReady: input.approvalReady
    }
  };
  const warningSummary: JsonObject = {
    totalCount: warnings.length,
    blocksApprovalCount: warnings.filter((warning) => warning.approvalImpact === "blocksApproval")
      .length,
    reviewRequiredCount: 0
  };
  const inputChecksum = checksum(inputSnapshot);
  const projectChecksum = checksum(projectSnapshot);
  const snapshotChecksum = checksum({ catalogSnapshot, ruleTemplateSnapshot });
  const bomChecksum = checksum(bomLines);
  const resultChecksum = checksum(resultSnapshot);
  const warningsChecksum = checksum(warnings);
  const revisionChecksum = checksum({
    projectSnapshot,
    inputSnapshot,
    catalogSnapshot,
    ruleTemplateSnapshot,
    resultSnapshot,
    bomLines,
    warnings
  });
  return {
    revisionId: input.revisionId,
    revisionNumber: input.revisionNumber,
    runId: input.runId,
    inputFingerprint,
    approvalReady: input.approvalReady,
    projectSnapshot,
    inputSnapshot,
    catalogSnapshot,
    ruleTemplateSnapshot,
    resultSnapshot,
    warningSummary,
    bomLines,
    warnings,
    inputChecksum,
    projectChecksum,
    snapshotChecksum,
    bomChecksum,
    resultChecksum,
    warningsChecksum,
    revisionChecksum
  };
}

type RevisionActorRole = "designer" | "reviewer" | "administrator";

async function insertRevisionHeader(
  client: PoolClient,
  artifacts: RevisionArtifacts,
  actorId: string = ids.designer,
  actorRole: RevisionActorRole = "designer",
  initialStatus: "calculated" | "approved" = "calculated"
): Promise<void> {
  await client.query(
    `INSERT INTO revisions (
       id, project_id, revision_number, name, comment, status, calculation_schema_version,
       engine_version, snapshot_schema_version, input_fingerprint, input_checksum,
       snapshot_checksum, bom_checksum, input_snapshot, project_snapshot, catalog_snapshot,
       rule_template_snapshot, calculation_result_snapshot, calculation_run_id,
       source_draft_version, catalog_snapshot_id, catalog_snapshot_version,
       catalog_snapshot_content_hash, rule_snapshot_id, rule_snapshot_version,
       rule_snapshot_content_hash, approval_ready, warning_summary, project_checksum,
       result_checksum, warnings_checksum, revision_checksum, idempotency_key, correlation_id,
       created_by, created_by_snapshot
     ) VALUES (
       $1,$2,$3,$4,$5,$30,'calculation-input/v2','0.1.0','revision-snapshot/v2',
       $6,$7,$8,$9,$10,$11,$12,$13,$14,$15,1,$16,'0.1.0',$17,$18,'0.1.0',$19,$20,$21,
       $22,$23,$24,$25,$26,$27,$28,$29
     )`,
    [
      artifacts.revisionId,
      ids.project,
      artifacts.revisionNumber,
      `Stage 8 revision ${artifacts.revisionNumber}`,
      "Synthetic Stage 8 acceptance evidence",
      artifacts.inputFingerprint,
      artifacts.inputChecksum,
      artifacts.snapshotChecksum,
      artifacts.bomChecksum,
      artifacts.inputSnapshot,
      artifacts.projectSnapshot,
      artifacts.catalogSnapshot,
      artifacts.ruleTemplateSnapshot,
      artifacts.resultSnapshot,
      artifacts.runId,
      ids.catalog,
      `sha256:${"a".repeat(64)}`,
      ids.ruleSet,
      `sha256:${"c".repeat(64)}`,
      artifacts.approvalReady,
      artifacts.warningSummary,
      artifacts.projectChecksum,
      artifacts.resultChecksum,
      artifacts.warningsChecksum,
      artifacts.revisionChecksum,
      `stage8-save-${artifacts.revisionNumber.toString().padStart(4, "0")}`,
      `stage8-correlation-save-${artifacts.revisionNumber.toString().padStart(4, "0")}`,
      actorId,
      { id: actorId, displayName: `Stage 8 ${actorRole}`, role: actorRole },
      initialStatus
    ]
  );
}

async function insertBomLine(
  client: PoolClient,
  revisionId: string,
  line: BomLine,
  lineOrder: number
): Promise<void> {
  await client.query(
    `INSERT INTO revision_bom_lines_v2 (
       revision_id, line_identity, line_order, kind, category, live_product_id, product_id,
       manual_input_id, product_code, description_en, unit, status,
       technical_quantity_value, technical_quantity_unit,
       reserve_quantity_value, reserve_quantity_unit,
       reserved_quantity_value, reserved_quantity_unit,
       package_increment_value, package_increment_unit,
       package_count_value, package_count_unit,
       packaging_overage_value, packaging_overage_unit,
       ordered_quantity_value, ordered_quantity_unit,
       total_spare_quantity_value, total_spare_quantity_unit,
       section_detail, included_items_snapshot,
       source_refs_snapshot, warning_ids_snapshot, trace_step_ids_snapshot,
       provenance_snapshot, line_snapshot
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
       $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35
     )`,
    [
      revisionId,
      line.id,
      lineOrder,
      line.kind,
      line.category,
      ids.product,
      line.productId,
      line.manualInputId,
      line.productCode,
      line.descriptionEn,
      line.unit,
      line.status,
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
      line.provenance,
      line
    ]
  );
}

async function insertWarning(
  client: PoolClient,
  revisionId: string,
  warning: RevisionWarning,
  warningOrder: number
): Promise<void> {
  await client.query(
    `INSERT INTO revision_warnings_v2 (
       revision_id, warning_identity, warning_order, code, kind, severity, approval_impact,
       subject_kind, subject_id, path_snapshot, message_key, effect, rule_id, product_id,
       template_id, override_id, source_refs_snapshot, warning_payload
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
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
      warning.path,
      warning.messageKey,
      warning.effect,
      warning.ruleId,
      warning.productId,
      warning.templateId,
      warning.overrideId,
      JSON.stringify(warning.sourceRefs),
      warning
    ]
  );
}

async function insertLifecycleEvent(
  client: PoolClient,
  input: {
    readonly artifacts: RevisionArtifacts;
    readonly action: "revision.saved" | "revision.checked" | "revision.approved";
    readonly actorId: string;
    readonly actorRole: RevisionActorRole;
    readonly priorStatus: "calculated" | "checked" | null;
    readonly resultingStatus: "calculated" | "checked" | "approved";
    readonly correlationId: string;
    readonly comment?: string | null;
  }
): Promise<void> {
  await client.query(
    `INSERT INTO revision_lifecycle_events (
       project_id, revision_id, action, actor_id, actor_role, actor_snapshot, prior_status,
       resulting_status, correlation_id, comment, input_fingerprint, engine_version,
       catalog_snapshot_id, rule_snapshot_id, outcome, metadata
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'0.1.0',$12,$13,'succeeded',$14)`,
    [
      ids.project,
      input.artifacts.revisionId,
      input.action,
      input.actorId,
      input.actorRole,
      { id: input.actorId, displayName: `Stage 8 ${input.actorRole}`, role: input.actorRole },
      input.priorStatus,
      input.resultingStatus,
      input.correlationId,
      input.comment === undefined ? "Synthetic Stage 8 acceptance evidence" : input.comment,
      input.artifacts.inputFingerprint,
      ids.catalog,
      ids.ruleSet,
      { revisionNumber: input.artifacts.revisionNumber }
    ]
  );
}

async function saveRevision(
  client: PoolClient,
  artifacts: RevisionArtifacts,
  actorId: string = ids.designer,
  actorRole: RevisionActorRole = "designer",
  lifecycleComment?: string | null
): Promise<void> {
  await insertRevisionHeader(client, artifacts, actorId, actorRole);
  for (const [index, line] of artifacts.bomLines.entries())
    await insertBomLine(client, artifacts.revisionId, line, index);
  for (const [index, warning] of artifacts.warnings.entries())
    await insertWarning(client, artifacts.revisionId, warning, index);
  await insertLifecycleEvent(client, {
    artifacts,
    action: "revision.saved",
    actorId,
    actorRole,
    priorStatus: null,
    resultingStatus: "calculated",
    correlationId: `stage8-correlation-save-${artifacts.revisionNumber.toString().padStart(4, "0")}`,
    ...(lifecycleComment === undefined ? {} : { comment: lifecycleComment })
  });
}

async function inTransaction(
  pool: Pool,
  operation: (client: PoolClient) => Promise<void>
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await operation(client);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

const pool = new Pool(databaseConfig());

try {
  await pool.query(
    `INSERT INTO users (
       id, username, display_name, role, enabled, password_hash, password_algorithm
     ) VALUES
       ($1, 'stage8.designer', 'Stage 8 Designer', 'designer', true, 'test-only', 'test-only'),
       ($2, 'stage8.reviewer', 'Stage 8 Reviewer', 'reviewer', true, 'test-only', 'test-only'),
       ($3, 'stage8.administrator', 'Stage 8 Administrator', 'administrator', true, 'test-only', 'test-only'),
       ($4, 'stage8.viewer', 'Stage 8 Viewer', 'viewer', true, 'test-only', 'test-only')`,
    [ids.designer, ids.reviewer, ids.administrator, ids.viewer]
  );

  const roles = await pool.query<{ readonly role: string }>(
    "SELECT role FROM users WHERE id = ANY($1::uuid[]) ORDER BY role",
    [[ids.designer, ids.reviewer, ids.administrator, ids.viewer]]
  );
  assert.deepEqual(
    roles.rows.map((row) => row.role),
    ["administrator", "designer", "reviewer", "viewer"],
    "all four canonical roles persist"
  );
  assert.ok(
    (await pool.query("SELECT 1 FROM users WHERE role IN ('administrator', 'reviewer') LIMIT 1"))
      .rowCount,
    "retained Administrator/Reviewer rows remain valid"
  );
  await expectDatabaseError(
    "unknown role",
    () =>
      pool.query(
        `INSERT INTO users (
           id, username, display_name, role, enabled, password_hash, password_algorithm
         ) VALUES ($1, 'stage8.invalid', 'Stage 8 Invalid', 'checker', true, 'test-only', 'test-only')`,
        [ids.invalidUser]
      ),
    ["23514"]
  );
  await expectCommitError(
    pool,
    "application user creation without matching audit evidence",
    async (client) => {
      await client.query("SET LOCAL ROLE niedax_generator_app");
      await client.query(
        `INSERT INTO users (
           id,username,display_name,role,enabled,password_hash,password_algorithm,
           created_by,updated_by
         ) VALUES (
           $1,'stage8.unaudited','Stage 8 Unaudited','viewer',true,'test-only','test-only',$2,$2
         )`,
        [ids.unauditedUser, ids.administrator]
      );
    },
    ["23514"]
  );
  assert.equal(
    (
      await pool.query("SELECT count(*)::integer AS count FROM users WHERE id = $1", [
        ids.unauditedUser
      ])
    ).rows[0]?.count,
    0,
    "an unaudited application user insert is rolled back"
  );
  await expectCommitError(
    pool,
    "user role update without matching audit evidence",
    async (client) => {
      await client.query(
        `UPDATE users
            SET role = 'viewer',updated_at = clock_timestamp(),updated_by = $2
          WHERE id = $1`,
        [ids.designer, ids.administrator]
      );
    },
    ["23514"]
  );
  assert.equal(
    (
      await pool.query<{ readonly role: string }>("SELECT role FROM users WHERE id = $1", [
        ids.designer
      ])
    ).rows[0]?.role,
    "designer",
    "an unaudited role update is rolled back"
  );
  await expectDatabaseError(
    "standalone user security audit metadata mutation",
    () =>
      pool.query("UPDATE users SET updated_at = clock_timestamp(),updated_by = $2 WHERE id = $1", [
        ids.viewer,
        ids.administrator
      ]),
    ["23514"]
  );
  const revokedSessionHash = "e".repeat(64);
  await pool.query(
    `INSERT INTO sessions (token_hash,user_id,expires_at,revoked_at)
     VALUES ($1,$2,now() + interval '1 day',now())`,
    [revokedSessionHash, ids.viewer]
  );
  await expectDatabaseError(
    "revoked session reactivation",
    () =>
      inTransaction(pool, async (client) => {
        await client.query("SET LOCAL ROLE niedax_generator_app");
        await client.query("UPDATE sessions SET revoked_at = NULL WHERE token_hash = $1", [
          revokedSessionHash
        ]);
      }),
    ["55000"]
  );
  assert.ok(
    (
      await pool.query<{ readonly revoked_at: Date | null }>(
        "SELECT revoked_at FROM sessions WHERE token_hash = $1",
        [revokedSessionHash]
      )
    ).rows[0]?.revoked_at,
    "a rejected session reactivation leaves the session revoked"
  );
  await expectDatabaseError(
    "session last-seen timestamp reversal",
    () =>
      inTransaction(pool, async (client) => {
        await client.query("SET LOCAL ROLE niedax_generator_app");
        await client.query(
          "UPDATE sessions SET last_seen_at = last_seen_at - interval '1 second' WHERE token_hash = $1",
          [revokedSessionHash]
        );
      }),
    ["23514"]
  );

  const decimalChecks = await pool.query<{
    readonly maximum: boolean;
    readonly noncanonical: boolean;
    readonly excessive_scale: boolean;
  }>(
    `SELECT
       is_canonical_decimal_v2('123456789012.123456789012345678') AS maximum,
       is_canonical_decimal_v2('1.0') AS noncanonical,
       is_canonical_decimal_v2('0.1234567890123456789') AS excessive_scale`
  );
  assert.deepEqual(decimalChecks.rows[0], {
    maximum: true,
    noncanonical: false,
    excessive_scale: false
  });

  await pool.query(
    `INSERT INTO projects (
       id, code, name, status, draft_version, active_catalog_version_id, active_rule_set_id,
       owner_id, created_by, updated_by
     ) VALUES ($1, 'SYN-STAGE8-PROJECT', 'Stage 8 synthetic project', 'draft', 1, $2, $3, $4, $4, $4)`,
    [ids.project, ids.catalog, ids.ruleSet, ids.designer]
  );
  const projectDocument = {
    schemaVersion: "project-draft-document/v2",
    projectId: ids.project,
    name: "Stage 8 synthetic project",
    fixture: true
  };
  await pool.query(
    `INSERT INTO project_draft_documents (project_id, draft_version, schema_version, payload)
     VALUES ($1, 1, 'project-draft-document/v2', $2)`,
    [ids.project, projectDocument]
  );

  const readyArtifacts = buildRevisionArtifacts({
    revisionId: ids.readyRevision,
    revisionNumber: 1,
    runId: ids.readyRun,
    approvalReady: true,
    bomLines: [buildBomLine(), buildBomLine("stage8-ready-unpackaged-line", null)]
  });
  await pool.query(
    `INSERT INTO calculation_drafts (
       id, project_id, calculation_schema_version, engine_version, input_fingerprint,
       idempotency_key, catalog_version_id, rule_set_id, status, correlation_id,
       input_payload, result_schema_version, result_payload, started_at, completed_at,
       calculated_draft_version
     ) VALUES (
       $1,$2,'calculation-input/v2','0.1.0',$3,'stage8-calculate-0001',$4,$5,'succeeded',
       'stage8-correlation-calculate-0001',$6,'calculation-result/v2',$7,now(),now(),1
     )`,
    [
      readyArtifacts.runId,
      ids.project,
      readyArtifacts.inputFingerprint,
      ids.catalog,
      ids.ruleSet,
      readyArtifacts.inputSnapshot,
      readyArtifacts.resultSnapshot
    ]
  );

  await expectDatabaseError(
    "pre-approved v2 revision insert",
    () =>
      inTransaction(pool, async (client) => {
        await insertRevisionHeader(
          client,
          buildRevisionArtifacts({
            revisionId: ids.preapprovedRevision,
            revisionNumber: 99,
            runId: ids.preapprovedRun,
            approvalReady: true
          }),
          ids.designer,
          "designer",
          "approved"
        );
      }),
    ["23514"]
  );

  await expectCommitError(
    pool,
    "v2 revision without save audit",
    async (client) => {
      await insertRevisionHeader(
        client,
        buildRevisionArtifacts({
          revisionId: ids.missingAuditRevision,
          revisionNumber: 2,
          runId: ids.missingAuditRun,
          approvalReady: true
        })
      );
    },
    ["23514"]
  );
  assert.equal(
    (
      await pool.query("SELECT count(*)::integer AS count FROM revisions WHERE id = $1", [
        ids.missingAuditRevision
      ])
    ).rows[0]?.count,
    0,
    "a missing lifecycle audit rolls the revision back"
  );

  const mismatchedCatalogArtifacts = buildRevisionArtifacts({
    revisionId: ids.missingAuditRevision,
    revisionNumber: 2,
    runId: ids.missingAuditRun,
    approvalReady: true
  });
  await expectCommitError(
    pool,
    "v2 revision with mismatched saved-event comment",
    async (client) => {
      await saveRevision(
        client,
        mismatchedCatalogArtifacts,
        ids.designer,
        "designer",
        "Mismatched lifecycle comment"
      );
    },
    ["23514"]
  );
  await expectDatabaseError(
    "v2 revision with a mismatched catalog reference version",
    () =>
      inTransaction(pool, async (client) => {
        await insertRevisionHeader(client, {
          ...mismatchedCatalogArtifacts,
          catalogSnapshot: {
            ...mismatchedCatalogArtifacts.catalogSnapshot,
            reference: {
              ...(mismatchedCatalogArtifacts.catalogSnapshot.reference as JsonObject),
              version: "9.9.9"
            }
          }
        });
      }),
    ["23514"]
  );
  await expectDatabaseError(
    "v2 revision with a mismatched result engine version",
    () =>
      inTransaction(pool, async (client) => {
        await insertRevisionHeader(client, {
          ...mismatchedCatalogArtifacts,
          resultSnapshot: {
            ...mismatchedCatalogArtifacts.resultSnapshot,
            engineVersion: "9.9.9"
          }
        });
      }),
    ["23514"]
  );

  const incompleteArtifacts = buildRevisionArtifacts({
    revisionId: ids.incompleteRevision,
    revisionNumber: 2,
    runId: ids.incompleteRun,
    approvalReady: true,
    bomLines: [buildBomLine("stage8-incomplete-line")]
  });
  await expectCommitError(
    pool,
    "v2 revision with an incomplete normalized projection",
    async (client) => {
      await insertRevisionHeader(client, incompleteArtifacts);
      await insertLifecycleEvent(client, {
        artifacts: incompleteArtifacts,
        action: "revision.saved",
        actorId: ids.designer,
        actorRole: "designer",
        priorStatus: null,
        resultingStatus: "calculated",
        correlationId: "stage8-correlation-incomplete-0001"
      });
    },
    ["23514"]
  );
  assert.equal(
    (
      await pool.query("SELECT count(*)::integer AS count FROM revisions WHERE id = $1", [
        ids.incompleteRevision
      ])
    ).rows[0]?.count,
    0,
    "an incomplete v2 normalized projection rolls the revision back"
  );

  await inTransaction(pool, async (client) => saveRevision(client, readyArtifacts));

  const copiedEvidence = await pool.query<{
    readonly input_checksum: string;
    readonly project_checksum: string;
    readonly snapshot_checksum: string;
    readonly bom_checksum: string;
    readonly result_checksum: string;
    readonly warnings_checksum: string;
    readonly revision_checksum: string;
    readonly calculation_run_id: string;
    readonly source_draft_version: number;
    readonly line_snapshot: JsonObject;
  }>(
    `SELECT revision.input_checksum, revision.project_checksum, revision.snapshot_checksum,
            revision.bom_checksum, revision.result_checksum, revision.warnings_checksum,
            revision.revision_checksum, revision.calculation_run_id,
            revision.source_draft_version, line.line_snapshot
      FROM revisions revision
      JOIN revision_bom_lines_v2 line ON line.revision_id = revision.id
      WHERE revision.id = $1 AND line.line_order = 0`,
    [ids.readyRevision]
  );
  assert.deepEqual(copiedEvidence.rows[0], {
    input_checksum: readyArtifacts.inputChecksum,
    project_checksum: readyArtifacts.projectChecksum,
    snapshot_checksum: readyArtifacts.snapshotChecksum,
    bom_checksum: readyArtifacts.bomChecksum,
    result_checksum: readyArtifacts.resultChecksum,
    warnings_checksum: readyArtifacts.warningsChecksum,
    revision_checksum: readyArtifacts.revisionChecksum,
    calculation_run_id: readyArtifacts.runId,
    source_draft_version: 1,
    line_snapshot: readyArtifacts.bomLines[0]
  });
  assert.deepEqual(
    (
      await pool.query<{
        readonly package_count_value: string | null;
        readonly package_count_unit: string | null;
      }>(
        `SELECT package_count_value, package_count_unit
           FROM revision_bom_lines_v2
          WHERE revision_id = $1 AND line_identity = 'stage8-ready-unpackaged-line'`,
        [ids.readyRevision]
      )
    ).rows[0],
    { package_count_value: null, package_count_unit: null },
    "nullable package-count value/unit remain exactly null in the normalized projection"
  );

  await expectDatabaseError(
    "sealed v2 BOM append",
    () =>
      inTransaction(pool, async (client) =>
        insertBomLine(client, ids.readyRevision, buildBomLine("late-line"), 1)
      ),
    ["55000"]
  );
  await expectDatabaseError(
    "v2 revision payload mutation",
    () => pool.query("UPDATE revisions SET comment = 'changed' WHERE id = $1", [ids.readyRevision]),
    ["55000"]
  );
  await expectDatabaseError(
    "lifecycle timestamp without transition",
    () => pool.query("UPDATE revisions SET checked_at = now() WHERE id = $1", [ids.readyRevision]),
    ["23514"]
  );
  await expectDatabaseError(
    "v2 BOM mutation",
    () =>
      pool.query(
        "UPDATE revision_bom_lines_v2 SET technical_quantity_value = '11' WHERE revision_id = $1",
        [ids.readyRevision]
      ),
    ["55000"]
  );
  await expectDatabaseError(
    "forged revision lifecycle actor role",
    () =>
      inTransaction(pool, async (client) => {
        await insertLifecycleEvent(client, {
          artifacts: readyArtifacts,
          action: "revision.checked",
          actorId: ids.designer,
          actorRole: "reviewer",
          priorStatus: "calculated",
          resultingStatus: "checked",
          correlationId: "stage8-correlation-forged-lifecycle"
        });
      }),
    ["42501"]
  );
  await expectCommitError(
    pool,
    "standalone successful check audit without revision transition",
    async (client) => {
      await insertLifecycleEvent(client, {
        artifacts: readyArtifacts,
        action: "revision.checked",
        actorId: ids.reviewer,
        actorRole: "reviewer",
        priorStatus: "calculated",
        resultingStatus: "checked",
        correlationId: "stage8-correlation-standalone-check"
      });
    },
    ["23514"]
  );

  await inTransaction(pool, async (client) => {
    await client.query(
      "UPDATE revisions SET status = 'checked', checked_at = now(), updated_at = now() WHERE id = $1",
      [ids.readyRevision]
    );
    await insertLifecycleEvent(client, {
      artifacts: readyArtifacts,
      action: "revision.checked",
      actorId: ids.reviewer,
      actorRole: "reviewer",
      priorStatus: "calculated",
      resultingStatus: "checked",
      correlationId: "stage8-correlation-check-0001"
    });
  });

  await expectCommitError(
    pool,
    "standalone successful approval audit without revision transition or decision",
    async (client) => {
      await insertLifecycleEvent(client, {
        artifacts: readyArtifacts,
        action: "revision.approved",
        actorId: ids.reviewer,
        actorRole: "reviewer",
        priorStatus: "checked",
        resultingStatus: "approved",
        correlationId: "stage8-correlation-standalone-approval"
      });
    },
    ["23514"]
  );

  await expectDatabaseError(
    "forged Reviewer role for Designer approval",
    () =>
      pool.query(
        `INSERT INTO approvals (
           revision_id, decision, actor_id, actor_role, actor_snapshot, correlation_id,
           idempotency_key
         ) VALUES ($1, 'approved', $2, 'reviewer', $3, 'stage8-forged-approval',
                   'stage8-forged-approval')`,
        [ids.readyRevision, ids.designer, { id: ids.designer, role: "reviewer" }]
      ),
    ["42501"]
  );
  await expectCommitError(
    pool,
    "v2 approval decision without its status transition and lifecycle event",
    async (client) => {
      await client.query(
        `INSERT INTO approvals (
           revision_id, decision, actor_id, actor_role, actor_snapshot, correlation_id,
           idempotency_key
         ) VALUES ($1, 'approved', $2, 'reviewer', $3,
                   'stage8-correlation-partial-approval', 'stage8-partial-approval')`,
        [ids.readyRevision, ids.reviewer, { id: ids.reviewer, role: "reviewer" }]
      );
    },
    ["23514"]
  );
  assert.equal(
    (
      await pool.query("SELECT count(*)::integer AS count FROM approvals WHERE revision_id = $1", [
        ids.readyRevision
      ])
    ).rows[0]?.count,
    0,
    "a partial v2 approval decision is rolled back"
  );
  await inTransaction(pool, async (client) => {
    await client.query(
      `INSERT INTO approvals (
         revision_id, decision, actor_id, actor_role, actor_snapshot, comment, correlation_id,
         idempotency_key
       ) VALUES ($1, 'approved', $2, 'reviewer', $3, 'Stage 8 approval',
                 'stage8-correlation-approve-0001', 'stage8-approve-0001')`,
      [
        ids.readyRevision,
        ids.reviewer,
        { id: ids.reviewer, displayName: "Stage 8 reviewer", role: "reviewer" }
      ]
    );
    await client.query(
      "UPDATE revisions SET status = 'approved', approved_at = now(), updated_at = now() WHERE id = $1",
      [ids.readyRevision]
    );
    await insertLifecycleEvent(client, {
      artifacts: readyArtifacts,
      action: "revision.approved",
      actorId: ids.reviewer,
      actorRole: "reviewer",
      priorStatus: "checked",
      resultingStatus: "approved",
      correlationId: "stage8-correlation-approve-0001",
      comment: "Stage 8 approval"
    });
  });
  await expectDatabaseError(
    "approval event mutation",
    () =>
      pool.query("UPDATE approvals SET comment = 'changed' WHERE revision_id = $1", [
        ids.readyRevision
      ]),
    ["55000"]
  );
  await expectDatabaseError(
    "revision lifecycle event mutation",
    () =>
      pool.query(
        "UPDATE revision_lifecycle_events SET metadata = '{\"changed\":true}' WHERE revision_id = $1",
        [ids.readyRevision]
      ),
    ["55000"]
  );

  const immutableBefore = await pool.query<{
    readonly revision: string;
    readonly bom: string;
    readonly events: string;
  }>(
    `SELECT to_jsonb(revision)::text AS revision,
            (SELECT jsonb_agg(to_jsonb(line) ORDER BY line.line_order)::text
               FROM revision_bom_lines_v2 line WHERE line.revision_id = revision.id) AS bom,
            (SELECT jsonb_agg(to_jsonb(event) ORDER BY event.created_at, event.id)::text
               FROM revision_lifecycle_events event WHERE event.revision_id = revision.id) AS events
       FROM revisions revision WHERE revision.id = $1`,
    [ids.readyRevision]
  );
  await pool.query(
    "UPDATE products SET description_en = 'Stage 8 later live description', updated_at = now() WHERE id = $1",
    [ids.product]
  );
  await pool.query(
    `INSERT INTO catalog_versions (
       id,scope,version,label,source_metadata,content_hash,status,import_provenance,
       validation_schema_version,validated_at,validated_content_hash,approved_at,
       approved_content_hash,activated_at,created_by,updated_by
     ) VALUES (
       $1,'stage8-later-substitution','stage8-later-v1','Later synthetic Stage 8 catalog',
       '{"fixture":true,"authoritative":false}',$2,'active',
       '{"kind":"disposableStage8Substitution"}','catalog-import-validation-result/v1',
       now(),$2,now(),$2,now(),$3,$3
     )`,
    [ids.laterCatalog, checksum("later-catalog"), ids.administrator]
  );
  await pool.query(
    `INSERT INTO rule_sets (
       id,scope,version,label,content_hash,schema_version,catalog_version_id,status,
       validated_at,activated_at,provenance,created_by,updated_by
     ) VALUES (
       $1,'stage8-later-substitution','stage8-later-v1','Later synthetic Stage 8 rules',
       $2,'rule-set/v1',$3,'active',now(),now(),
       '{"fixture":true,"authoritative":false,"kind":"disposableStage8Substitution"}',
       $4,$4
     )`,
    [ids.laterRuleSet, checksum("later-rules"), ids.laterCatalog, ids.administrator]
  );
  await pool.query(
    `UPDATE projects
        SET active_catalog_version_id = $2,
            active_rule_set_id = $3,
            updated_at = now(),
            updated_by = $4
      WHERE id = $1`,
    [ids.project, ids.laterCatalog, ids.laterRuleSet, ids.administrator]
  );
  assert.deepEqual(
    (
      await pool.query<{
        readonly current_catalog: string;
        readonly current_rules: string;
        readonly saved_catalog: string;
        readonly saved_rules: string;
      }>(
        `SELECT project.active_catalog_version_id AS current_catalog,
                project.active_rule_set_id AS current_rules,
                revision.catalog_snapshot_id AS saved_catalog,
                revision.rule_snapshot_id AS saved_rules
           FROM projects project
           JOIN revisions revision ON revision.project_id = project.id
          WHERE project.id = $1 AND revision.id = $2`,
        [ids.project, ids.readyRevision]
      )
    ).rows[0],
    {
      current_catalog: ids.laterCatalog,
      current_rules: ids.laterRuleSet,
      saved_catalog: ids.catalog,
      saved_rules: ids.ruleSet
    },
    "a later synthetic catalog/rule substitution changes only the mutable project pins"
  );
  await pool.query(
    `UPDATE project_draft_documents
        SET draft_version = 2,
            payload = payload || '{"laterDraft":true}'::jsonb,
            updated_at = now()
      WHERE project_id = $1`,
    [ids.project]
  );
  await inTransaction(pool, async (client) => {
    await client.query(
      "UPDATE users SET display_name = 'Stage 8 Designer Later', role = 'viewer', updated_at = now(), updated_by = $2 WHERE id = $1",
      [ids.designer, ids.administrator]
    );
    await client.query(
      `INSERT INTO user_administration_audit_events (
         actor_id, actor_role, actor_snapshot, target_user_id, target_user_snapshot, action,
         prior_role, resulting_role, prior_enabled, resulting_enabled, correlation_id,
         outcome, metadata
       ) VALUES ($1, 'administrator', $2, $3, $4, 'user.role_changed', 'designer',
                 'viewer', true, true, 'stage8-correlation-user-role-0001', 'succeeded', $5)`,
      [
        ids.administrator,
        { id: ids.administrator, role: "administrator" },
        ids.designer,
        { id: ids.designer, displayName: "Stage 8 Designer Later", role: "viewer", enabled: true },
        { sessionsRefreshedFromDatabase: true }
      ]
    );
  });
  await expectDatabaseError(
    "user administration audit mutation",
    () =>
      pool.query(
        "UPDATE user_administration_audit_events SET metadata = '{\"changed\":true}' WHERE target_user_id = $1",
        [ids.designer]
      ),
    ["55000"]
  );
  await expectDatabaseError(
    "actorless user creation after bootstrap",
    () =>
      pool.query(
        `INSERT INTO user_administration_audit_events (
           actor_id, actor_role, actor_snapshot, target_user_id, target_user_snapshot,
           action, prior_role, resulting_role, prior_enabled, resulting_enabled,
           correlation_id, outcome
         ) VALUES (
           NULL, NULL, '{}'::jsonb, $1, $2, 'user.created', NULL, 'viewer', NULL, true,
           'stage8-correlation-forged-bootstrap', 'succeeded'
         )`,
        [ids.viewer, { id: ids.viewer, role: "viewer", enabled: true }]
      ),
    ["42501"]
  );
  await expectDatabaseError(
    "forged user administration actor rolls back the user change",
    () =>
      inTransaction(pool, async (client) => {
        await client.query("UPDATE users SET role = 'designer', updated_at = now() WHERE id = $1", [
          ids.viewer
        ]);
        await client.query(
          `INSERT INTO user_administration_audit_events (
             actor_id, actor_role, actor_snapshot, target_user_id, target_user_snapshot,
             action, prior_role, resulting_role, prior_enabled, resulting_enabled,
             correlation_id, outcome
           ) VALUES (
             $1, 'administrator', $2, $3, $4, 'user.role_changed', 'viewer', 'designer',
             true, true, 'stage8-correlation-forged-user-admin', 'succeeded'
           )`,
          [
            ids.reviewer,
            { id: ids.reviewer, role: "administrator" },
            ids.viewer,
            { id: ids.viewer, role: "designer", enabled: true }
          ]
        );
      }),
    ["42501"]
  );
  assert.equal(
    (
      await pool.query<{ readonly role: string }>("SELECT role FROM users WHERE id = $1", [
        ids.viewer
      ])
    ).rows[0]?.role,
    "viewer",
    "an audit write failure aborts its user administration mutation"
  );

  const immutableAfter = await pool.query<{
    readonly revision: string;
    readonly bom: string;
    readonly events: string;
  }>(
    `SELECT to_jsonb(revision)::text AS revision,
            (SELECT jsonb_agg(to_jsonb(line) ORDER BY line.line_order)::text
               FROM revision_bom_lines_v2 line WHERE line.revision_id = revision.id) AS bom,
            (SELECT jsonb_agg(to_jsonb(event) ORDER BY event.created_at, event.id)::text
               FROM revision_lifecycle_events event WHERE event.revision_id = revision.id) AS events
       FROM revisions revision WHERE revision.id = $1`,
    [ids.readyRevision]
  );
  assert.deepEqual(
    immutableAfter.rows[0],
    immutableBefore.rows[0],
    "approved revision, normalized BOM, and lifecycle actor snapshots remain byte-stable"
  );

  const blockingArtifacts = buildRevisionArtifacts({
    revisionId: ids.blockingRevision,
    revisionNumber: 2,
    runId: ids.blockingRun,
    approvalReady: true,
    warnings: [buildBlockingWarning()]
  });
  await inTransaction(pool, async (client) =>
    saveRevision(client, blockingArtifacts, ids.administrator, "administrator")
  );
  await inTransaction(pool, async (client) => {
    await client.query(
      "UPDATE revisions SET status = 'checked', checked_at = now(), updated_at = now() WHERE id = $1",
      [ids.blockingRevision]
    );
    await insertLifecycleEvent(client, {
      artifacts: blockingArtifacts,
      action: "revision.checked",
      actorId: ids.administrator,
      actorRole: "administrator",
      priorStatus: "calculated",
      resultingStatus: "checked",
      correlationId: "stage8-correlation-check-0002"
    });
  });
  await expectDatabaseError(
    "approval-blocking saved warning",
    () =>
      pool.query(
        `INSERT INTO approvals (
           revision_id, decision, actor_id, actor_role, actor_snapshot, correlation_id,
           idempotency_key
         ) VALUES ($1, 'approved', $2, 'administrator', $3,
                   'stage8-correlation-blocked-approval', 'stage8-blocked-approval')`,
        [ids.blockingRevision, ids.administrator, { id: ids.administrator, role: "administrator" }]
      ),
    ["23514"]
  );

  const notReadyArtifacts = buildRevisionArtifacts({
    revisionId: ids.notReadyRevision,
    revisionNumber: 3,
    runId: ids.notReadyRun,
    approvalReady: false
  });
  await inTransaction(pool, async (client) =>
    saveRevision(client, notReadyArtifacts, ids.administrator, "administrator")
  );
  await inTransaction(pool, async (client) => {
    await client.query(
      "UPDATE revisions SET status = 'checked', checked_at = now(), updated_at = now() WHERE id = $1",
      [ids.notReadyRevision]
    );
    await insertLifecycleEvent(client, {
      artifacts: notReadyArtifacts,
      action: "revision.checked",
      actorId: ids.reviewer,
      actorRole: "reviewer",
      priorStatus: "calculated",
      resultingStatus: "checked",
      correlationId: "stage8-correlation-check-0003"
    });
  });
  await expectDatabaseError(
    "saved result not approval ready",
    () =>
      pool.query(
        `INSERT INTO approvals (
           revision_id, decision, actor_id, actor_role, actor_snapshot, correlation_id,
           idempotency_key
         ) VALUES ($1, 'approved', $2, 'reviewer', $3,
                   'stage8-correlation-not-ready', 'stage8-not-ready')`,
        [ids.notReadyRevision, ids.reviewer, { id: ids.reviewer, role: "reviewer" }]
      ),
    ["23514"]
  );

  const privilegeRows = await pool.query<{
    readonly idempotency_select: boolean;
    readonly idempotency_insert: boolean;
    readonly idempotency_update: boolean;
    readonly bom_update: boolean;
    readonly warning_delete: boolean;
    readonly revision_audit_update: boolean;
    readonly user_audit_delete: boolean;
    readonly users_table_update: boolean;
    readonly users_select: boolean;
    readonly users_insert: boolean;
    readonly users_delete: boolean;
    readonly users_truncate: boolean;
    readonly users_role_update: boolean;
    readonly users_enabled_update: boolean;
    readonly users_updated_at_update: boolean;
    readonly users_updated_by_update: boolean;
    readonly users_display_name_update: boolean;
    readonly users_password_update: boolean;
    readonly sessions_table_update: boolean;
    readonly sessions_select: boolean;
    readonly sessions_insert: boolean;
    readonly sessions_delete: boolean;
    readonly sessions_truncate: boolean;
    readonly sessions_revoke_update: boolean;
    readonly sessions_last_seen_update: boolean;
    readonly sessions_expires_update: boolean;
  }>(
    `SELECT
       has_table_privilege('niedax_generator_app','idempotency_records','SELECT') AS idempotency_select,
       has_table_privilege('niedax_generator_app','idempotency_records','INSERT') AS idempotency_insert,
       has_table_privilege('niedax_generator_app','idempotency_records','UPDATE') AS idempotency_update,
       has_table_privilege('niedax_generator_app','revision_bom_lines_v2','UPDATE') AS bom_update,
       has_table_privilege('niedax_generator_app','revision_warnings_v2','DELETE') AS warning_delete,
       has_table_privilege('niedax_generator_app','revision_lifecycle_events','UPDATE') AS revision_audit_update,
       has_table_privilege('niedax_generator_app','user_administration_audit_events','DELETE') AS user_audit_delete,
       has_table_privilege('niedax_generator_app','users','UPDATE') AS users_table_update,
       has_table_privilege('niedax_generator_app','users','SELECT') AS users_select,
       has_table_privilege('niedax_generator_app','users','INSERT') AS users_insert,
       has_table_privilege('niedax_generator_app','users','DELETE') AS users_delete,
       has_table_privilege('niedax_generator_app','users','TRUNCATE') AS users_truncate,
       has_column_privilege('niedax_generator_app','users','role','UPDATE') AS users_role_update,
       has_column_privilege('niedax_generator_app','users','enabled','UPDATE') AS users_enabled_update,
       has_column_privilege('niedax_generator_app','users','updated_at','UPDATE') AS users_updated_at_update,
       has_column_privilege('niedax_generator_app','users','updated_by','UPDATE') AS users_updated_by_update,
       has_column_privilege('niedax_generator_app','users','display_name','UPDATE') AS users_display_name_update,
       has_column_privilege('niedax_generator_app','users','password_hash','UPDATE') AS users_password_update,
       has_table_privilege('niedax_generator_app','sessions','UPDATE') AS sessions_table_update,
       has_table_privilege('niedax_generator_app','sessions','SELECT') AS sessions_select,
       has_table_privilege('niedax_generator_app','sessions','INSERT') AS sessions_insert,
       has_table_privilege('niedax_generator_app','sessions','DELETE') AS sessions_delete,
       has_table_privilege('niedax_generator_app','sessions','TRUNCATE') AS sessions_truncate,
       has_column_privilege('niedax_generator_app','sessions','revoked_at','UPDATE') AS sessions_revoke_update,
       has_column_privilege('niedax_generator_app','sessions','last_seen_at','UPDATE') AS sessions_last_seen_update,
       has_column_privilege('niedax_generator_app','sessions','expires_at','UPDATE') AS sessions_expires_update`
  );
  assert.deepEqual(privilegeRows.rows[0], {
    idempotency_select: true,
    idempotency_insert: true,
    idempotency_update: false,
    bom_update: false,
    warning_delete: false,
    revision_audit_update: false,
    user_audit_delete: false,
    users_table_update: false,
    users_select: true,
    users_insert: true,
    users_delete: false,
    users_truncate: false,
    users_role_update: true,
    users_enabled_update: true,
    users_updated_at_update: true,
    users_updated_by_update: true,
    users_display_name_update: false,
    users_password_update: false,
    sessions_table_update: false,
    sessions_select: true,
    sessions_insert: true,
    sessions_delete: false,
    sessions_truncate: false,
    sessions_revoke_update: true,
    sessions_last_seen_update: true,
    sessions_expires_update: false
  });

  const retained = await pool.query<{
    readonly snapshot_schema_version: string;
    readonly comment: string | null;
    readonly calculation_run_id: string | null;
  }>(
    `SELECT snapshot_schema_version, comment, calculation_run_id
       FROM revisions
      WHERE snapshot_schema_version = 'revision-snapshot/v1'
      ORDER BY created_at
      LIMIT 1`
  );
  assert.deepEqual(retained.rows[0], {
    snapshot_schema_version: "revision-snapshot/v1",
    comment: null,
    calculation_run_id: null
  });

  process.stdout.write(
    "Stage 8 PostgreSQL assertions passed: four roles, retained v1, exact v2 evidence, audit-required sealing, strict lifecycle, approval guards, immutable snapshots, and least privileges.\n"
  );
} finally {
  await pool.end();
}
