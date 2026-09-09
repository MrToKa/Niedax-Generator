# Stage 10 test plan and requirement traceability

Authority: Sections 5–10, T01–T15, entry criteria and change control in
`Niedax_Implementation_Plan_to_Test_Phase_BG.docx`, read without modifying the original. Sections
11–12 remain out of scope. The user-approved 26-column `Change Order` mapping supersedes the
plan's original 29-column `List1`. Engineering acceptance is distinct from test execution.

The [regression manifest](stage10-regression-manifest.json) is the executable index of exact
test names, fixtures, expected results, versions and hashes. The [review package](stage10-regression-review.md)
explains independent derivations and synthetic assumptions; no formula is implemented outside the
calculation engine. All scenarios below are critical because they protect material quantities,
saved evidence, permission boundaries or the usable project-to-export workflow.

| Scenario | Fixture and independently checked outcome                                                                                                                                               | Exact automated test / runner                                                                                                       | Execution evidence                                         |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| T01      | `stage10Scenarios.T01`: KL60 100m, explicit6m sections, 17 sections/102m, 2m unused,16 joints; source-confirmed KLTB supply with explicitly synthetic support relation                  | `stage10-regression.test.ts`: `T01 matches the independently derived complete BOM and warning multiset`; Vitest unit                | `safe/unit.json`, scenario T01 manifest                    |
| T02      | T02: WSL105 100m,68 supports, WSTB136; two-per-axis remains projectRule                                                                                                                 | Same file, `T02 matches…`; property WSTB/template variation                                                                         | `safe/unit.json`                                           |
| T03      | T03: separate6m and8.5m rounding; adjacent exact-decimal boundaries;3.1m+2.9m never shares a6m section                                                                                  | Same file, `T03 matches…`, decimal-boundary regression; public-engine properties                                                    | `safe/unit.json`                                           |
| T04      | T04: logical6m+6m shares9 supports versus10 separate; no boundary material event                                                                                                        | Same file, `T04 matches…`; `critical-workflows.spec.ts` three UI journeys plus insecure-LAN scenario                                | `safe/unit.json`, `safe/browser.json`                      |
| T05      | T05: physical break retains10 supports, one owned connector event with proven synthetic component scope                                                                                 | Same file, `T05 matches…`; retained fittings/joints golden                                                                          | `safe/unit.json`                                           |
| T06      | T06: bend port demand and manually added supports retain reason/trace                                                                                                                   | Same file, `T06 matches…`; retained assembly golden                                                                                 | `safe/unit.json`                                           |
| T07      | T07: three participants, invalid/duplicate/unknown endpoints rejected, one owned T event                                                                                                | Same file, `T07 matches…` and participant rejection case                                                                            | `safe/unit.json`                                           |
| T08      | T08: cap/equipment rule ownership; unresolved data omitted with approval blocker                                                                                                        | Same file, `T08 matches…`; endpoint edge/retained warning-matrix golden                                                             | `safe/unit.json`                                           |
| T09      | Separate DAM6X5 and DAZ8X10 fixtures preserve exact sizes, anchors/axis and50-piece packs with ETA warning                                                                              | Same file, `T09-DAM matches…`, `T09-DAZ matches…`                                                                                   | `safe/unit.json`                                           |
| T10      | Exact NSA6X35/FKK-T30 V/100-pack; concrete/unknown/denied relation and engineering warnings; importer retains indoor-only source fact                                                   | Same file, `T10 matches…`; `stage10-postgres.integration.test.ts` S10-DB12                                                          | `safe/unit.json`, both `safe/postgres.json` cycles         |
| T11      | 5% reserve then pack rounding; technical/reserve/reserved/increment/count/overage/ordered/total-spare distinct                                                                          | Same file, `T11 matches…`; arithmetic/property tests; UI saved workbook reconciliation                                              | `safe/unit.json`, `safe/browser.json`                      |
| T12      | Catalog and free-text identities; Manual reason; separate policies; add/edit/remove; saved manual catalog identity                                                                      | Same file, `T12 matches…`; original persisted project flow; S10-DB13; UI journeys                                                   | Unit/PostgreSQL/browser reports                            |
| T13      | Later draft, calculation and new active catalog/rule pins leave saved inputs/products/BOM/warnings/traces/checksums/export unchanged                                                    | S10-DB07 and S10-DB10; original `export-acceptance.ts` through persisted project flow                                               | Both PostgreSQL cycles                                     |
| T14      | Designer owner scope, Reviewer/Admin lifecycle, Viewer read-only, session revocation/audit and foreign export denial                                                                    | Two named tests in `project-flow.integration.test.ts`; authorization/auth/user/revision unit suites; browser role/recovery journeys | Unit, ordinary integration, PostgreSQL and browser reports |
| T15      | Actual UI download compared to selected saved revision;26 exact columns, three English sheets, literal codes, null/zero, blankP/Q; no production formulas/macros/external relationships | Three `T04 T11 T12 T14 T15 critical UI journey…` browser tests; `approved-workbook.test.ts`; retained independent OOXML reader      | Browser byte checks plus unit/PostgreSQL reports           |

