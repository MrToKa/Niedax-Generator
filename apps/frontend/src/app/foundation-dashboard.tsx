"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { CatalogAdminPanel } from "./catalog-admin";

type Language = "bg" | "en";
type Role = "administrator" | "reviewer";

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
    failed: "Sign-in failed. Check the credentials and try again."
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
    failed: "Неуспешен вход. Проверете данните и опитайте отново."
  }
} as const;

export function FoundationDashboard({ versions }: Readonly<{ versions: Versions }>) {
  const [language, setLanguage] = useState<Language>("en");
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const labels = copy[language];

  const refreshSession = useCallback(async () => {
    const response = await fetch("/api/v1/auth/me", { cache: "no-store" });
    if (response.ok) {
      const body = (await response.json()) as { user: User };
      setUser(body.user);
    } else {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", "x-niedax-csrf": "1" },
      body: JSON.stringify({
        username: form.get("username"),
        password: form.get("password")
      })
    });
    if (!response.ok) {
      setError(labels.failed);
      return;
    }
    const body = (await response.json()) as { user: User };
    setUser(body.user);
    event.currentTarget.reset();
  }

  async function logout() {
    await fetch("/api/v1/auth/logout", {
      method: "POST",
      headers: { "x-niedax-csrf": "1" }
    });
    setUser(null);
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
            <button className={language === "bg" ? "active" : ""} onClick={() => setLanguage("bg")}>
              BG
            </button>
            <button className={language === "en" ? "active" : ""} onClick={() => setLanguage("en")}>
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

        <div className="account">
          {user ? (
            <div className="signed-in">
              <div>
                <small>{labels.signedIn}</small>
                <strong>{user.displayName}</strong>
                <span>
                  @{user.username} · {labels.role}: {user.role}
                </span>
              </div>
              <button className="primary" onClick={() => void logout()}>
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
              {error ? (
                <p className="error" role="alert">
                  {error}
                </p>
              ) : null}
              <button className="primary" type="submit">
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
