"use client";

import type { ProductSnapshotV2 } from "@niedax/domain";
import { type Language, translate } from "../lib/i18n";
import { StatusNotice } from "./shared-ui";

export function AnchorSourceFacts({
  code,
  facts,
  language
}: Readonly<{
  code: string;
  facts: ProductSnapshotV2["sourceFacts"];
  language: Language;
}>) {
  if (!facts) return null;
  const substrateKey = (["concrete", "steel", "masonry"] as const).find(
    (key) => key === facts.catalogSubstrate
  );
  return (
    <div className="span-full">
      <StatusNotice tone="review">
        <strong>
          {translate(language, "anchorCatalogFacts")} · {code}
        </strong>
        {facts.indoorOnly ? <p>{translate(language, "anchorIndoorOnly")}</p> : null}
        <dl className="provenance-list">
          {facts.catalogSubstrate ? (
            <div>
              <dt>{translate(language, "anchorCatalogSubstrate")}</dt>
              <dd>{substrateKey ? translate(language, substrateKey) : facts.catalogSubstrate}</dd>
            </div>
          ) : null}
          {facts.approvalNumber ? (
            <div>
              <dt>{translate(language, "anchorApprovalNumber")}</dt>
              <dd>{facts.approvalNumber}</dd>
            </div>
          ) : null}
          {facts.dopNumber ? (
            <div>
              <dt>DoP</dt>
              <dd>{facts.dopNumber}</dd>
            </div>
          ) : null}
          <div>
            <dt>{translate(language, "source")}</dt>
            <dd>
              {facts.source.sourceDocument} · {facts.source.sourcePage}
            </dd>
          </div>
        </dl>
        {facts.engineeringNote ? <p>{facts.engineeringNote}</p> : null}
        <p>{translate(language, "anchorSuitabilityUnverified")}</p>
      </StatusNotice>
    </div>
  );
}
