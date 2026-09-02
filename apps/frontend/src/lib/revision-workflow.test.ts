import type { ProjectAccessV2 } from "@niedax/domain";
import { describe, expect, it, vi } from "vitest";

import {
  buildSaveRevisionInput,
  canSaveRevision,
  mergeRevisionSummary,
  optionalComment,
  retryKeyFor,
  selectHistoricalRevision
} from "./revision-workflow";

const access: ProjectAccessV2 = {
  canEditDraft: true,
  canValidate: true,
  canCalculate: true,
  canSaveRevision: true,
  canReadHistory: true
};

describe("revision workflow state", () => {
  it("copies the exact acknowledged calculation identity into Save revision", () => {
    const calculation = {
      run: {
        id: "11111111-1111-4111-8111-111111111111",
        inputFingerprint: `sha256:${"a".repeat(64)}`
      }
    };
    expect(buildSaveRevisionInput(calculation, 7, 3, "  Issue A  ", "  Ready  ")).toEqual({
      expectedDraftVersion: 7,
      expectedLatestRevisionNumber: 3,
      calculationRunId: "11111111-1111-4111-8111-111111111111",
      inputFingerprint: `sha256:${"a".repeat(64)}`,
      name: "Issue A",
      comment: "Ready"
    });
    expect(optionalComment("   ")).toBeNull();
  });

  it("reuses a key only for the same canonical command", () => {
    const generate = vi.fn().mockReturnValueOnce("key-a").mockReturnValueOnce("key-b");
    const first = retryKeyFor(null, { name: "A", version: 1 }, generate);
    const retry = retryKeyFor(first, { version: 1, name: "A" }, generate);
    const changed = retryKeyFor(retry, { version: 2, name: "A" }, generate);
    expect(retry).toBe(first);
    expect(changed.idempotencyKey).toBe("key-b");
  });

  it("requires server access and a current transient calculation", () => {
    const calculation = {
      run: {
        id: "11111111-1111-4111-8111-111111111111",
        inputFingerprint: `sha256:${"a".repeat(64)}`
      }
    };
    expect(canSaveRevision(access, calculation, false, "Issue A")).toBe(true);
    expect(
      canSaveRevision({ ...access, canSaveRevision: false }, calculation, false, "Issue A")
    ).toBe(false);
    expect(canSaveRevision(access, calculation, true, "Issue A")).toBe(false);
    expect(canSaveRevision(access, null, false, "Issue A")).toBe(false);
  });

  it("deduplicates replayed revisions and keeps newest-first ordering", () => {
    const revision1 = { id: "one", revisionNumber: 1 };
    const revision2 = { id: "two", revisionNumber: 2 };
    expect(mergeRevisionSummary([revision1, revision2], revision2)).toEqual([revision2, revision1]);
  });

  it("keeps the mutable draft reference untouched while selecting history", () => {
    const draft = { name: "Unsaved local name" };
    const selected = selectHistoricalRevision({ draft, selectedRevisionId: null }, "revision-1");
    expect(selected.draft).toBe(draft);
    expect(selected.selectedRevisionId).toBe("revision-1");
  });
});
