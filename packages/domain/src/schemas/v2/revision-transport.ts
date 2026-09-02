import { z } from "zod";

import {
  APPROVE_PROJECT_REVISION_REQUEST_V2,
  CHECK_PROJECT_REVISION_REQUEST_V2,
  PROJECT_REVISION_AUDIT_LIST_RESPONSE_V2,
  PROJECT_REVISION_LIST_RESPONSE_V2,
  PROJECT_REVISION_RESPONSE_V2,
  PROJECT_REVISION_SNAPSHOT_V2,
  REVISION_LIFECYCLE_EVENT_V2,
  SAVE_PROJECT_REVISION_REQUEST_V2
} from "../versions.js";
import {
  CorrelationIdSchema,
  type DeepReadonly,
  SemverSchema,
  Sha256Schema,
  UtcDateTimeSchema
} from "../primitives.js";
import { CalculationInputV1Schema } from "../v1/calculation.js";
import { RevisionV1Schema } from "../v1/transport.js";
import { AppRoleSchema } from "./access-control.js";
import {
  CalculationInputV2Schema,
  CalculationResultV2Schema,
  SnapshotReferenceV2Schema
} from "./calculation.js";
import { DatabaseIdV2Schema, ProjectV2Schema } from "./project-transport.js";

export const ProjectRevisionStatusV2Schema = z.enum([
  "calculated",
  "checked",
  "approved",
  "archived"
]);

const RevisionNameV2Schema = z.string().trim().min(1).max(500);
const RevisionCommentV2Schema = z.string().trim().min(1).max(2_000).nullable();
const RevisionEngineVersionV2Schema = SemverSchema.max(64);

export const RevisionActorSnapshotV2Schema = z
  .object({
    id: DatabaseIdV2Schema,
    username: z
      .string()
      .min(3)
      .max(64)
      .regex(/^[a-z0-9][a-z0-9._-]{2,63}$/u),
    displayName: z.string().trim().min(2).max(100),
    role: AppRoleSchema
  })
  .strict();

export const RevisionWarningSummaryV2Schema = z
  .object({
    totalCount: z.number().int().nonnegative(),
    blocksApprovalCount: z.number().int().nonnegative(),
    reviewRequiredCount: z.number().int().nonnegative()
  })
  .strict()
  .superRefine((summary, context) => {
    if (summary.blocksApprovalCount + summary.reviewRequiredCount > summary.totalCount) {
      context.addIssue({
        code: "custom",
        message: "Approval-impact warning counts cannot exceed the total warning count"
      });
    }
  });

export const RevisionActionUnavailableReasonV2Schema = z.enum([
  "notAuthorized",
  "notLatestRevision",
  "invalidStatus",
  "approvalNotReady",
  "blockingWarnings",
  "unsupportedVersion"
]);

export const RevisionActionAvailabilityV2Schema = z
  .object({
    allowed: z.boolean(),
    reason: RevisionActionUnavailableReasonV2Schema.nullable()
  })
  .strict()
  .superRefine((availability, context) => {
    if (availability.allowed !== (availability.reason === null)) {
      context.addIssue({
        code: "custom",
        message: "An allowed action cannot have an unavailable reason",
        path: ["reason"]
      });
    }
  });

export const ProjectRevisionActionsV2Schema = z
  .object({
    check: RevisionActionAvailabilityV2Schema,
    approve: RevisionActionAvailabilityV2Schema
  })
  .strict();

export const SaveProjectRevisionRequestV2Schema = z
  .object({
    schemaVersion: z.literal(SAVE_PROJECT_REVISION_REQUEST_V2),
    expectedDraftVersion: z.number().int().nonnegative(),
    expectedLatestRevisionNumber: z.number().int().nonnegative(),
    calculationRunId: DatabaseIdV2Schema,
    inputFingerprint: Sha256Schema,
    name: RevisionNameV2Schema,
    comment: RevisionCommentV2Schema
  })
  .strict();

