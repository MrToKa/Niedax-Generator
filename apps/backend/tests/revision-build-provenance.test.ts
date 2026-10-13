import { afterEach, describe, expect, it, vi } from "vitest";
import type { Pool, PoolClient } from "pg";
import { CalculationInputV2Schema, type CalculationApplicationBuildV2 } from "@niedax/domain";
import { syntheticContextInput } from "../../../packages/export/tests/helpers/synthetic.js";
import { PgRevisionRepository, revisionChecksum } from "../src/revision-repository.js";
import { RevisionApplicationService } from "../src/revision-service.js";

// Synthetic adapter exercises the real save/reload/checksum/idempotency code without a database.
const previousBuild: CalculationApplicationBuildV2 = {
  application: "0.1.0",
  gitCommit: "abc12345".repeat(5),
  buildTimestamp: "2026-09-01T07:00:00.000Z",
  environment: "test"
};
afterEach(() => vi.unstubAllEnvs());

describe("immutable calculation-build provenance through revision save", () => {
  it.each([false, true])(
    "saves and replays the original calculation build, preserving legacy absence (%s)",
    async (hasBuild) => {
      const fixture = syntheticContextInput();
      const actor = { ...fixture.revision.authorSnapshot, role: "designer" as const };
      const input = CalculationInputV2Schema.parse({
        ...fixture.snapshot.calculationInput,
        invocation: {
          ...fixture.snapshot.calculationInput.invocation,
          ...(hasBuild ? { applicationBuild: previousBuild } : {})
        }
      });
      const result = fixture.snapshot.calculationResult;
      const project = fixture.snapshot.project;
      let inserted: readonly unknown[] | null = null;
      let replayRecord: {
        request_hash: unknown;
        response_status: unknown;
        response_payload: unknown;
      } | null = null;
      const query = vi.fn(
        async (sql: string, values: readonly unknown[] = []): Promise<{ rows: unknown[] }> => {
          if (sql.includes("FROM projects project"))
            return {
              rows: [
                {
                  id: project.id,
                  code: project.code,
                  name: project.name,
                  description: project.description,
                  status: project.status,
                  default_locale: project.defaultLocale,
                  default_spare_percent: project.defaultReservePercent,
                  cable_load_kg_per_m: null,
                  draft_version: project.draftVersion,
                  owner_id: project.ownerId,
                  owner_display_name: project.ownerDisplayName,
                  active_catalog_version_id: input.catalogSnapshot.snapshotId,
                  active_rule_set_id: input.ruleSnapshot.snapshotId,
                  created_at: new Date(project.createdAt),
                  updated_at: new Date(project.updatedAt),
                  document_payload: {
                    schemaVersion: "project-draft-document/v2",
                    draft: {
                      code: project.code,
                      name: project.name,
                      description: project.description,
                      defaultLocale: project.defaultLocale,
                      defaultReservePercent: project.defaultReservePercent,
                      cableLoad: null,
                      routes: [],
                      connections: [],
                      accessoryProductIds: [],
                      manualItems: []
                    }
                  }
                }
              ]
            };
          if (sql.includes("FROM idempotency_records"))
            return { rows: replayRecord ? [replayRecord] : [] };
          if (sql.includes("coalesce(max(revision_number)")) return { rows: [{ latest: 0 }] };
          if (sql.includes("FROM calculation_drafts calculation"))
            return {
              rows: [
                {
                  id: input.invocation.calculationRunId,
                  calculated_draft_version: project.draftVersion,
                  input_fingerprint: input.invocation.inputFingerprint,
                  engine_version: result.engineVersion,
                  catalog_version_id: input.catalogSnapshot.snapshotId,
                  catalog_snapshot_version: input.catalogSnapshot.version,
                  catalog_snapshot_content_hash: input.catalogSnapshot.contentHash,
                  rule_set_id: input.ruleSnapshot.snapshotId,
                  rule_snapshot_version: input.ruleSnapshot.version,
                  rule_snapshot_content_hash: input.ruleSnapshot.contentHash,
                  input_payload: input,
                  result_payload: result
                }
              ]
            };
          if (sql.includes("INSERT INTO revisions (")) {
            inserted = structuredClone(values);
            return { rows: [{ id: fixture.revision.id }] };
          }
          if (sql.includes("FROM revisions revision")) {
            if (!inserted) throw new Error("Expected one stored synthetic revision");
            return {
              rows: [
                {
                  id: fixture.revision.id,
                  project_id: inserted[0],
                  revision_number: inserted[1],
                  name: inserted[2],
                  comment: inserted[3],
                  status: "calculated",
                  engine_version: inserted[4],
                  input_fingerprint: inserted[5],
                  input_checksum: inserted[6],
                  snapshot_checksum: inserted[7],
                  bom_checksum: inserted[8],
                  input_snapshot: inserted[9],
                  calculation_result_snapshot: inserted[12],
                  created_by: inserted[15],
                  created_by_snapshot: inserted[16],
                  created_at: new Date(String(inserted[17])),
                  calculation_run_id: inserted[18],
                  source_draft_version: inserted[19],
                  project_snapshot: inserted[20],
                  catalog_snapshot_id: inserted[21],
                  catalog_snapshot_version: inserted[22],
                  catalog_snapshot_content_hash: inserted[23],
                  rule_snapshot_id: inserted[24],
                  rule_snapshot_version: inserted[25],
                  rule_snapshot_content_hash: inserted[26],
                  approval_ready: inserted[27],
                  warning_summary: inserted[28],
                  project_checksum: inserted[29],
                  result_checksum: inserted[30],
                  warnings_checksum: inserted[31],
                  revision_checksum: inserted[32],
                  checked_at: null,
                  approved_at: null,
                  latest_revision_number: 1
                }
              ]
            };
          }
          if (sql.includes("INSERT INTO idempotency_records"))
            replayRecord = {
              request_hash: values[2],
              response_status: values[4],
              response_payload: structuredClone(values[6])
            };
          return { rows: [] };
        }
      );
      const pool = {
        connect: vi.fn(async () => ({ query, release: vi.fn() }) as unknown as PoolClient)
      } as unknown as Pool;
      // Current saver deployment differs. No old calculation is attributed to this identity.
      vi.stubEnv("NIEDAX_GIT_COMMIT", "def67890".repeat(5));
      vi.stubEnv("NIEDAX_BUILD_TIMESTAMP", "2026-09-30T10:00:00.000Z");
      const service = new RevisionApplicationService(new PgRevisionRepository(pool));
      const request = {
        schemaVersion: "save-project-revision-request/v2" as const,
        expectedDraftVersion: project.draftVersion,
        expectedLatestRevisionNumber: 0,
        calculationRunId: input.invocation.calculationRunId,
        inputFingerprint: input.invocation.inputFingerprint,
        name: "Synthetic build provenance revision",
        comment: null
      };
      const saved = await service.saveRevision(
        actor,
        project.id,
        request,
        "build-provenance-save",
        "build-provenance-correlation"
      );
      if ("recordVersion" in saved.body.revision) throw new Error("Expected v2 revision");
      expect(saved.body.revision.snapshot.calculationInput.invocation.applicationBuild).toEqual(
        hasBuild ? previousBuild : undefined
      );
      expect(saved.body.revision.checksums.inputChecksum).toBe(revisionChecksum(input));
      const changedBuildInput = {
        ...input,
        invocation: {
          ...input.invocation,
          applicationBuild: {
            ...previousBuild,
            gitCommit: "def67890".repeat(5)
          }
        }
      };
      expect(revisionChecksum(changedBuildInput)).not.toBe(
        saved.body.revision.checksums.inputChecksum
      );
      expect(saved.body.revision.snapshot.calculationResult).toEqual(result);
      const replay = await service.saveRevision(
        actor,
        project.id,
        request,
        "build-provenance-save",
        "build-provenance-correlation"
      );
      expect(replay.replayed).toBe(true);
      expect(replay.body).toEqual(saved.body);
      expect(
        query.mock.calls.filter(([sql]) => sql.includes("INSERT INTO revisions (")).length
      ).toBe(1);
    }
  );
});
