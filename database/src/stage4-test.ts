import assert from "node:assert/strict";

import { Pool, type PoolClient } from "pg";

import { databaseConfig } from "./config.js";

const ids = {
  seedCatalog: "00000000-0000-4000-8000-000000000001",
  seedRuleSet: "00000000-0000-4000-8000-000000000101",
  seedSource: "00000000-0000-4000-8000-000000000201",
  seedAnchor: "00000000-0000-4000-8000-000000000305",
  seedSupport: "00000000-0000-4000-8000-000000000303",
  seedProject: "00000000-0000-4000-8000-000000000801",
  seedDraft: "00000000-0000-4000-8000-000000000871",
  seedRevision: "00000000-0000-4000-8000-000000000901",
  seedBom: "00000000-0000-4000-8000-000000000911",
  seedWarning: "00000000-0000-4000-8000-000000000921",
  nextCatalog: "10000000-0000-4000-8000-000000000001",
  nextRuleSet: "10000000-0000-4000-8000-000000000101",
  nextSource: "10000000-0000-4000-8000-000000000201",
  nextProduct: "10000000-0000-4000-8000-000000000301",
  testProject: "10000000-0000-4000-8000-000000000801",
  routeOne: "10000000-0000-4000-8000-000000000811",
  routeTwo: "10000000-0000-4000-8000-000000000812",
  routeOneStart: "10000000-0000-4000-8000-000000000841",
  routeOneEnd: "10000000-0000-4000-8000-000000000842",
  routeTwoStart: "10000000-0000-4000-8000-000000000843",
  routeTwoEnd: "10000000-0000-4000-8000-000000000844"
} as const;

interface ErrorWithCode {
  readonly code?: string;
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null ? (error as ErrorWithCode).code : undefined;
}

async function expectDatabaseError(
  label: string,
  operation: () => Promise<unknown>,
  expectedCodes: readonly string[]
): Promise<void> {
  try {
    await operation();
  } catch (error) {
    const code = errorCode(error);
    assert.ok(
      code && expectedCodes.includes(code),
      `${label}: unexpected PostgreSQL error ${code}`
    );
    return;
  }
  assert.fail(`${label}: expected PostgreSQL to reject the operation`);
}

async function expectCommitError(
  pool: Pool,
  label: string,
  operation: (client: PoolClient) => Promise<void>,
  expectedCodes: readonly string[]
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await operation(client);
    await expectDatabaseError(label, () => client.query("COMMIT"), expectedCodes);
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
  }
}

