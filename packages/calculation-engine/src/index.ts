import rulesManifest from "@niedax/rules-manifest/manifest.json" with { type: "json" };
import calculationEnginePackage from "../package.json" with { type: "json" };

import type { CalculationEngine, CalculationInputV1, CalculationResultV1 } from "./contracts.js";

export const CALCULATION_ENGINE_VERSION = calculationEnginePackage.version;

export interface CalculationEngineReadiness {
  readonly ready: true;
  readonly engineVersion: string;
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
    engineVersion: CALCULATION_ENGINE_VERSION,
    rulesVersion: rulesManifest.version,
    rulesStatus: rulesManifest.status as "draft"
  });
}

/**
 * Stage 3 exposes the deterministic boundary without claiming that engineering formulas exist.
 * The invocation identity and fingerprint are supplied by the application boundary and echoed.
 */
export function calculate(input: CalculationInputV1): CalculationResultV1 {
  const warnings: CalculationResultV1["warnings"] = [
    {
      kind: "engineeringReview",
      code: "CALCULATION_FORMULAS_NOT_IMPLEMENTED",
      message: "Stage 3 validates the calculation contract; engineering formulas are deferred.",
      subjectRef: input.project.id
    }
  ];

  return {
    schemaVersion: "calculation-result/v1",
    engineVersion: CALCULATION_ENGINE_VERSION,
    calculationRunId: input.invocation.calculationRunId,
    inputFingerprint: input.invocation.inputFingerprint,
    calculationStatus: "contractOnly",
    catalogSnapshot: input.catalogSnapshot,
    ruleSnapshot: input.ruleSnapshot,
    bomLines: [],
    warnings,
    summary: {
      bomLineCount: 0,
      warningCount: warnings.length,
      engineeringReviewRequired: true,
      orderedTotalsByUnit: []
    }
  };
}

export const calculationEngine: CalculationEngine = Object.freeze({ calculate });

export type { CalculationEngine, CalculationInputV1, CalculationResultV1 } from "./contracts.js";
