import { describe, expect, it } from "vitest";
import {
  buildEnglishExportContextV3,
  getApprovedWorkbookMapping,
  renderExcelWorkbook
} from "../src/index.js";
import { syntheticContextInput } from "./helpers/synthetic.js";
import { readCells, readParts } from "./helpers/ooxml.js";

describe("saved anchor source facts in English Excel", () => {
  it("preserves indoor-only, substrate and ETA facts as literal saved evidence without recalculating quantities", async () => {
    const input = syntheticContextInput();
    const sourceFacts = {
      indoorOnly: true,
      catalogSubstrate: "concrete",
      approvalNumber: "ETA 15/0784",
      dopNumber: null,
      engineeringNote: "Verify the applicable ETA, installation environment and loads.",
      source: {
        kind: "catalogDocument",
        id: "p0-nsa",
        sourceDocument: "1.-Electrical-installation-materials.pdf",
        sourcePage: "157"
      }
    };
    // Explicit synthetic saved-context setup, not a change to committed engine/golden fixtures.
    input.snapshot.calculationInput.products = input.snapshot.calculationInput.products.map(
      (product) => (product.role === "anchor" ? { ...product, sourceFacts } : product)
    );
    const context = buildEnglishExportContextV3({
      ...input,
      versions: {
        templateId: getApprovedWorkbookMapping()!.templateId,
        templateSha256: getApprovedWorkbookMapping()!.templateSha256,
        mappingVersion: getApprovedWorkbookMapping()!.mappingVersion,
        rendererVersion: getApprovedWorkbookMapping()!.rendererVersion
      }
    });
    sourceFacts.indoorOnly = false;
    sourceFacts.approvalNumber = "Later live source value";
    const output = await renderExcelWorkbook(context, getApprovedWorkbookMapping()!);
    const parts = readParts(output.bytes);
    const details = readCells(parts, 2);
    const evidence = new Map<string, unknown>();
    for (const [address, cell] of details) {
      if (/^D\d+$/u.test(address) && typeof cell.value === "string")
        evidence.set(cell.value, details.get(`E${address.slice(1)}`)?.value);
    }
    const anchorIndex = context.snapshot.calculationInput.products.findIndex(
      (product) => product.role === "anchor"
    );
    const path = `context.snapshot.calculationInput.products[${anchorIndex}].sourceFacts`;
    expect(evidence.get(`${path}.indoorOnly`)).toBe("true");
    expect(evidence.get(`${path}.catalogSubstrate`)).toBe("concrete");
    expect(evidence.get(`${path}.approvalNumber`)).toBe("ETA 15/0784");
    expect(evidence.get(`${path}.dopNumber`)).toBe("null");
    expect(evidence.get(`${path}.source.sourcePage`)).toBe("157");
    const order = readCells(parts, 1);
    for (const [index, line] of context.snapshot.calculationResult.bomLines.entries()) {
      expect(String(order.get(`B${index + 6}`)?.value)).toBe(line.technicalQuantity.value);
      expect(String(order.get(`C${index + 6}`)?.value)).toBe(line.orderedQuantity.value);
    }
    for (const sheet of [1, 2, 3])
      expect([...readCells(parts, sheet).values()].some((cell) => cell.formula !== null)).toBe(
        false
      );
  });
});
