import { z } from "zod";

import {
  AssemblyTemplateSchema,
  BomLinePolicyOverrideSchema,
  BomLineSchema,
  ManualBomInputSchema,
  ManualProductAdjustmentSchema,
  ProductSchema,
  ProjectCalculationDataSchema,
  RuleSchema,
  SnapshotReferenceSchema,
  WarningSchema
} from "../domain.js";
import {
  type DeepReadonly,
  IdentifierSchema,
  QuantitySchema,
  QuantityUnitSchema,
  SemverSchema,
  Sha256Schema
} from "../primitives.js";
import { CALCULATION_INPUT_V1, CALCULATION_RESULT_V1 } from "../versions.js";

export { CALCULATION_INPUT_V1, CALCULATION_RESULT_V1 } from "../versions.js";

export const CalculationInputV1Schema = z
  .object({
    schemaVersion: z.literal(CALCULATION_INPUT_V1),
    invocation: z
      .object({
        calculationRunId: IdentifierSchema,
        inputFingerprint: Sha256Schema
      })
      .strict(),
    project: ProjectCalculationDataSchema,
    catalogSnapshot: SnapshotReferenceSchema,
    catalogProducts: z.array(ProductSchema).min(1),
    ruleSnapshot: SnapshotReferenceSchema,
    rules: z.array(RuleSchema).min(1),
    assemblyTemplates: z.array(AssemblyTemplateSchema).min(1),
    manualBomLines: z.array(ManualBomInputSchema),
    manualProductAdjustments: z.array(ManualProductAdjustmentSchema),
    linePolicies: z.array(BomLinePolicyOverrideSchema),
    options: z
      .object({
        failOnUnresolvedMaterial: z.boolean(),
        includePackaging: z.boolean(),
        outputLanguage: z.literal("en")
      })
      .strict()
  })
  .strict()
  .superRefine((input, context) => {
    if (input.project.routes.length === 0) {
      context.addIssue({
        code: "custom",
        message: "At least one route is required for calculation",
        path: ["project", "routes"]
      });
    }

    const routeCodes = new Set<string>();
    for (const [index, route] of input.project.routes.entries()) {
      const normalizedCode = route.code.toLocaleLowerCase("en-US");
      if (routeCodes.has(normalizedCode)) {
        context.addIssue({
          code: "custom",
          message: "Route codes must be unique case-insensitively",
          path: ["project", "routes", index, "code"]
        });
      }
      routeCodes.add(normalizedCode);
    }

    const routeIds = new Set(input.project.routes.map((route) => route.id));
    for (const [connectionIndex, connection] of input.project.connections.entries()) {
      const participantRouteIds = new Set<string>();
      for (const [participantIndex, participant] of connection.participants.entries()) {
        if (!routeIds.has(participant.routeId)) {
          context.addIssue({
            code: "custom",
            message: "Connection references an unknown route",
            path: [
              "project",
              "connections",
              connectionIndex,
              "participants",
              participantIndex,
              "routeId"
            ]
          });
        }
        if (participantRouteIds.has(participant.routeId)) {
          context.addIssue({
            code: "custom",
            message: "A connection cannot use more than one endpoint from the same route",
            path: ["project", "connections", connectionIndex, "participants", participantIndex]
          });
        }
        participantRouteIds.add(participant.routeId);
      }
    }

    const productIds = new Set<string>();
    for (const [index, product] of input.catalogProducts.entries()) {
      if (productIds.has(product.id)) {
        context.addIssue({
          code: "custom",
          message: "Catalog product IDs must be unique",
          path: ["catalogProducts", index, "id"]
        });
      }
      productIds.add(product.id);
      if (product.catalogSnapshotId !== input.catalogSnapshot.snapshotId) {
        context.addIssue({
          code: "custom",
          message: "Product does not belong to the declared catalog snapshot",
          path: ["catalogProducts", index, "catalogSnapshotId"]
        });
      }
      if (product.packageSize.unit !== product.baseUnit) {
        context.addIssue({
          code: "custom",
          message: "Product package size unit must match its base unit",
          path: ["catalogProducts", index, "packageSize", "unit"]
        });
      }
    }

    for (const [index, rule] of input.rules.entries()) {
      if (rule.ruleSnapshotId !== input.ruleSnapshot.snapshotId) {
        context.addIssue({
          code: "custom",
          message: "Rule does not belong to the declared rule snapshot",
          path: ["rules", index, "ruleSnapshotId"]
        });
      }
    }

    for (const [index, template] of input.assemblyTemplates.entries()) {
      if (template.catalogSnapshotId !== input.catalogSnapshot.snapshotId) {
        context.addIssue({
          code: "custom",
          message: "Assembly template does not belong to the declared catalog snapshot",
          path: ["assemblyTemplates", index, "catalogSnapshotId"]
        });
      }
      for (const [componentIndex, component] of template.components.entries()) {
        if (!productIds.has(component.productId)) {
          context.addIssue({
            code: "custom",
            message: "Assembly template references an unknown catalog product",
            path: ["assemblyTemplates", index, "components", componentIndex, "productId"]
          });
        }
      }
    }

    const manualInputIds = new Set(input.manualBomLines.map((line) => line.id));
    for (const [index, line] of input.manualBomLines.entries()) {
      if (line.kind === "catalog" && !productIds.has(line.productId)) {
        context.addIssue({
          code: "custom",
          message: "Manual catalog line references an unknown catalog product",
          path: ["manualBomLines", index, "productId"]
        });
      }
    }
    for (const [index, policy] of input.linePolicies.entries()) {
      const targetExists =
        policy.target.kind === "catalogProduct"
          ? productIds.has(policy.target.productId)
          : manualInputIds.has(policy.target.manualInputId);
      if (!targetExists) {
        context.addIssue({
          code: "custom",
          message: "BOM line policy references an unknown target",
          path: ["linePolicies", index, "target"]
        });
      }
    }
  });

