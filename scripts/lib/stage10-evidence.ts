import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

export const evidenceDirectory = resolve(".artifacts/stage10/safe");

export async function writeEvidence(name: string, value: unknown): Promise<void> {
  if (!/^[a-z0-9-]+\.json$/u.test(name)) throw new Error("Invalid evidence filename");
  await mkdir(evidenceDirectory, { recursive: true });
  await writeFile(resolve(evidenceDirectory, name), `${JSON.stringify(value, null, 2)}\n`);
}

export async function fileHash(path: string): Promise<string> {
  return `sha256:${createHash("sha256")
    .update(await readFile(path))
    .digest("hex")}`;
}

export function commitIdentity(): string {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", shell: false });
  if (result.status !== 0 || !/^[a-f0-9]{40}$/u.test(result.stdout.trim()))
    throw new Error("Cannot identify source commit");
  return result.stdout.trim();
}

/** Working-tree identity includes uncommitted source/tests/config, without opening data or secrets. */
export async function sourceIdentity(): Promise<string> {
  const inventory = spawnSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { encoding: "utf8", shell: false }
  );
  if (inventory.status !== 0) throw new Error("Cannot identify current source tree");
  const paths = [...new Set(inventory.stdout.split("\0"))]
    .filter(
      (path) =>
        path &&
        !/^(?:data\/|docs\/|\.artifacts\/)/u.test(path) &&
        /\.(?:ts|tsx|js|jsx|cjs|mjs|json|yaml|yml|sql|csv|html|css|sh|ps1|toml|ini|conf)$|Dockerfile|Caddyfile|(?:^|\/)\.env\.example$|^\.(?:dockerignore|gitignore|gitattributes|prettierignore)$/u.test(
          path
        )
    )
    .sort();
  const hash = createHash("sha256");
  for (const path of paths)
    hash
      .update(path)
      .update("\0")
      .update((await readFile(path, "utf8")).replaceAll("\r\n", "\n"))
      .update("\0");
  return `sha256:${hash.digest("hex")}`;
}

export function pnpmCommand(args: readonly string[], capture = false) {
  const executable = process.env.npm_execpath;
  if (!executable || !/pnpm\.(?:c?js|mjs)$/u.test(executable))
    throw new Error("Run this command through the repository-pinned corepack pnpm");
  return spawnSync(process.execPath, [executable, ...args], {
    shell: false,
    env: process.env,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    stdio: capture ? "pipe" : "inherit"
  });
}
