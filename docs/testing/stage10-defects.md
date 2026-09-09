# Stage 10 defect register

Severity1: data loss/corruption, unauthorized access or an unusable critical flow.
Severity2: wrong material/order quantities, broken immutability/approval or a critical workflow
failure without a safe workaround. Severity3: limited-impact behavior/tooling or documented risk
with a bounded workaround. Acceptance is not achieved by relabeling an unresolved defect.

| ID      | Severity / state                                                   | Reproduction, expected and actual                                                                                                                                                                                                                                               | Fix / owner / regression evidence                                                                                                                                                                                                                                  |
| ------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| S10-D01 | 2 / fixed and verified                                             | On insecure LAN HTTP, create/duplicate/edit route uses secure-context-only `crypto.randomUUID`; editor fails before persistence. Expected stable valid UUIDs using available browser crypto.                                                                                    | Reuse `browser-uuid.ts` getRandomValues fallback for editor identities and request keys; technical owner; failing regression observed then17 focused tests passed, LAN Playwright passed. No formulas/snapshot semantics change.                                   |
| S10-D02 | 2 / fixed and verified                                             | Add a Niedax/catalog Manual item, calculate and Save revision. Engine preserves catalog identity plus manual provenance; PostgreSQL rejects it with23514 `revision_bom_lines_v2_identity_kind`, HTTP500. Expected immutable catalog/manual identity and successful save/export. | New forward-only migration and S10-DB13; technical/database owner. Both 15-test PostgreSQL cycles and all three browser Save/export journeys now pass. Preserve applied migrations, grants, snapshots and provenance.                                              |
| S10-D03 | Security advisories / package fixes and final full retest verified | Initial production audit14 entries (2critical/9high/3moderate); all-dependency audit17 entries adds Vitest/mocker/js-yaml.                                                                                                                                                      | Minimal exact Next16.3.3/Fastify5.12.1/Vitest4.1.11 and compatible transitive patches. Scoped ExcelJS→UUID11.1.1 CommonJS/API+advisory regression; independent approved workbook tests passed. Both current audits exit0. Details [security](stage10-security.md). |
| S10-D04 | 3 / fixed                                                          | Added Vitest exclusion array replaced default exclusions and accidentally discovered dependency tests. That failed run is not evidence about repository test totals.                                                                                                            | Restore `configDefaults.exclude`; add discovery guard coverage including collection errors. Final source run must contain repository tests only.                                                                                                                   |
| S10-D05 | 3 / fixed test expectation                                         | New NSA persistence assertion expected text100, while numeric(24,8) returns100.00000000. Quantity unchanged; first disposable cycle13/14 passed.                                                                                                                                | Exact storage literal corrected, no product/formula/golden change. Two fresh cycles then14/14 passed; later D02 extends required suite to15.                                                                                                                       |
| S10-D06 | 3 / fixed verification gap                                         | Backend/package test files were linted but absent from TypeScript coverage; existing mutable fixture/mocks had hidden type errors.                                                                                                                                              | `tsconfig.tests.json` plus typed test builders/mocks; no runtime contract weakening. New gate runs inside typecheck.                                                                                                                                               |
| S10-D07 | 3 / fixed artifact controls                                        | Accidental tracked `.env.production` could evade path scanner; browser reports could enter Docker context.                                                                                                                                                                      | Reject all `.env.*` except example before reading; ignore browser output/state in Docker and Git; bounded sanitized reports only.                                                                                                                                  |
| S10-D08 | 3 / fixed benchmark fixture                                        | API benchmark used dimension ID `60x200`; the published catalog selector requires `dimension:S10-SYN:60x200`, so Calculate returned422.                                                                                                                                         | Correct only fixture identity, preserve quantities, workload and budgets. Final typical and large cases each completed3 warm-ups and20 measured samples, with all quantities/budgets and the aggregate passing.                                                    |
| S10-D09 | 3 / fixed browser test assumptions                                 | Initial OOXML sheet-name check assumed XML attribute order; sign-ins encountered the real five/minute limiter; missing required anchor correctly disabled Calculate.                                                                                                            | Parse attributes independently, honor explicit Retry-After with retries0, assert missing-anchor validation and use unresolved fitting warning for saved blocked approval. No limiter or product-validation weakening.                                              |
| S10-D10 | 3 / fixed evidence guards                                          | A passed-test count could hide overall browser failure, performance could overwrite browser cleanup identity, or one empty built-asset set could be hidden by the other. Environment examples/SQL/CSV/configuration text were absent from scanner content selection.            | Require overall success, exact retry-zero tests and matching cleanup; separate browser/performance cleanup; scan both nonempty build sets and relevant text.24 guard regressions pass, with source identity captured before/after scans.                           |