export const CheckProjectRevisionRequestV2Schema = z
  .object({
    schemaVersion: z.literal(CHECK_PROJECT_REVISION_REQUEST_V2),
    expectedStatus: z.literal("calculated"),
    expectedLatestRevisionNumber: z.number().int().positive(),
    inputFingerprint: Sha256Schema,
    comment: RevisionCommentV2Schema
  })
  .strict();

export const ApproveProjectRevisionRequestV2Schema = z
  .object({
    schemaVersion: z.literal(APPROVE_PROJECT_REVISION_REQUEST_V2),
    expectedStatus: z.literal("checked"),
    expectedLatestRevisionNumber: z.number().int().positive(),
    inputFingerprint: Sha256Schema,
    comment: RevisionCommentV2Schema
  })
  .strict();

export const ProjectRevisionSummaryV2Schema = z
  .object({
    recordVersion: z.literal("revision/v2"),
    id: DatabaseIdV2Schema,
    projectId: DatabaseIdV2Schema,
    revisionNumber: z.number().int().positive(),
    name: RevisionNameV2Schema,
    comment: RevisionCommentV2Schema,
    authorId: DatabaseIdV2Schema,
    authorSnapshot: RevisionActorSnapshotV2Schema,
    createdAt: UtcDateTimeSchema,
    status: ProjectRevisionStatusV2Schema,
    inputFingerprint: Sha256Schema,
    engineVersion: RevisionEngineVersionV2Schema,
    calculationRunId: DatabaseIdV2Schema,
    sourceDraftVersion: z.number().int().nonnegative(),
    catalogSnapshot: SnapshotReferenceV2Schema,
    ruleSnapshot: SnapshotReferenceV2Schema,
    checkedAt: UtcDateTimeSchema.nullable(),
    approvedAt: UtcDateTimeSchema.nullable(),
    approvalReady: z.boolean(),
    warningSummary: RevisionWarningSummaryV2Schema,
    isLatest: z.boolean(),
    actions: ProjectRevisionActionsV2Schema
  })
  .strict()
  .superRefine((revision, context) => {
    if (revision.authorSnapshot.id !== revision.authorId) {
      context.addIssue({
        code: "custom",
        message: "Author snapshot must identify the saved author",
        path: ["authorSnapshot", "id"]
      });
    }
    if (
      revision.status === "calculated" &&
      (revision.checkedAt !== null || revision.approvedAt !== null)
    ) {
      context.addIssue({
        code: "custom",
        message: "A calculated revision cannot have review timestamps",
        path: ["checkedAt"]
      });
    }
    if (
      (revision.status === "checked" || revision.status === "approved") &&
      revision.checkedAt === null
    ) {
      context.addIssue({
        code: "custom",
        message: "A checked or approved revision requires a checked timestamp",
        path: ["checkedAt"]
      });
    }
    if (revision.status === "checked" && revision.approvedAt !== null) {
      context.addIssue({
        code: "custom",
        message: "A checked revision cannot have an approved timestamp",
        path: ["approvedAt"]
      });
    }
    if (revision.status === "approved" && revision.approvedAt === null) {
      context.addIssue({
        code: "custom",
        message: "An approved revision requires an approved timestamp",
        path: ["approvedAt"]
      });
    }
    if (
      revision.status === "archived" &&
      revision.approvedAt !== null &&
      revision.checkedAt === null
    ) {
      context.addIssue({
        code: "custom",
        message: "An archived approved revision requires its retained checked timestamp",
        path: ["checkedAt"]
      });
    }
  });

