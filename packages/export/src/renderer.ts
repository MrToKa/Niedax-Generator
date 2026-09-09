import ExcelJS from "exceljs";
import type { BomLineV2, WarningCodeV2 } from "@niedax/domain";

import { buildEnglishExportContextV3, type ExportContextV3 } from "./context.js";
import {
  exactExcelDecimal,
  literalExcelText,
  safeExcelFileName,
  WorkbookExportError
} from "./excel-safety.js";
import { validateWorkbookMapping, type WorkbookMapping } from "./workbook-mapping.js";

export const XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const MAX_ROWS = 1_048_576;

const WARNING_EXPLANATIONS: Readonly<Record<WarningCodeV2, string>> = {
  MISSING_CABLE_LOAD: "Cable load has not been supplied.",
  MISSING_SUBSTRATE_OR_BASE: "Substrate or mounting base has not been supplied.",
  UNKNOWN_SUBSTRATE: "The saved substrate is not verified.",
  MISSING_ANCHOR_SELECTION: "Anchor selection is missing.",
  ANCHOR_ENGINEERING_CHECK_REQUIRED: "Anchor selection requires engineering review.",
  ANCHOR_PRODUCT_INCOMPATIBLE: "The selected anchor product is incompatible.",
  MISSING_COMPATIBILITY_RULE: "A required compatibility rule is missing.",
  PRODUCT_SELECTION_INCOMPATIBLE: "The saved product selection is incompatible.",
  UNRESOLVED_SECTION_SUPPLY_OPTION: "The section supply option remains unresolved.",
  UNRESOLVED_JOINT_PRODUCT: "The joint product remains unresolved.",
  UNRESOLVED_FITTING_CONNECTION: "The fitting connection remains unresolved.",
  UNRESOLVED_ENDPOINT_MATERIAL: "The endpoint material remains unresolved.",
  SUPPORT_CONFIGURATION_MISMATCH: "The support configuration does not match its saved rules.",
  FITTING_ADDITIONAL_SUPPORT_UNRESOLVED: "Additional fitting support remains unresolved.",
  MANUAL_EXTRA_SUPPORT: "Additional supports were entered manually.",
  MANUAL_QUANTITY_OVERRIDE: "A saved manual quantity adjustment is present.",
  MANUAL_ANCHOR_OVERRIDE: "A saved manual anchor adjustment is present.",
  MANUAL_PACKAGE_OVERRIDE: "A saved manual packaging policy is present.",
  WSTB_PROJECT_RULE_UNCONFIRMED: "The project WSTB rule requires confirmation.",
  WSTB_TEMPLATE_RULE_CONFLICT: "The WSTB template and project rule conflict.",
  ASSEMBLY_TEMPLATE_MISSING: "A required assembly template is missing.",
  TEMPLATE_COMPONENT_MANUAL_VALUE_REQUIRED: "An assembly component requires a manual value.",
  ENGINEERING_CHECK_REQUIRED: "Engineering review is required."
};

function addRow(
  sheet: ExcelJS.Worksheet,
  values: readonly (string | number | null)[]
): ExcelJS.Row {
  if (sheet.rowCount >= MAX_ROWS)
    throw new WorkbookExportError("EXPORT_ROW_LIMIT", "Saved evidence exceeds the Excel row limit");
  const row = sheet.addRow(
    values.map((value) => (typeof value === "string" ? literalExcelText(value) : value))
  );
  row.alignment = { vertical: "top", wrapText: true };
  const displayLines = Math.max(
    1,
    ...values.map((value, index) => {
      if (value === null) return 1;
      const width = Math.max(8, (sheet.getColumn(index + 1).width ?? 15) - 2);
      return String(value)
        .split("\n")
        .reduce((total, line) => total + Math.max(1, Math.ceil(line.length / width)), 0);
    })
  );
  // Excel limits row height to 409 points. Full cell contents remain available
  // in the formula bar for exceptional long evidence; no source text is trimmed.
  row.height = Math.min(409, Math.max(18, displayLines * 15));
  row.eachCell((cell) => {
    if (typeof cell.value === "string") cell.numFmt = "@";
  });
  return row;
}

