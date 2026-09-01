import { z } from "zod";

import { ProjectStatusSchema } from "../domain.js";
import {
  CorrelationIdSchema,
  type DeepReadonly,
  HumanTextSchema,
  IdentifierSchema,
  OptionalHumanTextSchema,
  ProductCodeSchema,
  UtcDateTimeSchema
} from "../primitives.js";
import { ValidationIssueV1Schema } from "../v1/transport.js";
import {
  CalculationResultV2Schema,
  DecimalStringV2Schema,
  IntegerDecimalStringV2Schema,
  OrderUnitV2Schema,
  PercentageDecimalStringV2Schema,
  PiecesQuantityV2Schema,
  PositiveDecimalStringV2Schema,
  PositiveIntegerDecimalStringV2Schema,
  PositiveMetresQuantityV2Schema,
  PositiveMillimetresQuantityV2Schema,
  PositivePiecesQuantityV2Schema,
  PositiveQuantityV2Schema,
  SnapshotReferenceV2Schema
} from "./calculation.js";
import {
  CALCULATE_PROJECT_DRAFT_REQUEST_V2,
  CALCULATE_PROJECT_DRAFT_RESPONSE_V2,
  CREATE_PROJECT_DRAFT_REQUEST_V2,
  CURRENT_CALCULATION_RESPONSE_V2,
  EDITOR_CATALOG_RESPONSE_V2,
  PROJECT_DRAFT_RESPONSE_V2,
  PROJECT_LIST_RESPONSE_V2,
  PROJECT_VALIDATION_RESPONSE_V2,
  REPLACE_PROJECT_DRAFT_REQUEST_V2,
  VALIDATE_PROJECT_DRAFT_REQUEST_V2
} from "../versions.js";

export {
  CALCULATE_PROJECT_DRAFT_REQUEST_V2,
  CALCULATE_PROJECT_DRAFT_RESPONSE_V2,
  CREATE_PROJECT_DRAFT_REQUEST_V2,
  CURRENT_CALCULATION_RESPONSE_V2,
  EDITOR_CATALOG_RESPONSE_V2,
  PROJECT_DRAFT_RESPONSE_V2,
  PROJECT_LIST_RESPONSE_V2,
  PROJECT_VALIDATION_RESPONSE_V2,
  REPLACE_PROJECT_DRAFT_REQUEST_V2,
  VALIDATE_PROJECT_DRAFT_REQUEST_V2
};

/** PostgreSQL-backed public IDs are UUIDs; engine-only stable IDs remain IdentifierSchema values. */
export const DatabaseIdV2Schema = z.uuid();
export const ProjectLocaleV2Schema = z.enum(["bg", "en"]);

const ProjectCodeV2Schema = z.string().trim().min(1).max(100);
const ProjectNameV2Schema = z.string().trim().min(1).max(500);
const RouteCodeV2Schema = z.string().trim().min(1).max(100);
const RouteNameV2Schema = z.string().trim().min(1).max(500);
const SelectionCodeV2Schema = z.string().trim().min(1).max(128);
const OptionalEquipmentReferenceV2Schema = z.string().trim().max(500).nullable();

function fitsNumeric(value: string, precision: number, scale: number): boolean {
  const [whole = "", fraction = ""] = value.split(".");
  return (
    fraction.length <= scale &&
    whole.length <= precision - scale &&
    whole.length + fraction.length <= precision
  );
}

const PersistedDecimalV2Schema = DecimalStringV2Schema.refine(
  (value) => fitsNumeric(value, 24, 8),
  "Value exceeds the persisted numeric(24,8) boundary"
);
const PersistedPositiveDecimalV2Schema = PositiveDecimalStringV2Schema.refine(
  (value) => fitsNumeric(value, 24, 8),
  "Value exceeds the persisted numeric(24,8) boundary"
);
const PersistedIntegerV2Schema = IntegerDecimalStringV2Schema.refine(
  (value) => BigInt(value) <= 2_147_483_647n,
  "Value exceeds the persisted integer boundary"
);
const PersistedPositiveIntegerV2Schema = PositiveIntegerDecimalStringV2Schema.refine(
  (value) => fitsNumeric(value, 24, 8),
  "Value exceeds the persisted numeric(24,8) boundary"
);
const PersistedPercentageV2Schema = PercentageDecimalStringV2Schema.refine(
  (value) => fitsNumeric(value, 7, 4),
  "Percentage exceeds the persisted numeric(7,4) boundary"
);

const PersistedPiecesQuantityV2Schema = z
  .object({ value: PersistedIntegerV2Schema, unit: z.literal("pcs") })
  .strict();
const PersistedPositivePiecesQuantityV2Schema = z
  .object({ value: PersistedPositiveIntegerV2Schema, unit: z.literal("pcs") })
  .strict();
const PersistedPositiveMetresQuantityV2Schema = z
  .object({ value: PersistedPositiveDecimalV2Schema, unit: z.literal("m") })
  .strict();
const PersistedPositiveMillimetresQuantityV2Schema = z
  .object({ value: PersistedPositiveDecimalV2Schema, unit: z.literal("mm") })
  .strict();
const PersistedCableLoadQuantityV2Schema = z
  .object({ value: PersistedDecimalV2Schema, unit: z.literal("kgPerM") })
  .strict();

