import rulesManifest from "@niedax/rules-manifest/manifest.json" with { type: "json" };

export interface CalculationEngineReadiness {
  readonly ready: true;
  readonly rulesVersion: string;
  readonly rulesStatus: "draft";
}

/**
 * The calculation package deliberately exposes readiness and version metadata only.
 * Engineering formulas belong to a later, separately reviewed stage.
 */
export function getCalculationEngineReadiness(): CalculationEngineReadiness {
  return Object.freeze({
    ready: true,
    rulesVersion: rulesManifest.version,
    rulesStatus: rulesManifest.status as "draft"
  });
}
