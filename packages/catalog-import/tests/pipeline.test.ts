import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

import {
  exportValidationIssuesCsv,
  isCompatible,
  parseCsvBundle,
  parseXlsx,
  runCatalogPipeline,
  suppressIncludedComponents,
  type CatalogPipelineResult,
  type CatalogSheetName,
  type ParsedCatalogBundle
} from "../src/index.js";

const fixtureDirectory = fileURLToPath(
  new URL("../../../catalogue/imports/niedax-p0-2022/", import.meta.url)
);
const sheets = [
  "manifest",
  "products",
  "product_attributes",
  "included_items",
  "compatibility_rules",
  "assembly_templates",
  "template_components",
  "source_observations"
] as const satisfies readonly CatalogSheetName[];

let parsed: ParsedCatalogBundle;
let result: CatalogPipelineResult;

function copy(): ParsedCatalogBundle {
  return structuredClone(parsed);
}

function product(code: string) {
  const found = result.bundle.products.find((item) => item.code === code);
  if (!found) throw new Error(`Fixture product not found: ${code}`);
  return found;
}

beforeAll(async () => {
  const csv = Object.fromEntries(
    await Promise.all(
      sheets.map(async (sheet) => [
        sheet,
        await readFile(`${fixtureDirectory}${sheet}.csv`, "utf8")
      ])
    )
  );
  parsed = parseCsvBundle(csv);
  result = runCatalogPipeline(parsed);
});

describe("canonical Stage 5 import", () => {
  it("normalizes the CSV and populated XLSX representations identically", async () => {
    const workbook = await parseXlsx(
      await readFile(`${fixtureDirectory}niedax-p0-2022.xlsx`),
      "niedax-p0-2022.xlsx"
    );
    const xlsx = runCatalogPipeline(workbook);
    expect(xlsx.report.valid).toBe(true);
    expect(xlsx.bundle.contentHash).toBe(result.bundle.contentHash);
    expect(xlsx.bundle).toEqual(result.bundle);
  });

  it("has stable acceptance counts and a deterministic semantic checksum", () => {
    expect(result.report.valid).toBe(true);
    expect(result.bundle.contentHash).toBe(
      "sha256:ab420723a0c2d143a2c1adf6dabd9e10932ebbf23310292d9941f93253bfe115"
    );
    expect({
      products: result.bundle.products.length,
      attributes: result.bundle.productAttributes.length,
      included: result.bundle.includedItems.length,
      compatibility: result.bundle.compatibilityRules.length,
      templates: result.bundle.assemblyTemplates.length,
      components: result.bundle.templateComponents.length,
      observations: result.bundle.sourceObservations.length
    }).toEqual({
      products: 308,
      attributes: 87,
      included: 128,
      compatibility: 57,
      templates: 2,
      components: 4,
      observations: 4
    });
    expect(runCatalogPipeline(parsed).bundle.contentHash).toBe(result.bundle.contentHash);
  });

  it("normalizes decimal commas while retaining weight values and bases", () => {
    const candidate = copy();
    const row = candidate.sheets.products.find((item) => item["code"] === "DAM 6X5");
    if (!row) throw new Error("DAM fixture row missing");
    (row as Record<string, string>)["weight_value"] = "1,38";
    const normalized = runCatalogPipeline(candidate);
    expect(normalized.report.valid).toBe(true);
    expect(normalized.bundle.products.find((item) => item.code === "DAM 6X5")).toMatchObject({
      weightValue: 1.38,
      weightUnit: "kg",
      weightBasisQuantity: 100,
      weightBasisUnit: "kg_per_100_pcs"
    });
  });

  it("round-trips exact model codes with spaces, dots, slashes, and suffixes", () => {
    for (const code of ["DAM 6X5", "NSA 7.5X50/FKG-T30 V", "WSV 105.390 E3", "KSV 60/320 E5"]) {
      expect(product(code).code).toBe(code);
    }
    expect(product("KSV 60 S").code).toBe("KSV 60 S");
    expect(result.bundle.products.some((item) => item.code === "KSV 60")).toBe(false);
  });

  it("imports every mandatory anchor with official pack quantity and policy", () => {
    const expected = new Map([
      ["DAM 6X5", 50],
      ["DAM 6X10", 50],
      ["DAZ 8X10", 50],
      ["DAZ 10X10", 50],
      ["DAZ 12X10", 20],
      ["DAZ 10X30", 25],
      ["DAZ 16X25", 10],
      ["NSA 6X35/FKK-T30 V", 100],
      ["NSA 6X50/FKK-T30 V", 100],
      ["NSA 6X55/SW10-M6 V", 100],
      ["NSA 7.5X40/FKG-T30 V", 100],
      ["NSA 7.5X50/FKG-T30 V", 100]
    ]);
    expect(result.bundle.products.filter((item) => item.category === "anchor")).toHaveLength(12);
    for (const [code, packQuantity] of expected) {
      expect(product(code)).toMatchObject({
        packQuantity,
        packUnit: "pcs",
        engineeringVerificationRequired: true
      });
    }
    for (const anchor of result.bundle.products.filter((item) => item.productFamily === "NSA")) {
      expect(anchor).toMatchObject({
        indoorOnly: true,
        system: "concrete",
        engineeringVerificationRequired: true
      });
      expect(anchor.engineeringNote).toContain("ETA");
    }
  });

  it("keeps and explicitly resolves both official DAM pack observations", () => {
    expect(
      result.bundle.sourceObservations.filter((item) => item.productCode === "DAM 6X5")
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ valueText: "50", isAuthoritativeForCandidate: true }),
        expect.objectContaining({ valueText: "100", isAuthoritativeForCandidate: false })
      ])
    );
    expect(result.report.issues).toContainEqual(
      expect.objectContaining({
        code: "SOURCE_CONFLICT_RESOLVED",
        productCode: "DAM 6X5",
        severity: "warning"
      })
    );
    expect(product("DAM 6X5").packQuantity).toBe(50);
  });

  it("covers each catalog-listed finish for KL 60 and WSL 105 straight ladders", () => {
    const finishSet = (family: string) =>
      new Set(
        result.bundle.products
          .filter((item) => item.productFamily === family)
          .map((item) => item.finishCode)
      );
    expect(finishSet("KL")).toEqual(new Set(["S", "F", "E3", "E5"]));
    expect(finishSet("WSL")).toEqual(new Set(["S", "F", "E3"]));
    for (const family of ["KL", "WSL"]) {
      expect(
        new Set(
          result.bundle.products
            .filter((item) => item.productFamily === family)
            .map((item) => item.widthMm)
        )
      ).toEqual(new Set([200, 300, 400, 500, 600]));
    }
  });
});

