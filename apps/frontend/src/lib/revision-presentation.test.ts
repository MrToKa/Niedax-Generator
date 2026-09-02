import type { RevisionActorSnapshotV2 } from "@niedax/domain";
import { describe, expect, it } from "vitest";

import type { TranslationKey } from "./i18n";
import { auditActionKey, auditReasonKey, lifecycleActorLabel } from "./revision-presentation";

describe("revision lifecycle presentation", () => {
  it.each([
    ["revision.saved", "auditRevisionSaved"],
    ["revision.checked", "auditRevisionChecked"],
    ["revision.approved", "auditRevisionApproved"],
    ["revision.archived", "auditRevisionArchived"],
    ["revision.authorization_rejected", "auditRevisionAuthorizationRejected"],
    ["revision.transition_rejected", "auditRevisionTransitionRejected"]
  ] as const)("maps %s to localized copy", (action, key) => {
    expect(auditActionKey(action)).toBe(key);
  });

  it("uses a localized fallback when rejected evidence has no actor", () => {
    expect(lifecycleActorLabel(null, fakeTranslate)).toBe("translated:auditActorUnavailable");
  });

  it("renders only the bounded actor snapshot fields", () => {
    const actor: RevisionActorSnapshotV2 = {
      id: "11111111-1111-4111-8111-111111111111",
      username: "stage8.reviewer",
      displayName: "Stage 8 Reviewer",
      role: "reviewer"
    };

    expect(lifecycleActorLabel(actor, fakeTranslate)).toBe(
      "Stage 8 Reviewer · translated:roleReviewer"
    );
  });

  it("does not expose an unknown raw rejection code", () => {
    expect(auditReasonKey("UNTRUSTED_<script>alert(1)</script>")).toBe("auditRejectedReason");
    expect(auditReasonKey("FORBIDDEN")).toBe("forbiddenAction");
  });
});

function fakeTranslate(key: TranslationKey): string {
  return `translated:${key}`;
}
