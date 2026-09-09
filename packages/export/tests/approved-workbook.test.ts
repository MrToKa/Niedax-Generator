import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";

import {
  buildEnglishExportContextV3,
  getApprovedWorkbookMapping,
  renderExcelWorkbook
} from "../src/index.js";
import expected from "./fixtures/change-order-control.expected.json" with { type: "json" };
import quantities from "./fixtures/synthetic-control.expected.json" with { type: "json" };
import { readCells, readParts } from "./helpers/ooxml.js";
import { approvedTemplateControlContext } from "./helpers/synthetic.js";

describe("user-approved 26-column Change Order workbook", () => {
  it("matches the source inventory and independently reviewed saved control quantities without importing customer sample data", async () => {
    const mapping = getApprovedWorkbookMapping()!;
    expect(mapping.templateSha256).toBe(expected.templateSha256);
    expect(mapping.mappingVersion).toBe(expected.mappingVersion);
    const output = await renderExcelWorkbook(approvedTemplateControlContext(), mapping);
    const golden = await readFile(new URL("./fixtures/change-order-control.xlsx", import.meta.url));
    for (const bytes of [output.bytes, golden]) {
      const parts = readParts(bytes);
      const cells = readCells(parts, 1);
      const xml = parts.get("xl/worksheets/sheet1.xml")!;
      const workbook = parts.get("xl/workbook.xml")!;
      expect(
        [...cells.entries()]
          .filter(([address]) => /^[A-Z]+5$/u.test(address))
          .map(([, cell]) => cell.value)
      ).toEqual(expected.headers);
      expect(
        [...xml.matchAll(/<col [^>]*width="([^"]+)"/gu)].map((match) => Number(match[1]))
      ).toEqual(expected.widths);
      expect(
        [...xml.matchAll(/<mergeCell ref="([^"]+)"/gu)].map((match) => match[1]).sort()
      ).toEqual([...expected.merges].sort());
      expect(xml).toContain('dimension ref="A1:Z17"');
      expect(xml).toContain(`autoFilter ref="${expected.filter}"`);
      expect(xml).toContain('ySplit="5"');
      expect(xml).toContain('paperSize="8"');
      expect(xml).toContain('fitToWidth="2"');
      expect(xml).toContain('orientation="landscape"');
      expect(xml).toContain('zoomScale="70"');
      expect(xml).toContain("Revision 1 | CALCULATED | NOT APPROVED");
      expect(workbook).toContain("&apos;Change Order&apos;!$A1:$Z17");
      expect(workbook).toContain("&apos;Change Order&apos;!$1:$5");
      expect(workbook).toContain("&apos;Change Order&apos;!$A:$E");
      expect(cells.get("D3")?.value).toBe("CALCULATED — NOT APPROVED");
      expect(cells.get("K1")?.value).toContain("Synthetic control project");
      for (const [index, row] of quantities.rows.entries()) {
        const number = index + 6;
        expect(
          ["X", "E", "B", "G", "C", "D", "I"].map(
            (column) => cells.get(`${column}${number}`)?.value ?? null
          )
        ).toEqual([row[0], row[1], row[2], row[3], row[4], row[5], row[7]]);
        expect(cells.get(`A${number}`)?.value).toBe(String(index + 1));
        expect(cells.get(`U${number}`)?.value).toBe("1");
        expect(cells.get(`J${number}`)?.value).toBe("packages");
        for (const column of expected.blankColumns)
          expect(cells.get(`${column}${number}`)?.value ?? null).toBeNull();
      }
      expect(cells.get("O8")?.value).toContain("NX FASTENER");
      expect(cells.get("Z3")?.value ?? null).toBeNull();
      for (const sheet of [1, 2, 3])
        expect([...readCells(parts, sheet).values()].some((cell) => cell.formula !== null)).toBe(
          false
        );
      expect([...parts.keys()].some((name) => /vba|external|media|drawing|vml/iu.test(name))).toBe(
        false
      );
      expect([...parts.values()].join("\n")).not.toContain("#REF!");
      const roundTrip = new ExcelJS.Workbook();
      await roundTrip.xlsx.load(Uint8Array.from(bytes).buffer);
      expect(roundTrip.worksheets.map((sheet) => sheet.name)).toEqual(expected.sheets);
      expect(roundTrip.getWorksheet("Change Order")!.getCell("B6").numFmt).toBe("0");
      expect(roundTrip.getWorksheet("Calculation details")!.getCell("C1").value).toBe(
        "Change Order row"
      );
      expect(roundTrip.getWorksheet("Warnings")!.getCell("H2").value).toBe("Change Order rows");
      expect(roundTrip.getWorksheet("Warnings")!.pageSetup.fitToWidth).toBe(2);
    }
    const actual = readParts(output.bytes);
    const saved = readParts(golden);
    for (const sheet of [1, 2, 3])
      expect(readCells(actual, sheet)).toEqual(readCells(saved, sheet));
    for (const name of [
      "xl/workbook.xml",
      "xl/styles.xml",
      "xl/worksheets/sheet1.xml",
      "xl/worksheets/sheet2.xml",
      "xl/worksheets/sheet3.xml"
    ])
      expect(actual.get(name)).toBe(saved.get(name));
  });

  it("exports precision overflow as exact text and preserves a nullable package count in the approved layout", async () => {
    const base = approvedTemplateControlContext();
    const result = base.snapshot.calculationResult;
    const sourceLine = result.bomLines.at(-1)!;
    const line = {
      ...sourceLine,
      orderedQuantity: { value: "9007199254740993", unit: "m" },
      packageCount: null,
      warningIds: []
    };
    const context = buildEnglishExportContextV3({
      ...base,
      snapshot: {
        ...base.snapshot,
        calculationResult: {
          ...result,
          bomLines: [line],
          warnings: [],
          trace: {
            ...result.trace,
            steps: result.trace.steps.filter((step) => step.bomLineId === line.id)
          },
          summary: { ...result.summary, bomLineCount: 1, warningCount: 0 }
        }
      }
    });
    const parts = readParts(
      (await renderExcelWorkbook(context, getApprovedWorkbookMapping()!)).bytes
    );
    const cells = readCells(parts, 1);
    expect(cells.get("C6")).toMatchObject({ type: "s", value: "9007199254740993", formula: null });
    expect(cells.get("I6")?.value ?? null).toBeNull();
    expect(cells.get("J6")?.value ?? null).toBeNull();
    expect(cells.get("X6")?.value ?? null).toBeNull();
    expect(parts.get("xl/worksheets/sheet1.xml")).toContain('autoFilter ref="A5:Z6"');
    expect(readCells(parts, 3).get("A1")?.value).toBe("No saved warnings.");
  });
});