export const RetainedProjectRevisionSummaryV1Schema = z
  .object({
    recordVersion: z.literal("revision/v1"),
    id: DatabaseIdV2Schema,
    projectId: DatabaseIdV2Schema,
    revisionNumber: z.number().int().positive(),
    name: z.string().trim().min(1).max(500).nullable(),
    comment: z.string().trim().min(1).max(10_000).nullable(),
    commentTruncated: z.boolean().default(false),
    authorId: DatabaseIdV2Schema.nullable(),
    authorDisplayName: z.string().trim().min(2).max(100).nullable(),
    createdAt: UtcDateTimeSchema,
    status: ProjectRevisionStatusV2Schema,
    inputFingerprint: Sha256Schema,
    engineVersion: SemverSchema,
    checkedAt: UtcDateTimeSchema.nullable(),
    approvedAt: UtcDateTimeSchema.nullable(),
    isLatest: z.boolean(),
    actions: ProjectRevisionActionsV2Schema
  })
  .strict()
  .superRefine((revision, context) => {
    for (const action of [revision.actions.check, revision.actions.approve]) {
      if (action.allowed || action.reason !== "unsupportedVersion") {
        context.addIssue({
          code: "custom",
          message: "Retained v1 revisions are read-only in the Stage 8 workflow",
          path: ["actions"]
        });
      }
    }
  });

export const ProjectRevisionListItemV2Schema = z.union([
  ProjectRevisionSummaryV2Schema,
  RetainedProjectRevisionSummaryV1Schema
]);

export const RevisionLifecycleEventV2Schema = z
  .object({
    schemaVersion: z.literal(REVISION_LIFECYCLE_EVENT_V2),
    id: DatabaseIdV2Schema,
    projectId: DatabaseIdV2Schema,
    revisionId: DatabaseIdV2Schema,
    action: z.enum([
      "revision.saved",
      "revision.checked",
      "revision.approved",
      "revision.archived",
      "revision.authorization_rejected",
      "revision.transition_rejected"
    ]),
    outcome: z.enum(["succeeded", "rejected"]),
    actorId: DatabaseIdV2Schema.nullable(),
    actorSnapshot: RevisionActorSnapshotV2Schema.nullable(),
    occurredAt: UtcDateTimeSchema,
    correlationId: CorrelationIdSchema,
    priorStatus: ProjectRevisionStatusV2Schema.nullable(),
    resultingStatus: ProjectRevisionStatusV2Schema.nullable(),
    reasonCode: z.string().min(1).max(128).nullable(),
    comment: RevisionCommentV2Schema,
    inputFingerprint: Sha256Schema,
    engineVersion: RevisionEngineVersionV2Schema,
    catalogSnapshot: SnapshotReferenceV2Schema,
    ruleSnapshot: SnapshotReferenceV2Schema
  })
  .strict()
  .superRefine((event, context) => {
    if ((event.actorId === null) !== (event.actorSnapshot === null)) {
      context.addIssue({
        code: "custom",
        message: "Lifecycle actor ID and snapshot must either both be present or both be absent",
        path: ["actorSnapshot"]
      });
    }
    if (event.actorSnapshot !== null && event.actorSnapshot.id !== event.actorId) {
      context.addIssue({
        code: "custom",
        message: "Actor snapshot must identify the event actor",
        path: ["actorSnapshot", "id"]
      });
    }
    if (event.outcome === "succeeded" && event.reasonCode !== null) {
      context.addIssue({
        code: "custom",
        message: "A successful lifecycle event cannot have a rejection reason",
        path: ["reasonCode"]
      });
    }
    if (event.outcome === "rejected" && event.reasonCode === null) {
      context.addIssue({
        code: "custom",
        message: "A rejected lifecycle event requires a stable reason code",
        path: ["reasonCode"]
      });
    }
    if (event.outcome !== "succeeded") return;
    if (event.actorSnapshot === null || event.actorId === null) {
      context.addIssue({
        code: "custom",
        message: "A successful lifecycle event requires an actor snapshot",
        path: ["actorSnapshot"]
      });
    }
    if (
      event.action === "revision.authorization_rejected" ||
      event.action === "revision.transition_rejected"
    ) {
      context.addIssue({
        code: "custom",
        message: "A rejection action cannot have a successful outcome",
        path: ["outcome"]
      });
      return;
    }
    const statusMatches =
      (event.action === "revision.saved" &&
        event.priorStatus === null &&
        event.resultingStatus === "calculated") ||
      (event.action === "revision.checked" &&
        event.priorStatus === "calculated" &&
        event.resultingStatus === "checked") ||
      (event.action === "revision.approved" &&
        event.priorStatus === "checked" &&
        event.resultingStatus === "approved") ||
      (event.action === "revision.archived" &&
        event.priorStatus !== null &&
        event.priorStatus !== "archived" &&
        event.resultingStatus === "archived");
    if (!statusMatches) {
      context.addIssue({
        code: "custom",
        message: "Lifecycle event statuses do not match the action",
        path: ["resultingStatus"]
      });
    }
    if (
      event.action !== "revision.saved" &&
      event.actorSnapshot !== null &&
      !["reviewer", "administrator"].includes(event.actorSnapshot.role)
    ) {
      context.addIssue({
        code: "custom",
        message: "Only Reviewer or Administrator lifecycle actors may check or approve",
        path: ["actorSnapshot", "role"]
      });
    }
  });

