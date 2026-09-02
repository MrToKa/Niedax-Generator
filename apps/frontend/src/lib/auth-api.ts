import {
  ADMIN_USER_LIST_RESPONSE_V2,
  ADMIN_USER_RESPONSE_V2,
  AUTHENTICATED_IDENTITY_RESPONSE_V2,
  CREATE_ADMIN_USER_REQUEST_V2,
  PROJECT_ACCESS_RESPONSE_V2,
  UPDATE_ADMIN_USER_ROLE_REQUEST_V2,
  UPDATE_ADMIN_USER_STATUS_REQUEST_V2,
  AdminUserListResponseV2Schema,
  AdminUserResponseV2Schema,
  AuthenticatedIdentityResponseV2Schema,
  CreateAdminUserRequestV2Schema,
  ProjectAccessResponseV2Schema,
  UpdateAdminUserRoleRequestV2Schema,
  UpdateAdminUserStatusRequestV2Schema,
  type AdminUserListResponseV2,
  type AdminUserResponseV2,
  type AppRole,
  type AuthenticatedIdentityResponseV2,
  type ProjectAccessResponseV2
} from "@niedax/domain";

import { requestJson, requestNoContent } from "./api-client";

export function getAuthenticatedIdentity(
  signal?: AbortSignal
): Promise<AuthenticatedIdentityResponseV2> {
  return requestJson("/api/v1/auth/me", AuthenticatedIdentityResponseV2Schema, { signal });
}

export function login(
  username: string,
  password: string,
  signal?: AbortSignal
): Promise<AuthenticatedIdentityResponseV2> {
  return requestJson("/api/v1/auth/login", AuthenticatedIdentityResponseV2Schema, {
    method: "POST",
    body: { username, password },
    signal
  });
}

export function logout(signal?: AbortSignal): Promise<void> {
  return requestNoContent("/api/v1/auth/logout", { method: "POST", signal });
}

export function listAdminUsers(
  cursor: string | null = null,
  limit = 100,
  signal?: AbortSignal
): Promise<AdminUserListResponseV2> {
  const parameters = new URLSearchParams({ limit: String(limit) });
  if (cursor) parameters.set("cursor", cursor);
  return requestJson(
    `/api/v1/admin/users?${parameters.toString()}`,
    AdminUserListResponseV2Schema,
    { signal }
  );
}

export function createAdminUser(
  input: Readonly<{ username: string; displayName: string; password: string; role: AppRole }>,
  signal?: AbortSignal
): Promise<AdminUserResponseV2> {
  const body = CreateAdminUserRequestV2Schema.parse({
    schemaVersion: CREATE_ADMIN_USER_REQUEST_V2,
    ...input,
    username: input.username.trim().toLowerCase()
  });
  return requestJson("/api/v1/admin/users", AdminUserResponseV2Schema, {
    method: "POST",
    body,
    signal
  });
}

export function updateAdminUserRole(
  userId: string,
  role: AppRole,
  signal?: AbortSignal
): Promise<AdminUserResponseV2> {
  const body = UpdateAdminUserRoleRequestV2Schema.parse({
    schemaVersion: UPDATE_ADMIN_USER_ROLE_REQUEST_V2,
    role
  });
  return requestJson(
    `/api/v1/admin/users/${encodeURIComponent(userId)}/role`,
    AdminUserResponseV2Schema,
    { method: "PATCH", body, signal }
  );
}

export function updateAdminUserStatus(
  userId: string,
  enabled: boolean,
  signal?: AbortSignal
): Promise<AdminUserResponseV2> {
  const body = UpdateAdminUserStatusRequestV2Schema.parse({
    schemaVersion: UPDATE_ADMIN_USER_STATUS_REQUEST_V2,
    enabled
  });
  return requestJson(
    `/api/v1/admin/users/${encodeURIComponent(userId)}/status`,
    AdminUserResponseV2Schema,
    { method: "PATCH", body, signal }
  );
}

export function getProjectAccess(
  projectId: string,
  signal?: AbortSignal
): Promise<ProjectAccessResponseV2> {
  return requestJson(
    `/api/v1/projects/${encodeURIComponent(projectId)}/access`,
    ProjectAccessResponseV2Schema,
    { signal }
  );
}

export const authSchemaVersions = {
  identity: AUTHENTICATED_IDENTITY_RESPONSE_V2,
  userList: ADMIN_USER_LIST_RESPONSE_V2,
  userResponse: ADMIN_USER_RESPONSE_V2,
  projectAccess: PROJECT_ACCESS_RESPONSE_V2
} as const;
