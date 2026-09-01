import type {
  CalculationDraftV2,
  CalculationInputV2,
  CalculationResultV2,
  ProjectDraftInputV2,
  ProjectDraftResponseV2,
  ProjectListItemV2,
  ProjectV2
} from "@niedax/domain";
import type { Pool, PoolClient } from "pg";

import type { AppRole } from "./domain.js";
import { ProjectApplicationError } from "./project-errors.js";

const PROJECT_DRAFT_DOCUMENT_V2 = "project-draft-document/v2" as const;

export interface ProjectActor {
  readonly id: string;
  readonly role: AppRole;
  readonly displayName: string;
}

interface ProjectRow {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly status: ProjectV2["status"];
  readonly default_locale: "bg" | "en";
  readonly default_spare_percent: string;
  readonly cable_load_kg_per_m: string | null;
  readonly draft_version: number;
  readonly owner_id: string | null;
  readonly owner_display_name: string | null;
  readonly active_catalog_version_id: string;
  readonly catalog_version: string;
  readonly catalog_content_hash: string;
  readonly active_rule_set_id: string;
  readonly rule_set_version: string;
  readonly rule_set_content_hash: string;
  readonly created_at: Date;
  readonly updated_at: Date;
  readonly payload: unknown;
}

interface ProjectListRow {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly status: ProjectV2["status"];
  readonly default_locale: "bg" | "en";
  readonly default_spare_percent: string;
  readonly owner_id: string | null;
  readonly owner_display_name: string | null;
  readonly editor_state: "editable" | "retainedReadOnly";
  readonly draft_version: number;
  readonly created_at: Date;
  readonly updated_at: Date;
}

export interface ProjectRecord {
  readonly id: string;
  readonly status: ProjectV2["status"];
  readonly draftVersion: number;
  readonly ownerId: string | null;
  readonly ownerDisplayName: string | null;
  readonly catalogVersionId: string;
  readonly catalogVersion: string;
  readonly catalogContentHash: string;
  readonly ruleSetId: string;
  readonly ruleSetVersion: string;
  readonly ruleSetContentHash: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly document: unknown;
}

export interface CatalogPairRow {
  readonly catalog_id: string;
  readonly catalog_version: string;
  readonly catalog_content_hash: string;
  readonly catalog_status: string;
  readonly rule_set_id: string;
  readonly rule_set_version: string;
  readonly rule_set_content_hash: string;
  readonly rule_set_status: string;
}

export interface CatalogProductRow {
  readonly id: string;
  readonly product_code: string;
  readonly description_en: string;
  readonly category: string;
  readonly family: string | null;
  readonly series: string | null;
  readonly material: string | null;
  readonly coating: string | null;
  readonly base_unit: string;
  readonly minimum_package_quantity: string | null;
  readonly packaging_unit: string | null;
  readonly availability_status: string;
  readonly is_orderable: boolean;
  readonly engineering_verification_required: boolean;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly source_id: string;
  readonly source_document: string;
  readonly source_page: string;
}

export interface IncludedItemRow {
  readonly id: string;
  readonly parent_product_id: string;
  readonly included_product_id: string;
  readonly included_quantity: string;
  readonly unit: string;
  readonly source_id: string;
  readonly source_document: string;
  readonly source_page: string;
}

export interface CompatibilityRuleRow {
  readonly id: string;
  readonly stable_code: string;
  readonly version: string;
  readonly decision: "allowed" | "disallowed" | "conditional";
  readonly confidence:
    "catalogConfirmed" | "calculated" | "projectRule" | "engineeringReview" | "manual";
  readonly condition_payload: Readonly<Record<string, unknown>>;
  readonly outcome_payload: Readonly<Record<string, unknown>>;
  readonly source_id: string | null;
  readonly source_document: string | null;
  readonly source_page: string | null;
}

export interface CalculationRuleRow {
  readonly id: string;
  readonly stable_code: string;
  readonly version: string;
  readonly rule_type: string;
  readonly status: string;
  readonly parameter_schema_version: string;
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly confidence:
    "catalogConfirmed" | "calculated" | "projectRule" | "engineeringReview" | "manual";
  readonly source_id: string | null;
  readonly source_document: string | null;
  readonly source_page: string | null;
}

export interface TemplateRow {
  readonly id: string;
  readonly stable_code: string;
  readonly version: string;
  readonly status: string;
  readonly template_type: string;
  readonly name_en: string;
  readonly applicability: Readonly<Record<string, unknown>>;
  readonly source_id: string | null;
  readonly source_document: string | null;
  readonly source_page: string | null;
}

