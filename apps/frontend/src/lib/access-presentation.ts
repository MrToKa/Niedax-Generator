import type {
  AppCapability,
  AppRole,
  ProjectRevisionStatusV2,
  RevisionActionAvailabilityV2
} from "@niedax/domain";

import type { TranslationKey } from "./i18n";

export function hasCapability(
  capabilities: readonly AppCapability[],
  capability: AppCapability
): boolean {
  return capabilities.includes(capability);
}

export function roleTranslationKey(role: AppRole): TranslationKey {
  switch (role) {
    case "designer":
      return "roleDesigner";
    case "reviewer":
      return "roleReviewer";
    case "administrator":
      return "roleAdministrator";
    case "viewer":
      return "roleViewer";
  }
}

export function capabilityTranslationKey(capability: AppCapability): TranslationKey {
  switch (capability) {
    case "project:create":
      return "capabilityProjectCreate";
    case "project:read":
      return "capabilityProjectRead";
    case "project:edit":
      return "capabilityProjectEdit";
    case "calculation:execute":
      return "capabilityCalculationExecute";
    case "revision:save":
      return "capabilityRevisionSave";
    case "revision:check":
      return "capabilityRevisionCheck";
    case "revision:approve":
      return "capabilityRevisionApprove";
    case "users:administer":
      return "capabilityUsersAdminister";
    case "catalog:administer":
      return "capabilityCatalogAdminister";
    case "audit:read":
      return "capabilityAuditRead";
  }
}

export function revisionStatusTranslationKey(status: ProjectRevisionStatusV2): TranslationKey {
  switch (status) {
    case "calculated":
      return "statusCalculated";
    case "checked":
      return "statusChecked";
    case "approved":
      return "statusApproved";
    case "archived":
      return "statusArchived";
  }
}

export function revisionUnavailableTranslationKey(
  reason: NonNullable<RevisionActionAvailabilityV2["reason"]>
): TranslationKey {
  switch (reason) {
    case "notAuthorized":
      return "actionUnavailable";
    case "notLatestRevision":
      return "supersededRevision";
    case "invalidStatus":
      return "invalidRevisionTransition";
    case "approvalNotReady":
    case "blockingWarnings":
      return "approvalBlocked";
    case "unsupportedVersion":
      return "unsupportedRevisionVersion";
  }
}

export function readOnlyProjectTranslationKey(role: AppRole | null): TranslationKey {
  return role === "viewer" ? "readOnlySession" : "reviewReadOnly";
}
