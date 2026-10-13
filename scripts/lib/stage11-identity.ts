import { createHash } from "node:crypto";

import {
  ActiveDatabaseVersionsSchema,
  DatabaseIdV2Schema,
  FeatureFlagsSchema,
  ProjectRevisionChecksumsV2Schema,
  ProjectRevisionStatusV2Schema,
  Sha256Schema,
  VersionIdentifierV2Schema,
  type ActiveDatabaseVersions,
  type FeatureFlags,
  type ProjectRevisionChecksumsV2
} from "../../packages/domain/src/index.js";
import { canonicalJson } from "../../packages/calculation-engine/src/index.js";
import {
  parseRestoreSnapshot,
  assertRepresentativeRestore,
  testDatabaseQueryArguments,
  TEST_RESTORE_SNAPSHOT_SQL,
  type TestRestoreSnapshot
} from "./stage11-backup.js";
import { TEST_PROJECT } from "./stage11-config.js";

export const TEST_IMAGE_SERVICES = [
  "backend",
  "frontend",
  "gateway",
  "postgres",
  "migrations",
  "backup"
] as const;
export type TestImageService = (typeof TEST_IMAGE_SERVICES)[number];

export interface TestImageIdentity {
  readonly service: TestImageService;
  readonly configuredReference: string;
  readonly imageId: string;
  readonly repositoryDigests: readonly string[];
}

interface IdentityContext {
  /** The caller must validate the owned TEST topology before every observation. */
  readonly assertSafe: () => Promise<void>;
  readonly imageReferences: Readonly<Record<TestImageService, string>>;
  readonly runDocker: (args: readonly string[]) => Promise<string>;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid TEST identity metadata");
  return value as Record<string, unknown>;
}

function list(value: unknown): unknown[] {
  if (!Array.isArray(value) || value.length > 10_000)
    throw new Error("Invalid TEST identity metadata");
  return value;
}

/** Constrained Docker templates deliberately exclude environment, labels and full inspect data. */
export async function captureTestImages(context: IdentityContext): Promise<TestImageIdentity[]> {
  await context.assertSafe();
  const images: TestImageIdentity[] = [];
  for (const service of TEST_IMAGE_SERVICES) {
    const configuredReference = context.imageReferences[service];
    if (
      typeof configuredReference !== "string" ||
      configuredReference.length > 512 ||
      !/^[a-z0-9][a-z0-9._:/@-]+$/u.test(configuredReference)
    )
      throw new Error("Invalid TEST image reference");
    let inspected: Record<string, unknown>;
    try {
      inspected = object(
        JSON.parse(
          await context.runDocker([
            "image",
            "inspect",
            "--format",
            '{"imageId":{{json .Id}},"repositoryDigests":{{json .RepoDigests}}}',
            configuredReference
          ])
        )
      );
    } catch {
      throw new Error(`Cannot observe immutable TEST ${service} image identity`);
    }
    const repositoryDigests =
      inspected.repositoryDigests === null ? [] : inspected.repositoryDigests;
    if (
      typeof inspected.imageId !== "string" ||
      !/^sha256:[a-f0-9]{64}$/u.test(inspected.imageId) ||
      !Array.isArray(repositoryDigests) ||
      repositoryDigests.length > 100 ||
      repositoryDigests.some(
        (value: unknown) =>
          typeof value !== "string" ||
          value.length > 512 ||
          !/^[a-z0-9][a-z0-9._:/-]*@sha256:[a-f0-9]{64}$/u.test(value)
      )
    )
      throw new Error(`Invalid immutable TEST ${service} image identity`);
    images.push({
      service,
      configuredReference,
      imageId: inspected.imageId,
      repositoryDigests: [...new Set(repositoryDigests as string[])].sort()
    });
  }
  return images;
}

/** Existing backup fingerprint and selected stored identities share one PostgreSQL snapshot.
 * No project descriptions, inputs, user records, session values or workbook bytes leave PostgreSQL.
 */
