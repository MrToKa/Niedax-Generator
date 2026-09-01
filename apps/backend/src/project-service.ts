import { createHash, randomUUID } from "node:crypto";

import {
  CALCULATION_ENGINE_VERSION,
  CalculationEngineError,
  calculateV2
} from "@niedax/calculation-engine";
import {
  CalculateProjectDraftResponseV2Schema,
  CalculationInputV2Schema,
  CalculationRuleV2Schema,
  CurrentCalculationResponseV2Schema,
  EditorCatalogResponseV2Schema,
  ProjectDraftInputV2Schema,
  ProjectDraftResponseV2Schema,
  ProjectListResponseV2Schema,
  ProjectValidationResponseV2Schema,
  type CalculateProjectDraftRequestV2,
  type CalculateProjectDraftResponseV2,
  type CalculationInputV2,
  type CalculationResultV2,
  type CreateProjectDraftRequestV2,
  type CurrentCalculationResponseV2,
  type EditorCatalogResponseV2,
  type ProjectDraftInputV2,
  type ProjectDraftResponseV2,
  type ProjectListResponseV2,
  type ProjectValidationResponseV2,
  type ReplaceProjectDraftRequestV2,
  type ValidateProjectDraftRequestV2
} from "@niedax/domain";

import { ProjectApplicationError } from "./project-errors.js";
import type {
  PgProjectRepository,
  CatalogContextRecord,
  CatalogProductRow,
  CompatibilityRuleRow,
  ProjectActor,
  ProjectCalculationContext,
  ProjectRecord,
  TemplateComponentRow
} from "./project-repository.js";

interface ServiceReply<T> {
  readonly statusCode: number;
  readonly body: T;
  readonly replayed?: boolean;
}

export interface ProjectOperations {
  listProjects(actor: ProjectActor, correlationId: string): Promise<ProjectListResponseV2>;
  createProject(
    actor: ProjectActor,
    request: CreateProjectDraftRequestV2,
    idempotencyKey: string,
    correlationId: string
  ): Promise<ServiceReply<ProjectDraftResponseV2>>;
  getProject(
    actor: ProjectActor,
    projectId: string,
    correlationId: string
  ): Promise<ProjectDraftResponseV2>;
  replaceProject(
    actor: ProjectActor,
    projectId: string,
    request: ReplaceProjectDraftRequestV2,
    idempotencyKey: string,
    correlationId: string
  ): Promise<ServiceReply<ProjectDraftResponseV2>>;
  validateProject(
    actor: ProjectActor,
    projectId: string,
    request: ValidateProjectDraftRequestV2,
    correlationId: string
  ): Promise<ProjectValidationResponseV2>;
  calculateProject(
    actor: ProjectActor,
    projectId: string,
    request: CalculateProjectDraftRequestV2,
    idempotencyKey: string,
    correlationId: string
  ): Promise<ServiceReply<CalculateProjectDraftResponseV2>>;
  getCurrentCalculation(
    actor: ProjectActor,
    projectId: string,
    correlationId: string
  ): Promise<CurrentCalculationResponseV2>;
  getEditorCatalog(actor: ProjectActor, correlationId: string): Promise<EditorCatalogResponseV2>;
}

type JsonRecord = Readonly<Record<string, unknown>>;

interface ValidationIssueV1 {
  readonly path: readonly (string | number)[];
  readonly code: string;
  readonly message: string;
}

