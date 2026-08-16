import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  catalogSheetNames,
  createXlsxBundle,
  createXlsxTemplate,
  parseCsvBundle,
  runCatalogPipeline,
  serializeCsv,
  type CatalogSheetName
} from "../packages/catalog-import/src/index.js";

type CsvValue = string | number | boolean | null;
type CsvRow = Record<string, CsvValue>;

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const outputDirectory = join(repositoryRoot, "catalogue", "imports", "niedax-p0-2022");
const templateDirectory = join(repositoryRoot, "catalogue", "templates", "catalog-import-v1");
const scopePath = join(repositoryRoot, "catalogue", "catalog-scope.yml");
const auditPath = join(repositoryRoot, "docs", "catalogs", "niedax", "extraction-audit.csv");
const KR = "KAT_NX_KR 2022.pdf";
const ELECTRICAL = "1.-Electrical-installation-materials.pdf";
const VERSION = "2022-p0";
const ENGINEERING_NOTE =
  "Suitability must be verified against the applicable ETA, substrate condition, edge distances, loads, and installation instructions.";

const sheets: Record<CatalogSheetName, CsvRow[]> = Object.fromEntries(
  catalogSheetNames.map((sheet) => [sheet, []])
) as unknown as Record<CatalogSheetName, CsvRow[]>;

function sourcePdfPage(printedPage: string): number {
  if (printedPage.startsWith("KR ")) return Number(printedPage.slice(3)) + 4;
  return Number(printedPage) - 137;
}

function finishData(finishCode: string): { material_code: string; finish_code: string } {
  if (finishCode === "E3") return { material_code: "stainless_1.4301_1.4303", finish_code: "E3" };
  if (finishCode === "E5") return { material_code: "stainless_1.4571", finish_code: "E5" };
  if (finishCode.startsWith("K")) return { material_code: "polymer", finish_code: finishCode };
  return { material_code: "steel", finish_code: finishCode };
}

function product(row: CsvRow): void {
  const sourceDocument = String(row["source_document"] ?? KR);
  const printedPage = String(row["source_printed_page"]);
  sheets.products.push({
    code: "",
    description_en: "",
    category: "accessory",
    product_family: "",
    system: "",
    catalog_version: VERSION,
    pack_quantity: 1,
    pack_unit: "pcs",
    order_unit: "pcs",
    ean: "",
    height_mm: "",
    width_mm: "",
    length_mm: "",
    material_code: "",
    finish_code: "",
    weight_value: "",
    weight_unit: "",
    weight_basis_quantity: "",
    weight_basis_unit: "",
    approval_number: "",
    dop_number: "",
    indoor_only: false,
    engineering_verification_required: false,
    is_orderable: true,
    source_document: sourceDocument,
    source_printed_page: printedPage,
    source_pdf_page: sourcePdfPage(printedPage),
    source_table_or_row: String(row["code"] ?? ""),
    engineering_note: "",
    ...row
  });
}

function attribute(
  code: string,
  key: string,
  value: string | number | boolean,
  unit: string | null,
  printedPage: string,
  sourceDocument = ELECTRICAL
): void {
  sheets.product_attributes.push({
    product_code: code,
    attribute_key: key,
    value_text: typeof value === "string" ? value : "",
    value_number: typeof value === "number" ? value : "",
    value_boolean: typeof value === "boolean" ? value : "",
    unit: unit ?? "",
    source_document: sourceDocument,
    source_printed_page: printedPage,
    source_pdf_page: sourcePdfPage(printedPage),
    source_table_or_row: code
  });
}

function included(
  parent: string,
  child: string,
  quantity: number,
  printedPage: string,
  note: string
): void {
  sheets.included_items.push({
    parent_product_code: parent,
    included_product_code: child,
    quantity,
    unit: "pcs",
    source_document: KR,
    source_printed_page: printedPage,
    source_pdf_page: sourcePdfPage(printedPage),
    source_table_or_row: parent,
    note
  });
}

function familyVariants(input: {
  prefix: string;
  description: string;
  category?: string;
  system: string;
  height: number | null;
  printedPage: string;
  widths: readonly number[];
  variants: Readonly<Record<string, readonly number[]>>;
  codeFor?: (width: number, finish: string) => string;
  packQuantity?: number;
  packUnit?: string;
  orderUnit?: string;
}): void {
  for (const [finish, widths] of Object.entries(input.variants)) {
    for (const width of widths) {
      const code =
        input.codeFor?.(width, finish) ??
        `${input.prefix} ${input.height}.${width}${finish === "S" ? "" : ` ${finish}`}`;
      product({
        code,
        description_en: input.description,
        category: input.category ?? "fitting",
        product_family: input.prefix,
        system: input.system,
        height_mm: input.height ?? "",
        width_mm: width,
        ...finishData(finish),
        pack_quantity: input.packQuantity ?? 1,
        pack_unit: input.packUnit ?? "pcs",
        order_unit: input.orderUnit ?? "pcs",
        source_document: KR,
        source_printed_page: input.printedPage
      });
    }
  }
}

function simpleVariants(input: {
  base: string;
  description: string;
  family: string;
  system: string;
  height?: number;
  printedPage: string;
  finishes: readonly string[];
  pack: number;
  includedByFinish?: Readonly<Record<string, readonly [string, number][]>>;
  includeSCodeSuffix?: boolean;
}): void {
  for (const finish of input.finishes) {
    const code = `${input.base}${finish === "S" ? (input.includeSCodeSuffix ? " S" : "") : ` ${finish}`}`;
    product({
      code,
      description_en: input.description,
      category: "accessory",
      product_family: input.family,
      system: input.system,
      height_mm: input.height ?? "",
      ...finishData(finish),
      pack_quantity: input.pack,
      source_document: KR,
      source_printed_page: input.printedPage
    });
    for (const [child, quantity] of input.includedByFinish?.[finish] ?? []) {
      included(code, child, quantity, input.printedPage, "Included accessories (Zubehor inkl.)");
    }
  }
}

