import { z } from "zod";

import {
  HumanTextSchema,
  IdentifierSchema,
  OptionalHumanTextSchema,
  ProductCodeSchema,
  SemverSchema,
  Sha256Schema
} from "../primitives.js";
import type { DeepReadonly } from "../primitives.js";
import {
  CALCULATION_INPUT_V2,
  CALCULATION_RESULT_V2,
  CALCULATION_TRACE_V1,
  CALCULATION_TRACE_V2
} from "../versions.js";

export { CALCULATION_INPUT_V2, CALCULATION_RESULT_V2, CALCULATION_TRACE_V1, CALCULATION_TRACE_V2 };

const CANONICAL_DECIMAL_V2 = /^(?:0|[1-9]\d*)(?:\.\d*[1-9])?$/u;
const INTEGER_DECIMAL = /^(?:0|[1-9]\d*)$/u;
const MAX_DECIMAL_DIGITS = 30;
const MAX_DECIMAL_SCALE = 18;

export const VersionIdentifierV2Schema = z
  .string()
  .min(1)
  .max(64)
  .regex(
    /^[0-9A-Za-z][0-9A-Za-z._-]*$/u,
    "Expected a bounded semantic version or persisted version slug"
  );

function decimalDigitCount(value: string): number {
  return value.replace(".", "").length;
}

function decimalScale(value: string): number {
  const point = value.indexOf(".");
  return point === -1 ? 0 : value.length - point - 1;
}

function percentageAtMostOneHundred(value: string): boolean {
  const [whole = "0", fraction] = value.split(".");
  if (whole.length < 3) return true;
  if (whole !== "100") return false;
  return fraction === undefined;
}

export const DecimalStringV2Schema = z
  .string()
  .regex(CANONICAL_DECIMAL_V2, "Expected a canonical non-negative decimal string")
  .refine((value) => decimalDigitCount(value) <= MAX_DECIMAL_DIGITS, {
    message: `Decimal precision exceeds ${MAX_DECIMAL_DIGITS} digits`
  })
  .refine((value) => decimalScale(value) <= MAX_DECIMAL_SCALE, {
    message: `Decimal scale exceeds ${MAX_DECIMAL_SCALE} fractional digits`
  });

export const PositiveDecimalStringV2Schema = DecimalStringV2Schema.refine(
  (value) => value !== "0",
  "Quantity must be greater than zero"
);

export const IntegerDecimalStringV2Schema = DecimalStringV2Schema.regex(
  INTEGER_DECIMAL,
  "Expected a non-negative integer decimal string"
);

export const PositiveIntegerDecimalStringV2Schema = IntegerDecimalStringV2Schema.refine(
  (value) => value !== "0",
  "Quantity must be a positive integer"
);

export const PercentageDecimalStringV2Schema = DecimalStringV2Schema.refine(
  percentageAtMostOneHundred,
  "Percentage must be between 0 and 100"
);

export const MaterialUnitV2Schema = z.enum(["pcs", "m", "mm", "kg", "kgPerM"]);
export const OrderUnitV2Schema = z.enum(["pcs", "m", "kg"]);
export const CalculationUnitV2Schema = z.enum([
  "pcs",
  "m",
  "mm",
  "kg",
  "kgPerM",
  "packages",
  "percent"
]);

export const QuantityV2Schema = z
  .object({ value: DecimalStringV2Schema, unit: MaterialUnitV2Schema })
  .strict()
  .superRefine((quantity, context) => {
    if (quantity.unit === "pcs" && !INTEGER_DECIMAL.test(quantity.value)) {
      context.addIssue({
        code: "custom",
        message: "Piece quantities must be integers",
        path: ["value"]
      });
    }
  });

export const PositiveQuantityV2Schema = z
  .object({ value: PositiveDecimalStringV2Schema, unit: MaterialUnitV2Schema })
  .strict()
  .superRefine((quantity, context) => {
    if (quantity.unit === "pcs" && !INTEGER_DECIMAL.test(quantity.value)) {
      context.addIssue({
        code: "custom",
        message: "Piece quantities must be integers",
        path: ["value"]
      });
    }
  });

export const PiecesQuantityV2Schema = z
  .object({ value: IntegerDecimalStringV2Schema, unit: z.literal("pcs") })
  .strict();
export const PositivePiecesQuantityV2Schema = z
  .object({ value: PositiveIntegerDecimalStringV2Schema, unit: z.literal("pcs") })
  .strict();
export const PositiveMetresQuantityV2Schema = z
  .object({ value: PositiveDecimalStringV2Schema, unit: z.literal("m") })
  .strict();
export const PositiveMillimetresQuantityV2Schema = z
  .object({ value: PositiveDecimalStringV2Schema, unit: z.literal("mm") })
  .strict();
export const CableLoadQuantityV2Schema = z
  .object({ value: DecimalStringV2Schema, unit: z.literal("kgPerM") })
  .strict();

export const SnapshotReferenceV2Schema = z
  .object({
    snapshotId: IdentifierSchema,
    version: VersionIdentifierV2Schema,
    contentHash: Sha256Schema
  })
  .strict();

export const SourceReferenceV2Schema = z
  .object({
    kind: z.enum([
      "project",
      "route",
      "segment",
      "fitting",
      "connection",
      "endpoint",
      "supportGroup",
      "straightRun",
      "product",
      "supplyOption",
      "rule",
      "template",
      "templateComponent",
      "manualInput",
      "manualOverride",
      "catalogDocument"
    ]),
    id: IdentifierSchema,
    sourceDocument: HumanTextSchema.nullable(),
    sourcePage: HumanTextSchema.nullable()
  })
  .strict();

export const ManualMetadataV2Schema = z
  .object({
    overrideId: IdentifierSchema,
    reason: HumanTextSchema,
    note: OptionalHumanTextSchema,
    actorRef: IdentifierSchema,
    decisionRef: IdentifierSchema
  })
  .strict();

export const RuleConfidenceV2Schema = z.enum([
  "catalogConfirmed",
  "calculated",
  "projectRule",
  "engineeringReview",
  "manual"
]);

const RuleFields = {
  id: IdentifierSchema,
  code: HumanTextSchema,
  version: VersionIdentifierV2Schema,
  confidence: RuleConfidenceV2Schema,
  status: z.enum(["active", "draft", "retired"]),
  ruleSnapshotId: IdentifierSchema,
  source: SourceReferenceV2Schema
};

