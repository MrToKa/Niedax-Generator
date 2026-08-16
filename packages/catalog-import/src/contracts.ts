export const CATALOG_IMPORT_SCHEMA_VERSION = "catalog-import/v1" as const;

export const catalogSheetNames = [
  "manifest",
  "products",
  "product_attributes",
  "included_items",
  "compatibility_rules",
  "assembly_templates",
  "template_components",
  "source_observations"
] as const;

export type CatalogSheetName = (typeof catalogSheetNames)[number];
export type CatalogRow = Readonly<Record<string, string>>;

export interface ParsedCatalogBundle {
  readonly sheets: Readonly<Record<CatalogSheetName, readonly CatalogRow[]>>;
}

export type CatalogIssueSeverity = "error" | "warning" | "conflict";

export interface CatalogValidationIssue {
  readonly severity: CatalogIssueSeverity;
  readonly code: string;
  readonly sheet: CatalogSheetName;
  readonly rowNumber: number;
  readonly productCode: string | null;
  readonly field: string | null;
  readonly message: string;
  readonly suggestedCorrection: string | null;
}

export interface NormalizedManifestRow {
  readonly rowNumber: number;
  readonly schemaVersion: typeof CATALOG_IMPORT_SCHEMA_VERSION;
  readonly candidateCatalogVersion: string;
  readonly manufacturer: string;
  readonly importScope: string;
  readonly isFullSnapshot: boolean;
  readonly sourceDocument: string;
  readonly sourceDocumentEdition: string | null;
  readonly sourceSha256: string;
  readonly preparedAt: string;
  readonly preparedBy: string;
  readonly notes: string | null;
}

export type ProductCategory =
  | "straightSection"
  | "fitting"
  | "support"
  | "structure"
  | "anchor"
  | "wstb"
  | "accessory"
  | "other";

export interface NormalizedProduct {
  readonly rowNumber: number;
  readonly code: string;
  readonly lookupKey: string;
  readonly descriptionEn: string;
  readonly category: ProductCategory;
  readonly productFamily: string;
  readonly system: string | null;
  readonly catalogVersion: string;
  readonly packQuantity: number | null;
  readonly packUnit: string | null;
  readonly orderUnit: string;
  readonly ean: string | null;
  readonly heightMm: number | null;
  readonly widthMm: number | null;
  readonly lengthMm: number | null;
  readonly materialCode: string | null;
  readonly finishCode: string | null;
  readonly weightValue: number | null;
  readonly weightUnit: string | null;
  readonly weightBasisQuantity: number | null;
  readonly weightBasisUnit: string | null;
  readonly approvalNumber: string | null;
  readonly dopNumber: string | null;
  readonly indoorOnly: boolean;
  readonly engineeringVerificationRequired: boolean;
  readonly isOrderable: boolean;
  readonly sourceDocument: string;
  readonly sourcePrintedPage: string;
  readonly sourcePdfPage: number | null;
  readonly sourceTableOrRow: string | null;
  readonly engineeringNote: string | null;
  readonly semanticHash: string;
}

export interface NormalizedProductAttribute {
  readonly rowNumber: number;
  readonly productCode: string;
  readonly attributeKey: string;
  readonly valueText: string | null;
  readonly valueNumber: number | null;
  readonly valueBoolean: boolean | null;
  readonly unit: string | null;
  readonly sourceDocument: string;
  readonly sourcePrintedPage: string;
  readonly sourcePdfPage: number | null;
  readonly sourceTableOrRow: string | null;
}

export interface NormalizedIncludedItem {
  readonly rowNumber: number;
  readonly parentProductCode: string;
  readonly includedProductCode: string;
  readonly quantity: number;
  readonly unit: string;
  readonly sourceDocument: string;
  readonly sourcePrintedPage: string;
  readonly sourcePdfPage: number | null;
  readonly sourceTableOrRow: string | null;
  readonly note: string | null;
}

