import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  APP_ROLES,
  CalculationInputV2Schema,
  CalculationResultV2Schema,
  ErrorEnvelopeV1Schema,
  ProjectDraftInputV2Schema,
  type AppRole
} from "@niedax/domain";
import type { Pool } from "pg";

import { buildApp } from "../src/app.js";
import { AuthService } from "../src/auth-service.js";
import { PgCatalogAdminRepository } from "../src/catalog-repository.js";
import { UserStoreInvariantError, type SessionIdentity } from "../src/domain.js";
import { PgUserStore } from "../src/pg-store.js";
import { PgProjectRepository, type ProjectActor } from "../src/project-repository.js";
import { ProjectApplicationService } from "../src/project-service.js";
import { PgRevisionRepository, type RevisionActor } from "../src/revision-repository.js";
import { RevisionApplicationService } from "../src/revision-service.js";
import { verifyExportAcceptance } from "./export-acceptance.js";
import {
  ids,
  databasePool,
  seedAcceptanceCatalog,
  emptyDraft,
  completeDraft,
  approvalReadyDraft,
  isolatedApprovalReadyDraft
} from "./persisted-project-fixture.js";

const enabled = process.env.STAGE7_ACCEPTANCE === "1";

async function revisionPersistenceCounts(
  pool: Pool,
  projectId: string
): Promise<{
  readonly revisions: number;
  readonly bom: number;
  readonly warnings: number;
  readonly approvals: number;
  readonly lifecycle: number;
  readonly idempotency: number;
}> {
  const result = await pool.query<{
    revisions: number;
    bom: number;
    warnings: number;
    approvals: number;
    lifecycle: number;
    idempotency: number;
  }>(
    `SELECT
       (SELECT count(*)::integer FROM revisions WHERE project_id = $1) AS revisions,
       (SELECT count(*)::integer FROM revision_bom_lines_v2 line
          JOIN revisions revision ON revision.id = line.revision_id
         WHERE revision.project_id = $1) AS bom,
       (SELECT count(*)::integer FROM revision_warnings_v2 warning
          JOIN revisions revision ON revision.id = warning.revision_id
         WHERE revision.project_id = $1) AS warnings,
       (SELECT count(*)::integer FROM approvals approval
          JOIN revisions revision ON revision.id = approval.revision_id
         WHERE revision.project_id = $1) AS approvals,
       (SELECT count(*)::integer FROM revision_lifecycle_events
         WHERE project_id = $1) AS lifecycle,
       (SELECT count(*)::integer FROM idempotency_records record
         WHERE record.resource_type = 'revision'
           AND record.resource_id IN (SELECT id FROM revisions WHERE project_id = $1)) AS idempotency`,
    [projectId]
  );
  const counts = result.rows[0];
  if (!counts) throw new Error("Expected revision persistence counts");
  return counts;
}

