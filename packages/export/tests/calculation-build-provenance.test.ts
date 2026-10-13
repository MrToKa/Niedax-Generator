import { describe, expect, it } from "vitest";
import {
  buildEnglishExportContextV3,
  getApprovedWorkbookMapping,
  renderExcelWorkbook
} from "../src/index.js";
import { syntheticContextInput } from "./helpers/synthetic.js";
import { readCells, readParts } from "./helpers/ooxml.js";

describe("original calculation build in immutable English Excel evidence", () => {
  it.each([false, true])(
    "preserves captured calculation provenance or original legacy absence (%s)",
    async (hasBuild) => {
      const fixture = syntheticContextInput();
      const originalInvocation = structuredClone(fixture.snapshot.calculationInput.invocation);
      const applicationBuild = {
        application: "0.1.0",
        gitCommit: "abc12345".repeat(5),
        buildTimestamp: "2026-09-01T07:00:00.000Z",
        environment: "test" as const
      };
      const input = {
        ...fixture,
        snapshot: {
          ...fixture.snapshot,
          calculationInput: {
            ...fixture.snapshot.calculationInput,
            invocation: {
              ...fixture.snapshot.calculationInput.invocation,
              ...(hasBuild ? { applicationBuild } : {})
            }
          }
        }
      };
      const mapping = getApprovedWorkbookMapping()!;
      const context = buildEnglishExportContextV3({
        ...input,
        versions: {
          templateId: mapping.templateId,
          templateSha256: mapping.templateSha256,
          mappingVersion: mapping.mappingVersion,
          rendererVersion: mapping.rendererVersion
        }
      });
      applicationBuild.gitCommit = "def67890".repeat(5);
      const output = await renderExcelWorkbook(context, mapping);
      const details = readCells(readParts(output.bytes), 2);
      const evidence = new Map<string, unknown>();
      for (const [address, cell] of details)
        if (/^D\d+$/u.test(address) && typeof cell.value === "string")
          evidence.set(cell.value, details.get(`E${address.slice(1)}`)?.value);
      const path = "context.snapshot.calculationInput.invocation.applicationBuild";
      if (hasBuild) {
        expect(evidence.get(`${path}.application`)).toBe("0.1.0");
        expect(evidence.get(`${path}.gitCommit`)).toBe("abc12345".repeat(5));
        expect(evidence.get(`${path}.buildTimestamp`)).toBe("2026-09-01T07:00:00.000Z");
        expect(evidence.get(`${path}.environment`)).toBe("test");
      } else {
        expect(context.snapshot.calculationInput.invocation).toEqual(originalInvocation);
        expect([...evidence.keys()].some((key) => key.startsWith(path))).toBe(false);
      }
      expect(evidence.has(`${path}.sourceFingerprint`)).toBe(false);
      expect(context.snapshot.calculationResult).toEqual(fixture.snapshot.calculationResult);
    }
  );
});