## Open limitations and acceptance blockers

- **Domain approval pending**: no identified reviewer has approved the exact T01–T15 hashes or proposed
  performance budgets. The [review package](stage10-regression-review.md) records quantities, warning
  semantics and sources. Automated correctness is separate from business acceptance.
- **Remote CI pending**: workflow file is supplied for the existing GitHub origin, but no runner is
  registered and no remote execution is claimed. Configure the dedicated runner described in
  [CI operations](stage10-ci.md), then run the workflow against the reviewed commit.
- **Runtime-image reassessment pending**: August13 historical Docker critical/high findings are not
  current clean evidence. The optional fresh Docker Scout action was rejected by automatic approval
  review because it may send the local image package/SBOM inventory to an external service. It was
  not bypassed. Package audits and local security checks are independent and executed. External scan
  approval or an approved offline scanner is needed to reassess exact final images; keep all historical
  findings visible and do not infer a severity reduction from network isolation.
- **Catalog/engineering limits**: P0 unresolved fitting/endpoint/assembly compatibility retains
  omission/approval warnings. Synthetic relations prove algorithms, not Niedax structural approval.
  NSA indoor-only is preserved as source evidence; no environment field exists to infer outdoor use.
- **Export polling limits**: proposed45s large-export p95 can outlast eight fast-response UI polls
  scheduled across43s;60s UI hard timeout and90s worker deadline are separate. A later manual refresh
  is supported. Actual timing outcomes are in [performance](stage10-performance.md).
- **Native Excel evidence scope**: Stage9 user-observed no-repair/readability evidence applies to the
  recorded downloaded artifact and renderer `stage9-exceljs-2`. Stage10 retains production renderer,
  mapping and goldens. An unchanged-byte parser/browser result does not create a new native Excel
  observation. The scoped UUID dependency change is tested independently; if generated workbook
  semantics change, native Excel review must be repeated.

First-run tooling failures (missing Windows pnpm auto-install shim; archive CRLF conversion; initial
browser selectors) are diagnostic attempts, not accepted results. The exact final status and retest
counts are recorded in [evidence](stage10-evidence.md). Normal persistent data was never reset.

The first aggregate passed `validate:full` but its browser repeat exposed another S10-D09 race:
after clicking Calculate, the old Detailed BOM was already visible, so the test navigated to
Revisions before the new response's deliberate Results navigation. Five cases passed and the
first journey failed its history-button count. This was not loss of a saved revision. Successful
calculations now wait for their own POST200, the parsed fingerprint rendered in the UI, the
completion announcement, `aria-busy=false` and removal of stale state. The regression explicitly
holds/releases the request and proves the old BOM remains visible while busy. No timeout,
Playwright retry or production behavior was changed. The corrected suite passed6/6 at
`2026-09-09T19:52:23.076Z`, with source unchanged and cleanup successful; the final aggregate
provides its second fresh repetition. The earlier failed aggregate is preserved as
`.artifacts/stage10/safe/stage10-run-development-browser-race.json`.

Final product-fix retest: `validate:full` exited0 at `2026-09-09T19:55:22.379Z`, PostgreSQL passed15/15 twice, and the final browser repetition passed6/6 at `19:58:56.823Z` on unchanged source `305207c42cd2f63d7380a5a2da2eeb1ff94717ec1eb313739f3a961d8ea0ad23`. Both S10-D01 and S10-D02 are fixed and verified. The synchronization correction passed two fresh complete browser runs with retries0. Final npm audits at `19:59:03.679Z` remain empty. The separate runtime-image reassessment and domain acceptance are still pending.
