import { DecimalStringV2Schema } from "@niedax/domain";

export class WorkbookExportError extends Error {
  constructor(
    public readonly code:
      | "EXPORT_TEMPLATE_UNAVAILABLE"
      | "EXPORT_MAPPING_INVALID"
      | "EXPORT_PRECISION_UNSUPPORTED"
      | "EXPORT_CELL_LIMIT"
      | "EXPORT_XML_INVALID"
      | "EXPORT_ROW_LIMIT",
    message: string
  ) {
    super(message);
    this.name = "WorkbookExportError";
  }
}

/** No escaping prefix is inserted: ExcelJS string cells serialize as literal shared
 * strings even if their contents begin with =, +, -, @, tab or a line break. */
export function literalExcelText(value: string): string {
  if (value.length > 32_767) {
    throw new WorkbookExportError("EXPORT_CELL_LIMIT", "Saved text exceeds the Excel cell limit");
  }
  for (const character of value) {
    const point = character.codePointAt(0)!;
    if (
      (point < 0x20 && ![0x09, 0x0a, 0x0d].includes(point)) ||
      (point >= 0xd800 && point <= 0xdfff) ||
      point === 0xfffe ||
      point === 0xffff
    ) {
      throw new WorkbookExportError(
        "EXPORT_XML_INVALID",
        "Saved text contains an invalid XML character"
      );
    }
  }
  return value;
}

function expandExponent(value: string): string {
  if (!value.includes("e")) return value;
  const [mantissa = "", exponent = "0"] = value.split("e");
  const [whole = "", fraction = ""] = mantissa.split(".");
  const digits = whole + fraction;
  const point = whole.length + Number(exponent);
  if (point <= 0) return `0.${"0".repeat(-point)}${digits}`;
  if (point >= digits.length) return digits + "0".repeat(point - digits.length);
  return `${digits.slice(0, point)}.${digits.slice(point)}`;
}

/** Excel stores 15 significant decimal digits. Both that boundary and an exact
 * canonical decimal round trip are required; no engineering arithmetic occurs. */
export function exactExcelDecimal(
  value: string,
  overflow: "reject" | "exactText"
): number | string {
  DecimalStringV2Schema.parse(value);
  const significantDigits = value.replace(".", "").replace(/^0+/u, "").length;
  const numeric = Number(value);
  const expanded = expandExponent(numeric.toPrecision(15));
  const roundTrip = expanded.includes(".")
    ? expanded.replace(/0+$/u, "").replace(/\.$/u, "")
    : expanded;
  const safe = significantDigits <= 15 && Number.isFinite(numeric) && roundTrip === value;
  if (safe) return numeric;
  if (overflow === "exactText") return value;
  throw new WorkbookExportError(
    "EXPORT_PRECISION_UNSUPPORTED",
    "Saved decimal cannot be represented exactly in this workbook mapping"
  );
}

export function safeExcelFileName(projectCode: string, revisionNumber: number): string {
  const stem = projectCode
    .normalize("NFKC")
    .replace(/[^A-Za-z0-9._-]/gu, "-")
    .replace(/^[.-]+|[.-]+$/gu, "")
    .replace(/-+/gu, "-")
    .slice(0, 80)
    .replace(/[.-]+$/gu, "");
  return `Niedax-${stem || "project"}-revision-${revisionNumber}.xlsx`;
}
