import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  assertMatchingRestore,
  assertRepresentativeRestore,
  assertTemporaryRestoreTopology,
  createTestBackup,
  parseRestoreSnapshot,
  verifyTestRestore,
  type TestBackupContext,
  type TestRestoreSnapshot
} from "../lib/stage11-backup.js";

const project = "niedax-test-restore-123-aabbccddeeff";
const root = path.resolve(".");
const temporaryRoot = path.join(tmpdir(), "niedax-test-restore-fixture");
const snapshot: TestRestoreSnapshot = {
  activeCatalogs: [`10000000-0000-4000-8000-000000000001:1.0:sha256:${"a".repeat(64)}`],
  activeRules: [`10000000-0000-4000-8000-000000000002:1.0:sha256:${"b".repeat(64)}`],
  roleAccounts: 4,
  projects: 12,
  revisions: 12,
  fingerprint: "c".repeat(64),
  migrationFingerprint: "d".repeat(64)
};

function topology() {
  return {
    name: project,
    services: {
      postgres: {
        image: `postgres:18.4-alpine3.23@sha256:${"a".repeat(64)}`,
        networks: { database: null },
        volumes: [
          {
            type: "bind",
            source: path.join(root, "database/scripts/initialize.sh"),
            target: "/docker-entrypoint-initdb.d/010-roles.sh",
            read_only: true
          }
        ]
      },
      migrations: {
        build: { context: root, dockerfile: "database/Dockerfile.migrations" },
        networks: { database: null }
      },
      backup: {
        build: { context: root, dockerfile: "database/Dockerfile.backup" },
        networks: { database: null },
        volumes: [{ type: "bind", source: path.join(temporaryRoot, "backups"), target: "/backups" }]
      }
    },
    networks: { database: { name: `${project}_database`, internal: true } },
    secrets: Object.fromEntries(
      [
        "postgres_admin_password",
        "postgres_app_password",
        "postgres_migrator_password",
        "postgres_backup_password"
      ].map((name) => [name, { file: path.join(temporaryRoot, "secrets", name) }])
    )
  };
}

