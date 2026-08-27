import type { CalculationInputV2, SourceReferenceV2 } from "@niedax/domain";

const catalogHash = `sha256:${"1".repeat(64)}`;
const ruleHash = `sha256:${"2".repeat(64)}`;
const inputHash = `sha256:${"3".repeat(64)}`;

function source(kind: SourceReferenceV2["kind"], id: string): SourceReferenceV2 {
  return {
    kind,
    id,
    sourceDocument: kind === "catalogDocument" ? "verified-catalog.pdf" : null,
    sourcePage: kind === "catalogDocument" ? "TEST 1" : null
  };
}

function metadata(id: string) {
  return {
    overrideId: id,
    reason: `Reviewed reason for ${id}`,
    note: null,
    actorRef: "actor-checker",
    decisionRef: `decision-${id}`
  } as const;
}

const catalogSource = (id: string) => source("catalogDocument", `catalog-${id}`);
const ruleSource = (id: string) => source("rule", id);

const products = [
  {
    id: "product-straight",
    code: "NX STRAIGHT",
    descriptionEn: "Straight cable ladder",
    role: "straightSection",
    orderUnit: "m",
    packageIncrement: { value: "6", unit: "m" },
    orderable: true,
    active: true,
    engineeringReviewRequired: false,
    catalogSnapshotId: "catalog-snapshot-v2",
    supplyOptions: [
      {
        id: "supply-3m",
        length: { value: "3000", unit: "mm" },
        orderable: true,
        active: true,
        ruleId: "rule-supply-3m",
        source: catalogSource("supply-3m")
      },
      {
        id: "supply-6m",
        length: { value: "6000", unit: "mm" },
        orderable: true,
        active: true,
        ruleId: "rule-supply-6m",
        source: catalogSource("supply-6m")
      }
    ],
    includedItems: [],
    source: catalogSource("straight")
  },
  {
    id: "product-fitting",
    code: "NX BEND",
    descriptionEn: "Horizontal bend",
    role: "fitting",
    orderUnit: "pcs",
    packageIncrement: { value: "1", unit: "pcs" },
    orderable: true,
    active: true,
    engineeringReviewRequired: false,
    catalogSnapshotId: "catalog-snapshot-v2",
    supplyOptions: [],
    includedItems: [],
    source: catalogSource("fitting")
  },
  {
    id: "product-connector",
    code: "NX CONNECTOR",
    descriptionEn: "Fitting connector",
    role: "connector",
    orderUnit: "pcs",
    packageIncrement: { value: "2", unit: "pcs" },
    orderable: true,
    active: true,
    engineeringReviewRequired: false,
    catalogSnapshotId: "catalog-snapshot-v2",
    supplyOptions: [],
    includedItems: [
      {
        id: "included-connector-fastener",
        childProductId: "product-fastener",
        quantityPerParent: { value: "2", unit: "pcs" },
        source: catalogSource("included-connector-fastener")
      }
    ],
    source: catalogSource("connector")
  },
  {
    id: "product-joint",
    code: "NX JOINT",
    descriptionEn: "Straight-run joint",
    role: "connector",
    orderUnit: "pcs",
    packageIncrement: { value: "2", unit: "pcs" },
    orderable: true,
    active: true,
    engineeringReviewRequired: false,
    catalogSnapshotId: "catalog-snapshot-v2",
    supplyOptions: [],
    includedItems: [],
    source: catalogSource("joint")
  },
  {
    id: "product-fastener",
    code: "NX FASTENER",
    descriptionEn: "Included fastener",
    role: "fastener",
    orderUnit: "pcs",
    packageIncrement: { value: "10", unit: "pcs" },
    orderable: true,
    active: true,
    engineeringReviewRequired: false,
    catalogSnapshotId: "catalog-snapshot-v2",
    supplyOptions: [],
    includedItems: [],
    source: catalogSource("fastener")
  },
  {
    id: "product-support",
    code: "NX SUPPORT",
    descriptionEn: "Wall support",
    role: "support",
    orderUnit: "pcs",
    packageIncrement: { value: "1", unit: "pcs" },
    orderable: true,
    active: true,
    engineeringReviewRequired: false,
    catalogSnapshotId: "catalog-snapshot-v2",
    supplyOptions: [],
    includedItems: [],
    source: catalogSource("support")
  },
  {
    id: "product-structure",
    code: "NX STRUCTURE",
    descriptionEn: "Support structure component",
    role: "structure",
    orderUnit: "pcs",
    packageIncrement: { value: "1", unit: "pcs" },
    orderable: true,
    active: true,
    engineeringReviewRequired: false,
    catalogSnapshotId: "catalog-snapshot-v2",
    supplyOptions: [],
    includedItems: [],
    source: catalogSource("structure")
  },
  {
    id: "product-anchor",
    code: "NX ANCHOR",
    descriptionEn: "Selected Niedax anchor",
    role: "anchor",
    orderUnit: "pcs",
    packageIncrement: { value: "10", unit: "pcs" },
    orderable: true,
    active: true,
    engineeringReviewRequired: true,
    catalogSnapshotId: "catalog-snapshot-v2",
    supplyOptions: [],
    includedItems: [],
    source: catalogSource("anchor")
  },
  {
    id: "product-wstb",
    code: "NX WSTB",
    descriptionEn: "WSTB ladder fixing",
    role: "wstb",
    orderUnit: "pcs",
    packageIncrement: { value: "10", unit: "pcs" },
    orderable: true,
    active: true,
    engineeringReviewRequired: false,
    catalogSnapshotId: "catalog-snapshot-v2",
    supplyOptions: [],
    includedItems: [],
    source: catalogSource("wstb")
  },
  {
    id: "product-endcap",
    code: "NX END CAP",
    descriptionEn: "Compatible end cap",
    role: "endpointMaterial",
    orderUnit: "pcs",
    packageIncrement: { value: "1", unit: "pcs" },
    orderable: true,
    active: true,
    engineeringReviewRequired: false,
    catalogSnapshotId: "catalog-snapshot-v2",
    supplyOptions: [],
    includedItems: [],
    source: catalogSource("endcap")
  },
  {
    id: "product-accessory",
    code: "NX ACCESSORY",
    descriptionEn: "Selected accessory",
    role: "accessory",
    orderUnit: "pcs",
    packageIncrement: { value: "1", unit: "pcs" },
    orderable: true,
    active: true,
    engineeringReviewRequired: false,
    catalogSnapshotId: "catalog-snapshot-v2",
    supplyOptions: [],
    includedItems: [],
    source: catalogSource("accessory")
  },
  {
    id: "product-manual-catalog",
    code: "NX MANUAL CATALOG",
    descriptionEn: "Manual catalog product",
    role: "other",
    orderUnit: "pcs",
    packageIncrement: { value: "10", unit: "pcs" },
    orderable: true,
    active: true,
    engineeringReviewRequired: false,
    catalogSnapshotId: "catalog-snapshot-v2",
    supplyOptions: [],
    includedItems: [],
    source: catalogSource("manual-catalog")
  }
] as const;