interface PreparedCalculation {
  readonly input: CalculationInputV2 | null;
  readonly blockingErrors: readonly ValidationIssueV1[];
}

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function booleanValue(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function canonicalDecimal(value: string | number): string {
  const input = String(value);
  if (!input.includes(".")) return input.replace(/^0+(?=\d)/u, "") || "0";
  const stripped = input.replace(/0+$/u, "").replace(/\.$/u, "");
  return stripped.replace(/^0+(?=\d)/u, "") || "0";
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const object = value as Readonly<Record<string, unknown>>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`)
    .join(",")}}`;
}

function hash(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonical(value), "utf8").digest("hex")}`;
}

function stableUuid(parts: readonly string[]): string {
  const hex = createHash("sha256").update(parts.join("\u0000"), "utf8").digest("hex").slice(0, 32);
  const variant = ((Number.parseInt(hex[16] ?? "0", 16) & 0x3) | 0x8).toString(16);
  const normalized = `${hex.slice(0, 12)}5${hex.slice(13, 16)}${variant}${hex.slice(17)}`;
  return `${normalized.slice(0, 8)}-${normalized.slice(8, 12)}-${normalized.slice(12, 16)}-${normalized.slice(16, 20)}-${normalized.slice(20)}`;
}

function normalizedFingerprintValue(value: unknown, parentKey: string | null = null): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    const normalized = value.map((item) => normalizedFingerprintValue(item));
    // Geometry order and connection-participant order carry physical meaning. All
    // other stable-identity collections are semantic sets for fingerprinting.
    if (parentKey === "geometry" || parentKey === "participants") return normalized;
    if (normalized.every((item) => typeof item === "string"))
      return [...normalized].sort((left, right) => String(left).localeCompare(String(right)));
    const identity = (item: unknown): string | null => {
      const object = record(item);
      return stringValue(object?.id) ?? stringValue(object?.componentId);
    };
    if (normalized.length > 0 && normalized.every((item) => identity(item) !== null))
      return [...normalized].sort((left, right) =>
        (identity(left) as string).localeCompare(identity(right) as string)
      );
    return normalized;
  }
  return Object.fromEntries(
    Object.entries(value as Readonly<Record<string, unknown>>).map(([key, item]) => [
      key,
      normalizedFingerprintValue(item, key)
    ])
  );
}

function calculationFingerprint(inputWithoutInvocation: unknown): string {
  return `sha256:${createHash("sha256")
    .update(
      `${CALCULATION_ENGINE_VERSION}\n${canonical(normalizedFingerprintValue(inputWithoutInvocation))}`,
      "utf8"
    )
    .digest("hex")}`;
}

function issue(
  path: readonly (string | number)[],
  code: string,
  message: string
): ValidationIssueV1 {
  return { path: [...path], code, message };
}

function conflict(expected: number, actual: number): never {
  throw new ProjectApplicationError(
    409,
    "CONFLICT_STALE_VERSION",
    "The requested project draft version is stale",
    {
      kind: "conflict",
      expectedVersion: String(expected),
      actualVersion: String(actual)
    }
  );
}

function projectDraft(recordValue: ProjectRecord): ProjectDraftInputV2 {
  const document = record(recordValue.document);
  if (document?.schemaVersion !== "project-draft-document/v2") {
    throw new ProjectApplicationError(
      500,
      "INTERNAL_ERROR",
      "The stored project draft cannot be read safely"
    );
  }
  const parsed = ProjectDraftInputV2Schema.safeParse(document.draft);
  if (!parsed.success) {
    throw new ProjectApplicationError(
      500,
      "INTERNAL_ERROR",
      "The stored project draft does not match its schema"
    );
  }
  return parsed.data;
}

function projectResponse(
  recordValue: ProjectRecord,
  correlationId: string
): ProjectDraftResponseV2 {
  return ProjectDraftResponseV2Schema.parse({
    schemaVersion: "project-draft-response/v2",
    correlationId,
    catalogSnapshot: {
      snapshotId: recordValue.catalogVersionId,
      version: recordValue.catalogVersion,
      contentHash: recordValue.catalogContentHash
    },
    ruleSnapshot: {
      snapshotId: recordValue.ruleSetId,
      version: recordValue.ruleSetVersion,
      contentHash: recordValue.ruleSetContentHash
    },
    project: {
      id: recordValue.id,
      ownerId: recordValue.ownerId,
      ownerDisplayName: recordValue.ownerDisplayName,
      status: recordValue.status,
      draftVersion: recordValue.draftVersion,
      createdAt: recordValue.createdAt,
      updatedAt: recordValue.updatedAt,
      ...projectDraft(recordValue)
    }
  });
}

function source(
  kind:
    | "project"
    | "route"
    | "segment"
    | "fitting"
    | "connection"
    | "endpoint"
    | "supportGroup"
    | "straightRun"
    | "product"
    | "supplyOption"
    | "rule"
    | "template"
    | "templateComponent"
    | "manualInput"
    | "manualOverride"
    | "catalogDocument",
  id: string,
  sourceDocument: string | null = null,
  sourcePage: string | null = null
): JsonRecord {
  return { kind, id, sourceDocument, sourcePage };
}

function productSource(product: CatalogProductRow): JsonRecord {
  return source("catalogDocument", product.source_id, product.source_document, product.source_page);
}

function supplyOptionId(productId: string, length: "3000" | "6000"): string {
  return `supply:${productId}:${length}`;
}

function supplyRuleId(productId: string, length: "3000" | "6000"): string {
  return `rule:supply:${productId}:${length}`;
}

function productLength(product: CatalogProductRow): "3000" | "6000" | null {
  const raw = product.metadata.lengthMm;
  const value = raw === null || raw === undefined ? null : canonicalDecimal(String(raw));
  return value === "3000" || value === "6000" ? value : null;
}

function orderUnit(product: CatalogProductRow): "pcs" | "m" | "kg" | null {
  if (product.base_unit === "pcs") return "pcs";
  if (product.base_unit === "m") return "m";
  if (product.base_unit === "kg") return "kg";
  return null;
}

function packageIncrement(product: CatalogProductRow): JsonRecord | null {
  if (product.minimum_package_quantity === null || product.packaging_unit === null) return null;
  const unit = orderUnit(product);
  if (unit === null || product.packaging_unit !== unit) return null;
  return { value: canonicalDecimal(product.minimum_package_quantity), unit };
}

function supportedProduct(product: CatalogProductRow): boolean {
  return (
    orderUnit(product) !== null && (!product.is_orderable || packageIncrement(product) !== null)
  );
}

function demandableProduct(product: CatalogProductRow): boolean {
  return (
    supportedProduct(product) && product.availability_status === "active" && product.is_orderable
  );
}

function effectiveComponentRole(
  catalog: CatalogContextRecord,
  component: TemplateComponentRow
): string {
  // Stage 5's official WSL template labels WSTB 2 as a generic support component,
  // while the catalog product itself carries the explicit `wstb` category. Stage 6
  // owns WSTB as a dedicated calculation axis, so preserve that stronger catalog fact.
  const product = catalog.products.find((candidate) => candidate.id === component.product_id);
  return product?.category === "wstb" ? "wstb" : component.component_role;
}

function selectorMatches(product: CatalogProductRow, selectorValue: unknown): boolean {
  const selector = record(selectorValue);
  if (!selector) return false;
  for (const [key, raw] of Object.entries(selector)) {
    if (raw === null || raw === undefined) continue;
    const expected = String(raw).toLocaleLowerCase("en-US");
    const actual =
      key === "product_family"
        ? product.family
        : key === "system"
          ? product.series
          : key === "product_code"
            ? product.product_code
            : key === "category"
              ? product.category
              : key === "material_code"
                ? product.material
                : key === "finish_code"
                  ? product.coating
                  : null;
    if (actual === null || actual.toLocaleLowerCase("en-US") !== expected) return false;
  }
  return true;
}

function productByCode(
  products: readonly CatalogProductRow[],
  code: unknown
): CatalogProductRow | null {
  const wanted = stringValue(code)?.toLocaleLowerCase("en-US");
  return wanted
    ? (products.find((product) => product.product_code.toLocaleLowerCase("en-US") === wanted) ??
        null)
    : null;
}

function selectedProducts(
  products: readonly CatalogProductRow[],
  code: unknown,
  selectorValue: unknown
): readonly CatalogProductRow[] {
  const direct = productByCode(products, code);
  if (direct) return supportedProduct(direct) ? [direct] : [];
  return products.filter(
    (product) => supportedProduct(product) && selectorMatches(product, selectorValue)
  );
}

function contextualRoles(
  catalog: CatalogContextRecord,
  draft: ProjectDraftInputV2 | null
): ReadonlyMap<string, string> {
  void draft;
  const roles = new Map<string, string>();
  for (const rule of catalog.compatibilityRules) {
    if (rule.condition_payload.relationType !== "separately_ordered_connector") continue;
    for (const product of selectedProducts(
      catalog.products,
      rule.outcome_payload.targetProductCode,
      rule.outcome_payload.targetSelector
    )) {
      roles.set(product.id, "connector");
    }
  }
  for (const component of catalog.templateComponents) {
    const role = effectiveComponentRole(catalog, component);
    if (role === "fastener") roles.set(component.product_id, "fastener");
    if (["support", "structure", "anchor", "accessory", "wstb"].includes(role)) {
      roles.set(component.product_id, role);
    }
  }
  return roles;
}

function roleFor(product: CatalogProductRow, roles: ReadonlyMap<string, string>): string {
  return roles.get(product.id) ?? product.category;
}

function productSnapshots(
  catalog: CatalogContextRecord,
  draft: ProjectDraftInputV2 | null
): readonly JsonRecord[] {
  const roles = contextualRoles(catalog, draft);
  const supportedIds = new Set(
    catalog.products.filter(supportedProduct).map((product) => product.id)
  );
  return catalog.products.filter(supportedProduct).map((product) => {
    const length = productLength(product);
    const option =
      roleFor(product, roles) === "straightSection" && length
        ? {
            id: supplyOptionId(product.id, length),
            length: { value: length, unit: "mm" },
            orderable: product.is_orderable,
            active: product.availability_status === "active",
            ruleId: supplyRuleId(product.id, length),
            source: source(
              "supplyOption",
              supplyOptionId(product.id, length),
              product.source_document,
              product.source_page
            )
          }
        : null;
    return {
      id: product.id,
      code: product.product_code,
      descriptionEn: product.description_en,
      role: roleFor(product, roles),
      orderUnit: orderUnit(product),
      packageIncrement: packageIncrement(product),
      orderable: product.is_orderable,
      active: product.availability_status === "active",
      engineeringReviewRequired: product.engineering_verification_required,
      catalogSnapshotId: catalog.pair.catalog_id,
      supplyOptions: option ? [option] : [],
      includedItems: catalog.includedItems
        .filter(
          (item) =>
            item.parent_product_id === product.id &&
            item.unit === "pcs" &&
            supportedIds.has(item.included_product_id)
        )
        .map((item) => ({
          id: item.id,
          childProductId: item.included_product_id,
          quantityPerParent: { value: canonicalDecimal(item.included_quantity), unit: "pcs" },
          source: source("catalogDocument", item.source_id, item.source_document, item.source_page)
        })),
      source: productSource(product)
    };
  });
}

function quantityMode(
  component: TemplateComponentRow
): "fixed" | "perSupport" | "perLevel" | "manual" | null {
  const raw = stringValue(component.metadata.quantityMode);
  if (raw === "fixed") return "fixed";
  if (raw === "per_support") return "perSupport";
  if (raw === "per_level") return "perLevel";
  if (raw === "manual") return "manual";
  return null;
}

function templateQuantity(component: TemplateComponentRow): JsonRecord | null {
  if (component.quantity === null) return null;
  return { value: canonicalDecimal(component.quantity), unit: component.unit };
}

function templateSnapshots(catalog: CatalogContextRecord): readonly JsonRecord[] {
  const supportedIds = new Set(
    catalog.products.filter(demandableProduct).map((product) => product.id)
  );
  return catalog.templates.flatMap((template) => {
    if (template.status !== "active") return [];
    const templateRows = catalog.templateComponents.filter(
      (component) => component.template_id === template.id
    );
    if (templateRows.some((component) => !supportedIds.has(component.product_id))) return [];
    const components: JsonRecord[] = [];
    for (const component of templateRows) {
      const product = catalog.products.find((candidate) => candidate.id === component.product_id);
      const quantity = templateQuantity(component);
      const mode = quantityMode(component);
      const role = effectiveComponentRole(catalog, component);
      if (
        !product ||
        !quantity ||
        mode === null ||
        component.quantity_expression !== null ||
        component.unit !== orderUnit(product) ||
        !["support", "structure", "anchor", "fastener", "accessory", "wstb"].includes(role)
      )
        return [];
      components.push({
        id: component.id,
        productId: component.product_id,
        role,
        quantity,
        quantityMode: mode,
        suppressWhenIncluded: component.suppress_when_included,
        manualParameterId: mode === "manual" ? `manual:${component.id}` : null,
        source: source(
          "templateComponent",
          component.id,
          template.source_document,
          template.source_page
        )
      });
    }
    if (components.length === 0) return [];
    return [
      {
        id: template.id,
        code: template.stable_code,
        nameEn: template.name_en,
        status: "active",
        catalogSnapshotId: catalog.pair.catalog_id,
        ruleSnapshotId: catalog.pair.rule_set_id,
        engineeringReviewRequired:
          booleanValue(template.applicability.engineeringVerificationRequired) ?? true,
        components,
        source: source("template", template.id, template.source_document, template.source_page)
      }
    ];
  });
}

function explicitCalculationRules(catalog: CatalogContextRecord): readonly JsonRecord[] {
  const products = new Map(catalog.products.map((product) => [product.id, product]));
  return catalog.calculationRules.flatMap((row) => {
    if (
      row.rule_type !== "other" ||
      row.parameter_schema_version !== "calculation-rule/internal-joint/v2"
    )
      return [];
    const straightProductId = stringValue(row.parameters.straightProductId);
    const jointProductId = stringValue(row.parameters.jointProductId);
    const supplyOptionValue = row.parameters.supplyOptionId;
    const selectedSupplyOptionId =
      supplyOptionValue === null ? null : stringValue(supplyOptionValue);
    const quantityPerJoint = record(row.parameters.quantityPerJoint);
    const straight = straightProductId ? products.get(straightProductId) : undefined;
    const joint = jointProductId ? products.get(jointProductId) : undefined;
    const length = straight ? productLength(straight) : null;
    if (
      !straight ||
      straight.category !== "straightSection" ||
      !demandableProduct(straight) ||
      !joint ||
      roleFor(joint, contextualRoles(catalog, null)) !== "connector" ||
      orderUnit(joint) !== "pcs" ||
      !demandableProduct(joint) ||
      !quantityPerJoint ||
      (supplyOptionValue !== null && selectedSupplyOptionId === null) ||
      (selectedSupplyOptionId !== null &&
        (length === null || selectedSupplyOptionId !== supplyOptionId(straight.id, length)))
    )
      return [];
    const parsed = CalculationRuleV2Schema.safeParse({
      id: row.id,
      code: row.stable_code,
      version: row.version,
      confidence: row.confidence,
      status: "active",
      ruleSnapshotId: catalog.pair.rule_set_id,
      source: source("rule", row.id, row.source_document, row.source_page),
      type: "internalJoint",
      straightProductId,
      supplyOptionId: selectedSupplyOptionId,
      jointProductId,
      quantityPerJoint
    });
    return parsed.success ? [parsed.data] : [];
  });
}

function projectSelection(
  catalog: CatalogContextRecord,
  product: CatalogProductRow
): JsonRecord | null {
  const rule = catalog.compatibilityRules.find(
    (candidate) =>
      candidate.condition_payload.relationType === "project_selection" &&
      candidate.decision === "allowed" &&
      productByCode(catalog.products, candidate.condition_payload.sourceProductCode)?.id ===
        product.id
  );
  if (!rule) return null;
  const system = stringValue(rule.condition_payload.system);
  const width = rule.condition_payload.widthMm;
  const height = rule.condition_payload.heightMm;
  const materialCode = stringValue(rule.condition_payload.materialCode);
  const finishCode = stringValue(rule.condition_payload.finishCode);
  if (
    !system ||
    width === null ||
    width === undefined ||
    height === null ||
    height === undefined ||
    !materialCode ||
    !finishCode
  )
    return null;
  const widthValue = canonicalDecimal(String(width));
  const heightValue = canonicalDecimal(String(height));
  return {
    system,
    dimensionId: `dimension:${system.replace(/[^0-9A-Za-z._-]/gu, "-")}:${heightValue}x${widthValue}`,
    width: { value: widthValue, unit: "mm" },
    height: { value: heightValue, unit: "mm" },
    materialCode,
    finishCode
  };
}

function editorCompatibility(catalog: CatalogContextRecord): readonly JsonRecord[] {
  const relations: JsonRecord[] = [];
  for (const rule of catalog.compatibilityRules) {
    const relationType = stringValue(rule.condition_payload.relationType);
    const sources = selectedProducts(
      catalog.products,
      rule.condition_payload.sourceProductCode,
      rule.condition_payload.sourceSelector
    );
    const targets = selectedProducts(
      catalog.products,
      rule.outcome_payload.targetProductCode,
      rule.outcome_payload.targetSelector
    );
    const sourceProduct = sources[0] ?? null;
    const sourceSelector = record(rule.condition_payload.sourceSelector);
    const targetSelector = record(rule.outcome_payload.targetSelector);
    const substrateValue =
      stringValue(targetSelector?.substrate) ?? stringValue(sourceSelector?.substrate);
    const substrate = ["concrete", "steel", "masonry", "unknown"].includes(substrateValue ?? "")
      ? substrateValue
      : null;
    if (relationType === "anchor_substrate" && substrate === null) continue;
    if (relationType === "project_selection" || relationType === "anchor_substrate") {
      if (!sourceProduct) continue;
      relations.push({
        id: rule.id,
        context: relationType === "project_selection" ? "straightSection" : "anchor",
        subjectProductId: null,
        productId: sourceProduct.id,
        allowed: rule.decision === "allowed",
        substrate: relationType === "anchor_substrate" ? substrate : null
      });
      continue;
    }
    if (relationType !== "separately_ordered_connector") continue;
    for (const [sourceIndex, subject] of sources.entries()) {
      for (const [targetIndex, product] of targets.entries()) {
        relations.push({
          id:
            sourceIndex === 0 && targetIndex === 0
              ? rule.id
              : stableUuid(["editor-compatibility", rule.id, subject.id, product.id]),
          context: "connection",
          subjectProductId: subject.id,
          productId: product.id,
          allowed: rule.decision === "allowed",
          substrate: null
        });
      }
    }
  }
  return relations;
}

function editorCatalog(
  catalog: CatalogContextRecord,
  correlationId: string
): EditorCatalogResponseV2 {
  const roles = contextualRoles(catalog, null);
  const products = catalog.products.filter(supportedProduct).map((product) => {
    const selection =
      product.category === "straightSection" ? projectSelection(catalog, product) : null;
    const length = productLength(product);
    const increment = packageIncrement(product);
    const active = product.availability_status === "active";
    const validOrderable = product.is_orderable && increment !== null;
    return {
      id: product.id,
      code: product.product_code,
      descriptionEn: product.description_en,
      role: roleFor(product, roles),
      orderUnit: orderUnit(product),
      packageIncrement: increment,
      active,
      orderable: product.is_orderable,
      selectable:
        active && validOrderable && (product.category !== "straightSection" || selection !== null),
      engineeringReviewRequired: product.engineering_verification_required,
      selection,
      supplyOptions:
        product.category === "straightSection" && length
          ? [
              {
                id: supplyOptionId(product.id, length),
                length: { value: length, unit: "mm" },
                active,
                orderable: validOrderable
              }
            ]
          : []
    };
  });
  const assemblyTemplates = templateSnapshots(catalog).flatMap((template) => {
    const sourceTemplate = catalog.templates.find((candidate) => candidate.id === template.id);
    if (
      !sourceTemplate ||
      !["wall", "ceiling", "floor", "custom"].includes(sourceTemplate.template_type)
    )
      return [];
    const applicability = catalog.templates.find(
      (candidate) => candidate.id === template.id
    )?.applicability;
    const system = stringValue(applicability?.system);
    if (!system) return [];
    return [
      {
        id: template.id,
        code: template.code,
        nameEn: template.nameEn,
        supportType: sourceTemplate.template_type,
        applicableSystems: system ? [system] : [],
        engineeringReviewRequired: template.engineeringReviewRequired,
        components: (Array.isArray(template.components)
          ? (template.components as readonly JsonRecord[])
          : []
        ).map((component) => ({
          id: component.id,
          productId: component.productId,
          role: component.role,
          quantity: component.quantity,
          quantityMode: component.quantityMode,
          suppressWhenIncluded: component.suppressWhenIncluded,
          manualParameterId: component.manualParameterId
        }))
      }
    ];
  });
  return EditorCatalogResponseV2Schema.parse({
    schemaVersion: "editor-catalog-response/v2",
    correlationId,
    catalogSnapshot: {
      snapshotId: catalog.pair.catalog_id,
      version: catalog.pair.catalog_version,
      contentHash: catalog.pair.catalog_content_hash
    },
    ruleSnapshot: {
      snapshotId: catalog.pair.rule_set_id,
      version: catalog.pair.rule_set_version,
      contentHash: catalog.pair.rule_set_content_hash
    },
    products,
    assemblyTemplates,
    compatibilityRelations: editorCompatibility(catalog)
  });
}

function manualMetadata(
  metadata: { readonly overrideId: string; readonly reason: string; readonly note: string | null },
  actor: ProjectActor,
  draftVersion: number
): JsonRecord {
  return {
    ...metadata,
    actorRef: actor.id,
    decisionRef: `decision:${draftVersion}:${metadata.overrideId}`
  };
}

function selectedTemplateAnchorQuantity(
  catalog: CatalogContextRecord,
  templateId: string | null
): JsonRecord | null {
  if (!templateId) return null;
  const component = catalog.templateComponents.find(
    (candidate) =>
      candidate.template_id === templateId &&
      effectiveComponentRole(catalog, candidate) === "anchor"
  );
  return component ? templateQuantity(component) : null;
}

function exactProjectSelectionEvidence(
  catalog: CatalogContextRecord,
  route: ProjectDraftInputV2["routes"][number]
): CompatibilityRuleRow | null {
  const productId = route.selection.straightProductId;
  const product = productId
    ? catalog.products.find((candidate) => candidate.id === productId)
    : null;
  if (!product) return null;
  const system = route.selection.system;
  const width = route.selection.width?.value;
  const height = route.selection.height?.value;
  if (!system || !width || !height) return null;
  const expectedDimensionId = `dimension:${system.replace(/[^0-9A-Za-z._-]/gu, "-")}:${height}x${width}`;
  return (
    catalog.compatibilityRules.find((rule) => {
      const condition = rule.condition_payload;
      return (
        rule.decision === "allowed" &&
        condition.relationType === "project_selection" &&
        productByCode(catalog.products, condition.sourceProductCode)?.id === product.id &&
        stringValue(condition.system) === system &&
        canonicalDecimal(String(condition.widthMm)) === width &&
        canonicalDecimal(String(condition.heightMm)) === height &&
        route.selection.dimensionId === expectedDimensionId &&
        stringValue(condition.materialCode) === route.selection.materialCode &&
        stringValue(condition.finishCode) === route.selection.finishCode
      );
    }) ?? null
  );
}

function exactAnchorEvidence(
  catalog: CatalogContextRecord,
  productId: string,
  substrate: string | null
): CompatibilityRuleRow | null {
  if (!substrate) return null;
  const product = catalog.products.find((candidate) => candidate.id === productId);
  if (!product) return null;
  return (
    catalog.compatibilityRules.find((rule) => {
      if (
        rule.decision !== "allowed" ||
        rule.condition_payload.relationType !== "anchor_substrate" ||
        productByCode(catalog.products, rule.condition_payload.sourceProductCode)?.id !== product.id
      )
        return false;
      const sourceSelector = record(rule.condition_payload.sourceSelector);
      const targetSelector = record(rule.outcome_payload.targetSelector);
      return (
        (stringValue(targetSelector?.substrate) ?? stringValue(sourceSelector?.substrate)) ===
        substrate
      );
    }) ?? null
  );
}

function templateComponentEvidence(
  catalog: CatalogContextRecord,
  templateId: string | null,
  productId: string,
  role: string
): TemplateComponentRow | null {
  if (!templateId) return null;
  return (
    catalog.templateComponents.find(
      (component) =>
        component.template_id === templateId &&
        component.product_id === productId &&
        effectiveComponentRole(catalog, component) === role
    ) ?? null
  );
}

function preflightIssues(
  context: ProjectCalculationContext,
  draft: ProjectDraftInputV2
): ValidationIssueV1[] {
  const issues: ValidationIssueV1[] = [];
  const productMap = new Map(
    context.catalog.products.filter(supportedProduct).map((product) => [product.id, product])
  );
  const engineTemplateIds = new Set(
    templateSnapshots(context.catalog).map((template) => String(template.id))
  );
  if (draft.routes.length === 0)
    issues.push(issue(["routes"], "ROUTE_REQUIRED", "At least one route is required"));
  for (const [routeIndex, route] of draft.routes.entries()) {
    for (const field of [
      "system",
      "dimensionId",
      "width",
      "height",
      "materialCode",
      "finishCode"
    ] as const) {
      if (route.selection[field] === null)
        issues.push(
          issue(
            ["routes", routeIndex, "selection", field],
            "SELECTION_REQUIRED",
            "Complete the route catalog selection"
          )
        );
    }
    const straightId = route.selection.straightProductId;
    const straight = straightId ? productMap.get(straightId) : undefined;
    if (!straightId)
      issues.push(
        issue(
          ["routes", routeIndex, "selection", "straightProductId"],
          "STRAIGHT_PRODUCT_REQUIRED",
          "Select a straight-section product"
        )
      );
    else if (
      !straight ||
      straight.category !== "straightSection" ||
      !straight.is_orderable ||
      straight.availability_status !== "active"
    )
      issues.push(
        issue(
          ["routes", routeIndex, "selection", "straightProductId"],
          "STRAIGHT_PRODUCT_INVALID",
          "The straight-section product is not active and orderable in the pinned catalog"
        )
      );
    else if (!exactProjectSelectionEvidence(context.catalog, route))
      issues.push(
        issue(
          ["routes", routeIndex, "selection"],
          "PROJECT_SELECTION_RULE_MISSING",
          "The route selection is not supported by an exact active catalog rule"
        )
      );
    const supplyId = route.selection.defaultSupplyOptionId;
    const length = straight ? productLength(straight) : null;
    if (!supplyId || !straight || !length || supplyId !== supplyOptionId(straight.id, length))
      issues.push(
        issue(
          ["routes", routeIndex, "selection", "defaultSupplyOptionId"],
          "SUPPLY_OPTION_REQUIRED",
          "Select an explicit active supply option"
        )
      );
    if (route.geometry.length === 0)
      issues.push(
        issue(
          ["routes", routeIndex, "geometry"],
          "GEOMETRY_REQUIRED",
          "At least one positive geometry item is required"
        )
      );
    for (const [geometryIndex, geometry] of route.geometry.entries()) {
      if (geometry.kind !== "fitting" || geometry.selectedProductId === null) continue;
      issues.push(
        issue(
          ["routes", routeIndex, "geometry", geometryIndex, "selectedProductId"],
          productMap.has(geometry.selectedProductId)
            ? "FITTING_RULE_MISSING"
            : "CATALOG_PRODUCT_MISSING",
          productMap.has(geometry.selectedProductId)
            ? "No active fitting calculation fact authorizes this material selection"
            : "The fitting product is absent or uses an unsupported catalog unit"
        )
      );
    }
    for (const [endpointName, endpoint] of [
      ["startEndpoint", route.startEndpoint],
      ["endEndpoint", route.endEndpoint]
    ] as const) {
      if (endpoint.selectedProductId === null) continue;
      issues.push(
        issue(
          ["routes", routeIndex, endpointName, "selectedProductId"],
          productMap.has(endpoint.selectedProductId)
            ? "ENDPOINT_MATERIAL_RULE_MISSING"
            : "CATALOG_PRODUCT_MISSING",
          productMap.has(endpoint.selectedProductId)
            ? "No active endpoint-material fact supplies an explicit quantity"
            : "The endpoint product is absent or uses an unsupported catalog unit"
        )
      );
    }
    if (route.supports.spacing === null)
      issues.push(
        issue(
          ["routes", routeIndex, "supports", "spacing"],
          "SUPPORT_SPACING_REQUIRED",
          "Support spacing is required"
        )
      );
    if (route.supports.supportType === null)
      issues.push(
        issue(
          ["routes", routeIndex, "supports", "supportType"],
          "SUPPORT_TYPE_REQUIRED",
          "Support type is required"
        )
      );
    if (route.supports.wstb === null)
      issues.push(
        issue(
          ["routes", routeIndex, "supports", "wstb"],
          "WSTB_SELECTION_REQUIRED",
          "Choose the explicit WSTB behavior"
        )
      );
    for (const [field, productId] of [
      ["supportProductId", route.supports.supportProductId],
      ["anchorProductId", route.supports.anchorProductId],
      ["wstbProductId", route.supports.wstbProductId]
    ] as const) {
      if (productId && !productMap.has(productId))
        issues.push(
          issue(
            ["routes", routeIndex, "supports", field],
            "CATALOG_PRODUCT_MISSING",
            "The selected product is absent from the pinned catalog"
          )
        );
      else if (
        productId &&
        field !== "wstbProductId" &&
        !demandableProduct(productMap.get(productId) as CatalogProductRow)
      )
        issues.push(
          issue(
            ["routes", routeIndex, "supports", field],
            "CATALOG_PRODUCT_NOT_ORDERABLE",
            "The selected support material must be active and orderable"
          )
        );
    }
    const selectedWstb = route.supports.wstbProductId
      ? productMap.get(route.supports.wstbProductId)
      : undefined;
    if (
      selectedWstb &&
      (selectedWstb.category !== "wstb" ||
        selectedWstb.availability_status !== "active" ||
        !selectedWstb.is_orderable)
    ) {
      issues.push(
        issue(
          ["routes", routeIndex, "supports", "wstbProductId"],
          "WSTB_PRODUCT_INVALID",
          "The WSTB product must be an explicit active and orderable WSTB catalog item"
        )
      );
    }
    if (
      route.supports.supportProductId &&
      productMap.has(route.supports.supportProductId) &&
      !templateComponentEvidence(
        context.catalog,
        route.supports.assemblyTemplateId,
        route.supports.supportProductId,
        "support"
      )
    ) {
      issues.push(
        issue(
          ["routes", routeIndex, "supports", "supportProductId"],
          "SUPPORT_RULE_MISSING",
          "The support product is not an explicit component of the active selected template"
        )
      );
    }
    if (
      route.supports.anchorProductId &&
      productMap.has(route.supports.anchorProductId) &&
      !exactAnchorEvidence(
        context.catalog,
        route.supports.anchorProductId,
        route.supports.substrate
      )
    ) {
      issues.push(
        issue(
          ["routes", routeIndex, "supports", "anchorProductId"],
          "ANCHOR_SUBSTRATE_RULE_MISSING",
          "The active catalog does not authorize this anchor for the selected substrate"
        )
      );
    }
    if (
      route.supports.assemblyTemplateId &&
      !engineTemplateIds.has(route.supports.assemblyTemplateId)
    ) {
      issues.push(
        issue(
          ["routes", routeIndex, "supports", "assemblyTemplateId"],
          "ASSEMBLY_TEMPLATE_MISSING",
          "The selected assembly template is absent from the pinned rule snapshot"
        )
      );
    }
    const selectedTemplate = route.supports.assemblyTemplateId
      ? context.catalog.templates.find(
          (template) =>
            template.id === route.supports.assemblyTemplateId && template.status === "active"
        )
      : null;
    if (selectedTemplate) {
      if (
        route.supports.supportType !== null &&
        selectedTemplate.template_type !== route.supports.supportType
      ) {
        issues.push(
          issue(
            ["routes", routeIndex, "supports", "assemblyTemplateId"],
            "TEMPLATE_SUPPORT_TYPE_MISMATCH",
            "The assembly template does not match the selected support type"
          )
        );
      }
      const applicableSystem = stringValue(selectedTemplate.applicability.system);
      if (!applicableSystem) {
        issues.push(
          issue(
            ["routes", routeIndex, "supports", "assemblyTemplateId"],
            "TEMPLATE_SYSTEM_MISSING",
            "The active assembly template has no explicit system applicability"
          )
        );
      } else if (applicableSystem !== route.selection.system) {
        issues.push(
          issue(
            ["routes", routeIndex, "supports", "assemblyTemplateId"],
            "TEMPLATE_SYSTEM_MISMATCH",
            "The assembly template is not applicable to the selected route system"
          )
        );
      }
      const wstbComponents = context.catalog.templateComponents.filter(
        (component) =>
          component.template_id === selectedTemplate.id &&
          effectiveComponentRole(context.catalog, component) === "wstb"
      );
      if (
        wstbComponents.length > 0 &&
        (route.supports.wstbProductId === null ||
          !wstbComponents.some(
            (component) => component.product_id === route.supports.wstbProductId
          ))
      ) {
        issues.push(
          issue(
            ["routes", routeIndex, "supports", "wstbProductId"],
            "TEMPLATE_WSTB_SELECTION_MISSING",
            "The template WSTB component must be selected explicitly"
          )
        );
      } else if (wstbComponents.length === 0 && route.supports.wstbProductId !== null) {
        issues.push(
          issue(
            ["routes", routeIndex, "supports", "wstbProductId"],
            "TEMPLATE_WSTB_MISMATCH",
            "The selected assembly template has no explicit WSTB component"
          )
        );
      }
      if (
        route.supports.anchorProductId &&
        !templateComponentEvidence(
          context.catalog,
          selectedTemplate.id,
          route.supports.anchorProductId,
          "anchor"
        )
      ) {
        issues.push(
          issue(
            ["routes", routeIndex, "supports", "anchorProductId"],
            "TEMPLATE_ANCHOR_MISMATCH",
            "The selected anchor is not an explicit component of the active template"
          )
        );
      }
    } else if (route.supports.wstbProductId !== null) {
      issues.push(
        issue(
          ["routes", routeIndex, "supports", "wstbProductId"],
          "TEMPLATE_WSTB_MISMATCH",
          "A WSTB product requires an explicit active template component"
        )
      );
    }
    if (
      route.supports.anchorQuantityOverride &&
      selectedTemplateAnchorQuantity(context.catalog, route.supports.assemblyTemplateId) === null
    ) {
      issues.push(
        issue(
          ["routes", routeIndex, "supports", "anchorQuantityOverride"],
          "ANCHOR_BASELINE_MISSING",
          "An anchor override requires an explicit template anchor baseline"
        )
      );
    }
  }
  for (const [connectionIndex, connection] of draft.connections.entries()) {
    if (connection.materialProductId !== null)
      issues.push(
        issue(
          ["connections", connectionIndex, "materialProductId"],
          productMap.has(connection.materialProductId)
            ? "CONNECTION_MATERIAL_RULE_MISSING"
            : "CATALOG_PRODUCT_MISSING",
          productMap.has(connection.materialProductId)
            ? "No active connection fact supplies explicit quantity and port data"
            : "The connection product is absent or uses an unsupported catalog unit"
        )
      );
    for (const [correctionIndex] of connection.connectorCorrections.entries()) {
      issues.push(
        issue(
          ["connections", connectionIndex, "connectorCorrections", correctionIndex],
          "CONNECTOR_CORRECTION_BASELINE_MISSING",
          "A connector correction cannot be applied without a catalog-confirmed original quantity"
        )
      );
    }
  }
  for (const [accessoryIndex, productId] of draft.accessoryProductIds.entries()) {
    issues.push(
      issue(
        ["accessoryProductIds", accessoryIndex],
        productMap.has(productId) ? "ACCESSORY_RULE_MISSING" : "CATALOG_PRODUCT_MISSING",
        productMap.has(productId)
          ? "No active compatibility fact authorizes this generated accessory demand"
          : "The accessory is absent or uses an unsupported catalog unit"
      )
    );
  }
  for (const [itemIndex, item] of draft.manualItems.entries()) {
    if (item.kind !== "catalog") continue;
    const selected = productMap.get(item.productId);
    if (!selected) {
      issues.push(
        issue(
          ["manualItems", itemIndex, "productId"],
          "CATALOG_PRODUCT_MISSING",
          "The manual item product is absent or uses an unsupported catalog unit"
        )
      );
    } else {
      if (selected.availability_status !== "active" || !selected.is_orderable) {
        issues.push(
          issue(
            ["manualItems", itemIndex, "productId"],
            "MANUAL_CATALOG_PRODUCT_NOT_ORDERABLE",
            "A manual catalog item must reference an explicit active and orderable product"
          )
        );
      }
      if (orderUnit(selected) !== item.quantity.unit) {
        issues.push(
          issue(
            ["manualItems", itemIndex, "quantity", "unit"],
            "MANUAL_CATALOG_UNIT_MISMATCH",
            "The manual quantity unit must match the selected catalog product order unit"
          )
        );
      }
    }
  }
  return issues;
}

function calculationParts(
  context: ProjectCalculationContext,
  draft: ProjectDraftInputV2,
  actor: ProjectActor
): Omit<CalculationInputV2, "invocation"> | JsonRecord {
  const catalog = context.catalog;
  const project = context.project;
  const catalogProducts = new Map(
    catalog.products.filter(supportedProduct).map((product) => [product.id, product])
  );
  const relations: JsonRecord[] = [];
  const relationKeys = new Set<string>();
  const compatibilityRuleId = `rule:compatibility:${project.id}:${project.draftVersion}`;
  const allow = (contextName: string, productId: string, evidenceSource: JsonRecord): void => {
    const key = `${contextName}:${productId}`;
    if (relationKeys.has(key)) return;
    relationKeys.add(key);
    relations.push({
      id: `compat:${contextName}:${project.id}:${productId}`,
      context: contextName,
      subjectRef: project.id,
      productId,
      allowed: true,
      ruleId: compatibilityRuleId,
      ruleSnapshotId: catalog.pair.rule_set_id,
      source: evidenceSource
    });
  };

  const rules: JsonRecord[] = [...explicitCalculationRules(catalog)];
  for (const product of catalog.products.filter(supportedProduct)) {
    const length = productLength(product);
    if (product.category !== "straightSection" || !length) continue;
    rules.push({
      id: supplyRuleId(product.id, length),
      code: `SUPPLY-${product.product_code}-${length}`,
      version: catalog.pair.catalog_version,
      confidence: "catalogConfirmed",
      status: "active",
      ruleSnapshotId: catalog.pair.rule_set_id,
      source: source(
        "rule",
        supplyRuleId(product.id, length),
        product.source_document,
        product.source_page
      ),
      type: "supplyOption",
      productId: product.id,
      supplyOptionId: supplyOptionId(product.id, length)
    });
  }

  const connectionByEndpoint = new Map<string, string>();
  for (const connection of draft.connections)
    for (const participant of connection.participants)
      connectionByEndpoint.set(participant.endpointId, connection.id);

  const routes = draft.routes.map((route) => {
    const straightProductId = route.selection.straightProductId as string;
    const defaultSupplyOptionId = route.selection.defaultSupplyOptionId as string;
    const selectionEvidence = exactProjectSelectionEvidence(catalog, route);
    if (selectionEvidence) {
      allow(
        "straightSection",
        straightProductId,
        source(
          "rule",
          selectionEvidence.id,
          selectionEvidence.source_document,
          selectionEvidence.source_page
        )
      );
    }
    const endpoint = (value: typeof route.startEndpoint): JsonRecord => {
      return {
        id: value.id,
        type: value.type,
        materialRuleId: null,
        connectionId: connectionByEndpoint.get(value.id) ?? null
      };
    };
    const geometry = route.geometry.map((item) => {
      if (item.kind === "straight") {
        return {
          id: item.id,
          kind: "straight",
          length: item.length,
          supplyOptionId: item.supplyOptionId
        };
      }
      return {
        id: item.id,
        kind: "fitting",
        fittingType: item.fittingType,
        productId: item.selectedProductId,
        connectionRuleId: null,
        additionalSupportRuleId: null,
        supportedPhysicalLength: item.supportedPhysicalLength
      };
    });
    const support = route.supports;
    if (support.supportProductId) {
      const component = templateComponentEvidence(
        catalog,
        support.assemblyTemplateId,
        support.supportProductId,
        "support"
      );
      if (component)
        allow("support", support.supportProductId, source("templateComponent", component.id));
    }
    if (support.anchorProductId) {
      const anchorEvidence = exactAnchorEvidence(
        catalog,
        support.anchorProductId,
        support.substrate
      );
      if (anchorEvidence)
        allow(
          "anchor",
          support.anchorProductId,
          source(
            "rule",
            anchorEvidence.id,
            anchorEvidence.source_document,
            anchorEvidence.source_page
          )
        );
    }
    if (support.wstbProductId) {
      const component = templateComponentEvidence(
        catalog,
        support.assemblyTemplateId,
        support.wstbProductId,
        "wstb"
      );
      if (component)
        allow("wstb", support.wstbProductId, source("templateComponent", component.id));
    }
    if (support.assemblyTemplateId) {
      for (const component of catalog.templateComponents.filter(
        (candidate) => candidate.template_id === support.assemblyTemplateId
      )) {
        const role = effectiveComponentRole(catalog, component);
        if (role === "anchor" || role === "wstb") continue;
        allow(
          role === "structure"
            ? "structure"
            : role === "support"
              ? "support"
              : role === "anchor"
                ? "anchor"
                : role === "wstb"
                  ? "wstb"
                  : "accessory",
          component.product_id,
          source("templateComponent", component.id)
        );
      }
    }
    const wstbRuleId = `rule:wstb:${route.id}`;
    const wstb = support.wstb;
    rules.push({
      id: wstbRuleId,
      code: `WSTB-${route.id}`,
      version: catalog.pair.rule_set_version,
      confidence: "projectRule",
      status: "draft",
      ruleSnapshotId: catalog.pair.rule_set_id,
      source: source("route", route.id),
      type: "wstbPerSupport",
      quantityPerSupport: {
        value: wstb?.mode === "one" ? "1" : wstb?.mode === "two" ? "2" : wstb?.quantityPerSupport,
        unit: "pcs"
      }
    });
    const anchorBaseline = selectedTemplateAnchorQuantity(catalog, support.assemblyTemplateId);
    return {
      id: route.id,
      code: route.code,
      straightProductId,
      defaultSupplyOptionId,
      startEndpoint: endpoint(route.startEndpoint),
      endEndpoint: endpoint(route.endEndpoint),
      geometry,
      supports: {
        spacing: support.spacing,
        supportType: support.supportType,
        supportProductId: support.supportProductId,
        templateId: support.assemblyTemplateId,
        levelCount: support.levelCount,
        substrate: support.substrate,
        anchorProductId: support.anchorProductId,
        anchorQuantityOverride: support.anchorQuantityOverride
          ? {
              originalPerSupportAxis: anchorBaseline,
              adjustedPerSupportAxis: support.anchorQuantityOverride.adjustedPerSupportAxis,
              metadata: manualMetadata(
                support.anchorQuantityOverride.metadata,
                actor,
                project.draftVersion
              )
            }
          : null,
        wstbProductId: support.wstbProductId,
        wstb:
          wstb?.mode === "custom"
            ? {
                mode: "custom",
                ruleId: wstbRuleId,
                quantityPerSupport: wstb.quantityPerSupport,
                metadata: manualMetadata(wstb.metadata, actor, project.draftVersion)
              }
            : { mode: wstb?.mode, ruleId: wstbRuleId },
        manualAdditionalSupports: support.manualAdditionalSupports.map((adjustment) => ({
          id: adjustment.id,
          originalCalculatedQuantity: null,
          additionalQuantity: adjustment.additionalQuantity,
          sourceEntityRef: adjustment.sourceEntityRef,
          metadata: manualMetadata(adjustment.metadata, actor, project.draftVersion)
        })),
        templateManualValues: support.templateManualValues.map((value) => ({
          componentId: value.componentId,
          quantity: value.quantity,
          metadata: manualMetadata(value.metadata, actor, project.draftVersion)
        }))
      }
    };
  });

  const connections = draft.connections.map((connection) => {
    return {
      id: connection.id,
      type: connection.type,
      participants: connection.participants,
      physicalBreak: connection.physicalBreak,
      supportBehavior: connection.supportBehavior,
      materialRuleId: null,
      supportsBefore: connection.supportsBefore,
      supportsAfter: connection.supportsAfter,
      // Corrections are blocked by preflight until a persisted rule supplies the
      // original calculated quantity. Never fabricate that baseline from the override.
      connectorCorrections: []
    };
  });

  const manualItems = draft.manualItems.map((item) => {
    if (item.kind === "catalog")
      allow("manualCatalog", item.productId, source("manualInput", item.id));
    const product = item.kind === "catalog" ? catalogProducts.get(item.productId) : null;
    const mapReserve = (): JsonRecord => {
      if (item.reservePolicy.mode === "projectDefault") return { mode: "projectDefault" };
      if (item.reservePolicy.mode === "disabled")
        return {
          mode: "disabled",
          originalPercent: draft.defaultReservePercent,
          metadata: manualMetadata(item.reservePolicy.metadata, actor, project.draftVersion)
        };
      return {
        mode: "percentageOverride",
        originalPercent: draft.defaultReservePercent,
        percent: item.reservePolicy.percent,
        metadata: manualMetadata(item.reservePolicy.metadata, actor, project.draftVersion)
      };
    };
    const mapPackaging = (): JsonRecord => {
      if (item.packagingPolicy.mode === "catalogDefault") return { mode: "catalogDefault" };
      if (item.packagingPolicy.mode === "disabled")
        return {
          mode: "disabled",
          metadata: item.packagingPolicy.metadata
            ? manualMetadata(item.packagingPolicy.metadata, actor, project.draftVersion)
            : null
        };
      return {
        mode: "incrementOverride",
        increment: item.packagingPolicy.increment,
        metadata: manualMetadata(item.packagingPolicy.metadata, actor, project.draftVersion)
      };
    };
    return {
      id: item.id,
      kind: item.kind,
      productId: item.kind === "catalog" ? item.productId : null,
      descriptionEn: item.kind === "catalog" ? product?.description_en : item.descriptionEn,
      productCode: item.kind === "catalog" ? product?.product_code : item.productCode,
      quantity: item.quantity,
      reason: item.reason,
      note: item.note,
      reservePolicy: mapReserve(),
      packagingPolicy: mapPackaging(),
      quantityOverride: item.quantityOverride
        ? {
            id: item.quantityOverride.metadata.overrideId,
            originalQuantity: item.quantity,
            adjustedQuantity: item.quantityOverride.adjustedQuantity,
            metadata: manualMetadata(item.quantityOverride.metadata, actor, project.draftVersion)
          }
        : null
    };
  });

  if (relations.length) {
    rules.push({
      id: compatibilityRuleId,
      code: `PROJECT-COMPATIBILITY-${project.id}`,
      version: catalog.pair.rule_set_version,
      confidence: "projectRule",
      status: "draft",
      ruleSnapshotId: catalog.pair.rule_set_id,
      source: source("project", project.id),
      type: "compatibility",
      relationIds: relations.map((relation) => relation.id)
    });
  }

  return {
    schemaVersion: "calculation-input/v2",
    project: {
      id: project.id,
      code: draft.code,
      defaultReservePercent: draft.defaultReservePercent,
      cableLoad: draft.cableLoad,
      routes,
      connections,
      accessoryProductIds: draft.accessoryProductIds
    },
    catalogSnapshot: {
      snapshotId: catalog.pair.catalog_id,
      version: catalog.pair.catalog_version,
      contentHash: catalog.pair.catalog_content_hash
    },
    products: productSnapshots(catalog, draft),
    compatibilityRelations: relations,
    ruleSnapshot: {
      snapshotId: catalog.pair.rule_set_id,
      version: catalog.pair.rule_set_version,
      contentHash: catalog.pair.rule_set_content_hash
    },
    rules,
    assemblyTemplates: templateSnapshots(catalog),
    manualItems,
    productQuantityAdjustments: [],
    linePolicies: [],
    options: {
      unresolvedMaterialPolicy: "warnAndOmit",
      supportMismatchPolicy: "splitWithEngineeringReview",
      includePackaging: true
    }
  };
}

function prepareCalculation(
  context: ProjectCalculationContext,
  actor: ProjectActor
): PreparedCalculation {
  const draft = projectDraft(context.project);
  const blockingErrors = preflightIssues(context, draft);
  if (blockingErrors.length) return { input: null, blockingErrors };
  const parts = calculationParts(context, draft, actor);
  const calculationRunId = randomUUID();
  const inputFingerprint = calculationFingerprint(parts);
  const parsed = CalculationInputV2Schema.safeParse({
    ...parts,
    invocation: { calculationRunId, inputFingerprint }
  });
  if (!parsed.success) {
    return {
      input: null,
      blockingErrors: parsed.error.issues.map((item) =>
        issue(
          item.path.filter(
            (part): part is string | number => typeof part === "string" || typeof part === "number"
          ),
          item.code.toLocaleUpperCase("en-US"),
          item.message
        )
      )
    };
  }
  return { input: parsed.data, blockingErrors: [] };
}

function execute(input: CalculationInputV2): CalculationResultV2 {
  try {
    return calculateV2(input);
  } catch (error) {
    if (error instanceof CalculationEngineError) {
      throw new ProjectApplicationError(422, "CALCULATION_FAILED", "Calculation failed", {
        kind: "validation",
        issues:
          error.details.length > 0
            ? error.details.map((detail) => issue(detail.path, detail.code, detail.message))
            : [issue([], error.code, "The calculation input could not be evaluated")]
      });
    }
    throw error;
  }
}

function validationFromResult(
  context: ProjectCalculationContext,
  correlationId: string,
  prepared: PreparedCalculation,
  result: CalculationResultV2 | null
): ProjectValidationResponseV2 {
  const blockingErrors = [...prepared.blockingErrors];
  const warnings: ValidationIssueV1[] = [];
  const engineeringReview: ValidationIssueV1[] = [];
  for (const warning of result?.warnings ?? []) {
    const mapped = issue(
      warning.path ?? [warning.subject.kind, warning.subject.id],
      warning.code,
      warning.effect
    );
    // Successful warnAndOmit output can be inspected but may still be unsafe for
    // approval. Input contradictions remain blockingErrors; engine approval blockers
    // retain their exact severity in CalculationResultV2 and surface here for review.
    if (
      warning.severity === "blocking" ||
      warning.severity === "engineeringReview" ||
      warning.approvalImpact !== "none"
    )
      engineeringReview.push(mapped);
    else warnings.push(mapped);
  }
  return ProjectValidationResponseV2Schema.parse({
    schemaVersion: "project-validation-response/v2",
    correlationId,
    projectId: context.project.id,
    draftVersion: context.project.draftVersion,
    blockingErrors,
    warnings,
    engineeringReview,
    canCalculate: blockingErrors.length === 0
  });
}

export class ProjectApplicationService implements ProjectOperations {
  public constructor(private readonly repository: PgProjectRepository) {}

  public async listProjects(
    actor: ProjectActor,
    correlationId: string
  ): Promise<ProjectListResponseV2> {
    return ProjectListResponseV2Schema.parse({
      schemaVersion: "project-list-response/v2",
      correlationId,
      projects: await this.repository.listProjects(actor)
    });
  }

  public async createProject(
    actor: ProjectActor,
    request: CreateProjectDraftRequestV2,
    idempotencyKey: string,
    correlationId: string
  ): Promise<ServiceReply<ProjectDraftResponseV2>> {
    const result = await this.repository.createProject({
      actor,
      draft: request.draft,
      correlationId,
      idempotencyKey,
      requestHash: hash(request)
    });
    return {
      statusCode: result.statusCode,
      body: ProjectDraftResponseV2Schema.parse(result.response),
      replayed: result.replayed
    };
  }

  public async getProject(
    actor: ProjectActor,
    projectId: string,
    correlationId: string
  ): Promise<ProjectDraftResponseV2> {
    return projectResponse(await this.repository.getProject(projectId, actor), correlationId);
  }

  public async replaceProject(
    actor: ProjectActor,
    projectId: string,
    request: ReplaceProjectDraftRequestV2,
    idempotencyKey: string,
    correlationId: string
  ): Promise<ServiceReply<ProjectDraftResponseV2>> {
    const result = await this.repository.replaceProject({
      projectId,
      actor,
      expectedDraftVersion: request.expectedDraftVersion,
      draft: request.draft,
      correlationId,
      idempotencyKey,
      requestHash: hash(request)
    });
    return {
      statusCode: result.statusCode,
      body: ProjectDraftResponseV2Schema.parse(result.response),
      replayed: result.replayed
    };
  }

  public async validateProject(
    actor: ProjectActor,
    projectId: string,
    request: ValidateProjectDraftRequestV2,
    correlationId: string
  ): Promise<ProjectValidationResponseV2> {
    const context = await this.repository.getCalculationContext(projectId, actor);
    if (context.project.draftVersion !== request.expectedDraftVersion)
      conflict(request.expectedDraftVersion, context.project.draftVersion);
    const prepared = prepareCalculation(context, actor);
    const result = prepared.input ? execute(prepared.input) : null;
    return validationFromResult(context, correlationId, prepared, result);
  }

  public async calculateProject(
    actor: ProjectActor,
    projectId: string,
    request: CalculateProjectDraftRequestV2,
    idempotencyKey: string,
    correlationId: string
  ): Promise<ServiceReply<CalculateProjectDraftResponseV2>> {
    const requestHash = hash(request);
    const replay = await this.repository.findCalculationReplay({
      projectId,
      actor,
      idempotencyKey,
      requestHash
    });
    if (replay) {
      return {
        statusCode: replay.statusCode,
        body: CalculateProjectDraftResponseV2Schema.parse(replay.response),
        replayed: true
      };
    }
    const context = await this.repository.getCalculationContext(projectId, actor);
    if (context.project.draftVersion !== request.expectedDraftVersion)
      conflict(request.expectedDraftVersion, context.project.draftVersion);
    const prepared = prepareCalculation(context, actor);
    if (!prepared.input || prepared.blockingErrors.length) {
      throw new ProjectApplicationError(
        422,
        "VALIDATION_FAILED",
        "The project draft is not ready for calculation",
        { kind: "validation", issues: [...prepared.blockingErrors] }
      );
    }
    const startedAt = new Date();
    const result = execute(prepared.input);
    const completedAt = new Date();
    const calculation = {
      projectId,
      draftVersion: context.project.draftVersion,
      run: {
        id: prepared.input.invocation.calculationRunId,
        status: "succeeded",
        inputFingerprint: prepared.input.invocation.inputFingerprint,
        engineVersion: result.engineVersion,
        catalogSnapshot: result.catalogSnapshot,
        ruleSnapshot: result.ruleSnapshot,
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString()
      },
      result,
      stale: false
    } as const;
    const response = CalculateProjectDraftResponseV2Schema.parse({
      schemaVersion: "calculate-project-draft-response/v2",
      correlationId,
      calculation
    });
    const stored = await this.repository.storeCalculation({
      projectId,
      actor,
      expectedDraftVersion: request.expectedDraftVersion,
      catalogVersionId: context.catalog.pair.catalog_id,
      ruleSetId: context.catalog.pair.rule_set_id,
      calculationInput: prepared.input,
      calculation,
      response,
      responseSchemaVersion: response.schemaVersion,
      correlationId,
      idempotencyKey,
      requestHash
    });
    return {
      statusCode: stored.statusCode,
      body: CalculateProjectDraftResponseV2Schema.parse(stored.response),
      replayed: stored.replayed
    };
  }

  public async getCurrentCalculation(
    actor: ProjectActor,
    projectId: string,
    correlationId: string
  ): Promise<CurrentCalculationResponseV2> {
    return CurrentCalculationResponseV2Schema.parse({
      schemaVersion: "current-calculation-response/v2",
      correlationId,
      projectId,
      calculation: await this.repository.getCurrentCalculation(projectId, actor)
    });
  }

  public async getEditorCatalog(
    actor: ProjectActor,
    correlationId: string
  ): Promise<EditorCatalogResponseV2> {
    void actor;
    return editorCatalog(await this.repository.getActiveCatalogContext(), correlationId);
  }
}
