import type { QuantityV2 } from "@niedax/domain";

import { ExactDecimal } from "./decimal.js";

export function metresFromMillimetres(value: string): ExactDecimal {
  return ExactDecimal.from(value).divide(ExactDecimal.from("1000"));
}

export function millimetresFromMetres(value: string): ExactDecimal {
  return ExactDecimal.from(value).multiply(ExactDecimal.from("1000"));
}

export function massFromLinearRate(rateKgPerM: string, lengthM: string): ExactDecimal {
  return ExactDecimal.from(rateKgPerM).multiply(ExactDecimal.from(lengthM));
}

export function decimalFromQuantity(quantity: QuantityV2): ExactDecimal {
  return ExactDecimal.from(quantity.value);
}