function styleHeader(sheet: ExcelJS.Worksheet, headerRow: number, lastColumn: number): void {
  const row = sheet.getRow(headerRow);
  row.height = 32;
  for (let column = 1; column <= lastColumn; column++) {
    const cell = row.getCell(column);
    cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF17365D" } };
    cell.alignment = { vertical: "middle", wrapText: true };
  }
}

function configureSheet(sheet: ExcelJS.Worksheet, headerRow: number, lastColumn: number): void {
  sheet.views = [{ state: "frozen", ySplit: headerRow, activeCell: `A${headerRow + 1}` }];
  sheet.autoFilter = {
    from: { row: headerRow, column: 1 },
    to: { row: Math.max(headerRow, sheet.rowCount), column: lastColumn }
  };
  sheet.pageSetup = {
    paperSize: 9,
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    printArea: `A1:${sheet.getColumn(lastColumn).letter}${Math.max(headerRow, sheet.rowCount)}`,
    printTitlesRow: `${headerRow}:${headerRow}`,
    margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 }
  };
  sheet.headerFooter.oddFooter = "Page &P of &N";
}

function remarks(line: BomLineV2): string {
  const parts = [`Saved status: ${line.status}.`];
  if (line.kind === "manual") parts.push(`Manual item: ${line.manualInputId ?? line.id}.`);
  if (line.includedItems.length)
    parts.push(
      `${line.includedItems.length} included item relation(s); information only, see Calculation details.`
    );
  if (line.warningIds.length) parts.push(`Warnings: ${line.warningIds.join(", ")}.`);
  parts.push("Sources and saved policies: Calculation details.");
  return literalExcelText(parts.join(" "));
}

