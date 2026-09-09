# Stage 10 execution evidence

Execution date: 2026-09-09. Agent-observed results below are distinct from human domain approval,
historical native Excel observations and remote CI. All local automated gates passed. Full Stage 10
acceptance remains pending runtime-image security disposition, domain approval and the explicitly
unexecuted remote CI setup; no complete Definition of Done or Stage 11 readiness is claimed.

Source starts at commit `52fac048aed95b982c39cec8d26e7f23b2795055`, with the user-supplied Stage 10
prompt initially untracked. Implementation remains an uncommitted working-tree change. Primary suite
and aggregate reports record the commit, current working-tree source hash and relevant fixture
or lockfile identity. Audit, download and cleanup reports record their narrower scope and are linked
by the corresponding run, timestamps and project/revision identity. Reports are in `.artifacts/stage10/safe`; raw diagnostic logs are ignored and
are not CI upload artifacts.

## Baseline and environment

The initial uncommitted development run overlapped new source work and is not a clean baseline.
A separate archive of the starting commit was installed from its unchanged frozen lockfile. Git
archive checkout line endings were normalized to LF to match the original source before running
`validate`: exit 0, 55 repository test files and 434 passing tests, with formatting, lint, typecheck
and builds passing. Log: `.artifacts/stage10/baseline-clean-validate.log`. No accepted golden was
regenerated. Accidental discovery of dependency tests in an early Stage 10 configuration is a
documented tooling defect, not a repository test count.

Reference environment: Windows 11 build 26200, Node 24.19.0, pnpm 11.21.0, Docker 28.5.1,
Compose 2.40.2, Playwright 1.63.0 and pinned Chromium 153.0.8010.12 (revision 1243).
CPU: Intel Core i7-13850HX, 28 logical CPUs; host RAM 34,029,162,496 bytes; Docker RAM limit
16,605,958,144 bytes. Performance evidence records its own observed hardware and image IDs.

The Windows pnpm auto-install shim was unavailable. An explicit successful frozen-lockfile install
established dependencies first; subsequent commands use `npm_config_verify_deps_before_run=false`
and `corepack pnpm`. This does not bypass lockfile installation, audit, tests or other gates.

## Final command and acceptance record

The final `corepack pnpm validate:stage10` run started at `2026-09-09T19:52:55.398Z`.
Its working-tree source identity is
`sha256:305207c42cd2f63d7380a5a2da2eeb1ff94717ec1eb313739f3a961d8ea0ad23`;
lockfile identity is `sha256:0ea90062871d16be184861b59e8ed9266f7b9a3fa8172809cea62029aa33ce9d`.
The machine record is `.artifacts/stage10/safe/stage10-run.json`; diagnostic output is
`.artifacts/stage10/final-validate-stage10-stable.log`. No remote CI run is represented by this
local execution (`ci: null`). It completed at `2026-09-09T20:06:44.144Z` with **exit0**,
`complete: true` and `passed: true`: all five child commands exited0.

| Command / component            | Observed result                                                                                                                      | UTC completion / evidence                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `validate:full`                | exit0, including every existing required gate                                                                                        | `19:55:22.379Z`, `stage10-run.json`                                             |
| `validate` within full gate    | Formatting, ESLint, all TypeScript projects,517 unit tests in60 files and production builds pass                                     | Unit report `19:53:18.068Z`; zero failed/skipped/pending tests or module errors |
| `db:check` within full gate    | 12 forward migrations;15/15 tests in each of2 clean cycles,0 skips                                                                   | PostgreSQL report `19:54:09.719Z`                                               |
| Ordinary `test:integration`    | 13 passed,15 explicitly PostgreSQL-only skips,28 discovered across3 files                                                            | `19:54:15.252Z`; those15 tests actually execute in each disposable DB cycle     |
| Container/network/backup gates | All pass, including normal stop/start persistence and separate backup restore                                                        | Full-gate log; backup project `niedax-backup-test-48144-1788983694656` cleaned  |
| `test:e2e`                     | exit0;6/6 passed,0 failed/skipped/retries                                                                                            | `19:59:01.609Z`, `browser.json` and matching cleanup                            |
| `test:security`                | exit0;439 inventoried paths,18 frontend+26 backend assets,0 findings; both audits executed with0 advisories                          | `19:59:03.726Z`, `security.json`, `audit-prod.json`, `audit-all.json`           |
| `test:performance`             | exit0; all8 budgets,20 samples per operation/case,0 failures in46 complete API pipelines, unchanged source and clean teardown        | `20:06:43.298Z`, `performance.json` and `performance-cleanup.json`              |
| `test:fixtures`                | exit0;32 unique files (35 references), all T01–T15, exact critical names/counts/skips, immutable hashes and matching source evidence | `20:06:44.144Z`, `fixtures.json`                                                |

The five public properties run350 genuinely varied examples with seeds10020260–10020264;
32 focused regressions assert the independent Stage10 expectations. They are part of the517
unit-test count, not517 plus350 additional test cases. The seven original engine golden pairs,
approved workbook and26-column mapping remain unchanged. The [test plan](stage10-test-plan.md)
maps all eight required workstreams and T01–T15; the manifest requires exact critical test names.

The final PostgreSQL project is `niedax-dbcheck-16148-1788983606015`. Its cycles completed at
`19:53:49.293Z` and `19:54:08.058Z`; each discovered both intended files and passed all15 tests.
Both cycle cleanups and the final cleanup report0 remaining test containers and0 volumes.
The source identity stayed unchanged throughout the two cycles.

