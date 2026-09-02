"use client";

import { type FormEvent, useState } from "react";

import {
  capabilityTranslationKey,
  hasCapability,
  roleTranslationKey
} from "@/lib/access-presentation";
import { useI18n } from "@/lib/i18n";

import { AppHeader } from "./app-header";
import { CatalogAdminPanel } from "./catalog-admin";
import { useSession } from "./session-provider";
import { StatusNotice } from "./shared-ui";
import { UserAdminPanel } from "./user-admin";

interface Versions {
  readonly application: string;
  readonly catalogue: string;
  readonly rules: string;
}

export function FoundationDashboard({ versions }: Readonly<{ versions: Versions }>) {
  const { t } = useI18n();
  const { status, user, refresh, signIn } = useSession();
  const [busy, setBusy] = useState(false);
  const [loginFailed, setLoginFailed] = useState(false);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const username = form.get("username");
    const password = form.get("password");
    if (typeof username !== "string" || typeof password !== "string") return;
    setBusy(true);
    setLoginFailed(false);
    try {
      await signIn(username, password);
      formElement.reset();
    } catch {
      setLoginFailed(true);
    } finally {
      setBusy(false);
    }
  }

  const canAdministerUsers = user !== null && hasCapability(user.capabilities, "users:administer");
  const canAdministerCatalog =
    user !== null && hasCapability(user.capabilities, "catalog:administer");

  return (
    <div className="app-page">
      <AppHeader />
      <main className="app-main admin-workspace">
        <section aria-labelledby="account-title" className="editor-card account-card">
          <div className="page-heading">
            <div>
              <p className="eyebrow">NIEDAX · LOCAL</p>
              <h1 id="account-title">{t("account")}</h1>
            </div>
          </div>

          <div className="versions">
            <Version label={t("applicationVersion")} value={versions.application} />
            <Version label={t("catalogueVersion")} value={versions.catalogue} />
            <Version label={t("rulesVersion")} value={versions.rules} />
          </div>

          {status === "loading" ? <p role="status">{t("sessionLoading")}</p> : null}
          {status === "failed" ? (
            <StatusNotice tone="error">
              <p>{t("sessionLoadFailed")}</p>
              <button className="secondary-button" onClick={() => void refresh()} type="button">
                {t("retry")}
              </button>
            </StatusNotice>
          ) : null}
          {loginFailed ? (
            <StatusNotice tone="error" live>
              {t("loginFailed")}
            </StatusNotice>
          ) : null}

          {status === "anonymous" ? (
            <form className="app-form account-login" onSubmit={(event) => void login(event)}>
              <h2>{t("login")}</h2>
              <label>
                {t("username")}
                <input autoComplete="username" name="username" required />
              </label>
              <label>
                {t("password")}
                <input autoComplete="current-password" name="password" required type="password" />
              </label>
              <button className="primary-button" disabled={busy} type="submit">
                {busy ? t("sessionLoading") : t("login")}
              </button>
            </form>
          ) : null}

          {user ? (
            <div className="identity-card">
              <div>
                <small>{t("signedInAs")}</small>
                <strong>{user.displayName}</strong>
                <span>@{user.username}</span>
                <span>
                  {t("role")}: {t(roleTranslationKey(user.role))}
                </span>
              </div>
              <div>
                <h2>{t("effectivePermissions")}</h2>
                <ul className="capability-list">
                  {user.capabilities.map((capability) => (
                    <li key={capability}>{t(capabilityTranslationKey(capability))}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}
        </section>

        {user && canAdministerUsers ? <UserAdminPanel currentUser={user} /> : null}
        {canAdministerCatalog ? <CatalogAdminPanel /> : null}
      </main>
    </div>
  );
}

function Version({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div>
      <span>{label}</span>
      <strong>v{value}</strong>
    </div>
  );
}
