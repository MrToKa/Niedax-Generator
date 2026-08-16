import assert from "node:assert/strict";

import { Pool } from "pg";

import { databaseConfig } from "./config.js";

interface ErrorWithCode {
  readonly code?: string;
}

async function expectCode(
  operation: () => Promise<unknown>,
  expected: readonly string[]
): Promise<void> {
  try {
    await operation();
  } catch (error) {
    const code =
      typeof error === "object" && error !== null ? (error as ErrorWithCode).code : undefined;
    assert.ok(code && expected.includes(code), `unexpected PostgreSQL error ${code}`);
    return;
  }
  assert.fail("expected PostgreSQL to reject operation");
}

const ids = {
  admin: "20000000-0000-4000-8000-000000000001",
  candidate: "20000000-0000-4000-8000-000000000101",
  import: "20000000-0000-4000-8000-000000000201",
  report: "20000000-0000-4000-8000-000000000301",
  invalidationCandidate: "20000000-0000-4000-8000-000000000102"
} as const;
const contentHash = `sha256:${"a".repeat(64)}`;
const otherHash = `sha256:${"b".repeat(64)}`;

const pool = new Pool(databaseConfig());

try {
  await pool.query(
    `INSERT INTO users (
       id, username, display_name, role, enabled, password_hash, password_algorithm
     ) VALUES ($1, 'stage5.admin', 'Stage 5 Administrator', 'administrator', true,
               'disabled-test-hash', 'test-only')`,
    [ids.admin]
  );

  const activeBefore = await pool.query<{ id: string; scope: string; content_hash: string }>(
    "SELECT id, scope, content_hash FROM catalog_versions WHERE status = 'active' ORDER BY activated_at DESC LIMIT 1"
  );
  const active = activeBefore.rows[0];
  assert.ok(active, "Stage 4 must leave one active catalog for activation tests");

  await pool.query(
    `INSERT INTO catalog_versions (
       id, scope, version, label, content_hash, status, import_provenance,
       validation_schema_version, created_by, updated_by
     ) VALUES ($1,$2,'stage5-candidate','Stage 5 candidate',$3,'draft','{}',
               'catalog-import/v1',$4,$4)`,
    [ids.candidate, active.scope, contentHash, ids.admin]
  );
  await pool.query(
    `INSERT INTO catalog_imports (
       id, catalog_version_id, file_name, media_type, file_size_bytes, declared_scope,
       content_hash, normalized_bundle, status, created_by
     ) VALUES ($1,$2,'fixture.csv','text/csv-bundle',1,$3,$4,'{}','validated',$5)`,
    [ids.import, ids.candidate, active.scope, contentHash, ids.admin]
  );
  await pool.query(
    `INSERT INTO catalog_validation_reports (
       id, catalog_version_id, import_id, content_hash, schema_version, is_valid,
       error_count, warning_count, conflict_count, report, created_by
     ) VALUES ($1,$2,$3,$4,'catalog-validation-report/v1',true,0,0,0,'{}',$5)`,
    [ids.report, ids.candidate, ids.import, contentHash, ids.admin]
  );
  await pool.query(
    `UPDATE catalog_versions
        SET status = 'validated', validated_at = now(), validated_content_hash = content_hash,
            validation_report_id = $2, updated_at = now()
      WHERE id = $1`,
    [ids.candidate, ids.report]
  );

  await expectCode(
    () =>
      pool.query(
        `INSERT INTO catalog_version_approvals (
         catalog_version_id, validation_report_id, content_hash, approved_by, reason, correlation_id
       ) VALUES ($1,$2,$3,$4,'wrong hash test','stage5-wrong-hash')`,
        [ids.candidate, ids.report, otherHash, ids.admin]
      ),
    ["23514"]
  );
  const approval = await pool.query<{ id: string }>(
    `INSERT INTO catalog_version_approvals (
       catalog_version_id, validation_report_id, content_hash, approved_by, reason, correlation_id
     ) VALUES ($1,$2,$3,$4,'official source reviewed','stage5-approval') RETURNING id`,
    [ids.candidate, ids.report, contentHash, ids.admin]
  );
  assert.ok(approval.rows[0]?.id, "exact-hash approval must be recorded");
  await pool.query(
    `UPDATE catalog_versions
        SET status = 'approved', approved_at = now(), approved_by = $2,
            approved_content_hash = content_hash, updated_at = now()
      WHERE id = $1`,
    [ids.candidate, ids.admin]
  );

  const activation = await pool.connect();
  try {
    await activation.query("BEGIN");
    await activation.query(
      "UPDATE catalog_versions SET status = 'archived', archived_at = now(), updated_at = now() WHERE id = $1",
      [active.id]
    );
    await activation.query(
      "UPDATE catalog_versions SET status = 'active', activated_at = now(), updated_at = now() WHERE id = $1",
      [ids.candidate]
    );
    await expectCode(() => activation.query("SELECT 1 / 0"), ["22012"]);
    await activation.query("ROLLBACK");
  } finally {
    activation.release();
  }
  const afterRollback = await pool.query<{ id: string; status: string; content_hash: string }>(
    "SELECT id, status, content_hash FROM catalog_versions WHERE id = ANY($1::uuid[]) ORDER BY id",
    [[active.id, ids.candidate]]
  );
  assert.equal(afterRollback.rows.find((row) => row.id === active.id)?.status, "active");
  assert.equal(afterRollback.rows.find((row) => row.id === ids.candidate)?.status, "approved");
  assert.equal(
    afterRollback.rows.find((row) => row.id === active.id)?.content_hash,
    active.content_hash
  );

  await pool.query(
    `INSERT INTO catalog_versions (
       id, scope, version, label, content_hash, status, import_provenance,
       validation_schema_version, validated_at, validated_content_hash, created_by, updated_by
     ) VALUES ($1,'stage5-invalidation','stage5-invalidation','Invalidation candidate',$2,
               'validated','{}','catalog-import/v1',now(),$2,$3,$3)`,
    [ids.invalidationCandidate, contentHash, ids.admin]
  );
  await expectCode(
    () =>
      pool.query(
        "UPDATE catalog_versions SET content_hash = $2, updated_at = now() WHERE id = $1",
        [ids.invalidationCandidate, otherHash]
      ),
    ["23514"]
  );
  await pool.query(
    `UPDATE catalog_versions
        SET content_hash = $2, status = 'draft', validated_at = NULL,
            validated_content_hash = NULL, validation_report_id = NULL,
            approved_at = NULL, approved_by = NULL, approved_content_hash = NULL,
            updated_at = now()
      WHERE id = $1`,
    [ids.invalidationCandidate, otherHash]
  );
  const invalidated = await pool.query<{
    status: string;
    validated_at: Date | null;
    approved_at: Date | null;
    validation_report_id: string | null;
  }>(
    "SELECT status, validated_at, approved_at, validation_report_id FROM catalog_versions WHERE id = $1",
    [ids.invalidationCandidate]
  );
  assert.deepEqual(invalidated.rows[0], {
    status: "draft",
    validated_at: null,
    approved_at: null,
    validation_report_id: null
  });

  await expectCode(
    () =>
      pool.query(
        `INSERT INTO catalog_imports (
         catalog_version_id, file_name, media_type, file_size_bytes, declared_scope,
         content_hash, normalized_bundle, status, created_by
       ) VALUES ($1,'duplicate.csv','text/csv-bundle',1,$2,$3,'{}','draft',$4)`,
        [ids.candidate, active.scope, contentHash, ids.admin]
      ),
    ["23505"]
  );

  await expectCode(
    () =>
      pool.query("UPDATE catalog_validation_reports SET warning_count = 1 WHERE id = $1", [
        ids.report
      ]),
    ["55000"]
  );

  process.stdout.write(
    "Stage 5 PostgreSQL assertions passed: exact-hash approval, idempotency, invalidation, immutable reports, and transactional activation rollback.\n"
  );
} finally {
  await pool.end();
}
