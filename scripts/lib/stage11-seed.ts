import { randomBytes } from "node:crypto";
import { link, lstat, mkdir, readFile, realpath, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  parseStage11Accounts,
  stage11AccountRoles,
  type Stage11Accounts
} from "../../apps/backend/src/stage11-seed-contract.js";

export { parseStage11Accounts, stage11AccountRoles, type Stage11Accounts };

/** Provision once; never rotate credentials silently during subsequent deployments. */
export async function provisionStage11Accounts(workspace: string): Promise<Stage11Accounts> {
  const root = await realpath(workspace);
  const directory = resolve(root, "data/test/secrets");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if ((await realpath(directory)) !== directory)
    throw new Error("TEST account directory must not resolve through a symlink");
  const file = resolve(directory, "accounts.json");
  try {
    const stat = await lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Unsafe TEST account file");
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(file, "utf8"));
    } catch {
      throw new Error("Persistent TEST account file is invalid or unreadable");
    }
    return parseStage11Accounts(parsed);
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
  }
  const accounts = parseStage11Accounts(
    Object.fromEntries(
      stage11AccountRoles.map((role) => [
        role,
        { username: `test.${role}`, password: `S11!aA7-${randomBytes(32).toString("base64url")}` }
      ])
    )
  );
  const temporary = resolve(directory, `.accounts-${randomBytes(16).toString("hex")}.tmp`);
  await writeFile(temporary, JSON.stringify(accounts), { flag: "wx", mode: 0o600 });
  try {
    try {
      // Publish an already complete file without replacing an existing account file.
      await link(temporary, file);
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST") throw error;
      return await provisionStage11Accounts(root);
    }
  } finally {
    await unlink(temporary);
  }
  return accounts;
}
