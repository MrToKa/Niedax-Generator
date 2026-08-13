import { describe, expect, it } from "vitest";

import rulesManifest from "../../../rules/manifest.json" with { type: "json" };
import { getCalculationEngineReadiness } from "../src/index.js";

describe("calculation engine public API", () => {
  it("is deterministic and reads the rules manifest", () => {
    const first = getCalculationEngineReadiness();
    const second = getCalculationEngineReadiness();

    expect(first).toEqual(second);
    expect(first).toEqual({
      ready: true,
      rulesVersion: rulesManifest.version,
      rulesStatus: "draft"
    });
  });

  it("publishes a valid semantic version", () => {
    expect(getCalculationEngineReadiness().rulesVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
