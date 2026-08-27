import {
  CalculationInputV2Schema,
  CalculationResultV2Schema,
  type CalculationInputV2,
  type CalculationResultV2
} from "@niedax/domain";

import { CalculationEngineError } from "./errors.js";
import {
  aggregateDemands,
  applyProductQuantityAdjustments,
  attachPolicyWarnings
} from "./model/aggregation.js";
import type { DemandEvent } from "./model/demand-event.js";
import { buildIndexes } from "./model/indexes.js";
import { buildCalculationResult } from "./model/result-builder.js";
import { sourceRef } from "./model/source.js";
import { suppressIncludedDemand } from "./rules/included-items.js";
import { emitManualItemDemands } from "./rules/manual-items.js";
import {
  emitEndpointAndAccessoryDemands,
  emitFittingAndConnectionDemands,
  emitJointDemands
} from "./rules/materials.js";
import { emitSectionDemands } from "./rules/sections.js";
import { emitSupportDemands } from "./rules/supports.js";
import { WarningCollector } from "./rules/warnings.js";
import { deepFreeze } from "./stable/freeze.js";
import { buildLogicalSupportGroups } from "./topology/support-groups.js";
import { buildStraightRuns } from "./topology/straight-runs.js";

function annotateEngineeringProducts(
  events: readonly DemandEvent[],
  warnings: WarningCollector
): readonly DemandEvent[] {
  return events.map((event) => {
    if (
      event.product === null ||
      !event.product.engineeringReviewRequired ||
      event.category === "anchor"
    )
      return event;
    const warningId = warnings.add({
      code: "ENGINEERING_CHECK_REQUIRED",
      kind: "engineering",
      severity: "engineeringReview",
      subject: { kind: "product", id: event.product.id },
      effect:
        "The product quantity is retained, but its engineering verification flag remains visible.",
      approvalImpact: "reviewRequired",
      productId: event.product.id,
      sourceRefs: [event.product.source]
    });
    return { ...event, warningIds: [...new Set([...event.warningIds, warningId])].sort() };
  });
}

export function calculateV2(
  unparsedInput: CalculationInputV2,
  engineVersion: string
): CalculationResultV2 {
  const parsed = CalculationInputV2Schema.safeParse(unparsedInput);
  if (!parsed.success) {
    throw new CalculationEngineError(
      "INPUT_SCHEMA_INVALID",
      "Calculation input does not satisfy calculation-input/v2.",
      parsed.error.issues.map((issue) => ({
        path: issue.path.map((segment) =>
          typeof segment === "symbol" ? (segment.description ?? "symbol") : segment
        ),
        code: issue.code,
        message: issue.message
      }))
    );
  }
  const input = parsed.data;
  const warnings = new WarningCollector();
  if (input.project.cableLoad === null) {
    warnings.add({
      code: "MISSING_CABLE_LOAD",
      kind: "engineering",
      severity: "engineeringReview",
      subject: { kind: "project", id: input.project.id },
      effect:
        "Current BOM formulas continue without inventing a cable load; approval requires review.",
      approvalImpact: "reviewRequired",
      sourceRefs: [sourceRef("project", input.project.id)]
    });
  }
  const indexes = buildIndexes(input);
  const sections = emitSectionDemands(input, indexes, warnings);
  const supportGroups = buildLogicalSupportGroups(input, warnings);
  const straightRuns = buildStraightRuns(input, sections.segments);
  const events = annotateEngineeringProducts(
    [
      ...sections.events,
      ...emitJointDemands(input, indexes, warnings, straightRuns),
      ...emitFittingAndConnectionDemands(input, indexes, warnings),
      ...emitSupportDemands(input, indexes, warnings, supportGroups),
      ...emitEndpointAndAccessoryDemands(input, indexes, warnings),
      ...emitManualItemDemands(input, indexes, warnings)
    ],
    warnings
  );
  const unsuppressed = suppressIncludedDemand(events);
  const aggregated = aggregateDemands(unsuppressed);
  const adjusted = applyProductQuantityAdjustments(input, aggregated, warnings);
  const withPolicyWarnings = attachPolicyWarnings(adjusted, warnings);
  const result = buildCalculationResult(
    input,
    indexes,
    withPolicyWarnings,
    warnings.values(),
    engineVersion
  );
  const validatedResult = CalculationResultV2Schema.safeParse(result);
  if (!validatedResult.success) {
    throw new CalculationEngineError(
      "INTERNAL_INVARIANT_FAILED",
      "Calculation output failed its runtime schema.",
      validatedResult.error.issues.map((issue) => ({
        path: issue.path.map((segment) =>
          typeof segment === "symbol" ? (segment.description ?? "symbol") : segment
        ),
        code: issue.code,
        message: issue.message
      }))
    );
  }
  return deepFreeze(validatedResult.data);
}