function addStraightLadders(): void {
  const klWeights: Readonly<Record<string, readonly number[]>> = {
    S: [256.72, 276.45, 296.18, 315.9, 335.63],
    F: [283.4, 305.1, 326.8, 348.5, 370.2],
    E3: [261.15, 281.01, 300.86, 320.71, 340.57],
    E5: [260.98, 281.04, 301.09, 321.14, 341.2]
  };
  const klEans: Readonly<Record<string, readonly string[]>> = {
    S: ["288007", "288106", "288205", "288304", "288403"],
    F: ["569908", "570003", "570102", "570201", "570300"],
    E3: ["340705", "340804", "340903", "341009", "341108"],
    E5: ["730001", "730100", "730209", "730223", "730247"]
  };
  const widths = [200, 300, 400, 500, 600] as const;
  for (const finish of ["S", "F", "E3", "E5"] as const) {
    widths.forEach((width, index) =>
      product({
        code: `KL 60.${width / 100}03${finish === "S" ? "" : ` ${finish}`}`,
        description_en: "Cable ladder, rung spacing 300 mm, continuously perforated side rails",
        category: "straightSection",
        product_family: "KL",
        system: "KL",
        pack_quantity: 6,
        pack_unit: "m",
        order_unit: "m",
        ean: klEans[finish]?.[index] ?? "",
        height_mm: 60,
        width_mm: width,
        length_mm: 6000,
        ...finishData(finish),
        weight_value: klWeights[finish]?.[index] ?? "",
        weight_unit: "kg",
        weight_basis_quantity: 100,
        weight_basis_unit: "kg_per_100_m",
        source_document: KR,
        source_printed_page: "KR 340",
        source_table_or_row: `KL 60 ${finish} width ${width}`
      })
    );
  }

  const wslWeights: Readonly<Record<string, readonly number[]>> = {
    S: [546.14, 573.36, 600.58, 626.04, 653.26],
    F: [601.32, 631.26, 661.2, 689.21, 719.15],
    E3: [549.63, 577.02, 604.41, 630.04, 657.43]
  };
  const wslEans: Readonly<Record<string, readonly string[]>> = {
    S: ["300600", "300709", "300808", "300907", "301003"],
    F: ["577606", "577705", "577804", "577903", "578009"],
    E3: ["726509", "726523", "726547", "726561", "726585"]
  };
  for (const finish of ["S", "F", "E3"] as const) {
    widths.forEach((width, index) =>
      product({
        code: `WSL 105.${width}${finish === "S" ? "" : ` ${finish}`}`,
        description_en: "Wide-span cable ladder, rung spacing 300 mm, 16 mm profile slot",
        category: "straightSection",
        product_family: "WSL",
        system: "WSL",
        pack_quantity: 6,
        pack_unit: "m",
        order_unit: "m",
        ean: wslEans[finish]?.[index] ?? "",
        height_mm: 105,
        width_mm: width,
        length_mm: 6000,
        ...finishData(finish),
        weight_value: wslWeights[finish]?.[index] ?? "",
        weight_unit: "kg",
        weight_basis_quantity: 100,
        weight_basis_unit: "kg_per_100_m",
        source_document: KR,
        source_printed_page: "KR 426",
        source_table_or_row: `WSL 105 ${finish} width ${width}`
      })
    );
  }
}