export const RuleComponentV2Schema = z
  .object({
    productId: IdentifierSchema,
    quantityPerEvent: PositivePiecesQuantityV2Schema,
    portOrSideCount: PositiveIntegerDecimalStringV2Schema
  })
  .strict();

export const CalculationRuleV2Schema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("supplyOption"),
      productId: IdentifierSchema,
      supplyOptionId: IdentifierSchema,
      ...RuleFields
    })
    .strict(),
  z
    .object({
      type: z.literal("wstbPerSupport"),
      quantityPerSupport: PositivePiecesQuantityV2Schema,
      ...RuleFields
    })
    .strict(),
  z
    .object({
      type: z.literal("compatibility"),
      relationIds: z.array(IdentifierSchema).min(1),
      ...RuleFields
    })
    .strict(),
  z
    .object({
      type: z.literal("internalJoint"),
      straightProductId: IdentifierSchema,
      supplyOptionId: IdentifierSchema.nullable(),
      jointProductId: IdentifierSchema,
      quantityPerJoint: PositivePiecesQuantityV2Schema,
      ...RuleFields
    })
    .strict(),
  z
    .object({
      type: z.literal("fittingConnection"),
      fittingId: IdentifierSchema,
      components: z.array(RuleComponentV2Schema).min(1),
      ...RuleFields
    })
    .strict(),
  z
    .object({
      type: z.literal("physicalConnection"),
      connectionId: IdentifierSchema,
      components: z.array(RuleComponentV2Schema).min(1),
      ...RuleFields
    })
    .strict(),
  z
    .object({
      type: z.literal("endpointMaterial"),
      endpointId: IdentifierSchema,
      productId: IdentifierSchema,
      quantity: PositivePiecesQuantityV2Schema,
      ...RuleFields
    })
    .strict(),
  z
    .object({
      type: z.literal("fittingAdditionalSupport"),
      fittingId: IdentifierSchema,
      quantity: PiecesQuantityV2Schema,
      ...RuleFields
    })
    .strict()
]);

export const IncludedItemRelationV2Schema = z
  .object({
    id: IdentifierSchema,
    childProductId: IdentifierSchema,
    quantityPerParent: PositivePiecesQuantityV2Schema,
    source: SourceReferenceV2Schema
  })
  .strict();

export const SupplyOptionV2Schema = z
  .object({
    id: IdentifierSchema,
    length: z.discriminatedUnion("value", [
      z.object({ value: z.literal("3000"), unit: z.literal("mm") }).strict(),
      z.object({ value: z.literal("6000"), unit: z.literal("mm") }).strict()
    ]),
    orderable: z.boolean(),
    active: z.boolean(),
    ruleId: IdentifierSchema,
    source: SourceReferenceV2Schema
  })
  .strict();

export const ProductSnapshotV2Schema = z
  .object({
    id: IdentifierSchema,
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
    packageIncrement: PositiveQuantityV2Schema.nullable(),
    orderable: z.boolean(),
    active: z.boolean(),
    engineeringReviewRequired: z.boolean(),
    catalogSnapshotId: IdentifierSchema,
    supplyOptions: z.array(SupplyOptionV2Schema),
    includedItems: z.array(IncludedItemRelationV2Schema),
    source: SourceReferenceV2Schema
  })
  .strict()
  .superRefine((product, context) => {
    if (product.orderable && product.packageIncrement === null) {
      context.addIssue({
        code: "custom",
        message: "Orderable products require an explicit package increment",
        path: ["packageIncrement"]
      });
    }
    if (product.packageIncrement !== null && product.packageIncrement.unit !== product.orderUnit) {
      context.addIssue({
        code: "custom",
        message: "Package increment unit must match product order unit",
        path: ["packageIncrement", "unit"]
      });
    }
  });

export const CompatibilityRelationV2Schema = z
  .object({
    id: IdentifierSchema,
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
    subjectRef: IdentifierSchema,
    productId: IdentifierSchema,
    allowed: z.boolean(),
    ruleId: IdentifierSchema,
    ruleSnapshotId: IdentifierSchema,
    source: SourceReferenceV2Schema
  })
  .strict();

export const TemplateComponentV2Schema = z
  .object({
    id: IdentifierSchema,
    productId: IdentifierSchema,
    role: z.enum(["support", "structure", "anchor", "fastener", "accessory", "wstb"]),
    quantity: PositiveQuantityV2Schema,
    quantityMode: z.enum(["fixed", "perSupport", "perLevel", "manual"]),
    suppressWhenIncluded: z.boolean(),
    manualParameterId: IdentifierSchema.nullable(),
    source: SourceReferenceV2Schema
  })
  .strict();

export const AssemblyTemplateV2Schema = z
  .object({
    id: IdentifierSchema,
    code: HumanTextSchema,
    nameEn: HumanTextSchema,
    status: z.enum(["active", "draft", "retired"]),
    catalogSnapshotId: IdentifierSchema,
    ruleSnapshotId: IdentifierSchema,
    engineeringReviewRequired: z.boolean(),
    components: z.array(TemplateComponentV2Schema).min(1),
    source: SourceReferenceV2Schema
  })
  .strict();

export const ReservePolicyV2Schema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("projectDefault") }).strict(),
  z
    .object({
      mode: z.literal("disabled"),
      originalPercent: PercentageDecimalStringV2Schema,
      metadata: ManualMetadataV2Schema
    })
    .strict(),
  z
    .object({
      mode: z.literal("percentageOverride"),
      originalPercent: PercentageDecimalStringV2Schema,
      percent: PercentageDecimalStringV2Schema,
      metadata: ManualMetadataV2Schema
    })
    .strict()
]);

export const PackagingPolicyV2Schema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("catalogDefault") }).strict(),
  z.object({ mode: z.literal("disabled"), metadata: ManualMetadataV2Schema.nullable() }).strict(),
  z
    .object({
      mode: z.literal("incrementOverride"),
      increment: PositiveQuantityV2Schema,
      metadata: ManualMetadataV2Schema
    })
    .strict()
]);

export const QuantityOverrideV2Schema = z
  .object({
    id: IdentifierSchema,
    originalQuantity: QuantityV2Schema,
    adjustedQuantity: QuantityV2Schema,
    metadata: ManualMetadataV2Schema
  })
  .strict();

export const EndpointV2Schema = z
  .object({
    id: IdentifierSchema,
    type: z.enum([
      "freeEnd",
      "routeContinuation",
      "endCap",
      "equipment",
      "physicalSplice",
      "custom"
    ]),
    materialRuleId: IdentifierSchema.nullable(),
    connectionId: IdentifierSchema.nullable()
  })
  .strict();

