"use client";

import type {
  CalculationDraftV2,
  ProjectAccessV2,
  ProjectRevisionAuditListResponseV2,
  ProjectRevisionDetailV2,
  ProjectRevisionListItemV2,
  ProjectRevisionResponseV2,
  RetainedProjectRevisionDetailV1,
  RevisionActionAvailabilityV2
} from "@niedax/domain";
import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError, isAuthenticationError, newRequestKey } from "@/lib/api-client";
import {
  revisionStatusTranslationKey,
  revisionUnavailableTranslationKey,
  roleTranslationKey
} from "@/lib/access-presentation";
import { type TranslationKey, useI18n } from "@/lib/i18n";
import { auditActionKey, auditReasonKey, lifecycleActorLabel } from "@/lib/revision-presentation";
import {
  approveProjectRevision,
  checkProjectRevision,
  getProjectRevision,
  listProjectRevisionAudit,
  listProjectRevisions,
  saveProjectRevision
} from "@/lib/revision-api";
import {
  buildSaveRevisionInput,
  canSaveRevision as canOfferSaveRevision,
  mergeRevisionSummary,
  optionalComment,
  retryKeyFor,
  type RetryKey
} from "@/lib/revision-workflow";
import { workflowErrorKey } from "@/lib/workflow-error";

import { CalculationResults } from "./calculation-results";
import { ConfirmationDialog } from "./confirmation-dialog";
import { useSession } from "./session-provider";
import { AuthenticationRequired, FormField, LoadingPanel, StatusNotice } from "./shared-ui";

interface RevisionPanelProps {
  readonly projectId: string;
  readonly access: ProjectAccessV2;
  readonly acknowledgedDraftVersion: number;
  readonly calculation: CalculationDraftV2 | null;
  readonly calculationStale: boolean;
  readonly historyOnly?: boolean | undefined;
  readonly onReturnToDraft?: (() => void) | undefined;
}

type LoadState = "loading" | "ready" | "failed";
type LifecycleAction = "check" | "approve";

