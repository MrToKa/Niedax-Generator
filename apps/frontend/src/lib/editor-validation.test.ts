import type { ProjectValidationResponseV2 } from "@niedax/domain";
import { describe, expect, it } from "vitest";

import { createEmptyProjectDraft, createRouteDraft } from "./editor-state";
import {
  normalizeValidationPath,
  validationFieldErrors,
  validationLocation
} from "./editor-validation";

describe("validation issue routing", () => {
  it("normalizes transport prefixes and associates blocking errors", () => {
    const response = {
      blockingErrors: [
        {
          path: ["project", "routes", 0, "supports", "spacing"],
          code: "REQUIRED",
          message: "Required"
        }
      ]
    } as unknown as ProjectValidationResponseV2;
    expect(normalizeValidationPath(response.blockingErrors[0]!.path)).toBe(
      "routes.0.supports.spacing"
    );
    expect(validationFieldErrors(response).get("routes.0.supports.spacing")).toBe("Required");
  });

  it("selects the affected route and editor step", () => {
    const route = createRouteDraft("R-01", "Main", null);
    const draft = { ...createEmptyProjectDraft("P-01", "Plant"), routes: [route] };
    expect(validationLocation(["routes", 0, "geometry"], draft)).toEqual({
      path: "routes.0.geometry",
      step: "geometry",
      routeId: route.id
    });
    expect(validationLocation(["manualItems", 0, "quantity"], draft).step).toBe("load");
  });
});
