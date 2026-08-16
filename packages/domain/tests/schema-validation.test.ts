import { describe, expect, it } from "vitest";

import {
  ApproveRevisionCommandV1Schema,
  CalculateCommandV1Schema,
  CalculationInputV1Schema,
  CalculationResultV1Schema,
  CatalogImportValidationResultV1Schema,
  CheckRevisionCommandV1Schema,
  ErrorEnvelopeV1Schema,
  ExportRequestV1Schema,
  SaveRevisionCommandV1Schema
} from "../src/index.js";
import {
  representativeCalculationResultV1,
  validCalculationInputV1
} from "./fixtures/calculation-v1.js";

describe("Stage 3 v1 runtime schemas", () => {
  it("accepts a representative plain-JSON calculation input", () => {
    const plainJson: unknown = JSON.parse(JSON.stringify(validCalculationInputV1));
    expect(CalculationInputV1Schema.parse(plainJson)).toEqual(validCalculationInputV1);
  });

  it("rejects invalid discriminators, units, ranges, and missing calculation data", () => {
    const route = validCalculationInputV1.project.routes[0];
    expect(route).toBeDefined();
    if (!route) return;

    const invalid = {
      ...validCalculationInputV1,
      project: {
        ...validCalculationInputV1.project,
        defaultSparePercent: "101",
        routes: [
          {
            ...route,
            geometry: [
              {
                id: "geometry-invalid",
                kind: "curve",
                length: { value: "-1", unit: "ft" }
              }
            ]
          }
        ]
      }
    };

    const parsed = CalculationInputV1Schema.safeParse(invalid);
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.error.issues.map((issue) => issue.path.join("."))).toEqual(
      expect.arrayContaining(["project.defaultSparePercent", "project.routes.0.geometry.0.kind"])
    );

    const missingRoutes = CalculationInputV1Schema.safeParse({
      ...validCalculationInputV1,
      project: { ...validCalculationInputV1.project, routes: [] }
    });
    expect(missingRoutes.success).toBe(false);
    if (!missingRoutes.success) {
      expect(missingRoutes.error.issues[0]?.message).toContain("At least one route");
    }

    const invalidUnit = CalculationInputV1Schema.safeParse({
      ...validCalculationInputV1,
      project: {
        ...validCalculationInputV1.project,
        routes: [
          {
            ...route,
            geometry: [
              {
                id: "geometry-invalid-unit",
                kind: "straight",
                length: { value: "1", unit: "ft" }
              }
            ]
          }
        ]
      }
    });
    expect(invalidUnit.success).toBe(false);
    if (!invalidUnit.success) {
      expect(invalidUnit.error.issues[0]?.path.join(".")).toBe(
        "project.routes.0.geometry.0.length.unit"
      );
    }
  });

  it("rejects unknown object keys at the public boundary", () => {
    expect(
      CalculationInputV1Schema.safeParse({ ...validCalculationInputV1, uiState: "geometry-tab" })
        .success
    ).toBe(false);
  });

  it("preserves the calculation contract through a JSON round trip", () => {
    const parsed = CalculationInputV1Schema.parse(validCalculationInputV1);
    const roundTripped = CalculationInputV1Schema.parse(JSON.parse(JSON.stringify(parsed)));
    expect(roundTripped).toEqual(parsed);
  });

  it("validates catalog and manual BOM variants and representative warnings", () => {
    const result = CalculationResultV1Schema.parse(representativeCalculationResultV1);
    expect(result.bomLines.map((line) => line.kind)).toEqual(["catalog", "manual"]);
    expect(result.warnings.map((warning) => warning.kind)).toEqual(["projectRule", "catalog"]);
    expect(result.bomLines[1]?.warnings[0]?.kind).toBe("manualOverride");
  });

  it("validates public command and error envelope schemas", () => {
    const common = {
      idempotencyKey: "request-0001",
      correlationId: "correlation-0001",
      revisionId: "revision-01",
      inputFingerprint: validCalculationInputV1.invocation.inputFingerprint
    };
    expect(
      CalculateCommandV1Schema.safeParse({
        schemaVersion: "calculate-command/v1",
        idempotencyKey: common.idempotencyKey,
        correlationId: common.correlationId,
        input: validCalculationInputV1
      }).success
    ).toBe(true);
    expect(
      SaveRevisionCommandV1Schema.safeParse({
        schemaVersion: "save-revision-command/v1",
        idempotencyKey: common.idempotencyKey,
        correlationId: common.correlationId,
        projectId: "project-01",
        expectedDraftVersion: 7,
        expectedLatestRevisionNumber: 2,
        calculationRunId: "run-01",
        inputFingerprint: common.inputFingerprint
      }).success
    ).toBe(true);
    expect(
      CheckRevisionCommandV1Schema.safeParse({
        schemaVersion: "check-revision-command/v1",
        ...common,
        expectedStatus: "calculated",
        comment: "Checked against the fixture"
      }).success
    ).toBe(true);
    expect(
      ApproveRevisionCommandV1Schema.safeParse({
        schemaVersion: "approve-revision-command/v1",
        ...common,
        expectedStatus: "checked",
        comment: null
      }).success
    ).toBe(true);
    expect(
      ExportRequestV1Schema.safeParse({
        schemaVersion: "export-request/v1",
        ...common,
        format: "xlsx",
        language: "en"
      }).success
    ).toBe(true);
    expect(
      CatalogImportValidationResultV1Schema.safeParse({
        schemaVersion: "catalog-import-validation-result/v1",
        correlationId: common.correlationId,
        importId: "import-01",
        status: "valid",
        stagedCatalogSnapshot: validCalculationInputV1.catalogSnapshot,
        rowCount: 2,
        validRowCount: 2,
        invalidRowCount: 0,
        issues: []
      }).success
    ).toBe(true);
    expect(
      ErrorEnvelopeV1Schema.safeParse({
        schemaVersion: "error-envelope/v1",
        correlationId: common.correlationId,
        error: {
          code: "VALIDATION_FAILED",
          message: "Request validation failed.",
          details: {
            kind: "validation",
            issues: [{ path: ["project", "routes"], code: "required", message: "Required" }]
          }
        }
      }).success
    ).toBe(true);
  });
});
