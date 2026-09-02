import { describe, expect, it, vi } from "vitest";

import type {
  ApproveProjectRevisionRequestV2,
  CheckProjectRevisionRequestV2,
  SaveProjectRevisionRequestV2
} from "@niedax/domain";
import type { ProjectApplicationError } from "../src/project-errors.js";
import type {
  RevisionActor,
  StoredRevisionDetail,
  StoredRevisionSummary,
  StoredRevisionV2Summary
} from "../src/revision-repository.js";
import {
  RevisionApplicationService,
  revisionActionsFor,
  type RevisionRepository
} from "../src/revision-service.js";

const ids = {
  project: "10000000-0000-4000-8000-000000000001",
  revision: "10000000-0000-4000-8000-000000000002",
  run: "10000000-0000-4000-8000-000000000003",
  actor: "10000000-0000-4000-8000-000000000004"
} as const;
const fingerprint = `sha256:${"1".repeat(64)}`;
const snapshot = {
  snapshotId: "10000000-0000-4000-8000-000000000005",
  version: "2026.9.0",
  contentHash: `sha256:${"2".repeat(64)}`
} as const;

function actor(role: RevisionActor["role"]): RevisionActor {
  return {
    id: ids.actor,
    username: `stage8.${role}`,
    displayName: `Stage 8 ${role}`,
    role
  };
}

function summary(overrides: Partial<StoredRevisionV2Summary> = {}): StoredRevisionV2Summary {
  return {
    recordVersion: "revision/v2",
    id: ids.revision,
    projectId: ids.project,
    revisionNumber: 1,
    name: "Issued for review",
    comment: null,
    authorId: ids.actor,
    authorSnapshot: actor("designer"),
    createdAt: "2026-09-02T08:00:00.000Z",
    status: "calculated",
    inputFingerprint: fingerprint,
    engineVersion: "2.0.0",
    calculationRunId: ids.run,
    sourceDraftVersion: 3,
    catalogSnapshot: snapshot,
    ruleSnapshot: { ...snapshot, snapshotId: "10000000-0000-4000-8000-000000000006" },
    checkedAt: null,
    approvedAt: null,
    approvalReady: true,
    warningSummary: {
      totalCount: 0,
      blocksApprovalCount: 0,
      reviewRequiredCount: 0
    },
    isLatest: true,
    ...overrides
  };
}

function repository(revisions: readonly StoredRevisionSummary[] = []): RevisionRepository {
  return {
    listRevisions: vi.fn(async () => revisions),
    getRevision: vi.fn(async (): Promise<StoredRevisionDetail> => {
      throw new Error("not used");
    }),
    listAuditEvents: vi.fn(async () => []),
    recordRejectedAttempt: vi.fn(async () => true),
    recordRejectedSaveAttempt: vi.fn(async () => true),
    saveRevision: vi.fn(async () => {
      throw new Error("mutation must not reach the repository");
    }),
    checkRevision: vi.fn(async () => {
      throw new Error("mutation must not reach the repository");
    }),
    approveRevision: vi.fn(async () => {
      throw new Error("mutation must not reach the repository");
    })
  };
}

const saveRequest: SaveProjectRevisionRequestV2 = {
  schemaVersion: "save-project-revision-request/v2",
  expectedDraftVersion: 3,
  expectedLatestRevisionNumber: 0,
  calculationRunId: ids.run,
  inputFingerprint: fingerprint,
  name: "Issued for review",
  comment: null
};
const checkRequest: CheckProjectRevisionRequestV2 = {
  schemaVersion: "check-project-revision-request/v2",
  expectedStatus: "calculated",
  expectedLatestRevisionNumber: 1,
  inputFingerprint: fingerprint,
  comment: null
};
const approveRequest: ApproveProjectRevisionRequestV2 = {
  schemaVersion: "approve-project-revision-request/v2",
  expectedStatus: "checked",
  expectedLatestRevisionNumber: 1,
  inputFingerprint: fingerprint,
  comment: null
};

