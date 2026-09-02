import { createHash } from "node:crypto";

import {
  CalculationInputV1Schema,
  CalculationResultV1Schema,
  type CalculationInputV1,
  type CalculationResultV1,
  type Warning
} from "@niedax/domain";
import type { Pool, PoolClient } from "pg";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

type JsonObject = Record<string, unknown>;

interface SnapshotRow {
  readonly snapshot: JsonObject;
}

interface RevisionIdentityRow {
  readonly id: string;
  readonly revision_number: number;
}

export interface ReplaceCalculationDraftInput {
  readonly projectId: string;
  readonly catalogVersionId: string;
  readonly ruleSetId: string;
  readonly idempotencyKey: string;
  readonly correlationId: string;
  readonly input: unknown;
  readonly result: unknown;
  readonly startedAt: Date;
  readonly completedAt: Date;
}

export interface SaveRevisionInput {
  readonly projectId: string;
  readonly expectedDraftVersion: number;
  readonly expectedLatestRevisionNumber: number;
  readonly idempotencyKey: string;
  readonly correlationId: string;
  readonly name: string | null;
  readonly description: string | null;
  readonly actorId: string | null;
  readonly actorSnapshot: JsonObject;
  readonly input: unknown;
  readonly result: unknown;
}

export interface SavedRevisionIdentity {
  readonly id: string;
  readonly revisionNumber: number;
}

export interface RevisionSnapshotRecord extends SavedRevisionIdentity {
  readonly projectId: string;
  readonly inputChecksum: string;
  readonly snapshotChecksum: string;
  readonly bomChecksum: string;
  readonly inputSnapshot: JsonObject;
  readonly catalogSnapshot: JsonObject;
  readonly ruleTemplateSnapshot: JsonObject;
  readonly calculationResultSnapshot: JsonObject;
}

export interface RecordApprovalInput {
  readonly revisionId: string;
  readonly decision: "approved" | "rejected";
  readonly actorId: string;
  readonly comment: string | null;
  readonly reason: string | null;
  readonly correlationId: string;
  readonly idempotencyKey: string;
}

function requireUuid(value: string, field: string): string {
  if (!UUID.test(value)) throw new Error(`${field} must be a UUID for PostgreSQL persistence`);
  return value;
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  const record = value as JsonObject;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
    .join(",")}}`;
}

function checksum(value: unknown): string {
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

function warningPersistence(warning: Warning): {
  category: string;
  severity: string;
  affectedEntity: string | null;
  affectedEntityId: string | null;
  sourceStatus: string;
} {
  switch (warning.kind) {
    case "validation":
      return {
        category: "validation",
        severity: "error",
        affectedEntity: "field",
        affectedEntityId: warning.path.join("."),
        sourceStatus: "calculated"
      };
    case "projectRule":
      return {
        category: "provisionalProjectRule",
        severity: "warning",
        affectedEntity: "rule",
        affectedEntityId: warning.ruleId,
        sourceStatus: "projectRule"
      };
    case "engineeringReview":
      return {
        category: warning.code.toLocaleUpperCase("en-US").includes("ANCHOR")
          ? "unconfirmedAnchor"
          : "other",
        severity: "engineeringReview",
        affectedEntity: "subject",
        affectedEntityId: warning.subjectRef,
        sourceStatus: "engineeringReview"
      };
    case "manualOverride":
      return {
        category: "manualQuantityOverride",
        severity: "warning",
        affectedEntity: "override",
        affectedEntityId: warning.overrideId,
        sourceStatus: "manual"
      };
    case "catalog":
      return {
        category: "catalogVersionUnconfirmed",
        severity: "warning",
        affectedEntity: "catalogVersion",
        affectedEntityId: warning.catalogSnapshotId,
        sourceStatus: "catalogConfirmed"
      };
  }
}

async function insertWarnings(
  client: PoolClient,
  scope:
    | { readonly calculationDraftId: string; readonly revisionId: null }
    | {
        readonly calculationDraftId: null;
        readonly revisionId: string;
      },
  warnings: CalculationResultV1["warnings"]
): Promise<void> {
  for (const [index, warning] of warnings.entries()) {
    const persistence = warningPersistence(warning);
    await client.query(
      `INSERT INTO warnings (
         calculation_draft_id, revision_id, warning_identity, code, category, severity,
         message_en, affected_entity, affected_entity_id, source_status, snapshot_context
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        scope.calculationDraftId,
        scope.revisionId,
        `${warning.code}:${index}`,
        warning.code,
        persistence.category,
        persistence.severity,
        warning.message,
        persistence.affectedEntity,
        persistence.affectedEntityId,
        persistence.sourceStatus,
        { schemaVersion: "warning-snapshot/v1", warning }
      ]
    );
  }
}

