import { describe, expect, it } from "vitest";

import expectedResult from "../../calculation-engine/tests/golden/expected/all-major-rules-combined.json" with { type: "json" };
import {
  CalculateProjectDraftRequestV2Schema,
  CalculateProjectDraftResponseV2Schema,
  CalculationRuleV2Schema,
  CreateProjectDraftRequestV2Schema,
  CurrentCalculationResponseV2Schema,
  EditorCatalogResponseV2Schema,
  ProductSnapshotV2Schema,
  ProjectDraftInputV2Schema,
  ProjectDraftResponseV2Schema,
  ProjectListResponseV2Schema,
  ProjectValidationResponseV2Schema,
  ReplaceProjectDraftRequestV2Schema,
  SnapshotReferenceV2Schema,
  ValidateProjectDraftRequestV2Schema,
  VersionIdentifierV2Schema,
  type ProjectDraftInputV2
} from "../src/index.js";

const ids = {
  project: "00000000-0000-4000-8000-000000000001",
  owner: "00000000-0000-4000-8000-000000000002",
  routeA: "00000000-0000-4000-8000-000000000011",
  routeB: "00000000-0000-4000-8000-000000000012",
  endpointAStart: "00000000-0000-4000-8000-000000000021",
  endpointAEnd: "00000000-0000-4000-8000-000000000022",
  endpointBStart: "00000000-0000-4000-8000-000000000023",
  endpointBEnd: "00000000-0000-4000-8000-000000000024",
  segmentA: "00000000-0000-4000-8000-000000000031",
  segmentB: "00000000-0000-4000-8000-000000000032",
  connection: "00000000-0000-4000-8000-000000000041",
  straight: "00000000-0000-4000-8000-000000000051",
  support: "00000000-0000-4000-8000-000000000052",
  anchor: "00000000-0000-4000-8000-000000000053",
  template: "00000000-0000-4000-8000-000000000061",
  component: "00000000-0000-4000-8000-000000000062",
  manual: "00000000-0000-4000-8000-000000000071",
  override: "00000000-0000-4000-8000-000000000072",
  calculation: "00000000-0000-4000-8000-000000000081",
  compatibility: "00000000-0000-4000-8000-000000000091",
  compatibilityAnchor: "00000000-0000-4000-8000-000000000092"
} as const;

const emptyEndpoint = (id: string, type: "freeEnd" | "routeContinuation") => ({
  id,
  type,
  selectedProductId: null,
  equipmentReference: null,
  customDescription: null
});

const support = {
  spacing: { value: "1.5", unit: "m" },
  supportType: "wall",
  supportProductId: ids.support,
  assemblyTemplateId: ids.template,
  levelCount: null,
  substrate: "concrete",
  anchorProductId: ids.anchor,
  anchorQuantityOverride: null,
  wstbProductId: null,
  wstb: { mode: "two" },
  manualAdditionalSupports: [],
  templateManualValues: []
} as const;

const selection = {
  system: "KL",
  dimensionId: "KL-60-200",
  width: { value: "200", unit: "mm" },
  height: { value: "60", unit: "mm" },
  materialCode: "steel",
  finishCode: "F",
  straightProductId: ids.straight,
  defaultSupplyOptionId: "supply-6000"
} as const;

