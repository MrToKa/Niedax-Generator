import {
  catalogSheetNames,
  type CatalogRow,
  type CatalogSheetName,
  type ParsedCatalogBundle
} from "./contracts.js";
import { catalogColumns } from "./schema.js";

export function parseCsv(text: string): readonly CatalogRow[] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  const normalized = text.replace(/^\uFEFF/u, "").replace(/\r\n?/gu, "\n");

  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];
    if (quoted) {
      if (character === '"' && normalized[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      record.push(field);
      field = "";
    } else if (character === "\n") {
      record.push(field);
      if (record.some((value) => value.trim() !== "")) records.push(record);
      record = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error("CSV contains an unterminated quoted field");
  record.push(field);
  if (record.some((value) => value.trim() !== "")) records.push(record);
  const headers = records.shift()?.map((header) => header.trim()) ?? [];
  if (new Set(headers).size !== headers.length) throw new Error("CSV contains duplicate headers");
  return records.map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]))
  );
}

export function csvHeader(sheet: CatalogSheetName): string {
  return `${catalogColumns[sheet].join(",")}\n`;
}

export function parseCsvBundle(
  files: Readonly<Partial<Record<CatalogSheetName, string>>>
): ParsedCatalogBundle {
  const sheets = Object.fromEntries(
    catalogSheetNames.map((name) => [name, parseCsv(files[name] ?? csvHeader(name))])
  ) as unknown as Record<CatalogSheetName, readonly CatalogRow[]>;
  return { sheets };
}

export function serializeCsv(
  sheet: CatalogSheetName,
  rows: readonly Readonly<Record<string, string | number | boolean | null>>[]
): string {
  const columns = catalogColumns[sheet];
  const encode = (value: string | number | boolean | null | undefined): string => {
    const stringValue = value === null || value === undefined ? "" : String(value);
    return /[",\n\r]/u.test(stringValue) ? `"${stringValue.replace(/"/gu, '""')}"` : stringValue;
  };
  return (
    [
      columns.join(","),
      ...rows.map((row) => columns.map((column) => encode(row[column])).join(","))
    ].join("\n") + "\n"
  );
}