export const DraftOrderQuantityV2Schema = z.discriminatedUnion("unit", [
  z.object({ value: PersistedPositiveIntegerV2Schema, unit: z.literal("pcs") }).strict(),
  z.object({ value: PersistedPositiveDecimalV2Schema, unit: z.literal("m") }).strict(),
  z.object({ value: PersistedPositiveDecimalV2Schema, unit: z.literal("kg") }).strict()
]);

export const DraftManualMetadataV2Schema = z
  .object({
    overrideId: DatabaseIdV2Schema,
    reason: HumanTextSchema,
    note: OptionalHumanTextSchema
  })
  .strict();

export const DraftReservePolicyV2Schema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("projectDefault") }).strict(),
  z.object({ mode: z.literal("disabled"), metadata: DraftManualMetadataV2Schema }).strict(),
  z
    .object({
      mode: z.literal("percentageOverride"),
      percent: PercentageDecimalStringV2Schema,
      metadata: DraftManualMetadataV2Schema
    })
    .strict()
]);

export const DraftPackagingPolicyV2Schema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("catalogDefault") }).strict(),
  z
    .object({
      mode: z.literal("disabled"),
      metadata: DraftManualMetadataV2Schema.nullable()
    })
    .strict(),
  z
    .object({
      mode: z.literal("incrementOverride"),
      increment: DraftOrderQuantityV2Schema,
      metadata: DraftManualMetadataV2Schema
    })
    .strict()
]);

export const DraftQuantityOverrideV2Schema = z
  .object({
    adjustedQuantity: DraftOrderQuantityV2Schema,
    metadata: DraftManualMetadataV2Schema
  })
  .strict();

const DraftManualItemFields = {
  id: DatabaseIdV2Schema,
  quantity: DraftOrderQuantityV2Schema,
  reason: HumanTextSchema,
  note: OptionalHumanTextSchema,
  reservePolicy: DraftReservePolicyV2Schema,
  packagingPolicy: DraftPackagingPolicyV2Schema,
  quantityOverride: DraftQuantityOverrideV2Schema.nullable()
};

export const ProjectManualItemDraftV2Schema = z
  .discriminatedUnion("kind", [
    z
      .object({
        kind: z.literal("catalog"),
        productId: DatabaseIdV2Schema,
        ...DraftManualItemFields
      })
      .strict(),
    z
      .object({
        kind: z.literal("freeText"),
        productId: z.null(),
        productCode: ProductCodeSchema.nullable(),
        descriptionEn: HumanTextSchema,
        ...DraftManualItemFields
      })
      .strict()
  ])
  .superRefine((item, context) => {
    if (
      item.packagingPolicy.mode === "incrementOverride" &&
      item.packagingPolicy.increment.unit !== item.quantity.unit
    ) {
      context.addIssue({
        code: "custom",
        message: "Manual package increment unit must match the item quantity unit",
        path: ["packagingPolicy", "increment", "unit"]
      });
    }
    if (
      item.quantityOverride !== null &&
      item.quantityOverride.adjustedQuantity.unit !== item.quantity.unit
    ) {
      context.addIssue({
        code: "custom",
        message: "Manual quantity override unit must match the item quantity unit",
        path: ["quantityOverride", "adjustedQuantity", "unit"]
      });
    }
    if (item.kind === "freeText" && item.packagingPolicy.mode === "catalogDefault") {
      context.addIssue({
        code: "custom",
        message: "Free-text items must explicitly enable or disable package rounding",
        path: ["packagingPolicy"]
      });
    }
  });

export const ProjectEndpointDraftV2Schema = z
  .object({
    id: DatabaseIdV2Schema,
    type: z.enum([
      "freeEnd",
      "routeContinuation",
      "endCap",
      "equipment",
      "physicalSplice",
      "custom"
    ]),
    selectedProductId: DatabaseIdV2Schema.nullable(),
    equipmentReference: OptionalEquipmentReferenceV2Schema,
    customDescription: OptionalHumanTextSchema
  })
  .strict()
  .superRefine((endpoint, context) => {
    if (endpoint.type === "equipment" && !endpoint.equipmentReference) {
      context.addIssue({
        code: "custom",
        message: "Equipment endpoints require an equipment reference",
        path: ["equipmentReference"]
      });
    }
    if (endpoint.type === "custom" && !endpoint.customDescription) {
      context.addIssue({
        code: "custom",
        message: "Custom endpoints require a description",
        path: ["customDescription"]
      });
    }
    if (
      (endpoint.type === "freeEnd" || endpoint.type === "routeContinuation") &&
      endpoint.selectedProductId !== null
    ) {
      context.addIssue({
        code: "custom",
        message: "This endpoint type cannot carry a selected material product",
        path: ["selectedProductId"]
      });
    }
  });

export const ProjectStraightDraftV2Schema = z
  .object({
    id: DatabaseIdV2Schema,
    kind: z.literal("straight"),
    length: PersistedPositiveMetresQuantityV2Schema,
    supplyOptionId: IdentifierSchema.nullable()
  })
  .strict();

export const ProjectFittingDraftV2Schema = z
  .object({
    id: DatabaseIdV2Schema,
    kind: z.literal("fitting"),
    fittingType: z.enum(["horizontalBend", "verticalBend", "tee", "transition", "custom"]),
    selectedProductId: DatabaseIdV2Schema.nullable(),
    supportedPhysicalLength: PositiveMetresQuantityV2Schema.nullable(),
    customDescription: OptionalHumanTextSchema
  })
  .strict()
  .superRefine((fitting, context) => {
    if (fitting.fittingType === "custom" && !fitting.customDescription) {
      context.addIssue({
        code: "custom",
        message: "Custom fittings require a description",
        path: ["customDescription"]
      });
    }
  });

