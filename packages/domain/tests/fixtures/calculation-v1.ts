import type { CalculationInputV1, CalculationResultV1 } from "../../src/index.js";

const catalogHash = `sha256:${"a".repeat(64)}`;
const ruleHash = `sha256:${"b".repeat(64)}`;
const inputHash = `sha256:${"c".repeat(64)}`;
const changedAt = "2026-08-16T10:00:00.000Z";

const source = {
  sourceFileName: "catalog-v1.xlsx",
  sourceRow: 2,
  sourceHash: catalogHash
} as const;

const supportPlan = {
  spacing: { value: "1.5", unit: "m" },
  supportType: "ceiling",
  supportProductId: "product-support",
  structureProductIds: ["product-structure"],
  assemblyTemplateId: "template-four-point",
  connectionBehavior: "shared",
  additionalSupports: {
    aroundFittings: { value: "1", unit: "pcs" },
    beforeConnections: { value: "0", unit: "pcs" },
    afterConnections: { value: "0", unit: "pcs" }
  },
  anchor: {
    productId: "product-anchor",
    model: "Niedax anchor fixture model",
    size: { value: "10", unit: "mm" },
    substrate: "concrete",
    assemblyTemplateId: "template-four-point",
    quantityPerMountingPoint: { value: "4", unit: "pcs" },
    quantityOverride: {
      originalCalculatedQuantity: { value: "4", unit: "pcs" },
      adjustedQuantity: { value: "5", unit: "pcs" },
      metadata: {
        overrideId: "override-anchor-01",
        reason: "Site-specific mounting review",
        note: "Requires checker confirmation",
        actorId: "user-checker-01",
        changedAt
      }
    },
    engineeringReviewRequired: true
  },
  wstb: {
    mode: "two",
    quantityPerSupport: "2",
    ruleId: "rule-wstb-two"
  }
} as const;

