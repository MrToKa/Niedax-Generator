import { describe, expect, it } from "vitest";

import expectedResultJson from "../../calculation-engine/tests/golden/expected/all-major-rules-combined.json" with { type: "json" };
import { allMajorRulesInputV2 } from "../../calculation-engine/tests/helpers/fixture-v2.js";
import {
  representativeCalculationResultV1,
  validCalculationInputV1
} from "./fixtures/calculation-v1.js";
import {
  ADMIN_USER_LIST_RESPONSE_V2,
  APP_CAPABILITIES,
  APP_ROLES,
  AdminUserListResponseV2Schema,
  AppRoleSchema,
  ApproveProjectRevisionRequestV2Schema,
  AuthenticatedIdentityResponseV2Schema,
  CalculationInputV2Schema,
  CalculationResultV2Schema,
  CheckProjectRevisionRequestV2Schema,
  CreateAdminUserRequestV2Schema,
  ProjectAccessResponseV2Schema,
  ProjectListResponseV3Schema,
  ProjectRevisionListResponseV2Schema,
  ProjectRevisionResponseV2Schema,
  PublicCapabilityListSchema,
  RevisionLifecycleEventV2Schema,
  SaveProjectRevisionRequestV2Schema,
  SaveRevisionCommandV1Schema,
  UpdateAdminUserRoleRequestV2Schema,
  UpdateAdminUserStatusRequestV2Schema
} from "../src/index.js";

const ids = {
  project: "10000000-0000-4000-8000-000000000001",
  actor: "10000000-0000-4000-8000-000000000002",
  revision: "10000000-0000-4000-8000-000000000003",
  run: "10000000-0000-4000-8000-000000000004",
  event: "10000000-0000-4000-8000-000000000005"
} as const;
const now = "2026-09-02T08:00:00.000Z";
const fingerprint = `sha256:${"1".repeat(64)}`;

describe("Stage 8 role and public capability contracts", () => {
  it.each(APP_ROLES)("accepts the canonical %s role", (role) => {
    expect(AppRoleSchema.parse(role)).toBe(role);
  });

  it.each(["Designer", "VIEWER", "checker", "view only", ""])(
    "rejects non-canonical role %j",
    (role) => {
      expect(AppRoleSchema.safeParse(role).success).toBe(false);
    }
  );

  it("accepts only unique public capabilities", () => {
    expect(PublicCapabilityListSchema.parse(APP_CAPABILITIES)).toEqual(APP_CAPABILITIES);
    expect(PublicCapabilityListSchema.safeParse(["project:read", "project:read"]).success).toBe(
      false
    );
    expect(PublicCapabilityListSchema.safeParse(["database:write"]).success).toBe(false);
  });

  it("strictly validates identity, user administration, and project access payloads", () => {
    const user = {
      id: ids.actor,
      username: "stage8.designer",
      displayName: "Stage 8 Designer",
      role: "designer",
      capabilities: ["project:create", "project:read", "project:edit"]
    } as const;
    expect(
      AuthenticatedIdentityResponseV2Schema.safeParse({
        schemaVersion: "authenticated-identity-response/v2",
        correlationId: "stage8-identity",
        user
      }).success
    ).toBe(true);
    expect(
      AuthenticatedIdentityResponseV2Schema.safeParse({
        schemaVersion: "authenticated-identity-response/v2",
        correlationId: "stage8-identity",
        user,
        sessionToken: "must-not-leak"
      }).success
    ).toBe(false);
    expect(
      AdminUserListResponseV2Schema.safeParse({
        schemaVersion: ADMIN_USER_LIST_RESPONSE_V2,
        correlationId: "stage8-user-list",
        users: [
          { ...user, capabilities: undefined, enabled: true, createdAt: now, updatedAt: now }
        ],
        nextCursor: null
      }).success
    ).toBe(false);
    expect(
      AdminUserListResponseV2Schema.safeParse({
        schemaVersion: ADMIN_USER_LIST_RESPONSE_V2,
        correlationId: "stage8-user-list",
        users: [
          {
            id: user.id,
            username: user.username,
            displayName: user.displayName,
            role: user.role,
            enabled: true,
            createdAt: now,
            updatedAt: now
          }
        ],
        nextCursor: null
      }).success
    ).toBe(true);
    expect(
      ProjectAccessResponseV2Schema.safeParse({
        schemaVersion: "project-access-response/v2",
        correlationId: "stage8-access",
        projectId: ids.project,
        access: {
          canEditDraft: false,
          canValidate: false,
          canCalculate: false,
          canSaveRevision: false,
          canReadHistory: true
        }
      }).success
    ).toBe(true);
  });

  it.each([
    [
      CreateAdminUserRequestV2Schema,
      {
        schemaVersion: "create-admin-user-request/v2",
        username: "stage8.viewer",
        displayName: "Stage 8 Viewer",
        password: "Strong-Local-42!",
        role: "viewer"
      }
    ],
    [
      UpdateAdminUserRoleRequestV2Schema,
      { schemaVersion: "update-admin-user-role-request/v2", role: "reviewer" }
    ],
    [
      UpdateAdminUserStatusRequestV2Schema,
      { schemaVersion: "update-admin-user-status-request/v2", enabled: false }
    ]
  ] as const)("rejects unknown user-administration request keys", (schema, value) => {
    expect(schema.safeParse(value).success).toBe(true);
    expect(schema.safeParse({ ...value, actorId: ids.actor }).success).toBe(false);
  });

  it("bounds the explicitly paged project-list contract", () => {
    expect(
      ProjectListResponseV3Schema.safeParse({
        schemaVersion: "project-list-response/v3",
        correlationId: "stage8-project-list",
        projects: [],
        nextCursor: ids.project
      }).success
    ).toBe(true);
    expect(
      ProjectListResponseV3Schema.safeParse({
        schemaVersion: "project-list-response/v2",
        correlationId: "stage8-project-list",
        projects: [],
        nextCursor: null
      }).success
    ).toBe(false);
  });
});

