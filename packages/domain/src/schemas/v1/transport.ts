import { z } from "zod";

import {
  CalculationRunSchema,
  ProjectCalculationDataSchema,
  ProjectStatusSchema,
  SnapshotReferenceSchema
} from "../domain.js";
import {
  CorrelationIdSchema,
  type DeepReadonly,
  HumanTextSchema,
  IdentifierSchema,
  IdempotencyKeySchema,
  Sha256Schema,
  UtcDateTimeSchema
} from "../primitives.js";
import { CalculationInputV1Schema, CalculationResultV1Schema } from "./calculation.js";

export const CalculateCommandV1Schema = z
  .object({
    schemaVersion: z.literal("calculate-command/v1"),
    idempotencyKey: IdempotencyKeySchema,
    correlationId: CorrelationIdSchema,
    input: CalculationInputV1Schema
  })
  .strict();

export const SaveRevisionCommandV1Schema = z
  .object({
    schemaVersion: z.literal("save-revision-command/v1"),
    idempotencyKey: IdempotencyKeySchema,
    correlationId: CorrelationIdSchema,
    projectId: IdentifierSchema,
    expectedDraftVersion: z.number().int().nonnegative(),
    expectedLatestRevisionNumber: z.number().int().nonnegative(),
    calculationRunId: IdentifierSchema,
    inputFingerprint: Sha256Schema
  })
  .strict();

export const CheckRevisionCommandV1Schema = z
  .object({
    schemaVersion: z.literal("check-revision-command/v1"),
    idempotencyKey: IdempotencyKeySchema,
    correlationId: CorrelationIdSchema,
    revisionId: IdentifierSchema,
    expectedStatus: z.literal("calculated"),
    inputFingerprint: Sha256Schema,
    comment: z.string().trim().max(2_000).nullable()
  })
  .strict();

export const ApproveRevisionCommandV1Schema = z
  .object({
    schemaVersion: z.literal("approve-revision-command/v1"),
    idempotencyKey: IdempotencyKeySchema,
    correlationId: CorrelationIdSchema,
    revisionId: IdentifierSchema,
    expectedStatus: z.literal("checked"),
    inputFingerprint: Sha256Schema,
    comment: z.string().trim().max(2_000).nullable()
  })
  .strict();

export const UpsertProjectDraftCommandV1Schema = z
  .object({
    schemaVersion: z.literal("upsert-project-draft-command/v1"),
    idempotencyKey: IdempotencyKeySchema,
    correlationId: CorrelationIdSchema,
    expectedDraftVersion: z.number().int().nonnegative().nullable(),
    project: ProjectCalculationDataSchema
  })
  .strict();

export const ValidateProjectInputCommandV1Schema = z
  .object({
    schemaVersion: z.literal("validate-project-input-command/v1"),
    correlationId: CorrelationIdSchema,
    project: ProjectCalculationDataSchema
  })
  .strict();

export const CatalogImportMetadataV1Schema = z
  .object({
    schemaVersion: z.literal("catalog-import-metadata/v1"),
    idempotencyKey: IdempotencyKeySchema,
    correlationId: CorrelationIdSchema,
    fileName: HumanTextSchema,
    mediaType: z.enum([
      "text/csv",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    ]),
    sizeBytes: z
      .number()
      .int()
      .positive()
      .max(50 * 1024 * 1024),
    contentHash: Sha256Schema
  })
  .strict();

export const CatalogImportIssueV1Schema = z.discriminatedUnion("severity", [
  z
    .object({
      severity: z.literal("error"),
      code: IdentifierSchema,
      message: HumanTextSchema,
      row: z.number().int().positive().nullable(),
      column: z.string().trim().min(1).max(128).nullable()
    })
    .strict(),
  z
    .object({
      severity: z.literal("warning"),
      code: IdentifierSchema,
      message: HumanTextSchema,
      row: z.number().int().positive().nullable(),
      column: z.string().trim().min(1).max(128).nullable()
    })
    .strict()
]);