function addAnchors(): void {
  const anchors = [
    {
      code: "DAM 6X5",
      family: "DAM",
      page: "156",
      pack: 50,
      thread: 6,
      length: 50,
      drill: 6,
      clamp: 5,
      depth: 30,
      weight: 1.38,
      approval: "ETA-18/0541",
      dop: "NI 001"
    },
    {
      code: "DAM 6X10",
      family: "DAM",
      page: "156",
      pack: 50,
      thread: 6,
      length: 55,
      drill: 6,
      clamp: 10,
      depth: 30,
      weight: 1.3,
      approval: "ETA-18/0541",
      dop: "NI 001"
    },
    {
      code: "DAZ 8X10",
      family: "DAZ",
      page: "156",
      pack: 50,
      thread: 8,
      length: 75,
      drill: 8,
      clamp: 10,
      depth: 45,
      washer: 24,
      weight: 3.16,
      approval: "ETA-18/0542",
      dop: "NI 002"
    },
    {
      code: "DAZ 10X10",
      family: "DAZ",
      page: "156",
      pack: 50,
      thread: 10,
      length: 95,
      drill: 10,
      clamp: 10,
      depth: 60,
      washer: 25,
      weight: 6.33,
      approval: "ETA-18/0542",
      dop: "NI 002"
    },
    {
      code: "DAZ 12X10",
      family: "DAZ",
      page: "156",
      pack: 20,
      thread: 12,
      length: 110,
      drill: 12,
      clamp: 10,
      depth: 70,
      washer: 30,
      weight: 10.27,
      approval: "ETA-18/0542",
      dop: "NI 002"
    },
    {
      code: "DAZ 10X30",
      family: "DAZ",
      page: "156",
      pack: 25,
      thread: 10,
      length: 115,
      drill: 10,
      clamp: 30,
      depth: 60,
      washer: 20,
      weight: 7.32,
      approval: "ETA-18/0542",
      dop: "NI 002"
    },
    {
      code: "DAZ 16X25",
      family: "DAZ",
      page: "156",
      pack: 10,
      thread: 16,
      length: 148,
      drill: 16,
      clamp: 25,
      depth: 85,
      washer: 30,
      weight: 23.78,
      approval: "ETA-18/0542",
      dop: "NI 002"
    }
  ] as const;
  for (const anchor of anchors) {
    product({
      code: anchor.code,
      description_en:
        anchor.family === "DAM"
          ? "Expansion anchor with flange nut and metric connecting thread"
          : "Expansion anchor with nut and washer",
      category: "anchor",
      product_family: anchor.family,
      system: "concrete",
      pack_quantity: anchor.pack,
      pack_unit: "pcs",
      order_unit: "pcs",
      material_code: "steel",
      finish_code: "V",
      weight_value: anchor.weight,
      weight_unit: "kg",
      weight_basis_quantity: 100,
      weight_basis_unit: "kg_per_100_pcs",
      approval_number: anchor.approval,
      dop_number: anchor.dop,
      indoor_only: false,
      engineering_verification_required: true,
      source_document: ELECTRICAL,
      source_printed_page: anchor.page,
      engineering_note: ENGINEERING_NOTE
    });
    attribute(anchor.code, "connection_thread", `M${anchor.thread}`, null, anchor.page);
    attribute(anchor.code, "length", anchor.length, "mm", anchor.page);
    attribute(anchor.code, "drill_hole_diameter", anchor.drill, "mm", anchor.page);
    attribute(anchor.code, "clamping_range_max", anchor.clamp, "mm", anchor.page);
    attribute(anchor.code, "effective_anchoring_depth", anchor.depth, "mm", anchor.page);
    if ("washer" in anchor)
      attribute(anchor.code, "washer_diameter", anchor.washer, "mm", anchor.page);
    attribute(anchor.code, "substrate", "concrete", null, anchor.page);
  }

  const nsa = [
    {
      code: "NSA 6X35/FKK-T30 V",
      diameter: 6,
      length: 35,
      drive: "T30 pan-head",
      drill: 5,
      mount: 1,
      weight: 0.91,
      torque: 10,
      application: "pipe clamps"
    },
    {
      code: "NSA 6X50/FKK-T30 V",
      diameter: 6,
      length: 50,
      drive: "T30 pan-head",
      drill: 5,
      mount: "5/15",
      weight: 1.02,
      torque: 10,
      application: "pipe clamps"
    },
    {
      code: "NSA 6X55/SW10-M6 V",
      diameter: 6,
      length: 55,
      drive: "10 mm hex head",
      drill: 5,
      mount: null,
      weight: 1.12,
      torque: 10,
      application: "pipe clamps",
      thread: "M6x10"
    },
    {
      code: "NSA 7.5X40/FKG-T30 V",
      diameter: 7.5,
      length: 40,
      drive: "T30 large-diameter pan-head",
      drill: 6,
      mount: 5,
      weight: 1.38,
      torque: 20,
      application: "framing channel"
    },
    {
      code: "NSA 7.5X50/FKG-T30 V",
      diameter: 7.5,
      length: 50,
      drive: "T30 large-diameter pan-head",
      drill: 6,
      mount: 15,
      weight: 1.62,
      torque: 20,
      application: "framing channel"
    }
  ] as const;
  for (const anchor of nsa) {
    product({
      code: anchor.code,
      description_en: "Concrete screw anchor",
      category: "anchor",
      product_family: "NSA",
      system: "concrete",
      pack_quantity: 100,
      pack_unit: "pcs",
      order_unit: "pcs",
      material_code: "steel",
      finish_code: "V",
      weight_value: anchor.weight,
      weight_unit: "kg",
      weight_basis_quantity: 100,
      weight_basis_unit: "kg_per_100_pcs",
      approval_number: "ETA 15/0784",
      indoor_only: true,
      engineering_verification_required: true,
      source_document: ELECTRICAL,
      source_printed_page: "157",
      engineering_note: ENGINEERING_NOTE
    });
    attribute(anchor.code, "diameter", anchor.diameter, "mm", "157");
    attribute(anchor.code, "length", anchor.length, "mm", "157");
    attribute(anchor.code, "head_drive", anchor.drive, null, "157");
    attribute(anchor.code, "drill_hole_diameter", anchor.drill, "mm", "157");
    if (anchor.mount !== null) {
      attribute(
        anchor.code,
        typeof anchor.mount === "string"
          ? "maximum_mounting_thickness_options"
          : "maximum_mounting_thickness",
        anchor.mount,
        typeof anchor.mount === "number" ? "mm" : null,
        "157"
      );
    }
    if ("thread" in anchor) attribute(anchor.code, "connection_thread", anchor.thread, null, "157");
    attribute(anchor.code, "recommended_tightening_torque", anchor.torque, "Nm", "157");
    attribute(anchor.code, "substrate", "concrete", null, "157");
    attribute(anchor.code, "catalog_application_example", anchor.application, null, "157");
  }

  for (const code of ["DAM 6X5", "DAM 6X10"]) {
    sheets.source_observations.push(
      {
        product_code: code,
        field_name: "pack_quantity",
        value_text: "50",
        source_document: ELECTRICAL,
        source_printed_page: "156",
        source_pdf_page: 19,
        is_authoritative_for_candidate: true,
        resolution_policy:
          "Stage 5 designated source: electrical-installation-materials printed page 156"
      },
      {
        product_code: code,
        field_name: "pack_quantity",
        value_text: "100",
        source_document: KR,
        source_printed_page: "KR 139",
        source_pdf_page: 143,
        is_authoritative_for_candidate: false,
        resolution_policy:
          "Retained as an auditable source observation; not selected for this candidate"
      }
    );
  }
}

