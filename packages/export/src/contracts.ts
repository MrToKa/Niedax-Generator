import type { BomLine, CalculationResultV1, Quantity, Warning } from "@niedax/domain";

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

export interface ExportRenderer {
  readonly format: ExportFormat;
  render(model: EnglishExportModelV1): Promise<{
    readonly mediaType: string;
    readonly suggestedFileName: string;
    readonly bytes: Uint8Array;
  }>;
}