function addOrderSheet(
  workbook: ExcelJS.Workbook,
  context: ExportContextV3,
  mapping: WorkbookMapping
): Map<string, number> {
  const sheet = workbook.addWorksheet(mapping.sheetName);
  sheet.columns = mapping.columns.map((column) => ({
    width: column.width,
    style: { numFmt: column.numberFormat }
  }));
  const project = context.snapshot.project;
  const banner =
    mapping.approval === "syntheticTestOnly"
      ? "SYNTHETIC TEST ONLY — NOT AN APPROVED CHANGE ORDER"
      : "English order export";
  const approvalLabel = context.revision.status === "approved" ? "APPROVED" : "NOT APPROVED";
  if (mapping.approval === "approved") {
    for (let row = 1; row <= 4; row++) {
      sheet.getRow(row).height = 26;
    }
    for (const merge of ["A1:C1", "D1:J1", "K1:X2", "A2:C2", "D2:J2", "A3:C4", "D3:J4", "K3:X4"])
      sheet.mergeCells(merge);
    for (const [address, value] of Object.entries({
      A1: "Project",
      D1: project.code,
      K1: project.name,
      A2: "Revision",
      D2: `${context.revision.revisionNumber}: ${context.revision.name}`,
      A3: "Status at request",
      D3: `${context.revision.status.toUpperCase()} — ${approvalLabel}`,
      K3: `English order export | Revision ID: ${context.revision.id} | ${context.capturedAt}`
    })) {
      const cell = sheet.getCell(address);
      cell.value = literalExcelText(value);
      cell.numFmt = "@";
      cell.font = {
        name: "Calibri",
        size: ["K1", "D3"].includes(address) ? 18 : 12,
        bold: ["K1", "D3"].includes(address)
      };
      cell.alignment = { vertical: "middle", wrapText: true };
      cell.border = {
        top: { style: "thin" },
        bottom: { style: "thin" },
        left: { style: "thin" },
        right: { style: "thin" }
      };
    }
  } else {
    addRow(sheet, [banner]);
    addRow(sheet, [`Project: ${project.code} — ${project.name}`]);
    addRow(sheet, [
      `Revision ${context.revision.revisionNumber}: ${context.revision.name} | ${approvalLabel} | Status at request: ${context.revision.status} | ID: ${context.revision.id}`
    ]);
    for (let row = 1; row <= 3; row++) sheet.mergeCells(row, 1, row, 29);
    for (let row = 1; row <= 3; row++) sheet.getRow(row).height = 28;
  }
  sheet.getRow(1).font = { bold: true, size: 14 };
  addRow(
    sheet,
    mapping.columns.map((column) => column.header)
  );
  const rowLinks = new Map<string, number>();
  for (const line of context.snapshot.calculationResult.bomLines) {
    if (sheet.rowCount >= MAX_ROWS)
      throw new WorkbookExportError("EXPORT_ROW_LIMIT", "BOM exceeds the Excel row limit");
    const row = sheet.addRow([]);
    rowLinks.set(line.id, row.number);
    row.alignment = { vertical: "top", wrapText: true };
    row.height = 45;
    for (const column of mapping.columns) {
      const cell = row.getCell(column.position);
      const source = column.source;
      if (source.kind === "blank" || source.kind === "reference") continue;
      if (source.kind === "quantity") {
        const quantity = line[source.field];
        cell.value = quantity === null ? null : exactExcelDecimal(quantity.value, source.overflow);
        if (quantity !== null && typeof cell.value === "number") {
          const scale = quantity.value.split(".")[1]?.length ?? 0;
          // Excel displays a trailing decimal separator for "0.###" integers.
          // Use the saved decimal scale so display never adds a separator or
          // removes meaningful saved fractional digits.
          cell.numFmt = scale === 0 ? "0" : `0.${"0".repeat(scale)}`;
        }
      } else {
        // Stage 8 saves no standalone material attribute. No inference or live lookup.
        switch (source.field) {
          case "material":
            cell.value = null;
            break;
          case "remarks":
            cell.value = remarks(line);
            break;
          case "packageUnit":
            cell.value = line.packageCount?.unit ?? null;
            break;
          case "includedItems":
            cell.value = line.includedItems.length
              ? line.includedItems
                  .map(
                    (item) =>
                      `${item.productCode} — ${item.descriptionEn}; ${item.quantityPerParent.value} ${item.quantityPerParent.unit} per parent (included; not ordered separately)`
                  )
                  .join("\n")
              : null;
            break;
          case "itemNumber":
            cell.value = String(row.number - mapping.dataStartRow + 1);
            break;
          case "revisionNumber":
            cell.value = String(context.revision.revisionNumber);
            break;
          default:
            cell.value = line[source.field];
        }
      }
      if (typeof cell.value === "string") {
        cell.value = literalExcelText(cell.value);
        cell.numFmt = "@";
      }
    }
    if (mapping.approval === "approved") {
      for (let index = 1; index <= mapping.columns.length; index++) {
        const cell = row.getCell(index);
        cell.font = { name: "Arial", size: 10 };
        cell.border = {
          top: { style: "thin" },
          bottom: { style: "thin" },
          left: { style: "thin" },
          right: { style: "thin" }
        };
      }
    }
    for (const column of mapping.columns) {
      if (column.source.kind !== "reference") continue;
      const target = row.getCell(column.source.column);
      if (target.value === null) continue;
      if (typeof target.value !== "number")
        throw new WorkbookExportError(
          "EXPORT_PRECISION_UNSUPPORTED",
          "Reference formula requires an exactly represented numeric saved quantity"
        );
      row.getCell(column.position).value = { formula: target.address, result: target.value };
      row.getCell(column.position).numFmt = target.numFmt;
    }
    let requiredLines = 1;
    row.eachCell((cell, column) => {
      if (typeof cell.value !== "string") return;
      const width = Math.max(6, (sheet.getColumn(column).width ?? 15) - 2);
      const lines = cell.value
        .split("\n")
        .reduce((total, text) => total + Math.max(1, Math.ceil(text.length / width)), 0);
      requiredLines = Math.max(requiredLines, lines);
    });
    row.height = Math.min(409, Math.max(45, requiredLines * 13));
  }
  styleHeader(sheet, mapping.headerRow, mapping.columns.length);
  configureSheet(sheet, mapping.headerRow, mapping.columns.length);
  if (mapping.approval === "approved") {
    sheet.getRow(5).height = 45;
    sheet.getRow(5).eachCell((cell) => {
      cell.font = { name: "Arial", size: 9, bold: true, color: { argb: "FF000000" } };
      const templateColor: Partial<ExcelJS.Color> & { tint: number } = {
        theme: 4,
        tint: 0.5999938962981048
      };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: templateColor };
      cell.border = {
        top: { style: "thin" },
        bottom: { style: "thin" },
        left: { style: "thin" },
        right: { style: "thin" }
      };
    });
    sheet.views = [{ state: "frozen", ySplit: 5, topLeftCell: "A6", zoomScale: 70 }];
    // OOXML paperSize 8 is A3 in the supplied workbook; ExcelJS 4.4's
    // declaration omits A3 although its writer preserves the numeric value.
    sheet.pageSetup.paperSize = 8 as ExcelJS.PaperSize;
    // Native Excel QA showed that 26 preserved source-width columns shrink to
    // illegible type on one A3 page. Repeat quantities/units across two pages.
    sheet.pageSetup.fitToWidth = 2;
    sheet.pageSetup.printTitlesColumn = "A:E";
    sheet.headerFooter.oddHeader = `&LRevision ${context.revision.revisionNumber} | ${context.revision.status.toUpperCase()} | ${approvalLabel}&RPage &P of &N`;
    sheet.pageSetup.printTitlesRow = "1:5";
    sheet.pageSetup.margins = {
      left: 0.25,
      right: 0.25,
      top: 0.75,
      bottom: 0.75,
      header: 0.3,
      footer: 0.3
    };
  }
  return rowLinks;
}

