import { describe, expect, it } from "vitest";

import applicationPackage from "../package.json" with { type: "json" };
import catalogueManifest from "../catalogue/manifest.json" with { type: "json" };
import rulesManifest from "../rules/manifest.json" with { type: "json" };
import { getCalculationEngineReadiness } from "../packages/calculation-engine/src/index.js";

describe("version sources", () => {
  it("are valid semantic versions and consistent across layers", () => {
    const semver = /^\d+\.\d+\.\d+$/u;
    expect(applicationPackage.version).toMatch(semver);
    expect(catalogueManifest.version).toMatch(semver);
    expect(rulesManifest.version).toMatch(semver);
    expect(getCalculationEngineReadiness().rulesVersion).toBe(rulesManifest.version);
  });
});