describe("Stage 8 immutable revision transport contracts", () => {
  const saveRequest = {
    schemaVersion: "save-project-revision-request/v2",
    expectedDraftVersion: 5,
    expectedLatestRevisionNumber: 0,
    calculationRunId: ids.run,
    inputFingerprint: fingerprint,
    name: "Issued for review",
    comment: null
  } as const;

  it("strictly validates save, check, and approve requests", () => {
    expect(SaveProjectRevisionRequestV2Schema.safeParse(saveRequest).success).toBe(true);
    expect(
      CheckProjectRevisionRequestV2Schema.safeParse({
        schemaVersion: "check-project-revision-request/v2",
        expectedStatus: "calculated",
        expectedLatestRevisionNumber: 1,
        inputFingerprint: fingerprint,
        comment: "Checked"
      }).success
    ).toBe(true);
    expect(
      ApproveProjectRevisionRequestV2Schema.safeParse({
        schemaVersion: "approve-project-revision-request/v2",
        expectedStatus: "checked",
        expectedLatestRevisionNumber: 1,
        inputFingerprint: fingerprint,
        comment: null
      }).success
    ).toBe(true);
    expect(
      SaveProjectRevisionRequestV2Schema.safeParse({ ...saveRequest, actorId: ids.actor }).success
    ).toBe(false);
    expect(
      SaveProjectRevisionRequestV2Schema.safeParse({
        ...saveRequest,
        schemaVersion: "save-project-revision-request/v1"
      }).success
    ).toBe(false);
    expect(
      SaveProjectRevisionRequestV2Schema.safeParse({ ...saveRequest, name: "x".repeat(501) })
        .success
    ).toBe(false);
    expect(
      SaveProjectRevisionRequestV2Schema.safeParse({ ...saveRequest, comment: "x".repeat(2_001) })
        .success
    ).toBe(false);
    expect(
      SaveProjectRevisionRequestV2Schema.safeParse({
        ...saveRequest,
        expectedDraftVersion: -1
      }).success
    ).toBe(false);
  });

  it("preserves the retained v1 save command unchanged", () => {
    const retained = {
      schemaVersion: "save-revision-command/v1",
      idempotencyKey: "retained-save-0001",
      correlationId: "retained-correlation",
      projectId: "project-retained",
      expectedDraftVersion: 7,
      expectedLatestRevisionNumber: 2,
      calculationRunId: "calculation-retained",
      inputFingerprint: fingerprint
    } as const;
    expect(SaveRevisionCommandV1Schema.parse(retained)).toEqual(retained);
    expect(SaveRevisionCommandV1Schema.safeParse({ ...retained, name: "New field" }).success).toBe(
      false
    );
  });

  it("lists and reads retained v1 records without fabricating an actor or v2 readiness", () => {
    const retainedFingerprint = representativeCalculationResultV1.inputFingerprint;
    const retainedSummary = {
      recordVersion: "revision/v1",
      id: ids.revision,
      projectId: ids.project,
      revisionNumber: 1,
      name: null,
      comment: null,
      commentTruncated: false,
      authorId: null,
      authorDisplayName: null,
      createdAt: now,
      status: "calculated",
      inputFingerprint: retainedFingerprint,
      engineVersion: representativeCalculationResultV1.engineVersion,
      checkedAt: null,
      approvedAt: null,
      isLatest: true,
      actions: {
        check: { allowed: false, reason: "unsupportedVersion" },
        approve: { allowed: false, reason: "unsupportedVersion" }
      }
    } as const;
    const retainedDetail = {
      recordVersion: "revision/v1",
      summary: retainedSummary,
      revision: {
        schemaVersion: "revision/v1",
        revisionId: ids.revision,
        revisionNumber: 1,
        projectId: ids.project,
        status: "calculated",
        inputFingerprint: retainedFingerprint,
        calculationResult: representativeCalculationResultV1,
        createdAt: now,
        checkedAt: null,
        approvedAt: null
      },
      inputSnapshot: validCalculationInputV1,
      checksums: {
        inputChecksum: fingerprint,
        snapshotChecksum: fingerprint,
        bomChecksum: fingerprint
      }
    } as const;

    expect(
      ProjectRevisionListResponseV2Schema.safeParse({
        schemaVersion: "project-revision-list-response/v2",
        correlationId: "retained-list",
        projectId: ids.project,
        revisions: [retainedSummary],
        nextCursor: null
      }).success
    ).toBe(true);
    expect(
      ProjectRevisionResponseV2Schema.safeParse({
        schemaVersion: "project-revision-response/v2",
        correlationId: "retained-detail",
        revision: retainedDetail
      }).success
    ).toBe(true);
    expect("approvalReady" in retainedSummary).toBe(false);
    expect("authorSnapshot" in retainedSummary).toBe(false);
  });

  it("validates a self-contained revision detail and bounded newest-first list", () => {
    const calculationInput = CalculationInputV2Schema.parse({
      ...structuredClone(allMajorRulesInputV2),
      invocation: { calculationRunId: ids.run, inputFingerprint: fingerprint },
      project: { ...structuredClone(allMajorRulesInputV2.project), id: ids.project }
    });
    const calculationResult = CalculationResultV2Schema.parse({
      ...structuredClone(expectedResultJson),
      calculationRunId: ids.run,
      inputFingerprint: fingerprint
    });
    const actor = {
      id: ids.actor,
      username: "stage8.designer",
      displayName: "Stage 8 Designer",
      role: "designer"
    } as const;
    const actions = {
      check: { allowed: true, reason: null },
      approve: { allowed: false, reason: "invalidStatus" }
    } as const;
    const warningSummary = {
      totalCount: calculationResult.warnings.length,
      blocksApprovalCount: calculationResult.warnings.filter(
        (warning) => warning.approvalImpact === "blocksApproval"
      ).length,
      reviewRequiredCount: calculationResult.warnings.filter(
        (warning) => warning.approvalImpact === "reviewRequired"
      ).length
    };
    const summary = {
      recordVersion: "revision/v2",
      id: ids.revision,
      projectId: ids.project,
      revisionNumber: 1,
      name: "Issued for review",
      comment: null,
      authorId: ids.actor,
      authorSnapshot: actor,
      createdAt: now,
      status: "calculated",
      inputFingerprint: fingerprint,
      engineVersion: calculationResult.engineVersion,
      calculationRunId: ids.run,
      sourceDraftVersion: 5,
      catalogSnapshot: calculationResult.catalogSnapshot,
      ruleSnapshot: calculationResult.ruleSnapshot,
      checkedAt: null,
      approvedAt: null,
      approvalReady: calculationResult.summary.approvalReady,
      warningSummary,
      isLatest: true,
      actions
    } as const;
    const lifecycleEvent = RevisionLifecycleEventV2Schema.parse({
      schemaVersion: "revision-lifecycle-event/v2",
      id: ids.event,
      projectId: ids.project,
      revisionId: ids.revision,
      action: "revision.saved",
      outcome: "succeeded",
      actorId: ids.actor,
      actorSnapshot: actor,
      occurredAt: now,
      correlationId: "stage8-revision-save",
      priorStatus: null,
      resultingStatus: "calculated",
      reasonCode: null,
      comment: null,
      inputFingerprint: fingerprint,
      engineVersion: calculationResult.engineVersion,
      catalogSnapshot: calculationResult.catalogSnapshot,
      ruleSnapshot: calculationResult.ruleSnapshot
    });
    expect(
      RevisionLifecycleEventV2Schema.safeParse({
        ...lifecycleEvent,
        action: "revision.authorization_rejected",
        outcome: "rejected",
        actorId: null,
        actorSnapshot: null,
        priorStatus: null,
        resultingStatus: null,
        reasonCode: "FORBIDDEN"
      }).success
    ).toBe(true);
    expect(
      RevisionLifecycleEventV2Schema.safeParse({
        ...lifecycleEvent,
        engineVersion: `1.0.0-${"x".repeat(64)}`
      }).success
    ).toBe(false);
    const response = {
      schemaVersion: "project-revision-response/v2",
      correlationId: "stage8-revision-read",
      revision: {
        summary,
        snapshot: {
          schemaVersion: "project-revision-snapshot/v2",
          project: {
            id: ids.project,
            ownerId: ids.actor,
            ownerDisplayName: actor.displayName,
            status: "draft",
            draftVersion: 5,
            createdAt: now,
            updatedAt: now,
            code: calculationInput.project.code,
            name: "Stage 8 Project",
            description: null,
            defaultLocale: "bg",
            defaultReservePercent: calculationInput.project.defaultReservePercent,
            cableLoad: calculationInput.project.cableLoad,
            routes: [],
            connections: [],
            accessoryProductIds: [],
            manualItems: []
          },
          calculationInput,
          calculationResult
        },
        checksums: {
          projectChecksum: fingerprint,
          inputChecksum: fingerprint,
          snapshotChecksum: fingerprint,
          resultChecksum: fingerprint,
          bomChecksum: fingerprint,
          warningsChecksum: fingerprint,
          revisionChecksum: fingerprint
        },
        lifecycleEvents: [lifecycleEvent]
      }
    } as const;
    expect(ProjectRevisionResponseV2Schema.parse(response)).toEqual(response);
    expect(
      ProjectRevisionListResponseV2Schema.safeParse({
        schemaVersion: "project-revision-list-response/v2",
        correlationId: "stage8-revision-list",
        projectId: ids.project,
        revisions: [summary],
        nextCursor: null
      }).success
    ).toBe(true);
    expect(
      ProjectRevisionResponseV2Schema.safeParse({ ...response, currentCatalogProduct: {} }).success
    ).toBe(false);
  });
});
