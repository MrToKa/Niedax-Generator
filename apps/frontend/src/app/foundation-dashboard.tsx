"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { CatalogAdminPanel } from "./catalog-admin";

type Language = "bg" | "en";
type Role = "administrator" | "reviewer";
type DashboardError = "failed" | "networkFailed" | "sessionFailed" | "logoutFailed";

interface User {
  id: string;
  username: string;
  displayName: string;
  role: Role;
}

interface Versions {
  application: string;
  catalogue: string;
  rules: string;
}

const copy = {
  en: {
    ready: "Foundation ready",
    subtitle: "Local, modular, same-origin Docker foundation",
    login: "Sign in",
    logout: "Sign out",
    username: "Username",
    password: "Password",
    signedIn: "Signed in",
    role: "Role",
    application: "Application",
    catalogue: "Catalogue",
    rules: "Calculation rules",
    failed: "Sign-in failed. Check the credentials and try again.",
    networkFailed: "The local API could not be reached. Try again.",
    sessionLoading: "Checking the current session…",
    sessionFailed: "The current session could not be checked. Try reloading the page.",
    logoutFailed: "Sign-out failed. Your session may still be active."
  },
  bg: {
    ready: "Основата е готова",
    subtitle: "Локална модулна Docker основа с един общ адрес",
    login: "Вход",
    logout: "Изход",
    username: "Потребител",
    password: "Парола",
    signedIn: "Влязъл потребител",
    role: "Роля",
    application: "Приложение",
    catalogue: "Каталог",
    rules: "Изчислителни правила",
    failed: "Неуспешен вход. Проверете данните и опитайте отново.",
    networkFailed: "Локалното API не е достъпно. Опитайте отново.",
    sessionLoading: "Проверка на текущата сесия…",
    sessionFailed: "Текущата сесия не може да бъде проверена. Презаредете страницата.",
    logoutFailed: "Неуспешен изход. Сесията ви може все още да е активна."
  }
} as const;

export function FoundationDashboard({ versions }: Readonly<{ versions: Versions }>) {
  const [language, setLanguage] = useState<Language>("bg");
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<DashboardError | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const labels = copy[language];

  const refreshSession = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch("/api/v1/auth/me", { cache: "no-store" });
      if (response.ok) {
        const body = (await response.json()) as { user: User };
        setUser(body.user);
      } else if (response.status === 401 || response.status === 403) {
        setUser(null);
      } else {
        throw new Error(`Session request failed (${response.status})`);
      }
    } catch {
      setUser(null);
      setError("sessionFailed");
    } finally {
      setSessionLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setError(null);
    setBusy(true);
    const form = new FormData(formElement);
    try {
      const response = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", "x-niedax-csrf": "1" },
        body: JSON.stringify({
          username: form.get("username"),
          password: form.get("password")
        })
      });
      if (response.status === 401 || response.status === 403) {
        setError("failed");
        return;
      }
      if (!response.ok) {
        setError("networkFailed");
        return;
      }
      const body = (await response.json()) as { user: User };
      setUser(body.user);
      formElement.reset();
    } catch {
      setError("networkFailed");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setError(null);
    setBusy(true);
    try {
      const response = await fetch("/api/v1/auth/logout", {
        method: "POST",
        headers: { "x-niedax-csrf": "1" }
      });
      if (!response.ok) {
        throw new Error(`Sign-out request failed (${response.status})`);
      }
      setUser(null);
    } catch {
      setError("logoutFailed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="admin-page">
      <nav className="admin-navigation" aria-label="Application navigation">
        <a href="/">← Project configurator</a>
      </nav>
      <section className="shell" aria-labelledby="title">
        <header>
          <div>
            <p className="eyebrow">NIEDAX · LOCAL</p>
            <h1 id="title">Niedax Generator</h1>
            <p className="subtitle">{labels.subtitle}</p>
          </div>
          <div className="language" aria-label="Language">
            <button
              type="button"
              className={language === "bg" ? "active" : ""}
              aria-pressed={language === "bg"}
              onClick={() => setLanguage("bg")}
            >
              BG
            </button>
            <button
              type="button"
              className={language === "en" ? "active" : ""}
              aria-pressed={language === "en"}
              onClick={() => setLanguage("en")}
            >
              EN
            </button>
          </div>
        </header>

        <div className="status">
          <span aria-hidden="true" />
          {labels.ready}
        </div>

        <div className="versions">
          <Version label={labels.application} value={versions.application} />
          <Version label={labels.catalogue} value={versions.catalogue} />
          <Version label={labels.rules} value={versions.rules} />
        </div>

        <div className="account" aria-busy={sessionLoading || busy}>
          {error ? (
            <p className="error" role="alert">
              {labels[error]}
            </p>
          ) : null}
          {sessionLoading ? (
            <p role="status">{labels.sessionLoading}</p>
          ) : user ? (
            <div className="signed-in">
              <div>
                <small>{labels.signedIn}</small>
                <strong>{user.displayName}</strong>
                <span>
                  @{user.username} · {labels.role}: {user.role}
                </span>
              </div>
              <button
                className="primary"
                disabled={busy}
                onClick={() => void logout()}
                type="button"
              >
                {labels.logout}
              </button>
            </div>
          ) : (
            <form onSubmit={(event) => void login(event)}>
              <h2>{labels.login}</h2>
              <label>
                {labels.username}
                <input name="username" autoComplete="username" required />
              </label>
              <label>
                {labels.password}
                <input name="password" type="password" autoComplete="current-password" required />
              </label>
              <button className="primary" type="submit" disabled={busy}>
                {labels.login}
              </button>
            </form>
          )}
        </div>
      </section>
      {user?.role === "administrator" ? <CatalogAdminPanel /> : null}
    </main>
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