const compatibilityRelations = [
  ["compat-straight", "straightSection", "project-v2", "product-straight"],
  ["compat-fitting", "fitting", "fitting-a", "product-fitting"],
  ["compat-support", "support", "project-v2", "product-support"],
  ["compat-structure", "structure", "project-v2", "product-structure"],
  ["compat-fastener", "accessory", "project-v2", "product-fastener"],
  ["compat-anchor", "anchor", "project-v2", "product-anchor"],
  ["compat-wstb", "wstb", "project-v2", "product-wstb"],
  ["compat-accessory", "accessory", "project-v2", "product-accessory"],
  ["compat-manual", "manualCatalog", "manual-catalog", "product-manual-catalog"]
].map(([id, context, subjectRef, productId]) => ({
  id: id!,
  context: context as
    | "straightSection"
    | "fitting"
    | "support"
    | "structure"
    | "accessory"
    | "anchor"
    | "wstb"
    | "manualCatalog",
  subjectRef: subjectRef!,
  productId: productId!,
  allowed: true,
  ruleId: "rule-compatibility",
  ruleSnapshotId: "rule-snapshot-v2",
  source: ruleSource("rule-compatibility")
}));

const commonSupport = {
  spacing: { value: "1.5", unit: "m" },
  supportType: "wall",
  supportProductId: "product-support",
  templateId: "template-wall",
  levelCount: { value: "2", unit: "pcs" },
  substrate: "concrete",
  anchorProductId: "product-anchor",
  anchorQuantityOverride: {
    originalPerSupportAxis: { value: "2", unit: "pcs" },
    adjustedPerSupportAxis: { value: "3", unit: "pcs" },
    metadata: metadata("anchor-override")
  },
  wstbProductId: "product-wstb",
  wstb: { mode: "two", ruleId: "rule-wstb-two" },
  templateManualValues: []
} as const;

