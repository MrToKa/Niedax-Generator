import { createHash } from "node:crypto";

import {
  DatabaseIdV2Schema,
  ProjectRevisionAuditListResponseV2Schema,
  ProjectRevisionListResponseV2Schema,
  ProjectRevisionResponseV2Schema,
  ProjectRevisionSummaryV2Schema,
  type AppCapability,
  type ApproveProjectRevisionRequestV2,
  type CheckProjectRevisionRequestV2,
  type ProjectRevisionActionsV2,
  type ProjectRevisionAuditListResponseV2,
  type ProjectRevisionListResponseV2,
  type ProjectRevisionResponseV2,
  type RevisionLifecycleEventV2,
  type SaveProjectRevisionRequestV2
} from "@niedax/domain";

import { hasCapability } from "./authorization-policy.js";
import { ProjectApplicationError } from "./project-errors.js";
import {
  withRevisionActions,
  type RevisionActor,
  type RevisionMutationResult,
  type StoredRevisionDetail,
  type StoredRevisionSummary,
  type StoredRevisionV2Detail,
  type StoredRevisionV2Summary
} from "./revision-repository.js";

export interface RevisionRepository {
  listRevisions(
    projectId: string,
    actor: RevisionActor,
    limit: number,
    cursor: string | null
  ): Promise<readonly StoredRevisionSummary[]>;
  getRevision(revisionId: string, actor: RevisionActor): Promise<StoredRevisionDetail>;
  listAuditEvents(
    projectId: string,
    actor: RevisionActor,
    limit: number,
    cursor: string | null
  ): Promise<readonly RevisionLifecycleEventV2[]>;
  recordRejectedAttempt(input: {
    readonly actor: RevisionActor;
    readonly revisionId: string;
    readonly requestedAction: "revision.checked" | "revision.approved";
    readonly reasonCode: "FORBIDDEN" | "CONFLICT_STALE_VERSION" | "INVALID_STATE_TRANSITION";
    readonly correlationId: string;
    readonly attemptHash: string;
    readonly requestHash: string;
  }): Promise<boolean>;
  recordRejectedSaveAttempt(input: {
    readonly actor: RevisionActor;
    readonly projectId: string;
    readonly correlationId: string;
  }): Promise<boolean>;
  saveRevision(input: {
    readonly actor: RevisionActor;
    readonly projectId: string;
    readonly request: SaveProjectRevisionRequestV2;
    readonly idempotencyKey: string;
    readonly correlationId: string;
    readonly requestHash: string;
    readonly responseFactory: (detail: StoredRevisionV2Detail) => ProjectRevisionResponseV2;
  }): Promise<RevisionMutationResult>;
  checkRevision(input: {
    readonly actor: RevisionActor;
    readonly revisionId: string;
    readonly request: CheckProjectRevisionRequestV2;
    readonly idempotencyKey: string;
    readonly correlationId: string;
    readonly requestHash: string;
    readonly attemptHash: string;
    readonly responseFactory: (detail: StoredRevisionV2Detail) => ProjectRevisionResponseV2;
  }): Promise<RevisionMutationResult>;
  approveRevision(input: {
    readonly actor: RevisionActor;
    readonly revisionId: string;
    readonly request: ApproveProjectRevisionRequestV2;
    readonly idempotencyKey: string;
    readonly correlationId: string;
    readonly requestHash: string;
    readonly attemptHash: string;
    readonly responseFactory: (detail: StoredRevisionV2Detail) => ProjectRevisionResponseV2;
  }): Promise<RevisionMutationResult>;
}

export interface RevisionServiceReply {
  readonly statusCode: number;
  readonly body: ProjectRevisionResponseV2;
  readonly replayed: boolean;
}

export interface RevisionOperations {
  listRevisions(
    actor: RevisionActor,
    projectId: string,
    correlationId: string,
    limit?: number,
    cursor?: string | null
  ): Promise<ProjectRevisionListResponseV2>;
  getRevision(
    actor: RevisionActor,
    revisionId: string,
    correlationId: string
  ): Promise<ProjectRevisionResponseV2>;
  listAuditEvents(
    actor: RevisionActor,
    projectId: string,
    correlationId: string,
    limit?: number,
    cursor?: string | null
  ): Promise<ProjectRevisionAuditListResponseV2>;
  saveRevision(
    actor: RevisionActor,
    projectId: string,
    request: SaveProjectRevisionRequestV2,
    idempotencyKey: string,
    correlationId: string
  ): Promise<RevisionServiceReply>;
  checkRevision(
    actor: RevisionActor,
    revisionId: string,
    request: CheckProjectRevisionRequestV2,
    idempotencyKey: string,
    correlationId: string
  ): Promise<RevisionServiceReply>;
  approveRevision(
    actor: RevisionActor,
    revisionId: string,
    request: ApproveProjectRevisionRequestV2,
    idempotencyKey: string,
    correlationId: string
  ): Promise<RevisionServiceReply>;
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const object = value as Readonly<Record<string, unknown>>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`)
    .join(",")}}`;
}

