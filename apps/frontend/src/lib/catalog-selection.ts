import type {
  EditorCatalogProductV2,
  EditorCatalogResponseV2,
  ProjectDraftInputV2,
  ProjectRouteDraftV2
} from "@niedax/domain";

type ProjectSelection = ProjectRouteDraftV2["selection"];
type CatalogContextCarrier = Pick<EditorCatalogResponseV2, "catalogSnapshot" | "ruleSnapshot">;

export function isSameCatalogContext(
  left: CatalogContextCarrier,
  right: CatalogContextCarrier
): boolean {
  return (
    left.catalogSnapshot.snapshotId === right.catalogSnapshot.snapshotId &&
    left.catalogSnapshot.version === right.catalogSnapshot.version &&
    left.catalogSnapshot.contentHash === right.catalogSnapshot.contentHash &&
    left.ruleSnapshot.snapshotId === right.ruleSnapshot.snapshotId &&
    left.ruleSnapshot.version === right.ruleSnapshot.version &&
    left.ruleSnapshot.contentHash === right.ruleSnapshot.contentHash
  );
}

export function selectableProducts(
  catalog: EditorCatalogResponseV2,
  role?: EditorCatalogProductV2["role"]
): readonly EditorCatalogProductV2[] {
  return catalog.products.filter(
    (product) => product.selectable && product.active && (!role || product.role === role)
  );
}

export function compatibleProducts(
  catalog: EditorCatalogResponseV2,
  context: EditorCatalogResponseV2["compatibilityRelations"][number]["context"],
  subjectProductId: string | null,
  role?: EditorCatalogProductV2["role"],
  substrate: ProjectRouteDraftV2["supports"]["substrate"] = null
): readonly EditorCatalogProductV2[] {
  const allowedIds = new Set(
    catalog.compatibilityRelations
      .filter(
        (relation) =>
          relation.allowed &&
          relation.context === context &&
          relation.subjectProductId === subjectProductId &&
          relation.substrate === substrate
      )
      .map((relation) => relation.productId)
  );
  return selectableProducts(catalog, role).filter((product) => allowedIds.has(product.id));
}

export function templateComponentProducts(
  catalog: EditorCatalogResponseV2,
  templateId: string | null,
  role: EditorCatalogResponseV2["assemblyTemplates"][number]["components"][number]["role"]
): readonly EditorCatalogProductV2[] {
  const template = catalog.assemblyTemplates.find((candidate) => candidate.id === templateId);
  const productIds = new Set(
    template?.components
      .filter((component) => component.role === role)
      .map((component) => component.productId) ?? []
  );
  return selectableProducts(catalog).filter((product) => productIds.has(product.id));
}

export function compatibleTemplateProducts(
  catalog: EditorCatalogResponseV2,
  templateId: string | null,
  role: EditorCatalogResponseV2["assemblyTemplates"][number]["components"][number]["role"],
  context: EditorCatalogResponseV2["compatibilityRelations"][number]["context"],
  subjectProductId: string | null,
  substrate: ProjectRouteDraftV2["supports"]["substrate"] = null
): readonly EditorCatalogProductV2[] {
  const compatibleIds = new Set(
    compatibleProducts(catalog, context, subjectProductId, undefined, substrate).map(
      (product) => product.id
    )
  );
  return templateComponentProducts(catalog, templateId, role).filter((product) =>
    compatibleIds.has(product.id)
  );
}

export interface ReconciledSelection {
  readonly selection: ProjectSelection;
  readonly cleared: readonly (keyof ProjectSelection)[];
}

