import { describe, expect, it } from "vitest";

import {
  capabilityTranslationKey,
  hasCapability,
  readOnlyProjectTranslationKey,
  revisionStatusTranslationKey,
  revisionUnavailableTranslationKey,
  roleTranslationKey
} from "./access-presentation";

describe("server-owned access presentation", () => {
  it("uses only capabilities returned by the server", () => {
    expect(hasCapability(["project:read"], "project:read")).toBe(true);
    expect(hasCapability(["project:read"], "project:edit")).toBe(false);
    expect(hasCapability([], "revision:approve")).toBe(false);
    expect(capabilityTranslationKey("revision:approve")).toBe("capabilityRevisionApprove");
  });

  it("localizes every canonical role without changing the identifier", () => {
    expect(roleTranslationKey("designer")).toBe("roleDesigner");
    expect(roleTranslationKey("reviewer")).toBe("roleReviewer");
    expect(roleTranslationKey("administrator")).toBe("roleAdministrator");
    expect(roleTranslationKey("viewer")).toBe("roleViewer");
  });

  it("maps lifecycle state and server-supplied unavailable reasons", () => {
    expect(revisionStatusTranslationKey("approved")).toBe("statusApproved");
    expect(revisionUnavailableTranslationKey("notLatestRevision")).toBe("supersededRevision");
    expect(revisionUnavailableTranslationKey("blockingWarnings")).toBe("approvalBlocked");
    expect(readOnlyProjectTranslationKey("viewer")).toBe("readOnlySession");
    expect(readOnlyProjectTranslationKey("reviewer")).toBe("reviewReadOnly");
  });
});
