import { z } from "zod";

import {
  CableLoadQuantitySchema,
  DecimalStringSchema,
  HumanTextSchema,
  IdentifierSchema,
  MetresQuantitySchema,
  MillimetresQuantitySchema,
  OptionalHumanTextSchema,
  PackagesQuantitySchema,
  PercentageDecimalStringSchema,
  PiecesQuantitySchema,
  PositiveMetresQuantitySchema,
  PositivePiecesQuantitySchema,
  PositiveQuantitySchema,
  ProductCodeSchema,
  QuantitySchema,
  SemverSchema,
  Sha256Schema,
  SignedPiecesQuantitySchema,
  UtcDateTimeSchema
} from "./primitives.js";
import type { DeepReadonly } from "./primitives.js";

export const ProjectStatusSchema = z.enum([
  "draft",
  "calculated",
  "checked",
  "approved",
  "archived"
]);

export const ProjectSchema = z
  .object({
    id: IdentifierSchema,
    code: HumanTextSchema,
    name: HumanTextSchema,
    description: OptionalHumanTextSchema,
    status: ProjectStatusSchema,
    draftVersion: z.number().int().nonnegative(),
    createdAt: UtcDateTimeSchema,
    updatedAt: UtcDateTimeSchema
  })
  .strict();

export const SnapshotReferenceSchema = z
  .object({
    snapshotId: IdentifierSchema,
    version: SemverSchema,
    contentHash: Sha256Schema
  })
  .strict();

export const ManualChangeMetadataSchema = z
  .object({
    overrideId: IdentifierSchema,
    reason: HumanTextSchema,
    note: OptionalHumanTextSchema,
    actorId: IdentifierSchema,
    changedAt: UtcDateTimeSchema
  })
  .strict();

export const MaterialResolutionSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("resolved"),
      productId: IdentifierSchema,
      ruleId: IdentifierSchema
    })
    .strict(),
  z
    .object({
      status: z.literal("unresolved"),
      reason: HumanTextSchema
    })
    .strict()
]);

export const EndpointSchema = z.discriminatedUnion("type", [
  z.object({ id: IdentifierSchema, type: z.literal("freeEnd") }).strict(),
  z
    .object({
      id: IdentifierSchema,
      type: z.literal("endCap"),
      material: MaterialResolutionSchema
    })
    .strict(),
  z
    .object({
      id: IdentifierSchema,
      type: z.literal("equipment"),
      equipmentReference: HumanTextSchema,
      material: MaterialResolutionSchema
    })
    .strict(),
  z
    .object({
      id: IdentifierSchema,
      type: z.literal("routeContinuation"),
      connectionId: IdentifierSchema
    })
    .strict(),
  z
    .object({
      id: IdentifierSchema,
      type: z.literal("physicalSplice"),
      material: MaterialResolutionSchema
    })
    .strict(),
  z
    .object({
      id: IdentifierSchema,
      type: z.literal("custom"),
      manualBomLineIds: z.array(IdentifierSchema).min(1)
    })
    .strict()
]);

export const GeometryItemSchema = z.discriminatedUnion("kind", [
  z
    .object({
      id: IdentifierSchema,
      kind: z.literal("straight"),
      length: PositiveMetresQuantitySchema
    })
    .strict(),
  z
    .object({
      id: IdentifierSchema,
      kind: z.literal("fitting"),
      fittingType: z.enum(["horizontalBend", "verticalBend", "tee", "transition", "custom"]),
      material: MaterialResolutionSchema
    })
    .strict()
]);

export const EndpointReferenceSchema = z
  .object({ routeId: IdentifierSchema, endpointId: IdentifierSchema })
  .strict();

const ConnectionManualFields = {
  supportBehavior: z.enum(["shared", "separate"]),
  supportsBefore: PiecesQuantitySchema,
  supportsAfter: PiecesQuantitySchema,
  connectorCorrection: z
    .object({
      originalCalculatedQuantity: PiecesQuantitySchema,
      adjustedQuantity: SignedPiecesQuantitySchema,
      metadata: ManualChangeMetadataSchema
    })
    .strict()
    .nullable(),
  note: OptionalHumanTextSchema
};

