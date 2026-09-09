import { Sha256Schema, VersionIdentifierV2Schema, type DeepReadonly } from "@niedax/domain";
import { z } from "zod";

import { EXCEL_RENDERER_VERSION } from "./context.js";
import { WorkbookExportError, literalExcelText } from "./excel-safety.js";

export const WorkbookQuantityFieldSchema = z.enum([
  "technicalQuantity",
  "reserveQuantity",
  "reservedQuantity",
  "packageIncrement",
  "packageCount",
  "packagingOverage",
  "orderedQuantity",
  "totalSpareQuantity"
]);

const WorkbookSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("blank") }).strict(),
  z
    .object({
      kind: z.literal("text"),
      field: z.enum([
        "productCode",
        "descriptionEn",
        "unit",
        "category",
        "status",
        "remarks",
        "material",
        "packageUnit",
        "includedItems",
        "itemNumber",
        "revisionNumber"
      ])
    })
    .strict(),
  z
    .object({
      kind: z.literal("quantity"),
      field: WorkbookQuantityFieldSchema,
      overflow: z.enum(["reject", "exactText"])
    })
    .strict(),
  // Only a same-row reference to a saved numeric cell is allowed. No arithmetic,
  // caller-provided expression, external reference or quantity rule is accepted.
  z.object({ kind: z.literal("reference"), column: z.number().int().min(1).max(29) }).strict()
]);

const WorkbookColumnSchema = z
  .object({
    position: z.number().int().min(1).max(29),
    header: z.string().min(1).max(200),
    meaning: z.string().min(1).max(1_000),
    compatibility: z.enum(["ordinary", "sap", "price", "totalPrice"]),
    source: WorkbookSourceSchema,
    width: z.number().min(5).max(80),
    numberFormat: z.enum(["@", "0", "0.##################"])
  })
  .strict();

export const WorkbookMappingSchema = z
  .object({
    schemaVersion: z.literal("excel-workbook-mapping/v1"),
    approval: z.enum(["approved", "syntheticTestOnly"]),
    templateId: VersionIdentifierV2Schema,
    templateSha256: Sha256Schema,
    mappingVersion: VersionIdentifierV2Schema,
    rendererVersion: z.literal(EXCEL_RENDERER_VERSION),
    sheetName: z.enum(["List1", "Change Order"]).default("List1"),
    headerRow: z.union([z.literal(4), z.literal(5)]),
    dataStartRow: z.union([z.literal(5), z.literal(6)]),
    columns: z.array(WorkbookColumnSchema).min(26).max(29)
  })
  .strict()
  .superRefine((mapping, context) => {
    if (
      (mapping.approval === "approved" &&
        (mapping.columns.length !== 26 ||
          mapping.sheetName !== "Change Order" ||
          mapping.headerRow !== 5 ||
          mapping.dataStartRow !== 6)) ||
      (mapping.approval === "syntheticTestOnly" &&
        (mapping.columns.length !== 29 ||
          mapping.sheetName !== "List1" ||
          mapping.headerRow !== 4 ||
          mapping.dataStartRow !== 5))
    ) {
      context.addIssue({
        code: "custom",
        message: "Mapping layout differs from its reviewed approval contract"
      });
    }
    for (const [index, column] of mapping.columns.entries()) {
      if (column.position !== index + 1)
        context.addIssue({
          code: "custom",
          message: "Ordered contiguous template column positions are required"
        });
      if (column.compatibility !== "ordinary" && column.source.kind !== "blank") {
        context.addIssue({
          code: "custom",
          message: "SAP and price compatibility cells must be genuinely blank"
        });
      }
      if (column.source.kind === "reference") {
        const target = mapping.columns[column.source.column - 1];
        if (target?.source.kind !== "quantity" || target.position === column.position) {
          context.addIssue({
            code: "custom",
            message: "Reference formulas must target a saved quantity column"
          });
        }
      }
      if (column.source.kind === "quantity" && column.numberFormat === "@") {
        context.addIssue({
          code: "custom",
          message:
            "Quantity columns require a numeric format; exact text exceptions are formatted per cell"
        });
      }
    }
  });

export type WorkbookMapping = DeepReadonly<z.infer<typeof WorkbookMappingSchema>>;

export const APPROVED_TEMPLATE_AVAILABILITY = true as const;
export const EXCEL_TEMPLATE_AVAILABILITY = Object.freeze({
  available: APPROVED_TEMPLATE_AVAILABILITY,
  reason: null,
  templateId: "change-order-clients-scope-26",
  templateSha256: "sha256:0f1dde6a901cd319870bec8995b37021ab0c38ad887eac846825805deba8a261",
  mappingVersion: "change-order-clients-scope-26-1",
  rendererVersion: EXCEL_RENDERER_VERSION
});

