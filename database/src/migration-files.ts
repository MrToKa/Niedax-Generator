import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export const MIGRATION_FILE_PATTERN = /^\d{14}_[a-z0-9]+(?:_[a-z0-9]+)*\.sql$/u;

export interface MigrationFile {
  readonly filename: string;
  readonly checksum: string;
  readonly sql: string;
}

export function checksum(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export async function loadMigrationFiles(directory: string): Promise<MigrationFile[]> {
  const names = (await readdir(directory))
    .filter((name) => name.endsWith(".sql"))
    .sort((left, right) => left.localeCompare(right));
  for (const name of names) {
    if (!MIGRATION_FILE_PATTERN.test(name)) throw new Error(`Invalid migration filename: ${name}`);
  }
  return Promise.all(
    names.map(async (filename) => {
      const sql = await readFile(path.join(directory, filename), "utf8");
      return { filename, sql, checksum: checksum(sql) };
    })
  );
}

export function validateAppliedMigrations(
  files: readonly MigrationFile[],
  applied: readonly { filename: string; checksum: string }[]
): void {
  if (applied.length > files.length)
    throw new Error("An applied migration is missing from the repository");
  applied.forEach((entry, index) => {
    const file = files[index];
    if (!file || file.filename !== entry.filename) {
      throw new Error(`Applied migration order/name mismatch at ${entry.filename}`);
    }
    if (file.checksum !== entry.checksum) {
      throw new Error(`Applied migration checksum mismatch: ${entry.filename}`);
    }
  });
}
