import type {
  CalculationRuleV2,
  PackagingPolicyV2,
  ProductSnapshotV2,
  ReservePolicyV2,
  SourceReferenceV2
} from "@niedax/domain";
import type { ProductQuantityAdjustmentV2 } from "@niedax/domain";

import type { ExactDecimal } from "../arithmetic/decimal.js";
import type { FormulaId } from "../trace/formula-catalog.js";

export type OrderUnit = "pcs" | "m" | "kg";
export type BomCategory =
  | "linearSection"
  | "fitting"
  | "connector"
  | "support"
  | "structure"
  | "anchor"
  | "wstb"
  | "endpointMaterial"
  | "accessory"
  | "manual";
export type DemandStatus =
  "catalogConfirmed" | "calculated" | "projectRule" | "engineeringReview" | "manual";

export interface TraceSeed {
  readonly formulaId: FormulaId;
  readonly inputs: readonly {
    readonly name: string;
    readonly value: ExactDecimal;
    readonly unit: "pcs" | "m" | "mm" | "kg" | "kgPerM" | "packages" | "percent";
  }[];
  readonly output: ExactDecimal;
  readonly unit: OrderUnit;
  readonly sourceRefs: readonly SourceReferenceV2[];
  readonly rule: CalculationRuleV2 | null;
  readonly roundingMode: "none" | "ceil" | "incrementCeil";
  readonly roundingBefore: ExactDecimal | null;
  readonly roundingIncrement: ExactDecimal | null;
  readonly roundingUnit?: "pcs" | "m" | "mm" | "kg" | "kgPerM" | "packages" | "percent";
  readonly contributesToDemand?: boolean;
  readonly parentSeedIndexes?: readonly number[];
}

export interface DemandEvent {
  readonly id: string;
  readonly product: ProductSnapshotV2 | null;
  readonly manualInputId: string | null;
  readonly manualProductCode: string | null;
  readonly manualDescription: string | null;
  readonly category: BomCategory;
  readonly quantity: ExactDecimal;
  readonly unit: OrderUnit;
  readonly supplyOptionId: string | null;
  readonly sectionLength: ExactDecimal | null;
  readonly sectionCount: ExactDecimal | null;
  readonly reservePolicy: ReservePolicyV2;
  readonly packagingPolicy: PackagingPolicyV2;
  readonly overrideBoundary: string;
  readonly status: DemandStatus;
  readonly inclusionSuppression: "independent" | "eligible";
  readonly sourceRefs: readonly SourceReferenceV2[];
  readonly ruleIds: readonly string[];
  readonly warningIds: readonly string[];
  readonly traceSeeds: readonly TraceSeed[];
}

export interface AggregatedDemand {
  readonly key: string;
  readonly events: readonly DemandEvent[];
  readonly product: ProductSnapshotV2 | null;
  readonly manualInputId: string | null;
  readonly productCode: string | null;
  readonly descriptionEn: string;
  readonly category: BomCategory;
  readonly unit: OrderUnit;
  readonly technicalQuantity: ExactDecimal;
  readonly supplyOptionId: string | null;
  readonly sectionLength: ExactDecimal | null;
  readonly technicalSectionCount: ExactDecimal | null;
  readonly reservePolicy: ReservePolicyV2;
  readonly packagingPolicy: PackagingPolicyV2;
  readonly status: DemandStatus;
  readonly sourceRefs: readonly SourceReferenceV2[];
  readonly ruleIds: readonly string[];
  readonly warningIds: readonly string[];
  readonly quantityAdjustment: ProductQuantityAdjustmentV2 | null;
}