export function reconcileStraightSelection(
  current: ProjectSelection,
  catalog: EditorCatalogResponseV2
): ReconciledSelection {
  const products = selectableProducts(catalog, "straightSection").filter(
    (product) => product.selection !== null
  );
  const cleared: (keyof ProjectSelection)[] = [];
  const selection = { ...current };
  const clearProductAndSupply = () => {
    if (selection.straightProductId !== null) cleared.push("straightProductId");
    if (selection.defaultSupplyOptionId !== null) cleared.push("defaultSupplyOptionId");
    selection.straightProductId = null;
    selection.defaultSupplyOptionId = null;
  };
  const clearFinishAndBelow = () => {
    if (selection.finishCode !== null) cleared.push("finishCode");
    selection.finishCode = null;
    clearProductAndSupply();
  };
  const clearMaterialAndBelow = () => {
    if (selection.materialCode !== null) cleared.push("materialCode");
    selection.materialCode = null;
    clearFinishAndBelow();
  };
  const clearDimensionAndBelow = () => {
    if (selection.dimensionId !== null) cleared.push("dimensionId");
    if (selection.width !== null) cleared.push("width");
    if (selection.height !== null) cleared.push("height");
    selection.dimensionId = null;
    selection.width = null;
    selection.height = null;
    clearMaterialAndBelow();
  };

  if (
    selection.system === null ||
    !products.some((product) => product.selection?.system === selection.system)
  ) {
    if (selection.system !== null) cleared.push("system");
    selection.system = null;
    clearDimensionAndBelow();
    return { selection, cleared: [...new Set(cleared)] };
  }

  let candidates = products.filter((product) => product.selection?.system === selection.system);
  const dimensionMatches =
    selection.dimensionId !== null &&
    selection.width !== null &&
    selection.height !== null &&
    candidates.some(
      (product) =>
        product.selection?.dimensionId === selection.dimensionId &&
        product.selection.width.value === selection.width?.value &&
        product.selection.width.unit === selection.width?.unit &&
        product.selection.height.value === selection.height?.value &&
        product.selection.height.unit === selection.height?.unit
    );
  if (!dimensionMatches) {
    clearDimensionAndBelow();
    return { selection, cleared: [...new Set(cleared)] };
  }
  candidates = candidates.filter(
    (product) =>
      product.selection?.dimensionId === selection.dimensionId &&
      product.selection.width.value === selection.width?.value &&
      product.selection.width.unit === selection.width?.unit &&
      product.selection.height.value === selection.height?.value &&
      product.selection.height.unit === selection.height?.unit
  );

  if (
    selection.materialCode === null ||
    !candidates.some((product) => product.selection?.materialCode === selection.materialCode)
  ) {
    clearMaterialAndBelow();
    return { selection, cleared: [...new Set(cleared)] };
  }
  candidates = candidates.filter(
    (product) => product.selection?.materialCode === selection.materialCode
  );

  if (
    selection.finishCode === null ||
    !candidates.some((product) => product.selection?.finishCode === selection.finishCode)
  ) {
    clearFinishAndBelow();
    return { selection, cleared: [...new Set(cleared)] };
  }
  candidates = candidates.filter(
    (product) => product.selection?.finishCode === selection.finishCode
  );

  const selectedProduct = candidates.find((product) => product.id === selection.straightProductId);
  if (!selectedProduct) clearProductAndSupply();
  if (
    selection.defaultSupplyOptionId !== null &&
    (selection.straightProductId === null ||
      !selectedProduct?.supplyOptions.some(
        (option) =>
          option.id === selection.defaultSupplyOptionId && option.active && option.orderable
      ))
  ) {
    selection.defaultSupplyOptionId = null;
    cleared.push("defaultSupplyOptionId");
  }
  return { selection, cleared: [...new Set(cleared)] };
}

export interface ReconciledRouteCatalog {
  readonly route: ProjectRouteDraftV2;
  readonly cleared: readonly string[];
}

/**
 * Removes selections that are not facts in the supplied catalog snapshot. It deliberately never
 * substitutes another product or supply option: the user must make every replacement explicitly.
 */
