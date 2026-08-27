const CANONICAL_DECIMAL = /^(?:0|[1-9]\d*)(?:\.\d*[1-9])?$/u;
const MAX_DIGITS = 30;
const MAX_SCALE = 18;

function absolute(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  let a = absolute(left);
  let b = absolute(right);
  while (b !== 0n) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a === 0n ? 1n : a;
}

function powerOfTen(scale: number): bigint {
  let result = 1n;
  for (let index = 0; index < scale; index += 1) result *= 10n;
  return result;
}

function assertCanonical(value: string): void {
  if (!CANONICAL_DECIMAL.test(value)) throw new Error("INVALID_CANONICAL_DECIMAL");
  const digits = value.replace(".", "").length;
  const point = value.indexOf(".");
  const scale = point === -1 ? 0 : value.length - point - 1;
  if (digits > MAX_DIGITS || scale > MAX_SCALE) throw new Error("DECIMAL_PRECISION_EXCEEDED");
}

export class ExactDecimal {
  public readonly numerator: bigint;
  public readonly denominator: bigint;

  private constructor(numerator: bigint, denominator: bigint) {
    if (denominator === 0n) throw new Error("DIVISION_BY_ZERO");
    const sign = denominator < 0n ? -1n : 1n;
    const divisor = greatestCommonDivisor(numerator, denominator);
    this.numerator = (numerator / divisor) * sign;
    this.denominator = absolute(denominator / divisor);
  }

  public static from(value: string): ExactDecimal {
    assertCanonical(value);
    const point = value.indexOf(".");
    if (point === -1) return new ExactDecimal(BigInt(value), 1n);
    const digits = value.slice(0, point) + value.slice(point + 1);
    return new ExactDecimal(BigInt(digits), powerOfTen(value.length - point - 1));
  }

  public static fromInteger(value: bigint): ExactDecimal {
    if (value < 0n) throw new Error("NEGATIVE_DOMAIN_VALUE");
    return new ExactDecimal(value, 1n);
  }

  public add(other: ExactDecimal): ExactDecimal {
    return new ExactDecimal(
      this.numerator * other.denominator + other.numerator * this.denominator,
      this.denominator * other.denominator
    );
  }

  public subtract(other: ExactDecimal): ExactDecimal {
    const result = new ExactDecimal(
      this.numerator * other.denominator - other.numerator * this.denominator,
      this.denominator * other.denominator
    );
    if (result.numerator < 0n) throw new Error("NEGATIVE_DOMAIN_VALUE");
    return result;
  }

  public multiply(other: ExactDecimal): ExactDecimal {
    return new ExactDecimal(this.numerator * other.numerator, this.denominator * other.denominator);
  }

  public divide(other: ExactDecimal): ExactDecimal {
    if (other.numerator === 0n) throw new Error("DIVISION_BY_ZERO");
    return new ExactDecimal(this.numerator * other.denominator, this.denominator * other.numerator);
  }

  public compare(other: ExactDecimal): -1 | 0 | 1 {
    const difference = this.numerator * other.denominator - other.numerator * this.denominator;
    return difference < 0n ? -1 : difference > 0n ? 1 : 0;
  }

  public ceil(): ExactDecimal {
    const quotient = this.numerator / this.denominator;
    const remainder = this.numerator % this.denominator;
    return ExactDecimal.fromInteger(remainder === 0n ? quotient : quotient + 1n);
  }

  public isInteger(): boolean {
    return this.denominator === 1n;
  }

  public isZero(): boolean {
    return this.numerator === 0n;
  }

  public toCanonical(): string {
    if (this.numerator === 0n) return "0";
    if (this.denominator === 1n) return this.numerator.toString();

    let denominator = this.denominator;
    let twos = 0;
    let fives = 0;
    while (denominator % 2n === 0n) {
      denominator /= 2n;
      twos += 1;
    }
    while (denominator % 5n === 0n) {
      denominator /= 5n;
      fives += 1;
    }
    if (denominator !== 1n) throw new Error("NON_TERMINATING_DECIMAL_OUTPUT");
    const scale = twos > fives ? twos : fives;
    if (scale > MAX_SCALE) throw new Error("DECIMAL_OUTPUT_SCALE_EXCEEDED");
    const scaledNumerator = this.numerator * (powerOfTen(scale) / this.denominator);
    const digits = scaledNumerator.toString().padStart(scale + 1, "0");
    const whole = digits.slice(0, digits.length - scale);
    const fraction = digits.slice(digits.length - scale).replace(/0+$/u, "");
    return fraction.length === 0 ? whole : `${whole}.${fraction}`;
  }
}

export const ZERO = ExactDecimal.from("0");
export const ONE = ExactDecimal.from("1");
export const HUNDRED = ExactDecimal.from("100");

export function sumDecimals(values: readonly ExactDecimal[]): ExactDecimal {
  return values.reduce((total, value) => total.add(value), ZERO);
}

export function minimum(left: ExactDecimal, right: ExactDecimal): ExactDecimal {
  return left.compare(right) <= 0 ? left : right;
}
