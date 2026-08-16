import { beforeAll, describe, expect, it, vi } from "vitest";

import { buildApp } from "../src/app.js";
import { hashPassword } from "../src/auth-service.js";
import {
  CatalogAdminService,
  type CatalogAdminRepository,
  type CatalogVersionSummary
} from "../src/catalog-service.js";
import type { SessionIdentity, UserRecord, UserStore } from "../src/domain.js";

const pepper = "catalog-admin-test-pepper";
const password = "Catalog-Test-42!";
const versionId = "10000000-0000-4000-8000-000000000001";
const hash = `sha256:${"a".repeat(64)}`;

let passwordHash: string;

beforeAll(async () => {
  passwordHash = await hashPassword(password);
});

function createStore(): UserStore {
  const users: UserRecord[] = [
    {
      id: "10000000-0000-4000-8000-000000000101",
      username: "catalog.admin",
      displayName: "Catalog Admin",
      role: "administrator",
      enabled: true,
      passwordHash
    },
    {
      id: "10000000-0000-4000-8000-000000000102",
      username: "catalog.reviewer",
      displayName: "Catalog Reviewer",
      role: "reviewer",
      enabled: true,
      passwordHash
    }
  ];
  const sessions = new Map<string, SessionIdentity>();
  return {
    ping: async () => undefined,
    countAdministrators: async () => 1,
    findUserByUsername: async (username) =>
      users.find((user) => user.username === username) ?? null,
    findSession: async (sessionHash) => sessions.get(sessionHash) ?? null,
    createSession: async ({ sessionHash, userId, expiresAt }) => {
      const user = users.find((item) => item.id === userId);
      if (!user) throw new Error("Unknown test user");
      sessions.set(sessionHash, { sessionHash, user, expiresAt });
    },
    revokeSession: async (sessionHash) => {
      sessions.delete(sessionHash);
    },
    createUser: async () => {
      throw new Error("not used");
    },
    setUserEnabled: async () => null,
    setUserRole: async () => null
  };
}

function version(status: CatalogVersionSummary["status"]): CatalogVersionSummary {
  return {
    id: versionId,
    version: "niedax-p0-2022",
    label: "Niedax P0",
    scope: "p0-kl60-wsl105-anchors",
    status,
    contentHash: hash,
    validatedAt: "2026-08-16T00:00:00.000Z",
    approvedAt: status === "approved" || status === "active" ? "2026-08-16T00:01:00.000Z" : null,
    activatedAt: status === "active" ? "2026-08-16T00:02:00.000Z" : null,
    archivedAt: null
  };
}

function repository(): CatalogAdminRepository {
  return {
    getActiveComparison: async () => null,
    saveDraft: async () => {
      throw new Error("not used");
    },
    loadDraft: async () => null,
    saveValidation: async () => {
      throw new Error("not used");
    },
    approve: vi.fn(async () => version("approved")),
    activate: vi.fn(async () => version("active")),
    archive: vi.fn(async () => version("archived")),
    listVersions: async () => [version("active")],
    findSelectableProducts: async (filter) =>
      filter.system === "KL" &&
      filter.heightMm === 60 &&
      filter.widthMm === 200 &&
      filter.finishCode === "S"
        ? [
            {
              id: versionId,
              code: "KL 60.203",
              descriptionEn: "Cable ladder",
              category: "straightSection",
              family: "KL",
              engineeringVerificationRequired: false,
              engineeringNote: null
            }
          ]
        : [],
    listSelectionOptions: async () => [
      {
        id: versionId,
        code: "KL 60.203",
        descriptionEn: "Cable ladder",
        category: "straightSection",
        family: "KL",
        engineeringVerificationRequired: false,
        engineeringNote: null,
        system: "KL",
        heightMm: 60,
        widthMm: 200,
        materialCode: "steel",
        finishCode: "S"
      }
    ],
    exportLatestReport: async () => null
  };
}

async function login(app: Awaited<ReturnType<typeof buildApp>>, username: string): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    headers: { host: "localhost:8080", origin: "http://localhost:8080", "x-niedax-csrf": "1" },
    payload: { username, password }
  });
  expect(response.statusCode).toBe(200);
  const cookie = response.headers["set-cookie"];
  if (typeof cookie !== "string") throw new Error("Login cookie missing");
  return cookie.split(";", 1)[0] ?? "";
}

const mutationHeaders = (cookie: string) => ({
  host: "localhost:8080",
  origin: "http://localhost:8080",
  "x-niedax-csrf": "1",
  cookie
});

describe("catalog administration authorization", () => {
  it("denies approve and activate to an authenticated reviewer before the service is called", async () => {
    const repo = repository();
    const app = await buildApp({
      store: createStore(),
      sessionPepper: pepper,
      catalogService: new CatalogAdminService(repo)
    });
    const cookie = await login(app, "catalog.reviewer");
    for (const action of ["approve", "activate"]) {
      const response = await app.inject({
        method: "POST",
        url: `/api/v1/admin/catalog-versions/${versionId}/${action}`,
        headers: mutationHeaders(cookie),
        payload: { contentHash: hash, reason: "Attempted reviewer transition" }
      });
      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ error: { code: "ADMINISTRATOR_REQUIRED" } });
      expect(response.headers["x-correlation-id"]).toBeTruthy();
    }
    expect(repo.approve).not.toHaveBeenCalled();
    expect(repo.activate).not.toHaveBeenCalled();
    await app.close();
  });

  it("allows an administrator to approve the exact hash with an audit reason", async () => {
    const repo = repository();
    const app = await buildApp({
      store: createStore(),
      sessionPepper: pepper,
      catalogService: new CatalogAdminService(repo)
    });
    const cookie = await login(app, "catalog.admin");
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/admin/catalog-versions/${versionId}/approve`,
      headers: { ...mutationHeaders(cookie), "x-correlation-id": "catalog-approval-test" },
      payload: { contentHash: hash, reason: "Verified official source evidence" }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ catalog: { status: "approved", contentHash: hash } });
    expect(repo.approve).toHaveBeenCalledWith(
      expect.objectContaining({
        catalogVersionId: versionId,
        contentHash: hash,
        reason: "Verified official source evidence",
        correlationId: "catalog-approval-test"
      })
    );
    await app.close();
  });
});

describe("catalog product allow-list API", () => {
  it("returns no products for an unsupported combination and requires authentication", async () => {
    const repo = repository();
    const app = await buildApp({
      store: createStore(),
      sessionPepper: pepper,
      catalogService: new CatalogAdminService(repo)
    });
    const query =
      "/api/v1/catalog/products?system=WSL&height_mm=105&width_mm=200&material_code=stainless-steel-1.4571&finish_code=E5";
    expect((await app.inject({ method: "GET", url: query })).statusCode).toBe(401);
    const cookie = await login(app, "catalog.reviewer");
    const response = await app.inject({ method: "GET", url: query, headers: { cookie } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ products: [] });
    await app.close();
  });

  it("lists only authenticated active-catalog selection options", async () => {
    const repo = repository();
    const app = await buildApp({
      store: createStore(),
      sessionPepper: pepper,
      catalogService: new CatalogAdminService(repo)
    });
    expect((await app.inject({ method: "GET", url: "/api/v1/catalog/options" })).statusCode).toBe(
      401
    );
    const cookie = await login(app, "catalog.reviewer");
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/catalog/options",
      headers: { cookie }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      options: [{ code: "KL 60.203", system: "KL", heightMm: 60, widthMm: 200 }]
    });
    await app.close();
  });
});
