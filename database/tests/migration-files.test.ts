import { describe, expect, it } from "vitest";

import { checksum, validateAppliedMigrations, type MigrationFile } from "../src/migration-files.js";

const files: MigrationFile[] = [
  { filename: "20260101000000_first.sql", checksum: checksum("SELECT 1;"), sql: "SELECT 1;" },
  { filename: "20260102000000_second.sql", checksum: checksum("SELECT 2;"), sql: "SELECT 2;" }
];

describe("migration history safeguards", () => {
  it("accepts an applied prefix and idempotent full history", () => {
    expect(() => validateAppliedMigrations(files, files.slice(0, 1))).not.toThrow();
    expect(() => validateAppliedMigrations(files, files)).not.toThrow();
  });

  it("rejects renamed, reordered, missing, or modified applied migrations", () => {
    expect(() =>
      validateAppliedMigrations(files, [
        { filename: files[1]!.filename, checksum: files[1]!.checksum }
      ])
    ).toThrow(/order/);
    expect(() =>
      validateAppliedMigrations(files, [{ filename: files[0]!.filename, checksum: "0".repeat(64) }])
    ).toThrow(/checksum/);
    expect(() => validateAppliedMigrations(files.slice(0, 1), files)).toThrow(/missing/);
  });
});
