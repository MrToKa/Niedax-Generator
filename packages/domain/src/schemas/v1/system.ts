import { z } from "zod";

export const ApplicationEnvironmentSchema = z.enum(["development", "test", "production"]);
export type ApplicationEnvironment = z.infer<typeof ApplicationEnvironmentSchema>;

// Operational configuration only: flags never grant permissions or alter calculations.
export const FEATURE_REGISTRY = {
  operationalMetrics: {
    description: "Local operational metrics endpoint and administrator viewer",
    defaults: { development: true, test: true, production: false }
  }
} as const;
export type FeatureName = keyof typeof FEATURE_REGISTRY;
export const FeatureFlagsSchema = z.object({ operationalMetrics: z.boolean() }).strict();
export type FeatureFlags = z.infer<typeof FeatureFlagsSchema>;

export function resolveFeatureFlags(
  environment: ApplicationEnvironment,
  overrides: unknown = {}
): FeatureFlags {
  const parsed = FeatureFlagsSchema.partial().strict().parse(overrides);
  return {
    operationalMetrics:
      parsed.operationalMetrics ?? FEATURE_REGISTRY.operationalMetrics.defaults[environment]
  };
}

export function featureEnabled(flags: FeatureFlags, name: string): boolean {
  return Object.hasOwn(FEATURE_REGISTRY, name) && flags[name as FeatureName] === true;
}

export const BuildIdentitySchema = z.object({
  application: z.string().min(1).max(64),
  gitCommit: z
    .string()
    .regex(/^[a-f0-9]{40}$/u)
    .nullable(),
  buildTimestamp: z.iso.datetime().nullable(),
  environment: ApplicationEnvironmentSchema
});
export type BuildIdentity = z.infer<typeof BuildIdentitySchema>;

export const RuntimeIdentitySchema = z.object({
  build: BuildIdentitySchema,
  featureFlags: FeatureFlagsSchema
});
export type RuntimeIdentity = z.infer<typeof RuntimeIdentitySchema>;

const ActiveVersionSchema = z.object({
  id: z.uuid(),
  scope: z.string().min(1).max(64),
  version: z.string().min(1).max(64)
});
export const ActiveDatabaseVersionsSchema = z.object({
  catalogues: z.array(ActiveVersionSchema),
  ruleSets: z.array(ActiveVersionSchema.extend({ catalogVersionId: z.uuid() }))
});
export type ActiveDatabaseVersions = z.infer<typeof ActiveDatabaseVersionsSchema>;

export const SystemInfoSchema = RuntimeIdentitySchema.extend({
  schemaVersion: z.literal("system-info/v1"),
  repository: z.object({ catalogue: z.string(), rules: z.string() }),
  active: ActiveDatabaseVersionsSchema,
  // The application role intentionally cannot read the protected migration ledger.
  migrationState: z.literal("not-exposed")
});
export type SystemInfo = z.infer<typeof SystemInfoSchema>;

export const OperationalMetricsSchema = z.object({
  schemaVersion: z.literal("operational-metrics/v1"),
  uptimeSeconds: z.number().nonnegative(),
  requestCount: z.number().int().nonnegative(),
  serverErrorCount: z.number().int().nonnegative(),
  criticalApplicationErrorCount: z.number().int().nonnegative(),
  exportWorkerFailureCount: z.number().int().nonnegative(),
  databaseReadiness: z.enum(["unknown", "ready", "unavailable"]),
  build: BuildIdentitySchema
});
export type OperationalMetrics = z.infer<typeof OperationalMetricsSchema>;