export const ConnectionSchema = z.discriminatedUnion("type", [
  z
    .object({
      id: IdentifierSchema,
      type: z.literal("logicalContinuation"),
      participants: z.tuple([EndpointReferenceSchema, EndpointReferenceSchema]),
      physicalBreak: z.literal(false),
      materialBehavior: z.literal("none"),
      ...ConnectionManualFields
    })
    .strict(),
  z
    .object({
      id: IdentifierSchema,
      type: z.literal("physicalSplice"),
      participants: z.tuple([EndpointReferenceSchema, EndpointReferenceSchema]),
      physicalBreak: z.literal(true),
      material: MaterialResolutionSchema,
      ...ConnectionManualFields
    })
    .strict(),
  z
    .object({
      id: IdentifierSchema,
      type: z.literal("bend"),
      orientation: z.enum(["horizontal", "vertical"]),
      participants: z.tuple([EndpointReferenceSchema, EndpointReferenceSchema]),
      physicalBreak: z.boolean(),
      material: MaterialResolutionSchema,
      ...ConnectionManualFields
    })
    .strict(),
  z
    .object({
      id: IdentifierSchema,
      type: z.literal("tee"),
      participants: z.tuple([
        EndpointReferenceSchema,
        EndpointReferenceSchema,
        EndpointReferenceSchema
      ]),
      physicalBreak: z.boolean(),
      material: MaterialResolutionSchema,
      ...ConnectionManualFields
    })
    .strict(),
  z
    .object({
      id: IdentifierSchema,
      type: z.literal("transition"),
      participants: z.tuple([EndpointReferenceSchema, EndpointReferenceSchema]),
      physicalBreak: z.boolean(),
      fromSystemVariantId: IdentifierSchema,
      toSystemVariantId: IdentifierSchema,
      material: MaterialResolutionSchema,
      ...ConnectionManualFields
    })
    .strict(),
  z
    .object({
      id: IdentifierSchema,
      type: z.literal("custom"),
      participants: z.array(EndpointReferenceSchema).min(2).max(3),
      physicalBreak: z.boolean(),
      description: HumanTextSchema,
      material: MaterialResolutionSchema,
      ...ConnectionManualFields
    })
    .strict()
]);

export const WstbSelectionSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("one"), quantityPerSupport: z.literal("1") }).strict(),
  z
    .object({
      mode: z.literal("two"),
      quantityPerSupport: z.literal("2"),
      ruleId: IdentifierSchema
    })
    .strict(),
  z
    .object({
      mode: z.literal("manual"),
      quantityPerSupport: DecimalStringSchema,
      metadata: ManualChangeMetadataSchema
    })
    .strict()
]);

export const AnchorSelectionSchema = z
  .object({
    productId: IdentifierSchema,
    model: HumanTextSchema,
    size: MillimetresQuantitySchema,
    substrate: z.enum(["concrete", "steel", "masonry", "unknown"]),
    assemblyTemplateId: IdentifierSchema,
    quantityPerMountingPoint: PositivePiecesQuantitySchema,
    quantityOverride: z
      .object({
        originalCalculatedQuantity: PositivePiecesQuantitySchema,
        adjustedQuantity: PositivePiecesQuantitySchema,
        metadata: ManualChangeMetadataSchema
      })
      .strict()
      .nullable(),
    engineeringReviewRequired: z.literal(true)
  })
  .strict();

