"use client";

import type { CalculationApplicationBuildV2 } from "@niedax/domain";
import { type Language, translate } from "../lib/i18n";
import { StatusNotice } from "./shared-ui";

export function CalculationBuildProvenance({
  build,
  language
}: Readonly<{
  build: CalculationApplicationBuildV2 | undefined;
  language: Language;
}>) {
  if (!build)
    return <StatusNotice>{translate(language, "calculationBuildUnavailable")}</StatusNotice>;
  const unknown = translate(language, "unknown");
  return (
    <section className="editor-card">
      <h3>{translate(language, "calculationApplicationBuild")}</h3>
      <p>{translate(language, "calculationBuildCaptured")}</p>
      <dl className="revision-metadata">
        <div>
          <dt>{translate(language, "applicationVersion")}</dt>
          <dd>{build.application}</dd>
        </div>
        <div>
          <dt>Git SHA</dt>
          <dd>
            <code>{build.gitCommit ?? unknown}</code>
          </dd>
        </div>
        <div>
          <dt>{translate(language, "calculationBuildTimestamp")}</dt>
          <dd>{build.buildTimestamp ?? unknown}</dd>
        </div>
        <div>
          <dt>{translate(language, "calculationBuildEnvironment")}</dt>
          <dd>{build.environment}</dd>
        </div>
        {build.sourceFingerprint ? (
          <div>
            <dt>{translate(language, "calculationBuildSource")}</dt>
            <dd>
              <code>{build.sourceFingerprint}</code>
            </dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}
