import { describe, expect, it } from "vitest";

import { sessionIdentityMatches, sessionRequestIsCurrent } from "./session-state";

describe("session request isolation", () => {
  it("accepts only the latest session operation", () => {
    expect(sessionRequestIsCurrent(3, 3)).toBe(true);
    expect(sessionRequestIsCurrent(2, 3)).toBe(false);
  });

  it("ignores a delayed 401 from an older authenticated identity object", () => {
    const oldIdentity = { id: "same-user" };
    const currentIdentity = { id: "same-user" };

    expect(sessionIdentityMatches(currentIdentity, oldIdentity)).toBe(false);
    expect(sessionIdentityMatches(currentIdentity, currentIdentity)).toBe(true);
    expect(sessionIdentityMatches(currentIdentity)).toBe(true);
  });
});
