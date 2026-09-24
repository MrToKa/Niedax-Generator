import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { link, mkdir, mkdtemp, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import type { BrowserComposeConfig } from "../lib/stage9-browser-config.js";
import {
  assertStage10Acceptance,
  assertStage10Run,
  assertTestPaths,
  validateTestTopology,
  type Stage10Acceptance,
  type TestTopologyOptions
} from "../lib/stage11-config.js";

const workspace = path.resolve(".");
const commit = "1".repeat(40);
const options: TestTopologyOptions = {
  workspace,
  port: 8080,
  bind: "0.0.0.0",
  build: { gitCommit: commit, tag: commit, buildTimestamp: "2026-09-24T12:00:00.000Z" }
};
// Captured from `docker compose config --format json`; host paths and SHA are replaced.
// Keeping a resolved fixture makes the unit guard suite independent of Docker availability.
const source = JSON.parse(
  readFileSync(new URL("./fixtures/stage11-compose.json", import.meta.url), "utf8")
) as unknown;
function resolveFixture(value: unknown): unknown {
  if (typeof value === "string" && value.startsWith("<workspace>"))
    return path.resolve(workspace, `.${value.slice("<workspace>".length)}`);
  if (Array.isArray(value)) return value.map(resolveFixture);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, resolveFixture(entry)])
    );
  return value;
}
function topology(): BrowserComposeConfig {
  return resolveFixture(source) as BrowserComposeConfig;
}
function rejectMutation(mutate: (config: BrowserComposeConfig) => void): void {
  const config = topology();
  mutate(config);
  expect(() => validateTestTopology(config, options)).toThrow();
}
function signoff(): Stage10Acceptance {
  return {
    schemaVersion: "stage10-acceptance/v1",
    reviewedCommit: commit,
    runtimeImageSecurity: {
      status: "approved",
      reviewer: "Unit test security reviewer",
      evidence: "test-evidence-security"
    },
    domainApproval: {
      status: "approved",
      reviewer: "Unit test domain reviewer",
      evidence: "test-evidence-domain"
    }
  };
}
const run = {
  status: "completed",
  conclusion: "success",
  head_sha: commit,
  head_branch: "main",
  event: "push",
  path: ".github/workflows/stage10.yml",
  head_repository: { full_name: "MrToKa/Niedax-Generator" }
};

describe("Stage 11 persistent TEST topology guard", () => {
  it("accepts the resolved isolated TEST topology including Compose-normalized fields", () => {
    expect(() => validateTestTopology(topology(), options)).not.toThrow();
    const local = topology();
    Object.assign(local.services.gateway!.ports![0]!, { published: "18091", host_ip: "127.0.0.1" });
    expect(() =>
      validateTestTopology(local, { ...options, port: 18091, bind: "127.0.0.1" })
    ).not.toThrow();
    const reordered = topology();
    reordered.services.backend!.build!.args = {
      NIEDAX_GIT_COMMIT: commit,
      NIEDAX_BUILD_TIMESTAMP: options.build.buildTimestamp
    };
    expect(() => validateTestTopology(reordered, options)).not.toThrow();
  });

  it("rejects normal and Stage 10 projects and normal persistent data, backup or secret paths", () => {
    for (const project of ["niedax-generator", "niedax-stage10-123-456"])
      rejectMutation((c) => {
        c.name = project;
      });
    rejectMutation((c) => {
      c.services.postgres!.volumes![0]!.source = path.resolve(workspace, "data/postgres");
    });
    rejectMutation((c) => {
      c.services.backup!.volumes![0]!.source = path.resolve(workspace, "data/backups");
    });
    rejectMutation((c) => {
      c.secrets.postgres_app_password!.file = path.resolve(
        workspace,
        "data/secrets/postgres_app_password"
      );
    });
    rejectMutation((c) => {
      c.services.postgres!.container_name = "niedax-postgres";
    });
  });

  it("rejects host database ports, external database networking and unintended gateway exposure", () => {
    rejectMutation((c) => {
      c.services.postgres!.ports = [{ target: 5432, published: "5432" }];
    });
    rejectMutation((c) => {
      c.networks.backend!.internal = false;
    });
    rejectMutation((c) => {
      c.networks.backend!.external = true;
    });
    rejectMutation((c) => {
      c.services.backend!.network_mode = "host";
    });
    rejectMutation((c) => {
      c.services.gateway!.ports![0]!.host_ip = "192.0.2.1";
    });
  });

  it("rejects environment identity, credentials, endpoint and feature-flag bypasses", () => {
    rejectMutation((c) => {
      delete c.services.backend!.environment!.NIEDAX_ENV;
    });
    rejectMutation((c) => {
      c.services.frontend!.environment!.NIEDAX_ENV = "production";
    });
    rejectMutation((c) => {
      c.services.backend!.environment!.PGHOST = "normal-postgres";
    });
    rejectMutation((c) => {
      c.services.backend!.environment!.PGPASSWORD = "test-only-invalid-inline-value";
    });
    rejectMutation((c) => {
      c.services.backend!.environment!.NODE_OPTIONS = "--require=/unreviewed.js";
    });
    rejectMutation((c) => {
      c.services.postgres!.environment!.POSTGRES_HOST_AUTH_METHOD = "trust";
    });
    rejectMutation((c) => {
      c.services.backend!.environment!.NIEDAX_FEATURE_FLAGS = '{"unknown":true}';
    });
    const disabled = topology();
    disabled.services.backend!.environment!.NIEDAX_FEATURE_FLAGS = '{"operationalMetrics":false}';
    expect(() => validateTestTopology(disabled, options)).not.toThrow();
  });

  it("preserves capabilities, read-only filesystems, bounded logs and migration dependencies", () => {
    rejectMutation((c) => {
      c.services.backend!.read_only = false;
    });
    rejectMutation((c) => {
      c.services.backend!.cap_add = ["SYS_ADMIN"];
    });
    rejectMutation((c) => {
      c.services.gateway!.user = "0:0";
    });
    rejectMutation((c) => {
      c.services.backend!.tmpfs = ["/:rw"];
    });
    rejectMutation((c) => {
      c.services.backend!.logging = { driver: "none" };
    });
    rejectMutation((c) => {
      c.services.backend!.depends_on = { postgres: { condition: "service_healthy" } };
    });
    rejectMutation((c) => {
      c.services.backend!.depends_on = {
        postgres: { condition: "service_healthy" },
        migrations: { condition: "service_completed_successfully", required: false }
      };
    });
    rejectMutation((c) => {
      c.services.postgres!.healthcheck = { disable: true };
    });
  });

  it("rejects unreviewed images/builds, hook commands and additional mounts", () => {
    rejectMutation((c) => {
      c.services.postgres!.image = "postgres:latest";
    });
    rejectMutation((c) => {
      c.services.backend!.build!.dockerfile = "unreviewed.Dockerfile";
    });
    rejectMutation((c) => {
      c.services.backend!.build!.args = {
        ...(c.services.backend!.build!.args as object),
        PASSWORD: "invalid-test-only-build-argument"
      };
    });
    rejectMutation((c) => {
      c.services.backend!.post_start = [{ command: "unexpected" }];
    });
    rejectMutation((c) => {
      c.services.backend!.volumes = [
        { type: "bind", source: "/var/run/docker.sock", target: "/var/run/docker.sock" }
      ];
    });
    rejectMutation((c) => {
      Object.assign(c, { configs: { unexpected: { file: "unreviewed" } } });
    });
  });
});

