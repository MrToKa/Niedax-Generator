import { ExactDecimal, minimum, sumDecimals } from "../arithmetic/decimal.js";
import type { DemandEvent } from "../model/demand-event.js";
import { uniqueSourceRefs } from "../model/source.js";

export function suppressIncludedDemand(events: readonly DemandEvent[]): readonly DemandEvent[] {
  const capacities = new Map<string, ReturnType<typeof sumDecimals>>();
  for (const parent of events) {
    if (parent.product === null || parent.unit !== "pcs") continue;
    for (const relation of parent.product.includedItems) {
      const exactCapacity = parent.quantity.multiply(
        ExactDecimal.from(relation.quantityPerParent.value)
      );
      capacities.set(
        relation.childProductId,
        (capacities.get(relation.childProductId) ?? sumDecimals([])).add(exactCapacity)
      );
    }
  }
  const result: DemandEvent[] = [];
  for (const event of [...events].sort((left, right) => left.id.localeCompare(right.id))) {
    if (
      event.inclusionSuppression !== "eligible" ||
      event.product === null ||
      event.unit !== "pcs"
    ) {
      result.push(event);
      continue;
    }
    const available = capacities.get(event.product.id) ?? sumDecimals([]);
    const suppressed = minimum(event.quantity, available);
    if (suppressed.isZero()) {
      result.push(event);
      continue;
    }
    capacities.set(event.product.id, available.subtract(suppressed));
    const remaining = event.quantity.subtract(suppressed);
    if (remaining.isZero()) continue;
    const originalSeeds = event.traceSeeds.map((seed) => ({ ...seed, contributesToDemand: false }));
    result.push({
      ...event,
      quantity: remaining,
      sourceRefs: uniqueSourceRefs(event.sourceRefs),
      traceSeeds: [
        ...originalSeeds,
        {
          formulaId: "INCLUDED.SUPPRESS.V1",
          inputs: [
            { name: "originalDemand", value: event.quantity, unit: "pcs" },
            { name: "provenIncludedQuantity", value: suppressed, unit: "pcs" }
          ],
          output: remaining,
          unit: "pcs",
          sourceRefs: event.sourceRefs,
          rule: null,
          roundingMode: "none",
          roundingBefore: null,
          roundingIncrement: null,
          parentSeedIndexes: originalSeeds.map((_seed, index) => index)
        }
      ]
    });
  }
  return result;
}
