import { describe, expect, it } from "vitest";

import { isProjectBackupFilename, shouldPrune } from "./backup-policy.js";

describe("backup safety policy", () => {
  it("accepts only exact project backup targets", () => {
    expect(isProjectBackupFilename("20260813T120000Z_niedax_generator_pg18.dump")).toBe(true);
    expect(isProjectBackupFilename("../20260813T120000Z_niedax_generator_pg18.dump")).toBe(false);
    expect(isProjectBackupFilename("20260813T120000Z_other_pg18.dump")).toBe(false);
  });

  it("prunes only verified files strictly older than 28 days", () => {
    expect(shouldPrune(29, true)).toBe(true);
    expect(shouldPrune(28, true)).toBe(false);
    expect(shouldPrune(90, false)).toBe(false);
  });
});
