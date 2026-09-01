"use client";

import type { ProjectListItemV2 } from "@niedax/domain";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { isAuthenticationError } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n";
import { listProjects } from "@/lib/project-api";

import { AuthenticationRequired, LoadingPanel, StatusNotice } from "./shared-ui";

type LoadState = "loading" | "ready" | "authentication" | "failed";

export function ProjectList() {
  const { language, t } = useI18n();
  const [state, setState] = useState<LoadState>("loading");
  const [projects, setProjects] = useState<readonly ProjectListItemV2[]>([]);
  const load = useCallback(async (signal?: AbortSignal) => {
    setState("loading");
    try {
      const response = await listProjects(signal);
      setProjects(response.projects);
      setState("ready");
    } catch (error) {
      if (signal?.aborted) return;
      setState(isAuthenticationError(error) ? "authentication" : "failed");
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);
  if (state === "loading") return <LoadingPanel label={t("loadingProjects")} />;
  if (state === "authentication") return <AuthenticationRequired />;
  if (state === "failed") {
    return (
      <StatusNotice tone="error">
        <p>{t("projectsLoadFailed")}</p>
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
          <h1>{t("projects")}</h1>
          <p>{t("currentDraft")}</p>
        </div>
        <Link className="primary-button" href="/projects/new">
          + {t("createProject")}
        </Link>
      </div>
      {projects.length === 0 ? (
        <section className="empty-panel">
          <h1>{t("noProjects")}</h1>
          <p>{t("noProjectsHint")}</p>
          <Link className="primary-button" href="/projects/new">
            {t("createProject")}
          </Link>
        </section>
      ) : (
        <div className="project-grid">
          {projects.map((project) => (
            <article className="project-card" key={project.id}>
              <header>
                <div>
                  <small>{project.code}</small>
                  <h2>{project.name}</h2>
                </div>
                <span className="status-badge">{project.status}</span>
              </header>
              <p>{project.description ?? "—"}</p>
              <dl className="project-meta">
                <div>
                  <dt>{t("draftVersion")}</dt>
                  <dd>{project.draftVersion}</dd>
                </div>
                <div>
                  <dt>{t("defaultReserve")}</dt>
                  <dd>{project.defaultReservePercent}%</dd>
                </div>
                <div className="span-full">
                  <dt>{t("owner")}</dt>
                  <dd>{project.ownerDisplayName ?? "—"}</dd>
                </div>
                <div className="span-full">
                  <dt>{t("updated")}</dt>
                  <dd>
                    {new Intl.DateTimeFormat(language === "bg" ? "bg-BG" : "en-GB", {
                      dateStyle: "medium",
                      timeStyle: "short"
                    }).format(new Date(project.updatedAt))}
                  </dd>
                </div>
              </dl>
              {project.editorState === "editable" ? (
                <Link className="secondary-button" href={`/projects/${project.id}`}>
                  {t("openProject")} →
                </Link>
              ) : (
                <p className="read-only-explanation">{t("retainedReadOnly")}</p>
              )}
            </article>
          ))}
        </div>
      )}
    </>
  );
}
