import type { ProjectDraftInputV2, ProjectValidationResponseV2 } from "@niedax/domain";

export type ValidationEditorStep =
  "project" | "routes" | "geometry" | "connections" | "supports" | "load";

export function normalizeValidationPath(path: readonly (string | number)[]): string {
  const parts = [...path];
  while (["draft", "input", "project"].includes(String(parts[0]))) parts.shift();
  return parts.join(".");
}

export function validationFieldErrors(
  validation: ProjectValidationResponseV2 | null
): ReadonlyMap<string, string> {
  const errors = new Map<string, string>();
  for (const issue of validation?.blockingErrors ?? []) {
    const path = normalizeValidationPath(issue.path);
    if (path && !errors.has(path)) errors.set(path, issue.message);
  }
  return errors;
}

export function validationLocation(
  path: readonly (string | number)[],
  draft: ProjectDraftInputV2
): { readonly path: string; readonly step: ValidationEditorStep; readonly routeId: string | null } {
  const normalized = normalizeValidationPath(path);
  const parts = normalized.split(".");
  if (parts[0] === "routes") {
    const routeIndex = Number(parts[1]);
    const routeId = Number.isInteger(routeIndex) ? (draft.routes[routeIndex]?.id ?? null) : null;
    if (parts[2] === "geometry" || parts[2] === "startEndpoint" || parts[2] === "endEndpoint") {
      return { path: normalized, step: "geometry", routeId };
    }
    if (parts[2] === "supports") return { path: normalized, step: "supports", routeId };
    return { path: normalized, step: "routes", routeId };
  }
  if (parts[0] === "connections") return { path: normalized, step: "connections", routeId: null };
  if (["manualItems", "accessoryProductIds", "cableLoad"].includes(parts[0] ?? "")) {
    return { path: normalized, step: "load", routeId: null };
  }
  return { path: normalized, step: "project", routeId: null };
}