export const StraightGeometryV2Schema = z
  .object({
    id: IdentifierSchema,
    kind: z.literal("straight"),
    length: PositiveMetresQuantityV2Schema,
    supplyOptionId: IdentifierSchema.nullable()
  })
  .strict();

export const FittingGeometryV2Schema = z
  .object({
    id: IdentifierSchema,
    kind: z.literal("fitting"),
    fittingType: z.enum(["horizontalBend", "verticalBend", "tee", "transition", "custom"]),
    productId: IdentifierSchema.nullable(),
    connectionRuleId: IdentifierSchema.nullable(),
    additionalSupportRuleId: IdentifierSchema.nullable(),
    supportedPhysicalLength: PositiveMetresQuantityV2Schema.nullable()
  })
  .strict();

export const GeometryItemV2Schema = z.discriminatedUnion("kind", [
  StraightGeometryV2Schema,
  FittingGeometryV2Schema
]);

export const ManualSupportAdjustmentV2Schema = z
  .object({
    id: IdentifierSchema,
    originalCalculatedQuantity: PiecesQuantityV2Schema.nullable(),
    additionalQuantity: PiecesQuantityV2Schema,
    sourceEntityRef: IdentifierSchema,
    metadata: ManualMetadataV2Schema
  })
  .strict();

export const TemplateManualValueV2Schema = z
  .object({
    componentId: IdentifierSchema,
    quantity: PositiveQuantityV2Schema,
    metadata: ManualMetadataV2Schema
  })
  .strict();

export const WstbSelectionV2Schema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("one"), ruleId: IdentifierSchema }).strict(),
  z.object({ mode: z.literal("two"), ruleId: IdentifierSchema }).strict(),
  z
    .object({
      mode: z.literal("custom"),
      ruleId: IdentifierSchema,
      quantityPerSupport: PositiveIntegerDecimalStringV2Schema,
      metadata: ManualMetadataV2Schema
    })
    .strict()
]);

export const SupportConfigurationV2Schema = z
  .object({
    spacing: PositiveMetresQuantityV2Schema,
    supportType: z.enum(["wall", "ceiling", "floor", "custom"]),
    supportProductId: IdentifierSchema.nullable(),
    templateId: IdentifierSchema.nullable(),
    levelCount: PositivePiecesQuantityV2Schema.nullable(),
    substrate: z.enum(["concrete", "steel", "masonry", "unknown"]).nullable(),
    anchorProductId: IdentifierSchema.nullable(),
    anchorQuantityOverride: z
      .object({
        originalPerSupportAxis: PositivePiecesQuantityV2Schema,
        adjustedPerSupportAxis: PositivePiecesQuantityV2Schema,
        metadata: ManualMetadataV2Schema
      })
      .strict()
      .nullable(),
    wstbProductId: IdentifierSchema.nullable(),
    wstb: WstbSelectionV2Schema,
    manualAdditionalSupports: z.array(ManualSupportAdjustmentV2Schema),
    templateManualValues: z.array(TemplateManualValueV2Schema)
  })
  .strict();

export const RouteV2Schema = z
  .object({
    id: IdentifierSchema,
    code: HumanTextSchema,
    straightProductId: IdentifierSchema,
    defaultSupplyOptionId: IdentifierSchema,
    startEndpoint: EndpointV2Schema,
    endEndpoint: EndpointV2Schema,
    geometry: z.array(GeometryItemV2Schema).min(1),
    supports: SupportConfigurationV2Schema
  })
  .strict();

export const ConnectorCorrectionV2Schema = z
  .object({
    id: IdentifierSchema,
    productId: IdentifierSchema,
    originalCalculatedQuantity: PiecesQuantityV2Schema,
    adjustedQuantity: PiecesQuantityV2Schema,
    metadata: ManualMetadataV2Schema
  })
  .strict();

export const ConnectionV2Schema = z
  .object({
    id: IdentifierSchema,
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
      .array(z.object({ routeId: IdentifierSchema, endpointId: IdentifierSchema }).strict())
      .min(2)
      .max(3),
    physicalBreak: z.boolean(),
    supportBehavior: z.enum(["shared", "separate"]),
    materialRuleId: IdentifierSchema.nullable(),
    supportsBefore: PiecesQuantityV2Schema,
    supportsAfter: PiecesQuantityV2Schema,
    connectorCorrections: z.array(ConnectorCorrectionV2Schema)
  })
  .strict();

export const ManualBomInputV2Schema = z.discriminatedUnion("kind", [
  z
    .object({
      id: IdentifierSchema,
      kind: z.literal("catalog"),
      productId: IdentifierSchema,
      descriptionEn: HumanTextSchema,
      productCode: ProductCodeSchema,
      quantity: PositiveQuantityV2Schema,
      reason: HumanTextSchema,
      note: OptionalHumanTextSchema,
      reservePolicy: ReservePolicyV2Schema,
      packagingPolicy: PackagingPolicyV2Schema,
      quantityOverride: QuantityOverrideV2Schema.nullable()
    })
    .strict(),
  z
    .object({
      id: IdentifierSchema,
      kind: z.literal("freeText"),
      productId: z.null(),
      descriptionEn: HumanTextSchema,
      productCode: ProductCodeSchema.nullable(),
      quantity: PositiveQuantityV2Schema,
      reason: HumanTextSchema,
      note: OptionalHumanTextSchema,
      reservePolicy: ReservePolicyV2Schema,
      packagingPolicy: PackagingPolicyV2Schema,
      quantityOverride: QuantityOverrideV2Schema.nullable()
    })
    .strict()
]);

export const LinePolicyV2Schema = z
  .object({
    id: IdentifierSchema,
    target: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("catalogProduct"), productId: IdentifierSchema }).strict(),
      z.object({ kind: z.literal("manualInput"), manualInputId: IdentifierSchema }).strict()
    ]),
    reservePolicy: ReservePolicyV2Schema,
    packagingPolicy: PackagingPolicyV2Schema,
    metadata: ManualMetadataV2Schema
  })
  .strict();

export const ProductQuantityAdjustmentV2Schema = z
  .object({
    id: IdentifierSchema,
    productId: IdentifierSchema,
    originalCalculatedQuantity: QuantityV2Schema,
    adjustedQuantity: PositiveQuantityV2Schema,
    metadata: ManualMetadataV2Schema
  })
  .strict();

