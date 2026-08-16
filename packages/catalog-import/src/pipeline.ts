import { createHash } from "node:crypto";

import {
  CATALOG_IMPORT_SCHEMA_VERSION,
  type ActiveCatalogComparison,
  type CatalogDiffEntry,
  type CatalogFieldChange,
  type CatalogPipelineResult,
  type CatalogSheetName,
  type CatalogValidationIssue,
  type NormalizedAssemblyTemplate,
  type NormalizedCatalogBundle,
  type NormalizedCompatibilityRule,
  type NormalizedIncludedItem,
  type NormalizedManifestRow,
  type NormalizedProduct,
  type NormalizedProductAttribute,
  type NormalizedSourceObservation,
  type NormalizedTemplateComponent,
  type ParsedCatalogBundle,
  type ProductCategory
} from "./contracts.js";
import { catalogColumns, compatibilitySelectorKeys, supportedUnits } from "./schema.js";

const PRODUCT_CATEGORIES = new Set([
  "straightSection",
  "fitting",
  "support",
  "structure",
  "anchor",
  "wstb",
  "accessory",
  "other"
]);
const QUANTITY_MODES = new Set(["fixed", "per_support", "per_level", "manual"]);
const COMPONENT_ROLES = new Set(["support", "structure", "anchor", "fastener", "accessory"]);
const TEMPLATE_TYPES = new Set(["wall", "ceiling", "floor", "custom"]);

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)])
    );
  }
  return value;
}

export function sha256(value: unknown): string {
  return `sha256:${createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex")}`;
}

function text(value: string | undefined): string {
  return (value ?? "").normalize("NFC").replace(/\s+/gu, " ").trim();
}

export function normalizeDecimal(value: string): number | null {
  const normalized = text(value);
  if (!normalized) return null;
  const decimal = normalized.includes(",")
    ? normalized.replace(/\./gu, "").replace(",", ".")
    : normalized;
  const parsed = Number(decimal);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeInteger(value: string): number | null {
  const parsed = normalizeDecimal(value);
  return parsed !== null && Number.isInteger(parsed) ? parsed : null;
}

function normalizeBoolean(value: string): boolean | null {
  const normalized = text(value).toLowerCase();
  if (["true", "1", "yes", "y"].includes(normalized)) return true;
  if (["false", "0", "no", "n"].includes(normalized)) return false;
  return null;
}

function nullable(value: string | undefined): string | null {
  const normalized = text(value);
  return normalized ? normalized : null;
}

function validateOptionalPositiveNumber(
  row: Readonly<Record<string, string>>,
  field: string,
  sheet: CatalogSheetName,
  rowNumber: number,
  productCode: string | null,
  issues: CatalogValidationIssue[]
): number | null {
  const raw = text(row[field]);
  if (!raw) return null;
  const value = normalizeDecimal(raw);
  if (value === null || value <= 0) {
    issue(
      issues,
      "error",
      "INVALID_POSITIVE_NUMBER",
      sheet,
      rowNumber,
      productCode,
      field,
      `${field} must be a positive decimal value`
    );
    return null;
  }
  return value;
}

function issue(
  issues: CatalogValidationIssue[],
  severity: CatalogValidationIssue["severity"],
  code: string,
  sheet: CatalogSheetName,
  rowNumber: number,
  productCode: string | null,
  field: string | null,
  message: string,
  suggestedCorrection: string | null = null
): void {
  issues.push({
    severity,
    code,
    sheet,
    rowNumber,
    productCode,
    field,
    message,
    suggestedCorrection
  });
}

function validateHeaders(bundle: ParsedCatalogBundle, issues: CatalogValidationIssue[]): void {
  for (const [sheet, rows] of Object.entries(bundle.sheets) as [
    CatalogSheetName,
    readonly Record<string, string>[]
  ][]) {
    for (const [index, row] of rows.entries()) {
      for (const header of Object.keys(row)) {
        if (!catalogColumns[sheet].includes(header)) {
          issue(
            issues,
            "error",
            "UNKNOWN_COLUMN",
            sheet,
            index + 2,
            nullable(row["code"] ?? row["product_code"]),
            header,
            `Column ${header} is not part of ${CATALOG_IMPORT_SCHEMA_VERSION}`,
            "Remove the column or migrate the import to a supported schema version"
          );
        }
      }
    }
  }
}

function parseSelector(
  raw: string,
  rowNumber: number,
  issues: CatalogValidationIssue[]
): Readonly<Record<string, string | number | boolean>> | null {
  const value = text(raw);
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error();
    const entries = Object.entries(parsed as Record<string, unknown>);
    if (
      entries.some(
        ([key, item]) =>
          !compatibilitySelectorKeys.has(key) ||
          !["string", "number", "boolean"].includes(typeof item)
      )
    ) {
      issue(
        issues,
        "error",
        "INVALID_SELECTOR_KEY",
        "compatibility_rules",
        rowNumber,
        null,
        "selector_json",
        "Selector contains an unsupported key or non-scalar value"
      );
      return null;
    }
    return Object.fromEntries(entries) as Readonly<Record<string, string | number | boolean>>;
  } catch {
    issue(
      issues,
      "error",
      "INVALID_SELECTOR_JSON",
      "compatibility_rules",
      rowNumber,
      null,
      "selector_json",
      "Selector must be deterministic JSON object data"
    );
    return null;
  }
}