async function verifyDisposableFourRoleAuthentication(pool: Pool): Promise<RevisionActor> {
  const store = new PgUserStore(pool);
  const authentication = new AuthService(store, "stage8-disposable-session-pepper");
  const administrator = await store.findUserByUsername("stage8.administrator");
  if (!administrator) throw new Error("Expected the disposable Stage 8 Administrator fixture");
  const administratorIdentity: SessionIdentity = {
    sessionHash: "stage8-disposable-administrator-session",
    user: administrator,
    expiresAt: new Date("2027-01-01T00:00:00.000Z")
  };
  const created = new Map<
    AppRole,
    { readonly id: string; readonly token: string; readonly identity: SessionIdentity }
  >();

  for (const role of APP_ROLES) {
    const password = `Disposable-${role}-42!Aa`;
    const user = await authentication.createUser(
      administratorIdentity,
      {
        username: `stage8.auth.${role}`,
        displayName: `Stage 8 Auth ${role}`,
        password,
        role
      },
      `stage8-auth-create-${role}`
    );
    const login = await authentication.login(user.username, password);
    const identity = await authentication.resolveSession(login.token);
    if (!identity) throw new Error(`Expected the disposable ${role} session`);
    expect(login.user.role).toBe(role);
    expect(login.user.capabilities).toEqual(expect.any(Array));
    expect(identity.user.role).toBe(role);
    created.set(role, { id: user.id, token: login.token, identity });
  }

  const listed = await authentication.listUsers(administratorIdentity, {
    limit: 100,
    cursor: null
  });
  expect(
    APP_ROLES.every((role) => listed.users.some((user) => user.id === created.get(role)?.id))
  ).toBe(true);

  const concurrentAdministrator = created.get("administrator");
  if (!concurrentAdministrator) throw new Error("Expected the disposable Administrator account");
  const app = await buildApp({
    store,
    sessionPepper: "stage8-disposable-session-pepper"
  });
  try {
    const duplicatePayload = {
      schemaVersion: "create-admin-user-request/v2",
      username: "stage8.auth.concurrent-duplicate",
      displayName: "Stage 8 Concurrent Duplicate",
      password: "Concurrent-Duplicate-42!Aa",
      role: "viewer"
    } as const;
    const duplicateHeaders = {
      host: "localhost:8080",
      origin: "http://localhost:8080",
      "x-niedax-csrf": "1",
      "x-correlation-id": "stage8-concurrent-duplicate-user",
      cookie: `niedax_session=${concurrentAdministrator.token}`
    };
    const duplicateResponses = await Promise.all([
      app.inject({
        method: "POST",
        url: "/api/v1/admin/users",
        headers: duplicateHeaders,
        payload: duplicatePayload
      }),
      app.inject({
        method: "POST",
        url: "/api/v1/admin/users",
        headers: duplicateHeaders,
        payload: duplicatePayload
      })
    ]);
    expect(duplicateResponses.map((response) => response.statusCode).sort()).toEqual([201, 409]);
    const conflict = duplicateResponses.find((response) => response.statusCode === 409);
    if (!conflict) throw new Error("Expected one concurrent duplicate username conflict");
    expect(ErrorEnvelopeV1Schema.parse(conflict.json())).toMatchObject({
      error: { code: "VALIDATION_FAILED", message: "Username is already in use", details: null }
    });
    expect(JSON.stringify(conflict.json())).not.toMatch(
      /23505|duplicate key|users_username_key|sql|constraint/iu
    );
    expect(
      (
        await pool.query<{ readonly count: number }>(
          "SELECT count(*)::integer AS count FROM users WHERE username = $1",
          [duplicatePayload.username]
        )
      ).rows[0]?.count
    ).toBe(1);
    expect(
      (
        await pool.query<{ readonly count: number }>(
          `SELECT count(*)::integer AS count
             FROM user_administration_audit_events
            WHERE correlation_id = $1 AND action = 'user.created' AND outcome = 'succeeded'`,
          [duplicateHeaders["x-correlation-id"]]
        )
      ).rows[0]?.count
    ).toBe(1);
  } finally {
    await app.close();
  }

  await expect(
    store.setUserRole({
      userId: administrator.id,
      role: "viewer",
      updatedBy: administrator.id,
      administration: {
        actor: administratorIdentity,
        correlationId: "stage8-direct-self-demotion"
      }
    })
  ).rejects.toEqual(new UserStoreInvariantError("CURRENT_ADMINISTRATOR_PROTECTED"));
  await expect(
    store.setUserEnabled({
      userId: administrator.id,
      enabled: false,
      updatedBy: administrator.id,
      administration: {
        actor: administratorIdentity,
        correlationId: "stage8-direct-self-disable"
      }
    })
  ).rejects.toEqual(new UserStoreInvariantError("CURRENT_ADMINISTRATOR_PROTECTED"));
  expect(await store.findUserByUsername(administrator.username)).toMatchObject({
    id: administrator.id,
    role: "administrator",
    enabled: true
  });

  const designer = created.get("designer");
  if (!designer) throw new Error("Expected the disposable Designer account");
  const catalogStatusBeforeForbiddenArchive = await pool.query<{ readonly status: string }>(
    "SELECT status FROM catalog_versions WHERE id = $1",
    [ids.catalog]
  );
  await expect(
    new PgCatalogAdminRepository(pool).archive({
      catalogVersionId: ids.catalog,
      actorId: designer.id,
      correlationId: "stage8-forbidden-catalog-archive",
      reason: "This direct repository invocation must be rejected"
    })
  ).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
  expect(
    (
      await pool.query<{ readonly status: string }>(
        "SELECT status FROM catalog_versions WHERE id = $1",
        [ids.catalog]
      )
    ).rows[0]
  ).toEqual(catalogStatusBeforeForbiddenArchive.rows[0]);
  const usersBeforeForbiddenCreate = await pool.query<{ readonly count: number }>(
    "SELECT count(*)::integer AS count FROM users"
  );
  await expect(
    authentication.createUser(
      designer.identity,
      {
        username: "stage8.auth.forbidden",
        displayName: "Stage 8 Forbidden",
        password: "Disposable-Forbidden-42!Aa",
        role: "viewer"
      },
      "stage8-auth-forbidden-create"
    )
  ).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
  expect(
    (await pool.query<{ readonly count: number }>("SELECT count(*)::integer AS count FROM users"))
      .rows[0]
  ).toEqual(usersBeforeForbiddenCreate.rows[0]);

  const reviewer = created.get("reviewer");
  if (!reviewer) throw new Error("Expected the disposable Reviewer account");
  await authentication.setRole(
    administratorIdentity,
    reviewer.id,
    "viewer",
    "stage8-auth-role-reviewer-to-viewer"
  );
  expect(await authentication.resolveSession(reviewer.token)).toBeNull();

  const viewer = created.get("viewer");
  if (!viewer) throw new Error("Expected the disposable Viewer account");
  await authentication.setEnabled(
    administratorIdentity,
    viewer.id,
    false,
    "stage8-auth-disable-viewer"
  );
  expect(await authentication.resolveSession(viewer.token)).toBeNull();

  const audit = await pool.query<{
    readonly action: string;
    readonly correlation_id: string;
    readonly actor_id: string | null;
  }>(
    `SELECT action,correlation_id,actor_id
       FROM user_administration_audit_events
      WHERE target_user_id = ANY($1::uuid[])
      ORDER BY created_at,id`,
    [[...created.values()].map((user) => user.id)]
  );
  expect(audit.rows.filter((event) => event.action === "user.created")).toHaveLength(4);
  expect(audit.rows.some((event) => event.action === "user.role_changed")).toBe(true);
  expect(audit.rows.some((event) => event.action === "user.disabled")).toBe(true);
  expect(audit.rows.every((event) => event.actor_id === administrator.id)).toBe(true);
  expect(
    (
      await pool.query<{
        readonly action: string;
        readonly actor_id: string | null;
        readonly target_user_id: string | null;
        readonly reason_code: string | null;
        readonly outcome: string;
        readonly metadata: { readonly requestedAction?: string };
      }>(
        `SELECT action,actor_id,target_user_id,reason_code,outcome,metadata
           FROM user_administration_audit_events
          WHERE correlation_id = 'stage8-auth-forbidden-create'`
      )
    ).rows
  ).toEqual([
    {
      action: "user.authorization_rejected",
      actor_id: designer.id,
      target_user_id: null,
      reason_code: "FORBIDDEN",
      outcome: "rejected",
      metadata: { requestedAction: "user.create" }
    }
  ]);
  return {
    id: designer.identity.user.id,
    username: designer.identity.user.username,
    displayName: designer.identity.user.displayName,
    role: "designer"
  };
}

