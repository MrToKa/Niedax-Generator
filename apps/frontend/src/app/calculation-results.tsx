"use client";

import type { BomLineV2, CalculationResultV2, TraceStepV2 } from "@niedax/domain";
import type { ReactNode } from "react";

import { buildBomLineViews, displayQuantity, isManualBomLine } from "@/lib/result-view-model";
import { useI18n } from "@/lib/i18n";

import { StatusNotice } from "./shared-ui";

export function CalculationResults({
  result,
  stale
}: Readonly<{ result: CalculationResultV2 | null; stale: boolean }>) {
  const { t } = useI18n();
  if (!result) return <StatusNotice>{t("noResults")}</StatusNotice>;
  const lines = buildBomLineViews(result);
  return (
    <div className="result-stack">
      {stale ? <StatusNotice tone="warning">{t("resultStale")}</StatusNotice> : null}
      <section aria-labelledby="result-summary-title" className="editor-card">
        <div className="card-heading">
          <h2 id="result-summary-title">{t("groupedSummary")}</h2>
          <span className="status-badge">
            {result.summary.engineeringReviewRequired ? `◇ ${t("engineeringReview")}` : "✓"}
          </span>
        </div>
        <div className="result-summary-grid">
          <div>
            <span>{t("bomLines")}</span>
            <strong>{String(result.summary.bomLineCount)}</strong>
          </div>
          <div>
            <span>{t("warnings")}</span>
            <strong>{String(result.summary.warningCount)}</strong>
          </div>
          {result.summary.totalsByUnit.map((total) => (
            <div key={total.unit}>
              <span>{total.unit}</span>
              <strong>{displayQuantity(total.orderedQuantity)}</strong>
              <small>
                {t("technicalQuantity")}: {displayQuantity(total.technicalQuantity)} ·{" "}
                {t("reserveQuantity")}: {displayQuantity(total.reserveQuantity)}
              </small>
            </div>
          ))}
        </div>
        <dl className="provenance-list">
          <div>
            <dt>{t("engineVersion")}</dt>
            <dd>{result.engineVersion}</dd>
          </div>
          <div>
            <dt>{t("fingerprint")}</dt>
            <dd>
              <code>{result.inputFingerprint}</code>
            </dd>
          </div>
          <div>
            <dt>{t("catalogSnapshot")}</dt>
            <dd>
              <code>
                {result.catalogSnapshot.snapshotId} · {result.catalogSnapshot.version}
              </code>
            </dd>
          </div>
          <div>
            <dt>{t("ruleSnapshot")}</dt>
            <dd>
              <code>
                {result.ruleSnapshot.snapshotId} · {result.ruleSnapshot.version}
              </code>
            </dd>
          </div>
        </dl>
      </section>

      {result.warnings.length ? (
        <section aria-labelledby="result-warnings-title" className="editor-card">
          <h2 id="result-warnings-title">{t("warnings")}</h2>
          <ul className="warning-list">
            {result.warnings.map((warning) => (
              <li key={warning.id}>
                <span className={`status-badge status-${warning.severity}`}>
                  {warning.severity}
                </span>
                <strong>{warning.code}</strong>
                <span>{warning.effect}</span>
                <small>
                  {t("approvalImpact")}: {warning.approvalImpact}
                </small>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="bom-title" className="editor-card">
        <h2 id="bom-title">{t("detailedBom")}</h2>
        <div aria-label={t("detailedBom")} className="data-table-scroll" role="region" tabIndex={0}>
          <table className="data-table bom-production-table">
            <thead>
              <tr>
                <th>{t("product")}</th>
                <th>{t("technicalQuantity")}</th>
                <th>{t("reserveQuantity")}</th>
                <th>{t("reservedQuantity")}</th>
                <th>{t("packageIncrement")}</th>
                <th>{t("packageCount")}</th>
                <th>{t("packagingOverage")}</th>
                <th>{t("orderedQuantity")}</th>
                <th>{t("totalSpareQuantity")}</th>
                <th>{t("status")}</th>
                <th>{t("why")}</th>
              </tr>
            </thead>
            <tbody>
              {lines.map(({ line, provenance, sourceRefs, warnings, traceSteps }) => (
                <tr key={line.id}>
                  <td>
                    <strong>{line.productCode ?? t("unresolved")}</strong>
                    <span>{line.descriptionEn}</span>
                    <small>{line.category}</small>
                    {isManualBomLine(line) ? (
                      <span className="status-badge status-manual">✎ {t("manual")}</span>
                    ) : null}
                    {line.includedItems.length ? (
                      <details>
                        <summary>
                          {t("includedItems")} ({line.includedItems.length})
                        </summary>
                        <ul>
                          {line.includedItems.map((item) => (
                            <li key={item.relationId}>
                              {item.productCode} · {item.descriptionEn} ·{" "}
                              {displayQuantity(item.quantityPerParent)}
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                  </td>
                  <td>{displayQuantity(line.technicalQuantity)}</td>
                  <td>{displayQuantity(line.reserveQuantity)}</td>
                  <td>{displayQuantity(line.reservedQuantity)}</td>
                  <td>{displayQuantity(line.packageIncrement)}</td>
                  <td>{line.packageCount ? displayQuantity(line.packageCount) : "—"}</td>
                  <td>{displayQuantity(line.packagingOverage)}</td>
                  <td>
                    <strong>{displayQuantity(line.orderedQuantity)}</strong>
                  </td>
                  <td>{displayQuantity(line.totalSpareQuantity)}</td>
                  <td>
                    <span className="status-badge">{line.status}</span>
                    <span className="status-badge status-neutral">
                      {t("source")}: {sourceIndicator(sourceRefs)}
                    </span>
                    {warnings.length ? (
                      <small>
                        {warnings.length} {t("warnings").toLocaleLowerCase()}
                      </small>
                    ) : null}
                  </td>
                  <td>
                    <TraceDetails
                      lineId={line.id}
                      provenance={provenance}
                      sourceRefs={sourceRefs}
                      steps={traceSteps}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function TraceDetails({
  lineId,
  provenance,
  sourceRefs,
  steps
}: Readonly<{
  lineId: string;
  provenance: BomLineV2["provenance"];
  sourceRefs: BomLineV2["sourceRefs"];
  steps: readonly TraceStepV2[];
}>) {
  const { t } = useI18n();
  return (
    <details className="trace-details">
      <summary aria-label={`${t("why")} ${lineId}`}>{t("why")}</summary>
      <article>
        <h3>{t("provenance")}</h3>
        <dl>
          <div>
            <dt>{t("catalogSnapshot")}</dt>
            <dd>
              <code>{provenance.catalogSnapshotId}</code>
            </dd>
          </div>
          <div>
            <dt>{t("ruleSnapshot")}</dt>
            <dd>
              <code>{provenance.ruleSnapshotId}</code>
            </dd>
          </div>
          <div>
            <dt>{t("rule")}</dt>
            <dd>{identifierList(provenance.ruleIds)}</dd>
          </div>
          <div>
            <dt>{t("formula")}</dt>
            <dd>{identifierList(provenance.formulaIds)}</dd>
          </div>
          <div>
            <dt>{t("source")}</dt>
            <dd>
              <ul>
                {sourceRefs.map((source, index) => (
                  <li key={`${source.kind}:${source.id}:${String(index)}`}>
                    <code>
                      {source.kind}:{source.id}
                    </code>
                    {source.sourceDocument ? ` / ${source.sourceDocument}` : ""}
                    {source.sourcePage ? ` / ${source.sourcePage}` : ""}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        </dl>
      </article>
      {steps.map((step) => (
        <article key={step.id}>
          <h3>
            {String(step.sequence)} · {step.formula.id}
          </h3>
          <dl>
            <div>
              <dt>{t("formula")}</dt>
              <dd>
                {step.formula.expression} · v{step.formula.version}
              </dd>
            </div>
            {step.rule ? (
              <div>
                <dt>{t("rule")}</dt>
                <dd>
                  {step.rule.code} · v{step.rule.version} · {step.rule.confidence}
                </dd>
              </div>
            ) : null}
            <div>
              <dt>{t("inputs")}</dt>
              <dd>
                {step.inputs.map((input) => `${input.name}=${displayQuantity(input)}`).join(", ")}
              </dd>
            </div>
            <div>
              <dt>{t("output")}</dt>
              <dd>{displayQuantity(step.output)}</dd>
            </div>
            {step.rounding ? (
              <div>
                <dt>{t("rounding")}</dt>
                <dd>
                  {step.rounding.mode}: {displayQuantity(step.rounding.before)} →{" "}
                  {displayQuantity(step.rounding.after)}
                </dd>
              </div>
            ) : null}
            <div>
              <dt>{t("source")}</dt>
              <dd>{step.sourceRefs.map((source) => `${source.kind}:${source.id}`).join(", ")}</dd>
            </div>
          </dl>
        </article>
      ))}
    </details>
  );
}

function sourceIndicator(sourceRefs: BomLineV2["sourceRefs"]): string {
  return [...new Set(sourceRefs.map((source) => source.kind))].join(" / ");
}

function identifierList(identifiers: readonly string[]): ReactNode {
  if (!identifiers.length) return "-";
  return identifiers.map((identifier, index) => (
    <span key={identifier}>
      {index ? " / " : null}
      <code>{identifier}</code>
    </span>
  ));
}