export const SupportPlanSchema = z
  .object({
    spacing: PositiveMetresQuantitySchema,
    supportType: z.enum(["wall", "ceiling", "floor", "custom"]),
    supportProductId: IdentifierSchema,
    structureProductIds: z.array(IdentifierSchema),
    assemblyTemplateId: IdentifierSchema,
    connectionBehavior: z.enum(["shared", "separate"]),
    additionalSupports: z
      .object({
        aroundFittings: PiecesQuantitySchema,
        beforeConnections: PiecesQuantitySchema,
        afterConnections: PiecesQuantitySchema
      })
      .strict(),
    anchor: AnchorSelectionSchema,
    wstb: WstbSelectionSchema
  })
  .strict();

export const SystemSelectionSchema = z
  .object({
    seriesId: IdentifierSchema,
    dimensionId: IdentifierSchema,
    finishId: IdentifierSchema,
    variantId: IdentifierSchema
  })
  .strict();

export const RouteSchema = z
  .object({
    id: IdentifierSchema,
    code: HumanTextSchema,
    name: HumanTextSchema,
    description: HumanTextSchema,
    system: SystemSelectionSchema,
    deliverableSectionLength: z.discriminatedUnion("metres", [
      z.object({ metres: z.literal(3), unit: z.literal("m") }).strict(),
      z.object({ metres: z.literal(6), unit: z.literal("m") }).strict()
    ]),
    startEndpoint: EndpointSchema,
    endEndpoint: EndpointSchema,
    geometry: z.array(GeometryItemSchema).min(1),
    supports: SupportPlanSchema
  })
  .strict();

export const SparePolicySchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("project") }).strict(),
  z
    .object({
      mode: z.literal("disabled"),
      metadata: ManualChangeMetadataSchema
    })
    .strict(),
  z
    .object({
      mode: z.literal("percentageOverride"),
      percent: PercentageDecimalStringSchema,
      metadata: ManualChangeMetadataSchema
    })
    .strict()
]);

export const PackagingPolicySchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("none") }).strict(),
  z
    .object({
      mode: z.literal("roundToPackage"),
      packageSize: PositiveQuantitySchema
    })
    .strict()
]);

const ManualBomLineFields = {
  id: IdentifierSchema,
  descriptionEn: HumanTextSchema,
  technicalQuantity: PositiveQuantitySchema,
  reason: HumanTextSchema,
  note: OptionalHumanTextSchema,
  sparePolicy: SparePolicySchema,
  packagingPolicy: PackagingPolicySchema,
  enteredBy: IdentifierSchema,
  enteredAt: UtcDateTimeSchema
};

export const ManualBomInputSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("catalog"),
      productId: IdentifierSchema,
      productCode: ProductCodeSchema,
      ...ManualBomLineFields
    })
    .strict(),
  z
    .object({
      kind: z.literal("freeText"),
      productCode: z.null(),
      ...ManualBomLineFields
    })
    .strict()
]);

export const ManualProductAdjustmentSchema = z
  .object({
    id: IdentifierSchema,
    targetProductId: IdentifierSchema,
    originalCalculatedQuantity: QuantitySchema,
    adjustedQuantity: QuantitySchema,
    metadata: ManualChangeMetadataSchema
  })
  .strict();

export const BomLinePolicyOverrideSchema = z
  .object({
    id: IdentifierSchema,
    target: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("catalogProduct"), productId: IdentifierSchema }).strict(),
      z.object({ kind: z.literal("manualInput"), manualInputId: IdentifierSchema }).strict()
    ]),
    sparePolicy: SparePolicySchema,
    packagingPolicy: PackagingPolicySchema,
    metadata: ManualChangeMetadataSchema
  })
  .strict();

export const ProductSchema = z
  .object({
    id: IdentifierSchema,
    code: ProductCodeSchema,
    descriptionEn: HumanTextSchema,
    productType: z.enum([
      "straightSection",
      "fitting",
      "support",
      "structure",
      "anchor",
      "wstb",
      "accessory",
      "other"
    ]),
    baseUnit: z.enum(["pcs", "m", "kg"]),
    packageSize: PositiveQuantitySchema,
    includedProductIds: z.array(IdentifierSchema),
    status: z.enum(["active", "inactive", "superseded"]),
    catalogSnapshotId: IdentifierSchema,
    source: z
      .object({
        sourceFileName: HumanTextSchema,
        sourceRow: z.number().int().positive().nullable(),
        sourceHash: Sha256Schema
      })
      .strict()
  })
  .strict();