async function loadCatalogSnapshot(
  client: PoolClient,
  input: CalculationInputV1
): Promise<JsonObject> {
  const catalogVersionId = requireUuid(
    input.catalogSnapshot.snapshotId,
    "catalogSnapshot.snapshotId"
  );
  const productIds = input.catalogProducts.map((product) => requireUuid(product.id, "product.id"));
  const result = await client.query<SnapshotRow>(
    `SELECT jsonb_build_object(
       'schemaVersion', 'catalog-revision-snapshot/v1',
       'reference', $2::jsonb,
       'catalogVersion', to_jsonb(catalog_version),
       'products', (
         SELECT coalesce(jsonb_agg(jsonb_build_object(
           'product', to_jsonb(product),
           'attributes', (SELECT coalesce(jsonb_agg(to_jsonb(attribute) ORDER BY attribute.attribute_key), '[]'::jsonb)
                            FROM product_attributes attribute WHERE attribute.product_id = product.id),
           'includedItems', (SELECT coalesce(jsonb_agg(to_jsonb(item) ORDER BY item.id), '[]'::jsonb)
                               FROM included_items item WHERE item.parent_product_id = product.id),
           'sources', (SELECT coalesce(jsonb_agg(to_jsonb(source) ORDER BY source.document_identity, source.source_page), '[]'::jsonb)
                         FROM product_source_links link
                         JOIN product_sources source ON source.id = link.source_id
                        WHERE link.product_id = product.id)
         ) ORDER BY product.product_code), '[]'::jsonb)
         FROM products product WHERE product.id = ANY($1::uuid[])
       )
     ) AS snapshot
     FROM catalog_versions catalog_version
     WHERE catalog_version.id = $3`,
    [productIds, input.catalogSnapshot, catalogVersionId]
  );
  const snapshot = result.rows[0]?.snapshot;
  if (!snapshot) throw new Error("Catalog version was not found while saving the revision");
  const products = snapshot.products;
  if (!Array.isArray(products) || products.length !== productIds.length)
    throw new Error(
      "One or more calculation products are absent from the selected catalog version"
    );
  return snapshot;
}

async function loadRuleTemplateSnapshot(
  client: PoolClient,
  input: CalculationInputV1
): Promise<JsonObject> {
  const ruleSetId = requireUuid(input.ruleSnapshot.snapshotId, "ruleSnapshot.snapshotId");
  const ruleIds = input.rules.map((rule) => requireUuid(rule.id, "rule.id"));
  const templateIds = input.assemblyTemplates.map((template) =>
    requireUuid(template.id, "assemblyTemplate.id")
  );
  const result = await client.query<SnapshotRow>(
    `SELECT jsonb_build_object(
       'schemaVersion', 'rule-template-revision-snapshot/v1',
       'reference', $3::jsonb,
       'ruleSet', to_jsonb(rule_set),
       'rules', (SELECT coalesce(jsonb_agg(to_jsonb(rule) ORDER BY rule.priority, rule.stable_code), '[]'::jsonb)
                   FROM calculation_rules rule WHERE rule.id = ANY($1::uuid[])),
       'assemblyTemplates', (SELECT coalesce(jsonb_agg(jsonb_build_object(
         'template', to_jsonb(template),
         'components', (SELECT coalesce(jsonb_agg(to_jsonb(component) ORDER BY component.sequence), '[]'::jsonb)
                          FROM template_components component WHERE component.template_id = template.id)
       ) ORDER BY template.stable_code), '[]'::jsonb)
         FROM assembly_templates template WHERE template.id = ANY($2::uuid[]))
     ) AS snapshot
     FROM rule_sets rule_set WHERE rule_set.id = $4`,
    [ruleIds, templateIds, input.ruleSnapshot, ruleSetId]
  );
  const snapshot = result.rows[0]?.snapshot;
  if (!snapshot) throw new Error("Rule set was not found while saving the revision");
  const rules = snapshot.rules;
  const templates = snapshot.assemblyTemplates;
  if (!Array.isArray(rules) || rules.length !== ruleIds.length)
    throw new Error("One or more calculation rules are absent from the selected rule set");
  if (!Array.isArray(templates) || templates.length !== templateIds.length)
    throw new Error("One or more assembly templates are absent from the selected rule set");
  return snapshot;
}

