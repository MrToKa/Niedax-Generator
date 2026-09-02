import type { RevisionLifecycleEventV2 } from "@niedax/domain";

import { roleTranslationKey } from "./access-presentation";
import type { TranslationKey } from "./i18n";

export function auditActionKey(action: RevisionLifecycleEventV2["action"]): TranslationKey {
  switch (action) {
    case "revision.saved":
      return "auditRevisionSaved";
    case "revision.checked":
      return "auditRevisionChecked";
    case "revision.approved":
      return "auditRevisionApproved";
    case "revision.archived":
      return "auditRevisionArchived";
    case "revision.authorization_rejected":
      return "auditRevisionAuthorizationRejected";
    case "revision.transition_rejected":
      return "auditRevisionTransitionRejected";
  }
}

export function auditReasonKey(reasonCode: string): TranslationKey {
  switch (reasonCode) {
    case "FORBIDDEN":
      return "forbiddenAction";
    case "INVALID_STATE_TRANSITION":
      return "invalidRevisionTransition";
    case "CONFLICT_STALE_VERSION":
      return "revisionConflict";
    default:
      return "auditRejectedReason";
  }
}

export function lifecycleActorLabel(
  actor: RevisionLifecycleEventV2["actorSnapshot"],
  translate: (key: TranslationKey) => string
): string {
  return actor
    ? `${actor.displayName} · ${translate(roleTranslationKey(actor.role))}`
    : translate("auditActorUnavailable");
}
