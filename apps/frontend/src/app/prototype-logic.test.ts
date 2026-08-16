import { describe, expect, it } from "vitest";

import {
  calculateMockBom,
  canAdvanceStep,
  connectionParticipantError,
  endpointEffect,
  hasIncompleteGeometry,
  isRouteCodeUnique,
  moveGeometryItem,
  projectValidation,
  selectSeries
} from "./prototype-logic";
import { initialState, type PrototypeState } from "./prototype-data";

function fixtureState(): PrototypeState {
  return JSON.parse(JSON.stringify(initialState)) as PrototypeState;
}

describe("Stage 2 prototype interaction contract", () => {
  it("blocks wizard advancement for required project fields and invalid reserve", () => {
    const state = fixtureState();
    state.project.code = "";
    state.project.defaultReservePercent = -1;
    expect(projectValidation(state.project)).toEqual(["projectCodeRequired", "reserveRange"]);
    expect(canAdvanceStep(0, state)).toBe(false);
  });

  it("rejects duplicate user-facing route codes without coupling identity to the name", () => {
    const state = fixtureState();
    expect(isRouteCodeUnique(state.routes, "r-01")).toBe(false);
    expect(isRouteCodeUnique(state.routes, "R-01", "route-a")).toBe(true);
    expect(isRouteCodeUnique(state.routes, "R-03")).toBe(true);
  });

  it("preserves valid dependent choices and clears incompatible ones without substitution", () => {
    const state = fixtureState();
    const sameSeries = selectSeries(state.system, "series-f");
    expect(sameSeries.selection).toEqual(state.system);
    expect(sameSeries.cleared).toEqual([]);

    const changedSeries = selectSeries(state.system, "series-e3");
    expect(changedSeries.selection.seriesId).toBe("series-e3");
    expect(changedSeries.selection.finishId).toBe("finish-e3");
    expect(changedSeries.selection.dimensionId).toBeNull();
    expect(changedSeries.selection.variantId).toBeNull();
    expect(changedSeries.cleared).toEqual(["dimension", "variant"]);
  });

  it("makes endpoint material behavior explicit and keeps logical continuation material-free", () => {
    expect(endpointEffect("free", false).material).toBe("none");
    expect(endpointEffect("continuation", false).material).toBe("none");
    expect(endpointEffect("splice", false).material).toBe("unresolved");
    expect(endpointEffect("custom", false).material).toBe("manual");
  });

  it("accepts two endpoints normally, three for a T, and prevents self-connections", () => {
    expect(connectionParticipantError("splice", ["route-a:end", "route-b:start"])).toBeNull();
    expect(
      connectionParticipantError("tee", ["route-a:end", "route-b:start", "route-c:start"])
    ).toBeNull();
    expect(connectionParticipantError("tee", ["route-a:end", "route-b:start"])).toBe(
      "participantCount"
    );
    expect(connectionParticipantError("splice", ["route-a:start", "route-a:end"])).toBe(
      "selfConnection"
    );
  });

  it("reorders geometry deterministically and flags zero-length geometry", () => {
    const state = fixtureState();
    const route = state.routes[0]!;
    const moved = moveGeometryItem(route.geometry, "geometry-a2", -1);
    expect(moved.map((item) => item.id)).toEqual(["geometry-a2", "geometry-a1", "geometry-a3"]);
    expect(route.geometry.map((item) => item.id)).toEqual([
      "geometry-a1",
      "geometry-a2",
      "geometry-a3"
    ]);
    expect(
      hasIncompleteGeometry({
        ...route,
        geometry: [{ id: "invalid", kind: "straight", lengthM: 0 }]
      })
    ).toBe(true);
  });

  it("keeps the approved 6 m and WSTB defaults visible in fixture state", () => {
    const state = fixtureState();
    expect(state.routes.every((route) => route.sectionLengthM === 6)).toBe(true);
    expect(state.supports.wstbMode).toBe("two");
  });

  it("applies linear reserve after required-section rounding", () => {
    const state = fixtureState();
    const linear = calculateMockBom(state).find((row) => row.id === "bom-linear-6")!;
    expect(linear.technicalQuantity).toBe(5);
    expect(linear.orderQuantity).toBe(6);
    expect(linear.spareQuantity).toBe(1);
    expect(linear.productCode).toBeNull();
  });

  it("keeps 3 m and 6 m route section calculations separate", () => {
    const state = fixtureState();
    state.routes[1]!.sectionLengthM = 3;
    const rows = calculateMockBom(state);
    const sixMetre = rows.find((row) => row.id === "bom-linear-6")!;
    const threeMetre = rows.find((row) => row.id === "bom-linear-3")!;
    expect(sixMetre.technicalQuantity).toBe(4);
    expect(threeMetre.technicalQuantity).toBe(4);
  });

  it("carries an explicit manual connection product into the mock BOM", () => {
    const state = fixtureState();
    state.connections[0]!.manualProduct = "Connection review item";
    state.connections[0]!.manualProductQuantity = 2;
    const row = calculateMockBom(state).find((item) => item.id === "bom-connection-01-manual")!;
    expect(row.description).toBe("Connection review item");
    expect(row.status).toBe("manual");
    expect(row.manualOverride).toBe(true);
  });

  it("keeps manual reserve and packaging rounding behavior row-specific", () => {
    const state = fixtureState();
    state.load.manualItems = [
      {
        id: "manual-packaging",
        kind: "freeText",
        productCode: "",
        description: "Fixture item",
        quantity: 11,
        unit: "pcs",
        reason: "Interaction test",
        note: "",
        reserveBehavior: "custom",
        reservePercent: 10,
        packagingRounding: "on",
        packageSize: 5,
        manuallyAdjusted: true
      }
    ];
    const row = calculateMockBom(state).find((item) => item.id === "bom-manual-packaging")!;
    expect(row.packageCount).toBe(3);
    expect(row.orderQuantity).toBe(15);
    expect(row.spareQuantity).toBe(4);
    expect(row.manualOverride).toBe(true);
    expect(row.status).toBe("manual");
  });

  it("localizes explanations while keeping the English export description fixed", () => {
    const state = fixtureState();
    const en = calculateMockBom(state, "en").find((row) => row.id === "bom-linear-6")!;
    const bg = calculateMockBom(state, "bg").find((row) => row.id === "bom-linear-6")!;
    expect(bg.description).toBe(en.description);
    expect(bg.why[0]).not.toBe(en.why[0]);
  });
});