export const CatalogImportValidationResultV1Schema = z
  .object({
    schemaVersion: z.literal("catalog-import-validation-result/v1"),
    correlationId: CorrelationIdSchema,
    importId: IdentifierSchema,
    status: z.enum(["valid", "invalid"]),
    stagedCatalogSnapshot: SnapshotReferenceSchema,
    rowCount: z.number().int().nonnegative(),
    validRowCount: z.number().int().nonnegative(),
    invalidRowCount: z.number().int().nonnegative(),
    issues: z.array(CatalogImportIssueV1Schema)
  })
  .strict()
  .superRefine((result, context) => {
    if (result.validRowCount + result.invalidRowCount !== result.rowCount) {
      context.addIssue({
        code: "custom",
        message: "Valid and invalid row counts must equal the total row count",
        path: ["rowCount"]
      });
    }
    if (result.status === "valid" && result.invalidRowCount !== 0) {
      context.addIssue({
        code: "custom",
        message: "A valid import cannot contain invalid rows",
        path: ["status"]
      });
    }
  });

export const ActivateVersionCommandV1Schema = z.discriminatedUnion("target", [
  z
    .object({
      schemaVersion: z.literal("activate-version-command/v1"),
      target: z.literal("catalog"),
      idempotencyKey: IdempotencyKeySchema,
      correlationId: CorrelationIdSchema,
      snapshot: SnapshotReferenceSchema,
      expectedActiveSnapshotId: IdentifierSchema.nullable()
    })
    .strict(),
  z
    .object({
      schemaVersion: z.literal("activate-version-command/v1"),
      target: z.literal("rules"),
      idempotencyKey: IdempotencyKeySchema,
      correlationId: CorrelationIdSchema,
      snapshot: SnapshotReferenceSchema,
      expectedActiveSnapshotId: IdentifierSchema.nullable()
    })
    .strict()
]);

export const ExportRequestV1Schema = z
  .object({
    schemaVersion: z.literal("export-request/v1"),
    idempotencyKey: IdempotencyKeySchema,
    correlationId: CorrelationIdSchema,
    revisionId: IdentifierSchema,
    inputFingerprint: Sha256Schema,
    format: z.enum(["xlsx", "pdf", "csv", "print"]),
    language: z.literal("en")
  })
  .strict();

export const ValidationIssueV1Schema = z
  .object({
    path: z.array(z.union([z.string(), z.number().int().nonnegative()])),
    code: IdentifierSchema,
    message: HumanTextSchema
  })
  .strict();

export const ValidationResultV1Schema = z
  .object({
    schemaVersion: z.literal("validation-result/v1"),
    correlationId: CorrelationIdSchema,
    blockingErrors: z.array(ValidationIssueV1Schema),
    warnings: z.array(ValidationIssueV1Schema),
    engineeringReview: z.array(ValidationIssueV1Schema),
    canCalculate: z.boolean(),
    canApprove: z.boolean()
  })
  .strict();

export const ProjectDraftResponseV1Schema = z
  .object({
    schemaVersion: z.literal("project-draft-response/v1"),
    correlationId: CorrelationIdSchema,
    projectId: IdentifierSchema,
    draftVersion: z.number().int().nonnegative(),
    status: z.literal("draft")
  })
  .strict();

export const CalculationRunResponseV1Schema = z
  .object({
    schemaVersion: z.literal("calculation-run-response/v1"),
    correlationId: CorrelationIdSchema,
    run: CalculationRunSchema,
    result: CalculationResultV1Schema.nullable()
  })
  .strict();

export const RevisionV1Schema = z
  .object({
    schemaVersion: z.literal("revision/v1"),
    revisionId: IdentifierSchema,
    revisionNumber: z.number().int().positive(),
    projectId: IdentifierSchema,
    status: ProjectStatusSchema.extract(["calculated", "checked", "approved", "archived"]),
    inputFingerprint: Sha256Schema,
    calculationResult: CalculationResultV1Schema,
    createdAt: UtcDateTimeSchema,
    checkedAt: UtcDateTimeSchema.nullable(),
    approvedAt: UtcDateTimeSchema.nullable()
  })
  .strict();

export const RevisionResponseV1Schema = z
  .object({
    schemaVersion: z.literal("revision-response/v1"),
    correlationId: CorrelationIdSchema,
    revision: RevisionV1Schema
  })
  .strict();

export const ActivationResponseV1Schema = z
  .object({
    schemaVersion: z.literal("activation-response/v1"),
    correlationId: CorrelationIdSchema,
    target: z.enum(["catalog", "rules"]),
    activeSnapshot: SnapshotReferenceSchema,
    activatedAt: UtcDateTimeSchema
  })
  .strict();

