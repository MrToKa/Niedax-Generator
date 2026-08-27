import type {
  CalculationInputV2,
  LinePolicyV2,
  PackagingPolicyV2,
  ProductSnapshotV2,
  ReservePolicyV2
} from "@niedax/domain";

import { ExactDecimal, HUNDRED, ONE } from "../arithmetic/decimal.js";
import { CalculationEngineError } from "../errors.js";
import type { AggregatedDemand } from "../model/demand-event.js";

export interface EffectivePolicies {
  readonly reserve: ReservePolicyV2;
  readonly packaging: PackagingPolicyV2;
  readonly overrideBoundary: string;
}

export interface FinalizedQuantities {
  readonly technical: ExactDecimal;
  readonly reserve: ExactDecimal;
  readonly reserved: ExactDecimal;
  readonly packageIncrement: ExactDecimal;
  readonly packageCount: ExactDecimal | null;
  readonly packagingOverage: ExactDecimal;
  readonly ordered: ExactDecimal;
  readonly totalSpare: ExactDecimal;
  readonly reservedSectionCount: ExactDecimal | null;
  readonly reservePercent: ExactDecimal;
}

function matchingLinePolicies(
  input: CalculationInputV2,
  productId: string | null,
  manualInputId: string | null
): readonly LinePolicyV2[] {
  return input.linePolicies.filter((policy) =>
    policy.target.kind === "catalogProduct"
      ? productId !== null && policy.target.productId === productId
      : manualInputId !== null && policy.target.manualInputId === manualInputId
  );
}

export function resolvePolicies(
  input: CalculationInputV2,
  product: ProductSnapshotV2 | null,
  manualInputId: string | null,
  defaultReserve: ReservePolicyV2,
  defaultPackaging: PackagingPolicyV2
): EffectivePolicies {
  const policies = matchingLinePolicies(input, product?.id ?? null, manualInputId);
  if (policies.length > 1) {
    throw new CalculationEngineError(
      "AMBIGUOUS_LINE_POLICY",
      "More than one line policy applies to the same demand.",
      [
        {
          path: ["linePolicies"],
          code: "AMBIGUOUS_LINE_POLICY",
          message: product?.id ?? manualInputId ?? "unknown"
        }
      ]
    );
  }
  const policy = policies[0];
  return policy === undefined
    ? { reserve: defaultReserve, packaging: defaultPackaging, overrideBoundary: "none" }
    : {
        reserve: policy.reservePolicy,
        packaging: policy.packagingPolicy,
        overrideBoundary: policy.id
      };
}

export function policyKey(reserve: ReservePolicyV2, packaging: PackagingPolicyV2): string {
  const reserveKey =
    reserve.mode === "projectDefault"
      ? "project"
      : reserve.mode === "disabled"
        ? `disabled:${reserve.metadata.overrideId}`
        : `percent:${reserve.percent}:${reserve.metadata.overrideId}`;
  const packagingKey =
    packaging.mode === "catalogDefault"
      ? "catalog"
      : packaging.mode === "disabled"
        ? `disabled:${packaging.metadata?.overrideId ?? "none"}`
        : `increment:${packaging.increment.value}:${packaging.increment.unit}:${packaging.metadata.overrideId}`;
  return `${reserveKey}|${packagingKey}`;
}

export function reservePercent(input: CalculationInputV2, policy: ReservePolicyV2): ExactDecimal {
  if (policy.mode === "projectDefault")
    return ExactDecimal.from(input.project.defaultReservePercent);
  if (policy.mode === "disabled") return ExactDecimal.from("0");
  return ExactDecimal.from(policy.percent);
}

export function packageIncrement(
  demand: AggregatedDemand,
  includePackaging: boolean
): { readonly enabled: boolean; readonly increment: ExactDecimal } {
  if (!includePackaging || demand.packagingPolicy.mode === "disabled")
    return {
      enabled: false,
      increment:
        demand.product === null
          ? ExactDecimal.from("1")
          : ExactDecimal.from(demand.product.packageIncrement.value)
    };
  if (demand.packagingPolicy.mode === "incrementOverride")
    return {
      enabled: true,
      increment: ExactDecimal.from(demand.packagingPolicy.increment.value)
    };
  if (demand.product === null)
    throw new CalculationEngineError(
      "SEMANTIC_INPUT_INVALID",
      "A free-text item requires an explicit package increment when package rounding is enabled."
    );
  return { enabled: true, increment: ExactDecimal.from(demand.product.packageIncrement.value) };
}

export function finalizeQuantities(
  input: CalculationInputV2,
  demand: AggregatedDemand
): FinalizedQuantities {
  const percent = reservePercent(input, demand.reservePolicy);
  const multiplier = ONE.add(percent.divide(HUNDRED));
  let reserved: ExactDecimal;
  let reservedSectionCount: ExactDecimal | null = null;
  if (demand.technicalSectionCount !== null && demand.sectionLength !== null) {
    reservedSectionCount = demand.technicalSectionCount.multiply(multiplier).ceil();
    reserved =
      demand.unit === "m"
        ? reservedSectionCount.multiply(demand.sectionLength)
        : reservedSectionCount;
  } else if (demand.unit === "pcs") {
    reserved = demand.technicalQuantity.multiply(multiplier).ceil();
  } else {
    reserved = demand.technicalQuantity.multiply(multiplier);
  }
  const reserve = reserved.subtract(demand.technicalQuantity);
  const packageDecision = packageIncrement(demand, input.options.includePackaging);
  if (
    packageDecision.enabled &&
    demand.sectionLength !== null &&
    demand.unit === "m" &&
    !packageDecision.increment.divide(demand.sectionLength).isInteger()
  ) {
    throw new CalculationEngineError(
      "SEMANTIC_INPUT_INVALID",
      "Straight-section package increment is not compatible with the selected supply length.",
      [
        {
          path: ["products", demand.product?.id ?? "manual"],
          code: "INCOMPATIBLE_SECTION_PACKAGE",
          message: demand.key
        }
      ]
    );
  }
  const packageCount = packageDecision.enabled
    ? reserved.divide(packageDecision.increment).ceil()
    : null;
  const ordered =
    packageCount === null ? reserved : packageCount.multiply(packageDecision.increment);
  const packagingOverage = ordered.subtract(reserved);
  return {
    technical: demand.technicalQuantity,
    reserve,
    reserved,
    packageIncrement: packageDecision.increment,
    packageCount,
    packagingOverage,
    ordered,
    totalSpare: ordered.subtract(demand.technicalQuantity),
    reservedSectionCount,
    reservePercent: percent
  };
}
