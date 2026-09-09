import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  CalculationInputV2Schema,
  CalculationResultV2Schema,
  type CalculationResultV2
} from "@niedax/domain";
import { calculateV2, canonicalJson } from "../src/index.js";
import {
  connectRoutes,
  line,
  manualItem,
  metadata,
  product,
  required,
  straightInput
} from "./helpers/stage10-fixtures.js";

// These independent BigInt references never import the engine's decimal implementation.
const SCALE = 10n ** 18n;
function scaled(value: string): bigint {
  const [whole = "0", fraction = ""] = value.split(".");
  return BigInt(whole) * SCALE + BigInt(fraction.padEnd(18, "0"));
}
function ceil(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator - 1n) / denominator;
}
function metres(value: number): string {
  const whole = Math.floor(value / 1000);
  const fraction = String(value % 1000)
    .padStart(3, "0")
    .replace(/0+$/u, "");
  return fraction === "" ? String(whole) : `${whole}.${fraction}`;
}
function reconciles(result: CalculationResultV2): void {
  expect(CalculationResultV2Schema.safeParse(result).success).toBe(true);
  for (const item of result.bomLines) {
    const technical = scaled(item.technicalQuantity.value),
      reserved = scaled(item.reservedQuantity.value),
      ordered = scaled(item.orderedQuantity.value);
    expect(technical + scaled(item.reserveQuantity.value)).toBe(reserved);
    expect(reserved + scaled(item.packagingOverage.value)).toBe(ordered);
    expect(ordered - technical).toBe(scaled(item.totalSpareQuantity.value));
    expect(ordered >= reserved && reserved >= technical && technical >= 0n).toBe(true);
    if (item.unit === "pcs") expect(ordered % SCALE).toBe(0n);
    if (item.packageCount !== null) {
      const increment = scaled(item.packageIncrement.value);
      expect(ordered % increment).toBe(0n);
      expect(BigInt(item.packageCount.value) * increment).toBe(ordered);
    }
    const steps = result.trace.steps.filter((step) => step.bomLineId === item.id);
    expect(steps.at(-1)?.formula.id).toBe("BOM.FINALIZE.V1");
    expect(steps.at(-1)?.output).toEqual(item.orderedQuantity);
    expect(item.sourceRefs.length).toBeGreaterThan(0);
  }
}