export function reconcileRouteCatalog(
  current: ProjectRouteDraftV2,
  catalog: EditorCatalogResponseV2
): ReconciledRouteCatalog {
  const selectionResult = reconcileStraightSelection(current.selection, catalog);
  const cleared = selectionResult.cleared.map((field) => `selection.${field}`);
  let route: ProjectRouteDraftV2 = { ...current, selection: selectionResult.selection };
  const selectedStraight = catalog.products.find(
    (product) => product.id === route.selection.straightProductId
  );
  const allowedSupplyOptionIds = new Set(
    selectedStraight?.supplyOptions
      .filter((option) => option.active && option.orderable)
      .map((option) => option.id) ?? []
  );
  const geometry = route.geometry.map((item, index) => {
    if (
      item.kind !== "straight" ||
      item.supplyOptionId === null ||
      allowedSupplyOptionIds.has(item.supplyOptionId)
    )
      return item;
    cleared.push(`geometry.${index}.supplyOptionId`);
    return { ...item, supplyOptionId: null };
  });
  if (geometry.some((item, index) => item !== route.geometry[index]))
    route = { ...route, geometry };

  const supports = { ...route.supports };
  const selectedTemplate = catalog.assemblyTemplates.find(
    (template) =>
      template.id === supports.assemblyTemplateId &&
      supports.supportType !== null &&
      template.supportType === supports.supportType &&
      route.selection.system !== null &&
      template.applicableSystems.includes(route.selection.system)
  );
  const clearSupportField = (
    field:
      "assemblyTemplateId" | "supportProductId" | "anchorProductId" | "wstbProductId" | "levelCount"
  ) => {
    if (supports[field] !== null) cleared.push(`supports.${field}`);
    supports[field] = null;
  };

  if (!selectedTemplate) {
    clearSupportField("assemblyTemplateId");
    clearSupportField("supportProductId");
    clearSupportField("anchorProductId");
    clearSupportField("wstbProductId");
    clearSupportField("levelCount");
    if (supports.templateManualValues.length) cleared.push("supports.templateManualValues");
    supports.templateManualValues = [];
  } else {
    const validSupportIds = new Set(
      templateComponentProducts(catalog, selectedTemplate.id, "support").map(
        (product) => product.id
      )
    );
    if (supports.supportProductId !== null && !validSupportIds.has(supports.supportProductId))
      clearSupportField("supportProductId");

    const validAnchorIds = new Set(
      compatibleTemplateProducts(
        catalog,
        selectedTemplate.id,
        "anchor",
        "anchor",
        null,
        supports.substrate
      ).map((product) => product.id)
    );
    if (supports.anchorProductId !== null && !validAnchorIds.has(supports.anchorProductId))
      clearSupportField("anchorProductId");

    const validWstbIds = new Set(
      templateComponentProducts(catalog, selectedTemplate.id, "wstb").map((product) => product.id)
    );
    if (supports.wstbProductId !== null && !validWstbIds.has(supports.wstbProductId))
      clearSupportField("wstbProductId");

    const hasPerLevelComponent = selectedTemplate.components.some(
      (component) => component.quantityMode === "perLevel"
    );
    if (!hasPerLevelComponent) clearSupportField("levelCount");

    const manualComponents = new Map(
      selectedTemplate.components
        .filter((component) => component.quantityMode === "manual")
        .map((component) => [component.id, component])
    );
    const retainedComponentIds = new Set<string>();
    const templateManualValues = supports.templateManualValues.filter((value) => {
      const component = manualComponents.get(value.componentId);
      const valid =
        component !== undefined &&
        component.quantity.unit === value.quantity.unit &&
        !retainedComponentIds.has(value.componentId);
      if (valid) retainedComponentIds.add(value.componentId);
      return valid;
    });
    if (templateManualValues.length !== supports.templateManualValues.length) {
      cleared.push("supports.templateManualValues");
      supports.templateManualValues = templateManualValues;
    }
  }

  route = { ...route, supports };
  return { route, cleared: [...new Set(cleared)] };
}

export interface ReconciledDraftCatalog {
  readonly draft: ProjectDraftInputV2;
  readonly cleared: readonly string[];
}

export function reconcileProjectDraftCatalog(
  current: ProjectDraftInputV2,
  catalog: EditorCatalogResponseV2
): ReconciledDraftCatalog {
  const cleared: string[] = [];
  let changed = false;
  const routes = current.routes.map((route, index) => {
    const result = reconcileRouteCatalog(route, catalog);
    if (!result.cleared.length) return route;
    changed = true;
    cleared.push(...result.cleared.map((path) => `routes.${index}.${path}`));
    return result.route;
  });
  return {
    draft: changed ? { ...current, routes } : current,
    cleared
  };
}

export function selectStraightProduct(
  product: EditorCatalogProductV2,
  previousSupplyOptionId: string | null
): ProjectSelection {
  if (!product.selection) throw new Error("Straight product is missing its selection tuple");
  return {
    ...product.selection,
    straightProductId: product.id,
    defaultSupplyOptionId: product.supplyOptions.some(
      (option) => option.id === previousSupplyOptionId && option.active && option.orderable
    )
      ? previousSupplyOptionId
      : null
  };
}
