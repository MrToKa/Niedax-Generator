import {
  CalculationInputV2Schema,
  type CalculationInputV2,
  type CalculationResultV2
} from "@niedax/domain";

import { allMajorRulesInputV2 } from "./fixture-v2.js";

export type Mutable<T> = T extends readonly (infer Item)[]
  ? Mutable<Item>[]
  : T extends object
    ? { -readonly [Key in keyof T]: Mutable<T[Key]> }
    : T;
export type TestInput = Mutable<CalculationInputV2>;

export function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Missing explicit synthetic fixture element");
  return value;
}

export function metadata(id: string) {
  return {
    overrideId: id,
    reason: `Synthetic Stage 10 review reason: ${id}`,
    note: null,
    actorRef: "synthetic-reviewer",
    decisionRef: `synthetic-decision-${id}`
  };
}

/** Fully resolved synthetic semantics, never a claim of P0 compatibility or structural approval. */
export function straightInput(lengths = ["6"]): TestInput {
  const input = CalculationInputV2Schema.parse(allMajorRulesInputV2);
  input.project.defaultReservePercent = "0";
  input.project.connections = [];
  input.project.accessoryProductIds = [];
  input.manualItems = [];
  input.project.routes = [required(input.project.routes[0])];
  const route = required(input.project.routes[0]);
  route.startEndpoint = {
    id: "endpoint-a-start",
    type: "freeEnd",
    materialRuleId: null,
    connectionId: null
  };
  route.endEndpoint = {
    id: "endpoint-a-end",
    type: "freeEnd",
    materialRuleId: null,
    connectionId: null
  };
  route.geometry = lengths.map((length, index) => ({
    id: `segment-a-${index}`,
    kind: "straight",
    length: { value: length, unit: "m" },
    supplyOptionId: null
  }));
  route.supports.manualAdditionalSupports = [];
  route.supports.anchorQuantityOverride = null;
  input.rules = input.rules.filter(
    (rule) =>
      !["fittingConnection", "fittingAdditionalSupport", "endpointMaterial"].includes(rule.type)
  );
  input.compatibilityRelations = input.compatibilityRelations.filter(
    (relation) => relation.context !== "fitting"
  );
  const compatibility = required(input.rules.find((rule) => rule.type === "compatibility"));
  if (compatibility.type === "compatibility")
    compatibility.relationIds = input.compatibilityRelations.map((relation) => relation.id);
  const template = required(input.assemblyTemplates[0]);
  template.components = template.components.filter((component) =>
    ["support", "anchor", "wstb"].includes(component.role)
  );
  required(template.components.find((component) => component.role === "wstb")).quantity.value = "2";
  for (const product of input.products) {
    if (product.orderUnit === "pcs") product.packageIncrement = { value: "1", unit: "pcs" };
    product.source.sourceDocument = "SYNTHETIC Stage 10 reference facts";
    product.source.sourcePage = "not catalog evidence";
  }
  input.catalogSnapshot.version = "stage10-synthetic-v1";
  input.ruleSnapshot.version = "stage10-synthetic-v1";
  return input;
}

export function connectRoutes(input: TestInput, count: number, physical = false): void {
  const prototype = structuredClone(required(input.project.routes[0]));
  input.project.routes = Array.from({ length: count }, (_, index) => {
    const route = structuredClone(prototype);
    route.id = `route-${index}`;
    route.code = `Named route ${index + 1}`;
    route.geometry = route.geometry.map((item, segment) => ({
      ...item,
      id: `segment-${index}-${segment}`
    }));
    route.startEndpoint = {
      id: `endpoint-${index}-start`,
      type: index === 0 ? "freeEnd" : "routeContinuation",
      connectionId: index === 0 ? null : `connection-${index - 1}`,
      materialRuleId: null
    };
    route.endEndpoint = {
      id: `endpoint-${index}-end`,
      type: index === count - 1 ? "freeEnd" : "routeContinuation",
      connectionId: index === count - 1 ? null : `connection-${index}`,
      materialRuleId: null
    };
    return route;
  });
  input.project.connections = Array.from({ length: count - 1 }, (_, index) => ({
    id: `connection-${index}`,
    type: physical ? "physicalSplice" : "logicalContinuation",
    participants: [
      { routeId: `route-${index}`, endpointId: `endpoint-${index}-end` },
      { routeId: `route-${index + 1}`, endpointId: `endpoint-${index + 1}-start` }
    ],
    physicalBreak: physical,
    supportBehavior: physical ? "separate" : "shared",
    materialRuleId: physical ? `physical-rule-${index}` : null,
    supportsBefore: { value: "0", unit: "pcs" },
    supportsAfter: { value: "0", unit: "pcs" },
    connectorCorrections: []
  }));
  if (physical)
    for (const [index, connection] of input.project.connections.entries()) {
      const base = required(input.rules.find((rule) => rule.type === "internalJoint"));
      input.rules.push({
        id: `physical-rule-${index}`,
        code: `SYNTHETIC-PHYSICAL-${index}`,
        version: base.version,
        confidence: base.confidence,
        status: base.status,
        ruleSnapshotId: base.ruleSnapshotId,
        source: { ...base.source, id: `physical-rule-${index}` },
        type: "physicalConnection",
        connectionId: connection.id,
        components: [
          {
            productId: "product-connector",
            quantityPerEvent: { value: "1", unit: "pcs" },
            portOrSideCount: "2"
          }
        ]
      });
    }
}

