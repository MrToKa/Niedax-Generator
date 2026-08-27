import type { CalculationInputV2, ProductSnapshotV2 } from "@niedax/domain";

import { CalculationEngineError } from "../errors.js";
import type { CalculationIndexes } from "../model/indexes.js";
import type { SourceReferenceV2 } from "@niedax/domain";
import type { WarningCollector } from "./warnings.js";

export type CompatibilityContext =
  | "straightSection"
  | "fitting"
  | "connection"
  | "endpoint"
  | "support"
  | "structure"
  | "anchor"
  | "wstb"
  | "accessory"
  | "manualCatalog";

export function productAvailable(product: ProductSnapshotV2): boolean {
  return product.active && product.orderable;
}

export function requireCompatibleProduct(
  input: CalculationInputV2,
  indexes: CalculationIndexes,
  warnings: WarningCollector,
  product: ProductSnapshotV2,
  context: CompatibilityContext,
  subjectKind: string,
  subjectId: string,
  sourceRefs: readonly SourceReferenceV2[]
): { readonly compatible: boolean; readonly warningIds: readonly string[] } {
  const relations = indexes.compatibility.filter(
    (relation) =>
      relation.context === context &&
      relation.productId === product.id &&
      (relation.subjectRef === subjectId || relation.subjectRef === input.project.id)
  );
  const explicitAllowed = relations.some((relation) => relation.allowed);
  const explicitDenied = relations.some((relation) => !relation.allowed);
  if (explicitAllowed && explicitDenied) {
    throw new CalculationEngineError(
      "SEMANTIC_INPUT_INVALID",
      "Contradictory compatibility relations prevent a safe calculation.",
      [
        {
          path: ["compatibilityRelations"],
          code: "CONTRADICTORY_COMPATIBILITY",
          message: product.id
        }
      ]
    );
  }
  if (!productAvailable(product) || explicitDenied) {
    const code =
      context === "anchor" ? "ANCHOR_PRODUCT_INCOMPATIBLE" : "PRODUCT_SELECTION_INCOMPATIBLE";
    const warningId = warnings.add({
      code,
      kind: "catalog",
      severity: "blocking",
      subject: { kind: subjectKind, id: subjectId },
      effect: "The incompatible or unavailable product was omitted from orderable demand.",
      approvalImpact: "blocksApproval",
      productId: product.id,
      sourceRefs
    });
    return { compatible: false, warningIds: [warningId] };
  }
  if (!explicitAllowed) {
    const warningId = warnings.add({
      code: "MISSING_COMPATIBILITY_RULE",
      kind: "catalog",
      severity: "blocking",
      subject: { kind: subjectKind, id: subjectId },
      effect: "No orderable demand was created without explicit compatibility evidence.",
      approvalImpact: "blocksApproval",
      productId: product.id,
      sourceRefs
    });
    return { compatible: false, warningIds: [warningId] };
  }
  return { compatible: true, warningIds: [] };
}

export function failIfRequired(
  input: CalculationInputV2,
  subjectId: string,
  message: string
): void {
  if (input.options.unresolvedMaterialPolicy === "fail") {
    throw new CalculationEngineError("UNRESOLVED_MATERIAL", message, [
      { path: [], code: "UNRESOLVED_MATERIAL", message: subjectId }
    ]);
  }
}
