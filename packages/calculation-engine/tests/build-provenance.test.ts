import { describe, expect, it } from "vitest";
import { calculateV2 } from "../src/index.js";
import { allMajorRulesInputV2 } from "./helpers/fixture-v2.js";
import expected from "./golden/expected/all-major-rules-combined.json" with { type: "json" };

describe("application-build evidence without formula changes", () => {
  it("keeps the independently retained complete result deterministic with optional invocation provenance", () => {
    const input = {
      ...allMajorRulesInputV2,
      invocation: {
        ...allMajorRulesInputV2.invocation,
        applicationBuild: {
          application: "0.1.0",
          gitCommit: "abc12345".repeat(5),
          buildTimestamp: "2026-09-01T07:00:00.000Z",
          environment: "test" as const
        }
      }
    };
    expect(calculateV2(input)).toEqual(expected);
    expect(calculateV2(input)).toEqual(calculateV2(input));
    expect(calculateV2(allMajorRulesInputV2)).toEqual(expected);
  });
});
