import type { CalculationInputV2, CalculationRuleV2 } from "@niedax/domain";

import { ExactDecimal } from "../arithmetic/decimal.js";
import { metresFromMillimetres } from "../arithmetic/quantity.js";
import { CalculationEngineError } from "../errors.js";
import type { DemandEvent } from "../model/demand-event.js";
import type { CalculationIndexes } from "../model/indexes.js";
import { sourceRef, uniqueSourceRefs } from "../model/source.js";
import { stableId } from "../stable/ids.js";
import { failIfRequired, requireCompatibleProduct } from "./compatibility.js";
import { resolvePolicies } from "./policies.js";
import type { WarningCollector } from "./warnings.js";

export interface SectionSegmentResult {
  readonly id: string;
  readonly routeId: string;
  readonly order: number;
  readonly productId: string;
  readonly supplyOptionId: string;
  readonly sectionCount: ExactDecimal;
  readonly sectionLength: ExactDecimal;
  readonly eventId: string;
}

export interface SectionsResult {
  readonly events: readonly DemandEvent[];
  readonly segments: readonly SectionSegmentResult[];
}

function requireSupplyRule(
  indexes: CalculationIndexes,
  ruleId: string,
  productId: string,
  supplyOptionId: string
): CalculationRuleV2 {
  const rule = indexes.rules.get(ruleId);
  if (
    rule?.type !== "supplyOption" ||
    rule.productId !== productId ||
    rule.supplyOptionId !== supplyOptionId
  ) {
    throw new CalculationEngineError(
      "SEMANTIC_INPUT_INVALID",
      "Supply option provenance does not match its product and option.",
      [
        {
          path: ["products", productId, "supplyOptions", supplyOptionId],
          code: "SUPPLY_RULE_MISMATCH",
          message: ruleId
        }
      ]
    );
  }
  return rule;
}

export function emitSectionDemands(
  input: CalculationInputV2,
  indexes: CalculationIndexes,
  warnings: WarningCollector
): SectionsResult {
  const events: DemandEvent[] = [];
  const segments: SectionSegmentResult[] = [];
  for (const route of [...input.project.routes].sort((left, right) =>
    left.id.localeCompare(right.id)
  )) {
    const product = indexes.products.get(route.straightProductId);
    if (product === undefined)
      throw new CalculationEngineError(
        "INTERNAL_INVARIANT_FAILED",
        "Validated straight product is missing."
      );
    if (product.orderUnit === "kg") {
      throw new CalculationEngineError(
        "SEMANTIC_INPUT_INVALID",
        "Straight-section products must be ordered in metres or pieces.",
        [
          {
            path: ["products", product.id, "orderUnit"],
            code: "UNSUPPORTED_STRAIGHT_ORDER_UNIT",
            message: "kg"
          }
        ]
      );
    }
    const policies = resolvePolicies(
      input,
      product,
      null,
      { mode: "projectDefault" },
      { mode: "catalogDefault" }
    );
    for (const [order, item] of route.geometry.entries()) {
      if (item.kind !== "straight") continue;
      const supplyOptionId = item.supplyOptionId ?? route.defaultSupplyOptionId;
      const option = product.supplyOptions.find((candidate) => candidate.id === supplyOptionId);
      if (option === undefined || !option.active || !option.orderable) {
        warnings.add({
          code: "UNRESOLVED_SECTION_SUPPLY_OPTION",
          kind: "catalog",
          severity: "blocking",
          subject: { kind: "segment", id: item.id },
          effect: "The segment has no orderable line and no alternate length was substituted.",
          approvalImpact: "blocksApproval",
          productId: product.id,
          sourceRefs: [sourceRef("segment", item.id), product.source]
        });
        failIfRequired(
          input,
          item.id,
          "The selected straight-section supply option is unresolved."
        );
        continue;
      }
      const supplyRule = requireSupplyRule(indexes, option.ruleId, product.id, option.id);
      const sources = uniqueSourceRefs([
        sourceRef("route", route.id),
        sourceRef("segment", item.id),
        sourceRef("supplyOption", option.id),
        product.source,
        option.source,
        supplyRule.source
      ]);
      const compatibility = requireCompatibleProduct(
        input,
        indexes,
        warnings,
        product,
        "straightSection",
        "segment",
        item.id,
        sources
      );
      if (!compatibility.compatible) {
        failIfRequired(input, item.id, "The selected straight-section product is not compatible.");
        continue;
      }
      const segmentLength = ExactDecimal.from(item.length.value);
      const sectionLength = metresFromMillimetres(option.length.value);
      const unroundedSectionCount = segmentLength.divide(sectionLength);
      const sectionCount = unroundedSectionCount.ceil();
      const technicalQuantity =
        product.orderUnit === "m" ? sectionCount.multiply(sectionLength) : sectionCount;
      const eventId = stableId("demand", [
        "section",
        route.id,
        item.id,
        product.id,
        option.id,
        "SECTION.REQUIRED_PER_SEGMENT.V1"
      ]);
      events.push({
        id: eventId,
        product,
        manualInputId: null,
        manualProductCode: null,
        manualDescription: null,
        category: "linearSection",
        quantity: technicalQuantity,
        unit: product.orderUnit,
        supplyOptionId: option.id,
        sectionLength,
        sectionCount,
        reservePolicy: policies.reserve,
        packagingPolicy: policies.packaging,
        overrideBoundary: policies.overrideBoundary,
        status: "calculated",
        inclusionSuppression: "independent",
        sourceRefs: sources,
        ruleIds: [supplyRule.id],
        warningIds: compatibility.warningIds,
        traceSeeds: [
          {
            formulaId: "SECTION.REQUIRED_PER_SEGMENT.V1",
            inputs: [
              { name: "segmentLength", value: segmentLength, unit: "m" },
              { name: "selectedSupplyLength", value: sectionLength, unit: "m" }
            ],
            output: technicalQuantity,
            unit: product.orderUnit,
            sourceRefs: sources,
            rule: supplyRule,
            roundingMode: "ceil",
            roundingBefore: segmentLength,
            roundingIncrement: sectionLength,
            roundingUnit: "m"
          }
        ]
      });
      segments.push({
        id: item.id,
        routeId: route.id,
        order,
        productId: product.id,
        supplyOptionId: option.id,
        sectionCount,
        sectionLength,
        eventId
      });
    }
  }
  return { events, segments };
}