function requestHash(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonical(value), "utf8").digest("hex")}`;
}

function requireCapability(actor: RevisionActor, capability: AppCapability): void {
  if (!hasCapability(actor.role, capability)) {
    throw new ProjectApplicationError(403, "FORBIDDEN", "The requested action is not permitted");
  }
}

function requireBoundedPage(limit: number, cursor: string | null): void {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new ProjectApplicationError(
      422,
      "VALIDATION_FAILED",
      "Revision pagination limit must be an integer from 1 through 100"
    );
  }
  if (cursor !== null && !DatabaseIdV2Schema.safeParse(cursor).success) {
    throw new ProjectApplicationError(
      422,
      "VALIDATION_FAILED",
      "Revision pagination cursor must be a UUID"
    );
  }
}

function unavailable(
  reason: NonNullable<ProjectRevisionActionsV2["check"]["reason"]>
): ProjectRevisionActionsV2["check"] {
  return { allowed: false, reason };
}

export function revisionActionsFor(
  actor: RevisionActor,
  revision: StoredRevisionV2Summary
): ProjectRevisionActionsV2 {
  const check = !hasCapability(actor.role, "revision:check")
    ? unavailable("notAuthorized")
    : !revision.isLatest
      ? unavailable("notLatestRevision")
      : revision.status !== "calculated"
        ? unavailable("invalidStatus")
        : { allowed: true, reason: null };
  const approve = !hasCapability(actor.role, "revision:approve")
    ? unavailable("notAuthorized")
    : !revision.isLatest
      ? unavailable("notLatestRevision")
      : revision.status !== "checked"
        ? unavailable("invalidStatus")
        : !revision.approvalReady
          ? unavailable("approvalNotReady")
          : revision.warningSummary.blocksApprovalCount > 0
            ? unavailable("blockingWarnings")
            : { allowed: true, reason: null };
  return { check, approve };
}

function response(
  detail: StoredRevisionDetail,
  actor: RevisionActor,
  correlationId: string
): ProjectRevisionResponseV2 {
  const revision =
    "recordVersion" in detail
      ? detail
      : withRevisionActions(detail, revisionActionsFor(actor, detail.summary));
  return ProjectRevisionResponseV2Schema.parse({
    schemaVersion: "project-revision-response/v2",
    correlationId,
    revision
  });
}

export class RevisionApplicationService implements RevisionOperations {
  public constructor(private readonly repository: RevisionRepository) {}

  public async listRevisions(
    actor: RevisionActor,
    projectId: string,
    correlationId: string,
    limit = 100,
    cursor: string | null = null
  ): Promise<ProjectRevisionListResponseV2> {
    requireCapability(actor, "project:read");
    requireBoundedPage(limit, cursor);
    const records = await this.repository.listRevisions(projectId, actor, limit + 1, cursor);
    const hasNextPage = records.length > limit;
    const revisions = records.slice(0, limit).map((revision) =>
      revision.recordVersion === "revision/v1"
        ? revision
        : ProjectRevisionSummaryV2Schema.parse({
            ...revision,
            actions: revisionActionsFor(actor, revision)
          })
    );
    return ProjectRevisionListResponseV2Schema.parse({
      schemaVersion: "project-revision-list-response/v2",
      correlationId,
      projectId,
      revisions,
      nextCursor: hasNextPage ? (revisions.at(-1)?.id ?? null) : null
    });
  }

  public async getRevision(
    actor: RevisionActor,
    revisionId: string,
    correlationId: string
  ): Promise<ProjectRevisionResponseV2> {
    requireCapability(actor, "project:read");
    return response(await this.repository.getRevision(revisionId, actor), actor, correlationId);
  }

  public async listAuditEvents(
    actor: RevisionActor,
    projectId: string,
    correlationId: string,
    limit = 100,
    cursor: string | null = null
  ): Promise<ProjectRevisionAuditListResponseV2> {
    requireCapability(actor, "audit:read");
    requireBoundedPage(limit, cursor);
    const records = await this.repository.listAuditEvents(projectId, actor, limit + 1, cursor);
    const events = records.slice(0, limit);
    return ProjectRevisionAuditListResponseV2Schema.parse({
      schemaVersion: "project-revision-audit-list-response/v2",
      correlationId,
      projectId,
      events,
      nextCursor: records.length > limit ? (events.at(-1)?.id ?? null) : null
    });
  }

  public async saveRevision(
    actor: RevisionActor,
    projectId: string,
    request: SaveProjectRevisionRequestV2,
    idempotencyKey: string,
    correlationId: string
  ): Promise<RevisionServiceReply> {
    if (!hasCapability(actor.role, "revision:save")) {
      await this.repository.recordRejectedSaveAttempt({ actor, projectId, correlationId });
      throw new ProjectApplicationError(403, "FORBIDDEN", "The requested action is not permitted");
    }
    const result = await this.repository.saveRevision({
      actor,
      projectId,
      request,
      idempotencyKey,
      correlationId,
      requestHash: requestHash({ operation: "revision.save", projectId, request }),
      responseFactory: (detail) => response(detail, actor, correlationId)
    });
    return { statusCode: result.statusCode, body: result.response, replayed: result.replayed };
  }

  public async checkRevision(
    actor: RevisionActor,
    revisionId: string,
    request: CheckProjectRevisionRequestV2,
    idempotencyKey: string,
    correlationId: string
  ): Promise<RevisionServiceReply> {
    const operationRequestHash = requestHash({ operation: "revision.check", revisionId, request });
    const operationAttemptHash = requestHash({
      operation: "revision.check",
      revisionId,
      actorId: actor.id,
      idempotencyKey
    });
    await this.requireTransitionCapability(
      actor,
      revisionId,
      "revision.checked",
      "revision:check",
      correlationId,
      operationAttemptHash,
      operationRequestHash
    );
    try {
      const result = await this.repository.checkRevision({
        actor,
        revisionId,
        request,
        idempotencyKey,
        correlationId,
        requestHash: operationRequestHash,
        attemptHash: operationAttemptHash,
        responseFactory: (detail) => response(detail, actor, correlationId)
      });
      return { statusCode: result.statusCode, body: result.response, replayed: result.replayed };
    } catch (error) {
      await this.recordTransitionRejection(
        actor,
        revisionId,
        "revision.checked",
        correlationId,
        error,
        operationAttemptHash,
        operationRequestHash
      );
      throw error;
    }
  }

  public async approveRevision(
    actor: RevisionActor,
    revisionId: string,
    request: ApproveProjectRevisionRequestV2,
    idempotencyKey: string,
    correlationId: string
  ): Promise<RevisionServiceReply> {
    const operationRequestHash = requestHash({
      operation: "revision.approve",
      revisionId,
      request
    });
    const operationAttemptHash = requestHash({
      operation: "revision.approve",
      revisionId,
      actorId: actor.id,
      idempotencyKey
    });
    await this.requireTransitionCapability(
      actor,
      revisionId,
      "revision.approved",
      "revision:approve",
      correlationId,
      operationAttemptHash,
      operationRequestHash
    );
    try {
      const result = await this.repository.approveRevision({
        actor,
        revisionId,
        request,
        idempotencyKey,
        correlationId,
        requestHash: operationRequestHash,
        attemptHash: operationAttemptHash,
        responseFactory: (detail) => response(detail, actor, correlationId)
      });
      return { statusCode: result.statusCode, body: result.response, replayed: result.replayed };
    } catch (error) {
      await this.recordTransitionRejection(
        actor,
        revisionId,
        "revision.approved",
        correlationId,
        error,
        operationAttemptHash,
        operationRequestHash
      );
      throw error;
    }
  }

  private async requireTransitionCapability(
    actor: RevisionActor,
    revisionId: string,
    requestedAction: "revision.checked" | "revision.approved",
    capability: "revision:check" | "revision:approve",
    correlationId: string,
    attemptHash: string,
    operationRequestHash: string
  ): Promise<void> {
    if (hasCapability(actor.role, capability)) return;
    await this.repository.recordRejectedAttempt({
      actor,
      revisionId,
      requestedAction,
      reasonCode: "FORBIDDEN",
      correlationId,
      attemptHash,
      requestHash: operationRequestHash
    });
    throw new ProjectApplicationError(403, "FORBIDDEN", "The requested action is not permitted");
  }

  private async recordTransitionRejection(
    actor: RevisionActor,
    revisionId: string,
    requestedAction: "revision.checked" | "revision.approved",
    correlationId: string,
    error: unknown,
    attemptHash: string,
    operationRequestHash: string
  ): Promise<void> {
    if (
      !(error instanceof ProjectApplicationError) ||
      !["CONFLICT_STALE_VERSION", "INVALID_STATE_TRANSITION"].includes(error.code)
    ) {
      return;
    }
    await this.repository.recordRejectedAttempt({
      actor,
      revisionId,
      requestedAction,
      reasonCode: error.code as "CONFLICT_STALE_VERSION" | "INVALID_STATE_TRANSITION",
      correlationId,
      attemptHash,
      requestHash: operationRequestHash
    });
  }
}