describe("Stage 11 exact Stage 10 entry gate", () => {
  it("requires identified security/domain reviewers and evidence for the exact commit", () => {
    expect(() => assertStage10Acceptance(signoff(), commit)).not.toThrow();
    expect(() => assertStage10Acceptance(signoff(), "2".repeat(40))).toThrow("exact");
    for (const field of ["runtimeImageSecurity", "domainApproval"] as const) {
      for (const change of [{ status: "pending" }, { reviewer: null }, { evidence: "  " }]) {
        const evidence = signoff();
        Object.assign(evidence[field], change);
        expect(() => assertStage10Acceptance(evidence, commit)).toThrow("pending");
      }
    }
  });

  it("requires successful exact main-branch Stage 10 CI from the correct repository", () => {
    expect(() => assertStage10Run(run, commit)).not.toThrow();
    for (const changed of [
      { status: "in_progress" },
      { conclusion: "failure" },
      { head_sha: "2".repeat(40) },
      { head_branch: "feature" },
      { event: "pull_request" },
      { path: ".github/workflows/unrelated.yml" },
      { head_repository: { full_name: "someone/fork" } }
    ]) {
      expect(() => assertStage10Run({ ...run, ...changed }, commit)).toThrow("exact commit");
    }
  });
});

describe("Stage 11 filesystem boundary", () => {
  it("rejects redirected TEST directories, hard-linked secrets and redirected deployment metadata", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "niedax-stage11-path-"));
    try {
      await mkdir(path.join(directory, "data/test/secrets"), { recursive: true });
      await mkdir(path.join(directory, "data/test/deployment"), { recursive: true });
      await expect(assertTestPaths(directory)).resolves.toBeUndefined();
      const original = path.join(directory, "source.txt");
      const secret = path.join(directory, "data/test/secrets/postgres_app_password");
      await writeFile(original, "unit-test-only-nonsecret");
      await link(original, secret);
      await expect(assertTestPaths(directory)).rejects.toThrow("hard links");
      await unlink(secret);
      const metadata = path.join(directory, "data/test/deployment/owner.json");
      await link(original, metadata);
      await expect(assertTestPaths(directory)).rejects.toThrow("hard links");
      await unlink(metadata);
      const outside = path.join(directory, "unowned");
      await mkdir(outside);
      const linkedDirectory = path.join(directory, "data/test/postgres");
      await symlink(outside, linkedDirectory, process.platform === "win32" ? "junction" : "dir");
      await expect(assertTestPaths(directory)).rejects.toThrow("links or junctions");
      await unlink(linkedDirectory);
    } finally {
      assert(
        path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep),
        "Unsafe filesystem-test cleanup"
      );
      await rm(directory, { recursive: true, force: true });
    }
  });
});
