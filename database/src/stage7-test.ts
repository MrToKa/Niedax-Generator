import assert from "node:assert/strict";

import { Pool, type PoolClient } from "pg";

import { databaseConfig } from "./config.js";

const ids = {
  owner: "30000000-0000-4000-8000-000000000001",
  otherOwner: "30000000-0000-4000-8000-000000000002",
  project: "30000000-0000-4000-8000-000000000003",
  routeA: "30000000-0000-4000-8000-000000000011",
  routeB: "30000000-0000-4000-8000-000000000012",
  routeAStart: "30000000-0000-4000-8000-000000000021",
  routeAEnd: "30000000-0000-4000-8000-000000000022",
  routeBStart: "30000000-0000-4000-8000-000000000023",
  routeBEnd: "30000000-0000-4000-8000-000000000024",
  segmentA: "30000000-0000-4000-8000-000000000031",
  fittingA: "30000000-0000-4000-8000-000000000032",
  segmentB: "30000000-0000-4000-8000-000000000033",
  connection: "30000000-0000-4000-8000-000000000041",
  manual: "30000000-0000-4000-8000-000000000051",
  calculation: "30000000-0000-4000-8000-000000000061"
} as const;

const requestHash = `sha256:${"d".repeat(64)}`;
const inputFingerprint = `sha256:${"e".repeat(64)}`;

interface ActivePair {
  readonly catalog_id: string;
  readonly rule_set_id: string;
}

interface ErrorWithCode {
  readonly code?: string;
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null ? (error as ErrorWithCode).code : undefined;
}

function draftDocument(version: number, routeALength: string) {
  const endpoint = (id: string, type: "freeEnd" | "routeContinuation") => ({
    id,
    type,
    selectedProductId: null,
    equipmentReference: null,
    customDescription: null
  });
  const supports = {
    spacing: null,
    supportType: null,
    supportProductId: null,
    assemblyTemplateId: null,
    levelCount: null,
    substrate: null,
    anchorProductId: null,
    anchorQuantityOverride: null,
    wstbProductId: null,
    wstb: null,
    manualAdditionalSupports: [],
    templateManualValues: []
  };
  return {
    schemaVersion: "project-draft-document/v2",
    draft: {
      code: "STAGE7-DB-01",
      name: `Stage 7 database project v${version}`,
      description: "Disposable PostgreSQL integration fixture",
      defaultLocale: "bg",
      defaultReservePercent: "5",
      cableLoad: null,
      routes: [
        {
          id: ids.routeA,
          code: "R-A",
          name: "Route A",
          description: null,
          selection: {
            system: null,
            dimensionId: null,
            width: null,
            height: null,
            materialCode: null,
            finishCode: null,
            straightProductId: null,
            defaultSupplyOptionId: null
          },
          startEndpoint: endpoint(ids.routeAStart, "freeEnd"),
          endEndpoint: endpoint(ids.routeAEnd, "routeContinuation"),
          geometry: [
            {
              id: ids.segmentA,
              kind: "straight",
              length: { value: routeALength, unit: "m" },
              supplyOptionId: null
            },
            {
              id: ids.fittingA,
              kind: "fitting",
              fittingType: "horizontalBend",
              selectedProductId: null,
              supportedPhysicalLength: null,
              customDescription: null
            }
          ],
          supports
        },
        {
          id: ids.routeB,
          code: "R-B",
          name: "Route B",
          description: null,
          selection: {
            system: null,
            dimensionId: null,
            width: null,
            height: null,
            materialCode: null,
            finishCode: null,
            straightProductId: null,
            defaultSupplyOptionId: null
          },
          startEndpoint: endpoint(ids.routeBStart, "routeContinuation"),
          endEndpoint: endpoint(ids.routeBEnd, "freeEnd"),
          geometry: [
            {
              id: ids.segmentB,
              kind: "straight",
              length: { value: "3", unit: "m" },
              supplyOptionId: null
            }
          ],
          supports
        }
      ],
      connections: [
        {
          id: ids.connection,
          type: "logicalContinuation",
          participants: [
            { routeId: ids.routeA, endpointId: ids.routeAEnd },
            { routeId: ids.routeB, endpointId: ids.routeBStart }
          ],
          physicalBreak: false,
          supportBehavior: "shared",
          materialProductId: null,
          supportsBefore: { value: "0", unit: "pcs" },
          supportsAfter: { value: "0", unit: "pcs" },
          connectorCorrections: []
        }
      ],
      accessoryProductIds: [],
      manualItems: [
        {
          id: ids.manual,
          kind: "freeText",
          productId: null,
          productCode: null,
          descriptionEn: "Site supplied strip",
          quantity: { value: "2", unit: "m" },
          reason: "Database integration fixture",
          note: null,
          reservePolicy: { mode: "projectDefault" },
          packagingPolicy: { mode: "disabled", metadata: null },
          quantityOverride: null
        }
      ]
    }
  };
}