function normalizeManifest(
  bundle: ParsedCatalogBundle,
  issues: CatalogValidationIssue[]
): NormalizedManifestRow[] {
  return bundle.sheets.manifest.flatMap((row, index) => {
    const rowNumber = index + 2;
    const schemaVersion = text(row["schema_version"]);
    const fullSnapshot = normalizeBoolean(row["is_full_snapshot"] ?? "");
    const hash = text(row["source_sha256"]);
    for (const field of [
      "candidate_catalog_version",
      "manufacturer",
      "import_scope",
      "source_document",
      "source_sha256",
      "prepared_at",
      "prepared_by"
    ]) {
      if (!text(row[field])) {
        issue(
          issues,
          "error",
          "REQUIRED_FIELD",
          "manifest",
          rowNumber,
          null,
          field,
          `${field} is required`
        );
      }
    }
    if (schemaVersion !== CATALOG_IMPORT_SCHEMA_VERSION) {
      issue(
        issues,
        "error",
        "UNSUPPORTED_SCHEMA_VERSION",
        "manifest",
        rowNumber,
        null,
        "schema_version",
        `Expected ${CATALOG_IMPORT_SCHEMA_VERSION}`
      );
    }
    if (fullSnapshot === null) {
      issue(
        issues,
        "error",
        "INVALID_BOOLEAN",
        "manifest",
        rowNumber,
        null,
        "is_full_snapshot",
        "Expected a boolean"
      );
    }
    if (!/^sha256:[0-9a-f]{64}$/u.test(hash)) {
      issue(
        issues,
        "error",
        "INVALID_SHA256",
        "manifest",
        rowNumber,
        null,
        "source_sha256",
        "Expected sha256:<64 lowercase hex characters>"
      );
    }
    if (schemaVersion !== CATALOG_IMPORT_SCHEMA_VERSION || fullSnapshot === null) return [];
    return [
      {
        rowNumber,
        schemaVersion: CATALOG_IMPORT_SCHEMA_VERSION,
        candidateCatalogVersion: text(row["candidate_catalog_version"]),
        manufacturer: text(row["manufacturer"]),
        importScope: text(row["import_scope"]),
        isFullSnapshot: fullSnapshot,
        sourceDocument: text(row["source_document"]),
        sourceDocumentEdition: nullable(row["source_document_edition"]),
        sourceSha256: hash,
        preparedAt: text(row["prepared_at"]),
        preparedBy: text(row["prepared_by"]),
        notes: nullable(row["notes"])
      }
    ];
  });
}

