import type { CalculationInputV1, CalculationResultV1 } from "@niedax/domain";

export interface CalculationEngine {
  calculate(input: CalculationInputV1): CalculationResultV1;
}

export type { CalculationInputV1, CalculationResultV1 } from "@niedax/domain";
