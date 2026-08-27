export const FORMULA_CATALOG_VERSION = "1.0.0" as const;

export const FORMULAS = {
  "SECTION.REQUIRED_PER_SEGMENT.V1": "ceil(segmentLength / selectedSupplyLength)",
  "RESERVE.APPLY_AFTER_TECHNICAL.V1": "technical × (1 + reservePercent / 100)",
  "PACKAGING.ROUND_UP_TO_INCREMENT.V1": "ceil(reserved / increment) × increment",
  "JOINT.INTERNAL_STRAIGHT_RUN.V1": "max(sum(sectionCount) - 1, 0)",
  "CONNECTION.FITTING_SPECIFIC.V1": "eventCount × componentQuantity × portOrSideCount",
  "SUPPORT.BASE_CONTINUOUS_GROUP.V1": "ceil(totalStraightLength / spacing) + 1",
  "SUPPORT.EXTRA_AROUND_FITTING.V1": "sum(fittingAdditionalSupportQuantity)",
  "SUPPORT.EXTRA_AT_CONNECTION.V1": "sum(supportsBefore + supportsAfter)",
  "SUPPORT.MANUAL_CORRECTION.V1": "sum(manualAdditionalQuantity)",
  "ASSEMBLY.COMPONENT_QUANTITY.V1": "componentQuantity × applicationScope",
  "ANCHOR.PER_SUPPORT_AXIS.V1": "totalSupportCount × anchorsPerSupportAxis",
  "WSTB.PER_SUPPORT.V1": "totalSupportCount × quantityPerSupport",
  "ENDPOINT.MATERIAL.V1": "ownedEndpointEvent × resolvedMaterialQuantity",
  "MANUAL.ITEM.V1": "explicitManualQuantity",
  "INCLUDED.SUPPRESS.V1": "max(demand - provenIncludedQuantity, 0)",
  "DEMAND.AGGREGATE.V1": "sum(compatibleAtomicDemand)",
  "MANUAL.QUANTITY_OVERRIDE.V1": "adjustedQuantity replaces calculatedQuantity",
  "BOM.FINALIZE.V1": "orderedQuantity with reconciled provenance"
} as const;

export type FormulaId = keyof typeof FORMULAS;

export function formulaReference(id: FormulaId): {
  readonly id: FormulaId;
  readonly version: "1.0.0";
  readonly expression: (typeof FORMULAS)[FormulaId];
} {
  return { id, version: "1.0.0", expression: FORMULAS[id] };
}
