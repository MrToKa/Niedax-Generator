import { describe, expect, it } from "vitest";

import { ApiError } from "./api-client";
import { workflowErrorKey } from "./workflow-error";

describe("workflow error presentation", () => {
  it.each([
    [403, "FORBIDDEN", "forbiddenAction"],
    [409, "CONFLICT_STALE_VERSION", "revisionConflict"],
    [409, "INVALID_STATE_TRANSITION", "invalidRevisionTransition"],
    [409, "IDEMPOTENCY_KEY_CONFLICT", "idempotencyConflict"],
    [400, "INVALID_USERNAME", "invalidUsername"],
    [400, "INVALID_DISPLAY_NAME", "invalidDisplayName"],
    [400, "WEAK_PASSWORD", "weakPassword"],
    [401, "AUTHENTICATION_REQUIRED", "sessionExpired"]
  ] as const)("maps authoritative server error %s/%s", (status, code, key) => {
    expect(workflowErrorKey(new ApiError(status, code, "correlation", null, "safe"))).toBe(key);
  });

  it("does not invent guidance for an unknown failure", () => {
    expect(workflowErrorKey(new Error("offline"))).toBeNull();
  });
});
