import { describe, expect, it } from "vitest";

import { representativeCalculationResultV1 } from "../../domain/tests/fixtures/calculation-v1.js";
import { buildEnglishExportModel } from "../src/index.js";

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
});
