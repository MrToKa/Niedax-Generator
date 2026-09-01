"use client";

import type {
  EditorCatalogResponseV2,
  ProjectConnectionDraftV2,
  ProjectDraftInputV2,
  ProjectEndpointDraftV2,
  ProjectManualItemDraftV2,
  ProjectRouteDraftV2
} from "@niedax/domain";
import { type Dispatch, type SetStateAction, useEffect, useRef, useState } from "react";

import {
  compatibleProducts,
  compatibleTemplateProducts,
  reconcileRouteCatalog,
  selectableProducts,
  selectStraightProduct,
  templateComponentProducts
} from "@/lib/catalog-selection";
import {
  connectionParticipantCount,
  createRouteDraft,
  duplicateRoute,
  endpointTypeForConnection,
  isRouteCodeUnique,
  moveGeometry,
  removeRouteAndReferences,
  updateRoute
} from "@/lib/editor-state";
import { type TranslationKey, useI18n } from "@/lib/i18n";
import { isManualItemValid, removeManualItem, upsertManualItem } from "@/lib/manual-items";

import { FormField, StatusNotice } from "./shared-ui";

export type EditorStep =
  "project" | "routes" | "geometry" | "connections" | "supports" | "load" | "results";

export const editorSteps: readonly { id: EditorStep; label: TranslationKey }[] = [
  { id: "project", label: "project" },
  { id: "routes", label: "routes" },
  { id: "geometry", label: "geometry" },
  { id: "connections", label: "connections" },
  { id: "supports", label: "supports" },
  { id: "load", label: "loadAndManual" },
  { id: "results", label: "results" }
];

interface EditorSectionsProps {
  readonly activeStep: EditorStep;
  readonly draft: ProjectDraftInputV2;
  readonly catalog: EditorCatalogResponseV2 | null;
  readonly fieldErrors: ReadonlyMap<string, string>;
  readonly selectedRouteId: string | null;
  readonly onBufferedChange: (dirty: boolean) => void;
  readonly setDraft: Dispatch<SetStateAction<ProjectDraftInputV2 | null>>;
  readonly setSelectedRouteId: Dispatch<SetStateAction<string | null>>;
}

export function EditorSections(props: EditorSectionsProps) {
  const update = (next: (draft: ProjectDraftInputV2) => ProjectDraftInputV2) =>
    props.setDraft((current) => (current ? next(current) : current));
  if (props.activeStep === "project")
    return <ProjectSection draft={props.draft} fieldErrors={props.fieldErrors} update={update} />;
  if (props.activeStep === "routes") return <RoutesSection {...props} update={update} />;
  if (props.activeStep === "geometry") return <GeometrySection {...props} update={update} />;
  if (props.activeStep === "connections") return <ConnectionsSection {...props} update={update} />;
  if (props.activeStep === "supports") return <SupportsSection {...props} update={update} />;
  return <LoadAndManualSection {...props} update={update} />;
}

interface SectionProps extends EditorSectionsProps {
  readonly update: (next: (draft: ProjectDraftInputV2) => ProjectDraftInputV2) => void;
}

function fieldError(
  errors: ReadonlyMap<string, string>,
  ...paths: readonly string[]
): string | undefined {
  for (const path of paths) {
    const error = errors.get(path);
    if (error) return error;
  }
  return undefined;
}

function ProjectSection({
  draft,
  fieldErrors,
  update
}: Pick<SectionProps, "draft" | "fieldErrors" | "update">) {
  const { t } = useI18n();
  const reserve = Number(draft.defaultReservePercent);
  return (
    <section
      aria-labelledby="project-section-title"
      className="editor-card"
      data-field-path="project"
      tabIndex={-1}
    >
      <h2 id="project-section-title">{t("project")}</h2>
      <div className="form-grid">
        <FormField
          error={draft.code.trim() ? fieldError(fieldErrors, "code") : t("required")}
          label={t("projectCode")}
          required
        >
          {(props) => (
            <input
              {...props}
              data-field-path="code"
              maxLength={100}
              value={draft.code}
              onChange={(event) => update((current) => ({ ...current, code: event.target.value }))}
            />
          )}
        </FormField>
        <FormField
          error={draft.name.trim() ? fieldError(fieldErrors, "name") : t("required")}
          label={t("projectName")}
          required
        >
          {(props) => (
            <input
              {...props}
              data-field-path="name"
              maxLength={500}
              value={draft.name}
              onChange={(event) => update((current) => ({ ...current, name: event.target.value }))}
            />
          )}
        </FormField>
        <FormField className="span-full" label={t("description")}>
          {(props) => (
            <textarea
              {...props}
              value={draft.description ?? ""}
              onChange={(event) =>
                update((current) => ({ ...current, description: event.target.value || null }))
              }
            />
          )}
        </FormField>
        <FormField
          error={
            !Number.isFinite(reserve) || reserve < 0 || reserve > 100
              ? t("invalidPercent")
              : fieldError(fieldErrors, "defaultReservePercent")
          }
          label={`${t("defaultReserve")} (%)`}
          required
        >
          {(props) => (
            <input
              {...props}
              data-field-path="defaultReservePercent"
              inputMode="decimal"
              value={draft.defaultReservePercent}
              onChange={(event) =>
                update((current) => ({ ...current, defaultReservePercent: event.target.value }))
              }
            />
          )}
        </FormField>
        <FormField label={t("uiLanguage")} required>
          {(props) => (
            <select
              {...props}
              value={draft.defaultLocale}
              onChange={(event) =>
                update((current) => ({
                  ...current,
                  defaultLocale: event.target.value as "bg" | "en"
                }))
              }
            >
              <option value="bg">Български</option>
              <option value="en">English</option>
            </select>
          )}
        </FormField>
      </div>
    </section>
  );
}

