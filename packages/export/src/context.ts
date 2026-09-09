import {
  DatabaseIdV2Schema,
  ProjectRevisionChecksumsV2Schema,
  ProjectRevisionSnapshotV2Schema,
  ProjectRevisionStatusV2Schema,
  RevisionActorSnapshotV2Schema,
  Sha256Schema,
  UtcDateTimeSchema,
  VersionIdentifierV2Schema,
  type DeepReadonly
} from "@niedax/domain";
import { z } from "zod";

export const EXCEL_RENDERER_VERSION = "stage9-exceljs-2" as const;

export const ExportIdentityV3Schema = z
  .object({
    templateId: VersionIdentifierV2Schema,
    templateSha256: Sha256Schema,
    mappingVersion: VersionIdentifierV2Schema,
    rendererVersion: z.literal(EXCEL_RENDERER_VERSION)
  })
  .strict();

/** Captured lifecycle data is separate from the immutable calculation snapshot.
 * Security audit events, live authorization and mutable user profiles are excluded. */
export const ExportRevisionV3Schema = z
  .object({
    id: DatabaseIdV2Schema,
    projectId: DatabaseIdV2Schema,
    revisionNumber: z.number().int().positive(),
    name: z.string().min(1).max(500),
    comment: z.string().max(2_000).nullable(),
    authorSnapshot: RevisionActorSnapshotV2Schema,
    createdAt: UtcDateTimeSchema,
    sourceDraftVersion: z.number().int().nonnegative(),
    status: ProjectRevisionStatusV2Schema,
    checkedAt: UtcDateTimeSchema.nullable(),
    approvedAt: UtcDateTimeSchema.nullable()
  })
  .strict()
  .superRefine((revision, context) => {
    if (
      (revision.status === "calculated" &&
        (revision.checkedAt !== null || revision.approvedAt !== null)) ||
      (revision.status === "checked" &&
        (revision.checkedAt === null || revision.approvedAt !== null)) ||
      (revision.status === "approved" &&
        (revision.checkedAt === null || revision.approvedAt === null)) ||
      (revision.approvedAt !== null && revision.checkedAt === null)
    ) {
      context.addIssue({ code: "custom", message: "Inconsistent captured revision lifecycle" });
    }
  });

export const ExportContextV3Schema = z
  .object({
    schemaVersion: z.literal("english-export-context/v3"),
    language: z.literal("en"),
    capturedAt: UtcDateTimeSchema,
    revision: ExportRevisionV3Schema,
    lifecycle: z
      .array(
        z
          .object({
            action: z.enum([
              "revision.saved",
              "revision.checked",
              "revision.approved",
              "revision.archived"
            ]),
            occurredAt: UtcDateTimeSchema,
            actorSnapshot: RevisionActorSnapshotV2Schema,
            comment: z.string().max(2_000).nullable(),
            priorStatus: ProjectRevisionStatusV2Schema.nullable(),
            resultingStatus: ProjectRevisionStatusV2Schema
          })
          .strict()
      )
      .max(100),
    snapshot: ProjectRevisionSnapshotV2Schema,
    checksums: ProjectRevisionChecksumsV2Schema,
    versions: ExportIdentityV3Schema
  })
  .strict()
  .superRefine((value, context) => {
    const { snapshot, revision } = value;
    const result = snapshot.calculationResult;
    const input = snapshot.calculationInput;
    if (
      revision.projectId !== snapshot.project.id ||
      revision.sourceDraftVersion !== snapshot.project.draftVersion
    ) {
      context.addIssue({
        code: "custom",
        message: "Revision identity differs from saved evidence"
      });
    }
    for (const field of ["catalogSnapshot", "ruleSnapshot"] as const) {
      if (JSON.stringify(input[field]) !== JSON.stringify(result[field])) {
        context.addIssue({
          code: "custom",
          message: "Input/result snapshot identities differ",
          path: ["snapshot", "calculationResult", field]
        });
      }
    }
    for (const [items, path] of [
      [result.bomLines, "bomLines"],
      [result.warnings, "warnings"]
    ] as const) {
      if (new Set(items.map((item) => item.id)).size !== items.length) {
        context.addIssue({
          code: "custom",
          message: "Duplicate saved evidence IDs",
          path: ["snapshot", "calculationResult", path]
        });
      }
    }
    for (const line of result.bomLines) {
      // Retained engine fixtures contain repeated trace IDs for distinct steps
      // on the same line. Preserve every occurrence by its source array path;
      // do not collapse or rewrite historical trace evidence.
      if (
        line.traceStepIds.some((id) => {
          const matches = result.trace.steps.filter((step) => step.id === id);
          return matches.length === 0 || matches.some((step) => step.bomLineId !== line.id);
        })
      ) {
        context.addIssue({
          code: "custom",
          message: "Trace reference belongs to another BOM line"
        });
      }
      if (
        line.provenance.catalogSnapshotId !== result.catalogSnapshot.snapshotId ||
        line.provenance.ruleSnapshotId !== result.ruleSnapshot.snapshotId
      ) {
        context.addIssue({
          code: "custom",
          message: "BOM provenance differs from saved snapshots"
        });
      }
    }
  });

export type ExportContextV3 = DeepReadonly<z.infer<typeof ExportContextV3Schema>>;

function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const item of Object.values(value)) freeze(item);
    Object.freeze(value);
  }
  return value;
}

/** Parsing makes a detached copy; subsequent draft/caller changes cannot mutate it.
 * Checksum verification against database canonical JSON remains the repository's responsibility. */
export function buildEnglishExportContextV3(evidence: unknown): ExportContextV3 {
  return freeze(ExportContextV3Schema.parse(evidence));
}
