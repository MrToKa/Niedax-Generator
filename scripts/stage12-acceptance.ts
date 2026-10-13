import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import {
  evaluateStage12Acceptance,
  safeStage12ArtifactPath,
  stage12ExitCode,
  stage12Hash,
  type Stage12Acceptance
} from "./lib/stage12-acceptance.js";
import type { JsonValue } from "../packages/calculation-engine/src/stable/canonical-json.js";

async function readSafeFile(path: string): Promise<Buffer> {
  if (!safeStage12ArtifactPath(path)) throw new Error("Unsafe input or artifact path");
  const root = await realpath(resolve("."));
  const target = resolve(root, path);
  if (!target.startsWith(`${root}${sep}`)) throw new Error("Path escaped workspace");
  let current = root;
  for (const part of relative(root, target).split(sep)) {
    current = resolve(current, part);
    const metadata = await lstat(current);
    if (metadata.isSymbolicLink() || (metadata.isFile() && metadata.nlink !== 1))
      throw new Error("Input and artifacts must not be linked files or directories");
  }
  const actual = await realpath(target);
  if (!actual.startsWith(`${root}${sep}`)) throw new Error("Path escaped workspace");
  return readFile(target);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((argument) => argument !== "--");
  let input = "docs/testing/stage12-baseline.json";
  let requireGo = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--require-go") requireGo = true;
    else if (argument === "--input" && args[index + 1]) input = args[++index]!;
    else throw new Error("Usage: stage12:report [--input repository-relative.json] [--require-go]");
  }
  if (!input.endsWith(".json")) throw new Error("Input must be a repository-local JSON file");
  const supplied: unknown = JSON.parse((await readSafeFile(input)).toString("utf8"));
  const report = evaluateStage12Acceptance(supplied);
  if (report.valid) {
    for (const artifact of (supplied as Stage12Acceptance).artifacts) {
      try {
        const bytes = await readSafeFile(artifact.path);
        const actual =
          artifact.hashMode === "canonical-json"
            ? stage12Hash(JSON.parse(bytes.toString("utf8")) as JsonValue)
            : `sha256:${createHash("sha256")
                .update(
                  artifact.hashMode === "normalized-text"
                    ? bytes.toString("utf8").replaceAll("\r\n", "\n")
                    : bytes
                )
                .digest("hex")}`;
        if (actual !== artifact.sha256)
          report.errors.push(`Artifact ${artifact.id}: digest mismatch`);
      } catch {
        report.errors.push(`Artifact ${artifact.id}: unavailable or unsafe local evidence`);
      }
    }
    if (report.errors.length) {
      report.valid = false;
      report.decision = "NO-GO";
    }
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = stage12ExitCode(report, requireGo);
}

void main().catch(() => {
  process.stderr.write(
    "Stage 12 report failed: unreadable/unsafe input or invalid arguments. Use repository-local sanitized JSON.\n"
  );
  process.exitCode = 1;
});
