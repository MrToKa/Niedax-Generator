import {
  CALCULATE_PROJECT_DRAFT_REQUEST_V2,
  CREATE_PROJECT_DRAFT_REQUEST_V2,
  REPLACE_PROJECT_DRAFT_REQUEST_V2,
  VALIDATE_PROJECT_DRAFT_REQUEST_V2,
  CalculateProjectDraftRequestV2Schema,
  CalculateProjectDraftResponseV2Schema,
  CreateProjectDraftRequestV2Schema,
  CurrentCalculationResponseV2Schema,
  EditorCatalogResponseV2Schema,
  ProjectDraftResponseV2Schema,
  ProjectListResponseV3Schema,
  ProjectValidationResponseV2Schema,
  ReplaceProjectDraftRequestV2Schema,
  ValidateProjectDraftRequestV2Schema,
  type CalculateProjectDraftResponseV2,
  type CurrentCalculationResponseV2,
  type EditorCatalogResponseV2,
  type ProjectDraftResponseV2,
  type ProjectDraftInputV2,
  type ProjectListResponseV3,
  type ProjectValidationResponseV2
} from "@niedax/domain";

import { requestJson } from "./api-client";

export const PROJECT_LIST_PAGE_LIMIT = 50;

export function listProjects(
  cursor: string | null = null,
  signal?: AbortSignal
): Promise<ProjectListResponseV3> {
  const parameters = new URLSearchParams({ limit: String(PROJECT_LIST_PAGE_LIMIT) });
  if (cursor) parameters.set("cursor", cursor);
  return requestJson(`/api/v1/projects?${parameters.toString()}`, ProjectListResponseV3Schema, {
    signal
  });
}

export function createProject(
  draft: ProjectDraftInputV2,
  idempotencyKey: string,
  signal?: AbortSignal
): Promise<ProjectDraftResponseV2> {
  const body = CreateProjectDraftRequestV2Schema.parse({
    schemaVersion: CREATE_PROJECT_DRAFT_REQUEST_V2,
    draft
  });
  return requestJson("/api/v1/projects", ProjectDraftResponseV2Schema, {
    method: "POST",
    body,
    idempotencyKey,
    signal
  });
}

export function getProject(
  projectId: string,
  signal?: AbortSignal
): Promise<ProjectDraftResponseV2> {
  return requestJson(
    `/api/v1/projects/${encodeURIComponent(projectId)}`,
    ProjectDraftResponseV2Schema,
    {
      signal
    }
  );
}

export function replaceProjectDraft(
  projectId: string,
  expectedDraftVersion: number,
  draft: ProjectDraftInputV2,
  idempotencyKey: string,
  signal?: AbortSignal
): Promise<ProjectDraftResponseV2> {
  const body = ReplaceProjectDraftRequestV2Schema.parse({
    schemaVersion: REPLACE_PROJECT_DRAFT_REQUEST_V2,
    expectedDraftVersion,
    draft
  });
  return requestJson(
    `/api/v1/projects/${encodeURIComponent(projectId)}/draft`,
    ProjectDraftResponseV2Schema,
    { method: "PUT", body, idempotencyKey, signal }
  );
}

export function validateProjectDraft(
  projectId: string,
  expectedDraftVersion: number,
  signal?: AbortSignal
): Promise<ProjectValidationResponseV2> {
  const body = ValidateProjectDraftRequestV2Schema.parse({
    schemaVersion: VALIDATE_PROJECT_DRAFT_REQUEST_V2,
    expectedDraftVersion
  });
  return requestJson(
    `/api/v1/projects/${encodeURIComponent(projectId)}/validation`,
    ProjectValidationResponseV2Schema,
    { method: "POST", body, signal }
  );
}

export function calculateProjectDraft(
  projectId: string,
  expectedDraftVersion: number,
  idempotencyKey: string,
  signal?: AbortSignal
): Promise<CalculateProjectDraftResponseV2> {
  const body = CalculateProjectDraftRequestV2Schema.parse({
    schemaVersion: CALCULATE_PROJECT_DRAFT_REQUEST_V2,
    expectedDraftVersion
  });
  return requestJson(
    `/api/v1/projects/${encodeURIComponent(projectId)}/calculations`,
    CalculateProjectDraftResponseV2Schema,
    { method: "POST", body, idempotencyKey, signal }
  );
}

export function getCurrentCalculation(
  projectId: string,
  signal?: AbortSignal
): Promise<CurrentCalculationResponseV2> {
  return requestJson(
    `/api/v1/projects/${encodeURIComponent(projectId)}/calculation`,
    CurrentCalculationResponseV2Schema,
    { signal }
  );
}

export function getEditorCatalog(signal?: AbortSignal): Promise<EditorCatalogResponseV2> {
  return requestJson("/api/v1/catalog/editor-context", EditorCatalogResponseV2Schema, { signal });
}
