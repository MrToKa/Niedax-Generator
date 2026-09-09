import { z } from "zod";

import {
  CorrelationIdSchema,
  type DeepReadonly,
  Sha256Schema,
  UtcDateTimeSchema
} from "../primitives.js";
import { ExportRequestV1Schema } from "../v1/transport.js";
import { EXPORT_ARTIFACT_V2, EXPORT_LIST_RESPONSE_V2 } from "../versions.js";
import { DatabaseIdV2Schema } from "./project-transport.js";

// The retained application command gets these fields from validated HTTP headers.
export const CreateExportRequestV1Schema = ExportRequestV1Schema.omit({
  correlationId: true,
  idempotencyKey: true
});

export const ExportFailureCodeV2Schema = z.enum([
  "TEMPLATE_UNAVAILABLE",
  "UNSUPPORTED_REVISION",
  "RENDER_FAILED",
  "RECOVERY_EXHAUSTED"
]);

export const ExportAvailabilityV2Schema = z
  .object({
    allowed: z.boolean(),
    reason: z.enum(["notAuthorized", "unsupportedVersion", "templateUnavailable"]).nullable()
  })
  .strict()
  .superRefine((value, context) => {
    if (value.allowed !== (value.reason === null))
      context.addIssue({
        code: "custom",
        message: "Availability must have a reason exactly when unavailable",
        path: ["reason"]
      });
  });

export const ExportArtifactV2Schema = z
  .object({
    schemaVersion: z.literal(EXPORT_ARTIFACT_V2),
    correlationId: CorrelationIdSchema,
    exportId: DatabaseIdV2Schema,
    revisionId: DatabaseIdV2Schema,
    status: z.enum(["pending", "ready", "failed"]),
    format: z.literal("xlsx"),
    language: z.literal("en"),
    downloadPath: z
      .string()
      .regex(/^\/api\/v1\/exports\/[0-9a-f-]+\/download$/u)
      .nullable(),
    contentHash: Sha256Schema.nullable(),
    contentLength: z
      .number()
      .int()
      .positive()
      .max(50 * 1024 * 1024)
      .nullable(),
    fileName: z
      .string()
      .min(6)
      .max(180)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*\.xlsx$/u)
      .nullable(),
    createdAt: UtcDateTimeSchema,
    failureCode: ExportFailureCodeV2Schema.nullable(),
    expiresAt: z.null()
  })
  .strict()
  .superRefine((artifact, context) => {
    const metadata = [
      artifact.downloadPath,
      artifact.contentHash,
      artifact.contentLength,
      artifact.fileName
    ];
    if (artifact.status === "ready") {
      if (
        metadata.some((value) => value === null) ||
        artifact.failureCode !== null ||
        artifact.downloadPath !== `/api/v1/exports/${artifact.exportId}/download`
      ) {
        context.addIssue({
          code: "custom",
          message: "Ready artifacts require complete matching download metadata and no failure"
        });
      }
    } else if (
      metadata.some((value) => value !== null) ||
      (artifact.status === "failed") !== (artifact.failureCode !== null)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Incomplete artifacts cannot expose download metadata; only failed artifacts have a failure code"
      });
    }
  });

export const ExportListResponseV2Schema = z
  .object({
    schemaVersion: z.literal(EXPORT_LIST_RESPONSE_V2),
    correlationId: CorrelationIdSchema,
    revisionId: DatabaseIdV2Schema,
    availability: ExportAvailabilityV2Schema,
    artifacts: z.array(ExportArtifactV2Schema).max(20)
  })
  .strict()
  .superRefine((list, context) => {
    const ids = new Set<string>();
    for (const [index, artifact] of list.artifacts.entries()) {
      if (artifact.revisionId !== list.revisionId || ids.has(artifact.exportId)) {
        context.addIssue({
          code: "custom",
          message: "Artifacts must uniquely identify exports for the selected revision",
          path: ["artifacts", index]
        });
      }
      ids.add(artifact.exportId);
    }
  });

export type CreateExportRequestV1 = DeepReadonly<z.infer<typeof CreateExportRequestV1Schema>>;
export type ExportArtifactV2 = DeepReadonly<z.infer<typeof ExportArtifactV2Schema>>;
export type ExportListResponseV2 = DeepReadonly<z.infer<typeof ExportListResponseV2Schema>>;
export type ExportAvailabilityV2 = DeepReadonly<z.infer<typeof ExportAvailabilityV2Schema>>;
export type ExportFailureCodeV2 = z.infer<typeof ExportFailureCodeV2Schema>;