export const ProjectGeometryItemDraftV2Schema = z.discriminatedUnion("kind", [
  ProjectStraightDraftV2Schema,
  ProjectFittingDraftV2Schema
]);

export const ProjectSelectionDraftV2Schema = z
  .object({
    system: SelectionCodeV2Schema.nullable(),
    dimensionId: IdentifierSchema.nullable(),
    width: PersistedPositiveMillimetresQuantityV2Schema.nullable(),
    height: PersistedPositiveMillimetresQuantityV2Schema.nullable(),
    materialCode: SelectionCodeV2Schema.nullable(),
    finishCode: SelectionCodeV2Schema.nullable(),
    straightProductId: DatabaseIdV2Schema.nullable(),
    defaultSupplyOptionId: IdentifierSchema.nullable()
  })
  .strict();

export const DraftAnchorQuantityOverrideV2Schema = z
  .object({
    adjustedPerSupportAxis: PersistedPositivePiecesQuantityV2Schema,
    metadata: DraftManualMetadataV2Schema
  })
  .strict();

export const DraftWstbSelectionV2Schema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("one") }).strict(),
  z.object({ mode: z.literal("two") }).strict(),
  z
    .object({
      mode: z.literal("custom"),
      quantityPerSupport: PersistedPositiveIntegerV2Schema,
      metadata: DraftManualMetadataV2Schema
    })
    .strict()
]);

export const DraftManualSupportAdjustmentV2Schema = z
  .object({
    id: DatabaseIdV2Schema,
    additionalQuantity: PiecesQuantityV2Schema,
    sourceEntityRef: DatabaseIdV2Schema,
    metadata: DraftManualMetadataV2Schema
  })
  .strict();

export const DraftTemplateManualValueV2Schema = z
  .object({
    componentId: DatabaseIdV2Schema,
    quantity: PositiveQuantityV2Schema,
    metadata: DraftManualMetadataV2Schema
  })
  .strict();

export const ProjectSupportDraftV2Schema = z
  .object({
    spacing: PersistedPositiveMetresQuantityV2Schema.nullable(),
    supportType: z.enum(["wall", "ceiling", "floor", "custom"]).nullable(),
    supportProductId: DatabaseIdV2Schema.nullable(),
    assemblyTemplateId: DatabaseIdV2Schema.nullable(),
    levelCount: PositivePiecesQuantityV2Schema.nullable(),
    substrate: z.enum(["concrete", "steel", "masonry", "unknown"]).nullable(),
    anchorProductId: DatabaseIdV2Schema.nullable(),
    anchorQuantityOverride: DraftAnchorQuantityOverrideV2Schema.nullable(),
    wstbProductId: DatabaseIdV2Schema.nullable(),
    wstb: DraftWstbSelectionV2Schema.nullable(),
    manualAdditionalSupports: z.array(DraftManualSupportAdjustmentV2Schema),
    templateManualValues: z.array(DraftTemplateManualValueV2Schema)
  })
  .strict()
  .superRefine((support, context) => {
    const adjustmentIds = new Set<string>();
    for (const [index, adjustment] of support.manualAdditionalSupports.entries()) {
      if (adjustmentIds.has(adjustment.id)) {
        context.addIssue({
          code: "custom",
          message: "Manual support adjustment IDs must be unique",
          path: ["manualAdditionalSupports", index, "id"]
        });
      }
      adjustmentIds.add(adjustment.id);
    }
    const componentIds = new Set<string>();
    for (const [index, value] of support.templateManualValues.entries()) {
      if (componentIds.has(value.componentId)) {
        context.addIssue({
          code: "custom",
          message: "Template manual values must be unique by component",
          path: ["templateManualValues", index, "componentId"]
        });
      }
      componentIds.add(value.componentId);
    }
  });

export const ProjectRouteDraftV2Schema = z
  .object({
    id: DatabaseIdV2Schema,
    code: RouteCodeV2Schema,
    name: RouteNameV2Schema,
    description: OptionalHumanTextSchema,
    selection: ProjectSelectionDraftV2Schema,
    startEndpoint: ProjectEndpointDraftV2Schema,
    endEndpoint: ProjectEndpointDraftV2Schema,
    geometry: z.array(ProjectGeometryItemDraftV2Schema),
    supports: ProjectSupportDraftV2Schema
  })
  .strict()
  .superRefine((route, context) => {
    if (route.startEndpoint.id === route.endEndpoint.id) {
      context.addIssue({
        code: "custom",
        message: "A route start and end endpoint must have different stable IDs",
        path: ["endEndpoint", "id"]
      });
    }
    const geometryIds = new Set<string>();
    for (const [index, geometry] of route.geometry.entries()) {
      if (geometryIds.has(geometry.id)) {
        context.addIssue({
          code: "custom",
          message: "Geometry stable IDs must be unique within a route",
          path: ["geometry", index, "id"]
        });
      }
      geometryIds.add(geometry.id);
    }
  });

