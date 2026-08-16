export type Language = "bg" | "en";
export type StepId = "project" | "system" | "geometry" | "supports" | "load" | "results";
export type ScenarioId =
  | "valid"
  | "empty"
  | "required"
  | "duplicate"
  | "incompatible"
  | "disconnected"
  | "endpoint"
  | "missingLoad"
  | "anchorReview"
  | "manualOverride"
  | "catalogWarning"
  | "loading"
  | "noResults"
  | "approved";
export type SourceKind =
  | "user"
  | "projectDefault"
  | "catalog"
  | "mountingTemplate"
  | "designRule"
  | "manualOverride"
  | "calculated";
export type EndpointType = "free" | "endCap" | "equipment" | "continuation" | "splice" | "custom";
export type ConnectionType =
  "continuation" | "splice" | "horizontalBend" | "verticalBend" | "tee" | "transition" | "custom";
export type BomStatus = "catalog" | "calculated" | "assumption" | "review" | "manual";

export interface LocalizedText {
  bg: string;
  en: string;
}

export interface SystemFixture {
  id: string;
  label: LocalizedText;
  dimensions: Array<{ id: string; label: string }>;
  finishes: Array<{ id: string; label: LocalizedText }>;
  variants: Array<{ id: string; label: LocalizedText }>;
}

export interface GeometryItem {
  id: string;
  kind: "straight" | "fitting";
  lengthM?: number;
  fittingType?: "horizontalBend" | "verticalBend" | "tee" | "transition" | "custom";
}

export interface Route {
  id: string;
  code: string;
  name: string;
  description: string;
  seriesId: string | null;
  dimensionId: string | null;
  finishId: string | null;
  variantId: string | null;
  sectionLengthM: 3 | 6;
  startPoint: string;
  endPoint: string;
  startEndpointType: EndpointType;
  endEndpointType: EndpointType;
  additionalSupportsAroundFittings: number;
  geometry: GeometryItem[];
}

export interface Connection {
  id: string;
  type: ConnectionType;
  participants: string[];
  materialBehavior: "automatic" | "none" | "manual";
  supportBehavior: "shared" | "separate";
  supportsBefore: number;
  supportsAfter: number;
  manualConnectorCorrection: number;
  manualProduct: string;
  manualProductQuantity: number;
  reason: string;
  note: string;
}

export interface SupportConfig {
  spacingM: number;
  supportType: "wall" | "ceiling" | "floor" | "custom";
  templateId: "twoPoint" | "fourPoint" | "custom";
  connectionBehavior: "shared" | "separate";
  additionalSupportCount: number;
  anchorModel: string;
  anchorSize: string;
  anchorsPerMountingPoint: number;
  substrate: "concrete" | "steel" | "masonry" | "unknown";
  manualAnchorOverride: boolean;
  manualAnchorQuantity: number;
  wstbMode: "one" | "two" | "manual";
  wstbManualQuantity: number;
}

export interface ManualItem {
  id: string;
  kind: "catalog" | "freeText";
  productCode: string;
  description: string;
  quantity: number;
  unit: "pcs" | "m" | "kg";
  reason: string;
  note: string;
  reserveBehavior: "project" | "off" | "custom";
  reservePercent: number;
  packagingRounding: "on" | "off";
  packageSize: number;
  manuallyAdjusted: boolean;
}

export interface ProjectState {
  id: string;
  code: string;
  name: string;
  description: string;
  defaultReservePercent: number;
  status: "draft" | "review" | "approved";
  revision: string;
}

export interface PrototypeState {
  project: ProjectState;
  system: {
    seriesId: string | null;
    dimensionId: string | null;
    finishId: string | null;
    variantId: string | null;
  };
  routes: Route[];
  connections: Connection[];
  supports: SupportConfig;
  load: {
    cableLoadKgM: number | null;
    selectedAccessories: string[];
    manualItems: ManualItem[];
  };
}

export interface BomRow {
  id: string;
  category: string;
  productCode: string | null;
  description: string;
  technicalQuantity: number;
  unit: string;
  packageSize: number;
  packageCount: number;
  orderQuantity: number;
  spareQuantity: number;
  includedItems: string[];
  source: string;
  sourceVersion: string;
  status: BomStatus;
  warnings: string[];
  manualOverride: boolean;
  why: string[];
}

export const steps: Array<{ id: StepId; labelKey: string; descriptionKey: string }> = [
  { id: "project", labelKey: "stepProject", descriptionKey: "projectDescription" },
  { id: "system", labelKey: "stepSystem", descriptionKey: "systemDescription" },
  { id: "geometry", labelKey: "stepGeometry", descriptionKey: "geometryDescription" },
  { id: "supports", labelKey: "stepSupports", descriptionKey: "supportsDescription" },
  { id: "load", labelKey: "stepLoad", descriptionKey: "loadDescription" },
  { id: "results", labelKey: "stepResults", descriptionKey: "resultsDescription" }
];

export const scenarios: ScenarioId[] = [
  "valid",
  "empty",
  "required",
  "duplicate",
  "incompatible",
  "disconnected",
  "endpoint",
  "missingLoad",
  "anchorReview",
  "manualOverride",
  "catalogWarning",
  "loading",
  "noResults",
  "approved"
];

