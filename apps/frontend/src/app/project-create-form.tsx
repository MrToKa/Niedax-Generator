"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useMemo, useRef, useState } from "react";

import { isAuthenticationError, newRequestKey } from "@/lib/api-client";
import { createEmptyProjectDraft, validateDraftLocally } from "@/lib/editor-state";
import { useI18n } from "@/lib/i18n";
import { createProject } from "@/lib/project-api";

import { AuthenticationRequired, FormField, StatusNotice } from "./shared-ui";

export function ProjectCreateForm() {
  const router = useRouter();
  const { t } = useI18n();
  const [draft, setDraft] = useState(() => createEmptyProjectDraft());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<"failed" | "authentication" | null>(null);
  const requestKey = useRef<string | null>(null);
  const validation = useMemo(() => validateDraftLocally(draft), [draft]);
  const reserve = Number(draft.defaultReservePercent);
  const reserveError =
    !Number.isFinite(reserve) || reserve < 0 || reserve > 100 ? t("invalidPercent") : undefined;
  function change(patch: Partial<typeof draft>) {
    requestKey.current = null;
    setError(null);
    setDraft((current) => ({ ...current, ...patch }));
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!validation.validForSave) return;
    setBusy(true);
    setError(null);
    requestKey.current ??= newRequestKey();
    try {
      const response = await createProject(draft, requestKey.current);
      router.replace(`/projects/${response.project.id}`);
    } catch (caught) {
      setError(isAuthenticationError(caught) ? "authentication" : "failed");
    } finally {
      setBusy(false);
    }
  }
  if (error === "authentication") return <AuthenticationRequired />;
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
                onChange={(event) => change({ defaultLocale: event.target.value as "bg" | "en" })}
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
