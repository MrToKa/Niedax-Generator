import { exportTerminology } from "./export-terminology";
import {
  type BomRow,
  type ConnectionType,
  type EndpointType,
  type GeometryItem,
  type Language,
  type PrototypeState,
  type Route,
  systemFixtures
} from "./prototype-data";

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

export function selectSeries(
  current: PrototypeState["system"],
  seriesId: string
): { selection: PrototypeState["system"]; cleared: string[] } {
  const fixture = systemFixtures.find((series) => series.id === seriesId);
  if (!fixture) {
    return {
      selection: { seriesId: null, dimensionId: null, finishId: null, variantId: null },
      cleared: ["series", "dimension", "finish", "variant"]
    };
  }
  const cleared: string[] = [];
  const dimensionId = fixture.dimensions.some((option) => option.id === current.dimensionId)
    ? current.dimensionId
    : null;
  const finishId = fixture.finishes.some((option) => option.id === current.finishId)
    ? current.finishId
    : null;
  const variantId = fixture.variants.some((option) => option.id === current.variantId)
    ? current.variantId
    : null;
  if (current.dimensionId && !dimensionId) cleared.push("dimension");
  if (current.finishId && !finishId) cleared.push("finish");
  if (current.variantId && !variantId) cleared.push("variant");
  return { selection: { seriesId, dimensionId, finishId, variantId }, cleared };
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

export function endpointEffect(type: EndpointType, hasConfirmedRule: boolean) {
  if (type === "free") return { material: "none" as const, key: "endpointEffectFree" };
  if (type === "continuation")
    return { material: "none" as const, key: "endpointEffectContinuation" };
  if (type === "custom") return { material: "manual" as const, key: "endpointEffectCustom" };
  if (!hasConfirmedRule)
    return { material: "unresolved" as const, key: "endpointEffectUnresolved" };
  if (type === "endCap") return { material: "automatic" as const, key: "endpointEffectCap" };
  if (type === "equipment")
    return { material: "automatic" as const, key: "endpointEffectEquipment" };
  return { material: "automatic" as const, key: "endpointEffectSplice" };
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

export function geometryLength(route: Route) {
  return route.geometry.reduce(
    (total, item) => total + (item.kind === "straight" ? (item.lengthM ?? 0) : 0),
    0
  );
}

export function hasIncompleteGeometry(route: Route) {
  return (
    route.geometry.length === 0 ||
    route.geometry.some((item) => item.kind === "straight" && (!item.lengthM || item.lengthM <= 0))
  );
}

export function calculateMockBom(state: PrototypeState, language: Language = "en"): BomRow[] {
  const ui =
    language === "bg"
      ? {
          routeReserve: "Геометрия на трасетата + проектен резерв",
          manualOverride: "Ръчна промяна",
          wstbRule: "Проектно правило WSTB",
          manualAnchor: "Ръчна промяна на анкерите",
          mountingTemplate: "Монтажен шаблон",
          selectedAccessory: "Аксесоар, избран от потребителя",
          manualCatalog: "Ръчно добавен каталожен продукт",
          connectionManual: "Ръчен продукт от връзка",
          freeText: "Свободен материал",
          manualEntry: "Ръчно въвеждане",
          unresolvedCode: "Продуктовият код не е разрешен.",
          wstbWarning: "Правилото за количество WSTB изисква потвърждение от Niedax.",
          anchorWarning: "Пригодността на анкера за основата и товара изисква инженерен преглед.",
          includedFasteners: "Включени крепежи: нерешено в тестовия каталог",
          compatibilityWarning: "Съвместимият каталожен продукт и включените крепежи са нерешени.",
          adjustedWarning: "Количеството е променено ръчно.",
          noNote: "Няма въведена бележка.",
          straightWhy: (length: string, section: number, required: number) =>
            `${length} m обща права геометрия ÷ ${section} m доставяема секция = ${required} необходими секции (закръглено нагоре).`,
          reserveWhy: (reserve: number, ordered: number) =>
            `${reserve}% проектен резерв е приложен след броя секции и е закръглен до ${ordered} доставяеми секции.`,
          mockWhy: "UX тестово изчисление; не е приложено инженерно правило за съвместимост.",
          supportWhy: (count: number, perSupport: number) =>
            `Тестов брой опори ${count} × ${perSupport} WSTB на опора.`,
          wstbWhy: "Стойността 2 на опора е проектно допускане, а не одобрено инженерно правило.",
          anchorWhy: (count: number, anchors: number) =>
            `Тестов брой опори ${count} × ${anchors} анкера на монтажна точка.`,
          anchorSelectionWhy:
            "Точният модел и размер анкер Niedax се избират от потребителя и изискват инженерна проверка.",
          coverWhy: "Защитният капак е избран за проекта.",
          duplicateWhy:
            "Няма потвърдено правило за съвместимост или включени аксесоари; дублирани крепежи не се добавят.",
          manualWhy: (quantity: number, unit: string, reason: string) =>
            `Потребителят е въвел ${quantity} ${unit}: ${reason}.`,
          connectionWhy: (connectionId: string, reason: string) =>
            `Ръчен продукт от връзка ${connectionId}: ${reason}.`,
          reservePackagingWhy: (reserve: string, packaging: string) =>
            `Резерв: ${reserve}; закръгляване по опаковка: ${packaging}.`
        }
      : {
          routeReserve: "Route geometry + project reserve",
          manualOverride: "Manual override",
          wstbRule: "WSTB design rule",
          manualAnchor: "Manual anchor override",
          mountingTemplate: "Mounting template",
          selectedAccessory: "User-selected accessory",
          manualCatalog: "Manual catalogued product",
          connectionManual: "Manual connection product",
          freeText: "Free-text material",
          manualEntry: "Manual entry",
          unresolvedCode: "Product code is unresolved.",
          wstbWarning: "WSTB quantity rule requires Niedax confirmation.",
          anchorWarning: "Anchor suitability for substrate and load requires engineering review.",
          includedFasteners: "Product fasteners: inclusion unresolved in fixture catalogue",
          compatibilityWarning:
            "Compatible catalogue product and included fasteners are unresolved.",
          adjustedWarning: "Quantity was manually adjusted.",
          noNote: "No note provided.",
          straightWhy: (length: string, section: number, required: number) =>
            `${length} m total straight geometry ÷ ${section} m deliverable section = ${required} required sections (rounded up).`,
          reserveWhy: (reserve: number, ordered: number) =>
            `${reserve}% project reserve applied after section count, then rounded to ${ordered} deliverable sections.`,
          mockWhy: "UX-only mock calculation; no engineering compatibility rule has been applied.",
          supportWhy: (count: number, perSupport: number) =>
            `Fixture support count ${count} × ${perSupport} WSTB per support.`,
          wstbWhy:
            "The default of 2 per support is a design assumption, not an approved engineering rule.",
          anchorWhy: (count: number, anchors: number) =>
            `Fixture support count ${count} × ${anchors} anchors per mounting point.`,
          anchorSelectionWhy:
            "Exact Niedax anchor model and size remain a user selection and require engineering verification.",
          coverWhy: "Protective cover selected for the project.",
          duplicateWhy:
            "No catalogue compatibility or included-accessory rule is confirmed; duplicate fasteners are not added.",
          manualWhy: (quantity: number, unit: string, reason: string) =>
            `User entered ${quantity} ${unit}: ${reason}.`,
          connectionWhy: (connectionId: string, reason: string) =>
            `Manual product from connection ${connectionId}: ${reason}.`,
          reservePackagingWhy: (reserve: string, packaging: string) =>
            `Reserve: ${reserve}; packaging rounding: ${packaging}.`
        };
  const linearGroups = ([3, 6] as const)
    .map((sectionLength) => ({
      sectionLength,
      totalLength: state.routes
        .filter((route) => route.sectionLengthM === sectionLength)
        .reduce((total, route) => total + geometryLength(route), 0)
    }))
    .filter((group) => group.totalLength > 0)
    .map((group) => {
      const requiredSections = Math.ceil(group.totalLength / group.sectionLength);
      const reservedSections = Math.ceil(
        requiredSections * (1 + state.project.defaultReservePercent / 100)
      );
      return { ...group, requiredSections, reservedSections };
    });
  const requiredSections = linearGroups.reduce((total, group) => total + group.requiredSections, 0);
  const wstbPerSupport =
    state.supports.wstbMode === "one"
      ? 1
      : state.supports.wstbMode === "two"
        ? 2
        : state.supports.wstbManualQuantity;
  const mockSupportCount = 12;
  const anchorPerPoint = state.supports.manualAnchorOverride
    ? state.supports.manualAnchorQuantity
    : state.supports.anchorsPerMountingPoint;
  const rows: BomRow[] = [
    ...linearGroups.map<BomRow>(
      ({ sectionLength, totalLength, requiredSections: required, reservedSections: reserved }) => ({
        id: `bom-linear-${sectionLength}`,
        category: exportTerminology.categoryLinearSections,
        productCode: null,
        description: `${exportTerminology.straightSection} · ${sectionLength} m`,
        technicalQuantity: required,
        unit: exportTerminology.unitPieces,
        packageSize: 1,
        packageCount: reserved,
        orderQuantity: reserved,
        spareQuantity: reserved - required,
        includedItems: [],
        source: ui.routeReserve,
        sourceVersion: exportTerminology.fixtureRulesVersion,
        status: "calculated",
        warnings: [ui.unresolvedCode],
        manualOverride: false,
        why: [
          ui.straightWhy(totalLength.toFixed(1), sectionLength, required),
          ui.reserveWhy(state.project.defaultReservePercent, reserved),
          ui.mockWhy
        ]
      })
    ),
    {
      id: "bom-wstb",
      category: exportTerminology.categorySupports,
      productCode: null,
      description: exportTerminology.wstbSupport,
      technicalQuantity: mockSupportCount * wstbPerSupport,
      unit: exportTerminology.unitPieces,
      packageSize: 1,
      packageCount: mockSupportCount * wstbPerSupport,
      orderQuantity: mockSupportCount * wstbPerSupport,
      spareQuantity: 0,
      includedItems: [],
      source: state.supports.wstbMode === "manual" ? ui.manualOverride : ui.wstbRule,
      sourceVersion: exportTerminology.fixtureRulesVersion,
      status: state.supports.wstbMode === "manual" ? "manual" : "assumption",
      warnings: [ui.wstbWarning],
      manualOverride: state.supports.wstbMode === "manual",
      why: [ui.supportWhy(mockSupportCount, wstbPerSupport), ui.wstbWhy]
    },
    {
      id: "bom-anchor",
      category: exportTerminology.categoryAnchors,
      productCode: null,
      description: exportTerminology.selectedAnchor,
      technicalQuantity: mockSupportCount * anchorPerPoint,
      unit: exportTerminology.unitPieces,
      packageSize: 1,
      packageCount: mockSupportCount * anchorPerPoint,
      orderQuantity: mockSupportCount * anchorPerPoint,
      spareQuantity: 0,
      includedItems: [],
      source: state.supports.manualAnchorOverride ? ui.manualAnchor : ui.mountingTemplate,
      sourceVersion: exportTerminology.fixtureRulesVersion,
      status: "review",
      warnings: [ui.anchorWarning],
      manualOverride: state.supports.manualAnchorOverride,
      why: [ui.anchorWhy(mockSupportCount, anchorPerPoint), ui.anchorSelectionWhy]
    }
  ];

  if (state.load.selectedAccessories.includes("protectiveCover")) {
    rows.push({
      id: "bom-cover",
      category: exportTerminology.categoryAccessories,
      productCode: null,
      description: exportTerminology.protectiveCover,
      technicalQuantity: requiredSections,
      unit: exportTerminology.unitPieces,
      packageSize: 1,
      packageCount: requiredSections,
      orderQuantity: requiredSections,
      spareQuantity: 0,
      includedItems: [ui.includedFasteners],
      source: ui.selectedAccessory,
      sourceVersion: exportTerminology.fixtureCatalogueVersion,
      status: "review",
      warnings: [ui.compatibilityWarning],
      manualOverride: false,
      why: [ui.coverWhy, ui.duplicateWhy]
    });
  }

  for (const connection of state.connections) {
    if (!connection.manualProduct.trim() || connection.manualProductQuantity <= 0) continue;
    rows.push({
      id: `bom-${connection.id}-manual`,
      category: exportTerminology.categoryManual,
      productCode: null,
      description: connection.manualProduct,
      technicalQuantity: connection.manualProductQuantity,
      unit: exportTerminology.unitPieces,
      packageSize: 1,
      packageCount: connection.manualProductQuantity,
      orderQuantity: connection.manualProductQuantity,
      spareQuantity: 0,
      includedItems: [],
      source: ui.connectionManual,
      sourceVersion: ui.manualEntry,
      status: "manual",
      warnings: [ui.unresolvedCode],
      manualOverride: true,
      why: [ui.connectionWhy(connection.id, connection.reason), connection.note || ui.noNote]
    });
  }

  for (const item of state.load.manualItems) {
    const reserveMultiplier =
      item.reserveBehavior === "project"
        ? 1 + state.project.defaultReservePercent / 100
        : item.reserveBehavior === "custom"
          ? 1 + item.reservePercent / 100
          : 1;
    const reservedQuantity = item.quantity * reserveMultiplier;
    const packageSize = Math.max(item.packageSize, 1);
    const packageCount =
      item.packagingRounding === "on"
        ? Math.ceil(reservedQuantity / packageSize)
        : reservedQuantity / packageSize;
    const orderQuantity =
      item.packagingRounding === "on" ? packageCount * packageSize : reservedQuantity;
    rows.push({
      id: `bom-${item.id}`,
      category: exportTerminology.categoryManual,
      productCode: item.productCode || null,
      description: item.description,
      technicalQuantity: item.quantity,
      unit: item.unit,
      packageSize,
      packageCount,
      orderQuantity,
      spareQuantity: Math.max(0, orderQuantity - item.quantity),
      includedItems: [],
      source: item.kind === "catalog" ? ui.manualCatalog : ui.freeText,
      sourceVersion:
        item.kind === "catalog" ? exportTerminology.fixtureCatalogueVersion : ui.manualEntry,
      status: "manual",
      warnings: item.manuallyAdjusted ? [ui.adjustedWarning] : [],
      manualOverride: item.manuallyAdjusted,
      why: [
        ui.manualWhy(item.quantity, item.unit, item.reason),
        ui.reservePackagingWhy(item.reserveBehavior, item.packagingRounding),
        item.note || ui.noNote
      ]
    });
  }

  return rows;
}