function RoutesSection({
  draft,
  catalog,
  fieldErrors,
  selectedRouteId,
  setSelectedRouteId,
  onBufferedChange,
  update
}: SectionProps) {
  const { t } = useI18n();
  const [newRoute, setNewRoute] = useState({ code: "", name: "", description: "" });
  const [pendingRemove, setPendingRemove] = useState<string | null>(null);
  const [selectionNotice, setSelectionNotice] = useState<string | null>(null);
  const routeListRef = useRef<HTMLElement>(null);
  const routeDetailsRef = useRef<HTMLElement>(null);
  const route = draft.routes.find((item) => item.id === selectedRouteId) ?? draft.routes[0] ?? null;
  const routeIndex = route ? draft.routes.findIndex((item) => item.id === route.id) : -1;
  const duplicateCode = newRoute.code.length > 0 && !isRouteCodeUnique(draft.routes, newRoute.code);
  const bufferDirty = Object.values(newRoute).some((value) => value.length > 0);
  useEffect(() => onBufferedChange(bufferDirty), [bufferDirty, onBufferedChange]);
  useEffect(() => () => onBufferedChange(false), [onBufferedChange]);
  function addRoute() {
    if (!newRoute.code.trim() || !newRoute.name.trim() || duplicateCode) return;
    const route = createRouteDraft(newRoute.code, newRoute.name, newRoute.description || null);
    update((current) => ({ ...current, routes: [...current.routes, route] }));
    setSelectedRouteId(route.id);
    setNewRoute({ code: "", name: "", description: "" });
    window.requestAnimationFrame(() => routeDetailsRef.current?.focus());
  }
  function applyRoute(updateRouteValue: (route: ProjectRouteDraftV2) => ProjectRouteDraftV2) {
    if (route) update((current) => updateRoute(current, route.id, updateRouteValue));
  }
  function confirmRemove() {
    if (!pendingRemove) return;
    update((current) => removeRouteAndReferences(current, pendingRemove));
    setSelectedRouteId((current) =>
      current === pendingRemove
        ? (draft.routes.find((item) => item.id !== pendingRemove)?.id ?? null)
        : current
    );
    setPendingRemove(null);
    window.requestAnimationFrame(() => routeListRef.current?.focus());
  }
  function copyRoute(routeId: string) {
    const result = duplicateRoute(draft, routeId);
    if (result) {
      update(() => result.draft);
      setSelectedRouteId(result.routeId);
      window.requestAnimationFrame(() => routeDetailsRef.current?.focus());
    }
  }
  return (
    <div className="editor-stack">
      {selectionNotice ? <StatusNotice live>{selectionNotice}</StatusNotice> : null}
      <section
        aria-labelledby="route-list-title"
        className="editor-card"
        data-field-path="routes"
        ref={routeListRef}
        tabIndex={-1}
      >
        <div className="card-heading">
          <h2 id="route-list-title">{t("routes")}</h2>
          <span className="status-badge">{draft.routes.length}</span>
        </div>
        <div className="route-list">
          {draft.routes.map((item) => (
            <div
              className={`route-list-item ${item.id === route?.id ? "selected" : ""}`}
              key={item.id}
            >
              <button
                className="secondary-button"
                onClick={() => setSelectedRouteId(item.id)}
                type="button"
              >
                <span>
                  <strong>{item.code}</strong>
                  <small>{item.name}</small>
                </span>
              </button>
              <div className="row-actions">
                <button
                  className="secondary-button"
                  onClick={() => copyRoute(item.id)}
                  type="button"
                >
                  {t("duplicate")}
                </button>
                <button
                  className="danger-button"
                  onClick={() => setPendingRemove(item.id)}
                  type="button"
                >
                  {t("remove")}
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="form-grid">
          <FormField
            error={duplicateCode ? t("uniqueRouteCode") : undefined}
            label={t("routeCode")}
            required
          >
            {(props) => (
              <input
                {...props}
                value={newRoute.code}
                onChange={(event) =>
                  setNewRoute((current) => ({ ...current, code: event.target.value }))
                }
              />
            )}
          </FormField>
          <FormField label={t("routeName")} required>
            {(props) => (
              <input
                {...props}
                value={newRoute.name}
                onChange={(event) =>
                  setNewRoute((current) => ({ ...current, name: event.target.value }))
                }
              />
            )}
          </FormField>
          <FormField className="span-full" label={t("routeDescription")}>
            {(props) => (
              <input
                {...props}
                value={newRoute.description}
                onChange={(event) =>
                  setNewRoute((current) => ({ ...current, description: event.target.value }))
                }
              />
            )}
          </FormField>
        </div>
        <button
          className="primary-button"
          disabled={duplicateCode || !newRoute.code.trim() || !newRoute.name.trim()}
          onClick={addRoute}
          type="button"
        >
          + {t("addRoute")}
        </button>
      </section>
      {route ? (
        <section
          aria-labelledby="route-details-title"
          className="editor-card"
          ref={routeDetailsRef}
          tabIndex={-1}
        >
          <h2 id="route-details-title">
            {t("route")} · {route.code}
          </h2>
          <div className="form-grid">
            <FormField
              error={
                isRouteCodeUnique(draft.routes, route.code, route.id)
                  ? fieldError(fieldErrors, `routes.${routeIndex}.code`)
                  : t("uniqueRouteCode")
              }
              label={t("routeCode")}
              required
            >
              {(props) => (
                <input
                  {...props}
                  data-field-path={`routes.${routeIndex}.code`}
                  maxLength={100}
                  value={route.code}
                  onChange={(event) =>
                    applyRoute((current) => ({ ...current, code: event.target.value }))
                  }
                />
              )}
            </FormField>
            <FormField
              error={
                route.name.trim()
                  ? fieldError(fieldErrors, `routes.${routeIndex}.name`)
                  : t("required")
              }
              label={t("routeName")}
              required
            >
              {(props) => (
                <input
                  {...props}
                  data-field-path={`routes.${routeIndex}.name`}
                  maxLength={500}
                  value={route.name}
                  onChange={(event) =>
                    applyRoute((current) => ({ ...current, name: event.target.value }))
                  }
                />
              )}
            </FormField>
            <FormField className="span-full" label={t("routeDescription")}>
              {(props) => (
                <textarea
                  {...props}
                  value={route.description ?? ""}
                  onChange={(event) =>
                    applyRoute((current) => ({
                      ...current,
                      description: event.target.value || null
                    }))
                  }
                />
              )}
            </FormField>
          </div>
          <CatalogSelectionEditor
            catalog={catalog}
            fieldErrors={fieldErrors}
            route={route}
            routeIndex={routeIndex}
            setNotice={setSelectionNotice}
            updateRoute={applyRoute}
          />
        </section>
      ) : null}
      {pendingRemove ? (
        <ConfirmRouteDialog
          connected={draft.connections.some((connection) =>
            connection.participants.some((participant) => participant.routeId === pendingRemove)
          )}
          onCancel={() => setPendingRemove(null)}
          onConfirm={confirmRemove}
        />
      ) : null}
    </div>
  );
}

function CatalogSelectionEditor({
  catalog,
  fieldErrors,
  route,
  routeIndex,
  updateRoute,
  setNotice
}: Readonly<{
  catalog: EditorCatalogResponseV2 | null;
  fieldErrors: ReadonlyMap<string, string>;
  route: ProjectRouteDraftV2;
  routeIndex: number;
  updateRoute: (next: (route: ProjectRouteDraftV2) => ProjectRouteDraftV2) => void;
  setNotice: (notice: string | null) => void;
}>) {
  const { t } = useI18n();
  if (!catalog) return <StatusNotice tone="warning">{t("catalogFailed")}</StatusNotice>;
  const products = selectableProducts(catalog, "straightSection").filter(
    (product) => product.selection !== null
  );
  const systems = [...new Set(products.map((product) => product.selection!.system))].sort();
  const dimensions = [
    ...new Map(
      products
        .filter((product) => product.selection!.system === route.selection.system)
        .map((product) => [product.selection!.dimensionId, product.selection!])
    ).values()
  ];
  const materialCodes = [
    ...new Set(
      products
        .filter(
          (product) =>
            product.selection!.system === route.selection.system &&
            product.selection!.dimensionId === route.selection.dimensionId
        )
        .map((product) => product.selection!.materialCode)
    )
  ].sort();
  const finishCodes = [
    ...new Set(
      products
        .filter(
          (product) =>
            product.selection!.system === route.selection.system &&
            product.selection!.dimensionId === route.selection.dimensionId &&
            product.selection!.materialCode === route.selection.materialCode
        )
        .map((product) => product.selection!.finishCode)
    )
  ].sort();
  const compatible = products.filter(
    (product) =>
      product.selection!.system === route.selection.system &&
      product.selection!.dimensionId === route.selection.dimensionId &&
      product.selection!.materialCode === route.selection.materialCode &&
      product.selection!.finishCode === route.selection.finishCode
  );
  const selectedProduct = products.find(
    (product) => product.id === route.selection.straightProductId
  );
  const selectionPath = `routes.${routeIndex}.selection`;
  function apply(selection: ProjectRouteDraftV2["selection"], labels: string[]) {
    const reconciled = reconcileRouteCatalog({ ...route, selection }, catalog!);
    updateRoute(() => reconciled.route);
    const clearedFields = [...labels, ...reconciled.cleared].filter(
      (field, index, values) => values.indexOf(field) === index
    );
    setNotice(
      reconciled.cleared.length ? t("dependentCleared", { fields: clearedFields.join(", ") }) : null
    );
  }
  return (
    <div className="catalog-grid">
      <FormField
        error={fieldError(fieldErrors, `${selectionPath}.system`)}
        label={t("systemFamily")}
        required
      >
        {(props) => (
          <select
            {...props}
            data-field-path={`${selectionPath}.system`}
            value={route.selection.system ?? ""}
            onChange={(event) =>
              apply({ ...route.selection, system: event.target.value || null }, [
                t("dimensions"),
                t("material"),
                t("finish"),
                t("straightProduct"),
                t("supplyOption")
              ])
            }
          >
            <option value="">{t("selectOption")}</option>
            {systems.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        )}
      </FormField>
      <FormField
        error={fieldError(
          fieldErrors,
          `${selectionPath}.dimensionId`,
          `${selectionPath}.width`,
          `${selectionPath}.height`
        )}
        label={t("dimensions")}
        required
      >
        {(props) => (
          <select
            {...props}
            data-field-path={`${selectionPath}.dimensionId`}
            disabled={!route.selection.system}
            value={route.selection.dimensionId ?? ""}
            onChange={(event) => {
              const selected = dimensions.find((value) => value.dimensionId === event.target.value);
              apply(
                {
                  ...route.selection,
                  dimensionId: selected?.dimensionId ?? null,
                  width: selected?.width ?? null,
                  height: selected?.height ?? null
                },
                [t("material"), t("finish"), t("straightProduct"), t("supplyOption")]
              );
            }}
          >
            <option value="">{t("selectOption")}</option>
            {dimensions.map((value) => (
              <option key={value.dimensionId} value={value.dimensionId}>
                {value.width.value} × {value.height.value} mm
              </option>
            ))}
          </select>
        )}
      </FormField>
      <FormField
        error={fieldError(fieldErrors, `${selectionPath}.materialCode`)}
        label={t("material")}
        required
      >
        {(props) => (
          <select
            {...props}
            data-field-path={`${selectionPath}.materialCode`}
            disabled={!route.selection.dimensionId}
            value={route.selection.materialCode ?? ""}
            onChange={(event) =>
              apply({ ...route.selection, materialCode: event.target.value || null }, [
                t("finish"),
                t("straightProduct"),
                t("supplyOption")
              ])
            }
          >
            <option value="">{t("selectOption")}</option>
            {materialCodes.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        )}
      </FormField>
      <FormField
        error={fieldError(fieldErrors, `${selectionPath}.finishCode`)}
        label={t("finish")}
        required
      >
        {(props) => (
          <select
            {...props}
            data-field-path={`${selectionPath}.finishCode`}
            disabled={!route.selection.materialCode}
            value={route.selection.finishCode ?? ""}
            onChange={(event) =>
              apply({ ...route.selection, finishCode: event.target.value || null }, [
                t("straightProduct"),
                t("supplyOption")
              ])
            }
          >
            <option value="">{t("selectOption")}</option>
            {finishCodes.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        )}
      </FormField>
      <FormField
        className="span-full"
        error={fieldError(fieldErrors, `${selectionPath}.straightProductId`)}
        label={t("straightProduct")}
        required
      >
        {(props) => (
          <select
            {...props}
            data-field-path={`${selectionPath}.straightProductId`}
            disabled={!route.selection.finishCode}
            value={route.selection.straightProductId ?? ""}
            onChange={(event) => {
              const product = compatible.find((item) => item.id === event.target.value);
              apply(
                product
                  ? selectStraightProduct(product, route.selection.defaultSupplyOptionId)
                  : {
                      ...route.selection,
                      straightProductId: null,
                      defaultSupplyOptionId: null
                    },
                [t("supplyOption"), t("assemblyTemplate")]
              );
            }}
          >
            <option value="">{t("selectOption")}</option>
            {compatible.map((product) => (
              <option key={product.id} value={product.id}>
                {product.code} · {product.descriptionEn}
              </option>
            ))}
          </select>
        )}
      </FormField>
      <FormField
        className="span-full"
        error={fieldError(fieldErrors, `${selectionPath}.defaultSupplyOptionId`)}
        label={t("supplyOption")}
        required
      >
        {(props) => (
          <select
            {...props}
            data-field-path={`${selectionPath}.defaultSupplyOptionId`}
            disabled={!selectedProduct}
            value={route.selection.defaultSupplyOptionId ?? ""}
            onChange={(event) =>
              updateRoute((current) => ({
                ...current,
                selection: {
                  ...current.selection,
                  defaultSupplyOptionId: event.target.value || null
                }
              }))
            }
          >
            <option value="">{t("selectOption")}</option>
            {selectedProduct?.supplyOptions
              .filter((option) => option.active && option.orderable)
              .map((option) => (
                <option key={option.id} value={option.id}>
                  {option.length.value} {option.length.unit}
                </option>
              ))}
          </select>
        )}
      </FormField>
      <small className="span-full">{t("noSilentSelection")}</small>
    </div>
  );
}

function GeometrySection({ draft, catalog, fieldErrors, selectedRouteId, update }: SectionProps) {
  const { t } = useI18n();
  const geometrySectionRef = useRef<HTMLElement>(null);
  const route = draft.routes.find((item) => item.id === selectedRouteId) ?? draft.routes[0] ?? null;
  if (!route) return <StatusNotice tone="warning">{t("noProjectsHint")}</StatusNotice>;
  const routeIndex = draft.routes.findIndex((item) => item.id === route.id);
  const change = (next: (route: ProjectRouteDraftV2) => ProjectRouteDraftV2) =>
    update((current) => updateRoute(current, route.id, next));
  const fittingProducts = catalog
    ? compatibleProducts(catalog, "fitting", route.selection.straightProductId, "fitting")
    : [];
  const straightProduct = catalog?.products.find(
    (product) => product.id === route.selection.straightProductId
  );
  function add(kind: "straight" | "fitting") {
    const id = crypto.randomUUID();
    change((current) => ({
      ...current,
      geometry: [
        ...current.geometry,
        kind === "straight"
          ? {
              id,
              kind,
              length: { value: "", unit: "m" },
              supplyOptionId: null
            }
          : {
              id,
              kind,
              fittingType: "horizontalBend",
              selectedProductId: null,
              supportedPhysicalLength: null,
              customDescription: null
            }
      ]
    }));
    window.requestAnimationFrame(() => {
      geometrySectionRef.current
        ?.querySelector<HTMLElement>(
          `[data-geometry-id="${id}"] input, [data-geometry-id="${id}"] select`
        )
        ?.focus();
    });
  }
  return (
    <div className="editor-stack">
      <section
        aria-labelledby="geometry-title"
        className="editor-card"
        data-field-path={`routes.${routeIndex}.geometry`}
        ref={geometrySectionRef}
        tabIndex={-1}
      >
        <div className="card-heading">
          <h2 id="geometry-title">
            {t("orderedGeometry")} · {route.code}
          </h2>
          <div className="editor-actions">
            <button className="secondary-button" onClick={() => add("straight")} type="button">
              + {t("addStraight")}
            </button>
            <button className="secondary-button" onClick={() => add("fitting")} type="button">
              + {t("addFitting")}
            </button>
          </div>
        </div>
        {route.geometry.length === 0 ? (
          <StatusNotice tone="warning">{t("emptyGeometry")}</StatusNotice>
        ) : null}
        <div className="geometry-production-list">
          {route.geometry.map((item, index) => (
            <div className="geometry-production-row" data-geometry-id={item.id} key={item.id}>
              <strong>{index + 1}</strong>
              <span>{t(item.kind === "straight" ? "straight" : "fitting")}</span>
              {item.kind === "straight" ? (
                <>
                  <FormField
                    error={
                      Number(item.length.value) > 0
                        ? fieldError(
                            fieldErrors,
                            `routes.${routeIndex}.geometry.${index}.length.value`,
                            `routes.${routeIndex}.geometry.${index}.length`
                          )
                        : t("invalidPositive")
                    }
                    label={`${t("length")} (m)`}
                    required
                  >
                    {(props) => (
                      <input
                        {...props}
                        data-field-path={`routes.${routeIndex}.geometry.${index}.length.value`}
                        inputMode="decimal"
                        value={item.length.value}
                        onChange={(event) =>
                          change((current) => ({
                            ...current,
                            geometry: current.geometry.map((entry) =>
                              entry.id === item.id && entry.kind === "straight"
                                ? { ...entry, length: { value: event.target.value, unit: "m" } }
                                : entry
                            )
                          }))
                        }
                      />
                    )}
                  </FormField>
                  <FormField label={t("segmentSupplyOption")}>
                    {(props) => (
                      <select
                        {...props}
                        data-field-path={`routes.${routeIndex}.geometry.${index}.supplyOptionId`}
                        value={item.supplyOptionId ?? ""}
                        onChange={(event) =>
                          change((current) => ({
                            ...current,
                            geometry: current.geometry.map((entry) =>
                              entry.id === item.id && entry.kind === "straight"
                                ? { ...entry, supplyOptionId: event.target.value || null }
                                : entry
                            )
                          }))
                        }
                      >
                        <option value="">{t("projectDefault")}</option>
                        {straightProduct?.supplyOptions
                          .filter((option) => option.active && option.orderable)
                          .map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.length.value} {option.length.unit}
                            </option>
                          ))}
                      </select>
                    )}
                  </FormField>
                </>
              ) : (
                <div className="form-grid">
                  <FormField
                    error={fieldError(
                      fieldErrors,
                      `routes.${routeIndex}.geometry.${index}.fittingType`
                    )}
                    label={t("fittingType")}
                    required
                  >
                    {(props) => (
                      <select
                        {...props}
                        data-field-path={`routes.${routeIndex}.geometry.${index}.fittingType`}
                        value={item.fittingType}
                        onChange={(event) =>
                          change((current) => ({
                            ...current,
                            geometry: current.geometry.map((entry) =>
                              entry.id === item.id && entry.kind === "fitting"
                                ? {
                                    ...entry,
                                    fittingType: event.target.value as typeof entry.fittingType,
                                    customDescription:
                                      event.target.value === "custom"
                                        ? entry.customDescription
                                        : null
                                  }
                                : entry
                            )
                          }))
                        }
                      >
                        <option value="horizontalBend">{t("horizontalBend")}</option>
                        <option value="verticalBend">{t("verticalBend")}</option>
                        <option value="tee">{t("tee")}</option>
                        <option value="transition">{t("transition")}</option>
                        <option value="custom">{t("custom")}</option>
                      </select>
                    )}
                  </FormField>
                  <FormField
                    error={fieldError(
                      fieldErrors,
                      `routes.${routeIndex}.geometry.${index}.selectedProductId`
                    )}
                    label={t("product")}
                  >
                    {(props) => (
                      <select
                        {...props}
                        data-field-path={`routes.${routeIndex}.geometry.${index}.selectedProductId`}
                        value={item.selectedProductId ?? ""}
                        onChange={(event) =>
                          change((current) => ({
                            ...current,
                            geometry: current.geometry.map((entry) =>
                              entry.id === item.id && entry.kind === "fitting"
                                ? { ...entry, selectedProductId: event.target.value || null }
                                : entry
                            )
                          }))
                        }
                      >
                        <option value="">{t("unresolved")}</option>
                        {fittingProducts.map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.code} · {product.descriptionEn}
                          </option>
                        ))}
                      </select>
                    )}
                  </FormField>
                  {item.fittingType === "custom" ? (
                    <FormField
                      className="span-full"
                      error={
                        item.customDescription
                          ? fieldError(
                              fieldErrors,
                              `routes.${routeIndex}.geometry.${index}.customDescription`
                            )
                          : t("required")
                      }
                      label={t("description")}
                      required
                    >
                      {(props) => (
                        <input
                          {...props}
                          data-field-path={`routes.${routeIndex}.geometry.${index}.customDescription`}
                          value={item.customDescription ?? ""}
                          onChange={(event) =>
                            change((current) => ({
                              ...current,
                              geometry: current.geometry.map((entry) =>
                                entry.id === item.id && entry.kind === "fitting"
                                  ? { ...entry, customDescription: event.target.value || null }
                                  : entry
                              )
                            }))
                          }
                        />
                      )}
                    </FormField>
                  ) : null}
                </div>
              )}
              <div className="row-actions">
                <button
                  aria-label={t("moveUp")}
                  className="icon-button"
                  disabled={index === 0}
                  onClick={() => change((current) => moveGeometry(current, item.id, -1))}
                  type="button"
                >
                  ↑
                </button>
                <button
                  aria-label={t("moveDown")}
                  className="icon-button"
                  disabled={index === route.geometry.length - 1}
                  onClick={() => change((current) => moveGeometry(current, item.id, 1))}
                  type="button"
                >
                  ↓
                </button>
                <button
                  aria-label={t("remove")}
                  className="icon-button"
                  onClick={() => {
                    change((current) => ({
                      ...current,
                      geometry: current.geometry.filter((entry) => entry.id !== item.id),
                      supports: {
                        ...current.supports,
                        manualAdditionalSupports: current.supports.manualAdditionalSupports.filter(
                          (adjustment) => adjustment.sourceEntityRef !== item.id
                        )
                      }
                    }));
                    window.requestAnimationFrame(() => geometrySectionRef.current?.focus());
                  }}
                  type="button"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section aria-labelledby="endpoints-title" className="editor-card">
        <h2 id="endpoints-title">
          {t("startEndpoint")} / {t("endEndpoint")}
        </h2>
        <div className="endpoint-grid-production">
          <EndpointEditor
            catalog={catalog}
            endpoint={route.startEndpoint}
            fieldErrors={fieldErrors}
            path={`routes.${routeIndex}.startEndpoint`}
            route={route}
            title={t("startEndpoint")}
            updateEndpoint={(endpoint) =>
              change((current) => ({ ...current, startEndpoint: endpoint }))
            }
          />
          <EndpointEditor
            catalog={catalog}
            endpoint={route.endEndpoint}
            fieldErrors={fieldErrors}
            path={`routes.${routeIndex}.endEndpoint`}
            route={route}
            title={t("endEndpoint")}
            updateEndpoint={(endpoint) =>
              change((current) => ({ ...current, endEndpoint: endpoint }))
            }
          />
        </div>
      </section>
    </div>
  );
}

function EndpointEditor({
  catalog,
  endpoint,
  fieldErrors,
  path,
  route,
  title,
  updateEndpoint
}: Readonly<{
  catalog: EditorCatalogResponseV2 | null;
  endpoint: ProjectEndpointDraftV2;
  fieldErrors: ReadonlyMap<string, string>;
  path: string;
  route: ProjectRouteDraftV2;
  title: string;
  updateEndpoint: (endpoint: ProjectEndpointDraftV2) => void;
}>) {
  const { t } = useI18n();
  const products = catalog
    ? compatibleProducts(catalog, "endpoint", route.selection.straightProductId, "endpointMaterial")
    : [];
  function typeChanged(type: ProjectEndpointDraftV2["type"]) {
    updateEndpoint({
      ...endpoint,
      type,
      selectedProductId:
        type === "freeEnd" || type === "routeContinuation" ? null : endpoint.selectedProductId,
      equipmentReference: type === "equipment" ? endpoint.equipmentReference : null,
      customDescription: type === "custom" ? endpoint.customDescription : null
    });
  }
  return (
    <div className="endpoint-panel">
      <h3>{title}</h3>
      <FormField error={fieldError(fieldErrors, `${path}.type`)} label={t("endpointType")} required>
        {(props) => (
          <select
            {...props}
            data-field-path={`${path}.type`}
            value={endpoint.type}
            onChange={(event) => typeChanged(event.target.value as ProjectEndpointDraftV2["type"])}
          >
            <option value="freeEnd">{t("freeEnd")}</option>
            <option value="routeContinuation">{t("routeContinuation")}</option>
            <option value="endCap">{t("endCap")}</option>
            <option value="equipment">{t("equipment")}</option>
            <option value="physicalSplice">{t("physicalSplice")}</option>
            <option value="custom">{t("custom")}</option>
          </select>
        )}
      </FormField>
      {!["freeEnd", "routeContinuation"].includes(endpoint.type) ? (
        <FormField
          error={fieldError(fieldErrors, `${path}.selectedProductId`)}
          label={t("product")}
        >
          {(props) => (
            <select
              {...props}
              data-field-path={`${path}.selectedProductId`}
              value={endpoint.selectedProductId ?? ""}
              onChange={(event) =>
                updateEndpoint({ ...endpoint, selectedProductId: event.target.value || null })
              }
            >
              <option value="">{t("unresolved")}</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.code} · {product.descriptionEn}
                </option>
              ))}
            </select>
          )}
        </FormField>
      ) : null}
      {endpoint.type === "equipment" ? (
        <FormField
          error={
            endpoint.equipmentReference
              ? fieldError(fieldErrors, `${path}.equipmentReference`)
              : t("required")
          }
          label={t("pointReference")}
          required
        >
          {(props) => (
            <input
              {...props}
              data-field-path={`${path}.equipmentReference`}
              maxLength={500}
              value={endpoint.equipmentReference ?? ""}
              onChange={(event) =>
                updateEndpoint({ ...endpoint, equipmentReference: event.target.value || null })
              }
            />
          )}
        </FormField>
      ) : null}
      {endpoint.type === "custom" ? (
        <FormField
          error={
            endpoint.customDescription
              ? fieldError(fieldErrors, `${path}.customDescription`)
              : t("required")
          }
          label={t("description")}
          required
        >
          {(props) => (
            <input
              {...props}
              data-field-path={`${path}.customDescription`}
              value={endpoint.customDescription ?? ""}
              onChange={(event) =>
                updateEndpoint({ ...endpoint, customDescription: event.target.value || null })
              }
            />
          )}
        </FormField>
      ) : null}
    </div>
  );
}

