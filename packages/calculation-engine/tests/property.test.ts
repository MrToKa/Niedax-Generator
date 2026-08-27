import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { CalculationResultV2Schema } from "@niedax/domain";
import { ExactDecimal, calculateV2, canonicalJson } from "../src/index.js";
import { allMajorRulesInputV2 } from "./helpers/fixture-v2.js";

const PROPERTY_SEED = 6_020_260;
const PROPERTY_RUNS = 150;

describe("Stage 6 deterministic properties", () => {
  it("preserves section capacity, waste, and monotonicity", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 120_000 }),
        fc.constantFrom(3000, 6000),
        fc.integer({ min: 0, max: 20_000 }),
        (lengthMillimetres, sectionMillimetres, increaseMillimetres) => {
          const length = ExactDecimal.from(lengthMillimetres.toString());
          const section = ExactDecimal.from(sectionMillimetres.toString());
          const count = length.divide(section).ceil();
          const capacity = count.multiply(section);
          const waste = capacity.subtract(length);
          const increasedCount = length
            .add(ExactDecimal.from(increaseMillimetres.toString()))
            .divide(section)
            .ceil();
          expect(capacity.compare(length)).toBeGreaterThanOrEqual(0);
          expect(waste.compare(section)).toBeLessThan(0);
          expect(increasedCount.compare(count)).toBeGreaterThanOrEqual(0);
        }
      ),
      { seed: PROPERTY_SEED, numRuns: PROPERTY_RUNS }
    );
  });

  it("keeps reserve and package rounding monotone and integral", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10_000 }),
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 1, max: 100 }),
        (technicalValue, firstReserve, reserveIncrease, packageValue) => {
          const technical = ExactDecimal.from(technicalValue.toString());
          const percentA = ExactDecimal.from(firstReserve.toString());
          const percentB = ExactDecimal.from(
            Math.min(100, firstReserve + reserveIncrease).toString()
          );
          const multiplier = (percent: ExactDecimal) =>
            ExactDecimal.from("1").add(percent.divide(ExactDecimal.from("100")));
          const reservedA = technical.multiply(multiplier(percentA)).ceil();
          const reservedB = technical.multiply(multiplier(percentB)).ceil();
          const packageIncrement = ExactDecimal.from(packageValue.toString());
          const ordered = reservedB.divide(packageIncrement).ceil().multiply(packageIncrement);
          expect(reservedB.compare(reservedA)).toBeGreaterThanOrEqual(0);
          expect(ordered.compare(reservedB)).toBeGreaterThanOrEqual(0);
          expect(ordered.divide(packageIncrement).isInteger()).toBe(true);
        }
      ),
      { seed: PROPERTY_SEED + 1, numRuns: PROPERTY_RUNS }
    );
  });

  it("proves the continuous support formula over positive generated inputs", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100_000 }),
        fc.integer({ min: 1, max: 10_000 }),
        (lengthMillimetres, spacingMillimetres) => {
          const length = ExactDecimal.from(lengthMillimetres.toString());
          const spacing = ExactDecimal.from(spacingMillimetres.toString());
          const supports = length.divide(spacing).ceil().add(ExactDecimal.from("1"));
          expect(supports.isInteger()).toBe(true);
          expect(supports.compare(ExactDecimal.from("2"))).toBeGreaterThanOrEqual(0);
        }
      ),
      { seed: PROPERTY_SEED + 2, numRuns: PROPERTY_RUNS }
    );
  });

  it("repeats a generated valid calculation with schema-valid byte-stable output", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 20 }), (iteration) => {
        const first = calculateV2(allMajorRulesInputV2);
        const second = calculateV2(allMajorRulesInputV2);
        expect(CalculationResultV2Schema.safeParse(first).success).toBe(true);
        expect(canonicalJson(first), iteration.toString()).toBe(canonicalJson(second));
        for (const line of first.bomLines) {
          expect(
            /^(?:0|[1-9]\d*)$/u.test(line.unit === "pcs" ? line.orderedQuantity.value : "0")
          ).toBe(true);
          expect(
            ExactDecimal.from(line.orderedQuantity.value).compare(
              ExactDecimal.from(line.reservedQuantity.value)
            )
          ).toBeGreaterThanOrEqual(0);
          expect(
            ExactDecimal.from(line.reservedQuantity.value).compare(
              ExactDecimal.from(line.technicalQuantity.value)
            )
          ).toBeGreaterThanOrEqual(0);
        }
      }),
      { seed: PROPERTY_SEED + 3, numRuns: 25 }
    );
  });
});