describe("Stage 8 revision application authorization", () => {
  it.each(["designer", "viewer"] as const)(
    "rejects %s check and approval with bounded audit but no business mutation",
    async (role) => {
      const repo = repository();
      const service = new RevisionApplicationService(repo);
      for (const operation of [
        () =>
          service.checkRevision(
            actor(role),
            ids.revision,
            checkRequest,
            "check-key-0001",
            "corr-check"
          ),
        () =>
          service.approveRevision(
            actor(role),
            ids.revision,
            approveRequest,
            "approve-key-0001",
            "corr-approve"
          )
      ]) {
        await expect(operation()).rejects.toMatchObject<ProjectApplicationError>({
          statusCode: 403,
          code: "FORBIDDEN"
        });
      }
      expect(repo.checkRevision).not.toHaveBeenCalled();
      expect(repo.approveRevision).not.toHaveBeenCalled();
      expect(repo.recordRejectedAttempt).toHaveBeenCalledTimes(2);
      expect(repo.recordRejectedAttempt).toHaveBeenCalledWith(
        expect.objectContaining({
          actor: expect.objectContaining({ role }),
          revisionId: ids.revision,
          reasonCode: "FORBIDDEN"
        })
      );
    }
  );

  it("rejects every Viewer revision mutation without a repository side effect", async () => {
    const repo = repository();
    const service = new RevisionApplicationService(repo);
    await expect(
      service.saveRevision(actor("viewer"), ids.project, saveRequest, "save-key-0001", "corr-save")
    ).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
    expect(repo.saveRevision).not.toHaveBeenCalled();
    expect(repo.recordRejectedSaveAttempt).toHaveBeenCalledOnce();
    expect(repo.recordRejectedSaveAttempt).toHaveBeenCalledWith({
      actor: expect.objectContaining({ role: "viewer" }),
      projectId: ids.project,
      correlationId: "corr-save"
    });
  });

  it.each(["reviewer", "administrator"] as const)(
    "allows %s check and approval actions only in their valid lifecycle states",
    (role) => {
      expect(revisionActionsFor(actor(role), summary()).check).toEqual({
        allowed: true,
        reason: null
      });
      expect(
        revisionActionsFor(
          actor(role),
          summary({ status: "checked", checkedAt: "2026-09-02T08:01:00.000Z" })
        ).approve
      ).toEqual({ allowed: true, reason: null });
    }
  );

  it("explains superseded, unready, and warning-blocked actions", () => {
    expect(revisionActionsFor(actor("reviewer"), summary({ isLatest: false })).check.reason).toBe(
      "notLatestRevision"
    );
    expect(
      revisionActionsFor(
        actor("reviewer"),
        summary({ status: "checked", checkedAt: "2026-09-02T08:01:00.000Z", approvalReady: false })
      ).approve.reason
    ).toBe("approvalNotReady");
    expect(
      revisionActionsFor(
        actor("reviewer"),
        summary({
          status: "checked",
          checkedAt: "2026-09-02T08:01:00.000Z",
          warningSummary: {
            totalCount: 1,
            blocksApprovalCount: 1,
            reviewRequiredCount: 0
          }
        })
      ).approve.reason
    ).toBe("blockingWarnings");
  });

  it("returns strict role-aware summaries without snapshot payloads", async () => {
    const repo = repository([summary()]);
    const service = new RevisionApplicationService(repo);
    const response = await service.listRevisions(actor("designer"), ids.project, "revision-list");
    expect(response.schemaVersion).toBe("project-revision-list-response/v2");
    expect(response.revisions).toHaveLength(1);
    expect(response.revisions[0]?.actions.check).toEqual({
      allowed: false,
      reason: "notAuthorized"
    });
    expect(response.revisions[0]).not.toHaveProperty("snapshot");
  });

  it.each([0, -1, 101, 1.5])(
    "rejects an out-of-range direct-call history limit %s before repository access",
    async (limit) => {
      const repo = repository();
      const service = new RevisionApplicationService(repo);
      await expect(
        service.listRevisions(actor("designer"), ids.project, "revision-list", limit)
      ).rejects.toMatchObject({ statusCode: 422, code: "VALIDATION_FAILED" });
      expect(repo.listRevisions).not.toHaveBeenCalled();
    }
  );

  it("rejects malformed direct-call audit cursors before repository access", async () => {
    const repo = repository();
    const service = new RevisionApplicationService(repo);
    await expect(
      service.listAuditEvents(actor("viewer"), ids.project, "revision-audit", 25, "not-a-uuid")
    ).rejects.toMatchObject({ statusCode: 422, code: "VALIDATION_FAILED" });
    expect(repo.listAuditEvents).not.toHaveBeenCalled();
  });
});
