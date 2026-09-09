import { createHash } from "node:crypto";

import type { ExportArtifactV2 } from "@niedax/domain";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "./api-client";
import {
  XLSX_MEDIA_TYPE,
  downloadFileName,
  fetchExportDownload,
  getExportArtifact,
  listRevisionExports,
  requestRevisionExport,
  safeExportFileName,
  saveExportDownload
} from "./export-api";

const revisionId = "22222222-2222-4222-8222-222222222222";
const exportId = "33333333-3333-4333-8333-333333333333";
const inputFingerprint = `sha256:${"a".repeat(64)}`;
const pending: ExportArtifactV2 = {
  schemaVersion: "export-artifact/v2",
  correlationId: "export-test",
  exportId,
  revisionId,
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

// Transport-only bytes: intentionally not a workbook fixture or workbook correctness evidence.
const transportBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x12, 0x34]);
const ready: ExportArtifactV2 = {
  ...pending,
  status: "ready",
  downloadPath: `/api/v1/exports/${exportId}/download`,
  contentHash: `sha256:${createHash("sha256").update(transportBytes).digest("hex")}`,
  contentLength: transportBytes.byteLength,
  fileName: "revision-2.xlsx"
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("saved revision Excel API", () => {
  it("issues only the selected saved revision export command and retains the retry key", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(json(pending)));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    await requestRevisionExport(
      { id: revisionId, inputFingerprint },
      "same-attempt",
      controller.signal
    );
    await requestRevisionExport(
      { id: revisionId, inputFingerprint },
      "same-attempt",
      controller.signal
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const call of fetchMock.mock.calls) {
      expect(call[0]).toBe(`/api/v1/revisions/${revisionId}/exports`);
      expect(call[1]).toMatchObject({
        method: "POST",
        signal: controller.signal,
        cache: "no-store",
        headers: { "x-niedax-csrf": "1", "idempotency-key": "same-attempt" }
      });
      expect(JSON.parse(call[1].body as string)).toEqual({
        schemaVersion: "export-request/v1",
        revisionId,
        inputFingerprint,
        format: "xlsx",
        language: "en"
      });
    }
    // No draft save, calculation, revision creation, check or approval request is issued.
    expect(
      fetchMock.mock.calls.every(([path]) =>
        String(path).endsWith(`/revisions/${revisionId}/exports`)
      )
    ).toBe(true);
  });

  it("discovers existing exports and authoritative availability with read-only requests", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        json({
          schemaVersion: "export-list-response/v2",
          correlationId: "export-test",
          revisionId,
          availability: { allowed: false, reason: "notAuthorized" },
          artifacts: [ready]
        })
      )
      .mockResolvedValueOnce(json(ready));
    vi.stubGlobal("fetch", fetchMock);
    await expect(listRevisionExports(revisionId)).resolves.toMatchObject({ artifacts: [ready] });
    await expect(getExportArtifact(exportId)).resolves.toEqual(ready);
    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      `/api/v1/revisions/${revisionId}/exports`,
      `/api/v1/exports/${exportId}`
    ]);
    expect(fetchMock.mock.calls.every(([, init]) => !init.method || init.method === "GET")).toBe(
      true
    );
  });

  it("rejects malformed or mismatched list evidence before presentation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        json({
          schemaVersion: "export-list-response/v2",
          correlationId: "export-test",
          revisionId,
          availability: { allowed: true, reason: null },
          artifacts: [{ ...ready, revisionId: exportId }]
        })
      )
    );
    await expect(listRevisionExports(revisionId)).rejects.toBeDefined();
  });

  it("propagates current session and role rejection instead of treating it as an artifact", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(errorResponse(403, "FORBIDDEN")));
    await expect(
      requestRevisionExport({ id: revisionId, inputFingerprint }, "same-attempt")
    ).rejects.toMatchObject({ status: 403, code: "FORBIDDEN", correlationId: "test-denied" });
  });
});

