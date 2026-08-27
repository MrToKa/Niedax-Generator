import type { CalculationInputV2 } from "@niedax/domain";

import { ExactDecimal, sumDecimals } from "../arithmetic/decimal.js";
import { CalculationEngineError } from "../errors.js";
import type { AggregatedDemand, DemandEvent } from "./demand-event.js";
import { uniqueSourceRefs } from "./source.js";
import { policyKey } from "../rules/policies.js";
import type { WarningCollector } from "../rules/warnings.js";
import { stableId } from "../stable/ids.js";

function aggregationKey(event: DemandEvent): string {
  return [
    event.product === null ? `manual:${event.manualInputId}` : `product:${event.product.id}`,
    event.category,
    event.unit,
    event.supplyOptionId ?? "none",
    policyKey(event.reservePolicy, event.packagingPolicy),
    event.overrideBoundary,
    event.status
  ].join("|");
}

export function aggregateDemands(events: readonly DemandEvent[]): readonly AggregatedDemand[] {
  const groups = new Map<string, DemandEvent[]>();
  for (const event of [...events].sort((left, right) => left.id.localeCompare(right.id))) {
    if (event.quantity.isZero()) continue;
    const key = aggregationKey(event);
    const values = groups.get(key) ?? [];
    values.push(event);
    groups.set(key, values);
  }
  return [...groups.entries()]
    .map(([key, groupedEvents]) => {
      const first = groupedEvents[0];
      if (first === undefined) throw new Error("EMPTY_DEMAND_GROUP");
      const sectionLengths = new Set(
        groupedEvents.map((event) => event.sectionLength?.toCanonical() ?? "none")
      );
      if (sectionLengths.size > 1)
        throw new CalculationEngineError(
          "INTERNAL_INVARIANT_FAILED",
          "Aggregation mixed section lengths."
        );
      return {
        key,
        events: groupedEvents,
        product: first.product,
        manualInputId: first.manualInputId,
        productCode: first.product?.code ?? first.manualProductCode,
        descriptionEn: first.product?.descriptionEn ?? first.manualDescription ?? "Manual item",
        category: first.category,
        unit: first.unit,
        technicalQuantity: sumDecimals(groupedEvents.map((event) => event.quantity)),
        supplyOptionId: first.supplyOptionId,
        sectionLength: first.sectionLength,
        technicalSectionCount:
          first.sectionCount === null
            ? null
            : sumDecimals(groupedEvents.map((event) => event.sectionCount ?? sumDecimals([]))),
        reservePolicy: first.reservePolicy,
        packagingPolicy: first.packagingPolicy,
        status: first.status,
        sourceRefs: uniqueSourceRefs(groupedEvents.flatMap((event) => event.sourceRefs)),
        ruleIds: [...new Set(groupedEvents.flatMap((event) => event.ruleIds))].sort(),
        warningIds: [...new Set(groupedEvents.flatMap((event) => event.warningIds))].sort(),
        quantityAdjustment: null
      };
    })
    .sort((left, right) => left.key.localeCompare(right.key));
}

export function attachPolicyWarnings(
  demands: readonly AggregatedDemand[],
  warnings: WarningCollector
): readonly AggregatedDemand[] {
  return demands.map((demand) => {
    const warningIds = [...demand.warningIds];
    if (demand.reservePolicy.mode !== "projectDefault") {
      warningIds.push(
        warnings.add({
          code: "MANUAL_QUANTITY_OVERRIDE",
          kind: "manualOverride",
          severity: "warning",
          subject: { kind: "demand", id: stableId("demand", [demand.key]) },
          effect: "The explicit reserve policy replaced the project default.",
          approvalImpact: "reviewRequired",
          productId: demand.product?.id ?? null,
          sourceRefs: demand.sourceRefs,
          overrideId: demand.reservePolicy.metadata.overrideId
        })
      );
    }
    if (
      demand.packagingPolicy.mode === "incrementOverride" ||
      (demand.packagingPolicy.mode === "disabled" && demand.packagingPolicy.metadata !== null)
    ) {
      const metadata = demand.packagingPolicy.metadata;
      warningIds.push(
        warnings.add({
          code: "MANUAL_PACKAGE_OVERRIDE",
          kind: "manualOverride",
          severity: "warning",
          subject: { kind: "demand", id: stableId("demand", [demand.key]) },
          effect: "The explicit packaging policy replaced the catalog/default policy.",
          approvalImpact: "reviewRequired",
          productId: demand.product?.id ?? null,
          sourceRefs: demand.sourceRefs,
          overrideId: metadata?.overrideId ?? null
        })
      );
    }
    return { ...demand, warningIds: [...new Set(warningIds)].sort() };
  });
}