interface ConnectionFormState {
  id: string | null;
  type: ProjectConnectionDraftV2["type"];
  participants: string[];
  physicalBreak: boolean;
  supportBehavior: ProjectConnectionDraftV2["supportBehavior"];
  materialProductId: string | null;
  supportsBefore: string;
  supportsAfter: string;
}
const emptyConnectionForm = (): ConnectionFormState => ({
  id: null,
  type: "logicalContinuation",
  participants: ["", ""],
  physicalBreak: false,
  supportBehavior: "shared",
  materialProductId: null,
  supportsBefore: "0",
  supportsAfter: "0"
});

function ConnectionsSection({ draft, catalog, onBufferedChange, update }: SectionProps) {
  const { t } = useI18n();
  const connectionEditorRef = useRef<HTMLElement>(null);
  const [form, setForm] = useState<ConnectionFormState>(emptyConnectionForm);
  const bufferDirty = JSON.stringify(form) !== JSON.stringify(emptyConnectionForm());
  useEffect(() => onBufferedChange(bufferDirty), [bufferDirty, onBufferedChange]);
  useEffect(() => () => onBufferedChange(false), [onBufferedChange]);
  const requiredCount =
    form.type === "custom"
      ? form.participants.length === 3
        ? 3
        : 2
      : connectionParticipantCount(form.type);
  const editing = draft.connections.find((connection) => connection.id === form.id);
  const usedEndpoints = new Set(
    draft.connections
      .filter((connection) => connection.id !== form.id)
      .flatMap((connection) => connection.participants.map((participant) => participant.endpointId))
  );
  const endpoints = draft.routes.flatMap((route) => [
    {
      routeId: route.id,
      endpointId: route.startEndpoint.id,
      position: "start" as const,
      label: `${route.code} · ${t("startEndpoint")}`
    },
    {
      routeId: route.id,
      endpointId: route.endEndpoint.id,
      position: "end" as const,
      label: `${route.code} · ${t("endEndpoint")}`
    }
  ]);
  const productLabel = (productId: string) => {
    const product = catalog?.products.find((candidate) => candidate.id === productId);
    return product ? `${product.code} · ${product.descriptionEn}` : productId;
  };
  const selected = form.participants
    .map((endpointId) => endpoints.find((endpoint) => endpoint.endpointId === endpointId))
    .filter(Boolean) as typeof endpoints;
  const participantError =
    form.participants.length !== requiredCount || form.participants.some((value) => !value)
      ? t("participantCount")
      : new Set(selected.map((value) => value.routeId)).size !== selected.length
        ? t("selfConnection")
        : selected.length === 2 && selected[0]?.position === selected[1]?.position
          ? t("participantCount")
          : form.participants.some((value) => usedEndpoints.has(value))
            ? t("endpointInUse")
            : undefined;
  const supportsBeforeError = /^(?:0|[1-9]\d*)$/u.test(form.supportsBefore)
    ? undefined
    : t("invalidNonNegative");
  const supportsAfterError = /^(?:0|[1-9]\d*)$/u.test(form.supportsAfter)
    ? undefined
    : t("invalidNonNegative");
  const retainedMaterialBlocked =
    form.type !== "logicalContinuation" && form.materialProductId !== null;
  function typeChanged(type: ProjectConnectionDraftV2["type"]) {
    setForm((current) => ({
      ...current,
      type,
      participants: Array.from(
        { length: connectionParticipantCount(type) },
        (_, index) => current.participants[index] ?? ""
      ),
      physicalBreak: type !== "logicalContinuation",
      materialProductId: type === "logicalContinuation" ? null : current.materialProductId
    }));
  }
  function resetEndpointTypes(
    current: ProjectDraftInputV2,
    connection: ProjectConnectionDraftV2 | undefined
  ) {
    if (!connection) return current;
    const endpointIds = new Set(
      connection.participants.map((participant) => participant.endpointId)
    );
    return {
      ...current,
      routes: current.routes.map((route) => ({
        ...route,
        startEndpoint: endpointIds.has(route.startEndpoint.id)
          ? { ...route.startEndpoint, type: "freeEnd" as const, selectedProductId: null }
          : route.startEndpoint,
        endEndpoint: endpointIds.has(route.endEndpoint.id)
          ? { ...route.endEndpoint, type: "freeEnd" as const, selectedProductId: null }
          : route.endEndpoint
      }))
    };
  }
  function save() {
    if (participantError || supportsBeforeError || supportsAfterError) return;
    const participants = form.participants.map((endpointId) => {
      const endpoint = endpoints.find((item) => item.endpointId === endpointId)!;
      return { routeId: endpoint.routeId, endpointId };
    });
    const connection: ProjectConnectionDraftV2 = {
      id: form.id ?? crypto.randomUUID(),
      type: form.type,
      participants,
      physicalBreak: form.type === "logicalContinuation" ? false : form.physicalBreak,
      supportBehavior: form.supportBehavior,
      materialProductId: form.type === "logicalContinuation" ? null : form.materialProductId,
      supportsBefore: { value: form.supportsBefore, unit: "pcs" },
      supportsAfter: { value: form.supportsAfter, unit: "pcs" },
      connectorCorrections: editing?.connectorCorrections ?? []
    };
    update((original) => {
      let current = resetEndpointTypes(original, editing);
      current = {
        ...current,
        connections: editing
          ? current.connections.map((item) => (item.id === connection.id ? connection : item))
          : [...current.connections, connection]
      };
      {
        const ids = new Set(connection.participants.map((participant) => participant.endpointId));
        const endpointType = endpointTypeForConnection(connection.type);
        current = {
          ...current,
          routes: current.routes.map((route) => ({
            ...route,
            startEndpoint: ids.has(route.startEndpoint.id)
              ? {
                  ...route.startEndpoint,
                  type: endpointType,
                  selectedProductId: null
                }
              : route.startEndpoint,
            endEndpoint: ids.has(route.endEndpoint.id)
              ? {
                  ...route.endEndpoint,
                  type: endpointType,
                  selectedProductId: null
                }
              : route.endEndpoint
          }))
        };
      }
      return current;
    });
    setForm(emptyConnectionForm());
  }
  function edit(connection: ProjectConnectionDraftV2) {
    setForm({
      id: connection.id,
      type: connection.type,
      participants: connection.participants.map((participant) => participant.endpointId),
      physicalBreak: connection.physicalBreak,
      supportBehavior: connection.supportBehavior,
      materialProductId: connection.materialProductId,
      supportsBefore: connection.supportsBefore.value,
      supportsAfter: connection.supportsAfter.value
    });
  }
  function remove(connection: ProjectConnectionDraftV2) {
    update((original) => {
      const current = resetEndpointTypes(original, connection);
      return {
        ...current,
        connections: current.connections.filter((item) => item.id !== connection.id)
      };
    });
    if (form.id === connection.id) setForm(emptyConnectionForm());
    window.requestAnimationFrame(() => connectionEditorRef.current?.focus());
  }
  return (
    <div className="editor-stack">
      <section
        aria-labelledby="connection-editor-title"
        className="editor-card"
        data-field-path="connections"
        ref={connectionEditorRef}
        tabIndex={-1}
      >
        <h2 id="connection-editor-title">{t("connections")}</h2>
        <div className="form-grid">
          <FormField label={t("connectionType")} required>
            {(props) => (
              <select
                {...props}
                value={form.type}
                onChange={(event) =>
                  typeChanged(event.target.value as ProjectConnectionDraftV2["type"])
                }
              >
                <option value="logicalContinuation">{t("logicalContinuation")}</option>
                <option value="physicalSplice">{t("physicalSplice")}</option>
                <option value="horizontalBend">{t("horizontalBend")}</option>
                <option value="verticalBend">{t("verticalBend")}</option>
                <option value="tee">{t("tee")}</option>
                <option value="transition">{t("transition")}</option>
                <option value="custom">{t("custom")}</option>
              </select>
            )}
          </FormField>
          <FormField label={t("supportBehavior")} required>
            {(props) => (
              <select
                {...props}
                value={form.supportBehavior}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    supportBehavior: event.target.value as "shared" | "separate"
                  }))
                }
              >
                <option value="shared">{t("shared")}</option>
                <option value="separate">{t("separate")}</option>
              </select>
            )}
          </FormField>
          {form.type !== "logicalContinuation" ? (
            <label className="check-row">
              <input
                checked={form.physicalBreak}
                onChange={(event) =>
                  setForm((current) => ({ ...current, physicalBreak: event.target.checked }))
                }
                type="checkbox"
              />
              <span>{t("physicalBreak")}</span>
            </label>
          ) : null}
          {form.type === "custom" ? (
            <FormField label={t("customParticipantCount")} required>
              {(props) => (
                <select
                  {...props}
                  value={requiredCount}
                  onChange={(event) => {
                    const count = event.target.value === "3" ? 3 : 2;
                    setForm((current) => ({
                      ...current,
                      participants: Array.from(
                        { length: count },
                        (_, index) => current.participants[index] ?? ""
                      )
                    }));
                  }}
                >
                  <option value="2">{t("twoEndpoints")}</option>
                  <option value="3">{t("threeEndpoints")}</option>
                </select>
              )}
            </FormField>
          ) : null}
          {Array.from({ length: requiredCount }, (_, index) => (
            <FormField
              error={participantError}
              key={index}
              label={t(index === 0 ? "endpointA" : index === 1 ? "endpointB" : "endpointC")}
              required
            >
              {(props) => (
                <select
                  {...props}
                  value={form.participants[index] ?? ""}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      participants: current.participants.map((value, itemIndex) =>
                        itemIndex === index ? event.target.value : value
                      )
                    }))
                  }
                >
                  <option value="">{t("selectOption")}</option>
                  {endpoints
                    .filter(
                      (endpoint) =>
                        !usedEndpoints.has(endpoint.endpointId) ||
                        form.participants.includes(endpoint.endpointId)
                    )
                    .map((endpoint) => (
                      <option key={endpoint.endpointId} value={endpoint.endpointId}>
                        {endpoint.label}
                      </option>
                    ))}
                </select>
              )}
            </FormField>
          ))}
          {form.type !== "logicalContinuation" ? (
            <div className="span-full">
              <p className="field-help">{t("connectionMaterialReview")}</p>
              {form.materialProductId ? (
                <StatusNotice tone="review">
                  <p>{productLabel(form.materialProductId)}</p>
                  <button
                    className="secondary-button"
                    onClick={() => setForm((current) => ({ ...current, materialProductId: null }))}
                    type="button"
                  >
                    {t("remove")}
                  </button>
                </StatusNotice>
              ) : null}
            </div>
          ) : null}
          <FormField error={supportsBeforeError} label={t("supportsBefore")} required>
            {(props) => (
              <input
                {...props}
                inputMode="numeric"
                value={form.supportsBefore}
                onChange={(event) =>
                  setForm((current) => ({ ...current, supportsBefore: event.target.value }))
                }
              />
            )}
          </FormField>
          <FormField error={supportsAfterError} label={t("supportsAfter")} required>
            {(props) => (
              <input
                {...props}
                inputMode="numeric"
                value={form.supportsAfter}
                onChange={(event) =>
                  setForm((current) => ({ ...current, supportsAfter: event.target.value }))
                }
              />
            )}
          </FormField>
        </div>
        <div className="editor-actions">
          <button
            className="primary-button"
            disabled={Boolean(
              participantError ||
              supportsBeforeError ||
              supportsAfterError ||
              retainedMaterialBlocked
            )}
            onClick={save}
            type="button"
          >
            {editing ? t("saveConnection") : t("addConnection")}
          </button>
          {editing ? (
            <button
              className="secondary-button"
              onClick={() => setForm(emptyConnectionForm())}
              type="button"
            >
              {t("cancel")}
            </button>
          ) : null}
        </div>
      </section>
      <section aria-labelledby="saved-connections-title" className="editor-card">
        <h2 id="saved-connections-title">{t("connections")}</h2>
        {draft.connections.length === 0 ? (
          <p>{t("noConnections")}</p>
        ) : (
          <div className="route-list">
            {draft.connections.map((connection, connectionIndex) => (
              <div className="connection-list-item" key={connection.id}>
                <div>
                  <strong>{connection.type}</strong>
                  <small>
                    {connection.participants
                      .map(
                        (participant) =>
                          endpoints.find(
                            (endpoint) => endpoint.endpointId === participant.endpointId
                          )?.label ?? participant.endpointId
                      )
                      .join(" ↔ ")}
                  </small>
                  {connection.connectorCorrections.length ? (
                    <div>
                      <small>{t("connectorCorrections")}</small>
                      <ul>
                        {connection.connectorCorrections.map((correction) => (
                          <li key={correction.id}>
                            {productLabel(correction.productId)} ·{" "}
                            {correction.adjustedQuantity.value} {correction.adjustedQuantity.unit}
                            <button
                              className="danger-button"
                              onClick={() => {
                                update((current) => ({
                                  ...current,
                                  connections: current.connections.map((candidate) =>
                                    candidate.id === connection.id
                                      ? {
                                          ...candidate,
                                          connectorCorrections:
                                            candidate.connectorCorrections.filter(
                                              (item) => item.id !== correction.id
                                            )
                                        }
                                      : candidate
                                  )
                                }));
                                window.requestAnimationFrame(() =>
                                  connectionEditorRef.current?.focus()
                                );
                              }}
                              type="button"
                            >
                              {t("remove")}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
                <div className="row-actions">
                  <button
                    className="secondary-button"
                    data-field-path={`connections.${connectionIndex}`}
                    onClick={() => edit(connection)}
                    type="button"
                  >
                    {t("edit")}
                  </button>
                  <button
                    className="danger-button"
                    onClick={() => remove(connection)}
                    type="button"
                  >
                    {t("remove")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SupportsSection({
  draft,
  catalog,
  fieldErrors,
  selectedRouteId,
  onBufferedChange,
  update
}: SectionProps) {
  const { t } = useI18n();
  const route = draft.routes.find((item) => item.id === selectedRouteId) ?? draft.routes[0] ?? null;
  const [extraQuantity, setExtraQuantity] = useState("0");
  const [extraReason, setExtraReason] = useState("");
  const [selectionNotice, setSelectionNotice] = useState<string | null>(null);
  const supportSectionRef = useRef<HTMLElement>(null);
  const bufferDirty = extraQuantity !== "0" || extraReason.length > 0;
  useEffect(() => onBufferedChange(bufferDirty), [bufferDirty, onBufferedChange]);
  useEffect(() => () => onBufferedChange(false), [onBufferedChange]);
  if (!route) return <StatusNotice tone="warning">{t("noProjectsHint")}</StatusNotice>;
  const routeIndex = draft.routes.findIndex((item) => item.id === route.id);
  const supportsPath = `routes.${routeIndex}.supports`;
  const change = (supports: ProjectRouteDraftV2["supports"]) =>
    update((current) => updateRoute(current, route.id, (value) => ({ ...value, supports })));
  const templates =
    catalog?.assemblyTemplates.filter(
      (template) =>
        (!route.supports.supportType || template.supportType === route.supports.supportType) &&
        (!route.selection.system || template.applicableSystems.includes(route.selection.system))
    ) ?? [];
  const selectedTemplate = templates.find(
    (template) => template.id === route.supports.assemblyTemplateId
  );
  const supportProducts = catalog
    ? templateComponentProducts(catalog, selectedTemplate?.id ?? null, "support")
    : [];
  const anchors = catalog
    ? compatibleTemplateProducts(
        catalog,
        selectedTemplate?.id ?? null,
        "anchor",
        "anchor",
        null,
        route.supports.substrate
      )
    : [];
  const wstbProducts = catalog
    ? templateComponentProducts(catalog, selectedTemplate?.id ?? null, "wstb")
    : [];
  const hasTemplateWstbComponent =
    selectedTemplate?.components.some((component) => component.role === "wstb") ?? false;
  const hasPerLevelComponent =
    selectedTemplate?.components.some((component) => component.quantityMode === "perLevel") ??
    false;
  const manualTemplateComponents =
    selectedTemplate?.components.filter((component) => component.quantityMode === "manual") ?? [];
  const anchorComponents =
    selectedTemplate?.components.filter((component) => component.role === "anchor") ?? [];
  function metadata(reason: string) {
    return { overrideId: crypto.randomUUID(), reason, note: null };
  }
  function changeWithCatalog(nextSupports: ProjectRouteDraftV2["supports"]) {
    if (!catalog) {
      change(nextSupports);
      return;
    }
    const reconciled = reconcileRouteCatalog({ ...route!, supports: nextSupports }, catalog);
    change(reconciled.route.supports);
    setSelectionNotice(
      reconciled.cleared.length
        ? t("dependentCleared", { fields: reconciled.cleared.join(", ") })
        : null
    );
  }
  function updateTemplateManualValue(
    component: (typeof manualTemplateComponents)[number],
    next: Readonly<{ quantity?: string; reason?: string }>
  ) {
    const existingIndex = route!.supports.templateManualValues.findIndex(
      (value) => value.componentId === component.id
    );
    const existing =
      existingIndex >= 0 ? route!.supports.templateManualValues[existingIndex] : undefined;
    const value = {
      componentId: component.id,
      quantity: {
        value: next.quantity ?? existing?.quantity.value ?? "",
        unit: component.quantity.unit
      },
      metadata: {
        ...(existing?.metadata ?? metadata("")),
        reason: next.reason ?? existing?.metadata.reason ?? ""
      }
    };
    const templateManualValues = [...route!.supports.templateManualValues];
    if (existingIndex >= 0) templateManualValues[existingIndex] = value;
    else templateManualValues.push(value);
    change({ ...route!.supports, templateManualValues });
  }
  function addExtra() {
    if (!extraReason.trim() || Number(extraQuantity) < 0) return;
    change({
      ...route!.supports,
      manualAdditionalSupports: [
        ...route!.supports.manualAdditionalSupports,
        {
          id: crypto.randomUUID(),
          additionalQuantity: { value: extraQuantity, unit: "pcs" },
          sourceEntityRef: route!.id,
          metadata: metadata(extraReason)
        }
      ]
    });
    setExtraQuantity("0");
    setExtraReason("");
  }
  return (
    <div className="editor-stack">
      {selectionNotice ? <StatusNotice live>{selectionNotice}</StatusNotice> : null}
      <section
        aria-labelledby="supports-title"
        className="editor-card"
        data-field-path={supportsPath}
        ref={supportSectionRef}
        tabIndex={-1}
      >
        <h2 id="supports-title">
          {t("supports")} · {route.code}
        </h2>
        <div className="support-grid">
          <FormField
            error={
              route.supports.spacing && Number(route.supports.spacing.value) > 0
                ? fieldError(fieldErrors, `${supportsPath}.spacing`)
                : t("invalidPositive")
            }
            label={`${t("supportSpacing")} (m)`}
            required
          >
            {(props) => (
              <input
                {...props}
                data-field-path={`${supportsPath}.spacing`}
                inputMode="decimal"
                value={route.supports.spacing?.value ?? ""}
                onChange={(event) =>
                  change({
                    ...route.supports,
                    spacing: event.target.value ? { value: event.target.value, unit: "m" } : null
                  })
                }
              />
            )}
          </FormField>
          {hasPerLevelComponent ? (
            <FormField
              error={
                route.supports.levelCount && /^[1-9]\d*$/u.test(route.supports.levelCount.value)
                  ? fieldError(
                      fieldErrors,
                      `${supportsPath}.levelCount`,
                      `${supportsPath}.levelCount.value`
                    )
                  : t("invalidPositive")
              }
              label={t("levelCount")}
              required
            >
              {(props) => (
                <input
                  {...props}
                  data-field-path={`${supportsPath}.levelCount`}
                  inputMode="numeric"
                  value={route.supports.levelCount?.value ?? ""}
                  onChange={(event) =>
                    change({
                      ...route.supports,
                      levelCount: event.target.value
                        ? { value: event.target.value, unit: "pcs" }
                        : null
                    })
                  }
                />
              )}
            </FormField>
          ) : null}
          <FormField
            error={
              route.supports.supportType
                ? fieldError(fieldErrors, `${supportsPath}.supportType`)
                : t("required")
            }
            label={t("supportType")}
            required
          >
            {(props) => (
              <select
                {...props}
                data-field-path={`${supportsPath}.supportType`}
                value={route.supports.supportType ?? ""}
                onChange={(event) => {
                  const type = event.target.value as
                    NonNullable<typeof route.supports.supportType> | "";
                  changeWithCatalog({
                    ...route.supports,
                    supportType: type || null
                  });
                }}
              >
                <option value="">{t("selectOption")}</option>
                <option value="wall">{t("wall")}</option>
                <option value="ceiling">{t("ceiling")}</option>
                <option value="floor">{t("floor")}</option>
                <option value="custom">{t("custom")}</option>
              </select>
            )}
          </FormField>
          <FormField
            error={fieldError(fieldErrors, `${supportsPath}.supportProductId`)}
            label={t("product")}
          >
            {(props) => (
              <select
                {...props}
                data-field-path={`${supportsPath}.supportProductId`}
                value={route.supports.supportProductId ?? ""}
                onChange={(event) =>
                  change({ ...route.supports, supportProductId: event.target.value || null })
                }
              >
                <option value="">{t("unresolved")}</option>
                {supportProducts.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.code} · {product.descriptionEn}
                  </option>
                ))}
              </select>
            )}
          </FormField>
          <FormField
            error={
              route.supports.assemblyTemplateId
                ? fieldError(fieldErrors, `${supportsPath}.assemblyTemplateId`)
                : t("required")
            }
            label={t("assemblyTemplate")}
            required
          >
            {(props) => (
              <select
                {...props}
                data-field-path={`${supportsPath}.assemblyTemplateId`}
                value={route.supports.assemblyTemplateId ?? ""}
                onChange={(event) => {
                  const templateId = event.target.value || null;
                  changeWithCatalog({
                    ...route.supports,
                    assemblyTemplateId: templateId
                  });
                }}
              >
                <option value="">{t("selectOption")}</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.code} · {template.nameEn}
                  </option>
                ))}
              </select>
            )}
          </FormField>
          <FormField
            error={fieldError(fieldErrors, `${supportsPath}.substrate`)}
            label={t("substrate")}
            required
          >
            {(props) => (
              <select
                {...props}
                data-field-path={`${supportsPath}.substrate`}
                value={route.supports.substrate ?? ""}
                onChange={(event) => {
                  const substrate = (event.target.value || null) as typeof route.supports.substrate;
                  changeWithCatalog({
                    ...route.supports,
                    substrate
                  });
                }}
              >
                <option value="">{t("selectOption")}</option>
                <option value="concrete">{t("concrete")}</option>
                <option value="steel">{t("steel")}</option>
                <option value="masonry">{t("masonry")}</option>
                <option value="unknown">{t("unknown")}</option>
              </select>
            )}
          </FormField>
          <FormField
            error={fieldError(fieldErrors, `${supportsPath}.anchorProductId`)}
            label={t("anchorProduct")}
          >
            {(props) => (
              <select
                {...props}
                data-field-path={`${supportsPath}.anchorProductId`}
                value={route.supports.anchorProductId ?? ""}
                onChange={(event) =>
                  change({ ...route.supports, anchorProductId: event.target.value || null })
                }
              >
                <option value="">{t("unresolved")}</option>
                {anchors.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.code} · {product.descriptionEn}
                  </option>
                ))}
              </select>
            )}
          </FormField>
          {hasTemplateWstbComponent ? (
            <FormField
              error={
                route.supports.wstbProductId
                  ? fieldError(fieldErrors, `${supportsPath}.wstbProductId`)
                  : t("required")
              }
              label={t("wstbProduct")}
              required
            >
              {(props) => (
                <select
                  {...props}
                  data-field-path={`${supportsPath}.wstbProductId`}
                  value={route.supports.wstbProductId ?? ""}
                  onChange={(event) =>
                    change({ ...route.supports, wstbProductId: event.target.value || null })
                  }
                >
                  <option value="">{t("unresolved")}</option>
                  {wstbProducts.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.code} · {product.descriptionEn}
                    </option>
                  ))}
                </select>
              )}
            </FormField>
          ) : null}
          <FormField
            error={
              route.supports.wstb ? fieldError(fieldErrors, `${supportsPath}.wstb`) : t("required")
            }
            label={t("wstb")}
            required
          >
            {(props) => (
              <select
                {...props}
                data-field-path={`${supportsPath}.wstb`}
                value={route.supports.wstb?.mode ?? ""}
                onChange={(event) => {
                  const mode = event.target.value;
                  change({
                    ...route.supports,
                    wstb:
                      mode === "one" || mode === "two"
                        ? { mode }
                        : mode === "custom"
                          ? { mode, quantityPerSupport: "", metadata: metadata("") }
                          : null
                  });
                }}
              >
                <option value="">{t("selectOption")}</option>
                <option value="one">{t("one")}</option>
                <option value="two">{t("two")}</option>
                <option value="custom">{t("customQuantity")}</option>
              </select>
            )}
          </FormField>
          <small className="field-help">{t("engineeringReview")}</small>
          {route.supports.wstb?.mode === "custom" ? (
            <>
              <FormField
                error={
                  Number(route.supports.wstb.quantityPerSupport) > 0
                    ? undefined
                    : t("invalidPositive")
                }
                label={t("customQuantity")}
                required
              >
                {(props) => (
                  <input
                    {...props}
                    inputMode="numeric"
                    value={
                      route.supports.wstb!.mode === "custom"
                        ? route.supports.wstb!.quantityPerSupport
                        : ""
                    }
                    onChange={(event) =>
                      route.supports.wstb?.mode === "custom" &&
                      change({
                        ...route.supports,
                        wstb: { ...route.supports.wstb, quantityPerSupport: event.target.value }
                      })
                    }
                  />
                )}
              </FormField>
              <FormField
                error={route.supports.wstb.metadata.reason ? undefined : t("required")}
                label={t("reason")}
                required
              >
                {(props) => (
                  <input
                    {...props}
                    value={
                      route.supports.wstb!.mode === "custom"
                        ? route.supports.wstb!.metadata.reason
                        : ""
                    }
                    onChange={(event) =>
                      route.supports.wstb?.mode === "custom" &&
                      change({
                        ...route.supports,
                        wstb: {
                          ...route.supports.wstb,
                          metadata: { ...route.supports.wstb.metadata, reason: event.target.value }
                        }
                      })
                    }
                  />
                )}
              </FormField>
            </>
          ) : null}
        </div>
        {manualTemplateComponents.map((component) => {
          const valueIndex = route.supports.templateManualValues.findIndex(
            (value) => value.componentId === component.id
          );
          const value =
            valueIndex >= 0 ? route.supports.templateManualValues[valueIndex] : undefined;
          const fieldIndex =
            valueIndex >= 0 ? valueIndex : route.supports.templateManualValues.length;
          const product = catalog?.products.find(
            (candidate) => candidate.id === component.productId
          );
          return (
            <div className="form-grid" key={component.id}>
              <p className="span-full">
                <strong>{t("templateManualValue")}</strong>
                {product ? ` · ${product.code} · ${product.descriptionEn}` : ""}
              </p>
              <FormField
                error={
                  value &&
                  (value.quantity.unit === "pcs"
                    ? /^[1-9]\d*$/u.test(value.quantity.value)
                    : Number(value.quantity.value) > 0)
                    ? fieldError(
                        fieldErrors,
                        `${supportsPath}.templateManualValues.${fieldIndex}.quantity`,
                        `${supportsPath}.templateManualValues.${fieldIndex}.quantity.value`,
                        `${supportsPath}.templateManualValues.${fieldIndex}.quantity.unit`
                      )
                    : t("invalidPositive")
                }
                label={`${t("quantity")} (${component.quantity.unit})`}
                required
              >
                {(props) => (
                  <input
                    {...props}
                    data-field-path={`${supportsPath}.templateManualValues.${fieldIndex}.quantity`}
                    inputMode={component.quantity.unit === "pcs" ? "numeric" : "decimal"}
                    value={value?.quantity.value ?? ""}
                    onChange={(event) =>
                      updateTemplateManualValue(component, { quantity: event.target.value })
                    }
                  />
                )}
              </FormField>
              <FormField
                error={
                  value?.metadata.reason
                    ? fieldError(
                        fieldErrors,
                        `${supportsPath}.templateManualValues.${fieldIndex}.metadata.reason`
                      )
                    : t("required")
                }
                label={t("reason")}
                required
              >
                {(props) => (
                  <input
                    {...props}
                    data-field-path={`${supportsPath}.templateManualValues.${fieldIndex}.metadata.reason`}
                    value={value?.metadata.reason ?? ""}
                    onChange={(event) =>
                      updateTemplateManualValue(component, { reason: event.target.value })
                    }
                  />
                )}
              </FormField>
            </div>
          );
        })}
        {anchorComponents.length ? (
          <p>
            {t("anchorsPerPoint")}:{" "}
            {anchorComponents
              .map((component) => `${component.quantity.value} ${component.quantity.unit}`)
              .join(", ")}
          </p>
        ) : null}
        <label className="check-row">
          <input
            checked={route.supports.anchorQuantityOverride !== null}
            onChange={(event) =>
              change({
                ...route.supports,
                anchorQuantityOverride: event.target.checked
                  ? { adjustedPerSupportAxis: { value: "", unit: "pcs" }, metadata: metadata("") }
                  : null
              })
            }
            type="checkbox"
          />
          <span>
            <strong>{t("overrideAnchor")}</strong>
            <small>{t("engineeringReview")}</small>
          </span>
        </label>
        {route.supports.anchorQuantityOverride ? (
          <div className="form-grid">
            <FormField
              error={
                Number(route.supports.anchorQuantityOverride.adjustedPerSupportAxis.value) > 0
                  ? undefined
                  : t("invalidPositive")
              }
              label={t("adjustedQuantity")}
              required
            >
              {(props) => (
                <input
                  {...props}
                  inputMode="numeric"
                  value={route.supports.anchorQuantityOverride!.adjustedPerSupportAxis.value}
                  onChange={(event) =>
                    change({
                      ...route.supports,
                      anchorQuantityOverride: route.supports.anchorQuantityOverride
                        ? {
                            ...route.supports.anchorQuantityOverride,
                            adjustedPerSupportAxis: { value: event.target.value, unit: "pcs" }
                          }
                        : null
                    })
                  }
                />
              )}
            </FormField>
            <FormField
              error={
                route.supports.anchorQuantityOverride.metadata.reason ? undefined : t("required")
              }
              label={t("reason")}
              required
            >
              {(props) => (
                <input
                  {...props}
                  value={route.supports.anchorQuantityOverride!.metadata.reason}
                  onChange={(event) =>
                    change({
                      ...route.supports,
                      anchorQuantityOverride: route.supports.anchorQuantityOverride
                        ? {
                            ...route.supports.anchorQuantityOverride,
                            metadata: {
                              ...route.supports.anchorQuantityOverride.metadata,
                              reason: event.target.value
                            }
                          }
                        : null
                    })
                  }
                />
              )}
            </FormField>
          </div>
        ) : null}
      </section>
      <section aria-labelledby="additional-supports-title" className="editor-card">
        <h2 id="additional-supports-title">{t("additionalSupports")}</h2>
        <div className="form-grid">
          <FormField
            error={Number(extraQuantity) >= 0 ? undefined : t("invalidNonNegative")}
            label={t("quantity")}
            required
          >
            {(props) => (
              <input
                {...props}
                inputMode="numeric"
                value={extraQuantity}
                onChange={(event) => setExtraQuantity(event.target.value)}
              />
            )}
          </FormField>
          <FormField error={extraReason ? undefined : t("required")} label={t("reason")} required>
            {(props) => (
              <input
                {...props}
                value={extraReason}
                onChange={(event) => setExtraReason(event.target.value)}
              />
            )}
          </FormField>
        </div>
        <button
          className="secondary-button"
          disabled={!extraReason || Number(extraQuantity) < 0}
          onClick={addExtra}
          type="button"
        >
          + {t("additionalSupports")}
        </button>
        {route.supports.manualAdditionalSupports.map((adjustment) => (
          <div className="manual-list-item" key={adjustment.id}>
            <span>
              {adjustment.additionalQuantity.value} pcs · {adjustment.metadata.reason}
            </span>
            <button
              className="danger-button"
              onClick={() => {
                change({
                  ...route.supports,
                  manualAdditionalSupports: route.supports.manualAdditionalSupports.filter(
                    (item) => item.id !== adjustment.id
                  )
                });
                window.requestAnimationFrame(() => supportSectionRef.current?.focus());
              }}
              type="button"
            >
              {t("remove")}
            </button>
          </div>
        ))}
      </section>
    </div>
  );
}