function normalizeProducts(
  bundle: ParsedCatalogBundle,
  issues: CatalogValidationIssue[]
): NormalizedProduct[] {
  return bundle.sheets.products.flatMap((row, index) => {
    const rowNumber = index + 2;
    const code = text(row["code"]);
    const category = text(row["category"]);
    const isOrderable = normalizeBoolean(row["is_orderable"] ?? "");
    const indoorOnly = normalizeBoolean(row["indoor_only"] ?? "false");
    const engineeringRequired = normalizeBoolean(
      row["engineering_verification_required"] ?? "false"
    );
    const packQuantity = normalizeDecimal(row["pack_quantity"] ?? "");
    const sourcePdfPage = normalizeInteger(row["source_pdf_page"] ?? "");
    const heightMm = validateOptionalPositiveNumber(
      row,
      "height_mm",
      "products",
      rowNumber,
      code || null,
      issues
    );
    const widthMm = validateOptionalPositiveNumber(
      row,
      "width_mm",
      "products",
      rowNumber,
      code || null,
      issues
    );
    const lengthMm = validateOptionalPositiveNumber(
      row,
      "length_mm",
      "products",
      rowNumber,
      code || null,
      issues
    );
    const weightValue = validateOptionalPositiveNumber(
      row,
      "weight_value",
      "products",
      rowNumber,
      code || null,
      issues
    );
    const weightBasisQuantity = validateOptionalPositiveNumber(
      row,
      "weight_basis_quantity",
      "products",
      rowNumber,
      code || null,
      issues
    );
    for (const field of [
      "code",
      "description_en",
      "category",
      "product_family",
      "catalog_version",
      "order_unit",
      "source_document",
      "source_printed_page"
    ]) {
      if (!text(row[field])) {
        issue(
          issues,
          "error",
          "REQUIRED_FIELD",
          "products",
          rowNumber,
          code || null,
          field,
          `${field} is required`
        );
      }
    }
    if (!PRODUCT_CATEGORIES.has(category)) {
      issue(
        issues,
        "error",
        "INVALID_CATEGORY",
        "products",
        rowNumber,
        code || null,
        "category",
        "Unsupported product category"
      );
    }
    if (isOrderable === null || indoorOnly === null || engineeringRequired === null) {
      issue(
        issues,
        "error",
        "INVALID_BOOLEAN",
        "products",
        rowNumber,
        code || null,
        null,
        "Boolean fields must use true or false"
      );
    }
    if (
      isOrderable === true &&
      (packQuantity === null || packQuantity <= 0 || !text(row["pack_unit"]))
    ) {
      issue(
        issues,
        "error",
        "INVALID_PACK_QUANTITY",
        "products",
        rowNumber,
        code || null,
        "pack_quantity",
        "Orderable products require a positive pack quantity and pack unit"
      );
    }
    if (
      isOrderable !== true &&
      text(row["pack_quantity"]) &&
      (packQuantity === null || packQuantity <= 0)
    ) {
      issue(
        issues,
        "error",
        "INVALID_PACK_QUANTITY",
        "products",
        rowNumber,
        code || null,
        "pack_quantity",
        "Pack quantity must be a positive decimal value"
      );
    }
    if (text(row["source_pdf_page"]) && (sourcePdfPage === null || sourcePdfPage <= 0)) {
      issue(
        issues,
        "error",
        "INVALID_PDF_PAGE",
        "products",
        rowNumber,
        code || null,
        "source_pdf_page",
        "PDF page must be a positive integer"
      );
    }
    const hasWeight = text(row["weight_value"]) !== "" || text(row["weight_unit"]) !== "";
    const hasWeightBasis =
      text(row["weight_basis_quantity"]) !== "" || text(row["weight_basis_unit"]) !== "";
    if (
      hasWeight !== (weightValue !== null && text(row["weight_unit"]) !== "") ||
      hasWeightBasis !== (weightBasisQuantity !== null && text(row["weight_basis_unit"]) !== "") ||
      hasWeight !== hasWeightBasis
    ) {
      issue(
        issues,
        "error",
        "INVALID_WEIGHT_BASIS",
        "products",
        rowNumber,
        code || null,
        "weight_value",
        "Weight value/unit and positive weight basis quantity/unit must be supplied together"
      );
    }
    for (const unitField of ["pack_unit", "order_unit", "weight_unit", "weight_basis_unit"]) {
      const unit = text(row[unitField]);
      if (unit && !supportedUnits.has(unit)) {
        issue(
          issues,
          "error",
          "UNSUPPORTED_UNIT",
          "products",
          rowNumber,
          code || null,
          unitField,
          `Unsupported unit ${unit}`
        );
      }
    }
    if (
      !code ||
      !PRODUCT_CATEGORIES.has(category) ||
      isOrderable === null ||
      indoorOnly === null ||
      engineeringRequired === null
    )
      return [];
    const semanticFields = {
      code,
      descriptionEn: text(row["description_en"]),
      category: category as ProductCategory,
      productFamily: text(row["product_family"]),
      system: nullable(row["system"]),
      catalogVersion: text(row["catalog_version"]),
      packQuantity,
      packUnit: nullable(row["pack_unit"]),
      orderUnit: text(row["order_unit"]),
      ean: nullable(row["ean"]),
      heightMm,
      widthMm,
      lengthMm,
      materialCode: nullable(row["material_code"]),
      finishCode: nullable(row["finish_code"]),
      weightValue,
      weightUnit: nullable(row["weight_unit"]),
      weightBasisQuantity,
      weightBasisUnit: nullable(row["weight_basis_unit"]),
      approvalNumber: nullable(row["approval_number"]),
      dopNumber: nullable(row["dop_number"]),
      indoorOnly,
      engineeringVerificationRequired: engineeringRequired,
      isOrderable,
      sourceDocument: text(row["source_document"]),
      sourcePrintedPage: text(row["source_printed_page"]),
      sourcePdfPage,
      sourceTableOrRow: nullable(row["source_table_or_row"]),
      engineeringNote: nullable(row["engineering_note"])
    };
    return [
      {
        rowNumber,
        lookupKey: code.normalize("NFKC").toLocaleLowerCase("en-US"),
        ...semanticFields,
        semanticHash: sha256(semanticFields)
      }
    ];
  });
}

