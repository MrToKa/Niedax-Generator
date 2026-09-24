import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { catalogSheetNames, type CatalogPipelineResult } from "@niedax/catalog-import";
import type { Pool } from "pg";

import { AuthService } from "./auth-service.js";
import { PgUserStore } from "./pg-store.js";
import type { UserStore } from "./domain.js";
import { PgCatalogAdminRepository } from "./catalog-repository.js";
import { CatalogAdminService, type CatalogUploadFile } from "./catalog-service.js";
import { ProjectApplicationService, type ProjectOperations } from "./project-service.js";
import { PgProjectRepository } from "./project-repository.js";
import { RevisionApplicationService, type RevisionOperations } from "./revision-service.js";
import { PgRevisionRepository, type RevisionActor } from "./revision-repository.js";
import {
  parseStage11Accounts,
  stage11AccountRoles,
  type Stage11Accounts
} from "./stage11-seed-contract.js";
import { stage11DemoProjects } from "./stage11-demo-projects.js";
import type { ProjectDraftInputV2 } from "@niedax/domain";

export async function provisionStage11Users(
  store: UserStore,
  auth: AuthService,
  accounts: Stage11Accounts
) {
  if (!(await store.findUserByUsername(accounts.administrator.username)))
    await auth.createInitialAdministrator({
      ...accounts.administrator,
      displayName: "TEST Administrator"
    });
  const login = await auth.login(accounts.administrator.username, accounts.administrator.password);
  try {
    const identity = await auth.resolveSession(login.token);
    if (!identity || identity.user.role !== "administrator")
      throw new Error("TEST administrator unavailable");
    const actors = {} as Record<(typeof stage11AccountRoles)[number], RevisionActor>;
    for (const role of stage11AccountRoles) {
      let user = await store.findUserByUsername(accounts[role].username);
      if (!user) {
        await auth.createUser(
          identity,
          { ...accounts[role], displayName: `TEST ${role}`, role },
          `stage11-seed-user-${role}`
        );
        user = await store.findUserByUsername(accounts[role].username);
      }
      if (!user?.enabled || user.role !== role)
        throw new Error(
          `Existing TEST ${role} account differs; explicit administrator recovery required`
        );
      actors[role] = {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role
      };
    }
    return actors;
  } finally {
    await auth.logout(login.token);
  }
}

export async function provisionStage11Catalog(
  service: CatalogAdminService,
  files: readonly CatalogUploadFile[],
  actorId: string,
  expectedContentHash: string
): Promise<{ id: string; version: string; contentHash: string; pipeline: CatalogPipelineResult }> {
  const pipeline = await service.preview(files, "administrator");
  if (!pipeline.report.valid || pipeline.bundle.contentHash !== expectedContentHash)
    throw new Error("Canonical TEST catalog differs from its validated acceptance identity");
  const manifest = pipeline.bundle.manifest[0];
  if (!manifest) throw new Error("Canonical TEST catalog manifest missing");
  const versions = await service.listVersions("administrator");
  const existing = versions.find(
    (item) =>
      item.scope === manifest.importScope && item.version === manifest.candidateCatalogVersion
  );
  if (existing && existing.contentHash !== pipeline.bundle.contentHash)
    throw new Error("Existing TEST catalog identity differs; explicit catalog migration required");
  if (existing?.status === "archived")
    throw new Error("Refusing to reactivate archived TEST catalog automatically");
  const context = {
    actorId,
    actorRole: "administrator" as const,
    correlationId: "stage11-seed-catalog"
  };
  let version = existing ?? (await service.importDraft({ ...context, files }));
  if (version.status === "draft")
    version = await service.validate({ ...context, catalogVersionId: version.id });
  const change = {
    ...context,
    catalogVersionId: version.id,
    contentHash: pipeline.bundle.contentHash,
    reason:
      "Automated TEST-only provisioning of the pinned Stage 5 validated candidate; no Stage 10 domain acceptance is implied."
  };
  if (version.status === "validated") version = await service.approve(change);
  if (version.status === "approved") version = await service.activate(change);
  if (version.status !== "active") throw new Error("TEST catalog did not become active");
  return {
    id: version.id,
    version: version.version,
    contentHash: pipeline.bundle.contentHash,
    pipeline
  };
}

export interface Stage11DemoDependencies {
  projects: ProjectOperations;
  revisions: RevisionOperations;
  actors: Record<"designer" | "reviewer" | "administrator", RevisionActor>;
  findProject(code: string): Promise<{ id: string; ownerId: string | null; name: string } | null>;
}

