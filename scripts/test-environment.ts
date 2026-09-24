import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, readdir, rename, writeFile, open, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import {
  TEST_PROJECT,
  TEST_SECRET_NAMES,
  assertStage10Acceptance,
  assertStage10Run,
  assertTestPaths,
  validateTestTopology,
  type Stage10Acceptance,
  type TestBuild
} from "./lib/stage11-config.js";
import type { BrowserComposeConfig } from "./lib/stage9-browser-config.js";
import { runTestCommand } from "./lib/stage11-process.js";
import { isProjectBackupFilename } from "./backup-policy.js";
import { sourceIdentity } from "./lib/stage10-evidence.js";

const workspace = resolve(".");
const directory = resolve(workspace, "data/test");
const deployment = resolve(directory, "deployment");
const args = process.argv.slice(2).filter((arg) => arg !== "--");
const command = args[0];
const localVerification = args.includes("--local-verification");
const allowedCommands = [
  "setup",
  "preflight",
  "start",
  "deploy",
  "stop",
  "status",
  "logs",
  "seed",
  "reset",
  "smoke",
  "backup",
  "verify-restore"
];
assert(
  command && allowedCommands.includes(command),
  `Usage: test-environment.ts ${allowedCommands.join("|")}`
);
const selectedArchive =
  command === "verify-restore"
    ? args.slice(1).find((arg) => isProjectBackupFilename(arg))
    : undefined;
assert(
  args.slice(1).every((arg) => arg === "--local-verification" || arg === selectedArchive),
  "Unknown TEST command option"
);
let deploymentRecordWritten = false;
const evidenceName =
  process.env.GITHUB_ACTIONS === "true" &&
  /^\d+$/u.test(process.env.GITHUB_RUN_ID ?? "") &&
  /^\d+$/u.test(process.env.GITHUB_RUN_ATTEMPT ?? "")
    ? `deployment-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}.json`
    : "deployment.json";

