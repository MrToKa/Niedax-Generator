"use client";

import type {
  EditorCatalogResponseV2,
  ProjectDraftInputV2,
  ProjectEndpointDraftV2,
  ProjectRouteDraftV2
} from "@niedax/domain";
import type { Dispatch, SetStateAction } from "react";

import { displayQuantity } from "@/lib/result-view-model";
import { useI18n } from "@/lib/i18n";

import type { EditorStep } from "./project-editor-sections";
import { StatusNotice } from "./shared-ui";

interface ReadOnlyEditorSectionsProps {
  readonly activeStep: EditorStep;
  readonly draft: ProjectDraftInputV2;
  readonly catalog: EditorCatalogResponseV2 | null;
  readonly reason: string;
  readonly selectedRouteId: string | null;
  readonly setSelectedRouteId: Dispatch<SetStateAction<string | null>>;
}

export function ReadOnlyEditorSections({
  activeStep,
  draft,
  catalog,
  reason,
  selectedRouteId,
  setSelectedRouteId
}: ReadOnlyEditorSectionsProps) {
  const { t } = useI18n();
  const route = draft.routes.find((item) => item.id === selectedRouteId) ?? draft.routes[0] ?? null;
  const productName = (id: string | null) => {
    if (!id) return "—";
    const product = catalog?.products.find((item) => item.id === id);
    return product ? `${product.code} · ${product.descriptionEn}` : id;
  };

  return (
    <div className="editor-stack read-only-workspace">
      <StatusNotice>{reason}</StatusNotice>
      {draft.routes.length > 1 && !["project", "connections", "load"].includes(activeStep) ? (
        <label className="app-field read-only-route-picker">
          <span>{t("route")}</span>
          <select
            aria-label={t("route")}
            value={route?.id ?? ""}
            onChange={(event) => setSelectedRouteId(event.target.value)}
          >
            {draft.routes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.code} · {item.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {activeStep === "project" ? (
        <ReadOnlyCard title={t("project")}>
          <ReadOnlyValues
            values={[
              [t("projectCode"), draft.code],
              [t("projectName"), draft.name],
              [t("description"), draft.description ?? "—"],
              [`${t("defaultReserve")} (%)`, draft.defaultReservePercent],
              [t("uiLanguage"), draft.defaultLocale]
            ]}
          />
        </ReadOnlyCard>
      ) : null}

      {activeStep === "routes" ? (
        <>
          <ReadOnlyCard title={t("routes")}>
            {draft.routes.length ? (
              <div className="read-only-choice-list">
                {draft.routes.map((item) => (
                  <button
                    aria-pressed={item.id === route?.id}
                    className="secondary-button"
                    key={item.id}
                    onClick={() => setSelectedRouteId(item.id)}
                    type="button"
                  >
                    <strong>{item.code}</strong>
                    <span>{item.name}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p>{t("noRoutes")}</p>
            )}
          </ReadOnlyCard>
          {route ? (
            <ReadOnlyCard title={`${t("route")} · ${route.code}`}>
              <ReadOnlyValues
                values={[
                  [t("routeName"), route.name],
                  [t("routeDescription"), route.description ?? "—"],
                  [t("systemFamily"), route.selection.system ?? "—"],
                  [t("dimensions"), quantityPair(route)],
                  [t("material"), route.selection.materialCode ?? "—"],
                  [t("finish"), route.selection.finishCode ?? "—"],
                  [t("straightProduct"), productName(route.selection.straightProductId)],
                  [t("supplyOption"), route.selection.defaultSupplyOptionId ?? "—"]
                ]}
              />
            </ReadOnlyCard>
          ) : null}
        </>
      ) : null}

      {activeStep === "geometry" && route ? (
        <>
          <ReadOnlyCard title={`${t("orderedGeometry")} · ${route.code}`}>
            {route.geometry.length ? (
              <ol className="read-only-list">
                {route.geometry.map((item) => (
                  <li key={item.id}>
                    <strong>{item.kind === "straight" ? t("straight") : t("fitting")}</strong>
                    <span>
                      {item.kind === "straight"
                        ? `${displayQuantity(item.length)} · ${item.supplyOptionId ?? "—"}`
                        : `${item.fittingType} · ${productName(item.selectedProductId)}`}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p>{t("emptyGeometry")}</p>
            )}
          </ReadOnlyCard>
          <ReadOnlyCard title={t("endpoints")}>
            <div className="endpoint-grid-production">
              <EndpointSnapshot label={t("startEndpoint")} endpoint={route.startEndpoint} />
              <EndpointSnapshot label={t("endEndpoint")} endpoint={route.endEndpoint} />
            </div>
          </ReadOnlyCard>
        </>
      ) : null}

      {activeStep === "connections" ? (
        <ReadOnlyCard title={t("connections")}>
          {draft.connections.length ? (
            <ol className="read-only-list">
              {draft.connections.map((connection) => (
                <li key={connection.id}>
                  <strong>{connection.type}</strong>
                  <span>
                    {connection.participants
                      .map((participant) => {
                        const participantRoute = draft.routes.find(
                          (candidate) => candidate.id === participant.routeId
                        );
                        return participantRoute?.code ?? participant.routeId;
                      })
                      .join(" ↔ ")}
                  </span>
                  <small>
                    {t("supportBehavior")}: {connection.supportBehavior} · {t("product")}:{" "}
                    {productName(connection.materialProductId)}
                  </small>
                </li>
              ))}
            </ol>
          ) : (
            <p>{t("noConnections")}</p>
          )}
        </ReadOnlyCard>
      ) : null}

      {activeStep === "supports" && route ? (
        <ReadOnlyCard title={`${t("supports")} · ${route.code}`}>
          <ReadOnlyValues
            values={[
              [
                t("supportSpacing"),
                route.supports.spacing ? displayQuantity(route.supports.spacing) : "—"
              ],
              [t("supportType"), route.supports.supportType ?? "—"],
              [t("assemblyTemplate"), route.supports.assemblyTemplateId ?? "—"],
              [
                t("levelCount"),
                route.supports.levelCount ? displayQuantity(route.supports.levelCount) : "—"
              ],
              [t("substrate"), route.supports.substrate ?? "—"],
              [t("anchorProduct"), productName(route.supports.anchorProductId)],
              [
                t("anchorsPerPoint"),
                route.supports.anchorQuantityOverride
                  ? displayQuantity(route.supports.anchorQuantityOverride.adjustedPerSupportAxis)
                  : "—"
              ],
              [t("wstbProduct"), productName(route.supports.wstbProductId)],
              [t("wstb"), route.supports.wstb?.mode ?? "—"],
              [t("additionalSupports"), String(route.supports.manualAdditionalSupports.length)]
            ]}
          />
        </ReadOnlyCard>
      ) : null}

      {activeStep === "load" ? (
        <>
          <ReadOnlyCard title={t("loadAndManual")}>
            <ReadOnlyValues
              values={[
                [t("cableLoad"), draft.cableLoad ? displayQuantity(draft.cableLoad) : "—"],
                [t("accessories"), draft.accessoryProductIds.map(productName).join(", ") || "—"]
              ]}
            />
          </ReadOnlyCard>
          <ReadOnlyCard title={t("manualItems")}>
            {draft.manualItems.length ? (
              <ol className="read-only-list">
                {draft.manualItems.map((item) => (
                  <li key={item.id}>
                    <strong>
                      {item.kind === "catalog"
                        ? productName(item.productId)
                        : `${item.productCode ?? t("unresolved")} · ${item.descriptionEn}`}
                    </strong>
                    <span>{displayQuantity(item.quantity)}</span>
                    <small>
                      {t("reason")}: {item.reason} · {t("reservePolicy")}: {item.reservePolicy.mode}{" "}
                      · {t("packagingPolicy")}: {item.packagingPolicy.mode}
                    </small>
                  </li>
                ))}
              </ol>
            ) : (
              <p>{t("noManualItems")}</p>
            )}
          </ReadOnlyCard>
        </>
      ) : null}
    </div>
  );
}

function ReadOnlyCard({ title, children }: Readonly<{ title: string; children: React.ReactNode }>) {
  return (
    <section className="editor-card">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function ReadOnlyValues({ values }: Readonly<{ values: readonly (readonly [string, string])[] }>) {
  return (
    <dl className="read-only-values">
      {values.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function EndpointSnapshot({
  label,
  endpoint
}: Readonly<{ label: string; endpoint: ProjectEndpointDraftV2 }>) {
  return (
    <article className="endpoint-panel">
      <h3>{label}</h3>
      <span>{endpoint.type}</span>
      <small>
        {endpoint.equipmentReference ??
          endpoint.customDescription ??
          endpoint.selectedProductId ??
          "—"}
      </small>
    </article>
  );
}

function quantityPair(route: ProjectRouteDraftV2): string {
  if (!route.selection.width || !route.selection.height) return "—";
  return `${displayQuantity(route.selection.width)} × ${displayQuantity(route.selection.height)}`;
}
