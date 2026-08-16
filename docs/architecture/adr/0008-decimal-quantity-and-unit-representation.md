# ADR 0008: Decimal quantity and unit representation

- Status: Accepted
- Date: 2026-08-16

## Context

Lengths, loads, package quantities, spare percentages, and manual corrections cross JSON boundaries.
Unlabelled JavaScript numbers are ambiguous and binary floating point can destabilize hashes and
rounding.

## Decision

Serialize decimal values as canonical base-10 strings inside explicit quantity objects. Units are a
closed v1 enum: `pcs`, `m`, `mm`, `kg`, `kgPerM`, and `packages`. Percentages are canonical strings
bounded `0..100`. Signed values are allowed only in explicitly signed correction schemas. Dates are
UTC ISO strings and intentional absence is `null`.

## Alternatives considered

- Naked JSON numbers: rejected due to unit ambiguity and floating-point serialization risk.
- Store every value as integer microunits: rejected because scale and dimension still need explicit
  metadata and product-specific precision is unresolved.
- Add a decimal arithmetic library now: rejected because Stage 3 implements no formulas.

## Consequences

Canonical hashing is stable and unit mistakes fail at runtime. Future formulas must choose and
document a decimal arithmetic implementation without changing v1 serialization. Conversion is
explicit at adapters.

## Follow-up actions

Confirm family-specific precision and rounding in Stage 4 before implementing BOM formulas.
