import {
  type EditorCatalogResponseV2,
  ProjectDraftInputV2Schema,
  type ProjectConnectionDraftV2,
  type ProjectDraftInputV2,
  type ProjectEndpointDraftV2,
  type ProjectRouteDraftV2,
  type ProjectV2
} from "@niedax/domain";

export type ProjectDraftState = ProjectDraftInputV2 | null;
export type ProjectDraftAction =
  | { readonly type: "replace"; readonly draft: ProjectDraftState }
  | {
      readonly type: "update";
      readonly update: (current: ProjectDraftState) => ProjectDraftState;
    };

export function projectDraftReducer(
  state: ProjectDraftState,
  action: ProjectDraftAction
): ProjectDraftState {
  return action.type === "replace" ? action.draft : action.update(state);
}

export function connectionParticipantCount(type: ProjectConnectionDraftV2["type"]): 2 | 3 {
  return type === "tee" ? 3 : 2;
}

export function endpointTypeForConnection(
  type: ProjectConnectionDraftV2["type"]
): ProjectEndpointDraftV2["type"] {
  return type === "logicalContinuation" ? "routeContinuation" : "physicalSplice";
}

export function projectToDraft(project: ProjectV2): ProjectDraftInputV2 {
  return {
    code: project.code,
    name: project.name,
    description: project.description,
    defaultLocale: project.defaultLocale,
    defaultReservePercent: project.defaultReservePercent,
    cableLoad: project.cableLoad,
    routes: project.routes,
    connections: project.connections,
    accessoryProductIds: project.accessoryProductIds,
    manualItems: project.manualItems
  };
}

export function createEmptyProjectDraft(
  code = "",
  name = "",
  description: string | null = null
): ProjectDraftInputV2 {
  return {
    code,
    name,
    description,
    defaultLocale: "bg",
    defaultReservePercent: "0",
    cableLoad: null,
    routes: [],
    connections: [],
    accessoryProductIds: [],
    manualItems: []
  };
}

function emptyEndpoint(): ProjectEndpointDraftV2 {
  return {
    id: crypto.randomUUID(),
    type: "freeEnd",
    selectedProductId: null,
    equipmentReference: null,
    customDescription: null
  };
}

export function createRouteDraft(
  code: string,
  name: string,
  description: string | null
): ProjectRouteDraftV2 {
  return {
    id: crypto.randomUUID(),
    code,
    name,
    description,
    selection: {
      system: null,
      dimensionId: null,
      width: null,
      height: null,
      materialCode: null,
      finishCode: null,
      straightProductId: null,
      defaultSupplyOptionId: null
    },
    startEndpoint: emptyEndpoint(),
    endEndpoint: emptyEndpoint(),
    geometry: [],
    supports: {
      spacing: null,
      supportType: null,
      supportProductId: null,
      assemblyTemplateId: null,
      levelCount: null,
      substrate: null,
      anchorProductId: null,
      anchorQuantityOverride: null,
      wstbProductId: null,
      wstb: null,
      manualAdditionalSupports: [],
      templateManualValues: []
    }
  };
}

export function isRouteCodeUnique(
  routes: readonly ProjectRouteDraftV2[],
  code: string,
  currentRouteId?: string
): boolean {
  const normalized = code.trim().toLocaleLowerCase("en-US");
  return (
    normalized.length > 0 &&
    !routes.some(
      (route) =>
        route.id !== currentRouteId && route.code.trim().toLocaleLowerCase("en-US") === normalized
    )
  );
}

export function updateRoute(
  draft: ProjectDraftInputV2,
  routeId: string,
  update: (route: ProjectRouteDraftV2) => ProjectRouteDraftV2
): ProjectDraftInputV2 {
  return {
    ...draft,
    routes: draft.routes.map((route) => (route.id === routeId ? update(route) : route))
  };
}

export function removeRouteAndReferences(
  draft: ProjectDraftInputV2,
  routeId: string
): ProjectDraftInputV2 {
  return {
    ...draft,
    routes: draft.routes.filter((route) => route.id !== routeId),
    connections: draft.connections.filter(
      (connection) =>
        !connection.participants.some((participant) => participant.routeId === routeId)
    )
  };
}