function normalizeAttributes(
  bundle: ParsedCatalogBundle,
  issues: CatalogValidationIssue[]
): NormalizedProductAttribute[] {
  return bundle.sheets.product_attributes.flatMap((row, index) => {
    const rowNumber = index + 2;
    const productCode = text(row["product_code"]);
    const attributeKey = text(row["attribute_key"]);
    const valueText = nullable(row["value_text"]);
    const rawNumber = text(row["value_number"]);
    const valueNumber = normalizeDecimal(rawNumber);
    const rawBoolean = text(row["value_boolean"]);
    const valueBoolean = normalizeBoolean(rawBoolean);
    const present =
      Number(valueText !== null) + Number(rawNumber !== "") + Number(rawBoolean !== "");
    if (
      present !== 1 ||
      (rawNumber !== "" && valueNumber === null) ||
      (rawBoolean !== "" && valueBoolean === null)
    ) {
      issue(
        issues,
        "error",
        "ATTRIBUTE_TYPED_VALUE",
        "product_attributes",
        rowNumber,
        productCode || null,
        null,
        "Exactly one valid typed value column is required"
      );
      return [];
    }
    if (!productCode || !attributeKey) {
      issue(
        issues,
        "error",
        "REQUIRED_FIELD",
        "product_attributes",
        rowNumber,
        productCode || null,
        null,
        "product_code and attribute_key are required"
      );
      return [];
    }
    const unit = nullable(row["unit"]);
    if (unit && !supportedUnits.has(unit)) {
      issue(
        issues,
        "error",
        "UNSUPPORTED_UNIT",
        "product_attributes",
        rowNumber,
        productCode,
        "unit",
        `Unsupported unit ${unit}`
      );
    }
    return [
      {
        rowNumber,
        productCode,
        attributeKey,
        valueText,
        valueNumber,
        valueBoolean,
        unit,
        sourceDocument: text(row["source_document"]),
        sourcePrintedPage: text(row["source_printed_page"]),
        sourcePdfPage: normalizeInteger(row["source_pdf_page"] ?? ""),
        sourceTableOrRow: nullable(row["source_table_or_row"])
      }
    ];
  });
}

function normalizeIncludedItems(
  bundle: ParsedCatalogBundle,
  issues: CatalogValidationIssue[]
): NormalizedIncludedItem[] {
  return bundle.sheets.included_items.flatMap((row, index) => {
    const rowNumber = index + 2;
    const parent = text(row["parent_product_code"]);
    const included = text(row["included_product_code"]);
    const quantity = normalizeDecimal(row["quantity"] ?? "");
    const unit = text(row["unit"]);
    if (!parent || !included || quantity === null || quantity <= 0 || !supportedUnits.has(unit)) {
      issue(
        issues,
        "error",
        "INVALID_INCLUDED_ITEM",
        "included_items",
        rowNumber,
        parent || null,
        null,
        "Included items require two product codes, a positive quantity, and supported unit"
      );
      return [];
    }
    return [
      {
        rowNumber,
        parentProductCode: parent,
        includedProductCode: included,
        quantity,
        unit,
        sourceDocument: text(row["source_document"]),
        sourcePrintedPage: text(row["source_printed_page"]),
        sourcePdfPage: normalizeInteger(row["source_pdf_page"] ?? ""),
        sourceTableOrRow: nullable(row["source_table_or_row"]),
        note: nullable(row["note"])
      }
    ];
  });
}

function normalizeCompatibility(
  bundle: ParsedCatalogBundle,
  issues: CatalogValidationIssue[]
): NormalizedCompatibilityRule[] {
  return bundle.sheets.compatibility_rules.flatMap((row, index) => {
    const rowNumber = index + 2;
    const allowed = normalizeBoolean(row["allowed"] ?? "");
    const verification = text(row["verification_status"]);
    const ruleCode = text(row["rule_code"]);
    if (!ruleCode || allowed === null || !["verified", "unverified"].includes(verification)) {
      issue(
        issues,
        "error",
        "INVALID_COMPATIBILITY_RULE",
        "compatibility_rules",
        rowNumber,
        null,
        null,
        "Compatibility rule code, boolean decision, and verification status are required"
      );
      return [];
    }
    return [
      {
        rowNumber,
        ruleCode,
        relationType: text(row["relation_type"]),
        sourceProductCode: nullable(row["source_product_code"]),
        sourceSelector: parseSelector(row["source_selector_json"] ?? "", rowNumber, issues),
        targetProductCode: nullable(row["target_product_code"]),
        targetSelector: parseSelector(row["target_selector_json"] ?? "", rowNumber, issues),
        allowed,
        system: nullable(row["system"]),
        heightMm: normalizeDecimal(row["height_mm"] ?? ""),
        widthMm: normalizeDecimal(row["width_mm"] ?? ""),
        materialCode: nullable(row["material_code"]),
        finishCode: nullable(row["finish_code"]),
        sourceDocument: text(row["source_document"]),
        sourcePrintedPage: text(row["source_printed_page"]),
        sourcePdfPage: normalizeInteger(row["source_pdf_page"] ?? ""),
        verificationStatus: verification as "verified" | "unverified",
        note: nullable(row["note"])
      }
    ];
  });
}

