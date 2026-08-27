import type {
  BomLineV2,
  CalculationInputV2,
  CalculationResultV2,
  CalculationWarningV2,
  TraceStepV1
} from "@niedax/domain";

import { ExactDecimal, sumDecimals } from "../arithmetic/decimal.js";
import { CalculationEngineError } from "../errors.js";
import { stableId } from "../stable/ids.js";
import { buildLineTrace } from "../trace/trace-builder.js";
import { FORMULA_CATALOG_VERSION } from "../trace/formula-catalog.js";
import { finalizeQuantities } from "../rules/policies.js";
import type { AggregatedDemand, OrderUnit } from "./demand-event.js";
import type { CalculationIndexes } from "./indexes.js";

const CATEGORY_ORDER: Readonly<Record<BomLineV2["category"], number>> = {
  linearSection: 0,
  fitting: 1,
  connector: 2,
  support: 3,
  structure: 4,
  anchor: 5,
  wstb: 6,
  endpointMaterial: 7,
  accessory: 8,
  manual: 9
};

function quantity(
  value: string,
  unit: OrderUnit
): { readonly value: string; readonly unit: OrderUnit } {
  return { value, unit };
}

function buildIncludedItems(demand: AggregatedDemand, indexes: CalculationIndexes) {
  if (demand.product === null) return [];
  return demand.product.includedItems
    .map((relation) => {
      const child = indexes.products.get(relation.childProductId);
      if (child === undefined)
        throw new CalculationEngineError(
          "INTERNAL_INVARIANT_FAILED",
          "Included child product is missing."
        );
      return {
        relationId: relation.id,
        productId: child.id,
        productCode: child.code,
        descriptionEn: child.descriptionEn,
        quantityPerParent: relation.quantityPerParent,
        sourceRefs: [relation.source, child.source]
      };
    })
    .sort(
      (left, right) =>
        left.productCode.localeCompare(right.productCode) ||
        left.productId.localeCompare(right.productId)
    );
}

function assertLineReconciles(line: BomLineV2, steps: readonly TraceStepV1[]): void {
  const technical = line.technicalQuantity.value;
  const reserve = line.reserveQuantity.value;
  const reserved = line.reservedQuantity.value;
  const packaging = line.packagingOverage.value;
  const ordered = line.orderedQuantity.value;
  const spare = line.totalSpareQuantity.value;
  if (exact(technical).add(exact(reserve)).compare(exact(reserved)) !== 0)
    throw new CalculationEngineError(
      "INTERNAL_INVARIANT_FAILED",
      "Reserve trace does not reconcile."
    );
  if (exact(reserved).add(exact(packaging)).compare(exact(ordered)) !== 0)
    throw new CalculationEngineError(
      "INTERNAL_INVARIANT_FAILED",
      "Packaging trace does not reconcile."
    );
  if (exact(ordered).subtract(exact(technical)).compare(exact(spare)) !== 0)
    throw new CalculationEngineError(
      "INTERNAL_INVARIANT_FAILED",
      "Total spare does not reconcile."
    );
  const final = steps[steps.length - 1];
  if (final?.output.value !== ordered || final.output.unit !== line.unit)
    throw new CalculationEngineError(
      "INTERNAL_INVARIANT_FAILED",
      "Final trace output does not reconcile to ordered quantity."
    );
}

function sortLines(lines: readonly BomLineV2[]): readonly BomLineV2[] {
  return [...lines].sort(
    (left, right) =>
      CATEGORY_ORDER[left.category] - CATEGORY_ORDER[right.category] ||
      (left.productCode === null
        ? 1
        : right.productCode === null
          ? -1
          : left.productCode.localeCompare(right.productCode)) ||
      (left.sectionDetail?.selectedSectionLength.value ?? "").localeCompare(
        right.sectionDetail?.selectedSectionLength.value ?? ""
      ) ||
      left.sourceRefs
        .map((source) => source.id)
        .join("|")
        .localeCompare(right.sourceRefs.map((source) => source.id).join("|")) ||
      left.id.localeCompare(right.id)
  );
}

function buildTotals(lines: readonly BomLineV2[]) {
  const units: readonly OrderUnit[] = ["pcs", "m", "kg"];
  return units
    .map((unit) => {
      const selected = lines.filter((line) => line.unit === unit);
      if (selected.length === 0) return null;
      return {
        unit,
        technicalQuantity: quantity(
          sumDecimals(selected.map((line) => exact(line.technicalQuantity.value))).toCanonical(),
          unit
        ),
        reserveQuantity: quantity(
          sumDecimals(selected.map((line) => exact(line.reserveQuantity.value))).toCanonical(),
          unit
        ),
        packagingOverage: quantity(
          sumDecimals(selected.map((line) => exact(line.packagingOverage.value))).toCanonical(),
          unit
        ),
        orderedQuantity: quantity(
          sumDecimals(selected.map((line) => exact(line.orderedQuantity.value))).toCanonical(),
          unit
        )
      };
    })
    .filter((total): total is NonNullable<typeof total> => total !== null);
}