export function duplicateRoute(
  draft: ProjectDraftInputV2,
  routeId: string
): { readonly draft: ProjectDraftInputV2; readonly routeId: string } | null {
  const source = draft.routes.find((route) => route.id === routeId);
  if (!source) return null;
  let suffix = 1;
  let code = `${source.code}-COPY`;
  while (!isRouteCodeUnique(draft.routes, code)) code = `${source.code}-COPY-${++suffix}`;
  const newRouteId = crypto.randomUUID();
  const geometryIdMap = new Map(source.geometry.map((item) => [item.id, crypto.randomUUID()]));
  const route: ProjectRouteDraftV2 = {
    ...source,
    id: newRouteId,
    code,
    startEndpoint: { ...source.startEndpoint, id: crypto.randomUUID() },
    endEndpoint: { ...source.endEndpoint, id: crypto.randomUUID() },
    geometry: source.geometry.map((item) => ({ ...item, id: geometryIdMap.get(item.id)! })),
    supports: {
      ...source.supports,
      anchorQuantityOverride: source.supports.anchorQuantityOverride
        ? {
            ...source.supports.anchorQuantityOverride,
            metadata: {
              ...source.supports.anchorQuantityOverride.metadata,
              overrideId: crypto.randomUUID()
            }
          }
        : null,
      manualAdditionalSupports: source.supports.manualAdditionalSupports.map((adjustment) => ({
        ...adjustment,
        id: crypto.randomUUID(),
        sourceEntityRef:
          adjustment.sourceEntityRef === source.id
            ? newRouteId
            : (geometryIdMap.get(adjustment.sourceEntityRef) ?? newRouteId),
        metadata: { ...adjustment.metadata, overrideId: crypto.randomUUID() }
      })),
      templateManualValues: source.supports.templateManualValues.map((value) => ({
        ...value,
        metadata: { ...value.metadata, overrideId: crypto.randomUUID() }
      }))
    }
  };
  return { draft: { ...draft, routes: [...draft.routes, route] }, routeId: newRouteId };
}

export function moveGeometry(
  route: ProjectRouteDraftV2,
  geometryId: string,
  direction: -1 | 1
): ProjectRouteDraftV2 {
  const index = route.geometry.findIndex((item) => item.id === geometryId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= route.geometry.length) return route;
  const geometry = [...route.geometry];
  [geometry[index], geometry[target]] = [geometry[target]!, geometry[index]!];
  return { ...route, geometry };
}

export interface LocalDraftValidation {
  readonly validForSave: boolean;
  readonly errors: ReadonlyMap<string, string>;
}

export function validateDraftLocally(draft: ProjectDraftInputV2): LocalDraftValidation {
  const parsed = ProjectDraftInputV2Schema.safeParse(draft);
  if (parsed.success) return { validForSave: true, errors: new Map() };
  const errors = new Map<string, string>();
  for (const issue of parsed.error.issues) {
    const path = issue.path.join(".");
    if (!errors.has(path)) errors.set(path, issue.message);
  }
  return { validForSave: false, errors };
}

export function canCalculateLocally(
  draft: ProjectDraftInputV2,
  catalog: EditorCatalogResponseV2 | null
): boolean {
  if (!catalog || !validateDraftLocally(draft).validForSave || draft.routes.length === 0)
    return false;
  return draft.routes.every((route) => {
    const template = catalog.assemblyTemplates.find(
      (candidate) =>
        candidate.id === route.supports.assemblyTemplateId &&
        route.supports.supportType !== null &&
        candidate.supportType === route.supports.supportType &&
        route.selection.system !== null &&
        candidate.applicableSystems.includes(route.selection.system)
    );
    if (!template) return false;
    const wstbComponents = template.components.filter((component) => component.role === "wstb");
    const wstbProductReady =
      wstbComponents.length === 0 ||
      (route.supports.wstbProductId !== null &&
        wstbComponents.some((component) => component.productId === route.supports.wstbProductId) &&
        catalog.products.some(
          (product) =>
            product.id === route.supports.wstbProductId && product.active && product.selectable
        ));
    const levelCountReady =
      !template.components.some((component) => component.quantityMode === "perLevel") ||
      route.supports.levelCount !== null;
    const manualValuesReady = template.components
      .filter((component) => component.quantityMode === "manual")
      .every((component) =>
        route.supports.templateManualValues.some(
          (value) =>
            value.componentId === component.id && value.quantity.unit === component.quantity.unit
        )
      );
    return (
      route.geometry.length > 0 &&
      route.selection.system !== null &&
      route.selection.dimensionId !== null &&
      route.selection.width !== null &&
      route.selection.height !== null &&
      route.selection.materialCode !== null &&
      route.selection.finishCode !== null &&
      route.selection.straightProductId !== null &&
      route.selection.defaultSupplyOptionId !== null &&
      route.supports.spacing !== null &&
      route.supports.supportType !== null &&
      route.supports.assemblyTemplateId !== null &&
      route.supports.substrate !== null &&
      route.supports.substrate !== "unknown" &&
      route.supports.anchorProductId !== null &&
      wstbProductReady &&
      route.supports.wstb !== null &&
      levelCountReady &&
      manualValuesReady
    );
  });
}
