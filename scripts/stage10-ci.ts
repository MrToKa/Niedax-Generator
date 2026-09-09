import {
  commitIdentity,
  fileHash,
  pnpmCommand,
  sourceIdentity,
  writeEvidence
} from "./lib/stage10-evidence.js";

// No raw child output, cookies, account data, traces, workbooks or environment dumps
// are copied to the safe upload directory. Child failures keep their original exit.
const results: Array<{ command: string; startedAt: string; endedAt: string; exitCode: number }> =
  [];
const startedAt = new Date().toISOString();
const commit = commitIdentity();
const lockfileHash = await fileHash("pnpm-lock.yaml");
const sourceHash = await sourceIdentity();
for (const command of [
  "validate:full",
  "test:e2e",
  "test:security",
  "test:performance",
  "test:fixtures"
]) {
  const start = new Date().toISOString();
  process.stdout.write(`Stage 10 gate: ${command}\n`);
  const child = pnpmCommand([command]);
  const exitCode = child.status ?? 1;
  results.push({ command, startedAt: start, endedAt: new Date().toISOString(), exitCode });
  await writeEvidence("stage10-run.json", {
    schemaVersion: "stage10-run/v1",
    startedAt,
    commit,
    lockfileHash,
    sourceHash,
    ci:
      process.env.GITHUB_ACTIONS === "true"
        ? {
            provider: "github",
            runId: process.env.GITHUB_RUN_ID,
            attempt: process.env.GITHUB_RUN_ATTEMPT
          }
        : null,
    results,
    complete: results.length === 5,
    passed: results.length === 5 && results.every((result) => result.exitCode === 0)
  });
  if (exitCode !== 0) {
    process.exitCode = exitCode;
    break;
  }
}
