import type { Pool, PoolClient } from "pg";

import {
  CatalogImportError,
  sha256,
  type ActiveCatalogComparison,
  type CatalogPipelineResult,
  type CatalogValidationReport,
  type NormalizedCatalogBundle,
  type ParsedCatalogBundle
} from "@niedax/catalog-import";
import type {
  CatalogAdminRepository,
  CatalogDraftSummary,
  CatalogSelectionOption,
  CatalogSelectableProduct,
  CatalogSelectionFilter,
  CatalogVersionSummary
} from "./catalog-service.js";

interface VersionRow {
  id: string;
  version: string;
  label: string;
  scope: string;
  status: CatalogVersionSummary["status"];
  content_hash: string;
  validated_at: Date | null;
  approved_at: Date | null;
  activated_at: Date | null;
  archived_at: Date | null;
}

interface ImportPayload {
  parsed: ParsedCatalogBundle;
  pipeline: CatalogPipelineResult;
}

async function transaction<T>(
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
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function mapVersion(row: VersionRow): CatalogVersionSummary {
  return {
    id: row.id,
    version: row.version,
    label: row.label,
    scope: row.scope,
    status: row.status,
    contentHash: row.content_hash,
    validatedAt: row.validated_at?.toISOString() ?? null,
    approvedAt: row.approved_at?.toISOString() ?? null,
    activatedAt: row.activated_at?.toISOString() ?? null,
    archivedAt: row.archived_at?.toISOString() ?? null
  };
}

function manifestFor(bundle: NormalizedCatalogBundle) {
  const first = bundle.manifest[0];
  if (!first) throw new CatalogImportError("Validated bundle has no manifest", "INVALID_MANIFEST");
  return first;
}

function canonicalUnit(unit: string | null): string | null {
  if (unit === null) return null;
  if (["pcs", "m", "mm", "kg", "pairs", "Nm"].includes(unit)) return unit;
  throw new CatalogImportError(`Unit ${unit} cannot be persisted`, "UNSUPPORTED_UNIT");
}

async function clearCandidate(client: PoolClient, catalogVersionId: string): Promise<void> {
  await client.query(
    `DELETE FROM template_components
      WHERE catalog_version_id = $1`,
    [catalogVersionId]
  );
  await client.query("DELETE FROM assembly_templates WHERE catalog_version_id = $1", [
    catalogVersionId
  ]);
  await client.query(
    `DELETE FROM compatibility_rules
      WHERE rule_set_id IN (SELECT id FROM rule_sets WHERE catalog_version_id = $1)`,
    [catalogVersionId]
  );
  await client.query(
    `DELETE FROM calculation_rules
      WHERE rule_set_id IN (SELECT id FROM rule_sets WHERE catalog_version_id = $1)`,
    [catalogVersionId]
  );
  await client.query("DELETE FROM rule_sets WHERE catalog_version_id = $1", [catalogVersionId]);
  await client.query("DELETE FROM included_items WHERE catalog_version_id = $1", [
    catalogVersionId
  ]);
  await client.query("DELETE FROM product_source_links WHERE catalog_version_id = $1", [
    catalogVersionId
  ]);
  await client.query("DELETE FROM products WHERE catalog_version_id = $1", [catalogVersionId]);
  await client.query("DELETE FROM product_sources WHERE catalog_version_id = $1", [
    catalogVersionId
  ]);
}

async function materializeCandidate(
  client: PoolClient,
  catalogVersionId: string,
  actorId: string,
  bundle: NormalizedCatalogBundle
): Promise<void> {
  await clearCandidate(client, catalogVersionId);
  const hashes = new Map(bundle.manifest.map((row) => [row.sourceDocument, row.sourceSha256]));
  const editions = new Map(
    bundle.manifest.map((row) => [row.sourceDocument, row.sourceDocumentEdition])
  );
  const sourceIds = new Map<string, string>();
  const sourceKey = (document: string, printedPage: string): string =>
    `${document}\u0000${printedPage}`;
  const sourceRows = [
    ...bundle.products.map((row) => ({
      document: row.sourceDocument,
      printedPage: row.sourcePrintedPage,
      pdfPage: row.sourcePdfPage
    })),
    ...bundle.productAttributes.map((row) => ({
      document: row.sourceDocument,
      printedPage: row.sourcePrintedPage,
      pdfPage: row.sourcePdfPage
    })),
    ...bundle.includedItems.map((row) => ({
      document: row.sourceDocument,
      printedPage: row.sourcePrintedPage,
      pdfPage: row.sourcePdfPage
    })),
    ...bundle.compatibilityRules.map((row) => ({
      document: row.sourceDocument,
      printedPage: row.sourcePrintedPage,
      pdfPage: row.sourcePdfPage
    }))
  ];
  for (const source of sourceRows) {
    const key = sourceKey(source.document, source.printedPage);
    if (sourceIds.has(key)) continue;
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO product_sources (
         catalog_version_id, document_identity, title, edition, source_page, source_pdf_page,
         locale, reference_uri, source_hash, verification_status, verified_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'verified', now())
       RETURNING id`,
      [
        catalogVersionId,
        source.document,
        source.document,
        editions.get(source.document) ?? null,
        source.printedPage,
        source.pdfPage,
        source.document.startsWith("1.-Electrical") ? "en" : "de",
        `repo:docs/catalogs/niedax/source/${source.document}`,
        hashes.get(source.document) ?? null
      ]
    );
    const id = inserted.rows[0]?.id;
    if (!id) throw new Error("Product source insert returned no ID");
    sourceIds.set(key, id);
  }

  const productIds = new Map<string, string>();
  for (const product of bundle.products) {
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO products (
         catalog_version_id, product_code, category, family, series, description_en, material,
         coating, variant_key, base_unit, minimum_package_quantity, packaging_unit, mass_value,
         mass_unit, availability_status, metadata, is_orderable, indoor_only,
         engineering_verification_required, engineering_note, weight_basis_quantity,
         weight_basis_unit, created_by, updated_by
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'active',$15,$16,$17,$18,$19,$20,$21,$22,$22
       ) RETURNING id`,
      [
        catalogVersionId,
        product.code,
        product.category,
        product.productFamily,
        product.system,
        product.descriptionEn,
        product.materialCode,
        product.finishCode,
        [product.heightMm, product.widthMm, product.lengthMm, product.finishCode]
          .filter((value) => value !== null)
          .join("-"),
        canonicalUnit(product.orderUnit),
        product.packQuantity,
        canonicalUnit(product.packUnit),
        product.weightValue,
        product.weightValue === null ? null : "kg",
        {
          semanticHash: product.semanticHash,
          ean: product.ean,
          heightMm: product.heightMm,
          widthMm: product.widthMm,
          lengthMm: product.lengthMm,
          approvalNumber: product.approvalNumber,
          dopNumber: product.dopNumber,
          sourcePrintedPage: product.sourcePrintedPage,
          sourcePdfPage: product.sourcePdfPage,
          sourceTableOrRow: product.sourceTableOrRow
        },
        product.isOrderable,
        product.indoorOnly,
        product.engineeringVerificationRequired,
        product.engineeringNote,
        product.weightBasisQuantity,
        product.weightBasisUnit,
        actorId
      ]
    );
    const id = inserted.rows[0]?.id;
    if (!id) throw new Error("Product insert returned no ID");
    productIds.set(product.lookupKey, id);
    const sourceId = sourceIds.get(sourceKey(product.sourceDocument, product.sourcePrintedPage));
    if (!sourceId) throw new Error(`Source was not materialized for ${product.code}`);
    await client.query(
      `INSERT INTO product_source_links
         (product_id, catalog_version_id, source_id, fact_scope, is_primary)
       VALUES ($1, $2, $3, $4, true)`,
      [
        productIds.get(product.lookupKey),
        catalogVersionId,
        sourceId,
        product.sourceTableOrRow ?? "product"
      ]
    );
  }

  for (const attribute of bundle.productAttributes) {
    const productId = productIds.get(attribute.productCode.toLowerCase());
    const sourceId = sourceIds.get(
      sourceKey(attribute.sourceDocument, attribute.sourcePrintedPage)
    );
    if (!productId || !sourceId)
      throw new Error(`Attribute references unresolved product/source: ${attribute.productCode}`);
    const valueType =
      attribute.valueText !== null
        ? "text"
        : attribute.valueNumber !== null
          ? "numeric"
          : "boolean";
    await client.query(
      `INSERT INTO product_attributes (
         product_id, attribute_key, value_type, value_text, value_numeric, value_boolean,
         unit, source_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        productId,
        attribute.attributeKey,
        valueType,
        attribute.valueText,
        attribute.valueNumber,
        attribute.valueBoolean,
        canonicalUnit(attribute.unit),
        sourceId
      ]
    );
  }

  for (const item of bundle.includedItems) {
    const parentId = productIds.get(item.parentProductCode.toLowerCase());
    const childId = productIds.get(item.includedProductCode.toLowerCase());
    const sourceId = sourceIds.get(sourceKey(item.sourceDocument, item.sourcePrintedPage));
    if (!parentId || !childId || !sourceId)
      throw new Error(`Included item is unresolved: ${item.parentProductCode}`);
    await client.query(
      `INSERT INTO included_items (
         parent_product_id, catalog_version_id, included_product_id, included_item_code,
         included_quantity, unit, applicability_conditions, source_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        parentId,
        catalogVersionId,
        childId,
        item.includedProductCode,
        item.quantity,
        canonicalUnit(item.unit),
        { note: item.note },
        sourceId
      ]
    );
  }

  const manifest = manifestFor(bundle);
  const ruleSet = await client.query<{ id: string }>(
    `INSERT INTO rule_sets (
       scope, version, label, content_hash, schema_version, catalog_version_id, status,
       provenance, created_by, updated_by
     ) VALUES ($1,$2,$3,$4,'rule-set/v1',$5,'draft',$6,$7,$7) RETURNING id`,
    [
      manifest.importScope,
      manifest.candidateCatalogVersion,
      `Catalog compatibility ${manifest.candidateCatalogVersion}`,
      sha256(bundle.compatibilityRules),
      catalogVersionId,
      { catalogContentHash: bundle.contentHash },
      actorId
    ]
  );
  const ruleSetId = ruleSet.rows[0]?.id;
  if (!ruleSetId) throw new Error("Rule-set insert returned no ID");
  for (const [priority, rule] of bundle.compatibilityRules.entries()) {
    const sourceId = sourceIds.get(sourceKey(rule.sourceDocument, rule.sourcePrintedPage));
    await client.query(
      `INSERT INTO compatibility_rules (
         rule_set_id, stable_code, version, status, priority, decision,
         condition_schema_version, condition_payload, outcome_schema_version, outcome_payload,
         reason_en, confidence, source_id, created_by, updated_by
       ) VALUES ($1,$2,$3,'draft',$4,$5,'compatibility-condition/v1',$6,
                 'compatibility-outcome/v1',$7,$8,$9,$10,$11,$11)`,
      [
        ruleSetId,
        rule.ruleCode,
        manifest.candidateCatalogVersion,
        priority,
        rule.allowed ? "allowed" : "disallowed",
        {
          relationType: rule.relationType,
          sourceProductCode: rule.sourceProductCode,
          sourceSelector: rule.sourceSelector,
          system: rule.system,
          heightMm: rule.heightMm,
          widthMm: rule.widthMm,
          materialCode: rule.materialCode,
          finishCode: rule.finishCode
        },
        {
          targetProductCode: rule.targetProductCode,
          targetSelector: rule.targetSelector,
          allowed: rule.allowed
        },
        rule.note ?? "Catalog-confirmed compatibility rule",
        rule.verificationStatus === "verified" ? "catalogConfirmed" : "engineeringReview",
        sourceId ?? null,
        actorId
      ]
    );
  }

  const templateIds = new Map<string, string>();
  for (const template of bundle.assemblyTemplates) {
    const sourceId = sourceIds.get(sourceKey(template.sourceDocument, template.sourcePrintedPage));
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO assembly_templates (
         catalog_version_id, rule_set_id, stable_code, version, status, template_type,
         name_en, description_en, applicability_schema_version, applicability, source_id,
         created_by, updated_by
       ) VALUES ($1,$2,$3,$4,'draft',$5,$6,$7,'assembly-applicability/v1',$8,$9,$10,$10)
       RETURNING id`,
      [
        catalogVersionId,
        ruleSetId,
        template.templateCode,
        manifest.candidateCatalogVersion,
        template.templateType,
        template.nameEn,
        template.engineeringVerificationRequired
          ? "Engineering verification is required before use."
          : "Catalog-confirmed assembly template.",
        {
          system: template.system,
          engineeringVerificationRequired: template.engineeringVerificationRequired
        },
        sourceId ?? null,
        actorId
      ]
    );
    const id = inserted.rows[0]?.id;
    if (!id) throw new Error("Assembly template insert returned no ID");
    templateIds.set(template.templateCode, id);
  }
  for (const [sequence, component] of bundle.templateComponents.entries()) {
    const templateId = templateIds.get(component.templateCode);
    const productId = productIds.get(component.productCode.toLowerCase());
    if (!templateId || !productId)
      throw new Error(`Template component is unresolved: ${component.productCode}`);
    await client.query(
      `INSERT INTO template_components (
         template_id, catalog_version_id, component_role, product_id, quantity, unit,
         sequence, is_required, suppress_when_included, metadata
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8,$9)`,
      [
        templateId,
        catalogVersionId,
        component.componentRole,
        productId,
        component.quantity,
        canonicalUnit(component.unit),
        sequence,
        component.suppressWhenIncluded,
        { quantityMode: component.quantityMode }
      ]
    );
  }
}

export class PgCatalogAdminRepository implements CatalogAdminRepository {
  public constructor(private readonly pool: Pool) {}

  public async getActiveComparison(): Promise<ActiveCatalogComparison | null> {
    const result = await this.pool.query<{ normalized_bundle: ImportPayload }>(
      `SELECT import.normalized_bundle
         FROM catalog_versions version
         JOIN LATERAL (
           SELECT normalized_bundle FROM catalog_imports
            WHERE catalog_version_id = version.id AND status IN ('validated', 'superseded')
            ORDER BY created_at DESC LIMIT 1
         ) import ON true
        WHERE version.status = 'active'
        ORDER BY version.activated_at DESC LIMIT 1`
    );
    const bundle = result.rows[0]?.normalized_bundle.pipeline.bundle;
    if (!bundle) return null;
    return {
      products: bundle.products,
      completeScopes: bundle.manifest
        .filter((row) => row.isFullSnapshot)
        .map((row) => row.importScope)
    };
  }

  public async saveDraft(input: {
    actorId: string;
    correlationId: string;
    fileName: string;
    mediaType: string;
    fileSizeBytes: number;
    parsed: ParsedCatalogBundle;
    pipeline: CatalogPipelineResult;
  }): Promise<CatalogDraftSummary> {
    const manifest = manifestFor(input.pipeline.bundle);
    return transaction(this.pool, async (client) => {
      const existing = await client.query<{ id: string; status: string; content_hash: string }>(
        `SELECT id, status, content_hash FROM catalog_versions
          WHERE scope = $1 AND version = $2 FOR UPDATE`,
        [manifest.importScope, manifest.candidateCatalogVersion]
      );
      let catalogVersionId = existing.rows[0]?.id;
      const priorStatus = existing.rows[0]?.status ?? null;
      let resultingStatus = priorStatus ?? "draft";
      if (!catalogVersionId) {
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO catalog_versions (
             scope, version, label, source_edition, source_metadata, content_hash, status,
             import_provenance, validation_schema_version, created_by, updated_by
           ) VALUES ($1,$2,$3,$4,$5,$6,'draft',$7,'catalog-import/v1',$8,$8)
           RETURNING id`,
          [
            manifest.importScope,
            manifest.candidateCatalogVersion,
            `Niedax managed catalog ${manifest.candidateCatalogVersion}`,
            manifest.sourceDocumentEdition,
            { sources: input.pipeline.bundle.manifest },
            input.pipeline.bundle.contentHash,
            { fileName: input.fileName, correlationId: input.correlationId },
            input.actorId
          ]
        );
        catalogVersionId = inserted.rows[0]?.id;
      } else {
        if (["active", "archived"].includes(priorStatus ?? "")) {
          throw new CatalogImportError(
            "Active or archived catalog content cannot be replaced",
            "CATALOG_IMMUTABLE"
          );
        }
        if (existing.rows[0]?.content_hash !== input.pipeline.bundle.contentHash) {
          await client.query(
            `UPDATE catalog_versions SET
               content_hash = $2, status = 'draft', source_metadata = $3,
               validated_at = NULL, validated_content_hash = NULL, validation_report_id = NULL,
               approved_at = NULL, approved_by = NULL, approved_content_hash = NULL,
               updated_at = now(), updated_by = $4
             WHERE id = $1`,
            [
              catalogVersionId,
              input.pipeline.bundle.contentHash,
              { sources: input.pipeline.bundle.manifest },
              input.actorId
            ]
          );
          resultingStatus = "draft";
          await client.query(
            "UPDATE catalog_imports SET status = 'superseded', updated_at = now() WHERE catalog_version_id = $1 AND status <> 'superseded'",
            [catalogVersionId]
          );
        }
      }
      if (!catalogVersionId) throw new Error("Catalog version insert returned no ID");
      const existingImport = await client.query<{ id: string }>(
        `SELECT id FROM catalog_imports
          WHERE catalog_version_id = $1 AND content_hash = $2`,
        [catalogVersionId, input.pipeline.bundle.contentHash]
      );
      let importId = existingImport.rows[0]?.id;
      if (!importId) {
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO catalog_imports (
             catalog_version_id, file_name, media_type, file_size_bytes, declared_scope,
             content_hash, normalized_bundle, status, created_by
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,'draft',$8) RETURNING id`,
          [
            catalogVersionId,
            input.fileName,
            input.mediaType,
            input.fileSizeBytes,
            manifest.importScope,
            input.pipeline.bundle.contentHash,
            { parsed: input.parsed, pipeline: input.pipeline },
            input.actorId
          ]
        );
        importId = inserted.rows[0]?.id;
        await client.query(
          `INSERT INTO catalog_version_transitions
             (catalog_version_id, prior_state, new_state, actor_id, reason, correlation_id)
           VALUES ($1,$2,'draft',$3,$4,$5)`,
          [
            catalogVersionId,
            priorStatus,
            input.actorId,
            priorStatus
              ? "Draft content replaced; prior validation and approval invalidated"
              : "Catalog draft imported",
            input.correlationId
          ]
        );
      }
      if (!importId) throw new Error("Catalog import insert returned no ID");
      return {
        id: catalogVersionId,
        importId,
        version: manifest.candidateCatalogVersion,
        scope: manifest.importScope,
        status: resultingStatus as CatalogDraftSummary["status"],
        contentHash: input.pipeline.bundle.contentHash,
        report: input.pipeline.report
      };
    });
  }

  public async loadDraft(catalogVersionId: string): Promise<ParsedCatalogBundle | null> {
    const result = await this.pool.query<{ normalized_bundle: ImportPayload }>(
      `SELECT normalized_bundle FROM catalog_imports
        WHERE catalog_version_id = $1 AND status IN ('draft', 'invalid', 'validated')
        ORDER BY created_at DESC LIMIT 1`,
      [catalogVersionId]
    );
    return result.rows[0]?.normalized_bundle.parsed ?? null;
  }

  public async saveValidation(input: {
    catalogVersionId: string;
    actorId: string;
    correlationId: string;
    pipeline: CatalogPipelineResult;
  }): Promise<CatalogDraftSummary> {
    return transaction(this.pool, async (client) => {
      const version = await client.query<{
        status: string;
        content_hash: string;
        version: string;
        scope: string;
      }>(
        "SELECT status, content_hash, version, scope FROM catalog_versions WHERE id = $1 FOR UPDATE",
        [input.catalogVersionId]
      );
      const current = version.rows[0];
      if (!current) throw new CatalogImportError("Catalog version not found", "CATALOG_NOT_FOUND");
      if (current.status !== "draft" && current.status !== "validated") {
        throw new CatalogImportError("Only a draft can be validated", "INVALID_CATALOG_STATE");
      }
      if (current.content_hash !== input.pipeline.bundle.contentHash) {
        throw new CatalogImportError(
          "Draft content changed during validation",
          "CONTENT_HASH_MISMATCH"
        );
      }
      const imported = await client.query<{ id: string }>(
        `SELECT id FROM catalog_imports
          WHERE catalog_version_id = $1 AND content_hash = $2
          ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
        [input.catalogVersionId, input.pipeline.bundle.contentHash]
      );
      const importId = imported.rows[0]?.id;
      if (!importId)
        throw new CatalogImportError("Catalog import not found", "CATALOG_IMPORT_NOT_FOUND");
      let reportResult = await client.query<{ id: string }>(
        "SELECT id FROM catalog_validation_reports WHERE import_id = $1 AND content_hash = $2",
        [importId, input.pipeline.bundle.contentHash]
      );
      let reportId = reportResult.rows[0]?.id;
      if (!reportId) {
        reportResult = await client.query<{ id: string }>(
          `INSERT INTO catalog_validation_reports (
             catalog_version_id, import_id, content_hash, schema_version, is_valid,
             error_count, warning_count, conflict_count, report, created_by
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
          [
            input.catalogVersionId,
            importId,
            input.pipeline.bundle.contentHash,
            input.pipeline.report.schemaVersion,
            input.pipeline.report.valid,
            input.pipeline.report.counts.errors,
            input.pipeline.report.counts.warnings,
            input.pipeline.report.counts.conflicts,
            input.pipeline.report,
            input.actorId
          ]
        );
        reportId = reportResult.rows[0]?.id;
      }
      if (!reportId) throw new Error("Validation report insert returned no ID");
      for (const observation of input.pipeline.bundle.sourceObservations) {
        await client.query(
          `INSERT INTO catalog_source_observations (
             catalog_version_id, validation_report_id, product_code, field_name, value_text,
             source_document, source_printed_page, source_pdf_page,
             is_authoritative_for_candidate, resolution_policy
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           ON CONFLICT (
             validation_report_id, product_code, field_name, source_document,
             source_printed_page, value_text
           ) DO NOTHING`,
          [
            input.catalogVersionId,
            reportId,
            observation.productCode,
            observation.fieldName,
            observation.valueText,
            observation.sourceDocument,
            observation.sourcePrintedPage,
            observation.sourcePdfPage,
            observation.isAuthoritativeForCandidate,
            observation.resolutionPolicy
          ]
        );
      }
      const observationsByField = new Map<
        string,
        typeof input.pipeline.bundle.sourceObservations
      >();
      for (const observation of input.pipeline.bundle.sourceObservations) {
        const key = `${observation.productCode.toLowerCase()}\u0000${observation.fieldName}`;
        observationsByField.set(key, [...(observationsByField.get(key) ?? []), observation]);
      }
      for (const observations of observationsByField.values()) {
        if (new Set(observations.map((observation) => observation.valueText)).size <= 1) continue;
        const selected = observations.find(
          (observation) => observation.isAuthoritativeForCandidate && observation.resolutionPolicy
        );
        if (!selected?.resolutionPolicy) continue;
        await client.query(
          `INSERT INTO catalog_conflict_resolutions (
             catalog_version_id, validation_report_id, conflict_code, product_code, field_name,
             selected_source_document, selected_value, policy_reason, resolved_by, correlation_id
           ) VALUES ($1,$2,'SOURCE_VALUE_CONFLICT',$3,$4,$5,$6,$7,$8,$9)
           ON CONFLICT (validation_report_id, conflict_code, product_code, field_name) DO NOTHING`,
          [
            input.catalogVersionId,
            reportId,
            selected.productCode,
            selected.fieldName,
            selected.sourceDocument,
            selected.valueText,
            selected.resolutionPolicy,
            input.actorId,
            input.correlationId
          ]
        );
      }
      await client.query(
        "UPDATE catalog_imports SET status = $2, updated_at = now() WHERE id = $1",
        [importId, input.pipeline.report.valid ? "validated" : "invalid"]
      );
      if (input.pipeline.report.valid && current.status === "draft") {
        await materializeCandidate(
          client,
          input.catalogVersionId,
          input.actorId,
          input.pipeline.bundle
        );
        await client.query(
          `UPDATE catalog_versions SET status = 'validated', validated_at = now(),
             validated_content_hash = content_hash, validation_report_id = $2,
             updated_at = now(), updated_by = $3 WHERE id = $1`,
          [input.catalogVersionId, reportId, input.actorId]
        );
        await client.query(
          `INSERT INTO catalog_version_transitions
             (catalog_version_id, prior_state, new_state, validation_report_id, actor_id, reason, correlation_id)
           VALUES ($1,'draft','validated',$2,$3,'Validation completed successfully',$4)`,
          [input.catalogVersionId, reportId, input.actorId, input.correlationId]
        );
      }
      return {
        id: input.catalogVersionId,
        importId,
        version: current.version,
        scope: current.scope,
        status: input.pipeline.report.valid ? "validated" : "draft",
        contentHash: input.pipeline.bundle.contentHash,
        report: input.pipeline.report
      };
    });
  }

  public async approve(input: {
    catalogVersionId: string;
    actorId: string;
    correlationId: string;
    reason: string;
    contentHash: string;
  }): Promise<CatalogVersionSummary> {
    return transaction(this.pool, async (client) => {
      const state = await client.query<
        VersionRow & { validation_report_id: string | null; validated_content_hash: string | null }
      >(
        `SELECT id, version, label, scope, status, content_hash, validated_at, approved_at,
                activated_at, archived_at, validation_report_id, validated_content_hash
           FROM catalog_versions WHERE id = $1 FOR UPDATE`,
        [input.catalogVersionId]
      );
      const current = state.rows[0];
      if (!current) throw new CatalogImportError("Catalog version not found", "CATALOG_NOT_FOUND");
      if (current.status === "approved" && current.content_hash === input.contentHash)
        return mapVersion(current);
      if (
        current.status !== "validated" ||
        current.validated_content_hash !== input.contentHash ||
        current.content_hash !== input.contentHash ||
        !current.validation_report_id
      ) {
        throw new CatalogImportError(
          "Approval must match the exact validated content hash",
          "APPROVAL_HASH_MISMATCH"
        );
      }
      const report = await client.query<{ is_valid: boolean }>(
        "SELECT is_valid FROM catalog_validation_reports WHERE id = $1",
        [current.validation_report_id]
      );
      if (!report.rows[0]?.is_valid)
        throw new CatalogImportError("Invalid catalog cannot be approved", "VALIDATION_FAILED");
      const approval = await client.query<{ id: string }>(
        `INSERT INTO catalog_version_approvals (
           catalog_version_id, validation_report_id, content_hash, approved_by, reason, correlation_id
         ) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [
          input.catalogVersionId,
          current.validation_report_id,
          input.contentHash,
          input.actorId,
          input.reason,
          input.correlationId
        ]
      );
      const approvalId = approval.rows[0]?.id;
      if (!approvalId) throw new Error("Catalog approval insert returned no ID");
      const updated = await client.query<VersionRow>(
        `UPDATE catalog_versions SET status = 'approved', approved_at = now(), approved_by = $2,
                approved_content_hash = content_hash, updated_at = now(), updated_by = $2
          WHERE id = $1
          RETURNING id, version, label, scope, status, content_hash, validated_at, approved_at,
                    activated_at, archived_at`,
        [input.catalogVersionId, input.actorId]
      );
      await client.query(
        `INSERT INTO catalog_version_transitions (
           catalog_version_id, prior_state, new_state, validation_report_id, approval_id,
           actor_id, reason, correlation_id
         ) VALUES ($1,'validated','approved',$2,$3,$4,$5,$6)`,
        [
          input.catalogVersionId,
          current.validation_report_id,
          approvalId,
          input.actorId,
          input.reason,
          input.correlationId
        ]
      );
      const row = updated.rows[0];
      if (!row) throw new Error("Catalog approval update returned no row");
      return mapVersion(row);
    });
  }

  public async activate(input: {
    catalogVersionId: string;
    actorId: string;
    correlationId: string;
    reason: string;
    contentHash: string;
  }): Promise<CatalogVersionSummary> {
    return transaction(this.pool, async (client) => {
      const candidate = await client.query<
        VersionRow & { validation_report_id: string | null; approved_content_hash: string | null }
      >(
        `SELECT id, version, label, scope, status, content_hash, validated_at, approved_at,
                activated_at, archived_at, validation_report_id, approved_content_hash
           FROM catalog_versions WHERE id = $1 FOR UPDATE`,
        [input.catalogVersionId]
      );
      const current = candidate.rows[0];
      if (!current) throw new CatalogImportError("Catalog version not found", "CATALOG_NOT_FOUND");
      if (current.status === "active" && current.content_hash === input.contentHash)
        return mapVersion(current);
      if (
        current.status !== "approved" ||
        current.content_hash !== input.contentHash ||
        current.approved_content_hash !== input.contentHash
      ) {
        throw new CatalogImportError(
          "Activation requires approval of the exact content hash",
          "ACTIVATION_HASH_MISMATCH"
        );
      }
      const approval = await client.query<{ id: string }>(
        "SELECT id FROM catalog_version_approvals WHERE catalog_version_id = $1 AND content_hash = $2",
        [input.catalogVersionId, input.contentHash]
      );
      const approvalId = approval.rows[0]?.id;
      if (!approvalId)
        throw new CatalogImportError("Catalog approval was not found", "APPROVAL_NOT_FOUND");
      const previous = await client.query<VersionRow>(
        `SELECT id, version, label, scope, status, content_hash, validated_at, approved_at,
                activated_at, archived_at FROM catalog_versions
          WHERE scope = $1 AND status = 'active' AND id <> $2 FOR UPDATE`,
        [current.scope, input.catalogVersionId]
      );
      for (const active of previous.rows) {
        await client.query(
          "UPDATE catalog_versions SET status = 'archived', archived_at = now(), updated_at = now(), updated_by = $2 WHERE id = $1",
          [active.id, input.actorId]
        );
        await client.query(
          `INSERT INTO catalog_version_transitions
             (catalog_version_id, prior_state, new_state, actor_id, reason, correlation_id)
           VALUES ($1,'active','archived',$2,$3,$4)`,
          [
            active.id,
            input.actorId,
            `Archived atomically while activating ${current.version}: ${input.reason}`,
            input.correlationId
          ]
        );
        await client.query(
          `UPDATE compatibility_rules SET status = 'retired', updated_at = now(), updated_by = $2
            WHERE rule_set_id IN (SELECT id FROM rule_sets WHERE catalog_version_id = $1 AND status = 'active')`,
          [active.id, input.actorId]
        );
        await client.query(
          "UPDATE assembly_templates SET status = 'retired', updated_at = now(), updated_by = $2 WHERE catalog_version_id = $1 AND status = 'active'",
          [active.id, input.actorId]
        );
        await client.query(
          "UPDATE rule_sets SET status = 'archived', archived_at = now(), updated_at = now(), updated_by = $2 WHERE catalog_version_id = $1 AND status = 'active'",
          [active.id, input.actorId]
        );
      }
      await client.query(
        "UPDATE rule_sets SET status = 'active', validated_at = coalesce(validated_at, now()), activated_at = now(), updated_at = now(), updated_by = $2 WHERE catalog_version_id = $1",
        [input.catalogVersionId, input.actorId]
      );
      await client.query(
        "UPDATE compatibility_rules SET status = 'active', updated_at = now(), updated_by = $2 WHERE rule_set_id IN (SELECT id FROM rule_sets WHERE catalog_version_id = $1)",
        [input.catalogVersionId, input.actorId]
      );
      await client.query(
        "UPDATE assembly_templates SET status = 'active', updated_at = now(), updated_by = $2 WHERE catalog_version_id = $1",
        [input.catalogVersionId, input.actorId]
      );
      const updated = await client.query<VersionRow>(
        `UPDATE catalog_versions SET status = 'active', activated_at = now(), updated_at = now(), updated_by = $2
          WHERE id = $1
          RETURNING id, version, label, scope, status, content_hash, validated_at, approved_at,
                    activated_at, archived_at`,
        [input.catalogVersionId, input.actorId]
      );
      await client.query(
        `INSERT INTO catalog_version_transitions (
           catalog_version_id, prior_state, new_state, validation_report_id, approval_id,
           actor_id, reason, correlation_id
         ) VALUES ($1,'approved','active',$2,$3,$4,$5,$6)`,
        [
          input.catalogVersionId,
          current.validation_report_id,
          approvalId,
          input.actorId,
          input.reason,
          input.correlationId
        ]
      );
      const row = updated.rows[0];
      if (!row) throw new Error("Catalog activation update returned no row");
      return mapVersion(row);
    });
  }

  public async archive(input: {
    catalogVersionId: string;
    actorId: string;
    correlationId: string;
    reason: string;
  }): Promise<CatalogVersionSummary> {
    return transaction(this.pool, async (client) => {
      const updated = await client.query<VersionRow>(
        `UPDATE catalog_versions SET status = 'archived', archived_at = now(), updated_at = now(), updated_by = $2
          WHERE id = $1 AND status = 'active'
          RETURNING id, version, label, scope, status, content_hash, validated_at, approved_at,
                    activated_at, archived_at`,
        [input.catalogVersionId, input.actorId]
      );
      const row = updated.rows[0];
      if (!row)
        throw new CatalogImportError(
          "Only an active catalog can be archived",
          "INVALID_CATALOG_STATE"
        );
      await client.query(
        `UPDATE compatibility_rules SET status = 'retired', updated_at = now(), updated_by = $2
          WHERE rule_set_id IN (SELECT id FROM rule_sets WHERE catalog_version_id = $1 AND status = 'active')`,
        [input.catalogVersionId, input.actorId]
      );
      await client.query(
        "UPDATE assembly_templates SET status = 'retired', updated_at = now(), updated_by = $2 WHERE catalog_version_id = $1 AND status = 'active'",
        [input.catalogVersionId, input.actorId]
      );
      await client.query(
        "UPDATE rule_sets SET status = 'archived', archived_at = now(), updated_at = now(), updated_by = $2 WHERE catalog_version_id = $1 AND status = 'active'",
        [input.catalogVersionId, input.actorId]
      );
      await client.query(
        `INSERT INTO catalog_version_transitions
           (catalog_version_id, prior_state, new_state, actor_id, reason, correlation_id)
         VALUES ($1,'active','archived',$2,$3,$4)`,
        [input.catalogVersionId, input.actorId, input.reason, input.correlationId]
      );
      return mapVersion(row);
    });
  }

  public async listVersions(): Promise<readonly CatalogVersionSummary[]> {
    const result = await this.pool.query<VersionRow>(
      `SELECT id, version, label, scope, status, content_hash, validated_at, approved_at,
              activated_at, archived_at
         FROM catalog_versions ORDER BY created_at DESC, id DESC`
    );
    return result.rows.map(mapVersion);
  }

  public async findSelectableProducts(
    filter: CatalogSelectionFilter
  ): Promise<readonly CatalogSelectableProduct[]> {
    const result = await this.pool.query<{
      id: string;
      product_code: string;
      description_en: string;
      category: string;
      family: string | null;
      engineering_verification_required: boolean;
      engineering_note: string | null;
    }>(
      `SELECT DISTINCT product.id, product.product_code, product.description_en, product.category,
              product.family, product.engineering_verification_required, product.engineering_note
         FROM products product
         JOIN catalog_versions version ON version.id = product.catalog_version_id
         JOIN rule_sets ruleset ON ruleset.catalog_version_id = version.id AND ruleset.status = 'active'
         JOIN compatibility_rules rule ON rule.rule_set_id = ruleset.id AND rule.status = 'active'
        WHERE version.status = 'active'
          AND product.availability_status = 'active' AND product.is_orderable = true
          AND rule.decision = 'allowed'
          AND rule.condition_payload->>'relationType' = 'project_selection'
          AND rule.condition_payload->>'sourceProductCode' = product.product_code
          AND rule.condition_payload->>'system' = $1
          AND (rule.condition_payload->>'heightMm')::numeric = $2
          AND (rule.condition_payload->>'widthMm')::numeric = $3
          AND rule.condition_payload->>'materialCode' = $4
          AND rule.condition_payload->>'finishCode' = $5
        ORDER BY product.product_code`,
      [filter.system, filter.heightMm, filter.widthMm, filter.materialCode, filter.finishCode]
    );
    return result.rows.map((row) => ({
      id: row.id,
      code: row.product_code,
      descriptionEn: row.description_en,
      category: row.category,
      family: row.family,
      engineeringVerificationRequired: row.engineering_verification_required,
      engineeringNote: row.engineering_note
    }));
  }

  public async listSelectionOptions(): Promise<readonly CatalogSelectionOption[]> {
    const result = await this.pool.query<{
      id: string;
      product_code: string;
      description_en: string;
      category: string;
      family: string | null;
      engineering_verification_required: boolean;
      engineering_note: string | null;
      system: string;
      height_mm: string;
      width_mm: string;
      material_code: string;
      finish_code: string;
    }>(
      `SELECT selection.*
         FROM (
           SELECT DISTINCT product.id, product.product_code, product.description_en, product.category,
                  product.family, product.engineering_verification_required, product.engineering_note,
                  rule.condition_payload->>'system' AS system,
                  rule.condition_payload->>'heightMm' AS height_mm,
                  rule.condition_payload->>'widthMm' AS width_mm,
                  rule.condition_payload->>'materialCode' AS material_code,
                  rule.condition_payload->>'finishCode' AS finish_code
             FROM products product
             JOIN catalog_versions version ON version.id = product.catalog_version_id
             JOIN rule_sets ruleset ON ruleset.catalog_version_id = version.id AND ruleset.status = 'active'
             JOIN compatibility_rules rule ON rule.rule_set_id = ruleset.id AND rule.status = 'active'
            WHERE version.status = 'active'
              AND product.availability_status = 'active' AND product.is_orderable = true
              AND rule.decision = 'allowed'
              AND rule.condition_payload->>'relationType' = 'project_selection'
              AND rule.condition_payload->>'sourceProductCode' = product.product_code
         ) selection
        ORDER BY selection.system, selection.height_mm::numeric, selection.width_mm::numeric,
                 selection.finish_code, selection.product_code`
    );
    return result.rows.map((row) => ({
      id: row.id,
      code: row.product_code,
      descriptionEn: row.description_en,
      category: row.category,
      family: row.family,
      engineeringVerificationRequired: row.engineering_verification_required,
      engineeringNote: row.engineering_note,
      system: row.system,
      heightMm: Number(row.height_mm),
      widthMm: Number(row.width_mm),
      materialCode: row.material_code,
      finishCode: row.finish_code
    }));
  }

  public async exportLatestReport(
    catalogVersionId: string
  ): Promise<CatalogValidationReport | null> {
    const result = await this.pool.query<{ report: CatalogValidationReport }>(
      `SELECT report FROM catalog_validation_reports
        WHERE catalog_version_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [catalogVersionId]
    );
    return result.rows[0]?.report ?? null;
  }
}
