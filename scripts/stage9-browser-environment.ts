import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { run } from "./lib/process.js";
import {
  checkBrowserState,
  deriveBrowserConfig,
  validateBrowserConfig,
  type BrowserComposeConfig,
  type BrowserEnvironmentState
} from "./lib/stage9-browser-config.js";

// Derive the exact production topology, replacing only names, credentials, data volume
// and the gateway port. No operation in this tool can target the normal project.
const directory = resolve(".artifacts/stage9-browser");
const statePath = resolve(directory, "state.json");
const configPath = resolve(directory, "compose.json");
const command = process.argv[2];
if (!["up", "down", "status"].includes(command ?? "")) {
  throw new Error("Usage: pnpm stage9:browser up|down|status");
}

async function compose(
  state: BrowserEnvironmentState,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
  capture = false
): Promise<string> {
  checkBrowserState(state);
  const config = JSON.parse(await readFile(configPath, "utf8")) as BrowserComposeConfig;
  validateBrowserConfig(config, state, resolve("."), directory);
  return run("docker", ["compose", "-p", state.project, "-f", configPath, ...args], {
    env: { ...env, COMPOSE_PROFILES: "" },
    capture
  });
}

if (command === "up") {
  await mkdir(directory, { recursive: true });
  const previous = await readFile(statePath, "utf8").catch(() => null);
  if (previous) throw new Error("An environment state exists; inspect status or run down first");
  const state = { project: `niedax-stage9-browser-${Date.now()}`, port: 18089 };
  const source = JSON.parse(
    run("docker", ["compose", "-f", resolve("compose.yaml"), "config", "--format", "json"], {
      capture: true
    })
  ) as BrowserComposeConfig;
  const config = deriveBrowserConfig(source, state, resolve("."), directory);
  let migratorPassword = "";
  for (const [name, secret] of Object.entries(config.secrets)) {
    const value = randomBytes(32).toString("base64url");
    await writeFile(secret.file, value, { mode: 0o600 });
    if (name === "postgres_migrator_password") migratorPassword = value;
  }
  await writeFile(configPath, JSON.stringify(config, null, 2));
  await writeFile(statePath, JSON.stringify(state));
  const environment = { ...process.env, STAGE9_MIGRATOR_PASSWORD: migratorPassword };
  await compose(state, ["build", "migrations", "backend", "frontend", "gateway"], environment);
  await compose(state, ["up", "--detach", "--wait", "postgres"], environment);
  await compose(state, ["run", "--rm", "--no-deps", "migrations"], environment);
  // SET ROLE assertions need the same test-only membership as initialize-test.sh. This runs
  // only inside the validated disposable database; production role grants are unchanged.
  await compose(
    state,
    [
      "exec",
      "-T",
      "--user",
      "postgres",
      "postgres",
      "psql",
      "-U",
      "postgres",
      "-d",
      "niedax_generator",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      "GRANT niedax_generator_app TO niedax_generator_migrator"
    ],
    environment
  );
  await compose(
    state,
    [
      "run",
      "--rm",
      "--no-deps",
      "migrations",
      "sh",
      "-c",
      "node dist/seed.js && node dist/database-test.js && node dist/stage4-test.js && node dist/stage5-test.js && node dist/stage7-test.js && node dist/stage8-test.js"
    ],
    environment
  );
  await compose(state, ["--profile", "seed", "build", "browser-seed"], environment);
  await compose(
    state,
    ["--profile", "seed", "run", "--rm", "--no-deps", "browser-seed"],
    environment
  );
  const ready = await compose(
    state,
    [
      "exec",
      "-T",
      "--user",
      "postgres",
      "postgres",
      "psql",
      "-U",
      "postgres",
      "-d",
      "niedax_generator",
      "-tAc",
      "SELECT count(*) FROM users WHERE username='stage9.administrator' AND enabled AND role='administrator'"
    ],
    environment,
    true
  );
  if (ready !== "1") throw new Error("The synthetic browser administrator fixture was not created");
  // Start the real runtime only after the acceptance fixtures finish. Its recovery worker must
  // not race with the disposable crash/retry tests while they deliberately hold pending jobs.
  await compose(state, ["up", "--detach", "--wait"], environment);
  await writeFile(
    resolve(directory, "fixture-login.txt"),
    "Disposable synthetic fixture only.\nURL: http://localhost:18089\nUsername: stage9.administrator\nPassword: Synthetic-Stage9-administrator-42!Aa\nProject: SYN-STAGE9-EXPORT\nRevision 1: Approved; revision 2: Calculated.\n",
    { mode: 0o600 }
  );
  process.stdout.write(`Disposable browser environment ready: http://localhost:${state.port}\n`);
} else {
  const state = JSON.parse(await readFile(statePath, "utf8")) as BrowserEnvironmentState;
  checkBrowserState(state);
  // Resolve the required seed environment without putting the value in command arguments/logs.
  const environment = {
    ...process.env,
    STAGE9_MIGRATOR_PASSWORD: await readFile(
      resolve(directory, "postgres_migrator_password.secret"),
      "utf8"
    )
  };
  await compose(
    state,
    command === "down" ? ["down", "--volumes", "--remove-orphans"] : ["ps"],
    environment
  );
  if (command === "down") {
    // Preserve evidence and secrets locally; only retire the exact state pointer, never recurse.
    const { unlink } = await import("node:fs/promises");
    await unlink(statePath);
  }
}
