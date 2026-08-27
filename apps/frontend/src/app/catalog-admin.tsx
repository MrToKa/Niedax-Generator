"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

interface CatalogCounts {
  products: number;
  new: number;
  changed: number;
  unchanged: number;
  invalid: number;
  missing: number;
  errors: number;
  warnings: number;
  conflicts: number;
}

interface CatalogIssue {
  severity: "error" | "warning" | "conflict";
  code: string;
  sheet: string;
  rowNumber: number;
  productCode: string | null;
  field: string | null;
  message: string;
}

interface CatalogDiff {
  code: string;
  classification: "new" | "changed" | "unchanged" | "invalid" | "missing";
  changes: { field: string; before: unknown; after: unknown }[];
}

interface CatalogReport {
  contentHash: string;
  valid: boolean;
  counts: CatalogCounts;
  issues: CatalogIssue[];
  diff: CatalogDiff[];
}

interface PipelineResult {
  report: CatalogReport;
  bundle: {
    products: {
      code: string;
      sourceDocument: string;
      sourcePrintedPage: string;
      sourcePdfPage: number | null;
    }[];
    includedItems: {
      parentProductCode: string;
      includedProductCode: string;
      quantity: number;
      unit: string;
    }[];
    compatibilityRules: unknown[];
  };
}

interface CatalogVersion {
  id: string;
  version: string;
  label: string;
  scope: string;
  status: "draft" | "validated" | "approved" | "active" | "archived";
  contentHash: string;
  validatedAt: string | null;
  approvedAt: string | null;
  activatedAt: string | null;
  archivedAt: string | null;
}

interface DraftResponse {
  catalog: {
    id: string;
    contentHash: string;
    report: CatalogReport | null;
  };
}

async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const chunkSize = 24_576;
  const encoded: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    encoded.push(btoa(String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))));
  }
  return encoded.join("");
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    cache: "no-store",
    headers: {
      ...(init?.body ? { "content-type": "application/json", "x-niedax-csrf": "1" } : {}),
      ...init?.headers
    }
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string; code?: string };
    } | null;
    throw new Error(body?.error?.message ?? `Request failed (${response.status})`);
  }
  return (await response.json()) as T;
}