export const ProjectRevisionSnapshotV2Schema = z
  .object({
    schemaVersion: z.literal(PROJECT_REVISION_SNAPSHOT_V2),
    project: ProjectV2Schema,
    calculationInput: CalculationInputV2Schema,
    calculationResult: CalculationResultV2Schema
  })
  .strict()
  .superRefine((snapshot, context) => {
    if (snapshot.calculationResult.engineVersion.length > 64) {
      context.addIssue({
        code: "too_big",
        maximum: 64,
        origin: "string",
        inclusive: true,
        message: "Revision engine version must be at most 64 characters",
        path: ["calculationResult", "engineVersion"]
      });
    }
    if (snapshot.calculationInput.project.id !== snapshot.project.id) {
      context.addIssue({
        code: "custom",
        message: "Calculation input must belong to the snapshotted project",
        path: ["calculationInput", "project", "id"]
      });
    }
    if (
      snapshot.calculationInput.invocation.calculationRunId !==
      snapshot.calculationResult.calculationRunId
    ) {
      context.addIssue({
        code: "custom",
        message: "Calculation input and result run IDs must match",
        path: ["calculationResult", "calculationRunId"]
      });
    }
    if (
      snapshot.calculationInput.invocation.inputFingerprint !==
      snapshot.calculationResult.inputFingerprint
    ) {
      context.addIssue({
        code: "custom",
        message: "Calculation input and result fingerprints must match",
        path: ["calculationResult", "inputFingerprint"]
      });
    }
  });

export const ProjectRevisionChecksumsV2Schema = z
  .object({
    projectChecksum: Sha256Schema,
    inputChecksum: Sha256Schema,
    snapshotChecksum: Sha256Schema,
    resultChecksum: Sha256Schema,
    bomChecksum: Sha256Schema,
    warningsChecksum: Sha256Schema,
    revisionChecksum: Sha256Schema
  })
  .strict();

