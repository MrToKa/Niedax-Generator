# Calculation engine

`packages/calculation-engine` is the sole owner of product quantity formulas. It is synchronous,
framework-independent TypeScript and accepts a fully resolved `calculation-input/v2` JSON value. It
does not read catalogs, databases, files, environment variables, clocks, random values, browser
state, or network resources. The backend/application layer resolves and snapshots every product,
supply option, compatibility relation, rule, and template before the call.

## Contracts and pipeline

The retained `CalculationInputV1`/`CalculationResultV1` schemas are unchanged and remain
contract-only. Stage 6 introduces `CalculationInputV2`, `CalculationResultV2`, and
`CalculationTraceV1`; version constants live in `packages/domain/src/schemas/versions.ts`.

The v2 pipeline is explicit:

1. strict schema and semantic validation;
2. stable product/rule/template/compatibility indexes;
3. per-segment section calculation and route topology;
4. logical support groups and physical straight runs;
5. atomic section, joint, fitting, connection, endpoint, support, template, anchor, WSTB,
   accessory, and manual demand events;
6. quantified included-item suppression only for components marked eligible;
7. aggregation by product/manual identity, category, order unit, supply option, effective policies,
   status, provenance, and override boundary;
8. quantity override, reserve, then package rounding;
9. BOM, included relationships, structured warnings, trace, and summary construction;
10. runtime result validation and deep-freeze.

Straight segments are rounded independently before aggregation. A logical continuation can join
straight-run joint topology and support topology, but creates no material event. Fittings,
connections, and endpoints use one ownership policy so a physical event is counted once.

## Arithmetic and units

Domain arithmetic uses the internal BigInt-backed `ExactDecimal` rational. Public values remain
canonical decimal strings. Inputs are limited to 30 digits and 18 fractional digits; exponent
notation, negative zero, leading/trailing zero aliases, and fractional `pcs` are rejected. No
formula uses `number`, `parseFloat`, or `Math.ceil`.

`m` and `mm` convert only through exact functions (`1000 mm = 1 m`). `kgPerM × m` yields `kg`.
Counts and result package counts are non-negative integers. Values of different dimensions never
share an aggregation key.

## Demand, reserve, and packaging

Atomic events retain source references, formula/rule, warning IDs, status, policies, and selected
supply option. Included children are informational on their ordered parent. Only demand explicitly
marked `suppressWhenIncluded` can consume proven included capacity; independent demand remains
orderable.

Every BOM line exposes technical, reserve-only, reserved, package increment/count, package-only
overage, ordered, and total-spare quantities. Reserve follows deliverable section/count demand.
Package rounding is last. Disabled packaging retains the effective catalog increment but has a
`null` package count and does not round.

## Trace and warnings

Every line has source steps and a final `BOM.FINALIZE.V1` step whose output equals
`orderedQuantity`. Source steps feed aggregation; manual replacement steps identify original and
adjusted values; reserve and package steps are separate. Runtime reconciliation checks technical +
reserve = reserved, reserved + packaging overage = ordered, and ordered - technical = total spare.

Schema-invalid or contradictory unsafe input throws `CalculationEngineError` with a stable code and
safe path details. With `warnAndOmit`, unresolved material is omitted while unaffected demand is
calculated; with `fail`, it throws `UNRESOLVED_MATERIAL`. Engineering and manual facts always remain
structured warnings and affect approval readiness.

## Determinism

Engine IDs use documented non-cryptographic FNV-1a 64-bit encoding of length-prefixed semantic
keys. They are trace identifiers, not integrity hashes. Semantically unordered input and every
result collection have stable sorts; geometry and participant order are preserved. `canonicalJson`
recursively sorts object keys for byte-stable replay tests. Invocation IDs and fingerprints are
echoed and never generated.

## Adding a formula version

Add a new immutable formula ID and expression to `trace/formula-catalog.ts`, implement it as a small
pure rule, add focused edge/property tests and reviewed golden output, update `formulas.md`, and run
the focused package commands plus `corepack pnpm validate`. Never change the meaning of a published
formula ID; add a later version instead.
