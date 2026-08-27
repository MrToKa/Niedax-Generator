import type { CalculationInputV2 } from "@niedax/domain";

import { ExactDecimal } from "../arithmetic/decimal.js";
import { CalculationEngineError } from "../errors.js";
import type { DemandEvent, OrderUnit, TraceSeed } from "../model/demand-event.js";
import type { CalculationIndexes } from "../model/indexes.js";
import { sourceRef, uniqueSourceRefs } from "../model/source.js";
import { stableId } from "../stable/ids.js";
import { failIfRequired, requireCompatibleProduct } from "./compatibility.js";
import { resolvePolicies } from "./policies.js";
import type { WarningCollector } from "./warnings.js";

function requireOrderUnit(unit: string): OrderUnit {
  if (unit === "pcs" || unit === "m" || unit === "kg") return unit;
  throw new CalculationEngineError(
    "SEMANTIC_INPUT_INVALID",
    "Manual item uses a non-order dimension."
  );
}

export function emitManualItemDemands(
  input: CalculationInputV2,
  indexes: CalculationIndexes,
  warnings: WarningCollector
): readonly DemandEvent[] {
  const events: DemandEvent[] = [];
  for (const item of [...input.manualItems].sort((left, right) =>
    left.id.localeCompare(right.id)
  )) {
    const product = item.kind === "catalog" ? indexes.products.get(item.productId) : null;
    if (item.kind === "catalog" && product === undefined)
      throw new CalculationEngineError(
        "INTERNAL_INVARIANT_FAILED",
        "Validated manual catalog product is missing."
      );
    if (product !== null && product !== undefined) {
      if (
        product.code !== item.productCode ||
        product.descriptionEn !== item.descriptionEn ||
        product.orderUnit !== item.quantity.unit
      )
        throw new CalculationEngineError(
          "SEMANTIC_INPUT_INVALID",
          "Manual catalog identity or unit does not match the supplied product snapshot.",
          [{ path: ["manualItems", item.id], code: "MANUAL_CATALOG_MISMATCH", message: product.id }]
        );
    }
    const sources = uniqueSourceRefs([
      sourceRef("manualInput", item.id),
      ...(product === null || product === undefined ? [] : [product.source])
    ]);
    if (product !== null && product !== undefined) {
      const compatibility = requireCompatibleProduct(
        input,
        indexes,
        warnings,
        product,
        "manualCatalog",
        "manualInput",
        item.id,
        sources
      );
      if (!compatibility.compatible) {
        failIfRequired(input, item.id, "Manual catalog product is incompatible.");
        continue;
      }
    }
    const policies = resolvePolicies(
      input,
      product ?? null,
      item.id,
      item.reservePolicy,
      item.packagingPolicy
    );
    const warningIds: string[] = [];
    if (policies.packaging.mode === "incrementOverride") {
      warningIds.push(
        warnings.add({
          code: "MANUAL_PACKAGE_OVERRIDE",
          kind: "manualOverride",
          severity: "warning",
          subject: { kind: "manualInput", id: item.id },
          effect: "The explicit package increment replaced catalog/default packaging.",
          approvalImpact: "reviewRequired",
          productId: product?.id ?? null,
          sourceRefs: [
            sourceRef("manualOverride", policies.packaging.metadata.overrideId),
            ...sources
          ],
          overrideId: policies.packaging.metadata.overrideId
        })
      );
    }
    if (policies.reserve.mode !== "projectDefault") {
      warningIds.push(
        warnings.add({
          code: "MANUAL_QUANTITY_OVERRIDE",
          kind: "manualOverride",
          severity: "warning",
          subject: { kind: "manualInput", id: item.id },
          effect: "The explicit reserve policy replaced the project default.",
          approvalImpact: "reviewRequired",
          productId: product?.id ?? null,
          sourceRefs: [
            sourceRef("manualOverride", policies.reserve.metadata.overrideId),
            ...sources
          ],
          overrideId: policies.reserve.metadata.overrideId
        })
      );
    }
    const original = ExactDecimal.from(item.quantity.value);
    const orderUnit = requireOrderUnit(item.quantity.unit);
    const quantity =
      item.quantityOverride === null
        ? original
        : ExactDecimal.from(item.quantityOverride.adjustedQuantity.value);
    const seeds: TraceSeed[] = [
      {
        formulaId: "MANUAL.ITEM.V1",
        inputs: [{ name: "explicitManualQuantity", value: original, unit: orderUnit }],
        output: original,
        unit: orderUnit,
        sourceRefs: sources,
        rule: null,
        roundingMode: "none",
        roundingBefore: null,
        roundingIncrement: null,
        contributesToDemand: item.quantityOverride === null
      }
    ];
    if (item.quantityOverride !== null) {
      warningIds.push(
        warnings.add({
          code: "MANUAL_QUANTITY_OVERRIDE",
          kind: "manualOverride",
          severity: "warning",
          subject: { kind: "manualInput", id: item.id },
          effect: "The explicit adjusted quantity replaced the entered technical quantity.",
          approvalImpact: "reviewRequired",
          productId: product?.id ?? null,
          sourceRefs: [
            sourceRef("manualOverride", item.quantityOverride.metadata.overrideId),
            ...sources
          ],
          overrideId: item.quantityOverride.metadata.overrideId
        })
      );
      seeds.push({
        formulaId: "MANUAL.QUANTITY_OVERRIDE.V1",
        inputs: [
          { name: "originalCalculatedQuantity", value: original, unit: orderUnit },
          { name: "adjustedQuantity", value: quantity, unit: orderUnit }
        ],
        output: quantity,
        unit: orderUnit,
        sourceRefs: [
          sourceRef("manualOverride", item.quantityOverride.metadata.overrideId),
          ...sources
        ],
        rule: null,
        roundingMode: "none",
        roundingBefore: null,
        roundingIncrement: null,
        parentSeedIndexes: [0]
      });
    }
    events.push({
      id: stableId("demand", ["manual", item.id]),
      product: product ?? null,
      manualInputId: item.id,
      manualProductCode: item.productCode,
      manualDescription: item.descriptionEn,
      category: "manual",
      quantity,
      unit: orderUnit,
      supplyOptionId: null,
      sectionLength: null,
      sectionCount: null,
      reservePolicy: policies.reserve,
      packagingPolicy: policies.packaging,
      overrideBoundary: `${item.id}:${policies.overrideBoundary}`,
      status: "manual",
      inclusionSuppression: "independent",
      sourceRefs: sources,
      ruleIds: [],
      warningIds,
      traceSeeds: seeds
    });
  }
  return events;
}