export const ProjectRevisionDetailV2Schema = z
  .object({
    summary: ProjectRevisionSummaryV2Schema,
    snapshot: ProjectRevisionSnapshotV2Schema,
    checksums: ProjectRevisionChecksumsV2Schema,
    lifecycleEvents: z.array(RevisionLifecycleEventV2Schema).max(100)
  })
  .strict()
  .superRefine((detail, context) => {
    const { summary, snapshot } = detail;
    if (snapshot.project.id !== summary.projectId) {
      context.addIssue({
        code: "custom",
        message: "Revision snapshot must belong to the summarized project",
        path: ["snapshot", "project", "id"]
      });
    }
    if (snapshot.project.draftVersion !== summary.sourceDraftVersion) {
      context.addIssue({
        code: "custom",
        message: "Revision source draft versions must match",
        path: ["snapshot", "project", "draftVersion"]
      });
    }
    if (snapshot.calculationResult.calculationRunId !== summary.calculationRunId) {
      context.addIssue({
        code: "custom",
        message: "Revision calculation run IDs must match",
        path: ["snapshot", "calculationResult", "calculationRunId"]
      });
    }
    if (snapshot.calculationResult.inputFingerprint !== summary.inputFingerprint) {
      context.addIssue({
        code: "custom",
        message: "Revision fingerprints must match",
        path: ["snapshot", "calculationResult", "inputFingerprint"]
      });
    }
    if (snapshot.calculationResult.summary.approvalReady !== summary.approvalReady) {
      context.addIssue({
        code: "custom",
        message: "Saved approval readiness must match the calculation result",
        path: ["summary", "approvalReady"]
      });
    }
    if (snapshot.calculationResult.warnings.length !== summary.warningSummary.totalCount) {
      context.addIssue({
        code: "custom",
        message: "Saved warning count must match the calculation result",
        path: ["summary", "warningSummary", "totalCount"]
      });
    }
  });

export const RetainedProjectRevisionChecksumsV1Schema = z
  .object({
    inputChecksum: Sha256Schema,
    snapshotChecksum: Sha256Schema,
    bomChecksum: Sha256Schema
  })
  .strict();

export const RetainedProjectRevisionDetailV1Schema = z
  .object({
    recordVersion: z.literal("revision/v1"),
    summary: RetainedProjectRevisionSummaryV1Schema,
    revision: RevisionV1Schema,
    inputSnapshot: CalculationInputV1Schema,
    checksums: RetainedProjectRevisionChecksumsV1Schema
  })
  .strict()
  .superRefine((detail, context) => {
    if (
      detail.revision.revisionId !== detail.summary.id ||
      detail.revision.projectId !== detail.summary.projectId ||
      detail.revision.revisionNumber !== detail.summary.revisionNumber
    ) {
      context.addIssue({
        code: "custom",
        message: "Retained revision identity does not match its summary",
        path: ["revision"]
      });
    }
    if (detail.revision.inputFingerprint !== detail.summary.inputFingerprint) {
      context.addIssue({
        code: "custom",
        message: "Retained revision fingerprint does not match its summary",
        path: ["revision", "inputFingerprint"]
      });
    }
  });

export const ProjectRevisionListResponseV2Schema = z
  .object({
    schemaVersion: z.literal(PROJECT_REVISION_LIST_RESPONSE_V2),
    correlationId: CorrelationIdSchema,
    projectId: DatabaseIdV2Schema,
    revisions: z.array(ProjectRevisionListItemV2Schema).max(100),
    nextCursor: DatabaseIdV2Schema.nullable()
  })
  .strict()
  .superRefine((response, context) => {
    for (const [index, revision] of response.revisions.entries()) {
      if (revision.projectId !== response.projectId) {
        context.addIssue({
          code: "custom",
          message: "Every listed revision must belong to the requested project",
          path: ["revisions", index, "projectId"]
        });
      }
      const previous = response.revisions[index - 1];
      if (previous && previous.revisionNumber <= revision.revisionNumber) {
        context.addIssue({
          code: "custom",
          message: "Revisions must be ordered newest first",
          path: ["revisions", index, "revisionNumber"]
        });
      }
    }
  });

export const ProjectRevisionResponseV2Schema = z
  .object({
    schemaVersion: z.literal(PROJECT_REVISION_RESPONSE_V2),
    correlationId: CorrelationIdSchema,
    revision: z.union([ProjectRevisionDetailV2Schema, RetainedProjectRevisionDetailV1Schema])
  })
  .strict();