export const ExportArtifactV1Schema = z
  .object({
    schemaVersion: z.literal("export-artifact/v1"),
    correlationId: CorrelationIdSchema,
    exportId: IdentifierSchema,
    status: z.enum(["pending", "ready", "failed"]),
    format: z.enum(["xlsx", "pdf", "csv", "print"]),
    language: z.literal("en"),
    downloadPath: z.string().startsWith("/api/v1/exports/").nullable(),
    contentHash: Sha256Schema.nullable(),
    expiresAt: UtcDateTimeSchema.nullable()
  })
  .strict();

export const ErrorCodeV1Schema = z.enum([
  "VALIDATION_FAILED",
  "CONFLICT_STALE_VERSION",
  "INVALID_STATE_TRANSITION",
  "AUTHENTICATION_REQUIRED",
  "FORBIDDEN",
  "RESOURCE_NOT_FOUND",
  "CATALOG_SNAPSHOT_MISSING",
  "RULE_SNAPSHOT_MISSING",
  "UNSUPPORTED_SCHEMA_VERSION",
  "IDEMPOTENCY_KEY_CONFLICT",
  "CALCULATION_FAILED",
  "CATALOG_IMPORT_FAILED",
  "EXPORT_FAILED",
  "INTERNAL_ERROR"
]);

export const ErrorDetailsV1Schema = z
  .discriminatedUnion("kind", [
    z
      .object({
        kind: z.literal("validation"),
        issues: z.array(ValidationIssueV1Schema).min(1)
      })
      .strict(),
    z
      .object({
        kind: z.literal("conflict"),
        expectedVersion: z.string().min(1),
        actualVersion: z.string().min(1).nullable()
      })
      .strict(),
    z
      .object({
        kind: z.literal("stateTransition"),
        currentStatus: ProjectStatusSchema,
        requestedStatus: ProjectStatusSchema
      })
      .strict()
  ])
  .nullable();

export const ErrorEnvelopeV1Schema = z
  .object({
    schemaVersion: z.literal("error-envelope/v1"),
    correlationId: CorrelationIdSchema,
    error: z
      .object({
        code: ErrorCodeV1Schema,
        message: HumanTextSchema,
        details: ErrorDetailsV1Schema
      })
      .strict()
  })
  .strict();

export type CalculateCommandV1 = DeepReadonly<z.infer<typeof CalculateCommandV1Schema>>;
export type SaveRevisionCommandV1 = DeepReadonly<z.infer<typeof SaveRevisionCommandV1Schema>>;
export type CheckRevisionCommandV1 = DeepReadonly<z.infer<typeof CheckRevisionCommandV1Schema>>;
export type ApproveRevisionCommandV1 = DeepReadonly<z.infer<typeof ApproveRevisionCommandV1Schema>>;
export type UpsertProjectDraftCommandV1 = DeepReadonly<
  z.infer<typeof UpsertProjectDraftCommandV1Schema>
>;
export type ValidateProjectInputCommandV1 = DeepReadonly<
  z.infer<typeof ValidateProjectInputCommandV1Schema>
>;
export type CatalogImportValidationResultV1 = DeepReadonly<
  z.infer<typeof CatalogImportValidationResultV1Schema>
>;
export type ActivateVersionCommandV1 = DeepReadonly<z.infer<typeof ActivateVersionCommandV1Schema>>;
export type ExportRequestV1 = DeepReadonly<z.infer<typeof ExportRequestV1Schema>>;
export type ErrorEnvelopeV1 = DeepReadonly<z.infer<typeof ErrorEnvelopeV1Schema>>;
export type RevisionV1 = DeepReadonly<z.infer<typeof RevisionV1Schema>>;
export type CalculationRunResponseV1 = DeepReadonly<z.infer<typeof CalculationRunResponseV1Schema>>;
export type RevisionResponseV1 = DeepReadonly<z.infer<typeof RevisionResponseV1Schema>>;
export type ValidationResultV1 = DeepReadonly<z.infer<typeof ValidationResultV1Schema>>;
export type ProjectDraftResponseV1 = DeepReadonly<z.infer<typeof ProjectDraftResponseV1Schema>>;
export type ActivationResponseV1 = DeepReadonly<z.infer<typeof ActivationResponseV1Schema>>;
export type ExportArtifactV1 = DeepReadonly<z.infer<typeof ExportArtifactV1Schema>>;