describe("verified browser download", () => {
  it("supports LAN HTTP without SubtleCrypto using the backend-verified hash and exact length", async () => {
    vi.stubGlobal("crypto", {});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(binaryResponse()));
    const download = await fetchExportDownload(ready);
    expect(new Uint8Array(await download.blob.arrayBuffer())).toEqual(transportBytes);
    expect(download.fileName).toBe("Ревизия-2.xlsx");
  });

  it.each([null, inputFingerprint])(
    "rejects missing or mismatched backend hash %s without WebCrypto",
    async (hash) => {
      vi.stubGlobal("crypto", {});
      const response = binaryResponse();
      if (hash === null) response.headers.delete("x-content-sha256");
      else response.headers.set("x-content-sha256", hash);
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
      await expect(fetchExportDownload(ready)).rejects.toMatchObject({
        code: "INVALID_EXPORT_DOWNLOAD"
      });
    }
  );

  it("requires the backend length header in the LAN fallback", async () => {
    vi.stubGlobal("crypto", {});
    const response = binaryResponse();
    response.headers.delete("content-length");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    await expect(fetchExportDownload(ready)).rejects.toMatchObject({
      code: "INVALID_EXPORT_DOWNLOAD"
    });
  });

  it("also checks bytes against the digest in secure contexts even when headers agree", async () => {
    const artifact = { ...ready, contentHash: inputFingerprint };
    const response = binaryResponse();
    response.headers.set("x-content-sha256", inputFingerprint);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    await expect(fetchExportDownload(artifact)).rejects.toMatchObject({
      code: "INVALID_EXPORT_DOWNLOAD"
    });
  });

  it("checks content type, bytes, length and SHA-256 and preserves a Unicode server filename", async () => {
    const fetchMock = vi.fn().mockResolvedValue(binaryResponse());
    vi.stubGlobal("fetch", fetchMock);
    const signal = new AbortController().signal;
    const download = await fetchExportDownload(ready, signal);
    expect(download.fileName).toBe("Ревизия-2.xlsx");
    expect(download.blob.type).toBe(XLSX_MEDIA_TYPE);
    expect(new Uint8Array(await download.blob.arrayBuffer())).toEqual(transportBytes);
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/exports/${exportId}/download`,
      expect.objectContaining({
        credentials: "same-origin",
        cache: "no-store",
        redirect: "error",
        signal
      })
    );
  });

  it("parses an authenticated JSON failure before creating any download", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(errorResponse(401, "AUTHENTICATION_REQUIRED"))
    );
    await expect(fetchExportDownload(ready)).rejects.toMatchObject({
      status: 401,
      code: "AUTHENTICATION_REQUIRED"
    });
  });

  it("rejects a JSON success response instead of saving an error as xlsx", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ error: "unexpected" })));
    await expect(fetchExportDownload(ready)).rejects.toMatchObject({
      code: "INVALID_EXPORT_DOWNLOAD"
    });
  });

  it.each([
    ["length", { ...ready, contentLength: 80 }],
    ["hash", { ...ready, contentHash: inputFingerprint }]
  ])("rejects mismatched %s evidence", async (_name, artifact) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(binaryResponse()));
    await expect(fetchExportDownload(artifact)).rejects.toMatchObject({
      code: "INVALID_EXPORT_DOWNLOAD"
    });
  });

  it("rejects a response without a ZIP local header even with matching digest metadata", async () => {
    const bytes = new TextEncoder().encode('{"error":true}');
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(binaryResponse(bytes)));
    await expect(
      fetchExportDownload({
        ...ready,
        contentLength: bytes.byteLength,
        contentHash: `sha256:${createHash("sha256").update(bytes).digest("hex")}`
      })
    ).rejects.toMatchObject({ code: "INVALID_EXPORT_DOWNLOAD" });
  });

  it("does not request bytes for pending or failed artifacts", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchExportDownload(pending)).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not save bytes after navigation aborts the download", async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => {
        controller.abort();
        return Promise.resolve(binaryResponse());
      })
    );
    await expect(fetchExportDownload(ready, controller.signal)).rejects.toMatchObject({
      name: "AbortError"
    });
  });

  it("releases the object URL and temporary anchor even when the browser click fails", async () => {
    vi.useFakeTimers();
    const anchor = {
      href: "",
      download: "",
      hidden: false,
      click: vi.fn(() => {
        throw new Error("click failed");
      }),
      remove: vi.fn()
    };
    vi.stubGlobal("document", {
      createElement: vi.fn(() => anchor),
      body: { appendChild: vi.fn() }
    });
    const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:temporary-export");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    expect(() =>
      saveExportDownload({ blob: new Blob([transportBytes]), fileName: "revision.xlsx" })
    ).toThrow("click failed");
    expect(create).toHaveBeenCalledOnce();
    expect(anchor.download).toBe("revision.xlsx");
    expect(anchor.remove).toHaveBeenCalledOnce();
    await vi.runAllTimersAsync();
    expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:temporary-export");
  });
});

describe("server filename handling", () => {
  it("removes separators, control syntax, leading dots and direction controls", () => {
    expect(safeExportFileName("..folder/..\\bad\r\n.xlsx")).toBe("folder_.._bad__.xlsx");
    expect(safeExportFileName("\u202etest.xlsx")).toBe("_test.xlsx");
    expect(safeExportFileName(`${"x".repeat(300)}.xlsx`)).toHaveLength(180);
  });

  it("uses the encoded server filename in preference to the ASCII fallback", () => {
    expect(
      downloadFileName("attachment; filename=backup.xlsx; filename*=UTF-8''Order%20file.xlsx")
    ).toBe("Order file.xlsx");
    expect(downloadFileName('attachment; filename="order.xlsx"')).toBe("order.xlsx");
  });

  it.each([
    null,
    "inline; filename=order.xlsx",
    "attachment",
    "attachment; filename=error.json",
    "attachment; filename*=UTF-8''%broken.xlsx"
  ])("rejects invalid attachment metadata %s", (header) =>
    expect(() => downloadFileName(header)).toThrow(ApiError)
  );
});

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
}

function errorResponse(status: number, code: string): Response {
  return new Response(
    JSON.stringify({
      schemaVersion: "error-envelope/v1",
      correlationId: "test-denied",
      error: { code, message: "Request denied", details: null }
    }),
    { status, headers: { "content-type": "application/json" } }
  );
}

function binaryResponse(bytes: Uint8Array<ArrayBuffer> = transportBytes): Response {
  return new Response(bytes, {
    headers: {
      "content-type": XLSX_MEDIA_TYPE,
      "content-length": String(bytes.byteLength),
      "x-content-sha256": `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
      "content-disposition": `attachment; filename="revision-2.xlsx"; filename*=UTF-8''${encodeURIComponent("Ревизия-2.xlsx")}`
    }
  });
}
