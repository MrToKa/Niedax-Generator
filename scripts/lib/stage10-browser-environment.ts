import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, unlink, writeFile, rmdir, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { resolve, sep } from "node:path";

import {
  deriveBrowserConfig,
  validateBrowserConfig,
  type BrowserComposeConfig
} from "./stage9-browser-config.js";
import { stage10AccountNames, type Stage10Accounts } from "./stage10-browser-fixture.js";

export interface Stage10BrowserEnvironment {
  baseUrl: string;
  processEnv: NodeJS.ProcessEnv;
  accounts: Stage10Accounts;
  project: string;
}

/** Child output is captured and scrubbed before emission, including failure paths. */
export async function runStage10Command(
  command: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
  secrets: readonly string[] = []
): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  const status = await new Promise<number>((resolveExit, reject) => {
    const child = spawn(command, args, { env, stdio: ["ignore", "pipe", "pipe"], shell: false });
    const consume = (chunk: Buffer) => {
      size += chunk.length;
      if (size <= 16 * 1024 * 1024) chunks.push(chunk);
      else child.kill();
    };
    child.stdout.on("data", consume);
    child.stderr.on("data", consume);
    child.once("error", reject);
    child.once("exit", (code) => resolveExit(code ?? 1));
  });
  let output = Buffer.concat(chunks).toString("utf8");
  for (const secret of secrets) if (secret) output = output.replaceAll(secret, "[REDACTED]");
  if (status !== 0) {
    // Avoid raw Docker/Playwright exception dumps in safe reports. The sanitized
    // development console remains available for diagnosis, with bounded output.
    process.stderr.write(output.slice(-24_000));
    throw new Error(`${command} Stage 10 command failed with exit ${status}`);
  }
  return output.trim();
}

export function validateStage10Config(
  config: BrowserComposeConfig,
  project: string,
  port: number,
  workspace: string,
  directory: string
): void {
  const artifactRoot = resolve(workspace, ".artifacts/stage10-browser");
  if (
    !/^niedax-stage10-[0-9]+-[0-9]+$/u.test(project) ||
    port < 1024 ||
    port > 65535 ||
    !Number.isInteger(port) ||
    resolve(directory) !== resolve(artifactRoot, project) ||
    !resolve(directory).startsWith(`${artifactRoot}${sep}`)
  )
    throw new Error("Refusing unrecognized Stage 10 disposable environment");
  // Reuse the established independent topology allow-list without weakening it.
  const surrogate = { project: "niedax-stage9-browser-10", port: 18089 };
  const check = structuredClone(config);
  if (check.name !== project) throw new Error("Disposable project identity mismatch");
  check.name = surrogate.project;
  for (const [name, service] of Object.entries(check.services)) {
    if (
      service.container_name !== `${project}-${name}` ||
      (service.build && service.image !== `${project}/${name}:local`)
    )
      throw new Error("Disposable service identity mismatch");
    service.container_name = `${surrogate.project}-${name}`;
    if (service.build) service.image = `${surrogate.project}/${name}:local`;
  }
  const portBinding = check.services.gateway?.ports?.[0];
  if (portBinding?.published !== String(port)) throw new Error("Disposable gateway port mismatch");
  portBinding.published = "18089";
  validateBrowserConfig(check, surrogate, workspace, directory);
}

export function deriveStage10Config(
  source: BrowserComposeConfig,
  project: string,
  port: number,
  workspace: string,
  directory: string
): BrowserComposeConfig {
  const config = deriveBrowserConfig(
    source,
    { project: "niedax-stage9-browser-10", port: 18089 },
    workspace,
    directory
  );
  config.name = project;
  for (const [name, service] of Object.entries(config.services)) {
    service.container_name = `${project}-${name}`;
    if (service.build) service.image = `${project}/${name}:local`;
  }
  config.services.gateway!.ports![0]!.published = String(port);
  const seed = config.services["browser-seed"]!;
  seed.environment = {
    NODE_ENV: "test",
    PGHOST: "postgres",
    PGDATABASE: "niedax_generator",
    STAGE10_PROJECT: project,
    STAGE10_ACCOUNTS_JSON: "${STAGE10_ACCOUNTS_JSON:?generated accounts required}"
  };
  seed.secrets = ["postgres_migrator_password", "postgres_app_password"];
  seed.command = ["pnpm", "exec", "tsx", "apps/backend/tests/stage10-browser-seed.ts"];
  seed.read_only = true;
  seed.cap_drop = ["ALL"];
  seed.security_opt = ["no-new-privileges:true"];
  seed.tmpfs = ["/tmp:rw,noexec,nosuid,size=64m"];
  validateStage10Config(config, project, port, workspace, directory);
  return config;
}