function addDuplicateIssues<T extends { id: string }>(
  values: readonly T[],
  path: readonly (string | number)[],
  context: z.RefinementCtx
): void {
  const seen = new Set<string>();
  for (const [index, value] of values.entries()) {
    if (seen.has(value.id)) {
      context.addIssue({
        code: "custom",
        message: "Stable IDs must be unique",
        path: [...path, index, "id"]
      });
    }
    seen.add(value.id);
  }
}

function addUnknownReference(
  exists: boolean,
  message: string,
  path: readonly (string | number)[],
  context: z.RefinementCtx
): void {
  if (!exists) context.addIssue({ code: "custom", message, path: [...path] });
}

export const CalculationInputV2Schema = z
  .object({
    schemaVersion: z.literal(CALCULATION_INPUT_V2),
    invocation: z
      .object({ calculationRunId: IdentifierSchema, inputFingerprint: Sha256Schema })
      .strict(),
    project: z
      .object({
        id: IdentifierSchema,
        code: HumanTextSchema,
        defaultReservePercent: PercentageDecimalStringV2Schema,
        cableLoad: CableLoadQuantityV2Schema.nullable(),
        routes: z.array(RouteV2Schema).min(1),
        connections: z.array(ConnectionV2Schema),
        accessoryProductIds: z.array(IdentifierSchema)
      })
      .strict(),
    catalogSnapshot: SnapshotReferenceV2Schema,
    products: z.array(ProductSnapshotV2Schema).min(1),
    compatibilityRelations: z.array(CompatibilityRelationV2Schema),
    ruleSnapshot: SnapshotReferenceV2Schema,
    rules: z.array(CalculationRuleV2Schema),
    assemblyTemplates: z.array(AssemblyTemplateV2Schema),
    manualItems: z.array(ManualBomInputV2Schema),
    productQuantityAdjustments: z.array(ProductQuantityAdjustmentV2Schema),
    linePolicies: z.array(LinePolicyV2Schema),
    options: z
      .object({
        unresolvedMaterialPolicy: z.enum(["warnAndOmit", "fail"]),
        supportMismatchPolicy: z.enum(["splitWithEngineeringReview", "fail"]),
        includePackaging: z.boolean()
      })
      .strict()
  })
  .strict()
  .superRefine((input, context) => {
    addDuplicateIssues(input.products, ["products"], context);
    addDuplicateIssues(input.rules, ["rules"], context);
    addDuplicateIssues(input.assemblyTemplates, ["assemblyTemplates"], context);
    addDuplicateIssues(input.compatibilityRelations, ["compatibilityRelations"], context);
    addDuplicateIssues(input.project.routes, ["project", "routes"], context);
    addDuplicateIssues(input.project.connections, ["project", "connections"], context);
    addDuplicateIssues(input.manualItems, ["manualItems"], context);
    addDuplicateIssues(input.productQuantityAdjustments, ["productQuantityAdjustments"], context);
    addDuplicateIssues(input.linePolicies, ["linePolicies"], context);

    const products = new Map(input.products.map((product) => [product.id, product]));
    const rules = new Map(input.rules.map((rule) => [rule.id, rule]));
    const templates = new Map(input.assemblyTemplates.map((template) => [template.id, template]));
    const routes = new Map(input.project.routes.map((route) => [route.id, route]));
    const manualIds = new Set(input.manualItems.map((item) => item.id));

    const routeCodes = new Set<string>();
    const geometryIds = new Set<string>();
    const endpointOwners = new Map<string, string>();
    for (const [routeIndex, route] of input.project.routes.entries()) {
      const normalizedCode = route.code.toLowerCase();
      if (routeCodes.has(normalizedCode)) {
        context.addIssue({
          code: "custom",
          message: "Route codes must be unique case-insensitively",
          path: ["project", "routes", routeIndex, "code"]
        });
      }
      routeCodes.add(normalizedCode);
      const straightProduct = products.get(route.straightProductId);
      addUnknownReference(
        straightProduct?.role === "straightSection",
        "Route straight product must reference a straight-section product",
        ["project", "routes", routeIndex, "straightProductId"],
        context
      );
      addUnknownReference(
        straightProduct?.supplyOptions.some(
          (option) => option.id === route.defaultSupplyOptionId
        ) ?? false,
        "Route default supply option must belong to its straight product",
        ["project", "routes", routeIndex, "defaultSupplyOptionId"],
        context
      );
      endpointOwners.set(route.startEndpoint.id, route.id);
      endpointOwners.set(route.endEndpoint.id, route.id);
      for (const [geometryIndex, item] of route.geometry.entries()) {
        if (geometryIds.has(item.id)) {
          context.addIssue({
            code: "custom",
            message: "Geometry stable IDs must be globally unique",
            path: ["project", "routes", routeIndex, "geometry", geometryIndex, "id"]
          });
        }
        geometryIds.add(item.id);
        if (item.kind === "straight" && item.supplyOptionId !== null) {
          addUnknownReference(
            straightProduct?.supplyOptions.some((option) => option.id === item.supplyOptionId) ??
              false,
            "Segment supply option must belong to the route straight product",
            ["project", "routes", routeIndex, "geometry", geometryIndex, "supplyOptionId"],
            context
          );
        }
        if (item.kind === "fitting") {
          if (item.productId !== null)
            addUnknownReference(
              products.get(item.productId)?.role === "fitting",
              "Fitting product reference is invalid",
              ["project", "routes", routeIndex, "geometry", geometryIndex, "productId"],
              context
            );
          if (item.connectionRuleId !== null)
            addUnknownReference(
              rules.get(item.connectionRuleId)?.type === "fittingConnection",
              "Fitting connection rule reference is invalid",
              ["project", "routes", routeIndex, "geometry", geometryIndex, "connectionRuleId"],
              context
            );
          if (item.additionalSupportRuleId !== null)
            addUnknownReference(
              rules.get(item.additionalSupportRuleId)?.type === "fittingAdditionalSupport",
              "Fitting additional-support rule reference is invalid",
              [
                "project",
                "routes",
                routeIndex,
                "geometry",
                geometryIndex,
                "additionalSupportRuleId"
              ],
              context
            );
        }
      }
      const support = route.supports;
      for (const [field, productId, expectedRole] of [
        ["supportProductId", support.supportProductId, "support"],
        ["anchorProductId", support.anchorProductId, "anchor"],
        ["wstbProductId", support.wstbProductId, "wstb"]
      ] as const) {
        if (productId !== null)
          addUnknownReference(
            products.get(productId)?.role === expectedRole,
            `Support configuration ${field} has the wrong product role`,
            ["project", "routes", routeIndex, "supports", field],
            context
          );
      }
      if (support.templateId !== null)
        addUnknownReference(
          templates.has(support.templateId),
          "Support configuration references an unknown assembly template",
          ["project", "routes", routeIndex, "supports", "templateId"],
          context
        );
      addUnknownReference(
        rules.get(support.wstb.ruleId)?.type === "wstbPerSupport",
        "WSTB selection references an unknown WSTB rule",
        ["project", "routes", routeIndex, "supports", "wstb", "ruleId"],
        context
      );
      addDuplicateIssues(
        support.manualAdditionalSupports,
        ["project", "routes", routeIndex, "supports", "manualAdditionalSupports"],
        context
      );
      const manualComponentIds = new Set<string>();
      for (const [valueIndex, value] of support.templateManualValues.entries()) {
        if (manualComponentIds.has(value.componentId)) {
          context.addIssue({
            code: "custom",
            message: "Template manual values must be unique by component",
            path: ["project", "routes", routeIndex, "supports", "templateManualValues", valueIndex]
          });
        }
        manualComponentIds.add(value.componentId);
      }
    }

    for (const [productIndex, product] of input.products.entries()) {
      if (product.catalogSnapshotId !== input.catalogSnapshot.snapshotId) {
        context.addIssue({
          code: "custom",
          message: "Product does not belong to the declared catalog snapshot",
          path: ["products", productIndex, "catalogSnapshotId"]
        });
      }
      const supplyIds = new Set<string>();
      for (const [optionIndex, option] of product.supplyOptions.entries()) {
        if (supplyIds.has(option.id)) {
          context.addIssue({
            code: "custom",
            message: "Supply option IDs must be unique within a product",
            path: ["products", productIndex, "supplyOptions", optionIndex, "id"]
          });
        }
        supplyIds.add(option.id);
        addUnknownReference(
          rules.get(option.ruleId)?.type === "supplyOption",
          "Supply option references an unknown supply-option rule",
          ["products", productIndex, "supplyOptions", optionIndex, "ruleId"],
          context
        );
      }
      if (product.role === "straightSection" && product.supplyOptions.length === 0) {
        context.addIssue({
          code: "custom",
          message: "Straight-section products require at least one explicit supply option",
          path: ["products", productIndex, "supplyOptions"]
        });
      }
      const includedIds = new Set<string>();
      for (const [includedIndex, included] of product.includedItems.entries()) {
        if (includedIds.has(included.id)) {
          context.addIssue({
            code: "custom",
            message: "Included-item relation IDs must be unique within a product",
            path: ["products", productIndex, "includedItems", includedIndex, "id"]
          });
        }
        includedIds.add(included.id);
        addUnknownReference(
          products.has(included.childProductId) && included.childProductId !== product.id,
          "Included item must reference another known product",
          ["products", productIndex, "includedItems", includedIndex, "childProductId"],
          context
        );
      }
    }

    const inclusionEdges = new Map<string, readonly string[]>();
    for (const product of input.products)
      inclusionEdges.set(
        product.id,
        product.includedItems.map((item) => item.childProductId)
      );
    const visited = new Set<string>();
    const active = new Set<string>();
    const visit = (productId: string): boolean => {
      if (active.has(productId)) return true;
      if (visited.has(productId)) return false;
      visited.add(productId);
      active.add(productId);
      for (const child of inclusionEdges.get(productId) ?? []) if (visit(child)) return true;
      active.delete(productId);
      return false;
    };
    for (const product of input.products) {
      if (visit(product.id)) {
        context.addIssue({
          code: "custom",
          message: "Included-item relations must be acyclic",
          path: ["products"]
        });
        break;
      }
    }

    for (const [ruleIndex, rule] of input.rules.entries()) {
      if (rule.ruleSnapshotId !== input.ruleSnapshot.snapshotId) {
        context.addIssue({
          code: "custom",
          message: "Rule does not belong to the declared rule snapshot",
          path: ["rules", ruleIndex, "ruleSnapshotId"]
        });
      }
      const referencedProductIds =
        rule.type === "supplyOption"
          ? [rule.productId]
          : rule.type === "wstbPerSupport"
            ? []
            : rule.type === "compatibility"
              ? []
              : rule.type === "internalJoint"
                ? [rule.straightProductId, rule.jointProductId]
                : rule.type === "endpointMaterial"
                  ? [rule.productId]
                  : rule.type === "fittingConnection" || rule.type === "physicalConnection"
                    ? rule.components.map((component) => component.productId)
                    : [];
      for (const productId of referencedProductIds)
        addUnknownReference(
          products.has(productId),
          "Rule references an unknown product",
          ["rules", ruleIndex],
          context
        );
    }

    for (const [templateIndex, template] of input.assemblyTemplates.entries()) {
      if (
        template.catalogSnapshotId !== input.catalogSnapshot.snapshotId ||
        template.ruleSnapshotId !== input.ruleSnapshot.snapshotId
      ) {
        context.addIssue({
          code: "custom",
          message: "Template snapshot references must match the calculation snapshots",
          path: ["assemblyTemplates", templateIndex]
        });
      }
      addDuplicateIssues(
        template.components,
        ["assemblyTemplates", templateIndex, "components"],
        context
      );
      for (const [componentIndex, component] of template.components.entries()) {
        addUnknownReference(
          products.has(component.productId),
          "Template component references an unknown product",
          ["assemblyTemplates", templateIndex, "components", componentIndex, "productId"],
          context
        );
        if (component.quantityMode === "manual" && component.manualParameterId === null) {
          context.addIssue({
            code: "custom",
            message: "Manual template components require a parameter ID",
            path: [
              "assemblyTemplates",
              templateIndex,
              "components",
              componentIndex,
              "manualParameterId"
            ]
          });
        }
      }
    }

    for (const [connectionIndex, connection] of input.project.connections.entries()) {
      const endpointIds = new Set<string>();
      for (const [participantIndex, participant] of connection.participants.entries()) {
        const route = routes.get(participant.routeId);
        addUnknownReference(
          route !== undefined &&
            (route.startEndpoint.id === participant.endpointId ||
              route.endEndpoint.id === participant.endpointId),
          "Connection participant must reference an endpoint owned by its route",
          ["project", "connections", connectionIndex, "participants", participantIndex],
          context
        );
        if (endpointIds.has(participant.endpointId)) {
          context.addIssue({
            code: "custom",
            message: "A physical endpoint can participate only once in a connection",
            path: ["project", "connections", connectionIndex, "participants", participantIndex]
          });
        }
        endpointIds.add(participant.endpointId);
      }
      if (connection.type === "logicalContinuation" && connection.physicalBreak) {
        context.addIssue({
          code: "custom",
          message: "Logical continuation cannot be a physical break",
          path: ["project", "connections", connectionIndex, "physicalBreak"]
        });
      }
      if (connection.materialRuleId !== null)
        addUnknownReference(
          rules.get(connection.materialRuleId)?.type === "physicalConnection",
          "Connection material rule reference is invalid",
          ["project", "connections", connectionIndex, "materialRuleId"],
          context
        );
      addDuplicateIssues(
        connection.connectorCorrections,
        ["project", "connections", connectionIndex, "connectorCorrections"],
        context
      );
    }

    for (const route of input.project.routes) {
      for (const endpoint of [route.startEndpoint, route.endEndpoint]) {
        if (endpoint.connectionId !== null) {
          addUnknownReference(
            input.project.connections.some(
              (connection) =>
                connection.id === endpoint.connectionId &&
                connection.participants.some(
                  (participant) => participant.endpointId === endpoint.id
                )
            ),
            "Endpoint connection ownership is inconsistent",
            ["project", "routes"],
            context
          );
        }
        if (endpoint.materialRuleId !== null)
          addUnknownReference(
            rules.get(endpoint.materialRuleId)?.type === "endpointMaterial",
            "Endpoint material rule reference is invalid",
            ["project", "routes"],
            context
          );
      }
    }

    for (const [relationIndex, relation] of input.compatibilityRelations.entries()) {
      addUnknownReference(
        products.has(relation.productId),
        "Compatibility relation references an unknown product",
        ["compatibilityRelations", relationIndex, "productId"],
        context
      );
      const compatibilityRule = rules.get(relation.ruleId);
      addUnknownReference(
        compatibilityRule?.type === "compatibility" &&
          compatibilityRule.relationIds.includes(relation.id) &&
          relation.ruleSnapshotId === input.ruleSnapshot.snapshotId,
        "Compatibility relation references an unknown or mismatched rule",
        ["compatibilityRelations", relationIndex, "ruleId"],
        context
      );
    }

    for (const [manualIndex, manual] of input.manualItems.entries()) {
      if (manual.quantity.unit === "mm" || manual.quantity.unit === "kgPerM") {
        context.addIssue({
          code: "custom",
          message: "Manual BOM items support only pcs, m, or kg order dimensions",
          path: ["manualItems", manualIndex, "quantity", "unit"]
        });
      }
      if (manual.kind === "catalog")
        addUnknownReference(
          products.has(manual.productId),
          "Manual catalog item references an unknown product",
          ["manualItems", manualIndex, "productId"],
          context
        );
      if (
        manual.packagingPolicy.mode === "incrementOverride" &&
        manual.packagingPolicy.increment.unit !== manual.quantity.unit
      ) {
        context.addIssue({
          code: "custom",
          message: "Manual package increment unit must match item quantity unit",
          path: ["manualItems", manualIndex, "packagingPolicy", "increment", "unit"]
        });
      }
      if (manual.kind === "freeText" && manual.packagingPolicy.mode === "catalogDefault") {
        context.addIssue({
          code: "custom",
          message: "Free-text items must explicitly enable or disable package rounding",
          path: ["manualItems", manualIndex, "packagingPolicy"]
        });
      }
      if (
        manual.quantityOverride !== null &&
        (manual.quantityOverride.originalQuantity.unit !== manual.quantity.unit ||
          manual.quantityOverride.adjustedQuantity.unit !== manual.quantity.unit)
      ) {
        context.addIssue({
          code: "custom",
          message: "Manual quantity override units must match the item unit",
          path: ["manualItems", manualIndex, "quantityOverride"]
        });
      }
    }

    const adjustmentProducts = new Set<string>();
    for (const [index, adjustment] of input.productQuantityAdjustments.entries()) {
      addUnknownReference(
        products.has(adjustment.productId),
        "Quantity adjustment references an unknown product",
        ["productQuantityAdjustments", index, "productId"],
        context
      );
      if (adjustmentProducts.has(adjustment.productId)) {
        context.addIssue({
          code: "custom",
          message: "Duplicate product quantity adjustments are ambiguous",
          path: ["productQuantityAdjustments", index, "productId"]
        });
      }
      adjustmentProducts.add(adjustment.productId);
    }

    const policyTargets = new Set<string>();
    for (const [index, policy] of input.linePolicies.entries()) {
      const targetKey =
        policy.target.kind === "catalogProduct"
          ? `product:${policy.target.productId}`
          : `manual:${policy.target.manualInputId}`;
      addUnknownReference(
        policy.target.kind === "catalogProduct"
          ? products.has(policy.target.productId)
          : manualIds.has(policy.target.manualInputId),
        "Line policy references an unknown target",
        ["linePolicies", index, "target"],
        context
      );
      if (policyTargets.has(targetKey)) {
        context.addIssue({
          code: "custom",
          message: "Duplicate line policies for one target are ambiguous",
          path: ["linePolicies", index, "target"]
        });
      }
      policyTargets.add(targetKey);
    }
  });