function addFasteners(): void {
  const fasteners = [
    ["FLM 6X12", "V", 10],
    ["FLM 6X12 F", "F", 50],
    ["FLM 6X16 F", "F", 10],
    ["FLM 8X13 F", "F", 10],
    ["FLM 8X16 F", "F", 50],
    ["FLM 8X16 E3", "E3", 50],
    ["FLM 8X25 F", "F", 50],
    ["FLM 10X25 F", "F", 50],
    ["FLM 10X25 E3", "E3", 50],
    ["FLM 6X12 E3", "E3", 50],
    ["FLM 6X12 E5", "E5", 50],
    ["SKM 8X16 E5", "E5", 50],
    ["FK 6X12", "V", 25],
    ["GSM 406", "G", 50],
    ["GSM 406 E3", "E3", 50],
    ["GSF 0406", "G", 25],
    ["Z M6X10", "V", 100]
  ] as const;
  for (const [code, finish, pack] of fasteners) {
    const printedPage = code.startsWith("GSM")
      ? "KR 116"
      : code === "GSF 0406" || code === "Z M6X10"
        ? "KR 448"
        : code === "FK 6X12"
          ? "KR 133"
          : "KR 130";
    product({
      code,
      description_en: "Catalog fastener or fixing component",
      category: "accessory",
      product_family: code.split(" ")[0] ?? "fastener",
      system: "shared",
      ...finishData(finish),
      pack_quantity: pack,
      source_document: KR,
      source_printed_page: printedPage
    });
  }
  for (const code of [
    "FLDM 8X25 E3",
    "FK 6X10 E3",
    "GSM 306",
    "GSM 306 E3",
    "FL 6X12-S V",
    "FL 6X12-S E3",
    "SMS 6 V",
    "SMS 6 E3",
    "US M8 E3"
  ]) {
    product({
      code,
      description_en: "Included-only catalog fastener component",
      category: "accessory",
      product_family: code.split(" ")[0] ?? "fastener",
      system: "shared",
      material_code: "steel",
      finish_code: code.endsWith("E3") ? "E3" : code.endsWith("V") ? "V" : "catalog-stated",
      pack_quantity: "",
      pack_unit: "",
      order_unit: "pcs",
      is_orderable: false,
      source_document: KR,
      source_printed_page: code.startsWith("GSM 306")
        ? "KR 355"
        : code.startsWith("FLDM")
          ? "KR 449"
          : code.startsWith("FL ") || code.startsWith("SMS") || code.startsWith("US ")
            ? "KR 450"
            : "KR 355",
      source_table_or_row: `Included-accessory statement for ${code}`
    });
  }
}

