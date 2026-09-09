import { createHash, randomUUID } from "node:crypto";
import { expect } from "vitest";
import { Pool } from "pg";
import { ExportArtifactV2Schema, type AppRole, type ProjectDraftInputV2 } from "@niedax/domain";
import { renderExcelWorkbook } from "@niedax/export";

import { readCells, readParts } from "../../../packages/export/tests/helpers/ooxml.js";
import { syntheticMapping } from "../../../packages/export/tests/helpers/synthetic.js";
import { buildApp } from "../src/app.js";
import { AuthService } from "../src/auth-service.js";
import { PgUserStore } from "../src/pg-store.js";
import { PgProjectRepository } from "../src/project-repository.js";
import { ProjectApplicationService } from "../src/project-service.js";
import { PgRevisionRepository, type RevisionActor } from "../src/revision-repository.js";
import { RevisionApplicationService } from "../src/revision-service.js";
import { PgExportRepository } from "../src/export-repository.js";
import {
  ExportApplicationService,
  productionExportRendering,
  type ExportRendering
} from "../src/export-service.js";

function savedWorkbookSemantics(bytes: Buffer) {
  const parts = readParts(bytes);
  return [1, 2, 3].map((sheet) => {
    const cells = readCells(parts, sheet);
    const artifactMetadataRows = new Set<string>();
    if (sheet === 2) {
      for (const [address, cell] of cells) {
        if (
          address.startsWith("D") &&
          ["context.capturedAt", "context.versions.mappingVersion"].includes(String(cell.value))
        ) {
          artifactMetadataRows.add(address.slice(1));
        }
      }
    }
    return [...cells.entries()]
      .filter(([address]) => !artifactMetadataRows.has(address.replace(/^[A-Z]+/u, "")))
      .map(([address, cell]) => [
        address,
        sheet === 1 && address === "K3" && typeof cell.value === "string"
          ? { ...cell, value: cell.value.split("|").slice(0, -1).join("|").trim() }
          : cell
      ]);
  });
}

