import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { isProjectBackupFilename } from "../backup-policy.js";

export interface TestBackupContext {
  readonly rootDirectory: string;
  /** Must validate the fully resolved persistent TEST topology, including paths and secrets. */
  readonly assertSafe: () => Promise<void>;
  readonly runCompose: (args: readonly string[]) => Promise<string>;
}

export interface TestRestoreSnapshot {
  readonly activeCatalogs: readonly string[];
  readonly activeRules: readonly string[];
  readonly roleAccounts: number;
  readonly projects: number;
  readonly revisions: number;
  readonly fingerprint: string;
  readonly migrationFingerprint: string;
}

export interface TestBackupEvidence {
  readonly schemaVersion: "test-backup/v1";
  readonly environment: "test";
  readonly filename: string;
  readonly archiveSha256: string;
  readonly checksumVerified: true;
  readonly snapshotTimezone: "UTC";
  readonly timestamp: string;
  readonly snapshot: TestRestoreSnapshot;
}

// Hash complete representative records inside PostgreSQL. Project payloads, hashes of user
// passwords, sessions, and workbook bytes never leave the database in this diagnostic query.
export const TEST_RESTORE_SNAPSHOT_SQL = `
WITH demo_projects AS (SELECT * FROM projects WHERE code LIKE 'S11-DEMO-%'),
demo_revisions AS (SELECT * FROM revisions WHERE project_id IN (SELECT id FROM demo_projects)),
protected_rows AS (
  SELECT 'project:' || id::text AS identity, to_jsonb(p)::text AS payload FROM demo_projects p
  UNION ALL SELECT 'revision:' || id::text, to_jsonb(r)::text FROM demo_revisions r
  UNION ALL SELECT 'bom:' || id::text, to_jsonb(b)::text FROM revision_bom_lines_v2 b
    WHERE revision_id IN (SELECT id FROM demo_revisions)
  UNION ALL SELECT 'warning:' || id::text, to_jsonb(w)::text FROM revision_warnings_v2 w
    WHERE revision_id IN (SELECT id FROM demo_revisions)
  UNION ALL SELECT 'approval:' || id::text, to_jsonb(a)::text FROM approvals a
    WHERE revision_id IN (SELECT id FROM demo_revisions)
  UNION ALL SELECT 'lifecycle:' || id::text, to_jsonb(e)::text FROM revision_lifecycle_events e
    WHERE revision_id IN (SELECT id FROM demo_revisions)
  UNION ALL SELECT 'export:' || id::text, to_jsonb(e)::text FROM export_artifacts e
    WHERE revision_id IN (SELECT id FROM demo_revisions)
)
SELECT jsonb_build_object(
  'activeCatalogs', (SELECT coalesce(jsonb_agg(id::text || ':' || version || ':' || content_hash ORDER BY id), '[]') FROM catalog_versions WHERE status='active'),
  'activeRules', (SELECT coalesce(jsonb_agg(id::text || ':' || version || ':' || content_hash ORDER BY id), '[]') FROM rule_sets WHERE status='active'),
  'roleAccounts', (SELECT count(*) FROM users WHERE enabled AND username='test.' || role),
  'projects', (SELECT count(*) FROM demo_projects),
  'revisions', (SELECT count(*) FROM demo_revisions),
  'fingerprint', encode(sha256(convert_to(coalesce((SELECT string_agg(identity || ':' || encode(sha256(convert_to(payload,'UTF8')),'hex'), ',' ORDER BY identity) FROM protected_rows),''),'UTF8')),'hex'),
  'migrationFingerprint', (SELECT encode(sha256(convert_to(coalesce(string_agg(filename || ':' || checksum, ',' ORDER BY filename),''),'UTF8')),'hex') FROM schema_migrations)
)::text`;

