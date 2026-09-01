import { describe, expect, it, vi } from "vitest";

import type { Pool, PoolClient } from "pg";

import { ProjectApplicationError } from "../src/project-errors.js";
import { PgProjectRepository, type ProjectActor } from "../src/project-repository.js";

const ids = {
  project: "20000000-0000-4000-8000-000000000001",
  owner: "20000000-0000-4000-8000-000000000002",
  actor: "20000000-0000-4000-8000-000000000003",
  catalog: "20000000-0000-4000-8000-000000000004",
  rules: "20000000-0000-4000-8000-000000000005",
  run: "20000000-0000-4000-8000-000000000006",
  activeCatalog: "20000000-0000-4000-8000-000000000007",
  activeRules: "20000000-0000-4000-8000-000000000008"
} as const;
const requestHash = `sha256:${"1".repeat(64)}`;

const reviewer: ProjectActor = {
  id: ids.actor,
  role: "reviewer",
  displayName: "Current reviewer"
};
const owner: ProjectActor = {
  id: ids.owner,
  role: "reviewer",
  displayName: "Project owner"
};

const emptyDraft = {
  code: "P-REPOSITORY",
  name: "Repository project",
  description: null,
  defaultLocale: "bg" as const,
  defaultReservePercent: "0",
  cableLoad: null,
  routes: [],
  connections: [],
  accessoryProductIds: [],
  manualItems: []
};

function projectRow(payload: unknown, draftVersion = 1) {
  return {
    id: ids.project,
    code: emptyDraft.code,
    name: emptyDraft.name,
    description: null,
    status: "draft",
    default_locale: "bg",
    default_spare_percent: "0.0000",
    cable_load_kg_per_m: null,
    draft_version: draftVersion,
    owner_id: ids.owner,
    owner_display_name: "Project owner",
    active_catalog_version_id: ids.catalog,
    catalog_version: "2022-p0",
    catalog_content_hash: requestHash,
    active_rule_set_id: ids.rules,
    rule_set_version: "2022-p0",
    rule_set_content_hash: requestHash,
    created_at: new Date("2026-09-01T08:00:00.000Z"),
    updated_at: new Date("2026-09-01T08:00:00.000Z"),
    payload
  };
}

function queryText(query: unknown): string {
  return typeof query === "string"
    ? query
    : String((query as { readonly text?: unknown }).text ?? "");
}

function transactionalPool(
  handler: (sql: string, values: readonly unknown[] | undefined) => Promise<unknown>
): {
  readonly pool: Pool;
  readonly query: ReturnType<typeof vi.fn>;
  readonly release: ReturnType<typeof vi.fn>;
} {
  const query = vi.fn(async (text: unknown, values?: readonly unknown[]) =>
    handler(queryText(text), values)
  );
  const release = vi.fn();
  const client = { query, release } as unknown as PoolClient;
  const pool = {
    connect: vi.fn(async () => client),
    query: vi.fn(async () => {
      throw new Error("unexpected non-transactional query");
    })
  } as unknown as Pool;
  return { pool, query, release };
}

function errorCode(error: unknown): string | null {
  return error instanceof ProjectApplicationError ? error.code : null;
}