export function CatalogAdminPanel() {
  const [files, setFiles] = useState<File[]>([]);
  const [pipeline, setPipeline] = useState<PipelineResult | null>(null);
  const [versions, setVersions] = useState<CatalogVersion[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [selectedHash, setSelectedHash] = useState<string | null>(null);
  const [reason, setReason] = useState("Official Stage 5 catalog review");
  const [filter, setFilter] = useState<CatalogDiff["classification"] | "all">("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshVersions = useCallback(async () => {
    const body = await api<{ versions: CatalogVersion[] }>("/api/v1/admin/catalog-versions");
    setVersions(body.versions);
  }, []);

  useEffect(() => {
    void refreshVersions().catch((cause: unknown) =>
      setError(cause instanceof Error ? cause.message : "Unable to load catalog versions")
    );
  }, [refreshVersions]);

  const encodedFiles = useCallback(
    async () =>
      Promise.all(
        files.map(async (file) => ({ name: file.name, contentBase64: await fileToBase64(file) }))
      ),
    [files]
  );

  async function preview() {
    setBusy(true);
    setError(null);
    try {
      const body = await api<PipelineResult>("/api/v1/admin/catalog-imports/preview", {
        method: "POST",
        body: JSON.stringify({ files: await encodedFiles() })
      });
      setPipeline(body);
      setSelectedHash(body.report.contentHash);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Preview failed");
    } finally {
      setBusy(false);
    }
  }

  async function importDraft() {
    setBusy(true);
    setError(null);
    try {
      const body = await api<DraftResponse>("/api/v1/admin/catalog-imports", {
        method: "POST",
        body: JSON.stringify({ files: await encodedFiles() })
      });
      setSelectedVersionId(body.catalog.id);
      setSelectedHash(body.catalog.contentHash);
      const report = body.catalog.report;
      setPipeline((current) =>
        report && current?.report.contentHash === report.contentHash ? { ...current, report } : null
      );
      await refreshVersions();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  async function transition(
    action: "validate" | "approve" | "activate" | "archive",
    version: CatalogVersion
  ) {
    setBusy(true);
    setError(null);
    try {
      const body =
        action === "validate"
          ? await api<DraftResponse>(`/api/v1/admin/catalog-versions/${version.id}/validate`, {
              method: "POST",
              body: "{}"
            })
          : await api<{ catalog: CatalogVersion }>(
              `/api/v1/admin/catalog-versions/${version.id}/${action}`,
              {
                method: "POST",
                body: JSON.stringify(
                  action === "archive" ? { reason } : { reason, contentHash: version.contentHash }
                )
              }
            );
      const validationReport = "report" in body.catalog ? body.catalog.report : null;
      if (validationReport) {
        setPipeline((current) =>
          current?.report.contentHash === validationReport.contentHash
            ? { ...current, report: validationReport }
            : null
        );
      }
      setSelectedVersionId(version.id);
      setSelectedHash(version.contentHash);
      await refreshVersions();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `${action} failed`);
    } finally {
      setBusy(false);
    }
  }

  const filteredDiff = useMemo(
    () =>
      pipeline?.report.diff.filter(
        (entry) => filter === "all" || entry.classification === filter
      ) ?? [],
    [filter, pipeline]
  );

  return (
    <section className="catalog-admin" aria-labelledby="catalog-admin-title">
      <div className="catalog-heading">
        <div>
          <p className="eyebrow">ADMIN · CATALOG</p>
          <h2 id="catalog-admin-title">Catalog import and activation</h2>
          <p>Upload one XLSX workbook or the canonical UTF-8 CSV sheet set.</p>
        </div>
        <a className="secondary" href="/api/v1/admin/catalog-import-template.xlsx">
          Download template
        </a>
      </div>

      <div className="catalog-upload">
        <label>
          Catalog files
          <input
            type="file"
            accept=".csv,.xlsx"
            multiple
            onChange={(event) => {
              setFiles(Array.from(event.currentTarget.files ?? []));
              setPipeline(null);
              setSelectedVersionId(null);
              setSelectedHash(null);
              setFilter("all");
              setError(null);
            }}
          />
        </label>
        <button
          className="secondary"
          disabled={busy || files.length === 0}
          onClick={() => void preview()}
        >
          Preview and normalize
        </button>
        <button
          className="primary"
          disabled={busy || files.length === 0}
          onClick={() => void importDraft()}
        >
          Create/update draft
        </button>
      </div>

      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      {selectedVersionId && selectedHash ? (
        <p className="catalog-selection">
          Selected candidate: <code>{selectedVersionId}</code> · <code>{selectedHash}</code>
        </p>
      ) : null}

      {pipeline ? (
        <>
          <div className="catalog-cards" aria-label="Validation and diff summary">
            {(
              [
                "new",
                "changed",
                "unchanged",
                "invalid",
                "missing",
                "errors",
                "warnings",
                "conflicts"
              ] as const
            ).map((key) => (
              <button
                key={key}
                onClick={() =>
                  setFilter(
                    ["new", "changed", "unchanged", "invalid", "missing"].includes(key)
                      ? (key as CatalogDiff["classification"])
                      : "all"
                  )
                }
              >
                <span>{key}</span>
                <strong>{pipeline.report.counts[key]}</strong>
              </button>
            ))}
          </div>
          <div className="catalog-evidence">
            <p>
              <strong>{pipeline.bundle.products.length}</strong> products ·{" "}
              <strong>{pipeline.bundle.includedItems.length}</strong> included-item relations ·{" "}
              <strong>{pipeline.bundle.compatibilityRules.length}</strong> compatibility rules
            </p>
            <p>
              Validation:{" "}
              <strong>{pipeline.report.valid ? "ready for approval" : "blocked"}</strong>
            </p>
          </div>
          {pipeline.report.issues.length ? (
            <>
              {pipeline.report.issues.length > 100 ? (
                <p className="catalog-truncation" role="status">
                  Showing the first 100 of {pipeline.report.issues.length} issues. Use the Error CSV
                  for the complete report.
                </p>
              ) : null}
              <div className="catalog-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Severity</th>
                      <th>Code</th>
                      <th>Source row</th>
                      <th>Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pipeline.report.issues.slice(0, 100).map((item, index) => (
                      <tr key={`${item.code}-${item.rowNumber}-${index}`}>
                        <td>{item.severity}</td>
                        <td>
                          <code>{item.code}</code>
                        </td>
                        <td>
                          {item.sheet}:{item.rowNumber}
                          {item.productCode ? ` · ${item.productCode}` : ""}
                        </td>
                        <td>{item.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
          <div className="catalog-filter">
            <label>
              Diff filter
              <select
                value={filter}
                onChange={(event) => setFilter(event.target.value as typeof filter)}
              >
                <option value="all">All</option>
                <option value="new">New</option>
                <option value="changed">Changed</option>
                <option value="unchanged">Unchanged</option>
                <option value="invalid">Invalid</option>
                <option value="missing">Missing</option>
              </select>
            </label>
          </div>
          {filteredDiff.length > 250 ? (
            <p className="catalog-truncation" role="status">
              Showing the first 250 of {filteredDiff.length} matching diff rows. Narrow the filter
              to inspect a smaller set.
            </p>
          ) : null}
          <div className="catalog-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Classification</th>
                  <th>Field-level changes</th>
                </tr>
              </thead>
              <tbody>
                {filteredDiff.slice(0, 250).map((entry) => (
                  <tr key={`${entry.classification}-${entry.code}`}>
                    <td>
                      <code>{entry.code}</code>
                    </td>
                    <td>{entry.classification}</td>
                    <td>
                      {entry.changes.length
                        ? entry.changes
                            .map(
                              (change) =>
                                `${change.field}: ${String(change.before)} → ${String(change.after)}`
                            )
                            .join("; ")
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      <div className="catalog-lifecycle">
        <label>
          Audit reason
          <input value={reason} onChange={(event) => setReason(event.target.value)} />
        </label>
        <div className="catalog-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Version</th>
                <th>Scope</th>
                <th>Status</th>
                <th>Content hash</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {versions.map((version) => (
                <tr key={version.id}>
                  <td>{version.version}</td>
                  <td>{version.scope}</td>
                  <td>
                    <span className={`catalog-status ${version.status}`}>{version.status}</span>
                  </td>
                  <td>
                    <code>{version.contentHash.slice(0, 20)}…</code>
                  </td>
                  <td className="catalog-actions">
                    {version.status === "draft" ? (
                      <button disabled={busy} onClick={() => void transition("validate", version)}>
                        Validate
                      </button>
                    ) : null}
                    {version.status === "validated" ? (
                      <button disabled={busy} onClick={() => void transition("approve", version)}>
                        Approve exact hash
                      </button>
                    ) : null}
                    {version.status === "approved" ? (
                      <button disabled={busy} onClick={() => void transition("activate", version)}>
                        Activate
                      </button>
                    ) : null}
                    {version.status === "active" ? (
                      <button disabled={busy} onClick={() => void transition("archive", version)}>
                        Archive
                      </button>
                    ) : null}
                    <a href={`/api/v1/admin/catalog-versions/${version.id}/report.csv`}>
                      Error CSV
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
