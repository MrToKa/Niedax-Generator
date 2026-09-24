import { createHash } from "node:crypto";

import {
  ProjectDraftInputV2Schema,
  type EditorCatalogResponseV2,
  type ProjectDraftInputV2,
  type ProjectRouteDraftV2
} from "@niedax/domain";

export const stage11DemoCodes = [
  "KL",
  "WSL",
  "CONTINUATION",
  "PHYSICAL",
  "BEND",
  "TEE",
  "ENDS",
  "SUPPORT",
  "ANCHOR",
  "ROUNDING",
  "CATALOG",
  "TEXT",
  "APPROVAL"
] as const;

function id(label: string): string {
  const hash = createHash("sha256").update(`stage11-demo-v1:${label}`).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

/** Demonstration geometry only. All material facts come from the active editor catalog.
 * Unresolved connection/end/fitting facts remain unresolved; this module has no BOM formulas.
 */
export function stage11DemoProjects(catalog: EditorCatalogResponseV2): ProjectDraftInputV2[] {
  const product = (code: string) => {
    const found = catalog.products.find((item) => item.code === code && item.selectable);
    if (!found) throw new Error(`Required canonical TEST product unavailable: ${code}`);
    return found;
  };
  const route = (key: string, system: "KL" | "WSL", suffix = "A"): ProjectRouteDraftV2 => {
    const straight = product(system === "KL" ? "KL 60.203" : "WSL 105.200");
    const template = catalog.assemblyTemplates.find((item) =>
      item.applicableSystems.includes(system)
    );
    if (!straight.selection || !straight.supplyOptions[0] || !template)
      throw new Error("Canonical TEST selection/template facts are incomplete");
    const component = (role: string) =>
      template.components.find((item) => item.role === role)?.productId ?? null;
    const keyPart = `${key}:${suffix}`;
    return {
      id: id(`${keyPart}:route`),
      code: `R-${suffix}`,
      name: `TEST ${system} route ${suffix}`,
      description:
        "Synthetic demonstration geometry with source-backed P0 materials; not an engineering design.",
      selection: {
        ...straight.selection,
        straightProductId: straight.id,
        defaultSupplyOptionId: straight.supplyOptions[0].id
      },
      startEndpoint: {
        id: id(`${keyPart}:start`),
        type: "freeEnd",
        selectedProductId: null,
        equipmentReference: null,
        customDescription: null
      },
      endEndpoint: {
        id: id(`${keyPart}:end`),
        type: "freeEnd",
        selectedProductId: null,
        equipmentReference: null,
        customDescription: null
      },
      geometry: [
        {
          id: id(`${keyPart}:straight`),
          kind: "straight",
          length: { value: "3", unit: "m" },
          supplyOptionId: straight.supplyOptions[0].id
        }
      ],
      supports: {
        spacing: { value: "1.5", unit: "m" },
        supportType: template.supportType,
        supportProductId: component("support"),
        assemblyTemplateId: template.id,
        levelCount: null,
        substrate: "concrete",
        anchorProductId: component("anchor"),
        anchorQuantityOverride: null,
        wstbProductId: component("wstb"),
        wstb: { mode: "one" },
        manualAdditionalSupports: [],
        templateManualValues: []
      }
    };
  };
  return stage11DemoCodes.map((key) => {
    // The parser creates mutable draft values locally; exported domain contracts remain readonly.
    const draft = ProjectDraftInputV2Schema.parse({
      code: `S11-DEMO-${key}`,
      name: `TEST demo v1 — ${key.toLowerCase()}`,
      description:
        "TEST demonstration only. Canonical 2022-p0 materials; unresolved engineering facts and warnings must be reviewed. No domain acceptance is implied.",
      defaultLocale: "bg",
      defaultReservePercent: key === "ROUNDING" ? "10" : "0",
      cableLoad: null,
      routes: [route(key, key === "WSL" ? "WSL" : "KL")],
      connections: [],
      accessoryProductIds: [],
      manualItems: []
    });
    const first = draft.routes[0]!;
    if (["CONTINUATION", "PHYSICAL", "TEE"].includes(key)) {
      const type =
        key === "CONTINUATION"
          ? "logicalContinuation"
          : key === "PHYSICAL"
            ? "physicalSplice"
            : "tee";
      first.endEndpoint.type = key === "PHYSICAL" ? "physicalSplice" : "routeContinuation";
      const others = (key === "TEE" ? ["B", "C"] : ["B"]).map(
        (suffix) =>
          ProjectDraftInputV2Schema.parse({ ...draft, routes: [route(key, "KL", suffix)] })
            .routes[0]!
      );
      for (const other of others) {
        other.startEndpoint.type = key === "PHYSICAL" ? "physicalSplice" : "routeContinuation";
        draft.routes.push(other);
      }
      draft.connections.push({
        id: id(`${key}:connection`),
        type,
        participants: [
          { routeId: first.id, endpointId: first.endEndpoint.id },
          ...others.map((other) => ({ routeId: other.id, endpointId: other.startEndpoint.id }))
        ],
        physicalBreak: type !== "logicalContinuation",
        supportBehavior: type === "logicalContinuation" ? "shared" : "separate",
        materialProductId: null,
        supportsBefore: { value: "0", unit: "pcs" },
        supportsAfter: { value: "0", unit: "pcs" },
        connectorCorrections: []
      });
    }
    if (key === "BEND")
      first.geometry.push({
        id: id(`${key}:bend`),
        kind: "fitting",
        fittingType: "horizontalBend",
        selectedProductId: null,
        supportedPhysicalLength: null,
        customDescription: null
      });
    if (key === "ENDS") {
      first.startEndpoint.type = "endCap";
      first.endEndpoint.type = "equipment";
      first.endEndpoint.equipmentReference = "TEST-DEMO-PANEL-01";
    }
    if (key === "SUPPORT") first.supports.spacing = { value: "1", unit: "m" };
    if (key === "ROUNDING") {
      const segment = first.geometry[0]!;
      if (segment.kind === "straight") segment.length = { value: "7", unit: "m" };
    }
    if (key === "CATALOG" || key === "TEXT") {
      const common = {
        id: id(`${key}:manual`),
        quantity: { value: "3", unit: "pcs" } as const,
        reason: "Explicit TEST demonstration requirement",
        note: "Manual line; verify the Manual provenance in the result.",
        reservePolicy: { mode: "projectDefault" } as const,
        quantityOverride: null
      };
      draft.manualItems.push(
        key === "CATALOG"
          ? {
              ...common,
              kind: "catalog",
              productId: product("KLTB 6 F").id,
              packagingPolicy: { mode: "catalogDefault" }
            }
          : {
              ...common,
              kind: "freeText",
              productId: null,
              productCode: null,
              descriptionEn: "TEST site supplied marker",
              packagingPolicy: { mode: "disabled", metadata: null }
            }
      );
    }
    return ProjectDraftInputV2Schema.parse(draft);
  });
}