Paths are rooted under `packages/calculation-engine/tests` for the named engine tests and fixtures,
`apps/backend/tests` for PostgreSQL, and `tests/e2e` for browser tests. Exact unabridged test names,
including each parameterized case, are stored in the manifest and checked against executed reports.

## Eight required workstreams

| Workstream                     | Coverage and runner                                                                                                                                                                                                                            | Acceptance rule                                                                                                 |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Unit rules                     | Sections, joints, support groups, templates/components, anchors/WSTB, included fasteners, endpoint ownership, reserve/packaging, manual identity/reasons, reconciliation                                                                       | Engine/public entry point plus retained golden and contract suites pass                                         |
| Properties and edges           | Five reproducible seeds;350 varied-input runs, actual geometry, counts, policies, topology and templates; zero acceptance/rejection, negatives, decimals, exact multiples, large valid values, permutations of unordered arrays                | Failures retain Vitest/fast-check seed and shrunk counterexample locally; no expected refresh                   |
| PostgreSQL integration         | Fresh migration/double-seed/checksum cycles, app-role persistence, controlled write-then-fail rollback, concurrent save/lifecycle/activation, import validation, all roles, immutability and audit                                             | Two fresh cycles discover original2 + Stage10 13, all15 pass/zero skips; cleanup verified                       |
| Playwright                     | UI project/routes/connection/calculate/save/check/approve/export; catalog/free-text manual CRUD; BG/EN; role/context changes; keyboard/narrow viewport; invalidation, retry/conflict; insecure-LAN crypto; blocked approval and later revision | Six critical tests, retries0; actual bytes independently reconciled; repeat fresh environments                  |
| Controlled synthetic scenarios | Seven unchanged golden pairs plus13 focused inputs cover T01–T12; production-path synthetic catalog/actors cover T13–T15                                                                                                                       | Sources, explicit units/pins and independent expected values are reviewable; no invented P0 compatibility       |
| Regression governance          | Manifest verifies normalized-LF text hashes/raw workbook hash, canonical scenario input/expected hashes, exact runner/test identities and fresh source-bound reports                                                                           | Tests/CI never update goldens; domain reviewer approves exact candidate hashes separately                       |
| Security                       | Strict schemas, IDOR/roles/replay/CSRF/Origin/revocation, literal export text and ZIP integrity; tracked/built asset scan; production/development audits                                                                                       | Both audits executed and nonzero exits propagate; findings/remaining image-scan limits documented               |
| Performance                    | Typical10/100 and large100/1000, engine and Caddy separately;3warmups+20samples; correct quantities/warnings; fresh exports; declared p95 budgets                                                                                              | Explicit nonzero failure on timing/correctness/cleanup; individual samples, fixture/build and hardware identity |

## Runner discovery and skips

Root Vitest retains its default `node_modules` exclusions and excludes integration and Playwright
specs. The separate integration config discovers `*.integration.test.ts`. Both test files containing
PostgreSQL-only scenarios are intentionally skipped on the host and execute with `STAGE7_ACCEPTANCE=1`
inside each disposable acceptance cycle. Ordinary in-memory authentication checks never count as
PostgreSQL evidence. New TypeScript configuration covers all backend/package tests, scripts,
Playwright specs, helpers and configuration; ESLint covers them without generated output.

`validate:stage10` runs the existing `validate:full` once and all additional Stage10 gates. The full
gate includes non-destructive **normal-project** stop/start persistence and egress/port probes;
only credentialed/data-mutating acceptance runs are disposable. CI requires a dedicated host and
fresh workspace, as described in [CI operations](stage10-ci.md).

The documented NSA indoor-only restriction has no project environment field in the accepted input
contract. Tests preserve the source restriction and concrete compatibility; they cannot claim an
outdoor-project rejection from a nonexistent input field. Resolved engine fittings and intentionally
unresolved API fitting fixtures are separate, explicit coverage. Historical/native Excel opening
and domain approval are never inferred from a parser, Playwright or CI pass.