describe("catalog validation and allow-list behavior", () => {
  it("rejects impossible project selections at the domain boundary", () => {
    expect(
      isCompatible(result.bundle.compatibilityRules, {
        system: "WSL",
        heightMm: 105,
        widthMm: 200,
        materialCode: "stainless-steel-1.4571",
        finishCode: "E5"
      })
    ).toBe(false);
    expect(
      isCompatible(result.bundle.compatibilityRules, {
        system: "KL",
        heightMm: 60,
        widthMm: 200,
        materialCode: "steel",
        finishCode: "S"
      })
    ).toBe(true);
  });

  it("suppresses supplied fasteners but retains separately ordered connectors", () => {
    expect(
      suppressIncludedComponents(["KSV 60 F", "FLM 8X13 F"], result.bundle.includedItems)
    ).toEqual(["KSV 60 F"]);
    expect(
      result.bundle.includedItems.some(
        (item) =>
          item.parentProductCode.startsWith("KLTA") && item.includedProductCode.startsWith("KSV")
      )
    ).toBe(false);
    expect(result.bundle.compatibilityRules).toContainEqual(
      expect.objectContaining({
        relationType: "separately_ordered_connector",
        sourceSelector: expect.objectContaining({ product_family: "KLTA" })
      })
    );
    expect(
      result.bundle.includedItems.filter((item) => item.parentProductCode === "KLAB 200")
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ includedProductCode: "FK 6X12", quantity: 2 }),
        expect.objectContaining({ includedProductCode: "GSM 306", quantity: 2 })
      ])
    );
    expect(
      result.bundle.includedItems.filter((item) => item.parentProductCode === "WLAB 200 E3")
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ includedProductCode: "FK 6X10 E3", quantity: 2 }),
        expect.objectContaining({ includedProductCode: "GSM 406 E3", quantity: 2 })
      ])
    );
  });

  it("reports unknown included references and non-positive quantities", () => {
    const unknown = copy();
    (unknown.sheets.included_items[0] as Record<string, string>)["included_product_code"] =
      "UNKNOWN COMPONENT";
    expect(runCatalogPipeline(unknown).report.issues).toContainEqual(
      expect.objectContaining({
        code: "UNKNOWN_INCLUDED_PRODUCT",
        sheet: "included_items",
        rowNumber: 2
      })
    );

    for (const quantity of ["0", "-1"]) {
      const invalid = copy();
      (invalid.sheets.included_items[0] as Record<string, string>)["quantity"] = quantity;
      expect(runCatalogPipeline(invalid).report.issues).toContainEqual(
        expect.objectContaining({ code: "INVALID_INCLUDED_ITEM", rowNumber: 2 })
      );
    }
  });

  it("rejects duplicate codes and non-positive order packs", () => {
    const duplicate = copy();
    (duplicate.sheets.products as Record<string, string>[]).push(
      structuredClone(duplicate.sheets.products[0] as Record<string, string>)
    );
    expect(runCatalogPipeline(duplicate).report.issues).toContainEqual(
      expect.objectContaining({ code: "DUPLICATE_PRODUCT_CODE" })
    );

    const zero = copy();
    (zero.sheets.products[0] as Record<string, string>)["pack_quantity"] = "0";
    expect(runCatalogPipeline(zero).report.issues).toContainEqual(
      expect.objectContaining({ code: "INVALID_PACK_QUANTITY", rowNumber: 2 })
    );
  });

  it("limits missing detection to a matching declared full-snapshot scope", () => {
    const activeProduct = result.bundle.products[0];
    if (!activeProduct) throw new Error("Expected acceptance fixture product");
    const candidate = copy();
    (candidate.sheets.products as Record<string, string>[]).splice(0, 1);
    for (const manifest of candidate.sheets.manifest as Record<string, string>[])
      manifest["is_full_snapshot"] = "false";
    expect(
      runCatalogPipeline(candidate, {
        products: [activeProduct],
        completeScopes: ["p0-kl60-wsl105-anchors"]
      }).report.counts.missing
    ).toBe(0);
    for (const manifest of candidate.sheets.manifest as Record<string, string>[])
      manifest["is_full_snapshot"] = "true";
    expect(
      runCatalogPipeline(candidate, {
        products: [activeProduct],
        completeScopes: ["p0-kl60-wsl105-anchors"]
      }).report.diff
    ).toContainEqual(
      expect.objectContaining({ code: activeProduct.code, classification: "missing" })
    );
  });

  it("exports stable error codes with canonical source row references", () => {
    const invalid = copy();
    (invalid.sheets.included_items[0] as Record<string, string>)["quantity"] = "0";
    const report = runCatalogPipeline(invalid).report;
    expect(exportValidationIssuesCsv(report.issues)).toContain(
      "INVALID_INCLUDED_ITEM,included_items,2"
    );
  });
});
