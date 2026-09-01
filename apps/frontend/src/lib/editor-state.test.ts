import type { EditorCatalogResponseV2, ProjectDraftInputV2 } from "@niedax/domain";
import { describe, expect, it } from "vitest";

import {
  canCalculateLocally,
  connectionParticipantCount,
  createEmptyProjectDraft,
  createRouteDraft,
  duplicateRoute,
  endpointTypeForConnection,
  isRouteCodeUnique,
  moveGeometry,
  projectDraftReducer,
  removeRouteAndReferences,
  validateDraftLocally
} from "./editor-state";

describe("project editor state", () => {
  it("maps connection cardinality and endpoint graph types", () => {
    expect(connectionParticipantCount("tee")).toBe(3);
    expect(connectionParticipantCount("custom")).toBe(2);
    expect(endpointTypeForConnection("logicalContinuation")).toBe("routeContinuation");
    expect(endpointTypeForConnection("physicalSplice")).toBe("physicalSplice");
  });

  it("uses explicit hydrate and update reducer transitions", () => {
    const initial = createEmptyProjectDraft("P-01", "Plant");
    const hydrated = projectDraftReducer(null, { type: "replace", draft: initial });
    const renamed = projectDraftReducer(hydrated, {
      type: "update",
      update: (current) => (current ? { ...current, name: "Renamed" } : current)
    });
    expect(renamed?.name).toBe("Renamed");
  });

  it("creates an autosave-safe incomplete route without engineering defaults", () => {
    const route = createRouteDraft("R-01", "Main", null);
    expect(route.supports.spacing).toBeNull();
    expect(route.supports.supportType).toBeNull();
    expect(route.supports.wstb).toBeNull();
    expect(route.selection.straightProductId).toBeNull();

    const draft = { ...createEmptyProjectDraft("P-01", "Plant"), routes: [route] };
    expect(validateDraftLocally(draft).validForSave).toBe(true);
  });

  it("checks route codes case-insensitively and generates independent duplicate IDs", () => {
    const route = createRouteDraft("R-01", "Main", null);
    const draft = { ...createEmptyProjectDraft("P-01", "Plant"), routes: [route] };
    expect(isRouteCodeUnique(draft.routes, " r-01 ")).toBe(false);

    const duplicated = duplicateRoute(draft, route.id)!;
    const copy = duplicated.draft.routes[1]!;
    expect(copy.id).not.toBe(route.id);
    expect(copy.startEndpoint.id).not.toBe(route.startEndpoint.id);
    expect(copy.code).toBe("R-01-COPY");
  });

  it("removes connections that refer to a deleted route", () => {
    const left = createRouteDraft("LEFT", "Left", null);
    const right = createRouteDraft("RIGHT", "Right", null);
    const draft: ProjectDraftInputV2 = {
      ...createEmptyProjectDraft("P-01", "Plant"),
      routes: [left, right],
      connections: [
        {
          id: crypto.randomUUID(),
          type: "logicalContinuation",
          participants: [
            { routeId: left.id, endpointId: left.endEndpoint.id },
            { routeId: right.id, endpointId: right.startEndpoint.id }
          ],
          physicalBreak: false,
          supportBehavior: "shared",
          materialProductId: null,
          supportsBefore: { value: "0", unit: "pcs" },
          supportsAfter: { value: "0", unit: "pcs" },
          connectorCorrections: []
        }
      ]
    };

    const next = removeRouteAndReferences(draft, left.id);
    expect(next.routes.map((route) => route.id)).toEqual([right.id]);
    expect(next.connections).toEqual([]);
  });

  it("reorders geometry without changing stable item IDs", () => {
    const route = createRouteDraft("R-01", "Main", null);
    const withGeometry = {
      ...route,
      geometry: [
        {
          id: crypto.randomUUID(),
          kind: "straight" as const,
          length: { value: "1", unit: "m" as const },
          supplyOptionId: null
        },
        {
          id: crypto.randomUUID(),
          kind: "straight" as const,
          length: { value: "2", unit: "m" as const },
          supplyOptionId: null
        }
      ]
    };
    const moved = moveGeometry(withGeometry, withGeometry.geometry[1]!.id, -1);
    expect(moved.geometry.map((item) => item.id)).toEqual([
      withGeometry.geometry[1]!.id,
      withGeometry.geometry[0]!.id
    ]);
  });

  it("keeps Calculate blocked until authoritative support selections are complete", () => {
    const route = createRouteDraft("R-CALC", "Ready route", null);
    const templateId = crypto.randomUUID();
    const noWstbCatalog = {
      products: [],
      assemblyTemplates: [
        {
          id: templateId,
          supportType: "ceiling",
          applicableSystems: ["KL"],
          components: []
        }
      ]
    } as unknown as EditorCatalogResponseV2;
    const incomplete = {
      ...createEmptyProjectDraft("P-CALC", "Calculation readiness"),
      routes: [
        {
          ...route,
          selection: {
            system: "KL",
            dimensionId: "dimension:KL:60x200",
            width: { value: "200", unit: "mm" as const },
            height: { value: "60", unit: "mm" as const },
            materialCode: "steel",
            finishCode: "hotDipGalvanized",
            straightProductId: crypto.randomUUID(),
            defaultSupplyOptionId: "supply:3000"
          },
          geometry: [
            {
              id: crypto.randomUUID(),
              kind: "straight" as const,
              length: { value: "2", unit: "m" as const },
              supplyOptionId: null
            }
          ],
          supports: {
            ...route.supports,
            spacing: { value: "1", unit: "m" as const },
            assemblyTemplateId: templateId
          }
        }
      ]
    };
    expect(canCalculateLocally(incomplete, noWstbCatalog)).toBe(false);
    expect(
      canCalculateLocally(
        {
          ...incomplete,
          routes: incomplete.routes.map((value) => ({
            ...value,
            supports: {
              ...value.supports,
              supportType: "ceiling" as const,
              substrate: "concrete" as const,
              anchorProductId: crypto.randomUUID(),
              wstbProductId: null,
              wstb: { mode: "one" as const }
            }
          }))
        },
        noWstbCatalog
      )
    ).toBe(true);
  });

  it("requires the exact WSTB template product and every per-level/manual input", () => {
    const route = createRouteDraft("R-WSTB", "Template route", null);
    const templateId = crypto.randomUUID();
    const wstbProductId = crypto.randomUUID();
    const wstbComponentId = crypto.randomUUID();
    const levelComponentId = crypto.randomUUID();
    const manualComponentId = crypto.randomUUID();
    const catalog = {
      products: [{ id: wstbProductId, active: true, selectable: true }],
      assemblyTemplates: [
        {
          id: templateId,
          supportType: "ceiling",
          applicableSystems: ["KL"],
          components: [
            { id: wstbComponentId, productId: wstbProductId, role: "wstb", quantityMode: "fixed" },
            { id: levelComponentId, role: "support", quantityMode: "perLevel" },
            {
              id: manualComponentId,
              role: "accessory",
              quantityMode: "manual",
              quantity: { value: "1", unit: "pcs" }
            }
          ]
        }
      ]
    } as unknown as EditorCatalogResponseV2;
    const readyBase: ProjectDraftInputV2 = {
      ...createEmptyProjectDraft("P-WSTB", "Template readiness"),
      routes: [
        {
          ...route,
          selection: {
            system: "KL",
            dimensionId: "dimension:KL:60x200",
            width: { value: "200", unit: "mm" },
            height: { value: "60", unit: "mm" },
            materialCode: "steel",
            finishCode: "hotDipGalvanized",
            straightProductId: crypto.randomUUID(),
            defaultSupplyOptionId: "supply:3000"
          },
          geometry: [
            {
              id: crypto.randomUUID(),
              kind: "straight",
              length: { value: "2", unit: "m" },
              supplyOptionId: null
            }
          ],
          supports: {
            ...route.supports,
            spacing: { value: "1", unit: "m" },
            supportType: "ceiling",
            assemblyTemplateId: templateId,
            substrate: "concrete",
            anchorProductId: crypto.randomUUID(),
            wstbProductId,
            wstb: { mode: "two" },
            levelCount: { value: "2", unit: "pcs" },
            templateManualValues: [
              {
                componentId: manualComponentId,
                quantity: { value: "3", unit: "pcs" },
                metadata: { overrideId: crypto.randomUUID(), reason: "Design input", note: null }
              }
            ]
          }
        }
      ]
    };
    expect(canCalculateLocally(readyBase, catalog)).toBe(true);
    expect(
      canCalculateLocally(
        {
          ...readyBase,
          routes: readyBase.routes.map((value) => ({
            ...value,
            supports: { ...value.supports, wstbProductId: crypto.randomUUID() }
          }))
        },
        catalog
      )
    ).toBe(false);
  });
});
