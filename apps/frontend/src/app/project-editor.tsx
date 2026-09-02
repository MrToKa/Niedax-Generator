"use client";

import type {
  CalculationDraftV2,
  EditorCatalogResponseV2,
  ProjectAccessV2,
  ProjectDraftInputV2,
  ProjectV2,
  ProjectValidationResponseV2
} from "@niedax/domain";
import { ProjectValidationResponseV2Schema } from "@niedax/domain";
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState
} from "react";

import { ApiError, isAuthenticationError, newRequestKey } from "@/lib/api-client";
import { readOnlyProjectTranslationKey } from "@/lib/access-presentation";
import { getProjectAccess } from "@/lib/auth-api";
import {
  asyncRequestIsCurrent,
  calculationRequestWasSuperseded,
  contentSignature,
  requestContextWasSuperseded,
  type AutosaveStatus
} from "@/lib/autosave-state";
import { isSameCatalogContext, reconcileProjectDraftCatalog } from "@/lib/catalog-selection";
import {
  canCalculateLocally,
  projectDraftReducer,
  projectToDraft,
  validateDraftLocally
} from "@/lib/editor-state";
import { validationFieldErrors, validationLocation } from "@/lib/editor-validation";
import { type TranslationKey, useI18n } from "@/lib/i18n";
import {
  calculateProjectDraft,
  getCurrentCalculation,
  getEditorCatalog,
  getProject,
  replaceProjectDraft,
  validateProjectDraft
} from "@/lib/project-api";
import { workflowErrorKey } from "@/lib/workflow-error";

import { CalculationResults } from "./calculation-results";
import {
  EditorSections,
  editorSteps,
  isEditorStep,
  type EditorStep
} from "./project-editor-sections";
import { ReadOnlyEditorSections } from "./project-read-only-sections";
import { RevisionPanel } from "./revision-panel";
import { useSession } from "./session-provider";
import { AuthenticationRequired, LoadingPanel, StatusNotice } from "./shared-ui";

type LoadState = "loading" | "ready" | "authentication" | "failed";
interface FailedSave {
  readonly draft: ProjectDraftInputV2;
  readonly idempotencyKey: string;
}

