import {
  type ConnectionType,
  type GeometryItem,
  type PrototypeState,
  type Route
} from "./prototype-data";

interface CatalogOptionIdentity {
  readonly id: string;
  readonly system: string;
  readonly heightMm: number;
  readonly widthMm: number;
  readonly materialCode: string;
  readonly finishCode: string;
}

export function isRouteCodeUnique(routes: Route[], code: string, currentRouteId?: string) {
  const normalized = code.trim().toLocaleUpperCase("en-US");
  return (
    normalized.length > 0 &&
    !routes.some(
      (route) =>
        route.id !== currentRouteId && route.code.trim().toLocaleUpperCase("en-US") === normalized
    )
  );
}

export function projectValidation(project: PrototypeState["project"]) {
  const errors: string[] = [];
  if (!project.code.trim()) errors.push("projectCodeRequired");
  if (!project.name.trim()) errors.push("projectNameRequired");
  if (
    !Number.isFinite(project.defaultReservePercent) ||
    project.defaultReservePercent < 0 ||
    project.defaultReservePercent > 100
  )
    errors.push("reserveRange");
  return errors;
}

export function canAdvanceStep(step: number, state: PrototypeState) {
  if (step === 0) return projectValidation(state.project).length === 0;
  if (step === 1) return Object.values(state.system).every((value) => Boolean(value));
  if (step === 2) {
    if (
      state.routes.length === 0 ||
      state.routes.some(
        (route) =>
          !route.code.trim() ||
          !route.name.trim() ||
          !route.description.trim() ||
          hasIncompleteGeometry(route)
      )
    )
      return false;
    const normalizedCodes = state.routes.map((route) =>
      route.code.trim().toLocaleUpperCase("en-US")
    );
    return new Set(normalizedCodes).size === normalizedCodes.length;
  }
  if (step === 3) return state.supports.spacingM > 0 && state.supports.anchorsPerMountingPoint > 0;
  return true;
}

export function isExactCatalogSelection(
  selection: PrototypeState["system"],
  options: readonly CatalogOptionIdentity[],
  catalogIsActive: boolean
) {
  if (
    !catalogIsActive ||
    !selection.seriesId ||
    !selection.dimensionId ||
    !selection.finishId ||
    !selection.variantId
  ) {
    return false;
  }
  return options.some(
    (option) =>
      option.id === selection.variantId &&
      option.system === selection.seriesId &&
      `${option.heightMm}x${option.widthMm}` === selection.dimensionId &&
      `${option.materialCode}|${option.finishCode}` === selection.finishId
  );
}

export function connectionParticipantError(type: ConnectionType, participants: string[]) {
  const requiredCount = type === "tee" ? 3 : 2;
  if (participants.length !== requiredCount || participants.some((participant) => !participant)) {
    return "participantCount" as const;
  }
  const routeIds = participants.map((participant) => participant.split(":")[0]);
  if (
    new Set(participants).size !== participants.length ||
    new Set(routeIds).size !== routeIds.length
  ) {
    return "selfConnection" as const;
  }
  return null;
}

export function moveGeometryItem(items: GeometryItem[], itemId: string, direction: -1 | 1) {
  const index = items.findIndex((item) => item.id === itemId);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= items.length) return items;
  const next = [...items];
  const currentItem = next[index]!;
  next[index] = next[nextIndex]!;
  next[nextIndex] = currentItem;
  return next;
}

export function hasIncompleteGeometry(route: Route) {
  return (
    route.geometry.length === 0 ||
    route.geometry.some((item) => item.kind === "straight" && (!item.lengthM || item.lengthM <= 0))
  );
}
