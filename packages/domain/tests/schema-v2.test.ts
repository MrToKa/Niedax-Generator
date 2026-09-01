import { describe, expect, it } from "vitest";

import expectedResult from "../../calculation-engine/tests/golden/expected/all-major-rules-combined.json" with { type: "json" };
import { allMajorRulesInputV2 } from "../../calculation-engine/tests/helpers/fixture-v2.js";
import {
  CalculationInputV1Schema,
  CalculationInputV2Schema,
  CalculationResultV2Schema,
  CalculationTraceV2Schema,
  TraceRuleReferenceV1Schema,
  TraceRuleReferenceV2Schema
} from "../src/index.js";
import { validCalculationInputV1 } from "./fixtures/calculation-v1.js";

describe("Stage 6 v2 runtime contracts", () => {
  it("preserves the retained v1 fixture and validates fully resolved v2 JSON", () => {
    expect(CalculationInputV1Schema.parse(validCalculationInputV1)).toEqual(
      validCalculationInputV1
    );
    const parsed = CalculationInputV2Schema.parse(JSON.parse(JSON.stringify(allMajorRulesInputV2)));
    expect(parsed).toEqual(allMajorRulesInputV2);
  });

  it("strictly rejects unknown keys and duplicate stable IDs", () => {
    expect(
      CalculationInputV2Schema.safeParse({ ...allMajorRulesInputV2, browserState: {} }).success
    ).toBe(false);
    expect(
      CalculationInputV2Schema.safeParse({
        ...allMajorRulesInputV2,
        products: [...allMajorRulesInputV2.products, allMajorRulesInputV2.products[0]]
      }).success
    ).toBe(false);
  });

  it("rejects fractional pieces and product/package dimension mismatches", () => {
    const invalidPieces = structuredClone(allMajorRulesInputV2);
    const support = invalidPieces.products.find((product) => product.id === "product-support");
    if (support === undefined) throw new Error("Missing support fixture");
    const invalid = {
      ...invalidPieces,
      products: invalidPieces.products.map((product) =>
        product.id === support.id
          ? { ...product, packageIncrement: { value: "1.5", unit: "pcs" as const } }
          : product
      )
    };
    expect(CalculationInputV2Schema.safeParse(invalid).success).toBe(false);

    const wrongDimension = {
      ...allMajorRulesInputV2,
      products: allMajorRulesInputV2.products.map((product) =>
        product.id === "product-support"
          ? { ...product, packageIncrement: { value: "1", unit: "m" as const } }
          : product
      )
    };
    expect(CalculationInputV2Schema.safeParse(wrongDimension).success).toBe(false);
  });

  it("validates the result and its standalone trace through a JSON round trip", () => {
    const result = CalculationResultV2Schema.parse(JSON.parse(JSON.stringify(expectedResult)));
    expect(CalculationTraceV2Schema.parse(result.trace)).toEqual(result.trace);

    const retainedNestedTrace = structuredClone(expectedResult);
    retainedNestedTrace.trace.schemaVersion = "calculation-trace/v1";
    expect(CalculationResultV2Schema.safeParse(retainedNestedTrace).success).toBe(true);
  });

  it("accepts persisted rule-version slugs only in the explicitly versioned v2 trace", () => {
    const reference = {
      id: "rule-slug-version",
      code: "RULE-SLUG",
      version: "2022-p0",
      confidence: "catalogConfirmed" as const,
      ruleSnapshotId: "rule-snapshot"
    };
    expect(TraceRuleReferenceV1Schema.safeParse(reference).success).toBe(false);
    expect(TraceRuleReferenceV2Schema.parse(reference)).toEqual(reference);
  });
});