/** Lossless leaf projection of the complete context. Stable source paths and an
 * explicit primitive type distinguish null, zero, empty strings and empty arrays.
 * Formula and rule expressions remain literal text, never spreadsheet formulas. */
function addEvidenceSheet(
  workbook: ExcelJS.Workbook,
  context: ExportContextV3,
  rowLinks: ReadonlyMap<string, number>,
  orderSheetName: string
): void {
  const sheet = workbook.addWorksheet("Calculation details");
  sheet.columns = [
    { width: 21 },
    { width: 40 },
    { width: 15 },
    { width: 76 },
    { width: 90 },
    { width: 14 },
    { width: 14 }
  ];
  addRow(sheet, [
    "Evidence",
    "Entity ID",
    `${orderSheetName} row`,
    "Saved source path",
    "Exact saved value",
    "Value type",
    "Unit"
  ]);
  const walk = (
    value: unknown,
    path: string,
    entityId: string | null,
    orderRow: number | null,
    unit: string | null
  ): void => {
    if (value !== null && typeof value === "object") {
      const record = value as Record<string, unknown>;
      const id = typeof record["id"] === "string" ? record["id"] : entityId;
      const lineId = typeof record["bomLineId"] === "string" ? record["bomLineId"] : id;
      const linkedRow = lineId === null ? orderRow : (rowLinks.get(lineId) ?? orderRow);
      const savedUnit = typeof record["unit"] === "string" ? record["unit"] : unit;
      const entries = Object.entries(value);
      if (entries.length === 0)
        addRow(sheet, [
          "Saved evidence",
          id,
          linkedRow,
          path,
          Array.isArray(value) ? "[]" : "{}",
          Array.isArray(value) ? "array" : "object",
          savedUnit
        ]);
      for (const [key, child] of entries)
        walk(
          child,
          Array.isArray(value) ? `${path}[${key}]` : `${path}.${key}`,
          id,
          linkedRow,
          savedUnit
        );
      return;
    }
    addRow(sheet, [
      "Saved evidence",
      entityId,
      orderRow,
      path,
      value === null ? "null" : String(value),
      value === null ? "null" : typeof value,
      unit
    ]);
  };
  walk(context, "context", null, null, null);
  styleHeader(sheet, 1, 7);
  configureSheet(sheet, 1, 7);
  sheet.pageSetup.paperSize = 8 as ExcelJS.PaperSize;
}

