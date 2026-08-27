# Stage 6 completion evidence

## Baseline before Stage 6 source changes

- `corepack pnpm --filter @niedax/domain test` — failed before test execution: inherited root
  Vitest include found no files from the package working directory (exit 1).
- `corepack pnpm --filter @niedax/calculation-engine test` — same pre-existing package-script
  configuration failure (exit 1).
- `corepack pnpm validate` — passed: formatting, lint, typecheck, 13 unit-test files / 50 tests, and
  every workspace build including the Next.js production build.

The focused package scripts now set the repository root and explicit package test path; export uses
the same convention.

## Formula-to-test matrix

| Area                                         | Focused tests                                            | Golden coverage                   |
| -------------------------------------------- | -------------------------------------------------------- | --------------------------------- |
| exact decimal, units, reserve boundaries     | `arithmetic.test.ts`, `property.test.ts`                 | all                               |
| segment section selection/rounding           | `stage6-calculation.test.ts`, `rules-edge-cases.test.ts` | connected, per-segment, all-major |
| joints/fittings/connections/included items   | stage6 and edge cases                                    | fittings-joints                   |
| continuous/separate supports and adjustments | stage6, edge, property                                   | connected, assembly               |
| templates, anchors, WSTB                     | stage6 and edge                                          | assembly, all-major               |
| endpoint/manual policies                     | stage6 and edge                                          | route-ends                        |
| warnings and unresolved policy               | edge cases and schema validation                         | unresolved matrix                 |
| schema, trace, export, boundaries            | domain/engine/export tests                               | all expected results              |

## Golden fixtures and deterministic replay

Committed input/expected pairs:

1. `connected-routes-6m-support-continuation`;
2. `per-segment-rounding-and-3m-6m-separation`;
3. `fittings-joints-and-included-fasteners`;
4. `assembly-anchors-wstb-and-manual-supports`;
5. `route-ends-and-manual-items`;
6. `unresolved-data-warning-matrix`;
7. `all-major-rules-combined`.

Golden tests calculate every input five times, compare canonical bytes, validate every expected
result, and permute all semantically unordered arrays. Final canonical SHA-256 values are recorded
after final validation below.

## Property tests

- Seeds: `6020260`, `6020261`, `6020262`, and `6020263`.
- Run counts: 150 each for section, reserve/package, and support properties; 25 valid full-engine
  replay/schema/reconciliation runs.
- Properties: non-negative section waste below one section, monotone section/reserve/order demand,
  package multiples, exact support formula, integer/non-negative pcs, schema validity, ordered ≥
  reserved ≥ technical, and byte-stable replay.

## Architecture and trace evidence

The boundary test scans engine runtime imports/globals and formula-ID leakage into frontend,
backend, database, catalog-import, and export. Runtime dependencies remain domain plus the static
rules manifest; `fast-check` is test-only.

Every BOM line owns source steps, aggregation, separate reserve and package steps, and finalization.
Runtime reconciliation checks all quantity deltas; schemas reject orphan line/warning/trace
references. Included relations remain parent information rather than zero lines.

## Final commands and canonical hashes

Observed focused outcomes:

- `corepack pnpm --filter @niedax/domain test` — passed, 2 files / 10 tests;
- `corepack pnpm --filter @niedax/domain typecheck` — passed;
- `corepack pnpm --filter @niedax/calculation-engine test` — passed, 8 files / 30 tests;
- `corepack pnpm --filter @niedax/calculation-engine typecheck` — passed;
- `corepack pnpm --filter @niedax/calculation-engine build` — passed;
- `corepack pnpm --filter @niedax/export test` — passed, 1 file / 2 tests;
- `corepack pnpm validate` — passed: formatting, lint, root and workspace typecheck, 19 files /
  80 tests, and every workspace build including the Next.js production build.

Canonical result hashes from five fresh replays per fixture:

| Fixture                                     | Canonical SHA-256                                                  |
| ------------------------------------------- | ------------------------------------------------------------------ |
| `all-major-rules-combined`                  | `6aa47a78aa3a52b9eb27a37f9489159c9cab8dc908b83c7725bf4ac8b4ef7ac2` |
| `assembly-anchors-wstb-and-manual-supports` | `76ed1b9dcb1f05f5ffe3acfdad3c02e30cbc49f364cc3f65f6ed758e1494fa31` |
| `connected-routes-6m-support-continuation`  | `829da6c619e3e6776b8b4e4644f3868d5d0584d94f4f64d94d03ba5bf2a95ab6` |
| `fittings-joints-and-included-fasteners`    | `58ec95478037842721363775d9c50c485db0919d0ca8bee6bf08651e2e9496b0` |
| `per-segment-rounding-and-3m-6m-separation` | `1a08816580213869e79b9cd8401a49256485d4b7040859599c143c03be912597` |
| `route-ends-and-manual-items`               | `842587fd8a850b674a5afa19f1938e4f7c3c2e8f6097efc9bebdb7be0b648101` |
| `unresolved-data-warning-matrix`            | `bc6b9a52ba4447875961ba480582534a07d483c948bb9d1a8d5eea3777f7b416` |

## Known non-blocking engineering warnings

Golden data deliberately retains missing-load, anchor engineering review, WSTB project-rule,
manual override, and unresolved-matrix warnings. They are test facts, not product approvals.

## Deferred integration

Backend draft-to-v2 snapshot mapping, persistence of v2 trace/warning payloads, and UI presentation
are intentionally outside Stage 6. Export now has a v2 immutable-copy model; binary renderers remain
their later-stage responsibility.
