import { describe, expect, it } from "vitest";
import {
  CreateExportRequestV1Schema,
  ExportArtifactV1Schema,
  ExportArtifactV2Schema,
  ExportListResponseV2Schema,
  ExportRequestV1Schema
} from "../src/index.js";

const revisionId = "10000000-0000-4000-8000-000000000001";
const exportId = "10000000-0000-4000-8000-000000000002";
const correlationId = "stage9-contracts";
const request = {
  schemaVersion: "export-request/v1",
  revisionId,
  inputFingerprint: `sha256:${"1".repeat(64)}`,
  format: "xlsx",
  language: "en"
};
const pending = {
  schemaVersion: "export-artifact/v2",
  correlationId,
  revisionId,
  exportId,
  status: "pending",
  format: "xlsx",
  language: "en",
  downloadPath: null,
  contentHash: null,
  contentLength: null,
  fileName: null,
  createdAt: "2026-09-09T12:00:00.000Z",
  failureCode: null,
  expiresAt: null
};
const ready = {
  ...pending,
  status: "ready",
  downloadPath: `/api/v1/exports/${exportId}/download`,
  contentHash: `sha256:${"a".repeat(64)}`,
  contentLength: 4096,
  fileName: "project-revision-1.xlsx"
};

describe("Stage 9 strict export transport", () => {
  it("keeps trusted header fields outside HTTP body and retains the v1 command", () => {
    expect(CreateExportRequestV1Schema.parse(request)).toEqual(request);
    for (const field of ["correlationId", "idempotencyKey", "rows", "status", "path"]) {
      expect(
        CreateExportRequestV1Schema.safeParse({ ...request, [field]: "untrusted" }).success
      ).toBe(false);
    }
    expect(
      ExportRequestV1Schema.safeParse({
        ...request,
        correlationId,
        idempotencyKey: "stage9-request"
      }).success
    ).toBe(true);
    expect(CreateExportRequestV1Schema.safeParse({ ...request, language: "bg" }).success).toBe(
      false
    );
  });

  it("requires durable complete metadata only for ready artifacts", () => {
    expect(ExportArtifactV2Schema.parse(pending)).toEqual(pending);
    expect(ExportArtifactV2Schema.parse(ready)).toEqual(ready);
    expect(
      ExportArtifactV2Schema.safeParse({
        ...pending,
        status: "failed",
        failureCode: "RENDER_FAILED"
      }).success
    ).toBe(true);
    for (const field of ["downloadPath", "contentHash", "contentLength", "fileName"]) {
      expect(ExportArtifactV2Schema.safeParse({ ...ready, [field]: null }).success).toBe(false);
      expect(
        ExportArtifactV2Schema.safeParse({
          ...pending,
          [field]: ready[field as keyof typeof ready]
        }).success
      ).toBe(false);
    }
    expect(ExportArtifactV2Schema.safeParse({ ...pending, status: "failed" }).success).toBe(false);
    expect(
      ExportArtifactV2Schema.safeParse({
        ...ready,
        downloadPath: `/api/v1/exports/${revisionId}/download`
      }).success
    ).toBe(false);
    for (const fileName of [
      "../escape.xlsx",
      ".hidden.xlsx",
      "a\r\nX-Header.xlsx",
      "a/b.xlsx",
      "a\\b.xlsx",
      "a".repeat(180) + ".xlsx"
    ]) {
      expect(ExportArtifactV2Schema.safeParse({ ...ready, fileName }).success).toBe(false);
    }
    expect(ExportArtifactV2Schema.safeParse({ ...ready, bytes: "secret" }).success).toBe(false);
  });

  it("validates bounded resource-specific discovery and availability", () => {
    const list = {
      schemaVersion: "export-list-response/v2",
      correlationId,
      revisionId,
      availability: { allowed: false, reason: "templateUnavailable" },
      artifacts: [ready]
    };
    expect(ExportListResponseV2Schema.parse(list)).toEqual(list);
    expect(
      ExportListResponseV2Schema.safeParse({ ...list, artifacts: [ready, ready] }).success
    ).toBe(false);
    expect(ExportListResponseV2Schema.safeParse({ ...list, revisionId: exportId }).success).toBe(
      false
    );
    expect(
      ExportListResponseV2Schema.safeParse({ ...list, artifacts: Array(21).fill(ready) }).success
    ).toBe(false);
    expect(
      ExportListResponseV2Schema.safeParse({
        ...list,
        availability: { allowed: true, reason: "templateUnavailable" }
      }).success
    ).toBe(false);
  });

  it("retains the previously accepted artifact v1 reader", () => {
    const legacy = {
      schemaVersion: "export-artifact/v1",
      correlationId,
      exportId,
      status: "pending",
      format: "pdf",
      language: "en",
      downloadPath: null,
      contentHash: null,
      expiresAt: null
    };
    expect(ExportArtifactV1Schema.parse(legacy)).toEqual(legacy);
  });
});
