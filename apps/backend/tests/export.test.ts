import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { type ExportArtifactV2, type ExportRequestV1 } from "@niedax/domain";
import { buildEnglishExportContextV3, renderExcelWorkbook } from "@niedax/export";

import {
  syntheticContextInput,
  syntheticMapping
} from "../../../packages/export/tests/helpers/synthetic.js";
import { buildApp } from "../src/app.js";
import {
  ExportApplicationService,
  safeExportFileName,
  type ExportRepository,
  XLSX_MEDIA_TYPE
} from "../src/export-service.js";
import { ProjectApplicationError } from "../src/project-errors.js";
import type { UserStore } from "../src/domain.js";

const actor = {
  id: "10000000-0000-4000-8000-000000000002",
  username: "test.designer",
  displayName: "Test",
  role: "designer" as const
};
const revisionId = "10000000-0000-4000-8000-000000000003";
const exportId = "10000000-0000-4000-8000-000000000004";
const command: ExportRequestV1 = {
  schemaVersion: "export-request/v1",
  revisionId,
  correlationId: "test-export-correlation",
  idempotencyKey: "test-export-request-1",
  inputFingerprint: `sha256:${"a".repeat(64)}`,
  format: "xlsx",
  language: "en"
};
const pending: ExportArtifactV2 = {
  schemaVersion: "export-artifact/v2",
  correlationId: command.correlationId,
  exportId,
  revisionId,
  status: "pending",
  format: "xlsx",
  language: "en",
  downloadPath: null,
  contentHash: null,
  contentLength: null,
  fileName: null,
  createdAt: "2026-09-09T00:00:00.000Z",
  failureCode: null,
  expiresAt: null
};
function repository(): ExportRepository {
  return {
    request: vi.fn(async () => ({ statusCode: 202, body: pending, replayed: false })),
    list: vi.fn(async () => ({ supported: true, canCreate: true, artifacts: [] })),
    get: vi.fn(async () => pending),
    download: vi.fn(async () => {
      throw new ProjectApplicationError(409, "INVALID_STATE_TRANSITION", "Pending");
    }),
    claim: vi.fn(async () => null),
    finalize: vi.fn(async () => undefined),
    failAttempt: vi.fn(async () => undefined)
  };
}
function userStore(): UserStore {
  const user = {
    ...actor,
    enabled: true,
    passwordHash: "unused",
    createdAt: new Date(),
    updatedAt: new Date()
  };
  return {
    ping: async () => undefined,
    countAdministrators: async () => 1,
    findUserByUsername: async () => null,
    findSession: async (sessionHash) => ({ sessionHash, user, expiresAt: new Date("2099-01-01") }),
    createSession: async () => undefined,
    revokeSession: async () => undefined,
    listUsers: async () => ({ users: [user], nextCursor: null }),
    recordUserAdministrationRejection: async () => undefined,
    createUser: async () => user,
    setUserEnabled: async () => user,
    setUserRole: async () => user
  };
}
const headers = {
  host: "localhost:8080",
  origin: "http://localhost:8080",
  "x-niedax-csrf": "1",
  "idempotency-key": command.idempotencyKey,
  "x-correlation-id": command.correlationId,
  cookie: "niedax_session=test"
};
const body = {
  schemaVersion: command.schemaVersion,
  revisionId,
  inputFingerprint: command.inputFingerprint,
  format: "xlsx",
  language: "en"
};