export const DraftConnectorCorrectionV2Schema = z
  .object({
    id: DatabaseIdV2Schema,
    productId: DatabaseIdV2Schema,
    adjustedQuantity: PiecesQuantityV2Schema,
    metadata: DraftManualMetadataV2Schema
  })
  .strict();

export const ProjectConnectionDraftV2Schema = z
  .object({
    id: DatabaseIdV2Schema,
    type: z.enum([
      "logicalContinuation",
      "physicalSplice",
      "horizontalBend",
      "verticalBend",
      "tee",
      "transition",
      "custom"
    ]),
    participants: z
      .array(z.object({ routeId: DatabaseIdV2Schema, endpointId: DatabaseIdV2Schema }).strict())
      .min(2)
      .max(3),
    physicalBreak: z.boolean(),
    supportBehavior: z.enum(["shared", "separate"]),
    materialProductId: DatabaseIdV2Schema.nullable(),
    supportsBefore: PersistedPiecesQuantityV2Schema,
    supportsAfter: PersistedPiecesQuantityV2Schema,
    connectorCorrections: z.array(DraftConnectorCorrectionV2Schema)
  })
  .strict()
  .superRefine((connection, context) => {
    const expectedParticipantCount =
      connection.type === "tee" ? 3 : connection.type === "custom" ? null : 2;
    if (
      expectedParticipantCount !== null &&
      connection.participants.length !== expectedParticipantCount
    ) {
      context.addIssue({
        code: "custom",
        message: `${connection.type} requires exactly ${expectedParticipantCount} participants`,
        path: ["participants"]
      });
    }
    if (connection.type === "logicalContinuation" && connection.physicalBreak) {
      context.addIssue({
        code: "custom",
        message: "Logical continuation cannot be a physical break",
        path: ["physicalBreak"]
      });
    }
    if (connection.type === "logicalContinuation" && connection.materialProductId !== null) {
      context.addIssue({
        code: "custom",
        message: "Logical continuation cannot carry a physical material product",
        path: ["materialProductId"]
      });
    }
    const endpointIds = new Set<string>();
    const routeIds = new Set<string>();
    for (const [index, participant] of connection.participants.entries()) {
      if (endpointIds.has(participant.endpointId)) {
        context.addIssue({
          code: "custom",
          message: "A connection cannot repeat one physical endpoint",
          path: ["participants", index, "endpointId"]
        });
      }
      endpointIds.add(participant.endpointId);
      if (routeIds.has(participant.routeId)) {
        context.addIssue({
          code: "custom",
          message: "A connection cannot use more than one endpoint from the same route",
          path: ["participants", index, "routeId"]
        });
      }
      routeIds.add(participant.routeId);
    }
    const correctionIds = new Set<string>();
    const correctionProducts = new Set<string>();
    for (const [index, correction] of connection.connectorCorrections.entries()) {
      if (correctionIds.has(correction.id)) {
        context.addIssue({
          code: "custom",
          message: "Connector correction IDs must be unique",
          path: ["connectorCorrections", index, "id"]
        });
      }
      correctionIds.add(correction.id);
      if (correctionProducts.has(correction.productId)) {
        context.addIssue({
          code: "custom",
          message: "Only one connector correction is allowed per product",
          path: ["connectorCorrections", index, "productId"]
        });
      }
      correctionProducts.add(correction.productId);
    }
  });

const ProjectDraftFields = {
  code: ProjectCodeV2Schema,
  name: ProjectNameV2Schema,
  description: OptionalHumanTextSchema,
  defaultLocale: ProjectLocaleV2Schema,
  defaultReservePercent: PersistedPercentageV2Schema,
  cableLoad: PersistedCableLoadQuantityV2Schema.nullable(),
  routes: z.array(ProjectRouteDraftV2Schema),
  connections: z.array(ProjectConnectionDraftV2Schema),
  accessoryProductIds: z.array(DatabaseIdV2Schema),
  manualItems: z.array(ProjectManualItemDraftV2Schema)
};

const ProjectDraftInputBaseV2Schema = z.object(ProjectDraftFields).strict();
type ProjectDraftInputBaseV2 = z.infer<typeof ProjectDraftInputBaseV2Schema>;