export const TEST_DEPLOYMENT_IDENTITY_SQL = `
WITH restore_evidence AS (${TEST_RESTORE_SNAPSHOT_SQL})
SELECT jsonb_build_object(
  'snapshot', (SELECT evidence::jsonb FROM restore_evidence),
  'activeCatalogs', (SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',id,'scope',scope,'version',version,'contentHash',content_hash) ORDER BY id),'[]')
    FROM catalog_versions WHERE status='active'),
  'activeRules', (SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',id,'scope',scope,'version',version,'contentHash',content_hash,
    'catalogVersionId',catalog_version_id) ORDER BY id),'[]') FROM rule_sets WHERE status='active'),
  'revisions', (SELECT coalesce(jsonb_agg(jsonb_build_object(
    'projectId',r.project_id,'revisionId',r.id,'revisionNumber',r.revision_number,
    'status',r.status,'engineVersion',r.engine_version,'inputFingerprint',r.input_fingerprint,
    'catalogSnapshot',jsonb_build_object('id',r.catalog_snapshot_id,
      'version',r.catalog_snapshot_version,'contentHash',r.catalog_snapshot_content_hash),
    'ruleSnapshot',jsonb_build_object('id',r.rule_snapshot_id,
      'version',r.rule_snapshot_version,'contentHash',r.rule_snapshot_content_hash),
    'checksums',jsonb_build_object('projectChecksum',r.project_checksum,
      'inputChecksum',r.input_checksum,'snapshotChecksum',r.snapshot_checksum,
      'resultChecksum',r.result_checksum,'bomChecksum',r.bom_checksum,
      'warningsChecksum',r.warnings_checksum,'revisionChecksum',r.revision_checksum)
    ) ORDER BY r.project_id,r.revision_number),'[]')
    FROM revisions r JOIN projects p ON p.id=r.project_id
    WHERE p.code LIKE 'S11-DEMO-%' AND r.snapshot_schema_version='revision-snapshot/v2'),
  'readyExports', (SELECT coalesce(jsonb_agg(jsonb_build_object(
    'artifactId',e.id,'revisionId',e.revision_id,'contentHash',e.content_hash,
    'contentLength',e.content_length,'cacheIdentity',e.cache_identity,
    'revisionChecksum',e.context_payload->'checksums'->>'revisionChecksum',
    'capturedLifecycleStatus',e.context_payload->'revision'->>'status',
    'templateId',e.context_payload->'versions'->>'templateId',
    'templateSha256',e.context_payload->'versions'->>'templateSha256',
    'mappingVersion',e.context_payload->'versions'->>'mappingVersion',
    'rendererVersion',e.context_payload->'versions'->>'rendererVersion'
    ) ORDER BY e.id),'[]') FROM export_artifacts e
    JOIN revisions r ON r.id=e.revision_id JOIN projects p ON p.id=r.project_id
    WHERE p.code LIKE 'S11-DEMO-%' AND e.status='ready')
)::text`;

interface SnapshotIdentity {
  readonly id: string;
  readonly version: string;
  readonly contentHash: string;
}
interface SavedRevisionIdentity {
  readonly projectId: string;
  readonly revisionId: string;
  readonly revisionNumber: number;
  readonly status: string;
  readonly engineVersion: string;
  readonly inputFingerprint: string;
  readonly catalogSnapshot: SnapshotIdentity;
  readonly ruleSnapshot: SnapshotIdentity;
  readonly checksums: ProjectRevisionChecksumsV2;
}
interface ReadyExportIdentity {
  readonly artifactId: string;
  readonly revisionId: string;
  readonly contentHash: string;
  readonly contentLength: number;
  readonly cacheIdentity: string;
  readonly revisionChecksum: string;
  readonly capturedLifecycleStatus: string;
  readonly templateId: string;
  readonly templateSha256: string;
  readonly mappingVersion: string;
  readonly rendererVersion: string;
}

function snapshotIdentity(value: unknown): SnapshotIdentity {
  const record = object(value);
  return {
    id: DatabaseIdV2Schema.parse(record.id),
    version: VersionIdentifierV2Schema.parse(record.version),
    contentHash: Sha256Schema.parse(record.contentHash)
  };
}

