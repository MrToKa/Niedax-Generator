import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  CalculationInputV2Schema,
  CalculationResultV2Schema,
  ProjectDraftInputV2Schema,
  type ProjectDraftInputV2
} from "@niedax/domain";
import { Pool } from "pg";

import { PgProjectRepository, type ProjectActor } from "../src/project-repository.js";
import { ProjectApplicationService } from "../src/project-service.js";

const enabled = process.env.STAGE7_ACCEPTANCE === "1";

const ids = {
  actor: "30000000-0000-4000-8000-000000000001",
  catalog: "70000000-0000-4000-8000-000000000001",
  rules: "70000000-0000-4000-8000-000000000002",
  source: "70000000-0000-4000-8000-000000000003",
  straight: "70000000-0000-4000-8000-000000000004",
  support: "70000000-0000-4000-8000-000000000005",
  anchor: "70000000-0000-4000-8000-000000000006",
  selectionRule: "70000000-0000-4000-8000-000000000008",
  anchorRule: "70000000-0000-4000-8000-000000000009",
  template: "70000000-0000-4000-8000-000000000012",
  supportComponent: "70000000-0000-4000-8000-000000000013",
  anchorComponent: "70000000-0000-4000-8000-000000000014",
  routeA: "70000000-0000-4000-8000-000000000021",
  routeAStart: "70000000-0000-4000-8000-000000000022",
  routeAEnd: "70000000-0000-4000-8000-000000000023",
  segmentA: "70000000-0000-4000-8000-000000000024",
  routeB: "70000000-0000-4000-8000-000000000025",
  routeBStart: "70000000-0000-4000-8000-000000000026",
  routeBEnd: "70000000-0000-4000-8000-000000000027",
  segmentB: "70000000-0000-4000-8000-000000000028",
  connection: "70000000-0000-4000-8000-000000000029",
  manual: "70000000-0000-4000-8000-000000000030"
} as const;

const hash = (character: string): string => `sha256:${character.repeat(64)}`;

function databasePool(): Pool {
  const password = process.env.PGPASSWORD;
  if (!password) throw new Error("The isolated Stage 7 acceptance database password is missing");
  return new Pool({
    host: process.env.PGHOST ?? "postgres",
    port: Number(process.env.PGPORT ?? "5432"),
    database: process.env.PGDATABASE ?? "niedax_generator",
    user: process.env.PGUSER ?? "niedax_generator_migrator",
    password,
    max: 3,
    connectionTimeoutMillis: 5_000,
    ssl: false
  });
}

