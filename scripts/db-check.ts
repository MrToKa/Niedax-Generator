import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";

import {
  databaseCheckComposeFile,
  validateDatabaseCheckConfig,
  validateDatabaseCheckTarget,
  type DatabaseCheckConfig
} from "./lib/db-check-config.js";
import { run } from "./lib/process.js";
import { commitIdentity, fileHash, sourceIdentity, writeEvidence } from "./lib/stage10-evidence.js";

const project = `niedax-dbcheck-${process.pid}-${Date.now()}`.toLowerCase();
const sourceHash = await sourceIdentity();
const workspace = process.cwd();
const environment = { ...process.env, DB_CHECK_PASSWORD: randomBytes(32).toString("base64url") };
const prefix = ["compose", "-p", project, "-f", databaseCheckComposeFile];
const cycles: Array<{ cycle: number; timestamp: string; passed: boolean; postgres?: unknown }> = [];
const cleanup: Array<{
  afterCycle: number;
  passed: boolean;
  containersRemaining: number;
  volumesRemaining: number;
}> = [];
let currentCycle = 0;
let failed = false;

function preflight(): void {
  validateDatabaseCheckTarget(project, databaseCheckComposeFile, workspace);
  // Never print config: it contains the disposable password generated above.
  const serialized = run("docker", [...prefix, "config", "--format", "json"], {
    env: environment,
    capture: true
  });
  validateDatabaseCheckConfig(JSON.parse(serialized) as DatabaseCheckConfig, project, workspace);
}

function compose(args: readonly string[]): void {
  preflight();
  run("docker", [...prefix, ...args], { env: environment });
}

function clean(): void {
  compose(["down", "--volumes", "--remove-orphans"]);
  const containers = run(
    "docker",
    ["ps", "-aq", "--filter", `label=com.docker.compose.project=${project}`],
    { capture: true }
  );
  const volumes = run(
    "docker",
    ["volume", "ls", "-q", "--filter", `label=com.docker.compose.project=${project}`],
    { capture: true }
  );
  cleanup.push({
    afterCycle: currentCycle,
    passed: !containers && !volumes,
    containersRemaining: containers ? containers.split(/\r?\n/u).length : 0,
    volumesRemaining: volumes ? volumes.split(/\r?\n/u).length : 0
  });
  if (containers || volumes) throw new Error("Disposable database cleanup left project resources");
}

function acceptance(): unknown {
  preflight();
  const executed = spawnSync(
    "docker",
    [...prefix, "run", "--rm", "--no-deps", "stage7-acceptance"],
    { env: environment, encoding: "utf8", shell: false, maxBuffer: 8 * 1024 * 1024 }
  );
  const marker = "STAGE10_POSTGRES_REPORT=";
  const reportLine = executed.stdout?.split(/\r?\n/u).find((line) => line.startsWith(marker));
  if (!reportLine)
    throw new Error("PostgreSQL acceptance did not emit its required discovery evidence");
  const report: unknown = JSON.parse(reportLine.slice(marker.length));
  // The custom reporter contains only known file/test names, states, counts and timestamp.
  process.stdout.write(`${reportLine}\n`);
  if (
    executed.error ||
    executed.status !== 0 ||
    !report ||
    typeof report !== "object" ||
    !("passed" in report) ||
    report.passed !== true
  ) {
    cycles.push({
      cycle: currentCycle,
      timestamp: new Date().toISOString(),
      passed: false,
      postgres: report
    });
    throw new Error(
      "Disposable PostgreSQL acceptance failed; inspect its sanitized test names and states"
    );
  }
  return report;
}

try {
  compose(["build", "migrations", "verify", "stage7-acceptance", "stage8-acceptance"]);
  for (const cycle of [1, 2]) {
    currentCycle = cycle;
    compose(["up", "--detach", "--wait", "postgres"]);
    compose(["run", "--rm", "--no-deps", "migrations"]);
    compose(["run", "--rm", "--no-deps", "verify"]);
    compose(["run", "--rm", "--no-deps", "stage8-acceptance"]);
    const postgres = acceptance();
    cycles.push({ cycle, timestamp: new Date().toISOString(), passed: true, postgres });
    clean();
  }
} catch (error) {
  failed = true;
  throw error;
} finally {
  // Failure and cleanup remain separately visible; neither can turn the other green.
  try {
    clean();
  } catch {
    failed = true;
    process.exitCode = 1;
    cleanup.push({
      afterCycle: currentCycle,
      passed: false,
      containersRemaining: -1,
      volumesRemaining: -1
    });
    process.stderr.write(
      "Disposable database cleanup failed; only the exact guarded project may be investigated.\n"
    );
  }
  const sourceUnchanged = sourceHash === (await sourceIdentity());
  if (!sourceUnchanged) {
    failed = true;
    process.exitCode = 1;
    process.stderr.write("Source changed during disposable PostgreSQL validation.\n");
  }
  await writeEvidence("postgres.json", {
    schemaVersion: "stage10-postgres-cycles/v1",
    timestamp: new Date().toISOString(),
    commit: commitIdentity(),
    sourceHash,
    sourceUnchanged,
    project,
    composeSha256: await fileHash(databaseCheckComposeFile),
    suites: await Promise.all(
      [
        "apps/backend/tests/project-flow.integration.test.ts",
        "apps/backend/tests/stage10-postgres.integration.test.ts"
      ].map(async (path) => ({ path, sha256: await fileHash(path) }))
    ),
    requiredCycles: 2,
    expectedTestsPerCycle: 15,
    conditionalEnvironment: "STAGE7_ACCEPTANCE=1",
    normalDatabaseTouched: false,
    cycles,
    cleanup,
    passed:
      !failed &&
      cycles.length === 2 &&
      cycles.every((cycle) => cycle.passed) &&
      cleanup.every((entry) => entry.passed)
  });
}