interface ManualForm {
  id: string | null;
  kind: "catalog" | "freeText";
  productId: string;
  productCode: string;
  descriptionEn: string;
  quantity: string;
  unit: "pcs" | "m" | "kg";
  reason: string;
  note: string;
  reserveMode: "projectDefault" | "disabled" | "percentageOverride";
  reservePercent: string;
  packagingMode: "catalogDefault" | "disabled" | "incrementOverride";
  packageIncrement: string;
  quantityOverride: boolean;
  adjustedQuantity: string;
}
const emptyManualForm = (): ManualForm => ({
  id: null,
  kind: "freeText",
  productId: "",
  productCode: "",
  descriptionEn: "",
  quantity: "1",
  unit: "pcs",
  reason: "",
  note: "",
  reserveMode: "projectDefault",
  reservePercent: "0",
  packagingMode: "disabled",
  packageIncrement: "1",
  quantityOverride: false,
  adjustedQuantity: "1"
});

function LoadAndManualSection({
  draft,
  catalog,
  fieldErrors,
  selectedRouteId,
  onBufferedChange,
  update
}: SectionProps) {
  const { t } = useI18n();
  const [form, setForm] = useState<ManualForm>(emptyManualForm);
  const accessorySectionRef = useRef<HTMLElement>(null);
  const manualSectionRef = useRef<HTMLElement>(null);
  const bufferDirty = JSON.stringify(form) !== JSON.stringify(emptyManualForm());
  useEffect(() => onBufferedChange(bufferDirty), [bufferDirty, onBufferedChange]);
  useEffect(() => () => onBufferedChange(false), [onBufferedChange]);
  const selectedRoute =
    draft.routes.find((route) => route.id === selectedRouteId) ?? draft.routes[0];
  const unresolvedAccessoryProducts = catalog
    ? compatibleProducts(
        catalog,
        "accessory",
        selectedRoute?.selection.straightProductId ?? null,
        "accessory"
      )
    : [];
  const manualProducts = catalog ? selectableProducts(catalog) : [];
  const valid =
    Number(form.quantity) > 0 &&
    form.reason.trim() &&
    (form.kind === "catalog" ? form.productId : form.descriptionEn.trim()) &&
    (form.reserveMode !== "percentageOverride" ||
      (Number(form.reservePercent) >= 0 && Number(form.reservePercent) <= 100)) &&
    (form.packagingMode !== "incrementOverride" || Number(form.packageIncrement) > 0) &&
    (!form.quantityOverride || Number(form.adjustedQuantity) > 0);
  function buildItem(): ProjectManualItemDraftV2 {
    const itemId = form.id ?? crypto.randomUUID();
    const metadata = () => ({
      overrideId: crypto.randomUUID(),
      reason: form.reason,
      note: form.note || null
    });
    const quantity = { value: form.quantity, unit: form.unit } as const;
    const reservePolicy =
      form.reserveMode === "projectDefault"
        ? { mode: "projectDefault" as const }
        : form.reserveMode === "disabled"
          ? { mode: "disabled" as const, metadata: metadata() }
          : {
              mode: "percentageOverride" as const,
              percent: form.reservePercent,
              metadata: metadata()
            };
    const packagingPolicy =
      form.packagingMode === "catalogDefault"
        ? { mode: "catalogDefault" as const }
        : form.packagingMode === "disabled"
          ? { mode: "disabled" as const, metadata: null }
          : {
              mode: "incrementOverride" as const,
              increment: { value: form.packageIncrement, unit: form.unit } as const,
              metadata: metadata()
            };
    const quantityOverride = form.quantityOverride
      ? {
          adjustedQuantity: { value: form.adjustedQuantity, unit: form.unit } as const,
          metadata: metadata()
        }
      : null;
    const fields = {
      id: itemId,
      quantity,
      reason: form.reason,
      note: form.note || null,
      reservePolicy,
      packagingPolicy,
      quantityOverride
    };
    return form.kind === "catalog"
      ? { kind: "catalog", productId: form.productId, ...fields }
      : {
          kind: "freeText",
          productId: null,
          productCode: form.productCode || null,
          descriptionEn: form.descriptionEn,
          ...fields
        };
  }
  function saveItem() {
    if (!valid) return;
    const item = buildItem();
    if (!isManualItemValid(item)) return;
    update((current) => upsertManualItem(current, item));
    setForm(emptyManualForm());
  }
  function editItem(item: ProjectManualItemDraftV2) {
    setForm({
      id: item.id,
      kind: item.kind,
      productId: item.kind === "catalog" ? item.productId : "",
      productCode: item.kind === "freeText" ? (item.productCode ?? "") : "",
      descriptionEn: item.kind === "freeText" ? item.descriptionEn : "",
      quantity: item.quantity.value,
      unit: item.quantity.unit,
      reason: item.reason,
      note: item.note ?? "",
      reserveMode: item.reservePolicy.mode,
      reservePercent:
        item.reservePolicy.mode === "percentageOverride" ? item.reservePolicy.percent : "0",
      packagingMode: item.packagingPolicy.mode,
      packageIncrement:
        item.packagingPolicy.mode === "incrementOverride"
          ? item.packagingPolicy.increment.value
          : "1",
      quantityOverride: item.quantityOverride !== null,
      adjustedQuantity: item.quantityOverride?.adjustedQuantity.value ?? item.quantity.value
    });
  }
  function productLabel(productId: string) {
    const product = catalog?.products.find((entry) => entry.id === productId);
    return product ? `${product.code} · ${product.descriptionEn}` : productId;
  }
  return (
    <div className="editor-stack">
      <section
        aria-labelledby="load-title"
        className="editor-card"
        data-field-path="cableLoad"
        ref={accessorySectionRef}
        tabIndex={-1}
      >
        <h2 id="load-title">
          {t("cableLoad")} / {t("accessories")}
        </h2>
        <div className="form-grid">
          <FormField
            error={fieldError(fieldErrors, "cableLoad", "cableLoad.value")}
            label={`${t("cableLoad")} (kg/m)`}
          >
            {(props) => (
              <input
                {...props}
                data-field-path="cableLoad.value"
                inputMode="decimal"
                value={draft.cableLoad?.value ?? ""}
                onChange={(event) =>
                  update((current) => ({
                    ...current,
                    cableLoad: event.target.value
                      ? { value: event.target.value, unit: "kgPerM" }
                      : null
                  }))
                }
              />
            )}
          </FormField>
        </div>
        {unresolvedAccessoryProducts.length ? (
          <StatusNotice tone="review">{t("accessoryManualOnly")}</StatusNotice>
        ) : null}
        {draft.accessoryProductIds.length ? (
          <div className="route-list">
            {draft.accessoryProductIds.map((productId) => (
              <div className="manual-list-item" key={productId}>
                <span>{productLabel(productId)}</span>
                <button
                  className="danger-button"
                  onClick={() => {
                    update((current) => ({
                      ...current,
                      accessoryProductIds: current.accessoryProductIds.filter(
                        (candidate) => candidate !== productId
                      )
                    }));
                    window.requestAnimationFrame(() => accessorySectionRef.current?.focus());
                  }}
                  type="button"
                >
                  {t("remove")}
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </section>
      <section
        aria-labelledby="manual-title"
        className="editor-card"
        data-field-path="manualItems"
        ref={manualSectionRef}
        tabIndex={-1}
      >
        <h2 id="manual-title">{t("manualItems")}</h2>
        {draft.manualItems.length === 0 ? (
          <p>{t("noManualItems")}</p>
        ) : (
          <div className="route-list">
            {draft.manualItems.map((item, itemIndex) => (
              <div className="manual-list-item" key={item.id}>
                <div>
                  <span className="status-badge status-manual">✎ {t("manual")}</span>
                  <strong>
                    {item.kind === "catalog" ? productLabel(item.productId) : item.descriptionEn}
                  </strong>
                  <small>
                    {item.quantity.value} {item.quantity.unit} · {item.reason}
                  </small>
                  {fieldError(
                    fieldErrors,
                    `manualItems.${itemIndex}`,
                    `manualItems.${itemIndex}.productId`,
                    `manualItems.${itemIndex}.quantity`,
                    `manualItems.${itemIndex}.quantity.unit`
                  ) ? (
                    <small className="field-error" id={`manual-item-error-${item.id}`}>
                      {fieldError(
                        fieldErrors,
                        `manualItems.${itemIndex}`,
                        `manualItems.${itemIndex}.productId`,
                        `manualItems.${itemIndex}.quantity`,
                        `manualItems.${itemIndex}.quantity.unit`
                      )}
                    </small>
                  ) : null}
                </div>
                <div className="row-actions">
                  <button
                    aria-describedby={
                      fieldError(
                        fieldErrors,
                        `manualItems.${itemIndex}`,
                        `manualItems.${itemIndex}.productId`,
                        `manualItems.${itemIndex}.quantity`,
                        `manualItems.${itemIndex}.quantity.unit`
                      )
                        ? `manual-item-error-${item.id}`
                        : undefined
                    }
                    className="secondary-button"
                    data-field-path={`manualItems.${itemIndex}`}
                    onClick={() => editItem(item)}
                    type="button"
                  >
                    {t("edit")}
                  </button>
                  <button
                    className="danger-button"
                    onClick={() => {
                      update((current) => removeManualItem(current, item.id));
                      window.requestAnimationFrame(() => manualSectionRef.current?.focus());
                    }}
                    type="button"
                  >
                    {t("remove")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="form-grid">
          <FormField label={t("catalogItem")} required>
            {(props) => (
              <select
                {...props}
                value={form.kind}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    kind: event.target.value as ManualForm["kind"],
                    packagingMode:
                      event.target.value === "freeText" &&
                      current.packagingMode === "catalogDefault"
                        ? "disabled"
                        : current.packagingMode
                  }))
                }
              >
                <option value="catalog">{t("catalogItem")}</option>
                <option value="freeText">{t("freeTextItem")}</option>
              </select>
            )}
          </FormField>
          {form.kind === "catalog" ? (
            <FormField
              error={form.productId ? undefined : t("required")}
              label={t("product")}
              required
            >
              {(props) => (
                <select
                  {...props}
                  value={form.productId}
                  onChange={(event) => {
                    const productId = event.target.value;
                    const product = manualProducts.find((candidate) => candidate.id === productId);
                    setForm((current) => ({
                      ...current,
                      productId,
                      unit: product?.orderUnit ?? current.unit
                    }));
                  }}
                >
                  <option value="">{t("selectOption")}</option>
                  {manualProducts.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.code} · {product.descriptionEn}
                    </option>
                  ))}
                </select>
              )}
            </FormField>
          ) : (
            <>
              <FormField
                error={form.descriptionEn ? undefined : t("required")}
                label={t("englishDescription")}
                required
              >
                {(props) => (
                  <input
                    {...props}
                    value={form.descriptionEn}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, descriptionEn: event.target.value }))
                    }
                  />
                )}
              </FormField>
              <FormField label={t("productCode")}>
                {(props) => (
                  <input
                    {...props}
                    value={form.productCode}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, productCode: event.target.value }))
                    }
                  />
                )}
              </FormField>
            </>
          )}
          <FormField
            error={Number(form.quantity) > 0 ? undefined : t("invalidPositive")}
            label={t("quantity")}
            required
          >
            {(props) => (
              <input
                {...props}
                inputMode="decimal"
                value={form.quantity}
                onChange={(event) =>
                  setForm((current) => ({ ...current, quantity: event.target.value }))
                }
              />
            )}
          </FormField>
          <FormField label={t("unit")} required>
            {(props) => (
              <select
                {...props}
                disabled={form.kind === "catalog"}
                value={form.unit}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    unit: event.target.value as ManualForm["unit"]
                  }))
                }
              >
                <option value="pcs">pcs</option>
                <option value="m">m</option>
                <option value="kg">kg</option>
              </select>
            )}
          </FormField>
          <FormField error={form.reason ? undefined : t("required")} label={t("reason")} required>
            {(props) => (
              <input
                {...props}
                value={form.reason}
                onChange={(event) =>
                  setForm((current) => ({ ...current, reason: event.target.value }))
                }
              />
            )}
          </FormField>
          <FormField label={t("note")}>
            {(props) => (
              <input
                {...props}
                value={form.note}
                onChange={(event) =>
                  setForm((current) => ({ ...current, note: event.target.value }))
                }
              />
            )}
          </FormField>
          <FormField label={t("reservePolicy")}>
            {(props) => (
              <select
                {...props}
                value={form.reserveMode}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    reserveMode: event.target.value as ManualForm["reserveMode"]
                  }))
                }
              >
                <option value="projectDefault">{t("projectDefault")}</option>
                <option value="disabled">{t("disabled")}</option>
                <option value="percentageOverride">{t("percentageOverride")}</option>
              </select>
            )}
          </FormField>
          {form.reserveMode === "percentageOverride" ? (
            <FormField
              error={
                Number(form.reservePercent) >= 0 && Number(form.reservePercent) <= 100
                  ? undefined
                  : t("invalidPercent")
              }
              label={`${t("defaultReserve")} (%)`}
              required
            >
              {(props) => (
                <input
                  {...props}
                  inputMode="decimal"
                  value={form.reservePercent}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, reservePercent: event.target.value }))
                  }
                />
              )}
            </FormField>
          ) : null}
          <FormField label={t("packagingPolicy")}>
            {(props) => (
              <select
                {...props}
                value={form.packagingMode}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    packagingMode: event.target.value as ManualForm["packagingMode"]
                  }))
                }
              >
                {form.kind === "catalog" ? (
                  <option value="catalogDefault">{t("catalogDefault")}</option>
                ) : null}
                <option value="disabled">{t("disabled")}</option>
                <option value="incrementOverride">{t("packageIncrement")}</option>
              </select>
            )}
          </FormField>
          {form.packagingMode === "incrementOverride" ? (
            <FormField
              error={Number(form.packageIncrement) > 0 ? undefined : t("invalidPositive")}
              label={t("packageIncrement")}
              required
            >
              {(props) => (
                <input
                  {...props}
                  inputMode="decimal"
                  value={form.packageIncrement}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, packageIncrement: event.target.value }))
                  }
                />
              )}
            </FormField>
          ) : null}
          <label className="check-row span-full">
            <input
              checked={form.quantityOverride}
              onChange={(event) =>
                setForm((current) => ({ ...current, quantityOverride: event.target.checked }))
              }
              type="checkbox"
            />
            <span>
              <strong>{t("quantityOverride")}</strong>
              <small>{t("engineeringReview")}</small>
            </span>
          </label>
          {form.quantityOverride ? (
            <FormField
              error={Number(form.adjustedQuantity) > 0 ? undefined : t("invalidPositive")}
              label={t("adjustedQuantity")}
              required
            >
              {(props) => (
                <input
                  {...props}
                  inputMode="decimal"
                  value={form.adjustedQuantity}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, adjustedQuantity: event.target.value }))
                  }
                />
              )}
            </FormField>
          ) : null}
        </div>
        <div className="editor-actions">
          <button className="primary-button" disabled={!valid} onClick={saveItem} type="button">
            {form.id ? t("updateManualItem") : t("addManualItem")}
          </button>
          {form.id ? (
            <button
              className="secondary-button"
              onClick={() => setForm(emptyManualForm())}
              type="button"
            >
              {t("cancel")}
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function ConfirmRouteDialog({
  connected,
  onCancel,
  onConfirm
}: Readonly<{ connected: boolean; onCancel: () => void; onConfirm: () => void }>) {
  const { t } = useI18n();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    previousFocus.current = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    return () => previousFocus.current?.focus();
  }, []);
  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        aria-labelledby="route-remove-title"
        aria-modal="true"
        className="confirm-dialog"
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancel();
          if (event.key === "Tab") {
            const fromCancel = document.activeElement === cancelRef.current;
            if (
              (event.shiftKey && fromCancel) ||
              (!event.shiftKey && document.activeElement === confirmRef.current)
            ) {
              event.preventDefault();
              (fromCancel ? confirmRef : cancelRef).current?.focus();
            }
          }
        }}
        role="dialog"
      >
        <h2 id="route-remove-title">{t("confirmRouteRemoval")}</h2>
        {connected ? <p>{t("confirmRouteRemovalDetail")}</p> : null}
        <div className="dialog-actions">
          <button className="secondary-button" onClick={onCancel} ref={cancelRef} type="button">
            {t("cancel")}
          </button>
          <button className="danger-button" onClick={onConfirm} ref={confirmRef} type="button">
            {t("confirmRemove")}
          </button>
        </div>
      </section>
    </div>
  );
}
