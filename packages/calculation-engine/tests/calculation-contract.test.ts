import { describe, expect, it } from "vitest";

import { CalculationInputV1Schema, CalculationResultV1Schema } from "@niedax/domain";
import { calculate, calculationEngine } from "../src/index.js";
import { validCalculationInputV1 } from "../../domain/tests/fixtures/calculation-v1.js";

describe("pure calculation engine contract", () => {
  it("can be invoked with parsed plain JSON and no application runtime", () => {
    const input = CalculationInputV1Schema.parse(
      JSON.parse(JSON.stringify(validCalculationInputV1))
    );
    const first = calculate(input);
    const second = calculationEngine.calculate(input);

    expect(first).toEqual(second);
    expect(first.inputFingerprint).toBe(input.invocation.inputFingerprint);
    expect(first.calculationStatus).toBe("contractOnly");
    expect(CalculationResultV1Schema.safeParse(first).success).toBe(true);
  });
});