export const AssemblyTemplateSchema = z
  .object({
    id: IdentifierSchema,
    code: HumanTextSchema,
    name: HumanTextSchema,
    status: z.enum(["draft", "active", "retired"]),
    catalogSnapshotId: IdentifierSchema,
    components: z
      .array(
        z
          .object({
            productId: IdentifierSchema,
            quantityPerAssembly: PositiveQuantitySchema,
            included: z.boolean()
          })
          .strict()
      )
      .min(1)
  })
  .strict();

const RuleFields = {
  id: IdentifierSchema,
  code: HumanTextSchema,
  version: SemverSchema,
  status: z.enum(["draft", "active", "retired"]),
  confidence: z.enum(["catalogConfirmed", "projectRule", "engineeringReview"]),
  ruleSnapshotId: IdentifierSchema
};

export const RuleSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("wstbPerSupport"),
      quantityPerSupport: PositivePiecesQuantitySchema,
      ...RuleFields
    })
    .strict(),
  z
    .object({
      type: z.literal("endpointMaterial"),
      endpointType: z.enum(["endCap", "equipment", "physicalSplice"]),
      productId: IdentifierSchema,
      ...RuleFields
    })
    .strict(),
  z
    .object({
      type: z.literal("connectionAssembly"),
      connectionType: z.enum(["physicalSplice", "bend", "tee", "transition", "custom"]),
      assemblyTemplateId: IdentifierSchema,
      ...RuleFields
    })
    .strict()
]);

export const ProjectCalculationDataSchema = z
  .object({
    id: IdentifierSchema,
    code: HumanTextSchema,
    name: HumanTextSchema,
    description: OptionalHumanTextSchema,
    draftVersion: z.number().int().nonnegative(),
    defaultSparePercent: PercentageDecimalStringSchema,
    cableLoad: CableLoadQuantitySchema.nullable(),
    routes: z.array(RouteSchema),
    connections: z.array(ConnectionSchema),
    accessoryProductIds: z.array(IdentifierSchema)
  })
  .strict();

export const WarningSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("validation"),
      code: IdentifierSchema,
      message: HumanTextSchema,
      path: z.array(z.union([z.string(), z.number().int().nonnegative()]))
    })
    .strict(),
  z
    .object({
      kind: z.literal("projectRule"),
      code: IdentifierSchema,
      message: HumanTextSchema,
      ruleId: IdentifierSchema
    })
    .strict(),
  z
    .object({
      kind: z.literal("engineeringReview"),
      code: IdentifierSchema,
      message: HumanTextSchema,
      subjectRef: IdentifierSchema
    })
    .strict(),
  z
    .object({
      kind: z.literal("manualOverride"),
      code: IdentifierSchema,
      message: HumanTextSchema,
      overrideId: IdentifierSchema
    })
    .strict(),
  z
    .object({
      kind: z.literal("catalog"),
      code: IdentifierSchema,
      message: HumanTextSchema,
      catalogSnapshotId: IdentifierSchema
    })
    .strict()
]);

export const BomSourceSchema = z.discriminatedUnion("kind", [
  z
    .object({ kind: z.literal("routeGeometry"), routeIds: z.array(IdentifierSchema).min(1) })
    .strict(),
  z.object({ kind: z.literal("catalog"), productId: IdentifierSchema }).strict(),
  z.object({ kind: z.literal("rule"), ruleId: IdentifierSchema }).strict(),
  z.object({ kind: z.literal("assemblyTemplate"), assemblyTemplateId: IdentifierSchema }).strict(),
  z.object({ kind: z.literal("manual"), manualInputId: IdentifierSchema }).strict()
]);

