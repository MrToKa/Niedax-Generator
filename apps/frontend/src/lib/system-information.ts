import {
  featureEnabled,
  type AppRole,
  type RuntimeIdentity,
  type SystemInfo
} from "@niedax/domain";

export function showTestBadge(identity: RuntimeIdentity | null): boolean {
  return identity?.build.environment === "test";
}

export function showOperationalMetrics(identity: RuntimeIdentity, role: AppRole | null): boolean {
  return role === "administrator" && featureEnabled(identity.featureFlags, "operationalMetrics");
}

export function formatSystemInformation(
  identity: RuntimeIdentity,
  system: SystemInfo | null
): string {
  return [
    `Environment: ${identity.build.environment}`,
    `Application version: ${identity.build.application}`,
    `Git commit: ${identity.build.gitCommit ?? "not supplied"}`,
    `Build timestamp: ${identity.build.buildTimestamp ?? "not supplied"}`,
    ...(system
      ? [
          `Repository catalogue manifest: ${system.repository.catalogue}`,
          `Repository rules manifest: ${system.repository.rules}`,
          `Active database catalogues: ${system.active.catalogues.map((version) => `${version.scope}: ${version.version}`).join(", ") || "none"}`,
          `Active database rule sets: ${system.active.ruleSets.map((version) => `${version.scope}: ${version.version}`).join(", ") || "none"}`,
          "Migration state: see deployment record (protected ledger)"
        ]
      : [])
  ].join("\n");
}
