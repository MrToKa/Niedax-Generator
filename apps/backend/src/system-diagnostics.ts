import {
  ActiveDatabaseVersionsSchema,
  ApplicationEnvironmentSchema,
  BuildIdentitySchema,
  resolveFeatureFlags,
  type ActiveDatabaseVersions,
  type BuildIdentity,
  type OperationalMetrics as OperationalMetricsSnapshot,
  type RuntimeIdentity
} from "@niedax/domain";
import type { Pool } from "pg";
import applicationPackage from "../../../package.json" with { type: "json" };

export function loadRuntimeIdentity(env: NodeJS.ProcessEnv = process.env): RuntimeIdentity {
  let overrides: unknown = {};
  try {
    const environment = ApplicationEnvironmentSchema.parse(env.NIEDAX_ENV ?? "development");
    if (env.NIEDAX_FEATURE_FLAGS?.trim()) overrides = JSON.parse(env.NIEDAX_FEATURE_FLAGS);
    return {
      build: BuildIdentitySchema.parse({
        application: applicationPackage.version,
        gitCommit: env.NIEDAX_GIT_COMMIT || null,
        buildTimestamp: env.NIEDAX_BUILD_TIMESTAMP || null,
        environment
      }),
      featureFlags: resolveFeatureFlags(environment, overrides)
    };
  } catch {
    // Invalid configuration values may be sensitive; never echo them into startup logs.
    throw new Error("Invalid build metadata or NIEDAX_FEATURE_FLAGS configuration");
  }
}

export interface SystemDiagnosticsStore {
  activeVersions(): Promise<ActiveDatabaseVersions>;
}

export class PgSystemDiagnosticsStore implements SystemDiagnosticsStore {
  public constructor(private readonly pool: Pool) {}

  public async activeVersions(): Promise<ActiveDatabaseVersions> {
    // One statement gives a consistent snapshot even during catalog activation.
    const result = await this.pool.query<{ active: unknown }>(`
      SELECT json_build_object(
        'catalogues', coalesce((SELECT json_agg(c ORDER BY c.scope, c.id)
          FROM (SELECT id, scope, version FROM catalog_versions WHERE status = 'active') c), '[]'),
        'ruleSets', coalesce((SELECT json_agg(r ORDER BY r.scope, r.id)
          FROM (SELECT id, scope, version, catalog_version_id AS "catalogVersionId"
                FROM rule_sets WHERE status = 'active') r), '[]')
      ) AS active
    `);
    return ActiveDatabaseVersionsSchema.parse(result.rows[0]?.active);
  }
}

export class OperationalMetrics {
  private requestCount = 0;
  private serverErrorCount = 0;
  private criticalApplicationErrorCount = 0;
  private exportWorkerFailureCount = 0;
  private databaseReadiness: OperationalMetricsSnapshot["databaseReadiness"] = "unknown";

  public requestFinished(statusCode: number): void {
    this.requestCount = increment(this.requestCount);
    if (statusCode >= 500) this.serverErrorCount = increment(this.serverErrorCount);
  }

  public criticalError(): void {
    this.criticalApplicationErrorCount = increment(this.criticalApplicationErrorCount);
  }

  public exportWorkerFailure(): void {
    this.exportWorkerFailureCount = increment(this.exportWorkerFailureCount);
    this.criticalError();
  }

  public databaseReady(ready: boolean): void {
    this.databaseReadiness = ready ? "ready" : "unavailable";
  }

  public snapshot(build: BuildIdentity): OperationalMetricsSnapshot {
    return {
      schemaVersion: "operational-metrics/v1",
      uptimeSeconds: process.uptime(),
      requestCount: this.requestCount,
      serverErrorCount: this.serverErrorCount,
      criticalApplicationErrorCount: this.criticalApplicationErrorCount,
      exportWorkerFailureCount: this.exportWorkerFailureCount,
      databaseReadiness: this.databaseReadiness,
      build
    };
  }
}

function increment(value: number): number {
  return Math.min(Number.MAX_SAFE_INTEGER, value + 1);
}