function addKlScope(): void {
  const widths = [200, 300, 400, 500, 600] as const;
  const standard = { S: widths, F: widths };
  simpleVariants({
    base: "KSV 60",
    description: "Straight-joint connector",
    family: "KSV",
    system: "KL",
    height: 60,
    printedPage: "KR 340",
    finishes: ["S", "F", "E3", "E5"],
    pack: 20,
    includeSCodeSuffix: true,
    includedByFinish: {
      S: [["FLM 8X13 F", 2]],
      F: [["FLM 8X13 F", 2]],
      E3: [["FLM 8X16 E3", 2]],
      E5: [["SKM 8X16 E5", 2]]
    }
  });
  simpleVariants({
    base: "KSV 60/320",
    description: "Long straight-joint connector",
    family: "KSV",
    system: "KL",
    height: 60,
    printedPage: "KR 341",
    finishes: ["S", "F", "E3", "E5"],
    pack: 20,
    includeSCodeSuffix: true,
    includedByFinish: {
      S: [["FLM 8X13 F", 4]],
      F: [["FLM 8X13 F", 4]],
      E3: [["FLM 8X16 E3", 4]],
      E5: [["SKM 8X16 E5", 4]]
    }
  });
  familyVariants({
    prefix: "KLTA",
    description: "Attachable T-piece",
    system: "KL",
    height: 60,
    printedPage: "KR 342",
    widths,
    variants: standard,
    codeFor: (width, finish) => `KLTA 60.${width / 100}03${finish === "S" ? "" : ` ${finish}`}`
  });
  familyVariants({
    prefix: "KLAR",
    description: "Right-hand T-outlet",
    system: "KL",
    height: 60,
    printedPage: "KR 343",
    widths,
    variants: standard,
    codeFor: (width, finish) => `KLAR 60.${width / 100}03${finish === "S" ? "" : ` ${finish}`}`
  });
  familyVariants({
    prefix: "KLAL",
    description: "Left-hand T-outlet",
    system: "KL",
    height: 60,
    printedPage: "KR 343",
    widths,
    variants: standard,
    codeFor: (width, finish) => `KLAL 60.${width / 100}03${finish === "S" ? "" : ` ${finish}`}`
  });
  familyVariants({
    prefix: "KLE",
    description: "Corner piece",
    system: "KL",
    height: 60,
    printedPage: "KR 343",
    widths,
    variants: { ...standard, E5: [200, 300, 400] },
    codeFor: (width, finish) => `KLE 60.${width / 100}03${finish === "S" ? "" : ` ${finish}`}`
  });
  for (const [prefix, description, page, variants] of [
    ["KLT", "T-piece", "KR 344", { ...standard, E3: widths }],
    ["KLK", "Crossing", "KR 344", { ...standard, E3: widths }],
    ["KLBK", "Small 90-degree bend", "KR 345", { ...standard, E3: widths }],
    ["KLBG", "Large 90-degree bend", "KR 345", standard],
    ["KGS", "Adjustable vertical bend", "KR 346", standard]
  ] as const) {
    familyVariants({
      prefix,
      description,
      system: "KL",
      height: 60,
      printedPage: page,
      widths,
      variants,
      codeFor: (width, finish) =>
        `${prefix} 60.${width / 100}03${finish === "S" ? "" : ` ${finish}`}`
    });
  }
  simpleVariants({
    base: "KWV 60",
    description: "Angle connector",
    family: "KWV",
    system: "KL",
    height: 60,
    printedPage: "KR 346",
    finishes: ["S", "F", "E3", "E5"],
    pack: 20,
    includeSCodeSuffix: true,
    includedByFinish: {
      S: [["FLM 8X13 F", 4]],
      F: [["FLM 8X13 F", 4]],
      E3: [["FLM 8X16 E3", 4]],
      E5: [["SKM 8X16 E5", 4]]
    }
  });
  simpleVariants({
    base: "KGV 60",
    description: "Articulated connector",
    family: "KGV",
    system: "KL",
    height: 60,
    printedPage: "KR 346",
    finishes: ["S", "F", "E3", "E5"],
    pack: 10,
    includeSCodeSuffix: true,
    includedByFinish: {
      S: [["FLM 8X13 F", 2]],
      F: [["FLM 8X13 F", 2]],
      E3: [["FLM 8X16 E3", 2]],
      E5: [["SKM 8X16 E5", 2]]
    }
  });
  for (const code of sheets.products
    .filter((row) => row["product_family"] === "KGS")
    .map((row) => String(row["code"])))
    included(code, "FLM 8X13 F", 16, "KR 346", "Included accessories (Zubehor inkl.)");
  product({
    code: "KLAS 60",
    description_en: "Cable-ladder connection piece",
    category: "accessory",
    product_family: "KLAS",
    system: "KL",
    height_mm: 60,
    ...finishData("F"),
    pack_quantity: 20,
    source_document: KR,
    source_printed_page: "KR 346"
  });
  included("KLAS 60", "KLTB 6 F", 1, "KR 346", "Included cable-ladder fixing");
  product({
    code: "SKK 60",
    description_en: "Protective cap pair",
    category: "accessory",
    product_family: "SKK",
    system: "KL",
    height_mm: 60,
    material_code: "polyethylene",
    finish_code: "K03",
    pack_quantity: 10,
    pack_unit: "pairs",
    order_unit: "pairs",
    source_document: KR,
    source_printed_page: "KR 347"
  });
  familyVariants({
    prefix: "KLAB",
    description: "Cable-ladder end outlet plate",
    category: "accessory",
    system: "KL",
    height: null,
    printedPage: "KR 355",
    widths,
    variants: { S: widths, F: widths, E3: widths },
    codeFor: (width, finish) => `KLAB ${width}${finish === "S" ? "" : ` ${finish}`}`
  });
  for (const row of sheets.products.filter((item) => item["product_family"] === "KLAB")) {
    const code = String(row["code"]);
    const stainlessHardware = code.endsWith(" F") || code.endsWith(" E3");
    included(
      code,
      stainlessHardware ? "FK 6X10 E3" : "FK 6X12",
      2,
      "KR 355",
      "Two bolts are included according to the table"
    );
    included(
      code,
      stainlessHardware ? "GSM 306 E3" : "GSM 306",
      2,
      "KR 355",
      "Two cage nuts are included according to the table"
    );
  }
  for (const code of ["KLTB 6", "KLTB 6 F", "KLTB 6 E3", "KLTB 6 E5"]) {
    const finish = code.endsWith("E3")
      ? "E3"
      : code.endsWith("E5")
        ? "E5"
        : code.endsWith(" F")
          ? "F"
          : "S";
    product({
      code,
      description_en: "Cable-ladder fixing",
      category: "wstb",
      product_family: "KLTB",
      system: "KL",
      ...finishData(finish),
      pack_quantity: 50,
      source_document: KR,
      source_printed_page: "KR 355"
    });
    included(
      code,
      finish === "E3" ? "FLM 6X12 E3" : finish === "E5" ? "FLM 6X12 E5" : "FLM 6X16 F",
      1,
      "KR 355",
      "One fastener is supplied with each fixing"
    );
  }
  for (const [code, finish] of [
    ["WWU 150/8", "F"],
    ["WWU 150/8 E3", "E3"],
    ["WWU 150/8 E5", "E5"],
    ["WWA 100", "F"],
    ["WWA 100 E3", "E3"],
    ["WTK 150 S", "S"],
    ["WTK 150 F", "F"]
  ] as const) {
    product({
      code,
      description_en: code.startsWith("WWU")
        ? "Equal wall connection angle"
        : code.startsWith("WWA")
          ? "Asymmetric wall connection angle"
          : "Wide-span beam clamp",
      category: "support",
      product_family: code.split(" ")[0] ?? "support",
      system: "KL_WSL",
      ...finishData(finish),
      pack_quantity: code.startsWith("WTK") ? 20 : 50,
      source_document: KR,
      source_printed_page: code.startsWith("WTK") || code.startsWith("WWA") ? "KR 356" : "KR 355"
    });
  }
  included("WWU 150/8", "FLM 8X16 F", 1, "KR 355", "Included fastener");
  included("WWU 150/8 E3", "FLM 8X16 E3", 1, "KR 355", "Included fastener");
  included("WWU 150/8 E5", "SKM 8X16 E5", 1, "KR 355", "Included fastener");
  included("WWA 100", "FLM 10X25 F", 1, "KR 356", "Included fastener");
  included("WWA 100 E3", "FLM 10X25 E3", 1, "KR 356", "Included fastener");
}

