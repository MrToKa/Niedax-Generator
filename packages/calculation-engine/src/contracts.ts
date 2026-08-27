import type {
  CalculationInputV1,
  CalculationInputV2,
  CalculationResultV1,
  CalculationResultV2
} from "@niedax/domain";

export interface CalculationEngine {
  calculate(input: CalculationInputV1): CalculationResultV1;
}

export interface CalculationEngineV2 {
  calculate(input: CalculationInputV2): CalculationResultV2;
}

export type {
  CalculationInputV1,
  CalculationInputV2,
  CalculationResultV1,
  CalculationResultV2
} from "@niedax/domain";