async function substituteDisposableLiveVersions(
  pool: Pool,
  projectId: string,
  ownerId: string,
  administratorId: string
) {
  const catalogId = randomUUID();
  const rulesId = randomUUID();
  const catalogHash = `sha256:${createHash("sha256").update("stage9-later-catalog-fixture").digest("hex")}`;
  const rulesHash = `sha256:${createHash("sha256").update("stage9-later-rules-fixture").digest("hex")}`;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Same explicit privileged disposable setup convention as database/src/stage8-test.ts.
    // New identities only: no previous catalog/rule version or calculation evidence is modified.
    await client.query(
      `INSERT INTO catalog_versions (
      id,scope,version,label,source_metadata,content_hash,status,import_provenance,
      validation_schema_version,validated_at,validated_content_hash,approved_at,
      approved_content_hash,activated_at,created_by,updated_by
    ) VALUES ($1,'stage9-later-substitution','stage9-later-v1','Later synthetic Stage 9 catalog',
      '{"fixture":true,"authoritative":false}',$2,'active',
      '{"kind":"disposableStage9Substitution"}','catalog-import-validation-result/v1',
      now(),$2,now(),$2,now(),$3,$3)`,
      [catalogId, catalogHash, administratorId]
    );
    await client.query(
      `INSERT INTO rule_sets (
      id,scope,version,label,content_hash,schema_version,catalog_version_id,status,
      validated_at,activated_at,provenance,created_by,updated_by
    ) VALUES ($1,'stage9-later-substitution','stage9-later-v1','Later synthetic Stage 9 rules',
      $2,'rule-set/v1',$3,'active',now(),now(),
      '{"fixture":true,"authoritative":false,"kind":"disposableStage9Substitution"}',$4,$4)`,
      [rulesId, rulesHash, catalogId, administratorId]
    );
    await client.query(
      `UPDATE projects SET active_catalog_version_id=$2,active_rule_set_id=$3,
      updated_at=now(),updated_by=$4 WHERE id=$1`,
      [projectId, catalogId, rulesId, administratorId]
    );
    // Name editing is deliberately not a production feature. The migration-owner fixture connection
    // changes live identity fields only to prove the immutable saved actor is independent of them.
    await client.query(
      `UPDATE users SET username='stage9.designer.renamed',
      display_name='Later live designer name' WHERE id=$1`,
      [ownerId]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return { catalogId, rulesId };
}

/** Called only from the existing disposable database acceptance suite, twice per db:check.
 * The approved 26-column layout uses a synthetic saved project. Recovery-only adapters are explicit synthetic fixtures. */
export async function verifyExportAcceptance(
  pool: Pool,
  draft: ProjectDraftInputV2
): Promise<void> {
  const store = new PgUserStore(pool);
  const auth = new AuthService(store, "stage9-disposable-pepper");
  const administratorUser = await store.findUserByUsername("stage8.administrator");
  if (!administratorUser) throw new Error("Disposable administrator fixture is missing");
  const adminIdentity = {
    sessionHash: "stage9-setup",
    user: administratorUser,
    expiresAt: new Date("2099-01-01")
  };
  const actors = new Map<AppRole | "otherDesigner", { actor: RevisionActor; token: string }>();
  for (const name of [
    "designer",
    "reviewer",
    "administrator",
    "viewer",
    "otherDesigner"
  ] as const) {
    const role = name === "otherDesigner" ? "designer" : name;
    const password = `Synthetic-Stage9-${name}-42!Aa`;
    const user = await auth.createUser(
      adminIdentity,
      {
        username: `stage9.${name.toLowerCase()}`,
        displayName: `Synthetic Stage 9 ${name}`,
        role,
        password
      },
      `stage9-create-${name}`
    );
    const login = await auth.login(user.username, password);
    actors.set(name, {
      actor: { id: user.id, username: user.username, displayName: user.displayName, role },
      token: login.token
    });
  }
  const owner = actors.get("designer")!;
  const reviewer = actors.get("reviewer")!;
  const projects = new ProjectApplicationService(new PgProjectRepository(pool));
  const revisions = new RevisionApplicationService(new PgRevisionRepository(pool));
  const project = await projects.createProject(
    owner.actor,
    {
      schemaVersion: "create-project-draft-request/v2",
      draft: { ...draft, code: "SYN-STAGE9-EXPORT", name: "Synthetic Stage 9 export integration" }
    },
    "stage9-project-create-1",
    "stage9-project-create"
  );
  const projectId = project.body.project.id;
  const calculation = await projects.calculateProject(
    owner.actor,
    projectId,
    {
      schemaVersion: "calculate-project-draft-request/v2",
      expectedDraftVersion: 1
    },
    "stage9-calculate-1",
    "stage9-calculate"
  );
  const saved = await revisions.saveRevision(
    owner.actor,
    projectId,
    {
      schemaVersion: "save-project-revision-request/v2",
      expectedDraftVersion: 1,
      expectedLatestRevisionNumber: 0,
      calculationRunId: calculation.body.calculation.run.id,
      inputFingerprint: calculation.body.calculation.run.inputFingerprint,
      name: "Synthetic export revision",
      comment: "Saved source for isolated Excel infrastructure checks"
    },
    "stage9-save-1",
    "stage9-save"
  );
  if ("recordVersion" in saved.body.revision) throw new Error("Expected v2 revision");
  const revision = saved.body.revision;
  const revisionId = revision.summary.id;
  const requestBody = {
    schemaVersion: "export-request/v1",
    revisionId,
    inputFingerprint: revision.summary.inputFingerprint,
    format: "xlsx",
    language: "en"
  } as const;
  const command = {
    ...requestBody,
    correlationId: "stage9-export",
    idempotencyKey: "stage9-export-1"
  } as const;
  const appPool = new Pool({ ...pool.options, options: "-c role=niedax_generator_app", max: 3 });
  const repository = new PgExportRepository(appPool);
  const renderer = productionExportRendering();
  expect(renderer.mapping?.approval).toBe("approved");
  const exports = new ExportApplicationService(repository, renderer);
  const app = await buildApp({
    store: new PgUserStore(appPool),
    sessionPepper: "stage9-disposable-pepper",
    exportService: exports
  });
  const url = `/api/v1/revisions/${revisionId}/exports`;
  const headers = (name: AppRole | "otherDesigner", key = "stage9-export-1") => ({
    host: "localhost:8080",
    origin: "http://localhost:8080",
    "x-niedax-csrf": "1",
    "idempotency-key": key,
    "x-correlation-id": "stage9-export",
    cookie: `niedax_session=${actors.get(name)!.token}`
  });
  async function post(
    name: AppRole | "otherDesigner",
    key = "stage9-export-1",
    payload: unknown = requestBody
  ) {
    return app.inject({ method: "POST", url, headers: headers(name, key), payload });
  }
  async function get(
    exportId: string,
    name: AppRole | "otherDesigner" = "designer",
    download = false
  ) {
    return app.inject({
      method: "GET",
      url: `/api/v1/exports/${exportId}${download ? "/download" : ""}`,
      headers: headers(name)
    });
  }
  try {
    expect((await appPool.query("SELECT current_user AS role")).rows[0]?.role).toBe(
      "niedax_generator_app"
    );
    const unavailable = new ExportApplicationService(repository, {
      mapping: null,
      render: renderer.render
    });
    await expect(unavailable.request(owner.actor, command)).rejects.toMatchObject({
      statusCode: 503,
      code: "EXPORT_FAILED"
    });
    expect(
      (
        await pool.query(
          "SELECT count(*)::integer AS count FROM export_artifacts WHERE revision_id=$1",
          [revisionId]
        )
      ).rows[0]?.count
    ).toBe(0);
    expect((await post("viewer")).statusCode).toBe(403);
    expect((await post("otherDesigner")).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url })).statusCode).toBe(401);
    expect(
      (
        await post("designer", "stage9-wrong-fingerprint", {
          ...requestBody,
          inputFingerprint: `sha256:${"0".repeat(64)}`
        })
      ).statusCode
    ).toBe(409);
    expect(
      (await post("designer", "stage9-unsupported-format", { ...requestBody, format: "csv" }))
        .statusCode
    ).toBe(422);
    const retained = await pool.query<{ id: string; input_fingerprint: string }>(
      "SELECT id,input_fingerprint FROM revisions WHERE snapshot_schema_version='revision-snapshot/v1' LIMIT 1"
    );
    if (!retained.rows[0]) throw new Error("Expected retained v1 seed revision");
    await expect(
      exports.request(reviewer.actor, {
        ...command,
        revisionId: retained.rows[0].id,
        inputFingerprint: retained.rows[0].input_fingerprint
      })
    ).rejects.toMatchObject({ code: "UNSUPPORTED_SCHEMA_VERSION" });

    const concurrent = await Promise.all([post("designer"), post("designer")]);
    expect(concurrent.map((response) => response.statusCode)).toEqual([202, 202]);
    expect(concurrent[0]!.json()).toEqual(concurrent[1]!.json());
    expect(
      concurrent.filter((response) => response.headers["idempotency-replayed"] === "true")
    ).toHaveLength(1);
    const pending = ExportArtifactV2Schema.parse(concurrent[0]!.json());
    expect((await get(pending.exportId, "designer", true)).statusCode).toBe(409);
    expect(
      (
        await post("designer", "stage9-export-1", {
          ...requestBody,
          inputFingerprint: `sha256:${"0".repeat(64)}`
        })
      ).json().error.code
    ).toBe("IDEMPOTENCY_KEY_CONFLICT");
    for (const name of ["reviewer", "administrator"] as const) {
      expect((await post(name)).json().exportId).toBe(pending.exportId);
    }

    const snapshotBefore = await pool.query(
      "SELECT to_jsonb(revision)::text AS value FROM revisions revision WHERE id=$1",
      [revisionId]
    );
    await exports.recoverOnce();
    const ready = ExportArtifactV2Schema.parse((await get(pending.exportId)).json());
    expect(ready.status).toBe("ready");
    expect((await post("designer")).json()).toEqual(pending); // Original pending replay stays append-only.
    expect((await post("designer", "stage9-new-cache-key")).statusCode).toBe(200);
    expect(
      (
        await pool.query(
          "SELECT to_jsonb(revision)::text AS value FROM revisions revision WHERE id=$1",
          [revisionId]
        )
      ).rows
    ).toEqual(snapshotBefore.rows);
    const downloaded = await get(ready.exportId, "viewer", true);
    expect(downloaded.statusCode).toBe(200);
    expect(downloaded.headers["content-type"]).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    expect(downloaded.headers["content-length"]).toBe(String(downloaded.rawPayload.length));
    expect(ready.contentHash).toBe(
      `sha256:${createHash("sha256").update(downloaded.rawPayload).digest("hex")}`
    );
    const parts = readParts(downloaded.rawPayload);
    const cells = readCells(parts, 1);
    expect(parts.get("xl/workbook.xml")).toContain('name="Change Order"');
    expect(parts.get("xl/workbook.xml")).toContain('name="Calculation details"');
    expect(parts.get("xl/workbook.xml")).toContain('name="Warnings"');
    for (const [index, line] of revision.snapshot.calculationResult.bomLines.entries()) {
      const row = index + 6;
      expect(cells.get(`X${row}`)?.value ?? null).toBe(line.productCode);
      expect(cells.get(`E${row}`)?.value).toBe(line.unit);
      expect(String(cells.get(`B${row}`)?.value)).toBe(line.technicalQuantity.value);
      expect(String(cells.get(`C${row}`)?.value)).toBe(line.orderedQuantity.value);
      expect(String(cells.get(`D${row}`)?.value)).toBe(line.totalSpareQuantity.value);
      expect(String(cells.get(`G${row}`)?.value)).toBe(line.packageIncrement.value);
      expect(cells.get(`H${row}`)?.value).toBe(line.packageIncrement.unit);
      expect(cells.get(`K${row}`)?.value).toBe(line.descriptionEn);
      if (line.packageCount === null) {
        expect(cells.get(`I${row}`)?.value ?? null).toBeNull();
        expect(cells.get(`J${row}`)?.value ?? null).toBeNull();
      } else {
        expect(String(cells.get(`I${row}`)?.value)).toBe(line.packageCount.value);
        expect(cells.get(`J${row}`)?.value).toBe(line.packageCount.unit);
      }
      for (const column of ["M", "P", "Q"])
        expect(cells.get(`${column}${row}`)?.value ?? null).toBeNull();
    }
    expect([...cells.values()].every((cell) => cell.formula === null)).toBe(true);
    for (const name of ["designer", "reviewer", "administrator", "viewer"] as const) {
      expect((await get(ready.exportId, name, true)).rawPayload).toEqual(downloaded.rawPayload);
    }
    expect((await get(ready.exportId, "otherDesigner")).statusCode).toBe(404);
    expect((await get(ready.exportId, "otherDesigner")).json()).toEqual(
      (await get(randomUUID(), "otherDesigner")).json()
    );
    expect((await get(ready.exportId, "otherDesigner", true)).statusCode).toBe(404);
    const viewerList = await app.inject({ method: "GET", url, headers: headers("viewer") });
    expect(viewerList.json().availability.reason).toBe("notAuthorized");
    expect(viewerList.json().artifacts[0].exportId).toBe(ready.exportId);

    for (const query of [
      "UPDATE export_artifacts SET status='failed',failure_code='RENDER_FAILED',content_bytes=NULL,content_length=NULL,content_hash=NULL,file_name=NULL,media_type=NULL WHERE id=$1",
      "UPDATE export_artifacts SET context_payload='{}' WHERE id=$1",
      "DELETE FROM export_artifacts WHERE id=$1"
    ]) {
      await expect(pool.query(query, [ready.exportId])).rejects.toMatchObject({ code: "55000" });
    }
    await expect(
      appPool.query("UPDATE export_artifacts SET context_payload='{}' WHERE id=$1", [
        ready.exportId
      ])
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      appPool.query("DELETE FROM export_artifacts WHERE id=$1", [ready.exportId])
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      pool.query("UPDATE idempotency_records SET response_payload='{}' WHERE resource_id=$1", [
        ready.exportId
      ])
    ).rejects.toMatchObject({ code: "55000" });

    // Lifecycle changes create another cache identity while the in-flight request retains Calculated.
    const checked = await revisions.checkRevision(
      reviewer.actor,
      revisionId,
      {
        schemaVersion: "check-project-revision-request/v2",
        expectedStatus: "calculated",
        expectedLatestRevisionNumber: 1,
        inputFingerprint: revision.summary.inputFingerprint,
        comment: "Synthetic check"
      },
      "stage9-check",
      "stage9-check"
    );
    expect(checked.statusCode).toBe(200);
    const checkedExport = ExportArtifactV2Schema.parse(
      (await post("designer", "stage9-checked-export")).json()
    );
    expect(checkedExport.exportId).not.toBe(ready.exportId);
    await revisions.approveRevision(
      reviewer.actor,
      revisionId,
      {
        schemaVersion: "approve-project-revision-request/v2",
        expectedStatus: "checked",
        expectedLatestRevisionNumber: 1,
        inputFingerprint: revision.summary.inputFingerprint,
        comment: "Synthetic approval"
      },
      "stage9-approve",
      "stage9-approve"
    );
    const approvedExport = ExportArtifactV2Schema.parse(
      (await post("designer", "stage9-approved-export")).json()
    );
    expect(approvedExport.exportId).not.toBe(checkedExport.exportId);
    await exports.recoverOnce();
    const captures = await pool.query<{ status: string; actor: string }>(
      `SELECT context_payload->'revision'->>'status' AS status,
        context_payload->'lifecycle'->-1->'actorSnapshot'->>'displayName' AS actor
       FROM export_artifacts WHERE id = ANY($1::uuid[]) ORDER BY created_at`,
      [[ready.exportId, checkedExport.exportId, approvedExport.exportId]]
    );
    expect(captures.rows.map((row) => row.status)).toEqual(["calculated", "checked", "approved"]);
    expect(captures.rows.at(-1)?.actor).toBe(reviewer.actor.displayName);
    expect((await get(ready.exportId, "designer", true)).rawPayload).toEqual(downloaded.rawPayload);

    // A second mapping identity is an explicit synthetic renderer-version scenario.
    const recoveryMapping = { ...syntheticMapping, mappingVersion: "synthetic-recovery-2" };
    const recoveryRenderer: ExportRendering = {
      mapping: recoveryMapping,
      render: async (context) => (await renderExcelWorkbook(context, recoveryMapping)).bytes
    };
    const recoveryService = new ExportApplicationService(repository, recoveryRenderer);
    const interrupted = await recoveryService.request(owner.actor, {
      ...command,
      idempotencyKey: "stage9-recovery"
    });
    const lease = await repository.claim();
    expect(lease?.exportId).toBe(interrupted.body.exportId);
    expect(await repository.claim()).toBeNull();
    await pool.query(
      "UPDATE export_artifacts SET lease_until=now()-interval '1 second' WHERE id=$1",
      [interrupted.body.exportId]
    );
    const restarted = new ExportApplicationService(
      new PgExportRepository(appPool),
      recoveryRenderer
    );
    await restarted.recoverOnce();
    expect(
      (await exports.get(owner.actor, interrupted.body.exportId, "stage9-status")).status
    ).toBe("ready");

    const storageMapping = { ...syntheticMapping, mappingVersion: "synthetic-storage-retry" };
    let storageFailed = false;
    class InterruptedStorage extends PgExportRepository {
      public override async finalize(
        id: string,
        token: string,
        bytes: Buffer,
        fileName: string
      ): Promise<void> {
        if (!storageFailed) {
          storageFailed = true;
          // The database must reject partial storage while the artifact is still pending.
          await appPool.query("UPDATE export_artifacts SET content_bytes=$2 WHERE id=$1", [
            id,
            bytes
          ]);
          throw new Error("Partial storage was unexpectedly accepted");
        }
        await super.finalize(id, token, bytes, fileName);
      }
    }
    const storageRetry = new ExportApplicationService(new InterruptedStorage(appPool), {
      mapping: storageMapping,
      render: async (context) => (await renderExcelWorkbook(context, storageMapping)).bytes
    });
    const storageRequest = await storageRetry.request(owner.actor, {
      ...command,
      idempotencyKey: "stage9-storage-retry"
    });
    await storageRetry.recoverOnce();
    expect(storageFailed).toBe(true);
    expect(
      await exports.get(owner.actor, storageRequest.body.exportId, "stage9-status")
    ).toMatchObject({ status: "ready" });
    expect(
      (
        await pool.query("SELECT attempts FROM export_artifacts WHERE id=$1", [
          storageRequest.body.exportId
        ])
      ).rows[0]?.attempts
    ).toBe(2);

    const failingMapping = { ...syntheticMapping, mappingVersion: "synthetic-failure-3" };
    const failing = new ExportApplicationService(repository, {
      mapping: failingMapping,
      render: async () => {
        throw new Error("synthetic render failure");
      }
    });
    const failed = await failing.request(owner.actor, {
      ...command,
      idempotencyKey: "stage9-failure"
    });
    await failing.recoverOnce();
    expect(await exports.get(owner.actor, failed.body.exportId, "stage9-status")).toMatchObject({
      status: "failed",
      failureCode: "RENDER_FAILED",
      contentHash: null
    });
    expect(
      (
        await pool.query("SELECT attempts FROM export_artifacts WHERE id=$1", [
          failed.body.exportId
        ])
      ).rows[0]?.attempts
    ).toBe(3);
    expect((await get(failed.body.exportId, "viewer", true)).statusCode).toBe(500);
    const exhausted = await failing.request(owner.actor, {
      ...command,
      idempotencyKey: "stage9-crash-exhaustion"
    });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect((await repository.claim())?.exportId).toBe(exhausted.body.exportId);
      await pool.query(
        "UPDATE export_artifacts SET lease_until=now()-interval '1 second' WHERE id=$1",
        [exhausted.body.exportId]
      );
    }
    expect(await repository.claim()).toBeNull();
    expect(await exports.get(owner.actor, exhausted.body.exportId, "stage9-status")).toMatchObject({
      status: "failed",
      failureCode: "RECOVERY_EXHAUSTED"
    });

    const approvedBeforeLaterDraft = await exports.download(
      owner.actor,
      approvedExport.exportId,
      "stage9-before-later-draft"
    );
    const laterDraft = await projects.replaceProject(
      owner.actor,
      projectId,
      {
        schemaVersion: "replace-project-draft-request/v2",
        expectedDraftVersion: 1,
        draft: {
          ...draft,
          code: "SYN-STAGE9-EXPORT",
          name: "Later mutable draft must not change the issued file"
        }
      },
      "stage9-later-draft",
      "stage9-later-draft"
    );
    const laterCalculation = await projects.calculateProject(
      owner.actor,
      projectId,
      {
        schemaVersion: "calculate-project-draft-request/v2",
        expectedDraftVersion: laterDraft.body.project.draftVersion
      },
      "stage9-later-calculation",
      "stage9-later-calculation"
    );
    await revisions.saveRevision(
      owner.actor,
      projectId,
      {
        schemaVersion: "save-project-revision-request/v2",
        expectedDraftVersion: laterDraft.body.project.draftVersion,
        expectedLatestRevisionNumber: 1,
        calculationRunId: laterCalculation.body.calculation.run.id,
        inputFingerprint: laterCalculation.body.calculation.run.inputFingerprint,
        name: "Later revision",
        comment: null
      },
      "stage9-later-revision",
      "stage9-later-revision"
    );
    const historical = await exports.request(owner.actor, {
      ...command,
      idempotencyKey: "stage9-historical-approved"
    });
    expect(historical.body.exportId).toBe(approvedExport.exportId);
    expect(
      (await exports.download(owner.actor, approvedExport.exportId, "stage9-after-later-draft"))
        .bytes
    ).toEqual(approvedBeforeLaterDraft.bytes);
    const historicalDetail = await revisions.getRevision(
      owner.actor,
      revisionId,
      "stage9-historical-detail"
    );
    if ("recordVersion" in historicalDetail.revision)
      throw new Error("Expected retained v2 detail");
    expect(historicalDetail.revision.snapshot).toEqual(revision.snapshot);
    expect(historicalDetail.revision.checksums).toEqual(revision.checksums);

    const priorVersionState = await pool.query(
      `SELECT
      (SELECT to_jsonb(catalog)::text FROM catalog_versions catalog WHERE id=$1) AS catalog,
      (SELECT to_jsonb(rules)::text FROM rule_sets rules WHERE id=$2) AS rules`,
      [revision.summary.catalogSnapshot.snapshotId, revision.summary.ruleSnapshot.snapshotId]
    );
    const laterVersions = await substituteDisposableLiveVersions(
      pool,
      projectId,
      owner.actor.id,
      administratorUser.id
    );
    expect(
      (
        await pool.query(
          `SELECT project.active_catalog_version_id AS current_catalog,
      project.active_rule_set_id AS current_rules,revision.catalog_snapshot_id AS saved_catalog,
      revision.rule_snapshot_id AS saved_rules FROM projects project JOIN revisions revision ON revision.project_id=project.id
      WHERE project.id=$1 AND revision.id=$2`,
          [projectId, revisionId]
        )
      ).rows[0]
    ).toEqual({
      current_catalog: laterVersions.catalogId,
      current_rules: laterVersions.rulesId,
      saved_catalog: revision.summary.catalogSnapshot.snapshotId,
      saved_rules: revision.summary.ruleSnapshot.snapshotId
    });
    expect(
      (
        await pool.query(
          `SELECT
      (SELECT to_jsonb(catalog)::text FROM catalog_versions catalog WHERE id=$1) AS catalog,
      (SELECT to_jsonb(rules)::text FROM rule_sets rules WHERE id=$2) AS rules`,
          [revision.summary.catalogSnapshot.snapshotId, revision.summary.ruleSnapshot.snapshotId]
        )
      ).rows
    ).toEqual(priorVersionState.rows);
    expect(
      (await pool.query("SELECT username,display_name FROM users WHERE id=$1", [owner.actor.id]))
        .rows[0]
    ).toEqual({
      username: "stage9.designer.renamed",
      display_name: "Later live designer name"
    });
    const afterLiveSubstitution = await revisions.getRevision(
      owner.actor,
      revisionId,
      "stage9-after-live-substitution"
    );
    if ("recordVersion" in afterLiveSubstitution.revision)
      throw new Error("Expected v2 evidence after live substitution");
    expect(afterLiveSubstitution.revision.snapshot).toEqual(revision.snapshot);
    expect(afterLiveSubstitution.revision.checksums).toEqual(revision.checksums);
    expect(afterLiveSubstitution.revision.summary.authorSnapshot).toEqual(
      revision.summary.authorSnapshot
    );
    expect(
      (
        await exports.download(
          owner.actor,
          approvedExport.exportId,
          "stage9-after-live-substitution"
        )
      ).bytes
    ).toEqual(approvedBeforeLaterDraft.bytes);

    if (!renderer.mapping) throw new Error("Expected approved production mapping");
    const reproductionMapping = {
      ...renderer.mapping,
      mappingVersion: "stage9-reproducibility-same-columns"
    };
    const reproductionService = new ExportApplicationService(repository, {
      mapping: reproductionMapping,
      render: async (context) => (await renderExcelWorkbook(context, reproductionMapping)).bytes
    });
    const reproduced = await reproductionService.request(owner.actor, {
      ...command,
      idempotencyKey: "stage9-reproduced-original-evidence"
    });
    expect(reproduced.body.status).toBe("pending");
    expect(reproduced.body.exportId).not.toBe(approvedExport.exportId);
    await reproductionService.recoverOnce();
    const reproducedDownload = await exports.download(
      owner.actor,
      reproduced.body.exportId,
      "stage9-reproduced-download"
    );
    expect(savedWorkbookSemantics(reproducedDownload.bytes)).toEqual(
      savedWorkbookSemantics(approvedBeforeLaterDraft.bytes)
    );
    expect(
      (
        await pool.query("SELECT attempts FROM export_artifacts WHERE id=$1", [
          reproduced.body.exportId
        ])
      ).rows[0]?.attempts
    ).toBe(1);

    // Current DB policy supersedes a previously accepted actor on cache hits and direct service calls.
    await auth.setRole(adminIdentity, owner.actor.id, "viewer", "stage9-demote");
    await expect(exports.request(owner.actor, command)).rejects.toMatchObject({
      code: "FORBIDDEN"
    });
    expect((await get(ready.exportId, "designer", true)).statusCode).toBe(401); // Role transition revoked old session.
    await auth.setEnabled(adminIdentity, actors.get("viewer")!.actor.id, false, "stage9-disable");
    expect((await get(ready.exportId, "viewer", true)).statusCode).toBe(401);
    await expect(
      exports.get(actors.get("viewer")!.actor, ready.exportId, "stage9-disabled")
    ).rejects.toMatchObject({ code: "AUTHENTICATION_REQUIRED" });
    expect((await get(randomUUID(), "administrator")).statusCode).toBe(404);
  } finally {
    await exports.stopWorker();
    await app.close();
    await appPool.end();
  }
}