function validateProjectDraftGraph(draft: ProjectDraftInputBaseV2, context: z.RefinementCtx): void {
  const routes = new Map<string, ProjectDraftInputBaseV2["routes"][number]>();
  const routeCodes = new Set<string>();
  const endpointOwners = new Map<string, string>();
  const endpoints = new Map<string, ProjectDraftInputBaseV2["routes"][number]["startEndpoint"]>();
  const endpointPositions = new Map<string, "start" | "end">();
  const geometryIds = new Set<string>();
  for (const [routeIndex, route] of draft.routes.entries()) {
    if (routes.has(route.id)) {
      context.addIssue({
        code: "custom",
        message: "Route stable IDs must be unique",
        path: ["routes", routeIndex, "id"]
      });
    }
    routes.set(route.id, route);
    const normalizedCode = route.code.toLocaleLowerCase("en-US");
    if (routeCodes.has(normalizedCode)) {
      context.addIssue({
        code: "custom",
        message: "Route codes must be unique case-insensitively",
        path: ["routes", routeIndex, "code"]
      });
    }
    routeCodes.add(normalizedCode);
    for (const [position, endpoint] of [
      ["start", route.startEndpoint],
      ["end", route.endEndpoint]
    ] as const) {
      if (endpointOwners.has(endpoint.id)) {
        context.addIssue({
          code: "custom",
          message: "Endpoint stable IDs must be globally unique",
          path: ["routes", routeIndex]
        });
      }
      endpointOwners.set(endpoint.id, route.id);
      endpoints.set(endpoint.id, endpoint);
      endpointPositions.set(endpoint.id, position);
    }
    for (const [geometryIndex, geometry] of route.geometry.entries()) {
      if (geometryIds.has(geometry.id)) {
        context.addIssue({
          code: "custom",
          message: "Geometry stable IDs must be globally unique",
          path: ["routes", routeIndex, "geometry", geometryIndex, "id"]
        });
      }
      geometryIds.add(geometry.id);
    }
    for (const [adjustmentIndex, adjustment] of route.supports.manualAdditionalSupports.entries()) {
      if (
        adjustment.sourceEntityRef !== route.id &&
        !route.geometry.some((geometry) => geometry.id === adjustment.sourceEntityRef)
      ) {
        context.addIssue({
          code: "custom",
          message: "Manual support source must reference its route or owned geometry",
          path: [
            "routes",
            routeIndex,
            "supports",
            "manualAdditionalSupports",
            adjustmentIndex,
            "sourceEntityRef"
          ]
        });
      }
    }
  }

  const connectionIds = new Set<string>();
  const connectedEndpoints = new Set<string>();
  for (const [connectionIndex, connection] of draft.connections.entries()) {
    if (connectionIds.has(connection.id)) {
      context.addIssue({
        code: "custom",
        message: "Connection stable IDs must be unique",
        path: ["connections", connectionIndex, "id"]
      });
    }
    connectionIds.add(connection.id);
    for (const [participantIndex, participant] of connection.participants.entries()) {
      if (endpointOwners.get(participant.endpointId) !== participant.routeId) {
        context.addIssue({
          code: "custom",
          message: "Connection participant must reference an endpoint owned by its route",
          path: ["connections", connectionIndex, "participants", participantIndex]
        });
      }
      if (connectedEndpoints.has(participant.endpointId)) {
        context.addIssue({
          code: "custom",
          message: "A physical endpoint can participate in only one connection",
          path: ["connections", connectionIndex, "participants", participantIndex, "endpointId"]
        });
      }
      const endpoint = endpoints.get(participant.endpointId);
      if (
        connection.type === "logicalContinuation" &&
        endpoint !== undefined &&
        endpoint.type !== "routeContinuation"
      ) {
        context.addIssue({
          code: "custom",
          message: "Logical continuation participants must use routeContinuation endpoints",
          path: ["connections", connectionIndex, "participants", participantIndex, "endpointId"]
        });
      }
      connectedEndpoints.add(participant.endpointId);
    }
    if (
      connection.participants.length === 2 &&
      new Set(
        connection.participants.map((participant) => endpointPositions.get(participant.endpointId))
      ).size !== 2
    ) {
      context.addIssue({
        code: "custom",
        message: "A two-way connection must join a start endpoint to an end endpoint",
        path: ["connections", connectionIndex, "participants"]
      });
    }
  }

  const accessoryIds = new Set<string>();
  for (const [index, productId] of draft.accessoryProductIds.entries()) {
    if (accessoryIds.has(productId)) {
      context.addIssue({
        code: "custom",
        message: "Accessory product selections must be unique",
        path: ["accessoryProductIds", index]
      });
    }
    accessoryIds.add(productId);
  }
  const manualIds = new Set<string>();
  for (const [index, item] of draft.manualItems.entries()) {
    if (manualIds.has(item.id)) {
      context.addIssue({
        code: "custom",
        message: "Manual item stable IDs must be unique",
        path: ["manualItems", index, "id"]
      });
    }
    manualIds.add(item.id);
  }
}

export const ProjectDraftInputV2Schema =
  ProjectDraftInputBaseV2Schema.superRefine(validateProjectDraftGraph);

const ProjectOwnerFields = {
  ownerId: DatabaseIdV2Schema.nullable(),
  ownerDisplayName: HumanTextSchema.nullable()
};

function validateProjectOwner(
  project: { readonly ownerId: string | null; readonly ownerDisplayName: string | null },
  context: z.RefinementCtx
): void {
  if ((project.ownerId === null) !== (project.ownerDisplayName === null)) {
    context.addIssue({
      code: "custom",
      message: "Project owner ID and display name must either both be present or both be null",
      path: [project.ownerId === null ? "ownerId" : "ownerDisplayName"]
    });
  }
}

export const ProjectV2Schema = z
  .object({
    id: DatabaseIdV2Schema,
    ...ProjectOwnerFields,
    status: ProjectStatusSchema,
    draftVersion: z.number().int().nonnegative(),
    createdAt: UtcDateTimeSchema,
    updatedAt: UtcDateTimeSchema,
    ...ProjectDraftFields
  })
  .strict()
  .superRefine(validateProjectOwner)
  .superRefine(validateProjectDraftGraph);

export const ProjectListItemV2Schema = z
  .object({
    id: DatabaseIdV2Schema,
    ...ProjectOwnerFields,
    code: ProjectCodeV2Schema,
    name: ProjectNameV2Schema,
    description: OptionalHumanTextSchema,
    status: ProjectStatusSchema,
    defaultLocale: ProjectLocaleV2Schema,
    defaultReservePercent: PersistedPercentageV2Schema,
    editorState: z.enum(["editable", "retainedReadOnly"]),
    draftVersion: z.number().int().nonnegative(),
    createdAt: UtcDateTimeSchema,
    updatedAt: UtcDateTimeSchema
  })
  .strict()
  .superRefine(validateProjectOwner);

