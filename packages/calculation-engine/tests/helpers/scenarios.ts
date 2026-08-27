import type { CalculationInputV2 } from "@niedax/domain";

import { allMajorRulesInputV2 } from "./fixture-v2.js";

type Mutable<T> = T extends readonly (infer Item)[]
  ? Mutable<Item>[]
  : T extends object
    ? { -readonly [Key in keyof T]: Mutable<T[Key]> }
    : T;

function mutableInput(): Mutable<CalculationInputV2> {
  return structuredClone(allMajorRulesInputV2) as unknown as Mutable<CalculationInputV2>;
}

function requireRoute(input: Mutable<CalculationInputV2>, id: string) {
  const route = input.project.routes.find((candidate) => candidate.id === id);
  if (route === undefined) throw new Error(`Missing scenario route ${id}`);
  return route;
}

function requireProduct(input: Mutable<CalculationInputV2>, id: string) {
  const product = input.products.find((candidate) => candidate.id === id);
  if (product === undefined) throw new Error(`Missing scenario product ${id}`);
  return product;
}

function removeFittingScenarioData(input: Mutable<CalculationInputV2>): void {
  for (const route of input.project.routes) {
    route.geometry = route.geometry.filter((item) => item.kind !== "fitting");
  }
  input.rules = input.rules.filter(
    (rule) => rule.id !== "rule-fitting-a" && rule.id !== "rule-fitting-support-a"
  );
  input.compatibilityRelations = input.compatibilityRelations.filter(
    (relation) => relation.id !== "compat-fitting"
  );
  const compatibilityRule = input.rules.find((rule) => rule.id === "rule-compatibility");
  if (compatibilityRule?.type !== "compatibility")
    throw new Error("Missing compatibility scenario rule");
  compatibilityRule.relationIds = compatibilityRule.relationIds.filter(
    (id) => id !== "compat-fitting"
  );
}

function disableAssemblyScenarioData(input: Mutable<CalculationInputV2>): void {
  for (const route of input.project.routes) {
    route.supports.templateId = null;
    route.supports.levelCount = null;
    route.supports.anchorProductId = null;
    route.supports.anchorQuantityOverride = null;
    route.supports.wstbProductId = null;
    route.supports.manualAdditionalSupports = [];
  }
}

function connectedRoutesScenario(): CalculationInputV2 {
  const input = mutableInput();
  removeFittingScenarioData(input);
  disableAssemblyScenarioData(input);
  input.manualItems = [];
  input.project.accessoryProductIds = [];
  return input;
}

function mixedSupplyScenario(): CalculationInputV2 {
  const input = mutableInput();
  const routeB = requireRoute(input, "route-b");
  routeB.defaultSupplyOptionId = "supply-3m";
  input.manualItems = [];
  input.project.accessoryProductIds = [];
  return input;
}

function fittingsScenario(): CalculationInputV2 {
  const input = mutableInput();
  disableAssemblyScenarioData(input);
  input.manualItems = [];
  input.project.accessoryProductIds = [];
  return input;
}

function assemblyScenario(): CalculationInputV2 {
  const input = mutableInput();
  removeFittingScenarioData(input);
  input.manualItems = [];
  input.project.accessoryProductIds = [];
  return input;
}

function routeEndsScenario(): CalculationInputV2 {
  const input = mutableInput();
  input.project.accessoryProductIds = [];
  return input;
}

function unresolvedScenario(): CalculationInputV2 {
  const input = mutableInput();
  const routeA = requireRoute(input, "route-a");
  const routeB = requireRoute(input, "route-b");
  const sixMetre = requireProduct(input, "product-straight").supplyOptions.find(
    (option) => option.id === "supply-6m"
  );
  if (sixMetre === undefined) throw new Error("Missing 6 m scenario option");
  sixMetre.active = false;
  routeB.defaultSupplyOptionId = "supply-3m";
  routeA.supports.templateId = null;
  routeB.supports.anchorProductId = null;
  routeB.supports.anchorQuantityOverride = null;
  for (const item of routeA.geometry) {
    if (item.kind === "fitting") {
      item.connectionRuleId = null;
      item.additionalSupportRuleId = null;
    }
  }
  routeA.startEndpoint.materialRuleId = null;
  input.compatibilityRelations = input.compatibilityRelations.filter(
    (relation) => relation.id !== "compat-accessory"
  );
  const compatibilityRule = input.rules.find((rule) => rule.id === "rule-compatibility");
  if (compatibilityRule?.type !== "compatibility")
    throw new Error("Missing compatibility scenario rule");
  compatibilityRule.relationIds = compatibilityRule.relationIds.filter(
    (id) => id !== "compat-accessory"
  );
  return input;
}

export const goldenScenarios: Readonly<Record<string, () => CalculationInputV2>> = {
  "connected-routes-6m-support-continuation": connectedRoutesScenario,
  "per-segment-rounding-and-3m-6m-separation": mixedSupplyScenario,
  "fittings-joints-and-included-fasteners": fittingsScenario,
  "assembly-anchors-wstb-and-manual-supports": assemblyScenario,
  "route-ends-and-manual-items": routeEndsScenario,
  "unresolved-data-warning-matrix": unresolvedScenario,
  "all-major-rules-combined": () => structuredClone(allMajorRulesInputV2)
};