/** User explicitly authorized the supplied 26-column Change Order layout.
 * Only reviewed layout metadata is embedded; customer rows/assets are excluded. */
export function getApprovedWorkbookMapping(): WorkbookMapping | null {
  return validateWorkbookMapping({
    schemaVersion: "excel-workbook-mapping/v1",
    approval: "approved",
    templateId: EXCEL_TEMPLATE_AVAILABILITY.templateId,
    templateSha256: EXCEL_TEMPLATE_AVAILABILITY.templateSha256,
    mappingVersion: EXCEL_TEMPLATE_AVAILABILITY.mappingVersion,
    rendererVersion: EXCEL_RENDERER_VERSION,
    sheetName: "Change Order",
    headerRow: 5,
    dataStartRow: 6,
    columns: APPROVED_COLUMNS.map(([header, width, source], index) => ({
      position: index + 1,
      header,
      width,
      source,
      meaning: APPROVED_MEANINGS[index],
      compatibility: index === 15 ? "price" : index === 16 ? "totalPrice" : "ordinary",
      numberFormat: source.kind === "quantity" ? "0.##################" : "@"
    }))
  });
}

const blank = { kind: "blank" } as const;
const text = (field: string) => ({ kind: "text", field });
const quantity = (field: string) => ({ kind: "quantity", field, overflow: "exactText" });
const APPROVED_COLUMNS = [
  ["Item No.", 10.06640625, text("itemNumber")],
  ["Design Qty", 12.19921875, quantity("technicalQuantity")],
  ["Order Qty", 11.19921875, quantity("orderedQuantity")],
  ["Spare Qty", 11.33203125, quantity("totalSpareQuantity")],
  ["Unit", 6.796875, text("unit")],
  ["Packaging ", 11.86328125, blank],
  ["Packaging Qty", 14.9296875, quantity("packageIncrement")],
  ["Unit2", 7.6640625, text("unit")],
  ["Ordered Qty", 13.06640625, quantity("packageCount")],
  ["Unit3", 7.73046875, text("packageUnit")],
  ["Description (EN)", 47.19921875, text("descriptionEn")],
  ["Dimension [mm]", 16.46484375, blank],
  ["Material", 20.46484375, blank],
  ["Weight [kg]", 13.59765625, blank],
  [
    "Clear description of content of a set and type designation",
    55.73046875,
    text("includedItems")
  ],
  ["Price/pcs", 11.86328125, blank],
  ["Total Price", 13.1328125, blank],
  ["Country of origin", 12.73046875, blank],
  ["Pos./TAG-No", 15, blank],
  ["Drawing No.", 22.1328125, blank],
  ["Revision number", 12.59765625, text("revisionNumber")],
  ["Certificates", 11.1328125, blank],
  ["Original Equipment Manufacturer ", 15.265625, blank],
  ["Manufacturer Part No.", 22.265625, text("productCode")],
  ["ACS barcode", 13.86328125, blank],
  ["Remarks", 47.86328125, text("remarks")]
] as const;
const APPROVED_MEANINGS = [
  "Stable sequential output row number, one per saved BOM line.",
  "Saved technical quantity in the line order unit.",
  "Saved final ordered quantity; replaces template G*I engineering arithmetic.",
  "Saved total spare; replaces template C-B arithmetic.",
  "Saved order unit.",
  "Blank: physical packaging kind is absent from immutable evidence.",
  "Saved package increment (package size), not package count.",
  "Saved package increment unit.",
  "Saved package count, nullable; source template C=G*I establishes this meaning.",
  "Saved package count unit when present.",
  "Saved English description.",
  "Blank: no unambiguous saved product dimensions.",
  "Blank: no saved standalone product material.",
  "Blank: no saved product weight.",
  "Saved included items and quantity per parent; informational only.",
  "Blank: prices are out of scope.",
  "Blank: total prices are out of scope.",
  "Blank: country of origin absent from saved evidence.",
  "Blank: no single authoritative saved position/tag for an aggregated BOM line.",
  "Blank: drawing reference absent from saved evidence.",
  "Captured selected revision number.",
  "Blank: certificates absent from saved evidence.",
  "Blank: manufacturer name absent from saved evidence.",
  "Saved product code as literal text; blank for free-text manual items.",
  "Blank: barcode absent from saved evidence.",
  "Saved status, manual identity, included relations, warning references and evidence navigation."
] as const;

export function validateWorkbookMapping(value: unknown): WorkbookMapping {
  const parsed = WorkbookMappingSchema.safeParse(value);
  if (!parsed.success)
    throw new WorkbookExportError("EXPORT_MAPPING_INVALID", "Workbook mapping failed validation");
  for (const column of parsed.data.columns) {
    literalExcelText(column.header);
    literalExcelText(column.meaning);
  }
  return parsed.data;
}
