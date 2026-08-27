import { randomBytes } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { run } from "./lib/process.js";

const root = await mkdtemp(path.join(tmpdir(), "niedax-backup-test-"));
const backups = path.join(root, "backups");
const secrets = path.join(root, "secrets");
await mkdir(backups, { mode: 0o700 });
await mkdir(secrets, { mode: 0o700 });
const secretValues = new Map<string, string>();
for (const name of [
  "postgres_admin_password",
  "postgres_app_password",
  "postgres_migrator_password",
  "postgres_backup_password"
]) {
  const value = randomBytes(32).toString("base64url");
  secretValues.set(name, value);
  await writeFile(path.join(secrets, name), value, { mode: 0o600 });
}

const project = `niedax-backup-test-${process.pid}-${Date.now()}`.toLowerCase();
const file = "database/tests/compose.backup.yaml";
const environment = {
  ...process.env,
  BACKUP_TEST_DIRECTORY: backups,
  BACKUP_TEST_SECRETS: secrets
};
const base = ["compose", "-p", project, "-f", file];

try {
  run("docker", [...base, "build", "migrations", "backup"], { env: environment });
  run("docker", [...base, "up", "--detach", "--wait", "postgres"], { env: environment });
  run("docker", [...base, "run", "--rm", "--no-deps", "migrations"], {
    env: environment
  });
  run("docker", [...base, "run", "--rm", "backup", "create"], { env: environment });
  const dump = (await readdir(backups)).find((name) => name.endsWith(".dump"));
  if (!dump) throw new Error("Backup integration test did not create a dump");
  run("docker", [...base, "run", "--rm", "backup", "verify", dump], { env: environment });
  const sidecarPath = path.join(backups, `${dump}.sha256`);
  const originalSidecar = await readFile(sidecarPath, "utf8");
  const checksum = originalSidecar.slice(0, 64);
  const alternateDump = "20000101T000000Z_niedax_generator_pg18.dump";
  await copyFile(path.join(backups, dump), path.join(backups, alternateDump));
  await writeFile(sidecarPath, `${checksum}  ${alternateDump}\n`, { mode: 0o600 });
  const mismatchedSidecarResult = run(
    "docker",
    [...base, "run", "--rm", "backup", "verify", dump],
    { env: environment, allowFailure: true, capture: true }
  );
  if (mismatchedSidecarResult.includes(`Verified ${dump}`)) {
    throw new Error("Backup verification accepted a sidecar for a different archive");
  }
  await writeFile(sidecarPath, `${originalSidecar.trimEnd()}\n${checksum}  ${alternateDump}\n`, {
    mode: 0o600
  });
  const multiRecordSidecarResult = run(
    "docker",
    [...base, "run", "--rm", "backup", "verify", dump],
    { env: environment, allowFailure: true, capture: true }
  );
  if (multiRecordSidecarResult.includes(`Verified ${dump}`)) {
    throw new Error("Backup verification accepted a sidecar with multiple records");
  }
  await writeFile(sidecarPath, originalSidecar, { mode: 0o600 });
  await rm(path.join(backups, alternateDump));
  run("docker", [...base, "run", "--rm", "backup", "verify", dump], { env: environment });
  run(
    "docker",
    [
      ...base,
      "exec",
      "-T",
      "postgres",
      "psql",
      "-U",
      "postgres",
      "-d",
      "niedax_generator",
      "-c",
      "INSERT INTO users (username, display_name, role, password_hash, password_algorithm) VALUES ('restore_test', 'Restore Test', 'reviewer', 'test-only', 'test-only')"
    ],
    { env: environment }
  );
  const backupPassword = secretValues.get("postgres_backup_password");
  if (backupPassword === undefined) throw new Error("Backup test password was not generated");
  await writeFile(
    path.join(secrets, "postgres_backup_password"),
    "intentionally-invalid-password",
    {
      mode: 0o600
    }
  );
  run(
    "docker",
    [
      ...base,
      "run",
      "--rm",
      "-e",
      `RESTORE_CONFIRMATION=niedax_generator ${dump}`,
      "backup",
      "restore-confirmed",
      dump
    ],
    { env: environment, allowFailure: true }
  );
  const preservedCount = run(
    "docker",
    [
      ...base,
      "exec",
      "-T",
      "postgres",
      "psql",
      "-U",
      "postgres",
      "-d",
      "niedax_generator",
      "-Atc",
      "SELECT count(*) FROM users WHERE username='restore_test'"
    ],
    { env: environment, capture: true }
  );
  if (preservedCount !== "1")
    throw new Error("Restore continued after its required safety backup failed");
  const dumpsAfterFailedSafetyBackup = (await readdir(backups)).filter((name) =>
    name.endsWith(".dump")
  );
  if (dumpsAfterFailedSafetyBackup.length !== 1)
    throw new Error("Failed safety backup left a promoted archive behind");
  await writeFile(path.join(secrets, "postgres_backup_password"), backupPassword, { mode: 0o600 });
  run(
    "docker",
    [
      ...base,
      "run",
      "--rm",
      "-e",
      `RESTORE_CONFIRMATION=niedax_generator ${dump}`,
      "backup",
      "restore-confirmed",
      dump
    ],
    { env: environment }
  );
  const count = run(
    "docker",
    [
      ...base,
      "exec",
      "-T",
      "postgres",
      "psql",
      "-U",
      "postgres",
      "-d",
      "niedax_generator",
      "-Atc",
      "SELECT count(*) FROM users WHERE username='restore_test'"
    ],
    { env: environment, capture: true }
  );
  if (count !== "0")
    throw new Error("Disposable restore did not return the database to backup state");
  run(
    "docker",
    [...base, "run", "--rm", "--no-deps", "migrations", "node", "dist/migrate.js", "verify"],
    { env: environment }
  );
  const accessPolicyViolation = run(
    "docker",
    [
      ...base,
      "exec",
      "-T",
      "postgres",
      "psql",
      "-U",
      "postgres",
      "-d",
      "niedax_generator",
      "-Atc",
      "SELECT has_table_privilege('niedax_generator_app', 'public.schema_migrations', 'SELECT') OR has_table_privilege('niedax_generator_app', 'public.schema_migrations', 'INSERT') OR has_table_privilege('niedax_generator_app', 'public.schema_migrations', 'UPDATE') OR has_table_privilege('niedax_generator_app', 'public.schema_migrations', 'DELETE') OR has_table_privilege('niedax_generator_app', 'public.revisions', 'UPDATE') OR has_table_privilege('niedax_generator_app', 'public.revisions', 'DELETE') OR has_table_privilege('niedax_generator_app', 'public.revisions', 'TRUNCATE') OR NOT has_column_privilege('niedax_generator_app', 'public.revisions', 'status', 'UPDATE') OR NOT has_column_privilege('niedax_generator_app', 'public.revisions', 'checked_at', 'UPDATE') OR NOT has_column_privilege('niedax_generator_app', 'public.revisions', 'approved_at', 'UPDATE') OR NOT has_column_privilege('niedax_generator_app', 'public.revisions', 'archived_at', 'UPDATE') OR NOT has_column_privilege('niedax_generator_app', 'public.revisions', 'updated_at', 'UPDATE') OR has_table_privilege('niedax_generator_app', 'public.bom_lines', 'UPDATE') OR has_table_privilege('niedax_generator_app', 'public.bom_lines', 'DELETE') OR has_table_privilege('niedax_generator_app', 'public.bom_lines', 'TRUNCATE') OR has_table_privilege('niedax_generator_app', 'public.approvals', 'UPDATE') OR has_table_privilege('niedax_generator_app', 'public.approvals', 'DELETE') OR has_table_privilege('niedax_generator_app', 'public.approvals', 'TRUNCATE') OR NOT has_table_privilege('niedax_generator_app', 'public.warnings', 'UPDATE') OR NOT has_table_privilege('niedax_generator_app', 'public.warnings', 'DELETE')"
    ],
    { env: environment, capture: true }
  );
  if (accessPolicyViolation !== "f")
    throw new Error("Restore did not reconcile protected application-role privileges");
  process.stdout.write(
    "Disposable backup create, exact sidecar binding, fail-closed safety backup, archive verification, atomic restore, full migration-history verification, and restored ACL reconciliation passed.\n"
  );
} finally {
  run("docker", [...base, "down", "--volumes", "--remove-orphans"], {
    env: environment,
    allowFailure: true
  });
  const resolvedRoot = path.resolve(root);
  if (resolvedRoot.startsWith(path.resolve(tmpdir()) + path.sep)) {
    await rm(resolvedRoot, { recursive: true, force: true });
  } else {
    process.stderr.write("Refused to remove a non-temporary integration-test directory.\n");
  }
}