export const WarningCodeV2Schema = z.enum([
  "MISSING_CABLE_LOAD",
  "MISSING_SUBSTRATE_OR_BASE",
  "UNKNOWN_SUBSTRATE",
  "MISSING_ANCHOR_SELECTION",
  "ANCHOR_ENGINEERING_CHECK_REQUIRED",
  "ANCHOR_PRODUCT_INCOMPATIBLE",
  "MISSING_COMPATIBILITY_RULE",
  "PRODUCT_SELECTION_INCOMPATIBLE",
  "UNRESOLVED_SECTION_SUPPLY_OPTION",
  "UNRESOLVED_JOINT_PRODUCT",
  "UNRESOLVED_FITTING_CONNECTION",
  "UNRESOLVED_ENDPOINT_MATERIAL",
  "SUPPORT_CONFIGURATION_MISMATCH",
  "FITTING_ADDITIONAL_SUPPORT_UNRESOLVED",
  "MANUAL_EXTRA_SUPPORT",
  "MANUAL_QUANTITY_OVERRIDE",
  "MANUAL_ANCHOR_OVERRIDE",
  "MANUAL_PACKAGE_OVERRIDE",
  "WSTB_PROJECT_RULE_UNCONFIRMED",
  "WSTB_TEMPLATE_RULE_CONFLICT",
  "ASSEMBLY_TEMPLATE_MISSING",
  "TEMPLATE_COMPONENT_MANUAL_VALUE_REQUIRED",
  "ENGINEERING_CHECK_REQUIRED"
]);

