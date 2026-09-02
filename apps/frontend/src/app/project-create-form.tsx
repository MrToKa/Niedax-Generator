"use client";

import { ProjectLocaleV2Schema } from "@niedax/domain";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { ApiError, isAuthenticationError, newRequestKey } from "@/lib/api-client";
import { hasCapability } from "@/lib/access-presentation";
import { createEmptyProjectDraft, validateDraftLocally } from "@/lib/editor-state";
import { useI18n } from "@/lib/i18n";
import { createProject } from "@/lib/project-api";

import { AuthenticationRequired, FormField, StatusNotice } from "./shared-ui";
import { useSession } from "./session-provider";

export function ProjectCreateForm() {
  const router = useRouter();
  const { t } = useI18n();
  const { markAnonymous, status: sessionStatus, user } = useSession();
  const [draft, setDraft] = useState(() => createEmptyProjectDraft());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<"failed" | "authentication" | "forbidden" | null>(null);
  const requestKey = useRef<string | null>(null);
  const requestController = useRef<AbortController | null>(null);
  const validation = useMemo(() => validateDraftLocally(draft), [draft]);
  const reserve = Number(draft.defaultReservePercent);
  const reserveError =
    !Number.isFinite(reserve) || reserve < 0 || reserve > 100 ? t("invalidPercent") : undefined;
  function change(patch: Partial<typeof draft>) {
    requestKey.current = null;
    setError(null);
    setDraft((current) => ({ ...current, ...patch }));
  }
  useEffect(
    () => () => {
      requestController.current?.abort();
      requestController.current = null;
    },
    [user]
  );
  useEffect(() => {
    if (sessionStatus === "authenticated" && user) return;
    requestController.current?.abort();
    requestController.current = null;
    requestKey.current = null;
    setDraft(createEmptyProjectDraft());
    setBusy(false);
    setError(null);
  }, [sessionStatus, user]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!validation.validForSave || !user) return;
    setBusy(true);
    setError(null);
    requestKey.current ??= newRequestKey();
    const controller = new AbortController();
    requestController.current?.abort();
    requestController.current = controller;
    try {
      const response = await createProject(draft, requestKey.current, controller.signal);
      if (controller.signal.aborted) return;
      router.replace(`/projects/${response.project.id}`);
    } catch (caught) {
      if (controller.signal.aborted) return;
      const authenticationFailure = isAuthenticationError(caught);
      if (authenticationFailure && !markAnonymous(user)) return;
      setError(
        authenticationFailure
          ? "authentication"
          : caught instanceof ApiError && caught.status === 403
            ? "forbidden"
            : "failed"
      );
    } finally {
      if (requestController.current === controller) {
        requestController.current = null;
        setBusy(false);
      }
    }
  }
  if (sessionStatus === "loading") return <p role="status">{t("sessionLoading")}</p>;
  if (sessionStatus === "failed")
    return <StatusNotice tone="error">{t("sessionLoadFailed")}</StatusNotice>;
  if (error === "authentication" || sessionStatus === "anonymous" || !user)
    return <AuthenticationRequired />;
  if (
    error === "forbidden" ||
    (user !== null && !hasCapability(user.capabilities, "project:create"))
  )
    return <StatusNotice tone="error">{t("forbiddenAction")}</StatusNotice>;
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>{t("createProject")}</h1>
          <p>{t("currentDraft")}</p>
        </div>
      </div>
      {error === "failed" ? (
        <StatusNotice tone="error" live>
          {t("createFailed")}
        </StatusNotice>
      ) : null}
      <form className="app-form editor-card" noValidate onSubmit={(event) => void submit(event)}>
        <div className="form-grid">
          <FormField
            error={draft.code.trim() ? undefined : t("required")}
            label={t("projectCode")}
            required
          >
            {(props) => (
              <input
                {...props}
                autoFocus
                maxLength={100}
                value={draft.code}
                onChange={(event) => change({ code: event.target.value })}
              />
            )}
          </FormField>
          <FormField
            error={draft.name.trim() ? undefined : t("required")}
            label={t("projectName")}
            required
          >
            {(props) => (
              <input
                {...props}
                maxLength={500}
                value={draft.name}
                onChange={(event) => change({ name: event.target.value })}
              />
            )}
          </FormField>
          <FormField className="span-full" label={t("description")}>
            {(props) => (
              <textarea
                {...props}
                value={draft.description ?? ""}
                onChange={(event) => change({ description: event.target.value || null })}
              />
            )}
          </FormField>
          <FormField error={reserveError} label={`${t("defaultReserve")} (%)`} required>
            {(props) => (
              <input
                {...props}
                inputMode="decimal"
                value={draft.defaultReservePercent}
                onChange={(event) => change({ defaultReservePercent: event.target.value })}
              />
            )}
          </FormField>
          <FormField label={t("uiLanguage")} required>
            {(props) => (
              <select
                {...props}
                value={draft.defaultLocale}
                onChange={(event) =>
                  change({ defaultLocale: ProjectLocaleV2Schema.parse(event.target.value) })
                }
              >
                <option value="bg">Български</option>
                <option value="en">English</option>
              </select>
            )}
          </FormField>
        </div>
        <div className="editor-actions">
          <Link className="secondary-button" href="/">
            {t("cancel")}
          </Link>
          <button
            className="primary-button"
            disabled={busy || !validation.validForSave}
            type="submit"
          >
            {busy ? t("creating") : t("createProject")}
          </button>
        </div>
        <span aria-live="polite" className="sr-only" role="status">
          {busy ? t("creating") : ""}
        </span>
      </form>
    </>
  );
}