The corrected browser suite passed in two fresh environments on the exact same final source:
`niedax-stage10-46228-1788983303116` at `19:52:23.076Z` and
`niedax-stage10-35696-1788983722870` at `19:58:56.823Z`. Each run passed all6 cases with
retries0, skips0 and unchanged source. Their matching cleanup reports passed at `19:52:28.199Z`
and `19:59:01.579Z`. The final suite took187,990ms, including honest authentication throttle waits;
this is not a performance benchmark. The three main journeys independently verify reviewer/viewer
downloads; the recovery case verifies before/after historical bytes. The eight fixed
`download-cycle-1/2/3.json`, `download-viewer-1/2/3.json`, and
`download-recovery-before/after.json` reports retain exact hashes, revision identity and bounded
verification metadata. Native Excel was not opened in this run.

Earlier failing attempts remain diagnostic evidence. In particular, the first aggregate passed
the full gate but caught a real test synchronization race (5/6 browser cases); the corrected test
holds/releases Calculate deliberately and waits for the new rendered fingerprint. The complete
development benchmark passed all numerical budgets but failed its source-freshness guard. Neither
attempt is presented as a successful aggregate. Heavy checks do not overlap benchmark measurements.

| Gate                          | Final state | Evidence / next action                                                                                                                                                                                                                                            |
| ----------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S10-01 Rules and edges        | passed      | `unit.json`, `2026-09-09T19:53:18.068Z`:517/517, including32 focused regressions and five varied-input properties.                                                                                                                                                |
| S10-02 Synthetic regression   | passed      | `fixtures.json`, `2026-09-09T20:06:44.093Z`: all T01–T15,12 baseline references,32 unique files and complete source-matched execution; human approval remains S10-10.                                                                                             |
| S10-03 PostgreSQL integration | passed      | `postgres.json`, `2026-09-09T19:54:09.719Z`:12 migrations,15/15 twice, zero skips, unchanged source and clean teardown.                                                                                                                                           |
| S10-04 Browser workflow       | passed      | `browser.json`, `2026-09-09T19:58:56.823Z`: second fresh6/6 run, retries0, complete actual UI workflows and matching cleanup.                                                                                                                                     |
| S10-05 Export correctness     | passed      | Final unit/DB/browser reports, last browser `2026-09-09T19:58:56.823Z`: unchanged golden,26 exact headers, saved quantities, blank prices and identical retained downloads.                                                                                       |
| S10-06 Security               | pending     | Scoped scanner and both current audits pass at `2026-09-09T19:59:03.679Z`. Historical runtime-image critical/high findings need current advisory/reachability reassessment and disposition; no clean-image claim.                                                 |
| S10-07 Performance            | passed      | `performance.json`, `2026-09-09T20:06:43.204Z`: all8 proposed p95 budgets,3 warm-ups+20 measured samples per case/operation,0/46 API pipeline failures and clean teardown.                                                                                        |
| S10-08 CI and validation      | pending     | Local `validate:stage10` exited0 at `2026-09-09T20:06:44.144Z`; all required commands actually ran. Supplied GitHub workflow awaits dedicated runner setup and remote execution; no CI URL or remote pass is claimed.                                             |
| S10-09 Stabilization          | pending     | Final local critical suites passed at `2026-09-09T20:06:44.144Z`; both observed severity2 product defects are fixed and verified. Historical runtime-image findings still require current severity/reachability disposition before full stabilization acceptance. |
| S10-10 Domain acceptance      | pending     | As of `2026-09-09T20:06:44.144Z`, an identified reviewer must approve exact manifest/scenario/result hashes, synthetic assumptions and proposed performance budgets.                                                                                              |

## Review and remaining external actions

The concrete [regression review package](stage10-regression-review.md) records independent
quantities, warnings, source/rule rationale, version decisions and exact identities in
[the manifest](stage10-regression-manifest.json). Reviewer name, role, date and decision remain
pending. The exact normalized-LF manifest SHA-256 is
`3c313d1183c23f9c0c3a89ec6b00fe4f65d1a444aff06161285d0143a2ed0f58`.
Approve that review identity together with the recorded scenario input/result hashes and proposed
budgets; record reviewer name/role/date/decision. No rule/catalog promotion or Stage 11 work is
authorized by an automated pass.

The [defect register](stage10-defects.md) preserves failed development attempts, product fixes,
retest status and limitations. The [security record](stage10-security.md) separates executed
dependency audits from historical image findings. Optional Docker Scout reassessment was rejected
by automatic approval review because it may transmit local image package/SBOM metadata to Docker's
external service; explicit authorization is pending and the action was not bypassed.

The [CI instructions](stage10-ci.md) describe the dedicated Docker-capable GitHub runner, exact
installation, bounded sanitized artifacts and cleanup. No runner was registered, and no code was
committed, pushed or deployed during this implementation run.

Normal persistent PostgreSQL data was never reset. Destructive cleanup is restricted to validated,
uniquely named disposable database/browser/performance/backup projects. Machine-readable cleanup
reports record the project identity and successful cleanup independently of the original operation's
success. PostgreSQL reports explicit remaining container/volume counts; browser/performance cleanup
reports record the outcome after the harness checks those resources are absent. Normal topology
stop/start checks preserve its persistent data.

The final benchmark project `niedax-stage10-18248-1788983946854` was cleaned at
`2026-09-09T20:06:43.126Z`. Its report records `sourceUnchanged: true`, `cleanupPassed: true`
and no failures. Typical/large p95 engine, Calculate, Save and export values are respectively
8.79/65.51ms,113.89/572.27ms,142.52/905.90ms and2,806.02/8,533.84ms.
Full p50/p95/max, entity counts, actual byte sizes, individual timings, hardware and limitations
are in [performance](stage10-performance.md).
