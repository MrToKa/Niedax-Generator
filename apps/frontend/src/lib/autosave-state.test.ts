import { describe, expect, it } from "vitest";

import {
  asyncRequestIsCurrent,
  beginAutosave,
  calculationRequestWasSuperseded,
  completeAutosave,
  contentSignature,
  failAutosave,
  initialAutosaveState,
  markAutosaveContent,
  requestContextWasSuperseded,
  retryAutosave
} from "./autosave-state";

describe("autosave state", () => {
  it("invalidates async actions after navigation or a newer same-kind request", () => {
    expect(asyncRequestIsCurrent(3, 3, 8, 8)).toBe(true);
    expect(asyncRequestIsCurrent(3, 3, 8, 9)).toBe(false);
    expect(asyncRequestIsCurrent(3, 4, 8, 8)).toBe(false);
  });

  it("distinguishes a superseded calculation from a save conflict", () => {
    expect(calculationRequestWasSuperseded(4, 5)).toBe(true);
    expect(calculationRequestWasSuperseded(5, 5)).toBe(false);
    expect(requestContextWasSuperseded(5, "draft-a", 5, "draft-b")).toBe(true);
    expect(requestContextWasSuperseded(5, "draft-a", 5, "draft-a")).toBe(false);
  });

  it("uses a canonical content signature", () => {
    expect(contentSignature({ b: 2, a: { d: 4, c: 3 } })).toBe(
      contentSignature({ a: { c: 3, d: 4 }, b: 2 })
    );
  });

  it("keeps newer edits unsaved when an older snapshot completes", () => {
    const initial = initialAutosaveState(4, { name: "A" });
    const changed = markAutosaveContent(initial, { name: "B" }, true);
    const saving = beginAutosave(changed, { name: "B" }, "request-1");
    const editedAgain = markAutosaveContent(saving, { name: "C" }, true);
    const completed = completeAutosave(editedAgain, saving.generation, 5);

    expect(completed.status).toBe("unsaved");
    expect(completed.draftVersion).toBe(5);
    expect(completed.acknowledgedContent).toBe(contentSignature({ name: "B" }));
    expect(completed.currentContent).toBe(contentSignature({ name: "C" }));
  });

  it("ignores stale completions and preserves retry idempotency", () => {
    const initial = markAutosaveContent(initialAutosaveState(1, "a"), "b", true);
    const saving = beginAutosave(initial, "b", "same-request-key");
    expect(completeAutosave(saving, saving.generation + 1, 99)).toBe(saving);

    const failed = failAutosave(saving, saving.generation, false);
    const retried = retryAutosave(failed, saving.pending!);
    expect(retried.pending?.idempotencyKey).toBe("same-request-key");
    expect(retried.pending?.expectedDraftVersion).toBe(1);
  });

  it("blocks invalid local content without acknowledging it", () => {
    const initial = initialAutosaveState(2, { value: "1" });
    const invalid = markAutosaveContent(initial, { value: "" }, false);
    expect(invalid.status).toBe("validationBlocked");
    expect(invalid.acknowledgedContent).toBe(contentSignature({ value: "1" }));
    expect(invalid.currentContent).toBe(contentSignature({ value: "" }));
  });
});