describe("Stage 7 PostgreSQL project repository boundaries", () => {
  it("authorizes current ownership before early calculation replay", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ owner_id: ids.owner }] })
      .mockResolvedValueOnce({
        rows: [
          {
            request_hash: requestHash,
            response_status: 200,
            response_payload: { schemaVersion: "calculate-project-draft-response/v2" }
          }
        ]
      });
    const repository = new PgProjectRepository({ query } as unknown as Pool);
    let caught: unknown;
    try {
      await repository.findCalculationReplay({
        projectId: ids.project,
        actor: reviewer,
        idempotencyKey: "calculation-replay-0001",
        requestHash
      });
    } catch (error) {
      caught = error;
    }
    expect(errorCode(caught)).toBe("FORBIDDEN");
    expect(query).toHaveBeenCalledOnce();
  });

  it("returns an owner's exact calculation replay without reading mutable project state", async () => {
    const response = {
      schemaVersion: "calculate-project-draft-response/v2",
      correlationId: "original-correlation"
    };
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ owner_id: ids.owner }] })
      .mockResolvedValueOnce({
        rows: [{ request_hash: requestHash, response_status: 200, response_payload: response }]
      });
    const repository = new PgProjectRepository({ query } as unknown as Pool);
    await expect(
      repository.findCalculationReplay({
        projectId: ids.project,
        actor: owner,
        idempotencyKey: "calculation-replay-0001",
        requestHash
      })
    ).resolves.toEqual({ statusCode: 200, response, replayed: true });
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls.map((call) => queryText(call[0])).join("\n")).not.toContain(
      "project_draft_documents"
    );
  });

  it("checks current ownership before replace replay and rolls back on denial", async () => {
    const fake = transactionalPool(async (sql) => {
      if (sql.includes("FROM projects project") && sql.includes("FOR UPDATE")) {
        return {
          rows: [projectRow({ schemaVersion: "project-draft-document/v2", draft: emptyDraft })]
        };
      }
      return { rows: [] };
    });
    const repository = new PgProjectRepository(fake.pool);
    let caught: unknown;
    try {
      await repository.replaceProject({
        projectId: ids.project,
        actor: reviewer,
        expectedDraftVersion: 1,
        draft: emptyDraft,
        correlationId: "repository-correlation",
        idempotencyKey: "replace-replay-0001",
        requestHash
      });
    } catch (error) {
      caught = error;
    }
    expect(errorCode(caught)).toBe("FORBIDDEN");
    const statements = fake.query.mock.calls.map((call) => queryText(call[0]));
    expect(statements.some((sql) => sql.includes("FROM idempotency_records"))).toBe(false);
    expect(statements).toContain("ROLLBACK");
    expect(statements.some((sql) => sql.includes("UPDATE projects"))).toBe(false);
    expect(fake.release).toHaveBeenCalledOnce();
  });

  it("checks current ownership before the final calculation replay", async () => {
    const fake = transactionalPool(async (sql) => {
      if (sql.includes("FROM projects project") && sql.includes("FOR UPDATE")) {
        return {
          rows: [projectRow({ schemaVersion: "project-draft-document/v2", draft: emptyDraft })]
        };
      }
      return { rows: [] };
    });
    const repository = new PgProjectRepository(fake.pool);
    let caught: unknown;
    try {
      await repository.storeCalculation({
        projectId: ids.project,
        actor: reviewer
      } as Parameters<PgProjectRepository["storeCalculation"]>[0]);
    } catch (error) {
      caught = error;
    }
    expect(errorCode(caught)).toBe("FORBIDDEN");
    const statements = fake.query.mock.calls.map((call) => queryText(call[0]));
    expect(statements.some((sql) => sql.includes("FROM idempotency_records"))).toBe(false);
    expect(statements).toContain("ROLLBACK");
  });

  it("rolls back a stale replacement before mutating the graph or document", async () => {
    const fake = transactionalPool(async (sql) => {
      if (sql.includes("FROM projects project") && sql.includes("FOR UPDATE")) {
        return {
          rows: [projectRow({ schemaVersion: "project-draft-document/v2", draft: emptyDraft }, 2)]
        };
      }
      return { rows: [] };
    });
    const repository = new PgProjectRepository(fake.pool);
    let caught: unknown;
    try {
      await repository.replaceProject({
        projectId: ids.project,
        actor: owner,
        expectedDraftVersion: 1,
        draft: emptyDraft,
        correlationId: "repository-correlation",
        idempotencyKey: "replace-stale-0001",
        requestHash
      });
    } catch (error) {
      caught = error;
    }
    expect(errorCode(caught)).toBe("CONFLICT_STALE_VERSION");
    const statements = fake.query.mock.calls.map((call) => queryText(call[0]));
    expect(statements).toContain("ROLLBACK");
    expect(statements.some((sql) => sql.includes("UPDATE projects"))).toBe(false);
    expect(statements.some((sql) => sql.includes("DELETE FROM routes"))).toBe(false);
    expect(statements.some((sql) => sql.includes("project_audit_events"))).toBe(false);
  });

  it("rebases an authorized optimistic replacement to the current active snapshot pair", async () => {
    let projectUpdateValues: readonly unknown[] | undefined;
    const fake = transactionalPool(async (sql, values) => {
      if (sql.includes("FROM projects project") && sql.includes("FOR UPDATE")) {
        return {
          rows: [projectRow({ schemaVersion: "project-draft-document/v2", draft: emptyDraft })]
        };
      }
      if (
        sql.includes("FROM catalog_versions catalog") &&
        sql.includes("catalog.status = 'active'") &&
        !sql.includes("catalog.id = $1")
      ) {
        return {
          rows: [
            {
              catalog_id: ids.activeCatalog,
              catalog_version: "2026-p1",
              catalog_content_hash: requestHash,
              catalog_status: "active",
              rule_set_id: ids.activeRules,
              rule_set_version: "2026-p1",
              rule_set_content_hash: requestHash,
              rule_set_status: "active"
            }
          ]
        };
      }
      if (sql.includes("UPDATE projects") && sql.includes("active_catalog_version_id")) {
        projectUpdateValues = values;
        return {
          rows: [
            {
              id: ids.project,
              status: "draft",
              draft_version: 2,
              created_at: new Date("2026-09-01T08:00:00.000Z"),
              updated_at: new Date("2026-09-01T09:00:00.000Z")
            }
          ]
        };
      }
      return { rows: [] };
    });
    const result = await new PgProjectRepository(fake.pool).replaceProject({
      projectId: ids.project,
      actor: owner,
      expectedDraftVersion: 1,
      draft: emptyDraft,
      correlationId: "repository-correlation",
      idempotencyKey: "replace-rebase-0001",
      requestHash
    });
    expect(result).toMatchObject({ statusCode: 200, replayed: false });
    expect(result.response).toMatchObject({
      catalogSnapshot: { snapshotId: ids.activeCatalog, version: "2026-p1" },
      ruleSnapshot: { snapshotId: ids.activeRules, version: "2026-p1" }
    });
    expect(projectUpdateValues?.[8]).toBe(ids.activeCatalog);
    expect(projectUpdateValues?.[9]).toBe(ids.activeRules);
    const auditCall = fake.query.mock.calls.find((call) =>
      queryText(call[0]).includes("project.draft_replaced")
    );
    expect(auditCall?.[1]?.[3]).toMatchObject({
      priorCatalogVersionId: ids.catalog,
      priorRuleSetId: ids.rules,
      catalogVersionId: ids.activeCatalog,
      ruleSetId: ids.activeRules
    });
  });

  it("lists retained projects but rejects direct legacy draft hydration", async () => {
    const listQuery = vi.fn(async () => ({
      rows: [
        {
          id: ids.project,
          code: "LEGACY",
          name: "Legacy project",
          description: null,
          status: "draft",
          default_locale: "bg",
          default_spare_percent: "0.0000",
          owner_id: ids.owner,
          owner_display_name: "Project owner",
          editor_state: "retainedReadOnly",
          draft_version: 0,
          created_at: new Date("2026-08-01T08:00:00.000Z"),
          updated_at: new Date("2026-08-01T08:00:00.000Z")
        }
      ]
    }));
    const listed = await new PgProjectRepository({
      query: listQuery
    } as unknown as Pool).listProjects(owner);
    expect(listed[0]).toMatchObject({
      id: ids.project,
      editorState: "retainedReadOnly",
      defaultReservePercent: "0"
    });
    expect(queryText(listQuery.mock.calls[0]?.[0])).toContain("LEFT JOIN project_draft_documents");

    const fake = transactionalPool(async (sql) => {
      if (sql.includes("FROM projects project")) return { rows: [projectRow(null, 0)] };
      return { rows: [] };
    });
    let caught: unknown;
    try {
      await new PgProjectRepository(fake.pool).getProject(ids.project, owner);
    } catch (error) {
      caught = error;
    }
    expect(errorCode(caught)).toBe("UNSUPPORTED_SCHEMA_VERSION");
    expect(fake.query.mock.calls.map((call) => queryText(call[0]))).toContain("ROLLBACK");
  });

  it("reads project version and current v2 calculation in one repeatable-read transaction", async () => {
    const fake = transactionalPool(async (sql) => {
      if (sql.includes("FROM projects project")) {
        return {
          rows: [projectRow({ schemaVersion: "project-draft-document/v2", draft: emptyDraft }, 2)]
        };
      }
      if (sql.includes("FROM calculation_drafts draft")) {
        return {
          rows: [
            {
              id: ids.run,
              calculated_draft_version: 1,
              input_fingerprint: requestHash,
              engine_version: "0.1.0",
              catalog_version_id: ids.catalog,
              rule_set_id: ids.rules,
              started_at: new Date("2026-09-01T08:00:00.000Z"),
              completed_at: new Date("2026-09-01T08:00:01.000Z"),
              result_payload: { schemaVersion: "calculation-result/v2" },
              catalog_version: "2022-p0",
              catalog_content_hash: requestHash,
              rule_set_version: "2022-p0",
              rule_set_content_hash: requestHash
            }
          ]
        };
      }
      return { rows: [] };
    });
    const calculation = await new PgProjectRepository(fake.pool).getCurrentCalculation(
      ids.project,
      owner
    );
    expect(calculation).toMatchObject({ draftVersion: 1, stale: true });
    const statements = fake.query.mock.calls.map((call) => queryText(call[0]));
    expect(statements[0]).toBe("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    expect(statements.at(-1)).toBe("COMMIT");
    expect(
      statements.some((sql) => sql.includes("calculation_schema_version = 'calculation-input/v2'"))
    ).toBe(true);
    expect(statements.some((sql) => sql.includes("calculated_draft_version IS NOT NULL"))).toBe(
      true
    );
  });
});