export function applyProductQuantityAdjustments(
  input: CalculationInputV2,
  demands: readonly AggregatedDemand[],
  warnings: WarningCollector
): readonly AggregatedDemand[] {
  const result = [...demands];
  for (const policy of input.linePolicies) {
    if (policy.target.kind !== "catalogProduct") continue;
    const productId = policy.target.productId;
    const matches = result.filter((demand) => demand.product?.id === productId);
    if (matches.length > 1)
      throw new CalculationEngineError(
        "AMBIGUOUS_LINE_POLICY",
        "A product-level line policy matches multiple semantic BOM lines.",
        [{ path: ["linePolicies", policy.id], code: "AMBIGUOUS_LINE_POLICY", message: productId }]
      );
  }
  for (const adjustment of input.productQuantityAdjustments) {
    const indexes = result
      .map((demand, index) => ({ demand, index }))
      .filter(({ demand }) => demand.product?.id === adjustment.productId);
    if (indexes.length !== 1)
      throw new CalculationEngineError(
        "AMBIGUOUS_LINE_POLICY",
        "A product quantity adjustment must resolve to exactly one semantic BOM line.",
        [
          {
            path: ["productQuantityAdjustments", adjustment.id],
            code: "AMBIGUOUS_QUANTITY_OVERRIDE",
            message: adjustment.productId
          }
        ]
      );
    const match = indexes[0];
    if (match === undefined) continue;
    if (
      adjustment.originalCalculatedQuantity.unit !== match.demand.unit ||
      adjustment.adjustedQuantity.unit !== match.demand.unit ||
      ExactDecimal.from(adjustment.originalCalculatedQuantity.value).compare(
        match.demand.technicalQuantity
      ) !== 0
    )
      throw new CalculationEngineError(
        "SEMANTIC_INPUT_INVALID",
        "Product quantity adjustment does not reconcile to the calculated line.",
        [
          {
            path: ["productQuantityAdjustments", adjustment.id],
            code: "QUANTITY_OVERRIDE_MISMATCH",
            message: adjustment.productId
          }
        ]
      );
    const adjusted = ExactDecimal.from(adjustment.adjustedQuantity.value);
    let adjustedSectionCount = match.demand.technicalSectionCount;
    if (match.demand.sectionLength !== null) {
      adjustedSectionCount = adjusted.divide(match.demand.sectionLength);
      if (!adjustedSectionCount.isInteger())
        throw new CalculationEngineError(
          "SEMANTIC_INPUT_INVALID",
          "Straight-section quantity override must remain a whole selected section multiple."
        );
    }
    const warningId = warnings.add({
      code: "MANUAL_QUANTITY_OVERRIDE",
      kind: "manualOverride",
      severity: "warning",
      subject: { kind: "product", id: adjustment.productId },
      effect: "The manual quantity replaced the aggregated technical quantity before reserve.",
      approvalImpact: "reviewRequired",
      productId: adjustment.productId,
      sourceRefs: match.demand.sourceRefs,
      overrideId: adjustment.metadata.overrideId
    });
    result[match.index] = {
      ...match.demand,
      technicalQuantity: adjusted,
      technicalSectionCount: adjustedSectionCount,
      status: "manual",
      warningIds: [...new Set([...match.demand.warningIds, warningId])].sort(),
      quantityAdjustment: adjustment
    };
  }
  return result;
}
