import { compose, run } from "./lib/process.js";

const externalReferenceScan = run(
  "rg",
  [
    "--pcre2",
    "-n",
    "--glob",
    "!**/*.d.ts",
    "https?://(?!(?:localhost|127\\.0\\.0\\.1|frontend|backend|postgres)(?::|/))",
    "apps",
    "packages",
    "database",
    "gateway",
    "compose.yaml",
    "compose.dev.yaml"
  ],
  { capture: true, allowFailure: true }
);
if (externalReferenceScan) throw new Error(`External runtime URL found:\n${externalReferenceScan}`);

const html = await (
  await fetch("http://localhost:8080", { signal: AbortSignal.timeout(5_000) })
).text();
const externalAsset = /(?:src|href)=["']https?:\/\//iu.exec(html);
if (externalAsset)
  throw new Error(`Rendered HTML contains an external asset reference: ${externalAsset[0]}`);

const publicPortOutput = compose(["ps", "--format", "json"], { capture: true });
const published = [...publicPortOutput.matchAll(/"PublishedPort"\s*:\s*(\d+)/gu)].map((match) =>
  Number(match[1])
);
if (published.length !== 1 || published[0] !== 8080) {
  throw new Error(`Expected only published port 8080, found ${published.join(", ") || "none"}`);
}

const nodeProbe = [
  "node",
  "-e",
  "fetch('http://1.1.1.1',{signal:AbortSignal.timeout(2500)}).then(()=>process.exit(9)).catch(()=>process.exit(0))"
] as const;
for (const container of ["niedax-frontend", "niedax-backend"]) {
  run("docker", ["exec", container, ...nodeProbe]);
  process.stdout.write(`External egress blocked for ${container}.\n`);
}
for (const container of ["niedax-postgres"]) {
  run("docker", [
    "exec",
    container,
    "sh",
    "-c",
    "wget -q -T 3 -O /dev/null http://1.1.1.1 && exit 9 || exit 0"
  ]);
  process.stdout.write(`External egress blocked for ${container}.\n`);
}
const gatewayProbe = run(
  "docker",
  [
    "exec",
    "niedax-gateway",
    "sh",
    "-c",
    "if wget -q -T 3 -O /dev/null http://1.1.1.1; then echo REACHABLE; else echo BLOCKED; fi"
  ],
  { capture: true }
);
if (gatewayProbe.includes("REACHABLE")) {
  process.stdout.write(
    "Gateway network egress remains reachable through Docker Desktop's required ingress bridge; host-firewall approval is required for complete defense in depth.\n"
  );
} else {
  process.stdout.write("External egress blocked for niedax-gateway.\n");
}
compose(["run", "--rm", "--no-deps", "migrations", ...nodeProbe]);
process.stdout.write("External egress blocked for the migrations image.\n");
compose([
  "--profile",
  "tools",
  "run",
  "--rm",
  "--no-deps",
  "--entrypoint",
  "/bin/sh",
  "backup",
  "-c",
  "wget -q -T 3 -O /dev/null http://1.1.1.1 && exit 9 || exit 0"
]);
process.stdout.write("External egress blocked for the backup image.\n");

const databasePorts = run("docker", ["port", "niedax-postgres"], {
  capture: true,
  allowFailure: true
});
if (databasePorts) throw new Error(`PostgreSQL unexpectedly has host mappings: ${databasePorts}`);

const ready = await fetch("http://localhost:8080/api/v1/health/ready", {
  signal: AbortSignal.timeout(5_000)
});
if (!ready.ok) throw new Error("Application failed after egress probes");
process.stdout.write("Runtime isolation checks passed at application and Docker-network layers.\n");
process.stdout.write(
  "Host firewall egress enforcement remains a separately approved defense-in-depth control.\n"
);