export class PgStage4Repository {
  public constructor(private readonly pool: Pool) {}

  public async replaceCalculationDraft(raw: ReplaceCalculationDraftInput): Promise<string> {
    const input = CalculationInputV1Schema.parse(raw.input);
    const result = CalculationResultV1Schema.parse(raw.result);
    requireUuid(raw.projectId, "projectId");
    requireUuid(raw.catalogVersionId, "catalogVersionId");
    requireUuid(raw.ruleSetId, "ruleSetId");
    if (
      input.project.id !== raw.projectId ||
      result.calculationRunId !== input.invocation.calculationRunId
    )
      throw new Error("Calculation draft identifiers do not match the validated input");
    if (result.inputFingerprint !== input.invocation.inputFingerprint)
      throw new Error("Calculation result fingerprint does not match the validated input");

    return inTransaction(this.pool, async (client) => {
      const lockedProject = await client.query("SELECT id FROM projects WHERE id = $1 FOR UPDATE", [
        raw.projectId
      ]);
      if (lockedProject.rowCount !== 1) throw new Error("Project not found");
      const existing = await client.query<{ id: string }>(
        "SELECT id FROM calculation_drafts WHERE project_id = $1",
        [raw.projectId]
      );
      const draftId = existing.rows[0]?.id;
      if (draftId) {
        await client.query("DELETE FROM warnings WHERE calculation_draft_id = $1", [draftId]);
        await client.query(
          `UPDATE calculation_drafts SET
             calculation_schema_version = $2, engine_version = $3, input_fingerprint = $4,
             idempotency_key = $5, catalog_version_id = $6, rule_set_id = $7,
             status = 'succeeded', correlation_id = $8, input_payload = $9,
             result_schema_version = $10, result_payload = $11, started_at = $12,
             completed_at = $13, failure_code = NULL, updated_at = now()
           WHERE id = $1`,
          [
            draftId,
            input.schemaVersion,
            result.engineVersion,
            input.invocation.inputFingerprint,
            raw.idempotencyKey,
            raw.catalogVersionId,
            raw.ruleSetId,
            raw.correlationId,
            input,
            result.schemaVersion,
            result,
            raw.startedAt,
            raw.completedAt
          ]
        );
        await insertWarnings(
          client,
          { calculationDraftId: draftId, revisionId: null },
          result.warnings
        );
        return draftId;
      }

      const inserted = await client.query<{ id: string }>(
        `INSERT INTO calculation_drafts (
           project_id, calculation_schema_version, engine_version, input_fingerprint,
           idempotency_key, catalog_version_id, rule_set_id, status, correlation_id,
           input_payload, result_schema_version, result_payload, started_at, completed_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'succeeded', $8, $9, $10, $11, $12, $13)
         RETURNING id`,
        [
          raw.projectId,
          input.schemaVersion,
          result.engineVersion,
          input.invocation.inputFingerprint,
          raw.idempotencyKey,
          raw.catalogVersionId,
          raw.ruleSetId,
          raw.correlationId,
          input,
          result.schemaVersion,
          result,
          raw.startedAt,
          raw.completedAt
        ]
      );
      const insertedId = inserted.rows[0]?.id;
      if (!insertedId) throw new Error("Calculation draft insert returned no ID");
      await insertWarnings(
        client,
        { calculationDraftId: insertedId, revisionId: null },
        result.warnings
      );
      return insertedId;
    });
  }