export async function provisionStage11Demo(
  dependencies: Stage11DemoDependencies,
  draft: ProjectDraftInputV2
): Promise<{ code: string; projectId: string; revisionStatus: string; preserved: boolean }> {
  const { projects, revisions, actors } = dependencies;
  const correlation = `stage11-${draft.code.toLowerCase()}`;
  const existing = await dependencies.findProject(draft.code);
  if (existing && (existing.ownerId !== actors.designer.id || existing.name !== draft.name))
    throw new Error("TEST demo identity collision; existing user data was preserved");
  const project = existing
    ? (await projects.getProject(actors.designer, existing.id, correlation)).project
    : (
        await projects.createProject(
          actors.designer,
          { schemaVersion: "create-project-draft-request/v2", draft },
          `${correlation}-create-v1`,
          correlation
        )
      ).body.project;
  const saved = await revisions.listRevisions(actors.reviewer, project.id, correlation);
  if (saved.revisions.length) {
    // Saved baseline snapshots, later edits and human review decisions are never overwritten.
    return {
      code: draft.code,
      projectId: project.id,
      revisionStatus: saved.revisions[0]!.status,
      preserved: true
    };
  }
  if (project.draftVersion !== 1)
    throw new Error("An unfinished TEST demo was edited; explicit recovery is required");
  const calculation = await projects.calculateProject(
    actors.designer,
    project.id,
    {
      schemaVersion: "calculate-project-draft-request/v2",
      expectedDraftVersion: project.draftVersion
    },
    `${correlation}-calculate-v1`,
    correlation
  );
  const run = calculation.body.calculation.run;
  const savedReply = await revisions.saveRevision(
    actors.designer,
    project.id,
    {
      schemaVersion: "save-project-revision-request/v2",
      expectedDraftVersion: project.draftVersion,
      expectedLatestRevisionNumber: 0,
      calculationRunId: run.id,
      inputFingerprint: run.inputFingerprint,
      name: "TEST baseline v1",
      comment:
        "Automated demonstration snapshot; inspect unresolved material/engineering warnings. Not domain approval."
    },
    `${correlation}-save-v1`,
    correlation
  );
  let revision = (
    await revisions.getRevision(actors.reviewer, savedReply.body.revision.summary.id, correlation)
  ).revision.summary;
  if (
    draft.code === "S11-DEMO-APPROVAL" &&
    revision.recordVersion === "revision/v2" &&
    revision.actions.check.allowed
  ) {
    const checked = await revisions.checkRevision(
      actors.reviewer,
      revision.id,
      {
        schemaVersion: "check-project-revision-request/v2",
        expectedStatus: "calculated",
        expectedLatestRevisionNumber: revision.revisionNumber,
        inputFingerprint: revision.inputFingerprint,
        comment: "Automated TEST lifecycle demonstration only; no engineering or Stage 10 sign-off."
      },
      `${correlation}-check-v1`,
      correlation
    );
    revision = checked.body.revision.summary;
    if (revision.recordVersion === "revision/v2" && revision.actions.approve.allowed) {
      revision = (
        await revisions.approveRevision(
          actors.reviewer,
          revision.id,
          {
            schemaVersion: "approve-project-revision-request/v2",
            expectedStatus: "checked",
            expectedLatestRevisionNumber: revision.revisionNumber,
            inputFingerprint: revision.inputFingerprint,
            comment:
              "Automated TEST lifecycle demonstration only; no engineering or Stage 10 sign-off."
          },
          `${correlation}-approve-v1`,
          correlation
        )
      ).body.revision.summary;
    }
  }
  return {
    code: draft.code,
    projectId: project.id,
    revisionStatus: revision.status,
    preserved: false
  };
}

export async function seedStage11(
  pool: Pool,
  pepper: string,
  rawAccounts: unknown,
  catalogDirectory: string
) {
  const accounts = parseStage11Accounts(rawAccounts);
  // A dedicated session lock serializes concurrent setup/deployment processes without adding a migration framework.
  const lock = await pool.connect();
  try {
    const acquired = await lock.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock(7112022,11) AS locked"
    );
    if (!acquired.rows[0]?.locked) throw new Error("Another persistent TEST seed is running");
    const store = new PgUserStore(pool);
    const actors = await provisionStage11Users(store, new AuthService(store, pepper), accounts);
    const files = await Promise.all(
      catalogSheetNames.map(async (sheet) => ({
        name: `${sheet}.csv`,
        contentBase64: (await readFile(resolve(catalogDirectory, `${sheet}.csv`))).toString(
          "base64"
        )
      }))
    );
    const acceptance = JSON.parse(
      await readFile(resolve(catalogDirectory, "acceptance.json"), "utf8")
    ) as { contentHash: string };
    const catalog = await provisionStage11Catalog(
      new CatalogAdminService(new PgCatalogAdminRepository(pool)),
      files,
      actors.administrator.id,
      acceptance.contentHash
    );
    const projects = new ProjectApplicationService(new PgProjectRepository(pool));
    const revisions = new RevisionApplicationService(new PgRevisionRepository(pool));
    const editor = await projects.getEditorCatalog(actors.designer, "stage11-seed-editor");
    const demos = [];
    for (const draft of stage11DemoProjects(editor))
      demos.push(
        await provisionStage11Demo(
          {
            projects,
            revisions,
            actors,
            findProject: async (code) => {
              const result = await pool.query<{ id: string; ownerId: string | null; name: string }>(
                'SELECT id, owner_id AS "ownerId", name FROM projects WHERE code = $1',
                [code]
              );
              if (result.rows.length > 1)
                throw new Error("Duplicate TEST demo identities detected");
              return result.rows[0] ?? null;
            }
          },
          draft
        )
      );
    return {
      schemaVersion: "stage11-seed/v1",
      environment: "test",
      catalogVersion: catalog.version,
      catalogContentHash: catalog.contentHash,
      ruleVersion: editor.ruleSnapshot.version,
      accounts: stage11AccountRoles.map((role) => ({ username: accounts[role].username, role })),
      demos,
      limitations: [
        "Demo geometry is synthetic. P0 source-backed catalog coverage is limited; unresolved fitting, physical-joint and endpoint calculation facts remain visible warnings.",
        "Automated demo lifecycle actions are not domain or operational acceptance."
      ]
    };
  } finally {
    await lock.query("SELECT pg_advisory_unlock(7112022,11)").catch(() => undefined);
    lock.release();
  }
}
