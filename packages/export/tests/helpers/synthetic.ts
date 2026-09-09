import { createHash } from "node:crypto";

import inputJson from "../../../calculation-engine/tests/golden/fixtures/all-major-rules-combined.json" with { type: "json" };
import resultJson from "../../../calculation-engine/tests/golden/expected/all-major-rules-combined.json" with { type: "json" };
import {
  buildEnglishExportContextV3,
  EXCEL_RENDERER_VERSION,
  getApprovedWorkbookMapping,
  validateWorkbookMapping
} from "../../src/index.js";

// These positions have no relationship to the missing approved Change Order.
// The fixture exists only to exercise the renderer's explicit mapping mechanism.
const sources = [
  { kind: "text", field: "productCode" },
  { kind: "text", field: "descriptionEn" },
  { kind: "text", field: "unit" },
  { kind: "quantity", field: "technicalQuantity", overflow: "exactText" },
  { kind: "quantity", field: "packageIncrement", overflow: "exactText" },
  { kind: "quantity", field: "orderedQuantity", overflow: "exactText" },
  { kind: "reference", column: 6 },
  { kind: "quantity", field: "totalSpareQuantity", overflow: "exactText" },
  { kind: "quantity", field: "reserveQuantity", overflow: "exactText" },
  { kind: "quantity", field: "reservedQuantity", overflow: "exactText" },
  { kind: "quantity", field: "packagingOverage", overflow: "exactText" },
  { kind: "quantity", field: "packageCount", overflow: "exactText" },
  { kind: "text", field: "category" },
  { kind: "text", field: "status" },
  { kind: "text", field: "remarks" },
  { kind: "text", field: "material" },
  ...Array.from({ length: 13 }, () => ({ kind: "blank" }))
] as const;
const headers = [
  "Synthetic 01: code",
  "Synthetic 02: description",
  "Synthetic 03: unit",
  "Synthetic 04: technical",
  "Synthetic 05: increment",
  "Synthetic 06: ordered",
  "Synthetic 07: reference",
  "Synthetic 08: spare",
  "Synthetic 09: reserve",
  "Synthetic 10: reserved",
  "Synthetic 11: overage",
  "Synthetic 12: packages",
  "Synthetic 13: category",
  "Synthetic 14: status",
  "Synthetic 15: remarks",
  "Synthetic 16: absent material",
  ...Array.from({ length: 13 }, (_, index) => `Synthetic ${index + 17}: blank`)
];

export const syntheticMapping = validateWorkbookMapping({
  schemaVersion: "excel-workbook-mapping/v1",
  approval: "syntheticTestOnly",
  templateId: "synthetic-test-layout-NOT-APPROVED",
  templateSha256: `sha256:${createHash("sha256").update("Synthetic test layout only; no approved template supplied.").digest("hex")}`,
  mappingVersion: "synthetic-test-1",
  rendererVersion: EXCEL_RENDERER_VERSION,
  headerRow: 4,
  dataStartRow: 5,
  columns: sources.map((source, index) => ({
    position: index + 1,
    header: headers[index],
    meaning: "Synthetic renderer test position; not an approved product mapping.",
    compatibility:
      index === 16 ? "sap" : index === 17 ? "price" : index === 18 ? "totalPrice" : "ordinary",
    source,
    width: [1, 14].includes(index) ? 55 : 18,
    numberFormat:
      source.kind === "quantity" || source.kind === "reference" ? "0.##################" : "@"
  }))
});

function checksum(value: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

export function syntheticContextInput() {
  const projectId = "10000000-0000-4000-8000-000000000001";
  const actor = {
    id: "10000000-0000-4000-8000-000000000002",
    username: "synthetic.designer",
    displayName: "Synthetic Designer",
    role: "designer"
  };
  const timestamp = "2026-09-09T08:00:00.000Z";
  const input = structuredClone(inputJson);
  input.project.id = projectId;
  input.invocation.calculationRunId = "10000000-0000-4000-8000-000000000004";
  const result = structuredClone(resultJson);
  result.calculationRunId = input.invocation.calculationRunId;
  const project = {
    id: projectId,
    ownerId: actor.id,
    ownerDisplayName: actor.displayName,
    status: "draft",
    draftVersion: 5,
    createdAt: timestamp,
    updatedAt: timestamp,
    code: "SYNTHETIC-EX-09",
    name: "Synthetic control project — not a customer order",
    description:
      "Saved Stage 6 all-major-rules-combined evidence. Synthetic project header and export lifecycle.",
    defaultLocale: "bg",
    defaultReservePercent: input.project.defaultReservePercent,
    cableLoad: input.project.cableLoad,
    routes: [],
    connections: [],
    accessoryProductIds: [],
    manualItems: []
  };
  const snapshot = {
    schemaVersion: "project-revision-snapshot/v2",
    project,
    calculationInput: input,
    calculationResult: result
  };
  return {
    schemaVersion: "english-export-context/v3",
    language: "en",
    capturedAt: timestamp,
    revision: {
      id: "10000000-0000-4000-8000-000000000003",
      projectId,
      revisionNumber: 1,
      name: "Synthetic control revision",
      comment: "Isolated renderer fixture only.",
      authorSnapshot: actor,
      createdAt: timestamp,
      sourceDraftVersion: 5,
      status: "calculated",
      checkedAt: null,
      approvedAt: null
    },
    lifecycle: [
      {
        action: "revision.saved",
        occurredAt: timestamp,
        actorSnapshot: actor,
        comment: "Isolated renderer fixture only.",
        priorStatus: null,
        resultingStatus: "calculated"
      }
    ],
    snapshot,
    checksums: {
      projectChecksum: checksum(project),
      inputChecksum: checksum(input),
      snapshotChecksum: checksum(snapshot),
      resultChecksum: checksum(result),
      bomChecksum: checksum(result.bomLines),
      warningsChecksum: checksum(result.warnings),
      revisionChecksum: checksum({ synthetic: true, snapshot })
    },
    versions: {
      templateId: syntheticMapping.templateId,
      templateSha256: syntheticMapping.templateSha256,
      mappingVersion: syntheticMapping.mappingVersion,
      rendererVersion: syntheticMapping.rendererVersion
    }
  };
}

export function syntheticContext() {
  return buildEnglishExportContextV3(syntheticContextInput());
}

export function approvedTemplateControlContext() {
  const mapping = getApprovedWorkbookMapping()!;
  return buildEnglishExportContextV3({
    ...syntheticContextInput(),
    versions: {
      templateId: mapping.templateId,
      templateSha256: mapping.templateSha256,
      mappingVersion: mapping.mappingVersion,
      rendererVersion: mapping.rendererVersion
    }
  });
}
