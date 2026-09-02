import {
  CatalogImportError,
  catalogSheetNames,
  parseCsvBundle,
  parseXlsx,
  runCatalogPipeline,
  type ActiveCatalogComparison,
  type CatalogPipelineResult,
  type CatalogSheetName,
  type CatalogValidationReport,
  type ParsedCatalogBundle
} from "@niedax/catalog-import";
import type { AppRole } from "@niedax/domain";

import { AppError } from "./auth-service.js";
import { canAdministerCatalog } from "./authorization-policy.js";

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export interface CatalogUploadFile {
  readonly name: string;
  readonly contentBase64: string;
}

export interface CatalogDraftSummary {
  readonly id: string;
  readonly importId: string;
  readonly version: string;
  readonly scope: string;
  readonly status: "draft" | "validated" | "approved" | "active" | "archived";
  readonly contentHash: string;
  readonly report: CatalogValidationReport | null;
}

export interface CatalogVersionSummary {
  readonly id: string;
  readonly version: string;
  readonly label: string;
  readonly scope: string;
  readonly status: "draft" | "validated" | "approved" | "active" | "archived";
  readonly contentHash: string;
  readonly validatedAt: string | null;
  readonly approvedAt: string | null;
  readonly activatedAt: string | null;
  readonly archivedAt: string | null;
}

export interface CatalogSelectionFilter {
  readonly system: string;
  readonly heightMm: number;
  readonly widthMm: number;
  readonly materialCode: string;
  readonly finishCode: string;
}

export interface CatalogSelectableProduct {
  readonly id: string;
  readonly code: string;
  readonly descriptionEn: string;
  readonly category: string;
  readonly family: string | null;
  readonly engineeringVerificationRequired: boolean;
  readonly engineeringNote: string | null;
}

export interface CatalogSelectionOption extends CatalogSelectableProduct {
  readonly system: string;
  readonly heightMm: number;
  readonly widthMm: number;
  readonly materialCode: string;
  readonly finishCode: string;
}

export interface CatalogAdminRepository {
  getActiveComparison(scope: string): Promise<ActiveCatalogComparison | null>;
  saveDraft(input: {
    actorId: string;
    correlationId: string;
    fileName: string;
    mediaType: string;
    fileSizeBytes: number;
    parsed: ParsedCatalogBundle;
    pipeline: CatalogPipelineResult;
  }): Promise<CatalogDraftSummary>;
  loadDraft(catalogVersionId: string): Promise<ParsedCatalogBundle | null>;
  saveValidation(input: {
    catalogVersionId: string;
    actorId: string;
    correlationId: string;
    pipeline: CatalogPipelineResult;
  }): Promise<CatalogDraftSummary>;
  approve(input: {
    catalogVersionId: string;
    actorId: string;
    correlationId: string;
    reason: string;
    contentHash: string;
  }): Promise<CatalogVersionSummary>;
  activate(input: {
    catalogVersionId: string;
    actorId: string;
    correlationId: string;
    reason: string;
    contentHash: string;
  }): Promise<CatalogVersionSummary>;
  archive(input: {
    catalogVersionId: string;
    actorId: string;
    correlationId: string;
    reason: string;
  }): Promise<CatalogVersionSummary>;
  listVersions(): Promise<readonly CatalogVersionSummary[]>;
  findSelectableProducts(
    filter: CatalogSelectionFilter
  ): Promise<readonly CatalogSelectableProduct[]>;
  listSelectionOptions(): Promise<readonly CatalogSelectionOption[]>;
  exportLatestReport(catalogVersionId: string): Promise<CatalogValidationReport | null>;
}

interface ParsedUpload {
  readonly parsed: ParsedCatalogBundle;
  readonly fileName: string;
  readonly mediaType: string;
  readonly fileSizeBytes: number;
}

function decodeBase64(file: CatalogUploadFile): Buffer {
  if (!/^[A-Za-z0-9+/]*={0,2}$/u.test(file.contentBase64)) {
    throw new CatalogImportError(`File ${file.name} is not valid base64`, "INVALID_BASE64");
  }
  return Buffer.from(file.contentBase64, "base64");
}

async function parseUpload(files: readonly CatalogUploadFile[]): Promise<ParsedUpload> {
  if (!files.length) throw new CatalogImportError("At least one file is required", "FILE_REQUIRED");
  const decoded = files.map((file) => ({ ...file, buffer: decodeBase64(file) }));
  const totalSize = decoded.reduce((sum, file) => sum + file.buffer.length, 0);
  if (totalSize <= 0 || totalSize > MAX_UPLOAD_BYTES) {
    throw new CatalogImportError("Upload must be between 1 byte and 25 MiB", "FILE_SIZE_LIMIT");
  }
  if (decoded.length === 1 && decoded[0]?.name.toLowerCase().endsWith(".xlsx")) {
    const file = decoded[0];
    return {
      parsed: await parseXlsx(file.buffer, file.name),
      fileName: file.name,
      mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      fileSizeBytes: totalSize
    };
  }

  const csvFiles: Partial<Record<CatalogSheetName, string>> = {};
  const decoder = new TextDecoder("utf-8", { fatal: true });
  for (const file of decoded) {
    const match = /^([a-z_]+)\.csv$/iu.exec(file.name);
    const sheet = match?.[1] as CatalogSheetName | undefined;
    if (!sheet || !catalogSheetNames.includes(sheet)) {
      throw new CatalogImportError(
        `Unsupported CSV filename ${file.name}; use the canonical sheet names`,
        "UNSUPPORTED_FILE_TYPE"
      );
    }
    if (csvFiles[sheet] !== undefined) {
      throw new CatalogImportError(`Duplicate CSV sheet ${sheet}`, "DUPLICATE_SHEET");
    }
    try {
      csvFiles[sheet] = decoder.decode(file.buffer);
    } catch {
      throw new CatalogImportError(`CSV ${file.name} is not valid UTF-8`, "INVALID_UTF8");
    }
  }
  return {
    parsed: parseCsvBundle(csvFiles),
    fileName: decoded
      .map((file) => file.name)
      .sort()
      .join(","),
    mediaType: "text/csv-bundle",
    fileSizeBytes: totalSize
  };
}