function addWarningsSheet(
  workbook: ExcelJS.Workbook,
  context: ExportContextV3,
  rowLinks: ReadonlyMap<string, number>,
  orderSheetName: string
): void {
  const sheet = workbook.addWorksheet("Warnings");
  const headers = [
    "Warning ID",
    "Code",
    "Severity",
    "English explanation",
    "Saved effect",
    "Affected entity",
    "BOM line IDs",
    `${orderSheetName} rows`,
    "Engineering review required",
    "Blocks approval",
    "Approval impact",
    "Rule ID",
    "Product ID",
    "Template ID",
    "Override ID",
    "Saved evidence path"
  ];
  sheet.columns = headers.map((_, index) => ({ width: [3, 4].includes(index) ? 64 : 28 }));
  addRow(sheet, [
    context.snapshot.calculationResult.warnings.length === 0
      ? "No saved warnings."
      : `${context.snapshot.calculationResult.warnings.length} saved warning(s).`
  ]);
  sheet.mergeCells(1, 1, 1, headers.length);
  addRow(sheet, headers);
  for (const [index, warning] of context.snapshot.calculationResult.warnings.entries()) {
    const lines = context.snapshot.calculationResult.bomLines.filter((line) =>
      line.warningIds.includes(warning.id)
    );
    addRow(sheet, [
      warning.id,
      warning.code,
      warning.severity,
      WARNING_EXPLANATIONS[warning.code],
      warning.effect,
      `${warning.subject.kind}:${warning.subject.id}`,
      lines.map((line) => line.id).join("\n"),
      lines.map((line) => String(rowLinks.get(line.id))).join("\n"),
      warning.approvalImpact === "reviewRequired" || warning.severity === "engineeringReview"
        ? "Yes"
        : "No",
      warning.approvalImpact === "blocksApproval" ? "Yes" : "No",
      warning.approvalImpact,
      warning.ruleId,
      warning.productId,
      warning.templateId,
      warning.overrideId,
      `context.snapshot.calculationResult.warnings[${index}] (Calculation details)`
    ]);
  }
  styleHeader(sheet, 2, headers.length);
  configureSheet(sheet, 2, headers.length);
  // A single A4 page makes this full evidence table illegible. Use two A3
  // pages across and repeat warning identity columns on continuation pages.
  sheet.pageSetup.paperSize = 8 as ExcelJS.PaperSize;
  sheet.pageSetup.fitToWidth = 2;
  sheet.pageSetup.printTitlesColumn = "A:C";
}

export interface RenderedExcelWorkbook {
  readonly mediaType: typeof XLSX_MEDIA_TYPE;
  readonly suggestedFileName: string;
  readonly bytes: Uint8Array;
}

export async function renderExcelWorkbook(
  evidence: ExportContextV3,
  suppliedMapping: WorkbookMapping
): Promise<RenderedExcelWorkbook> {
  const context = buildEnglishExportContextV3(evidence);
  const mapping = validateWorkbookMapping(suppliedMapping);
  for (const key of [
    "templateId",
    "templateSha256",
    "mappingVersion",
    "rendererVersion"
  ] as const) {
    if (mapping[key] !== context.versions[key])
      throw new WorkbookExportError(
        "EXPORT_MAPPING_INVALID",
        "Captured renderer identity does not match its mapping"
      );
  }
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Niedax Generator";
  workbook.lastModifiedBy = "Niedax Generator";
  workbook.title =
    mapping.approval === "syntheticTestOnly"
      ? "SYNTHETIC TEST ONLY — English order export"
      : "English order export";
  workbook.subject = `Saved revision ${context.revision.id}`;
  workbook.description = `Immutable saved evidence; ${mapping.templateId}; ${mapping.mappingVersion}; ${mapping.rendererVersion}`;
  workbook.created = new Date(context.capturedAt);
  workbook.modified = new Date(context.capturedAt);
  workbook.calcProperties.fullCalcOnLoad = false;
  const rows = addOrderSheet(workbook, context, mapping);
  addEvidenceSheet(workbook, context, rows, mapping.sheetName);
  addWarningsSheet(workbook, context, rows, mapping.sheetName);
  // Rebuilt reviewed layout excludes inherited customer rows, assets and links.
  // The supplied 26-column file had only valid print area/title names; dynamic
  // equivalents are generated above. Its quantity formulas copy saved values.
  const bytes = new Uint8Array(await workbook.xlsx.writeBuffer());
  return {
    mediaType: XLSX_MEDIA_TYPE,
    suggestedFileName: safeExcelFileName(
      context.snapshot.project.code,
      context.revision.revisionNumber
    ),
    bytes
  };
}