export const CalculationWarningV2Schema = z
  .object({
    id: IdentifierSchema,
    code: WarningCodeV2Schema,
    kind: z.enum(["validation", "catalog", "engineering", "manualOverride", "projectRule"]),
    severity: z.enum(["info", "warning", "engineeringReview", "blocking"]),
    subject: z.object({ kind: IdentifierSchema, id: IdentifierSchema }).strict(),
    path: z.array(z.union([z.string(), z.number().int().nonnegative()])).nullable(),
    messageKey: IdentifierSchema,
    effect: HumanTextSchema,
    approvalImpact: z.enum(["none", "reviewRequired", "blocksApproval"]),
    ruleId: IdentifierSchema.nullable(),
    productId: IdentifierSchema.nullable(),
    templateId: IdentifierSchema.nullable(),
    sourceRefs: z.array(SourceReferenceV2Schema),
    overrideId: IdentifierSchema.nullable()
  })
  .strict();

export const FormulaReferenceV1Schema = z
  .object({ id: IdentifierSchema, version: SemverSchema, expression: HumanTextSchema })
  .strict();
export const TraceRuleReferenceV1Schema = z
  .object({
    id: IdentifierSchema,
    code: HumanTextSchema,
    version: SemverSchema,
    confidence: RuleConfidenceV2Schema,
    ruleSnapshotId: IdentifierSchema
  })
  .strict();
