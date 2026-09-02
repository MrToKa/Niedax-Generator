"use client";

import type { ProjectListItemV2 } from "@niedax/domain";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { isAuthenticationError } from "@/lib/api-client";
import { hasCapability } from "@/lib/access-presentation";
import { useI18n } from "@/lib/i18n";
import { listProjects } from "@/lib/project-api";
import { appendProjectPage } from "@/lib/project-pagination";
import { sessionRequestIsCurrent } from "@/lib/session-state";

import { AuthenticationRequired, LoadingPanel, StatusNotice } from "./shared-ui";
import { useSession } from "./session-provider";

type LoadState = "loading" | "ready" | "authentication" | "failed";

export function ProjectList() {
  const { language, t } = useI18n();
  const { markAnonymous, status: sessionStatus, user } = useSession();
  const [state, setState] = useState<LoadState>("loading");
  const [projects, setProjects] = useState<readonly ProjectListItemV2[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreFailed, setLoadMoreFailed] = useState(false);
  const [loadedMoreCount, setLoadedMoreCount] = useState<number | null>(null);
  const requestController = useRef<AbortController | null>(null);
  const requestGeneration = useRef(0);

  const cancelRequest = useCallback(() => {
    requestGeneration.current += 1;
    requestController.current?.abort();
    requestController.current = null;
  }, []);

  const load = useCallback(async () => {
    cancelRequest();
    const controller = new AbortController();
    requestController.current = controller;
    const generation = ++requestGeneration.current;
    setState("loading");
    setNextCursor(null);
    setLoadingMore(false);
    setLoadMoreFailed(false);
    setLoadedMoreCount(null);
    try {
      const response = await listProjects(null, controller.signal);
      if (
        controller.signal.aborted ||
        !sessionRequestIsCurrent(generation, requestGeneration.current)
      )
        return;
      setProjects(response.projects);
      setNextCursor(response.nextCursor);
      setState("ready");
    } catch (error) {
      if (
        controller.signal.aborted ||
        !sessionRequestIsCurrent(generation, requestGeneration.current)
      )
        return;
      if (isAuthenticationError(error)) {
        if (markAnonymous(user)) setState("authentication");
      } else setState("failed");
    } finally {
      if (requestController.current === controller) requestController.current = null;
    }
  }, [cancelRequest, markAnonymous, user]);

  useEffect(() => {
    if (sessionStatus !== "authenticated" || !user) {
      cancelRequest();
      setProjects([]);
      setNextCursor(null);
      setLoadingMore(false);
      setLoadMoreFailed(false);
      setLoadedMoreCount(null);
      setState(sessionStatus === "anonymous" ? "authentication" : "loading");
      return;
    }
    void load();
    return cancelRequest;
  }, [cancelRequest, load, sessionStatus, user]);

  async function loadMore() {
    if (!nextCursor || loadingMore || sessionStatus !== "authenticated" || !user) return;
    cancelRequest();
    const controller = new AbortController();
    requestController.current = controller;
    const generation = ++requestGeneration.current;
    const requestedCursor = nextCursor;
    setLoadingMore(true);
    setLoadMoreFailed(false);
    setLoadedMoreCount(null);
    try {
      const response = await listProjects(requestedCursor, controller.signal);
      if (
        controller.signal.aborted ||
        !sessionRequestIsCurrent(generation, requestGeneration.current)
      )
        return;
      const mergedProjects = appendProjectPage(projects, response.projects);
      setProjects(mergedProjects);
      setNextCursor(response.nextCursor);
      setLoadedMoreCount(mergedProjects.length - projects.length);
    } catch (error) {
      if (
        controller.signal.aborted ||
        !sessionRequestIsCurrent(generation, requestGeneration.current)
      )
        return;
      if (isAuthenticationError(error)) {
        if (markAnonymous(user)) setState("authentication");
      } else setLoadMoreFailed(true);
    } finally {
      if (requestController.current === controller) {
        requestController.current = null;
        setLoadingMore(false);
      }
    }
  }

  if (sessionStatus === "loading") return <LoadingPanel label={t("sessionLoading")} />;
  if (sessionStatus === "failed")
    return <StatusNotice tone="error">{t("sessionLoadFailed")}</StatusNotice>;
  if (sessionStatus === "anonymous" || !user) return <AuthenticationRequired />;
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
  const canCreate = user !== null && hasCapability(user.capabilities, "project:create");
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>{t("projects")}</h1>
          <p>{t("currentDraft")}</p>
        </div>
        {canCreate ? (
          <Link className="primary-button" href="/projects/new">
            + {t("createProject")}
          </Link>
        ) : null}
      </div>
      {projects.length === 0 ? (
        <section className="empty-panel">
          <h1>{t("noProjects")}</h1>
          <p>{t("noProjectsHint")}</p>
          {canCreate ? (
            <Link className="primary-button" href="/projects/new">
              {t("createProject")}
            </Link>
          ) : (
            <p className="read-only-explanation">{t("readOnlySession")}</p>
          )}
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
                <>
                  <p className="read-only-explanation">{t("retainedReadOnly")}</p>
                  <Link className="secondary-button" href={`/projects/${project.id}?view=history`}>
                    {t("revisionHistory")} →
                  </Link>
                </>
              )}
            </article>
          ))}
        </div>
      )}
      <span aria-live="polite" className="sr-only" role="status">
        {loadingMore
          ? t("loadingProjects")
          : loadedMoreCount !== null
            ? t("projectsLoadedMore", { count: loadedMoreCount })
            : ""}
      </span>
      {loadMoreFailed ? (
        <StatusNotice tone="error" live>
          {t("moreProjectsLoadFailed")}
        </StatusNotice>
      ) : null}
      {nextCursor || loadedMoreCount !== null ? (
        <button
          className="secondary-button history-load-more"
          disabled={loadingMore || !nextCursor}
          onClick={() => void loadMore()}
          type="button"
        >
          {loadingMore ? t("loadingProjects") : nextCursor ? t("loadMore") : t("allProjectsLoaded")}
        </button>
      ) : null}
    </>
  );
}
