import {
  APPROVE_PROJECT_REVISION_REQUEST_V2,
  CHECK_PROJECT_REVISION_REQUEST_V2,
  SAVE_PROJECT_REVISION_REQUEST_V2,
  ApproveProjectRevisionRequestV2Schema,
  CheckProjectRevisionRequestV2Schema,
  ProjectRevisionAuditListResponseV2Schema,
  ProjectRevisionListResponseV2Schema,
  ProjectRevisionResponseV2Schema,
  SaveProjectRevisionRequestV2Schema,
  type ApproveProjectRevisionRequestV2,
  type CheckProjectRevisionRequestV2,
  type ProjectRevisionAuditListResponseV2,
  type ProjectRevisionListResponseV2,
  type ProjectRevisionResponseV2,
  type SaveProjectRevisionRequestV2
} from "@niedax/domain";

import { requestJson } from "./api-client";

type SaveRevisionInput = Omit<SaveProjectRevisionRequestV2, "schemaVersion">;
type CheckRevisionInput = Omit<CheckProjectRevisionRequestV2, "schemaVersion">;
type ApproveRevisionInput = Omit<ApproveProjectRevisionRequestV2, "schemaVersion">;

export function listProjectRevisions(
  projectId: string,
  cursor: string | null = null,
  limit = 100,
  signal?: AbortSignal
): Promise<ProjectRevisionListResponseV2> {
  const parameters = new URLSearchParams({ limit: String(limit) });
  if (cursor) parameters.set("cursor", cursor);
  return requestJson(
    `/api/v1/projects/${encodeURIComponent(projectId)}/revisions?${parameters.toString()}`,
    ProjectRevisionListResponseV2Schema,
    { signal }
  );
}

export function saveProjectRevision(
  projectId: string,
  input: SaveRevisionInput,
  idempotencyKey: string,
  signal?: AbortSignal
): Promise<ProjectRevisionResponseV2> {
  const body = SaveProjectRevisionRequestV2Schema.parse({
    schemaVersion: SAVE_PROJECT_REVISION_REQUEST_V2,
    ...input
  });
  return requestJson(
    `/api/v1/projects/${encodeURIComponent(projectId)}/revisions`,
    ProjectRevisionResponseV2Schema,
    { method: "POST", body, idempotencyKey, signal }
  );
}

export function getProjectRevision(
  revisionId: string,
  signal?: AbortSignal
): Promise<ProjectRevisionResponseV2> {
  return requestJson(
    `/api/v1/revisions/${encodeURIComponent(revisionId)}`,
    ProjectRevisionResponseV2Schema,
    { signal }
  );
}

export function checkProjectRevision(
  revisionId: string,
  input: CheckRevisionInput,
  idempotencyKey: string,
  signal?: AbortSignal
): Promise<ProjectRevisionResponseV2> {
  const body = CheckProjectRevisionRequestV2Schema.parse({
    schemaVersion: CHECK_PROJECT_REVISION_REQUEST_V2,
    ...input
  });
  return requestJson(
    `/api/v1/revisions/${encodeURIComponent(revisionId)}/check`,
    ProjectRevisionResponseV2Schema,
    { method: "POST", body, idempotencyKey, signal }
  );
}

export function approveProjectRevision(
  revisionId: string,
  input: ApproveRevisionInput,
  idempotencyKey: string,
  signal?: AbortSignal
): Promise<ProjectRevisionResponseV2> {
  const body = ApproveProjectRevisionRequestV2Schema.parse({
    schemaVersion: APPROVE_PROJECT_REVISION_REQUEST_V2,
    ...input
  });
  return requestJson(
    `/api/v1/revisions/${encodeURIComponent(revisionId)}/approve`,
    ProjectRevisionResponseV2Schema,
    { method: "POST", body, idempotencyKey, signal }
  );
}

export function listProjectRevisionAudit(
  projectId: string,
  cursor: string | null = null,
  limit = 100,
  signal?: AbortSignal
): Promise<ProjectRevisionAuditListResponseV2> {
  const parameters = new URLSearchParams({ limit: String(limit) });
  if (cursor) parameters.set("cursor", cursor);
  return requestJson(
    `/api/v1/projects/${encodeURIComponent(projectId)}/revision-audit?${parameters.toString()}`,
    ProjectRevisionAuditListResponseV2Schema,
    { signal }
  );
}