export interface TemplateComponentRow {
  readonly id: string;
  readonly template_id: string;
  readonly component_role: string;
  readonly product_id: string;
  readonly quantity: string | null;
  readonly quantity_expression: Readonly<Record<string, unknown>> | null;
  readonly unit: string;
  readonly suppress_when_included: boolean;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface CatalogContextRecord {
  readonly pair: CatalogPairRow;
  readonly products: readonly CatalogProductRow[];
  readonly includedItems: readonly IncludedItemRow[];
  readonly compatibilityRules: readonly CompatibilityRuleRow[];
  readonly calculationRules: readonly CalculationRuleRow[];
  readonly templates: readonly TemplateRow[];
  readonly templateComponents: readonly TemplateComponentRow[];
}

export interface ProjectCalculationContext {
  readonly project: ProjectRecord;
  readonly catalog: CatalogContextRecord;
}

interface IdempotencyRow {
  readonly request_hash: string;
  readonly response_status: number;
  readonly response_payload: unknown;
}

interface ProjectMutationResult {
  readonly statusCode: number;
  readonly response: ProjectDraftResponseV2;
  readonly replayed: boolean;
}

export interface CalculationMutationResult {
  readonly statusCode: number;
  readonly response: unknown;
  readonly replayed: boolean;
}

function asIso(value: Date): string {
  return value.toISOString();
}

function authorize(row: { readonly owner_id: string | null }, actor: ProjectActor): void {
  if (actor.role !== "administrator" && row.owner_id !== actor.id) {
    throw new ProjectApplicationError(403, "FORBIDDEN", "Project access is forbidden");
  }
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

async function inReadTransaction<T>(
  pool: Pool,
  operation: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
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
): Promise<IdempotencyRow | null> {
  const result = await client.query<IdempotencyRow>(
    `SELECT request_hash, response_status, response_payload
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
  return existing;
}

async function recordIdempotency(
  client: PoolClient,
  input: {
    readonly scope: string;
    readonly key: string;
    readonly requestHash: string;
    readonly resourceType: string;
    readonly resourceId: string;
    readonly responseStatus: number;
    readonly responseSchemaVersion: string;
    readonly response: unknown;
  }
): Promise<void> {
  await client.query(
    `INSERT INTO idempotency_records (
       scope, idempotency_key, request_hash, resource_type, resource_id, response_status,
       response_schema_version, response_payload
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      input.scope,
      input.key,
      input.requestHash,
      input.resourceType,
      input.resourceId,
      input.responseStatus,
      input.responseSchemaVersion,
      input.response
    ]
  );
}

async function activePair(client: PoolClient): Promise<CatalogPairRow> {
  const result = await client.query<CatalogPairRow>(
    `SELECT catalog.id AS catalog_id, catalog.version AS catalog_version,
            catalog.content_hash AS catalog_content_hash, catalog.status AS catalog_status,
            rules.id AS rule_set_id, rules.version AS rule_set_version,
            rules.content_hash AS rule_set_content_hash, rules.status AS rule_set_status
       FROM catalog_versions catalog
       JOIN rule_sets rules ON rules.catalog_version_id = catalog.id AND rules.status = 'active'
      WHERE catalog.status = 'active'
      ORDER BY catalog.activated_at DESC NULLS LAST, rules.activated_at DESC NULLS LAST,
               catalog.id, rules.id
      LIMIT 1`
  );
  const pair = result.rows[0];
  if (pair) return pair;
  const catalog = await client.query(
    "SELECT 1 FROM catalog_versions WHERE status = 'active' LIMIT 1"
  );
  if (!catalog.rowCount) {
    throw new ProjectApplicationError(
      409,
      "CATALOG_SNAPSHOT_MISSING",
      "No active catalog snapshot is available"
    );
  }
  throw new ProjectApplicationError(
    409,
    "RULE_SNAPSHOT_MISSING",
    "No active rule snapshot is available for the active catalog"
  );
}

async function pinnedPair(
  client: PoolClient,
  catalogVersionId: string,
  ruleSetId: string
): Promise<CatalogPairRow> {
  const result = await client.query<CatalogPairRow>(
    `SELECT catalog.id AS catalog_id, catalog.version AS catalog_version,
            catalog.content_hash AS catalog_content_hash, catalog.status AS catalog_status,
            rules.id AS rule_set_id, rules.version AS rule_set_version,
            rules.content_hash AS rule_set_content_hash, rules.status AS rule_set_status
       FROM catalog_versions catalog
       JOIN rule_sets rules ON rules.catalog_version_id = catalog.id
      WHERE catalog.id = $1 AND rules.id = $2
        AND catalog.status = 'active' AND rules.status = 'active'`,
    [catalogVersionId, ruleSetId]
  );
  const pair = result.rows[0];
  if (pair) return pair;
  const catalog = await client.query<{ status: string }>(
    "SELECT status FROM catalog_versions WHERE id = $1",
    [catalogVersionId]
  );
  if (catalog.rows[0]?.status !== "active") {
    throw new ProjectApplicationError(
      409,
      "CATALOG_SNAPSHOT_MISSING",
      "The project catalog snapshot is no longer active"
    );
  }
  throw new ProjectApplicationError(
    409,
    "RULE_SNAPSHOT_MISSING",
    "The project rule snapshot is no longer active"
  );
}

async function loadCatalogRows(
  client: PoolClient,
  pair: CatalogPairRow
): Promise<CatalogContextRecord> {
  const products = await client.query<CatalogProductRow>(
    `SELECT product.id, product.product_code, product.description_en, product.category,
                product.family, product.series, product.material, product.coating,
                product.base_unit::text AS base_unit,
                product.minimum_package_quantity::text, product.packaging_unit::text,
                product.availability_status, product.is_orderable,
                product.engineering_verification_required, product.metadata,
                source.id AS source_id, source.title AS source_document,
                source.source_page
           FROM products product
           JOIN LATERAL (
             SELECT product_source.id, product_source.title, product_source.source_page
               FROM product_source_links link
               JOIN product_sources product_source ON product_source.id = link.source_id
              WHERE link.product_id = product.id
              ORDER BY link.is_primary DESC, product_source.verification_status = 'verified' DESC,
                       product_source.id
              LIMIT 1
           ) source ON true
          WHERE product.catalog_version_id = $1
          ORDER BY product.product_code, product.id`,
    [pair.catalog_id]
  );
  const includedItems = await client.query<IncludedItemRow>(
    `SELECT item.id, item.parent_product_id, item.included_product_id,
                item.included_quantity::text, item.unit::text,
                source.id AS source_id, source.title AS source_document, source.source_page
           FROM included_items item
           JOIN product_sources source ON source.id = item.source_id
          WHERE item.catalog_version_id = $1 AND item.included_product_id IS NOT NULL
          ORDER BY item.parent_product_id, item.id`,
    [pair.catalog_id]
  );
  const compatibilityRules = await client.query<CompatibilityRuleRow>(
    `SELECT rule.id, rule.stable_code, rule.version, rule.decision, rule.confidence,
                rule.condition_payload, rule.outcome_payload, source.id AS source_id,
                source.title AS source_document, source.source_page
           FROM compatibility_rules rule
           LEFT JOIN product_sources source ON source.id = rule.source_id
          WHERE rule.rule_set_id = $1 AND rule.status = 'active'
          ORDER BY rule.priority, rule.stable_code, rule.id`,
    [pair.rule_set_id]
  );
  const calculationRules = await client.query<CalculationRuleRow>(
    `SELECT rule.id, rule.stable_code, rule.version, rule.rule_type, rule.status,
                rule.parameter_schema_version, rule.parameters, rule.confidence,
                source.id AS source_id, source.title AS source_document, source.source_page
           FROM calculation_rules rule
           LEFT JOIN product_sources source ON source.id = rule.source_id
          WHERE rule.rule_set_id = $1 AND rule.status = 'active'
          ORDER BY rule.priority, rule.stable_code, rule.id`,
    [pair.rule_set_id]
  );
  const templates = await client.query<TemplateRow>(
    `SELECT template.id, template.stable_code, template.version, template.status,
                template.template_type,
                template.name_en, template.applicability, source.id AS source_id,
                source.title AS source_document, source.source_page
           FROM assembly_templates template
           LEFT JOIN product_sources source ON source.id = template.source_id
          WHERE template.catalog_version_id = $1 AND template.rule_set_id = $2
            AND template.status = 'active'
          ORDER BY template.stable_code, template.id`,
    [pair.catalog_id, pair.rule_set_id]
  );
  const templateComponents = await client.query<TemplateComponentRow>(
    `SELECT component.id, component.template_id, component.component_role,
                component.product_id, component.quantity::text, component.quantity_expression,
                component.unit::text, component.suppress_when_included, component.metadata
           FROM template_components component
           JOIN assembly_templates template ON template.id = component.template_id
          WHERE template.catalog_version_id = $1 AND template.rule_set_id = $2
            AND template.status = 'active' AND component.product_id IS NOT NULL
          ORDER BY component.template_id, component.sequence, component.id`,
    [pair.catalog_id, pair.rule_set_id]
  );
  return {
    pair,
    products: products.rows,
    includedItems: includedItems.rows,
    compatibilityRules: compatibilityRules.rows,
    calculationRules: calculationRules.rows,
    templates: templates.rows,
    templateComponents: templateComponents.rows
  };
}

function canonicalDecimal(value: string): string {
  const stripped = value.includes(".") ? value.replace(/0+$/u, "").replace(/\.$/u, "") : value;
  return stripped.replace(/^0+(?=\d)/u, "") || "0";
}

function requireStage7Document(row: ProjectRow): ProjectRow {
  if (row.payload !== null) return row;
  throw new ProjectApplicationError(
    409,
    "UNSUPPORTED_SCHEMA_VERSION",
    "This retained project is read-only because it has no Stage 7 draft document"
  );
}

function projectFromRow(row: ProjectRow): ProjectRecord {
  return {
    id: row.id,
    status: row.status,
    draftVersion: row.draft_version,
    ownerId: row.owner_id,
    ownerDisplayName: row.owner_display_name,
    catalogVersionId: row.active_catalog_version_id,
    catalogVersion: row.catalog_version,
    catalogContentHash: row.catalog_content_hash,
    ruleSetId: row.active_rule_set_id,
    ruleSetVersion: row.rule_set_version,
    ruleSetContentHash: row.rule_set_content_hash,
    createdAt: asIso(row.created_at),
    updatedAt: asIso(row.updated_at),
    document: row.payload
  };
}

async function lockedProject(
  client: PoolClient,
  projectId: string,
  actor: ProjectActor
): Promise<ProjectRow> {
  const result = await client.query<ProjectRow>(
    `SELECT project.id, project.code, project.name, project.description, project.status,
            project.default_locale, project.default_spare_percent::text,
            project.cable_load_kg_per_m::text,
            project.draft_version, project.owner_id,
            project.active_catalog_version_id, project.active_rule_set_id,
            catalog_snapshot.version AS catalog_version,
            catalog_snapshot.content_hash AS catalog_content_hash,
            rule_snapshot.version AS rule_set_version,
            rule_snapshot.content_hash AS rule_set_content_hash,
            project.created_at, project.updated_at, document.payload,
            owner.display_name AS owner_display_name
       FROM projects project
       LEFT JOIN project_draft_documents document ON document.project_id = project.id
       LEFT JOIN users owner ON owner.id = project.owner_id
       JOIN catalog_versions catalog_snapshot
         ON catalog_snapshot.id = project.active_catalog_version_id
       JOIN rule_sets rule_snapshot ON rule_snapshot.id = project.active_rule_set_id
      WHERE project.id = $1
      FOR UPDATE OF project`,
    [projectId]
  );
  const row = result.rows[0];
  if (!row) {
    throw new ProjectApplicationError(404, "RESOURCE_NOT_FOUND", "Project not found");
  }
  authorize(row, actor);
  if (row.payload === null) {
    throw new ProjectApplicationError(
      409,
      "UNSUPPORTED_SCHEMA_VERSION",
      "This retained project is read-only because it has no Stage 7 draft document"
    );
  }
  return row;
}

async function replaceGraph(
  client: PoolClient,
  projectId: string,
  actorId: string,
  draft: ProjectDraftInputV2
): Promise<void> {
  await client.query("DELETE FROM route_connections WHERE project_id = $1", [projectId]);
  await client.query("DELETE FROM manual_items WHERE project_id = $1", [projectId]);
  await client.query("DELETE FROM routes WHERE project_id = $1", [projectId]);

  for (const [routeIndex, route] of draft.routes.entries()) {
    await client.query(
      `INSERT INTO routes (
         id, project_id, code, name, description, system_series_id, product_family,
         material, coating, nominal_width_mm, nominal_height_mm,
         default_section_length_m, sequence
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NULL,$12)`,
      [
        route.id,
        projectId,
        route.code,
        route.name,
        route.description,
        route.selection.system,
        route.selection.dimensionId,
        route.selection.materialCode,
        route.selection.finishCode,
        route.selection.width?.value ?? null,
        route.selection.height?.value ?? null,
        routeIndex
      ]
    );
    for (const [position, endpoint] of [
      ["start", route.startEndpoint],
      ["end", route.endEndpoint]
    ] as const) {
      await client.query(
        `INSERT INTO route_endpoints (
           id, route_id, project_id, position, endpoint_kind, selected_product_id,
           equipment_reference, custom_description, material_behavior, validation_metadata
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          endpoint.id,
          route.id,
          projectId,
          position,
          endpoint.type,
          endpoint.selectedProductId,
          endpoint.equipmentReference,
          endpoint.customDescription,
          {
            schemaVersion: "project-endpoint-material/v2",
            selectedProductId: endpoint.selectedProductId
          },
          { schemaVersion: "project-endpoint-validation/v2" }
        ]
      );
    }
    for (const [geometryIndex, geometry] of route.geometry.entries()) {
      if (geometry.kind === "straight") {
        await client.query(
          `INSERT INTO segments (
             id, route_id, project_id, sequence, length_m, geometry, section_length_override_m
           ) VALUES ($1,$2,$3,$4,$5,$6,NULL)`,
          [geometry.id, route.id, projectId, geometryIndex, geometry.length.value, geometry]
        );
      } else {
        await client.query(
          `INSERT INTO fittings (
             id, route_id, project_id, fitting_type, sequence, geometry,
             selected_product_id, custom_description, manual_metadata
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            geometry.id,
            route.id,
            projectId,
            geometry.fittingType,
            geometryIndex,
            geometry,
            geometry.selectedProductId,
            geometry.customDescription,
            { schemaVersion: "project-fitting-draft/v2", draft: geometry }
          ]
        );
      }
    }
    const support = route.supports;
    const wstbQuantity =
      support.wstb?.mode === "one"
        ? "1"
        : support.wstb?.mode === "two"
          ? "2"
          : (support.wstb?.quantityPerSupport ?? null);
    await client.query(
      `INSERT INTO support_configurations (
         route_id, project_id, spacing_m, support_type, assembly_template_id,
         construction_base, anchor_product_id, anchor_size_mm,
         anchors_per_mounting_point, wstb_mode, wstb_quantity_per_support,
         connection_support_behavior, engineering_review_required,
         engineering_review_state, review_reason
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,NULL,$8,$9,$10,'separate',true,'required',$11)`,
      [
        route.id,
        projectId,
        support.spacing?.value ?? null,
        support.supportType,
        support.assemblyTemplateId,
        support.substrate,
        support.anchorProductId,
        support.anchorQuantityOverride?.adjustedPerSupportAxis.value ?? null,
        support.wstb?.mode === "custom" ? "manual" : (support.wstb?.mode ?? null),
        wstbQuantity,
        "Stage 7 retains explicit engineering review boundaries"
      ]
    );
  }

  for (const connection of draft.connections) {
    const physicalMaterialBehavior =
      connection.type === "logicalContinuation"
        ? "none"
        : connection.type === "physicalSplice"
          ? "connector"
          : connection.type === "custom"
            ? "custom"
            : "fitting";
    await client.query(
      `INSERT INTO route_connections (
         id, project_id, connection_type, physical_material_behavior, support_behavior,
         supports_before, supports_after, connector_product_id, fitting_product_id,
         notes, created_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        connection.id,
        projectId,
        connection.type,
        physicalMaterialBehavior,
        connection.supportBehavior,
        connection.supportsBefore.value,
        connection.supportsAfter.value,
        physicalMaterialBehavior === "connector" ? connection.materialProductId : null,
        physicalMaterialBehavior === "fitting" ? connection.materialProductId : null,
        JSON.stringify({
          schemaVersion: "project-connection-draft/v2",
          physicalBreak: connection.physicalBreak,
          connectorCorrections: connection.connectorCorrections,
          customMaterialProductId:
            physicalMaterialBehavior === "custom" ? connection.materialProductId : null
        }),
        actorId
      ]
    );
    for (const [participantIndex, participant] of connection.participants.entries()) {
      await client.query(
        `INSERT INTO route_connection_endpoints (
           connection_id, endpoint_id, project_id, participant_order, participant_role
         ) VALUES ($1,$2,$3,$4,$5)`,
        [
          connection.id,
          participant.endpointId,
          projectId,
          participantIndex,
          participantIndex === 0 ? "from" : participantIndex === 1 ? "to" : "branch"
        ]
      );
    }
  }

  for (const item of draft.manualItems) {
    await client.query(
      `INSERT INTO manual_items (
         id, project_id, catalog_product_id, free_text_description, quantity, unit,
         reason, note, reserve_applicable, packaging_rounding_applicable,
         origin, status, created_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'user','manual',$11)`,
      [
        item.id,
        projectId,
        item.kind === "catalog" ? item.productId : null,
        item.kind === "freeText" ? item.descriptionEn : null,
        item.quantity.value,
        item.quantity.unit,
        item.reason,
        item.note,
        item.reservePolicy.mode !== "disabled",
        item.packagingPolicy.mode !== "disabled",
        actorId
      ]
    );
  }
}

function projectResponse(
  row: {
    readonly id: string;
    readonly status: ProjectV2["status"];
    readonly draft_version: number;
    readonly created_at: Date;
    readonly updated_at: Date;
  },
  draft: ProjectDraftInputV2,
  correlationId: string,
  owner: { readonly id: string | null; readonly displayName: string | null },
  pair: CatalogPairRow
): ProjectDraftResponseV2 {
  return {
    schemaVersion: "project-draft-response/v2",
    correlationId,
    catalogSnapshot: {
      snapshotId: pair.catalog_id,
      version: pair.catalog_version,
      contentHash: pair.catalog_content_hash
    },
    ruleSnapshot: {
      snapshotId: pair.rule_set_id,
      version: pair.rule_set_version,
      contentHash: pair.rule_set_content_hash
    },
    project: {
      id: row.id,
      status: row.status,
      ownerId: owner.id,
      ownerDisplayName: owner.displayName,
      draftVersion: row.draft_version,
      createdAt: asIso(row.created_at),
      updatedAt: asIso(row.updated_at),
      ...draft
    }
  };
}

function persistenceConflict(error: unknown): never {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { readonly code?: unknown }).code)
      : "";
  const constraint =
    error && typeof error === "object" && "constraint" in error
      ? String((error as { readonly constraint?: unknown }).constraint)
      : "";
  if (code === "23505") {
    const path = constraint.includes("projects_code") ? ["draft", "code"] : ["draft", "routes"];
    throw new ProjectApplicationError(422, "VALIDATION_FAILED", "Project draft is not unique", {
      kind: "validation",
      issues: [{ path, code: "NOT_UNIQUE", message: "Value must be unique" }]
    });
  }
  if (code === "23503" || code === "23514" || code === "22001") {
    throw new ProjectApplicationError(
      422,
      "VALIDATION_FAILED",
      "Project draft references invalid catalog or graph data",
      {
        kind: "validation",
        issues: [
          {
            path: ["draft"],
            code: "INVALID_REFERENCE",
            message: "A selected catalog or graph reference is invalid"
          }
        ]
      }
    );
  }
  throw error;
}

export class PgProjectRepository {
  public constructor(private readonly pool: Pool) {}

  public async listProjects(actor: ProjectActor): Promise<readonly ProjectListItemV2[]> {
    const result = await this.pool.query<ProjectListRow>(
      `SELECT project.id, project.code, project.name, project.description, project.status,
              project.default_locale, project.default_spare_percent::text,
              project.owner_id, owner.display_name AS owner_display_name,
              CASE WHEN document.project_id IS NULL THEN 'retainedReadOnly'
                   ELSE 'editable' END AS editor_state,
              project.draft_version, project.created_at, project.updated_at
         FROM projects project
         LEFT JOIN project_draft_documents document ON document.project_id = project.id
         LEFT JOIN users owner ON owner.id = project.owner_id
        WHERE ($1::boolean OR project.owner_id = $2)
        ORDER BY project.updated_at DESC, project.id`,
      [actor.role === "administrator", actor.id]
    );
    return result.rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description,
      status: row.status,
      defaultLocale: row.default_locale,
      defaultReservePercent: canonicalDecimal(row.default_spare_percent),
      ownerId: row.owner_id,
      ownerDisplayName: row.owner_display_name,
      editorState: row.editor_state,
      draftVersion: row.draft_version,
      createdAt: asIso(row.created_at),
      updatedAt: asIso(row.updated_at)
    }));
  }

  public async getProject(projectId: string, actor: ProjectActor): Promise<ProjectRecord> {
    return inReadTransaction(this.pool, async (client) => {
      const result = await client.query<ProjectRow>(
        `SELECT project.id, project.code, project.name, project.description, project.status,
                project.default_locale, project.default_spare_percent::text,
                project.cable_load_kg_per_m::text,
                project.draft_version, project.owner_id,
                project.active_catalog_version_id, project.active_rule_set_id,
                catalog_snapshot.version AS catalog_version,
                catalog_snapshot.content_hash AS catalog_content_hash,
                rule_snapshot.version AS rule_set_version,
                rule_snapshot.content_hash AS rule_set_content_hash,
                project.created_at, project.updated_at, document.payload,
                owner.display_name AS owner_display_name
           FROM projects project
           LEFT JOIN project_draft_documents document ON document.project_id = project.id
           LEFT JOIN users owner ON owner.id = project.owner_id
           JOIN catalog_versions catalog_snapshot
             ON catalog_snapshot.id = project.active_catalog_version_id
           JOIN rule_sets rule_snapshot ON rule_snapshot.id = project.active_rule_set_id
          WHERE project.id = $1`,
        [projectId]
      );
      const row = result.rows[0];
      if (!row) throw new ProjectApplicationError(404, "RESOURCE_NOT_FOUND", "Project not found");
      authorize(row, actor);
      return projectFromRow(requireStage7Document(row));
    });
  }

  public async createProject(input: {
    readonly actor: ProjectActor;
    readonly draft: ProjectDraftInputV2;
    readonly correlationId: string;
    readonly idempotencyKey: string;
    readonly requestHash: string;
  }): Promise<ProjectMutationResult> {
    try {
      return await inTransaction(this.pool, async (client) => {
        const scope = `project.create:${input.actor.id}`;
        await lockIdempotencyScope(client, scope);
        const existing = await replay(client, scope, input.idempotencyKey, input.requestHash);
        if (existing) {
          return {
            statusCode: existing.response_status,
            response: existing.response_payload as ProjectDraftResponseV2,
            replayed: true
          };
        }
        const pair = await activePair(client);
        const inserted = await client.query<{
          id: string;
          status: ProjectV2["status"];
          draft_version: number;
          created_at: Date;
          updated_at: Date;
        }>(
          `INSERT INTO projects (
             code, name, description, status, default_locale, default_spare_percent,
             cable_load_kg_per_m, draft_version, active_catalog_version_id,
             active_rule_set_id, owner_id, created_by, updated_by
           ) VALUES ($1,$2,$3,'draft',$4,$5,$6,1,$7,$8,$9,$9,$9)
           RETURNING id, status, draft_version, created_at, updated_at`,
          [
            input.draft.code,
            input.draft.name,
            input.draft.description,
            input.draft.defaultLocale,
            input.draft.defaultReservePercent,
            input.draft.cableLoad?.value ?? null,
            pair.catalog_id,
            pair.rule_set_id,
            input.actor.id
          ]
        );
        const row = inserted.rows[0];
        if (!row) throw new Error("Project insert returned no row");
        const document = { schemaVersion: PROJECT_DRAFT_DOCUMENT_V2, draft: input.draft };
        await client.query(
          `INSERT INTO project_draft_documents (project_id, draft_version, schema_version, payload)
           VALUES ($1,$2,$3,$4)`,
          [row.id, row.draft_version, PROJECT_DRAFT_DOCUMENT_V2, document]
        );
        await replaceGraph(client, row.id, input.actor.id, input.draft);
        const response = projectResponse(
          row,
          input.draft,
          input.correlationId,
          {
            id: input.actor.id,
            displayName: input.actor.displayName
          },
          pair
        );
        await client.query(
          `INSERT INTO project_audit_events
             (project_id, actor_id, action, correlation_id, metadata)
           VALUES ($1,$2,'project.created',$3,$4)`,
          [row.id, input.actor.id, input.correlationId, { draftVersion: row.draft_version }]
        );
        await recordIdempotency(client, {
          scope,
          key: input.idempotencyKey,
          requestHash: input.requestHash,
          resourceType: "project",
          resourceId: row.id,
          responseStatus: 201,
          responseSchemaVersion: response.schemaVersion,
          response
        });
        return { statusCode: 201, response, replayed: false };
      });
    } catch (error) {
      return persistenceConflict(error);
    }
  }

  public async replaceProject(input: {
    readonly projectId: string;
    readonly actor: ProjectActor;
    readonly expectedDraftVersion: number;
    readonly draft: ProjectDraftInputV2;
    readonly correlationId: string;
    readonly idempotencyKey: string;
    readonly requestHash: string;
  }): Promise<ProjectMutationResult> {
    try {
      return await inTransaction(this.pool, async (client) => {
        const scope = `project.draft:${input.projectId}:${input.actor.id}`;
        await lockIdempotencyScope(client, scope);
        const current = await lockedProject(client, input.projectId, input.actor);
        const existing = await replay(client, scope, input.idempotencyKey, input.requestHash);
        if (existing) {
          return {
            statusCode: existing.response_status,
            response: existing.response_payload as ProjectDraftResponseV2,
            replayed: true
          };
        }
        if (current.draft_version !== input.expectedDraftVersion) {
          throw new ProjectApplicationError(
            409,
            "CONFLICT_STALE_VERSION",
            "The project draft was changed by another request",
            {
              kind: "conflict",
              expectedVersion: String(input.expectedDraftVersion),
              actualVersion: String(current.draft_version)
            }
          );
        }
        // Saving is the explicit recovery boundary for a mutable draft after catalog
        // activation. Calculations continue to use the already-pinned pair and never
        // rebase implicitly.
        const pair = await activePair(client);
        const updated = await client.query<{
          id: string;
          status: ProjectV2["status"];
          draft_version: number;
          created_at: Date;
          updated_at: Date;
        }>(
          `UPDATE projects
              SET code = $2, name = $3, description = $4, status = 'draft',
                  default_locale = $5, default_spare_percent = $6,
                  cable_load_kg_per_m = $7, draft_version = draft_version + 1,
                  updated_at = now(), updated_by = $8,
                  active_catalog_version_id = $9, active_rule_set_id = $10
            WHERE id = $1
            RETURNING id, status, draft_version, created_at, updated_at`,
          [
            input.projectId,
            input.draft.code,
            input.draft.name,
            input.draft.description,
            input.draft.defaultLocale,
            input.draft.defaultReservePercent,
            input.draft.cableLoad?.value ?? null,
            input.actor.id,
            pair.catalog_id,
            pair.rule_set_id
          ]
        );
        const row = updated.rows[0];
        if (!row) throw new Error("Project update returned no row");
        const document = { schemaVersion: PROJECT_DRAFT_DOCUMENT_V2, draft: input.draft };
        await client.query(
          `INSERT INTO project_draft_documents
             (project_id, draft_version, schema_version, payload)
           VALUES ($1,$2,$3,$4)
           ON CONFLICT (project_id) DO UPDATE SET
             draft_version = EXCLUDED.draft_version,
             schema_version = EXCLUDED.schema_version,
             payload = EXCLUDED.payload,
             updated_at = now()`,
          [input.projectId, row.draft_version, PROJECT_DRAFT_DOCUMENT_V2, document]
        );
        await replaceGraph(client, input.projectId, input.actor.id, input.draft);
        const response = projectResponse(
          row,
          input.draft,
          input.correlationId,
          {
            id: current.owner_id,
            displayName: current.owner_display_name
          },
          pair
        );
        await client.query(
          `INSERT INTO project_audit_events
             (project_id, actor_id, action, correlation_id, metadata)
           VALUES ($1,$2,'project.draft_replaced',$3,$4)`,
          [
            input.projectId,
            input.actor.id,
            input.correlationId,
            {
              priorDraftVersion: current.draft_version,
              draftVersion: row.draft_version,
              priorCatalogVersionId: current.active_catalog_version_id,
              priorRuleSetId: current.active_rule_set_id,
              catalogVersionId: pair.catalog_id,
              ruleSetId: pair.rule_set_id
            }
          ]
        );
        await recordIdempotency(client, {
          scope,
          key: input.idempotencyKey,
          requestHash: input.requestHash,
          resourceType: "projectDraft",
          resourceId: input.projectId,
          responseStatus: 200,
          responseSchemaVersion: response.schemaVersion,
          response
        });
        return { statusCode: 200, response, replayed: false };
      });
    } catch (error) {
      return persistenceConflict(error);
    }
  }

  public async getActiveCatalogContext(): Promise<CatalogContextRecord> {
    return inReadTransaction(this.pool, async (client) => {
      const pair = await activePair(client);
      return loadCatalogRows(client, pair);
    });
  }

  public async getCalculationContext(
    projectId: string,
    actor: ProjectActor
  ): Promise<ProjectCalculationContext> {
    return inReadTransaction(this.pool, async (client) => {
      const result = await client.query<ProjectRow>(
        `SELECT project.id, project.code, project.name, project.description, project.status,
                project.default_locale, project.default_spare_percent::text,
                project.cable_load_kg_per_m::text,
                project.draft_version, project.owner_id,
                project.active_catalog_version_id, project.active_rule_set_id,
                catalog_snapshot.version AS catalog_version,
                catalog_snapshot.content_hash AS catalog_content_hash,
                rule_snapshot.version AS rule_set_version,
                rule_snapshot.content_hash AS rule_set_content_hash,
                project.created_at, project.updated_at, document.payload,
                owner.display_name AS owner_display_name
           FROM projects project
           LEFT JOIN project_draft_documents document ON document.project_id = project.id
           LEFT JOIN users owner ON owner.id = project.owner_id
           JOIN catalog_versions catalog_snapshot
             ON catalog_snapshot.id = project.active_catalog_version_id
           JOIN rule_sets rule_snapshot ON rule_snapshot.id = project.active_rule_set_id
          WHERE project.id = $1`,
        [projectId]
      );
      const row = result.rows[0];
      if (!row) throw new ProjectApplicationError(404, "RESOURCE_NOT_FOUND", "Project not found");
      authorize(row, actor);
      const hydrated = requireStage7Document(row);
      const pair = await pinnedPair(
        client,
        hydrated.active_catalog_version_id,
        hydrated.active_rule_set_id
      );
      return { project: projectFromRow(hydrated), catalog: await loadCatalogRows(client, pair) };
    });
  }

  public async findCalculationReplay(input: {
    readonly projectId: string;
    readonly actor: ProjectActor;
    readonly idempotencyKey: string;
    readonly requestHash: string;
  }): Promise<CalculationMutationResult | null> {
    const project = await this.pool.query<{ owner_id: string | null }>(
      "SELECT owner_id FROM projects WHERE id = $1",
      [input.projectId]
    );
    const current = project.rows[0];
    if (!current) throw new ProjectApplicationError(404, "RESOURCE_NOT_FOUND", "Project not found");
    authorize(current, input.actor);
    const scope = `project.calculate:${input.projectId}:${input.actor.id}`;
    const result = await this.pool.query<IdempotencyRow>(
      `SELECT request_hash, response_status, response_payload
         FROM idempotency_records
        WHERE scope = $1 AND idempotency_key = $2`,
      [scope, input.idempotencyKey]
    );
    const existing = result.rows[0];
    if (!existing) return null;
    if (existing.request_hash !== input.requestHash) {
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
      response: existing.response_payload,
      replayed: true
    };
  }

  public async storeCalculation(input: {
    readonly projectId: string;
    readonly actor: ProjectActor;
    readonly expectedDraftVersion: number;
    readonly catalogVersionId: string;
    readonly ruleSetId: string;
    readonly calculationInput: CalculationInputV2;
    readonly calculation: CalculationDraftV2;
    readonly response: unknown;
    readonly responseSchemaVersion: string;
    readonly correlationId: string;
    readonly idempotencyKey: string;
    readonly requestHash: string;
  }): Promise<CalculationMutationResult> {
    return inTransaction(this.pool, async (client) => {
      const scope = `project.calculate:${input.projectId}:${input.actor.id}`;
      await lockIdempotencyScope(client, scope);
      const current = await lockedProject(client, input.projectId, input.actor);
      const existing = await replay(client, scope, input.idempotencyKey, input.requestHash);
      if (existing) {
        return {
          statusCode: existing.response_status,
          response: existing.response_payload,
          replayed: true
        };
      }
      if (current.draft_version !== input.expectedDraftVersion) {
        throw new ProjectApplicationError(
          409,
          "CONFLICT_STALE_VERSION",
          "The project draft changed while calculation was running",
          {
            kind: "conflict",
            expectedVersion: String(input.expectedDraftVersion),
            actualVersion: String(current.draft_version)
          }
        );
      }
      await pinnedPair(client, input.catalogVersionId, input.ruleSetId);
      await client.query("DELETE FROM calculation_drafts WHERE project_id = $1", [input.projectId]);
      await client.query(
        `INSERT INTO calculation_drafts (
           id, project_id, calculation_schema_version, engine_version, input_fingerprint,
           idempotency_key, catalog_version_id, rule_set_id, status, correlation_id,
           input_payload, result_schema_version, result_payload, started_at, completed_at,
           calculated_draft_version
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'succeeded',$9,$10,$11,$12,$13,$14,$15)`,
        [
          input.calculation.run.id,
          input.projectId,
          input.calculationInput.schemaVersion,
          input.calculation.run.engineVersion,
          input.calculation.run.inputFingerprint,
          input.idempotencyKey,
          input.catalogVersionId,
          input.ruleSetId,
          input.correlationId,
          input.calculationInput,
          input.calculation.result.schemaVersion,
          input.calculation.result,
          input.calculation.run.startedAt,
          input.calculation.run.completedAt,
          input.expectedDraftVersion
        ]
      );
      for (const warning of input.calculation.result.warnings) {
        const category = warning.code.includes("ANCHOR")
          ? "unconfirmedAnchor"
          : warning.kind === "manualOverride"
            ? "manualQuantityOverride"
            : warning.kind === "projectRule"
              ? "provisionalProjectRule"
              : warning.kind === "validation"
                ? "validation"
                : "other";
        await client.query(
          `INSERT INTO warnings (
             calculation_draft_id, warning_identity, code, category, severity, message_en,
             affected_entity, affected_entity_id, affected_field, source_status,
             snapshot_context
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            input.calculation.run.id,
            warning.id,
            warning.code,
            category,
            warning.severity === "blocking" ? "error" : warning.severity,
            warning.effect,
            warning.subject.kind,
            warning.subject.id,
            warning.path?.join(".") ?? null,
            warning.kind === "projectRule"
              ? "projectRule"
              : warning.kind === "manualOverride"
                ? "manual"
                : warning.kind === "engineering"
                  ? "engineeringReview"
                  : "catalogConfirmed",
            { schemaVersion: "calculation-warning/v2", warning }
          ]
        );
      }
      await client.query(
        `INSERT INTO project_audit_events
           (project_id, actor_id, action, correlation_id, metadata)
         VALUES ($1,$2,'project.calculated',$3,$4)`,
        [
          input.projectId,
          input.actor.id,
          input.correlationId,
          {
            draftVersion: input.expectedDraftVersion,
            calculationRunId: input.calculation.run.id,
            inputFingerprint: input.calculation.run.inputFingerprint
          }
        ]
      );
      await recordIdempotency(client, {
        scope,
        key: input.idempotencyKey,
        requestHash: input.requestHash,
        resourceType: "calculationDraft",
        resourceId: input.calculation.run.id,
        responseStatus: 200,
        responseSchemaVersion: input.responseSchemaVersion,
        response: input.response
      });
      return { statusCode: 200, response: input.response, replayed: false };
    });
  }

  public async getCurrentCalculation(
    projectId: string,
    actor: ProjectActor
  ): Promise<CalculationDraftV2 | null> {
    return inReadTransaction(this.pool, async (client) => {
      const projectResult = await client.query<ProjectRow>(
        `SELECT project.id, project.code, project.name, project.description, project.status,
                project.default_locale, project.default_spare_percent::text,
                project.cable_load_kg_per_m::text,
                project.draft_version, project.owner_id,
                project.active_catalog_version_id, project.active_rule_set_id,
                catalog_snapshot.version AS catalog_version,
                catalog_snapshot.content_hash AS catalog_content_hash,
                rule_snapshot.version AS rule_set_version,
                rule_snapshot.content_hash AS rule_set_content_hash,
                project.created_at, project.updated_at, document.payload,
                owner.display_name AS owner_display_name
           FROM projects project
           LEFT JOIN project_draft_documents document ON document.project_id = project.id
           LEFT JOIN users owner ON owner.id = project.owner_id
           JOIN catalog_versions catalog_snapshot
             ON catalog_snapshot.id = project.active_catalog_version_id
           JOIN rule_sets rule_snapshot ON rule_snapshot.id = project.active_rule_set_id
          WHERE project.id = $1`,
        [projectId]
      );
      const projectRow = projectResult.rows[0];
      if (!projectRow)
        throw new ProjectApplicationError(404, "RESOURCE_NOT_FOUND", "Project not found");
      authorize(projectRow, actor);
      const project = projectFromRow(requireStage7Document(projectRow));
      const result = await client.query<{
        id: string;
        calculated_draft_version: number;
        input_fingerprint: string;
        engine_version: string;
        catalog_version_id: string;
        rule_set_id: string;
        started_at: Date;
        completed_at: Date;
        result_payload: CalculationResultV2;
        catalog_version: string;
        catalog_content_hash: string;
        rule_set_version: string;
        rule_set_content_hash: string;
      }>(
        `SELECT draft.id, draft.calculated_draft_version, draft.input_fingerprint,
                draft.engine_version, draft.catalog_version_id, draft.rule_set_id,
                draft.started_at, draft.completed_at, draft.result_payload,
                catalog.version AS catalog_version,
                catalog.content_hash AS catalog_content_hash,
                rules.version AS rule_set_version,
                rules.content_hash AS rule_set_content_hash
           FROM calculation_drafts draft
           JOIN catalog_versions catalog ON catalog.id = draft.catalog_version_id
           JOIN rule_sets rules ON rules.id = draft.rule_set_id
          WHERE draft.project_id = $1 AND draft.status = 'succeeded'
            AND draft.calculation_schema_version = 'calculation-input/v2'
            AND draft.result_schema_version = 'calculation-result/v2'
            AND draft.calculated_draft_version IS NOT NULL`,
        [projectId]
      );
      const row = result.rows[0];
      if (!row || !row.completed_at) return null;
      return {
        projectId,
        draftVersion: row.calculated_draft_version,
        run: {
          id: row.id,
          status: "succeeded",
          inputFingerprint: row.input_fingerprint,
          engineVersion: row.engine_version,
          catalogSnapshot: {
            snapshotId: row.catalog_version_id,
            version: row.catalog_version,
            contentHash: row.catalog_content_hash
          },
          ruleSnapshot: {
            snapshotId: row.rule_set_id,
            version: row.rule_set_version,
            contentHash: row.rule_set_content_hash
          },
          startedAt: asIso(row.started_at),
          completedAt: asIso(row.completed_at)
        },
        result: row.result_payload,
        stale: row.calculated_draft_version !== project.draftVersion
      };
    });
  }
}