export function ProjectEditor({ projectId }: Readonly<{ projectId: string }>) {
  const { t } = useI18n();
  const { markAnonymous, status: sessionStatus, user } = useSession();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [project, setProject] = useState<ProjectV2 | null>(null);
  const [access, setAccess] = useState<ProjectAccessV2 | null>(null);
  const [draft, dispatchDraft] = useReducer(projectDraftReducer, null);
  const [catalog, setCatalog] = useState<EditorCatalogResponseV2 | null>(null);
  const [catalogFailed, setCatalogFailed] = useState(false);
  const [activeStep, setActiveStep] = useState<EditorStep>("project");
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<AutosaveStatus>("idle");
  const [validation, setValidation] = useState<ProjectValidationResponseV2 | null>(null);
  const [validationBusy, setValidationBusy] = useState(false);
  const [calculation, setCalculation] = useState<CalculationDraftV2 | null>(null);
  const [calculationBusy, setCalculationBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [correlationId, setCorrelationId] = useState<string | null>(null);
  const [saveNonce, setSaveNonce] = useState(0);
  const [bufferedEditorDirty, setBufferedEditorDirty] = useState(false);
  const [actionAnnouncement, setActionAnnouncement] = useState<TranslationKey | null>(null);
  const [catalogClearedFields, setCatalogClearedFields] = useState<readonly string[]>([]);
  const [catalogRebasePending, setCatalogRebasePending] = useState(false);

  const mounted = useRef(true);
  const draftRef = useRef<ProjectDraftInputV2 | null>(null);
  const saveStatusRef = useRef<AutosaveStatus>("idle");
  const acknowledged = useRef({ version: 0, content: "" });
  const loadGeneration = useRef(0);
  const validationGeneration = useRef(0);
  const calculationGeneration = useRef(0);
  const saveGeneration = useRef(0);
  const inFlight = useRef(false);
  const inFlightSave = useRef<Promise<boolean> | null>(null);
  const resaveAfterFlight = useRef(false);
  const debounceTimer = useRef<number | null>(null);
  const failedSave = useRef<FailedSave | null>(null);
  const requestController = useRef<AbortController | null>(null);
  const catalogRebaseRequired = useRef(false);
  const updateSaveStatus = useCallback((status: AutosaveStatus) => {
    saveStatusRef.current = status;
    setSaveStatus(status);
  }, []);
  const setDraft = useCallback<Dispatch<SetStateAction<ProjectDraftInputV2 | null>>>((value) => {
    if (typeof value === "function") dispatchDraft({ type: "update", update: value });
    else dispatchDraft({ type: "replace", draft: value });
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (debounceTimer.current !== null) window.clearTimeout(debounceTimer.current);
      requestController.current?.abort();
    };
  }, []);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);
  useEffect(() => {
    saveStatusRef.current = saveStatus;
  }, [saveStatus]);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const generation = ++loadGeneration.current;
      const isCurrent = () =>
        mounted.current && generation === loadGeneration.current && !signal?.aborted;
      validationGeneration.current += 1;
      calculationGeneration.current += 1;
      if (debounceTimer.current !== null) {
        window.clearTimeout(debounceTimer.current);
        debounceTimer.current = null;
      }
      requestController.current?.abort();
      requestController.current = null;
      saveGeneration.current += 1;
      inFlight.current = false;
      inFlightSave.current = null;
      resaveAfterFlight.current = false;
      failedSave.current = null;
      acknowledged.current = { version: 0, content: "" };
      draftRef.current = null;
      saveStatusRef.current = "idle";
      setLoadState("loading");
      setProject(null);
      setAccess(null);
      setDraft(null);
      setCatalog(null);
      setCatalogFailed(false);
      setActiveStep("project");
      setSelectedRouteId(null);
      updateSaveStatus("idle");
      setCalculation(null);
      setCalculationBusy(false);
      setValidation(null);
      setValidationBusy(false);
      setActionError(null);
      setCorrelationId(null);
      setActionAnnouncement(null);
      setBufferedEditorDirty(false);
      setCatalogClearedFields([]);
      catalogRebaseRequired.current = false;
      setCatalogRebasePending(false);
      try {
        const response = await getProject(projectId, signal);
        if (!isCurrent()) return;
        const nextDraft = projectToDraft(response.project);
        const [accessResult, catalogResult, calculationResult] = await Promise.allSettled([
          getProjectAccess(projectId, signal),
          getEditorCatalog(signal),
          getCurrentCalculation(projectId, signal)
        ]);
        if (!isCurrent()) return;
        const sessionFailure = [accessResult, catalogResult, calculationResult].find(
          (result) => result.status === "rejected" && isAuthenticationError(result.reason)
        );
        if (sessionFailure) {
          if (markAnonymous(user)) setLoadState("authentication");
          return;
        }
        if (accessResult.status === "rejected") {
          setLoadState("failed");
          return;
        }
        const nextAccess = accessResult.value.access;
        let hydratedDraft = nextDraft;
        let requiresRebase = false;
        if (catalogResult.status === "fulfilled") {
          const nextCatalog = catalogResult.value;
          requiresRebase = nextAccess.canEditDraft && !isSameCatalogContext(response, nextCatalog);
          setCatalog(nextCatalog);
          setCatalogFailed(false);
          if (nextAccess.canEditDraft) {
            const reconciled = reconcileProjectDraftCatalog(nextDraft, nextCatalog);
            if (reconciled.cleared.length) {
              hydratedDraft = reconciled.draft;
              setCatalogClearedFields(reconciled.cleared);
            }
          }
        } else {
          setCatalogFailed(true);
        }
        acknowledged.current = {
          version: response.project.draftVersion,
          content: contentSignature(nextDraft)
        };
        catalogRebaseRequired.current = requiresRebase;
        setCatalogRebasePending(requiresRebase);
        setProject(response.project);
        setAccess(nextAccess);
        setDraft(hydratedDraft);
        draftRef.current = hydratedDraft;
        setSelectedRouteId(hydratedDraft.routes[0]?.id ?? null);
        updateSaveStatus(requiresRebase ? "unsaved" : "idle");
        if (requiresRebase) setSaveNonce((value) => value + 1);
        if (calculationResult.status === "fulfilled")
          setCalculation(calculationResult.value.calculation);
        setLoadState("ready");
      } catch (error) {
        if (!isCurrent()) return;
        if (isAuthenticationError(error)) {
          if (markAnonymous(user)) setLoadState("authentication");
        } else setLoadState("failed");
      }
    },
    [markAnonymous, projectId, updateSaveStatus, user]
  );

  useEffect(() => {
    if (sessionStatus !== "authenticated" || !user) return;
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, sessionStatus, user]);

  useEffect(() => {
    if (sessionStatus === "authenticated" && user) return;
    loadGeneration.current += 1;
    validationGeneration.current += 1;
    calculationGeneration.current += 1;
    saveGeneration.current += 1;
    requestController.current?.abort();
    requestController.current = null;
    if (debounceTimer.current !== null) {
      window.clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
    inFlight.current = false;
    inFlightSave.current = null;
    resaveAfterFlight.current = false;
    failedSave.current = null;
    acknowledged.current = { version: 0, content: "" };
    draftRef.current = null;
    setProject(null);
    setAccess(null);
    setDraft(null);
    setCatalog(null);
    setCatalogFailed(false);
    setActiveStep("project");
    setSelectedRouteId(null);
    setCalculation(null);
    setCalculationBusy(false);
    setValidation(null);
    setValidationBusy(false);
    setActionError(null);
    setCorrelationId(null);
    setActionAnnouncement(null);
    setBufferedEditorDirty(false);
    setCatalogClearedFields([]);
    catalogRebaseRequired.current = false;
    setCatalogRebasePending(false);
    updateSaveStatus("idle");
  }, [sessionStatus, setDraft, updateSaveStatus, user]);

  useEffect(() => {
    if (loadState !== "ready" || !draft || !catalog || !access?.canEditDraft) return;
    const reconciled = reconcileProjectDraftCatalog(draft, catalog);
    if (!reconciled.cleared.length) return;
    setDraft(reconciled.draft);
    draftRef.current = reconciled.draft;
    setCatalogClearedFields(reconciled.cleared);
  }, [access?.canEditDraft, catalog, draft, loadState, setDraft]);

  const performSave = useCallback(
    (snapshot: ProjectDraftInputV2, idempotencyKey: string): Promise<boolean> => {
      if (!access?.canEditDraft) return Promise.resolve(false);
      if (inFlightSave.current) return inFlightSave.current;
      const operation: Promise<boolean> = (async () => {
        resaveAfterFlight.current = false;
        const generation = ++saveGeneration.current;
        const expectedVersion = acknowledged.current.version;
        inFlight.current = true;
        failedSave.current = { draft: snapshot, idempotencyKey };
        updateSaveStatus("saving");
        setActionError(null);
        setCorrelationId(null);
        const controller = new AbortController();
        requestController.current = controller;
        try {
          const response = await replaceProjectDraft(
            projectId,
            expectedVersion,
            snapshot,
            idempotencyKey,
            controller.signal
          );
          if (!mounted.current || generation !== saveGeneration.current) return false;
          acknowledged.current = {
            version: response.project.draftVersion,
            content: contentSignature(snapshot)
          };
          setProject(response.project);
          failedSave.current = null;
          let nextCatalog: EditorCatalogResponseV2;
          try {
            nextCatalog = await getEditorCatalog(controller.signal);
          } catch (error) {
            if (!mounted.current || controller.signal.aborted) return false;
            if (isAuthenticationError(error)) {
              if (markAnonymous(user)) setLoadState("authentication");
            } else {
              catalogRebaseRequired.current = false;
              setCatalogRebasePending(false);
              setCatalog(null);
              setCatalogFailed(true);
              const latest = draftRef.current;
              if (latest && contentSignature(latest) !== acknowledged.current.content) {
                resaveAfterFlight.current = true;
                updateSaveStatus("unsaved");
              } else updateSaveStatus("saved");
            }
            return false;
          }
          if (!mounted.current || generation !== saveGeneration.current) return false;
          setCatalog(nextCatalog);
          setCatalogFailed(false);
          const requiresRebase = !isSameCatalogContext(response, nextCatalog);
          catalogRebaseRequired.current = requiresRebase;
          setCatalogRebasePending(requiresRebase);
          const latestBeforeReconcile = draftRef.current;
          if (latestBeforeReconcile) {
            const reconciled = reconcileProjectDraftCatalog(latestBeforeReconcile, nextCatalog);
            if (reconciled.cleared.length) {
              setDraft(reconciled.draft);
              draftRef.current = reconciled.draft;
              setCatalogClearedFields(reconciled.cleared);
            }
          }
          const latest = draftRef.current;
          if (
            requiresRebase ||
            (latest && contentSignature(latest) !== acknowledged.current.content)
          ) {
            resaveAfterFlight.current = true;
            updateSaveStatus("unsaved");
          } else updateSaveStatus("saved");
          return true;
        } catch (error) {
          if (!mounted.current || controller.signal.aborted) return false;
          if (isAuthenticationError(error)) {
            if (markAnonymous(user)) setLoadState("authentication");
          } else if (error instanceof ApiError && error.code === "CONFLICT_STALE_VERSION")
            updateSaveStatus("conflict");
          else {
            updateSaveStatus("failed");
            if (error instanceof ApiError) {
              setCorrelationId(error.correlationId);
              if (workflowErrorKey(error) === "forbiddenAction") {
                setActionError(t("forbiddenAction"));
              }
            }
          }
          return false;
        } finally {
          if (generation === saveGeneration.current) inFlight.current = false;
        }
      })().finally(() => {
        if (inFlightSave.current === operation) {
          inFlightSave.current = null;
          if (resaveAfterFlight.current && mounted.current) {
            resaveAfterFlight.current = false;
            setSaveNonce((value) => value + 1);
          }
        }
      });
      inFlightSave.current = operation;
      return operation;
    },
    [access?.canEditDraft, markAnonymous, projectId, t, updateSaveStatus, user]
  );

  useEffect(() => {
    if (loadState !== "ready" || !draft || !project || !access?.canEditDraft || inFlight.current)
      return;
    if (bufferedEditorDirty) {
      updateSaveStatus("unsaved");
      return;
    }
    if (["conflict", "failed"].includes(saveStatusRef.current)) return;
    const local = validateDraftLocally(draft);
    if (!local.validForSave) {
      updateSaveStatus("validationBlocked");
      return;
    }
    const currentContent = contentSignature(draft);
    if (currentContent === acknowledged.current.content && !catalogRebaseRequired.current) {
      updateSaveStatus("saved");
      return;
    }
    updateSaveStatus("unsaved");
    const timeout = window.setTimeout(() => void performSave(draft, newRequestKey()), 700);
    debounceTimer.current = timeout;
    return () => {
      window.clearTimeout(timeout);
      if (debounceTimer.current === timeout) debounceTimer.current = null;
    };
  }, [
    access?.canEditDraft,
    bufferedEditorDirty,
    draft,
    loadState,
    performSave,
    project,
    saveNonce,
    updateSaveStatus
  ]);

  const flushLatestDraft = useCallback(async (): Promise<boolean> => {
    if (!access?.canEditDraft) return false;
    if (debounceTimer.current !== null) {
      window.clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
    for (let attempts = 0; attempts < 10; attempts += 1) {
      if (["conflict", "failed"].includes(saveStatusRef.current)) return false;
      const pending = inFlightSave.current;
      if (pending) {
        if (!(await pending)) return false;
        continue;
      }
      const snapshot = draftRef.current;
      if (!snapshot) return false;
      if (!validateDraftLocally(snapshot).validForSave) {
        updateSaveStatus("validationBlocked");
        return false;
      }
      if (
        contentSignature(snapshot) === acknowledged.current.content &&
        !catalogRebaseRequired.current
      )
        return true;
      if (!(await performSave(snapshot, newRequestKey()))) return false;
    }
    // Do not calculate an intermediate revision when edits keep arriving while the
    // action is flushing. The normal debounced autosave will resume for the latest draft.
    updateSaveStatus("unsaved");
    setSaveNonce((value) => value + 1);
    return false;
  }, [access?.canEditDraft, performSave, updateSaveStatus]);

  async function retryFailedSave() {
    const failed = failedSave.current;
    if (failed) await performSave(failed.draft, failed.idempotencyKey);
  }

  function requestCatalogRebase() {
    if (!access?.canEditDraft) return;
    catalogRebaseRequired.current = true;
    setCatalogRebasePending(true);
    if (failedSave.current || ["failed", "conflict"].includes(saveStatusRef.current)) return;
    updateSaveStatus("unsaved");
    setSaveNonce((value) => value + 1);
  }

  async function runValidation() {
    if (bufferedEditorDirty || !access?.canValidate) return;
    const generation = ++validationGeneration.current;
    const requestedLoadGeneration = loadGeneration.current;
    const isCurrent = () =>
      mounted.current &&
      asyncRequestIsCurrent(
        generation,
        validationGeneration.current,
        requestedLoadGeneration,
        loadGeneration.current
      );
    setValidationBusy(true);
    setActionAnnouncement(null);
    setActionError(null);
    let validationVersion: number | null = null;
    let validationContent = "";
    try {
      if (!(await flushLatestDraft())) return;
      if (!isCurrent()) return;
      validationVersion = acknowledged.current.version;
      validationContent = acknowledged.current.content;
      const response = await validateProjectDraft(projectId, validationVersion);
      if (!isCurrent()) return;
      const latest = draftRef.current;
      if (
        !latest ||
        requestContextWasSuperseded(
          validationVersion,
          validationContent,
          acknowledged.current.version,
          contentSignature(latest)
        )
      ) {
        setValidation(null);
        setActionAnnouncement("validationSuperseded");
        return;
      }
      setValidation(response);
      setActionAnnouncement("validationComplete");
      setCorrelationId(response.correlationId);
      const firstBlocking = response.blockingErrors[0];
      if (firstBlocking) focusValidationIssue(firstBlocking.path, requestedLoadGeneration);
    } catch (error) {
      if (!isCurrent()) return;
      if (isAuthenticationError(error)) {
        if (markAnonymous(user)) setLoadState("authentication");
      } else if (error instanceof ApiError) {
        const errorKey = workflowErrorKey(error);
        setActionError(
          t(errorKey && errorKey !== "revisionConflict" ? errorKey : "validationFailed")
        );
        setCorrelationId(error.correlationId);
        if (error.code === "CATALOG_SNAPSHOT_MISSING" || error.code === "RULE_SNAPSHOT_MISSING")
          requestCatalogRebase();
      } else setActionError(t("validationFailed"));
    } finally {
      if (isCurrent()) setValidationBusy(false);
    }
  }

  function focusValidationIssue(
    path: readonly (string | number)[],
    expectedLoadGeneration = loadGeneration.current
  ) {
    const isCurrent = () => mounted.current && expectedLoadGeneration === loadGeneration.current;
    if (!isCurrent()) return;
    const current = draftRef.current;
    if (!current) return;
    const location = validationLocation(path, current);
    setActiveStep(location.step);
    if (location.routeId) setSelectedRouteId(location.routeId);
    window.requestAnimationFrame(() => {
      if (!isCurrent()) return;
      window.requestAnimationFrame(() => {
        if (!isCurrent()) return;
        const candidates = Array.from(document.querySelectorAll<HTMLElement>("[data-field-path]"));
        const target =
          candidates.find((element) => element.dataset.fieldPath === location.path) ??
          candidates.find((element) =>
            element.dataset.fieldPath?.startsWith(`${location.path}.`)
          ) ??
          candidates.find((element) =>
            location.path.startsWith(`${element.dataset.fieldPath ?? ""}.`)
          );
        target?.focus();
      });
    });
  }

  async function runCalculation() {
    if (bufferedEditorDirty || !access?.canCalculate) return;
    const generation = ++calculationGeneration.current;
    const requestedLoadGeneration = loadGeneration.current;
    const isCurrent = () =>
      mounted.current &&
      asyncRequestIsCurrent(
        generation,
        calculationGeneration.current,
        requestedLoadGeneration,
        loadGeneration.current
      );
    setCalculationBusy(true);
    setActionAnnouncement(null);
    setActionError(null);
    let calculationVersion: number | null = null;
    let calculationContent = "";
    try {
      if (!(await flushLatestDraft())) return;
      if (!isCurrent()) return;
      calculationVersion = acknowledged.current.version;
      calculationContent = acknowledged.current.content;
      const response = await calculateProjectDraft(projectId, calculationVersion, newRequestKey());
      if (!isCurrent()) return;
      setCalculation(response.calculation);
      setActiveStep("results");
      const latest = draftRef.current;
      setActionAnnouncement(
        !latest ||
          requestContextWasSuperseded(
            calculationVersion,
            calculationContent,
            acknowledged.current.version,
            contentSignature(latest)
          )
          ? "calculationSuperseded"
          : "calculationComplete"
      );
      setCorrelationId(response.correlationId);
      setValidation(null);
    } catch (error) {
      if (!isCurrent()) return;
      if (isAuthenticationError(error)) {
        if (markAnonymous(user)) setLoadState("authentication");
      } else if (error instanceof ApiError) {
        const errorKey = workflowErrorKey(error);
        setActionError(
          t(errorKey && errorKey !== "revisionConflict" ? errorKey : "calculationFailed")
        );
        setCorrelationId(error.correlationId);
        if (error.code === "CONFLICT_STALE_VERSION") {
          const pendingSave = inFlightSave.current;
          if (pendingSave) await pendingSave;
          if (!isCurrent()) return;
          if (failedSave.current) return;
          if (
            calculationVersion !== null &&
            calculationRequestWasSuperseded(calculationVersion, acknowledged.current.version)
          )
            setActionError(t("calculationSuperseded"));
          else updateSaveStatus("conflict");
        }
        if (error.code === "CATALOG_SNAPSHOT_MISSING" || error.code === "RULE_SNAPSHOT_MISSING")
          requestCatalogRebase();
        if (
          (error.code === "VALIDATION_FAILED" || error.code === "CALCULATION_FAILED") &&
          error.details?.kind === "validation"
        ) {
          const latest = draftRef.current;
          if (
            calculationVersion === null ||
            !latest ||
            requestContextWasSuperseded(
              calculationVersion,
              calculationContent,
              acknowledged.current.version,
              contentSignature(latest)
            )
          ) {
            setActionError(t("calculationSuperseded"));
          } else {
            const nextValidation = ProjectValidationResponseV2Schema.parse({
              schemaVersion: "project-validation-response/v2",
              correlationId: error.correlationId,
              projectId,
              draftVersion: calculationVersion,
              blockingErrors: error.details.issues,
              warnings: [],
              engineeringReview: [],
              canCalculate: false
            });
            setValidation(nextValidation);
            const firstBlocking = nextValidation.blockingErrors[0];
            if (firstBlocking) focusValidationIssue(firstBlocking.path, requestedLoadGeneration);
          }
        }
      } else setActionError(t("calculationFailed"));
    } finally {
      if (isCurrent()) setCalculationBusy(false);
    }
  }

  const saveLabel = t(
    saveStatus === "unsaved"
      ? "saveUnsaved"
      : saveStatus === "saving"
        ? "saveSaving"
        : saveStatus === "saved" || saveStatus === "idle"
          ? "saveSaved"
          : saveStatus === "validationBlocked"
            ? "saveBlocked"
            : saveStatus === "conflict"
              ? "saveConflict"
              : "saveFailed"
  );
  const localCanCalculate = draft
    ? Boolean(access?.canCalculate) && canCalculateLocally(draft, catalog) && !catalogRebasePending
    : false;
  const fieldErrors = useMemo(() => {
    const errors = new Map(validationFieldErrors(validation));
    if (draft) {
      for (const [path, message] of validateDraftLocally(draft).errors) {
        if (!errors.has(path)) errors.set(path, message);
      }
    }
    return errors;
  }, [draft, validation]);
  const resultStale = calculation
    ? calculation.stale ||
      calculation.draftVersion !== acknowledged.current.version ||
      (draft ? contentSignature(draft) !== acknowledged.current.content : false) ||
      catalogRebasePending ||
      bufferedEditorDirty
    : false;
  function changeStep(step: EditorStep) {
    if (step !== activeStep && bufferedEditorDirty) {
      setActionError(t("finishBufferedEdit"));
      return;
    }
    setActionError(null);
    setActiveStep(step);
  }

  if (sessionStatus === "loading") return <LoadingPanel label={t("sessionLoading")} />;
  if (sessionStatus === "failed")
    return <StatusNotice tone="error">{t("sessionLoadFailed")}</StatusNotice>;
  if (sessionStatus === "anonymous" || !user) return <AuthenticationRequired />;
  if (loadState === "loading") return <LoadingPanel label={t("loadingProject")} />;
  if (loadState === "authentication") return <AuthenticationRequired />;
  if (loadState === "failed" || !draft || !project || !access) {
    return (
      <StatusNotice tone="error">
        <p>{t("projectLoadFailed")}</p>
        <button className="secondary-button" onClick={() => void load()} type="button">
          {t("retry")}
        </button>
      </StatusNotice>
    );
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <small>{project.code}</small>
          <h1>{project.name}</h1>
          <p>
            {t("owner")}: {project.ownerDisplayName ?? "—"} · {t("draftVersion")}:{" "}
            {acknowledged.current.version} · {project.status}
          </p>
        </div>
        {access.canEditDraft ? (
          <div aria-live="polite" className="save-indicator" role="status">
            <span aria-hidden="true">
              {saveStatus === "saved" || saveStatus === "idle"
                ? "✓"
                : saveStatus === "conflict" || saveStatus === "failed"
                  ? "!"
                  : "●"}
            </span>
            {saveLabel}
          </div>
        ) : (
          <span className="status-badge">
            {t(readOnlyProjectTranslationKey(user?.role ?? null))}
          </span>
        )}
      </div>
      {catalogFailed ? (
        <StatusNotice tone="warning">
          <p>{t("catalogFailed")}</p>
          <button
            className="secondary-button"
            onClick={() => window.location.reload()}
            type="button"
          >
            {t("retry")}
          </button>
        </StatusNotice>
      ) : null}
      {catalogClearedFields.length ? (
        <StatusNotice tone="warning" live>
          {t("dependentCleared", { fields: catalogClearedFields.join(", ") })}
        </StatusNotice>
      ) : null}
      {catalogRebasePending ? (
        <StatusNotice tone="warning" live>
          {t("catalogRebasePending")}
        </StatusNotice>
      ) : null}
      {bufferedEditorDirty ? (
        <StatusNotice tone="warning" live>
          {t("finishBufferedEdit")}
        </StatusNotice>
      ) : null}
      {saveStatus === "failed" ? (
        <StatusNotice tone="error" live>
          <p>{t("saveFailed")}</p>
          {correlationId ? (
            <small>
              {t("supportCorrelation")}: <code>{correlationId}</code>
            </small>
          ) : null}
          <button className="secondary-button" onClick={() => void retryFailedSave()} type="button">
            {t("retry")}
          </button>
        </StatusNotice>
      ) : null}
      {saveStatus === "conflict" ? (
        <StatusNotice tone="error" live>
          <p>{t("saveConflict")}</p>
          <button
            className="secondary-button"
            onClick={() => window.location.reload()}
            type="button"
          >
            {t("reconcile")}
          </button>
        </StatusNotice>
      ) : null}
      {actionError ? (
        <StatusNotice tone="error" live>
          <p>{actionError}</p>
          {correlationId ? (
            <small>
              {t("supportCorrelation")}: <code>{correlationId}</code>
            </small>
          ) : null}
        </StatusNotice>
      ) : null}
      {validation ? (
        <StatusNotice
          tone={
            validation.blockingErrors.length
              ? "error"
              : validation.engineeringReview.length
                ? "review"
                : validation.warnings.length
                  ? "warning"
                  : "success"
          }
          live
        >
          <strong>{t("validationSummary")}</strong>
          {[...validation.blockingErrors, ...validation.warnings, ...validation.engineeringReview]
            .length ? (
            <ul>
              {[
                ...validation.blockingErrors,
                ...validation.warnings,
                ...validation.engineeringReview
              ].map((issue, index) => (
                <li key={`${issue.code}-${index}`}>
                  {index < validation.blockingErrors.length && issue.path.length ? (
                    <button
                      className="validation-issue-link"
                      onClick={() => focusValidationIssue(issue.path)}
                      type="button"
                    >
                      {issue.message}
                    </button>
                  ) : (
                    issue.message
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p>✓</p>
          )}
        </StatusNotice>
      ) : null}
      <div className="editor-layout">
        <nav aria-label={t("step")} className="editor-navigation">
          {editorSteps
            .filter((step) => step.id !== "revisions" || access.canReadHistory)
            .map((step, index) => (
              <button
                aria-current={activeStep === step.id ? "step" : undefined}
                key={step.id}
                onClick={() => changeStep(step.id)}
                type="button"
              >
                <span>{index + 1}</span>
                {t(step.label)}
              </button>
            ))}
        </nav>
        <div aria-busy={validationBusy || calculationBusy} className="editor-workspace">
          <span aria-live="polite" className="sr-only" role="status">
            {calculationBusy
              ? t("calculating")
              : validationBusy
                ? t("validating")
                : actionAnnouncement
                  ? t(actionAnnouncement)
                  : ""}
          </span>
          <label className="app-field mobile-step-select">
            {t("step")}
            <select
              value={activeStep}
              onChange={(event) => {
                if (isEditorStep(event.target.value)) changeStep(event.target.value);
              }}
            >
              {editorSteps
                .filter((step) => step.id !== "revisions" || access.canReadHistory)
                .map((step) => (
                  <option key={step.id} value={step.id}>
                    {t(step.label)}
                  </option>
                ))}
            </select>
          </label>
          {access.canValidate || access.canCalculate ? (
            <div className="editor-toolbar">
              <div className="editor-actions">
                {access.canValidate ? (
                  <button
                    className="secondary-button"
                    disabled={
                      validationBusy ||
                      calculationBusy ||
                      ["validationBlocked", "conflict", "failed"].includes(saveStatus) ||
                      bufferedEditorDirty
                    }
                    onClick={() => void runValidation()}
                    type="button"
                  >
                    {validationBusy ? t("validating") : t("validate")}
                  </button>
                ) : null}
                {access.canCalculate ? (
                  <button
                    className="primary-button"
                    disabled={
                      calculationBusy ||
                      validationBusy ||
                      ["validationBlocked", "conflict", "failed"].includes(saveStatus) ||
                      !localCanCalculate ||
                      bufferedEditorDirty
                    }
                    onClick={() => void runCalculation()}
                    type="button"
                  >
                    {calculationBusy ? t("calculating") : t("calculate")}
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
          {activeStep === "revisions" ? (
            <RevisionPanel
              access={access}
              acknowledgedDraftVersion={acknowledged.current.version}
              calculation={calculation}
              calculationStale={resultStale}
              onReturnToDraft={() => setActiveStep("results")}
              projectId={projectId}
            />
          ) : activeStep === "results" ? (
            <CalculationResults result={calculation?.result ?? null} stale={resultStale} />
          ) : access.canEditDraft ? (
            <EditorSections
              activeStep={activeStep}
              catalog={catalog}
              draft={draft}
              fieldErrors={fieldErrors}
              onBufferedChange={setBufferedEditorDirty}
              selectedRouteId={selectedRouteId}
              setDraft={(value) => {
                setValidation(null);
                setDraft(value);
              }}
              setSelectedRouteId={setSelectedRouteId}
            />
          ) : (
            <ReadOnlyEditorSections
              activeStep={activeStep}
              catalog={catalog}
              draft={draft}
              reason={t(readOnlyProjectTranslationKey(user?.role ?? null))}
              selectedRouteId={selectedRouteId}
              setSelectedRouteId={setSelectedRouteId}
            />
          )}
        </div>
      </div>
    </>
  );
}