export const CalculationResultV1Schema = z
  .object({
    schemaVersion: z.literal(CALCULATION_RESULT_V1),
    engineVersion: SemverSchema,
    calculationRunId: IdentifierSchema,
    inputFingerprint: Sha256Schema,
    calculationStatus: z.enum(["contractOnly", "complete"]),
    catalogSnapshot: SnapshotReferenceSchema,
    ruleSnapshot: SnapshotReferenceSchema,
    bomLines: z.array(BomLineSchema),
    warnings: z.array(WarningSchema),
    summary: z
      .object({
        bomLineCount: z.number().int().nonnegative(),
        warningCount: z.number().int().nonnegative(),
        engineeringReviewRequired: z.boolean(),
        orderedTotalsByUnit: z.array(
          z
            .object({
              unit: QuantityUnitSchema,
              quantity: QuantitySchema
            })
            .strict()
        )
      })
      .strict()
  })
  .strict()
  .superRefine((result, context) => {
    for (const [lineIndex, line] of result.bomLines.entries()) {
      const expectedUnit = line.technicalQuantity.unit;
      const quantities = [
        ["packagingQuantity", line.packagingQuantity],
        ["packageSize", line.packageSize],
        ["orderedQuantity", line.orderedQuantity],
        ["spareQuantity", line.spareQuantity]
      ] as const;
      for (const [field, quantity] of quantities) {
        if (quantity.unit !== expectedUnit) {
          context.addIssue({
            code: "custom",
            message: "BOM quantities and package size must use the technical quantity unit",
            path: ["bomLines", lineIndex, field, "unit"]
          });
        }
      }
    }
    if (result.summary.bomLineCount !== result.bomLines.length) {
      context.addIssue({
        code: "custom",
        message: "BOM line count does not match the BOM lines",
        path: ["summary", "bomLineCount"]
      });
    }
    if (result.summary.warningCount !== result.warnings.length) {
      context.addIssue({
        code: "custom",
        message: "Warning count does not match the top-level warnings",
        path: ["summary", "warningCount"]
      });
    }
    for (const [index, total] of result.summary.orderedTotalsByUnit.entries()) {
      if (total.unit !== total.quantity.unit) {
        context.addIssue({
          code: "custom",
          message: "Summary unit must match its quantity unit",
          path: ["summary", "orderedTotalsByUnit", index]
        });
      }
    }
  });

export type CalculationInputV1 = DeepReadonly<z.infer<typeof CalculationInputV1Schema>>;
export type CalculationResultV1 = DeepReadonly<z.infer<typeof CalculationResultV1Schema>>;
