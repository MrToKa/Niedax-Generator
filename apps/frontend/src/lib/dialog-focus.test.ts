import { describe, expect, it, vi } from "vitest";

import { restoreDialogFocus } from "./dialog-focus";

describe("confirmation dialog focus restoration", () => {
  it("restores the original trigger while it remains connected", () => {
    const previous = { isConnected: true, focus: vi.fn() };
    const fallback = { isConnected: true, focus: vi.fn() };

    restoreDialogFocus(previous, fallback);

    expect(previous.focus).toHaveBeenCalledOnce();
    expect(fallback.focus).not.toHaveBeenCalled();
  });

  it("uses a stable fallback when a successful transition removes the trigger", () => {
    const previous = { isConnected: false, focus: vi.fn() };
    const fallback = { isConnected: true, focus: vi.fn() };

    restoreDialogFocus(previous, fallback);

    expect(previous.focus).not.toHaveBeenCalled();
    expect(fallback.focus).toHaveBeenCalledOnce();
  });

  it("does not focus a detached element", () => {
    const previous = { isConnected: false, focus: vi.fn() };
    const fallback = { isConnected: false, focus: vi.fn() };

    restoreDialogFocus(previous, fallback);

    expect(previous.focus).not.toHaveBeenCalled();
    expect(fallback.focus).not.toHaveBeenCalled();
  });
});
