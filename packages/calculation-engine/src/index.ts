import rulesManifest from "@niedax/rules-manifest/manifest.json" with { type: "json" };
import calculationEnginePackage from "../package.json" with { type: "json" };

import type {
  CalculationEngine,
  CalculationEngineV2,
  CalculationInputV1,
  CalculationInputV2,
  CalculationResultV1,
  CalculationResultV2
} from "./contracts.js";
import { calculateV2 as runCalculationV2 } from "./calculate.js";

export { ExactDecimal } from "./arithmetic/decimal.js";
export {
  massFromLinearRate,
  metresFromMillimetres,
  millimetresFromMetres
} from "./arithmetic/quantity.js";
export { CalculationEngineError } from "./errors.js";
export { canonicalJson } from "./stable/canonical-json.js";
export { FORMULA_CATALOG_VERSION, FORMULAS } from "./trace/formula-catalog.js";

export const CALCULATION_ENGINE_VERSION = calculationEnginePackage.version;

export interface CalculationEngineReadiness {
  readonly ready: true;
  readonly engineVersion: string;
  readonly rulesVersion: string;
  readonly rulesStatus: "draft";
  readonly calculationInputVersions: readonly ["calculation-input/v1", "calculation-input/v2"];
}

export function getCalculationEngineReadiness(): CalculationEngineReadiness {
  return Object.freeze({
    ready: true,
    engineVersion: CALCULATION_ENGINE_VERSION,
    rulesVersion: rulesManifest.version,
    rulesStatus: rulesManifest.status as "draft",
    calculationInputVersions: ["calculation-input/v1", "calculation-input/v2"] as const
  });
}

export function calculateV1(input: CalculationInputV1): CalculationResultV1 {
  const warnings: CalculationResultV1["warnings"] = [
    {
      kind: "engineeringReview",
      code: "CALCULATION_FORMULAS_NOT_IMPLEMENTED",
      message:
        "The retained v1 contract is contract-only; Stage 6 formulas require calculation-input/v2.",
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

export function calculateV2(input: CalculationInputV2): CalculationResultV2 {
  return runCalculationV2(input, CALCULATION_ENGINE_VERSION);
}

export function calculate(input: CalculationInputV1): CalculationResultV1;
export function calculate(input: CalculationInputV2): CalculationResultV2;
export function calculate(
  input: CalculationInputV1 | CalculationInputV2
): CalculationResultV1 | CalculationResultV2 {
  return input.schemaVersion === "calculation-input/v2" ? calculateV2(input) : calculateV1(input);
}

export const calculationEngine: CalculationEngine = Object.freeze({ calculate: calculateV1 });
export const calculationEngineV2: CalculationEngineV2 = Object.freeze({ calculate: calculateV2 });

export type {
  CalculationEngine,
  CalculationEngineV2,
  CalculationInputV1,
  CalculationInputV2,
  CalculationResultV1,
  CalculationResultV2
} from "./contracts.js";
