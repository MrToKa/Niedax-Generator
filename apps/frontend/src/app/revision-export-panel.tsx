"use client";

import type {
  ExportArtifactV2,
  ExportListResponseV2,
  ProjectRevisionListItemV2
} from "@niedax/domain";
import { useCallback, useEffect, useRef, useState } from "react";

import { revisionStatusTranslationKey } from "@/lib/access-presentation";
import { ApiError, isAuthenticationError, newRequestKey } from "@/lib/api-client";
import {
  fetchExportDownload,
  getExportArtifact,
  listRevisionExports,
  requestRevisionExport,
  saveExportDownload
} from "@/lib/export-api";
import {
  canRequestExport,
  exportErrorKey,
  exportFailureKey,
  exportUnavailableKey,
  mergeExportArtifact,
  pollExportArtifact
} from "@/lib/export-workflow";
import { type TranslationKey, useI18n } from "@/lib/i18n";
import { retryKeyFor, type RetryKey } from "@/lib/revision-workflow";

import { useSession } from "./session-provider";
import { LoadingPanel, StatusNotice } from "./shared-ui";

/** Receives saved revision evidence only; it has no draft, save, calculation or approval adapter. */
export function RevisionExportPanel({
  revision
}: Readonly<{ revision: ProjectRevisionListItemV2 }>) {
  const { language, t } = useI18n();
  const { user, markAnonymous, refresh: refreshSession } = useSession();
  const [artifacts, setArtifacts] = useState<readonly ExportArtifactV2[]>([]);
  const [availability, setAvailability] = useState<ExportListResponseV2["availability"] | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [polling, setPolling] = useState(false);
  const [pollExhausted, setPollExhausted] = useState(false);
  const [retryAvailable, setRetryAvailable] = useState(false);
  const [errorKey, setErrorKey] = useState<TranslationKey | null>(null);
  const [correlationId, setCorrelationId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState<TranslationKey | null>(null);
  const operation = useRef<AbortController | null>(null);
  const requestRetry = useRef<RetryKey | null>(null);
  const canRead = user?.capabilities.includes("export:read") === true;
  const canCreate = canRequestExport(user?.capabilities ?? [], availability);

  const showError = useCallback(
    (error: unknown) => {
      if (isAuthenticationError(error)) {
        markAnonymous(user);
        return;
      }
      setErrorKey(exportErrorKey(error));
      setCorrelationId(error instanceof ApiError ? error.correlationId : null);
      if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
        setArtifacts([]);
        setAvailability({ allowed: false, reason: "notAuthorized" });
        requestRetry.current = null;
        setRetryAvailable(false);
        // Refresh the current role; a stale client capability never overrides this rejection.
        void refreshSession();
      }
    },
    [markAnonymous, refreshSession, user]
  );

  const observe = useCallback(async (artifact: ExportArtifactV2, signal: AbortSignal) => {
    setArtifacts((current) => mergeExportArtifact(current, artifact));
    if (artifact.status !== "pending") {
      setAnnouncement(artifact.status === "ready" ? "exportReady" : exportFailureKey(artifact));
      return;
    }
    setPolling(true);
    try {
      const final = await pollExportArtifact(artifact, signal, (updated) => {
        setArtifacts((current) => mergeExportArtifact(current, updated));
      });
      if (signal.aborted) return;
      setPollExhausted(final.status === "pending");
      setAnnouncement(
        final.status === "ready"
          ? "exportReady"
          : final.status === "failed"
            ? exportFailureKey(final)
            : null
      );
    } finally {
      if (!signal.aborted) setPolling(false);
    }
  }, []);

  const load = useCallback(async () => {
    operation.current?.abort();
    const controller = new AbortController();
    operation.current = controller;
    setLoading(true);
    setPolling(false);
    setPollExhausted(false);
    setErrorKey(null);
    setCorrelationId(null);
    if (!canRead) {
      setArtifacts([]);
      setAvailability({ allowed: false, reason: "notAuthorized" });
      setLoading(false);
      return;
    }
    try {
      const response = await listRevisionExports(revision.id, controller.signal);
      if (controller.signal.aborted) return;
      if (response.revisionId !== revision.id) throw new Error("Invalid revision identity");
      setArtifacts(response.artifacts);
      setAvailability(response.availability);
      setLoading(false);
      const pending = response.artifacts.find((artifact) => artifact.status === "pending");
      if (pending) await observe(pending, controller.signal);
    } catch (error) {
      if (!controller.signal.aborted) showError(error);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [canRead, observe, revision.id, showError]);

  useEffect(() => {
    void load();
    return () => operation.current?.abort();
  }, [load]);

  function startOperation(): AbortController {
    operation.current?.abort();
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    setPolling(false);
    setPollExhausted(false);
    setErrorKey(null);
    setCorrelationId(null);
    setAnnouncement(null);
    return controller;
  }

  async function createExport(newRequest: boolean) {
    if (!canCreate || revision.recordVersion !== "revision/v2" || busy || loading) return;
    const controller = startOperation();
    const input = { id: revision.id, inputFingerprint: revision.inputFingerprint };
    const retry = retryKeyFor(newRequest ? null : requestRetry.current, input, newRequestKey);
    requestRetry.current = retry;
    try {
      const artifact = await requestRevisionExport(input, retry.idempotencyKey, controller.signal);
      if (controller.signal.aborted) return;
      if (artifact.revisionId !== revision.id) throw new Error("Invalid revision identity");
      requestRetry.current = null;
      setRetryAvailable(false);
      setBusy(false);
      setAnnouncement(artifact.status === "ready" ? "exportReady" : null);
      await observe(artifact, controller.signal);
    } catch (error) {
      if (!controller.signal.aborted) {
        setRetryAvailable(requestRetry.current !== null);
        showError(error);
      }
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  async function refreshArtifact(artifact: ExportArtifactV2) {
    const controller = startOperation();
    try {
      const current = await getExportArtifact(artifact.exportId, controller.signal);
      if (controller.signal.aborted) return;
      if (current.revisionId !== revision.id || current.exportId !== artifact.exportId) {
        throw new Error("Invalid export identity");
      }
      setBusy(false);
      await observe(current, controller.signal);
    } catch (error) {
      if (!controller.signal.aborted) showError(error);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  async function download(artifact: ExportArtifactV2) {
    const controller = startOperation();
    setAnnouncement("exportDownloading");
    try {
      const file = await fetchExportDownload(artifact, controller.signal);
      if (controller.signal.aborted) return;
      saveExportDownload(file);
      setAnnouncement("exportDownloaded");
    } catch (error) {
      if (!controller.signal.aborted) {
        setAnnouncement(null);
        showError(error);
      }
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  const unavailable = exportUnavailableKey(availability);
  return (
    <section
      aria-busy={busy || loading}
      aria-labelledby="revision-export-title"
      className="editor-card revision-export-panel"
    >
      <div className="card-heading">
        <div>
          <h2 id="revision-export-title">{t("exportExcel")}</h2>
          <p>{t("exportSavedRevisionHint")}</p>
        </div>
      </div>
      <p className="export-revision-identity">
        <strong>
          {revision.revisionNumber} · {revision.name ?? t("retainedRevision")}
        </strong>
        <span className={`status-badge status-${revision.status}`}>
          {t(revisionStatusTranslationKey(revision.status))}
        </span>
      </p>
      <p id="revision-export-language">{t("exportEnglishHint")}</p>
      {revision.status !== "approved" ? (
        <StatusNotice>{t("exportNotApproved")}</StatusNotice>
      ) : null}
      <div className="export-actions">
        <button
          aria-describedby={`revision-export-language${unavailable ? " revision-export-unavailable" : ""}`}
          className="primary-button"
          disabled={!canCreate || busy || loading}
          onClick={() => void createExport(true)}
          type="button"
        >
          {busy && !announcement
            ? t("exportRequesting")
            : t(artifacts.length || retryAvailable ? "exportNewRequest" : "exportExcel")}
        </button>
        {retryAvailable && canCreate ? (
          <button
            className="secondary-button"
            disabled={busy || loading}
            onClick={() => void createExport(false)}
            type="button"
          >
            {t("exportRetryRequest")}
          </button>
        ) : null}
        {canRead ? (
          <button
            className="secondary-button"
            disabled={busy || loading}
            onClick={() => void load()}
            type="button"
          >
            {t("exportRefresh")}
          </button>
        ) : null}
      </div>
      {unavailable ? (
        <p className="read-only-explanation" id="revision-export-unavailable">
          {t(unavailable)}
        </p>
      ) : null}
      {loading ? <LoadingPanel label={t("exportsLoading")} /> : null}
      {errorKey ? (
        <StatusNotice tone="error" live>
          <p>{t(errorKey)}</p>
          {correlationId ? (
            <small>
              {t("supportCorrelation")}: <code>{correlationId}</code>
            </small>
          ) : null}
        </StatusNotice>
      ) : null}
      <p aria-live="polite" role="status">
        {busy && !announcement
          ? t("exportRequesting")
          : polling
            ? t("exportPending")
            : pollExhausted
              ? t("exportPollingPaused")
              : announcement
                ? t(announcement)
                : ""}
      </p>
      {!loading && canRead ? (
        <>
          <h3>{t("exportExisting")}</h3>
          <p>{t("exportHistoryHint")}</p>
          {artifacts.length === 0 ? (
            <p>{t("exportsEmpty")}</p>
          ) : (
            <ol className="export-artifact-list">
              {artifacts.map((artifact) => (
                <li key={artifact.exportId}>
                  <div>
                    <strong>
                      {artifact.fileName ??
                        t(artifact.status === "pending" ? "exportPending" : "exportFailed")}
                    </strong>
                    <small>
                      {new Date(artifact.createdAt).toLocaleString(
                        language === "bg" ? "bg-BG" : "en-GB"
                      )}
                    </small>
                    <span>
                      {t(
                        artifact.status === "ready"
                          ? "exportReady"
                          : artifact.status === "pending"
                            ? "exportPending"
                            : exportFailureKey(artifact)
                      )}
                    </span>
                  </div>
                  {artifact.status === "ready" ? (
                    <button
                      className="secondary-button"
                      disabled={busy}
                      onClick={() => void download(artifact)}
                      type="button"
                    >
                      {t("exportDownload")}
                    </button>
                  ) : artifact.status === "pending" ? (
                    <button
                      className="secondary-button"
                      disabled={busy}
                      onClick={() => void refreshArtifact(artifact)}
                      type="button"
                    >
                      {t("exportCheckStatus")}
                    </button>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </>
      ) : null}
    </section>
  );
}
