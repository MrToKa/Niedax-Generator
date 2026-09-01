import type {
  EditorCatalogResponseV2,
  ProjectDraftInputV2,
  ProjectRouteDraftV2
} from "@niedax/domain";
import { describe, expect, it } from "vitest";

import {
  compatibleProducts,
  compatibleTemplateProducts,
  isSameCatalogContext,
  reconcileProjectDraftCatalog,
  reconcileRouteCatalog,
  reconcileStraightSelection,
  selectStraightProduct,
  templateComponentProducts
} from "./catalog-selection";

const selection = {
  system: "MKS",
  dimensionId: "100x60",
  width: { value: "100", unit: "mm" },
  height: { value: "60", unit: "mm" },
  materialCode: "S",
  finishCode: "F"
} as const;

const catalog = {
  schemaVersion: "editor-catalog-response/v2",
  correlationId: "catalog-selection-test",
  catalogSnapshot: {
    snapshotId: "catalog-a",
    version: "2022-p0",
    contentHash: `sha256:${"1".repeat(64)}`
  },
  ruleSnapshot: {
    snapshotId: "rules-a",
    version: "2022-p0",
    contentHash: `sha256:${"2".repeat(64)}`
  },
  products: [
    {
      id: "straight-a",
      role: "straightSection",
      selectable: true,
      active: true,
      selection,
      supplyOptions: [
        { id: "supply-a", active: true, orderable: true, length: { value: "3", unit: "m" } }
      ]
    },
    {
      id: "support-template",
      role: "support",
      selectable: true,
      active: true,
      selection: null,
      supplyOptions: []
    },
    {
      id: "anchor-concrete",
      role: "anchor",
      selectable: true,
      active: true,
      selection: null,
      supplyOptions: []
    },
    {
      id: "anchor-concrete-not-in-template",
      role: "anchor",
      selectable: true,
      active: true,
      selection: null,
      supplyOptions: []
    },
    {
      id: "wstb-template",
      role: "wstb",
      selectable: true,
      active: true,
      selection: null,
      supplyOptions: []
    },
    {
      id: "wstb-other",
      role: "wstb",
      selectable: true,
      active: true,
      selection: null,
      supplyOptions: []
    },
    {
      id: "support-other",
      role: "support",
      selectable: true,
      active: true,
      selection: null,
      supplyOptions: []
    }
  ],
  assemblyTemplates: [
    {
      id: "template-a",
      supportType: "wall",
      applicableSystems: ["MKS"],
      components: [
        {
          id: "component-a",
          productId: "support-template",
          role: "support",
          quantityMode: "perLevel",
          quantity: { value: "1", unit: "pcs" }
        },
        {
          id: "component-anchor",
          productId: "anchor-concrete",
          role: "anchor",
          quantityMode: "fixed",
          quantity: { value: "1", unit: "pcs" }
        },
        {
          id: "component-wstb",
          productId: "wstb-template",
          role: "wstb",
          quantityMode: "fixed",
          quantity: { value: "1", unit: "pcs" }
        },
        {
          id: "component-manual",
          productId: "support-template",
          role: "accessory",
          quantityMode: "manual",
          quantity: { value: "1", unit: "pcs" }
        }
      ]
    }
  ],
  compatibilityRelations: [
    {
      context: "anchor",
      subjectProductId: null,
      productId: "anchor-concrete",
      allowed: true,
      substrate: "concrete"
    },
    {
      context: "anchor",
      subjectProductId: null,
      productId: "anchor-concrete-not-in-template",
      allowed: true,
      substrate: "concrete"
    }
  ]
} as unknown as EditorCatalogResponseV2;

function routeFixture(): ProjectRouteDraftV2 {
  return {
    id: "route-a",
    code: "R-A",
    name: "Route A",
    description: null,
    selection: {
      ...selection,
      straightProductId: "straight-a",
      defaultSupplyOptionId: "supply-a"
    },
    startEndpoint: {
      id: "endpoint-start",
      type: "freeEnd",
      selectedProductId: null,
      equipmentReference: null,
      customDescription: null
    },
    endEndpoint: {
      id: "endpoint-end",
      type: "freeEnd",
      selectedProductId: null,
      equipmentReference: null,
      customDescription: null
    },
    geometry: [
      {
        id: "segment-a",
        kind: "straight",
        length: { value: "2", unit: "m" },
        supplyOptionId: "supply-a"
      }
    ],
    supports: {
      spacing: { value: "1", unit: "m" },
      supportType: "wall",
      supportProductId: "support-template",
      assemblyTemplateId: "template-a",
      levelCount: { value: "2", unit: "pcs" },
      substrate: "concrete",
      anchorProductId: "anchor-concrete",
      anchorQuantityOverride: null,
      wstbProductId: "wstb-template",
      wstb: { mode: "two" },
      manualAdditionalSupports: [],
      templateManualValues: [
        {
          componentId: "component-manual",
          quantity: { value: "2", unit: "pcs" },
          metadata: { overrideId: "override-a", reason: "Design input", note: null }
        }
      ]
    }
  } as unknown as ProjectRouteDraftV2;
}

