"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";

import {
  calculateMockBom,
  canAdvanceStep,
  connectionParticipantError,
  endpointEffect,
  geometryLength,
  hasIncompleteGeometry,
  isRouteCodeUnique,
  moveGeometryItem,
  projectValidation,
  selectSeries
} from "./prototype-logic";
import {
  type BomRow,
  type Connection,
  type ConnectionType,
  type EndpointType,
  type Language,
  type ManualItem,
  type PrototypeState,
  type Route,
  type ScenarioId,
  type SourceKind,
  fixtureLabel,
  initialState,
  scenarios,
  steps,
  systemFixtures
} from "./prototype-data";
import { copy, formatMessage, type TranslationKey } from "./prototype-i18n";

type Tone = "info" | "warning" | "error" | "review";
type Translator = (key: TranslationKey, values?: Record<string, string | number>) => string;

const scenarioMeta: Record<
  ScenarioId,
  {
    title: TranslationKey;
    message: TranslationKey;
    resolution: TranslationKey;
    tone: Tone;
    step: number;
  }
> = {
  valid: {
    title: "stateInfoTitle",
    message: "stateInfoMessage",
    resolution: "stateInfoResolution",
    tone: "info",
    step: 0
  },
  empty: {
    title: "stateEmptyTitle",
    message: "stateEmptyMessage",
    resolution: "stateEmptyResolution",
    tone: "info",
    step: 0
  },
  required: {
    title: "stateRequiredTitle",
    message: "stateRequiredMessage",
    resolution: "stateRequiredResolution",
    tone: "error",
    step: 0
  },
  duplicate: {
    title: "stateDuplicateTitle",
    message: "stateDuplicateMessage",
    resolution: "stateDuplicateResolution",
    tone: "error",
    step: 2
  },
  incompatible: {
    title: "stateIncompatibleTitle",
    message: "stateIncompatibleMessage",
    resolution: "stateIncompatibleResolution",
    tone: "warning",
    step: 1
  },
  disconnected: {
    title: "stateDisconnectedTitle",
    message: "stateDisconnectedMessage",
    resolution: "stateDisconnectedResolution",
    tone: "error",
    step: 2
  },
  endpoint: {
    title: "stateEndpointTitle",
    message: "stateEndpointMessage",
    resolution: "stateEndpointResolution",
    tone: "review",
    step: 2
  },
  missingLoad: {
    title: "stateMissingLoadTitle",
    message: "stateMissingLoadMessage",
    resolution: "stateMissingLoadResolution",
    tone: "warning",
    step: 4
  },
  anchorReview: {
    title: "stateAnchorReviewTitle",
    message: "stateAnchorReviewMessage",
    resolution: "stateAnchorReviewResolution",
    tone: "review",
    step: 3
  },
  manualOverride: {
    title: "stateManualOverrideTitle",
    message: "stateManualOverrideMessage",
    resolution: "stateManualOverrideResolution",
    tone: "warning",
    step: 4
  },
  catalogWarning: {
    title: "stateCatalogWarningTitle",
    message: "stateCatalogWarningMessage",
    resolution: "stateCatalogWarningResolution",
    tone: "warning",
    step: 5
  },
  loading: {
    title: "stateInfoTitle",
    message: "stateInfoMessage",
    resolution: "stateInfoResolution",
    tone: "info",
    step: 1
  },
  noResults: {
    title: "noResultsTitle",
    message: "noResultsMessage",
    resolution: "stateDisconnectedResolution",
    tone: "info",
    step: 5
  },
  approved: {
    title: "stateApprovedTitle",
    message: "stateApprovedMessage",
    resolution: "stateApprovedResolution",
    tone: "info",
    step: 5
  }
};

const scenarioLabel: Record<ScenarioId, TranslationKey> = {
  valid: "scenarioValid",
  empty: "scenarioEmpty",
  required: "scenarioRequired",
  duplicate: "scenarioDuplicate",
  incompatible: "scenarioIncompatible",
  disconnected: "scenarioDisconnected",
  endpoint: "scenarioEndpoint",
  missingLoad: "scenarioMissingLoad",
  anchorReview: "scenarioAnchorReview",
  manualOverride: "scenarioManualOverride",
  catalogWarning: "scenarioCatalogWarning",
  loading: "scenarioLoading",
  noResults: "scenarioNoResults",
  approved: "scenarioApproved"
};

const sourceLabel: Record<SourceKind, TranslationKey> = {
  user: "sourceUser",
  projectDefault: "sourceProjectDefault",
  catalog: "sourceCatalog",
  mountingTemplate: "sourceMountingTemplate",
  designRule: "sourceDesignRule",
  manualOverride: "sourceManualOverride",
  calculated: "sourceCalculated"
};

const emptyConnection: Connection = {
  id: "connection-draft",
  type: "continuation",
  participants: ["", ""],
  materialBehavior: "none",
  supportBehavior: "shared",
  supportsBefore: 0,
  supportsAfter: 0,
  manualConnectorCorrection: 0,
  manualProduct: "",
  manualProductQuantity: 0,
  reason: "",
  note: ""
};

const emptyManualItem: Omit<ManualItem, "id"> = {
  kind: "freeText",
  productCode: "",
  description: "",
  quantity: 1,
  unit: "pcs",
  reason: "",
  note: "",
  reserveBehavior: "project",
  reservePercent: 0,
  packagingRounding: "off",
  packageSize: 1,
  manuallyAdjusted: false
};

function cloneInitialState(): PrototypeState {
  return JSON.parse(JSON.stringify(initialState)) as PrototypeState;
}