async function createRouteWithEndpoints(
  pool: Pool,
  route: { readonly id: string; readonly code: string; readonly sequence: number },
  endpoints: { readonly start: string; readonly end: string }
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO routes (
         id, project_id, code, name, system_series_id, default_section_length_m, sequence
       ) VALUES ($1, $2, $3, $4, 'SYN-E5', 3, $5)`,
      [route.id, ids.testProject, route.code, `Test ${route.code}`, route.sequence]
    );
    await client.query(
      `INSERT INTO route_endpoints (id, route_id, project_id, position, endpoint_kind)
       VALUES ($1, $2, $3, 'start', 'freeEnd'), ($4, $2, $3, 'end', 'freeEnd')`,
      [endpoints.start, route.id, ids.testProject, endpoints.end]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function createRevisionUnderProjectLock(pool: Pool, marker: string): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT id FROM projects WHERE id = $1 FOR UPDATE", [ids.testProject]);
    const latest = await client.query<{ value: number }>(
      "SELECT coalesce(max(revision_number), 0)::integer AS value FROM revisions WHERE project_id = $1",
      [ids.testProject]
    );
    const revisionNumber = (latest.rows[0]?.value ?? 0) + 1;
    await client.query(
      `INSERT INTO revisions (
         project_id, revision_number, name, status, calculation_schema_version, engine_version,
         snapshot_schema_version, input_fingerprint, input_checksum, snapshot_checksum,
         bom_checksum, input_snapshot, catalog_snapshot, rule_template_snapshot,
         calculation_result_snapshot, idempotency_key, correlation_id, created_by_snapshot
       ) VALUES ($1, $2, $3, 'calculated', 'calculation-input/v1', '0.1.0',
                 'revision-snapshot/v1', $4, $5, $6, $7, '{}', '{}', '{}', '{}', $8, $9, '{}')`,
      [
        ids.testProject,
        revisionNumber,
        `Concurrent ${marker}`,
        `sha256:${marker.repeat(64).slice(0, 64)}`,
        `sha256:${"2".repeat(64)}`,
        `sha256:${"3".repeat(64)}`,
        `sha256:${"4".repeat(64)}`,
        `concurrent-revision-${marker}`,
        `concurrent-correlation-${marker}`
      ]
    );
    await client.query("COMMIT");
    return revisionNumber;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

const pool = new Pool(databaseConfig());

try {
  const migrationCount = await pool.query<{ count: number }>(
    "SELECT count(*)::integer AS count FROM schema_migrations"
  );
  assert.equal(migrationCount.rows[0]?.count, 5, "all migrations must apply to the empty database");

  const seedCounts = await pool.query<{ products: number; revisions: number; drafts: number }>(
    `SELECT
       (SELECT count(*)::integer FROM products WHERE catalog_version_id = $1) AS products,
       (SELECT count(*)::integer FROM revisions WHERE project_id = $2) AS revisions,
       (SELECT count(*)::integer FROM calculation_drafts WHERE project_id = $2) AS drafts`,
    [ids.seedCatalog, ids.seedProject]
  );
  assert.deepEqual(
    seedCounts.rows[0],
    { products: 8, revisions: 1, drafts: 1 },
    "seed is idempotent"
  );

  await expectDatabaseError(
    "product code uniqueness within one catalog",
    () =>
      pool.query(
        `INSERT INTO products (
           catalog_version_id, product_code, category, description_en, variant_key, base_unit
         ) VALUES ($1, 'syn-nx-anchor-m8', 'anchor', 'Duplicate', 'duplicate', 'pcs')`,
        [ids.seedCatalog]
      ),
    ["23505"]
  );

  await pool.query(
    `INSERT INTO catalog_versions (
       id, version, label, content_hash, status, import_provenance, validation_schema_version
     ) VALUES ($1, '0.2.0', 'Synthetic next catalog', $2, 'draft', '{"fixture":true}', 'catalog-import-validation-result/v1')`,
    [ids.nextCatalog, `sha256:${"5".repeat(64)}`]
  );
  await pool.query(
    `INSERT INTO product_sources (
       id, catalog_version_id, document_identity, title, source_page, locale, verification_status
     ) VALUES ($1, $2, 'synthetic-next', 'Synthetic next source', 'fixture-2', 'en', 'unverified')`,
    [ids.nextSource, ids.nextCatalog]
  );
  const nextProductClient = await pool.connect();
  try {
    await nextProductClient.query("BEGIN");
    await nextProductClient.query(
      `INSERT INTO products (
         id, catalog_version_id, product_code, category, description_en, variant_key,
         base_unit, minimum_package_quantity, packaging_unit
       ) VALUES ($1, $2, 'SYN-NX-ANCHOR-M8', 'anchor', 'Same code in later catalog', 'm8', 'pcs', 20, 'pcs')`,
      [ids.nextProduct, ids.nextCatalog]
    );
    await nextProductClient.query(
      `INSERT INTO product_source_links (product_id, catalog_version_id, source_id, is_primary)
       VALUES ($1, $2, $3, true)`,
      [ids.nextProduct, ids.nextCatalog, ids.nextSource]
    );
    await nextProductClient.query("COMMIT");
  } catch (error) {
    await nextProductClient.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    nextProductClient.release();
  }

  await pool.query(
    `INSERT INTO rule_sets (
       id, version, label, content_hash, schema_version, catalog_version_id, status, provenance
     ) VALUES ($1, '0.2.0', 'Synthetic next rules', $2, 'rule-set/v1', $3, 'draft', '{"fixture":true}')`,
    [ids.nextRuleSet, `sha256:${"6".repeat(64)}`, ids.nextCatalog]
  );
  await pool.query(
    `INSERT INTO projects (
       id, code, name, active_catalog_version_id, active_rule_set_id
     ) VALUES ($1, 'SYN-PROJECT-02', 'Constraint test project', $2, $3)`,
    [ids.testProject, ids.seedCatalog, ids.seedRuleSet]
  );
  await createRouteWithEndpoints(
    pool,
    { id: ids.routeOne, code: "R-A", sequence: 0 },
    { start: ids.routeOneStart, end: ids.routeOneEnd }
  );
  await createRouteWithEndpoints(
    pool,
    { id: ids.routeTwo, code: "R-C", sequence: 1 },
    { start: ids.routeTwoStart, end: ids.routeTwoEnd }
  );

  await expectDatabaseError(
    "route codes are case-insensitively unique within a project",
    () =>
      pool.query(
        `INSERT INTO routes (
           project_id, code, name, system_series_id, default_section_length_m, sequence
         ) VALUES ($1, 'r-a', 'Duplicate route', 'SYN-E5', 3, 10)`,
        [ids.testProject]
      ),
    ["23505"]
  );

  await expectDatabaseError(
    "zero straight-segment length",
    () =>
      pool.query(
        `INSERT INTO segments (route_id, project_id, sequence, length_m)
         VALUES ($1, $2, 0, 0)`,
        [ids.routeOne, ids.testProject]
      ),
    ["23514"]
  );
  await expectDatabaseError(
    "free-text unit",
    () =>
      pool.query(
        `INSERT INTO manual_items (
           project_id, free_text_description, quantity, unit, reason, origin, status
         ) VALUES ($1, 'Invalid unit', 1, 'metre', 'test', 'user', 'manual')`,
        [ids.testProject]
      ),
    ["22P02"]
  );
  await expectDatabaseError(
    "zero manual quantity",
    () =>
      pool.query(
        `INSERT INTO manual_items (
           project_id, free_text_description, quantity, unit, reason, origin, status
         ) VALUES ($1, 'Zero quantity', 0, 'pcs', 'test', 'user', 'manual')`,
        [ids.testProject]
      ),
    ["23514"]
  );

  await expectCommitError(
    pool,
    "route endpoint cardinality",
    async (client) => {
      const routeId = "10000000-0000-4000-8000-000000000813";
      await client.query(
        `INSERT INTO routes (
           id, project_id, code, name, system_series_id, default_section_length_m, sequence
         ) VALUES ($1, $2, 'R-INCOMPLETE', 'Incomplete route', 'SYN-E5', 3, 2)`,
        [routeId, ids.testProject]
      );
      await client.query(
        `INSERT INTO route_endpoints (route_id, project_id, position, endpoint_kind)
         VALUES ($1, $2, 'start', 'freeEnd')`,
        [routeId, ids.testProject]
      );
    },
    ["23514"]
  );

  await expectDatabaseError(
    "self connection",
    async () => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const connectionId = "10000000-0000-4000-8000-000000000851";
        await client.query(
          `INSERT INTO route_connections (
             id, project_id, connection_type, physical_material_behavior, support_behavior
           ) VALUES ($1, $2, 'physicalSplice', 'connector', 'separate')`,
          [connectionId, ids.testProject]
        );
        await client.query(
          `INSERT INTO route_connection_endpoints (
             connection_id, endpoint_id, project_id, participant_order, participant_role
           ) VALUES ($1, $2, $3, 0, 'from')`,
          [connectionId, ids.routeOneEnd, ids.testProject]
        );
        await client.query(
          `INSERT INTO route_connection_endpoints (
             connection_id, endpoint_id, project_id, participant_order, participant_role
           ) VALUES ($1, $2, $3, 1, 'to')`,
          [connectionId, ids.routeOneEnd, ids.testProject]
        );
      } finally {
        await client.query("ROLLBACK").catch(() => undefined);
        client.release();
      }
    },
    ["23505"]
  );

  await expectDatabaseError(
    "cross-project endpoint connection",
    async () => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const connectionId = "10000000-0000-4000-8000-000000000852";
        await client.query(
          `INSERT INTO route_connections (
             id, project_id, connection_type, physical_material_behavior, support_behavior
           ) VALUES ($1, $2, 'physicalSplice', 'connector', 'separate')`,
          [connectionId, ids.seedProject]
        );
        await client.query(
          `INSERT INTO route_connection_endpoints (
             connection_id, endpoint_id, project_id, participant_order, participant_role
           ) VALUES ($1, $2, $3, 0, 'from')`,
          [connectionId, ids.routeOneEnd, ids.seedProject]
        );
      } finally {
        await client.query("ROLLBACK").catch(() => undefined);
        client.release();
      }
    },
    ["23503"]
  );

  await expectDatabaseError(
    "endpoint in duplicate connection",
    async () => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const connectionId = "10000000-0000-4000-8000-000000000853";
        await client.query(
          `INSERT INTO route_connections (
             id, project_id, connection_type, physical_material_behavior, support_behavior
           ) VALUES ($1, $2, 'physicalSplice', 'connector', 'separate')`,
          [connectionId, ids.seedProject]
        );
        await client.query(
          `INSERT INTO route_connection_endpoints (
             connection_id, endpoint_id, project_id, participant_order, participant_role
           ) VALUES ($1, '00000000-0000-4000-8000-000000000842', $2, 0, 'from')`,
          [connectionId, ids.seedProject]
        );
      } finally {
        await client.query("ROLLBACK").catch(() => undefined);
        client.release();
      }
    },
    ["23505"]
  );

  await expectCommitError(
    pool,
    "invalid start/start connection",
    async (client) => {
      const connectionId = "10000000-0000-4000-8000-000000000854";
      await client.query(
        `INSERT INTO route_connections (
           id, project_id, connection_type, physical_material_behavior, support_behavior
         ) VALUES ($1, $2, 'physicalSplice', 'connector', 'separate')`,
        [connectionId, ids.testProject]
      );
      await client.query(
        `INSERT INTO route_connection_endpoints (
           connection_id, endpoint_id, project_id, participant_order, participant_role
         ) VALUES ($1, $2, $4, 0, 'from'), ($1, $3, $4, 1, 'to')`,
        [connectionId, ids.routeOneStart, ids.routeTwoStart, ids.testProject]
      );
    },
    ["23514"]
  );

  await expectDatabaseError(
    "included item self-reference",
    () =>
      pool.query(
        `INSERT INTO included_items (
           parent_product_id, catalog_version_id, included_product_id, included_quantity, unit, source_id
         ) VALUES ($1, $2, $1, 1, 'pcs', $3)`,
        [ids.seedAnchor, ids.seedCatalog, ids.seedSource]
      ),
    ["23514"]
  );
  await expectDatabaseError(
    "manual item both product and free text",
    () =>
      pool.query(
        `INSERT INTO manual_items (
           project_id, catalog_product_id, free_text_description, quantity, unit, reason, origin, status
         ) VALUES ($1, $2, 'Both', 1, 'pcs', 'test', 'user', 'manual')`,
        [ids.testProject, ids.seedAnchor]
      ),
    ["23514"]
  );
  await expectDatabaseError(
    "manual item neither product nor free text",
    () =>
      pool.query(
        `INSERT INTO manual_items (project_id, quantity, unit, reason, origin, status)
         VALUES ($1, 1, 'pcs', 'test', 'user', 'manual')`,
        [ids.testProject]
      ),
    ["23514"]
  );

  const concurrentNumbers = await Promise.all([
    createRevisionUnderProjectLock(pool, "a"),
    createRevisionUnderProjectLock(pool, "b")
  ]);
  assert.deepEqual(
    [...concurrentNumbers].sort(),
    [1, 2],
    "project row lock assigns unique revision numbers"
  );
  const testRevision = await pool.query<{ id: string }>(
    "SELECT id FROM revisions WHERE project_id = $1 AND revision_number = 1",
    [ids.testProject]
  );
  await pool.query(
    `INSERT INTO bom_lines (
       revision_id, line_identity, line_order, category, live_product_id, product_snapshot,
       product_code, description_en, technical_quantity, reserve_quantity,
       packaging_quantity, package_size, ordered_packages, order_quantity, spare_quantity,
       unit, included_items_snapshot, source_snapshot, origin, rule_template_snapshot
     ) VALUES ($1, 'deletion-guard', 0, 'anchor', $2, '{"fixture":true}',
               'SYN-NX-ANCHOR-M8', 'Archived product guard', 1, 0, 1, 20, 1, 20, 0,
               'pcs', '[]', '{}', 'catalogConfirmed', '{}')`,
    [testRevision.rows[0]?.id, ids.nextProduct]
  );
  await expectDatabaseError(
    "saved BOM product deletion",
    () => pool.query("DELETE FROM products WHERE id = $1", [ids.nextProduct]),
    ["23001"]
  );

  const revisionCountBeforeDraftReplace = await pool.query<{ count: number }>(
    "SELECT count(*)::integer AS count FROM revisions WHERE project_id = $1",
    [ids.seedProject]
  );
  await pool.query(
    `UPDATE calculation_drafts
        SET input_fingerprint = $2, idempotency_key = 'seed-calculate-replaced',
            correlation_id = 'seed-correlation-replaced', updated_at = now()
      WHERE id = $1`,
    [ids.seedDraft, `sha256:${"7".repeat(64)}`]
  );
  const draftReplaceCounts = await pool.query<{ drafts: number; revisions: number }>(
    `SELECT
       (SELECT count(*)::integer FROM calculation_drafts WHERE project_id = $1) AS drafts,
       (SELECT count(*)::integer FROM revisions WHERE project_id = $1) AS revisions`,
    [ids.seedProject]
  );
  assert.equal(draftReplaceCounts.rows[0]?.drafts, 1, "draft replacement remains one mutable row");
  assert.equal(
    draftReplaceCounts.rows[0]?.revisions,
    revisionCountBeforeDraftReplace.rows[0]?.count,
    "draft replacement creates no saved revision"
  );

  await expectDatabaseError(
    "saved revision snapshot mutation",
    () =>
      pool.query("UPDATE revisions SET input_snapshot = '{\"mutated\":true}' WHERE id = $1", [
        ids.seedRevision
      ]),
    ["55000"]
  );
  await expectDatabaseError(
    "saved BOM mutation",
    () => pool.query("UPDATE bom_lines SET technical_quantity = 999 WHERE id = $1", [ids.seedBom]),
    ["55000"]
  );
  await expectDatabaseError(
    "saved warning deletion",
    () => pool.query("DELETE FROM warnings WHERE id = $1", [ids.seedWarning]),
    ["55000"]
  );

  const snapshotBefore = await pool.query<{
    catalog_snapshot: string;
    rule_snapshot: string;
    result_snapshot: string;
    input_checksum: string;
    snapshot_checksum: string;
    bom_checksum: string;
    bom_snapshot: string;
    warning_snapshot: string;
    technical_quantity: string;
  }>(
    `SELECT revision.catalog_snapshot::text, revision.rule_template_snapshot::text AS rule_snapshot,
            revision.calculation_result_snapshot::text AS result_snapshot,
            revision.input_checksum, revision.snapshot_checksum, revision.bom_checksum,
            bom.product_snapshot::text AS bom_snapshot,
            (SELECT jsonb_agg(to_jsonb(warning) ORDER BY warning.id)::text
               FROM warnings warning WHERE warning.revision_id = revision.id) AS warning_snapshot,
            bom.technical_quantity::text
       FROM revisions revision JOIN bom_lines bom ON bom.revision_id = revision.id
      WHERE revision.id = $1`,
    [ids.seedRevision]
  );

  await pool.query(
    "UPDATE products SET description_en = 'Live product changed', availability_status = 'archived' WHERE id = $1",
    [ids.seedAnchor]
  );
  await pool.query(
    "UPDATE product_attributes SET value_numeric = 81, updated_at = now() WHERE product_id = $1 AND attribute_key = 'length'",
    [ids.seedAnchor]
  );
  await pool.query("UPDATE included_items SET included_quantity = 3 WHERE parent_product_id = $1", [
    ids.seedSupport
  ]);
  await pool.query(
    'UPDATE calculation_rules SET parameters = \'{"quantity":{"value":"1","unit":"pcs"}}\', updated_at = now() WHERE id = \'00000000-0000-4000-8000-000000000611\''
  );
  await pool.query(
    "UPDATE template_components SET quantity = 4 WHERE id = '00000000-0000-4000-8000-000000000713'"
  );
  const activationClient = await pool.connect();
  try {
    await activationClient.query("BEGIN");
    await activationClient.query(
      `UPDATE catalog_versions
          SET status = 'validated', validated_at = now(), validated_content_hash = content_hash,
              updated_at = now()
        WHERE id = $1`,
      [ids.nextCatalog]
    );
    await activationClient.query(
      `UPDATE catalog_versions
          SET status = 'approved', approved_at = now(), approved_content_hash = content_hash,
              updated_at = now()
        WHERE id = $1`,
      [ids.nextCatalog]
    );
    await activationClient.query(
      "UPDATE catalog_versions SET status = 'archived', archived_at = now(), updated_at = now() WHERE id = $1",
      [ids.seedCatalog]
    );
    await activationClient.query(
      "UPDATE rule_sets SET status = 'archived', archived_at = now(), updated_at = now() WHERE id = $1",
      [ids.seedRuleSet]
    );
    await activationClient.query(
      "UPDATE catalog_versions SET status = 'active', activated_at = now(), updated_at = now() WHERE id = $1",
      [ids.nextCatalog]
    );
    await activationClient.query(
      "UPDATE rule_sets SET status = 'active', validated_at = now(), activated_at = now(), updated_at = now() WHERE id = $1",
      [ids.nextRuleSet]
    );
    await activationClient.query("COMMIT");
  } catch (error) {
    await activationClient.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    activationClient.release();
  }

  const snapshotAfter = await pool.query<{
    catalog_snapshot: string;
    rule_snapshot: string;
    result_snapshot: string;
    input_checksum: string;
    snapshot_checksum: string;
    bom_checksum: string;
    bom_snapshot: string;
    warning_snapshot: string;
    technical_quantity: string;
  }>(
    `SELECT revision.catalog_snapshot::text, revision.rule_template_snapshot::text AS rule_snapshot,
            revision.calculation_result_snapshot::text AS result_snapshot,
            revision.input_checksum, revision.snapshot_checksum, revision.bom_checksum,
            bom.product_snapshot::text AS bom_snapshot,
            (SELECT jsonb_agg(to_jsonb(warning) ORDER BY warning.id)::text
               FROM warnings warning WHERE warning.revision_id = revision.id) AS warning_snapshot,
            bom.technical_quantity::text
       FROM revisions revision JOIN bom_lines bom ON bom.revision_id = revision.id
      WHERE revision.id = $1`,
    [ids.seedRevision]
  );
  assert.deepEqual(
    snapshotAfter.rows[0],
    snapshotBefore.rows[0],
    "saved snapshot and BOM stay byte-stable after live data changes"
  );
  const archivedProductBom = await pool.query<{
    description_en: string;
    availability_status: string;
  }>(
    `SELECT bom.description_en, product.availability_status
       FROM bom_lines bom LEFT JOIN products product ON product.id = bom.live_product_id
      WHERE bom.id = $1`,
    [ids.seedBom]
  );
  assert.deepEqual(archivedProductBom.rows[0], {
    description_en: "Synthetic Niedax-shaped anchor fixture M8",
    availability_status: "archived"
  });

  const actorId = "10000000-0000-4000-8000-000000000951";
  await pool.query(
    `INSERT INTO users (
       id, username, display_name, role, enabled, password_hash, password_algorithm
     ) VALUES ($1, 'stage4.reviewer', 'Stage 4 Reviewer', 'reviewer', true, 'disabled-test-hash', 'test-only')`,
    [actorId]
  );
  await expectDatabaseError(
    "approval cannot target a mutable draft",
    () =>
      pool.query(
        `INSERT INTO approvals (
           revision_id, decision, actor_id, actor_role, actor_snapshot, correlation_id, idempotency_key
         ) VALUES ($1, 'approved', $2, 'reviewer', '{}', 'approval-draft-test', 'approval-draft-test')`,
        [ids.seedDraft, actorId]
      ),
    ["23503"]
  );
  await pool.query(
    "UPDATE revisions SET status = 'checked', checked_at = now(), updated_at = now() WHERE id = $1",
    [ids.seedRevision]
  );
  await pool.query(
    `INSERT INTO approvals (
       revision_id, decision, actor_id, actor_role, actor_snapshot, comment,
       correlation_id, idempotency_key
     ) VALUES ($1, 'approved', $2, 'reviewer', $3, 'Synthetic approval test',
               'approval-revision-test', 'approval-revision-test')`,
    [ids.seedRevision, actorId, { username: "stage4.reviewer", role: "reviewer" }]
  );
  await expectDatabaseError(
    "approval event mutation",
    () =>
      pool.query("UPDATE approvals SET comment = 'changed' WHERE revision_id = $1", [
        ids.seedRevision
      ]),
    ["55000"]
  );

  process.stdout.write(
    "Stage 4 PostgreSQL assertions passed: constraints, concurrency, draft replacement, snapshots, and approvals.\n"
  );
} finally {
  await pool.end();
}