describe("Stage 11 real TEST restore verification", () => {
  it("calls the persistent TEST guard before any backup command or file operation", async () => {
    const runCompose = vi.fn(async () => "");
    const assertSafe = vi.fn(async () => {
      throw new Error("unsafe TEST topology");
    });
    const context = { rootDirectory: root, runCompose, assertSafe };
    await expect(createTestBackup(context)).rejects.toThrow("unsafe TEST topology");
    await expect(verifyTestRestore(context)).rejects.toThrow("unsafe TEST topology");
    expect(runCompose).not.toHaveBeenCalled();
  });

  it("binds TEST evidence to the exact archive and never issues a live restore command", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "niedax-test-backup-unit-"));
    const backups = path.join(directory, "data/test/backups");
    const filename = "20260924T120000Z_niedax_generator_pg18.dump";
    try {
      await mkdir(backups, { recursive: true });
      const bytes = Buffer.from("unit-test archive bytes");
      const hash = createHash("sha256").update(bytes).digest("hex");
      const runCompose = vi.fn(async (args: readonly string[]) => {
        if (args.includes("psql")) return JSON.stringify(snapshot);
        if (args.at(-1) === "create") {
          await writeFile(path.join(backups, filename), bytes);
          await writeFile(path.join(backups, `${filename}.sha256`), `${hash}  ${filename}\n`);
          return filename;
        }
        return `Verified ${filename}`;
      });
      const context: TestBackupContext = {
        rootDirectory: directory,
        runCompose,
        assertSafe: async () => undefined
      };
      const evidence = await createTestBackup(context);
      expect(evidence.archiveSha256).toBe(hash);
      expect(evidence.snapshot).toEqual(snapshot);
      expect(
        JSON.parse(await readFile(path.join(backups, `${filename}.test.json`), "utf8"))
      ).toEqual(evidence);
      expect(runCompose.mock.calls.some(([args]) => args.includes("restore-confirmed"))).toBe(
        false
      );
      await expect(verifyTestRestore(context, `../${filename}`)).rejects.toThrow(
        "exact TEST backup filename"
      );
      await writeFile(
        path.join(backups, `${filename}.sha256`),
        `${hash}  20000101T000000Z_niedax_generator_pg18.dump\n`
      );
      await expect(verifyTestRestore(context, filename)).rejects.toThrow(
        "exactly the selected archive"
      );
      await writeFile(path.join(backups, `${filename}.sha256`), `${hash}  ${filename}\n`);
      await writeFile(
        path.join(backups, `${filename}.test.json`),
        JSON.stringify({ ...evidence, environment: "production" })
      );
      await expect(verifyTestRestore(context, filename)).rejects.toThrow(
        "matching verified TEST backup evidence"
      );
      await writeFile(path.join(backups, filename), "tampered");
      await expect(verifyTestRestore(context, filename)).rejects.toThrow("checksum mismatch");
    } finally {
      assert(
        path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep),
        "Unsafe unit-test cleanup"
      );
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("accepts only the existing isolated backup harness with temporary credentials and storage", () => {
    expect(() =>
      assertTemporaryRestoreTopology(topology(), project, temporaryRoot, root)
    ).not.toThrow();
    const mixedSeparators = topology();
    for (const [name, secret] of Object.entries(mixedSeparators.secrets))
      secret.file = `${path.join(temporaryRoot, "secrets")}/${name}`;
    expect(() =>
      assertTemporaryRestoreTopology(mixedSeparators, project, temporaryRoot, root)
    ).not.toThrow();
    expect(() =>
      assertTemporaryRestoreTopology(topology(), "niedax-generator", temporaryRoot, root)
    ).toThrow("project");
    expect(() =>
      assertTemporaryRestoreTopology(topology(), "niedax-stage10-123-456", temporaryRoot, root)
    ).toThrow("project");
    expect(() =>
      assertTemporaryRestoreTopology(topology(), project, path.join(root, "data/test"), root)
    ).toThrow("temporary");
  });

  it("rejects persistent backup and secret paths, external networks and host database ports", () => {
    const persistent = topology();
    persistent.services.backup.volumes[0]!.source = path.join(root, "data/test/backups");
    expect(() => assertTemporaryRestoreTopology(persistent, project, temporaryRoot, root)).toThrow(
      "persistent data"
    );
    const secret = topology();
    secret.secrets.postgres_admin_password!.file = path.join(
      root,
      "data/secrets/postgres_admin_password"
    );
    expect(() => assertTemporaryRestoreTopology(secret, project, temporaryRoot, root)).toThrow(
      "persistent credentials"
    );
    const network = topology();
    network.networks.database.internal = false;
    expect(() => assertTemporaryRestoreTopology(network, project, temporaryRoot, root)).toThrow(
      "network"
    );
    const port = topology();
    Object.assign(port.services.postgres, { ports: [{ target: 5432, published: "5432" }] });
    expect(() => assertTemporaryRestoreTopology(port, project, temporaryRoot, root)).toThrow(
      "ports"
    );
  });

  it("rejects unexpected mounts, container identities, images and build recipes", () => {
    const mount = topology();
    mount.services.postgres.volumes.push({
      type: "bind",
      source: path.join(root, "data/postgres"),
      target: "/var/lib/postgresql/18/docker",
      read_only: false
    });
    expect(() => assertTemporaryRestoreTopology(mount, project, temporaryRoot, root)).toThrow(
      "storage"
    );
    const container = topology();
    Object.assign(container.services.postgres, { container_name: "niedax-postgres" });
    expect(() => assertTemporaryRestoreTopology(container, project, temporaryRoot, root)).toThrow(
      "containers"
    );
    const image = topology();
    image.services.postgres.image = "postgres:latest";
    expect(() => assertTemporaryRestoreTopology(image, project, temporaryRoot, root)).toThrow(
      "image"
    );
    const build = topology();
    build.services.backup.build.dockerfile = "Dockerfile.unreviewed";
    expect(() => assertTemporaryRestoreTopology(build, project, temporaryRoot, root)).toThrow(
      "build"
    );
  });

  it("requires actual active identities, four accounts, projects and saved revisions", () => {
    expect(() => assertRepresentativeRestore(parseRestoreSnapshot(snapshot))).not.toThrow();
    for (const invalid of [
      { activeCatalogs: [] },
      { activeRules: [] },
      { roleAccounts: 3 },
      { projects: 0 },
      { revisions: 0 }
    ]) {
      expect(() => assertRepresentativeRestore({ ...snapshot, ...invalid })).toThrow("requires");
    }
  });

  it("rejects changed migration history, active identities or protected graph even when counts match", () => {
    expect(() => assertMatchingRestore(snapshot, parseRestoreSnapshot(snapshot))).not.toThrow();
    for (const changed of [
      { migrationFingerprint: "f".repeat(64) },
      { fingerprint: "e".repeat(64) },
      { activeRules: snapshot.activeCatalogs }
    ]) {
      expect(() => assertMatchingRestore(snapshot, { ...snapshot, ...changed })).toThrow("differ");
    }
  });

  it("bounds evidence and discards unrelated payload fields", () => {
    expect(parseRestoreSnapshot({ ...snapshot, untrustedPayload: "discard me" })).toEqual(snapshot);
    expect(() => parseRestoreSnapshot({ ...snapshot, projects: -1 })).toThrow("counts");
    expect(() => parseRestoreSnapshot({ ...snapshot, fingerprint: "wrong" })).toThrow(
      "fingerprint"
    );
    expect(() =>
      parseRestoreSnapshot({ ...snapshot, activeCatalogs: ["not an identity"] })
    ).toThrow("identity");
  });
});