export function UxPrototype() {
  const [language, setLanguage] = useState<Language>("bg");
  const [activeStep, setActiveStep] = useState(0);
  const [scenario, setScenario] = useState<ScenarioId>("valid");
  const [state, setState] = useState<PrototypeState>(cloneInitialState);
  const [selectedRouteId, setSelectedRouteId] = useState("route-a");
  const [geometryTab, setGeometryTab] = useState<"routes" | "connections">("routes");
  const [routeDraft, setRouteDraft] = useState({ code: "", name: "", description: "" });
  const [connectionDraft, setConnectionDraft] = useState<Connection>({
    ...emptyConnection,
    participants: [...emptyConnection.participants]
  });
  const [manualDraft, setManualDraft] = useState<Omit<ManualItem, "id">>({ ...emptyManualItem });
  const [pendingRemoveRouteId, setPendingRemoveRouteId] = useState<string | null>(null);
  const [automationNotice, setAutomationNotice] = useState<string | null>(null);
  const [expandedBomRow, setExpandedBomRow] = useState<string | null>("bom-linear-6");

  const labels = copy[language];
  const t: Translator = (key, values) =>
    values ? formatMessage(labels[key], values) : labels[key];
  const activeRoute = state.routes.find((route) => route.id === selectedRouteId) ?? state.routes[0];
  const readOnly = scenario === "approved";
  const meta = scenarioMeta[scenario];
  const bomRows = useMemo(() => calculateMockBom(state, language), [state, language]);
  const currentStep = steps[activeStep] ?? steps[0]!;
  const nextStep = steps[activeStep + 1];

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  function changeScenario(next: ScenarioId) {
    setScenario(next);
    setActiveStep(scenarioMeta[next].step);
    if (["duplicate", "disconnected", "endpoint"].includes(next)) setGeometryTab("routes");
  }

  function updateRoute(routeId: string, patch: Partial<Route>) {
    setScenario((current) => (current === "approved" ? current : "valid"));
    setState((current) => ({
      ...current,
      routes: current.routes.map((route) => (route.id === routeId ? { ...route, ...patch } : route))
    }));
  }

  function addManualSeed(kind: ManualItem["kind"]) {
    setManualDraft({ ...emptyManualItem, kind });
    setActiveStep(4);
  }

  function removeRoute(routeId: string) {
    const connected = state.connections.some((connection) =>
      connection.participants.some((participant) => participant.startsWith(`${routeId}:`))
    );
    if (connected) {
      setPendingRemoveRouteId(routeId);
      return;
    }
    commitRemoveRoute(routeId);
  }

  function commitRemoveRoute(routeId: string) {
    setState((current) => ({
      ...current,
      routes: current.routes.filter((route) => route.id !== routeId),
      connections: current.connections.filter(
        (connection) =>
          !connection.participants.some((participant) => participant.startsWith(`${routeId}:`))
      )
    }));
    setSelectedRouteId((current) =>
      current === routeId ? (state.routes.find((route) => route.id !== routeId)?.id ?? "") : current
    );
    setPendingRemoveRouteId(null);
  }

  const isBlocked =
    ["empty", "required", "duplicate", "incompatible", "disconnected"].includes(scenario) ||
    !canAdvanceStep(activeStep, state);

  return (
    <main className="prototype-shell">
      <header className="prototype-header">
        <div className="brand-mark" aria-hidden="true">
          N
        </div>
        <div className="brand-copy">
          <strong>Niedax Generator</strong>
          <span>{t("appSubtitle")}</span>
        </div>
        <div className="prototype-actions">
          <span className="prototype-badge">{t("contractBadge")}</span>
          <span className="user-chip">{t("prototypeUser")}</span>
          <div className="language-switch" aria-label={t("uiLanguage")}>
            <button
              className={language === "bg" ? "active" : ""}
              onClick={() => setLanguage("bg")}
              type="button"
            >
              BG
            </button>
            <button
              className={language === "en" ? "active" : ""}
              onClick={() => setLanguage("en")}
              type="button"
            >
              EN
            </button>
          </div>
        </div>
      </header>

      <div className="prototype-layout">
        <nav className="step-rail" aria-label={t("configuration")}>
          <p className="rail-label">{t("configuration")}</p>
          {steps.map((step, index) => (
            <button
              className={index === activeStep ? "selected" : index < activeStep ? "complete" : ""}
              key={step.id}
              onClick={() => setActiveStep(index)}
              type="button"
            >
              <span>{index < activeStep ? "✓" : index + 1}</span>
              {t(step.labelKey as TranslationKey)}
            </button>
          ))}
          <aside className="rail-note">
            <strong>{t("prototypeData")}</strong>
            <p>{t("prototypeDataNote")}</p>
          </aside>
        </nav>

        <section className="prototype-workspace">
          <div className="workspace-heading">
            <div>
              <p className="eyebrow">
                {t("stepOf", { current: activeStep + 1, total: steps.length })}
              </p>
              <h1>{t(`${currentStep.id}Title` as TranslationKey)}</h1>
              <p>{t(currentStep.descriptionKey as TranslationKey)}</p>
            </div>
            <label className="scenario-select">
              {t("scenario")}
              <select
                value={scenario}
                onChange={(event) => changeScenario(event.target.value as ScenarioId)}
              >
                {scenarios.map((item) => (
                  <option key={item} value={item}>
                    {t(scenarioLabel[item])}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {scenario !== "loading" ? (
            <Notice
              tone={meta.tone}
              title={t(meta.title)}
              message={t(meta.message)}
              resolution={t(meta.resolution)}
              t={t}
            />
          ) : null}
          {automationNotice ? (
            <Notice
              tone="info"
              title={t("information")}
              message={automationNotice}
              onClose={() => setAutomationNotice(null)}
              t={t}
            />
          ) : null}

          {scenario === "loading" ? (
            <LoadingState t={t} />
          ) : (
            <fieldset className="content-fieldset" disabled={readOnly}>
              {readOnly ? <div className="readonly-strip">● {t("readOnlyHint")}</div> : null}
              {activeStep === 0 ? (
                <ProjectStep
                  state={state}
                  scenario={scenario}
                  setState={setState}
                  setScenario={setScenario}
                  t={t}
                />
              ) : null}
              {activeStep === 1 ? (
                <SystemStep
                  state={state}
                  scenario={scenario}
                  activeRoute={activeRoute}
                  setState={setState}
                  updateRoute={updateRoute}
                  setScenario={setScenario}
                  setAutomationNotice={setAutomationNotice}
                  language={language}
                  t={t}
                />
              ) : null}
              {activeStep === 2 ? (
                <GeometryStep
                  state={state}
                  scenario={scenario}
                  activeRoute={activeRoute}
                  selectedRouteId={selectedRouteId}
                  setSelectedRouteId={setSelectedRouteId}
                  routeDraft={routeDraft}
                  setRouteDraft={setRouteDraft}
                  geometryTab={geometryTab}
                  setGeometryTab={setGeometryTab}
                  connectionDraft={connectionDraft}
                  setConnectionDraft={setConnectionDraft}
                  setState={setState}
                  updateRoute={updateRoute}
                  removeRoute={removeRoute}
                  addManualSeed={addManualSeed}
                  setAutomationNotice={setAutomationNotice}
                  setScenario={setScenario}
                  t={t}
                />
              ) : null}
              {activeStep === 3 ? (
                <SupportsStep
                  state={state}
                  activeRoute={activeRoute}
                  setState={setState}
                  updateRoute={updateRoute}
                  scenario={scenario}
                  t={t}
                />
              ) : null}
              {activeStep === 4 ? (
                <LoadStep
                  state={state}
                  setState={setState}
                  manualDraft={manualDraft}
                  setManualDraft={setManualDraft}
                  scenario={scenario}
                  setAutomationNotice={setAutomationNotice}
                  setScenario={setScenario}
                  t={t}
                />
              ) : null}
              {activeStep === 5 ? (
                <ResultsStep
                  state={state}
                  bomRows={bomRows}
                  scenario={scenario}
                  expandedBomRow={expandedBomRow}
                  setExpandedBomRow={setExpandedBomRow}
                  t={t}
                />
              ) : null}
            </fieldset>
          )}

          <footer className="step-footer">
            <span>{t("changesLocal")}</span>
            <div>
              {activeStep > 0 ? (
                <button
                  className="secondary"
                  onClick={() => setActiveStep((current) => current - 1)}
                  type="button"
                >
                  ← {t("previous")}
                </button>
              ) : null}
              {activeStep < steps.length - 1 ? (
                <button
                  className="primary"
                  disabled={isBlocked || readOnly}
                  onClick={() => setActiveStep((current) => current + 1)}
                  type="button"
                >
                  {t("continue", { step: nextStep ? t(nextStep.labelKey as TranslationKey) : "" })}{" "}
                  →
                </button>
              ) : (
                <button className="secondary" onClick={() => setActiveStep(0)} type="button">
                  {t("backToProject")}
                </button>
              )}
            </div>
          </footer>
        </section>
      </div>

      {pendingRemoveRouteId ? (
        <div className="modal-backdrop" role="presentation">
          <section
            aria-labelledby="remove-route-title"
            aria-modal="true"
            className="modal"
            role="dialog"
          >
            <div className="modal-icon" aria-hidden="true">
              !
            </div>
            <h2 id="remove-route-title">{t("removeRouteTitle")}</h2>
            <p>{t("removeRouteMessage")}</p>
            <div className="modal-actions">
              <button
                className="secondary"
                onClick={() => setPendingRemoveRouteId(null)}
                type="button"
              >
                {t("cancel")}
              </button>
              <button
                className="danger"
                onClick={() => commitRemoveRoute(pendingRemoveRouteId)}
                type="button"
              >
                {t("confirmRemove")}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

function ProjectStep({
  state,
  scenario,
  setState,
  setScenario,
  t
}: Readonly<{
  state: PrototypeState;
  scenario: ScenarioId;
  setState: React.Dispatch<React.SetStateAction<PrototypeState>>;
  setScenario: React.Dispatch<React.SetStateAction<ScenarioId>>;
  t: Translator;
}>) {
  const empty = scenario === "empty";
  const invalid = scenario === "required";
  const projectErrors = projectValidation(state.project);
  function updateProject(patch: Partial<PrototypeState["project"]>) {
    setScenario("valid");
    setState((current) => ({ ...current, project: { ...current.project, ...patch } }));
  }
  return (
    <div className="step-stack">
      <Card number="01" title={t("identity")} source="user" t={t}>
        <div className="field-grid">
          <Field
            label={t("projectCode")}
            source="user"
            required
            error={
              invalid || projectErrors.includes("projectCodeRequired")
                ? t("requiredMessage")
                : undefined
            }
            t={t}
          >
            <input
              aria-invalid={invalid}
              value={empty || invalid ? "" : state.project.code}
              onChange={(event) => updateProject({ code: event.target.value })}
            />
          </Field>
          <Field
            label={t("projectName")}
            source="user"
            required
            error={
              empty || projectErrors.includes("projectNameRequired")
                ? t("requiredMessage")
                : undefined
            }
            t={t}
          >
            <input
              value={empty ? "" : state.project.name}
              onChange={(event) => updateProject({ name: event.target.value })}
            />
          </Field>
          <Field className="span-2" label={t("description")} source="user" t={t}>
            <textarea
              value={empty ? "" : state.project.description}
              onChange={(event) => updateProject({ description: event.target.value })}
            />
          </Field>
        </div>
      </Card>
      <Card number="02" title={t("defaultsRevision")} source="projectDefault" t={t}>
        <div className="field-grid three">
          <Field
            label={`${t("defaultReserve")} (%)`}
            source="projectDefault"
            required
            error={
              invalid || projectErrors.includes("reserveRange") ? t("reserveInvalid") : undefined
            }
            t={t}
          >
            <div className="input-with-unit">
              <input
                aria-invalid={invalid}
                min="0"
                max="100"
                type="number"
                value={invalid ? -5 : state.project.defaultReservePercent}
                onChange={(event) =>
                  updateProject({ defaultReservePercent: Number(event.target.value) })
                }
              />
              <span>%</span>
            </div>
          </Field>
          <Field label={t("status")} source="user" t={t}>
            <select
              value={state.project.status}
              onChange={(event) =>
                updateProject({ status: event.target.value as PrototypeState["project"]["status"] })
              }
            >
              <option value="draft">{t("draft")}</option>
              <option value="review">{t("review")}</option>
              <option value="approved">{t("approved")}</option>
            </select>
          </Field>
          <Field label={t("revision")} source="calculated" t={t}>
            <input readOnly value={state.project.revision} />
          </Field>
        </div>
        <p className="field-hint">{t("languagePreserved")}</p>
      </Card>
    </div>
  );
}

function SystemStep({
  state,
  scenario,
  activeRoute,
  setState,
  updateRoute,
  setScenario,
  setAutomationNotice,
  language,
  t
}: Readonly<{
  state: PrototypeState;
  scenario: ScenarioId;
  activeRoute: Route | undefined;
  setState: React.Dispatch<React.SetStateAction<PrototypeState>>;
  updateRoute: (routeId: string, patch: Partial<Route>) => void;
  setScenario: React.Dispatch<React.SetStateAction<ScenarioId>>;
  setAutomationNotice: React.Dispatch<React.SetStateAction<string | null>>;
  language: Language;
  t: Translator;
}>) {
  const shownSystem =
    scenario === "incompatible"
      ? { seriesId: "series-e5", dimensionId: "e5-110-300", finishId: "finish-e5", variantId: null }
      : state.system;
  const fixture = systemFixtures.find((series) => series.id === shownSystem.seriesId);
  function updateSelection(patch: Partial<PrototypeState["system"]>) {
    setScenario("valid");
    setState((current) => ({ ...current, system: { ...current.system, ...patch } }));
  }
  function changeSeries(seriesId: string) {
    const result = selectSeries(state.system, seriesId);
    setScenario("valid");
    setState((current) => ({ ...current, system: result.selection }));
    if (result.cleared.length > 0) {
      const fieldKeys: Record<string, TranslationKey> = {
        dimension: "dimension",
        finish: "materialFinish",
        variant: "productVariant",
        series: "systemFamily"
      };
      setAutomationNotice(
        t("clearedSelection", {
          fields: result.cleared.map((field) => t(fieldKeys[field] ?? "systemFamily")).join(", ")
        })
      );
    }
  }
  return (
    <div className="step-stack">
      <div className="fixture-banner">
        <span>FIXTURE</span>
        <strong>{t("fixtureLabel")}</strong>
        <small>fixture-catalogue-0.1</small>
      </div>
      <Card number="01" title={t("systemFamily")} source="catalog" t={t}>
        <div className="field-grid two-by-two">
          <Field
            label={t("systemFamily")}
            source="catalog"
            required
            error={!shownSystem.seriesId ? t("requiredMessage") : undefined}
            t={t}
          >
            <select
              value={shownSystem.seriesId ?? ""}
              onChange={(event) => changeSeries(event.target.value)}
            >
              <option value="">{t("chooseOption")}</option>
              {systemFixtures.map((series) => (
                <option key={series.id} value={series.id}>
                  {fixtureLabel(series.label, language)}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label={t("dimension")}
            source="catalog"
            required
            error={
              shownSystem.seriesId && !shownSystem.dimensionId ? t("requiredMessage") : undefined
            }
            t={t}
          >
            <select
              disabled={!fixture}
              value={shownSystem.dimensionId ?? ""}
              onChange={(event) => updateSelection({ dimensionId: event.target.value || null })}
            >
              <option value="">{t("chooseOption")}</option>
              {fixture?.dimensions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label={t("materialFinish")}
            source="catalog"
            required
            error={shownSystem.seriesId && !shownSystem.finishId ? t("requiredMessage") : undefined}
            t={t}
          >
            <select
              disabled={!fixture}
              value={shownSystem.finishId ?? ""}
              onChange={(event) => updateSelection({ finishId: event.target.value || null })}
            >
              <option value="">{t("chooseOption")}</option>
              {fixture?.finishes.map((option) => (
                <option key={option.id} value={option.id}>
                  {fixtureLabel(option.label, language)}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label={t("productVariant")}
            source="catalog"
            required
            error={
              fixture?.variants.length === 0
                ? t("noCompatibleVariants")
                : !shownSystem.variantId
                  ? t("requiredMessage")
                  : undefined
            }
            t={t}
          >
            <select
              disabled={!fixture || fixture.variants.length === 0}
              value={shownSystem.variantId ?? ""}
              onChange={(event) => updateSelection({ variantId: event.target.value || null })}
            >
              <option value="">{t("chooseOption")}</option>
              {fixture?.variants.map((option) => (
                <option key={option.id} value={option.id}>
                  {fixtureLabel(option.label, language)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <p className="field-hint">{t("dependentHint")}</p>
        <div className="card-actions">
          <button
            className="secondary"
            disabled={!activeRoute || !state.system.seriesId || scenario === "incompatible"}
            onClick={() => activeRoute && updateRoute(activeRoute.id, state.system)}
            type="button"
          >
            {t("applySystemToRoute")}
          </button>
        </div>
      </Card>
    </div>
  );
}

function GeometryStep({
  state,
  scenario,
  activeRoute,
  selectedRouteId,
  setSelectedRouteId,
  routeDraft,
  setRouteDraft,
  geometryTab,
  setGeometryTab,
  connectionDraft,
  setConnectionDraft,
  setState,
  updateRoute,
  removeRoute,
  addManualSeed,
  setAutomationNotice,
  setScenario,
  t
}: Readonly<{
  state: PrototypeState;
  scenario: ScenarioId;
  activeRoute: Route | undefined;
  selectedRouteId: string;
  setSelectedRouteId: React.Dispatch<React.SetStateAction<string>>;
  routeDraft: { code: string; name: string; description: string };
  setRouteDraft: React.Dispatch<
    React.SetStateAction<{ code: string; name: string; description: string }>
  >;
  geometryTab: "routes" | "connections";
  setGeometryTab: React.Dispatch<React.SetStateAction<"routes" | "connections">>;
  connectionDraft: Connection;
  setConnectionDraft: React.Dispatch<React.SetStateAction<Connection>>;
  setState: React.Dispatch<React.SetStateAction<PrototypeState>>;
  updateRoute: (routeId: string, patch: Partial<Route>) => void;
  removeRoute: (routeId: string) => void;
  addManualSeed: (kind: ManualItem["kind"]) => void;
  setAutomationNotice: React.Dispatch<React.SetStateAction<string | null>>;
  setScenario: React.Dispatch<React.SetStateAction<ScenarioId>>;
  t: Translator;
}>) {
  const displayedRoutes = scenario === "empty" ? [] : state.routes;
  const draftCode = scenario === "duplicate" ? "R-01" : routeDraft.code;
  const duplicateError =
    scenario === "duplicate" ||
    (draftCode.length > 0 && !isRouteCodeUnique(state.routes, draftCode));

  function addRoute() {
    if (
      !routeDraft.code ||
      !routeDraft.name ||
      !routeDraft.description ||
      !isRouteCodeUnique(state.routes, routeDraft.code)
    )
      return;
    const id = `route-${Date.now().toString(36)}`;
    const route: Route = {
      id,
      ...routeDraft,
      ...state.system,
      sectionLengthM: 6,
      startPoint: "",
      endPoint: "",
      startEndpointType: "free",
      endEndpointType: "free",
      additionalSupportsAroundFittings: 0,
      geometry: []
    };
    setState((current) => ({ ...current, routes: [...current.routes, route] }));
    setSelectedRouteId(id);
    setRouteDraft({ code: "", name: "", description: "" });
    setAutomationNotice(t("routeAdded"));
  }

  function duplicateRoute(route: Route) {
    let suffix = 1;
    let code = `${route.code}-COPY`;
    while (!isRouteCodeUnique(state.routes, code)) code = `${route.code}-COPY-${++suffix}`;
    const id = `route-${Date.now().toString(36)}`;
    const copyRoute: Route = {
      ...route,
      id,
      code,
      name: `${route.name} · ${t("duplicate")}`,
      geometry: route.geometry.map((item, index) => ({
        ...item,
        id: `${id}-geometry-${index + 1}`
      }))
    };
    setState((current) => ({ ...current, routes: [...current.routes, copyRoute] }));
    setSelectedRouteId(id);
  }

  function updateGeometry(itemId: string, patch: Partial<Route["geometry"][number]>) {
    if (!activeRoute) return;
    updateRoute(activeRoute.id, {
      geometry: activeRoute.geometry.map((item) =>
        item.id === itemId ? { ...item, ...patch } : item
      )
    });
  }

  function addGeometry(kind: "straight" | "fitting") {
    if (!activeRoute) return;
    const id = `${activeRoute.id}-geometry-${Date.now().toString(36)}`;
    updateRoute(activeRoute.id, {
      geometry: [
        ...activeRoute.geometry,
        kind === "straight" ? { id, kind, lengthM: 1 } : { id, kind, fittingType: "horizontalBend" }
      ]
    });
  }

  return (
    <div className="step-stack">
      <div className="segmented-tabs" role="tablist">
        <button
          aria-selected={geometryTab === "routes"}
          className={geometryTab === "routes" ? "active" : ""}
          onClick={() => setGeometryTab("routes")}
          role="tab"
          type="button"
        >
          {t("routesTab")}
        </button>
        <button
          aria-selected={geometryTab === "connections"}
          className={geometryTab === "connections" ? "active" : ""}
          onClick={() => setGeometryTab("connections")}
          role="tab"
          type="button"
        >
          {t("connectionsTab")} <span>{state.connections.length}</span>
        </button>
      </div>
      {geometryTab === "routes" ? (
        <>
          <Card number="01" title={t("routeList")} source="user" t={t}>
            <div className="route-table-wrap">
              <table className="route-table">
                <thead>
                  <tr>
                    <th>{t("routeCode")}</th>
                    <th>{t("routeName")}</th>
                    <th>{t("routeSummary")}</th>
                    <th>{t("geometrySummary")}</th>
                    <th>{t("validationStatus")}</th>
                    <th>{t("warnings")}</th>
                    <th>
                      <span className="sr-only">{t("open")}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {displayedRoutes.map((route) => {
                    const incomplete =
                      hasIncompleteGeometry(route) ||
                      (scenario === "disconnected" && route.id === selectedRouteId);
                    const warningCount = [route.startEndpointType, route.endEndpointType].filter(
                      (type) => endpointEffect(type, false).material === "unresolved"
                    ).length;
                    return (
                      <tr
                        className={route.id === selectedRouteId ? "selected-row" : ""}
                        key={route.id}
                      >
                        <td>
                          <strong>{route.code}</strong>
                          <small>{route.id}</small>
                        </td>
                        <td>
                          <strong>{route.name}</strong>
                          <small>{route.description}</small>
                        </td>
                        <td>
                          {route.seriesId
                            ? `${route.seriesId.replace("series-", "").toUpperCase()} · ${route.dimensionId ?? "—"}`
                            : "—"}
                        </td>
                        <td>
                          {geometryLength(route).toFixed(1)} m · {route.geometry.length}{" "}
                          {t("orderedGeometry").toLocaleLowerCase()}
                        </td>
                        <td>
                          <StatusBadge
                            tone={incomplete ? "error" : "success"}
                            label={t(incomplete ? "incomplete" : "valid")}
                          />
                        </td>
                        <td>
                          <span className={warningCount ? "warning-count active" : "warning-count"}>
                            {warningCount}
                          </span>
                        </td>
                        <td>
                          <div className="row-actions">
                            <button onClick={() => setSelectedRouteId(route.id)} type="button">
                              {t("open")}
                            </button>
                            <button onClick={() => duplicateRoute(route)} type="button">
                              {t("duplicate")}
                            </button>
                            <button
                              className="text-danger"
                              onClick={() => removeRoute(route.id)}
                              type="button"
                            >
                              {t("remove")}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {displayedRoutes.length === 0 ? (
                    <tr>
                      <td className="empty-cell" colSpan={7}>
                        {t("stateEmptyMessage")}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <div className="inline-form">
              <Field
                label={t("routeCode")}
                source="user"
                required
                error={duplicateError ? t("uniqueCodeError") : undefined}
                t={t}
              >
                <input
                  aria-invalid={duplicateError}
                  value={draftCode}
                  onChange={(event) => {
                    setScenario("valid");
                    setRouteDraft((current) => ({ ...current, code: event.target.value }));
                  }}
                />
              </Field>
              <Field label={t("routeName")} source="user" required t={t}>
                <input
                  value={routeDraft.name}
                  onChange={(event) =>
                    setRouteDraft((current) => ({ ...current, name: event.target.value }))
                  }
                />
              </Field>
              <Field label={t("routeDescription")} source="user" required t={t}>
                <input
                  value={routeDraft.description}
                  onChange={(event) =>
                    setRouteDraft((current) => ({ ...current, description: event.target.value }))
                  }
                />
              </Field>
              <button
                className="primary align-end"
                disabled={
                  duplicateError || !routeDraft.code || !routeDraft.name || !routeDraft.description
                }
                onClick={addRoute}
                type="button"
              >
                + {t("addRoute")}
              </button>
            </div>
          </Card>
          {activeRoute ? (
            <>
              <Card
                number="02"
                title={`${t("activeRoute")} · ${activeRoute.code}`}
                source="user"
                t={t}
              >
                <div className="field-grid three">
                  <Field
                    label={t("routeCode")}
                    source="user"
                    required
                    error={
                      !isRouteCodeUnique(state.routes, activeRoute.code, activeRoute.id)
                        ? t("uniqueCodeError")
                        : undefined
                    }
                    t={t}
                  >
                    <input
                      value={activeRoute.code}
                      onChange={(event) =>
                        updateRoute(activeRoute.id, { code: event.target.value })
                      }
                    />
                  </Field>
                  <Field label={t("routeName")} source="user" required t={t}>
                    <input
                      value={activeRoute.name}
                      onChange={(event) =>
                        updateRoute(activeRoute.id, { name: event.target.value })
                      }
                    />
                  </Field>
                  <Field label={t("additionalFittingSupports")} source="user" t={t}>
                    <input
                      min="0"
                      type="number"
                      value={activeRoute.additionalSupportsAroundFittings}
                      onChange={(event) =>
                        updateRoute(activeRoute.id, {
                          additionalSupportsAroundFittings: Number(event.target.value)
                        })
                      }
                    />
                  </Field>
                  <Field
                    className="span-3"
                    label={t("routeDescription")}
                    source="user"
                    required
                    t={t}
                  >
                    <textarea
                      value={activeRoute.description}
                      onChange={(event) =>
                        updateRoute(activeRoute.id, { description: event.target.value })
                      }
                    />
                  </Field>
                </div>
              </Card>
              <Card number="03" title={t("orderedGeometry")} source="user" t={t}>
                <div className="geometry-list">
                  {activeRoute.geometry.map((item, index) => {
                    const forceInvalid =
                      scenario === "disconnected" && item.kind === "straight" && index === 0;
                    return (
                      <div className="geometry-row" key={item.id}>
                        <div className="drag-handle" aria-hidden="true">
                          ⠿
                        </div>
                        <span className="geometry-index">{String(index + 1).padStart(2, "0")}</span>
                        <div className="geometry-kind">
                          <strong>
                            {t(item.kind === "straight" ? "straightSection" : "fitting")}
                          </strong>
                          <small>{item.id}</small>
                        </div>
                        {item.kind === "straight" ? (
                          <Field
                            label={`${t("length")} (m)`}
                            source="user"
                            error={
                              forceInvalid || !item.lengthM || item.lengthM <= 0
                                ? t("invalidLength")
                                : undefined
                            }
                            t={t}
                          >
                            <div className="input-with-unit">
                              <input
                                aria-invalid={forceInvalid || !item.lengthM || item.lengthM <= 0}
                                min="0.01"
                                step="0.1"
                                type="number"
                                value={forceInvalid ? 0 : (item.lengthM ?? 0)}
                                onChange={(event) =>
                                  updateGeometry(item.id, { lengthM: Number(event.target.value) })
                                }
                              />
                              <span>m</span>
                            </div>
                          </Field>
                        ) : (
                          <Field label={t("fittingType")} source="user" t={t}>
                            <select
                              value={item.fittingType}
                              onChange={(event) =>
                                updateGeometry(item.id, {
                                  fittingType: event.target.value as NonNullable<
                                    Route["geometry"][number]["fittingType"]
                                  >
                                })
                              }
                            >
                              <option value="horizontalBend">{t("horizontalBend")}</option>
                              <option value="verticalBend">{t("verticalBend")}</option>
                              <option value="tee">{t("teeConnection")}</option>
                              <option value="transition">{t("transition")}</option>
                              <option value="custom">{t("custom")}</option>
                            </select>
                          </Field>
                        )}
                        <div className="icon-actions">
                          <button
                            aria-label={t("moveUp")}
                            disabled={index === 0}
                            onClick={() =>
                              updateRoute(activeRoute.id, {
                                geometry: moveGeometryItem(activeRoute.geometry, item.id, -1)
                              })
                            }
                            type="button"
                          >
                            ↑
                          </button>
                          <button
                            aria-label={t("moveDown")}
                            disabled={index === activeRoute.geometry.length - 1}
                            onClick={() =>
                              updateRoute(activeRoute.id, {
                                geometry: moveGeometryItem(activeRoute.geometry, item.id, 1)
                              })
                            }
                            type="button"
                          >
                            ↓
                          </button>
                          <button
                            aria-label={t("duplicateItem")}
                            onClick={() =>
                              updateRoute(activeRoute.id, {
                                geometry: [
                                  ...activeRoute.geometry.slice(0, index + 1),
                                  { ...item, id: `${item.id}-copy-${Date.now().toString(36)}` },
                                  ...activeRoute.geometry.slice(index + 1)
                                ]
                              })
                            }
                            type="button"
                          >
                            ⧉
                          </button>
                          <button
                            aria-label={t("remove")}
                            className="text-danger"
                            onClick={() =>
                              updateRoute(activeRoute.id, {
                                geometry: activeRoute.geometry.filter(
                                  (entry) => entry.id !== item.id
                                )
                              })
                            }
                            type="button"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="card-actions left">
                  <button
                    className="secondary"
                    onClick={() => addGeometry("straight")}
                    type="button"
                  >
                    + {t("addStraight")}
                  </button>
                  <button
                    className="secondary"
                    onClick={() => addGeometry("fitting")}
                    type="button"
                  >
                    + {t("addFitting")}
                  </button>
                </div>
              </Card>
              <Card number="04" title={t("startEndPoints")} source="user" t={t}>
                <div className="endpoint-grid">
                  <EndpointEditor
                    label={t("startEndpoint")}
                    pointLabel={t("startPoint")}
                    point={activeRoute.startPoint}
                    type={activeRoute.startEndpointType}
                    scenario={scenario}
                    onPointChange={(value) => updateRoute(activeRoute.id, { startPoint: value })}
                    onTypeChange={(value) =>
                      updateRoute(activeRoute.id, { startEndpointType: value })
                    }
                    addManualSeed={addManualSeed}
                    t={t}
                  />
                  <EndpointEditor
                    label={t("endEndpoint")}
                    pointLabel={t("endPoint")}
                    point={activeRoute.endPoint}
                    type={activeRoute.endEndpointType}
                    scenario={scenario}
                    onPointChange={(value) => updateRoute(activeRoute.id, { endPoint: value })}
                    onTypeChange={(value) =>
                      updateRoute(activeRoute.id, { endEndpointType: value })
                    }
                    addManualSeed={addManualSeed}
                    t={t}
                  />
                </div>
              </Card>
            </>
          ) : null}
        </>
      ) : (
        <ConnectionEditor
          state={state}
          draft={connectionDraft}
          setDraft={setConnectionDraft}
          setState={setState}
          t={t}
        />
      )}
    </div>
  );
}

function EndpointEditor({
  label,
  pointLabel,
  point,
  type,
  scenario,
  onPointChange,
  onTypeChange,
  addManualSeed,
  t
}: Readonly<{
  label: string;
  pointLabel: string;
  point: string;
  type: EndpointType;
  scenario: ScenarioId;
  onPointChange: (value: string) => void;
  onTypeChange: (value: EndpointType) => void;
  addManualSeed: (kind: ManualItem["kind"]) => void;
  t: Translator;
}>) {
  const effect = endpointEffect(type, false);
  const unresolved = effect.material === "unresolved" || scenario === "endpoint";
  return (
    <div className="endpoint-card">
      <div className="endpoint-card-title">
        <strong>{label}</strong>
        <StatusBadge
          tone={unresolved ? "review" : "neutral"}
          label={unresolved ? t("engineeringReview") : t("information")}
        />
      </div>
      <Field label={pointLabel} source="user" required t={t}>
        <input value={point} onChange={(event) => onPointChange(event.target.value)} />
      </Field>
      <Field label={label} source="user" t={t}>
        <select value={type} onChange={(event) => onTypeChange(event.target.value as EndpointType)}>
          <option value="free">{t("endpointFree")}</option>
          <option value="endCap">{t("endpointCap")}</option>
          <option value="equipment">{t("endpointEquipment")}</option>
          <option value="continuation">{t("endpointContinuation")}</option>
          <option value="splice">{t("endpointSplice")}</option>
          <option value="custom">{t("endpointCustom")}</option>
        </select>
      </Field>
      <div className={`effect-preview ${unresolved ? "review" : "info"}`}>
        <span>{unresolved ? "◇" : "ℹ"}</span>
        <div>
          <strong>{t("endpointMaterialPreview")}</strong>
          <p>
            {t(
              scenario === "endpoint" ? "endpointEffectUnresolved" : (effect.key as TranslationKey)
            )}
          </p>
        </div>
      </div>
      {type === "custom" || unresolved ? (
        <div className="inline-actions">
          <button className="secondary" onClick={() => addManualSeed("catalog")} type="button">
            {t("addCatalogProduct")}
          </button>
          <button className="secondary" onClick={() => addManualSeed("freeText")} type="button">
            {t("addFreeText")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ConnectionEditor({
  state,
  draft,
  setDraft,
  setState,
  t
}: Readonly<{
  state: PrototypeState;
  draft: Connection;
  setDraft: React.Dispatch<React.SetStateAction<Connection>>;
  setState: React.Dispatch<React.SetStateAction<PrototypeState>>;
  t: Translator;
}>) {
  const error = connectionParticipantError(draft.type, draft.participants);
  const participantCount = draft.type === "tee" ? 3 : 2;
  const routeEndpoints = state.routes.flatMap((route) => [
    {
      value: `${route.id}:start`,
      label: `${route.code} · ${t("startPoint")} · ${route.startPoint || "—"}`
    },
    {
      value: `${route.id}:end`,
      label: `${route.code} · ${t("endPoint")} · ${route.endPoint || "—"}`
    }
  ]);
  function updateType(type: ConnectionType) {
    const count = type === "tee" ? 3 : 2;
    setDraft((current) => ({
      ...current,
      type,
      participants: Array.from({ length: count }, (_, index) => current.participants[index] ?? ""),
      materialBehavior:
        type === "continuation"
          ? "none"
          : current.materialBehavior === "none"
            ? "automatic"
            : current.materialBehavior
    }));
  }
  function save() {
    if (error) return;
    const saved = {
      ...draft,
      id: `connection-${Date.now().toString(36)}`,
      participants: [...draft.participants]
    };
    setState((current) => ({ ...current, connections: [...current.connections, saved] }));
    setDraft({ ...emptyConnection, participants: [...emptyConnection.participants] });
  }
  return (
    <>
      <Card number="01" title={t("connectionEditor")} source="user" t={t}>
        <div className="connection-grid">
          <Field label={t("connectionType")} source="user" required t={t}>
            <select
              value={draft.type}
              onChange={(event) => updateType(event.target.value as ConnectionType)}
            >
              <option value="continuation">{t("logicalContinuation")}</option>
              <option value="splice">{t("physicalSplice")}</option>
              <option value="horizontalBend">{t("horizontalBend")}</option>
              <option value="verticalBend">{t("verticalBend")}</option>
              <option value="tee">{t("teeConnection")}</option>
              <option value="transition">{t("transition")}</option>
              <option value="custom">{t("custom")}</option>
            </select>
          </Field>
          <Field
            label={t("physicalMaterialBehavior")}
            source={draft.materialBehavior === "manual" ? "manualOverride" : "catalog"}
            t={t}
          >
            <select
              value={draft.materialBehavior}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  materialBehavior: event.target.value as Connection["materialBehavior"]
                }))
              }
            >
              <option value="automatic">{t("behaviorAutomatic")}</option>
              <option value="none">{t("behaviorNone")}</option>
              <option value="manual">{t("behaviorManual")}</option>
            </select>
          </Field>
          {Array.from({ length: participantCount }, (_, index) => (
            <Field
              key={index}
              label={t(index === 0 ? "endpointA" : index === 1 ? "endpointB" : "endpointC")}
              source="user"
              required
              error={error ? t(error, { count: participantCount }) : undefined}
              t={t}
            >
              <select
                value={draft.participants[index] ?? ""}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    participants: current.participants.map((value, participantIndex) =>
                      participantIndex === index ? event.target.value : value
                    )
                  }))
                }
              >
                <option value="">{t("chooseEndpoint")}</option>
                {routeEndpoints.map((endpoint) => (
                  <option key={endpoint.value} value={endpoint.value}>
                    {endpoint.label}
                  </option>
                ))}
              </select>
            </Field>
          ))}
          <Field label={t("supportBehavior")} source="user" t={t}>
            <select
              value={draft.supportBehavior}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  supportBehavior: event.target.value as Connection["supportBehavior"]
                }))
              }
            >
              <option value="shared">{t("sharedSupports")}</option>
              <option value="separate">{t("separateSupports")}</option>
            </select>
          </Field>
          <Field label={t("supportsBefore")} source="user" t={t}>
            <input
              min="0"
              type="number"
              value={draft.supportsBefore}
              onChange={(event) =>
                setDraft((current) => ({ ...current, supportsBefore: Number(event.target.value) }))
              }
            />
          </Field>
          <Field label={t("supportsAfter")} source="user" t={t}>
            <input
              min="0"
              type="number"
              value={draft.supportsAfter}
              onChange={(event) =>
                setDraft((current) => ({ ...current, supportsAfter: Number(event.target.value) }))
              }
            />
          </Field>
          <Field label={t("connectorCorrection")} source="manualOverride" t={t}>
            <input
              type="number"
              value={draft.manualConnectorCorrection}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  manualConnectorCorrection: Number(event.target.value)
                }))
              }
            />
          </Field>
          <Field label={t("manualConnectionProduct")} source="user" t={t}>
            <input
              value={draft.manualProduct}
              onChange={(event) =>
                setDraft((current) => ({ ...current, manualProduct: event.target.value }))
              }
            />
          </Field>
          <Field label={t("quantity")} source="user" t={t}>
            <input
              min="0"
              type="number"
              value={draft.manualProductQuantity}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  manualProductQuantity: Number(event.target.value)
                }))
              }
            />
          </Field>
          <Field className="span-2" label={t("reason")} source="user" required t={t}>
            <input
              value={draft.reason}
              onChange={(event) =>
                setDraft((current) => ({ ...current, reason: event.target.value }))
              }
            />
          </Field>
          <Field className="span-2" label={t("note")} source="user" t={t}>
            <textarea
              value={draft.note}
              onChange={(event) =>
                setDraft((current) => ({ ...current, note: event.target.value }))
              }
            />
          </Field>
        </div>
        <div className={`rule-callout ${draft.type === "continuation" ? "info" : "review"}`}>
          <strong>
            {draft.type === "continuation" ? t("noPhysicalMaterial") : t("physicalEffects")}
          </strong>
          <span>
            {draft.type === "continuation"
              ? t("logicalConnectionRule")
              : t("endpointEffectUnresolved")}
          </span>
        </div>
        <div className="card-actions">
          <button
            className="primary"
            disabled={Boolean(error) || !draft.reason}
            onClick={save}
            type="button"
          >
            {t("saveConnection")}
          </button>
        </div>
      </Card>
      <Card number="02" title={t("savedConnections")} source="user" t={t}>
        <div className="connection-list">
          {state.connections.map((connection) => (
            <div className="connection-summary" key={connection.id}>
              <div>
                <strong>{connection.id}</strong>
                <span>
                  {t(
                    connection.type === "continuation"
                      ? "logicalContinuation"
                      : connection.type === "splice"
                        ? "physicalSplice"
                        : connection.type === "tee"
                          ? "teeConnection"
                          : connection.type === "transition"
                            ? "transition"
                            : connection.type === "horizontalBend"
                              ? "horizontalBend"
                              : connection.type === "verticalBend"
                                ? "verticalBend"
                                : "custom"
                  )}
                </span>
              </div>
              <code>{connection.participants.join(" ↔ ")}</code>
              <StatusBadge
                tone={connection.materialBehavior === "none" ? "neutral" : "review"}
                label={
                  connection.materialBehavior === "none"
                    ? t("noPhysicalMaterial")
                    : t("physicalEffects")
                }
              />
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

function SupportsStep({
  state,
  activeRoute,
  setState,
  updateRoute,
  scenario,
  t
}: Readonly<{
  state: PrototypeState;
  activeRoute: Route | undefined;
  setState: React.Dispatch<React.SetStateAction<PrototypeState>>;
  updateRoute: (routeId: string, patch: Partial<Route>) => void;
  scenario: ScenarioId;
  t: Translator;
}>) {
  function updateSupport(patch: Partial<PrototypeState["supports"]>) {
    setState((current) => ({ ...current, supports: { ...current.supports, ...patch } }));
  }
  const anchorReview =
    scenario === "anchorReview" ||
    state.supports.substrate === "unknown" ||
    state.supports.manualAnchorOverride;
  return (
    <div className="step-stack">
      <Notice
        tone="review"
        title={t("engineeringReview")}
        message={t("anchorWarning")}
        resolution={t("stateAnchorReviewResolution")}
        t={t}
      />
      <div className="split-cards">
        <Card number="01" title={t("supportConfiguration")} source="user" t={t}>
          <div className="field-grid">
            <Field label={`${t("supportSpacing")} (m)`} source="user" required t={t}>
              <div className="input-with-unit">
                <input
                  min="0.1"
                  step="0.1"
                  type="number"
                  value={state.supports.spacingM}
                  onChange={(event) => updateSupport({ spacingM: Number(event.target.value) })}
                />
                <span>m</span>
              </div>
            </Field>
            <Field label={t("supportType")} source="user" t={t}>
              <select
                value={state.supports.supportType}
                onChange={(event) =>
                  updateSupport({
                    supportType: event.target.value as PrototypeState["supports"]["supportType"]
                  })
                }
              >
                <option value="wall">{t("supportWall")}</option>
                <option value="ceiling">{t("supportCeiling")}</option>
                <option value="floor">{t("supportFloor")}</option>
                <option value="custom">{t("custom")}</option>
              </select>
            </Field>
            <Field label={t("constructionTemplate")} source="mountingTemplate" required t={t}>
              <select
                value={state.supports.templateId}
                onChange={(event) => {
                  const templateId = event.target.value as PrototypeState["supports"]["templateId"];
                  updateSupport({
                    templateId,
                    anchorsPerMountingPoint:
                      templateId === "twoPoint"
                        ? 2
                        : templateId === "fourPoint"
                          ? 4
                          : state.supports.anchorsPerMountingPoint
                  });
                }}
              >
                <option value="twoPoint">{t("templateTwoPoint")}</option>
                <option value="fourPoint">{t("templateFourPoint")}</option>
                <option value="custom">{t("templateCustom")}</option>
              </select>
            </Field>
            <Field label={t("supportBehavior")} source="user" t={t}>
              <select
                value={state.supports.connectionBehavior}
                onChange={(event) =>
                  updateSupport({
                    connectionBehavior: event.target
                      .value as PrototypeState["supports"]["connectionBehavior"]
                  })
                }
              >
                <option value="shared">{t("sharedSupports")}</option>
                <option value="separate">{t("separateSupports")}</option>
              </select>
            </Field>
            <Field label={t("additionalSupports")} source="user" t={t}>
              <input
                min="0"
                type="number"
                value={state.supports.additionalSupportCount}
                onChange={(event) =>
                  updateSupport({ additionalSupportCount: Number(event.target.value) })
                }
              />
            </Field>
          </div>
        </Card>
        <Card number="02" title={t("routeSectionLength")} source="user" t={t}>
          <div className="section-choice" role="radiogroup" aria-label={t("routeSectionLength")}>
            <button
              aria-checked={activeRoute?.sectionLengthM === 6}
              className={activeRoute?.sectionLengthM === 6 ? "selected" : ""}
              disabled={!activeRoute}
              onClick={() => activeRoute && updateRoute(activeRoute.id, { sectionLengthM: 6 })}
              role="radio"
              type="button"
            >
              <span>6 m</span>
              <strong>{t("section6m")}</strong>
              <small>{t("sourceProjectDefault")}</small>
            </button>
            <button
              aria-checked={activeRoute?.sectionLengthM === 3}
              className={activeRoute?.sectionLengthM === 3 ? "selected" : ""}
              disabled={!activeRoute}
              onClick={() => activeRoute && updateRoute(activeRoute.id, { sectionLengthM: 3 })}
              role="radio"
              type="button"
            >
              <span>3 m</span>
              <strong>{t("section3m")}</strong>
              <small>{t("sourceUser")}</small>
            </button>
          </div>
          <p className="field-hint">{t("noAutomaticMix")}</p>
        </Card>
      </div>
      <Card
        number="03"
        title={t("anchorConfiguration")}
        source={state.supports.manualAnchorOverride ? "manualOverride" : "mountingTemplate"}
        t={t}
      >
        <div className="field-grid four">
          <Field
            label={t("anchorModel")}
            source="user"
            required
            error={anchorReview ? t("anchorWarning") : undefined}
            t={t}
          >
            <input
              placeholder={t("anchorPlaceholder")}
              value={state.supports.anchorModel}
              onChange={(event) => updateSupport({ anchorModel: event.target.value })}
            />
          </Field>
          <Field label={t("anchorSize")} source="user" required t={t}>
            <input
              placeholder={t("anchorPlaceholder")}
              value={state.supports.anchorSize}
              onChange={(event) => updateSupport({ anchorSize: event.target.value })}
            />
          </Field>
          <Field
            label={t("anchorsPerPoint")}
            source={state.supports.manualAnchorOverride ? "manualOverride" : "mountingTemplate"}
            t={t}
          >
            <input
              readOnly={!state.supports.manualAnchorOverride}
              min="1"
              type="number"
              value={
                state.supports.manualAnchorOverride
                  ? state.supports.manualAnchorQuantity
                  : state.supports.anchorsPerMountingPoint
              }
              onChange={(event) =>
                updateSupport({ manualAnchorQuantity: Number(event.target.value) })
              }
            />
          </Field>
          <Field
            label={t("substrate")}
            source="user"
            required
            error={state.supports.substrate === "unknown" ? t("anchorWarning") : undefined}
            t={t}
          >
            <select
              value={state.supports.substrate}
              onChange={(event) =>
                updateSupport({
                  substrate: event.target.value as PrototypeState["supports"]["substrate"]
                })
              }
            >
              <option value="concrete">{t("concrete")}</option>
              <option value="steel">{t("steel")}</option>
              <option value="masonry">{t("masonry")}</option>
              <option value="unknown">{t("unknown")}</option>
            </select>
          </Field>
        </div>
        <label className="check-row">
          <input
            checked={state.supports.manualAnchorOverride || scenario === "manualOverride"}
            onChange={(event) => updateSupport({ manualAnchorOverride: event.target.checked })}
            type="checkbox"
          />
          <span>
            <strong>{t("manualAnchorOverride")}</strong>
            <small>{t("stateManualOverrideResolution")}</small>
          </span>
        </label>
      </Card>
      <Card
        number="04"
        title={t("wstbConfiguration")}
        source={state.supports.wstbMode === "manual" ? "manualOverride" : "designRule"}
        t={t}
      >
        <div className="field-grid">
          <Field label={t("wstbMode")} source="designRule" required t={t}>
            <select
              value={state.supports.wstbMode}
              onChange={(event) =>
                updateSupport({
                  wstbMode: event.target.value as PrototypeState["supports"]["wstbMode"]
                })
              }
            >
              <option value="one">{t("wstbOne")}</option>
              <option value="two">{t("wstbTwo")}</option>
              <option value="manual">{t("wstbManual")}</option>
            </select>
          </Field>
          {state.supports.wstbMode === "manual" ? (
            <Field label={t("wstbManualQuantity")} source="manualOverride" required t={t}>
              <input
                min="0"
                type="number"
                value={state.supports.wstbManualQuantity}
                onChange={(event) =>
                  updateSupport({ wstbManualQuantity: Number(event.target.value) })
                }
              />
            </Field>
          ) : null}
        </div>
        <div className="rule-callout warning">
          <strong>{t("warning")}</strong>
          <span>{t("designRuleWarning")}</span>
        </div>
      </Card>
    </div>
  );
}

function LoadStep({
  state,
  setState,
  manualDraft,
  setManualDraft,
  scenario,
  setAutomationNotice,
  setScenario,
  t
}: Readonly<{
  state: PrototypeState;
  setState: React.Dispatch<React.SetStateAction<PrototypeState>>;
  manualDraft: Omit<ManualItem, "id">;
  setManualDraft: React.Dispatch<React.SetStateAction<Omit<ManualItem, "id">>>;
  scenario: ScenarioId;
  setAutomationNotice: React.Dispatch<React.SetStateAction<string | null>>;
  setScenario: React.Dispatch<React.SetStateAction<ScenarioId>>;
  t: Translator;
}>) {
  const shownLoad = scenario === "missingLoad" ? null : state.load.cableLoadKgM;
  function updateLoad(patch: Partial<PrototypeState["load"]>) {
    if (scenario === "missingLoad" || scenario === "manualOverride") setScenario("valid");
    setState((current) => ({ ...current, load: { ...current.load, ...patch } }));
  }
  function addItem() {
    if (!manualDraft.description || manualDraft.quantity <= 0 || !manualDraft.reason) return;
    const item: ManualItem = { ...manualDraft, id: `manual-${Date.now().toString(36)}` };
    updateLoad({ manualItems: [...state.load.manualItems, item] });
    setManualDraft({ ...emptyManualItem });
    setAutomationNotice(t("manualItemAdded"));
  }
  function toggleAccessory(accessory: string) {
    updateLoad({
      selectedAccessories: state.load.selectedAccessories.includes(accessory)
        ? state.load.selectedAccessories.filter((item) => item !== accessory)
        : [...state.load.selectedAccessories, accessory]
    });
  }
  return (
    <div className="step-stack">
      <div className="split-cards">
        <Card number="01" title={t("cableLoad")} source="user" t={t}>
          <Field
            label={`${t("cableLoad")} (kg/m)`}
            source="user"
            error={shownLoad === null ? t("missingLoadWarning") : undefined}
            t={t}
          >
            <div className="input-with-unit">
              <input
                min="0"
                step="0.1"
                type="number"
                value={shownLoad ?? ""}
                onChange={(event) =>
                  updateLoad({
                    cableLoadKgM: event.target.value ? Number(event.target.value) : null
                  })
                }
              />
              <span>kg/m</span>
            </div>
          </Field>
          <p className="field-hint">{t("cableLoadHint")}</p>
        </Card>
        <Card number="02" title={t("accessories")} source="catalog" t={t}>
          <label className="check-row">
            <input
              checked={state.load.selectedAccessories.includes("protectiveCover")}
              onChange={() => toggleAccessory("protectiveCover")}
              type="checkbox"
            />
            <span>
              <strong>{t("protectiveCover")}</strong>
              <small>{t("endpointEffectUnresolved")}</small>
            </span>
          </label>
          <label className="check-row">
            <input
              checked={state.load.selectedAccessories.includes("divider")}
              onChange={() => toggleAccessory("divider")}
              type="checkbox"
            />
            <span>
              <strong>{t("divider")}</strong>
              <small>{t("endpointEffectUnresolved")}</small>
            </span>
          </label>
        </Card>
      </div>
      <Card number="03" title={t("manualMaterials")} source="user" t={t}>
        <div className="manual-items-list">
          {state.load.manualItems.map((item) => (
            <div className="manual-item-row" key={item.id}>
              <div>
                <StatusBadge tone="manual" label={t("statusManual")} />
                <strong>{item.description}</strong>
                <small>{item.productCode || t("codeUnresolved")}</small>
              </div>
              <span>
                {item.quantity} {item.unit}
              </span>
              <span>
                {t(
                  item.reserveBehavior === "project"
                    ? "useProjectReserve"
                    : item.reserveBehavior === "custom"
                      ? "customReserve"
                      : "reserveDisabled"
                )}
              </span>
              <button
                className="text-danger"
                onClick={() =>
                  updateLoad({
                    manualItems: state.load.manualItems.filter((entry) => entry.id !== item.id)
                  })
                }
                type="button"
              >
                {t("remove")}
              </button>
            </div>
          ))}
          {state.load.manualItems.length === 0 ? (
            <p className="empty-cell">{t("emptyManualItems")}</p>
          ) : null}
        </div>
        <div className="manual-form">
          <Field label={t("materialKind")} source="user" required t={t}>
            <select
              value={manualDraft.kind}
              onChange={(event) =>
                setManualDraft((current) => ({
                  ...current,
                  kind: event.target.value as ManualItem["kind"]
                }))
              }
            >
              <option value="catalog">{t("cataloguedNiedax")}</option>
              <option value="freeText">{t("freeTextMaterial")}</option>
            </select>
          </Field>
          {manualDraft.kind === "catalog" ? (
            <Field
              label={t("productCode")}
              source="user"
              required
              error={!manualDraft.productCode ? t("endpointEffectUnresolved") : undefined}
              t={t}
            >
              <input
                value={manualDraft.productCode}
                onChange={(event) =>
                  setManualDraft((current) => ({ ...current, productCode: event.target.value }))
                }
              />
            </Field>
          ) : null}
          <Field
            className={manualDraft.kind === "freeText" ? "span-2" : ""}
            label={t("englishDescription")}
            source="user"
            required
            t={t}
          >
            <input
              value={manualDraft.description}
              onChange={(event) =>
                setManualDraft((current) => ({ ...current, description: event.target.value }))
              }
            />
          </Field>
          <Field label={t("quantity")} source="user" required t={t}>
            <input
              min="0.01"
              step="0.1"
              type="number"
              value={manualDraft.quantity}
              onChange={(event) =>
                setManualDraft((current) => ({ ...current, quantity: Number(event.target.value) }))
              }
            />
          </Field>
          <Field label={t("unit")} source="user" required t={t}>
            <select
              value={manualDraft.unit}
              onChange={(event) =>
                setManualDraft((current) => ({
                  ...current,
                  unit: event.target.value as ManualItem["unit"]
                }))
              }
            >
              <option value="pcs">{t("unitsPieces")}</option>
              <option value="m">{t("unitsMetres")}</option>
              <option value="kg">{t("unitsKilograms")}</option>
            </select>
          </Field>
          <Field label={t("reserveBehavior")} source="user" t={t}>
            <select
              value={manualDraft.reserveBehavior}
              onChange={(event) =>
                setManualDraft((current) => ({
                  ...current,
                  reserveBehavior: event.target.value as ManualItem["reserveBehavior"]
                }))
              }
            >
              <option value="project">{t("useProjectReserve")}</option>
              <option value="off">{t("reserveDisabled")}</option>
              <option value="custom">{t("customReserve")}</option>
            </select>
          </Field>
          {manualDraft.reserveBehavior === "custom" ? (
            <Field
              label={`${t("customReservePercent")} (%)`}
              source="manualOverride"
              required
              t={t}
            >
              <input
                min="0"
                max="100"
                type="number"
                value={manualDraft.reservePercent}
                onChange={(event) =>
                  setManualDraft((current) => ({
                    ...current,
                    reservePercent: Number(event.target.value)
                  }))
                }
              />
            </Field>
          ) : null}
          <Field label={t("packagingRounding")} source="user" t={t}>
            <select
              value={manualDraft.packagingRounding}
              onChange={(event) =>
                setManualDraft((current) => ({
                  ...current,
                  packagingRounding: event.target.value as ManualItem["packagingRounding"]
                }))
              }
            >
              <option value="on">{t("packagingOn")}</option>
              <option value="off">{t("packagingOff")}</option>
            </select>
          </Field>
          <Field label={t("packageSize")} source="user" t={t}>
            <input
              min="1"
              type="number"
              value={manualDraft.packageSize}
              onChange={(event) =>
                setManualDraft((current) => ({
                  ...current,
                  packageSize: Number(event.target.value)
                }))
              }
            />
          </Field>
          <Field className="span-2" label={t("reason")} source="user" required t={t}>
            <input
              value={manualDraft.reason}
              onChange={(event) =>
                setManualDraft((current) => ({ ...current, reason: event.target.value }))
              }
            />
          </Field>
          <Field className="span-2" label={t("note")} source="user" t={t}>
            <textarea
              value={manualDraft.note}
              onChange={(event) =>
                setManualDraft((current) => ({ ...current, note: event.target.value }))
              }
            />
          </Field>
          <label className="check-row span-2">
            <input
              checked={manualDraft.manuallyAdjusted || scenario === "manualOverride"}
              onChange={(event) =>
                setManualDraft((current) => ({
                  ...current,
                  manuallyAdjusted: event.target.checked
                }))
              }
              type="checkbox"
            />
            <span>
              <strong>{t("quantityAdjusted")}</strong>
              <small>{t("stateManualOverrideResolution")}</small>
            </span>
          </label>
          <div className="card-actions span-2">
            <button
              className="primary"
              disabled={
                !manualDraft.description ||
                manualDraft.quantity <= 0 ||
                !manualDraft.reason ||
                (manualDraft.kind === "catalog" && !manualDraft.productCode)
              }
              onClick={addItem}
              type="button"
            >
              + {t("addManualItem")}
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function ResultsStep({
  state,
  bomRows,
  scenario,
  expandedBomRow,
  setExpandedBomRow,
  t
}: Readonly<{
  state: PrototypeState;
  bomRows: BomRow[];
  scenario: ScenarioId;
  expandedBomRow: string | null;
  setExpandedBomRow: React.Dispatch<React.SetStateAction<string | null>>;
  t: Translator;
}>) {
  const totalLength = state.routes.reduce((total, route) => total + geometryLength(route), 0);
  const reviewCount = bomRows.filter(
    (row) => row.status === "review" || row.status === "assumption" || row.warnings.length > 0
  ).length;
  if (scenario === "noResults")
    return (
      <div className="empty-results">
        <div aria-hidden="true">∅</div>
        <h2>{t("noResultsTitle")}</h2>
        <p>{t("noResultsMessage")}</p>
      </div>
    );
  return (
    <div className="step-stack">
      <div className="result-summary">
        <div>
          <span>{t("summaryRoutes")}</span>
          <strong>{state.routes.length}</strong>
          <small>
            {state.connections.length} {t("connectionsTab").toLocaleLowerCase()}
          </small>
        </div>
        <div>
          <span>{t("summaryStraightLength")}</span>
          <strong>{totalLength.toFixed(1)} m</strong>
          <small>
            {state.routes.reduce((total, route) => total + route.geometry.length, 0)}{" "}
            {t("orderedGeometry").toLocaleLowerCase()}
          </small>
        </div>
        <div className="review">
          <span>{t("summaryReviewItems")}</span>
          <strong>{reviewCount}</strong>
          <small>{t("engineeringReview")}</small>
        </div>
      </div>
      <Notice
        tone="review"
        title={t("prototypeData")}
        message={t("prototypeResultWarning")}
        resolution={t("stateAnchorReviewResolution")}
        t={t}
      />
      <Card number="01" title={t("detailedBom")} source="calculated" t={t}>
        <div className="bom-table-wrap">
          <table className="bom-table">
            <thead>
              <tr>
                <th>
                  {t("category")} / {t("productCode")}
                </th>
                <th>{t("englishDescription")}</th>
                <th>{t("technicalQty")}</th>
                <th>{t("packageSize")}</th>
                <th>{t("packageCount")}</th>
                <th>{t("orderQty")}</th>
                <th>{t("spareQty")}</th>
                <th>{t("source")}</th>
                <th>{t("ruleStatus")}</th>
                <th>{t("warnings")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {bomRows.flatMap((row) => {
                const statusKey: Record<BomRow["status"], TranslationKey> = {
                  catalog: "statusCatalog",
                  calculated: "statusCalculated",
                  assumption: "statusAssumption",
                  review: "statusReview",
                  manual: "statusManual"
                };
                const tone =
                  row.status === "review"
                    ? "review"
                    : row.status === "assumption"
                      ? "warning"
                      : row.status === "manual"
                        ? "manual"
                        : "success";
                const main = (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.category}</strong>
                      <small>{row.productCode ?? t("codeUnresolved")}</small>
                    </td>
                    <td>
                      {row.description}
                      <small>
                        {t("includedItems")}:{" "}
                        {row.includedItems.length ? row.includedItems.join("; ") : t("none")}
                      </small>
                    </td>
                    <td className="numeric">
                      <strong>{row.technicalQuantity}</strong> {row.unit}
                    </td>
                    <td className="numeric">
                      {row.packageSize} {row.unit}
                    </td>
                    <td className="numeric">{formatQuantity(row.packageCount)}</td>
                    <td className="numeric">
                      <strong>{formatQuantity(row.orderQuantity)}</strong> {row.unit}
                    </td>
                    <td className="numeric">
                      {formatQuantity(row.spareQuantity)} {row.unit}
                    </td>
                    <td>
                      <span>{row.source}</span>
                      <small>{row.sourceVersion}</small>
                      {row.manualOverride ? <em>{t("manualIndicator")}</em> : null}
                    </td>
                    <td>
                      <StatusBadge tone={tone} label={t(statusKey[row.status])} />
                    </td>
                    <td>
                      {row.warnings.length ? (
                        <span className="warning-count active">{row.warnings.length}</span>
                      ) : (
                        <span className="warning-count">0</span>
                      )}
                    </td>
                    <td>
                      <button
                        className="why-button"
                        onClick={() =>
                          setExpandedBomRow((current) => (current === row.id ? null : row.id))
                        }
                        type="button"
                      >
                        {expandedBomRow === row.id ? t("hideWhy") : t("why")}
                      </button>
                    </td>
                  </tr>
                );
                const detail =
                  expandedBomRow === row.id ? (
                    <tr className="why-row" key={`${row.id}-why`}>
                      <td colSpan={11}>
                        <div className="why-panel">
                          <div>
                            <strong>{t("why")}</strong>
                            <span>{row.id}</span>
                          </div>
                          <ol>
                            {row.why.map((line) => (
                              <li key={line}>{line}</li>
                            ))}
                          </ol>
                          {row.warnings.length ? (
                            <ul className="warning-list">
                              {row.warnings.map((warning) => (
                                <li key={warning}>◇ {warning}</li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ) : null;
                return detail ? [main, detail] : [main];
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function formatQuantity(value: number) {
  return Number.isInteger(value) ? value.toString() : value.toFixed(2);
}

function LoadingState({ t }: Readonly<{ t: Translator }>) {
  return (
    <div className="loading-state" aria-live="polite">
      <div className="loading-heading">
        <span className="spinner" aria-hidden="true" />
        <strong>{t("loadingTitle")}</strong>
      </div>
      {[1, 2, 3].map((item) => (
        <div className="skeleton-card" key={item}>
          <span />
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}

function Card({
  number,
  title,
  source,
  children,
  t
}: Readonly<{
  number: string;
  title: string;
  source: SourceKind;
  children: ReactNode;
  t: Translator;
}>) {
  return (
    <section className="form-card">
      <div className="card-heading">
        <div>
          <span className="section-number">{number}</span>
          <h2>{title}</h2>
        </div>
        <span className={`source-pill source-${source}`}>{t(sourceLabel[source])}</span>
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  source,
  required,
  error,
  className = "",
  children,
  t
}: Readonly<{
  label: string;
  source: SourceKind;
  required?: boolean | undefined;
  error?: string | undefined;
  className?: string | undefined;
  children: ReactNode;
  t: Translator;
}>) {
  return (
    <label className={`field ${className} ${error ? "has-error" : ""}`}>
      <span className="field-label">
        <span>
          {label}
          {required ? <em> *</em> : null}
        </span>
        <small>{t(sourceLabel[source])}</small>
      </span>
      {children}
      {error ? (
        <span className="field-error" role="alert">
          ! {error}
        </span>
      ) : null}
    </label>
  );
}

function Notice({
  tone,
  title,
  message,
  resolution,
  onClose,
  t
}: Readonly<{
  tone: Tone;
  title: string;
  message: string;
  resolution?: string;
  onClose?: () => void;
  t: Translator;
}>) {
  const icon = tone === "error" ? "!" : tone === "warning" ? "△" : tone === "review" ? "◇" : "i";
  const labelKey: Record<Tone, TranslationKey> = {
    info: "information",
    warning: "warning",
    error: "blockingError",
    review: "engineeringReview"
  };
  return (
    <div className={`notice notice-${tone}`} role={tone === "error" ? "alert" : "status"}>
      <div className="notice-icon" aria-hidden="true">
        {icon}
      </div>
      <div>
        <small>{t(labelKey[tone])}</small>
        <strong>{title}</strong>
        <span>{message}</span>
        {resolution ? <p>{resolution}</p> : null}
      </div>
      {onClose ? (
        <button aria-label={t("remove")} onClick={onClose} type="button">
          ×
        </button>
      ) : null}
    </div>
  );
}

function StatusBadge({
  tone,
  label
}: Readonly<{
  tone: "success" | "warning" | "error" | "review" | "manual" | "neutral";
  label: string;
}>) {
  const icon =
    tone === "success"
      ? "✓"
      : tone === "error"
        ? "!"
        : tone === "warning"
          ? "△"
          : tone === "review"
            ? "◇"
            : tone === "manual"
              ? "✎"
              : "•";
  return (
    <span className={`status-badge status-${tone}`}>
      <span aria-hidden="true">{icon}</span>
      {label}
    </span>
  );
}