const HASH = /^[0-9a-f]{64}$/u;
const TEMP_PROJECT = /^niedax-test-restore-[0-9]+-[0-9a-f]{12}$/u;
const secretNames = [
  "postgres_admin_password",
  "postgres_app_password",
  "postgres_migrator_password",
  "postgres_backup_password"
] as const;

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid TEST restore metadata");
  return value as Record<string, unknown>;
}

export function parseRestoreSnapshot(value: unknown): TestRestoreSnapshot {
  const record = object(value);
  for (const key of ["activeCatalogs", "activeRules"] as const) {
    const entries = record[key];
    if (
      !Array.isArray(entries) ||
      entries.length > 100 ||
      entries.some(
        (entry: unknown) =>
          typeof entry !== "string" ||
          entry.length > 200 ||
          !/^[0-9a-f-]{36}:[^\r\n]+:sha256:[0-9a-f]{64}$/u.test(entry)
      )
    )
      throw new Error("Invalid active TEST identity metadata");
  }
  for (const key of ["roleAccounts", "projects", "revisions"] as const) {
    if (!Number.isSafeInteger(record[key]) || (record[key] as number) < 0)
      throw new Error("Invalid TEST record counts");
  }
  for (const key of ["fingerprint", "migrationFingerprint"] as const) {
    if (typeof record[key] !== "string" || !HASH.test(record[key]))
      throw new Error("Invalid TEST record fingerprint");
  }
  return {
    activeCatalogs: record.activeCatalogs as string[],
    activeRules: record.activeRules as string[],
    roleAccounts: record.roleAccounts as number,
    projects: record.projects as number,
    revisions: record.revisions as number,
    fingerprint: record.fingerprint as string,
    migrationFingerprint: record.migrationFingerprint as string
  };
}

export function assertRepresentativeRestore(snapshot: TestRestoreSnapshot): void {
  if (
    !snapshot.activeCatalogs.length ||
    !snapshot.activeRules.length ||
    snapshot.roleAccounts !== 4 ||
    snapshot.projects < 1 ||
    snapshot.revisions < 1
  )
    throw new Error(
      "TEST restore requires active catalog/rules, four role accounts, demo projects and saved revisions"
    );
}

export function assertMatchingRestore(
  expected: TestRestoreSnapshot,
  restored: TestRestoreSnapshot
): void {
  if (JSON.stringify(expected) !== JSON.stringify(restored))
    throw new Error(
      `Restored TEST identities, migration history or representative records differ from the verified backup (${(Object.keys(expected) as Array<keyof TestRestoreSnapshot>).filter((key) => JSON.stringify(expected[key]) !== JSON.stringify(restored[key])).join(", ")})`
    );
}

function queryArguments(sql: string): string[] {
  return [
    "exec",
    "-T",
    "postgres",
    "psql",
    "-X",
    "-v",
    "ON_ERROR_STOP=1",
    "-q",
    "-U",
    "postgres",
    "-d",
    "niedax_generator",
    "-Atc",
    `SET TIME ZONE 'UTC'; ${sql}`
  ];
}

async function snapshot(runCompose: TestBackupContext["runCompose"]): Promise<TestRestoreSnapshot> {
  return parseRestoreSnapshot(
    JSON.parse(await runCompose(queryArguments(TEST_RESTORE_SNAPSHOT_SQL)))
  );
}

async function regularFile(filename: string): Promise<void> {
  const stat = await lstat(filename);
  if (!stat.isFile() || stat.isSymbolicLink())
    throw new Error("TEST backup files must be regular files");
}

async function backupDirectory(context: TestBackupContext): Promise<string> {
  const directory = path.resolve(await realpath(context.rootDirectory), "data", "test", "backups");
  const resolved = await realpath(directory);
  if (resolved !== directory)
    throw new Error("TEST backup directory cannot redirect outside its owned path");
  return directory;
}

