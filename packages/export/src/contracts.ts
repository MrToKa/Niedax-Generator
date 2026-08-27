import type {
  BomLine,
  BomLineV2,
  CalculationResultV1,
  CalculationResultV2,
  CalculationWarningV2,
  Quantity,
  Warning
} from "@niedax/domain";

export type ExportFormat = "xlsx" | "pdf" | "csv" | "print";

export interface ExportProjectHeaderV1 {
  readonly projectCode: string;
  readonly projectName: string;
  readonly projectDescription: string | null;
  readonly revisionNumber: number;
  readonly revisionStatus: "calculated" | "checked" | "approved" | "archived";
}

export interface ExportBomRowV1 {
  readonly category: string;
  readonly productCode: string | null;
  readonly englishDescription: string;
  readonly technicalQuantity: Quantity;
  readonly packagingQuantity: Quantity;
  readonly packageSize: Quantity;
  readonly packageCount: Quantity;
  readonly orderedQuantity: Quantity;
  readonly spareQuantity: Quantity;
  readonly includedItems: BomLine["includedItems"];
  readonly source: BomLine["source"];
  readonly status: string;
  readonly warnings: readonly Warning[];
  readonly manualOverride: boolean;
  readonly quantityOverride: BomLine["quantityOverride"];
  readonly sparePolicy: BomLine["sparePolicy"];
  readonly packagingPolicy: BomLine["packagingPolicy"];
  readonly provenance: BomLine["provenance"];
}

export interface EnglishExportModelV1 {
  readonly schemaVersion: "english-export-model/v1";
  readonly language: "en";
  readonly header: ExportProjectHeaderV1;
  readonly calculationRunId: string;
  readonly inputFingerprint: string;
  readonly catalogSnapshotId: string;
  readonly ruleSnapshotId: string;
  readonly rows: readonly ExportBomRowV1[];
  readonly warnings: readonly Warning[];
}

export interface ExportModelBuilder {
  build(header: ExportProjectHeaderV1, result: CalculationResultV1): EnglishExportModelV1;
}

export interface ExportBomRowV2 {
  readonly category: BomLineV2["category"];
  readonly productCode: string | null;
  readonly englishDescription: string;
  readonly technicalQuantity: BomLineV2["technicalQuantity"];
  readonly reserveQuantity: BomLineV2["reserveQuantity"];
  readonly reservedQuantity: BomLineV2["reservedQuantity"];
  readonly packageIncrement: BomLineV2["packageIncrement"];
  readonly packageCount: BomLineV2["packageCount"];
  readonly packagingOverage: BomLineV2["packagingOverage"];
  readonly orderedQuantity: BomLineV2["orderedQuantity"];
  readonly totalSpareQuantity: BomLineV2["totalSpareQuantity"];
  readonly includedItems: BomLineV2["includedItems"];
  readonly status: BomLineV2["status"];
  readonly warningIds: BomLineV2["warningIds"];
  readonly traceStepIds: BomLineV2["traceStepIds"];
  readonly provenance: BomLineV2["provenance"];
}

export interface EnglishExportModelV2 {
  readonly schemaVersion: "english-export-model/v2";
  readonly language: "en";
  readonly header: ExportProjectHeaderV1;
  readonly calculationRunId: string;
  readonly inputFingerprint: string;
  readonly catalogSnapshotId: string;
  readonly ruleSnapshotId: string;
  readonly rows: readonly ExportBomRowV2[];
  readonly warnings: readonly CalculationWarningV2[];
}

export interface ExportModelBuilderV2 {
  build(header: ExportProjectHeaderV1, result: CalculationResultV2): EnglishExportModelV2;
}

export interface ExportRenderer {
  readonly format: ExportFormat;
  render(model: EnglishExportModelV1): Promise<{
    readonly mediaType: string;
    readonly suggestedFileName: string;
    readonly bytes: Uint8Array;
  }>;
}