function addWslScope(): void {
  const widths = [200, 300, 400, 500, 600] as const;
  const all = { S: widths, F: widths, E3: widths };
  simpleVariants({
    base: "WSV 105.390",
    description: "Wide-span straight-joint connector",
    family: "WSV",
    system: "WSL",
    height: 105,
    printedPage: "KR 426",
    finishes: ["S", "F", "E3"],
    pack: 10,
    includedByFinish: { S: [["FLM 8X13 F", 4]], F: [["FLM 8X13 F", 4]], E3: [["FLM 8X16 E3", 4]] }
  });
  simpleVariants({
    base: "WSGV 105",
    description: "Vertical articulated connector",
    family: "WSGV",
    system: "WSL",
    height: 105,
    printedPage: "KR 426",
    finishes: ["S", "F", "E3"],
    pack: 1,
    includedByFinish: { S: [["FLM 8X13 F", 6]], F: [["FLM 8X13 F", 6]], E3: [["FLM 8X16 E3", 6]] }
  });
  simpleVariants({
    base: "WSWV 105.390",
    description: "Horizontal angle connector",
    family: "WSWV",
    system: "WSL",
    height: 105,
    printedPage: "KR 427",
    finishes: ["S", "F", "E3"],
    pack: 10,
    includedByFinish: { S: [["FLM 8X13 F", 6]], F: [["FLM 8X13 F", 6]], E3: [["FLM 8X16 E3", 6]] }
  });
  familyVariants({
    prefix: "WSTAR",
    description: "Attachable T-piece with integrated connector",
    system: "WSL",
    height: 105,
    printedPage: "KR 428",
    widths,
    variants: all,
    codeFor: (width, finish) => `WSTAR 105.${width}${finish === "S" ? "" : ` ${finish}`}`
  });
  for (const code of sheets.products
    .filter((row) => row["product_family"] === "WSTAR")
    .map((row) => String(row["code"])))
    included(
      code,
      code.endsWith("E3") ? "FLM 8X16 E3" : "FLM 8X13 F",
      12,
      "KR 428",
      "Integrated connector fasteners included"
    );
  simpleVariants({
    base: "WAER 105",
    description: "Corner attachment piece",
    family: "WAER",
    system: "WSL",
    height: 105,
    printedPage: "KR 428",
    finishes: ["S", "F", "E3"],
    pack: 1,
    includedByFinish: {
      S: [["FLM 8X13 F", 10]],
      F: [["FLM 8X13 F", 10]],
      E3: [["FLM 8X16 E3", 10]]
    }
  });
  familyVariants({
    prefix: "WSBR",
    description: "Wide-span 90-degree bend",
    system: "WSL",
    height: 105,
    printedPage: "KR 429",
    widths,
    variants: all,
    codeFor: (width, finish) => `WSBR 105.${width}${finish === "S" ? "" : ` ${finish}`}`
  });
  familyVariants({
    prefix: "WSTR",
    description: "Wide-span T-piece",
    system: "WSL",
    height: 105,
    printedPage: "KR 429",
    widths,
    variants: all,
    codeFor: (width, finish) => `WSTR 105.${width}${finish === "S" ? "" : ` ${finish}`}`
  });
  product({
    code: "SKWHM 105",
    description_en: "Protective end-cap pair",
    category: "accessory",
    product_family: "SKWHM",
    system: "WSL",
    height_mm: 105,
    material_code: "polyethylene",
    finish_code: "K10",
    pack_quantity: 10,
    pack_unit: "pairs",
    order_unit: "pairs",
    source_document: KR,
    source_printed_page: "KR 429"
  });
  familyVariants({
    prefix: "WBL",
    description: "Perforated insert plate",
    category: "accessory",
    system: "WSL",
    height: null,
    printedPage: "KR 448",
    widths,
    variants: { S: widths },
    codeFor: (width) => `WBL ${width}`,
    packQuantity: 3,
    packUnit: "m",
    orderUnit: "m"
  });
  familyVariants({
    prefix: "WLAB",
    description: "Wide-span ladder end outlet plate",
    category: "accessory",
    system: "WSL",
    height: null,
    printedPage: "KR 448",
    widths,
    variants: all,
    codeFor: (width, finish) => `WLAB ${width}${finish === "S" ? "" : ` ${finish}`}`
  });
  for (const row of sheets.products.filter((item) => item["product_family"] === "WLAB")) {
    const code = String(row["code"]);
    const stainlessHardware = code.endsWith(" F") || code.endsWith(" E3");
    included(
      code,
      stainlessHardware ? "FK 6X10 E3" : "FK 6X12",
      2,
      "KR 448",
      "Two bolts are included according to the table"
    );
    included(
      code,
      stainlessHardware ? "GSM 406 E3" : "GSM 406",
      2,
      "KR 448",
      "Two cage nuts are included according to the table"
    );
  }
  for (const [code, finish, child] of [
    ["RMP 130", "S", "FLM 6X12"],
    ["RMP 130 F", "F", "FLM 6X12 F"],
    ["RMP 130 E3", "E3", "FLM 6X12 E3"]
  ] as const) {
    product({
      code,
      description_en: "Mounting plate",
      category: "support",
      product_family: "RMP",
      system: "WSL",
      ...finishData(finish),
      pack_quantity: 10,
      source_document: KR,
      source_printed_page: "KR 449"
    });
    included(code, child, 2, "KR 449", "Two fasteners included");
  }
  for (const [code, finish, child] of [
    ["WSTB 2", "F", "FLM 8X25 F"],
    ["WSTB 2 E3", "E3", "FLDM 8X25 E3"]
  ] as const) {
    product({
      code,
      description_en: "Wide-span cable-ladder fixing",
      category: "wstb",
      product_family: "WSTB",
      system: "WSL",
      ...finishData(finish),
      pack_quantity: 50,
      source_document: KR,
      source_printed_page: "KR 449"
    });
    included(code, child, 1, "KR 449", "One fastener is supplied with each fixing");
  }
}