async function archiveChecksum(directory: string, filename: string): Promise<string> {
  if (!isProjectBackupFilename(filename)) throw new Error("Provide an exact TEST backup filename");
  const archive = path.join(directory, filename);
  const sidecar = `${archive}.sha256`;
  await regularFile(archive);
  await regularFile(sidecar);
  const checksumRecord = await readFile(sidecar, "utf8");
  const expected = checksumRecord.slice(0, 64);
  if (!HASH.test(expected) || checksumRecord !== `${expected}  ${filename}\n`)
    throw new Error("TEST checksum sidecar must name exactly the selected archive");
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(archive)) hash.update(chunk as Buffer);
  const actual = hash.digest("hex");
  if (actual !== expected) throw new Error("TEST archive checksum mismatch");
  return actual;
}

/** Reuses the existing custom-format dump, verification and retention implementation. */
export async function createTestBackup(context: TestBackupContext): Promise<TestBackupEvidence> {
  await context.assertSafe();
  const directory = await backupDirectory(context);
  const before = await snapshot(context.runCompose);
  const output = await context.runCompose([
    "--profile",
    "tools",
    "run",
    "--rm",
    "--no-deps",
    "backup",
    "create"
  ]);
  const filenames = output
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(isProjectBackupFilename);
  if (filenames.length !== 1)
    throw new Error("TEST backup creation did not return exactly one archive");
  const filename = filenames[0]!;
  await context.runCompose([
    "--profile",
    "tools",
    "run",
    "--rm",
    "--no-deps",
    "backup",
    "verify",
    filename
  ]);
  const after = await snapshot(context.runCompose);
  assertMatchingRestore(before, after);
  const evidence: TestBackupEvidence = {
    schemaVersion: "test-backup/v1",
    environment: "test",
    filename,
    archiveSha256: await archiveChecksum(directory, filename),
    checksumVerified: true,
    snapshotTimezone: "UTC",
    timestamp: new Date().toISOString(),
    snapshot: before
  };
  await writeFile(
    path.join(directory, `${filename}.test.json`),
    `${JSON.stringify(evidence, null, 2)}\n`,
    { mode: 0o600, flag: "wx" }
  );
  return evidence;
}

/** Fail closed before starting the existing disposable backup harness. */
export function assertTemporaryRestoreTopology(
  value: unknown,
  project: string,
  temporaryRoot: string,
  rootDirectory: string
): void {
  const config = object(value);
  if (!TEMP_PROJECT.test(project) || config.name !== project)
    throw new Error("Invalid isolated TEST restore project");
  const resolvedRoot = path.resolve(temporaryRoot);
  if (
    !resolvedRoot.startsWith(path.resolve(tmpdir()) + path.sep) ||
    !path.basename(resolvedRoot).startsWith("niedax-test-restore-")
  )
    throw new Error("Restore verification must use a temporary owned directory");
  const services = object(config.services);
  if (Object.keys(services).sort().join(",") !== "backup,migrations,postgres")
    throw new Error("Unexpected restore verification services");
  const networks = object(config.networks);
  if (
    Object.keys(networks).join(",") !== "database" ||
    object(networks.database).internal !== true ||
    object(networks.database).name !== `${project}_database`
  )
    throw new Error("Restore verification database network is not isolated");
  for (const [name, raw] of Object.entries(services)) {
    const service = object(raw);
    if (
      service.container_name ||
      service.network_mode ||
      service.privileged ||
      (Array.isArray(service.ports) && service.ports.length)
    )
      throw new Error("Restore verification cannot publish ports or share containers");
    if (Object.keys(object(service.networks)).join(",") !== "database")
      throw new Error("Unexpected restore verification network");
    const volumes = service.volumes ?? [];
    if (!Array.isArray(volumes)) throw new Error("Invalid restore verification storage");
    const expectedSource =
      name === "backup"
        ? path.join(resolvedRoot, "backups")
        : path.resolve(rootDirectory, "database/scripts/initialize.sh");
    if (
      (name === "migrations" && volumes.length) ||
      (name !== "migrations" && volumes.length !== 1)
    )
      throw new Error("Unexpected restore verification storage");
    for (const rawVolume of volumes) {
      const volume = object(rawVolume);
      if (
        volume.type !== "bind" ||
        typeof volume.source !== "string" ||
        path.resolve(volume.source) !== expectedSource ||
        volume.target !==
          (name === "backup" ? "/backups" : "/docker-entrypoint-initdb.d/010-roles.sh") ||
        (name === "postgres" && volume.read_only !== true)
      )
        throw new Error("Restore verification cannot mount persistent data");
    }
    if (name !== "postgres") {
      const build = object(service.build);
      if (
        build.context !== path.resolve(rootDirectory) ||
        build.dockerfile !== `database/Dockerfile.${name === "backup" ? "backup" : "migrations"}`
      )
        throw new Error("Unexpected restore verification build");
    } else if (
      typeof service.image !== "string" ||
      !/^postgres:18\.[0-9]+-alpine[0-9.]+@sha256:[0-9a-f]{64}$/u.test(service.image)
    ) {
      throw new Error("Unexpected restore verification PostgreSQL image");
    }
  }
  const secrets = object(config.secrets);
  if (Object.keys(secrets).sort().join(",") !== [...secretNames].sort().join(","))
    throw new Error("Unexpected restore verification secrets");
  for (const name of secretNames) {
    const secretFile = object(secrets[name]).file;
    if (
      typeof secretFile !== "string" ||
      path.resolve(secretFile) !== path.join(resolvedRoot, "secrets", name)
    )
      throw new Error("Restore verification cannot use persistent credentials");
  }
}