export const ProjectListResponseV2Schema = z
  .object({
    schemaVersion: z.literal(PROJECT_LIST_RESPONSE_V2),
    correlationId: CorrelationIdSchema,
    projects: z.array(ProjectListItemV2Schema)
  })
  .strict();

export const CreateProjectDraftRequestV2Schema = z
  .object({
    schemaVersion: z.literal(CREATE_PROJECT_DRAFT_REQUEST_V2),
    draft: ProjectDraftInputV2Schema
  })
  .strict();

export const ReplaceProjectDraftRequestV2Schema = z
  .object({
    schemaVersion: z.literal(REPLACE_PROJECT_DRAFT_REQUEST_V2),
    expectedDraftVersion: z.number().int().nonnegative(),
    draft: ProjectDraftInputV2Schema
  })
  .strict();

export const ProjectDraftResponseV2Schema = z
  .object({
    schemaVersion: z.literal(PROJECT_DRAFT_RESPONSE_V2),
    correlationId: CorrelationIdSchema,
    catalogSnapshot: SnapshotReferenceV2Schema,
    ruleSnapshot: SnapshotReferenceV2Schema,
    project: ProjectV2Schema
  })
  .strict();

export const ValidateProjectDraftRequestV2Schema = z
  .object({
    schemaVersion: z.literal(VALIDATE_PROJECT_DRAFT_REQUEST_V2),
    expectedDraftVersion: z.number().int().nonnegative()
  })
  .strict();

export const ProjectValidationResponseV2Schema = z
  .object({
    schemaVersion: z.literal(PROJECT_VALIDATION_RESPONSE_V2),
    correlationId: CorrelationIdSchema,
    projectId: DatabaseIdV2Schema,
    draftVersion: z.number().int().nonnegative(),
    blockingErrors: z.array(ValidationIssueV1Schema),
    warnings: z.array(ValidationIssueV1Schema),
    engineeringReview: z.array(ValidationIssueV1Schema),
    canCalculate: z.boolean()
  })
  .strict()
  .superRefine((result, context) => {
    if (result.canCalculate !== (result.blockingErrors.length === 0)) {
      context.addIssue({
        code: "custom",
        message: "Calculation readiness must agree with blocking validation errors",
        path: ["canCalculate"]
      });
    }
  });

export const CalculateProjectDraftRequestV2Schema = z
  .object({
    schemaVersion: z.literal(CALCULATE_PROJECT_DRAFT_REQUEST_V2),
    expectedDraftVersion: z.number().int().nonnegative()
  })
  .strict();

export const CalculationRunV2Schema = z
  .object({
    id: DatabaseIdV2Schema,
    status: z.literal("succeeded"),
    inputFingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
    engineVersion: z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u),
    catalogSnapshot: SnapshotReferenceV2Schema,
    ruleSnapshot: SnapshotReferenceV2Schema,
    startedAt: UtcDateTimeSchema,
    completedAt: UtcDateTimeSchema
  })
  .strict();

export const CalculationDraftV2Schema = z
  .object({
    projectId: DatabaseIdV2Schema,
    draftVersion: z.number().int().nonnegative(),
    run: CalculationRunV2Schema,
    result: CalculationResultV2Schema,
    stale: z.boolean()
  })
  .strict()
  .superRefine((calculation, context) => {
    if (calculation.result.calculationRunId !== calculation.run.id) {
      context.addIssue({
        code: "custom",
        message: "Calculation result run ID does not match the run",
        path: ["result", "calculationRunId"]
      });
    }
    if (calculation.result.inputFingerprint !== calculation.run.inputFingerprint) {
      context.addIssue({
        code: "custom",
        message: "Calculation result fingerprint does not match the run",
        path: ["result", "inputFingerprint"]
      });
    }
    if (
      calculation.result.catalogSnapshot.snapshotId !==
        calculation.run.catalogSnapshot.snapshotId ||
      calculation.result.catalogSnapshot.version !== calculation.run.catalogSnapshot.version ||
      calculation.result.catalogSnapshot.contentHash !==
        calculation.run.catalogSnapshot.contentHash ||
      calculation.result.ruleSnapshot.snapshotId !== calculation.run.ruleSnapshot.snapshotId ||
      calculation.result.ruleSnapshot.version !== calculation.run.ruleSnapshot.version ||
      calculation.result.ruleSnapshot.contentHash !== calculation.run.ruleSnapshot.contentHash
    ) {
      context.addIssue({
        code: "custom",
        message: "Calculation result snapshot references do not match the run",
        path: ["result"]
      });
    }
  });

export const CalculateProjectDraftResponseV2Schema = z
  .object({
    schemaVersion: z.literal(CALCULATE_PROJECT_DRAFT_RESPONSE_V2),
    correlationId: CorrelationIdSchema,
    calculation: CalculationDraftV2Schema
  })
  .strict();

export const CurrentCalculationResponseV2Schema = z
  .object({
    schemaVersion: z.literal(CURRENT_CALCULATION_RESPONSE_V2),
    correlationId: CorrelationIdSchema,
    projectId: DatabaseIdV2Schema,
    calculation: CalculationDraftV2Schema.nullable()
  })
  .strict()
  .superRefine((response, context) => {
    if (response.calculation !== null && response.calculation.projectId !== response.projectId) {
      context.addIssue({
        code: "custom",
        message: "Current calculation must belong to the requested project",
        path: ["calculation", "projectId"]
      });
    }
  });

