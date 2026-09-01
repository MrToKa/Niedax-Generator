"use client";

import Link from "next/link";
import { type ReactNode, useId } from "react";

import { useI18n } from "@/lib/i18n";

export function AuthenticationRequired() {
  const { t } = useI18n();
  return (
    <section aria-labelledby="auth-required-title" className="empty-panel">
      <h1 id="auth-required-title">{t("signedOut")}</h1>
      <Link className="primary-button" href="/admin">
        {t("signIn")}
      </Link>
    </section>
  );
}

export function StatusNotice({
  children,
  tone = "info",
  live = false
}: Readonly<{
  children: ReactNode;
  tone?: "info" | "success" | "warning" | "error" | "review";
  live?: boolean;
}>) {
  return (
    <div
      aria-live={live ? (tone === "error" ? "assertive" : "polite") : undefined}
      className={`app-notice notice-${tone}`}
      role={tone === "error" ? "alert" : live ? "status" : undefined}
    >
      <span aria-hidden="true">
        {tone === "success"
          ? "✓"
          : tone === "error"
            ? "!"
            : tone === "warning"
              ? "△"
              : tone === "review"
                ? "◇"
                : "i"}
      </span>
      <div>{children}</div>
    </div>
  );
}

export function FormField({
  label,
  error,
  hint,
  required = false,
  className = "",
  children
}: Readonly<{
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
  required?: boolean;
  className?: string;
  children: (properties: {
    id: string;
    "aria-describedby": string | undefined;
    "aria-invalid": true | undefined;
  }) => ReactNode;
}>) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy =
    [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={`app-field ${error ? "has-error" : ""} ${className}`}>
      <label htmlFor={id}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      {children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })}
      {hint ? <small id={hintId}>{hint}</small> : null}
      {error ? (
        <small className="field-error" id={errorId}>
          {error}
        </small>
      ) : null}
    </div>
  );
}

export function LoadingPanel({ label }: Readonly<{ label: string }>) {
  return (
    <div aria-live="polite" className="loading-panel" role="status">
      <span aria-hidden="true" className="spinner" />
      {label}
    </div>
  );
}