export const ProjectRevisionAuditListResponseV2Schema = z
  .object({
    schemaVersion: z.literal(PROJECT_REVISION_AUDIT_LIST_RESPONSE_V2),
    correlationId: CorrelationIdSchema,
    projectId: DatabaseIdV2Schema,
    events: z.array(RevisionLifecycleEventV2Schema).max(100),
    nextCursor: DatabaseIdV2Schema.nullable()
  })
  .strict()
  .superRefine((response, context) => {
    for (const [index, event] of response.events.entries()) {
      if (event.projectId !== response.projectId) {
        context.addIssue({
          code: "custom",
          message: "Every audit event must belong to the requested project",
          path: ["events", index, "projectId"]
        });
      }
    }
  });

export type ProjectRevisionStatusV2 = z.infer<typeof ProjectRevisionStatusV2Schema>;
export type RevisionActorSnapshotV2 = DeepReadonly<z.infer<typeof RevisionActorSnapshotV2Schema>>;
export type RevisionWarningSummaryV2 = DeepReadonly<z.infer<typeof RevisionWarningSummaryV2Schema>>;
export type RevisionActionAvailabilityV2 = DeepReadonly<
  z.infer<typeof RevisionActionAvailabilityV2Schema>
>;
export type ProjectRevisionActionsV2 = DeepReadonly<z.infer<typeof ProjectRevisionActionsV2Schema>>;
export type SaveProjectRevisionRequestV2 = DeepReadonly<
  z.infer<typeof SaveProjectRevisionRequestV2Schema>
>;
export type CheckProjectRevisionRequestV2 = DeepReadonly<
  z.infer<typeof CheckProjectRevisionRequestV2Schema>
>;
export type ApproveProjectRevisionRequestV2 = DeepReadonly<
  z.infer<typeof ApproveProjectRevisionRequestV2Schema>
>;
export type ProjectRevisionSummaryV2 = DeepReadonly<z.infer<typeof ProjectRevisionSummaryV2Schema>>;
export type RetainedProjectRevisionSummaryV1 = DeepReadonly<
  z.infer<typeof RetainedProjectRevisionSummaryV1Schema>
>;
export type ProjectRevisionListItemV2 = DeepReadonly<
  z.infer<typeof ProjectRevisionListItemV2Schema>
>;
export type RevisionLifecycleEventV2 = DeepReadonly<z.infer<typeof RevisionLifecycleEventV2Schema>>;
export type ProjectRevisionSnapshotV2 = DeepReadonly<
  z.infer<typeof ProjectRevisionSnapshotV2Schema>
>;
export type ProjectRevisionChecksumsV2 = DeepReadonly<
  z.infer<typeof ProjectRevisionChecksumsV2Schema>
>;
export type ProjectRevisionDetailV2 = DeepReadonly<z.infer<typeof ProjectRevisionDetailV2Schema>>;
export type RetainedProjectRevisionDetailV1 = DeepReadonly<
  z.infer<typeof RetainedProjectRevisionDetailV1Schema>
>;
export type ProjectRevisionListResponseV2 = DeepReadonly<
  z.infer<typeof ProjectRevisionListResponseV2Schema>
>;
export type ProjectRevisionResponseV2 = DeepReadonly<
  z.infer<typeof ProjectRevisionResponseV2Schema>
>;
export type ProjectRevisionAuditListResponseV2 = DeepReadonly<
  z.infer<typeof ProjectRevisionAuditListResponseV2Schema>
>;

export {
  APPROVE_PROJECT_REVISION_REQUEST_V2,
  CHECK_PROJECT_REVISION_REQUEST_V2,
  PROJECT_REVISION_AUDIT_LIST_RESPONSE_V2,
  PROJECT_REVISION_LIST_RESPONSE_V2,
  PROJECT_REVISION_RESPONSE_V2,
  PROJECT_REVISION_SNAPSHOT_V2,
  REVISION_LIFECYCLE_EVENT_V2,
  SAVE_PROJECT_REVISION_REQUEST_V2
};
