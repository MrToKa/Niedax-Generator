import {
  ADMIN_USER_LIST_RESPONSE_V2,
  ADMIN_USER_RESPONSE_V2,
  AUTHENTICATED_IDENTITY_RESPONSE_V2,
  CREATE_ADMIN_USER_REQUEST_V2,
  PROJECT_ACCESS_RESPONSE_V2,
  UPDATE_ADMIN_USER_ROLE_REQUEST_V2,
  UPDATE_ADMIN_USER_STATUS_REQUEST_V2
} from "@niedax/domain";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createAdminUser,
  getAuthenticatedIdentity,
  getProjectAccess,
  listAdminUsers,
  updateAdminUserRole,
  updateAdminUserStatus
} from "./auth-api";

const userId = "11111111-1111-4111-8111-111111111111";
const projectId = "22222222-2222-4222-8222-222222222222";
const correlationId = "correlation-stage8";
const timestamp = "2026-09-02T08:00:00.000Z";

const adminUser = {
  id: userId,
  username: "stage8.admin",
  displayName: "Stage 8 Admin",
  role: "administrator" as const,
  enabled: true,
  createdAt: timestamp,
  updatedAt: timestamp
};

afterEach(() => vi.unstubAllGlobals());

describe("authentication and administration API adapters", () => {
  it("strictly validates the backend-owned identity and project access", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          schemaVersion: AUTHENTICATED_IDENTITY_RESPONSE_V2,
          correlationId,
          user: {
            id: userId,
            username: "stage8.viewer",
            displayName: "Stage 8 Viewer",
            role: "viewer",
            capabilities: ["project:read", "audit:read"]
          }
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          schemaVersion: PROJECT_ACCESS_RESPONSE_V2,
          correlationId,
          projectId,
          access: {
            canEditDraft: false,
            canValidate: false,
            canCalculate: false,
            canSaveRevision: false,
            canReadHistory: true
          }
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getAuthenticatedIdentity()).resolves.toMatchObject({
      user: { role: "viewer", capabilities: ["project:read", "audit:read"] }
    });
    await expect(getProjectAccess(projectId)).resolves.toMatchObject({
      access: { canEditDraft: false, canReadHistory: true }
    });
    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      "/api/v1/auth/me",
      `/api/v1/projects/${projectId}/access`
    ]);
  });

  it("uses a bounded cursor request and rejects unknown response fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        schemaVersion: ADMIN_USER_LIST_RESPONSE_V2,
        correlationId,
        users: [adminUser],
        nextCursor: null,
        leakedInternalField: "must-not-be-accepted"
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(listAdminUsers(userId, 25)).rejects.toBeDefined();
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `/api/v1/admin/users?limit=25&cursor=${encodeURIComponent(userId)}`
    );
  });

  it("sends strict four-role administration mutation payloads with CSRF evidence", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        jsonResponse({
          schemaVersion: ADMIN_USER_RESPONSE_V2,
          correlationId,
          user: adminUser
        })
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    await createAdminUser({
      username: "  Stage8.Designer  ",
      displayName: "Stage 8 Designer",
      password: "local-test-password",
      role: "designer"
    });
    await updateAdminUserRole(userId, "viewer");
    await updateAdminUserStatus(userId, false);

    expectMutation(fetchMock.mock.calls[0], "/api/v1/admin/users", "POST", {
      schemaVersion: CREATE_ADMIN_USER_REQUEST_V2,
      username: "stage8.designer",
      displayName: "Stage 8 Designer",
      password: "local-test-password",
      role: "designer"
    });
    expectMutation(fetchMock.mock.calls[1], `/api/v1/admin/users/${userId}/role`, "PATCH", {
      schemaVersion: UPDATE_ADMIN_USER_ROLE_REQUEST_V2,
      role: "viewer"
    });
    expectMutation(fetchMock.mock.calls[2], `/api/v1/admin/users/${userId}/status`, "PATCH", {
      schemaVersion: UPDATE_ADMIN_USER_STATUS_REQUEST_V2,
      enabled: false
    });
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

function expectMutation(
  call: readonly unknown[] | undefined,
  path: string,
  method: string,
  body: unknown
) {
  expect(call?.[0]).toBe(path);
  expect(call?.[1]).toMatchObject({
    method,
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      "x-niedax-csrf": "1"
    }
  });
}
