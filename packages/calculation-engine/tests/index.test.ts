import { describe, expect, it } from "vitest";

import rulesManifest from "../../../rules/manifest.json" with { type: "json" };
import { CALCULATION_ENGINE_VERSION, getCalculationEngineReadiness } from "../src/index.js";

describe("calculation engine public API", () => {
  it("is deterministic and reads the rules manifest", () => {
    const first = getCalculationEngineReadiness();
    const second = getCalculationEngineReadiness();

    expect(first).toEqual(second);
    expect(first).toEqual({
      ready: true,
      engineVersion: CALCULATION_ENGINE_VERSION,
      rulesVersion: rulesManifest.version,
      rulesStatus: "draft",
      calculationInputVersions: ["calculation-input/v1", "calculation-input/v2"]
    });
  });

  it("publishes a valid semantic version", () => {
    expect(getCalculationEngineReadiness().rulesVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