export const EditorSupplyOptionV2Schema = z
  .object({
    id: IdentifierSchema,
    length: z.discriminatedUnion("value", [
      z.object({ value: z.literal("3000"), unit: z.literal("mm") }).strict(),
      z.object({ value: z.literal("6000"), unit: z.literal("mm") }).strict()
    ]),
    active: z.boolean(),
    orderable: z.boolean()
  })
  .strict();

export const EditorProductSelectionV2Schema = z
  .object({
    system: HumanTextSchema,
    dimensionId: IdentifierSchema,
    width: PositiveMillimetresQuantityV2Schema,
    height: PositiveMillimetresQuantityV2Schema,
    materialCode: HumanTextSchema,
    finishCode: HumanTextSchema
  })
  .strict();

export const EditorCatalogProductV2Schema = z
  .object({
    id: DatabaseIdV2Schema,
    code: ProductCodeSchema,
    descriptionEn: HumanTextSchema,
    role: z.enum([
      "straightSection",
      "fitting",
      "connector",
      "support",
      "structure",
      "anchor",
      "wstb",
      "endpointMaterial",
      "accessory",
      "fastener",
      "other"
    ]),
    orderUnit: OrderUnitV2Schema,
    packageIncrement: DraftOrderQuantityV2Schema.nullable(),
    active: z.boolean(),
    orderable: z.boolean(),
    selectable: z.boolean(),
    engineeringReviewRequired: z.boolean(),
    selection: EditorProductSelectionV2Schema.nullable(),
    supplyOptions: z.array(EditorSupplyOptionV2Schema)
  })
  .strict()
  .superRefine((product, context) => {
    if (product.selectable && (!product.active || !product.orderable)) {
      context.addIssue({
        code: "custom",
        message: "Only active orderable products may be selectable",
        path: ["selectable"]
      });
    }
    if (product.selection !== null && product.role !== "straightSection") {
      context.addIssue({
        code: "custom",
        message: "Only straight-section products carry the primary system selection tuple",
        path: ["selection"]
      });
    }
    if (product.orderable && product.packageIncrement === null) {
      context.addIssue({
        code: "custom",
        message: "Orderable editor products require an explicit package increment",
        path: ["packageIncrement"]
      });
    }
    if (product.packageIncrement !== null && product.packageIncrement.unit !== product.orderUnit) {
      context.addIssue({
        code: "custom",
        message: "Product package increment unit must match its order unit",
        path: ["packageIncrement", "unit"]
      });
    }
    const optionIds = new Set<string>();
    for (const [index, option] of product.supplyOptions.entries()) {
      if (optionIds.has(option.id)) {
        context.addIssue({
          code: "custom",
          message: "Supply option IDs must be unique within a product",
          path: ["supplyOptions", index, "id"]
        });
      }
      optionIds.add(option.id);
    }
  });

export const EditorTemplateComponentV2Schema = z
  .object({
    id: DatabaseIdV2Schema,
    productId: DatabaseIdV2Schema,
    role: z.enum(["support", "structure", "anchor", "fastener", "accessory", "wstb"]),
    quantity: PositiveQuantityV2Schema,
    quantityMode: z.enum(["fixed", "perSupport", "perLevel", "manual"]),
    suppressWhenIncluded: z.boolean(),
    manualParameterId: IdentifierSchema.nullable()
  })
  .strict()
  .superRefine((component, context) => {
    if (component.quantityMode === "manual" && component.manualParameterId === null) {
      context.addIssue({
        code: "custom",
        message: "Manual template components require a parameter ID",
        path: ["manualParameterId"]
      });
    }
  });

export const EditorAssemblyTemplateV2Schema = z
  .object({
    id: DatabaseIdV2Schema,
    code: HumanTextSchema,
    nameEn: HumanTextSchema,
    supportType: z.enum(["wall", "ceiling", "floor", "custom"]),
    applicableSystems: z.array(HumanTextSchema),
    engineeringReviewRequired: z.boolean(),
    components: z.array(EditorTemplateComponentV2Schema).min(1)
  })
  .strict();

export const EditorCompatibilityRelationV2Schema = z
  .object({
    id: DatabaseIdV2Schema,
    context: z.enum([
      "straightSection",
      "fitting",
      "connection",
      "endpoint",
      "support",
      "structure",
      "anchor",
      "wstb",
      "accessory",
      "manualCatalog"
    ]),
    subjectProductId: DatabaseIdV2Schema.nullable(),
    substrate: z.enum(["concrete", "steel", "masonry", "unknown"]).nullable(),
    productId: DatabaseIdV2Schema,
    allowed: z.boolean()
  })
  .strict()
  .superRefine((relation, context) => {
    if ((relation.context === "anchor") !== (relation.substrate !== null)) {
      context.addIssue({
        code: "custom",
        message:
          "Anchor compatibility requires an explicit substrate and other contexts cannot carry one",
        path: ["substrate"]
      });
    }
  });