const BomLineFields = {
  id: IdentifierSchema,
  category: z.enum([
    "linearSection",
    "fitting",
    "support",
    "structure",
    "anchor",
    "wstb",
    "accessory",
    "manual"
  ]),
  descriptionEn: HumanTextSchema,
  technicalQuantity: QuantitySchema,
  packagingQuantity: QuantitySchema,
  packageSize: QuantitySchema,
  packageCount: PackagesQuantitySchema,
  orderedQuantity: QuantitySchema,
  spareQuantity: QuantitySchema,
  includedItems: z.array(
    z
      .object({
        productId: IdentifierSchema,
        productCode: ProductCodeSchema,
        quantityPerParent: QuantitySchema
      })
      .strict()
  ),
  source: BomSourceSchema,
  status: z.enum(["catalogConfirmed", "calculated", "projectRule", "engineeringReview", "manual"]),
  warnings: z.array(WarningSchema),
  sparePolicy: SparePolicySchema,
  packagingPolicy: PackagingPolicySchema,
  quantityOverride: z
    .object({
      originalCalculatedQuantity: QuantitySchema,
      adjustedQuantity: QuantitySchema,
      metadata: ManualChangeMetadataSchema
    })
    .strict()
    .nullable(),
  provenance: z
    .object({
      catalogSnapshotId: IdentifierSchema,
      ruleSnapshotId: IdentifierSchema,
      ruleIds: z.array(IdentifierSchema)
    })
    .strict()
};

export const BomLineSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("catalog"),
      productId: IdentifierSchema,
      productCode: ProductCodeSchema,
      ...BomLineFields
    })
    .strict(),
  z
    .object({
      kind: z.literal("manual"),
      manualInputId: IdentifierSchema,
      productCode: ProductCodeSchema.nullable(),
      ...BomLineFields
    })
    .strict()
]);

export const CalculationRunSchema = z
  .object({
    id: IdentifierSchema,
    projectId: IdentifierSchema,
    draftVersion: z.number().int().nonnegative(),
    status: z.enum(["requested", "running", "succeeded", "failed"]),
    inputFingerprint: Sha256Schema,
    engineVersion: SemverSchema,
    catalogSnapshot: SnapshotReferenceSchema,
    ruleSnapshot: SnapshotReferenceSchema,
    startedAt: UtcDateTimeSchema,
    completedAt: UtcDateTimeSchema.nullable(),
    failureCode: IdentifierSchema.nullable()
  })
  .strict();

export type Project = DeepReadonly<z.infer<typeof ProjectSchema>>;
export type Route = DeepReadonly<z.infer<typeof RouteSchema>>;
export type Connection = DeepReadonly<z.infer<typeof ConnectionSchema>>;
export type Product = DeepReadonly<z.infer<typeof ProductSchema>>;
export type AssemblyTemplate = DeepReadonly<z.infer<typeof AssemblyTemplateSchema>>;
export type Rule = DeepReadonly<z.infer<typeof RuleSchema>>;
export type CalculationRun = DeepReadonly<z.infer<typeof CalculationRunSchema>>;
export type BomLine = DeepReadonly<z.infer<typeof BomLineSchema>>;
export type Warning = DeepReadonly<z.infer<typeof WarningSchema>>;
export type ProjectCalculationData = DeepReadonly<z.infer<typeof ProjectCalculationDataSchema>>;
export type ManualBomInput = DeepReadonly<z.infer<typeof ManualBomInputSchema>>;
export type BomLinePolicyOverride = DeepReadonly<z.infer<typeof BomLinePolicyOverrideSchema>>;
export type SnapshotReference = DeepReadonly<z.infer<typeof SnapshotReferenceSchema>>;

// Re-exported here because these explicit unit schemas are part of the public domain vocabulary.
export {
  CableLoadQuantitySchema,
  MetresQuantitySchema,
  MillimetresQuantitySchema,
  PackagesQuantitySchema,
  PiecesQuantitySchema
};
