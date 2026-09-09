import {
  ProjectDraftInputV2Schema,
  type CalculationResultV2,
  type ProjectDraftInputV2
} from "@niedax/domain";
import { line } from "./stage10-fixtures.js";

export interface PerformanceCatalogIds {
  readonly straight: string;
  readonly support: string;
  readonly connector: string;
  readonly anchor: string;
  readonly template: string;
  readonly supply: string;
  readonly system: string;
}

/** Synthetic API fixtures preserve the application's accepted unresolved fitting policy. */
export function performanceDraft(
  size: "typical" | "large",
  catalog: PerformanceCatalogIds,
  nextId: () => string
): ProjectDraftInputV2 {
  const count = size === "typical" ? 10 : 100;
  const routes = Array.from({ length: count }, (_, routeIndex) => ({
    id: nextId(),
    code: `PERF-${routeIndex + 1}`,
    name: `Synthetic benchmark route ${routeIndex + 1}`,
    description: null,
    selection: {
      system: catalog.system,
      dimensionId: `dimension:${catalog.system.replace(/[^0-9A-Za-z._-]/gu, "-")}:60x200`,
      width: { value: "200", unit: "mm" },
      height: { value: "60", unit: "mm" },
      materialCode: "steel",
      finishCode: "F",
      straightProductId: catalog.straight,
      defaultSupplyOptionId: catalog.supply
    },
    startEndpoint: {
      id: nextId(),
      type: routeIndex === 0 ? "freeEnd" : "routeContinuation",
      selectedProductId: null,
      equipmentReference: null,
      customDescription: null
    },
    endEndpoint: {
      id: nextId(),
      type: routeIndex === count - 1 ? "freeEnd" : "routeContinuation",
      selectedProductId: null,
      equipmentReference: null,
      customDescription: null
    },
    geometry: Array.from({ length: 10 }, (_, index) => [
      { id: nextId(), kind: "straight", length: { value: "6", unit: "m" }, supplyOptionId: null },
      ...(index === 0
        ? [
            {
              id: nextId(),
              kind: "fitting",
              fittingType: "horizontalBend",
              selectedProductId: null,
              supportedPhysicalLength: null,
              customDescription: null
            }
          ]
        : [])
    ]).flat(),
    supports: {
      spacing: { value: "1.5", unit: "m" },
      supportType: "wall",
      supportProductId: catalog.support,
      assemblyTemplateId: catalog.template,
      levelCount: null,
      substrate: "concrete",
      anchorProductId: catalog.anchor,
      anchorQuantityOverride: null,
      wstbProductId: null,
      wstb: { mode: "one" },
      manualAdditionalSupports: [],
      templateManualValues: []
    }
  }));
  const connections = routes.slice(0, -1).map((route, index) => ({
    id: nextId(),
    type: "logicalContinuation",
    participants: [
      { routeId: route.id, endpointId: route.endEndpoint.id },
      { routeId: routes[index + 1]!.id, endpointId: routes[index + 1]!.startEndpoint.id }
    ],
    physicalBreak: false,
    supportBehavior: "shared",
    materialProductId: null,
    supportsBefore: { value: "0", unit: "pcs" },
    supportsAfter: { value: "0", unit: "pcs" },
    connectorCorrections: []
  }));
  return ProjectDraftInputV2Schema.parse({
    code: `S10-PERF-${size}`,
    name: `Stage 10 synthetic ${size} benchmark`,
    description:
      "Unresolved fittings are intentional; no material or engineering fact is inferred.",
    defaultLocale: "en",
    defaultReservePercent: "0",
    cableLoad: { value: "0", unit: "kgPerM" },
    routes,
    connections,
    accessoryProductIds: [],
    manualItems: Array.from({ length: count }, (_, index) => ({
      id: nextId(),
      kind: "freeText",
      productId: null,
      productCode: null,
      descriptionEn: `Synthetic manual material ${index + 1}`,
      quantity: { value: "2.5", unit: "m" },
      reason: "Synthetic performance fixture",
      note: null,
      reservePolicy: { mode: "projectDefault" },
      packagingPolicy: { mode: "disabled", metadata: null },
      quantityOverride: null
    }))
  });
}

/** Literal independent references: one continuous support group; each unresolved bend splits joints. */
export const API_PERFORMANCE_EXPECTED = {
  typical: {
    routes: 10,
    segments: 100,
    fittings: 10,
    connections: 9,
    manualItems: 10,
    straight: "600",
    supports: "401",
    joints: "89",
    jointsOrdered: "90",
    anchors: "802",
    anchorsOrdered: "810",
    bomLines: 14
  },
  large: {
    routes: 100,
    segments: 1000,
    fittings: 100,
    connections: 99,
    manualItems: 100,
    straight: "6000",
    supports: "4001",
    joints: "899",
    jointsOrdered: "900",
    anchors: "8002",
    anchorsOrdered: "8010",
    bomLines: 104
  }
} as const;

export function assertApiPerformanceResult(
  size: "typical" | "large",
  result: CalculationResultV2
): void {
  const expected = API_PERFORMANCE_EXPECTED[size];
  for (const [code, technical, ordered] of [
    ["S10-SYN-STRAIGHT", expected.straight, expected.straight],
    ["S10-SYN-SUPPORT", expected.supports, expected.supports],
    ["S10-SYN-CONNECTOR", expected.joints, expected.jointsOrdered],
    ["S10-SYN-ANCHOR", expected.anchors, expected.anchorsOrdered]
  ]) {
    const item = line(result, code!);
    if (item.technicalQuantity.value !== technical || item.orderedQuantity.value !== ordered)
      throw new Error(`API benchmark quantity mismatch: ${size} ${code}`);
  }
  if (result.bomLines.length !== expected.bomLines) throw new Error("API benchmark incomplete BOM");
  const manual = result.bomLines.filter((item) => item.category === "manual");
  if (
    manual.length !== expected.manualItems ||
    manual.some(
      (item) =>
        item.technicalQuantity.value !== "2.5" ||
        item.orderedQuantity.value !== "2.5" ||
        item.packageCount !== null
    )
  )
    throw new Error("API benchmark manual quantity or policy mismatch");
  for (const code of ["UNRESOLVED_FITTING_CONNECTION", "FITTING_ADDITIONAL_SUPPORT_UNRESOLVED"])
    if (result.warnings.filter((warning) => warning.code === code).length !== expected.fittings)
      throw new Error(`API benchmark warning mismatch: ${code}`);
  if (result.summary.approvalReady)
    throw new Error("API benchmark unresolved materials must block approval");
}
