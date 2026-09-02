import type { AppCapability, AppRole, ProjectAccessV2 } from "@niedax/domain";

export interface AuthorizationActor {
  readonly id: string;
  readonly role: AppRole;
}

export type ProjectResourceAction =
  "read" | "edit" | "validate" | "calculate" | "saveRevision" | "readHistory";

export type ProjectAccessScope = "all" | "owned" | "none";

export const CAPABILITIES_BY_ROLE = {
  designer: [
    "project:create",
    "project:read",
    "project:edit",
    "calculation:execute",
    "revision:save",
    "audit:read"
  ],
  reviewer: [
    "project:create",
    "project:read",
    "project:edit",
    "calculation:execute",
    "revision:save",
    "revision:check",
    "revision:approve",
    "audit:read"
  ],
  administrator: [
    "project:create",
    "project:read",
    "project:edit",
    "calculation:execute",
    "revision:save",
    "revision:check",
    "revision:approve",
    "users:administer",
    "catalog:administer",
    "audit:read"
  ],
  viewer: ["project:read", "audit:read"]
} as const satisfies Readonly<Record<AppRole, readonly AppCapability[]>>;

export function capabilitiesForRole(role: AppRole): readonly AppCapability[] {
  return CAPABILITIES_BY_ROLE[role];
}

export function hasCapability(role: AppRole, capability: AppCapability): boolean {
  return (CAPABILITIES_BY_ROLE[role] as readonly AppCapability[]).includes(capability);
}

export function projectAccessScope(
  role: AppRole,
  action: ProjectResourceAction
): ProjectAccessScope {
  if (action === "read" || action === "readHistory") {
    return role === "designer" ? "owned" : "all";
  }
  if (role === "administrator") return "all";
  if (role === "designer" || role === "reviewer") return "owned";
  return "none";
}

export function canAccessProject(
  actor: AuthorizationActor,
  ownerId: string | null,
  action: ProjectResourceAction
): boolean {
  const scope = projectAccessScope(actor.role, action);
  return scope === "all" || (scope === "owned" && ownerId === actor.id);
}

export function projectAccessFor(
  actor: AuthorizationActor,
  ownerId: string | null
): ProjectAccessV2 {
  return {
    canEditDraft: canAccessProject(actor, ownerId, "edit"),
    canValidate: canAccessProject(actor, ownerId, "validate"),
    canCalculate: canAccessProject(actor, ownerId, "calculate"),
    canSaveRevision: canAccessProject(actor, ownerId, "saveRevision"),
    canReadHistory: canAccessProject(actor, ownerId, "readHistory")
  };
}

export function canCreateProject(role: AppRole): boolean {
  return hasCapability(role, "project:create");
}

export function canCheckRevision(role: AppRole): boolean {
  return hasCapability(role, "revision:check");
}

export function canApproveRevision(role: AppRole): boolean {
  return hasCapability(role, "revision:approve");
}

export function canAdministerUsers(role: AppRole): boolean {
  return hasCapability(role, "users:administer");
}

export function canAdministerCatalog(role: AppRole): boolean {
  return hasCapability(role, "catalog:administer");
}