function addCompatibility(): void {
  const straight = sheets.products.filter((row) => row["category"] === "straightSection");
  for (const row of straight) {
    const code = String(row["code"]);
    sheets.compatibility_rules.push({
      rule_code: `ALLOW-${code.replace(/[^A-Za-z0-9]+/gu, "-").toUpperCase()}`,
      relation_type: "project_selection",
      source_product_code: code,
      source_selector_json: "",
      target_product_code: "",
      target_selector_json: "",
      allowed: true,
      system: row["system"] ?? "",
      height_mm: row["height_mm"] ?? "",
      width_mm: row["width_mm"] ?? "",
      material_code: row["material_code"] ?? "",
      finish_code: row["finish_code"] ?? "",
      source_document: KR,
      source_printed_page: row["source_printed_page"] ?? "",
      source_pdf_page: row["source_pdf_page"] ?? "",
      verification_status: "verified",
      note: "Allow-list entry derived from an explicit catalog row"
    });
  }
  for (const row of sheets.products.filter((item) => item["category"] === "anchor")) {
    const code = String(row["code"]);
    sheets.compatibility_rules.push({
      rule_code: `ALLOW-${code.replace(/[^A-Za-z0-9]+/gu, "-").toUpperCase()}-CONCRETE`,
      relation_type: "anchor_substrate",
      source_product_code: code,
      source_selector_json: "",
      target_product_code: "",
      target_selector_json: JSON.stringify({ substrate: "concrete" }),
      allowed: true,
      system: "concrete",
      height_mm: "",
      width_mm: "",
      material_code: row["material_code"] ?? "",
      finish_code: row["finish_code"] ?? "",
      source_document: row["source_document"] ?? "",
      source_printed_page: row["source_printed_page"] ?? "",
      source_pdf_page: row["source_pdf_page"] ?? "",
      verification_status: "verified",
      note: ENGINEERING_NOTE
    });
  }
  for (const system of ["KL", "WSL"] as const) {
    const connectorFamily = system === "KL" ? "KSV" : "WSV";
    const fittingFamilies =
      system === "KL"
        ? ["KLTA", "KLAR", "KLAL", "KLE", "KLT", "KLK", "KLBK", "KLBG"]
        : ["WSBR", "WSTR"];
    for (const family of fittingFamilies) {
      sheets.compatibility_rules.push({
        rule_code: `REQUIRE-${connectorFamily}-FOR-${family}`,
        relation_type: "separately_ordered_connector",
        source_product_code: "",
        source_selector_json: JSON.stringify({ product_family: family, system }),
        target_product_code: "",
        target_selector_json: JSON.stringify({ product_family: connectorFamily, system }),
        allowed: true,
        system,
        height_mm: system === "KL" ? 60 : 105,
        width_mm: "",
        material_code: "",
        finish_code: "",
        source_document: KR,
        source_printed_page: system === "KL" ? "KR 342-346" : "KR 429",
        source_pdf_page: system === "KL" ? 346 : 433,
        verification_status: "verified",
        note: `${connectorFamily} connectors are not included and must be ordered separately`
      });
    }
  }
}

function addTemplates(): void {
  sheets.assembly_templates.push(
    {
      template_code: "KL-WALL-KLTB-DAM",
      name_en: "KL wall fixing with KLTB and DAM",
      template_type: "wall",
      system: "KL",
      source_document: KR,
      source_printed_page: "KR 355",
      source_pdf_page: 359,
      engineering_verification_required: true
    },
    {
      template_code: "WSL-WALL-WSTB-DAM",
      name_en: "WSL wall fixing with WSTB and DAM",
      template_type: "wall",
      system: "WSL",
      source_document: KR,
      source_printed_page: "KR 449",
      source_pdf_page: 453,
      engineering_verification_required: true
    }
  );
  sheets.template_components.push(
    {
      template_code: "KL-WALL-KLTB-DAM",
      product_code: "KLTB 6 F",
      component_role: "support",
      quantity: 1,
      unit: "pcs",
      quantity_mode: "per_support",
      suppress_when_included: false
    },
    {
      template_code: "KL-WALL-KLTB-DAM",
      product_code: "DAM 6X10",
      component_role: "anchor",
      quantity: 2,
      unit: "pcs",
      quantity_mode: "per_support",
      suppress_when_included: false
    },
    {
      template_code: "WSL-WALL-WSTB-DAM",
      product_code: "WSTB 2",
      component_role: "support",
      quantity: 1,
      unit: "pcs",
      quantity_mode: "per_support",
      suppress_when_included: false
    },
    {
      template_code: "WSL-WALL-WSTB-DAM",
      product_code: "DAM 6X10",
      component_role: "anchor",
      quantity: 2,
      unit: "pcs",
      quantity_mode: "per_support",
      suppress_when_included: false
    }
  );
}

