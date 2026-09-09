import type { ExportArtifactV2, ExportListResponseV2 } from "@niedax/domain";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "./api-client";
import {
  canRequestExport,
  exportErrorKey,
  exportFailureKey,
  exportUnavailableKey,
  pollExportArtifact
} from "./export-workflow";
import { translate } from "./i18n";
import { retryKeyFor } from "./revision-workflow";

const pending: ExportArtifactV2 = {
  schemaVersion: "export-artifact/v2",
  correlationId: "export-workflow-test",
  exportId: "33333333-3333-4333-8333-333333333333",
  revisionId: "22222222-2222-4222-8222-222222222222",
  status: "pending",
  format: "xlsx",
  language: "en",
  downloadPath: null,
  contentHash: null,
  contentLength: null,
  fileName: null,
  createdAt: "2026-09-09T10:00:00.000Z",
  failureCode: null,
  expiresAt: null
};
const failed: ExportArtifactV2 = { ...pending, status: "failed", failureCode: "RENDER_FAILED" };

afterEach(() => vi.useRealTimers());

describe("saved revision export availability", () => {
  it("requires current create capability and authoritative resource availability", () => {
    expect(canRequestExport(["export:read"], { allowed: true, reason: null })).toBe(false);
    expect(
      canRequestExport(["export:read", "export:create"], {
        allowed: false,
        reason: "templateUnavailable"
      })
    ).toBe(false);
    expect(canRequestExport(["export:create"], null)).toBe(false);
    expect(canRequestExport(["export:create"], { allowed: true, reason: null })).toBe(true);
  });

  it.each([
    ["templateUnavailable", "exportTemplateUnavailable"],
    ["unsupportedVersion", "exportUnsupportedVersion"],
    ["notAuthorized", "exportCreateForbidden"]
  ] as const)("explains %s in Bulgarian and English", (reason, expected) => {
    const availability: ExportListResponseV2["availability"] = { allowed: false, reason };
    expect(exportUnavailableKey(availability)).toBe(expected);
    expect(translate("bg", expected)).not.toBe(translate("en", expected));
    expect(translate("bg", "exportEnglishHint")).toContain("английски");
    expect(translate("en", "exportEnglishHint")).toContain("English");
  });

  it("maps server failure and session/role changes to localized UI keys", () => {
    expect(exportFailureKey({ ...failed, failureCode: "TEMPLATE_UNAVAILABLE" })).toBe(
      "exportTemplateUnavailable"
    );
    expect(exportFailureKey({ ...failed, failureCode: "UNSUPPORTED_REVISION" })).toBe(
      "exportUnsupportedVersion"
    );
    expect(exportErrorKey(new ApiError(401, "AUTHENTICATION_REQUIRED", null, null, ""))).toBe(
      "sessionExpired"
    );
    expect(exportErrorKey(new ApiError(403, "FORBIDDEN", null, null, ""))).toBe("forbiddenAction");
    expect(exportErrorKey(new ApiError(422, "UNSUPPORTED_SCHEMA_VERSION", null, null, ""))).toBe(
      "exportUnsupportedVersion"
    );
  });

  it("reuses the same export attempt key and creates a new key only for a deliberate new request", () => {
    const createKey = vi
      .fn()
      .mockReturnValueOnce("export-attempt-1")
      .mockReturnValueOnce("export-attempt-2");
    const payload = {
      revisionId: pending.revisionId,
      inputFingerprint: `sha256:${"a".repeat(64)}`
    };
    const original = retryKeyFor(null, payload, createKey);
    expect(retryKeyFor(original, payload, createKey)).toBe(original);
    expect(retryKeyFor(null, payload, createKey).idempotencyKey).toBe("export-attempt-2");
    expect(createKey).toHaveBeenCalledTimes(2);
  });
});

describe("bounded cancelable export polling", () => {
  it("stops immediately once a persisted terminal status arrives", async () => {
    vi.useFakeTimers();
    const read = vi.fn().mockResolvedValueOnce(pending).mockResolvedValueOnce(failed);
    const onUpdate = vi.fn();
    const result = pollExportArtifact(pending, new AbortController().signal, onUpdate, read);
    await vi.runAllTimersAsync();
    await expect(result).resolves.toEqual(failed);
    expect(read).toHaveBeenCalledTimes(2);
    expect(onUpdate).toHaveBeenLastCalledWith(failed);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("bounds a perpetually pending artifact to eight checks within 43 seconds", async () => {
    vi.useFakeTimers();
    const read = vi.fn().mockResolvedValue(pending);
    const result = pollExportArtifact(pending, new AbortController().signal, vi.fn(), read);
    await vi.advanceTimersByTimeAsync(43_000);
    await expect(result).resolves.toEqual(pending);
    expect(read).toHaveBeenCalledTimes(8);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("aborts a stalled status request at the 60-second polling deadline", async () => {
    vi.useFakeTimers();
    let requestSignal: AbortSignal | undefined;
    const read = vi.fn((_id: string, signal?: AbortSignal) => {
      requestSignal = signal;
      return new Promise<ExportArtifactV2>((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
    });
    const onUpdate = vi.fn();
    const result = pollExportArtifact(pending, new AbortController().signal, onUpdate, read);
    await vi.advanceTimersByTimeAsync(60_000);
    await expect(result).resolves.toEqual(pending);
    expect(read).toHaveBeenCalledOnce();
    expect(requestSignal?.aborted).toBe(true);
    expect(onUpdate).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels navigation/unmount before the first request and clears its timer", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const read = vi.fn();
    const result = pollExportArtifact(pending, controller.signal, vi.fn(), read);
    const rejection = expect(result).rejects.toMatchObject({ name: "AbortError" });
    controller.abort();
    await rejection;
    await vi.runAllTimersAsync();
    expect(read).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not publish stale bytes/status if the in-flight reader returns after cancellation", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const onUpdate = vi.fn();
    const read = vi.fn().mockImplementation(() => {
      controller.abort();
      return Promise.resolve(failed);
    });
    const result = pollExportArtifact(pending, controller.signal, onUpdate, read);
    const rejection = expect(result).rejects.toMatchObject({ name: "AbortError" });
    await vi.runAllTimersAsync();
    await rejection;
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("does not accept another revision's status as the selected export", async () => {
    vi.useFakeTimers();
    const read = vi.fn().mockResolvedValue({ ...failed, revisionId: pending.exportId });
    const onUpdate = vi.fn();
    const result = pollExportArtifact(pending, new AbortController().signal, onUpdate, read);
    const rejection = expect(result).rejects.toMatchObject({ code: "INVALID_EXPORT_DOWNLOAD" });
    await vi.runAllTimersAsync();
    await rejection;
    expect(onUpdate).not.toHaveBeenCalled();
  });
});