async function json<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}
async function save(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}
async function exists(path: string): Promise<boolean> {
  try {
    await readdir(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}
async function assertOwner(): Promise<void> {
  await assertTestPaths(workspace);
  const owner = await json<{ project: string; workspace: string }>(
    resolve(deployment, "owner.json")
  );
  assert(
    owner.project === TEST_PROJECT && owner.workspace === workspace,
    "TEST ownership marker mismatch"
  );
}
async function setup(): Promise<void> {
  await assertTestPaths(workspace);
  if ((await exists(directory)) && (await readdir(directory)).length) await assertOwner();
  for (const name of ["", "postgres", "backups", "secrets", "deployment"]) {
    const path = resolve(directory, name);
    await mkdir(path, { recursive: true, mode: 0o700 });
    if (process.platform !== "win32") await chmod(path, 0o700);
  }
  await save(resolve(deployment, "owner.json"), {
    schemaVersion: "test-owner/v1",
    project: TEST_PROJECT,
    workspace
  });
  for (const name of TEST_SECRET_NAMES) {
    const path = resolve(directory, "secrets", name);
    try {
      await writeFile(path, `${randomBytes(48).toString("base64url")}\n`, {
        flag: "wx",
        mode: 0o600
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      assert((await readFile(path, "utf8")).trim().length >= 32, "Invalid existing TEST secret");
    }
    if (process.platform !== "win32") await chmod(path, 0o600);
  }
  const { provisionStage11Accounts } = await import("./lib/stage11-seed.js");
  await provisionStage11Accounts(workspace);
  try {
    await writeFile(
      resolve(deployment, "stage10-acceptance.json"),
      await readFile(resolve(workspace, "docs/testing/stage10-acceptance.json")),
      { flag: "wx", mode: 0o600 }
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  process.stdout.write(
    "TEST setup ready. Credentials remain under data/test/secrets; restrict host ACLs to TEST operators.\n"
  );
}

const commit = (await runTestCommand("git", ["rev-parse", "HEAD"], process.env)).trim();
let build: TestBuild;
try {
  build = await json<TestBuild>(resolve(deployment, "operation-build.json"));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  try {
    build = await json<TestBuild>(resolve(deployment, "build.json"));
  } catch (fallbackError) {
    if ((fallbackError as NodeJS.ErrnoException).code !== "ENOENT") throw fallbackError;
    build = { gitCommit: commit, tag: commit, buildTimestamp: new Date().toISOString() };
  }
}
if (["start", "deploy"].includes(command))
  build = { gitCommit: commit, tag: commit, buildTimestamp: new Date().toISOString() };
let binding = { port: Number(process.env.NIEDAX_TEST_PORT ?? "8080"), bind: "0.0.0.0" };
try {
  binding = await json<typeof binding>(resolve(deployment, "binding.json"));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}
if (localVerification)
  binding = { port: Number(process.env.NIEDAX_TEST_PORT ?? "18091"), bind: "127.0.0.1" };
if (command === "deploy" || (command === "start" && !localVerification)) {
  assert(!localVerification, "Deployment cannot bypass acceptance");
  binding = { port: 8080, bind: "0.0.0.0" };
}
const env: NodeJS.ProcessEnv = {
  ...process.env,
  COMPOSE_PROFILES: "",
  COMPOSE_FILE: "",
  COMPOSE_PROJECT_NAME: TEST_PROJECT,
  NIEDAX_TEST_BUILD: build.tag,
  NIEDAX_GIT_COMMIT: build.gitCommit,
  NIEDAX_BUILD_TIMESTAMP: build.buildTimestamp,
  NIEDAX_TEST_PORT: String(binding.port),
  NIEDAX_TEST_BIND: binding.bind,
  NIEDAX_FEATURE_FLAGS: process.env.NIEDAX_FEATURE_FLAGS ?? "{}"
};
const composeArgs = [
  "compose",
  "--env-file",
  resolve(workspace, ".env.example"),
  "--project-directory",
  workspace,
  "-p",
  TEST_PROJECT,
  "-f",
  resolve(workspace, "compose.yaml"),
  "-f",
  resolve(workspace, "compose.test.yaml"),
  "--profile",
  "tools"
];
async function assertSafe(): Promise<void> {
  await assertOwner();
  const model = JSON.parse(
    await runTestCommand("docker", [...composeArgs, "config", "--format", "json"], env)
  ) as BrowserComposeConfig;
  validateTestTopology(model, { workspace, ...binding, build });
}
async function compose(args: readonly string[], input?: string): Promise<string> {
  await assertSafe();
  return runTestCommand("docker", [...composeArgs, ...args], env, input);
}
async function acceptanceGate(): Promise<void> {
  if (localVerification) {
    assert(
      binding.bind === "127.0.0.1" && !process.env.GITHUB_ACTIONS,
      "Local verification must remain loopback-only outside CI"
    );
    const dockerEndpoint =
      process.env.DOCKER_HOST ||
      (JSON.parse(
        await runTestCommand(
          "docker",
          ["context", "inspect", "--format", "{{json .Endpoints.docker.Host}}"],
          env
        )
      ) as string);
    assert(
      /^(?:npipe:\/\/|unix:\/\/)/u.test(dockerEndpoint),
      "Local verification requires a local Docker socket, never a remote daemon"
    );
    process.stdout.write(
      "Local implementation verification only; Stage 10 operational acceptance is not bypassed or recorded as passed.\n"
    );
    return;
  }
  assertStage10Acceptance(
    await json<Stage10Acceptance>(resolve(deployment, "stage10-acceptance.json")),
    commit
  );
  assert(
    !(await runTestCommand("git", ["status", "--porcelain"], env)),
    "Operational activation requires a clean checkout"
  );
  const runId = process.env.NIEDAX_STAGE10_RUN_ID;
  assert(runId && /^[0-9]+$/u.test(runId), "Provide the successful remote Stage 10 run ID");
  const token = process.env.GITHUB_TOKEN;
  assert(token, "A read-only Actions token is required to verify the remote CI gate");
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28"
  };
  const response = await fetch(
    `https://api.github.com/repos/MrToKa/Niedax-Generator/actions/runs/${runId}`,
    { headers, signal: AbortSignal.timeout(30_000) }
  );
  assert(response.ok, "Unable to verify Stage 10 remote run");
  assertStage10Run(await response.json(), commit);
  const currentMain = await fetch(
    "https://api.github.com/repos/MrToKa/Niedax-Generator/git/ref/heads/main",
    { headers, signal: AbortSignal.timeout(30_000) }
  );
  assert(
    currentMain.ok &&
      ((await currentMain.json()) as { object: { sha: string } }).object.sha === commit,
    "Refusing a stale deployment; main has moved"
  );
}
async function seed(): Promise<void> {
  const accounts = await readFile(resolve(directory, "secrets/accounts.json"), "utf8");
  await compose(
    ["run", "--rm", "--no-deps", "-T", "backend", "node", "dist/cli/stage11-seed.js"],
    accounts
  );
}
async function smoke() {
  const { runStage11Smoke } = await import("./lib/stage11-smoke.js");
  return runStage11Smoke({
    baseUrl: `http://127.0.0.1:${binding.port}`,
    accounts: await json(resolve(directory, "secrets/accounts.json")),
    expectedGitCommit: build.gitCommit
  });
}
async function backup() {
  const { createTestBackup } = await import("./lib/stage11-backup.js");
  return createTestBackup({ rootDirectory: workspace, runCompose: compose, assertSafe });
}
async function start(): Promise<void> {
  const record = {
    schemaVersion: "stage11-deployment/v1",
    timestamp: new Date().toISOString(),
    environment: "test",
    build,
    sourceHash: await sourceIdentity(),
    workingTreeDirty: !!(await runTestCommand("git", ["status", "--porcelain"], env)),
    applicationVersion: (await json<{ version: string }>(resolve(workspace, "package.json")))
      .version,
    operationallyAccepted: !localVerification,
    migrationStatus: "not-run",
    backupVerificationStatus: "not-run",
    healthStatus: "not-run",
    smokeStatus: "not-run",
    deploymentResult: "in-progress",
    failedStep: null as string | null,
    smoke: null as unknown
  };
  const recordPath = resolve(deployment, `deployment-${Date.now()}.json`);
  let step = "acceptance";
  try {
    await acceptanceGate();
    step = "preflight";
    await assertSafe();
    await save(resolve(deployment, "operation-build.json"), build);
    await save(resolve(deployment, "binding.json"), binding);
    step = "build";
    process.stdout.write("TEST build with pinned source identity...\n");
    await compose(["build", "migrations", "backend", "frontend", "gateway", "backup"]);
    const existingData = (await readdir(resolve(directory, "postgres"))).length > 0;
    step = "database";
    await compose(["up", "--detach", "--wait", "postgres"]);
    // Quiesce application writes before the backup snapshot and migration boundary.
    await compose(["stop", "gateway", "backend"]);
    if (existingData) {
      step = "backup";
      await backup();
      record.backupVerificationStatus = "passed";
    } else record.backupVerificationStatus = "not-applicable-empty-database";
    // Retain downtime on backup, migration or provisioning failure.
    step = "migrations";
    process.stdout.write("TEST forward migrations and idempotent provisioning...\n");
    await compose(["run", "--rm", "--no-deps", "migrations"]);
    await compose(["run", "--rm", "--no-deps", "migrations", "node", "dist/migrate.js", "verify"]);
    record.migrationStatus = "passed";
    step = "seed";
    await seed();
    step = "readiness";
    await compose(["up", "--detach", "--wait", "backend", "frontend", "gateway"]);
    record.healthStatus = "passed";
    step = "smoke";
    record.smoke = await smoke();
    record.smokeStatus = "passed";
    record.deploymentResult = "passed";
    try {
      await save(
        resolve(deployment, "previous-build.json"),
        await json(resolve(deployment, "build.json"))
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await save(resolve(deployment, "build.json"), build);
    await save(resolve(deployment, "binding.json"), binding);
    process.stdout.write("TEST implementation smoke passed. See sanitized deployment record.\n");
  } catch (error) {
    record.deploymentResult = "failed";
    record.operationallyAccepted = false;
    record.failedStep = step;
    if (step === "backup") record.backupVerificationStatus = "failed";
    if (step === "readiness") record.healthStatus = "failed";
    if (step === "migrations") record.migrationStatus = "failed";
    if (step === "smoke") {
      record.smokeStatus = "failed";
      await compose(["stop", "gateway"]).catch(() => undefined);
    }
    throw error;
  } finally {
    await save(recordPath, record);
    await save(resolve(deployment, "latest.json"), record);
    await mkdir(resolve(workspace, ".artifacts/stage11/safe"), { recursive: true });
    await save(resolve(workspace, ".artifacts/stage11/safe", evidenceName), record);
    deploymentRecordWritten = true;
  }
}
async function reset(): Promise<void> {
  await assertSafe();
  assert(stdin.isTTY, "TEST reset requires an interactive operator");
  const prompt = createInterface({ input: stdin, output: stdout });
  const confirmation = await prompt.question(
    "Type RESET niedax-test to archive and recreate TEST PostgreSQL storage: "
  );
  prompt.close();
  assert(confirmation === "RESET niedax-test", "Reset cancelled");
  await backup();
  await compose(["down"]);
  await assertSafe();
  const source = resolve(directory, "postgres");
  const target = resolve(deployment, `reset-postgres-${Date.now()}`);
  assert(
    source === resolve(workspace, "data/test/postgres") &&
      target.startsWith(`${deployment}${process.platform === "win32" ? "\\" : "/"}`)
  );
  await rename(source, target);
  await mkdir(source, { mode: 0o700 });
  process.stdout.write(
    "TEST database archived under TEST deployment storage. Run start to recreate; retained backups and secrets were preserved.\n"
  );
}

try {
  if (command === "setup") await setup();
  else {
    await assertSafe();
    const lockPath = resolve(deployment, "operation.lock");
    const readonly = ["preflight", "status", "logs"].includes(command);
    const lock = readonly ? null : await open(lockPath, "wx", 0o600);
    try {
      switch (command) {
        case "preflight":
          process.stdout.write(
            "TEST topology preflight passed. Acceptance is evaluated separately on activation.\n"
          );
          break;
        case "start":
        case "deploy":
          await start();
          break;
        case "stop":
          await compose(["down"]);
          break;
        case "status":
          process.stdout.write(`${await compose(["ps", "--all"])}\n`);
          break;
        case "logs": {
          let output = await compose(["logs", "--tail", "200", "--no-color"]);
          for (const name of TEST_SECRET_NAMES)
            output = output.replaceAll(
              (await readFile(resolve(directory, "secrets", name), "utf8")).trim(),
              "[REDACTED]"
            );
          const accounts = await json<Record<string, { password: string }>>(
            resolve(directory, "secrets/accounts.json")
          );
          for (const account of Object.values(accounts))
            output = output.replaceAll(account.password, "[REDACTED]");
          process.stdout.write(`${output}\n`);
          break;
        }
        case "seed":
          await compose(["stop", "gateway", "backend"]);
          await backup();
          await seed();
          await compose(["up", "--detach", "--wait", "backend", "gateway"]);
          break;
        case "reset":
          await reset();
          break;
        case "smoke":
          process.stdout.write(`${JSON.stringify(await smoke())}\n`);
          break;
        case "backup":
          process.stdout.write(`${JSON.stringify(await backup())}\n`);
          break;
        case "verify-restore": {
          const { verifyTestRestore } = await import("./lib/stage11-backup.js");
          const result = await verifyTestRestore(
            { rootDirectory: workspace, runCompose: compose, assertSafe },
            selectedArchive
          );
          await save(resolve(deployment, `restore-verification-${Date.now()}.json`), result);
          process.stdout.write(`${JSON.stringify(result)}\n`);
          break;
        }
      }
    } finally {
      if (lock) {
        await lock.close();
        await unlink(lockPath);
      }
    }
  }
} catch (error) {
  if (["start", "deploy"].includes(command) && !deploymentRecordWritten) {
    await mkdir(resolve(workspace, ".artifacts/stage11/safe"), { recursive: true });
    await save(resolve(workspace, ".artifacts/stage11/safe", evidenceName), {
      schemaVersion: "stage11-deployment/v1",
      timestamp: new Date().toISOString(),
      build,
      environment: "test",
      operationallyAccepted: false,
      deploymentResult: "failed",
      failedStep: "preflight-or-lock"
    });
  }
  process.stderr.write(`${error instanceof Error ? error.message : "TEST operation failed"}\n`);
  process.exitCode = 1;
}
