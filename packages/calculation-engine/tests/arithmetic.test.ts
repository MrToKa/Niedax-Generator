import { describe, expect, it } from "vitest";

import { DecimalStringV2Schema, PiecesQuantityV2Schema } from "@niedax/domain";
import {
  ExactDecimal,
  massFromLinearRate,
  metresFromMillimetres,
  millimetresFromMetres
} from "../src/index.js";

describe("exact arithmetic and unit normalization", () => {
  it("normalizes canonical decimals without binary floating point", () => {
    expect(ExactDecimal.from("0.1").add(ExactDecimal.from("0.2")).toCanonical()).toBe("0.3");
    expect(ExactDecimal.from("999999999999.999999").toCanonical()).toBe("999999999999.999999");
    expect(ExactDecimal.from("11").multiply(ExactDecimal.from("1.1")).ceil().toCanonical()).toBe(
      "13"
    );
  });

  it("converts m/mm and composes kgPerM by m into kg exactly", () => {
    expect(metresFromMillimetres("3000").toCanonical()).toBe("3");
    expect(millimetresFromMetres("6.125").toCanonical()).toBe("6125");
    expect(massFromLinearRate("18.5", "12").toCanonical()).toBe("222");
  });

  it("rejects exponent notation, negative zero, trailing zeros, and fractional pieces", () => {
    for (const invalid of ["1e3", "-0", "01", "1.0", "NaN", "Infinity"])
      expect(DecimalStringV2Schema.safeParse(invalid).success, invalid).toBe(false);
    expect(PiecesQuantityV2Schema.safeParse({ value: "1.5", unit: "pcs" }).success).toBe(false);
  });
});