function normalizeTemplates(
  bundle: ParsedCatalogBundle,
  issues: CatalogValidationIssue[]
): {
  templates: NormalizedAssemblyTemplate[];
  components: NormalizedTemplateComponent[];
} {
  const templates = bundle.sheets.assembly_templates.flatMap((row, index) => {
    const rowNumber = index + 2;
    const type = text(row["template_type"]);
    const engineeringRequired = normalizeBoolean(row["engineering_verification_required"] ?? "");
    if (!text(row["template_code"]) || !TEMPLATE_TYPES.has(type) || engineeringRequired === null) {
      issue(
        issues,
        "error",
        "INVALID_TEMPLATE",
        "assembly_templates",
        rowNumber,
        null,
        null,
        "Template code, supported type, and engineering flag are required"
      );
      return [];
    }
    return [
      {
        rowNumber,
        templateCode: text(row["template_code"]),
        nameEn: text(row["name_en"]),
        templateType: type as NormalizedAssemblyTemplate["templateType"],
        system: text(row["system"]),
        sourceDocument: text(row["source_document"]),
        sourcePrintedPage: text(row["source_printed_page"]),
        sourcePdfPage: normalizeInteger(row["source_pdf_page"] ?? ""),
        engineeringVerificationRequired: engineeringRequired
      }
    ];
  });
  const components = bundle.sheets.template_components.flatMap((row, index) => {
    const rowNumber = index + 2;
    const role = text(row["component_role"]);
    const mode = text(row["quantity_mode"]);
    const quantity = normalizeDecimal(row["quantity"] ?? "");
    const suppress = normalizeBoolean(row["suppress_when_included"] ?? "");
    if (
      !COMPONENT_ROLES.has(role) ||
      !QUANTITY_MODES.has(mode) ||
      quantity === null ||
      quantity <= 0 ||
      suppress === null
    ) {
      issue(
        issues,
        "error",
        "INVALID_TEMPLATE_COMPONENT",
        "template_components",
        rowNumber,
        text(row["product_code"]) || null,
        null,
        "Template component requires supported role/mode, positive quantity, and boolean suppression policy"
      );
      return [];
    }
    return [
      {
        rowNumber,
        templateCode: text(row["template_code"]),
        productCode: text(row["product_code"]),
        componentRole: role as NormalizedTemplateComponent["componentRole"],
        quantity,
        unit: text(row["unit"]),
        quantityMode: mode as NormalizedTemplateComponent["quantityMode"],
        suppressWhenIncluded: suppress
      }
    ];
  });
  return { templates, components };
}

function normalizeObservations(bundle: ParsedCatalogBundle): NormalizedSourceObservation[] {
  return bundle.sheets.source_observations.flatMap((row, index) => {
    const authoritative = normalizeBoolean(row["is_authoritative_for_candidate"] ?? "");
    if (!text(row["product_code"]) || !text(row["field_name"]) || authoritative === null) return [];
    return [
      {
        rowNumber: index + 2,
        productCode: text(row["product_code"]),
        fieldName: text(row["field_name"]),
        valueText: text(row["value_text"]),
        sourceDocument: text(row["source_document"]),
        sourcePrintedPage: text(row["source_printed_page"]),
        sourcePdfPage: normalizeInteger(row["source_pdf_page"] ?? ""),
        isAuthoritativeForCandidate: authoritative,
        resolutionPolicy: nullable(row["resolution_policy"])
      }
    ];
  });
}