async function isolatedDocker(
  args: readonly string[],
  environment: NodeJS.ProcessEnv,
  root: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", args, {
      cwd: root,
      env: environment,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
      if (output.length > 2_000_000) child.kill();
    });
    // Do not copy arbitrary subprocess/database errors, which can contain restored row data.
    child.stderr.resume();
    child.on("error", () =>
      reject(new Error("Unable to execute isolated TEST restore Docker command"))
    );
    child.on("close", (code) =>
      code === 0
        ? resolve(output.trim())
        : reject(new Error("Isolated TEST restore Docker command failed"))
    );
  });
}

export async function verifyTestRestore(
  context: TestBackupContext,
  selectedFilename?: string
): Promise<{
  schemaVersion: "test-restore-verification/v1";
  environment: "test";
  timestamp: string;
  filename: string;
  status: "passed";
  checksumVerified: true;
  migrationHistoryVerified: true;
  privilegesVerified: true;
  representativeRecordsVerified: true;
  temporaryEnvironmentRemoved: true;
}> {
  await context.assertSafe();
  const directory = await backupDirectory(context);
  const filename = selectedFilename ?? (await createTestBackup(context)).filename;
  const checksum = await archiveChecksum(directory, filename);
  const evidencePath = path.join(directory, `${filename}.test.json`);
  await regularFile(evidencePath);
  if ((await lstat(evidencePath)).size > 32_768) throw new Error("Oversized TEST backup evidence");
  const evidence = object(JSON.parse(await readFile(evidencePath, "utf8")));
  if (
    evidence.schemaVersion !== "test-backup/v1" ||
    evidence.environment !== "test" ||
    evidence.filename !== filename ||
    evidence.archiveSha256 !== checksum ||
    evidence.checksumVerified !== true ||
    evidence.snapshotTimezone !== "UTC"
  )
    throw new Error("Selected archive has no matching verified TEST backup evidence");
  const expected = parseRestoreSnapshot(evidence.snapshot);
  assertRepresentativeRestore(expected);
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "niedax-test-restore-"));
  const project = `niedax-test-restore-${process.pid}-${randomBytes(6).toString("hex")}`;
  const backups = path.join(temporaryRoot, "backups");
  const secrets = path.join(temporaryRoot, "secrets");
  const environment = {
    ...process.env,
    BACKUP_TEST_DIRECTORY: backups,
    BACKUP_TEST_SECRETS: secrets
  };
  const base = [
    "compose",
    "-p",
    project,
    "-f",
    path.join(context.rootDirectory, "database/tests/compose.backup.yaml")
  ];
  const isolated = (args: readonly string[]) =>
    isolatedDocker([...base, ...args], environment, context.rootDirectory);
  let started = false;
  try {
    await mkdir(backups, { mode: 0o700 });
    await mkdir(secrets, { mode: 0o700 });
    for (const name of secretNames)
      await writeFile(path.join(secrets, name), randomBytes(32).toString("base64url"), {
        mode: 0o600
      });
    await copyFile(path.join(directory, filename), path.join(backups, filename));
    await copyFile(
      path.join(directory, `${filename}.sha256`),
      path.join(backups, `${filename}.sha256`)
    );
    assertTemporaryRestoreTopology(
      JSON.parse(await isolated(["config", "--format", "json"])),
      project,
      temporaryRoot,
      context.rootDirectory
    );
    await archiveChecksum(backups, filename);
    await isolated(["build", "migrations", "backup"]);
    started = true;
    await isolated(["up", "--detach", "--wait", "postgres"]);
    await isolated(["run", "--rm", "--no-deps", "migrations"]);
    await isolated(["run", "--rm", "--no-deps", "backup", "verify", filename]);
    // Existing tooling makes its safety dump only in the disposable directory and reconciles
    // protected application privileges. The live TEST stack receives no restore command.
    await isolated([
      "run",
      "--rm",
      "--no-deps",
      "-e",
      `RESTORE_CONFIRMATION=niedax_generator ${filename}`,
      "backup",
      "restore-confirmed",
      filename
    ]);
    // Verify the exact archive history before permitting forward migration changes to it.
    await isolated(["run", "--rm", "--no-deps", "migrations", "node", "dist/migrate.js", "verify"]);
    const restored = await snapshot(isolated);
    assertMatchingRestore(expected, restored);
    const exportPolicy = await isolated(
      queryArguments(`SELECT
      has_table_privilege('niedax_generator_app','public.export_artifacts','SELECT') AND
      has_table_privilege('niedax_generator_app','public.export_artifacts','INSERT') AND
      NOT has_table_privilege('niedax_generator_app','public.export_artifacts','UPDATE') AND
      NOT has_table_privilege('niedax_generator_app','public.export_artifacts','DELETE') AND
      NOT has_table_privilege('niedax_generator_app','public.export_artifacts','TRUNCATE') AND
      NOT has_column_privilege('niedax_generator_app','public.export_artifacts','context_payload','UPDATE') AND
      has_column_privilege('niedax_generator_app','public.export_artifacts','content_bytes','UPDATE')`)
    );
    if (exportPolicy !== "t") throw new Error("Restored export privilege policy is invalid");
  } finally {
    // A failed teardown preserves the temporary directory for recovery; never delete an active mount.
    if (started) await isolated(["down", "--volumes", "--remove-orphans"]);
    const resolved = await realpath(temporaryRoot);
    const canonicalTemporaryParent = await realpath(tmpdir());
    assert(
      resolved === path.resolve(canonicalTemporaryParent, path.basename(temporaryRoot)) &&
        TEMP_PROJECT.test(project),
      "Refused unsafe restore-verification cleanup"
    );
    await rm(resolved, { recursive: true, force: true });
  }
  return {
    schemaVersion: "test-restore-verification/v1",
    environment: "test",
    timestamp: new Date().toISOString(),
    filename,
    status: "passed",
    checksumVerified: true,
    migrationHistoryVerified: true,
    privilegesVerified: true,
    representativeRecordsVerified: true,
    temporaryEnvironmentRemoved: true
  };
}
