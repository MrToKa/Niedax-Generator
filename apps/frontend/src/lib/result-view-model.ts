import type {
  BomLineV2,
  CalculationResultV2,
  CalculationWarningV2,
  TraceStepV2
} from "@niedax/domain";

export interface BomLineView {
  readonly line: BomLineV2;
  readonly sourceRefs: BomLineV2["sourceRefs"];
  readonly provenance: BomLineV2["provenance"];
  readonly warnings: readonly CalculationWarningV2[];
  readonly traceSteps: readonly TraceStepV2[];
}

export function buildBomLineViews(result: CalculationResultV2): readonly BomLineView[] {
  const warnings = new Map(result.warnings.map((warning) => [warning.id, warning]));
  const steps = new Map(result.trace.steps.map((step) => [step.id, step]));
  return result.bomLines.map((line) => ({
    line,
    sourceRefs: line.sourceRefs,
    provenance: line.provenance,
    warnings: line.warningIds.flatMap((id) => {
      const warning = warnings.get(id);
      return warning ? [warning] : [];
    }),
    traceSteps: line.traceStepIds.flatMap((id) => {
      const step = steps.get(id);
      return step ? [step] : [];
    })
  }));
}

export function displayQuantity(quantity: Readonly<{ value: string; unit: string }>): string {
  return `${quantity.value} ${quantity.unit}`;
}

export function isManualBomLine(line: BomLineV2): boolean {
  return line.kind === "manual";
}