export async function runCatalogPipelineForActiveScope(
  parsed: ParsedCatalogBundle,
  repository: CatalogAdminRepository
): Promise<CatalogPipelineResult> {
  const initial = runCatalogPipeline(parsed);
  const scopes = [...new Set(initial.bundle.manifest.map((row) => row.importScope))];
  const scope = scopes.length === 1 ? scopes[0] : undefined;
  if (!scope) return initial;
  const comparison = await repository.getActiveComparison(scope);
  return comparison ? runCatalogPipeline(parsed, comparison) : initial;
}

export class CatalogAdminService {
  public constructor(private readonly repository: CatalogAdminRepository) {}

  public async preview(
    files: readonly CatalogUploadFile[],
    actorRole: AppRole
  ): Promise<CatalogPipelineResult> {
    this.requireAdministrator(actorRole);
    const upload = await parseUpload(files);
    return runCatalogPipelineForActiveScope(upload.parsed, this.repository);
  }

  public async importDraft(input: {
    files: readonly CatalogUploadFile[];
    actorId: string;
    actorRole: AppRole;
    correlationId: string;
  }): Promise<CatalogDraftSummary> {
    this.requireAdministrator(input.actorRole);
    const upload = await parseUpload(input.files);
    const pipeline = await runCatalogPipelineForActiveScope(upload.parsed, this.repository);
    if (!pipeline.bundle.manifest.length) {
      throw new CatalogImportError("Import manifest is missing or invalid", "INVALID_MANIFEST");
    }
    return this.repository.saveDraft({
      actorId: input.actorId,
      correlationId: input.correlationId,
      fileName: upload.fileName,
      mediaType: upload.mediaType,
      fileSizeBytes: upload.fileSizeBytes,
      parsed: upload.parsed,
      pipeline
    });
  }

  public async validate(input: {
    catalogVersionId: string;
    actorId: string;
    actorRole: AppRole;
    correlationId: string;
  }): Promise<CatalogDraftSummary> {
    this.requireAdministrator(input.actorRole);
    const parsed = await this.repository.loadDraft(input.catalogVersionId);
    if (!parsed)
      throw new CatalogImportError("Draft catalog import was not found", "CATALOG_DRAFT_NOT_FOUND");
    const pipeline = await runCatalogPipelineForActiveScope(parsed, this.repository);
    return this.repository.saveValidation({ ...input, pipeline });
  }

  public async approve(input: {
    catalogVersionId: string;
    actorId: string;
    actorRole: AppRole;
    correlationId: string;
    reason: string;
    contentHash: string;
  }): Promise<CatalogVersionSummary> {
    this.requireAdministrator(input.actorRole);
    if (!input.reason.trim())
      throw new CatalogImportError("Approval reason is required", "REASON_REQUIRED");
    return this.repository.approve(input);
  }

  public async activate(input: {
    catalogVersionId: string;
    actorId: string;
    actorRole: AppRole;
    correlationId: string;
    reason: string;
    contentHash: string;
  }): Promise<CatalogVersionSummary> {
    this.requireAdministrator(input.actorRole);
    if (!input.reason.trim())
      throw new CatalogImportError("Activation reason is required", "REASON_REQUIRED");
    return this.repository.activate(input);
  }

  public async archive(input: {
    catalogVersionId: string;
    actorId: string;
    actorRole: AppRole;
    correlationId: string;
    reason: string;
  }): Promise<CatalogVersionSummary> {
    this.requireAdministrator(input.actorRole);
    if (!input.reason.trim())
      throw new CatalogImportError("Archive reason is required", "REASON_REQUIRED");
    return this.repository.archive(input);
  }

  public listVersions(actorRole: AppRole): Promise<readonly CatalogVersionSummary[]> {
    this.requireAdministrator(actorRole);
    return this.repository.listVersions();
  }

  public findSelectableProducts(
    filter: CatalogSelectionFilter
  ): Promise<readonly CatalogSelectableProduct[]> {
    return this.repository.findSelectableProducts(filter);
  }

  public listSelectionOptions(): Promise<readonly CatalogSelectionOption[]> {
    return this.repository.listSelectionOptions();
  }

  public exportLatestReport(
    catalogVersionId: string,
    actorRole: AppRole
  ): Promise<CatalogValidationReport | null> {
    this.requireAdministrator(actorRole);
    return this.repository.exportLatestReport(catalogVersionId);
  }

  private requireAdministrator(role: AppRole): void {
    if (!canAdministerCatalog(role)) {
      throw new AppError(403, "FORBIDDEN", "Administrator role required");
    }
  }
}