export interface NormalizedCompatibilityRule {
  readonly rowNumber: number;
  readonly ruleCode: string;
  readonly relationType: string;
  readonly sourceProductCode: string | null;
  readonly sourceSelector: Readonly<Record<string, string | number | boolean>> | null;
  readonly targetProductCode: string | null;
  readonly targetSelector: Readonly<Record<string, string | number | boolean>> | null;
  readonly allowed: boolean;
  readonly system: string | null;
  readonly heightMm: number | null;
  readonly widthMm: number | null;
  readonly materialCode: string | null;
  readonly finishCode: string | null;
  readonly sourceDocument: string;
  readonly sourcePrintedPage: string;
  readonly sourcePdfPage: number | null;
  readonly verificationStatus: "verified" | "unverified";
  readonly note: string | null;
}

export interface NormalizedAssemblyTemplate {
  readonly rowNumber: number;
  readonly templateCode: string;
  readonly nameEn: string;
  readonly templateType: "wall" | "ceiling" | "floor" | "custom";
  readonly system: string;
  readonly sourceDocument: string;
  readonly sourcePrintedPage: string;
  readonly sourcePdfPage: number | null;
  readonly engineeringVerificationRequired: boolean;
}

export interface NormalizedTemplateComponent {
  readonly rowNumber: number;
  readonly templateCode: string;
  readonly productCode: string;
  readonly componentRole: "support" | "structure" | "anchor" | "fastener" | "accessory";
  readonly quantity: number;
  readonly unit: string;
  readonly quantityMode: "fixed" | "per_support" | "per_level" | "manual";
  readonly suppressWhenIncluded: boolean;
}

export interface NormalizedSourceObservation {
  readonly rowNumber: number;
  readonly productCode: string;
  readonly fieldName: string;
  readonly valueText: string;
  readonly sourceDocument: string;
  readonly sourcePrintedPage: string;
  readonly sourcePdfPage: number | null;
  readonly isAuthoritativeForCandidate: boolean;
  readonly resolutionPolicy: string | null;
}

export interface NormalizedCatalogBundle {
  readonly manifest: readonly NormalizedManifestRow[];
  readonly products: readonly NormalizedProduct[];
  readonly productAttributes: readonly NormalizedProductAttribute[];
  readonly includedItems: readonly NormalizedIncludedItem[];
  readonly compatibilityRules: readonly NormalizedCompatibilityRule[];
  readonly assemblyTemplates: readonly NormalizedAssemblyTemplate[];
  readonly templateComponents: readonly NormalizedTemplateComponent[];
  readonly sourceObservations: readonly NormalizedSourceObservation[];
  readonly contentHash: string;
}

export interface CatalogFieldChange {
  readonly field: string;
  readonly before: unknown;
  readonly after: unknown;
}

export interface CatalogDiffEntry {
  readonly code: string;
  readonly classification: "new" | "changed" | "unchanged" | "invalid" | "missing";
  readonly changes: readonly CatalogFieldChange[];
}

export interface CatalogValidationReport {
  readonly schemaVersion: "catalog-validation-report/v1";
  readonly contentHash: string;
  readonly candidateCatalogVersion: string | null;
  readonly valid: boolean;
  readonly counts: Readonly<{
    products: number;
    new: number;
    changed: number;
    unchanged: number;
    invalid: number;
    missing: number;
    errors: number;
    warnings: number;
    conflicts: number;
  }>;
  readonly issues: readonly CatalogValidationIssue[];
  readonly diff: readonly CatalogDiffEntry[];
  readonly sourceChecksums: readonly string[];
}

export interface CatalogPipelineResult {
  readonly bundle: NormalizedCatalogBundle;
  readonly report: CatalogValidationReport;
}

export interface ActiveCatalogComparison {
  readonly products: readonly NormalizedProduct[];
  readonly completeScopes: readonly string[];
}

export class CatalogImportError extends Error {
  public constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = "CatalogImportError";
  }
}