  public async saveRevision(raw: SaveRevisionInput): Promise<SavedRevisionIdentity> {
    const input = CalculationInputV1Schema.parse(raw.input);
    const result = CalculationResultV1Schema.parse(raw.result);
    requireUuid(raw.projectId, "projectId");
    if (raw.actorId !== null) requireUuid(raw.actorId, "actorId");
    if (
      input.project.id !== raw.projectId ||
      input.project.draftVersion !== raw.expectedDraftVersion
    )
      throw new Error("Revision input does not match the expected project draft");
    if (result.inputFingerprint !== input.invocation.inputFingerprint)
      throw new Error("Revision result fingerprint does not match its validated input");

    return inTransaction(this.pool, async (client) => {
      const replay = await client.query<RevisionIdentityRow>(
        `SELECT id, revision_number FROM revisions
          WHERE project_id = $1 AND idempotency_key = $2
            AND snapshot_schema_version = 'revision-snapshot/v1'`,
        [raw.projectId, raw.idempotencyKey]
      );
      if (replay.rows[0])
        return { id: replay.rows[0].id, revisionNumber: replay.rows[0].revision_number };

      const project = await client.query<{ draft_version: number }>(
        "SELECT draft_version FROM projects WHERE id = $1 FOR UPDATE",
        [raw.projectId]
      );
      const draftVersion = project.rows[0]?.draft_version;
      if (draftVersion === undefined) throw new Error("Project not found");
      if (draftVersion !== raw.expectedDraftVersion)
        throw new Error("Project draft version is stale");
      const latest = await client.query<{ latest: number }>(
        "SELECT coalesce(max(revision_number), 0)::integer AS latest FROM revisions WHERE project_id = $1",
        [raw.projectId]
      );
      const latestNumber = latest.rows[0]?.latest ?? 0;
      if (latestNumber !== raw.expectedLatestRevisionNumber)
        throw new Error("Latest project revision number is stale");

      const catalogSnapshot = await loadCatalogSnapshot(client, input);
      const ruleTemplateSnapshot = await loadRuleTemplateSnapshot(client, input);
      const inputChecksum = checksum(input);
      const snapshotChecksum = checksum({ catalogSnapshot, ruleTemplateSnapshot });
      const bomChecksum = checksum(result.bomLines);
      const inserted = await client.query<RevisionIdentityRow>(
        `INSERT INTO revisions (
           project_id, revision_number, name, description, status, calculation_schema_version,
           engine_version, snapshot_schema_version, input_fingerprint, input_checksum,
           snapshot_checksum, bom_checksum, input_snapshot, catalog_snapshot,
           rule_template_snapshot, calculation_result_snapshot, idempotency_key, correlation_id,
           created_by, created_by_snapshot
         ) VALUES ($1, $2, $3, $4, 'calculated', $5, $6, 'revision-snapshot/v1', $7, $8,
                   $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
         RETURNING id, revision_number`,
        [
          raw.projectId,
          latestNumber + 1,
          raw.name,
          raw.description,
          input.schemaVersion,
          result.engineVersion,
          result.inputFingerprint,
          inputChecksum,
          snapshotChecksum,
          bomChecksum,
          input,
          catalogSnapshot,
          ruleTemplateSnapshot,
          result,
          raw.idempotencyKey,
          raw.correlationId,
          raw.actorId,
          raw.actorSnapshot
        ]
      );
      const revision = inserted.rows[0];
      if (!revision) throw new Error("Revision insert returned no row");

      for (const [lineOrder, line] of result.bomLines.entries()) {
        const liveProductId =
          line.kind === "catalog" ? requireUuid(line.productId, "bomLine.productId") : null;
        const productSnapshot =
          line.kind === "catalog"
            ? ((catalogSnapshot.products as JsonObject[]).find((item) => {
                const product = item.product as JsonObject | undefined;
                return product?.id === line.productId;
              }) ?? {})
            : { schemaVersion: "manual-product-snapshot/v1", productCode: line.productCode };
        await client.query(
          `INSERT INTO bom_lines (
             revision_id, line_identity, line_order, category, live_product_id, product_snapshot,
             product_code, description_en, technical_quantity, reserve_quantity,
             packaging_quantity, package_size, ordered_packages, order_quantity, spare_quantity,
             unit, included_items_snapshot, source_snapshot, origin, rule_template_snapshot,
             manual_adjustment_snapshot
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
                     $15, $16, $17, $18, $19, $20, $21)`,
          [
            revision.id,
            line.id,
            lineOrder,
            line.category,
            liveProductId,
            productSnapshot,
            line.productCode,
            line.descriptionEn,
            line.technicalQuantity.value,
            line.spareQuantity.value,
            line.packagingQuantity.value,
            line.packageSize.value,
            line.packageCount.value,
            line.orderedQuantity.value,
            line.spareQuantity.value,
            line.technicalQuantity.unit,
            line.includedItems,
            line.source,
            line.status,
            line.provenance,
            line.quantityOverride
          ]
        );
      }
      await insertWarnings(
        client,
        { calculationDraftId: null, revisionId: revision.id },
        result.warnings
      );
      return { id: revision.id, revisionNumber: revision.revision_number };
    });
  }

