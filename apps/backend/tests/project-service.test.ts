import { describe, expect, it, vi } from "vitest";

import expectedResult from "../../../packages/calculation-engine/tests/golden/expected/all-major-rules-combined.json" with { type: "json" };
import {
  CalculateProjectDraftResponseV2Schema,
  CalculationResultV2Schema,
  ProjectDraftInputV2Schema,
  type ProjectDraftInputV2
} from "@niedax/domain";

import {
  type CatalogContextRecord,
  type CatalogProductRow,
  type PgProjectRepository,
  type ProjectActor,
  type ProjectCalculationContext
} from "../src/project-repository.js";
import { ProjectApplicationService } from "../src/project-service.js";

const ids = {
  project: "10000000-0000-4000-8000-000000000001",
  actor: "10000000-0000-4000-8000-000000000002",
  catalog: "10000000-0000-4000-8000-000000000003",
  rules: "10000000-0000-4000-8000-000000000004",
  route: "10000000-0000-4000-8000-000000000005",
  start: "10000000-0000-4000-8000-000000000006",
  end: "10000000-0000-4000-8000-000000000007",
  segment: "10000000-0000-4000-8000-000000000008",
  straight: "10000000-0000-4000-8000-000000000009",
  support: "10000000-0000-4000-8000-000000000010",
  wstb: "10000000-0000-4000-8000-000000000011",
  pair: "10000000-0000-4000-8000-000000000012",
  safeTemplate: "10000000-0000-4000-8000-000000000013",
  unsafeTemplate: "10000000-0000-4000-8000-000000000014",
  safeComponent: "10000000-0000-4000-8000-000000000015",
  unsafeComponent: "10000000-0000-4000-8000-000000000016",
  selectionRule: "10000000-0000-4000-8000-000000000017",
  run: "10000000-0000-4000-8000-000000000018",
  invalidModeTemplate: "10000000-0000-4000-8000-000000000019",
  invalidModeComponent: "10000000-0000-4000-8000-000000000020",
  expressionTemplate: "10000000-0000-4000-8000-000000000021",
  expressionComponent: "10000000-0000-4000-8000-000000000022",
  anchor: "10000000-0000-4000-8000-000000000023",
  supportComponent: "10000000-0000-4000-8000-000000000024",
  anchorComponent: "10000000-0000-4000-8000-000000000025",
  wstbComponent: "10000000-0000-4000-8000-000000000026",
  anchorRule: "10000000-0000-4000-8000-000000000027",
  routeB: "10000000-0000-4000-8000-000000000028",
  routeBStart: "10000000-0000-4000-8000-000000000029",
  routeBEnd: "10000000-0000-4000-8000-000000000030",
  segmentB: "10000000-0000-4000-8000-000000000031",
  connection: "10000000-0000-4000-8000-000000000032",
  manual: "10000000-0000-4000-8000-000000000033",
  joint: "10000000-0000-4000-8000-000000000034",
  jointRule: "10000000-0000-4000-8000-000000000035"
} as const;

const actor: ProjectActor = {
  id: ids.actor,
  role: "reviewer",
  displayName: "Stage 7 Reviewer"
};
const correlationId = "stage7-service-correlation";
const snapshotHash = `sha256:${"a".repeat(64)}`;

function product(
  id: string,
  code: string,
  category: string,
  overrides: Partial<CatalogProductRow> = {}
): CatalogProductRow {
  return {
    id,
    product_code: code,
    description_en: `${code} description`,
    category,
    family: null,
    series: null,
    material: null,
    coating: null,
    base_unit: "pcs",
    minimum_package_quantity: "1",
    packaging_unit: "pcs",
    availability_status: "active",
    is_orderable: true,
    engineering_verification_required: false,
    metadata: {},
    source_id: ids.catalog,
    source_document: "catalog.pdf",
    source_page: "P1",
    ...overrides
  };
}

