"use client";

import Link from "next/link";

import { useI18n } from "@/lib/i18n";

export function AppHeader() {
  const { language, setLanguage, t } = useI18n();
  return (
    <header className="app-header">
      <Link className="app-brand" href="/">
        <span aria-hidden="true">N</span>
        <strong>{t("appName")}</strong>
      </Link>
      <nav aria-label={t("projects")} className="app-navigation">
        <Link href="/">{t("projects")}</Link>
        <Link href="/admin">{t("administration")}</Link>
      </nav>
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
