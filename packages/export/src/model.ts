import type { CalculationResultV1, CalculationResultV2 } from "@niedax/domain";

import type {
  EnglishExportModelV1,
  EnglishExportModelV2,
  ExportProjectHeaderV1
} from "./contracts.js";

export function buildEnglishExportModel(
  header: ExportProjectHeaderV1,
  result: CalculationResultV1
): EnglishExportModelV1 {
  return {
    schemaVersion: "english-export-model/v1",
    language: "en",
    header,
    calculationRunId: result.calculationRunId,
    inputFingerprint: result.inputFingerprint,
    catalogSnapshotId: result.catalogSnapshot.snapshotId,
    ruleSnapshotId: result.ruleSnapshot.snapshotId,
    rows: result.bomLines.map((line) => ({
      category: line.category,
      productCode: line.productCode,
      englishDescription: line.descriptionEn,
      technicalQuantity: line.technicalQuantity,
      packagingQuantity: line.packagingQuantity,
      packageSize: line.packageSize,
      packageCount: line.packageCount,
      orderedQuantity: line.orderedQuantity,
      spareQuantity: line.spareQuantity,
      includedItems: line.includedItems,
      source: line.source,
      status: line.status,
      warnings: line.warnings,
      manualOverride: line.quantityOverride !== null,
      quantityOverride: line.quantityOverride,
      sparePolicy: line.sparePolicy,
      packagingPolicy: line.packagingPolicy,
      provenance: line.provenance
    })),
    warnings: result.warnings
  };
}

export function buildEnglishExportModelV2(
  header: ExportProjectHeaderV1,
  result: CalculationResultV2
): EnglishExportModelV2 {
  return {
    schemaVersion: "english-export-model/v2",
    language: "en",
    header,
    calculationRunId: result.calculationRunId,
    inputFingerprint: result.inputFingerprint,
    catalogSnapshotId: result.catalogSnapshot.snapshotId,
    ruleSnapshotId: result.ruleSnapshot.snapshotId,
    rows: result.bomLines.map((line) => ({
      category: line.category,
      productCode: line.productCode,
      englishDescription: line.descriptionEn,
      technicalQuantity: line.technicalQuantity,
      reserveQuantity: line.reserveQuantity,
      reservedQuantity: line.reservedQuantity,
      packageIncrement: line.packageIncrement,
      packageCount: line.packageCount,
      packagingOverage: line.packagingOverage,
      orderedQuantity: line.orderedQuantity,
      totalSpareQuantity: line.totalSpareQuantity,
      includedItems: line.includedItems,
      status: line.status,
      warningIds: line.warningIds,
      traceStepIds: line.traceStepIds,
      provenance: line.provenance
    })),
    warnings: result.warnings
  };
}
