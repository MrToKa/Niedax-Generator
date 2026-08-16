import ExcelJS from "exceljs";

import {
  CatalogImportError,
  catalogSheetNames,
  type CatalogRow,
  type CatalogSheetName,
  type ParsedCatalogBundle
} from "./contracts.js";
import { catalogColumns } from "./schema.js";

function cellText(value: ExcelJS.CellValue): string {
  if (value === null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("formula" in value || "sharedFormula" in value) {
      throw new CatalogImportError("Spreadsheet formulas are not allowed", "FORMULA_NOT_ALLOWED");
    }
    if ("richText" in value) return value.richText.map((item) => item.text).join("");
    if ("text" in value) return value.text;
    throw new CatalogImportError(
      "Embedded or unsupported spreadsheet cell content is not allowed",
      "EMBEDDED_CONTENT_NOT_ALLOWED"
    );
  }
  return String(value);
}

export async function parseXlsx(
  buffer: Buffer,
  fileName = "catalog.xlsx"
): Promise<ParsedCatalogBundle> {
  if (!fileName.toLowerCase().endsWith(".xlsx")) {
    throw new CatalogImportError("Only .xlsx workbooks are accepted", "UNSUPPORTED_WORKBOOK_TYPE");
  }
  if (buffer.length < 4 || buffer.subarray(0, 2).toString("ascii") !== "PK") {
    throw new CatalogImportError("The uploaded file is not an XLSX workbook", "INVALID_WORKBOOK");
  }
  if (buffer.includes(Buffer.from("vbaProject.bin", "ascii"))) {
    throw new CatalogImportError("Macro-enabled workbooks are not accepted", "MACROS_NOT_ALLOWED");
  }

  const workbook = new ExcelJS.Workbook();
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  ) as ArrayBuffer;
  await workbook.xlsx.load(arrayBuffer);

  const sheets = {} as Record<CatalogSheetName, readonly CatalogRow[]>;
  for (const sheetName of catalogSheetNames) {
    const worksheet = workbook.getWorksheet(sheetName);
    if (!worksheet) {
      sheets[sheetName] = [];
      continue;
    }
    const headers = (worksheet.getRow(1).values as ExcelJS.CellValue[])
      .slice(1)
      .map((value) => cellText(value).trim());
    if (new Set(headers).size !== headers.length) {
      throw new CatalogImportError(
        `Worksheet ${sheetName} contains duplicate headers`,
        "DUPLICATE_HEADER"
      );
    }
    const rows: CatalogRow[] = [];
    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const row = worksheet.getRow(rowNumber);
      const record = Object.fromEntries(
        headers.map((header, index) => [header, cellText(row.getCell(index + 1).value)])
      );
      if (Object.values(record).some((value) => value.trim() !== "")) rows.push(record);
    }
    sheets[sheetName] = rows;
  }
  return { sheets };
}

export async function createXlsxBundle(bundle?: ParsedCatalogBundle): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Niedax Generator";
  workbook.created = new Date("2026-08-16T00:00:00Z");
  for (const sheetName of catalogSheetNames) {
    const worksheet = workbook.addWorksheet(sheetName);
    worksheet.addRow([...catalogColumns[sheetName]]);
    worksheet.views = [{ state: "frozen", ySplit: 1 }];
    worksheet.getRow(1).font = { bold: true };
    worksheet.columns = catalogColumns[sheetName].map((header) => ({
      header,
      key: header,
      width: Math.min(Math.max(header.length + 2, 14), 40)
    }));
    for (const row of bundle?.sheets[sheetName] ?? []) {
      worksheet.addRow(
        Object.fromEntries(catalogColumns[sheetName].map((column) => [column, row[column] ?? ""]))
      );
    }
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function createXlsxTemplate(): Promise<Buffer> {
  return createXlsxBundle();
}
