import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { catalogSheetNames, type CatalogSheetName } from "@niedax/catalog-import";
import type { ProjectDraftInputV2, SaveProjectRevisionRequestV2 } from "@niedax/domain";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { readCells, readParts } from "../../../packages/export/tests/helpers/ooxml.js";
import { PgCatalogAdminRepository } from "../src/catalog-repository.js";
import {
  CatalogAdminService,
  type CatalogDraftSummary,
  type CatalogUploadFile
} from "../src/catalog-service.js";
import { PgExportRepository } from "../src/export-repository.js";
import { ExportApplicationService, productionExportRendering } from "../src/export-service.js";
import { PgProjectRepository } from "../src/project-repository.js";
import { ProjectApplicationService } from "../src/project-service.js";
import { PgRevisionRepository, type RevisionActor } from "../src/revision-repository.js";
import { RevisionApplicationService } from "../src/revision-service.js";
import {
  databasePool,
  ids,
  isolatedApprovalReadyDraft,
  seedAcceptanceCatalog,
  type AcceptanceFixtureIds
} from "./persisted-project-fixture.js";
import { coordinateProjectLock, failAfterWrite } from "./stage10-transaction-probe.js";

const enabled = process.env.STAGE7_ACCEPTANCE === "1";
const fixtureIds = Object.fromEntries(
  Object.entries(ids).map(([name, value]) => [name, value.replace(/^70000000/u, "71000000")])
) as AcceptanceFixtureIds;
const actor = (suffix: number, role: RevisionActor["role"]): RevisionActor => ({
  id: `71000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`,
  username: `stage10.${role}`,
  displayName: `Synthetic Stage 10 ${role}`,
  role
});
const designer = actor(101, "designer");
const reviewer = actor(102, "reviewer");
const administrator = actor(103, "administrator");
const viewer = actor(104, "viewer");
const catalogScope = "stage10-disposable-import";
const correlation = () => `stage10-${randomUUID()}`;