async function unusedLoopbackPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((ready, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", ready);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Cannot allocate disposable gateway port");
  await new Promise<void>((closed, reject) =>
    server.close((error) => (error ? reject(error) : closed()))
  );
  return address.port;
}

export async function withStage10BrowserEnvironment(
  operation: (environment: Stage10BrowserEnvironment) => Promise<void>,
  options: { cleanupEvidence?: "browser" | "performance" } = {}
): Promise<void> {
  const cleanupEvidence = options.cleanupEvidence ?? "browser";
  if (!["browser", "performance"].includes(cleanupEvidence))
    throw new Error("Refusing unrecognized Stage 10 cleanup evidence label");
  const workspace = resolve(".");
  const project = `niedax-stage10-${process.pid}-${Date.now()}`;
  const directory = resolve(workspace, ".artifacts/stage10-browser", project);
  const configPath = resolve(directory, "compose.json");
  const port = await unusedLoopbackPort();
  const accounts = Object.fromEntries(
    stage10AccountNames.map((name) => [
      name,
      {
        username: `stage10.${name.toLowerCase()}`,
        password: `S10!aA7-${randomBytes(32).toString("base64url")}`
      }
    ])
  ) as Stage10Accounts;
  const accountJson = JSON.stringify(accounts);
  const secretValues = [accountJson, ...Object.values(accounts).map((account) => account.password)];
  const environment = {
    ...process.env,
    COMPOSE_PROFILES: "",
    STAGE10_PROJECT: project,
    STAGE10_BASE_URL: `http://127.0.0.1:${port}`,
    STAGE10_ACCOUNTS_JSON: accountJson
  };
  const source = JSON.parse(
    await runStage10Command(
      "docker",
      ["compose", "-f", resolve(workspace, "compose.yaml"), "config", "--format", "json"],
      environment
    )
  ) as BrowserComposeConfig;
  const config = deriveStage10Config(source, project, port, workspace, directory);
  await mkdir(directory, { recursive: true });
  const ownedFiles: string[] = [];
  let operationError: unknown = null;
  let cleanupPassed = false;
  const compose = async (args: readonly string[]) => {
    const current = JSON.parse(await readFile(configPath, "utf8")) as BrowserComposeConfig;
    validateStage10Config(current, project, port, workspace, directory);
    return runStage10Command(
      "docker",
      ["compose", "-p", project, "-f", configPath, ...args],
      environment,
      secretValues
    );
  };
  try {
    for (const secret of Object.values(config.secrets)) {
      const value = randomBytes(32).toString("base64url");
      secretValues.push(value);
      await writeFile(secret.file, value, { mode: 0o600, flag: "wx" });
      ownedFiles.push(secret.file);
    }
    await writeFile(configPath, JSON.stringify(config, null, 2), { flag: "wx" });
    ownedFiles.push(configPath);
    process.stdout.write(`Stage 10 isolated build: ${project}\n`);
    await compose([
      "--profile",
      "seed",
      "build",
      "migrations",
      "backend",
      "frontend",
      "gateway",
      "browser-seed"
    ]);
    await compose(["up", "--detach", "--wait", "postgres"]);
    await compose(["run", "--rm", "--no-deps", "migrations"]);
    await compose(["--profile", "seed", "run", "--rm", "--no-deps", "browser-seed"]);
    await compose(["up", "--detach", "--wait"]);
    process.stdout.write("Stage 10 runtime ready; only the loopback Caddy gateway is published.\n");
    await operation({
      baseUrl: environment.STAGE10_BASE_URL,
      processEnv: environment,
      accounts,
      project
    });
  } catch (error) {
    operationError = error;
    if (ownedFiles.includes(configPath)) {
      try {
        const logs = await compose([
          "logs",
          "--no-log-prefix",
          "--no-color",
          "--tail",
          "100",
          "backend"
        ]);
        const categories: unknown[] = [];
        for (const line of logs.split("\n")) {
          try {
            const record = JSON.parse(line) as { err?: Record<string, unknown> };
            if (!record.err) continue;
            const category: Record<string, unknown> = Object.fromEntries(
              ["type", "code", "constraint", "table", "schema", "routine"].flatMap((key) =>
                typeof record.err?.[key] === "string" &&
                /^[a-zA-Z0-9_.]+$/u.test(record.err[key] as string)
                  ? [[key, record.err[key]]]
                  : []
              )
            );
            if (record.err.type === "ZodError" && typeof record.err.message === "string") {
              const issues = JSON.parse(record.err.message) as {
                code: string;
                path: (string | number)[];
              }[];
              category.validationPaths = issues.map((issue) => ({
                code: issue.code,
                path: issue.path
              }));
            }
            categories.push(category);
          } catch {
            /* Ignore non-JSON startup text; never emit raw container logs. */
          }
        }
        if (categories.length)
          process.stderr.write(
            `Stage 10 safe runtime error categories: ${JSON.stringify(categories)}\n`
          );
      } catch {
        /* Preserve the original failing gate if diagnostics are unavailable. */
      }
    }
  } finally {
    if (ownedFiles.includes(configPath)) {
      try {
        await compose([
          "--profile",
          "seed",
          "down",
          "--volumes",
          "--remove-orphans",
          "--rmi",
          "local"
        ]);
        const remaining = await runStage10Command(
          "docker",
          [
            "volume",
            "ls",
            "--filter",
            `label=com.docker.compose.project=${project}`,
            "--format",
            "{{.Name}}"
          ],
          environment,
          secretValues
        );
        cleanupPassed = remaining.length === 0;
      } catch {
        process.stderr.write(
          `Disposable cleanup failed for ${project}; state retained for diagnosis.\n`
        );
      }
    }
    if (cleanupPassed || !ownedFiles.includes(configPath)) {
      try {
        // Playwright may emit a DOM error-context artifact even with traces off.
        // Remove only this run's resolved output directory after sanitizing reports.
        const browserOutput = resolve(directory, "playwright-output");
        if (
          browserOutput ===
            resolve(workspace, ".artifacts/stage10-browser", project, "playwright-output") &&
          browserOutput.startsWith(`${directory}${sep}`)
        )
          await rm(browserOutput, { recursive: true, force: true });
        for (const path of ownedFiles) {
          if (!resolve(path).startsWith(`${directory}${sep}`)) {
            cleanupPassed = false;
            operationError ??= new Error("Refusing cleanup outside the exact disposable directory");
            break;
          }
          await unlink(path);
        }
        if (cleanupPassed) await rmdir(directory);
      } catch (error) {
        cleanupPassed = false;
        operationError ??= error;
      }
    }
    const reportDirectory = resolve(workspace, ".artifacts/stage10/safe");
    await mkdir(reportDirectory, { recursive: true });
    const cleanupReport = JSON.stringify(
      {
        schemaVersion: "stage10-cleanup/v1",
        timestamp: new Date().toISOString(),
        project,
        passed: cleanupPassed,
        normalDatabaseTouched: false
      },
      null,
      2
    );
    await writeFile(resolve(reportDirectory, `cleanup-${project}.json`), cleanupReport);
    await writeFile(resolve(reportDirectory, `${cleanupEvidence}-cleanup.json`), cleanupReport);
    process.stdout.write(`Stage 10 disposable cleanup: ${cleanupPassed ? "passed" : "failed"}.\n`);
  }
  if (operationError) throw operationError;
  if (!cleanupPassed) throw new Error("Stage 10 cleanup did not complete");
}