function catalog(overrides: Partial<CatalogContextRecord> = {}): CatalogContextRecord {
  return {
    pair: {
      catalog_id: ids.catalog,
      catalog_version: "2022-p0",
      catalog_content_hash: snapshotHash,
      catalog_status: "active",
      rule_set_id: ids.rules,
      rule_set_version: "2022-p0",
      rule_set_content_hash: snapshotHash,
      rule_set_status: "active"
    },
    products: [],
    includedItems: [],
    compatibilityRules: [],
    calculationRules: [],
    templates: [],
    templateComponents: [],
    ...overrides
  };
}

function draft(dimensionId: string): ProjectDraftInputV2 {
  return ProjectDraftInputV2Schema.parse({
    code: "P-SERVICE",
    name: "Service project",
    description: null,
    defaultLocale: "bg",
    defaultReservePercent: "0",
    cableLoad: null,
    routes: [
      {
        id: ids.route,
        code: "R-1",
        name: "Route 1",
        description: null,
        selection: {
          system: "KL",
          dimensionId,
          width: { value: "200", unit: "mm" },
          height: { value: "60", unit: "mm" },
          materialCode: "steel",
          finishCode: "F",
          straightProductId: ids.straight,
          defaultSupplyOptionId: `supply:${ids.straight}:6000`
        },
        startEndpoint: {
          id: ids.start,
          type: "freeEnd",
          selectedProductId: null,
          equipmentReference: null,
          customDescription: null
        },
        endEndpoint: {
          id: ids.end,
          type: "freeEnd",
          selectedProductId: null,
          equipmentReference: null,
          customDescription: null
        },
        geometry: [
          {
            id: ids.segment,
            kind: "straight",
            length: { value: "6", unit: "m" },
            supplyOptionId: `supply:${ids.straight}:6000`
          }
        ],
        supports: {
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
        }
      }
    ],
    connections: [],
    accessoryProductIds: [],
    manualItems: []
  });
}

function calculationContext(projectDraft: ProjectDraftInputV2): ProjectCalculationContext {
  const straight = product(ids.straight, "KL 60.203 F", "straightSection", {
    family: "KL",
    series: "KL",
    material: "steel",
    coating: "F",
    base_unit: "m",
    minimum_package_quantity: "6",
    packaging_unit: "m",
    metadata: { lengthMm: "6000" }
  });
  return {
    project: {
      id: ids.project,
      status: "draft",
      draftVersion: 1,
      ownerId: ids.actor,
      ownerDisplayName: actor.displayName,
      catalogVersionId: ids.catalog,
      catalogVersion: "2022-p0",
      catalogContentHash: `sha256:${"1".repeat(64)}`,
      ruleSetId: ids.rules,
      ruleSetVersion: "2022-p0",
      ruleSetContentHash: `sha256:${"2".repeat(64)}`,
      createdAt: "2026-09-01T08:00:00.000Z",
      updatedAt: "2026-09-01T08:00:00.000Z",
      document: { schemaVersion: "project-draft-document/v2", draft: projectDraft }
    },
    catalog: catalog({
      products: [straight],
      compatibilityRules: [
        {
          id: ids.selectionRule,
          stable_code: "KL-SELECTION",
          version: "2022-p0",
          decision: "allowed",
          confidence: "catalogConfirmed",
          condition_payload: {
            relationType: "project_selection",
            sourceProductCode: straight.product_code,
            system: "KL",
            widthMm: "200",
            heightMm: "60",
            materialCode: "steel",
            finishCode: "F"
          },
          outcome_payload: { allowed: true },
          source_id: ids.catalog,
          source_document: "catalog.pdf",
          source_page: "P1"
        }
      ]
    })
  };
}

