import { readFile } from "node:fs/promises";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import {
  buildEnglishExportContextV3,
  exactExcelDecimal,
  getApprovedWorkbookMapping,
  literalExcelText,
  renderExcelWorkbook,
  safeExcelFileName,
  validateWorkbookMapping
} from "../src/index.js";
import expected from "./fixtures/synthetic-control.expected.json" with { type: "json" };
import { readCells, readParts } from "./helpers/ooxml.js";
import { syntheticContext, syntheticContextInput, syntheticMapping } from "./helpers/synthetic.js";

describe("synthetic workbook framework (separate from the approved 26-column mapping)", () => {
  it("keeps the synthetic mapping out of production and validates its explicit 29-column mapping", () => {
    expect(getApprovedWorkbookMapping()?.approval).toBe("approved");
    expect(getApprovedWorkbookMapping()?.columns).toHaveLength(26);
    expect(() =>
      validateWorkbookMapping({ ...syntheticMapping, columns: syntheticMapping.columns.slice(1) })
    ).toThrow();
    const columns = [...structuredClone(syntheticMapping.columns)];
    columns[16] = { ...columns[16]!, source: { kind: "text", field: "descriptionEn" } };
    expect(() => validateWorkbookMapping({ ...syntheticMapping, columns })).toThrow();
    expect(() => validateWorkbookMapping({ ...syntheticMapping, unknown: true })).toThrow();
  });

  it("captures a detached, strict immutable context without live data or audit security fields", () => {
    const source = syntheticContextInput();
    const context = buildEnglishExportContextV3(source);
    source.snapshot.project.name = "Later draft rename";
    source.snapshot.calculationResult.bomLines[0]!.technicalQuantity.value = "999";
    expect(context.snapshot.project.name).toBe("Synthetic control project — not a customer order");
    expect(context.snapshot.calculationResult.bomLines[0]!.technicalQuantity.value).toBe("24");
    expect(Object.isFrozen(context.snapshot.calculationResult.bomLines[0])).toBe(true);
    expect(() =>
      buildEnglishExportContextV3({ ...context, auditSecurityMetadata: "secret" })
    ).toThrow();
    expect(() =>
      buildEnglishExportContextV3({
        ...context,
        revision: { ...context.revision, projectId: "10000000-0000-4000-8000-000000000099" }
      })
    ).toThrow();
    expect(() =>
      buildEnglishExportContextV3({
        ...context,
        revision: { ...context.revision, status: "approved" }
      })
    ).toThrow();
    const damaged = syntheticContextInput();
    damaged.snapshot.calculationResult.bomLines[0]!.traceStepIds =
      damaged.snapshot.calculationResult.bomLines[1]!.traceStepIds;
    expect(() => buildEnglishExportContextV3(damaged)).toThrow();
  });

  it.each([
    "0",
    "1",
    "0.1",
    "0.000000000000000001",
    "123.456789",
    "999999999999999",
    "0.123456789012345"
  ])("round-trips supported decimal %s", (value) => {
    expect(exactExcelDecimal(value, "reject")).toBe(Number(value));
  });

  it.each([
    "1000000000000001",
    "9007199254740993",
    "0.123456789012345678",
    "999999999999999999999999999999"
  ])("preserves or explicitly rejects precision overflow %s", (value) => {
    expect(exactExcelDecimal(value, "exactText")).toBe(value);
    expect(() => exactExcelDecimal(value, "reject")).toThrow(/exactly/u);
  });

  it("rejects XML controls, unpaired surrogates and cell overflow while retaining literal trigger characters", () => {
    for (const text of ["=SUM(A1)", "+cmd", "-1+2", "@SUM(1)", "\tformula", "\ntext", "safe 😀"])
      expect(literalExcelText(text)).toBe(text);
    for (const text of ["\u0000", "\u000b", "\ud800", "\uffff", "a".repeat(32_768)])
      expect(() => literalExcelText(text)).toThrow();
    expect(safeExcelFileName("../../\r\nCON/Юникод\\???", 9)).toMatch(
      /^Niedax-[A-Za-z0-9._-]+-revision-9\.xlsx$/u
    );
    expect(safeExcelFileName("a".repeat(500), 1).length).toBeLessThan(180);
  });

  it("independently checks normalized golden quantities, formula caches, OOXML links, styles and compatibility blanks", async () => {
    const output = await renderExcelWorkbook(syntheticContext(), syntheticMapping);
    const golden = await readFile(new URL("./fixtures/synthetic-control.xlsx", import.meta.url));
    for (const bytes of [output.bytes, golden]) {
      const parts = readParts(bytes);
      const workbook = parts.get("xl/workbook.xml")!;
      const sheet = parts.get("xl/worksheets/sheet1.xml")!;
      const cells = readCells(parts, 1);
      for (const name of expected.sheets) expect(workbook).toContain(`name="${name}"`);
      expect([...workbook.matchAll(/<sheet\s/gu)]).toHaveLength(3);
      expect(cells.get("A1")?.value).toContain("SYNTHETIC TEST ONLY");
      expect(cells.get("A3")?.value).toContain("NOT APPROVED");
      expect(sheet).toContain('dimension ref="A1:AC16"');
      expect(sheet).toContain(`autoFilter ref="${expected.orderFilter}"`);
      expect(sheet).toContain('ySplit="4"');
      expect(sheet).toContain('orientation="landscape"');
      expect(sheet).toContain('fitToWidth="1"');
      for (const merge of expected.orderMerges) expect(sheet).toContain(`mergeCell ref="${merge}"`);
      expect(workbook).toContain(expected.orderPrintArea.replaceAll("'", "&apos;"));
      expect(workbook).toContain(expected.orderRepeatRows.replaceAll("'", "&apos;"));
      expect(parts.get("xl/styles.xml")).toContain("wrapText");
      expect(parts.get("xl/styles.xml")).toContain("FF17365D");
      for (const [index, row] of expected.rows.entries()) {
        const number = index + 5;
        expect(
          ["A", "C", "D", "E", "F", "H", "I", "L"].map(
            (letter) => cells.get(`${letter}${number}`)?.value ?? null
          )
        ).toEqual(row);
        expect(cells.get(`G${number}`)).toMatchObject({
          formula: `F${number}`,
          value: row[4],
          type: "n"
        });
        for (const letter of expected.blankColumns)
          expect(cells.get(`${letter}${number}`)?.value ?? null).toBeNull();
      }
      expect([...cells.values()].filter((cell) => cell.formula !== null)).toHaveLength(12);
      expect(
        [...parts.keys()].some((name) => /vbaProject|externalLinks|connections/iu.test(name))
      ).toBe(false);
      expect([...parts.values()].join("\n")).not.toMatch(
        /#REF!|TargetMode="External"|<externalReference/u
      );
    }
    // ZIP timestamps may vary; normalized cell semantics, not ZIP hashes, are stable.
    const generated = readParts(output.bytes);
    const stored = readParts(golden);
    for (const sheet of [1, 2, 3])
      expect(readCells(generated, sheet)).toEqual(readCells(stored, sheet));
    for (const name of [
      "xl/workbook.xml",
      "xl/styles.xml",
      "xl/worksheets/sheet1.xml",
      "xl/worksheets/sheet2.xml",
      "xl/worksheets/sheet3.xml"
    ])
      expect(generated.get(name)).toBe(stored.get(name));
  });

  it("reconciles every saved BOM field independently and retains every evidence leaf, warning and included relation", async () => {
    const context = syntheticContext();
    const parts = readParts((await renderExcelWorkbook(context, syntheticMapping)).bytes);
    const order = readCells(parts, 1);
    const details = readCells(parts, 2);
    const warnings = readCells(parts, 3);
    const evidenceByPath = new Map<string, { value: unknown; type: unknown; row: unknown }>();
    for (const [address, cell] of details) {
      if (!/^D\d+$/u.test(address) || address === "D1") continue;
      const row = address.slice(1);
      evidenceByPath.set(String(cell.value), {
        value: details.get(`E${row}`)?.value,
        type: details.get(`F${row}`)?.value,
        row: details.get(`C${row}`)?.value ?? null
      });
    }
    // This independent traversal follows the source fixture, not renderer mapping.
    const checkLeaf = (value: unknown, path: string): void => {
      if (value !== null && typeof value === "object") {
        if (Object.keys(value).length === 0)
          expect(evidenceByPath.get(path)?.value).toBe(Array.isArray(value) ? "[]" : "{}");
        for (const [key, child] of Object.entries(value))
          checkLeaf(child, Array.isArray(value) ? `${path}[${key}]` : `${path}.${key}`);
      } else
        expect(evidenceByPath.get(path)).toMatchObject({
          value: value === null ? "null" : String(value),
          type: value === null ? "null" : typeof value
        });
    };
    checkLeaf(context, "context");
    const fieldColumns = {
      technicalQuantity: "D",
      packageIncrement: "E",
      orderedQuantity: "F",
      totalSpareQuantity: "H",
      reserveQuantity: "I",
      reservedQuantity: "J",
      packagingOverage: "K",
      packageCount: "L"
    } as const;
    for (const [index, line] of context.snapshot.calculationResult.bomLines.entries()) {
      const row = index + 5;
      for (const [field, column] of Object.entries(fieldColumns)) {
        const quantity = line[field as keyof typeof fieldColumns];
        expect(order.get(`${column}${row}`)?.value ?? null).toBe(
          quantity === null ? null : Number(quantity.value)
        );
      }
      expect(
        evidenceByPath.get(`context.snapshot.calculationResult.bomLines[${index}].id`)?.row
      ).toBe(row);
    }
    for (const [index, warning] of context.snapshot.calculationResult.warnings.entries()) {
      expect(warnings.get(`A${index + 3}`)?.value).toBe(warning.id);
      expect(warnings.get(`B${index + 3}`)?.value).toBe(warning.code);
      expect(warnings.get(`E${index + 3}`)?.value).toBe(warning.effect);
      expect(warnings.get(`J${index + 3}`)?.value).toBe(
        warning.approvalImpact === "blocksApproval" ? "Yes" : "No"
      );
    }
    expect([...details.values()].some((cell) => cell.formula !== null)).toBe(false);
    expect([...warnings.values()].some((cell) => cell.formula !== null)).toBe(false);
    // Included fasteners remain evidence only; no additional orderable row exists.
    expect([...order.values()].filter((cell) => cell.value === "NX FASTENER")).toHaveLength(0);
  });

  it("writes literal injection-like text, leading-zero codes and all units without formulas or numeric coercion", async () => {
    const source = syntheticContextInput();
    source.snapshot.project.name = '=HYPERLINK("http://localhost:4319/")';
    const lines = source.snapshot.calculationResult.bomLines;
    lines[0]!.productCode = "0000123";
    lines[0]!.descriptionEn = "=SUM(A1:A2)";
    lines[1]!.descriptionEn = "+cmd|' /c calc'!A0";
    lines[2]!.descriptionEn = "@SUM(1)";
    lines[3]!.descriptionEn = "-1+2";
    const parts = readParts(
      (await renderExcelWorkbook(buildEnglishExportContextV3(source), syntheticMapping)).bytes
    );
    const cells = readCells(parts, 1);
    expect(cells.get("A5")).toMatchObject({ type: "s", value: "0000123", formula: null });
    for (const row of [5, 6, 7, 8])
      expect(cells.get(`B${row}`)).toMatchObject({ type: "s", formula: null });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      Uint8Array.from((await renderExcelWorkbook(syntheticContext(), syntheticMapping)).bytes)
        .buffer
    );
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(expected.sheets);
  });

  it("handles empty BOM and no warnings without a fake row and rejects identity mismatches", async () => {
    const source = syntheticContextInput();
    source.snapshot.calculationResult.bomLines = [];
    source.snapshot.calculationResult.warnings = [];
    source.snapshot.calculationResult.trace.steps = [];
    source.snapshot.calculationResult.summary.bomLineCount = 0;
    source.snapshot.calculationResult.summary.warningCount = 0;
    const context = buildEnglishExportContextV3(source);
    const parts = readParts((await renderExcelWorkbook(context, syntheticMapping)).bytes);
    expect(parts.get("xl/worksheets/sheet1.xml")).toContain('autoFilter ref="A4:AC4"');
    expect(readCells(parts, 3).get("A1")?.value).toBe("No saved warnings.");
    expect(readCells(parts, 3).has("A3")).toBe(false);
    await expect(
      renderExcelWorkbook(context, { ...syntheticMapping, mappingVersion: "different" })
    ).rejects.toThrow(/identity/u);
  });

  it("retains zero kilograms, null package counts and exact large decimals in a one-line workbook", async () => {
    const source = syntheticContextInput();
    const original = source.snapshot.calculationResult;
    const base = original.bomLines.at(-1)!;
    const line = {
      ...base,
      unit: "kg",
      productCode: null,
      technicalQuantity: { value: "0", unit: "kg" },
      reserveQuantity: { value: "0", unit: "kg" },
      reservedQuantity: { value: "0", unit: "kg" },
      packageIncrement: { value: "0.123456789012345678", unit: "kg" },
      packageCount: null,
      packagingOverage: { value: "0", unit: "kg" },
      orderedQuantity: { value: "0", unit: "kg" },
      totalSpareQuantity: { value: "0", unit: "kg" },
      warningIds: []
    };
    const context = buildEnglishExportContextV3({
      ...source,
      snapshot: {
        ...source.snapshot,
        calculationResult: {
          ...original,
          bomLines: [line],
          warnings: [],
          trace: {
            ...original.trace,
            steps: original.trace.steps.filter((step) => step.bomLineId === line.id)
          },
          summary: { ...original.summary, bomLineCount: 1, warningCount: 0 }
        }
      }
    });
    const parts = readParts((await renderExcelWorkbook(context, syntheticMapping)).bytes);
    const cells = readCells(parts, 1);
    expect(cells.get("C5")?.value).toBe("kg");
    expect(cells.get("D5")).toMatchObject({ value: 0, type: "n" });
    expect(cells.get("E5")).toMatchObject({ value: "0.123456789012345678", type: "s" });
    expect(cells.get("L5")?.value ?? null).toBeNull();
    expect(cells.get("G5")).toMatchObject({ formula: "F5", value: 0 });
    expect(parts.get("xl/worksheets/sheet1.xml")).toContain('autoFilter ref="A4:AC5"');
    const rejecting = {
      ...syntheticMapping,
      columns: syntheticMapping.columns.map((column) =>
        column.position === 5
          ? {
              ...column,
              source: {
                kind: "quantity" as const,
                field: "packageIncrement" as const,
                overflow: "reject" as const
              }
            }
          : column
      )
    };
    await expect(renderExcelWorkbook(context, rejecting)).rejects.toThrow(/exactly/u);
    const largeOrder = buildEnglishExportContextV3({
      ...context,
      snapshot: {
        ...context.snapshot,
        calculationResult: {
          ...context.snapshot.calculationResult,
          bomLines: [{ ...line, orderedQuantity: { value: "9007199254740993", unit: "kg" } }]
        }
      }
    });
    await expect(renderExcelWorkbook(largeOrder, syntheticMapping)).rejects.toThrow(
      /Reference formula/u
    );
  });

  it("retains repeated source product codes as separate rows and extends print/filter ranges", async () => {
    const source = syntheticContextInput();
    const result = source.snapshot.calculationResult;
    const base = result.bomLines.at(-1)!;
    const baseStep = result.trace.steps.find((step) => step.bomLineId === base.id)!;
    const lines = Array.from({ length: 80 }, (_, index) => ({
      ...base,
      id: `synthetic-line-${index}`,
      productCode: "000777",
      warningIds: [],
      traceStepIds: [`synthetic-step-${index}`]
    }));
    const steps = lines.map((line, index) => ({
      ...baseStep,
      id: `synthetic-step-${index}`,
      bomLineId: line.id,
      parentStepIds: []
    }));
    const context = buildEnglishExportContextV3({
      ...source,
      snapshot: {
        ...source.snapshot,
        calculationResult: {
          ...result,
          bomLines: lines,
          warnings: [],
          trace: { ...result.trace, steps },
          summary: { ...result.summary, bomLineCount: 80, warningCount: 0 }
        }
      }
    });
    const parts = readParts((await renderExcelWorkbook(context, syntheticMapping)).bytes);
    const cells = readCells(parts, 1);
    expect([...cells.values()].filter((cell) => cell.value === "000777")).toHaveLength(80);
    expect(cells.get("G84")).toMatchObject({ formula: "F84", value: 3 });
    expect(parts.get("xl/worksheets/sheet1.xml")).toContain('autoFilter ref="A4:AC84"');
    expect(parts.get("xl/workbook.xml")).toContain("$AC84");
  });
});