export const validCalculationInputV1 = {
  schemaVersion: "calculation-input/v1",
  invocation: {
    calculationRunId: "run-01",
    inputFingerprint: inputHash
  },
  project: {
    id: "project-01",
    code: "PRJ-001",
    name: "Representative project",
    description: "Stage 3 contract fixture",
    draftVersion: 7,
    defaultSparePercent: "10",
    cableLoad: { value: "18.5", unit: "kgPerM" },
    routes: [
      {
        id: "route-a",
        code: "R-01",
        name: "Main route",
        description: "First connected route",
        system: {
          seriesId: "series-f",
          dimensionId: "dimension-f-60-200",
          finishId: "finish-e3",
          variantId: "variant-f-perforated"
        },
        deliverableSectionLength: { metres: 6, unit: "m" },
        startEndpoint: { id: "endpoint-a-start", type: "freeEnd" },
        endEndpoint: {
          id: "endpoint-a-end",
          type: "routeContinuation",
          connectionId: "connection-continuation"
        },
        geometry: [
          { id: "geometry-a-straight", kind: "straight", length: { value: "12", unit: "m" } },
          {
            id: "geometry-a-bend",
            kind: "fitting",
            fittingType: "horizontalBend",
            material: {
              status: "resolved",
              productId: "product-fitting",
              ruleId: "rule-connection-assembly"
            }
          }
        ],
        supports: supportPlan
      },
      {
        id: "route-b",
        code: "R-02",
        name: "Branch route",
        description: "Second connected route",
        system: {
          seriesId: "series-f",
          dimensionId: "dimension-f-60-200",
          finishId: "finish-e3",
          variantId: "variant-f-perforated"
        },
        deliverableSectionLength: { metres: 3, unit: "m" },
        startEndpoint: {
          id: "endpoint-b-start",
          type: "routeContinuation",
          connectionId: "connection-continuation"
        },
        endEndpoint: {
          id: "endpoint-b-end",
          type: "physicalSplice",
          material: {
            status: "unresolved",
            reason: "Exact connector rule awaits catalog confirmation"
          }
        },
        geometry: [
          { id: "geometry-b-straight", kind: "straight", length: { value: "6", unit: "m" } }
        ],
        supports: supportPlan
      }
    ],
    connections: [
      {
        id: "connection-continuation",
        type: "logicalContinuation",
        participants: [
          { routeId: "route-a", endpointId: "endpoint-a-end" },
          { routeId: "route-b", endpointId: "endpoint-b-start" }
        ],
        physicalBreak: false,
        materialBehavior: "none",
        supportBehavior: "shared",
        supportsBefore: { value: "0", unit: "pcs" },
        supportsAfter: { value: "0", unit: "pcs" },
        connectorCorrection: null,
        note: "Continuous geometry with no physical material"
      }
    ],
    accessoryProductIds: ["product-accessory"]
  },
  catalogSnapshot: {
    snapshotId: "catalog-snapshot-01",
    version: "1.0.0",
    contentHash: catalogHash
  },
  catalogProducts: [
    {
      id: "product-straight",
      code: "NX-FIXTURE-STRAIGHT",
      descriptionEn: "Straight section fixture",
      productType: "straightSection",
      baseUnit: "pcs",
      packageSize: { value: "1", unit: "pcs" },
      includedProductIds: [],
      status: "active",
      catalogSnapshotId: "catalog-snapshot-01",
      source
    },
    {
      id: "product-fitting",
      code: "NX-FIXTURE-BEND",
      descriptionEn: "Bend fixture",
      productType: "fitting",
      baseUnit: "pcs",
      packageSize: { value: "1", unit: "pcs" },
      includedProductIds: [],
      status: "active",
      catalogSnapshotId: "catalog-snapshot-01",
      source
    },
    {
      id: "product-support",
      code: "NX-FIXTURE-SUPPORT",
      descriptionEn: "Support fixture",
      productType: "support",
      baseUnit: "pcs",
      packageSize: { value: "1", unit: "pcs" },
      includedProductIds: [],
      status: "active",
      catalogSnapshotId: "catalog-snapshot-01",
      source
    },
    {
      id: "product-structure",
      code: "NX-FIXTURE-STRUCTURE",
      descriptionEn: "Structure fixture",
      productType: "structure",
      baseUnit: "pcs",
      packageSize: { value: "1", unit: "pcs" },
      includedProductIds: [],
      status: "active",
      catalogSnapshotId: "catalog-snapshot-01",
      source
    },
    {
      id: "product-anchor",
      code: "NX-FIXTURE-ANCHOR",
      descriptionEn: "Niedax anchor fixture",
      productType: "anchor",
      baseUnit: "pcs",
      packageSize: { value: "10", unit: "pcs" },
      includedProductIds: [],
      status: "active",
      catalogSnapshotId: "catalog-snapshot-01",
      source
    },
    {
      id: "product-wstb",
      code: "NX-FIXTURE-WSTB",
      descriptionEn: "WSTB fixture",
      productType: "wstb",
      baseUnit: "pcs",
      packageSize: { value: "10", unit: "pcs" },
      includedProductIds: [],
      status: "active",
      catalogSnapshotId: "catalog-snapshot-01",
      source
    },
    {
      id: "product-accessory",
      code: "NX-FIXTURE-ACCESSORY",
      descriptionEn: "Accessory fixture",
      productType: "accessory",
      baseUnit: "pcs",
      packageSize: { value: "1", unit: "pcs" },
      includedProductIds: [],
      status: "active",
      catalogSnapshotId: "catalog-snapshot-01",
      source
    }
  ],
  ruleSnapshot: {
    snapshotId: "rule-snapshot-01",
    version: "1.0.0",
    contentHash: ruleHash
  },
  rules: [
    {
      id: "rule-wstb-two",
      code: "WSTB-TWO-PER-SUPPORT",
      version: "1.0.0",
      status: "draft",
      confidence: "projectRule",
      ruleSnapshotId: "rule-snapshot-01",
      type: "wstbPerSupport",
      quantityPerSupport: { value: "2", unit: "pcs" }
    },
    {
      id: "rule-connection-assembly",
      code: "FIXTURE-CONNECTION-ASSEMBLY",
      version: "1.0.0",
      status: "draft",
      confidence: "engineeringReview",
      ruleSnapshotId: "rule-snapshot-01",
      type: "connectionAssembly",
      connectionType: "bend",
      assemblyTemplateId: "template-four-point"
    }
  ],
  assemblyTemplates: [
    {
      id: "template-four-point",
      code: "FOUR-POINT-FIXTURE",
      name: "Four point fixture template",
      status: "draft",
      catalogSnapshotId: "catalog-snapshot-01",
      components: [
        {
          productId: "product-anchor",
          quantityPerAssembly: { value: "4", unit: "pcs" },
          included: false
        }
      ]
    }
  ],
  manualBomLines: [
    {
      id: "manual-line-01",
      kind: "freeText",
      productCode: null,
      descriptionEn: "Site-specific free-text material",
      technicalQuantity: { value: "2", unit: "pcs" },
      reason: "Requested by site engineer",
      note: "Not a catalog product",
      sparePolicy: {
        mode: "disabled",
        metadata: {
          overrideId: "override-spare-01",
          reason: "Exact site quantity",
          note: null,
          actorId: "user-checker-01",
          changedAt
        }
      },
      packagingPolicy: { mode: "none" },
      enteredBy: "user-checker-01",
      enteredAt: changedAt
    }
  ],
  manualProductAdjustments: [],
  linePolicies: [
    {
      id: "line-policy-anchor",
      target: { kind: "catalogProduct", productId: "product-anchor" },
      sparePolicy: {
        mode: "disabled",
        metadata: {
          overrideId: "override-anchor-spare",
          reason: "Use the exact reviewed anchor quantity",
          note: null,
          actorId: "user-checker-01",
          changedAt
        }
      },
      packagingPolicy: {
        mode: "roundToPackage",
        packageSize: { value: "10", unit: "pcs" }
      },
      metadata: {
        overrideId: "override-anchor-policy",
        reason: "Line-specific spare and packaging policy",
        note: null,
        actorId: "user-checker-01",
        changedAt
      }
    }
  ],
  options: {
    failOnUnresolvedMaterial: false,
    includePackaging: true,
    outputLanguage: "en"
  }
} as const satisfies CalculationInputV1;

