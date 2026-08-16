import { z } from "zod";

const CANONICAL_DECIMAL = /^(?:0|[1-9]\d*)(?:\.\d+)?$/u;
const CANONICAL_SIGNED_DECIMAL = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/u;

export const IdentifierSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u, "Expected an opaque stable identifier");

export const HumanTextSchema = z.string().trim().min(1).max(2_000);
export const OptionalHumanTextSchema = z.string().trim().max(10_000).nullable();
export const ProductCodeSchema = z.string().trim().min(1).max(100);
export const SemverSchema = z
  .string()
  .regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u, "Expected a semantic version");
export const Sha256Schema = z
  .string()
  .regex(/^sha256:[0-9a-f]{64}$/u, "Expected a lowercase sha256 fingerprint");
export const UtcDateTimeSchema = z
  .string()
  .datetime({ offset: false })
  .refine((value) => value.endsWith("Z"), "Expected a UTC date-time ending in Z");

export const DecimalStringSchema = z
  .string()
  .regex(CANONICAL_DECIMAL, "Expected a canonical non-negative decimal string")
  .refine((value) => Number.isFinite(Number(value)), "Decimal must be finite");

export const PositiveDecimalStringSchema = DecimalStringSchema.refine(
  (value) => Number(value) > 0,
  "Quantity must be greater than zero"
);

export const SignedDecimalStringSchema = z
  .string()
  .regex(CANONICAL_SIGNED_DECIMAL, "Expected a canonical signed decimal string")
  .refine((value) => Number.isFinite(Number(value)), "Decimal must be finite");

export const PercentageDecimalStringSchema = DecimalStringSchema.refine(
  (value) => Number(value) <= 100,
  "Percentage must be between 0 and 100"
);

export const IdempotencyKeySchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u);

export const CorrelationIdSchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u);

export const QuantityUnitSchema = z.enum(["pcs", "m", "mm", "kg", "kgPerM", "packages"]);

export const QuantitySchema = z
  .object({
    value: DecimalStringSchema,
    unit: QuantityUnitSchema
  })
  .strict();

export const PositiveQuantitySchema = z
  .object({
    value: PositiveDecimalStringSchema,
    unit: QuantityUnitSchema
  })
  .strict();

export const PiecesQuantitySchema = z
  .object({ value: DecimalStringSchema, unit: z.literal("pcs") })
  .strict();
export const PositivePiecesQuantitySchema = z
  .object({ value: PositiveDecimalStringSchema, unit: z.literal("pcs") })
  .strict();
export const SignedPiecesQuantitySchema = z
  .object({ value: SignedDecimalStringSchema, unit: z.literal("pcs") })
  .strict();
export const MetresQuantitySchema = z
  .object({ value: DecimalStringSchema, unit: z.literal("m") })
  .strict();
export const PositiveMetresQuantitySchema = z
  .object({ value: PositiveDecimalStringSchema, unit: z.literal("m") })
  .strict();
export const MillimetresQuantitySchema = z
  .object({ value: PositiveDecimalStringSchema, unit: z.literal("mm") })
  .strict();
export const CableLoadQuantitySchema = z
  .object({ value: DecimalStringSchema, unit: z.literal("kgPerM") })
  .strict();
export const PackagesQuantitySchema = z
  .object({ value: DecimalStringSchema, unit: z.literal("packages") })
  .strict();

export type Identifier = z.infer<typeof IdentifierSchema>;
export type DecimalString = z.infer<typeof DecimalStringSchema>;
export type Quantity = z.infer<typeof QuantitySchema>;
export type QuantityUnit = z.infer<typeof QuantityUnitSchema>;
export type DeepReadonly<T> = T extends (...arguments_: never[]) => unknown
  ? T
  : T extends readonly unknown[]
    ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T;
