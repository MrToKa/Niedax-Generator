import type {
  AssemblyTemplateV2,
  CalculationInputV2,
  CalculationRuleV2,
  CompatibilityRelationV2,
  ProductSnapshotV2
} from "@niedax/domain";

export interface CalculationIndexes {
  readonly products: ReadonlyMap<string, ProductSnapshotV2>;
  readonly rules: ReadonlyMap<string, CalculationRuleV2>;
  readonly templates: ReadonlyMap<string, AssemblyTemplateV2>;
  readonly compatibility: readonly CompatibilityRelationV2[];
}

export function buildIndexes(input: CalculationInputV2): CalculationIndexes {
  return {
    products: new Map(input.products.map((product) => [product.id, product])),
    rules: new Map(input.rules.map((rule) => [rule.id, rule])),
    templates: new Map(input.assemblyTemplates.map((template) => [template.id, template])),
    compatibility: [...input.compatibilityRelations].sort((left, right) =>
      left.id.localeCompare(right.id)
    )
  };
}
