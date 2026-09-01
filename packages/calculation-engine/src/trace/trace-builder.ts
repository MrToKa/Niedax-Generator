import type { CalculationInputV2, CalculationRuleV2, TraceStepV2 } from "@niedax/domain";

import { ExactDecimal, HUNDRED, ONE } from "../arithmetic/decimal.js";
import type { AggregatedDemand } from "../model/demand-event.js";
import { sourceRef, uniqueSourceRefs } from "../model/source.js";
import type { FinalizedQuantities } from "../rules/policies.js";
import { formulaReference } from "./formula-catalog.js";
import { stableId } from "../stable/ids.js";

function traceRule(rule: CalculationRuleV2 | null): TraceStepV2["rule"] {
  if (rule === null) return null;
  return {
    id: rule.id,
    code: rule.code,
    version: rule.version,
    confidence: rule.confidence,
    ruleSnapshotId: rule.ruleSnapshotId
  };
}

function traceValue(
  value: ExactDecimal,
  unit: TraceStepV2["output"]["unit"]
): TraceStepV2["output"] {
  return { value: value.toCanonical(), unit };
}

export interface BuiltLineTrace {
  readonly steps: readonly TraceStepV2[];
  readonly stepIds: readonly string[];
}

export function buildLineTrace(
  input: CalculationInputV2,
  demand: AggregatedDemand,
  quantities: FinalizedQuantities,
  lineId: string
): BuiltLineTrace {
  const steps: TraceStepV2[] = [];
  let sequence = 1;
  const contributionStepIds: string[] = [];
  for (const event of demand.events) {
    const eventStepIds: string[] = [];
    for (const [seedIndex, seed] of event.traceSeeds.entries()) {
      const id = stableId("trace", [lineId, event.id, seedIndex.toString(), seed.formulaId]);
      const parentStepIds = (seed.parentSeedIndexes ?? [])
        .map((index) => eventStepIds[index])
        .filter((parent): parent is string => parent !== undefined);
      steps.push({
        id,
        bomLineId: lineId,
        sequence,
        formula: formulaReference(seed.formulaId),
        rule: traceRule(seed.rule),
        inputs: seed.inputs.map((item) => ({
          name: item.name,
          value: item.value.toCanonical(),
          unit: item.unit
        })),
        output: traceValue(seed.output, seed.unit),
        rounding:
          seed.roundingBefore === null
            ? null
            : {
                mode: seed.roundingMode,
                before: traceValue(seed.roundingBefore, seed.roundingUnit ?? seed.unit),
                increment:
                  seed.roundingIncrement === null
                    ? null
                    : traceValue(seed.roundingIncrement, seed.roundingUnit ?? seed.unit),
                after: traceValue(seed.output, seed.unit)
              },
        sourceRefs: uniqueSourceRefs(seed.sourceRefs),
        parentStepIds
      });
      eventStepIds.push(id);
      sequence += 1;
      if (seed.contributesToDemand !== false) contributionStepIds.push(id);
    }
  }

  const originalTechnical =
    demand.quantityAdjustment === null
      ? demand.technicalQuantity
      : ExactDecimal.from(demand.quantityAdjustment.originalCalculatedQuantity.value);
  const aggregateId = stableId("trace", [lineId, "aggregate"]);
  steps.push({
    id: aggregateId,
    bomLineId: lineId,
    sequence,
    formula: formulaReference("DEMAND.AGGREGATE.V1"),
    rule: null,
    inputs: demand.events.map((event) => ({
      name: `event_${event.id}`,
      value: event.quantity.toCanonical(),
      unit: demand.unit
    })),
    output: traceValue(originalTechnical, demand.unit),
    rounding: null,
    sourceRefs: demand.sourceRefs,
    parentStepIds: contributionStepIds
  });
  sequence += 1;

  let technicalStepId = aggregateId;
  if (demand.quantityAdjustment !== null) {
    const adjustmentId = stableId("trace", [
      lineId,
      "quantity-adjustment",
      demand.quantityAdjustment.id
    ]);
    steps.push({
      id: adjustmentId,
      bomLineId: lineId,
      sequence,
      formula: formulaReference("MANUAL.QUANTITY_OVERRIDE.V1"),
      rule: null,
      inputs: [
        {
          name: "originalCalculatedQuantity",
          value: demand.quantityAdjustment.originalCalculatedQuantity.value,
          unit: demand.unit
        },
        {
          name: "adjustedQuantity",
          value: demand.quantityAdjustment.adjustedQuantity.value,
          unit: demand.unit
        }
      ],
      output: traceValue(demand.technicalQuantity, demand.unit),
      rounding: null,
      sourceRefs: uniqueSourceRefs([
        ...demand.sourceRefs,
        sourceRef("manualOverride", demand.quantityAdjustment.metadata.overrideId)
      ]),
      parentStepIds: [aggregateId]
    });
    technicalStepId = adjustmentId;
    sequence += 1;
  }

  const reserveId = stableId("trace", [lineId, "reserve"]);
  const reserveBefore =
    demand.technicalSectionCount !== null && demand.sectionLength !== null
      ? demand.unit === "m"
        ? demand.technicalSectionCount
            .multiply(ONE.add(quantities.reservePercent.divide(HUNDRED)))
            .multiply(demand.sectionLength)
        : demand.technicalSectionCount.multiply(ONE.add(quantities.reservePercent.divide(HUNDRED)))
      : demand.technicalQuantity.multiply(ONE.add(quantities.reservePercent.divide(HUNDRED)));
  const reserveRounded =
    (demand.technicalSectionCount !== null && demand.sectionLength !== null) ||
    demand.unit === "pcs";
  const reserveIncrement =
    demand.technicalSectionCount !== null && demand.sectionLength !== null
      ? demand.unit === "m"
        ? demand.sectionLength
        : ONE
      : demand.unit === "pcs"
        ? ONE
        : null;
  steps.push({
    id: reserveId,
    bomLineId: lineId,
    sequence,
    formula: formulaReference("RESERVE.APPLY_AFTER_TECHNICAL.V1"),
    rule: null,
    inputs: [
      {
        name: "technicalQuantity",
        value: demand.technicalQuantity.toCanonical(),
        unit: demand.unit
      },
      { name: "reservePercent", value: quantities.reservePercent.toCanonical(), unit: "percent" }
    ],
    output: traceValue(quantities.reserved, demand.unit),
    rounding: reserveRounded
      ? {
          mode: "ceil",
          before: traceValue(reserveBefore, demand.unit),
          increment: reserveIncrement === null ? null : traceValue(reserveIncrement, demand.unit),
          after: traceValue(quantities.reserved, demand.unit)
        }
      : null,
    sourceRefs: demand.sourceRefs,
    parentStepIds: [technicalStepId]
  });
  sequence += 1;

  const packageId = stableId("trace", [lineId, "packaging"]);
  steps.push({
    id: packageId,
    bomLineId: lineId,
    sequence,
    formula: formulaReference("PACKAGING.ROUND_UP_TO_INCREMENT.V1"),
    rule: null,
    inputs: [
      { name: "reservedQuantity", value: quantities.reserved.toCanonical(), unit: demand.unit },
      {
        name: "packageIncrement",
        value: quantities.packageIncrement.toCanonical(),
        unit: demand.unit
      }
    ],
    output: traceValue(quantities.ordered, demand.unit),
    rounding:
      quantities.packageCount === null
        ? null
        : {
            mode: "incrementCeil",
            before: traceValue(quantities.reserved, demand.unit),
            increment: traceValue(quantities.packageIncrement, demand.unit),
            after: traceValue(quantities.ordered, demand.unit)
          },
    sourceRefs: demand.sourceRefs,
    parentStepIds: [reserveId]
  });
  sequence += 1;

  const finalId = stableId("trace", [lineId, "final"]);
  steps.push({
    id: finalId,
    bomLineId: lineId,
    sequence,
    formula: formulaReference("BOM.FINALIZE.V1"),
    rule: null,
    inputs: [
      { name: "orderedQuantity", value: quantities.ordered.toCanonical(), unit: demand.unit }
    ],
    output: traceValue(quantities.ordered, demand.unit),
    rounding: null,
    sourceRefs: demand.sourceRefs,
    parentStepIds: [packageId]
  });

  return { steps, stepIds: steps.map((step) => step.id) };
}