describe("Stage 10 varied public-engine properties", () => {
  it("varies per-segment geometry and supply choices against integer capacity references", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({ mm: fc.integer({ min: 1, max: 120000 }), section: fc.constantFrom(3, 6) }),
          { minLength: 1, maxLength: 8 }
        ),
        fc.integer({ min: 1, max: 20000 }),
        (segments, increase) => {
          const input = straightInput(segments.map((segment) => metres(segment.mm)));
          const route = required(input.project.routes[0]);
          for (const [index, item] of route.geometry.entries())
            if (item.kind === "straight")
              item.supplyOptionId = `supply-${required(segments[index]).section}m`;
          expect(CalculationInputV2Schema.safeParse(input).success).toBe(true);
          const result = calculateV2(input);
          for (const supply of [3, 6]) {
            const selected = segments.filter((segment) => segment.section === supply);
            const bom = result.bomLines.find(
              (item) => item.sectionDetail?.supplyOptionId === `supply-${supply}m`
            );
            if (selected.length === 0) {
              expect(bom).toBeUndefined();
              continue;
            }
            const count = selected.reduce(
              (sum, segment) => sum + ceil(BigInt(segment.mm), BigInt(supply * 1000)),
              0n
            );
            expect(required(bom).sectionDetail?.technicalSectionCount.value).toBe(String(count));
            expect(required(bom).technicalQuantity.value).toBe(String(count * BigInt(supply)));
            const wasteMm =
              count * BigInt(supply * 1000) -
              BigInt(selected.reduce((sum, item) => sum + item.mm, 0));
            expect(wasteMm >= 0n && wasteMm < BigInt(selected.length * supply * 1000)).toBe(true);
          }
          const last = required(route.geometry.at(-1));
          if (last.kind === "straight")
            last.length.value = metres(required(segments.at(-1)).mm + increase);
          const total = (value: CalculationResultV2) =>
            value.bomLines
              .filter((item) => item.category === "linearSection")
              .reduce((sum, item) => sum + scaled(item.technicalQuantity.value), 0n);
          expect(total(calculateV2(input)) >= total(result)).toBe(true);
          reconciles(result);
        }
      ),
      { seed: 10020260, numRuns: 80, verbose: true }
    );
  });

  it("varies manual units reserve and packaging with independent exact expected deltas", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100000 }),
        fc.constantFrom("pcs" as const, "m" as const, "kg" as const),
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 1, max: 50 }),
        fc.boolean(),
        (quantity, unit, reserve, pack, enabled) => {
          const input = straightInput();
          input.project.defaultReservePercent = String(reserve);
          const item = manualItem(
            "generated-manual",
            unit === "pcs" ? String(quantity) : metres(quantity),
            unit
          );
          item.packagingPolicy.increment.value = String(pack);
          input.manualItems = [item];
          input.options.includePackaging = enabled;
          expect(CalculationInputV2Schema.safeParse(input).success).toBe(true);
          const result = calculateV2(input);
          const bom = result.bomLines.find((candidate) => candidate.manualInputId === item.id);
          if (quantity === 0) {
            expect(bom).toBeUndefined();
            return;
          }
          const technical = scaled(item.quantity.value),
            exactReserved = (technical * BigInt(100 + reserve)) / 100n;
          const reserved = unit === "pcs" ? ceil(exactReserved, SCALE) * SCALE : exactReserved;
          const ordered = enabled
            ? ceil(reserved, BigInt(pack) * SCALE) * BigInt(pack) * SCALE
            : reserved;
          expect(scaled(required(bom).reservedQuantity.value)).toBe(reserved);
          expect(scaled(required(bom).orderedQuantity.value)).toBe(ordered);
          expect(required(bom).packageCount?.value ?? null).toBe(
            enabled ? String(ordered / (BigInt(pack) * SCALE)) : null
          );
          reconciles(result);
        }
      ),
      { seed: 10020261, numRuns: 80, verbose: true }
    );
  });

  it("varies shared and physical topology lengths and support spacings", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 5 }),
        fc.integer({ min: 1, max: 20000 }),
        fc.integer({ min: 1, max: 10000 }),
        fc.boolean(),
        (count, mm, spacing, physical) => {
          const input = straightInput([metres(mm)]);
          required(input.project.routes[0]).supports.spacing.value = metres(spacing);
          connectRoutes(input, count, physical);
          const result = calculateV2(input);
          const expected = physical
            ? BigInt(count) * (ceil(BigInt(mm), BigInt(spacing)) + 1n)
            : ceil(BigInt(mm * count), BigInt(spacing)) + 1n;
          expect(line(result, "NX SUPPORT").technicalQuantity.value).toBe(String(expected));
          expect(result.bomLines.some((item) => item.productCode === "NX CONNECTOR")).toBe(
            physical
          );
          reconciles(result);
        }
      ),
      { seed: 10020262, numRuns: 80, verbose: true }
    );
  });

  it("varies template scopes anchor counts and dedicated WSTB policies without double counting", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        fc.integer({ min: 1, max: 10 }),
        fc.integer({ min: 1, max: 6 }),
        fc.integer({ min: 1, max: 8 }),
        (levels, fixed, anchors, wstb) => {
          const input = straightInput(),
            route = required(input.project.routes[0]),
            template = required(input.assemblyTemplates[0]);
          route.supports.levelCount = { value: String(levels), unit: "pcs" };
          required(
            template.components.find((component) => component.role === "anchor")
          ).quantity.value = String(anchors);
          const source = required(template.components[0]).source;
          template.components.push({
            id: "generated-fixed",
            role: "structure",
            productId: "product-structure",
            quantity: { value: String(fixed), unit: "pcs" },
            quantityMode: "fixed",
            suppressWhenIncluded: false,
            manualParameterId: null,
            source
          });
          template.components.push({
            id: "generated-level",
            role: "structure",
            productId: "product-structure",
            quantity: { value: "2", unit: "pcs" },
            quantityMode: "perLevel",
            suppressWhenIncluded: false,
            manualParameterId: null,
            source
          });
          route.supports.wstb = {
            mode: "custom",
            ruleId: "rule-wstb-two",
            quantityPerSupport: String(wstb),
            metadata: metadata("generated-wstb")
          };
          const result = calculateV2(input);
          expect(line(result, "NX STRUCTURE").technicalQuantity.value).toBe(
            String(fixed + levels * 2)
          );
          expect(line(result, "NX ANCHOR").technicalQuantity.value).toBe(String(anchors * 5));
          if (wstb > 0)
            expect(line(result, "NX WSTB").technicalQuantity.value).toBe(String(wstb * 5));
          else expect(result.bomLines.some((item) => item.productCode === "NX WSTB")).toBe(false);
          reconciles(result);
        }
      ),
      { seed: 10020263, numRuns: 60, verbose: true }
    );
  });

  it("replays varied inputs and unordered permutations with complete reconciliation", () => {
    const fingerprints = new Set<string>();
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 6 }),
        fc.integer({ min: 1, max: 10000 }),
        fc.integer({ min: 0, max: 100 }),
        fc.boolean(),
        (routes, mm, reserve, packaging) => {
          const input = straightInput([metres(mm), "8.5"]);
          connectRoutes(input, routes);
          input.project.defaultReservePercent = String(reserve);
          input.options.includePackaging = packaging;
          product(input, "product-anchor").packageIncrement = { value: "50", unit: "pcs" };
          fingerprints.add(canonicalJson(input));
          const before = canonicalJson(input),
            result = calculateV2(input);
          expect(canonicalJson(calculateV2(input))).toBe(canonicalJson(result));
          expect(canonicalJson(input)).toBe(before);
          input.project.routes.reverse();
          input.project.connections.reverse();
          input.products.reverse();
          input.rules.reverse();
          input.compatibilityRelations.reverse();
          input.assemblyTemplates.reverse();
          expect(canonicalJson(calculateV2(input))).toBe(canonicalJson(result));
          reconciles(result);
        }
      ),
      { seed: 10020264, numRuns: 50, verbose: true }
    );
    expect(fingerprints.size).toBeGreaterThan(40);
  });
});
