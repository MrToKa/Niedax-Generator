import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

import { Pool } from "pg";

import { AuthService } from "../auth-service.js";
import { loadRuntimeConfig } from "../config.js";
import { PgUserStore } from "../pg-store.js";

async function readHidden(prompt: string): Promise<string> {
  if (!stdin.isTTY || !stdout.isTTY) throw new Error("An interactive terminal is required");
  stdout.write(prompt);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  return new Promise((resolve, reject) => {
    let value = "";
    const onData = (key: string) => {
      if (key === "\r" || key === "\n") {
        stdin.off("data", onData);
        stdin.setRawMode(false);
        stdin.pause();
        stdout.write("\n");
        resolve(value);
      } else if (key === "\u0003") {
        stdin.off("data", onData);
        stdin.setRawMode(false);
        reject(new Error("Cancelled"));
      } else if (key === "\u007f" || key === "\b") {
        value = value.slice(0, -1);
      } else if (key >= " ") {
        value += key;
      }
    };
    stdin.on("data", onData);
  });
}

const config = loadRuntimeConfig();
const pool = new Pool({ ...config.database, ssl: false });
try {
  const lines = createInterface({ input: stdin, output: stdout });
  const username = await lines.question("Administrator username: ");
  const displayName = await lines.question("Display name: ");
  lines.close();
  const password = await readHidden("Password (hidden): ");
  const confirmation = await readHidden("Repeat password (hidden): ");
  if (password !== confirmation) throw new Error("Passwords do not match");
  const auth = new AuthService(new PgUserStore(pool), config.sessionPepper);
  const user = await auth.createInitialAdministrator({ username, displayName, password });
  stdout.write(`Administrator ${user.username} created.\n`);
} finally {
  await pool.end();
}
