import {
  CreateExportRequestV1Schema,
  ExportArtifactV2Schema,
  ExportListResponseV2Schema,
  type ExportArtifactV2,
  type ExportListResponseV2
} from "@niedax/domain";

import { ApiError, apiErrorFromResponse, requestJson } from "./api-client";

export const XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function listRevisionExports(
  revisionId: string,
  signal?: AbortSignal
): Promise<ExportListResponseV2> {
  return requestJson(
    `/api/v1/revisions/${encodeURIComponent(revisionId)}/exports`,
    ExportListResponseV2Schema,
    { signal }
  );
}

export function requestRevisionExport(
  revision: Readonly<{ id: string; inputFingerprint: string }>,
  idempotencyKey: string,
  signal?: AbortSignal
): Promise<ExportArtifactV2> {
  const body = CreateExportRequestV1Schema.parse({
    schemaVersion: "export-request/v1",
    revisionId: revision.id,
    inputFingerprint: revision.inputFingerprint,
    format: "xlsx",
    language: "en"
  });
  return requestJson(
    `/api/v1/revisions/${encodeURIComponent(revision.id)}/exports`,
    ExportArtifactV2Schema,
    { method: "POST", body, idempotencyKey, signal }
  );
}

export function getExportArtifact(
  exportId: string,
  signal?: AbortSignal
): Promise<ExportArtifactV2> {
  return requestJson(`/api/v1/exports/${encodeURIComponent(exportId)}`, ExportArtifactV2Schema, {
    signal
  });
}

export interface ExportDownload {
  readonly blob: Blob;
  readonly fileName: string;
}

/** The response supplies the name; strip filesystem/control syntax before using download=. */
export function safeExportFileName(value: string): string {
  const safe = [...value.normalize("NFC")]
    .map((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code < 32 || code === 127 ? "_" : character;
    })
    .join("")
    .replace(/[/\\<>:"|?*\u202a-\u202e\u2066-\u2069]/g, "_")
    .replace(/^[.\s]+/u, "")
    .trim();
  if (!/\.xlsx$/i.test(safe)) throw invalidDownload();
  const stem = [...safe.slice(0, -5)]
    .slice(0, 175)
    .join("")
    .replace(/[.\s]+$/u, "");
  if (!stem) throw invalidDownload();
  return `${stem}.xlsx`;
}

export function downloadFileName(disposition: string | null): string {
  if (!disposition || !/^attachment(?:;|$)/i.test(disposition.trim())) throw invalidDownload();
  const extended = /(?:^|;)\s*filename\*\s*=\s*UTF-8''([^;]+)/i.exec(disposition)?.[1];
  if (extended) {
    try {
      return safeExportFileName(decodeURIComponent(extended.trim()));
    } catch {
      throw invalidDownload();
    }
  }
  const quoted = /(?:^|;)\s*filename\s*=\s*"([^"\r\n]*)"/i.exec(disposition)?.[1];
  const plain = /(?:^|;)\s*filename\s*=\s*([^;"\r\n]+)/i.exec(disposition)?.[1];
  if (!quoted && !plain) throw invalidDownload();
  return safeExportFileName((quoted ?? plain ?? "").trim());
}

export async function fetchExportDownload(
  artifact: ExportArtifactV2,
  signal?: AbortSignal
): Promise<ExportDownload> {
  if (
    artifact.status !== "ready" ||
    artifact.contentLength === null ||
    artifact.contentHash === null
  ) {
    throw invalidDownload();
  }
  // Construct the local authorized route; never follow a server-provided arbitrary URL.
  const response = await fetch(
    `/api/v1/exports/${encodeURIComponent(artifact.exportId)}/download`,
    {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
      redirect: "error",
      ...(signal ? { signal } : {}),
      headers: { accept: XLSX_MEDIA_TYPE }
    }
  );
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw apiErrorFromResponse(response, body);
  }
  if (response.headers.get("content-type")?.split(";")[0]?.trim() !== XLSX_MEDIA_TYPE) {
    throw invalidDownload();
  }
  const fileName = downloadFileName(response.headers.get("content-disposition"));
  const headerLength = response.headers.get("content-length");
  if (
    headerLength === null ||
    Number(headerLength) !== artifact.contentLength ||
    response.headers.get("x-content-sha256") !== artifact.contentHash
  ) {
    throw invalidDownload();
  }
  const bytes = await response.arrayBuffer();
  signal?.throwIfAborted();
  const prefix = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 4));
  if (
    bytes.byteLength !== artifact.contentLength ||
    prefix[0] !== 0x50 ||
    prefix[1] !== 0x4b ||
    prefix[2] !== 0x03 ||
    prefix[3] !== 0x04
  ) {
    throw invalidDownload();
  }
  // The backend verifies the persisted bytes' SHA-256 before every download. LAN HTTP does not
  // expose SubtleCrypto: there we require its verified hash header plus exact length/ZIP metadata.
  // Secure contexts additionally recompute the digest in the browser; a digest failure is fatal.
  if (globalThis.crypto?.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    signal?.throwIfAborted();
    const hash = [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    if (`sha256:${hash}` !== artifact.contentHash) throw invalidDownload();
  }
  return { blob: new Blob([bytes], { type: XLSX_MEDIA_TYPE }), fileName };
}

export function saveExportDownload(download: ExportDownload): void {
  const objectUrl = URL.createObjectURL(download.blob);
  const anchor = document.createElement("a");
  try {
    anchor.href = objectUrl;
    anchor.download = download.fileName;
    anchor.hidden = true;
    document.body.appendChild(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    // Let the browser consume the click before releasing its temporary bytes.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
  }
}

function invalidDownload(): ApiError {
  return new ApiError(502, "INVALID_EXPORT_DOWNLOAD", null, null, "Invalid export download");
}
