import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { initialState, type PrototypeState } from "./prototype-data";
import {
  canAdvanceStep,
  connectionParticipantError,
  hasIncompleteGeometry,
  isExactCatalogSelection,
  isRouteCodeUnique,
  moveGeometryItem,
  projectValidation
} from "./prototype-logic";
import { sampleBomFixture } from "./prototype-result-fixture";

interface GoldenResultSubset {
  schemaVersion: string;
  engineVersion: string;
  formulaCatalogVersion: string;
  inputFingerprint: string;
  catalogSnapshot: { snapshotId: string; version: string; contentHash: string };
  ruleSnapshot: { snapshotId: string; version: string; contentHash: string };
  bomLines: Array<{
    id: string;
    category: string;
    productCode: string;
    descriptionEn: string;
    unit: string;
    technicalQuantity: { value: string };
    packageIncrement: { value: string; unit: string };
    packageCount: { value: string };
    orderedQuantity: { value: string };
    totalSpareQuantity: { value: string };
    status: string;
    warningIds: string[];
  }>;
  summary: {
    bomLineCount: number;
    warningCount: number;
    engineeringReviewRequired: boolean;
  };
}

function fixtureState(): PrototypeState {
  return JSON.parse(JSON.stringify(initialState)) as PrototypeState;
}

describe("prototype interaction contract", () => {
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

  it("requires an exact option from the active catalogue", () => {
    const state = fixtureState();
    const option = {
      id: "product-1",
      system: "KL",
      heightMm: 60,
      widthMm: 200,
      materialCode: "steel",
      finishCode: "S"
    } as const;

    expect(canAdvanceStep(1, state)).toBe(false);
    state.system = {
      seriesId: "KL",
      dimensionId: "60x200",
      finishId: "steel|S",
      variantId: "product-1"
    };
    expect(isExactCatalogSelection(state.system, [option], false)).toBe(false);
    expect(isExactCatalogSelection(state.system, [option], true)).toBe(true);
    expect(
      isExactCatalogSelection({ ...state.system, variantId: "different-product" }, [option], true)
    ).toBe(false);
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

  it("keeps the displayed sample aligned with its calculation-engine golden fixture", () => {
    const golden = JSON.parse(
      readFileSync(
        new URL(
          "../../../../packages/calculation-engine/tests/golden/expected/connected-routes-6m-support-continuation.json",
          import.meta.url
        ),
        "utf8"
      )
    ) as GoldenResultSubset;

    expect(sampleBomFixture.source).toContain("packages/calculation-engine/tests/golden/expected/");
    expect(sampleBomFixture).toMatchObject({
      schemaVersion: golden.schemaVersion,
      engineVersion: golden.engineVersion,
      formulaCatalogVersion: golden.formulaCatalogVersion,
      inputFingerprint: golden.inputFingerprint,
      catalogSnapshot: {
        id: golden.catalogSnapshot.snapshotId,
        version: golden.catalogSnapshot.version,
        contentHash: golden.catalogSnapshot.contentHash
      },
      ruleSnapshot: {
        id: golden.ruleSnapshot.snapshotId,
        version: golden.ruleSnapshot.version,
        contentHash: golden.ruleSnapshot.contentHash
      },
      summary: {
        bomLineCount: String(golden.summary.bomLineCount),
        warningCount: String(golden.summary.warningCount),
        engineeringReviewRequired: golden.summary.engineeringReviewRequired
      }
    });
    expect(sampleBomFixture.rows).toEqual(
      golden.bomLines.map((row) => ({
        id: row.id,
        category:
          row.category === "linearSection"
            ? "Linear section"
            : row.category === "endpointMaterial"
              ? "Endpoint material"
              : row.category[0]!.toUpperCase() + row.category.slice(1),
        productCode: row.productCode,
        description: row.descriptionEn,
        unit: row.unit,
        technicalQuantity: row.technicalQuantity.value,
        packageIncrement: `${row.packageIncrement.value} ${row.packageIncrement.unit}`,
        packageCount: row.packageCount.value,
        orderedQuantity: row.orderedQuantity.value,
        spareQuantity: row.totalSpareQuantity.value,
        status: row.status,
        warningCount: String(row.warningIds.length)
      }))
    );
  });
});
