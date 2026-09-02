import { describe, expect, it } from "vitest";

import { addBusyUser, removeBusyUser, userMutationIsCurrent } from "./user-admin-state";

describe("user administration request state", () => {
  it("keeps another row busy when the first row completes", () => {
    let busy: ReadonlySet<string> = new Set();
    busy = addBusyUser(busy, "user-a");
    busy = addBusyUser(busy, "user-b");
    busy = removeBusyUser(busy, "user-a");

    expect([...busy]).toEqual(["user-b"]);
  });

  it("rejects an older response for the same user", () => {
    expect(userMutationIsCurrent(2, 1)).toBe(false);
    expect(userMutationIsCurrent(2, 2)).toBe(true);
  });
});
