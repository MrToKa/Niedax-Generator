import { describe, expect, it } from "vitest";

import { CalculationResultV2Schema } from "@niedax/domain";
import allMajorExpected from "../../calculation-engine/tests/golden/expected/all-major-rules-combined.json" with { type: "json" };
import { representativeCalculationResultV1 } from "../../domain/tests/fixtures/calculation-v1.js";
import { buildEnglishExportModel, buildEnglishExportModelV2 } from "../src/index.js";

describe("English export model", () => {
  it("copies immutable BOM quantities without recalculation", () => {
    const model = buildEnglishExportModel(
      {
        projectCode: "PRJ-001",
        projectName: "Representative project",
        projectDescription: null,
        revisionNumber: 1,
        revisionStatus: "calculated"
      },
      representativeCalculationResultV1
    );

    expect(model.language).toBe("en");
    expect(model.rows).toHaveLength(representativeCalculationResultV1.bomLines.length);
    expect(model.rows[0]?.technicalQuantity).toBe(
      representativeCalculationResultV1.bomLines[0]?.technicalQuantity
    );
    expect(model.rows[0]?.packagingQuantity).toBe(
      representativeCalculationResultV1.bomLines[0]?.packagingQuantity
    );
    expect(model.rows[0]?.orderedQuantity).toBe(
      representativeCalculationResultV1.bomLines[0]?.orderedQuantity
    );
    expect(model.inputFingerprint).toBe(representativeCalculationResultV1.inputFingerprint);
  });

  it("copies v2 reserve, package, ordered, warning, and trace fields without recalculation", () => {
    const result = CalculationResultV2Schema.parse(allMajorExpected);
    const model = buildEnglishExportModelV2(
      {
        projectCode: "PRJ-V2",
        projectName: "Stage 6 project",
        projectDescription: null,
        revisionNumber: 2,
        revisionStatus: "calculated"
      },
      result
    );
    expect(model.rows).toHaveLength(result.bomLines.length);
    expect(model.rows[0]?.technicalQuantity).toBe(result.bomLines[0]?.technicalQuantity);
    expect(model.rows[0]?.reserveQuantity).toBe(result.bomLines[0]?.reserveQuantity);
    expect(model.rows[0]?.packagingOverage).toBe(result.bomLines[0]?.packagingOverage);
    expect(model.rows[0]?.orderedQuantity).toBe(result.bomLines[0]?.orderedQuantity);
    expect(model.rows[0]?.traceStepIds).toBe(result.bomLines[0]?.traceStepIds);
  });
});
