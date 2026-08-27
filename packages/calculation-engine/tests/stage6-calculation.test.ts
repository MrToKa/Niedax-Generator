import { describe, expect, it } from "vitest";

import { CalculationInputV2Schema, CalculationResultV2Schema } from "@niedax/domain";
import { calculateV2, canonicalJson } from "../src/index.js";
import { allMajorRulesInputV2 } from "./helpers/fixture-v2.js";

function line(code: string) {
  const result = calculateV2(allMajorRulesInputV2);
  const found = result.bomLines.find((candidate) => candidate.productCode === code);
  if (found === undefined) throw new Error(`Missing BOM line ${code}`);
  return found;
}

describe("Stage 6 calculation pipeline", () => {
  it("parses the resolved v2 fixture and returns a schema-valid result", () => {
    expect(CalculationInputV2Schema.safeParse(allMajorRulesInputV2).success).toBe(true);
    const result = calculateV2(allMajorRulesInputV2);
    expect(CalculationResultV2Schema.safeParse(result).success).toBe(true);
    expect(result.calculationStatus).toBe("completeWithWarnings");
    expect(result.bomLines.length).toBeGreaterThan(0);
  });

  it("calculates sections per segment, then reserve and packaging", () => {
    expect(line("NX STRAIGHT")).toMatchObject({
      technicalQuantity: { value: "24", unit: "m" },
      reserveQuantity: { value: "6", unit: "m" },
      reservedQuantity: { value: "30", unit: "m" },
      packagingOverage: { value: "0", unit: "m" },
      orderedQuantity: { value: "30", unit: "m" },
      sectionDetail: {
        selectedSectionLength: { value: "6", unit: "m" },
        technicalSectionCount: { value: "4", unit: "pcs" },
        reservedSectionCount: { value: "5", unit: "pcs" }
      }
    });
  });

  it("calculates one continuous support group and its dependent axes", () => {
    expect(line("NX SUPPORT").technicalQuantity.value).toBe("11");
    expect(line("NX STRUCTURE").technicalQuantity.value).toBe("4");
    expect(line("NX ANCHOR").technicalQuantity.value).toBe("33");
    expect(line("NX WSTB").technicalQuantity.value).toBe("22");
  });

  it("uses fitting-specific connectors and suppresses included-only fasteners", () => {
    expect(line("NX CONNECTOR").technicalQuantity.value).toBe("2");
    expect(line("NX JOINT").technicalQuantity.value).toBe("2");
    const result = calculateV2(allMajorRulesInputV2);
    expect(result.bomLines.some((candidate) => candidate.productCode === "NX FASTENER")).toBe(
      false
    );
    expect(line("NX CONNECTOR").includedItems).toEqual([
      expect.objectContaining({
        productCode: "NX FASTENER",
        quantityPerParent: { value: "2", unit: "pcs" }
      })
    ]);
  });

  it("is byte-stable and gives every line a final reconciling trace", () => {
    const first = calculateV2(allMajorRulesInputV2);
    const second = calculateV2(allMajorRulesInputV2);
    expect(canonicalJson(first)).toBe(canonicalJson(second));
    for (const bomLine of first.bomLines) {
      const steps = first.trace.steps.filter((step) => step.bomLineId === bomLine.id);
      expect(steps.length).toBeGreaterThan(0);
      expect(steps.at(-1)?.formula.id).toBe("BOM.FINALIZE.V1");
      expect(steps.at(-1)?.output).toEqual(bomLine.orderedQuantity);
    }
  });
});