const manualMetadata = {
  overrideId: "override-result-01",
  reason: "Approved manual fixture quantity",
  note: null,
  actorId: "user-checker-01",
  changedAt
} as const;

export const representativeCalculationResultV1 = {
  schemaVersion: "calculation-result/v1",
  engineVersion: "0.1.0",
  calculationRunId: "run-01",
  inputFingerprint: inputHash,
  calculationStatus: "complete",
  catalogSnapshot: validCalculationInputV1.catalogSnapshot,
  ruleSnapshot: validCalculationInputV1.ruleSnapshot,
  bomLines: [
    {
      id: "bom-catalog-01",
      kind: "catalog",
      category: "anchor",
      productId: "product-anchor",
      productCode: "NX-FIXTURE-ANCHOR",
      descriptionEn: "Niedax anchor fixture",
      technicalQuantity: { value: "8", unit: "pcs" },
      packagingQuantity: { value: "10", unit: "pcs" },
      packageSize: { value: "10", unit: "pcs" },
      packageCount: { value: "1", unit: "packages" },
      orderedQuantity: { value: "10", unit: "pcs" },
      spareQuantity: { value: "2", unit: "pcs" },
      includedItems: [],
      source: { kind: "assemblyTemplate", assemblyTemplateId: "template-four-point" },
      status: "engineeringReview",
      warnings: [
        {
          kind: "engineeringReview",
          code: "ANCHOR_SUITABILITY_REVIEW",
          message: "Anchor suitability requires engineering review.",
          subjectRef: "product-anchor"
        }
      ],
      sparePolicy: { mode: "project" },
      packagingPolicy: {
        mode: "roundToPackage",
        packageSize: { value: "10", unit: "pcs" }
      },
      quantityOverride: null,
      provenance: {
        catalogSnapshotId: "catalog-snapshot-01",
        ruleSnapshotId: "rule-snapshot-01",
        ruleIds: ["rule-connection-assembly"]
      }
    },
    {
      id: "bom-manual-01",
      kind: "manual",
      category: "manual",
      manualInputId: "manual-line-01",
      productCode: null,
      descriptionEn: "Site-specific free-text material",
      technicalQuantity: { value: "2", unit: "pcs" },
      packagingQuantity: { value: "3", unit: "pcs" },
      packageSize: { value: "1", unit: "pcs" },
      packageCount: { value: "3", unit: "packages" },
      orderedQuantity: { value: "3", unit: "pcs" },
      spareQuantity: { value: "1", unit: "pcs" },
      includedItems: [],
      source: { kind: "manual", manualInputId: "manual-line-01" },
      status: "manual",
      warnings: [
        {
          kind: "manualOverride",
          code: "MANUAL_QUANTITY_OVERRIDE",
          message: "Quantity was manually overridden.",
          overrideId: "override-result-01"
        }
      ],
      sparePolicy: {
        mode: "percentageOverride",
        percent: "25",
        metadata: manualMetadata
      },
      packagingPolicy: { mode: "none" },
      quantityOverride: {
        originalCalculatedQuantity: { value: "2", unit: "pcs" },
        adjustedQuantity: { value: "3", unit: "pcs" },
        metadata: manualMetadata
      },
      provenance: {
        catalogSnapshotId: "catalog-snapshot-01",
        ruleSnapshotId: "rule-snapshot-01",
        ruleIds: []
      }
    }
  ],
  warnings: [
    {
      kind: "projectRule",
      code: "WSTB_RULE_UNCONFIRMED",
      message: "Two WSTB per support remains an unconfirmed project rule.",
      ruleId: "rule-wstb-two"
    },
    {
      kind: "catalog",
      code: "CATALOG_FIXTURE_DATA",
      message: "Fixture catalog data requires replacement before approval.",
      catalogSnapshotId: "catalog-snapshot-01"
    }
  ],
  summary: {
    bomLineCount: 2,
    warningCount: 2,
    engineeringReviewRequired: true,
    orderedTotalsByUnit: [{ unit: "pcs", quantity: { value: "13", unit: "pcs" } }]
  }
} as const satisfies CalculationResultV1;