/** Parse only the explicit safe fields, even if an input contains unrelated sensitive values. */
export function parseTestDeploymentDatabaseIdentity(value: unknown) {
  try {
    const record = object(value);
    const snapshot = parseRestoreSnapshot(record.snapshot);
    assertRepresentativeRestore(snapshot);
    const active = ActiveDatabaseVersionsSchema.parse({
      catalogues: record.activeCatalogs,
      ruleSets: record.activeRules
    });
    const activeCatalogs = active.catalogues.map((item, index) => ({
      ...item,
      contentHash: Sha256Schema.parse(object(list(record.activeCatalogs)[index]).contentHash)
    }));
    const activeRules = active.ruleSets.map((item, index) => ({
      ...item,
      contentHash: Sha256Schema.parse(object(list(record.activeRules)[index]).contentHash)
    }));
    const revisions: SavedRevisionIdentity[] = list(record.revisions).map((value) => {
      const revision = object(value);
      if (!Number.isSafeInteger(revision.revisionNumber) || (revision.revisionNumber as number) < 1)
        throw new Error("Invalid revision number");
      return {
        projectId: DatabaseIdV2Schema.parse(revision.projectId),
        revisionId: DatabaseIdV2Schema.parse(revision.revisionId),
        revisionNumber: revision.revisionNumber as number,
        status: ProjectRevisionStatusV2Schema.parse(revision.status),
        engineVersion: VersionIdentifierV2Schema.parse(revision.engineVersion),
        inputFingerprint: Sha256Schema.parse(revision.inputFingerprint),
        catalogSnapshot: snapshotIdentity(revision.catalogSnapshot),
        ruleSnapshot: snapshotIdentity(revision.ruleSnapshot),
        checksums: ProjectRevisionChecksumsV2Schema.parse(revision.checksums)
      };
    });
    const readyExports: ReadyExportIdentity[] = list(record.readyExports).map((value) => {
      const artifact = object(value);
      if (
        !Number.isSafeInteger(artifact.contentLength) ||
        (artifact.contentLength as number) < 1 ||
        (artifact.contentLength as number) > 50 * 1024 * 1024
      )
        throw new Error("Invalid export length");
      return {
        artifactId: DatabaseIdV2Schema.parse(artifact.artifactId),
        revisionId: DatabaseIdV2Schema.parse(artifact.revisionId),
        contentHash: Sha256Schema.parse(artifact.contentHash),
        contentLength: artifact.contentLength as number,
        cacheIdentity: Sha256Schema.parse(artifact.cacheIdentity),
        revisionChecksum: Sha256Schema.parse(artifact.revisionChecksum),
        capturedLifecycleStatus: ProjectRevisionStatusV2Schema.parse(
          artifact.capturedLifecycleStatus
        ),
        templateId: VersionIdentifierV2Schema.parse(artifact.templateId),
        templateSha256: Sha256Schema.parse(artifact.templateSha256),
        mappingVersion: VersionIdentifierV2Schema.parse(artifact.mappingVersion),
        rendererVersion: VersionIdentifierV2Schema.parse(artifact.rendererVersion)
      };
    });
    if (
      !activeCatalogs.length ||
      !activeRules.length ||
      snapshot.revisions !== revisions.length ||
      JSON.stringify(snapshot.activeCatalogs) !==
        JSON.stringify(
          activeCatalogs.map((item) => `${item.id}:${item.version}:${item.contentHash}`)
        ) ||
      JSON.stringify(snapshot.activeRules) !==
        JSON.stringify(
          activeRules.map((item) => `${item.id}:${item.version}:${item.contentHash}`)
        ) ||
      activeRules.some(
        (rule) => !activeCatalogs.some((catalog) => catalog.id === rule.catalogVersionId)
      ) ||
      new Set(revisions.map((item) => item.revisionId)).size !== revisions.length ||
      new Set(readyExports.map((item) => item.artifactId)).size !== readyExports.length ||
      readyExports.some(
        (artifact) =>
          !revisions.some(
            (revision) =>
              revision.revisionId === artifact.revisionId &&
              revision.checksums.revisionChecksum === artifact.revisionChecksum
          )
      )
    )
      throw new Error("Inconsistent safe identity graph");
    return { snapshot, activeCatalogs, activeRules, revisions, readyExports };
  } catch {
    throw new Error("Invalid safe TEST database identity evidence; payload withheld");
  }
}

export interface TestDeploymentIdentity {
  readonly schemaVersion: "stage11-deployment-identity/v1";
  readonly observedAt: string;
  readonly lockfileHash: string;
  readonly images: readonly (TestImageIdentity & { readonly containerImageId: string | null })[];
  readonly migrationHistoryHash: string;
  readonly activeCatalogs: ReturnType<typeof parseTestDeploymentDatabaseIdentity>["activeCatalogs"];
  readonly activeRules: ReturnType<typeof parseTestDeploymentDatabaseIdentity>["activeRules"];
  readonly featureFlags: FeatureFlags;
  readonly featureFlagsHash: string;
  readonly representativeRecordsHash: string;
  readonly representativeRecordScope: "S11-DEMO-projects/revisions/BOM/warnings/approvals/lifecycle/exports";
  readonly counts: Pick<TestRestoreSnapshot, "roleAccounts" | "projects" | "revisions">;
  readonly savedRevisions: readonly SavedRevisionIdentity[];
  readonly readyExports: readonly ReadyExportIdentity[];
  readonly snapshotBuildAttribution: "existing-snapshots-not-attributed-to-observed-build";
}

