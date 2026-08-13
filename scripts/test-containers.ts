import { setTimeout as delay } from "node:timers/promises";

import { privateLanAddresses } from "./lib/network.js";
import { compose, run } from "./lib/process.js";
import { prepareLocalData } from "./lib/setup.js";

interface ComposeProcess {
  Name: string;
  Service: string;
  State: string;
  Health?: string;
  Publishers?: Array<{ PublishedPort?: number; TargetPort?: number; URL?: string }>;
}

function parseProcesses(raw: string): ComposeProcess[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw) as ComposeProcess | ComposeProcess[];
    return Array.isArray(value) ? value : [value];
  } catch {
    return raw
      .split(/\r?\n/u)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as ComposeProcess);
  }
}

async function waitForGateway(): Promise<void> {
  const deadline = Date.now() + 180_000;
  let last = "not attempted";
  while (Date.now() < deadline) {
    try {
      const response = await fetch("http://localhost:8080/api/v1/health/ready", {
        signal: AbortSignal.timeout(3_000)
      });
      last = `${response.status} ${await response.text()}`;
      if (response.ok) return;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await delay(2_000);
  }
  throw new Error(`Gateway did not become ready: ${last}`);
}

async function verifyEndpoints(): Promise<void> {
  const home = await fetch("http://localhost:8080", { signal: AbortSignal.timeout(5_000) });
  const live = await fetch("http://localhost:8080/api/v1/health/live", {
    signal: AbortSignal.timeout(5_000)
  });
  const version = await fetch("http://localhost:8080/api/v1/version", {
    signal: AbortSignal.timeout(5_000)
  });
  if (!home.ok || !(await home.text()).includes("Niedax Generator"))
    throw new Error("Frontend route failed");
  if (!live.ok || ((await live.json()) as { status?: string }).status !== "ok")
    throw new Error("API route failed");
  const versions = (await version.json()) as {
    application?: string;
    catalogue?: string;
    rules?: string;
  };
  if (
    versions.application !== "0.1.0" ||
    versions.catalogue !== "0.1.0" ||
    versions.rules !== "0.1.0"
  ) {
    throw new Error("Version endpoint is inconsistent");
  }
  for (const address of privateLanAddresses()) {
    const lan = await fetch(`http://${address}:8080/api/v1/health/live`, {
      signal: AbortSignal.timeout(5_000)
    });
    if (!lan.ok) throw new Error(`LAN-style host access failed for ${address}`);
    process.stdout.write(`LAN-style host check passed: http://${address}:8080\n`);
  }
}

function verifyTopology(): void {
  const processes = parseProcesses(compose(["ps", "--format", "json"], { capture: true }));
  const running = new Set(
    processes.filter((entry) => entry.State === "running").map((entry) => entry.Service)
  );
  for (const service of ["gateway", "frontend", "backend", "postgres"]) {
    if (!running.has(service)) throw new Error(`${service} is not running`);
  }
  const published = processes.flatMap((entry) =>
    (entry.Publishers ?? [])
      .filter((publisher) => publisher.PublishedPort)
      .map((publisher) => ({ service: entry.Service, port: publisher.PublishedPort }))
  );
  if (published.length !== 1 || published[0]?.service !== "gateway" || published[0].port !== 8080) {
    throw new Error(`Unexpected published ports: ${JSON.stringify(published)}`);
  }
  for (const container of ["niedax-frontend", "niedax-backend", "niedax-postgres"]) {
    const ports = run("docker", ["port", container], { capture: true, allowFailure: true });
    if (ports) throw new Error(`${container} unexpectedly publishes ${ports}`);
  }
  process.stdout.write("Topology check passed: only gateway publishes host TCP 8080.\n");
}

await prepareLocalData();
compose(["up", "--build", "--detach", "--remove-orphans"]);
await waitForGateway();
await verifyEndpoints();
verifyTopology();
run("docker", ["compose", "exec", "-T", "backend", "node", "dist/cli/verify-auth.js"]);

const migrationStatusBefore = compose(
  ["run", "--rm", "migrations", "node", "dist/migrate.js", "status"],
  { capture: true }
);
compose(["stop"]);
compose(["up", "--detach"]);
await waitForGateway();
const migrationStatusAfter = compose(
  ["run", "--rm", "migrations", "node", "dist/migrate.js", "status"],
  { capture: true }
);
if (
  migrationStatusBefore !== migrationStatusAfter ||
  !migrationStatusAfter.includes("pending: 0")
) {
  throw new Error("Migration metadata did not persist across stop/start");
}
await verifyEndpoints();
verifyTopology();
process.stdout.write("Persistence check passed across project stop/start.\n");
run("docker", [
  "stats",
  "--no-stream",
  "--format",
  "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}",
  "niedax-gateway",
  "niedax-frontend",
  "niedax-backend",
  "niedax-postgres"
]);
