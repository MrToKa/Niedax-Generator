import { PROJECT_LIST_RESPONSE_V3 } from "@niedax/domain";
import { afterEach, describe, expect, it, vi } from "vitest";

import { listProjects, PROJECT_LIST_PAGE_LIMIT } from "./project-api";

const cursor = "11111111-1111-4111-8111-111111111111";

afterEach(() => vi.unstubAllGlobals());

describe("project list API pagination", () => {
  it("requests only the first bounded page by default", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(null));
    vi.stubGlobal("fetch", fetchMock);

    await expect(listProjects()).resolves.toMatchObject({ nextCursor: null, projects: [] });
    expect(PROJECT_LIST_PAGE_LIMIT).toBe(50);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/projects?limit=50");
  });

  it("requests one explicit continuation page with an encoded cursor and abort signal", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(cursor));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();

    await expect(listProjects(cursor, controller.signal)).resolves.toMatchObject({
      nextCursor: cursor,
      projects: []
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `/api/v1/projects?limit=${PROJECT_LIST_PAGE_LIMIT}&cursor=${encodeURIComponent(cursor)}`
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ signal: controller.signal });
  });

  it("rejects the legacy unpaged response contract", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            schemaVersion: "project-list-response/v2",
            correlationId: "project-list-pagination",
            projects: []
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
    );

    await expect(listProjects()).rejects.toBeDefined();
  });
});

function jsonResponse(nextCursor: string | null): Response {
  return new Response(
    JSON.stringify({
      schemaVersion: PROJECT_LIST_RESPONSE_V3,
      correlationId: "project-list-pagination",
      projects: [],
      nextCursor
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}