const validDraft = {
  code: "PRJ-001",
  name: "Stage 7 project",
  description: "A persisted editor graph",
  defaultLocale: "bg",
  defaultReservePercent: "10",
  cableLoad: null,
  routes: [
    {
      id: ids.routeA,
      code: "R-A",
      name: "Route A",
      description: null,
      selection,
      startEndpoint: emptyEndpoint(ids.endpointAStart, "freeEnd"),
      endEndpoint: emptyEndpoint(ids.endpointAEnd, "routeContinuation"),
      geometry: [
        {
          id: ids.segmentA,
          kind: "straight",
          length: { value: "6", unit: "m" },
          supplyOptionId: null
        }
      ],
      supports: support
    },
    {
      id: ids.routeB,
      code: "R-B",
      name: "Route B",
      description: null,
      selection,
      startEndpoint: emptyEndpoint(ids.endpointBStart, "routeContinuation"),
      endEndpoint: emptyEndpoint(ids.endpointBEnd, "freeEnd"),
      geometry: [
        {
          id: ids.segmentB,
          kind: "straight",
          length: { value: "3", unit: "m" },
          supplyOptionId: "supply-6000"
        }
      ],
      supports: support
    }
  ],
  connections: [
    {
      id: ids.connection,
      type: "logicalContinuation",
      participants: [
        { routeId: ids.routeA, endpointId: ids.endpointAEnd },
        { routeId: ids.routeB, endpointId: ids.endpointBStart }
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
      reason: "Site-specific material",
      note: null,
      reservePolicy: { mode: "projectDefault" },
      packagingPolicy: { mode: "disabled", metadata: null },
      quantityOverride: null
    }
  ]
} as const satisfies ProjectDraftInputV2;

const now = "2026-09-01T08:00:00.000Z";
const correlationId = "correlation-stage7-0001";
const catalogSnapshot = {
  snapshotId: ids.project,
  version: "2022-p0",
  contentHash: `sha256:${"1".repeat(64)}`
} as const;
const ruleSnapshot = {
  snapshotId: ids.owner,
  version: "2022-p0",
  contentHash: `sha256:${"2".repeat(64)}`
} as const;

describe("Stage 7 project transport v2", () => {
  it("round-trips strict create, replace, list, and hydrated project payloads", () => {
    expect(
      CreateProjectDraftRequestV2Schema.parse({
        schemaVersion: "create-project-draft-request/v2",
        draft: validDraft
      }).draft
    ).toEqual(validDraft);
    expect(
      ReplaceProjectDraftRequestV2Schema.safeParse({
        schemaVersion: "replace-project-draft-request/v2",
        expectedDraftVersion: 4,
        draft: validDraft
      }).success
    ).toBe(true);
    expect(
      ProjectDraftResponseV2Schema.safeParse({
        schemaVersion: "project-draft-response/v2",
        correlationId,
        catalogSnapshot,
        ruleSnapshot,
        project: {
          id: ids.project,
          ownerId: ids.owner,
          ownerDisplayName: "Stage 7 Reviewer",
          status: "draft",
          draftVersion: 5,
          createdAt: now,
          updatedAt: now,
          ...validDraft
        }
      }).success
    ).toBe(true);
    expect(
      ProjectListResponseV2Schema.safeParse({
        schemaVersion: "project-list-response/v2",
        correlationId,
        projects: [
          {
            id: ids.project,
            ownerId: ids.owner,
            ownerDisplayName: "Stage 7 Reviewer",
            code: validDraft.code,
            name: validDraft.name,
            description: validDraft.description,
            status: "draft",
            defaultLocale: "bg",
            defaultReservePercent: "10",
            editorState: "editable",
            draftVersion: 5,
            createdAt: now,
            updatedAt: now
          }
        ]
      }).success
    ).toBe(true);

    expect(
      ProjectListResponseV2Schema.safeParse({
        schemaVersion: "project-list-response/v2",
        correlationId,
        projects: [
          {
            id: ids.project,
            ownerId: ids.owner,
            ownerDisplayName: null,
            code: validDraft.code,
            name: validDraft.name,
            description: null,
            status: "draft",
            defaultLocale: "bg",
            defaultReservePercent: "10",
            editorState: "editable",
            draftVersion: 5,
            createdAt: now,
            updatedAt: now
          }
        ]
      }).success
    ).toBe(false);
  });

  it("accepts incomplete support choices for autosave without inventing engineering defaults", () => {
    const incomplete = structuredClone(validDraft);
    incomplete.routes[0]!.supports.spacing = null;
    incomplete.routes[0]!.supports.supportType = null;
    incomplete.routes[0]!.supports.wstb = null;
    expect(ProjectDraftInputV2Schema.safeParse(incomplete).success).toBe(true);

    const missingSupportObject = structuredClone(incomplete) as unknown as {
      routes: Array<Record<string, unknown>>;
    };
    delete missingSupportObject.routes[0]!["supports"];
    expect(ProjectDraftInputV2Schema.safeParse(missingSupportObject).success).toBe(false);

    expect(
      ProjectValidationResponseV2Schema.safeParse({
        schemaVersion: "project-validation-response/v2",
        correlationId,
        projectId: ids.project,
        draftVersion: 5,
        blockingErrors: [
          {
            path: ["routes", 0, "supports", "spacing"],
            code: "REQUIRED",
            message: "Support spacing must be selected before calculation"
          }
        ],
        warnings: [],
        engineeringReview: [],
        canCalculate: false
      }).success
    ).toBe(true);
  });

  it("rejects body-supplied trusted metadata, non-UUID database IDs, and unknown keys", () => {
    expect(
      CreateProjectDraftRequestV2Schema.safeParse({
        schemaVersion: "create-project-draft-request/v2",
        correlationId,
        idempotencyKey: "idempotency-stage7-0001",
        actorId: ids.project,
        draft: validDraft
      }).success
    ).toBe(false);
    expect(
      ProjectDraftInputV2Schema.safeParse({
        ...validDraft,
        routes: [{ ...validDraft.routes[0], id: "route-not-a-uuid" }]
      }).success
    ).toBe(false);
    expect(ProjectDraftInputV2Schema.safeParse({ ...validDraft, uiState: {} }).success).toBe(false);
  });

  it("rejects duplicate route codes and dangling or multiply connected endpoint references", () => {
    const duplicateCode = structuredClone(validDraft);
    duplicateCode.routes[1]!.code = "r-a";
    expect(ProjectDraftInputV2Schema.safeParse(duplicateCode).success).toBe(false);

    const dangling = structuredClone(validDraft);
    dangling.connections[0]!.participants[1]!.endpointId = ids.endpointAStart;
    dangling.connections.push({
      ...structuredClone(dangling.connections[0]!),
      id: "00000000-0000-4000-8000-000000000042",
      participants: [
        { routeId: ids.routeA, endpointId: ids.endpointAEnd },
        { routeId: ids.routeB, endpointId: ids.endpointBStart }
      ]
    });
    const parsed = ProjectDraftInputV2Schema.safeParse(dangling);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.map((issue) => issue.message)).toEqual(
        expect.arrayContaining([
          "Connection participant must reference an endpoint owned by its route",
          "A physical endpoint can participate in only one connection"
        ])
      );
    }
  });

  it("enforces connection cardinality and endpoint behavior", () => {
    const mismatchedContinuation = structuredClone(validDraft);
    mismatchedContinuation.routes[0]!.endEndpoint.type = "freeEnd";
    expect(ProjectDraftInputV2Schema.safeParse(mismatchedContinuation).success).toBe(false);

    const shortTee = structuredClone(validDraft);
    shortTee.connections[0]!.type = "tee";
    shortTee.connections[0]!.physicalBreak = true;
    shortTee.routes[0]!.endEndpoint.type = "physicalSplice";
    shortTee.routes[1]!.startEndpoint.type = "physicalSplice";
    expect(ProjectDraftInputV2Schema.safeParse(shortTee).success).toBe(false);
  });

  it("keeps derived rule, source, actor, and catalog identity metadata out of draft commands", () => {
    const routeWithRule = structuredClone(validDraft.routes[0]) as Record<string, unknown>;
    routeWithRule["ruleId"] = "rule-not-client-owned";
    expect(
      ProjectDraftInputV2Schema.safeParse({ ...validDraft, routes: [routeWithRule] }).success
    ).toBe(false);

    const manual = structuredClone(validDraft.manualItems[0]) as Record<string, unknown>;
    manual["actorRef"] = ids.project;
    manual["source"] = { kind: "manualInput", id: ids.manual };
    expect(
      ProjectDraftInputV2Schema.safeParse({ ...validDraft, manualItems: [manual] }).success
    ).toBe(false);
  });

  it("enforces manual-item order dimensions and explicit free-text packaging", () => {
    const wrongIncrement = structuredClone(validDraft);
    wrongIncrement.manualItems[0]!.packagingPolicy = {
      mode: "incrementOverride",
      increment: { value: "1", unit: "pcs" },
      metadata: { overrideId: ids.override, reason: "Explicit package rule", note: null }
    };
    expect(ProjectDraftInputV2Schema.safeParse(wrongIncrement).success).toBe(false);

    const catalogDefault = structuredClone(validDraft);
    catalogDefault.manualItems[0]!.packagingPolicy = { mode: "catalogDefault" };
    expect(ProjectDraftInputV2Schema.safeParse(catalogDefault).success).toBe(false);
  });

  it("validates saved-draft validation and calculation operation wrappers", () => {
    expect(
      ValidateProjectDraftRequestV2Schema.safeParse({
        schemaVersion: "validate-project-draft-request/v2",
        expectedDraftVersion: 5
      }).success
    ).toBe(true);
    expect(
      CalculateProjectDraftRequestV2Schema.safeParse({
        schemaVersion: "calculate-project-draft-request/v2",
        expectedDraftVersion: 5
      }).success
    ).toBe(true);
    expect(
      ProjectValidationResponseV2Schema.safeParse({
        schemaVersion: "project-validation-response/v2",
        correlationId,
        projectId: ids.project,
        draftVersion: 5,
        blockingErrors: [],
        warnings: [],
        engineeringReview: [],
        canCalculate: true
      }).success
    ).toBe(true);
    expect(
      ProjectValidationResponseV2Schema.safeParse({
        schemaVersion: "project-validation-response/v2",
        correlationId,
        projectId: ids.project,
        draftVersion: 5,
        blockingErrors: [{ path: ["routes"], code: "required", message: "Required" }],
        warnings: [],
        engineeringReview: [],
        canCalculate: true
      }).success
    ).toBe(false);
  });

  it("wraps an actual CalculationResultV2 and relates it to the acknowledged draft", () => {
    const result = structuredClone(expectedResult);
    result.calculationRunId = ids.calculation;
    const calculation = {
      projectId: ids.project,
      draftVersion: 5,
      run: {
        id: ids.calculation,
        status: "succeeded",
        inputFingerprint: result.inputFingerprint,
        engineVersion: result.engineVersion,
        catalogSnapshot: result.catalogSnapshot,
        ruleSnapshot: result.ruleSnapshot,
        startedAt: now,
        completedAt: now
      },
      result,
      stale: false
    };
    expect(
      CalculateProjectDraftResponseV2Schema.safeParse({
        schemaVersion: "calculate-project-draft-response/v2",
        correlationId,
        calculation
      }).success
    ).toBe(true);
    expect(
      CurrentCalculationResponseV2Schema.safeParse({
        schemaVersion: "current-calculation-response/v2",
        correlationId,
        projectId: ids.project,
        calculation
      }).success
    ).toBe(true);
    const mismatchedVersion = structuredClone(calculation);
    mismatchedVersion.result.catalogSnapshot = {
      ...mismatchedVersion.result.catalogSnapshot,
      version: "different-v2"
    };
    expect(
      CurrentCalculationResponseV2Schema.safeParse({
        schemaVersion: "current-calculation-response/v2",
        correlationId,
        projectId: ids.project,
        calculation: mismatchedVersion
      }).success
    ).toBe(false);
    const mismatchedHash = structuredClone(calculation);
    mismatchedHash.result.ruleSnapshot = {
      ...mismatchedHash.result.ruleSnapshot,
      contentHash: `sha256:${"f".repeat(64)}`
    };
    expect(
      CurrentCalculationResponseV2Schema.safeParse({
        schemaVersion: "current-calculation-response/v2",
        correlationId,
        projectId: ids.project,
        calculation: mismatchedHash
      }).success
    ).toBe(false);
    expect(
      CurrentCalculationResponseV2Schema.safeParse({
        schemaVersion: "current-calculation-response/v2",
        correlationId,
        projectId: ids.routeA,
        calculation
      }).success
    ).toBe(false);
  });
});

