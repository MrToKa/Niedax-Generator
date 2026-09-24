import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { catalogSheetNames, type ParsedCatalogBundle } from "@niedax/catalog-import";
import {
  type EditorCatalogResponseV2,
  type ProjectDraftInputV2,
  ProjectDraftInputV2Schema
} from "@niedax/domain";
import { describe, expect, it, vi } from "vitest";

import { AuthService } from "../src/auth-service.js";
import {
  CatalogAdminService,
  type CatalogAdminRepository,
  type CatalogDraftSummary,
  type CatalogVersionSummary
} from "../src/catalog-service.js";
import type { SessionIdentity, UserRecord, UserStore } from "../src/domain.js";
import { stage11DemoCodes, stage11DemoProjects } from "../src/stage11-demo-projects.js";
import { parseStage11Accounts, stage11AccountRoles } from "../src/stage11-seed-contract.js";
import {
  provisionStage11Catalog,
  provisionStage11Demo,
  provisionStage11Users,
  type Stage11DemoDependencies
} from "../src/stage11-seed.js";

describe("persistent TEST seed idempotency", () => {
  it("uses real authentication provisioning and preserves the same four users/password hashes on rerun", async () => {
    const users = new Map<string, UserRecord>();
    const sessions = new Map<string, SessionIdentity>();
    const store = {
      findUserByUsername: async (username: string) => users.get(username) ?? null,
      countAdministrators: async () =>
        [...users.values()].filter((user) => user.role === "administrator").length,
      createUser: vi.fn(async (input: Parameters<UserStore["createUser"]>[0]) => {
        const user = {
          ...input,
          id: randomUUID(),
          enabled: true,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        users.set(user.username, user);
        return user;
      }),
      createSession: async (input: { sessionHash: string; userId: string; expiresAt: Date }) => {
        sessions.set(input.sessionHash, {
          ...input,
          user: [...users.values()].find((user) => user.id === input.userId)!
        });
      },
      findSession: async (hash: string) => sessions.get(hash) ?? null,
      revokeSession: async (hash: string) => {
        sessions.delete(hash);
      }
    } as unknown as UserStore;
    const accounts = parseStage11Accounts(
      Object.fromEntries(
        stage11AccountRoles.map((role) => [
          role,
          { username: `test.${role}`, password: `Fixture-only!A7-${randomUUID()}` }
        ])
      )
    );
    const auth = new AuthService(store, "test-only-session-pepper");
    const first = await provisionStage11Users(store, auth, accounts);
    const hashes = [...users.values()].map((user) => user.passwordHash);
    expect(await provisionStage11Users(store, auth, accounts)).toEqual(first);
    expect(users.size).toBe(4);
    expect(store.createUser).toHaveBeenCalledTimes(4);
    expect([...users.values()].map((user) => user.passwordHash)).toEqual(hashes);
    expect(sessions.size).toBe(0);
    const viewer = users.get("test.viewer")!;
    users.set(viewer.username, { ...viewer, role: "designer" });
    await expect(provisionStage11Users(store, auth, accounts)).rejects.toThrow("differs");
  });

  it("imports, validates and activates the exact canonical candidate once without duplicate catalog/rule drafts", async () => {
    let version: CatalogVersionSummary | null = null;
    let parsed: ParsedCatalogBundle | null = null;
    let draft: CatalogDraftSummary | null = null;
    const repository = {
      getActiveComparison: async () => null,
      listVersions: async () => (version ? [version] : []),
      saveDraft: vi.fn(async (input: Parameters<CatalogAdminRepository["saveDraft"]>[0]) => {
        parsed = input.parsed;
        version = {
          id: randomUUID(),
          version: "2022-p0",
          scope: "p0-kl60-wsl105-anchors",
          label: "TEST",
          status: "draft",
          contentHash: input.pipeline.bundle.contentHash,
          validatedAt: null,
          approvedAt: null,
          activatedAt: null,
          archivedAt: null
        };
        draft = { ...version, importId: randomUUID(), report: input.pipeline.report };
        return draft;
      }),
      loadDraft: async () => parsed,
      saveValidation: vi.fn(async () => {
        version = { ...version!, status: "validated" };
        draft = { ...draft!, status: "validated" };
        return draft;
      }),
      approve: vi.fn(async () => {
        version = { ...version!, status: "approved" };
        return version;
      }),
      activate: vi.fn(async () => {
        version = { ...version!, status: "active" };
        return version;
      })
    } as unknown as CatalogAdminRepository;
    const service = new CatalogAdminService(repository);
    const directory = resolve("catalogue/imports/niedax-p0-2022");
    const files = await Promise.all(
      catalogSheetNames.map(async (sheet) => ({
        name: `${sheet}.csv`,
        contentBase64: (await readFile(resolve(directory, `${sheet}.csv`))).toString("base64")
      }))
    );
    const accepted = JSON.parse(await readFile(resolve(directory, "acceptance.json"), "utf8")) as {
      contentHash: string;
    };
    const actor = randomUUID();
    const first = await provisionStage11Catalog(service, files, actor, accepted.contentHash);
    const second = await provisionStage11Catalog(service, files, actor, accepted.contentHash);
    expect(second.id).toBe(first.id);
    expect(second.pipeline.bundle.products).toHaveLength(308);
    for (const method of [
      repository.saveDraft,
      repository.saveValidation,
      repository.approve,
      repository.activate
    ])
      expect(method).toHaveBeenCalledTimes(1);
    await expect(
      provisionStage11Catalog(service, files, actor, `sha256:${"0".repeat(64)}`)
    ).rejects.toThrow("acceptance identity");
  });

  it("never duplicates projects/revisions or mutates saved tester baselines on repeated seed", async () => {
    const draft = ProjectDraftInputV2Schema.parse({
      code: "S11-DEMO-KL",
      name: "TEST demo v1",
      description: null,
      defaultLocale: "bg",
      defaultReservePercent: "0",
      cableLoad: null,
      routes: [],
      connections: [],
      accessoryProductIds: [],
      manualItems: []
    });
    const project = { id: randomUUID(), draftVersion: 1, ...draft };
    const actor = {
      id: randomUUID(),
      username: "test.designer",
      displayName: "TEST designer",
      role: "designer" as const
    };
    let exists = false;
    let saved = false;
    const summary = {
      id: randomUUID(),
      status: "calculated",
      recordVersion: "revision/v2",
      actions: { check: { allowed: false }, approve: { allowed: false } }
    };
    const dependencies = {
      actors: {
        designer: actor,
        reviewer: { ...actor, role: "reviewer" },
        administrator: { ...actor, role: "administrator" }
      },
      findProject: async () =>
        exists ? { id: project.id, ownerId: actor.id, name: draft.name } : null,
      projects: {
        getProject: vi.fn(async () => ({ project })),
        createProject: vi.fn(async () => {
          exists = true;
          return { body: { project } };
        }),
        calculateProject: vi.fn(async () => ({
          body: {
            calculation: { run: { id: randomUUID(), inputFingerprint: `sha256:${"0".repeat(64)}` } }
          }
        }))
      },
      revisions: {
        listRevisions: vi.fn(async () => ({ revisions: saved ? [summary] : [] })),
        saveRevision: vi.fn(async () => {
          saved = true;
          return { body: { revision: { summary } } };
        }),
        getRevision: vi.fn(async () => ({ revision: { summary } })),
        checkRevision: vi.fn(),
        approveRevision: vi.fn()
      }
    } as unknown as Stage11DemoDependencies;
    expect((await provisionStage11Demo(dependencies, draft)).preserved).toBe(false);
    expect((await provisionStage11Demo(dependencies, draft)).preserved).toBe(true);
    expect(dependencies.projects.createProject).toHaveBeenCalledTimes(1);
    expect(dependencies.projects.calculateProject).toHaveBeenCalledTimes(1);
    expect(dependencies.revisions.saveRevision).toHaveBeenCalledTimes(1);
    expect(dependencies.revisions.approveRevision).not.toHaveBeenCalled();
    await expect(
      provisionStage11Demo(
        {
          ...dependencies,
          findProject: async () => ({ id: project.id, ownerId: randomUUID(), name: draft.name })
        },
        draft
      )
    ).rejects.toThrow("identity collision");
  });
});

describe("deterministic demo inputs", () => {
  it("covers all requested workflows without adding product facts or material quantities", () => {
    // These minimal editor facts are unit-test fixtures, not the persisted catalog seed.
    const kl = randomUUID();
    const wsl = randomUUID();
    const support = randomUUID();
    const anchor = randomUUID();
    const catalog = {
      products: [
        ...[
          ["KL", kl, "KL 60.203", "60"],
          ["WSL", wsl, "WSL 105.200", "105"]
        ].map(([system, id, code, height]) => ({
          id,
          code,
          selectable: true,
          selection: {
            system,
            dimensionId: `dimension:${system}:test`,
            width: { value: "200", unit: "mm" },
            height: { value: height, unit: "mm" },
            materialCode: "steel",
            finishCode: "S"
          },
          supplyOptions: [{ id: `supply:${id}:6000` }]
        })),
        { id: support, code: "KLTB 6 F", selectable: true }
      ],
      assemblyTemplates: ["KL", "WSL"].map((system) => ({
        id: randomUUID(),
        applicableSystems: [system],
        supportType: "wall",
        components: [
          { role: "support", productId: support },
          { role: "anchor", productId: anchor }
        ]
      }))
    } as unknown as EditorCatalogResponseV2;
    const first = stage11DemoProjects(catalog);
    expect(stage11DemoProjects(catalog)).toEqual(first);
    expect(first).toHaveLength(13);
    expect(first.map((draft) => draft.code)).toEqual(
      stage11DemoCodes.map((code) => `S11-DEMO-${code}`)
    );
    for (const draft of first)
      expect(ProjectDraftInputV2Schema.safeParse(draft).success).toBe(true);
    const find = (code: string): ProjectDraftInputV2 =>
      first.find((draft) => draft.code === `S11-DEMO-${code}`)!;
    expect(find("CONTINUATION").connections[0]?.physicalBreak).toBe(false);
    expect(find("TEE").connections[0]?.participants).toHaveLength(3);
    expect(find("BEND").routes[0]?.geometry[1]).toMatchObject({
      fittingType: "horizontalBend",
      selectedProductId: null
    });
    expect(find("ENDS").routes[0]?.startEndpoint.type).toBe("endCap");
    expect(find("CATALOG").manualItems[0]?.kind).toBe("catalog");
    expect(find("TEXT").manualItems[0]?.kind).toBe("freeText");
    expect(new Set(first.flatMap((draft) => draft.routes.map((route) => route.id))).size).toBe(
      first.flatMap((draft) => draft.routes).length
    );
  });
});