describe.skipIf(!enabled)("Stage 7 persisted two-route application flow", () => {
  let pool: Pool;
  let service: ProjectApplicationService;
  let revisionService: RevisionApplicationService;
  let disposableDesigner: RevisionActor;
  const actor: ProjectActor = {
    id: ids.actor,
    role: "reviewer",
    displayName: "Stage 7 Owner"
  };

  beforeAll(async () => {
    pool = databasePool();
    await seedAcceptanceCatalog(pool);
    disposableDesigner = await verifyDisposableFourRoleAuthentication(pool);
    service = new ProjectApplicationService(new PgProjectRepository(pool));
    revisionService = new RevisionApplicationService(new PgRevisionRepository(pool));
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("persists draft changes, reloads and calculates two connected routes without a revision", async () => {
    const revisionsBefore = await pool.query<{ count: number }>(
      "SELECT count(*)::integer AS count FROM revisions"
    );
    const created = await service.createProject(
      actor,
      { schemaVersion: "create-project-draft-request/v2", draft: emptyDraft() },
      "stage7-acceptance-create-0001",
      "stage7-acceptance-create-correlation"
    );
    expect(created.statusCode).toBe(201);
    const projectId = created.body.project.id;
    const draft = completeDraft();
    const draftWithInitialManualItem = ProjectDraftInputV2Schema.parse({
      ...draft,
      manualItems: draft.manualItems.map((item) => ({
        ...item,
        descriptionEn: "Temporary site marker",
        note: "Initial manual item"
      }))
    });
    const savedInitialManualItem = await service.replaceProject(
      actor,
      projectId,
      {
        schemaVersion: "replace-project-draft-request/v2",
        expectedDraftVersion: created.body.project.draftVersion,
        draft: draftWithInitialManualItem
      },
      "stage7-acceptance-save-initial-manual",
      "stage7-acceptance-save-initial-manual-correlation"
    );
    const draftWithEditedManualItem = ProjectDraftInputV2Schema.parse({
      ...draftWithInitialManualItem,
      manualItems: draftWithInitialManualItem.manualItems.map((item) => ({
        ...item,
        descriptionEn: "Edited site marker",
        note: "Edited manual item"
      }))
    });
    const savedEditedManualItem = await service.replaceProject(
      actor,
      projectId,
      {
        schemaVersion: "replace-project-draft-request/v2",
        expectedDraftVersion: savedInitialManualItem.body.project.draftVersion,
        draft: draftWithEditedManualItem
      },
      "stage7-acceptance-save-edited-manual",
      "stage7-acceptance-save-edited-manual-correlation"
    );
    const draftWithoutManualItems = ProjectDraftInputV2Schema.parse({
      ...draftWithEditedManualItem,
      manualItems: []
    });
    const savedWithoutManualItems = await service.replaceProject(
      actor,
      projectId,
      {
        schemaVersion: "replace-project-draft-request/v2",
        expectedDraftVersion: savedEditedManualItem.body.project.draftVersion,
        draft: draftWithoutManualItems
      },
      "stage7-acceptance-save-without-manual",
      "stage7-acceptance-save-without-manual-correlation"
    );
    const saved = await service.replaceProject(
      actor,
      projectId,
      {
        schemaVersion: "replace-project-draft-request/v2",
        expectedDraftVersion: savedWithoutManualItems.body.project.draftVersion,
        draft
      },
      "stage7-acceptance-save-final-manual",
      "stage7-acceptance-save-final-manual-correlation"
    );
    expect(saved.statusCode).toBe(200);
    expect(saved.body.project.draftVersion).toBe(5);
    expect(saved.body.catalogSnapshot.snapshotId).toBe(ids.catalog);
    expect(saved.body.ruleSnapshot.snapshotId).toBe(ids.rules);
    const projectBeforeCalculation = await pool.query<{
      status: string;
      updated_at: Date;
      updated_by: string | null;
    }>("SELECT status,updated_at,updated_by FROM projects WHERE id = $1", [projectId]);

    const reloaded = await service.getProject(
      actor,
      projectId,
      "stage7-acceptance-reload-correlation"
    );
    expect(reloaded.catalogSnapshot).toEqual(saved.body.catalogSnapshot);
    expect(reloaded.ruleSnapshot).toEqual(saved.body.ruleSnapshot);
    expect(reloaded.project.routes).toHaveLength(2);
    expect(reloaded.project.connections).toEqual(draft.connections);
    expect(reloaded.project.manualItems).toEqual(draft.manualItems);
    expect(
      ProjectDraftInputV2Schema.parse({
        code: reloaded.project.code,
        name: reloaded.project.name,
        description: reloaded.project.description,
        defaultLocale: reloaded.project.defaultLocale,
        defaultReservePercent: reloaded.project.defaultReservePercent,
        cableLoad: reloaded.project.cableLoad,
        routes: reloaded.project.routes,
        connections: reloaded.project.connections,
        accessoryProductIds: reloaded.project.accessoryProductIds,
        manualItems: reloaded.project.manualItems
      })
    ).toEqual(draft);

    const validation = await service.validateProject(
      actor,
      projectId,
      {
        schemaVersion: "validate-project-draft-request/v2",
        expectedDraftVersion: reloaded.project.draftVersion
      },
      "stage7-acceptance-validate-correlation"
    );
    expect(validation.blockingErrors).toEqual([]);
    expect(validation.canCalculate).toBe(true);
    expect(validation.engineeringReview).toContainEqual(
      expect.objectContaining({ code: "UNRESOLVED_JOINT_PRODUCT" })
    );

    const calculation = await service.calculateProject(
      actor,
      projectId,
      {
        schemaVersion: "calculate-project-draft-request/v2",
        expectedDraftVersion: reloaded.project.draftVersion
      },
      "stage7-acceptance-calculate-0001",
      "stage7-acceptance-calculate-correlation"
    );
    expect(calculation.statusCode).toBe(200);
    expect(calculation.body.calculation.result.calculationStatus).toBe("completeWithWarnings");
    expect(calculation.body.calculation.result.summary.approvalReady).toBe(false);
    expect(calculation.body.calculation.result.warnings).toContainEqual(
      expect.objectContaining({
        code: "UNRESOLVED_JOINT_PRODUCT",
        severity: "blocking",
        approvalImpact: "blocksApproval"
      })
    );
    expect(calculation.body.calculation.result.bomLines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ productId: ids.straight }),
        expect.objectContaining({ kind: "manual", manualInputId: ids.manual })
      ])
    );

    const current = await service.getCurrentCalculation(
      actor,
      projectId,
      "stage7-acceptance-current-correlation"
    );
    expect(current.calculation?.stale).toBe(false);
    expect(current.calculation?.run.id).toBe(calculation.body.calculation.run.id);
    expect(current.calculation?.result).toEqual(calculation.body.calculation.result);

    const persisted = await pool.query<{
      input_payload: unknown;
      result_payload: unknown;
      calculated_draft_version: number;
    }>(
      `SELECT input_payload,result_payload,calculated_draft_version
         FROM calculation_drafts WHERE project_id = $1`,
      [projectId]
    );
    const input = CalculationInputV2Schema.parse(persisted.rows[0]?.input_payload);
    const result = CalculationResultV2Schema.parse(persisted.rows[0]?.result_payload);
    expect(input.project.routes.map((route) => route.id)).toEqual([ids.routeA, ids.routeB]);
    expect(input.project.connections.map((connection) => connection.id)).toEqual([ids.connection]);
    expect(input.manualItems.map((item) => item.id)).toEqual([ids.manual]);
    expect(result.calculationRunId).toBe(calculation.body.calculation.run.id);
    expect(persisted.rows[0]?.calculated_draft_version).toBe(5);

    const warningRows = await pool.query<{ count: number }>(
      `SELECT count(*)::integer AS count FROM warnings WHERE calculation_draft_id = $1`,
      [calculation.body.calculation.run.id]
    );
    expect(warningRows.rows[0]?.count).toBe(result.warnings.length);

    const replay = await service.calculateProject(
      actor,
      projectId,
      {
        schemaVersion: "calculate-project-draft-request/v2",
        expectedDraftVersion: reloaded.project.draftVersion
      },
      "stage7-acceptance-calculate-0001",
      "stage7-acceptance-replay-correlation"
    );
    expect(replay.replayed).toBe(true);
    expect(replay.body.calculation.run.id).toBe(calculation.body.calculation.run.id);

    const revisionsAfter = await pool.query<{ count: number }>(
      "SELECT count(*)::integer AS count FROM revisions"
    );
    expect(revisionsAfter.rows[0]).toEqual(revisionsBefore.rows[0]);
    const projectAfterCalculation = await pool.query<{
      status: string;
      updated_at: Date;
      updated_by: string | null;
    }>("SELECT status,updated_at,updated_by FROM projects WHERE id = $1", [projectId]);
    expect(projectAfterCalculation.rows[0]).toEqual(projectBeforeCalculation.rows[0]);

    const revisionActor: RevisionActor = {
      id: ids.actor,
      username: "stage7.owner",
      displayName: "Stage 7 Owner",
      role: "reviewer"
    };
    const otherReviewer: RevisionActor = {
      id: ids.otherActor,
      username: "stage7.other",
      displayName: "Stage 7 Other",
      role: "reviewer"
    };
    const administrator: RevisionActor = {
      id: ids.administrator,
      username: "stage8.administrator",
      displayName: "Stage 8 Administrator",
      role: "administrator"
    };
    const recalculated = await service.calculateProject(
      actor,
      projectId,
      {
        schemaVersion: "calculate-project-draft-request/v2",
        expectedDraftVersion: reloaded.project.draftVersion
      },
      "stage8-recalculate-before-save-0001",
      "stage8-recalculate-before-save-correlation"
    );
    expect(recalculated.body.calculation.run.id).not.toBe(calculation.body.calculation.run.id);
    expect(
      (await pool.query<{ count: number }>("SELECT count(*)::integer AS count FROM revisions"))
        .rows[0]
    ).toEqual(revisionsBefore.rows[0]);

    const saveRevision1Request = {
      schemaVersion: "save-project-revision-request/v2",
      expectedDraftVersion: reloaded.project.draftVersion,
      expectedLatestRevisionNumber: 0,
      calculationRunId: recalculated.body.calculation.run.id,
      inputFingerprint: recalculated.body.calculation.run.inputFingerprint,
      name: "Stage 8 unresolved review",
      comment: "Exact not-ready calculation retained for review"
    } as const;
    const savedRevision1 = await revisionService.saveRevision(
      revisionActor,
      projectId,
      saveRevision1Request,
      "stage8-save-revision-0001",
      "stage8-save-revision-correlation-0001"
    );
    expect(savedRevision1.statusCode).toBe(201);
    if ("recordVersion" in savedRevision1.body.revision)
      throw new Error("A new Stage 8 save cannot return a retained v1 revision");
    const revision1 = savedRevision1.body.revision;
    expect(revision1.summary.revisionNumber).toBe(1);
    expect(revision1.snapshot.calculationResult).toEqual(recalculated.body.calculation.result);
    expect(revision1.summary.approvalReady).toBe(false);

    const replayCountsBefore = await revisionPersistenceCounts(pool, projectId);
    const replayedRevision1 = await revisionService.saveRevision(
      revisionActor,
      projectId,
      saveRevision1Request,
      "stage8-save-revision-0001",
      "stage8-save-revision-replay-correlation"
    );
    expect(replayedRevision1).toEqual({ ...savedRevision1, replayed: true });
    expect(await revisionPersistenceCounts(pool, projectId)).toEqual(replayCountsBefore);

    await expect(
      revisionService.saveRevision(
        revisionActor,
        projectId,
        { ...saveRevision1Request, name: "Conflicting use of the persisted save key" },
        "stage8-save-revision-0001",
        "stage8-save-revision-conflict-correlation"
      )
    ).rejects.toMatchObject({ statusCode: 409, code: "IDEMPOTENCY_KEY_CONFLICT" });
    expect(await revisionPersistenceCounts(pool, projectId)).toEqual(replayCountsBefore);

    const designer = disposableDesigner;
    const designerProject = await service.createProject(
      designer,
      {
        schemaVersion: "create-project-draft-request/v2",
        draft: isolatedApprovalReadyDraft()
      },
      "stage8-designer-project-create-0001",
      "stage8-designer-project-create-correlation"
    );
    const designerCalculation = await service.calculateProject(
      designer,
      designerProject.body.project.id,
      {
        schemaVersion: "calculate-project-draft-request/v2",
        expectedDraftVersion: designerProject.body.project.draftVersion
      },
      "stage8-designer-project-calculate-0001",
      "stage8-designer-project-calculate-correlation"
    );
    const designerRevisionResult = await revisionService.saveRevision(
      designer,
      designerProject.body.project.id,
      {
        schemaVersion: "save-project-revision-request/v2",
        expectedDraftVersion: designerProject.body.project.draftVersion,
        expectedLatestRevisionNumber: 0,
        calculationRunId: designerCalculation.body.calculation.run.id,
        inputFingerprint: designerCalculation.body.calculation.run.inputFingerprint,
        name: "Designer-owned review candidate",
        comment: null
      },
      "stage8-designer-revision-save-0001",
      "stage8-designer-revision-save-correlation"
    );
    if ("recordVersion" in designerRevisionResult.body.revision) {
      throw new Error("A new Designer revision cannot use the retained v1 format");
    }
    const designerRevision = designerRevisionResult.body.revision;
    const designerCountsBeforeRejections = await revisionPersistenceCounts(
      pool,
      designerProject.body.project.id
    );
    const viewer: RevisionActor = {
      id: "20000000-0000-4000-8000-000000000954",
      username: "stage8.viewer",
      displayName: "Stage 8 Viewer",
      role: "viewer"
    };
    const designerCheckRequest = {
      schemaVersion: "check-project-revision-request/v2",
      expectedStatus: "calculated",
      expectedLatestRevisionNumber: 1,
      inputFingerprint: designerRevision.summary.inputFingerprint,
      comment: null
    } as const;
    await expect(
      revisionService.checkRevision(
        designer,
        designerRevision.summary.id,
        designerCheckRequest,
        "stage8-designer-check-0001",
        "stage8-designer-check-correlation"
      )
    ).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
    await expect(
      revisionService.checkRevision(
        designer,
        designerRevision.summary.id,
        designerCheckRequest,
        "stage8-designer-check-0001",
        "stage8-designer-check-retry-correlation"
      )
    ).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
    await expect(
      revisionService.checkRevision(
        designer,
        designerRevision.summary.id,
        { ...designerCheckRequest, comment: "Different rejected request body" },
        "stage8-designer-check-0001",
        "stage8-designer-check-mismatch-correlation"
      )
    ).rejects.toMatchObject({ statusCode: 409, code: "IDEMPOTENCY_KEY_CONFLICT" });
    await expect(
      revisionService.approveRevision(
        designer,
        designerRevision.summary.id,
        {
          schemaVersion: "approve-project-revision-request/v2",
          expectedStatus: "checked",
          expectedLatestRevisionNumber: 1,
          inputFingerprint: designerRevision.summary.inputFingerprint,
          comment: null
        },
        "stage8-designer-approve-0001",
        "stage8-designer-approve-correlation"
      )
    ).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
    const designerCountsAfterRejections = await revisionPersistenceCounts(
      pool,
      designerProject.body.project.id
    );
    expect({
      ...designerCountsAfterRejections,
      lifecycle: designerCountsBeforeRejections.lifecycle
    }).toEqual(designerCountsBeforeRejections);
    expect(designerCountsAfterRejections.lifecycle).toBe(
      designerCountsBeforeRejections.lifecycle + 2
    );

    const protectedCountsBefore = await revisionPersistenceCounts(pool, projectId);
    expect(
      (
        await pool.query(
          "SELECT id FROM project_audit_events WHERE correlation_id = 'stage8-viewer-save-correlation'"
        )
      ).rowCount
    ).toBe(0);
    await expect(
      revisionService.saveRevision(
        viewer,
        projectId,
        {
          schemaVersion: "save-project-revision-request/v2",
          expectedDraftVersion: reloaded.project.draftVersion,
          expectedLatestRevisionNumber: 1,
          calculationRunId: recalculated.body.calculation.run.id,
          inputFingerprint: recalculated.body.calculation.run.inputFingerprint,
          name: "Forbidden Viewer revision",
          comment: null
        },
        "stage8-viewer-save-0001",
        "stage8-viewer-save-correlation"
      )
    ).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
    expect(
      await revisionService.listRevisions(viewer, projectId, "stage8-viewer-read-correlation")
    ).toEqual(expect.objectContaining({ projectId, revisions: expect.any(Array) }));
    const protectedCountsAfter = await revisionPersistenceCounts(pool, projectId);
    expect(protectedCountsAfter).toEqual(protectedCountsBefore);
    expect(
      (
        await pool.query<{
          readonly action: string;
          readonly actor_id: string | null;
          readonly actor_role: string | null;
          readonly outcome: string;
          readonly reason_code: string | null;
          readonly metadata: { readonly requestedAction?: string };
        }>(
          `SELECT action,actor_id,actor_role,outcome,reason_code,metadata
             FROM project_audit_events
            WHERE correlation_id = 'stage8-viewer-save-correlation'`
        )
      ).rows
    ).toEqual([
      {
        action: "revision.save_authorization_rejected",
        actor_id: viewer.id,
        actor_role: "viewer",
        outcome: "rejected",
        reason_code: "FORBIDDEN",
        metadata: { requestedAction: "revision.saved" }
      }
    ]);
    const rejectionEvidence = await pool.query<{
      readonly action: string;
      readonly outcome: string;
      readonly actor_id: string | null;
      readonly reason_code: string | null;
      readonly metadata: { readonly requestedAction?: string };
    }>(
      `SELECT action,outcome,actor_id,reason_code,metadata
         FROM revision_lifecycle_events
        WHERE revision_id = $1 AND outcome = 'rejected'
        ORDER BY created_at,id`,
      [designerRevision.summary.id]
    );
    expect(rejectionEvidence.rows).toHaveLength(2);
    expect(rejectionEvidence.rows).toEqual(
      expect.arrayContaining([
        {
          action: "revision.authorization_rejected",
          outcome: "rejected",
          actor_id: designer.id,
          reason_code: "FORBIDDEN",
          metadata: { requestedAction: "revision.checked" }
        },
        {
          action: "revision.authorization_rejected",
          outcome: "rejected",
          actor_id: designer.id,
          reason_code: "FORBIDDEN",
          metadata: { requestedAction: "revision.approved" }
        }
      ])
    );

    const tooEarlyApprovalRequest = {
      schemaVersion: "approve-project-revision-request/v2",
      expectedStatus: "checked",
      expectedLatestRevisionNumber: 1,
      inputFingerprint: revision1.summary.inputFingerprint,
      comment: "This approval is intentionally too early"
    } as const;
    await expect(
      revisionService.approveRevision(
        otherReviewer,
        revision1.summary.id,
        tooEarlyApprovalRequest,
        "stage8-approve-too-early-0001",
        "stage8-approve-too-early-correlation"
      )
    ).rejects.toMatchObject({ statusCode: 409, code: "INVALID_STATE_TRANSITION" });

    const checkedRevision1 = await revisionService.checkRevision(
      otherReviewer,
      revision1.summary.id,
      {
        schemaVersion: "check-project-revision-request/v2",
        expectedStatus: "calculated",
        expectedLatestRevisionNumber: 1,
        inputFingerprint: revision1.summary.inputFingerprint,
        comment: "Reviewed but not approval-ready"
      },
      "stage8-check-revision-0001",
      "stage8-check-revision-correlation-0001"
    );
    expect(checkedRevision1.body.revision).toEqual(
      expect.objectContaining({ summary: expect.objectContaining({ status: "checked" }) })
    );
    await expect(
      revisionService.approveRevision(
        otherReviewer,
        revision1.summary.id,
        { ...tooEarlyApprovalRequest, comment: "Different body for the rejected key" },
        "stage8-approve-too-early-0001",
        "stage8-approve-too-early-mismatch-correlation"
      )
    ).rejects.toMatchObject({ statusCode: 409, code: "IDEMPOTENCY_KEY_CONFLICT" });
    await expect(
      revisionService.approveRevision(
        otherReviewer,
        revision1.summary.id,
        tooEarlyApprovalRequest,
        "stage8-approve-too-early-0001",
        "stage8-approve-too-early-retry-correlation"
      )
    ).rejects.toMatchObject({ statusCode: 409, code: "INVALID_STATE_TRANSITION" });
    expect(
      (
        await pool.query<{ readonly rejection_count: number; readonly approval_count: number }>(
          `SELECT
             (SELECT count(*)::integer FROM revision_lifecycle_events
               WHERE revision_id = $1
                 AND outcome = 'rejected'
                 AND metadata->>'requestedAction' = 'revision.approved'
                 AND correlation_id = 'stage8-approve-too-early-correlation') AS rejection_count,
             (SELECT count(*)::integer FROM approvals WHERE revision_id = $1) AS approval_count`,
          [revision1.summary.id]
        )
      ).rows[0]
    ).toEqual({ rejection_count: 1, approval_count: 0 });
    await expect(
      revisionService.approveRevision(
        otherReviewer,
        revision1.summary.id,
        {
          schemaVersion: "approve-project-revision-request/v2",
          expectedStatus: "checked",
          expectedLatestRevisionNumber: 1,
          inputFingerprint: revision1.summary.inputFingerprint,
          comment: null
        },
        "stage8-approve-not-ready-0001",
        "stage8-approve-not-ready-correlation"
      )
    ).rejects.toMatchObject({ statusCode: 409, code: "INVALID_STATE_TRANSITION" });

    const readySaved = await service.replaceProject(
      actor,
      projectId,
      {
        schemaVersion: "replace-project-draft-request/v2",
        expectedDraftVersion: reloaded.project.draftVersion,
        draft: approvalReadyDraft()
      },
      "stage8-ready-draft-0001",
      "stage8-ready-draft-correlation"
    );
    const readyCalculation = await service.calculateProject(
      actor,
      projectId,
      {
        schemaVersion: "calculate-project-draft-request/v2",
        expectedDraftVersion: readySaved.body.project.draftVersion
      },
      "stage8-ready-calculation-0001",
      "stage8-ready-calculation-correlation"
    );
    expect(readyCalculation.body.calculation.result.summary.approvalReady).toBe(true);

    await expect(
      service.replaceProject(
        { id: ids.otherActor, role: "reviewer", displayName: "Stage 7 Other" },
        projectId,
        {
          schemaVersion: "replace-project-draft-request/v2",
          expectedDraftVersion: readySaved.body.project.draftVersion,
          draft: approvalReadyDraft()
        },
        "stage8-cross-owner-edit-0001",
        "stage8-cross-owner-edit-correlation"
      )
    ).rejects.toMatchObject({ statusCode: 404, code: "RESOURCE_NOT_FOUND" });

    const savedRevision2 = await revisionService.saveRevision(
      revisionActor,
      projectId,
      {
        schemaVersion: "save-project-revision-request/v2",
        expectedDraftVersion: readySaved.body.project.draftVersion,
        expectedLatestRevisionNumber: 1,
        calculationRunId: readyCalculation.body.calculation.run.id,
        inputFingerprint: readyCalculation.body.calculation.run.inputFingerprint,
        name: "Stage 8 approval candidate",
        comment: "Ready synthetic revision"
      },
      "stage8-save-revision-0002",
      "stage8-save-revision-correlation-0002"
    );
    if ("recordVersion" in savedRevision2.body.revision)
      throw new Error("A new Stage 8 save cannot return a retained v1 revision");
    const revision2 = savedRevision2.body.revision;
    expect(revision2.summary.revisionNumber).toBe(2);
    await revisionService.checkRevision(
      otherReviewer,
      revision2.summary.id,
      {
        schemaVersion: "check-project-revision-request/v2",
        expectedStatus: "calculated",
        expectedLatestRevisionNumber: 2,
        inputFingerprint: revision2.summary.inputFingerprint,
        comment: "Cross-owner Reviewer check"
      },
      "stage8-check-revision-0002",
      "stage8-check-revision-correlation-0002"
    );
    const approvedRevision2 = await revisionService.approveRevision(
      otherReviewer,
      revision2.summary.id,
      {
        schemaVersion: "approve-project-revision-request/v2",
        expectedStatus: "checked",
        expectedLatestRevisionNumber: 2,
        inputFingerprint: revision2.summary.inputFingerprint,
        comment: "Cross-owner Reviewer approval"
      },
      "stage8-approve-revision-0002",
      "stage8-approve-revision-correlation-0002"
    );
    if ("recordVersion" in approvedRevision2.body.revision)
      throw new Error("An approved Stage 8 revision cannot become retained v1");
    const approvedDetail = approvedRevision2.body.revision;
    expect(approvedDetail.summary.status).toBe("approved");

    const laterDraft = ProjectDraftInputV2Schema.parse({
      ...approvalReadyDraft(),
      name: "Stage 8 later mutable draft"
    });
    const laterSaved = await service.replaceProject(
      actor,
      projectId,
      {
        schemaVersion: "replace-project-draft-request/v2",
        expectedDraftVersion: readySaved.body.project.draftVersion,
        draft: laterDraft
      },
      "stage8-later-draft-0001",
      "stage8-later-draft-correlation"
    );
    const laterCalculation = await service.calculateProject(
      actor,
      projectId,
      {
        schemaVersion: "calculate-project-draft-request/v2",
        expectedDraftVersion: laterSaved.body.project.draftVersion
      },
      "stage8-later-calculation-0001",
      "stage8-later-calculation-correlation"
    );
    const savedRevision3 = await revisionService.saveRevision(
      revisionActor,
      projectId,
      {
        schemaVersion: "save-project-revision-request/v2",
        expectedDraftVersion: laterSaved.body.project.draftVersion,
        expectedLatestRevisionNumber: 2,
        calculationRunId: laterCalculation.body.calculation.run.id,
        inputFingerprint: laterCalculation.body.calculation.run.inputFingerprint,
        name: "Stage 8 later revision",
        comment: null
      },
      "stage8-save-revision-0003",
      "stage8-save-revision-correlation-0003"
    );
    if ("recordVersion" in savedRevision3.body.revision)
      throw new Error("A new Stage 8 save cannot return a retained v1 revision");
    expect(savedRevision3.body.revision.summary.revisionNumber).toBe(3);

    const approvedAfterLaterWork = await revisionService.getRevision(
      viewer,
      revision2.summary.id,
      "stage8-approved-stability-correlation"
    );
    if ("recordVersion" in approvedAfterLaterWork.revision)
      throw new Error("The v2 approval unexpectedly changed record version");
    expect(approvedAfterLaterWork.revision.snapshot).toEqual(approvedDetail.snapshot);
    expect(approvedAfterLaterWork.revision.checksums).toEqual(approvedDetail.checksums);
    expect(approvedAfterLaterWork.revision.lifecycleEvents).toEqual(approvedDetail.lifecycleEvents);
    const finalHistory = await revisionService.listRevisions(
      viewer,
      projectId,
      "stage8-final-history-correlation"
    );
    expect(finalHistory.revisions.map((revision) => revision.revisionNumber)).toEqual([3, 2, 1]);

    const countsBeforeConcurrentSave = await revisionPersistenceCounts(pool, projectId);
    const concurrentSaveBase = {
      schemaVersion: "save-project-revision-request/v2",
      expectedDraftVersion: laterSaved.body.project.draftVersion,
      expectedLatestRevisionNumber: 3,
      calculationRunId: laterCalculation.body.calculation.run.id,
      inputFingerprint: laterCalculation.body.calculation.run.inputFingerprint,
      comment: "Competing Stage 8 save"
    } as const;
    const concurrentSaves = await Promise.allSettled([
      revisionService.saveRevision(
        revisionActor,
        projectId,
        { ...concurrentSaveBase, name: "Concurrent candidate A" },
        "stage8-concurrent-save-0001-a",
        "stage8-concurrent-save-correlation-a"
      ),
      revisionService.saveRevision(
        revisionActor,
        projectId,
        { ...concurrentSaveBase, name: "Concurrent candidate B" },
        "stage8-concurrent-save-0001-b",
        "stage8-concurrent-save-correlation-b"
      )
    ]);
    const successfulConcurrentSaves = concurrentSaves.flatMap((outcome) =>
      outcome.status === "fulfilled" ? [outcome.value] : []
    );
    const rejectedConcurrentSaves = concurrentSaves.flatMap((outcome) =>
      outcome.status === "rejected" ? [outcome.reason] : []
    );
    expect(successfulConcurrentSaves).toHaveLength(1);
    expect(rejectedConcurrentSaves).toHaveLength(1);
    expect(rejectedConcurrentSaves[0]).toMatchObject({
      statusCode: 409,
      code: "CONFLICT_STALE_VERSION"
    });
    const concurrentSaveWinner = successfulConcurrentSaves[0];
    if (!concurrentSaveWinner || "recordVersion" in concurrentSaveWinner.body.revision) {
      throw new Error("The concurrent Stage 8 save did not return a v2 revision");
    }
    const revision4 = concurrentSaveWinner.body.revision;
    expect(revision4.summary.revisionNumber).toBe(4);
    const countsAfterConcurrentSave = await revisionPersistenceCounts(pool, projectId);
    expect(countsAfterConcurrentSave.revisions).toBe(countsBeforeConcurrentSave.revisions + 1);
    expect(countsAfterConcurrentSave.lifecycle).toBe(countsBeforeConcurrentSave.lifecycle + 1);
    expect(countsAfterConcurrentSave.idempotency).toBe(countsBeforeConcurrentSave.idempotency + 1);
    expect(countsAfterConcurrentSave.approvals).toBe(countsBeforeConcurrentSave.approvals);
    expect(
      (
        await pool.query<{ revision_number: number }>(
          "SELECT revision_number FROM revisions WHERE project_id = $1 ORDER BY revision_number DESC",
          [projectId]
        )
      ).rows.map((row) => row.revision_number)
    ).toEqual([4, 3, 2, 1]);
    expect(
      (
        await pool.query(
          `SELECT id FROM idempotency_records
            WHERE resource_id = $1
              AND idempotency_key IN ('stage8-concurrent-save-0001-a','stage8-concurrent-save-0001-b')`,
          [revision4.summary.id]
        )
      ).rowCount
    ).toBe(1);

    const competingCheckKey = "stage8-competing-check-scope-0001";
    const revision4CheckRequest = {
      schemaVersion: "check-project-revision-request/v2",
      expectedStatus: "calculated",
      expectedLatestRevisionNumber: 4,
      inputFingerprint: revision4.summary.inputFingerprint,
      comment: "Competing Reviewer check"
    } as const;
    const competingChecks = await Promise.allSettled([
      revisionService.checkRevision(
        revisionActor,
        revision4.summary.id,
        revision4CheckRequest,
        competingCheckKey,
        "stage8-competing-check-correlation-a"
      ),
      revisionService.checkRevision(
        otherReviewer,
        revision4.summary.id,
        revision4CheckRequest,
        competingCheckKey,
        "stage8-competing-check-correlation-b"
      )
    ]);
    expect(competingChecks.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    const rejectedChecks = competingChecks.flatMap((outcome) =>
      outcome.status === "rejected" ? [outcome.reason] : []
    );
    expect(rejectedChecks).toHaveLength(1);
    expect(rejectedChecks[0]).toMatchObject({
      statusCode: 409,
      code: "INVALID_STATE_TRANSITION"
    });
    const checkingActor =
      competingChecks[0]?.status === "fulfilled" ? revisionActor : otherReviewer;
    expect(
      (
        await pool.query<{ count: number }>(
          `SELECT count(*)::integer AS count FROM revision_lifecycle_events
            WHERE revision_id = $1 AND action = 'revision.checked' AND outcome = 'succeeded'`,
          [revision4.summary.id]
        )
      ).rows[0]?.count
    ).toBe(1);
    const approvedRevision4 = await revisionService.approveRevision(
      checkingActor,
      revision4.summary.id,
      {
        schemaVersion: "approve-project-revision-request/v2",
        expectedStatus: "checked",
        expectedLatestRevisionNumber: 4,
        inputFingerprint: revision4.summary.inputFingerprint,
        comment: "Same actor/key, different action scope"
      },
      competingCheckKey,
      "stage8-action-separated-approve-correlation"
    );
    expect(approvedRevision4.body.revision).toEqual(
      expect.objectContaining({ summary: expect.objectContaining({ status: "approved" }) })
    );
    expect(
      (
        await pool.query(
          `SELECT id FROM idempotency_records
            WHERE resource_id = $1 AND idempotency_key = $2`,
          [revision4.summary.id, competingCheckKey]
        )
      ).rowCount
    ).toBe(2);

    const savedRevision5 = await revisionService.saveRevision(
      revisionActor,
      projectId,
      {
        schemaVersion: "save-project-revision-request/v2",
        expectedDraftVersion: laterSaved.body.project.draftVersion,
        expectedLatestRevisionNumber: 4,
        calculationRunId: laterCalculation.body.calculation.run.id,
        inputFingerprint: laterCalculation.body.calculation.run.inputFingerprint,
        name: "Competing approval candidate",
        comment: null
      },
      "stage8-save-revision-0005",
      "stage8-save-revision-correlation-0005"
    );
    if ("recordVersion" in savedRevision5.body.revision) {
      throw new Error("The competing approval candidate is not a v2 revision");
    }
    const revision5 = savedRevision5.body.revision;
    await revisionService.checkRevision(
      otherReviewer,
      revision5.summary.id,
      {
        schemaVersion: "check-project-revision-request/v2",
        expectedStatus: "calculated",
        expectedLatestRevisionNumber: 5,
        inputFingerprint: revision5.summary.inputFingerprint,
        comment: null
      },
      "stage8-check-revision-0005",
      "stage8-check-revision-correlation-0005"
    );
    const competingApprovalKey = "stage8-competing-approval-scope-0001";
    const revision5ApproveRequest = {
      schemaVersion: "approve-project-revision-request/v2",
      expectedStatus: "checked",
      expectedLatestRevisionNumber: 5,
      inputFingerprint: revision5.summary.inputFingerprint,
      comment: "Competing approval"
    } as const;
    const competingApprovals = await Promise.allSettled([
      revisionService.approveRevision(
        revisionActor,
        revision5.summary.id,
        revision5ApproveRequest,
        competingApprovalKey,
        "stage8-competing-approval-correlation-a"
      ),
      revisionService.approveRevision(
        otherReviewer,
        revision5.summary.id,
        revision5ApproveRequest,
        competingApprovalKey,
        "stage8-competing-approval-correlation-b"
      )
    ]);
    expect(competingApprovals.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    const rejectedApprovals = competingApprovals.flatMap((outcome) =>
      outcome.status === "rejected" ? [outcome.reason] : []
    );
    expect(rejectedApprovals).toHaveLength(1);
    expect(rejectedApprovals[0]).toMatchObject({
      statusCode: 409,
      code: "INVALID_STATE_TRANSITION"
    });
    const revision5Evidence = await pool.query<{
      approvals: number;
      approval_events: number;
      approval_idempotency: number;
    }>(
      `SELECT
         (SELECT count(*)::integer FROM approvals
           WHERE revision_id = $1 AND decision = 'approved') AS approvals,
         (SELECT count(*)::integer FROM revision_lifecycle_events
           WHERE revision_id = $1 AND action = 'revision.approved' AND outcome = 'succeeded')
           AS approval_events,
         (SELECT count(*)::integer FROM idempotency_records
           WHERE resource_id = $1 AND idempotency_key = $2) AS approval_idempotency`,
      [revision5.summary.id, competingApprovalKey]
    );
    expect(revision5Evidence.rows[0]).toEqual({
      approvals: 1,
      approval_events: 1,
      approval_idempotency: 1
    });
    expect(
      (
        await pool.query<{ revision_number: number }>(
          "SELECT revision_number FROM revisions WHERE project_id = $1 ORDER BY revision_number DESC",
          [projectId]
        )
      ).rows.map((row) => row.revision_number)
    ).toEqual([5, 4, 3, 2, 1]);

    const scopedProject = await service.createProject(
      actor,
      {
        schemaVersion: "create-project-draft-request/v2",
        draft: isolatedApprovalReadyDraft()
      },
      "stage8-scope-project-create-0001",
      "stage8-scope-project-create-correlation"
    );
    const scopedProjectId = scopedProject.body.project.id;
    const scopedCalculation = await service.calculateProject(
      actor,
      scopedProjectId,
      {
        schemaVersion: "calculate-project-draft-request/v2",
        expectedDraftVersion: scopedProject.body.project.draftVersion
      },
      "stage8-scope-project-calculate-0001",
      "stage8-scope-project-calculate-correlation"
    );
    expect(scopedCalculation.body.calculation.result.summary.approvalReady).toBe(true);
    const scopedRevision1 = await revisionService.saveRevision(
      revisionActor,
      scopedProjectId,
      {
        schemaVersion: "save-project-revision-request/v2",
        expectedDraftVersion: scopedProject.body.project.draftVersion,
        expectedLatestRevisionNumber: 0,
        calculationRunId: scopedCalculation.body.calculation.run.id,
        inputFingerprint: scopedCalculation.body.calculation.run.inputFingerprint,
        name: "Same key in another project",
        comment: null
      },
      "stage8-save-revision-0001",
      "stage8-project-scope-save-correlation"
    );
    if ("recordVersion" in scopedRevision1.body.revision) {
      throw new Error("The project-scope revision is not v2");
    }
    const scopedRevision2 = await revisionService.saveRevision(
      administrator,
      scopedProjectId,
      {
        schemaVersion: "save-project-revision-request/v2",
        expectedDraftVersion: scopedProject.body.project.draftVersion,
        expectedLatestRevisionNumber: 1,
        calculationRunId: scopedCalculation.body.calculation.run.id,
        inputFingerprint: scopedCalculation.body.calculation.run.inputFingerprint,
        name: "Same key in another actor scope",
        comment: null
      },
      "stage8-save-revision-0001",
      "stage8-actor-scope-save-correlation"
    );
    if ("recordVersion" in scopedRevision2.body.revision) {
      throw new Error("The actor-scope revision is not v2");
    }
    expect(scopedRevision2.body.revision.summary.revisionNumber).toBe(2);
    const scopedRevision2Id = scopedRevision2.body.revision.summary.id;
    const sharedActionKey = "stage8-action-scope-shared-0001";
    await revisionService.checkRevision(
      administrator,
      scopedRevision2Id,
      {
        schemaVersion: "check-project-revision-request/v2",
        expectedStatus: "calculated",
        expectedLatestRevisionNumber: 2,
        inputFingerprint: scopedRevision2.body.revision.summary.inputFingerprint,
        comment: null
      },
      sharedActionKey,
      "stage8-action-scope-check-correlation"
    );
    await revisionService.approveRevision(
      administrator,
      scopedRevision2Id,
      {
        schemaVersion: "approve-project-revision-request/v2",
        expectedStatus: "checked",
        expectedLatestRevisionNumber: 2,
        inputFingerprint: scopedRevision2.body.revision.summary.inputFingerprint,
        comment: null
      },
      sharedActionKey,
      "stage8-action-scope-approve-correlation"
    );
    const repeatedSaveKeyScopes = await pool.query<{ scope: string }>(
      `SELECT scope FROM idempotency_records
        WHERE resource_type = 'revision' AND idempotency_key = 'stage8-save-revision-0001'
        ORDER BY scope`
    );
    expect(repeatedSaveKeyScopes.rows.map((row) => row.scope)).toEqual(
      expect.arrayContaining([
        `revision.save:${projectId}:${revisionActor.id}`,
        `revision.save:${scopedProjectId}:${revisionActor.id}`,
        `revision.save:${scopedProjectId}:${administrator.id}`
      ])
    );
    expect(repeatedSaveKeyScopes.rowCount).toBe(3);
    expect(
      (
        await pool.query<{ scope: string }>(
          `SELECT scope FROM idempotency_records
            WHERE resource_id = $1 AND idempotency_key = $2 ORDER BY scope`,
          [scopedRevision2Id, sharedActionKey]
        )
      ).rows.map((row) => row.scope)
    ).toEqual([
      `revision.approved:${scopedRevision2Id}:${administrator.id}`,
      `revision.checked:${scopedRevision2Id}:${administrator.id}`
    ]);
  });

  it("runs Stage 9 export authorization, binary integrity, idempotency, lifecycle capture and recovery using the application database role", async () => {
    await verifyExportAcceptance(pool, isolatedApprovalReadyDraft());
  });
});