  public async findRevisionSnapshot(revisionId: string): Promise<RevisionSnapshotRecord | null> {
    requireUuid(revisionId, "revisionId");
    const result = await this.pool.query<{
      id: string;
      project_id: string;
      revision_number: number;
      input_checksum: string;
      snapshot_checksum: string;
      bom_checksum: string;
      input_snapshot: JsonObject;
      catalog_snapshot: JsonObject;
      rule_template_snapshot: JsonObject;
      calculation_result_snapshot: JsonObject;
    }>(
      `SELECT id, project_id, revision_number, input_checksum, snapshot_checksum, bom_checksum,
              input_snapshot, catalog_snapshot, rule_template_snapshot, calculation_result_snapshot
         FROM revisions WHERE id = $1`,
      [revisionId]
    );
    const row = result.rows[0];
    return row
      ? {
          id: row.id,
          revisionNumber: row.revision_number,
          projectId: row.project_id,
          inputChecksum: row.input_checksum,
          snapshotChecksum: row.snapshot_checksum,
          bomChecksum: row.bom_checksum,
          inputSnapshot: row.input_snapshot,
          catalogSnapshot: row.catalog_snapshot,
          ruleTemplateSnapshot: row.rule_template_snapshot,
          calculationResultSnapshot: row.calculation_result_snapshot
        }
      : null;
  }

  public async recordApproval(raw: RecordApprovalInput): Promise<string> {
    requireUuid(raw.revisionId, "revisionId");
    requireUuid(raw.actorId, "actorId");
    return inTransaction(this.pool, async (client) => {
      const replay = await client.query<{ id: string }>(
        "SELECT id FROM approvals WHERE revision_id = $1 AND idempotency_key = $2",
        [raw.revisionId, raw.idempotencyKey]
      );
      if (replay.rows[0]) return replay.rows[0].id;
      const actor = await client.query<{
        username: string;
        display_name: string;
        role: "administrator" | "reviewer";
        enabled: boolean;
      }>("SELECT username, display_name, role, enabled FROM users WHERE id = $1", [raw.actorId]);
      const authorizedActor = actor.rows[0];
      if (
        !authorizedActor?.enabled ||
        !["administrator", "reviewer"].includes(authorizedActor.role)
      )
        throw new Error("Actor is not authorized to approve revisions");
      const revision = await client.query<{ status: string }>(
        "SELECT status FROM revisions WHERE id = $1 FOR UPDATE",
        [raw.revisionId]
      );
      const status = revision.rows[0]?.status;
      if (!status) throw new Error("Revision not found");
      if (raw.decision === "approved" && status !== "checked")
        throw new Error("Only a checked saved revision can be approved");
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO approvals (
           revision_id, decision, actor_id, actor_role, actor_snapshot, comment, reason,
           correlation_id, idempotency_key
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [
          raw.revisionId,
          raw.decision,
          raw.actorId,
          authorizedActor.role,
          {
            username: authorizedActor.username,
            displayName: authorizedActor.display_name,
            role: authorizedActor.role
          },
          raw.comment,
          raw.reason,
          raw.correlationId,
          raw.idempotencyKey
        ]
      );
      if (raw.decision === "approved") {
        await client.query(
          "UPDATE revisions SET status = 'approved', approved_at = now(), updated_at = now() WHERE id = $1",
          [raw.revisionId]
        );
      }
      const approvalId = inserted.rows[0]?.id;
      if (!approvalId) throw new Error("Approval insert returned no ID");
      return approvalId;
    });
  }
}