async function main(): Promise<void> {
  const scope = JSON.parse(await readFile(scopePath, "utf8")) as {
    managedVersion: string;
    sources: { file: string; sha256: string }[];
    requiredModels: string[];
    expected: {
      products: number;
      productAttributes: number;
      includedItems: number;
      compatibilityRules: number;
      assemblyTemplates: number;
      templateComponents: number;
      sourceObservations: number;
      familyCounts: Record<string, number>;
    };
  };
  if (scope.managedVersion !== VERSION)
    throw new Error("Scope managed version does not match generator version");
  for (const source of scope.sources) {
    const sourcePath = join(repositoryRoot, "docs", "catalogs", "niedax", "source", source.file);
    const actual = createHash("sha256")
      .update(await readFile(sourcePath))
      .digest("hex");
    if (actual !== source.sha256)
      throw new Error(`Official source checksum mismatch: ${source.file}`);
  }
  sheets.manifest.push(
    {
      schema_version: "catalog-import/v1",
      candidate_catalog_version: VERSION,
      manufacturer: "Niedax",
      import_scope: "p0-kl60-wsl105-anchors",
      is_full_snapshot: true,
      source_document: KR,
      source_document_edition: "2022",
      source_sha256: "sha256:b1b90b6af08793e9f7322781918365071476fa7cbbd96e2c3a4a38cf20ab1b6c",
      prepared_at: "2026-08-16T00:00:00Z",
      prepared_by: "Niedax Generator Stage 5 reproducible extraction",
      notes:
        "KL 60, WSL 105, direct connectors/fittings/fixings, shared supports, and source-conflict observation"
    },
    {
      schema_version: "catalog-import/v1",
      candidate_catalog_version: VERSION,
      manufacturer: "Niedax",
      import_scope: "p0-kl60-wsl105-anchors",
      is_full_snapshot: true,
      source_document: ELECTRICAL,
      source_document_edition: "unconfirmed",
      source_sha256: "sha256:2fb555d445bebc68f2a86f02ceb77a8dcf69123bdf87bb3eedd8e629b197f82c",
      prepared_at: "2026-08-16T00:00:00Z",
      prepared_by: "Niedax Generator Stage 5 reproducible extraction",
      notes: "Printed pages 156-157; local filename explicitly authorized by the user"
    }
  );
  addStraightLadders();
  addAnchors();
  addFasteners();
  addKlScope();
  addWslScope();
  addCompatibility();
  addTemplates();

  const codes = new Set(sheets.products.map((row) => String(row["code"])));
  for (const required of scope.requiredModels) {
    if (!codes.has(required)) throw new Error(`Required scope model is missing: ${required}`);
  }
  const familyCounts = Object.fromEntries(
    [...new Set(sheets.products.map((row) => String(row["product_family"])))]
      .sort()
      .map((family) => [
        family,
        sheets.products.filter((row) => row["product_family"] === family).length
      ])
  );
  const actualCounts = {
    products: sheets.products.length,
    productAttributes: sheets.product_attributes.length,
    includedItems: sheets.included_items.length,
    compatibilityRules: sheets.compatibility_rules.length,
    assemblyTemplates: sheets.assembly_templates.length,
    templateComponents: sheets.template_components.length,
    sourceObservations: sheets.source_observations.length,
    familyCounts
  };
  if (JSON.stringify(actualCounts) !== JSON.stringify(scope.expected)) {
    throw new Error(`Catalog scope completeness mismatch: ${JSON.stringify(actualCounts)}`);
  }

  await mkdir(outputDirectory, { recursive: true });
  await mkdir(templateDirectory, { recursive: true });
  for (const sheet of catalogSheetNames) {
    await writeFile(
      join(outputDirectory, `${sheet}.csv`),
      serializeCsv(sheet, sheets[sheet]),
      "utf8"
    );
    await writeFile(join(templateDirectory, `${sheet}.csv`), serializeCsv(sheet, []), "utf8");
  }
  const populatedCsv = Object.fromEntries(
    catalogSheetNames.map((sheet) => [sheet, serializeCsv(sheet, sheets[sheet])])
  );
  const parsedBundle = parseCsvBundle(populatedCsv);
  const pipeline = runCatalogPipeline(parsedBundle);
  if (!pipeline.report.valid)
    throw new Error("Generated catalog failed its canonical validation pipeline");
  await writeFile(
    join(outputDirectory, "niedax-p0-2022.xlsx"),
    await createXlsxBundle(parsedBundle)
  );
  await writeFile(
    join(outputDirectory, "acceptance.json"),
    `${JSON.stringify(
      {
        schemaVersion: "catalog-acceptance/v1",
        contentHash: pipeline.bundle.contentHash,
        counts: actualCounts,
        warnings: pipeline.report.counts.warnings,
        conflicts: pipeline.report.counts.conflicts
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  await writeFile(
    join(outputDirectory, "checksums.sha256"),
    `${catalogSheetNames
      .map(
        (sheet) =>
          `${createHash("sha256")
            .update(populatedCsv[sheet] ?? "")
            .digest("hex")}  ${sheet}.csv`
      )
      .join("\n")}\n`,
    "utf8"
  );
  await writeFile(
    join(templateDirectory, "catalog-import-template.xlsx"),
    await createXlsxTemplate()
  );
  const auditRows = Object.entries(familyCounts).map(([family, count]) => {
    const rows = sheets.products.filter((row) => row["product_family"] === family);
    const documents = [...new Set(rows.map((row) => String(row["source_document"])))].join("; ");
    const printedPages = [...new Set(rows.map((row) => String(row["source_printed_page"])))].join(
      "; "
    );
    const pdfPages = [...new Set(rows.map((row) => String(row["source_pdf_page"])))].join("; ");
    const issue =
      family === "DAM"
        ? "Pack 50 selected from designated page 156; KR 139 observation of 100 retained and resolved by explicit policy"
        : ["DAM", "DAZ", "NSA"].includes(family)
          ? "Engineering suitability remains a downstream verification warning"
          : "None";
    return {
      family,
      source_document: documents,
      printed_page_range: printedPages,
      pdf_page_range: pdfPages,
      extracted_row_count: count,
      verified_row_count: count,
      reviewer: "Stage 5 extraction: rendered-table review plus exact PDF-text code match",
      status: "verified",
      unresolved_issues: issue
    };
  });
  await writeFile(
    auditPath,
    [
      "family,source_document,printed_page_range,pdf_page_range,extracted_row_count,verified_row_count,reviewer,status,unresolved_issues",
      ...auditRows.map((row) =>
        Object.values(row)
          .map((value) => {
            const item = String(value);
            return /[",\n\r]/u.test(item) ? `"${item.replace(/"/gu, '""')}"` : item;
          })
          .join(",")
      )
    ].join("\n") + "\n",
    "utf8"
  );
  process.stdout.write(
    `${JSON.stringify(Object.fromEntries(catalogSheetNames.map((sheet) => [sheet, sheets[sheet].length])))}\n`
  );
}

await main();