describe.skipIf(!enabled)("Stage 10 PostgreSQL transaction stabilization", () => {
  let setupPool: Pool;
  let pool: Pool;
  let projects: ProjectApplicationService;
  let revisions: RevisionApplicationService;
  let catalogs: CatalogAdminService;
  let baseCsv: Record<CatalogSheetName, string>;

  beforeAll(async () => {
    setupPool = databasePool();
    await seedAcceptanceCatalog(setupPool, fixtureIds, "stage10-acceptance");
    for (const user of [designer, reviewer, administrator, viewer]) {
      await setupPool.query(
        `INSERT INTO users (id,username,display_name,role,enabled,password_hash,password_algorithm)
        VALUES ($1,$2,$3,$4,true,'disabled-synthetic-stage10-hash','test-only')`,
        [user.id, user.username, user.displayName, user.role]
      );
    }
    // The migrator credential authenticates only this isolated fixture connection;
    // PostgreSQL applies the production application role to every tested operation.
    pool = new Pool({ ...setupPool.options, options: "-c role=niedax_generator_app", max: 6 });
    expect(
      (await pool.query<{ current_user: string }>("SELECT current_user")).rows[0]?.current_user
    ).toBe("niedax_generator_app");
    projects = new ProjectApplicationService(new PgProjectRepository(pool));
    revisions = new RevisionApplicationService(new PgRevisionRepository(pool));
    catalogs = new CatalogAdminService(new PgCatalogAdminRepository(pool));
    const directory = fileURLToPath(
      new URL("../../../catalogue/imports/niedax-p0-2022/", import.meta.url)
    );
    baseCsv = Object.fromEntries(
      await Promise.all(
        catalogSheetNames.map(async (sheet) => [
          sheet,
          await readFile(`${directory}${sheet}.csv`, "utf8")
        ])
      )
    ) as Record<CatalogSheetName, string>;
  });

  afterAll(async () => {
    await pool?.end();
    await setupPool?.end();
  });

  async function state(projectId: string) {
    const sources = [
      ["projects", "id = $1"],
      ["project_draft_documents", "project_id = $1"],
      ["calculation_drafts", "project_id = $1"],
      ["project_audit_events", "project_id = $1"],
      ["revisions", "project_id = $1"],
      ["revision_bom_lines_v2", "revision_id IN (SELECT id FROM revisions WHERE project_id = $1)"],
      ["revision_warnings_v2", "revision_id IN (SELECT id FROM revisions WHERE project_id = $1)"],
      ["approvals", "revision_id IN (SELECT id FROM revisions WHERE project_id = $1)"],
      ["revision_lifecycle_events", "project_id = $1"],
      ["export_artifacts", "revision_id IN (SELECT id FROM revisions WHERE project_id = $1)"],
      [
        "idempotency_records",
        "scope LIKE '%' || $1::text || '%' OR resource_id IN (SELECT id FROM revisions WHERE project_id = $1::uuid) OR resource_id IN (SELECT artifact.id FROM export_artifacts artifact JOIN revisions revision ON revision.id=artifact.revision_id WHERE revision.project_id=$1::uuid)"
      ]
    ] as const;
    return Object.fromEntries(
      await Promise.all(
        sources.map(async ([table, predicate]) => {
          const result = await pool.query<{ digest: string; count: number }>(
            `SELECT md5(coalesce(jsonb_agg(to_jsonb(entry) ORDER BY to_jsonb(entry)::text),'[]'::jsonb)::text) AS digest, count(*)::integer AS count FROM ${table} entry WHERE ${predicate}`,
            [projectId]
          );
          return [table, result.rows[0]];
        })
      )
    );
  }

  async function preparedProject(sourceDraft = isolatedApprovalReadyDraft(fixtureIds)) {
    const draft = {
      ...sourceDraft,
      code: `S10-${randomUUID()}`,
      name: "Synthetic Stage 10 transaction project"
    };
    const created = await projects.createProject(
      designer,
      { schemaVersion: "create-project-draft-request/v2", draft },
      correlation(),
      correlation()
    );
    const projectId = created.body.project.id;
    const calculated = await projects.calculateProject(
      designer,
      projectId,
      { schemaVersion: "calculate-project-draft-request/v2", expectedDraftVersion: 1 },
      correlation(),
      correlation()
    );
    expect(calculated.body.calculation.result.summary.approvalReady).toBe(true);
    const request: SaveProjectRevisionRequestV2 = {
      schemaVersion: "save-project-revision-request/v2",
      expectedDraftVersion: 1,
      expectedLatestRevisionNumber: 0,
      calculationRunId: calculated.body.calculation.run.id,
      inputFingerprint: calculated.body.calculation.run.inputFingerprint,
      name: "Synthetic Stage 10 saved evidence",
      comment: "Non-authoritative transaction fixture"
    };
    return { projectId, request, draft, calculated };
  }

  async function savedProject() {
    const prepared = await preparedProject();
    const saved = await revisions.saveRevision(
      designer,
      prepared.projectId,
      prepared.request,
      correlation(),
      correlation()
    );
    if ("recordVersion" in saved.body.revision) throw new Error("Expected a new v2 revision");
    return { ...prepared, revision: saved.body.revision };
  }

  it("S10-DB01 rolls Calculate back after replacing its transient result and before success evidence", async () => {
    const prepared = await preparedProject();
    const before = await state(prepared.projectId);
    const probe = failAfterWrite(pool, /INSERT INTO calculation_drafts/u);
    const failing = new ProjectApplicationService(new PgProjectRepository(probe.pool));
    await expect(
      failing.calculateProject(
        designer,
        prepared.projectId,
        { schemaVersion: "calculate-project-draft-request/v2", expectedDraftVersion: 1 },
        correlation(),
        correlation()
      )
    ).rejects.toThrow(probe.fault);
    expect(probe.failures()).toBe(1);
    expect(await state(prepared.projectId)).toEqual(before);
  });

  it("S10-DB02 rolls Save back after BOM projection with no revision, numbering gap, audit or replay success", async () => {
    const prepared = await preparedProject();
    const before = await state(prepared.projectId);
    const probe = failAfterWrite(pool, /INSERT INTO revision_bom_lines_v2/u);
    const failing = new RevisionApplicationService(new PgRevisionRepository(probe.pool));
    const key = correlation();
    await expect(
      failing.saveRevision(designer, prepared.projectId, prepared.request, key, correlation())
    ).rejects.toThrow(probe.fault);
    expect(probe.failures()).toBe(1);
    expect(await state(prepared.projectId)).toEqual(before);
    const recovered = await revisions.saveRevision(
      designer,
      prepared.projectId,
      prepared.request,
      key,
      correlation()
    );
    expect(recovered.body.revision.summary.revisionNumber).toBe(1);
    expect(recovered.replayed).toBe(false);
  });

  it("S10-DB03 rolls Check back after its lifecycle update without a success event or idempotency result", async () => {
    const prepared = await savedProject();
    const before = await state(prepared.projectId);
    const probe = failAfterWrite(pool, /UPDATE revisions/u);
    const failing = new RevisionApplicationService(new PgRevisionRepository(probe.pool));
    await expect(
      failing.checkRevision(
        reviewer,
        prepared.revision.summary.id,
        {
          schemaVersion: "check-project-revision-request/v2",
          expectedStatus: "calculated",
          expectedLatestRevisionNumber: 1,
          inputFingerprint: prepared.request.inputFingerprint,
          comment: null
        },
        correlation(),
        correlation()
      )
    ).rejects.toThrow(probe.fault);
    expect(probe.failures()).toBe(1);
    expect(await state(prepared.projectId)).toEqual(before);
  });

  it("S10-DB04 rolls Approve back after inserting its approval record", async () => {
    const prepared = await savedProject();
    await revisions.checkRevision(
      reviewer,
      prepared.revision.summary.id,
      {
        schemaVersion: "check-project-revision-request/v2",
        expectedStatus: "calculated",
        expectedLatestRevisionNumber: 1,
        inputFingerprint: prepared.request.inputFingerprint,
        comment: null
      },
      correlation(),
      correlation()
    );
    const before = await state(prepared.projectId);
    const probe = failAfterWrite(pool, /INSERT INTO approvals/u);
    const failing = new RevisionApplicationService(new PgRevisionRepository(probe.pool));
    await expect(
      failing.approveRevision(
        reviewer,
        prepared.revision.summary.id,
        {
          schemaVersion: "approve-project-revision-request/v2",
          expectedStatus: "checked",
          expectedLatestRevisionNumber: 1,
          inputFingerprint: prepared.request.inputFingerprint,
          comment: null
        },
        correlation(),
        correlation()
      )
    ).rejects.toThrow(probe.fault);
    expect(probe.failures()).toBe(1);
    expect(await state(prepared.projectId)).toEqual(before);
  });

  it("S10-DB05 rolls export capture back after artifact insertion and rejects invalid atomic finalization", async () => {
    const prepared = await savedProject();
    const before = await state(prepared.projectId);
    const probe = failAfterWrite(pool, /INSERT INTO export_artifacts/u);
    const failing = new PgExportRepository(probe.pool);
    const command = {
      schemaVersion: "export-request/v1",
      revisionId: prepared.revision.summary.id,
      inputFingerprint: prepared.request.inputFingerprint,
      format: "xlsx",
      language: "en",
      idempotencyKey: correlation(),
      correlationId: correlation()
    } as const;
    const mapping = productionExportRendering().mapping;
    await expect(failing.request(designer, command, mapping)).rejects.toThrow(probe.fault);
    expect(probe.failures()).toBe(1);
    expect(await state(prepared.projectId)).toEqual(before);
    const repository = new PgExportRepository(pool);
    const created = await repository.request(designer, command, mapping);
    const claim = await repository.claim();
    expect(claim?.exportId).toBe(created.body.exportId);
    if (!claim) throw new Error("Expected isolated pending export");
    const pending = await state(prepared.projectId);
    // An invalid empty artifact is rejected by the production PostgreSQL constraint;
    // all finalization columns stay pending, with neither bytes nor a success status.
    await expect(
      repository.finalize(claim.exportId, claim.claimToken, Buffer.alloc(0), "stage10.xlsx")
    ).rejects.toMatchObject({ code: "23514" });
    expect(await state(prepared.projectId)).toEqual(pending);
    await repository.failAttempt(claim.exportId, claim.claimToken);
    // Finish this fixture's bounded failure lifecycle so later suites never inherit a job.
    for (let attempt = 1; attempt < 3; attempt += 1) {
      const next = await repository.claim();
      expect(next?.exportId).toBe(claim.exportId);
      if (!next) throw new Error("Expected a retryable isolated export");
      await repository.failAttempt(next.exportId, next.claimToken);
    }
    expect((await repository.get(designer, claim.exportId, correlation())).status).toBe("failed");
  });

  it("S10-DB06 coordinates simultaneous same-key saves into one immutable revision and rejects changed payload replay", async () => {
    const prepared = await preparedProject();
    const gate = coordinateProjectLock(pool);
    const concurrent = new RevisionApplicationService(new PgRevisionRepository(gate.pool));
    const key = correlation();
    const operations = [1, 2].map(() =>
      concurrent.saveRevision(
        designer,
        prepared.projectId,
        prepared.request,
        key,
        "stage10-concurrent-replay"
      )
    );
    try {
      await expect.poll(gate.arrivals, { timeout: 5_000 }).toBe(2);
    } finally {
      gate.release();
    }
    const replies = await Promise.all(operations);
    expect(replies.map((reply) => reply.replayed).sort()).toEqual([false, true]);
    expect(replies[0]?.body).toEqual(replies[1]?.body);
    const stored = await state(prepared.projectId);
    expect(stored.revisions?.count).toBe(1);
    await expect(
      revisions.saveRevision(
        designer,
        prepared.projectId,
        { ...prepared.request, name: "Conflicting same-key payload" },
        key,
        correlation()
      )
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_CONFLICT" });
    expect(await state(prepared.projectId)).toEqual(stored);
  });

  it("S10-DB07 keeps snapshot and exact BOM/warning/trace projections unchanged after later draft calculation", async () => {
    const prepared = await savedProject();
    const revisionId = prepared.revision.summary.id;
    const projected = await pool.query<{ payload: unknown }>(
      "SELECT line_snapshot AS payload FROM revision_bom_lines_v2 WHERE revision_id=$1 ORDER BY line_order",
      [revisionId]
    );
    expect(projected.rows.map((row) => row.payload)).toEqual(
      prepared.calculated.body.calculation.result.bomLines
    );
    const warnings = await pool.query<{ payload: unknown }>(
      "SELECT warning_payload AS payload FROM revision_warnings_v2 WHERE revision_id=$1 ORDER BY warning_order",
      [revisionId]
    );
    expect(warnings.rows.map((row) => row.payload)).toEqual(
      prepared.calculated.body.calculation.result.warnings
    );
    const draft: ProjectDraftInputV2 = {
      ...prepared.draft,
      name: "Later draft title",
      defaultReservePercent: "0"
    };
    await projects.replaceProject(
      designer,
      prepared.projectId,
      { schemaVersion: "replace-project-draft-request/v2", expectedDraftVersion: 1, draft },
      correlation(),
      correlation()
    );
    await projects.calculateProject(
      designer,
      prepared.projectId,
      { schemaVersion: "calculate-project-draft-request/v2", expectedDraftVersion: 2 },
      correlation(),
      correlation()
    );
    const later = await revisions.getRevision(viewer, revisionId, correlation());
    if ("recordVersion" in later.revision) throw new Error("Expected preserved v2 revision");
    expect(later.revision.snapshot).toEqual(prepared.revision.snapshot);
    expect(later.revision.checksums).toEqual(prepared.revision.checksums);
    expect(
      (await revisions.listRevisions(viewer, prepared.projectId, correlation())).revisions
    ).toHaveLength(1);
  });

  it("S10-DB13 saves manual catalog identity separately from automatic demand and persists literal export values", async () => {
    const base = isolatedApprovalReadyDraft(fixtureIds);
    const manualCatalogId = randomUUID();
    const freeTextId = randomUUID();
    const prepared = await preparedProject({
      ...base,
      defaultReservePercent: "0",
      routes: base.routes.map((route) => ({
        ...route,
        geometry: route.geometry.map((segment) =>
          segment.kind === "straight"
            ? { ...segment, length: { value: "6", unit: "m" as const } }
            : segment
        )
      })),
      manualItems: [
        {
          id: manualCatalogId,
          kind: "catalog",
          productId: fixtureIds.support,
          quantity: { value: "2", unit: "pcs" },
          reason: "Two independently specified catalog supports",
          note: "Retain manual provenance separately from automatic support demand",
          reservePolicy: { mode: "projectDefault" },
          packagingPolicy: { mode: "catalogDefault" },
          quantityOverride: null
        },
        {
          id: freeTextId,
          kind: "freeText",
          productId: null,
          productCode: "00123",
          descriptionEn: "Synthetic exact decimal manual cable",
          quantity: { value: "2.5", unit: "m" },
          reason: "Literal free-text quantity with no package rounding",
          note: null,
          reservePolicy: { mode: "projectDefault" },
          packagingPolicy: { mode: "disabled", metadata: null },
          quantityOverride: null
        }
      ]
    });
    const lines = prepared.calculated.body.calculation.result.bomLines;
    const manualCatalog = lines.find((line) => line.manualInputId === manualCatalogId);
    expect(manualCatalog).toMatchObject({
      kind: "catalog",
      category: "manual",
      productId: fixtureIds.support,
      manualInputId: manualCatalogId,
      status: "manual",
      technicalQuantity: { value: "2", unit: "pcs" },
      orderedQuantity: { value: "2", unit: "pcs" }
    });
    expect(
      lines.find((line) => line.productId === fixtureIds.support && line.manualInputId === null)
    ).toMatchObject({
      kind: "catalog",
      category: "support",
      technicalQuantity: { value: "5", unit: "pcs" },
      orderedQuantity: { value: "5", unit: "pcs" }
    });
    expect(lines.find((line) => line.manualInputId === freeTextId)).toMatchObject({
      kind: "manual",
      productId: null,
      productCode: "00123",
      technicalQuantity: { value: "2.5", unit: "m" },
      orderedQuantity: { value: "2.5", unit: "m" },
      packageCount: null
    });
    const saved = await revisions.saveRevision(
      designer,
      prepared.projectId,
      prepared.request,
      correlation(),
      correlation()
    );
    if ("recordVersion" in saved.body.revision) throw new Error("Expected a new v2 revision");
    const revisionId = saved.body.revision.summary.id;
    const projected = await pool.query<{ payload: unknown }>(
      "SELECT line_snapshot AS payload FROM revision_bom_lines_v2 WHERE revision_id=$1 ORDER BY line_order",
      [revisionId]
    );
    expect(projected.rows.map((row) => row.payload)).toEqual(lines);
    const exports = new ExportApplicationService(new PgExportRepository(pool));
    const requested = await exports.request(designer, {
      schemaVersion: "export-request/v1",
      revisionId,
      inputFingerprint: prepared.request.inputFingerprint,
      format: "xlsx",
      language: "en",
      idempotencyKey: correlation(),
      correlationId: correlation()
    });
    await exports.recoverOnce();
    const downloaded = await exports.download(viewer, requested.body.exportId, correlation());
    const cells = readCells(readParts(downloaded.bytes), 1);
    const supportRows = [...cells.entries()]
      .filter(([address, cell]) => /^X\d+$/u.test(address) && cell.value === "S7-SYN-SUPPORT")
      .map(([address]) => address.slice(1));
    expect(supportRows).toHaveLength(2);
    expect(supportRows.map((row) => cells.get(`B${row}`)?.value).sort()).toEqual([2, 5]);
    expect(supportRows.map((row) => cells.get(`C${row}`)?.value).sort()).toEqual([2, 5]);
    const freeTextAddress = [...cells.entries()].find(
      ([address, cell]) => /^X\d+$/u.test(address) && cell.value === "00123"
    )?.[0];
    expect(freeTextAddress).toBeDefined();
    const freeTextRow = freeTextAddress!.slice(1);
    expect(cells.get(`X${freeTextRow}`)).toMatchObject({
      value: "00123",
      type: "s",
      formula: null
    });
    expect(cells.get(`B${freeTextRow}`)?.value).toBe(2.5);
    expect(cells.get(`C${freeTextRow}`)?.value).toBe(2.5);
    expect(cells.get(`I${freeTextRow}`)?.value ?? null).toBeNull();
    const retained = await revisions.getRevision(viewer, revisionId, correlation());
    if ("recordVersion" in retained.revision) throw new Error("Expected retained v2 revision");
    expect(retained.revision.snapshot).toEqual(saved.body.revision.snapshot);
    expect(retained.revision.checksums).toEqual(saved.body.revision.checksums);
  });

  function upload(version: string, invalid = false): CatalogUploadFile[] {
    return catalogSheetNames.map((sheet) => {
      let csv = baseCsv[sheet].replaceAll(",2022-p0,", `,${version},`);
      if (sheet === "manifest") csv = csv.replaceAll("p0-kl60-wsl105-anchors", catalogScope);
      if (sheet === "products" && invalid)
        csv = csv.replace("NSA 6X35/FKK-T30 V", "UNKNOWN NSA PRODUCT");
      return { name: `${sheet}.csv`, contentBase64: Buffer.from(csv).toString("base64") };
    });
  }

  const importInput = (version: string, invalid = false) => ({
    files: upload(version, invalid),
    actorId: administrator.id,
    actorRole: "administrator" as const,
    correlationId: correlation()
  });
  const lifecycle = (candidate: CatalogDraftSummary) => ({
    catalogVersionId: candidate.id,
    actorId: administrator.id,
    actorRole: "administrator" as const,
    correlationId: correlation(),
    contentHash: candidate.contentHash,
    reason: "Synthetic Stage 10 lifecycle acceptance only"
  });
  async function validated(version: string) {
    const candidate = await catalogs.importDraft(importInput(version));
    const result = await catalogs.validate(lifecycle(candidate));
    expect(result.report?.valid).toBe(true);
    return result;
  }
  async function approved(version: string) {
    const candidate = await validated(version);
    await catalogs.approve(lifecycle(candidate));
    return candidate;
  }
  async function catalogState() {
    const tables = [
      "catalog_versions",
      "catalog_imports",
      "catalog_validation_reports",
      "catalog_version_approvals",
      "catalog_version_transitions",
      "products",
      "product_sources",
      "rule_sets",
      "compatibility_rules",
      "assembly_templates",
      "template_components"
    ];
    return Object.fromEntries(
      await Promise.all(
        tables.map(async (table) => {
          const result = await pool.query<{ digest: string }>(
            `SELECT md5(coalesce(jsonb_agg(to_jsonb(entry) ORDER BY to_jsonb(entry)::text),'[]'::jsonb)::text) AS digest FROM ${table} entry`
          );
          return [table, result.rows[0]?.digest];
        })
      )
    );
  }

  it("S10-DB08 rolls catalog import and validation materialization back after intermediate writes", async () => {
    const beforeImport = await catalogState();
    const importProbe = failAfterWrite(pool, /INSERT INTO catalog_imports/u);
    await expect(
      new CatalogAdminService(new PgCatalogAdminRepository(importProbe.pool)).importDraft(
        importInput("stage10-import-rollback")
      )
    ).rejects.toThrow(importProbe.fault);
    expect(importProbe.failures()).toBe(1);
    expect(await catalogState()).toEqual(beforeImport);
    const candidate = await catalogs.importDraft(importInput("stage10-validation-rollback"));
    const beforeValidation = await catalogState();
    const validateProbe = failAfterWrite(pool, /INSERT INTO products/u);
    await expect(
      new CatalogAdminService(new PgCatalogAdminRepository(validateProbe.pool)).validate(
        lifecycle(candidate)
      )
    ).rejects.toThrow(validateProbe.fault);
    expect(validateProbe.failures()).toBe(1);
    expect(await catalogState()).toEqual(beforeValidation);
  });

  it("S10-DB09 retains invalid import evidence and rejects unauthorized or unvalidated activation", async () => {
    const candidate = await catalogs.importDraft(importInput("stage10-invalid-candidate", true));
    const result = await catalogs.validate(lifecycle(candidate));
    expect(result.report?.valid).toBe(false);
    expect(result.report?.counts.errors).toBeGreaterThan(0);
    const before = await catalogState();
    await expect(catalogs.approve(lifecycle(candidate))).rejects.toMatchObject({
      code: "APPROVAL_HASH_MISMATCH"
    });
    await expect(catalogs.activate(lifecycle(candidate))).rejects.toMatchObject({
      code: "ACTIVATION_HASH_MISMATCH"
    });
    await expect(
      catalogs.activate({ ...lifecycle(candidate), actorId: designer.id, actorRole: "designer" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      catalogs.activate({ ...lifecycle(candidate), actorId: viewer.id, actorRole: "administrator" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await catalogState()).toEqual(before);
  });

  it("S10-DB10 rolls catalog approval and active-version replacement back with their audit evidence", async () => {
    const historical = await savedProject();
    const exports = new ExportApplicationService(new PgExportRepository(pool));
    const exportCommand = {
      schemaVersion: "export-request/v1",
      revisionId: historical.revision.summary.id,
      inputFingerprint: historical.request.inputFingerprint,
      format: "xlsx",
      language: "en",
      idempotencyKey: correlation(),
      correlationId: correlation()
    } as const;
    const artifact = await exports.request(designer, exportCommand);
    await exports.recoverOnce();
    const downloadedBefore = await exports.download(viewer, artifact.body.exportId, correlation());
    const active = await approved("stage10-active-before-rollback");
    await catalogs.activate(lifecycle(active));
    const candidate = await validated("stage10-candidate-rollback");
    const approvalProbe = failAfterWrite(pool, /INSERT INTO catalog_version_approvals/u);
    const beforeApproval = await catalogState();
    await expect(
      new CatalogAdminService(new PgCatalogAdminRepository(approvalProbe.pool)).approve(
        lifecycle(candidate)
      )
    ).rejects.toThrow(approvalProbe.fault);
    expect(approvalProbe.failures()).toBe(1);
    expect(await catalogState()).toEqual(beforeApproval);
    await catalogs.approve(lifecycle(candidate));
    const activateProbe = failAfterWrite(pool, /UPDATE catalog_versions SET status = 'archived'/u);
    const beforeActivation = await catalogState();
    await expect(
      new CatalogAdminService(new PgCatalogAdminRepository(activateProbe.pool)).activate(
        lifecycle(candidate)
      )
    ).rejects.toThrow(activateProbe.fault);
    expect(activateProbe.failures()).toBe(1);
    expect(await catalogState()).toEqual(beforeActivation);
    await catalogs.activate(lifecycle(candidate));
    const versions = await catalogs.listVersions("administrator");
    expect(versions.find((version) => version.id === active.id)?.status).toBe("archived");
    expect(versions.find((version) => version.id === candidate.id)?.status).toBe("active");
    const preserved = await revisions.getRevision(
      viewer,
      historical.revision.summary.id,
      correlation()
    );
    if ("recordVersion" in preserved.revision)
      throw new Error("Expected preserved historical v2 evidence");
    expect(preserved.revision.snapshot).toEqual(historical.revision.snapshot);
    expect(preserved.revision.checksums).toEqual(historical.revision.checksums);
    const oldDraft = await projects.getProject(designer, historical.projectId, correlation());
    expect(oldDraft.catalogSnapshot.snapshotId).toBe(fixtureIds.catalog);
    const newDraft = await projects.createProject(
      designer,
      {
        schemaVersion: "create-project-draft-request/v2",
        draft: {
          ...historical.draft,
          code: `S10-NEW-PINS-${randomUUID()}`,
          routes: [],
          manualItems: []
        }
      },
      correlation(),
      correlation()
    );
    expect(newDraft.body.catalogSnapshot.snapshotId).toBe(candidate.id);
    const repeatedExport = await exports.request(designer, {
      ...exportCommand,
      idempotencyKey: correlation()
    });
    expect(repeatedExport.body.exportId).toBe(artifact.body.exportId);
    const downloadedAfter = await exports.download(viewer, artifact.body.exportId, correlation());
    expect(downloadedAfter.bytes).toEqual(downloadedBefore.bytes);
    expect(downloadedAfter.artifact.contentHash).toBe(downloadedBefore.artifact.contentHash);
    await catalogs.archive(lifecycle(candidate));
    expect(
      (await catalogs.listVersions("administrator")).find((version) => version.id === candidate.id)
        ?.status
    ).toBe("archived");
  });

  it("S10-DB11 serializes simultaneous activation of the same approved catalog without duplicate success transitions", async () => {
    const candidate = await approved("stage10-concurrent-activation");
    const replies = await Promise.all([
      catalogs.activate(lifecycle(candidate)),
      catalogs.activate(lifecycle(candidate))
    ]);
    expect(replies.every((reply) => reply.id === candidate.id && reply.status === "active")).toBe(
      true
    );
    const transitions = await pool.query<{ count: number }>(
      "SELECT count(*)::integer AS count FROM catalog_version_transitions WHERE catalog_version_id=$1 AND new_state='active'",
      [candidate.id]
    );
    expect(transitions.rows[0]?.count).toBe(1);
    expect(
      (await catalogs.listVersions("administrator")).filter(
        (version) => version.scope === catalogScope && version.status === "active"
      )
    ).toHaveLength(1);
  });

  it("S10-DB12 preserves exact P0 NSA indoor/concrete/ETA source policy through the production importer", async () => {
    const versions = await catalogs.listVersions("administrator");
    const active = versions.find(
      (version) => version.scope === catalogScope && version.status === "active"
    );
    expect(active).toBeDefined();
    const rows = await pool.query<{
      product_code: string;
      indoor_only: boolean;
      series: string;
      minimum_package_quantity: string;
      engineering_verification_required: boolean;
      engineering_note: string;
    }>(
      `SELECT product_code,indoor_only,series,minimum_package_quantity::text,engineering_verification_required,engineering_note FROM products WHERE catalog_version_id=$1 AND family='NSA' ORDER BY product_code`,
      [active?.id]
    );
    expect(rows.rows.map((row) => row.product_code)).toEqual([
      "NSA 6X35/FKK-T30 V",
      "NSA 6X50/FKK-T30 V",
      "NSA 6X55/SW10-M6 V",
      "NSA 7.5X40/FKG-T30 V",
      "NSA 7.5X50/FKG-T30 V"
    ]);
    for (const row of rows.rows) {
      expect(row).toMatchObject({
        indoor_only: true,
        series: "concrete",
        minimum_package_quantity: "100.00000000",
        engineering_verification_required: true
      });
      expect(row.engineering_note).toContain("ETA");
    }
  });
});