describe("Stage 7 editor catalog transport", () => {
  const hash = `sha256:${"a".repeat(64)}`;
  const snapshot = { snapshotId: ids.project, version: "2022-p0", contentHash: hash };
  const straight = {
    id: ids.straight,
    code: "KL 60.203",
    descriptionEn: "Cable ladder",
    role: "straightSection",
    orderUnit: "m",
    packageIncrement: { value: "6", unit: "m" },
    active: true,
    orderable: true,
    selectable: true,
    engineeringReviewRequired: false,
    selection: {
      system: "KL",
      dimensionId: "KL-60-200",
      width: { value: "200", unit: "mm" },
      height: { value: "60", unit: "mm" },
      materialCode: "steel",
      finishCode: "F"
    },
    supplyOptions: [
      { id: "supply-6000", length: { value: "6000", unit: "mm" }, active: true, orderable: true }
    ]
  } as const;

  it("validates a bounded active editor catalog without exposing rule/source records", () => {
    const response = {
      schemaVersion: "editor-catalog-response/v2",
      correlationId,
      catalogSnapshot: snapshot,
      ruleSnapshot: { ...snapshot, snapshotId: ids.routeA },
      products: [
        straight,
        {
          id: ids.anchor,
          code: "DAM 6X10",
          descriptionEn: "Anchor",
          role: "anchor",
          orderUnit: "pcs",
          packageIncrement: { value: "10", unit: "pcs" },
          active: true,
          orderable: true,
          selectable: true,
          engineeringReviewRequired: true,
          selection: null,
          supplyOptions: []
        }
      ],
      assemblyTemplates: [
        {
          id: ids.template,
          code: "KL-WALL",
          nameEn: "KL wall assembly",
          supportType: "wall",
          applicableSystems: ["KL"],
          engineeringReviewRequired: true,
          components: [
            {
              id: ids.component,
              productId: ids.anchor,
              role: "anchor",
              quantity: { value: "2", unit: "pcs" },
              quantityMode: "perSupport",
              suppressWhenIncluded: false,
              manualParameterId: null
            }
          ]
        }
      ],
      compatibilityRelations: [
        {
          id: ids.compatibility,
          context: "straightSection",
          subjectProductId: null,
          substrate: null,
          productId: ids.straight,
          allowed: true
        },
        {
          id: ids.compatibilityAnchor,
          context: "anchor",
          subjectProductId: null,
          substrate: "concrete",
          productId: ids.anchor,
          allowed: true
        }
      ]
    };
    expect(EditorCatalogResponseV2Schema.parse(response)).toEqual(response);
    expect(
      EditorCatalogResponseV2Schema.safeParse({ ...response, rawDatabaseRows: [] }).success
    ).toBe(false);
    expect(
      EditorCatalogResponseV2Schema.safeParse({
        ...response,
        compatibilityRelations: [
          {
            id: ids.compatibilityAnchor,
            context: "anchor",
            subjectProductId: null,
            substrate: null,
            productId: ids.anchor,
            allowed: true
          }
        ]
      }).success
    ).toBe(false);
  });

  it("rejects dangling template products and unavailable selectable products", () => {
    const response = {
      schemaVersion: "editor-catalog-response/v2",
      correlationId,
      catalogSnapshot: snapshot,
      ruleSnapshot: { ...snapshot, snapshotId: ids.routeA },
      products: [{ ...straight, active: false }],
      assemblyTemplates: [
        {
          id: ids.template,
          code: "KL-WALL",
          nameEn: "KL wall assembly",
          supportType: "wall",
          applicableSystems: ["KL"],
          engineeringReviewRequired: true,
          components: [
            {
              id: ids.component,
              productId: ids.anchor,
              role: "anchor",
              quantity: { value: "2", unit: "pcs" },
              quantityMode: "perSupport",
              suppressWhenIncluded: false,
              manualParameterId: null
            }
          ]
        }
      ],
      compatibilityRelations: []
    };
    expect(EditorCatalogResponseV2Schema.safeParse(response).success).toBe(false);
  });
});

