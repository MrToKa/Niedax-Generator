import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  resolveFeatureFlags,
  type ApplicationEnvironment,
  type RuntimeIdentity,
  type SystemInfo
} from "@niedax/domain";
import { SystemInformationView } from "../app/system-information-view";
import {
  formatSystemInformation,
  showOperationalMetrics,
  showTestBadge
} from "./system-information";

function identity(environment: ApplicationEnvironment): RuntimeIdentity {
  return {
    build: {
      application: "0.1.0",
      gitCommit: "a".repeat(40),
      buildTimestamp: "2026-09-24T12:00:00.000Z",
      environment
    },
    featureFlags: resolveFeatureFlags(environment)
  };
}
function render(runtime: RuntimeIdentity, role: "administrator" | "viewer" | null) {
  return renderToStaticMarkup(
    createElement(SystemInformationView, {
      identity: runtime,
      role,
      language: "en",
      system: null,
      metrics: null,
      error: false,
      errorReference: null,
      onLoadMetrics: () => undefined
    })
  );
}
describe("Stage 11 system information presentation", () => {
  it.each(["development", "test", "production"] as const)(
    "shows TEST only for TEST (%s)",
    (environment) => {
      expect(showTestBadge(identity(environment))).toBe(environment === "test");
      expect(render(identity(environment), null).includes('aria-label="TEST environment"')).toBe(
        environment === "test"
      );
    }
  );
  it("hides disabled UI functionality and requires the administrator role", () => {
    const enabled = identity("test");
    const disabled = { ...enabled, featureFlags: { operationalMetrics: false } };
    expect(showOperationalMetrics(disabled, "administrator")).toBe(false);
    expect(render(disabled, "administrator")).not.toContain("Refresh operational metrics");
    expect(render(enabled, "viewer")).not.toContain("Refresh operational metrics");
    expect(render(enabled, "administrator")).toContain("Refresh operational metrics");
  });
  it("copies separately labelled manifest and actual database versions", () => {
    const runtime = identity("test");
    const info: SystemInfo = {
      ...runtime,
      schemaVersion: "system-info/v1",
      repository: { catalogue: "manifest-catalog", rules: "manifest-rules" },
      active: {
        catalogues: [
          {
            id: "11000000-0000-4000-8000-000000000011",
            scope: "synthetic",
            version: "active-catalog"
          }
        ],
        ruleSets: []
      },
      migrationState: "not-exposed"
    };
    expect(formatSystemInformation(runtime, info)).toContain(
      "Repository catalogue manifest: manifest-catalog"
    );
    expect(formatSystemInformation(runtime, info)).toContain(
      "Active database catalogues: synthetic: active-catalog"
    );
    expect(formatSystemInformation(runtime, info)).toContain("Active database rule sets: none");
  });
});