describe("catalog-dependent selection", () => {
  it("compares both pinned catalog and rule snapshot identities", () => {
    expect(isSameCatalogContext(catalog, catalog)).toBe(true);
    expect(
      isSameCatalogContext(catalog, {
        ...catalog,
        ruleSnapshot: { ...catalog.ruleSnapshot, snapshotId: "rules-b" }
      })
    ).toBe(false);
  });

  it("requires an exact subject and substrate compatibility fact", () => {
    expect(compatibleProducts(catalog, "anchor", null, "anchor", "concrete")).toHaveLength(2);
    expect(compatibleProducts(catalog, "anchor", null, "anchor", "steel")).toHaveLength(0);
    expect(compatibleProducts(catalog, "anchor", "straight-a", "anchor", "concrete")).toHaveLength(
      0
    );
  });

  it("derives fallback choices only from explicit template components", () => {
    expect(
      templateComponentProducts(catalog, "template-a", "support").map((item) => item.id)
    ).toEqual(["support-template"]);
    expect(templateComponentProducts(catalog, "missing", "support")).toEqual([]);
  });

  it("intersects substrate evidence with the selected template components", () => {
    expect(
      compatibleTemplateProducts(catalog, "template-a", "anchor", "anchor", null, "concrete").map(
        (item) => item.id
      )
    ).toEqual(["anchor-concrete"]);
  });

  it("never silently chooses a supply option", () => {
    const product = catalog.products[0]!;
    const selected = selectStraightProduct(product, null);
    expect(selected.straightProductId).toBe("straight-a");
    expect(selected.defaultSupplyOptionId).toBeNull();
  });

  it("clears dependent values that are no longer compatible", () => {
    const current: ProjectRouteDraftV2["selection"] = {
      ...selection,
      materialCode: "missing",
      finishCode: "old",
      straightProductId: "straight-a",
      defaultSupplyOptionId: "supply-a"
    };
    const reconciled = reconcileStraightSelection(current, catalog);
    expect(reconciled.selection.materialCode).toBeNull();
    expect(reconciled.selection.finishCode).toBeNull();
    expect(reconciled.selection.straightProductId).toBeNull();
    expect(reconciled.selection.defaultSupplyOptionId).toBeNull();
  });

  it("preserves a fully valid hydrated route without replacing any selection", () => {
    const current = routeFixture();
    const reconciled = reconcileRouteCatalog(current, catalog);
    expect(reconciled.cleared).toEqual([]);
    expect(reconciled.route).toEqual(current);
  });

  it("clears invalid segment and exact-template members without substituting alternatives", () => {
    const current = routeFixture();
    const reconciled = reconcileRouteCatalog(
      {
        ...current,
        geometry: current.geometry.map((item) =>
          item.kind === "straight" ? { ...item, supplyOptionId: "retired-supply" } : item
        ),
        supports: {
          ...current.supports,
          supportProductId: "support-other",
          anchorProductId: "anchor-concrete-not-in-template",
          wstbProductId: "wstb-other",
          templateManualValues: [
            {
              componentId: "retired-component",
              quantity: { value: "2", unit: "pcs" },
              metadata: { overrideId: "override-b", reason: "Old input", note: null }
            }
          ]
        }
      },
      catalog
    );
    expect(reconciled.route.geometry[0]).toMatchObject({ supplyOptionId: null });
    expect(reconciled.route.supports.supportProductId).toBeNull();
    expect(reconciled.route.supports.anchorProductId).toBeNull();
    expect(reconciled.route.supports.wstbProductId).toBeNull();
    expect(reconciled.route.supports.levelCount).toEqual({ value: "2", unit: "pcs" });
    expect(reconciled.route.supports.templateManualValues).toEqual([]);
    expect(reconciled.cleared).toContain("supports.wstbProductId");
  });

  it("keeps WSTB behavior but clears its product when the exact template has no WSTB component", () => {
    const catalogWithoutWstb = {
      ...catalog,
      assemblyTemplates: catalog.assemblyTemplates.map((template) => ({
        ...template,
        components: template.components.filter((component) => component.role !== "wstb")
      }))
    } as EditorCatalogResponseV2;
    const reconciled = reconcileRouteCatalog(routeFixture(), catalogWithoutWstb);
    expect(reconciled.route.supports.wstbProductId).toBeNull();
    expect(reconciled.route.supports.wstb).toEqual({ mode: "two" });
    expect(reconciled.cleared).toContain("supports.wstbProductId");
  });

  it("clears an invalid tuple and template dependency graph across hydration", () => {
    const current = routeFixture();
    const invalidRoute: ProjectRouteDraftV2 = {
      ...current,
      selection: {
        ...current.selection,
        system: "RETIRED"
      }
    };
    const draft = { routes: [invalidRoute] } as unknown as ProjectDraftInputV2;
    const reconciled = reconcileProjectDraftCatalog(draft, catalog);
    const route = reconciled.draft.routes[0]!;
    expect(route.selection).toEqual({
      system: null,
      dimensionId: null,
      width: null,
      height: null,
      materialCode: null,
      finishCode: null,
      straightProductId: null,
      defaultSupplyOptionId: null
    });
    expect(route.geometry[0]).toMatchObject({ supplyOptionId: null });
    expect(route.supports.assemblyTemplateId).toBeNull();
    expect(route.supports.supportProductId).toBeNull();
    expect(route.supports.anchorProductId).toBeNull();
    expect(route.supports.wstbProductId).toBeNull();
    expect(route.supports.levelCount).toBeNull();
    expect(route.supports.templateManualValues).toEqual([]);
    expect(reconciled.cleared).toContain("routes.0.selection.system");
  });
});