export function RevisionPanel({
  projectId,
  access,
  acknowledgedDraftVersion,
  calculation,
  calculationStale,
  historyOnly = false,
  onReturnToDraft
}: RevisionPanelProps) {
  const { language, t } = useI18n();
  const { markAnonymous, status: sessionStatus, user } = useSession();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [revisions, setRevisions] = useState<readonly ProjectRevisionListItemV2[]>([]);
  const [nextRevisionCursor, setNextRevisionCursor] = useState<string | null>(null);
  const [audit, setAudit] = useState<ProjectRevisionAuditListResponseV2 | null>(null);
  const [nextAuditCursor, setNextAuditCursor] = useState<string | null>(null);
  const [auditFailed, setAuditFailed] = useState(false);
  const [loadingMoreRevisions, setLoadingMoreRevisions] = useState(false);
  const [loadingMoreAudit, setLoadingMoreAudit] = useState(false);
  const [selectedRevisionId, setSelectedRevisionId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ProjectRevisionResponseV2["revision"] | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [name, setName] = useState("");
  const [comment, setComment] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [dialogAction, setDialogAction] = useState<LifecycleAction | null>(null);
  const [lifecycleComment, setLifecycleComment] = useState("");
  const [errorKey, setErrorKey] = useState<TranslationKey | null>(null);
  const [correlationId, setCorrelationId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState<TranslationKey | null>(null);
  const saveRetry = useRef<RetryKey | null>(null);
  const lifecycleRetry = useRef<RetryKey | null>(null);
  const detailGeneration = useRef(0);
  const historyHeadingRef = useRef<HTMLHeadingElement>(null);

  const showError = useCallback(
    (error: unknown, fallback: TranslationKey) => {
      if (isAuthenticationError(error)) {
        if (!markAnonymous(user)) return false;
        setErrorKey("sessionExpired");
      } else setErrorKey(workflowErrorKey(error) ?? fallback);
      setCorrelationId(error instanceof ApiError ? error.correlationId : null);
      return true;
    },
    [markAnonymous, user]
  );

  const loadHistory = useCallback(
    async (signal?: AbortSignal) => {
      if (!access.canReadHistory) {
        setLoadState("failed");
        setErrorKey("forbiddenAction");
        return;
      }
      setLoadState("loading");
      setErrorKey(null);
      setCorrelationId(null);
      setAuditFailed(false);
      try {
        const [listResult, auditResult] = await Promise.allSettled([
          listProjectRevisions(projectId, null, 100, signal),
          listProjectRevisionAudit(projectId, null, 100, signal)
        ]);
        if (listResult.status === "rejected") throw listResult.reason;
        setRevisions(listResult.value.revisions);
        setNextRevisionCursor(listResult.value.nextCursor);
        if (auditResult.status === "fulfilled") {
          setAudit(auditResult.value);
          setNextAuditCursor(auditResult.value.nextCursor);
        } else if (!signal?.aborted) {
          if (isAuthenticationError(auditResult.reason)) throw auditResult.reason;
          setAudit(null);
          setNextAuditCursor(null);
          setAuditFailed(true);
        }
        setLoadState("ready");
      } catch (error) {
        if (signal?.aborted) return;
        if (showError(error, "revisionsLoadFailed")) setLoadState("failed");
      }
    },
    [access, projectId, showError]
  );

  useEffect(() => {
    if (sessionStatus !== "authenticated" || !user) {
      detailGeneration.current += 1;
      saveRetry.current = null;
      lifecycleRetry.current = null;
      setLoadState("loading");
      setRevisions([]);
      setNextRevisionCursor(null);
      setAudit(null);
      setNextAuditCursor(null);
      setAuditFailed(false);
      setLoadingMoreRevisions(false);
      setLoadingMoreAudit(false);
      setSelectedRevisionId(null);
      setDetail(null);
      setDetailLoading(false);
      setName("");
      setComment("");
      setNameTouched(false);
      setSaveBusy(false);
      setLifecycleBusy(false);
      setDialogAction(null);
      setLifecycleComment("");
      setErrorKey(null);
      setCorrelationId(null);
      setAnnouncement(null);
      return;
    }
    const controller = new AbortController();
    void loadHistory(controller.signal);
    return () => controller.abort();
  }, [loadHistory, sessionStatus, user]);

  async function openRevision(revisionId: string) {
    const generation = ++detailGeneration.current;
    setSelectedRevisionId(revisionId);
    setDetail(null);
    setDetailLoading(true);
    setErrorKey(null);
    setCorrelationId(null);
    try {
      const response = await getProjectRevision(revisionId);
      if (generation !== detailGeneration.current) return;
      setDetail(response.revision);
      setRevisions((current) => mergeRevisionSummary(current, response.revision.summary));
    } catch (error) {
      if (generation !== detailGeneration.current) return;
      showError(error, "revisionLoadFailed");
    } finally {
      if (generation === detailGeneration.current) setDetailLoading(false);
    }
  }

  async function saveRevision() {
    if (!calculation || loadState !== "ready") return;
    setNameTouched(true);
    if (!canOfferSaveRevision(access, calculation, calculationStale, name)) return;
    const latestRevisionNumber = revisions[0]?.revisionNumber ?? 0;
    const input = buildSaveRevisionInput(
      calculation,
      acknowledgedDraftVersion,
      latestRevisionNumber,
      name,
      comment
    );
    const retry = retryKeyFor(saveRetry.current, input, newRequestKey);
    saveRetry.current = retry;
    setSaveBusy(true);
    setErrorKey(null);
    setCorrelationId(null);
    setAnnouncement(null);
    try {
      const response = await saveProjectRevision(projectId, input, retry.idempotencyKey);
      saveRetry.current = null;
      detailGeneration.current += 1;
      setName("");
      setComment("");
      setNameTouched(false);
      setSelectedRevisionId(response.revision.summary.id);
      setDetail(response.revision);
      setRevisions((current) => mergeRevisionSummary(current, response.revision.summary));
      setAnnouncement("revisionSaved");
      await refreshAfterMutation();
    } catch (error) {
      showError(error, "revisionMutationFailed");
      if (error instanceof ApiError && error.code === "CONFLICT_STALE_VERSION") {
        saveRetry.current = null;
        await refreshListsOnly();
      }
    } finally {
      setSaveBusy(false);
    }
  }

  function openLifecycleDialog(action: LifecycleAction) {
    setDialogAction(action);
    setLifecycleComment("");
    lifecycleRetry.current = null;
    setErrorKey(null);
  }

  async function confirmLifecycle() {
    if (!detail || !isV2RevisionDetail(detail) || !dialogAction) return;
    const summary = detail.summary;
    const common = {
      expectedLatestRevisionNumber: summary.revisionNumber,
      inputFingerprint: summary.inputFingerprint,
      comment: optionalComment(lifecycleComment)
    };
    const input =
      dialogAction === "check"
        ? { ...common, expectedStatus: "calculated" as const }
        : { ...common, expectedStatus: "checked" as const };
    const retry = retryKeyFor(lifecycleRetry.current, input, newRequestKey);
    lifecycleRetry.current = retry;
    setLifecycleBusy(true);
    setErrorKey(null);
    setCorrelationId(null);
    setAnnouncement(null);
    try {
      const response =
        input.expectedStatus === "calculated"
          ? await checkProjectRevision(summary.id, input, retry.idempotencyKey)
          : await approveProjectRevision(summary.id, input, retry.idempotencyKey);
      lifecycleRetry.current = null;
      detailGeneration.current += 1;
      setDialogAction(null);
      setDetail(response.revision);
      setRevisions((current) => mergeRevisionSummary(current, response.revision.summary));
      setAnnouncement(dialogAction === "check" ? "revisionChecked" : "revisionApproved");
      await refreshAfterMutation();
    } catch (error) {
      showError(error, "revisionMutationFailed");
      if (
        error instanceof ApiError &&
        ["CONFLICT_STALE_VERSION", "INVALID_STATE_TRANSITION"].includes(error.code)
      ) {
        lifecycleRetry.current = null;
        setDialogAction(null);
        await refreshListsOnly();
        await refreshRevisionDetail(summary.id);
      }
    } finally {
      setLifecycleBusy(false);
    }
  }

  async function refreshListsOnly() {
    const [listResult, auditResult] = await Promise.allSettled([
      listProjectRevisions(projectId),
      listProjectRevisionAudit(projectId)
    ]);
    const authenticationFailure = [listResult, auditResult].find(
      (result) => result.status === "rejected" && isAuthenticationError(result.reason)
    );
    if (authenticationFailure?.status === "rejected") {
      showError(authenticationFailure.reason, "sessionExpired");
      return;
    }
    if (listResult.status === "fulfilled") {
      setRevisions(listResult.value.revisions);
      setNextRevisionCursor(listResult.value.nextCursor);
    }
    if (auditResult.status === "fulfilled") {
      setAudit(auditResult.value);
      setNextAuditCursor(auditResult.value.nextCursor);
      setAuditFailed(false);
    } else {
      setAuditFailed(true);
    }
  }

  async function refreshAfterMutation() {
    await refreshListsOnly();
  }

  async function refreshRevisionDetail(revisionId: string) {
    const generation = ++detailGeneration.current;
    try {
      const response = await getProjectRevision(revisionId);
      if (generation !== detailGeneration.current) return;
      setDetail(response.revision);
      setRevisions((current) => mergeRevisionSummary(current, response.revision.summary));
    } catch (error) {
      if (generation !== detailGeneration.current) return;
      if (isAuthenticationError(error)) showError(error, "sessionExpired");
      // Keep the visible conflict and list refresh; the user can explicitly reopen the detail.
    }
  }

  async function loadMoreRevisions() {
    if (!nextRevisionCursor || loadingMoreRevisions) return;
    setLoadingMoreRevisions(true);
    setErrorKey(null);
    try {
      const response = await listProjectRevisions(projectId, nextRevisionCursor);
      setRevisions((current) =>
        response.revisions.reduce<readonly ProjectRevisionListItemV2[]>(
          (merged, revision) => mergeRevisionSummary(merged, revision),
          current
        )
      );
      setNextRevisionCursor(response.nextCursor);
    } catch (error) {
      showError(error, "revisionsLoadFailed");
    } finally {
      setLoadingMoreRevisions(false);
    }
  }

  async function loadMoreAudit() {
    if (!nextAuditCursor || loadingMoreAudit) return;
    setLoadingMoreAudit(true);
    setAuditFailed(false);
    try {
      const response = await listProjectRevisionAudit(projectId, nextAuditCursor);
      setAudit((current) => ({
        ...response,
        events: [
          ...(current?.events ?? []),
          ...response.events.filter(
            (event) => !current?.events.some((candidate) => candidate.id === event.id)
          )
        ]
      }));
      setNextAuditCursor(response.nextCursor);
    } catch (error) {
      if (isAuthenticationError(error)) showError(error, "sessionExpired");
      else setAuditFailed(true);
    } finally {
      setLoadingMoreAudit(false);
    }
  }

  const canSave =
    loadState === "ready" && canOfferSaveRevision(access, calculation, calculationStale, name);
  const saveUnavailable = !calculation
    ? t("calculationRequiredToSave")
    : calculationStale
      ? t("staleCalculationCannotSave")
      : !access.canSaveRevision
        ? t("actionUnavailable")
        : !name.trim()
          ? t("required")
          : null;

  if (sessionStatus === "loading") return <LoadingPanel label={t("sessionLoading")} />;
  if (sessionStatus === "failed")
    return <StatusNotice tone="error">{t("sessionLoadFailed")}</StatusNotice>;
  if (sessionStatus === "anonymous" || !user) return <AuthenticationRequired />;

  return (
    <div aria-busy={saveBusy || lifecycleBusy} className="revision-workspace">
      <span aria-live="polite" className="sr-only" role="status">
        {saveBusy
          ? t("savingRevision")
          : lifecycleBusy
            ? t(dialogAction === "approve" ? "approvingRevision" : "checkingRevision")
            : announcement
              ? t(announcement)
              : ""}
      </span>
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
      {announcement ? (
        <StatusNotice tone="success" live>
          {t(announcement)}
        </StatusNotice>
      ) : null}

      <section
        aria-busy={loadState === "loading"}
        aria-labelledby="revision-history-title"
        className="editor-card revision-list-panel"
      >
        <div className="card-heading">
          <div>
            <h2 id="revision-history-title" ref={historyHeadingRef} tabIndex={-1}>
              {t("revisionHistory")}
            </h2>
            <p>{t(historyOnly ? "retainedHistoryHint" : "saveRevisionHint")}</p>
          </div>
          {onReturnToDraft ? (
            <button className="secondary-button" onClick={onReturnToDraft} type="button">
              {t("backToDraft")}
            </button>
          ) : null}
        </div>

        {access.canSaveRevision ? (
          <div className="revision-save-form">
            <FormField
              error={nameTouched && !name.trim() ? t("required") : undefined}
              label={t("revisionName")}
              required
            >
              {(properties) => (
                <input
                  {...properties}
                  maxLength={500}
                  onBlur={() => setNameTouched(true)}
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    saveRetry.current = null;
                  }}
                  required
                />
              )}
            </FormField>
            <FormField label={`${t("revisionComment")} · ${t("optional")}`}>
              {(properties) => (
                <textarea
                  {...properties}
                  maxLength={2000}
                  value={comment}
                  onChange={(event) => {
                    setComment(event.target.value);
                    saveRetry.current = null;
                  }}
                />
              )}
            </FormField>
            <button
              aria-describedby={saveUnavailable ? "save-revision-unavailable" : undefined}
              className="primary-button"
              disabled={saveBusy || !canSave}
              onClick={() => void saveRevision()}
              type="button"
            >
              {saveBusy ? t("savingRevision") : t("saveRevision")}
            </button>
            {saveUnavailable ? (
              <small id="save-revision-unavailable">{saveUnavailable}</small>
            ) : null}
          </div>
        ) : !historyOnly ? (
          <p className="read-only-explanation">{t("actionUnavailable")}</p>
        ) : null}

        {loadState === "loading" ? <LoadingPanel label={t("loadingRevisions")} /> : null}
        {loadState === "failed" ? (
          <button className="secondary-button" onClick={() => void loadHistory()} type="button">
            {t("retry")}
          </button>
        ) : null}
        {loadState === "ready" && revisions.length === 0 ? (
          <p className="read-only-explanation">{t("noRevisions")}</p>
        ) : null}
        {loadState === "ready" && revisions.length ? (
          <ol className="revision-list">
            {revisions.map((revision) => (
              <li key={revision.id}>
                <button
                  aria-current={selectedRevisionId === revision.id ? "true" : undefined}
                  aria-label={`${t("viewRevision")} ${revision.revisionNumber}: ${revision.name ?? "—"}`}
                  onClick={() => void openRevision(revision.id)}
                  type="button"
                >
                  <span>
                    <strong>
                      {revision.revisionNumber} · {revision.name ?? t("retainedRevision")}
                    </strong>
                    <span className={`status-badge status-${revision.status}`}>
                      {t(revisionStatusTranslationKey(revision.status))}
                    </span>
                  </span>
                  <small>
                    {revision.recordVersion === "revision/v2"
                      ? revision.authorSnapshot.displayName
                      : (revision.authorDisplayName ?? "—")}{" "}
                    · {formatDate(revision.createdAt, language)}
                  </small>
                  {revision.recordVersion === "revision/v2" ? (
                    <>
                      <small>
                        {t("catalogVersion")}: {revision.catalogSnapshot.version} ·{" "}
                        {t("ruleVersion")}: {revision.ruleSnapshot.version}
                      </small>
                      <small>
                        {t("warnings")}: {revision.warningSummary.totalCount} ·{" "}
                        {revision.approvalReady ? t("approvalReady") : t("approvalBlocked")}
                      </small>
                    </>
                  ) : (
                    <small>{t("unsupportedRevisionVersion")}</small>
                  )}
                </button>
              </li>
            ))}
          </ol>
        ) : null}
        {nextRevisionCursor ? (
          <button
            className="secondary-button history-load-more"
            disabled={loadingMoreRevisions}
            onClick={() => void loadMoreRevisions()}
            type="button"
          >
            {loadingMoreRevisions ? t("loadingRevisions") : t("loadMore")}
          </button>
        ) : null}
      </section>

      {detailLoading ? <LoadingPanel label={t("loadingRevision")} /> : null}
      {detail ? (
        isV2RevisionDetail(detail) ? (
          <RevisionDetail
            detail={detail}
            language={language}
            onApprove={() => openLifecycleDialog("approve")}
            onCheck={() => openLifecycleDialog("check")}
          />
        ) : (
          <RetainedRevisionDetail detail={detail} language={language} />
        )
      ) : null}

      {audit?.events.length ? (
        <section aria-labelledby="revision-audit-title" className="editor-card revision-audit">
          <h2 id="revision-audit-title">{t("history")}</h2>
          <ol className="read-only-list">
            {audit.events.map((event) => (
              <li key={event.id}>
                <strong>{t(auditActionKey(event.action))}</strong>
                <span>
                  {lifecycleActorLabel(event.actorSnapshot, t)} ·{" "}
                  {formatDate(event.occurredAt, language)}
                </span>
                <small>
                  {t(event.outcome === "succeeded" ? "auditSucceeded" : "auditRejected")}
                  {event.reasonCode ? ` · ${t(auditReasonKey(event.reasonCode))}` : ""}
                </small>
              </li>
            ))}
          </ol>
          {nextAuditCursor ? (
            <button
              className="secondary-button history-load-more"
              disabled={loadingMoreAudit}
              onClick={() => void loadMoreAudit()}
              type="button"
            >
              {loadingMoreAudit ? t("loadingRevisions") : t("loadMore")}
            </button>
          ) : null}
        </section>
      ) : null}
      {auditFailed ? (
        <StatusNotice tone="error" live>
          <p>{t("auditLoadFailed")}</p>
          <button
            className="secondary-button"
            onClick={() => void refreshListsOnly()}
            type="button"
          >
            {t("retry")}
          </button>
        </StatusNotice>
      ) : null}

      {dialogAction && detail && isV2RevisionDetail(detail) ? (
        <ConfirmationDialog
          busy={lifecycleBusy}
          cancelLabel={t("cancel")}
          confirmLabel={t(dialogAction === "approve" ? "approveRevision" : "checkRevision")}
          description={`${detail.summary.revisionNumber} · ${detail.summary.name}`}
          fallbackFocusRef={historyHeadingRef}
          onCancel={() => setDialogAction(null)}
          onConfirm={() => void confirmLifecycle()}
          title={t(dialogAction === "approve" ? "confirmApproveRevision" : "confirmCheckRevision")}
        >
          <label className="app-field">
            <span>
              {t("lifecycleComment")} · {t("optional")}
            </span>
            <textarea
              autoFocus={false}
              disabled={lifecycleBusy}
              maxLength={2000}
              value={lifecycleComment}
              onChange={(event) => {
                setLifecycleComment(event.target.value);
                lifecycleRetry.current = null;
              }}
            />
          </label>
        </ConfirmationDialog>
      ) : null}
    </div>
  );
}