async function replaceGraph(client: PoolClient, routeALength: string): Promise<void> {
  await client.query("DELETE FROM route_connections WHERE project_id = $1", [ids.project]);
  await client.query("DELETE FROM manual_items WHERE project_id = $1", [ids.project]);
  await client.query("DELETE FROM routes WHERE project_id = $1", [ids.project]);
  await client.query(
    `INSERT INTO routes (
       id, project_id, code, name, system_series_id, default_section_length_m, sequence
     ) VALUES
       ($1,$3,'R-A','Route A',NULL,NULL,0),
       ($2,$3,'R-B','Route B',NULL,NULL,1)`,
    [ids.routeA, ids.routeB, ids.project]
  );
  await client.query(
    `INSERT INTO route_endpoints (
       id, route_id, project_id, position, endpoint_kind, material_behavior, validation_metadata
     ) VALUES
       ($1,$5,$7,'start','freeEnd','{}','{}'),
       ($2,$5,$7,'end','routeContinuation','{}','{}'),
       ($3,$6,$7,'start','routeContinuation','{}','{}'),
       ($4,$6,$7,'end','freeEnd','{}','{}')`,
    [
      ids.routeAStart,
      ids.routeAEnd,
      ids.routeBStart,
      ids.routeBEnd,
      ids.routeA,
      ids.routeB,
      ids.project
    ]
  );
  await client.query(
    `INSERT INTO segments (id, route_id, project_id, sequence, length_m, geometry)
     VALUES ($1,$2,$4,0,$5,$6), ($3,$7,$4,0,3,$8)`,
    [
      ids.segmentA,
      ids.routeA,
      ids.segmentB,
      ids.project,
      routeALength,
      { kind: "straight", length: { value: routeALength, unit: "m" } },
      ids.routeB,
      { kind: "straight", length: { value: "3", unit: "m" } }
    ]
  );
  await client.query(
    `INSERT INTO fittings (
       id, route_id, project_id, fitting_type, sequence, geometry, manual_metadata
     ) VALUES ($1,$2,$3,'horizontalBend',1,$4,$5)`,
    [
      ids.fittingA,
      ids.routeA,
      ids.project,
      { kind: "fitting", fittingType: "horizontalBend" },
      { schemaVersion: "project-fitting-draft/v2" }
    ]
  );
  await client.query(
    `INSERT INTO support_configurations (
       route_id, project_id, spacing_m, support_type, assembly_template_id,
       construction_base, anchor_product_id, anchor_size_mm,
       anchors_per_mounting_point, wstb_mode, wstb_quantity_per_support,
       connection_support_behavior, engineering_review_required, engineering_review_state
     ) VALUES
       ($1,$3,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'separate',true,'required'),
       ($2,$3,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'separate',true,'required')`,
    [ids.routeA, ids.routeB, ids.project]
  );
  await client.query(
    `INSERT INTO route_connections (
       id, project_id, connection_type, physical_material_behavior, support_behavior,
       supports_before, supports_after, notes, created_by
     ) VALUES ($1,$2,'logicalContinuation','none','shared',0,0,$3,$4)`,
    [
      ids.connection,
      ids.project,
      JSON.stringify({ schemaVersion: "project-connection-draft/v2" }),
      ids.owner
    ]
  );
  await client.query(
    `INSERT INTO route_connection_endpoints (
       connection_id, endpoint_id, project_id, participant_order, participant_role
     ) VALUES ($1,$2,$4,0,'from'), ($1,$3,$4,1,'to')`,
    [ids.connection, ids.routeAEnd, ids.routeBStart, ids.project]
  );
  await client.query(
    `INSERT INTO manual_items (
       id, project_id, free_text_description, quantity, unit, reason, note,
       reserve_applicable, packaging_rounding_applicable, origin, status, created_by
     ) VALUES ($1,$2,'Site supplied strip',2,'m','Database integration fixture',NULL,
               true,false,'user','manual',$3)`,
    [ids.manual, ids.project, ids.owner]
  );
}

