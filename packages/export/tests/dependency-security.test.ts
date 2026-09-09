import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const requireFromExport = createRequire(import.meta.url);
const requireFromExcel = createRequire(requireFromExport.resolve("exceljs"));
const uuid = requireFromExcel("uuid") as {
  v4(): string;
  v5(value: string, namespace: string, buffer: Uint8Array): unknown;
};

describe("Stage 10 scoped ExcelJS UUID security replacement", () => {
  it("retains ExcelJS's CommonJS v4 API and rejects the advisory's short-buffer write", () => {
    expect((requireFromExcel("uuid/package.json") as { version: string }).version).toBe("11.1.1");
    expect(uuid.v4()).toMatch(
      /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u
    );
    expect(() =>
      uuid.v5("synthetic", "6ba7b810-9dad-11d1-80b4-00c04fd430c8", new Uint8Array(1))
    ).toThrow();
  });
});