export const allMajorRulesInputV2 = {
  schemaVersion: "calculation-input/v2",
  invocation: { calculationRunId: "run-v2", inputFingerprint: inputHash },
  project: {
    id: "project-v2",
    code: "PRJ-V2",
    defaultReservePercent: "10",
    cableLoad: null,
    routes: [
      {
        id: "route-a",
        code: "R-A",
        straightProductId: "product-straight",
        defaultSupplyOptionId: "supply-6m",
        startEndpoint: {
          id: "endpoint-a-start",
          type: "endCap",
          materialRuleId: "rule-endcap-a",
          connectionId: null
        },
        endEndpoint: {
          id: "endpoint-a-end",
          type: "routeContinuation",
          materialRuleId: null,
          connectionId: "connection-logical"
        },
        geometry: [
          {
            id: "segment-a-1",
            kind: "straight",
            length: { value: "3.1", unit: "m" },
            supplyOptionId: null
          },
          {
            id: "fitting-a",
            kind: "fitting",
            fittingType: "horizontalBend",
            productId: "product-fitting",
            connectionRuleId: "rule-fitting-a",
            additionalSupportRuleId: "rule-fitting-support-a",
            supportedPhysicalLength: null
          },
          {
            id: "segment-a-2",
            kind: "straight",
            length: { value: "2.9", unit: "m" },
            supplyOptionId: null
          }
        ],
        supports: {
          ...commonSupport,
          manualAdditionalSupports: [
            {
              id: "manual-support-a",
              originalCalculatedQuantity: { value: "9", unit: "pcs" },
              additionalQuantity: { value: "1", unit: "pcs" },
              sourceEntityRef: "route-a",
              metadata: metadata("manual-support-a")
            }
          ]
        }
      },
      {
        id: "route-b",
        code: "R-B",
        straightProductId: "product-straight",
        defaultSupplyOptionId: "supply-6m",
        startEndpoint: {
          id: "endpoint-b-start",
          type: "routeContinuation",
          materialRuleId: null,
          connectionId: "connection-logical"
        },
        endEndpoint: {
          id: "endpoint-b-end",
          type: "freeEnd",
          materialRuleId: null,
          connectionId: null
        },
        geometry: [
          {
            id: "segment-b-1",
            kind: "straight",
            length: { value: "3", unit: "m" },
            supplyOptionId: null
          },
          {
            id: "segment-b-2",
            kind: "straight",
            length: { value: "3", unit: "m" },
            supplyOptionId: null
          }
        ],
        supports: { ...commonSupport, manualAdditionalSupports: [] }
      }
    ],
    connections: [
      {
        id: "connection-logical",
        type: "logicalContinuation",
        participants: [
          { routeId: "route-a", endpointId: "endpoint-a-end" },
          { routeId: "route-b", endpointId: "endpoint-b-start" }
        ],
        physicalBreak: false,
        supportBehavior: "shared",
        materialRuleId: null,
        supportsBefore: { value: "0", unit: "pcs" },
        supportsAfter: { value: "0", unit: "pcs" },
        connectorCorrections: []
      }
    ],
    accessoryProductIds: ["product-accessory"]
  },
  catalogSnapshot: {
    snapshotId: "catalog-snapshot-v2",
    version: "2.0.0",
    contentHash: catalogHash
  },
  products,
  compatibilityRelations,
  ruleSnapshot: {
    snapshotId: "rule-snapshot-v2",
    version: "2.0.0",
    contentHash: ruleHash
  },
  rules: [
    {
      id: "rule-supply-3m",
      code: "SUPPLY-3M",
      version: "1.0.0",
      confidence: "catalogConfirmed",
      status: "active",
      ruleSnapshotId: "rule-snapshot-v2",
      source: ruleSource("rule-supply-3m"),
      type: "supplyOption",
      productId: "product-straight",
      supplyOptionId: "supply-3m"
    },
    {
      id: "rule-supply-6m",
      code: "SUPPLY-6M",
      version: "1.0.0",
      confidence: "catalogConfirmed",
      status: "active",
      ruleSnapshotId: "rule-snapshot-v2",
      source: ruleSource("rule-supply-6m"),
      type: "supplyOption",
      productId: "product-straight",
      supplyOptionId: "supply-6m"
    },
    {
      id: "rule-compatibility",
      code: "COMPATIBILITY-ALLOW-LIST",
      version: "1.0.0",
      confidence: "catalogConfirmed",
      status: "active",
      ruleSnapshotId: "rule-snapshot-v2",
      source: ruleSource("rule-compatibility"),
      type: "compatibility",
      relationIds: compatibilityRelations.map((relation) => relation.id)
    },
    {
      id: "rule-joint",
      code: "INTERNAL-JOINT",
      version: "1.0.0",
      confidence: "catalogConfirmed",
      status: "active",
      ruleSnapshotId: "rule-snapshot-v2",
      source: ruleSource("rule-joint"),
      type: "internalJoint",
      straightProductId: "product-straight",
      supplyOptionId: null,
      jointProductId: "product-joint",
      quantityPerJoint: { value: "1", unit: "pcs" }
    },
    {
      id: "rule-fitting-a",
      code: "FITTING-A-CONNECTIONS",
      version: "1.0.0",
      confidence: "catalogConfirmed",
      status: "active",
      ruleSnapshotId: "rule-snapshot-v2",
      source: ruleSource("rule-fitting-a"),
      type: "fittingConnection",
      fittingId: "fitting-a",
      components: [
        {
          productId: "product-connector",
          quantityPerEvent: { value: "1", unit: "pcs" },
          portOrSideCount: "2"
        }
      ]
    },
    {
      id: "rule-fitting-support-a",
      code: "FITTING-A-SUPPORT",
      version: "1.0.0",
      confidence: "calculated",
      status: "active",
      ruleSnapshotId: "rule-snapshot-v2",
      source: ruleSource("rule-fitting-support-a"),
      type: "fittingAdditionalSupport",
      fittingId: "fitting-a",
      quantity: { value: "1", unit: "pcs" }
    },
    {
      id: "rule-endcap-a",
      code: "ENDCAP-A",
      version: "1.0.0",
      confidence: "catalogConfirmed",
      status: "active",
      ruleSnapshotId: "rule-snapshot-v2",
      source: ruleSource("rule-endcap-a"),
      type: "endpointMaterial",
      endpointId: "endpoint-a-start",
      productId: "product-endcap",
      quantity: { value: "1", unit: "pcs" }
    },
    {
      id: "rule-wstb-two",
      code: "WSTB-TWO",
      version: "1.0.0",
      confidence: "projectRule",
      status: "draft",
      ruleSnapshotId: "rule-snapshot-v2",
      source: ruleSource("rule-wstb-two"),
      type: "wstbPerSupport",
      quantityPerSupport: { value: "2", unit: "pcs" }
    }
  ],
  assemblyTemplates: [
    {
      id: "template-wall",
      code: "WALL-TEMPLATE",
      nameEn: "Wall support assembly",
      status: "active",
      catalogSnapshotId: "catalog-snapshot-v2",
      ruleSnapshotId: "rule-snapshot-v2",
      engineeringReviewRequired: true,
      source: source("template", "template-wall"),
      components: [
        {
          id: "component-support",
          productId: "product-support",
          role: "support",
          quantity: { value: "1", unit: "pcs" },
          quantityMode: "perSupport",
          suppressWhenIncluded: false,
          manualParameterId: null,
          source: source("templateComponent", "component-support")
        },
        {
          id: "component-structure-fixed",
          productId: "product-structure",
          role: "structure",
          quantity: { value: "2", unit: "pcs" },
          quantityMode: "fixed",
          suppressWhenIncluded: false,
          manualParameterId: null,
          source: source("templateComponent", "component-structure-fixed")
        },
        {
          id: "component-structure-level",
          productId: "product-structure",
          role: "structure",
          quantity: { value: "1", unit: "pcs" },
          quantityMode: "perLevel",
          suppressWhenIncluded: false,
          manualParameterId: null,
          source: source("templateComponent", "component-structure-level")
        },
        {
          id: "component-anchor",
          productId: "product-anchor",
          role: "anchor",
          quantity: { value: "2", unit: "pcs" },
          quantityMode: "perSupport",
          suppressWhenIncluded: false,
          manualParameterId: null,
          source: source("templateComponent", "component-anchor")
        },
        {
          id: "component-wstb",
          productId: "product-wstb",
          role: "wstb",
          quantity: { value: "1", unit: "pcs" },
          quantityMode: "perSupport",
          suppressWhenIncluded: false,
          manualParameterId: null,
          source: source("templateComponent", "component-wstb")
        },
        {
          id: "component-fastener",
          productId: "product-fastener",
          role: "fastener",
          quantity: { value: "4", unit: "pcs" },
          quantityMode: "fixed",
          suppressWhenIncluded: true,
          manualParameterId: null,
          source: source("templateComponent", "component-fastener")
        }
      ]
    }
  ],
  manualItems: [
    {
      id: "manual-catalog",
      kind: "catalog",
      productId: "product-manual-catalog",
      descriptionEn: "Manual catalog product",
      productCode: "NX MANUAL CATALOG",
      quantity: { value: "3", unit: "pcs" },
      reason: "Required by site",
      note: null,
      reservePolicy: {
        mode: "disabled",
        originalPercent: "10",
        metadata: metadata("manual-catalog-reserve")
      },
      packagingPolicy: { mode: "catalogDefault" },
      quantityOverride: null
    },
    {
      id: "manual-free-text",
      kind: "freeText",
      productId: null,
      descriptionEn: "Site supplied strip",
      productCode: null,
      quantity: { value: "2", unit: "m" },
      reason: "Site-specific material",
      note: "Not a catalog product",
      reservePolicy: {
        mode: "percentageOverride",
        originalPercent: "10",
        percent: "10",
        metadata: metadata("manual-free-reserve")
      },
      packagingPolicy: {
        mode: "incrementOverride",
        increment: { value: "3", unit: "m" },
        metadata: metadata("manual-free-package")
      },
      quantityOverride: null
    }
  ],
  productQuantityAdjustments: [],
  linePolicies: [],
  options: {
    unresolvedMaterialPolicy: "warnAndOmit",
    supportMismatchPolicy: "splitWithEngineeringReview",
    includePackaging: true
  }
} as const satisfies CalculationInputV2;

export function cloneInputV2(): CalculationInputV2 {
  return structuredClone(allMajorRulesInputV2);
}