function RevisionDetail({
  detail,
  language,
  onCheck,
  onApprove
}: Readonly<{
  detail: ProjectRevisionDetailV2;
  language: "bg" | "en";
  onCheck: () => void;
  onApprove: () => void;
}>) {
  const { t } = useI18n();
  const { summary } = detail;
  return (
    <section aria-labelledby="revision-detail-title" className="revision-detail">
      <div className="editor-card revision-detail-heading">
        <div className="card-heading">
          <div>
            <p className="eyebrow">{t("immutableRevision")}</p>
            <h2 id="revision-detail-title">
              {summary.revisionNumber} · {summary.name}
            </h2>
          </div>
          <span className={`status-badge status-${summary.status}`}>
            {t(revisionStatusTranslationKey(summary.status))}
          </span>
        </div>
        {summary.status === "approved" ? (
          <StatusNotice>{t("approvedRevisionReadOnly")}</StatusNotice>
        ) : null}
        <dl className="revision-metadata">
          <div>
            <dt>{t("revisionAuthor")}</dt>
            <dd>
              {summary.authorSnapshot.displayName} ·{" "}
              {t(roleTranslationKey(summary.authorSnapshot.role))}
            </dd>
          </div>
          <div>
            <dt>{t("revisionCreatedAt")}</dt>
            <dd>{formatDate(summary.createdAt, language)}</dd>
          </div>
          <div>
            <dt>{t("revisionComment")}</dt>
            <dd>{summary.comment ?? "—"}</dd>
          </div>
          <div>
            <dt>{t("checkedAt")}</dt>
            <dd>{summary.checkedAt ? formatDate(summary.checkedAt, language) : "—"}</dd>
          </div>
          <div>
            <dt>{t("approvedAt")}</dt>
            <dd>{summary.approvedAt ? formatDate(summary.approvedAt, language) : "—"}</dd>
          </div>
          <div>
            <dt>{t("revisionWarnings")}</dt>
            <dd>{summary.warningSummary.totalCount}</dd>
          </div>
          <div>
            <dt>{t("blockingApprovalWarnings")}</dt>
            <dd>{summary.warningSummary.blocksApprovalCount}</dd>
          </div>
          <div>
            <dt>{t("fingerprint")}</dt>
            <dd>
              <code>{summary.inputFingerprint}</code>
            </dd>
          </div>
        </dl>
        <div className="revision-actions">
          <LifecycleAction
            availability={summary.actions.check}
            label={t("checkRevision")}
            onClick={onCheck}
            relevant={summary.status === "calculated"}
          />
          <LifecycleAction
            availability={summary.actions.approve}
            label={t("approveRevision")}
            onClick={onApprove}
            relevant={summary.status === "checked"}
          />
        </div>
        {detail.lifecycleEvents.length ? (
          <div className="revision-evidence">
            <h3>{t("approvalEvidence")}</h3>
            <ol className="read-only-list">
              {detail.lifecycleEvents.map((event) => (
                <li key={event.id}>
                  <strong>{t(auditActionKey(event.action))}</strong>
                  <span>
                    {lifecycleActorLabel(event.actorSnapshot, t)} ·{" "}
                    {formatDate(event.occurredAt, language)}
                  </span>
                  <small>
                    {event.priorStatus ? t(revisionStatusTranslationKey(event.priorStatus)) : "—"}
                    {" → "}
                    {event.resultingStatus
                      ? t(revisionStatusTranslationKey(event.resultingStatus))
                      : "—"}
                    {event.comment ? ` · ${event.comment}` : ""}
                  </small>
                  <small>
                    {t("supportCorrelation")}: <code>{event.correlationId}</code>
                  </small>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </div>
      <CalculationResults result={detail.snapshot.calculationResult} stale={false} />
      <details className="editor-card checksum-details">
        <summary>{t("checksums")}</summary>
        <dl className="revision-metadata">
          {Object.entries(detail.checksums).map(([key, value]) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd>
                <code>{value}</code>
              </dd>
            </div>
          ))}
        </dl>
      </details>
    </section>
  );
}

function RetainedRevisionDetail({
  detail,
  language
}: Readonly<{
  detail: RetainedProjectRevisionDetailV1;
  language: "bg" | "en";
}>) {
  const { t } = useI18n();
  return (
    <section
      aria-labelledby="retained-revision-title"
      className="editor-card revision-detail-heading"
    >
      <div className="card-heading">
        <div>
          <p className="eyebrow">{t("retainedRevision")}</p>
          <h2 id="retained-revision-title">
            {detail.summary.revisionNumber} · {detail.summary.name ?? t("retainedRevision")}
          </h2>
        </div>
        <span className={`status-badge status-${detail.summary.status}`}>
          {t(revisionStatusTranslationKey(detail.summary.status))}
        </span>
      </div>
      <StatusNotice>{t("unsupportedRevisionVersion")}</StatusNotice>
      <dl className="revision-metadata">
        <div>
          <dt>{t("revisionAuthor")}</dt>
          <dd>{detail.summary.authorDisplayName ?? "—"}</dd>
        </div>
        <div>
          <dt>{t("revisionCreatedAt")}</dt>
          <dd>{formatDate(detail.summary.createdAt, language)}</dd>
        </div>
        <div>
          <dt>{t("fingerprint")}</dt>
          <dd>
            <code>{detail.summary.inputFingerprint}</code>
          </dd>
        </div>
      </dl>
      <details className="retained-snapshot-details">
        <summary>{t("immutableRevision")}</summary>
        <pre>
          {JSON.stringify(
            { revision: detail.revision, inputSnapshot: detail.inputSnapshot },
            null,
            2
          )}
        </pre>
      </details>
    </section>
  );
}

function LifecycleAction({
  availability,
  label,
  relevant,
  onClick
}: Readonly<{
  availability: RevisionActionAvailabilityV2;
  label: string;
  relevant: boolean;
  onClick: () => void;
}>) {
  const { t } = useI18n();
  if (!relevant || availability.reason === "notAuthorized") return null;
  const reasonId = availability.reason ? `revision-action-${availability.reason}` : undefined;
  return (
    <div>
      <button
        aria-describedby={reasonId}
        className="primary-button"
        disabled={!availability.allowed}
        onClick={onClick}
        type="button"
      >
        {label}
      </button>
      {availability.reason ? (
        <small id={reasonId}>{t(revisionUnavailableTranslationKey(availability.reason))}</small>
      ) : null}
    </div>
  );
}

function formatDate(value: string, language: "bg" | "en"): string {
  return new Intl.DateTimeFormat(language === "bg" ? "bg-BG" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function isV2RevisionDetail(
  detail: ProjectRevisionResponseV2["revision"]
): detail is ProjectRevisionDetailV2 {
  return "snapshot" in detail;
}
