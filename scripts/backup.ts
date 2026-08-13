import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

import { compose } from "./lib/process.js";
import { prepareLocalData } from "./lib/setup.js";

const action = process.argv[2];
const filename = process.argv.slice(3).find((argument) => argument !== "--");
const validFilename = /^\d{8}T\d{6}Z_niedax_generator_pg18\.dump$/u;

function backupRun(args: readonly string[], env: NodeJS.ProcessEnv = process.env): string {
  return compose(["--profile", "tools", "run", "--rm", "--build", "backup", ...args], { env });
}

async function prompt(expected: string): Promise<void> {
  if (!stdin.isTTY)
    throw new Error("An interactive terminal is required for this destructive action");
  const lines = createInterface({ input: stdin, output: stdout });
  const answer = await lines.question(`Type exactly "${expected}" to continue: `);
  lines.close();
  if (answer !== expected) throw new Error("Confirmation did not match; nothing was changed");
}

await prepareLocalData();
compose(["up", "--detach", "postgres", "migrations"]);

switch (action) {
  case "create":
  case "list":
    backupRun([action]);
    break;
  case "verify":
    if (!filename || !validFilename.test(filename))
      throw new Error("Provide an exact project backup filename");
    backupRun(["verify", filename]);
    break;
  case "prune": {
    const preview = compose(["--profile", "tools", "run", "--rm", "backup", "prune-preview"], {
      capture: true
    });
    if (!preview) {
      process.stdout.write("No verified-age candidates are older than 28 days.\n");
      break;
    }
    process.stdout.write(`Candidate files:\n${preview}\n`);
    const confirmation = "PRUNE niedax_generator";
    await prompt(confirmation);
    backupRun(["prune-confirmed"], { ...process.env, PRUNE_CONFIRMATION: confirmation });
    break;
  }
  case "restore": {
    if (!filename || !validFilename.test(filename))
      throw new Error("Provide an exact project backup filename");
    backupRun(["verify", filename]);
    const confirmation = `niedax_generator ${filename}`;
    await prompt(confirmation);
    compose(["stop", "backend", "gateway"]);
    try {
      backupRun(["restore-confirmed", filename], {
        ...process.env,
        RESTORE_CONFIRMATION: confirmation
      });
    } finally {
      compose(["up", "--detach", "backend", "gateway"]);
    }
    break;
  }
  default:
    throw new Error("Usage: backup.ts {create|list|verify <file>|restore <file>|prune}");
}
