import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { run } from "./lib/process.js";

const root = await mkdtemp(path.join(tmpdir(), "niedax-backup-test-"));
const backups = path.join(root, "backups");
const secrets = path.join(root, "secrets");
await mkdir(backups, { mode: 0o700 });
await mkdir(secrets, { mode: 0o700 });
for (const name of [
  "postgres_admin_password",
  "postgres_app_password",
  "postgres_migrator_password",
  "postgres_backup_password"
]) {
  await writeFile(path.join(secrets, name), randomBytes(32).toString("base64url"), { mode: 0o600 });
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
  process.stdout.write(
    "Disposable backup create, checksum, archive verification, and restore passed.\n"
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