function exact(value: string): ExactDecimal {
  return ExactDecimal.from(value);
}

export function buildCalculationResult(
  input: CalculationInputV2,
  indexes: CalculationIndexes,
  demands: readonly AggregatedDemand[],
  warnings: readonly CalculationWarningV2[],
  engineVersion: string
): CalculationResultV2 {
  const lineRecords = demands.map((demand) => {
    const lineId = stableId("bom", [demand.key]);
    const finalized = finalizeQuantities(input, demand);
    const trace = buildLineTrace(input, demand, finalized, lineId);
    const sectionDetail =
      demand.supplyOptionId === null ||
      demand.sectionLength === null ||
      demand.technicalSectionCount === null ||
      finalized.reservedSectionCount === null
        ? null
        : {
            supplyOptionId: demand.supplyOptionId,
            selectedSectionLength: {
              value: demand.sectionLength.toCanonical(),
              unit: "m" as const
            },
            technicalSectionCount: {
              value: demand.technicalSectionCount.toCanonical(),
              unit: "pcs" as const
            },
            reservedSectionCount: {
              value: finalized.reservedSectionCount.toCanonical(),
              unit: "pcs" as const
            }
          };
    const line: BomLineV2 = {
      id: lineId,
      kind: demand.product === null ? "manual" : "catalog",
      category: demand.category,
      productId: demand.product?.id ?? null,
      manualInputId: demand.manualInputId,
      productCode: demand.productCode,
      descriptionEn: demand.descriptionEn,
      unit: demand.unit,
      technicalQuantity: quantity(finalized.technical.toCanonical(), demand.unit),
      reserveQuantity: quantity(finalized.reserve.toCanonical(), demand.unit),
      reservedQuantity: quantity(finalized.reserved.toCanonical(), demand.unit),
      packageIncrement: quantity(finalized.packageIncrement.toCanonical(), demand.unit),
      packageCount:
        finalized.packageCount === null
          ? null
          : { value: finalized.packageCount.toCanonical(), unit: "packages" },
      packagingOverage: quantity(finalized.packagingOverage.toCanonical(), demand.unit),
      orderedQuantity: quantity(finalized.ordered.toCanonical(), demand.unit),
      totalSpareQuantity: quantity(finalized.totalSpare.toCanonical(), demand.unit),
      sectionDetail,
      includedItems: buildIncludedItems(demand, indexes),
      sourceRefs: demand.sourceRefs,
      status: demand.status,
      warningIds: demand.warningIds,
      traceStepIds: trace.stepIds,
      provenance: {
        catalogSnapshotId: input.catalogSnapshot.snapshotId,
        ruleSnapshotId: input.ruleSnapshot.snapshotId,
        ruleIds: demand.ruleIds,
        formulaIds: [...new Set(trace.steps.map((step) => step.formula.id))].sort()
      }
    };
    assertLineReconciles(line, trace.steps);
    return { line, steps: trace.steps };
  });
  const sortedLines = sortLines(lineRecords.map((record) => record.line));
  const lineOrder = new Map(sortedLines.map((line, index) => [line.id, index]));
  const steps = lineRecords
    .flatMap((record) => record.steps)
    .sort(
      (left, right) =>
        (lineOrder.get(left.bomLineId) ?? 0) - (lineOrder.get(right.bomLineId) ?? 0) ||
        left.sequence - right.sequence ||
        left.formula.id.localeCompare(right.formula.id) ||
        left.id.localeCompare(right.id)
    );
  const engineeringReviewRequired = warnings.some(
    (warning) => warning.severity === "engineeringReview" || warning.severity === "blocking"
  );
  const approvalReady = !warnings.some(
    (warning) => warning.approvalImpact === "blocksApproval" || warning.severity === "blocking"
  );
  return {
    schemaVersion: "calculation-result/v2",
    engineVersion,
    formulaCatalogVersion: FORMULA_CATALOG_VERSION,
    calculationRunId: input.invocation.calculationRunId,
    inputFingerprint: input.invocation.inputFingerprint,
    calculationStatus: warnings.length === 0 ? "complete" : "completeWithWarnings",
    catalogSnapshot: input.catalogSnapshot,
    ruleSnapshot: input.ruleSnapshot,
    bomLines: sortedLines,
    trace: { schemaVersion: "calculation-trace/v1", steps },
    warnings,
    summary: {
      bomLineCount: sortedLines.length,
      warningCount: warnings.length,
      engineeringReviewRequired,
      approvalReady,
      totalsByUnit: buildTotals(sortedLines)
    }
  };
}
