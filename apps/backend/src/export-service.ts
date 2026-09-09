import { createHash } from "node:crypto";

import {
  ExportListResponseV2Schema,
  type ExportArtifactV2,
  type ExportListResponseV2,
  type ExportRequestV1
} from "@niedax/domain";
import {
  buildEnglishExportContextV3,
  getApprovedWorkbookMapping,
  renderExcelWorkbook,
  type ExportContextV3,
  type WorkbookMapping
} from "@niedax/export";

import { hasCapability } from "./authorization-policy.js";
import { ProjectApplicationError } from "./project-errors.js";
import type { RevisionActor } from "./revision-repository.js";

export const XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const MAX_EXPORT_BYTES = 50 * 1024 * 1024;

function completeWorkbookArchive(bytes: Buffer): boolean {
  if (bytes.length < 22 || bytes.length > MAX_EXPORT_BYTES || bytes.readUInt32LE(0) !== 0x04034b50)
    return false;
  let end = bytes.length - 22;
  const minimum = Math.max(0, bytes.length - 65_557);
  while (end >= minimum && bytes.readUInt32LE(end) !== 0x06054b50) end -= 1;
  if (end < minimum || end + 22 + bytes.readUInt16LE(end + 20) !== bytes.length) return false;
  const entries = bytes.readUInt16LE(end + 10);
  const directoryLength = bytes.readUInt32LE(end + 12);
  const directoryStart = bytes.readUInt32LE(end + 16);
  if (
    entries === 0 ||
    entries > 4_096 ||
    bytes.readUInt32LE(end + 4) !== 0 ||
    bytes.readUInt16LE(end + 8) !== entries ||
    directoryStart + directoryLength !== end
  )
    return false;
  const names = new Set<string>();
  let offset = directoryStart;
  for (let index = 0; index < entries; index += 1) {
    if (offset + 46 > end || bytes.readUInt32LE(offset) !== 0x02014b50) return false;
    const nameLength = bytes.readUInt16LE(offset + 28);
    const next =
      offset + 46 + nameLength + bytes.readUInt16LE(offset + 30) + bytes.readUInt16LE(offset + 32);
    const local = bytes.readUInt32LE(offset + 42);
    if (next > end || local + 30 > directoryStart || bytes.readUInt32LE(local) !== 0x04034b50)
      return false;
    const localNameLength = bytes.readUInt16LE(local + 26);
    const localDataStart = local + 30 + localNameLength + bytes.readUInt16LE(local + 28);
    if (localDataStart + bytes.readUInt32LE(offset + 20) > directoryStart) return false;
    const name = bytes.toString("utf8", offset + 46, offset + 46 + nameLength);
    if (
      names.has(name) ||
      name !== bytes.toString("utf8", local + 30, local + 30 + localNameLength)
    )
      return false;
    names.add(name);
    offset = next;
  }
  return (
    offset === end &&
    ["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml"].every((name) => names.has(name))
  );
}

async function exportOperation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof ProjectApplicationError) throw error;
    // Database/writer diagnostics can contain failing row values or bytea. Keep them out of logs and JSON.
    throw new ProjectApplicationError(
      500,
      "EXPORT_FAILED",
      "The export operation could not be completed"
    );
  }
}

async function boundedRender(render: Promise<Uint8Array>): Promise<Uint8Array> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      render,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("Export rendering timed out")), 90_000);
        timer.unref();
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface ExportReply {
  readonly statusCode: number;
  readonly body: ExportArtifactV2;
  readonly replayed: boolean;
}

export interface ExportRendering {
  readonly mapping: WorkbookMapping | null;
  render(context: ExportContextV3): Promise<Uint8Array>;
}

export function productionExportRendering(): ExportRendering {
  const mapping = getApprovedWorkbookMapping();
  return {
    mapping,
    async render(context) {
      if (!mapping) throw new Error("Approved workbook mapping unavailable");
      return (await renderExcelWorkbook(context, mapping)).bytes;
    }
  };
}

export interface ExportRepository {
  request(
    actor: RevisionActor,
    request: ExportRequestV1,
    mapping: WorkbookMapping | null
  ): Promise<ExportReply>;
  list(
    actor: RevisionActor,
    revisionId: string,
    correlationId: string
  ): Promise<{
    readonly supported: boolean;
    readonly canCreate: boolean;
    readonly artifacts: readonly ExportArtifactV2[];
  }>;
  get(actor: RevisionActor, exportId: string, correlationId: string): Promise<ExportArtifactV2>;
  download(
    actor: RevisionActor,
    exportId: string,
    correlationId: string
  ): Promise<{
    readonly artifact: ExportArtifactV2;
    readonly bytes: Buffer;
  }>;
  claim(): Promise<{
    readonly exportId: string;
    readonly claimToken: string;
    readonly context: unknown;
  } | null>;
  finalize(exportId: string, claimToken: string, bytes: Buffer, fileName: string): Promise<void>;
  failAttempt(exportId: string, claimToken: string): Promise<void>;
}

