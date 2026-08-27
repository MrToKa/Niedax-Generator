export type CalculationEngineErrorCode =
  | "INPUT_SCHEMA_INVALID"
  | "SEMANTIC_INPUT_INVALID"
  | "UNRESOLVED_MATERIAL"
  | "SUPPORT_CONFIGURATION_MISMATCH"
  | "AMBIGUOUS_LINE_POLICY"
  | "INTERNAL_INVARIANT_FAILED";

export interface CalculationEngineErrorDetail {
  readonly path: readonly (string | number)[];
  readonly code: string;
  readonly message: string;
}

export class CalculationEngineError extends Error {
  public constructor(
    public readonly code: CalculationEngineErrorCode,
    message: string,
    public readonly details: readonly CalculationEngineErrorDetail[] = []
  ) {
    super(message);
    this.name = "CalculationEngineError";
  }
}