describe("Stage 7 v2 persisted version and packaging corrections", () => {
  it("rejects draft values that cannot be represented by the Stage 4 projection", () => {
    expect(
      ProjectDraftInputV2Schema.safeParse({ ...validDraft, code: "P".repeat(101) }).success
    ).toBe(false);
    expect(
      ProjectDraftInputV2Schema.safeParse({ ...validDraft, name: "N".repeat(501) }).success
    ).toBe(false);
    expect(
      ProjectDraftInputV2Schema.safeParse({ ...validDraft, defaultReservePercent: "1.00001" })
        .success
    ).toBe(false);
    expect(
      ProjectDraftInputV2Schema.safeParse({
        ...validDraft,
        routes: [
          {
            ...validDraft.routes[0],
            startEndpoint: {
              ...validDraft.routes[0]?.startEndpoint,
              equipmentReference: "E".repeat(501)
            }
          },
          validDraft.routes[1]
        ]
      }).success
    ).toBe(false);
    const emptyEquipment = structuredClone(validDraft);
    emptyEquipment.routes[0]!.startEndpoint.type = "equipment";
    emptyEquipment.routes[0]!.startEndpoint.equipmentReference = "";
    expect(ProjectDraftInputV2Schema.safeParse(emptyEquipment).success).toBe(false);
    expect(
      ProjectDraftInputV2Schema.safeParse({
        ...validDraft,
        connections: [
          { ...validDraft.connections[0], supportsBefore: { value: "2147483648", unit: "pcs" } }
        ]
      }).success
    ).toBe(false);
  });

  it("accepts bounded persisted version slugs without widening retained v1 SemVer", () => {
    expect(VersionIdentifierV2Schema.safeParse("2022-p0").success).toBe(true);
    expect(VersionIdentifierV2Schema.safeParse("2.0.0").success).toBe(true);
    expect(VersionIdentifierV2Schema.safeParse("bad version").success).toBe(false);
    expect(
      SnapshotReferenceV2Schema.safeParse({
        snapshotId: ids.project,
        version: "2022-p0",
        contentHash: `sha256:${"b".repeat(64)}`
      }).success
    ).toBe(true);
    expect(
      CalculationRuleV2Schema.safeParse({
        id: "rule-supply",
        code: "SUPPLY-6000",
        version: "2022-p0",
        confidence: "catalogConfirmed",
        status: "active",
        ruleSnapshotId: ids.routeA,
        source: {
          kind: "rule",
          id: "rule-supply",
          sourceDocument: null,
          sourcePage: null
        },
        type: "supplyOption",
        productId: ids.straight,
        supplyOptionId: "supply-6000"
      }).success
    ).toBe(true);
  });

  it("allows unknown packaging only for non-orderable products", () => {
    const product = {
      id: ids.anchor,
      code: "INCLUDED FASTENER",
      descriptionEn: "Included non-orderable fastener",
      role: "fastener",
      orderUnit: "pcs",
      packageIncrement: null,
      orderable: false,
      active: true,
      engineeringReviewRequired: false,
      catalogSnapshotId: ids.project,
      supplyOptions: [],
      includedItems: [],
      source: {
        kind: "catalogDocument",
        id: "catalog-fastener",
        sourceDocument: "KAT_NX_KR 2022.pdf",
        sourcePage: "KR 1"
      }
    };
    expect(ProductSnapshotV2Schema.safeParse(product).success).toBe(true);
    expect(ProductSnapshotV2Schema.safeParse({ ...product, orderable: true }).success).toBe(false);
    expect(
      ProductSnapshotV2Schema.safeParse({
        ...product,
        packageIncrement: { value: "1", unit: "m" }
      }).success
    ).toBe(false);
  });
});