export const TraceValueV1Schema = z
  .object({ value: DecimalStringV2Schema, unit: CalculationUnitV2Schema })
  .strict();
export const TraceInputV1Schema = z
  .object({ name: IdentifierSchema, value: DecimalStringV2Schema, unit: CalculationUnitV2Schema })
  .strict();
export const TraceStepV1Schema = z
  .object({
    id: IdentifierSchema,
    bomLineId: IdentifierSchema,
    sequence: z.number().int().positive(),
    formula: FormulaReferenceV1Schema,
    rule: TraceRuleReferenceV1Schema.nullable(),
    inputs: z.array(TraceInputV1Schema),
    output: TraceValueV1Schema,
    rounding: z
      .object({
        mode: z.enum(["none", "ceil", "incrementCeil"]),
        before: TraceValueV1Schema,
        increment: TraceValueV1Schema.nullable(),
        after: TraceValueV1Schema
      })
      .strict()
      .nullable(),
    sourceRefs: z.array(SourceReferenceV2Schema).min(1),
    parentStepIds: z.array(IdentifierSchema)
  })
  .strict();

export const CalculationTraceV1Schema = z
  .object({ schemaVersion: z.literal(CALCULATION_TRACE_V1), steps: z.array(TraceStepV1Schema) })
  .strict();

// Retained trace/v1 keeps its original SemVer rule-reference contract. Persisted
// catalog/rule snapshots also use bounded version slugs (for example `2022-p0`),
// so CalculationResultV2 emits an explicitly versioned trace/v2 instead of
// broadening the meaning of the retained v1 schema.
export const TraceRuleReferenceV2Schema = TraceRuleReferenceV1Schema.extend({
  version: VersionIdentifierV2Schema
});
export const TraceStepV2Schema = TraceStepV1Schema.extend({
  rule: TraceRuleReferenceV2Schema.nullable()
});
export const CalculationTraceV2Schema = z
  .object({ schemaVersion: z.literal(CALCULATION_TRACE_V2), steps: z.array(TraceStepV2Schema) })
  .strict();

export const IncludedItemOutputV2Schema = z
  .object({
    relationId: IdentifierSchema,
    productId: IdentifierSchema,
    productCode: ProductCodeSchema,
    descriptionEn: HumanTextSchema,
    quantityPerParent: PositivePiecesQuantityV2Schema,
    sourceRefs: z.array(SourceReferenceV2Schema).min(1)
  })
  .strict();

const ResultQuantityV2Schema = z
  .object({ value: DecimalStringV2Schema, unit: OrderUnitV2Schema })
  .strict()
  .superRefine((quantity, context) => {
    if (quantity.unit === "pcs" && !INTEGER_DECIMAL.test(quantity.value))
      context.addIssue({
        code: "custom",
        message: "Piece quantities must be integers",
        path: ["value"]
      });
  });

export const BomLineV2Schema = z
  .object({
    id: IdentifierSchema,
    kind: z.enum(["catalog", "manual"]),
    category: z.enum([
      "linearSection",
      "fitting",
      "connector",
      "support",
      "structure",
      "anchor",
      "wstb",
      "endpointMaterial",
      "accessory",
      "manual"
    ]),
    productId: IdentifierSchema.nullable(),
    manualInputId: IdentifierSchema.nullable(),
    productCode: ProductCodeSchema.nullable(),
    descriptionEn: HumanTextSchema,
    unit: OrderUnitV2Schema,
    technicalQuantity: ResultQuantityV2Schema,
    reserveQuantity: ResultQuantityV2Schema,
    reservedQuantity: ResultQuantityV2Schema,
    packageIncrement: ResultQuantityV2Schema,
    packageCount: z
      .object({ value: IntegerDecimalStringV2Schema, unit: z.literal("packages") })
      .strict()
      .nullable(),
    packagingOverage: ResultQuantityV2Schema,
    orderedQuantity: ResultQuantityV2Schema,
    totalSpareQuantity: ResultQuantityV2Schema,
    sectionDetail: z
      .object({
        supplyOptionId: IdentifierSchema,
        selectedSectionLength: PositiveMetresQuantityV2Schema,
        technicalSectionCount: PositivePiecesQuantityV2Schema,
        reservedSectionCount: PositivePiecesQuantityV2Schema
      })
      .strict()
      .nullable(),
    includedItems: z.array(IncludedItemOutputV2Schema),
    sourceRefs: z.array(SourceReferenceV2Schema).min(1),
    status: RuleConfidenceV2Schema,
    warningIds: z.array(IdentifierSchema),
    traceStepIds: z.array(IdentifierSchema).min(1),
    provenance: z
      .object({
        catalogSnapshotId: IdentifierSchema,
        ruleSnapshotId: IdentifierSchema,
        ruleIds: z.array(IdentifierSchema),
        formulaIds: z.array(IdentifierSchema)
      })
      .strict()
  })
  .strict();