export const systemFixtures: SystemFixture[] = [
  {
    id: "series-f",
    label: { bg: "Серия F · тестов каталог", en: "Series F · fixture catalogue" },
    dimensions: [
      { id: "f-60-100", label: "60 × 100 mm" },
      { id: "f-60-200", label: "60 × 200 mm" }
    ],
    finishes: [
      { id: "finish-s", label: { bg: "S · тестов финиш", en: "S · fixture finish" } },
      { id: "finish-e3", label: { bg: "E3 · тестов финиш", en: "E3 · fixture finish" } },
      { id: "finish-e5", label: { bg: "E5 · тестов финиш", en: "E5 · fixture finish" } }
    ],
    variants: [
      { id: "f-perforated", label: { bg: "Перфориран · тестов", en: "Perforated · fixture" } },
      { id: "f-solid", label: { bg: "Неперфориран · тестов", en: "Solid · fixture" } }
    ]
  },
  {
    id: "series-e3",
    label: { bg: "Серия E3 · тестов каталог", en: "Series E3 · fixture catalogue" },
    dimensions: [
      { id: "e3-85-200", label: "85 × 200 mm" },
      { id: "e3-85-300", label: "85 × 300 mm" }
    ],
    finishes: [
      { id: "finish-e3", label: { bg: "E3 · тестов финиш", en: "E3 · fixture finish" } },
      { id: "finish-e5", label: { bg: "E5 · тестов финиш", en: "E5 · fixture finish" } }
    ],
    variants: [
      { id: "e3-tray", label: { bg: "Тава · тестов", en: "Tray · fixture" } },
      { id: "e3-ladder", label: { bg: "Стълба · тестов", en: "Ladder · fixture" } }
    ]
  },
  {
    id: "series-s",
    label: { bg: "Серия S · тестов каталог", en: "Series S · fixture catalogue" },
    dimensions: [{ id: "s-60-150", label: "60 × 150 mm" }],
    finishes: [{ id: "finish-s", label: { bg: "S · тестов финиш", en: "S · fixture finish" } }],
    variants: [{ id: "s-solid", label: { bg: "Неперфориран · тестов", en: "Solid · fixture" } }]
  },
  {
    id: "series-e5",
    label: { bg: "Серия E5 · тестов каталог", en: "Series E5 · fixture catalogue" },
    dimensions: [{ id: "e5-110-300", label: "110 × 300 mm" }],
    finishes: [{ id: "finish-e5", label: { bg: "E5 · тестов финиш", en: "E5 · fixture finish" } }],
    variants: []
  }
];

export const initialState: PrototypeState = {
  project: {
    id: "project-01",
    code: "PRJ-SOF-001",
    name: "Логистичен център София",
    description: "Основни кабелни трасета — зона A",
    defaultReservePercent: 10,
    status: "draft",
    revision: "R0"
  },
  system: {
    seriesId: "series-f",
    dimensionId: "f-60-200",
    finishId: "finish-e3",
    variantId: "f-perforated"
  },
  routes: [
    {
      id: "route-a",
      code: "R-01",
      name: "Главно трасе",
      description: "От табло MDB до производствена зона",
      seriesId: "series-f",
      dimensionId: "f-60-200",
      finishId: "finish-e3",
      variantId: "f-perforated",
      sectionLengthM: 6,
      startPoint: "MDB-01",
      endPoint: "J-01",
      startEndpointType: "equipment",
      endEndpointType: "continuation",
      additionalSupportsAroundFittings: 2,
      geometry: [
        { id: "geometry-a1", kind: "straight", lengthM: 12.4 },
        { id: "geometry-a2", kind: "fitting", fittingType: "horizontalBend" },
        { id: "geometry-a3", kind: "straight", lengthM: 7.8 }
      ]
    },
    {
      id: "route-b",
      code: "R-02",
      name: "Продължение зона A",
      description: "Логическо продължение след J-01",
      seriesId: "series-f",
      dimensionId: "f-60-200",
      finishId: "finish-e3",
      variantId: "f-perforated",
      sectionLengthM: 6,
      startPoint: "J-01",
      endPoint: "EQ-14",
      startEndpointType: "continuation",
      endEndpointType: "free",
      additionalSupportsAroundFittings: 0,
      geometry: [{ id: "geometry-b1", kind: "straight", lengthM: 9.6 }]
    }
  ],
  connections: [
    {
      id: "connection-01",
      type: "continuation",
      participants: ["route-a:end", "route-b:start"],
      materialBehavior: "none",
      supportBehavior: "shared",
      supportsBefore: 0,
      supportsAfter: 0,
      manualConnectorCorrection: 0,
      manualProduct: "",
      manualProductQuantity: 0,
      reason: "Маршрутът продължава логически след J-01",
      note: "Не се добавя физически материал автоматично."
    }
  ],
  supports: {
    spacingM: 1.5,
    supportType: "ceiling",
    templateId: "fourPoint",
    connectionBehavior: "shared",
    additionalSupportCount: 2,
    anchorModel: "Anchor model — user selection required",
    anchorSize: "Size — user selection required",
    anchorsPerMountingPoint: 4,
    substrate: "concrete",
    manualAnchorOverride: false,
    manualAnchorQuantity: 4,
    wstbMode: "two",
    wstbManualQuantity: 2
  },
  load: {
    cableLoadKgM: 18.5,
    selectedAccessories: ["protectiveCover"],
    manualItems: [
      {
        id: "manual-01",
        kind: "freeText",
        productCode: "",
        description: "Identification labels",
        quantity: 12,
        unit: "pcs",
        reason: "Project identification requirement",
        note: "Free-text material; specification pending.",
        reserveBehavior: "off",
        reservePercent: 0,
        packagingRounding: "off",
        packageSize: 1,
        manuallyAdjusted: false
      }
    ]
  }
};

export function fixtureLabel(text: LocalizedText, language: Language) {
  return text[language];
}
