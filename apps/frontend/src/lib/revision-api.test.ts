import {
  APPROVE_PROJECT_REVISION_REQUEST_V2,
  CHECK_PROJECT_REVISION_REQUEST_V2,
  PROJECT_REVISION_AUDIT_LIST_RESPONSE_V2,
  PROJECT_REVISION_LIST_RESPONSE_V2,
  SAVE_PROJECT_REVISION_REQUEST_V2
} from "@niedax/domain";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  approveProjectRevision,
  checkProjectRevision,
  listProjectRevisionAudit,
  listProjectRevisions,
  saveProjectRevision
} from "./revision-api";

const projectId = "11111111-1111-4111-8111-111111111111";
const revisionId = "22222222-2222-4222-8222-222222222222";
const calculationRunId = "33333333-3333-4333-8333-333333333333";
const fingerprint = `sha256:${"a".repeat(64)}`;
const correlationId = "correlation-stage8";
const idempotencyKey = "revision-request-key";

afterEach(() => vi.unstubAllGlobals());

describe("revision API adapters", () => {
  it("loads bounded revision and non-sensitive audit history through project routes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          schemaVersion: PROJECT_REVISION_LIST_RESPONSE_V2,
          correlationId,
          projectId,
          revisions: [],
          nextCursor: null
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          schemaVersion: PROJECT_REVISION_AUDIT_LIST_RESPONSE_V2,
          correlationId,
          projectId,
          events: [],
          nextCursor: null
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(listProjectRevisions(projectId, revisionId, 25)).resolves.toMatchObject({
      revisions: []
    });
    await expect(listProjectRevisionAudit(projectId)).resolves.toMatchObject({ events: [] });
    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      `/api/v1/projects/${projectId}/revisions?limit=25&cursor=${revisionId}`,
      `/api/v1/projects/${projectId}/revision-audit?limit=100`
    ]);
  });

  it("sends exact save/check/approve command versions and idempotency evidence", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({})));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      saveProjectRevision(
        projectId,
        {
          expectedDraftVersion: 7,
          expectedLatestRevisionNumber: 2,
          calculationRunId,
          inputFingerprint: fingerprint,
          name: "Issued for review",
          comment: "Exact calculated snapshot"
        },
        idempotencyKey
      )
    ).rejects.toBeDefined();
    await expect(
      checkProjectRevision(
        revisionId,
        {
          expectedStatus: "calculated",
          expectedLatestRevisionNumber: 3,
          inputFingerprint: fingerprint,
          comment: null
        },
        idempotencyKey
      )
    ).rejects.toBeDefined();
    await expect(
      approveProjectRevision(
        revisionId,
        {
          expectedStatus: "checked",
          expectedLatestRevisionNumber: 3,
          inputFingerprint: fingerprint,
          comment: "Approved exact snapshot"
        },
        idempotencyKey
      )
    ).rejects.toBeDefined();

    expectMutation(fetchMock.mock.calls[0], `/api/v1/projects/${projectId}/revisions`, {
      schemaVersion: SAVE_PROJECT_REVISION_REQUEST_V2,
      expectedDraftVersion: 7,
      expectedLatestRevisionNumber: 2,
      calculationRunId,
      inputFingerprint: fingerprint,
      name: "Issued for review",
      comment: "Exact calculated snapshot"
    });
    expectMutation(fetchMock.mock.calls[1], `/api/v1/revisions/${revisionId}/check`, {
      schemaVersion: CHECK_PROJECT_REVISION_REQUEST_V2,
      expectedStatus: "calculated",
      expectedLatestRevisionNumber: 3,
      inputFingerprint: fingerprint,
      comment: null
    });
    expectMutation(fetchMock.mock.calls[2], `/api/v1/revisions/${revisionId}/approve`, {
      schemaVersion: APPROVE_PROJECT_REVISION_REQUEST_V2,
      expectedStatus: "checked",
      expectedLatestRevisionNumber: 3,
      inputFingerprint: fingerprint,
      comment: "Approved exact snapshot"
    });
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

function expectMutation(call: readonly unknown[] | undefined, path: string, body: unknown) {
  expect(call?.[0]).toBe(path);
  expect(call?.[1]).toMatchObject({
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      "x-niedax-csrf": "1",
      "idempotency-key": idempotencyKey
    }
  });
}
