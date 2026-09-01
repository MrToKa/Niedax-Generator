import { readFileSync } from "node:fs";

import { CalculationResultV2Schema } from "@niedax/domain";
import { describe, expect, it } from "vitest";

import { buildBomLineViews, displayQuantity, isManualBomLine } from "./result-view-model";

describe("calculation result view model", () => {
  it("renders a runtime-parsed CalculationResultV2 with linked warnings and Why trace", () => {
    const raw = JSON.parse(
      readFileSync(
        new URL(
          "../../../../packages/calculation-engine/tests/golden/expected/per-segment-rounding-and-3m-6m-separation.json",
          import.meta.url
        ),
        "utf8"
      )
    ) as unknown;
    const result = CalculationResultV2Schema.parse(raw);
    const views = buildBomLineViews(result);

    expect(views).toHaveLength(result.bomLines.length);
    expect(views[0]?.traceSteps.map((step) => step.id)).toEqual(result.bomLines[0]?.traceStepIds);
    expect(views[0]?.warnings.map((warning) => warning.id)).toEqual(result.bomLines[0]?.warningIds);
    expect(views[0]?.sourceRefs).toBe(result.bomLines[0]?.sourceRefs);
    expect(views[0]?.provenance).toBe(result.bomLines[0]?.provenance);
    expect(views[0]?.provenance.catalogSnapshotId).toBe(result.catalogSnapshot.snapshotId);
    expect(views[0]?.provenance.ruleSnapshotId).toBe(result.ruleSnapshot.snapshotId);
    expect(views[0]?.provenance.ruleIds).toEqual(result.bomLines[0]?.provenance.ruleIds);
    expect(views[0]?.provenance.formulaIds).toEqual(
      expect.arrayContaining(views[0]?.traceSteps.map((step) => step.formula.id) ?? [])
    );
  });

  it("preserves canonical decimal strings for display", () => {
    expect(displayQuantity({ value: "12.3400", unit: "m" })).toBe("12.3400 m");
  });

  it("preserves the engine's explicit Manual provenance", () => {
    const raw = JSON.parse(
      readFileSync(
        new URL(
          "../../../../packages/calculation-engine/tests/golden/expected/route-ends-and-manual-items.json",
          import.meta.url
        ),
        "utf8"
      )
    ) as unknown;
    const result = CalculationResultV2Schema.parse(raw);
    const manualLines = result.bomLines.filter(isManualBomLine);
    expect(manualLines.length).toBeGreaterThan(0);
    expect(manualLines.every((line) => line.manualInputId !== null)).toBe(true);
  });
});