describe("Stage 9 export application and authenticated transport", () => {
  it("provides explicit missing-template and unsupported-version availability without mutation", async () => {
    const repo = repository();
    const service = new ExportApplicationService(repo, {
      mapping: null,
      render: async () => {
        throw new Error("Unavailable fixture");
      }
    });
    expect((await service.list(actor, revisionId, command.correlationId)).availability.reason).toBe(
      "templateUnavailable"
    );
    expect(
      (await service.list({ ...actor, role: "viewer" }, revisionId, command.correlationId))
        .availability.reason
    ).toBe("notAuthorized");
    vi.mocked(repo.list).mockResolvedValue({ supported: false, canCreate: true, artifacts: [] });
    expect((await service.list(actor, revisionId, command.correlationId)).availability.reason).toBe(
      "unsupportedVersion"
    );
    expect(repo.request).not.toHaveBeenCalled();
  });
  it("uses current database permission when a role changes during listing", async () => {
    const repo = repository();
    vi.mocked(repo.list).mockResolvedValue({ supported: true, canCreate: false, artifacts: [] });
    const service = new ExportApplicationService(repo, {
      mapping: syntheticMapping,
      render: async () => {
        throw new Error("Unused");
      }
    });
    expect((await service.list(actor, revisionId, command.correlationId)).availability.reason).toBe(
      "notAuthorized"
    );
  });
  it("denies Viewer mutation and unimplemented formats before persistence", async () => {
    const repo = repository();
    const service = new ExportApplicationService(repo);
    await expect(service.request({ ...actor, role: "viewer" }, command)).rejects.toMatchObject({
      statusCode: 403
    });
    await expect(service.request(actor, { ...command, format: "pdf" })).rejects.toMatchObject({
      statusCode: 422
    });
    expect(repo.request).not.toHaveBeenCalled();
  });
  it("renders captured evidence in a bounded pass and reports failure without exposing bytes", async () => {
    const repo = repository();
    vi.mocked(repo.claim).mockResolvedValueOnce({
      exportId,
      claimToken: "claim",
      context: syntheticContextInput()
    });
    const render = vi.fn(async () => {
      throw new Error("private snapshot details");
    });
    await new ExportApplicationService(repo, { mapping: syntheticMapping, render }).recoverOnce();
    expect(render).toHaveBeenCalledTimes(1);
    expect(repo.failAttempt).toHaveBeenCalledWith(exportId, "claim");
    expect(repo.finalize).not.toHaveBeenCalled();
  });
  it("finalizes only complete bounded ZIP bytes using a backend-generated safe filename", async () => {
    const repo = repository();
    vi.mocked(repo.claim).mockResolvedValueOnce({
      exportId,
      claimToken: "claim",
      context: syntheticContextInput()
    });
    const bytes = Buffer.from(
      (
        await renderExcelWorkbook(
          buildEnglishExportContextV3(syntheticContextInput()),
          syntheticMapping
        )
      ).bytes
    );
    await new ExportApplicationService(repo, {
      mapping: syntheticMapping,
      render: async () => bytes
    }).recoverOnce();
    expect(repo.finalize).toHaveBeenCalledWith(
      exportId,
      "claim",
      bytes,
      safeExportFileName(revisionId, 1)
    );
    expect(safeExportFileName("../\r\n=evil", 1)).toMatch(
      /^niedax-revision-1-[A-Za-z0-9-]+\.xlsx$/u
    );
    for (const truncated of [bytes.subarray(0, 4), bytes.subarray(0, bytes.length - 5)]) {
      const incompleteRepo = repository();
      vi.mocked(incompleteRepo.claim).mockResolvedValueOnce({
        exportId,
        claimToken: "claim",
        context: syntheticContextInput()
      });
      await new ExportApplicationService(incompleteRepo, {
        mapping: syntheticMapping,
        render: async () => truncated
      }).recoverOnce();
      expect(incompleteRepo.finalize).not.toHaveBeenCalled();
      expect(incompleteRepo.failAttempt).toHaveBeenCalledWith(exportId, "claim");
    }
  });
  it("rejects tampered stored bytes before transport", async () => {
    const repo = repository();
    vi.mocked(repo.download).mockResolvedValue({
      artifact: {
        ...pending,
        status: "ready",
        contentLength: 4,
        contentHash: `sha256:${"0".repeat(64)}`
      },
      bytes: Buffer.from("test")
    });
    await expect(
      new ExportApplicationService(repo).download(actor, exportId, command.correlationId)
    ).rejects.toMatchObject({ code: "EXPORT_FAILED" });
  });
  it("enforces authentication, Origin, CSRF, trusted headers, strict body, path and query", async () => {
    const repo = repository();
    const app = await buildApp({
      store: userStore(),
      sessionPepper: "test",
      exportService: new ExportApplicationService(repo, {
        mapping: null,
        render: async () => {
          throw new Error("Unavailable fixture");
        }
      })
    });
    try {
      const url = `/api/v1/revisions/${revisionId}/exports`;
      expect((await app.inject({ method: "GET", url })).statusCode).toBe(401);
      expect(
        (
          await app.inject({
            method: "POST",
            url,
            headers: { cookie: headers.cookie },
            payload: body
          })
        ).statusCode
      ).toBe(403);
      expect(
        (
          await app.inject({
            method: "POST",
            url,
            headers: { ...headers, origin: "http://localhost:4319" },
            payload: body
          })
        ).statusCode
      ).toBe(403);
      for (const invalid of [
        { ...body, correlationId: "body-spoof" },
        { ...body, idempotencyKey: "body-spoof" },
        { ...body, rows: [] },
        { ...body, revisionId: exportId }
      ]) {
        expect(
          (await app.inject({ method: "POST", url, headers, payload: invalid })).statusCode
        ).toBe(422);
      }
      expect(
        (
          await app.inject({
            method: "POST",
            url,
            headers,
            payload: { ...body, schemaVersion: "export-request/v9" }
          })
        ).json().error.code
      ).toBe("UNSUPPORTED_SCHEMA_VERSION");
      expect(
        (await app.inject({ method: "GET", url: `${url}?path=../secret`, headers })).statusCode
      ).toBe(422);
      expect(repo.request).not.toHaveBeenCalled();
      const success = await app.inject({ method: "POST", url, headers, payload: body });
      expect(success.statusCode).toBe(202);
      expect(repo.request).toHaveBeenCalledWith(actor, command, null);
    } finally {
      await app.close();
    }
  });
  it("serves authorized binary with XLSX headers and keeps pending errors JSON", async () => {
    const repo = repository();
    const app = await buildApp({
      store: userStore(),
      sessionPepper: "test",
      exportService: new ExportApplicationService(repo)
    });
    try {
      const url = `/api/v1/exports/${exportId}/download`;
      const notReady = await app.inject({ method: "GET", url, headers });
      expect(notReady.statusCode).toBe(409);
      expect(notReady.headers["content-type"]).toContain("application/json");
      const bytes = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
      const ready: ExportArtifactV2 = {
        ...pending,
        status: "ready",
        contentLength: bytes.length,
        contentHash: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
        fileName: "niedax-test.xlsx",
        downloadPath: url
      };
      vi.mocked(repo.download).mockResolvedValue({ artifact: ready, bytes });
      const download = await app.inject({ method: "GET", url, headers });
      expect(download.statusCode).toBe(200);
      expect(download.rawPayload).toEqual(bytes);
      expect(download.headers).toMatchObject({
        "content-type": XLSX_MEDIA_TYPE,
        "content-length": "4",
        "x-content-type-options": "nosniff",
        "cache-control": "private, no-store",
        etag: `"${ready.contentHash}"`
      });
      expect(download.headers["content-disposition"]).toContain(
        "filename*=UTF-8''niedax-test.xlsx"
      );
    } finally {
      await app.close();
    }
  });
});