export async function collectTestDeploymentIdentity(
  context: IdentityContext & {
    readonly imagesBeforeOperations: readonly TestImageIdentity[];
    readonly runCompose: (args: readonly string[]) => Promise<string>;
    readonly lockfileHash: string;
    readonly observedFeatureFlags: FeatureFlags;
    readonly observedActiveVersions: ActiveDatabaseVersions;
  }
): Promise<TestDeploymentIdentity> {
  await context.assertSafe();
  const images = await captureTestImages(context);
  if (
    context.imagesBeforeOperations.length !== TEST_IMAGE_SERVICES.length ||
    images.some(
      (image) =>
        !context.imagesBeforeOperations.some(
          (before) =>
            before.service === image.service &&
            before.configuredReference === image.configuredReference &&
            before.imageId === image.imageId
        )
    )
  )
    throw new Error("TEST image identities changed during deployment");
  const deployedImages: Array<TestImageIdentity & { containerImageId: string | null }> = [];
  for (const image of images) {
    let containerImageId: string | null = null;
    if (!["migrations", "backup"].includes(image.service)) {
      let inspected: Record<string, unknown>;
      try {
        inspected = object(
          JSON.parse(
            await context.runDocker([
              "container",
              "inspect",
              "--format",
              '{"imageId":{{json .Image}},"running":{{json .State.Running}}}',
              `${TEST_PROJECT}-${image.service}`
            ])
          )
        );
      } catch {
        throw new Error(`Cannot observe running TEST ${image.service} image identity`);
      }
      if (inspected.running !== true || inspected.imageId !== image.imageId)
        throw new Error(`Running TEST ${image.service} image differs from deployment`);
      containerImageId = image.imageId;
    }
    deployedImages.push({ ...image, containerImageId });
  }
  let database: ReturnType<typeof parseTestDeploymentDatabaseIdentity>;
  let featureFlags: FeatureFlags;
  let lockfileHash: string;
  try {
    database = parseTestDeploymentDatabaseIdentity(
      JSON.parse(await context.runCompose(testDatabaseQueryArguments(TEST_DEPLOYMENT_IDENTITY_SQL)))
    );
    featureFlags = FeatureFlagsSchema.parse(context.observedFeatureFlags);
    lockfileHash = Sha256Schema.parse(context.lockfileHash);
    const activeFingerprint = (value: ActiveDatabaseVersions) =>
      canonicalJson({
        catalogues: [...value.catalogues].sort((left, right) => left.id.localeCompare(right.id)),
        ruleSets: [...value.ruleSets].sort((left, right) => left.id.localeCompare(right.id))
      });
    if (
      activeFingerprint(ActiveDatabaseVersionsSchema.parse(context.observedActiveVersions)) !==
      activeFingerprint(
        ActiveDatabaseVersionsSchema.parse({
          catalogues: database.activeCatalogs,
          ruleSets: database.activeRules
        })
      )
    )
      throw new Error("Active TEST identity changed after smoke");
  } catch {
    throw new Error("Cannot capture safe TEST deployment identity; payload withheld");
  }
  const { snapshot } = database;
  return {
    schemaVersion: "stage11-deployment-identity/v1",
    observedAt: new Date().toISOString(),
    lockfileHash,
    images: deployedImages,
    migrationHistoryHash: `sha256:${snapshot.migrationFingerprint}`,
    activeCatalogs: database.activeCatalogs,
    activeRules: database.activeRules,
    featureFlags,
    featureFlagsHash: `sha256:${createHash("sha256").update(canonicalJson(featureFlags)).digest("hex")}`,
    representativeRecordsHash: `sha256:${snapshot.fingerprint}`,
    representativeRecordScope:
      "S11-DEMO-projects/revisions/BOM/warnings/approvals/lifecycle/exports",
    counts: {
      roleAccounts: snapshot.roleAccounts,
      projects: snapshot.projects,
      revisions: snapshot.revisions
    },
    savedRevisions: database.revisions,
    readyExports: database.readyExports,
    snapshotBuildAttribution: "existing-snapshots-not-attributed-to-observed-build"
  };
}
