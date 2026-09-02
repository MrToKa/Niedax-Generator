import { describe, expect, it } from "vitest";

import { APP_CAPABILITIES, APP_ROLES, type AppCapability, type AppRole } from "@niedax/domain";

import {
  canAccessProject,
  capabilitiesForRole,
  hasCapability,
  projectAccessFor,
  type ProjectResourceAction
} from "../src/authorization-policy.js";

const capabilityMatrix: Readonly<Record<AppRole, readonly AppCapability[]>> = {
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
  administrator: [...APP_CAPABILITIES],
  viewer: ["project:read", "audit:read"]
};

describe("Stage 8 centralized authorization policy", () => {
  it.each(
    APP_ROLES.flatMap((role) => APP_CAPABILITIES.map((capability) => [role, capability] as const))
  )("maps %s / %s explicitly", (role, capability) => {
    expect(hasCapability(role, capability)).toBe(capabilityMatrix[role].includes(capability));
    expect(capabilitiesForRole(role)).toEqual(capabilityMatrix[role]);
  });

  const resourceCases: readonly [AppRole, ProjectResourceAction, boolean, boolean][] = [
    ["designer", "read", true, false],
    ["designer", "edit", true, false],
    ["designer", "validate", true, false],
    ["designer", "calculate", true, false],
    ["designer", "saveRevision", true, false],
    ["designer", "readHistory", true, false],
    ["reviewer", "read", true, true],
    ["reviewer", "edit", true, false],
    ["reviewer", "validate", true, false],
    ["reviewer", "calculate", true, false],
    ["reviewer", "saveRevision", true, false],
    ["reviewer", "readHistory", true, true],
    ["administrator", "read", true, true],
    ["administrator", "edit", true, true],
    ["administrator", "validate", true, true],
    ["administrator", "calculate", true, true],
    ["administrator", "saveRevision", true, true],
    ["administrator", "readHistory", true, true],
    ["viewer", "read", true, true],
    ["viewer", "edit", false, false],
    ["viewer", "validate", false, false],
    ["viewer", "calculate", false, false],
    ["viewer", "saveRevision", false, false],
    ["viewer", "readHistory", true, true]
  ];

  it.each(resourceCases)(
    "%s %s access is own=%s other=%s",
    (role, action, ownAllowed, otherAllowed) => {
      const actor = { id: "actor-1", role };
      expect(canAccessProject(actor, actor.id, action)).toBe(ownAllowed);
      expect(canAccessProject(actor, "actor-2", action)).toBe(otherAllowed);
    }
  );

  it("provides backend-derived project action hints", () => {
    expect(projectAccessFor({ id: "reviewer-1", role: "reviewer" }, "owner-2")).toEqual({
      canEditDraft: false,
      canValidate: false,
      canCalculate: false,
      canSaveRevision: false,
      canReadHistory: true
    });
    expect(projectAccessFor({ id: "viewer-1", role: "viewer" }, "viewer-1")).toEqual({
      canEditDraft: false,
      canValidate: false,
      canCalculate: false,
      canSaveRevision: false,
      canReadHistory: true
    });
  });
});