export const CalculationResultV2Schema = z
  .object({
    schemaVersion: z.literal(CALCULATION_RESULT_V2),
    engineVersion: SemverSchema,
    formulaCatalogVersion: SemverSchema,
    calculationRunId: IdentifierSchema,
    inputFingerprint: Sha256Schema,
    calculationStatus: z.enum(["complete", "completeWithWarnings"]),
    catalogSnapshot: SnapshotReferenceV2Schema,
    ruleSnapshot: SnapshotReferenceV2Schema,
    bomLines: z.array(BomLineV2Schema),
    trace: z.union([CalculationTraceV1Schema, CalculationTraceV2Schema]),
    warnings: z.array(CalculationWarningV2Schema),
    summary: z
      .object({
        bomLineCount: z.number().int().nonnegative(),
        warningCount: z.number().int().nonnegative(),
        engineeringReviewRequired: z.boolean(),
        approvalReady: z.boolean(),
        totalsByUnit: z.array(
          z
            .object({
              unit: OrderUnitV2Schema,
              technicalQuantity: ResultQuantityV2Schema,
              reserveQuantity: ResultQuantityV2Schema,
              packagingOverage: ResultQuantityV2Schema,
              orderedQuantity: ResultQuantityV2Schema
            })
            .strict()
        )
      })
      .strict()
  })
  .strict()
  .superRefine((result, context) => {
    if (result.summary.bomLineCount !== result.bomLines.length)
      context.addIssue({
        code: "custom",
        message: "BOM line count does not match",
        path: ["summary", "bomLineCount"]
      });
    if (result.summary.warningCount !== result.warnings.length)
      context.addIssue({
        code: "custom",
        message: "Warning count does not match",
        path: ["summary", "warningCount"]
      });

    const warningIds = new Set(result.warnings.map((warning) => warning.id));
    const lineIds = new Set(result.bomLines.map((line) => line.id));
    const stepIds = new Set(result.trace.steps.map((step) => step.id));
    for (const [lineIndex, line] of result.bomLines.entries()) {
      for (const field of [
        "technicalQuantity",
        "reserveQuantity",
        "reservedQuantity",
        "packageIncrement",
        "packagingOverage",
        "orderedQuantity",
        "totalSpareQuantity"
      ] as const) {
        if (line[field].unit !== line.unit)
          context.addIssue({
            code: "custom",
            message: "All BOM line quantities must use the line unit",
            path: ["bomLines", lineIndex, field, "unit"]
          });
      }
      for (const warningId of line.warningIds)
        if (!warningIds.has(warningId))
          context.addIssue({
            code: "custom",
            message: "BOM line references an unknown warning",
            path: ["bomLines", lineIndex, "warningIds"]
          });
      for (const stepId of line.traceStepIds)
        if (!stepIds.has(stepId))
          context.addIssue({
            code: "custom",
            message: "BOM line references an unknown trace step",
            path: ["bomLines", lineIndex, "traceStepIds"]
          });
    }
    for (const [stepIndex, step] of result.trace.steps.entries()) {
      if (!lineIds.has(step.bomLineId))
        context.addIssue({
          code: "custom",
          message: "Trace step references an unknown BOM line",
          path: ["trace", "steps", stepIndex, "bomLineId"]
        });
      for (const parentId of step.parentStepIds)
        if (!stepIds.has(parentId))
          context.addIssue({
            code: "custom",
            message: "Trace step references an unknown parent",
            path: ["trace", "steps", stepIndex, "parentStepIds"]
          });
    }
  });

export type DecimalStringV2 = z.infer<typeof DecimalStringV2Schema>;
export type QuantityV2 = DeepReadonly<z.infer<typeof QuantityV2Schema>>;
export type SourceReferenceV2 = DeepReadonly<z.infer<typeof SourceReferenceV2Schema>>;
export type ProductSnapshotV2 = DeepReadonly<z.infer<typeof ProductSnapshotV2Schema>>;
export type CalculationRuleV2 = DeepReadonly<z.infer<typeof CalculationRuleV2Schema>>;
export type CompatibilityRelationV2 = DeepReadonly<z.infer<typeof CompatibilityRelationV2Schema>>;
export type AssemblyTemplateV2 = DeepReadonly<z.infer<typeof AssemblyTemplateV2Schema>>;
export type TemplateComponentV2 = DeepReadonly<z.infer<typeof TemplateComponentV2Schema>>;
export type ReservePolicyV2 = DeepReadonly<z.infer<typeof ReservePolicyV2Schema>>;
export type PackagingPolicyV2 = DeepReadonly<z.infer<typeof PackagingPolicyV2Schema>>;
export type LinePolicyV2 = DeepReadonly<z.infer<typeof LinePolicyV2Schema>>;
export type ProductQuantityAdjustmentV2 = DeepReadonly<
  z.infer<typeof ProductQuantityAdjustmentV2Schema>
>;
export type ManualBomInputV2 = DeepReadonly<z.infer<typeof ManualBomInputV2Schema>>;
export type RouteV2 = DeepReadonly<z.infer<typeof RouteV2Schema>>;
export type ConnectionV2 = DeepReadonly<z.infer<typeof ConnectionV2Schema>>;
export type SupportConfigurationV2 = DeepReadonly<z.infer<typeof SupportConfigurationV2Schema>>;
export type CalculationInputV2 = DeepReadonly<z.infer<typeof CalculationInputV2Schema>>;
export type WarningCodeV2 = z.infer<typeof WarningCodeV2Schema>;
export type CalculationWarningV2 = DeepReadonly<z.infer<typeof CalculationWarningV2Schema>>;
export type TraceStepV1 = DeepReadonly<z.infer<typeof TraceStepV1Schema>>;
export type CalculationTraceV1 = DeepReadonly<z.infer<typeof CalculationTraceV1Schema>>;
export type TraceStepV2 = DeepReadonly<z.infer<typeof TraceStepV2Schema>>;
export type CalculationTraceV2 = DeepReadonly<z.infer<typeof CalculationTraceV2Schema>>;
export type BomLineV2 = DeepReadonly<z.infer<typeof BomLineV2Schema>>;
export type CalculationResultV2 = DeepReadonly<z.infer<typeof CalculationResultV2Schema>>;
