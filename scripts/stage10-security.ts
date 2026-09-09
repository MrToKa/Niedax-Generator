import { spawnSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { resolve, relative } from "node:path";

import {
  commitIdentity,
  fileHash,
  pnpmCommand,
  sourceIdentity,
  writeEvidence
} from "./lib/stage10-evidence.js";
import {
  assertBuiltAssetDiscovery,
  classifySecuritySource,
  securityTextFindings
} from "./lib/stage10-security-guards.js";

const startedSourceHash = await sourceIdentity();
const findings: Array<{ path: string; category: string }> = [];
const filesResult = spawnSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8", shell: false }
);
if (filesResult.status !== 0) throw new Error("Tracked-file inventory failed");
const files = [...new Set(filesResult.stdout.split("\0").filter(Boolean))];
for (const file of files) {
  const action = classifySecuritySource(file);
  if (action === "reject") {
    findings.push({ path: file, category: "tracked-sensitive-path" });
    continue;
  }
  if (action === "skip") continue;
  const content = await readFile(file, "utf8");
  for (const category of securityTextFindings(file, content))
    findings.push({ path: file, category });
}

async function runtimeAssets(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const result: string[] = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await runtimeAssets(path)));
    else if (/\.(?:js|css|html)$/u.test(entry.name)) result.push(path);
  }
  return result;
}
// Missing build output is a failure, not an empty scan. Source validate builds these first.
const frontendAssets = await runtimeAssets("apps/frontend/.next/static");
const backendAssets = await runtimeAssets("apps/backend/dist");
assertBuiltAssetDiscovery(frontendAssets, backendAssets);
const built = [...frontendAssets, ...backendAssets];
for (const file of built) {
  const content = await readFile(file, "utf8");
  for (const category of securityTextFindings(file, content, true))
    findings.push({
      path: relative(process.cwd(), file).replaceAll("\\", "/"),
      category
    });
}

for (const path of [
  "data/secrets/probe.secret",
  ".artifacts/stage10-browser/probe/state.json",
  "test-results/probe/trace.zip",
  "playwright-report/index.html",
  "storage-state-probe.json"
]) {
  const ignored = spawnSync("git", ["check-ignore", "--quiet", "--no-index", path], {
    shell: false
  });
  if (ignored.status !== 0) findings.push({ path, category: "missing-ignore-rule" });
}

let failed = findings.length > 0;
const audits: Array<{ scope: string; exitCode: number; executed: boolean; advisories: unknown }> =
  [];
for (const scope of ["prod", "all"]) {
  const result = pnpmCommand(["audit", ...(scope === "prod" ? ["--prod"] : []), "--json"], true);
  let audit: { advisories?: unknown; metadata?: unknown } = {};
  try {
    audit = JSON.parse(result.stdout) as typeof audit;
  } catch {
    /* report unavailable safely */
  }
  const executed = audit.advisories !== undefined && audit.metadata !== undefined;
  const exitCode = result.status ?? 1;
  const report = {
    schemaVersion: "stage10-audit/v1",
    timestamp: new Date().toISOString(),
    tool: "pnpm 11.21.0",
    scope,
    exitCode,
    executed,
    ...audit
  };
  await writeEvidence(`audit-${scope}.json`, report);
  audits.push({ scope, exitCode, executed, advisories: audit.advisories ?? null });
  if (exitCode !== 0 || !executed) failed = true;
  process.stdout.write(`Dependency audit ${scope}: executed=${executed}, exit=${exitCode}\n`);
}
const sourceUnchanged = startedSourceHash === (await sourceIdentity());
if (!sourceUnchanged) failed = true;
await writeEvidence("security.json", {
  schemaVersion: "stage10-security/v1",
  timestamp: new Date().toISOString(),
  commit: commitIdentity(),
  sourceHash: startedSourceHash,
  sourceUnchanged,
  lockfileHash: await fileHash("pnpm-lock.yaml"),
  trackedAndUntrackedFiles: files.length,
  builtAssets: built.length,
  builtAssetsByService: { frontend: frontendAssets.length, backend: backendAssets.length },
  findings,
  audits,
  passed: !failed,
  secretsRead: false
});
for (const finding of findings) process.stderr.write(`${finding.category}: ${finding.path}\n`);
if (failed) process.exitCode = 1;
else
  process.stdout.write(
    `Security checks passed: ${files.length} source paths, ${built.length} built assets, both dependency audits.\n`
  );
