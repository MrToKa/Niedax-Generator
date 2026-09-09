import type { AppCapability, ExportArtifactV2, ExportListResponseV2 } from "@niedax/domain";

import { ApiError } from "./api-client";
import { getExportArtifact } from "./export-api";
import type { TranslationKey } from "./i18n";
import { workflowErrorKey } from "./workflow-error";

export const EXPORT_POLL_DELAYS_MS = [1_000, 1_500, 2_500, 4_000, 6_000, 8_000, 10_000, 10_000];
export const EXPORT_POLL_TIMEOUT_MS = 60_000;

export function canRequestExport(
  capabilities: readonly AppCapability[],
  availability: ExportListResponseV2["availability"] | null
): boolean {
  return capabilities.includes("export:create") && availability?.allowed === true;
}

export function exportUnavailableKey(
  availability: ExportListResponseV2["availability"] | null
): TranslationKey | null {
  if (!availability || availability.allowed) return null;
  switch (availability.reason) {
    case "templateUnavailable":
      return "exportTemplateUnavailable";
    case "unsupportedVersion":
      return "exportUnsupportedVersion";
    default:
      return "exportCreateForbidden";
  }
}

export function exportErrorKey(error: unknown): TranslationKey {
  if (error instanceof ApiError) {
    if (error.code === "INVALID_EXPORT_DOWNLOAD") return "exportInvalidDownload";
    if (error.code === "UNSUPPORTED_SCHEMA_VERSION") return "exportUnsupportedVersion";
    if (error.code === "EXPORT_FAILED") return "exportFailed";
    if (error.code === "RESOURCE_NOT_FOUND") return "exportNoAccess";
  }
  return workflowErrorKey(error) ?? "exportRequestFailed";
}

export function exportFailureKey(artifact: ExportArtifactV2): TranslationKey {
  if (artifact.failureCode === "TEMPLATE_UNAVAILABLE") return "exportTemplateUnavailable";
  if (artifact.failureCode === "UNSUPPORTED_REVISION") return "exportUnsupportedVersion";
  return "exportFailed";
}

export function mergeExportArtifact(
  artifacts: readonly ExportArtifactV2[],
  artifact: ExportArtifactV2
): readonly ExportArtifactV2[] {
  return [artifact, ...artifacts.filter((candidate) => candidate.exportId !== artifact.exportId)]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 20);
}

/** Returns pending on budget exhaustion; a deliberate status refresh starts another bounded pass. */
export async function pollExportArtifact(
  initial: ExportArtifactV2,
  signal: AbortSignal,
  onUpdate: (artifact: ExportArtifactV2) => void,
  read: typeof getExportArtifact = getExportArtifact
): Promise<ExportArtifactV2> {
  signal.throwIfAborted();
  if (initial.status !== "pending") return initial;
  const controller = new AbortController();
  const cancel = () => controller.abort(signal.reason);
  signal.addEventListener("abort", cancel, { once: true });
  const timeout = setTimeout(
    () => controller.abort(new DOMException("Export polling deadline reached", "TimeoutError")),
    EXPORT_POLL_TIMEOUT_MS
  );
  const pollingSignal = controller.signal;
  let artifact = initial;
  try {
    for (const delay of EXPORT_POLL_DELAYS_MS) {
      pollingSignal.throwIfAborted();
      if (artifact.status !== "pending") return artifact;
      await abortableDelay(delay, pollingSignal);
      const updated = await read(artifact.exportId, pollingSignal);
      pollingSignal.throwIfAborted();
      if (updated.exportId !== initial.exportId || updated.revisionId !== initial.revisionId) {
        throw new ApiError(502, "INVALID_EXPORT_DOWNLOAD", null, null, "Invalid export identity");
      }
      artifact = updated;
      onUpdate(artifact);
    }
    return artifact;
  } catch (error) {
    if (!signal.aborted && pollingSignal.aborted && pollingSignal.reason?.name === "TimeoutError") {
      return artifact;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", cancel);
  }
}

function abortableDelay(delay: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, delay);
    signal.addEventListener("abort", abort, { once: true });
  });
}
