import { open } from "node:fs/promises";
import path from "node:path";

const description = process.argv
  .slice(2)
  .filter((argument) => argument !== "--")
  .join(" ")
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/gu, "_")
  .replace(/^_|_$/gu, "");
if (!description) throw new Error("Usage: pnpm db:new -- <description>");
const timestamp = new Date().toISOString().replace(/[-:T]/gu, "").slice(0, 14);
const filename = `${timestamp}_${description}.sql`;
const target = path.resolve("database/migrations", filename);
const handle = await open(target, "wx", 0o600);
await handle.writeFile(`-- ${description.replaceAll("_", " ")}\n-- Forward-only migration.\n\n`);
await handle.close();
process.stdout.write(`${path.relative(process.cwd(), target)}\n`);
