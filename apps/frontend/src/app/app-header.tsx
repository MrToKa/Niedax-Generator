"use client";

import Link from "next/link";
import { useState } from "react";

import { hasCapability, roleTranslationKey } from "@/lib/access-presentation";
import { useI18n } from "@/lib/i18n";

import { useSession } from "./session-provider";

export function AppHeader() {
  const { language, setLanguage, t } = useI18n();
  const { status, user, signOut } = useSession();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutFailed, setSignOutFailed] = useState(false);
  const canAdminister =
    user !== null &&
    (hasCapability(user.capabilities, "users:administer") ||
      hasCapability(user.capabilities, "catalog:administer"));
  return (
    <header className="app-header">
      <Link className="app-brand" href="/">
        <span aria-hidden="true">N</span>
        <strong>{t("appName")}</strong>
      </Link>
      <nav aria-label={t("projects")} className="app-navigation">
        <Link href="/">{t("projects")}</Link>
        {canAdminister || status !== "authenticated" ? (
          <Link href="/admin">{canAdminister ? t("administration") : t("account")}</Link>
        ) : null}
      </nav>
      {user ? (
        <div className="session-summary">
          <span>
            <strong>{user.displayName}</strong>
            <small>{t(roleTranslationKey(user.role))}</small>
          </span>
          <button
            className="secondary-button"
            disabled={signingOut}
            onClick={() => {
              setSigningOut(true);
              setSignOutFailed(false);
              void signOut()
                .catch(() => setSignOutFailed(true))
                .finally(() => setSigningOut(false));
            }}
            type="button"
          >
            {signingOut ? t("signingOut") : t("signOut")}
          </button>
        </div>
      ) : null}
      {signOutFailed ? (
        <span aria-live="assertive" className="session-error" role="alert">
          {t("signOutFailed")}
        </span>
      ) : null}
      <div aria-label={t("uiLanguage")} className="language-switch">
        <button
          aria-pressed={language === "bg"}
          className={language === "bg" ? "active" : ""}
          onClick={() => setLanguage("bg")}
          type="button"
        >
          BG
        </button>
        <button
          aria-pressed={language === "en"}
          className={language === "en" ? "active" : ""}
          onClick={() => setLanguage("en")}
          type="button"
        >
          EN
        </button>
      </div>
    </header>
  );
}