export const EditorCatalogResponseV2Schema = z
  .object({
    schemaVersion: z.literal(EDITOR_CATALOG_RESPONSE_V2),
    correlationId: CorrelationIdSchema,
    catalogSnapshot: SnapshotReferenceV2Schema,
    ruleSnapshot: SnapshotReferenceV2Schema,
    products: z.array(EditorCatalogProductV2Schema),
    assemblyTemplates: z.array(EditorAssemblyTemplateV2Schema),
    compatibilityRelations: z.array(EditorCompatibilityRelationV2Schema)
  })
  .strict()
  .superRefine((catalog, context) => {
    const productIds = new Set<string>();
    for (const [index, product] of catalog.products.entries()) {
      if (productIds.has(product.id)) {
        context.addIssue({
          code: "custom",
          message: "Editor product IDs must be unique",
          path: ["products", index, "id"]
        });
      }
      productIds.add(product.id);
    }
    const templateIds = new Set<string>();
    const componentIds = new Set<string>();
    for (const [templateIndex, template] of catalog.assemblyTemplates.entries()) {
      if (templateIds.has(template.id)) {
        context.addIssue({
          code: "custom",
          message: "Editor template IDs must be unique",
          path: ["assemblyTemplates", templateIndex, "id"]
        });
      }
      templateIds.add(template.id);
      for (const [componentIndex, component] of template.components.entries()) {
        if (!productIds.has(component.productId)) {
          context.addIssue({
            code: "custom",
            message: "Template component references an unknown editor product",
            path: ["assemblyTemplates", templateIndex, "components", componentIndex, "productId"]
          });
        }
        if (componentIds.has(component.id)) {
          context.addIssue({
            code: "custom",
            message: "Editor template component IDs must be globally unique",
            path: ["assemblyTemplates", templateIndex, "components", componentIndex, "id"]
          });
        }
        componentIds.add(component.id);
      }
    }
    const relationIds = new Set<string>();
    for (const [index, relation] of catalog.compatibilityRelations.entries()) {
      if (relationIds.has(relation.id)) {
        context.addIssue({
          code: "custom",
          message: "Editor compatibility relation IDs must be unique",
          path: ["compatibilityRelations", index, "id"]
        });
      }
      relationIds.add(relation.id);
      if (
        !productIds.has(relation.productId) ||
        (relation.subjectProductId !== null && !productIds.has(relation.subjectProductId))
      ) {
        context.addIssue({
          code: "custom",
          message: "Compatibility relation references an unknown editor product",
          path: ["compatibilityRelations", index]
        });
      }
    }
  });

export type DatabaseIdV2 = z.infer<typeof DatabaseIdV2Schema>;
export type DraftManualMetadataV2 = DeepReadonly<z.infer<typeof DraftManualMetadataV2Schema>>;
export type ProjectManualItemDraftV2 = DeepReadonly<z.infer<typeof ProjectManualItemDraftV2Schema>>;
export type ProjectEndpointDraftV2 = DeepReadonly<z.infer<typeof ProjectEndpointDraftV2Schema>>;
export type ProjectRouteDraftV2 = DeepReadonly<z.infer<typeof ProjectRouteDraftV2Schema>>;
export type ProjectConnectionDraftV2 = DeepReadonly<z.infer<typeof ProjectConnectionDraftV2Schema>>;
export type ProjectDraftInputV2 = DeepReadonly<z.infer<typeof ProjectDraftInputV2Schema>>;
export type ProjectV2 = DeepReadonly<z.infer<typeof ProjectV2Schema>>;
export type ProjectListItemV2 = DeepReadonly<z.infer<typeof ProjectListItemV2Schema>>;
export type ProjectListResponseV2 = DeepReadonly<z.infer<typeof ProjectListResponseV2Schema>>;
export type CreateProjectDraftRequestV2 = DeepReadonly<
  z.infer<typeof CreateProjectDraftRequestV2Schema>
>;
export type ReplaceProjectDraftRequestV2 = DeepReadonly<
  z.infer<typeof ReplaceProjectDraftRequestV2Schema>
>;
export type ProjectDraftResponseV2 = DeepReadonly<z.infer<typeof ProjectDraftResponseV2Schema>>;
export type ValidateProjectDraftRequestV2 = DeepReadonly<
  z.infer<typeof ValidateProjectDraftRequestV2Schema>
>;
export type ProjectValidationResponseV2 = DeepReadonly<
  z.infer<typeof ProjectValidationResponseV2Schema>
>;
export type CalculateProjectDraftRequestV2 = DeepReadonly<
  z.infer<typeof CalculateProjectDraftRequestV2Schema>
>;
export type CalculationRunV2 = DeepReadonly<z.infer<typeof CalculationRunV2Schema>>;
export type CalculationDraftV2 = DeepReadonly<z.infer<typeof CalculationDraftV2Schema>>;
export type CalculateProjectDraftResponseV2 = DeepReadonly<
  z.infer<typeof CalculateProjectDraftResponseV2Schema>
>;
export type CurrentCalculationResponseV2 = DeepReadonly<
  z.infer<typeof CurrentCalculationResponseV2Schema>
>;
export type EditorCatalogProductV2 = DeepReadonly<z.infer<typeof EditorCatalogProductV2Schema>>;
export type EditorAssemblyTemplateV2 = DeepReadonly<z.infer<typeof EditorAssemblyTemplateV2Schema>>;
export type EditorCatalogResponseV2 = DeepReadonly<z.infer<typeof EditorCatalogResponseV2Schema>>;
