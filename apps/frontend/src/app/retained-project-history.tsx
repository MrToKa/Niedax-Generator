"use client";

import type { ProjectAccessV2 } from "@niedax/domain";
import { useEffect, useState } from "react";

import { isAuthenticationError } from "@/lib/api-client";
import { getProjectAccess } from "@/lib/auth-api";
import { useI18n } from "@/lib/i18n";

import { RevisionPanel } from "./revision-panel";
import { useSession } from "./session-provider";
import { AuthenticationRequired, LoadingPanel, StatusNotice } from "./shared-ui";

export function RetainedProjectHistory({ projectId }: Readonly<{ projectId: string }>) {
  const { t } = useI18n();
  const { markAnonymous, status: sessionStatus, user } = useSession();
  const [access, setAccess] = useState<ProjectAccessV2 | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "authentication" | "failed">("loading");

  useEffect(() => {
    if (sessionStatus !== "authenticated" || !user) {
      setAccess(null);
      setState(sessionStatus === "anonymous" ? "authentication" : "loading");
      return;
    }
    const controller = new AbortController();
    void getProjectAccess(projectId, controller.signal)
      .then((response) => {
        if (controller.signal.aborted) return;
        setAccess(response.access);
        setState("ready");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (isAuthenticationError(error)) {
          if (markAnonymous(user)) setState("authentication");
        } else setState("failed");
      });
    return () => controller.abort();
  }, [markAnonymous, projectId, sessionStatus, user]);

  if (sessionStatus === "loading") return <LoadingPanel label={t("sessionLoading")} />;
  if (sessionStatus === "failed")
    return <StatusNotice tone="error">{t("sessionLoadFailed")}</StatusNotice>;
  if (sessionStatus === "anonymous" || !user) return <AuthenticationRequired />;
  if (state === "loading") return <LoadingPanel label={t("loadingRevisions")} />;
  if (state === "authentication") return <AuthenticationRequired />;
  if (state === "failed" || !access?.canReadHistory)
    return <StatusNotice tone="error">{t("projectLoadFailed")}</StatusNotice>;

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">{t("retainedRevision")}</p>
          <h1>{t("revisionHistory")}</h1>
          <p>{t("retainedHistoryHint")}</p>
        </div>
      </div>
      <RevisionPanel
        access={access}
        acknowledgedDraftVersion={0}
        calculation={null}
        calculationStale
        historyOnly
        projectId={projectId}
      />
    </>
  );
}