export function product(input: TestInput, id: string) {
  return required(input.products.find((candidate) => candidate.id === id));
}

export function line(result: CalculationResultV2, code: string) {
  return required(result.bomLines.find((candidate) => candidate.productCode === code));
}

export function addBend(input: TestInput, routeIndex = 0): void {
  const route = required(input.project.routes[routeIndex]);
  const id = `bend-${routeIndex}`;
  route.geometry.splice(1, 0, {
    id,
    kind: "fitting",
    fittingType: "horizontalBend",
    productId: "product-fitting",
    connectionRuleId: `${id}-ports`,
    additionalSupportRuleId: `${id}-supports`,
    supportedPhysicalLength: null
  });
  const base = required(
    allMajorRulesInputV2.rules.find((rule) => rule.type === "fittingConnection")
  );
  if (base.type !== "fittingConnection") throw new Error("Missing synthetic fitting rule");
  input.rules.push({
    ...structuredClone(base),
    components: base.components.map((component) => ({
      ...component,
      quantityPerEvent: { ...component.quantityPerEvent }
    })),
    id: `${id}-ports`,
    fittingId: id
  });
  const extra = required(
    allMajorRulesInputV2.rules.find((rule) => rule.type === "fittingAdditionalSupport")
  );
  if (extra.type !== "fittingAdditionalSupport") throw new Error("Missing synthetic support rule");
  input.rules.push({ ...structuredClone(extra), id: `${id}-supports`, fittingId: id });
  const relation = required(
    input.compatibilityRelations.find((candidate) => candidate.context === "support")
  );
  input.compatibilityRelations.push({
    ...relation,
    id: `${id}-compatible`,
    context: "fitting",
    subjectRef: id,
    productId: "product-fitting"
  });
  const compatibility = required(input.rules.find((rule) => rule.type === "compatibility"));
  if (compatibility.type === "compatibility") compatibility.relationIds.push(`${id}-compatible`);
}

export function manualItem(
  id = "stage10-manual",
  quantity = "2.5",
  unit: "pcs" | "m" | "kg" = "m"
) {
  return {
    id,
    kind: "freeText" as const,
    productId: null,
    productCode: null,
    descriptionEn: `Synthetic manual item ${id}`,
    quantity: { value: quantity, unit },
    reason: "Independently specified synthetic site quantity",
    note: null,
    reservePolicy: { mode: "projectDefault" as const },
    packagingPolicy: {
      mode: "incrementOverride" as const,
      increment: { value: "3", unit },
      metadata: metadata(`${id}-package`)
    },
    quantityOverride: null
  };
}

/** Fixed benchmark sizes; correctness references remain in the engine test tree. */
export function performanceInput(size: "typical" | "large"): TestInput {
  const input = straightInput(Array.from({ length: 10 }, () => "6"));
  const routes = size === "typical" ? 10 : 100;
  connectRoutes(input, routes);
  for (let index = 0; index < routes; index += 1) {
    addBend(input, index);
    input.manualItems.push(manualItem(`performance-manual-${index}`));
  }
  input.invocation.calculationRunId = `stage10-performance-${size}`;
  return input;
}

/** Literal reference values: each 60 m route adds 10 sections, one bend and one extra support. */
export const PERFORMANCE_EXPECTED = {
  typical: {
    routes: 10,
    segments: 100,
    fittings: 10,
    connections: 9,
    manualItems: 10,
    straightMetres: "600",
    supports: "411",
    joints: "89",
    fittingConnectors: "20",
    fittingQuantity: "10",
    bomLines: 17,
    anchors: "822",
    wstb: "822"
  },
  large: {
    routes: 100,
    segments: 1000,
    fittings: 100,
    connections: 99,
    manualItems: 100,
    straightMetres: "6000",
    supports: "4101",
    joints: "899",
    fittingConnectors: "200",
    fittingQuantity: "100",
    bomLines: 107,
    anchors: "8202",
    wstb: "8202"
  }
} as const;

export function assertPerformanceResult(
  size: "typical" | "large",
  result: CalculationResultV2
): void {
  const expected = PERFORMANCE_EXPECTED[size];
  for (const [code, value] of [
    ["NX STRAIGHT", expected.straightMetres],
    ["NX SUPPORT", expected.supports],
    ["NX JOINT", expected.joints],
    ["NX CONNECTOR", expected.fittingConnectors],
    ["NX BEND", expected.fittingQuantity],
    ["NX ANCHOR", expected.anchors],
    ["NX WSTB", expected.wstb]
  ] as const) {
    if (line(result, code).technicalQuantity.value !== value)
      throw new Error(`Benchmark correctness failure: ${size} ${code}`);
  }
  if (result.bomLines.length !== expected.bomLines)
    throw new Error("Benchmark BOM was truncated or contains unexpected material");
  const manual = result.bomLines.filter((item) => item.category === "manual");
  if (manual.length !== expected.manualItems)
    throw new Error("Benchmark manual evidence was truncated");
  for (const item of manual)
    if (
      item.technicalQuantity.value !== "2.5" ||
      item.reserveQuantity.value !== "0" ||
      item.reservedQuantity.value !== "2.5" ||
      item.packageIncrement.value !== "3" ||
      item.packageCount?.value !== "1" ||
      item.packagingOverage.value !== "0.5" ||
      item.orderedQuantity.value !== "3" ||
      item.totalSpareQuantity.value !== "0.5" ||
      item.unit !== "m"
    )
      throw new Error("Benchmark manual quantity or package evidence is incorrect");
}