async function graphCounts(pool: Pool) {
  const result = await pool.query<{
    routes: number;
    endpoints: number;
    segments: number;
    fittings: number;
    supports: number;
    connections: number;
    participants: number;
    manual_items: number;
  }>(
    `SELECT
       (SELECT count(*)::integer FROM routes WHERE project_id = $1) AS routes,
       (SELECT count(*)::integer FROM route_endpoints WHERE project_id = $1) AS endpoints,
       (SELECT count(*)::integer FROM segments WHERE project_id = $1) AS segments,
       (SELECT count(*)::integer FROM fittings WHERE project_id = $1) AS fittings,
       (SELECT count(*)::integer FROM support_configurations WHERE project_id = $1) AS supports,
       (SELECT count(*)::integer FROM route_connections WHERE project_id = $1) AS connections,
       (SELECT count(*)::integer FROM route_connection_endpoints WHERE project_id = $1) AS participants,
       (SELECT count(*)::integer FROM manual_items WHERE project_id = $1) AS manual_items`,
    [ids.project]
  );
  return result.rows[0];
}

const pool = new Pool(databaseConfig());

try {
  const privilege = await pool.query<{
    document_select: boolean;
    document_insert: boolean;
    document_update: boolean;
    document_delete: boolean;
    audit_select: boolean;
    audit_insert: boolean;
    audit_update: boolean;
    audit_delete: boolean;
    audit_truncate: boolean;
  }>(
    `SELECT
       has_table_privilege('niedax_generator_app','project_draft_documents','SELECT') AS document_select,
       has_table_privilege('niedax_generator_app','project_draft_documents','INSERT') AS document_insert,
       has_table_privilege('niedax_generator_app','project_draft_documents','UPDATE') AS document_update,
       has_table_privilege('niedax_generator_app','project_draft_documents','DELETE') AS document_delete,
       has_table_privilege('niedax_generator_app','project_audit_events','SELECT') AS audit_select,
       has_table_privilege('niedax_generator_app','project_audit_events','INSERT') AS audit_insert,
       has_table_privilege('niedax_generator_app','project_audit_events','UPDATE') AS audit_update,
       has_table_privilege('niedax_generator_app','project_audit_events','DELETE') AS audit_delete,
       has_table_privilege('niedax_generator_app','project_audit_events','TRUNCATE') AS audit_truncate`
  );
  assert.deepEqual(privilege.rows[0], {
    document_select: true,
    document_insert: true,
    document_update: true,
    document_delete: true,
    audit_select: true,
    audit_insert: true,
    audit_update: false,
    audit_delete: false,
    audit_truncate: false
  });

  await pool.query(
    `INSERT INTO users (
       id, username, display_name, role, enabled, password_hash, password_algorithm
     ) VALUES
       ($1,'stage7.owner','Stage 7 Owner','reviewer',true,'disabled-test-hash','test-only'),
       ($2,'stage7.other','Stage 7 Other','reviewer',true,'disabled-test-hash','test-only')`,
    [ids.owner, ids.otherOwner]
  );
  const active = await pool.query<ActivePair>(
    `SELECT catalog.id AS catalog_id, rules.id AS rule_set_id
       FROM catalog_versions catalog
       JOIN rule_sets rules ON rules.catalog_version_id = catalog.id
      WHERE catalog.status = 'active' AND rules.status = 'active'
      ORDER BY catalog.activated_at DESC, rules.activated_at DESC LIMIT 1`
  );
  const pair = active.rows[0];
  assert.ok(pair, "Stage 7 requires one active catalog/rule pair");

  const initialDocument = draftDocument(1, "6");
  const create = await pool.connect();
  try {
    await create.query("BEGIN");
    await create.query(
      `INSERT INTO projects (
         id, code, name, description, status, default_locale, default_spare_percent,
         draft_version, active_catalog_version_id, active_rule_set_id,
         owner_id, created_by, updated_by
       ) VALUES ($1,'STAGE7-DB-01','Stage 7 database project v1',$2,'draft','bg',5,
                 1,$3,$4,$5,$5,$5)`,
      [
        ids.project,
        "Disposable PostgreSQL integration fixture",
        pair.catalog_id,
        pair.rule_set_id,
        ids.owner
      ]
    );
    await create.query(
      `INSERT INTO project_draft_documents (project_id,draft_version,schema_version,payload)
       VALUES ($1,1,'project-draft-document/v2',$2)`,
      [ids.project, initialDocument]
    );
    await replaceGraph(create, "6");
    await create.query(
      `INSERT INTO project_audit_events (project_id,actor_id,action,correlation_id,metadata)
       VALUES ($1,$2,'project.created','stage7-create-correlation','{"draftVersion":1}')`,
      [ids.project, ids.owner]
    );
    await create.query(
      `INSERT INTO idempotency_records (
         scope,idempotency_key,request_hash,resource_type,resource_id,response_status,
         response_schema_version,response_payload
       ) VALUES ($1,'stage7-create-0001',$2,'project',$3,201,
                 'project-draft-response/v2',$4)`,
      [
        `project.create:${ids.owner}`,
        requestHash,
        ids.project,
        { schemaVersion: "project-draft-response/v2", correlationId: "stage7-create-correlation" }
      ]
    );
    await create.query("COMMIT");
  } catch (error) {
    await create.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    create.release();
  }

  assert.deepEqual(await graphCounts(pool), {
    routes: 2,
    endpoints: 4,
    segments: 2,
    fittings: 1,
    supports: 2,
    connections: 1,
    participants: 2,
    manual_items: 1
  });
  const hydrated = await pool.query<{ draft_version: number; payload: unknown }>(
    `SELECT project.draft_version, document.payload
       FROM projects project JOIN project_draft_documents document ON document.project_id = project.id
      WHERE project.id = $1`,
    [ids.project]
  );
  assert.equal(hydrated.rows[0]?.draft_version, 1);
  assert.deepEqual(
    hydrated.rows[0]?.payload,
    initialDocument,
    "authoritative draft hydrates exactly"
  );

  const ownerVisibility = await pool.query<{ own: number; other: number; admin: number }>(
    `SELECT
       count(*) FILTER (WHERE owner_id = $2)::integer AS own,
       count(*) FILTER (WHERE owner_id = $3)::integer AS other,
       count(*)::integer AS admin
       FROM projects WHERE id = $1`,
    [ids.project, ids.owner, ids.otherOwner]
  );
  assert.deepEqual(ownerVisibility.rows[0], { own: 1, other: 0, admin: 1 });

  const retired = await pool.query<ActivePair>(
    `SELECT catalog.id AS catalog_id, rules.id AS rule_set_id
       FROM catalog_versions catalog
       JOIN rule_sets rules ON rules.catalog_version_id = catalog.id
      WHERE catalog.status <> 'active' OR rules.status <> 'active'
      ORDER BY catalog.created_at, rules.created_at
      LIMIT 1`
  );
  const retiredPair = retired.rows[0];
  assert.ok(retiredPair, "activation fixture requires one retired catalog/rule pair");
  await pool.query(
    `UPDATE projects
        SET active_catalog_version_id = $2, active_rule_set_id = $3
      WHERE id = $1`,
    [ids.project, retiredPair.catalog_id, retiredPair.rule_set_id]
  );

  const firstSave = await pool.connect();
  const competingSave = await pool.connect();
  try {
    await firstSave.query("BEGIN");
    await competingSave.query("BEGIN");
    const current = await firstSave.query<{
      draft_version: number;
      active_catalog_version_id: string;
      active_rule_set_id: string;
    }>(
      `SELECT draft_version, active_catalog_version_id, active_rule_set_id
         FROM projects WHERE id = $1 FOR UPDATE`,
      [ids.project]
    );
    assert.equal(current.rows[0]?.draft_version, 1);
    assert.equal(current.rows[0]?.active_catalog_version_id, retiredPair.catalog_id);
    assert.equal(current.rows[0]?.active_rule_set_id, retiredPair.rule_set_id);
    let competitorResolved = false;
    const competitorLock = competingSave
      .query<{ draft_version: number }>(
        "SELECT draft_version FROM projects WHERE id = $1 FOR UPDATE",
        [ids.project]
      )
      .then((result) => {
        competitorResolved = true;
        return result;
      });
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(competitorResolved, false, "competing save waits on the project row lock");

    const replacedDocument = draftDocument(2, "9");
    await firstSave.query(
      `UPDATE projects SET name = 'Stage 7 database project v2', draft_version = 2,
                           updated_at = now(), updated_by = $2,
                           active_catalog_version_id = $3, active_rule_set_id = $4
        WHERE id = $1`,
      [ids.project, ids.owner, pair.catalog_id, pair.rule_set_id]
    );
    await firstSave.query(
      `UPDATE project_draft_documents
          SET draft_version = 2, payload = $2, updated_at = now()
        WHERE project_id = $1`,
      [ids.project, replacedDocument]
    );
    await replaceGraph(firstSave, "9");
    await firstSave.query(
      `INSERT INTO project_audit_events (project_id,actor_id,action,correlation_id,metadata)
       VALUES ($1,$2,'project.draft_replaced','stage7-save-correlation','{"draftVersion":2}')`,
      [ids.project, ids.owner]
    );
    await firstSave.query(
      `INSERT INTO idempotency_records (
         scope,idempotency_key,request_hash,resource_type,resource_id,response_status,
         response_schema_version,response_payload
       ) VALUES ($1,'stage7-save-0001',$2,'projectDraft',$3,200,
                 'project-draft-response/v2',$4)`,
      [
        `project.draft:${ids.project}:${ids.owner}`,
        requestHash,
        ids.project,
        { schemaVersion: "project-draft-response/v2", correlationId: "stage7-save-correlation" }
      ]
    );
    await firstSave.query("COMMIT");

    const competitorCurrent = await competitorLock;
    assert.equal(competitorCurrent.rows[0]?.draft_version, 2);
    await competingSave.query("ROLLBACK");
  } finally {
    await firstSave.query("ROLLBACK").catch(() => undefined);
    await competingSave.query("ROLLBACK").catch(() => undefined);
    firstSave.release();
    competingSave.release();
  }

  const afterReplace = await pool.query<{
    draft_version: number;
    payload: unknown;
    length_m: string;
    active_catalog_version_id: string;
    active_rule_set_id: string;
  }>(
    `SELECT project.draft_version, document.payload, segment.length_m::text,
            project.active_catalog_version_id, project.active_rule_set_id
       FROM projects project
       JOIN project_draft_documents document ON document.project_id = project.id
       JOIN segments segment ON segment.id = $2
      WHERE project.id = $1`,
    [ids.project, ids.segmentA]
  );
  assert.equal(afterReplace.rows[0]?.draft_version, 2);
  assert.deepEqual(afterReplace.rows[0]?.payload, draftDocument(2, "9"));
  assert.equal(afterReplace.rows[0]?.length_m, "9.00000000");
  assert.equal(afterReplace.rows[0]?.active_catalog_version_id, pair.catalog_id);
  assert.equal(afterReplace.rows[0]?.active_rule_set_id, pair.rule_set_id);
  assert.deepEqual(await graphCounts(pool), {
    routes: 2,
    endpoints: 4,
    segments: 2,
    fittings: 1,
    supports: 2,
    connections: 1,
    participants: 2,
    manual_items: 1
  });

  const beforeRollback = await pool.query<{ draft_version: number; payload: unknown }>(
    `SELECT project.draft_version, document.payload
       FROM projects project JOIN project_draft_documents document ON document.project_id = project.id
      WHERE project.id = $1`,
    [ids.project]
  );
  const failed = await pool.connect();
  try {
    await failed.query("BEGIN");
    await failed.query("UPDATE projects SET draft_version = 3 WHERE id = $1", [ids.project]);
    await failed.query(
      "UPDATE project_draft_documents SET draft_version = 3, payload = $2 WHERE project_id = $1",
      [ids.project, draftDocument(3, "12")]
    );
    await failed.query(
      `INSERT INTO routes (project_id,code,name,sequence)
       VALUES ($1,'R-A','Duplicate route',99)`,
      [ids.project]
    );
    assert.fail("duplicate route code must fail the replacement transaction");
  } catch (error) {
    assert.equal(errorCode(error), "23505");
    await failed.query("ROLLBACK");
  } finally {
    failed.release();
  }
  const afterRollback = await pool.query<{ draft_version: number; payload: unknown }>(
    `SELECT project.draft_version, document.payload
       FROM projects project JOIN project_draft_documents document ON document.project_id = project.id
      WHERE project.id = $1`,
    [ids.project]
  );
  assert.deepEqual(
    afterRollback.rows[0],
    beforeRollback.rows[0],
    "failed graph save rolls back fully"
  );

  const idempotencyFirst = await pool.connect();
  const idempotencySecond = await pool.connect();
  const replayScope = `project.calculate:${ids.project}:${ids.owner}`;
  try {
    await idempotencyFirst.query("BEGIN");
    await idempotencySecond.query("BEGIN");
    await idempotencyFirst.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      replayScope
    ]);
    let secondResolved = false;
    const secondLock = idempotencySecond
      .query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [replayScope])
      .then((result) => {
        secondResolved = true;
        return result;
      });
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(secondResolved, false, "same idempotency scope serializes concurrent requests");
    await idempotencyFirst.query(
      `INSERT INTO idempotency_records (
         scope,idempotency_key,request_hash,resource_type,resource_id,response_status,
         response_schema_version,response_payload
       ) VALUES ($1,'stage7-calculate-0001',$2,'calculationDraft',$3,200,
                 'calculate-project-draft-response/v2',$4)`,
      [
        replayScope,
        requestHash,
        ids.calculation,
        {
          schemaVersion: "calculate-project-draft-response/v2",
          correlationId: "stage7-calculate-correlation"
        }
      ]
    );
    await idempotencyFirst.query("COMMIT");
    await secondLock;
    const replay = await idempotencySecond.query<{
      request_hash: string;
      response_status: number;
      response_payload: unknown;
    }>(
      `SELECT request_hash,response_status,response_payload
         FROM idempotency_records WHERE scope = $1 AND idempotency_key = $2`,
      [replayScope, "stage7-calculate-0001"]
    );
    assert.deepEqual(replay.rows[0], {
      request_hash: requestHash,
      response_status: 200,
      response_payload: {
        schemaVersion: "calculate-project-draft-response/v2",
        correlationId: "stage7-calculate-correlation"
      }
    });
    await idempotencySecond.query("COMMIT");
  } finally {
    await idempotencyFirst.query("ROLLBACK").catch(() => undefined);
    await idempotencySecond.query("ROLLBACK").catch(() => undefined);
    idempotencyFirst.release();
    idempotencySecond.release();
  }

  const revisionBefore = await pool.query<{ count: number }>(
    "SELECT count(*)::integer AS count FROM revisions WHERE project_id = $1",
    [ids.project]
  );
  await pool.query(
    `INSERT INTO calculation_drafts (
       id,project_id,calculation_schema_version,engine_version,input_fingerprint,
       idempotency_key,catalog_version_id,rule_set_id,status,correlation_id,
       input_payload,result_schema_version,result_payload,started_at,completed_at,
       calculated_draft_version
     ) VALUES ($1,$2,'calculation-input/v2','0.1.0',$3,'stage7-calculate-0001',$4,$5,
               'succeeded','stage7-calculate-correlation',$6,'calculation-result/v2',$7,
               now(),now(),2)`,
    [
      ids.calculation,
      ids.project,
      inputFingerprint,
      pair.catalog_id,
      pair.rule_set_id,
      { schemaVersion: "calculation-input/v2" },
      {
        schemaVersion: "calculation-result/v2",
        calculationRunId: ids.calculation,
        inputFingerprint
      }
    ]
  );
  const current = await pool.query<{ calculated_draft_version: number; stale: boolean }>(
    `SELECT draft.calculated_draft_version,
            draft.calculated_draft_version <> project.draft_version AS stale
       FROM calculation_drafts draft JOIN projects project ON project.id = draft.project_id
      WHERE draft.project_id = $1 AND draft.status = 'succeeded'
        AND draft.calculation_schema_version = 'calculation-input/v2'
        AND draft.result_schema_version = 'calculation-result/v2'
        AND draft.calculated_draft_version IS NOT NULL`,
    [ids.project]
  );
  assert.deepEqual(current.rows[0], { calculated_draft_version: 2, stale: false });

  await pool.query(
    `UPDATE projects SET draft_version = 3, status = 'draft', updated_at = now() WHERE id = $1`,
    [ids.project]
  );
  await pool.query(
    `UPDATE project_draft_documents
        SET draft_version = 3, payload = $2, updated_at = now() WHERE project_id = $1`,
    [ids.project, draftDocument(3, "9")]
  );
  const stale = await pool.query<{ stale: boolean }>(
    `SELECT draft.calculated_draft_version <> project.draft_version AS stale
       FROM calculation_drafts draft JOIN projects project ON project.id = draft.project_id
      WHERE draft.project_id = $1`,
    [ids.project]
  );
  assert.equal(stale.rows[0]?.stale, true, "autosave makes the retained transient result stale");

  const legacyV2Rows = await pool.query<{ count: number }>(
    `SELECT count(*)::integer AS count FROM calculation_drafts
      WHERE project_id = '00000000-0000-4000-8000-000000000801'
        AND calculation_schema_version = 'calculation-input/v2'
        AND result_schema_version = 'calculation-result/v2'
        AND calculated_draft_version IS NOT NULL`
  );
  assert.equal(legacyV2Rows.rows[0]?.count, 0, "retained pre-Stage7 drafts are not cast as v2");
  const revisionAfter = await pool.query<{ count: number }>(
    "SELECT count(*)::integer AS count FROM revisions WHERE project_id = $1",
    [ids.project]
  );
  assert.deepEqual(
    revisionAfter.rows[0],
    revisionBefore.rows[0],
    "autosave and calculate create no revision"
  );

  process.stdout.write(
    "Stage 7 PostgreSQL assertions passed: grants, authoritative hydration, atomic graph replacement, competing saves, idempotent replay, v2 transient calculation, stale state, owner filtering, and unchanged revisions.\n"
  );
} finally {
  await pool.end();
}
