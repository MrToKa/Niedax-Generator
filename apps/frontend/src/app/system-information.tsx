"use client";

import { useEffect, useState } from "react";
import {
  OperationalMetricsSchema,
  RuntimeIdentitySchema,
  SystemInfoSchema,
  type OperationalMetrics,
  type RuntimeIdentity,
  type SystemInfo
} from "@niedax/domain";
import { ApiError, requestJson } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n";
import { useSession } from "./session-provider";
import { SystemInformationView } from "./system-information-view";

export function SystemInformation() {
  const { language } = useI18n();
  const { user } = useSession();
  const [identity, setIdentity] = useState<RuntimeIdentity | null>(null);
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [metrics, setMetrics] = useState<OperationalMetrics | null>(null);
  const [failure, setFailure] = useState<{ reference: string | null } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void requestJson("/api/v1/version", RuntimeIdentitySchema, { signal: controller.signal })
      .then(setIdentity)
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    if (user) {
      void requestJson("/api/v1/system/info", SystemInfoSchema, { signal: controller.signal })
        .then((value) => {
          setSystem(value);
          setIdentity(value);
          setFailure(null);
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted)
            setFailure({ reference: error instanceof ApiError ? error.correlationId : null });
        });
    }
    return () => controller.abort();
  }, [user]);

  if (!identity) return null;
  return (
    <SystemInformationView
      identity={identity}
      system={user ? system : null}
      role={user?.role ?? null}
      language={language}
      errorReference={failure?.reference ?? null}
      error={failure !== null}
      metrics={metrics}
      onLoadMetrics={() => {
        void requestJson("/api/v1/system/metrics", OperationalMetricsSchema)
          .then((value) => {
            setMetrics(value);
            setFailure(null);
          })
          .catch((error: unknown) =>
            setFailure({ reference: error instanceof ApiError ? error.correlationId : null })
          );
      }}
    />
  );
}
