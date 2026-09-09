import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Download, Response } from "@playwright/test";
import { expect } from "@playwright/test";
import type { ProjectRevisionDetailV2 } from "../../packages/domain/src/index.js";
import approved from "../../packages/export/tests/fixtures/change-order-control.expected.json" with { type: "json" };
import { attrs, readCells, readParts } from "../../packages/export/tests/helpers/ooxml.js";

// Direct saved-value mapping, independent of the production exporter and ExcelJS.
export async function checkDownloadedWorkbook(
  download: Download,
  detail: ProjectRevisionDetailV2,
  identity: string,
  response: Response
) {
  const path = await download.path();
  expect(path).not.toBeNull();
  expect(download.suggestedFilename()).toMatch(/^[^<>:"/\\|?*]+\.xlsx$/u);
  expect([...download.suggestedFilename()].some((character) => character.charCodeAt(0) < 32)).toBe(
    false
  );
  const bytes = await readFile(path!);
  await download.delete();
  const digest = createHash("sha256").update(bytes).digest("hex");
  expect(response.status()).toBe(200);
  expect(await response.headerValue("content-type")).toContain(
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  expect(await response.headerValue("content-disposition")).toMatch(/^attachment;/u);
  expect(await response.headerValue("content-length")).toBe(String(bytes.length));
  expect(await response.headerValue("x-content-sha256")).toBe(`sha256:${digest}`);
  expect(await response.headerValue("cache-control")).toContain("private");
  expect(await response.headerValue("cache-control")).toContain("no-store");
  expect(await response.headerValue("x-content-type-options")).toBe("nosniff");
  const parts = readParts(bytes);
  const workbook = parts.get("xl/workbook.xml")!;
  expect(
    [...workbook.matchAll(/<sheet\b([^>]*)\/?\s*>/gu)].map((match) => attrs(match[1]!).name),
    "Independent workbook sheet names"
  ).toEqual(["Change Order", "Calculation details", "Warnings"]);
  expect([...parts.keys()].some((name) => /vba|externalLinks|macros/iu.test(name))).toBe(false);
  expect([...parts.values()].join("\n")).not.toContain("#REF!");
  for (const sheet of [1, 2, 3])
    expect([...readCells(parts, sheet).values()].some((cell) => cell.formula !== null)).toBe(false);
  const cells = readCells(parts, 1);
  const result = detail.snapshot.calculationResult;
  const headers = [...cells].filter(([address]) => /^[A-Z]+5$/u.test(address));
  expect(headers).toHaveLength(26);
  expect(headers.map(([address]) => address)).toEqual(
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((column) => `${column}5`)
  );
  expect(
    headers.map(([, cell]) => cell.value),
    "All 26 approved workbook headers"
  ).toEqual(approved.headers);
  expect(parts.get("xl/worksheets/sheet1.xml")).toContain(
    `autoFilter ref="A5:Z${result.bomLines.length + 5}"`
  );
  for (const [index, line] of result.bomLines.entries()) {
    const row = index + 6;
    const exact = (column: string, value: string | null) => {
      const cell = cells.get(`${column}${row}`)?.value ?? null;
      expect(cell === null ? null : String(cell), `Exact saved value in ${column}${row}`).toBe(
        value
      );
    };
    exact("B", line.technicalQuantity.value);
    exact("C", line.orderedQuantity.value);
    exact("D", line.totalSpareQuantity.value);
    exact("G", line.packageIncrement.value);
    exact("I", line.packageCount?.value ?? null);
    exact("E", line.unit);
    exact("K", line.descriptionEn);
    exact("X", line.productCode);
    exact("U", String(detail.summary.revisionNumber));
    for (const column of ["P", "Q"]) expect(cells.get(`${column}${row}`)?.value ?? null).toBeNull();
    if (line.productCode !== null) expect(cells.get(`X${row}`)?.type).toBe("s");
  }
  const detailsText = [...readCells(parts, 2).values()]
    .map((cell) => String(cell.value))
    .join("\n");
  expect(detailsText).toContain(detail.summary.inputFingerprint);
  expect(detailsText).toContain(detail.summary.catalogSnapshot.snapshotId);
  for (const line of result.bomLines) expect(detailsText).toContain(line.id);
  const warningsText = [...readCells(parts, 3).values()]
    .map((cell) => String(cell.value))
    .join("\n");
  for (const warning of result.warnings) expect(warningsText).toContain(warning.code);
  const directory = resolve(".artifacts/stage10/safe");
  await mkdir(directory, { recursive: true });
  await writeFile(
    resolve(directory, `download-${identity}.json`),
    JSON.stringify(
      {
        schemaVersion: "stage10-download-evidence/v1",
        timestamp: new Date().toISOString(),
        revisionId: detail.summary.id,
        revisionNumber: detail.summary.revisionNumber,
        fingerprint: detail.summary.inputFingerprint,
        checksums: detail.checksums,
        bytes: bytes.length,
        sha256: digest,
        bomRows: result.bomLines.length,
        warningCount: result.warnings.length,
        approvedColumns: 26,
        sheets: ["Change Order", "Calculation details", "Warnings"],
        independentOoxmlPassed: true,
        httpHeadersVerified: true,
        nativeExcelObserved: false
      },
      null,
      2
    )
  );
  return digest;
}