describe("Stage 7 project application service", () => {
  it("exposes history but no draft mutations for an authorized retained project", async () => {
    const repository = {
      getProjectMetadataForAccess: vi.fn(async () => ({
        ownerId: "10000000-0000-4000-8000-000000000099",
        editorState: "retainedReadOnly" as const
      }))
    } as unknown as PgProjectRepository;
    const response = await new ProjectApplicationService(repository).getProjectAccess(
      actor,
      ids.project,
      correlationId
    );

    expect(response.access).toEqual({
      canEditDraft: false,
      canValidate: false,
      canCalculate: false,
      canSaveRevision: false,
      canReadHistory: true
    });
    expect(repository.getProjectMetadataForAccess).toHaveBeenCalledWith(ids.project, actor);
  });

  it("hydrates the draft with its pinned catalog and rule references", async () => {
    const context = calculationContext(draft("dimension:KL:60x200"));
    const repository = {
      getProject: vi.fn(async () => context.project)
    } as unknown as PgProjectRepository;
    const response = await new ProjectApplicationService(repository).getProject(
      actor,
      ids.project,
      correlationId
    );
    expect(response.catalogSnapshot).toEqual({
      snapshotId: ids.catalog,
      version: "2022-p0",
      contentHash: `sha256:${"1".repeat(64)}`
    });
    expect(response.ruleSnapshot).toEqual({
      snapshotId: ids.rules,
      version: "2022-p0",
      contentHash: `sha256:${"2".repeat(64)}`
    });
  });

  it("replays a calculation before reading mutable draft or catalog state", async () => {
    const result = CalculationResultV2Schema.parse({
      ...expectedResult,
      calculationRunId: ids.run
    });
    const response = CalculateProjectDraftResponseV2Schema.parse({
      schemaVersion: "calculate-project-draft-response/v2",
      correlationId,
      calculation: {
        projectId: ids.project,
        draftVersion: 1,
        run: {
          id: ids.run,
          status: "succeeded",
          inputFingerprint: result.inputFingerprint,
          engineVersion: result.engineVersion,
          catalogSnapshot: result.catalogSnapshot,
          ruleSnapshot: result.ruleSnapshot,
          startedAt: "2026-09-01T08:00:00.000Z",
          completedAt: "2026-09-01T08:00:01.000Z"
        },
        result,
        stale: false
      }
    });
    const repository = {
      findCalculationReplay: vi.fn(async () => ({
        statusCode: 200,
        response,
        replayed: true
      })),
      getCalculationContext: vi.fn(async () => {
        throw new Error("mutable state must not be read on replay");
      })
    } as unknown as PgProjectRepository;
    const service = new ProjectApplicationService(repository);
    const replay = await service.calculateProject(
      actor,
      ids.project,
      { schemaVersion: "calculate-project-draft-request/v2", expectedDraftVersion: 1 },
      "calculation-replay-0001",
      correlationId
    );
    expect(replay).toEqual({ statusCode: 200, body: response, replayed: true });
    expect(repository.findCalculationReplay).toHaveBeenCalledOnce();
    expect(repository.getCalculationContext).not.toHaveBeenCalled();
  });

  it("excludes unsupported order units and any template that depends on them", async () => {
    const wstb = product(ids.wstb, "WSTB 2", "wstb", {
      engineering_verification_required: true
    });
    const pairs = product(ids.pair, "SKK 60", "connector", {
      base_unit: "pairs",
      packaging_unit: "pairs"
    });
    const context = catalog({
      products: [wstb, pairs],
      templates: [
        {
          id: ids.safeTemplate,
          stable_code: "WSL-WALL-WSTB",
          version: "2022-p0",
          status: "active",
          template_type: "wall",
          name_en: "WSL wall WSTB",
          applicability: { system: "WSL", engineeringVerificationRequired: true },
          source_id: ids.catalog,
          source_document: "catalog.pdf",
          source_page: "P2"
        },
        {
          id: ids.unsafeTemplate,
          stable_code: "UNSUPPORTED-PAIR",
          version: "2022-p0",
          status: "active",
          template_type: "wall",
          name_en: "Unsupported pair template",
          applicability: { system: "KL", engineeringVerificationRequired: true },
          source_id: ids.catalog,
          source_document: "catalog.pdf",
          source_page: "P3"
        },
        {
          id: ids.invalidModeTemplate,
          stable_code: "UNKNOWN-MODE",
          version: "2022-p0",
          status: "active",
          template_type: "wall",
          name_en: "Unknown mode template",
          applicability: { system: "WSL", engineeringVerificationRequired: true },
          source_id: ids.catalog,
          source_document: "catalog.pdf",
          source_page: "P4"
        },
        {
          id: ids.expressionTemplate,
          stable_code: "UNMAPPED-EXPRESSION",
          version: "2022-p0",
          status: "active",
          template_type: "wall",
          name_en: "Expression template",
          applicability: { system: "WSL", engineeringVerificationRequired: true },
          source_id: ids.catalog,
          source_document: "catalog.pdf",
          source_page: "P5"
        }
      ],
      templateComponents: [
        {
          id: ids.safeComponent,
          template_id: ids.safeTemplate,
          component_role: "support",
          product_id: ids.wstb,
          quantity: "1",
          quantity_expression: null,
          unit: "pcs",
          suppress_when_included: false,
          metadata: { quantityMode: "per_support" }
        },
        {
          id: ids.unsafeComponent,
          template_id: ids.unsafeTemplate,
          component_role: "accessory",
          product_id: ids.pair,
          quantity: "1",
          quantity_expression: null,
          unit: "pairs",
          suppress_when_included: false,
          metadata: { quantityMode: "fixed" }
        },
        {
          id: ids.invalidModeComponent,
          template_id: ids.invalidModeTemplate,
          component_role: "support",
          product_id: ids.wstb,
          quantity: "1",
          quantity_expression: null,
          unit: "pcs",
          suppress_when_included: false,
          metadata: { quantityMode: "invented_mode" }
        },
        {
          id: ids.expressionComponent,
          template_id: ids.expressionTemplate,
          component_role: "support",
          product_id: ids.wstb,
          quantity: null,
          quantity_expression: { formula: "unsupported" },
          unit: "pcs",
          suppress_when_included: false,
          metadata: { quantityMode: "per_support" }
        }
      ]
    });
    const repository = {
      getActiveCatalogContext: vi.fn(async () => context)
    } as unknown as PgProjectRepository;
    const response = await new ProjectApplicationService(repository).getEditorCatalog(
      actor,
      correlationId
    );
    expect(response.products.map((item) => item.id)).toEqual([ids.wstb]);
    expect(response.products[0]?.role).toBe("wstb");
    expect(response.assemblyTemplates.map((item) => item.id)).toEqual([ids.safeTemplate]);
    expect(response.assemblyTemplates[0]?.components[0]?.role).toBe("wstb");
  });

  it("requires the derived dimension identifier in exact project-selection evidence", async () => {
    const context = calculationContext(draft("dimension:KL:wrong"));
    const repository = {
      getCalculationContext: vi.fn(async () => context)
    } as unknown as PgProjectRepository;
    const response = await new ProjectApplicationService(repository).validateProject(
      actor,
      ids.project,
      { schemaVersion: "validate-project-draft-request/v2", expectedDraftVersion: 1 },
      correlationId
    );
    expect(response.canCalculate).toBe(false);
    expect(response.blockingErrors).toContainEqual(
      expect.objectContaining({ code: "PROJECT_SELECTION_RULE_MISSING" })
    );
  });

  it("does not reclassify an arbitrary selected product as a support", async () => {
    const projectDraft = draft("dimension:KL:60x200");
    const fitting = product(ids.support, "ARBITRARY FITTING", "fitting");
    const crafted = ProjectDraftInputV2Schema.parse({
      ...projectDraft,
      routes: projectDraft.routes.map((route) => ({
        ...route,
        supports: { ...route.supports, supportProductId: fitting.id }
      }))
    });
    const baseline = calculationContext(crafted);
    const context: ProjectCalculationContext = {
      ...baseline,
      catalog: { ...baseline.catalog, products: [...baseline.catalog.products, fitting] }
    };
    const repository = {
      getCalculationContext: vi.fn(async () => context)
    } as unknown as PgProjectRepository;
    const response = await new ProjectApplicationService(repository).validateProject(
      actor,
      ids.project,
      { schemaVersion: "validate-project-draft-request/v2", expectedDraftVersion: 1 },
      correlationId
    );
    expect(response.blockingErrors).toContainEqual(
      expect.objectContaining({ code: "SUPPORT_RULE_MISSING" })
    );
  });

  it("blocks inactive manual catalog products and inactive selected templates", async () => {
    const baselineDraft = draft("dimension:KL:60x200");
    const inactive = product(ids.support, "INACTIVE MANUAL", "accessory", {
      availability_status: "retired",
      base_unit: "m",
      packaging_unit: "m"
    });
    const crafted = ProjectDraftInputV2Schema.parse({
      ...baselineDraft,
      routes: baselineDraft.routes.map((route) => ({
        ...route,
        supports: { ...route.supports, assemblyTemplateId: ids.safeTemplate }
      })),
      manualItems: [
        {
          id: ids.safeComponent,
          kind: "catalog",
          productId: inactive.id,
          quantity: { value: "1", unit: "pcs" },
          reason: "Explicit site demand",
          note: null,
          reservePolicy: { mode: "projectDefault" },
          packagingPolicy: { mode: "catalogDefault" },
          quantityOverride: null
        }
      ]
    });
    const baseline = calculationContext(crafted);
    const context: ProjectCalculationContext = {
      ...baseline,
      catalog: {
        ...baseline.catalog,
        products: [...baseline.catalog.products, inactive],
        templates: [
          {
            id: ids.safeTemplate,
            stable_code: "RETIRED-TEMPLATE",
            version: "2022-p0",
            status: "retired",
            template_type: "wall",
            name_en: "Retired template",
            applicability: { system: "KL" },
            source_id: ids.catalog,
            source_document: "catalog.pdf",
            source_page: "P4"
          }
        ]
      }
    };
    const repository = {
      getCalculationContext: vi.fn(async () => context)
    } as unknown as PgProjectRepository;
    const response = await new ProjectApplicationService(repository).validateProject(
      actor,
      ids.project,
      { schemaVersion: "validate-project-draft-request/v2", expectedDraftVersion: 1 },
      correlationId
    );
    expect(response.blockingErrors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "MANUAL_CATALOG_PRODUCT_NOT_ORDERABLE" }),
        expect.objectContaining({ code: "MANUAL_CATALOG_UNIT_MISMATCH" }),
        expect.objectContaining({ code: "ASSEMBLY_TEMPLATE_MISSING" })
      ])
    );
  });

  it("requires a WSTB product only when the exact active template contains one", async () => {
    const baseDraft = draft("dimension:KL:60x200");
    const selectedDraft = ProjectDraftInputV2Schema.parse({
      ...baseDraft,
      routes: baseDraft.routes.map((route) => ({
        ...route,
        selection: {
          ...route.selection,
          system: "WSL",
          dimensionId: "dimension:WSL:60x200"
        },
        supports: {
          ...route.supports,
          spacing: { value: "1.5", unit: "m" },
          supportType: "wall",
          assemblyTemplateId: ids.safeTemplate,
          wstbProductId: null,
          wstb: { mode: "one" }
        }
      }))
    });
    const baseline = calculationContext(selectedDraft);
    const straight = product(ids.straight, "WSL 60.203 F", "straightSection", {
      family: "WSL",
      series: "WSL",
      material: "steel",
      coating: "F",
      base_unit: "m",
      minimum_package_quantity: "6",
      packaging_unit: "m",
      metadata: { lengthMm: "6000" }
    });
    const wstb = product(ids.wstb, "WSTB 2", "wstb", {
      engineering_verification_required: true
    });
    const template = {
      id: ids.safeTemplate,
      stable_code: "WSL-WALL-WSTB",
      version: "2022-p0",
      status: "active",
      template_type: "wall",
      name_en: "WSL wall support",
      applicability: { system: "WSL", engineeringVerificationRequired: true },
      source_id: ids.catalog,
      source_document: "catalog.pdf",
      source_page: "P3"
    } as const;
    const component = {
      id: ids.wstbComponent,
      template_id: ids.safeTemplate,
      component_role: "support",
      product_id: ids.wstb,
      quantity: "1",
      quantity_expression: null,
      unit: "pcs",
      suppress_when_included: false,
      metadata: { quantityMode: "per_support" }
    } as const;
    const repository = {
      getCalculationContext: vi.fn(async () => ({
        ...baseline,
        catalog: {
          ...baseline.catalog,
          products: [straight, wstb],
          compatibilityRules: [
            {
              ...baseline.catalog.compatibilityRules[0]!,
              condition_payload: {
                relationType: "project_selection",
                sourceProductCode: straight.product_code,
                system: "WSL",
                widthMm: "200",
                heightMm: "60",
                materialCode: "steel",
                finishCode: "F"
              }
            }
          ],
          templates: [template],
          templateComponents: [component]
        }
      }))
    } as unknown as PgProjectRepository;
    const service = new ProjectApplicationService(repository);
    const missing = await service.validateProject(
      actor,
      ids.project,
      { schemaVersion: "validate-project-draft-request/v2", expectedDraftVersion: 1 },
      correlationId
    );
    expect(missing.blockingErrors).toContainEqual(
      expect.objectContaining({ code: "TEMPLATE_WSTB_SELECTION_MISSING" })
    );

    const withWstb = ProjectDraftInputV2Schema.parse({
      ...selectedDraft,
      routes: selectedDraft.routes.map((route) => ({
        ...route,
        supports: { ...route.supports, wstbProductId: ids.wstb }
      }))
    });
    repository.getCalculationContext.mockResolvedValueOnce({
      ...baseline,
      project: {
        ...baseline.project,
        document: { schemaVersion: "project-draft-document/v2", draft: withWstb }
      },
      catalog: {
        ...baseline.catalog,
        products: [straight, wstb],
        compatibilityRules: [
          {
            ...baseline.catalog.compatibilityRules[0]!,
            condition_payload: {
              relationType: "project_selection",
              sourceProductCode: straight.product_code,
              system: "WSL",
              widthMm: "200",
              heightMm: "60",
              materialCode: "steel",
              finishCode: "F"
            }
          }
        ],
        templates: [template],
        templateComponents: [component]
      }
    });
    const selected = await service.validateProject(
      actor,
      ids.project,
      { schemaVersion: "validate-project-draft-request/v2", expectedDraftVersion: 1 },
      correlationId
    );
    expect(selected.blockingErrors).not.toContainEqual(
      expect.objectContaining({
        code: expect.stringMatching(/^TEMPLATE_WSTB_(?:SELECTION_MISSING|MISMATCH)$/u)
      })
    );
  });

  it("maps an evidence-backed draft to CalculationInputV2 and invokes the v2 engine", async () => {
    const baseDraft = draft("dimension:KL:60x200");
    const baseRoute = baseDraft.routes[0]!;
    const configuredSupports = {
      ...baseRoute.supports,
      spacing: { value: "1.5", unit: "m" } as const,
      supportType: "wall" as const,
      supportProductId: ids.support,
      assemblyTemplateId: ids.safeTemplate,
      substrate: "concrete" as const,
      anchorProductId: ids.anchor,
      wstbProductId: null,
      wstb: { mode: "one" as const }
    };
    const completeDraft = ProjectDraftInputV2Schema.parse({
      ...baseDraft,
      routes: [
        {
          ...baseRoute,
          endEndpoint: { ...baseRoute.endEndpoint, type: "routeContinuation" },
          geometry: baseRoute.geometry.map((item) => ({
            ...item,
            length: { value: "3", unit: "m" }
          })),
          supports: configuredSupports
        },
        {
          ...baseRoute,
          id: ids.routeB,
          code: "R-2",
          name: "Route 2",
          startEndpoint: {
            ...baseRoute.startEndpoint,
            id: ids.routeBStart,
            type: "routeContinuation"
          },
          endEndpoint: { ...baseRoute.endEndpoint, id: ids.routeBEnd },
          geometry: baseRoute.geometry.map((item) => ({
            ...item,
            id: ids.segmentB,
            length: { value: "3", unit: "m" }
          })),
          supports: configuredSupports
        }
      ],
      connections: [
        {
          id: ids.connection,
          type: "logicalContinuation",
          participants: [
            { routeId: ids.route, endpointId: ids.end },
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
          reason: "Explicit project requirement",
          note: "Tracked acceptance input",
          reservePolicy: { mode: "projectDefault" },
          packagingPolicy: { mode: "disabled", metadata: null },
          quantityOverride: null
        }
      ]
    });
    const straight = product(ids.straight, "KL 60.203 F", "straightSection", {
      family: "KL",
      series: "KL",
      material: "steel",
      coating: "F",
      base_unit: "m",
      minimum_package_quantity: "6",
      packaging_unit: "m",
      metadata: { lengthMm: "6000" }
    });
    const support = product(ids.support, "KLTB 6 F", "support");
    const anchor = product(ids.anchor, "DAM 6X10", "anchor", {
      minimum_package_quantity: "50",
      engineering_verification_required: true
    });
    const joint = product(ids.joint, "S7-SYN-JOINT", "connector", {
      minimum_package_quantity: "1",
      source_document: "synthetic-rule-fixture",
      source_page: "TEST"
    });
    const context: ProjectCalculationContext = {
      project: {
        id: ids.project,
        status: "draft",
        draftVersion: 1,
        ownerId: ids.actor,
        ownerDisplayName: actor.displayName,
        catalogVersionId: ids.catalog,
        catalogVersion: "2022-p0",
        catalogContentHash: `sha256:${"1".repeat(64)}`,
        ruleSetId: ids.rules,
        ruleSetVersion: "2022-p0",
        ruleSetContentHash: `sha256:${"2".repeat(64)}`,
        createdAt: "2026-09-01T08:00:00.000Z",
        updatedAt: "2026-09-01T08:00:00.000Z",
        document: { schemaVersion: "project-draft-document/v2", draft: completeDraft }
      },
      catalog: catalog({
        products: [straight, support, anchor, joint],
        compatibilityRules: [
          {
            id: ids.selectionRule,
            stable_code: "KL-SELECTION",
            version: "2022-p0",
            decision: "allowed",
            confidence: "catalogConfirmed",
            condition_payload: {
              relationType: "project_selection",
              sourceProductCode: straight.product_code,
              system: "KL",
              widthMm: "200",
              heightMm: "60",
              materialCode: "steel",
              finishCode: "F"
            },
            outcome_payload: { allowed: true },
            source_id: ids.catalog,
            source_document: "catalog.pdf",
            source_page: "P1"
          },
          {
            id: ids.anchorRule,
            stable_code: "DAM-CONCRETE",
            version: "2022-p0",
            decision: "allowed",
            confidence: "engineeringReview",
            condition_payload: {
              relationType: "anchor_substrate",
              sourceProductCode: anchor.product_code
            },
            outcome_payload: { targetSelector: { substrate: "concrete" }, allowed: true },
            source_id: ids.catalog,
            source_document: "catalog.pdf",
            source_page: "P2"
          }
        ],
        calculationRules: [
          {
            id: ids.jointRule,
            stable_code: "S7-SYN-INTERNAL-JOINT",
            version: "test-v2",
            rule_type: "other",
            status: "active",
            parameter_schema_version: "calculation-rule/internal-joint/v2",
            parameters: {
              straightProductId: ids.straight,
              supplyOptionId: null,
              jointProductId: ids.joint,
              quantityPerJoint: { value: "1", unit: "pcs" }
            },
            confidence: "catalogConfirmed",
            source_id: ids.catalog,
            source_document: "synthetic-rule-fixture",
            source_page: "TEST"
          }
        ],
        templates: [
          {
            id: ids.safeTemplate,
            stable_code: "KL-WALL",
            version: "2022-p0",
            status: "active",
            template_type: "wall",
            name_en: "KL wall support",
            applicability: { system: "KL", engineeringVerificationRequired: true },
            source_id: ids.catalog,
            source_document: "catalog.pdf",
            source_page: "P3"
          }
        ],
        templateComponents: [
          {
            id: ids.supportComponent,
            template_id: ids.safeTemplate,
            component_role: "support",
            product_id: ids.support,
            quantity: "1",
            quantity_expression: null,
            unit: "pcs",
            suppress_when_included: false,
            metadata: { quantityMode: "per_support" }
          },
          {
            id: ids.anchorComponent,
            template_id: ids.safeTemplate,
            component_role: "anchor",
            product_id: ids.anchor,
            quantity: "2",
            quantity_expression: null,
            unit: "pcs",
            suppress_when_included: false,
            metadata: { quantityMode: "per_support" }
          }
        ]
      })
    };
    const storeCalculation = vi.fn(async (input: { readonly response: unknown }) => ({
      statusCode: 200,
      response: input.response,
      replayed: false
    }));
    const repository = {
      findCalculationReplay: vi.fn(async () => null),
      getCalculationContext: vi.fn(async () => context),
      storeCalculation
    } as unknown as PgProjectRepository;
    const service = new ProjectApplicationService(repository);
    const validation = await service.validateProject(
      actor,
      ids.project,
      { schemaVersion: "validate-project-draft-request/v2", expectedDraftVersion: 1 },
      correlationId
    );
    expect(validation.blockingErrors).toEqual([]);
    const response = await service.calculateProject(
      actor,
      ids.project,
      { schemaVersion: "calculate-project-draft-request/v2", expectedDraftVersion: 1 },
      "calculate-project-0001",
      correlationId
    );
    expect(response.statusCode).toBe(200);
    expect(response.body.schemaVersion).toBe("calculate-project-draft-response/v2");
    expect(response.body.calculation.result.schemaVersion).toBe("calculation-result/v2");
    expect(response.body.calculation.projectId).toBe(ids.project);
    expect(response.body.calculation.result.bomLines).toContainEqual(
      expect.objectContaining({ kind: "manual", manualInputId: ids.manual })
    );
    expect(storeCalculation).toHaveBeenCalledOnce();
    expect(storeCalculation.mock.calls[0]?.[0]).toMatchObject({
      expectedDraftVersion: 1,
      calculationInput: {
        schemaVersion: "calculation-input/v2",
        project: {
          routes: [{ id: ids.route }, { id: ids.routeB }],
          connections: [{ id: ids.connection }]
        },
        manualItems: [{ id: ids.manual }]
      }
    });

    const unresolvedContext: ProjectCalculationContext = {
      ...context,
      catalog: {
        ...context.catalog,
        products: context.catalog.products.filter((item) => item.id !== ids.joint),
        calculationRules: []
      }
    };
    const unresolvedStore = vi.fn(async (input: { readonly response: unknown }) => ({
      statusCode: 200,
      response: input.response,
      replayed: false
    }));
    const unresolvedService = new ProjectApplicationService({
      findCalculationReplay: vi.fn(async () => null),
      getCalculationContext: vi.fn(async () => unresolvedContext),
      storeCalculation: unresolvedStore
    } as unknown as PgProjectRepository);
    const unresolvedValidation = await unresolvedService.validateProject(
      actor,
      ids.project,
      { schemaVersion: "validate-project-draft-request/v2", expectedDraftVersion: 1 },
      correlationId
    );
    expect(unresolvedValidation.blockingErrors).toEqual([]);
    expect(unresolvedValidation.canCalculate).toBe(true);
    expect(unresolvedValidation.engineeringReview).toContainEqual(
      expect.objectContaining({ code: "UNRESOLVED_JOINT_PRODUCT" })
    );
    const partial = await unresolvedService.calculateProject(
      actor,
      ids.project,
      { schemaVersion: "calculate-project-draft-request/v2", expectedDraftVersion: 1 },
      "calculate-project-partial-0001",
      correlationId
    );
    expect(partial.statusCode).toBe(200);
    expect(partial.body.calculation.result.summary.approvalReady).toBe(false);
    expect(partial.body.calculation.result.warnings).toContainEqual(
      expect.objectContaining({
        code: "UNRESOLVED_JOINT_PRODUCT",
        severity: "blocking",
        approvalImpact: "blocksApproval"
      })
    );
    expect(partial.body.calculation.result.bomLines).not.toContainEqual(
      expect.objectContaining({ productId: ids.joint })
    );
    expect(unresolvedStore).toHaveBeenCalledOnce();
  });
});