export interface ExportOperations {
  request(actor: RevisionActor, request: ExportRequestV1): Promise<ExportReply>;
  list(
    actor: RevisionActor,
    revisionId: string,
    correlationId: string
  ): Promise<ExportListResponseV2>;
  get(actor: RevisionActor, exportId: string, correlationId: string): Promise<ExportArtifactV2>;
  download(
    actor: RevisionActor,
    exportId: string,
    correlationId: string
  ): Promise<{
    readonly artifact: ExportArtifactV2;
    readonly bytes: Buffer;
  }>;
}

export function safeExportFileName(revisionId: string, revisionNumber: number): string {
  // Server identifiers avoid all user text, Unicode ambiguity, separators, and header injection.
  const id = revisionId.replace(/[^a-zA-Z0-9-]/gu, "").slice(0, 36);
  return `niedax-revision-${Math.max(1, Math.trunc(revisionNumber))}-${id}.xlsx`;
}

function requireCapability(
  actor: RevisionActor,
  capability: "export:create" | "export:read"
): void {
  if (!hasCapability(actor.role, capability)) {
    throw new ProjectApplicationError(403, "FORBIDDEN", "The export action is not permitted");
  }
}

export class ExportApplicationService implements ExportOperations {
  private stopping = false;
  private currentWork: Promise<void> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  public constructor(
    private readonly repository: ExportRepository,
    private readonly renderer: ExportRendering = productionExportRendering()
  ) {}

  public async request(actor: RevisionActor, request: ExportRequestV1): Promise<ExportReply> {
    requireCapability(actor, "export:create");
    if (request.format !== "xlsx") {
      throw new ProjectApplicationError(
        422,
        "VALIDATION_FAILED",
        "Only English XLSX export is implemented"
      );
    }
    return exportOperation(() => this.repository.request(actor, request, this.renderer.mapping));
  }

  public async list(
    actor: RevisionActor,
    revisionId: string,
    correlationId: string
  ): Promise<ExportListResponseV2> {
    requireCapability(actor, "export:read");
    const listing = await exportOperation(() =>
      this.repository.list(actor, revisionId, correlationId)
    );
    const reason =
      !hasCapability(actor.role, "export:create") || !listing.canCreate
        ? "notAuthorized"
        : !listing.supported
          ? "unsupportedVersion"
          : !this.renderer.mapping
            ? "templateUnavailable"
            : null;
    return ExportListResponseV2Schema.parse({
      schemaVersion: "export-list-response/v2",
      correlationId,
      revisionId,
      availability: { allowed: reason === null, reason },
      artifacts: listing.artifacts
    });
  }

  public async get(
    actor: RevisionActor,
    exportId: string,
    correlationId: string
  ): Promise<ExportArtifactV2> {
    requireCapability(actor, "export:read");
    return exportOperation(() => this.repository.get(actor, exportId, correlationId));
  }

  public async download(actor: RevisionActor, exportId: string, correlationId: string) {
    requireCapability(actor, "export:read");
    const download = await exportOperation(() =>
      this.repository.download(actor, exportId, correlationId)
    );
    if (
      download.bytes.length !== download.artifact.contentLength ||
      `sha256:${createHash("sha256").update(download.bytes).digest("hex")}` !==
        download.artifact.contentHash
    ) {
      throw new ProjectApplicationError(
        500,
        "EXPORT_FAILED",
        "The stored export failed its integrity check"
      );
    }
    return download;
  }

  /** One bounded pass; SKIP LOCKED and lease tokens also permit multiple backend processes. */
  public async recoverOnce(): Promise<void> {
    for (let count = 0; count < 4 && !this.stopping; count += 1) {
      const job = await this.repository.claim();
      if (!job) return;
      try {
        const context = buildEnglishExportContextV3(job.context);
        const bytes = Buffer.from(await boundedRender(this.renderer.render(context)));
        if (!completeWorkbookArchive(bytes)) {
          throw new Error("Renderer did not return a bounded XLSX ZIP archive");
        }
        await this.repository.finalize(
          job.exportId,
          job.claimToken,
          bytes,
          safeExportFileName(context.revision.id, context.revision.revisionNumber)
        );
      } catch {
        // Exceptions may contain snapshot strings or writer details; only the safe code is persisted.
        await this.repository.failAttempt(job.exportId, job.claimToken);
      }
    }
  }

  public startWorker(onUnavailable: () => void): void {
    if (this.timer) return;
    this.stopping = false;
    const tick = () => {
      if (this.stopping || this.currentWork) return;
      this.currentWork = this.recoverOnce()
        .catch(onUnavailable)
        .finally(() => {
          this.currentWork = null;
        });
    };
    this.timer = setInterval(tick, 2_000);
    this.timer.unref();
    tick();
  }

  public async stopWorker(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.currentWork;
  }
}