async function seedAcceptanceCatalog(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO catalog_versions (
         id,scope,version,label,source_metadata,content_hash,status,import_provenance,
         validation_schema_version,validated_at,validated_content_hash,approved_at,
         approved_content_hash,activated_at
       ) VALUES ($1,'stage7-acceptance','acceptance-v2','Stage 7 disposable acceptance catalog',
                 '{"fixture":true,"authoritative":false}',$2,'active',
                 '{"kind":"isolatedAcceptanceFixture"}','catalog-import-validation-result/v1',
                 now(),$2,now(),$2,now())`,
      [ids.catalog, hash("7")]
    );
    await client.query(
      `INSERT INTO rule_sets (
         id,scope,version,label,content_hash,schema_version,catalog_version_id,status,
         validated_at,activated_at,provenance
       ) VALUES ($1,'stage7-acceptance','acceptance-v2','Stage 7 disposable acceptance rules',
                 $2,'rule-set/v1',$3,'active',now(),now(),
                 '{"fixture":true,"authoritative":false}')`,
      [ids.rules, hash("8"), ids.catalog]
    );
    await client.query(
      `INSERT INTO product_sources (
         id,catalog_version_id,document_identity,title,edition,source_page,locale,
         reference_uri,source_hash,verification_status,verified_at
       ) VALUES ($1,$2,'stage7-disposable-evidence',
                 'Stage 7 synthetic acceptance evidence — not a product source',
                 'acceptance-v2','fixture-1','en','repo:apps/backend/tests/project-flow.integration.test.ts',
                 $3,'verified',now())`,
      [ids.source, ids.catalog, hash("9")]
    );
    await client.query(
      `INSERT INTO products (
         id,catalog_version_id,product_code,category,family,series,description_en,
         material,coating,variant_key,base_unit,minimum_package_quantity,packaging_unit,
         availability_status,metadata,is_orderable,engineering_verification_required,
         engineering_note
       ) VALUES
         ($1,$4,'S7-SYN-STRAIGHT','straightSection','S7-SYN','S7','Synthetic 6 m straight section',
          'steel','F','60x200','m',6,'m','active','{"lengthMm":"6000"}',true,false,NULL),
         ($2,$4,'S7-SYN-SUPPORT','support','S7-SUPPORT','S7','Synthetic wall support',
          'steel','F','wall','pcs',1,'pcs','active','{}',true,false,NULL),
         ($3,$4,'S7-SYN-ANCHOR','anchor','S7-ANCHOR','S7','Synthetic anchor',
          'steel','F','concrete','pcs',10,'pcs','active','{}',true,true,
          'Acceptance fixture only; engineering review is always required.')`,
      [ids.straight, ids.support, ids.anchor, ids.catalog]
    );
    await client.query(
      `INSERT INTO product_source_links (product_id,catalog_version_id,source_id,fact_scope,is_primary)
       SELECT product_id,$4,$5,'product',true
         FROM (VALUES ($1::uuid),($2::uuid),($3::uuid)) AS fixture(product_id)`,
      [ids.straight, ids.support, ids.anchor, ids.catalog, ids.source]
    );
    await client.query(
      `INSERT INTO compatibility_rules (
         id,rule_set_id,stable_code,version,status,priority,decision,
         condition_schema_version,condition_payload,outcome_schema_version,outcome_payload,
         reason_en,confidence,source_id
       ) VALUES
         ($1,$3,'S7-EXACT-SELECTION','acceptance-v2','active',10,'allowed',
          'compatibility-condition/v1',
          '{"relationType":"project_selection","sourceProductCode":"S7-SYN-STRAIGHT","system":"S7","heightMm":"60","widthMm":"200","materialCode":"steel","finishCode":"F"}',
          'compatibility-outcome/v1','{"allowed":true}',
          'Exact disposable selection evidence','catalogConfirmed',$4),
         ($2,$3,'S7-ANCHOR-CONCRETE','acceptance-v2','active',20,'allowed',
          'compatibility-condition/v1',
          '{"relationType":"anchor_substrate","sourceProductCode":"S7-SYN-ANCHOR"}',
          'compatibility-outcome/v1','{"targetSelector":{"substrate":"concrete"},"allowed":true}',
          'Disposable substrate evidence requiring engineering review','engineeringReview',$4)`,
      [ids.selectionRule, ids.anchorRule, ids.rules, ids.source]
    );
    await client.query(
      `INSERT INTO assembly_templates (
         id,catalog_version_id,rule_set_id,stable_code,version,status,template_type,
         name_en,description_en,applicability_schema_version,applicability,source_id
       ) VALUES ($1,$2,$3,'S7-WALL-SUPPORT','acceptance-v2','active','wall',
                 'Synthetic wall support assembly','Disposable acceptance fixture only',
                 'assembly-applicability/v1',
                 '{"system":"S7","engineeringVerificationRequired":true}',$4)`,
      [ids.template, ids.catalog, ids.rules, ids.source]
    );
    await client.query(
      `INSERT INTO template_components (
         id,template_id,catalog_version_id,component_role,product_id,quantity,unit,
         sequence,is_required,suppress_when_included,anchor_count,metadata
       ) VALUES
         ($1,$3,$4,'support',$5,1,'pcs',0,true,false,NULL,
          '{"quantityMode":"per_support"}'),
         ($2,$3,$4,'anchor',$6,2,'pcs',1,true,false,2,
          '{"quantityMode":"per_support"}')`,
      [
        ids.supportComponent,
        ids.anchorComponent,
        ids.template,
        ids.catalog,
        ids.support,
        ids.anchor
      ]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function emptyDraft(): ProjectDraftInputV2 {
  return ProjectDraftInputV2Schema.parse({
    code: "S7-ACCEPTANCE-FLOW",
    name: "Stage 7 two-route acceptance",
    description: "Disposable persisted application-service acceptance project",
    defaultLocale: "bg",
    defaultReservePercent: "5",
    cableLoad: null,
    routes: [],
    connections: [],
    accessoryProductIds: [],
    manualItems: []
  });
}

function completeDraft(): ProjectDraftInputV2 {
  const selection = {
    system: "S7",
    dimensionId: "dimension:S7:60x200",
    width: { value: "200", unit: "mm" },
    height: { value: "60", unit: "mm" },
    materialCode: "steel",
    finishCode: "F",
    straightProductId: ids.straight,
    defaultSupplyOptionId: `supply:${ids.straight}:6000`
  } as const;
  const supports = {
    spacing: { value: "1.5", unit: "m" },
    supportType: "wall",
    supportProductId: ids.support,
    assemblyTemplateId: ids.template,
    levelCount: null,
    substrate: "concrete",
    anchorProductId: ids.anchor,
    anchorQuantityOverride: null,
    wstbProductId: null,
    wstb: { mode: "one" },
    manualAdditionalSupports: [],
    templateManualValues: []
  } as const;
  const endpoint = (id: string, type: "freeEnd" | "routeContinuation") => ({
    id,
    type,
    selectedProductId: null,
    equipmentReference: null,
    customDescription: null
  });
  return ProjectDraftInputV2Schema.parse({
    ...emptyDraft(),
    routes: [
      {
        id: ids.routeA,
        code: "R-A",
        name: "Route A",
        description: "First acceptance route",
        selection,
        startEndpoint: endpoint(ids.routeAStart, "freeEnd"),
        endEndpoint: endpoint(ids.routeAEnd, "routeContinuation"),
        geometry: [
          {
            id: ids.segmentA,
            kind: "straight",
            length: { value: "3", unit: "m" },
            supplyOptionId: `supply:${ids.straight}:6000`
          }
        ],
        supports
      },
      {
        id: ids.routeB,
        code: "R-B",
        name: "Route B",
        description: "Second acceptance route",
        selection,
        startEndpoint: endpoint(ids.routeBStart, "routeContinuation"),
        endEndpoint: endpoint(ids.routeBEnd, "freeEnd"),
        geometry: [
          {
            id: ids.segmentB,
            kind: "straight",
            length: { value: "3", unit: "m" },
            supplyOptionId: `supply:${ids.straight}:6000`
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
    manualItems: [
      {
        id: ids.manual,
        kind: "freeText",
        productId: null,
        productCode: null,
        descriptionEn: "Site supplied marker",
        quantity: { value: "2", unit: "pcs" },
        reason: "Explicit acceptance requirement",
        note: "Must remain Manual in the result",
        reservePolicy: { mode: "projectDefault" },
        packagingPolicy: { mode: "disabled", metadata: null },
        quantityOverride: null
      }
    ]
  });
}

describe.skipIf(!enabled)("Stage 7 persisted two-route application flow", () => {
  let pool: Pool;
  let service: ProjectApplicationService;
  const actor: ProjectActor = {
    id: ids.actor,
    role: "reviewer",
    displayName: "Stage 7 Owner"
  };

  beforeAll(async () => {
    pool = databasePool();
    await seedAcceptanceCatalog(pool);
    service = new ProjectApplicationService(new PgProjectRepository(pool));
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("persists draft changes, reloads and calculates two connected routes without a revision", async () => {
    const revisionsBefore = await pool.query<{ count: number }>(
      "SELECT count(*)::integer AS count FROM revisions"
    );
    const created = await service.createProject(
      actor,
      { schemaVersion: "create-project-draft-request/v2", draft: emptyDraft() },
      "stage7-acceptance-create-0001",
      "stage7-acceptance-create-correlation"
    );
    expect(created.statusCode).toBe(201);
    const projectId = created.body.project.id;
    const draft = completeDraft();
    const draftWithInitialManualItem = ProjectDraftInputV2Schema.parse({
      ...draft,
      manualItems: draft.manualItems.map((item) => ({
        ...item,
        descriptionEn: "Temporary site marker",
        note: "Initial manual item"
      }))
    });
    const savedInitialManualItem = await service.replaceProject(
      actor,
      projectId,
      {
        schemaVersion: "replace-project-draft-request/v2",
        expectedDraftVersion: created.body.project.draftVersion,
        draft: draftWithInitialManualItem
      },
      "stage7-acceptance-save-initial-manual",
      "stage7-acceptance-save-initial-manual-correlation"
    );
    const draftWithEditedManualItem = ProjectDraftInputV2Schema.parse({
      ...draftWithInitialManualItem,
      manualItems: draftWithInitialManualItem.manualItems.map((item) => ({
        ...item,
        descriptionEn: "Edited site marker",
        note: "Edited manual item"
      }))
    });
    const savedEditedManualItem = await service.replaceProject(
      actor,
      projectId,
      {
        schemaVersion: "replace-project-draft-request/v2",
        expectedDraftVersion: savedInitialManualItem.body.project.draftVersion,
        draft: draftWithEditedManualItem
      },
      "stage7-acceptance-save-edited-manual",
      "stage7-acceptance-save-edited-manual-correlation"
    );
    const draftWithoutManualItems = ProjectDraftInputV2Schema.parse({
      ...draftWithEditedManualItem,
      manualItems: []
    });
    const savedWithoutManualItems = await service.replaceProject(
      actor,
      projectId,
      {
        schemaVersion: "replace-project-draft-request/v2",
        expectedDraftVersion: savedEditedManualItem.body.project.draftVersion,
        draft: draftWithoutManualItems
      },
      "stage7-acceptance-save-without-manual",
      "stage7-acceptance-save-without-manual-correlation"
    );
    const saved = await service.replaceProject(
      actor,
      projectId,
      {
        schemaVersion: "replace-project-draft-request/v2",
        expectedDraftVersion: savedWithoutManualItems.body.project.draftVersion,
        draft
      },
      "stage7-acceptance-save-final-manual",
      "stage7-acceptance-save-final-manual-correlation"
    );
    expect(saved.statusCode).toBe(200);
    expect(saved.body.project.draftVersion).toBe(5);
    expect(saved.body.catalogSnapshot.snapshotId).toBe(ids.catalog);
    expect(saved.body.ruleSnapshot.snapshotId).toBe(ids.rules);
    const projectBeforeCalculation = await pool.query<{
      status: string;
      updated_at: Date;
      updated_by: string | null;
    }>("SELECT status,updated_at,updated_by FROM projects WHERE id = $1", [projectId]);

    const reloaded = await service.getProject(
      actor,
      projectId,
      "stage7-acceptance-reload-correlation"
    );
    expect(reloaded.catalogSnapshot).toEqual(saved.body.catalogSnapshot);
    expect(reloaded.ruleSnapshot).toEqual(saved.body.ruleSnapshot);
    expect(reloaded.project.routes).toHaveLength(2);
    expect(reloaded.project.connections).toEqual(draft.connections);
    expect(reloaded.project.manualItems).toEqual(draft.manualItems);
    expect(
      ProjectDraftInputV2Schema.parse({
        code: reloaded.project.code,
        name: reloaded.project.name,
        description: reloaded.project.description,
        defaultLocale: reloaded.project.defaultLocale,
        defaultReservePercent: reloaded.project.defaultReservePercent,
        cableLoad: reloaded.project.cableLoad,
        routes: reloaded.project.routes,
        connections: reloaded.project.connections,
        accessoryProductIds: reloaded.project.accessoryProductIds,
        manualItems: reloaded.project.manualItems
      })
    ).toEqual(draft);

    const validation = await service.validateProject(
      actor,
      projectId,
      {
        schemaVersion: "validate-project-draft-request/v2",
        expectedDraftVersion: reloaded.project.draftVersion
      },
      "stage7-acceptance-validate-correlation"
    );
    expect(validation.blockingErrors).toEqual([]);
    expect(validation.canCalculate).toBe(true);
    expect(validation.engineeringReview).toContainEqual(
      expect.objectContaining({ code: "UNRESOLVED_JOINT_PRODUCT" })
    );

    const calculation = await service.calculateProject(
      actor,
      projectId,
      {
        schemaVersion: "calculate-project-draft-request/v2",
        expectedDraftVersion: reloaded.project.draftVersion
      },
      "stage7-acceptance-calculate-0001",
      "stage7-acceptance-calculate-correlation"
    );
    expect(calculation.statusCode).toBe(200);
    expect(calculation.body.calculation.result.calculationStatus).toBe("completeWithWarnings");
    expect(calculation.body.calculation.result.summary.approvalReady).toBe(false);
    expect(calculation.body.calculation.result.warnings).toContainEqual(
      expect.objectContaining({
        code: "UNRESOLVED_JOINT_PRODUCT",
        severity: "blocking",
        approvalImpact: "blocksApproval"
      })
    );
    expect(calculation.body.calculation.result.bomLines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ productId: ids.straight }),
        expect.objectContaining({ kind: "manual", manualInputId: ids.manual })
      ])
    );

    const current = await service.getCurrentCalculation(
      actor,
      projectId,
      "stage7-acceptance-current-correlation"
    );
    expect(current.calculation?.stale).toBe(false);
    expect(current.calculation?.run.id).toBe(calculation.body.calculation.run.id);
    expect(current.calculation?.result).toEqual(calculation.body.calculation.result);

    const persisted = await pool.query<{
      input_payload: unknown;
      result_payload: unknown;
      calculated_draft_version: number;
    }>(
      `SELECT input_payload,result_payload,calculated_draft_version
         FROM calculation_drafts WHERE project_id = $1`,
      [projectId]
    );
    const input = CalculationInputV2Schema.parse(persisted.rows[0]?.input_payload);
    const result = CalculationResultV2Schema.parse(persisted.rows[0]?.result_payload);
    expect(input.project.routes.map((route) => route.id)).toEqual([ids.routeA, ids.routeB]);
    expect(input.project.connections.map((connection) => connection.id)).toEqual([ids.connection]);
    expect(input.manualItems.map((item) => item.id)).toEqual([ids.manual]);
    expect(result.calculationRunId).toBe(calculation.body.calculation.run.id);
    expect(persisted.rows[0]?.calculated_draft_version).toBe(5);

    const warningRows = await pool.query<{ count: number }>(
      `SELECT count(*)::integer AS count FROM warnings WHERE calculation_draft_id = $1`,
      [calculation.body.calculation.run.id]
    );
    expect(warningRows.rows[0]?.count).toBe(result.warnings.length);

    const replay = await service.calculateProject(
      actor,
      projectId,
      {
        schemaVersion: "calculate-project-draft-request/v2",
        expectedDraftVersion: reloaded.project.draftVersion
      },
      "stage7-acceptance-calculate-0001",
      "stage7-acceptance-replay-correlation"
    );
    expect(replay.replayed).toBe(true);
    expect(replay.body.calculation.run.id).toBe(calculation.body.calculation.run.id);

    const revisionsAfter = await pool.query<{ count: number }>(
      "SELECT count(*)::integer AS count FROM revisions"
    );
    expect(revisionsAfter.rows[0]).toEqual(revisionsBefore.rows[0]);
    const projectAfterCalculation = await pool.query<{
      status: string;
      updated_at: Date;
      updated_by: string | null;
    }>("SELECT status,updated_at,updated_by FROM projects WHERE id = $1", [projectId]);
    expect(projectAfterCalculation.rows[0]).toEqual(projectBeforeCalculation.rows[0]);
  });
});