function validateRelations(
  bundle: NormalizedCatalogBundle,
  issues: CatalogValidationIssue[]
): void {
  const productKeys = new Set(bundle.products.map((product) => product.lookupKey));
  const duplicateProducts = new Set<string>();
  const seenProducts = new Set<string>();
  for (const product of bundle.products) {
    if (seenProducts.has(product.lookupKey)) duplicateProducts.add(product.lookupKey);
    seenProducts.add(product.lookupKey);
  }
  for (const duplicate of duplicateProducts) {
    const product = bundle.products.find((item) => item.lookupKey === duplicate);
    issue(
      issues,
      "error",
      "DUPLICATE_PRODUCT_CODE",
      "products",
      product?.rowNumber ?? 0,
      product?.code ?? duplicate,
      "code",
      "Product code is duplicated inside the candidate version"
    );
  }

  const attributes = new Set<string>();
  for (const attribute of bundle.productAttributes) {
    const key = `${attribute.productCode.toLowerCase()}\u0000${attribute.attributeKey.toLowerCase()}`;
    if (attributes.has(key)) {
      issue(
        issues,
        "error",
        "DUPLICATE_ATTRIBUTE",
        "product_attributes",
        attribute.rowNumber,
        attribute.productCode,
        "attribute_key",
        "Attribute key is duplicated for the product"
      );
    }
    attributes.add(key);
    if (!productKeys.has(attribute.productCode.toLowerCase())) {
      issue(
        issues,
        "error",
        "UNKNOWN_PRODUCT_REFERENCE",
        "product_attributes",
        attribute.rowNumber,
        attribute.productCode,
        "product_code",
        "Referenced product is not in the candidate version"
      );
    }
  }

  const graph = new Map<string, string[]>();
  for (const included of bundle.includedItems) {
    const parent = included.parentProductCode.toLowerCase();
    const child = included.includedProductCode.toLowerCase();
    if (!productKeys.has(parent) || !productKeys.has(child)) {
      issue(
        issues,
        "error",
        "UNKNOWN_INCLUDED_PRODUCT",
        "included_items",
        included.rowNumber,
        included.parentProductCode,
        "included_product_code",
        "Both included-item products must exist in the candidate version"
      );
    }
    graph.set(parent, [...(graph.get(parent) ?? []), child]);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (node: string): boolean => {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;
    visiting.add(node);
    if ((graph.get(node) ?? []).some(visit)) return true;
    visiting.delete(node);
    visited.add(node);
    return false;
  };
  if ([...graph.keys()].some(visit)) {
    issue(
      issues,
      "error",
      "INCLUDED_ITEM_CYCLE",
      "included_items",
      0,
      null,
      null,
      "Included-item relations contain a cycle"
    );
  }

  const ruleDecisions = new Map<string, boolean>();
  for (const rule of bundle.compatibilityRules) {
    const signature = sha256({
      relationType: rule.relationType,
      sourceProductCode: rule.sourceProductCode,
      sourceSelector: rule.sourceSelector,
      targetProductCode: rule.targetProductCode,
      targetSelector: rule.targetSelector,
      system: rule.system,
      heightMm: rule.heightMm,
      widthMm: rule.widthMm,
      materialCode: rule.materialCode,
      finishCode: rule.finishCode
    });
    const prior = ruleDecisions.get(signature);
    if (prior !== undefined && prior !== rule.allowed) {
      issue(
        issues,
        "error",
        "CONTRADICTORY_COMPATIBILITY_RULE",
        "compatibility_rules",
        rule.rowNumber,
        rule.sourceProductCode,
        "allowed",
        "The same compatibility selector has both allow and deny decisions"
      );
    }
    ruleDecisions.set(signature, rule.allowed);
  }

  const templateCodes = new Set(bundle.assemblyTemplates.map((template) => template.templateCode));
  for (const component of bundle.templateComponents) {
    if (!templateCodes.has(component.templateCode)) {
      issue(
        issues,
        "error",
        "UNKNOWN_TEMPLATE_REFERENCE",
        "template_components",
        component.rowNumber,
        component.productCode,
        "template_code",
        "Referenced assembly template does not exist"
      );
    }
    if (!productKeys.has(component.productCode.toLowerCase())) {
      issue(
        issues,
        "error",
        "UNKNOWN_PRODUCT_REFERENCE",
        "template_components",
        component.rowNumber,
        component.productCode,
        "product_code",
        "Referenced product does not exist"
      );
    }
  }
}

function validateAnchors(bundle: NormalizedCatalogBundle, issues: CatalogValidationIssue[]): void {
  const attributesByProduct = new Map<string, Set<string>>();
  for (const attribute of bundle.productAttributes) {
    const key = attribute.productCode.toLowerCase();
    attributesByProduct.set(
      key,
      new Set([...(attributesByProduct.get(key) ?? []), attribute.attributeKey])
    );
  }
  for (const product of bundle.products.filter((item) => item.category === "anchor")) {
    if (!product.engineeringVerificationRequired || !product.engineeringNote) {
      issue(
        issues,
        "error",
        "ANCHOR_ENGINEERING_POLICY",
        "products",
        product.rowNumber,
        product.code,
        "engineering_verification_required",
        "Scoped anchors require a visible engineering-verification policy"
      );
    }
    if (product.productFamily === "NSA" && (!product.indoorOnly || product.system !== "concrete")) {
      issue(
        issues,
        "error",
        "NSA_APPLICATION_RESTRICTION",
        "products",
        product.rowNumber,
        product.code,
        "system",
        "NSA must be indoor-only and restricted to concrete"
      );
    }
    const required =
      product.productFamily === "NSA"
        ? [
            "diameter",
            "length",
            "head_drive",
            "drill_hole_diameter",
            "recommended_tightening_torque",
            "substrate"
          ]
        : [
            "connection_thread",
            "length",
            "drill_hole_diameter",
            "clamping_range_max",
            "effective_anchoring_depth",
            "substrate"
          ];
    if (product.productFamily === "DAZ") required.push("washer_diameter");
    const keys = attributesByProduct.get(product.lookupKey) ?? new Set<string>();
    for (const attribute of required) {
      if (!keys.has(attribute)) {
        issue(
          issues,
          "error",
          "MISSING_CATEGORY_ATTRIBUTE",
          "product_attributes",
          product.rowNumber,
          product.code,
          attribute,
          `${product.productFamily} requires attribute ${attribute}`
        );
      }
    }
    if (
      !product.approvalNumber ||
      product.system !== "concrete" ||
      product.weightValue === null ||
      product.weightBasisQuantity === null
    ) {
      issue(
        issues,
        "error",
        "ANCHOR_REQUIRED_FIELDS",
        "products",
        product.rowNumber,
        product.code,
        null,
        "Anchors require approval, concrete substrate, and weight with basis"
      );
    }
  }
}

function validateCategoryProducts(
  bundle: NormalizedCatalogBundle,
  issues: CatalogValidationIssue[]
): void {
  for (const product of bundle.products.filter((item) => item.category === "straightSection")) {
    if (
      product.heightMm === null ||
      product.widthMm === null ||
      product.lengthMm === null ||
      !product.system ||
      !product.materialCode ||
      !product.finishCode ||
      product.weightValue === null ||
      product.weightBasisUnit !== "kg_per_100_m"
    ) {
      issue(
        issues,
        "error",
        "STRAIGHT_SECTION_REQUIRED_FIELDS",
        "products",
        product.rowNumber,
        product.code,
        null,
        "Straight sections require system, dimensions, material/finish, and kg per 100 m weight"
      );
    }
  }
}

function addObservationConflicts(
  bundle: NormalizedCatalogBundle,
  issues: CatalogValidationIssue[]
): void {
  const grouped = new Map<string, NormalizedSourceObservation[]>();
  for (const observation of bundle.sourceObservations) {
    const key = `${observation.productCode.toLowerCase()}\u0000${observation.fieldName}`;
    grouped.set(key, [...(grouped.get(key) ?? []), observation]);
  }
  for (const observations of grouped.values()) {
    if (new Set(observations.map((item) => item.valueText)).size <= 1) continue;
    const first = observations[0];
    if (!first) continue;
    const resolved = observations.some(
      (item) => item.isAuthoritativeForCandidate && item.resolutionPolicy !== null
    );
    issue(
      issues,
      resolved ? "warning" : "conflict",
      resolved ? "SOURCE_CONFLICT_RESOLVED" : "SOURCE_CONFLICT_UNRESOLVED",
      "source_observations",
      first.rowNumber,
      first.productCode,
      first.fieldName,
      `Official sources report conflicting values: ${observations.map((item) => `${item.sourceDocument}=${item.valueText}`).join("; ")}`,
      resolved
        ? null
        : "Select an authoritative observation and record an administrative resolution policy"
    );
  }
}

const comparableProductFields: readonly (keyof NormalizedProduct)[] = [
  "descriptionEn",
  "category",
  "productFamily",
  "system",
  "packQuantity",
  "packUnit",
  "orderUnit",
  "ean",
  "heightMm",
  "widthMm",
  "lengthMm",
  "materialCode",
  "finishCode",
  "weightValue",
  "weightUnit",
  "weightBasisQuantity",
  "weightBasisUnit",
  "approvalNumber",
  "dopNumber",
  "indoorOnly",
  "engineeringVerificationRequired",
  "isOrderable"
];

function diffProducts(
  bundle: NormalizedCatalogBundle,
  issues: readonly CatalogValidationIssue[],
  active: ActiveCatalogComparison | null
): CatalogDiffEntry[] {
  const activeByCode = new Map(
    (active?.products ?? []).map((product) => [product.lookupKey, product])
  );
  const invalidCodes = new Set(
    issues
      .filter((item) => item.severity === "error" && item.productCode)
      .map((item) => item.productCode?.toLowerCase())
  );
  const entries = bundle.products.map((product): CatalogDiffEntry => {
    if (invalidCodes.has(product.lookupKey)) {
      return { code: product.code, classification: "invalid", changes: [] };
    }
    const before = activeByCode.get(product.lookupKey);
    if (!before) return { code: product.code, classification: "new", changes: [] };
    const changes: CatalogFieldChange[] = comparableProductFields.flatMap((field) =>
      Object.is(before[field], product[field])
        ? []
        : [{ field, before: before[field], after: product[field] }]
    );
    return {
      code: product.code,
      classification: changes.length ? "changed" : "unchanged",
      changes
    };
  });
  const fullScopes = new Set(
    bundle.manifest.filter((row) => row.isFullSnapshot).map((row) => row.importScope)
  );
  if (active && active.completeScopes.some((scope) => fullScopes.has(scope))) {
    const candidateCodes = new Set(bundle.products.map((product) => product.lookupKey));
    for (const product of active.products) {
      if (!candidateCodes.has(product.lookupKey)) {
        entries.push({ code: product.code, classification: "missing", changes: [] });
      }
    }
  }
  return entries.sort((left, right) => left.code.localeCompare(right.code));
}

export function runCatalogPipeline(
  parsed: ParsedCatalogBundle,
  active: ActiveCatalogComparison | null = null
): CatalogPipelineResult {
  const issues: CatalogValidationIssue[] = [];
  validateHeaders(parsed, issues);
  const manifest = normalizeManifest(parsed, issues);
  const products = normalizeProducts(parsed, issues);
  const productAttributes = normalizeAttributes(parsed, issues);
  const includedItems = normalizeIncludedItems(parsed, issues);
  const compatibilityRules = normalizeCompatibility(parsed, issues);
  const { templates: assemblyTemplates, components: templateComponents } = normalizeTemplates(
    parsed,
    issues
  );
  const sourceObservations = normalizeObservations(parsed);
  const content = {
    manifest,
    products: products.map((product) => {
      const { rowNumber, semanticHash, ...semanticProduct } = product;
      void rowNumber;
      void semanticHash;
      return semanticProduct;
    }),
    productAttributes,
    includedItems,
    compatibilityRules,
    assemblyTemplates,
    templateComponents,
    sourceObservations
  };
  const bundle: NormalizedCatalogBundle = {
    manifest,
    products,
    productAttributes,
    includedItems,
    compatibilityRules,
    assemblyTemplates,
    templateComponents,
    sourceObservations,
    contentHash: sha256(content)
  };
  validateRelations(bundle, issues);
  validateCategoryProducts(bundle, issues);
  validateAnchors(bundle, issues);
  addObservationConflicts(bundle, issues);
  if (!manifest.length) {
    issue(
      issues,
      "error",
      "MISSING_MANIFEST",
      "manifest",
      1,
      null,
      null,
      "At least one manifest/source row is required"
    );
  }
  const versions = new Set(manifest.map((row) => row.candidateCatalogVersion));
  if (versions.size > 1 || products.some((product) => !versions.has(product.catalogVersion))) {
    issue(
      issues,
      "error",
      "CATALOG_VERSION_MISMATCH",
      "manifest",
      1,
      null,
      "candidate_catalog_version",
      "All rows in one bundle must target the same candidate catalog version"
    );
  }
  const diff = diffProducts(bundle, issues, active);
  const count = (classification: CatalogDiffEntry["classification"]): number =>
    diff.filter((entry) => entry.classification === classification).length;
  const errors = issues.filter((item) => item.severity === "error").length;
  const conflicts = issues.filter((item) => item.severity === "conflict").length;
  return {
    bundle,
    report: {
      schemaVersion: "catalog-validation-report/v1",
      contentHash: bundle.contentHash,
      candidateCatalogVersion: manifest[0]?.candidateCatalogVersion ?? null,
      valid: errors === 0 && conflicts === 0,
      counts: {
        products: products.length,
        new: count("new"),
        changed: count("changed"),
        unchanged: count("unchanged"),
        invalid: count("invalid"),
        missing: count("missing"),
        errors,
        warnings: issues.filter((item) => item.severity === "warning").length,
        conflicts
      },
      issues,
      diff,
      sourceChecksums: [...new Set(manifest.map((row) => row.sourceSha256))].sort()
    }
  };
}

export function exportValidationIssuesCsv(issues: readonly CatalogValidationIssue[]): string {
  const encode = (value: unknown): string => {
    const stringValue = value === null || value === undefined ? "" : String(value);
    return /[",\n]/u.test(stringValue) ? `"${stringValue.replace(/"/gu, '""')}"` : stringValue;
  };
  return (
    [
      "severity,error_code,sheet,row_number,product_code,field,message,suggested_correction",
      ...issues.map((item) =>
        [
          item.severity,
          item.code,
          item.sheet,
          item.rowNumber,
          item.productCode,
          item.field,
          item.message,
          item.suggestedCorrection
        ]
          .map(encode)
          .join(",")
      )
    ].join("\n") + "\n"
  );
}

export function isCompatible(
  rules: readonly NormalizedCompatibilityRule[],
  selection: Readonly<{
    system: string;
    heightMm: number;
    widthMm: number;
    materialCode: string;
    finishCode: string;
  }>
): boolean {
  return rules.some(
    (rule) =>
      rule.allowed &&
      rule.verificationStatus === "verified" &&
      rule.system === selection.system &&
      rule.heightMm === selection.heightMm &&
      rule.widthMm === selection.widthMm &&
      rule.materialCode === selection.materialCode &&
      rule.finishCode === selection.finishCode
  );
}

export function suppressIncludedComponents(
  requestedCodes: readonly string[],
  includedItems: readonly NormalizedIncludedItem[]
): readonly string[] {
  const supplied = new Set(includedItems.map((item) => item.includedProductCode.toLowerCase()));
  return requestedCodes.filter((code) => !supplied.has(code.toLowerCase()));
}
