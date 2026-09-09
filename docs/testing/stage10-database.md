# Stage 10 PostgreSQL acceptance

`corepack pnpm db:check` runs the production repository/service paths against two fresh,
isolated PostgreSQL 18.4 databases. It applies all 12 forward migrations, verifies their
checksums, seeds twice, executes the retained foundation/Stage 4/5/7/8 SQL assertions,
and then runs both backend acceptance files with `STAGE7_ACCEPTANCE=1`.

The Docker acceptance command explicitly includes
`apps/backend/tests/project-flow.integration.test.ts` and
`apps/backend/tests/stage10-postgres.integration.test.ts`, with file parallelism disabled.
The discovery reporter requires exactly two files and 15 tests: the two retained
credentialed scenarios and thirteen Stage 10 tests, all passing with zero skips.
Ordinary host integration runs explicitly skip these 15 cases; that host result is
not PostgreSQL acceptance evidence. Every failed command or missing discovery report
fails the database gate.

## Production paths and test-only controls

The reusable `persisted-project-fixture.ts` retains the existing non-authoritative
S7 synthetic product/assembly definitions. Stage 10 uses separate `71000000-*`
catalog/rule/product IDs, fresh graph IDs, and a separate catalog scope. These
fixtures establish application transactions and evidence persistence, not official
product compatibility. Four synthetic actors are prepared with non-login test hashes.
The pre-existing credentialed scenarios generate and authenticate their own accounts.

Privileged fixture setup is confined to the disposable database. All new Calculate,
Save, Check, Approve, catalog import/lifecycle, export and assertion operations use
a PostgreSQL connection whose `current_user` is asserted to be
`niedax_generator_app`. The isolated migrator authenticates the connection and the
connection's `role` option applies the production application role; this is not a
claim that operations were exercised with migration privileges.

`stage10-transaction-probe.ts` wraps only the test pool's driver boundary. It lets a
selected production SQL write succeed and then throws once. The real production
transaction handler must roll back. Before/after database digests and row counts
include revisions, BOM/warning projections, transient calculations, approvals,
success audit, idempotency, and exports. Rollback tests require the existing real
triggers, constraints and grants. No production fault hook or formula was added.
The separately reproduced manual-catalog Save defect required the narrow forward
constraint correction described below.

The simultaneous-save test holds both requests immediately before their project
row lock, confirms both arrivals within five seconds, and releases them together.
Both run the actual PostgreSQL locks and idempotency code. One commits and the other
replays the same immutable response. Existing retained scenarios additionally race
different save keys, lifecycle checks and approvals, and verify single winners,
contiguous revision numbers, stale-state failures and actor/action/project scopes.

## Executable coverage

Each identifier below is part of the exact Vitest test name in
`apps/backend/tests/stage10-postgres.integration.test.ts`.

| ID       | Behavior and independently observable outcome                                                                                                                                                                                                                                                                                                                                        |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| S10-DB01 | Calculate fails after inserting its replacement transient result. The prior transient calculation and all success evidence remain exact.                                                                                                                                                                                                                                             |
| S10-DB02 | Save fails after its first BOM projection. No partial revision/projections/success audit/replay result remains. Retrying the original key creates revision 1 without a numbering gap.                                                                                                                                                                                                |
| S10-DB03 | Check fails after its lifecycle status update. The Calculated revision, approvals, audit and idempotency digests are unchanged.                                                                                                                                                                                                                                                      |
| S10-DB04 | Approve fails after the approval row insert. The Checked revision and all evidence remain unchanged.                                                                                                                                                                                                                                                                                 |
| S10-DB05 | Export capture fails after artifact insertion. No partial artifact or success replay remains. Invalid empty-byte finalization violates the real database constraint atomically and leaves all pending fields intact. The fixture exhausts its three allowed attempts and leaves no pending job.                                                                                      |
| S10-DB06 | Coordinated same-key concurrent saves produce one revision and one exact replay; changed payload under that key conflicts without mutation.                                                                                                                                                                                                                                          |
| S10-DB07 | Every saved BOM and warning projection equals the transient result, including trace references. Later draft changes and recalculation do not alter saved snapshots/checksums or create history.                                                                                                                                                                                      |
| S10-DB08 | Import fails after staging insertion and Validate fails during product materialization; both roll back all catalog/report/materialized state.                                                                                                                                                                                                                                        |
| S10-DB09 | An intentionally broken NSA reference persists invalid staging/report evidence, cannot be approved or activated, and cannot be activated by a Designer or forged Administrator role from a Viewer account.                                                                                                                                                                           |
| S10-DB10 | Catalog approval and replacement activation roll back at intermediate writes with their audit. Successful activation archives the prior version; a saved project snapshot, checksums and downloaded bytes remain unchanged. Existing drafts retain explicit old pins, a newly created draft pins the new catalog, and archive succeeds through the production service.               |
| S10-DB11 | Simultaneous activation of the same approved catalog returns the same active version with exactly one successful activation transition and one active version in the scope.                                                                                                                                                                                                          |
| S10-DB12 | Production import preserves all five exact P0 NSA codes, 100-piece packaging, indoor-only flag, concrete system, mandatory engineering verification and ETA note.                                                                                                                                                                                                                    |
| S10-DB13 | Save retains a manual catalog line with both product and manual-input identity separately from automatic demand, with exact BOM projections. Production export/download and the independent ZIP/OOXML reader verify automatic 5 plus manual 2 supports, code `00123` retained as text, free-text 2.5 m and a blank package count. Export preserves the saved snapshot and checksums. |

Catalog cases copy the accepted canonical CSV source facts and change both declared
candidate version and product version, plus the manifest scope, into explicitly
disposable candidate identities. The invalid candidate changes one referenced NSA
code, producing unresolved references and missing category attributes. Candidate
imports do not overwrite the accepted CSV/XLSX files or their expectations.

For T10, this proves persistence of the documented indoor-only/concrete policy.
The project contract does not expose an indoor/outdoor input; this suite does not
claim outdoor-project enforcement or fabricate P0 assembly compatibility. Engine
tests separately cover concrete/unknown/incompatible substrate results and retained
engineering warnings.

## Isolation and cleanup

`scripts/lib/db-check-config.ts` validates the resolved Compose file, exact random
`niedax-dbcheck-<pid>-<timestamp>` project, expected services/build paths/image,
internal-only database network, absence of ports, fixed read-only initialization
bind and absence of external/named/persistent volume or secret mounts. It runs before
every Compose operation, including cleanup. The Compose configuration contains a
new short-lived password in memory and is never printed. No normal credential file
is read by this command.

`scripts/tests/db-check-config.test.ts` has 13 passing guard tests, including refusal
of the normal Compose file/project, published PostgreSQL, persistent data bind,
writeable initialization bind, external network/volume, altered database host,
normal container name and disabled credentialed acceptance.

Each successful cycle is removed before the next fresh database starts. Final
cleanup also runs on failure, reports its own result, and verifies that no containers
or Compose-labelled volumes remain for the exact project. The normal persistent
database is never reset or used by these data-mutating scenarios. Build-cache images
may remain; they contain source/development dependencies and no generated runtime
credentials or database data. No global Docker prune occurs.

## Execution record

The durable machine-readable result is `.artifacts/stage10/safe/postgres.json` and
contains commit, suite/config hashes, both cycle timestamps, exact names/counts,
conditional environment, cleanup results and overall pass/fail. Reports contain no
passwords, cookies, SQL parameter values, sensitive bodies or raw stack traces.
The final aggregate Stage 10 evidence identifies the final reviewed run.

During stabilization, the first cycle passed 13/14 cases and failed only the new
NSA storage assertion. The test had compared a canonical input decimal `100` with
PostgreSQL's declared `numeric(24,8)` storage text `100.00000000`. The literal storage
expectation was corrected; no product quantity, schema or accepted golden changed.
That failed attempt and successful cleanup are retained as
`.artifacts/stage10/safe/postgres-first-attempt.json`. The next run passed both fresh
cycles (14/14 each; zero failures/skips). After the T13 activation/retained-download
assertions were added to S10-DB10, the next local database run again passed both
cycles, at `2026-09-09T18:40:13.983Z` and `2026-09-09T18:40:34.202Z`, under project
`niedax-dbcheck-15128-1788979193160`. Each cycle executed 14/14 tests with zero
failures, skips or unhandled errors. Both cycle cleanups and the final cleanup
reported zero remaining project containers/volumes. `corepack pnpm db:check` exited 0.

The guard suite passed 13 tests; the six affected pre-existing backend unit files
passed 53 tests after their mocks/immutable fixture builders were typed for the new
test TypeScript gate. These typing corrections preserve runtime request behavior.

## Corrected production defect: manual catalog revision identity

The real browser workflow reproduced HTTP 500 while saving a valid calculation
containing a catalog-backed manual item. PostgreSQL rejected the insert with
SQLSTATE `23514`, constraint `revision_bom_lines_v2_identity_kind`. The engine
correctly represents such a line as `kind=catalog`, with both a catalog `productId`
and a `manualInputId`. The applied Stage 8 constraint incorrectly required that
all catalog lines have no manual identity.

This severity 2 defect blocks saving a supported manual-item workflow. The forward
migration `20260909185233_preserve_manual_catalog_revision_identity.sql` corrects
only that check: catalog lines must have a product identity and may retain manual
identity; free-text/manual lines must have manual identity and cannot claim a
catalog product. Existing snapshots are not rewritten. Applied migration files,
checksums, append-only triggers, exact JSON projection constraints, role grants,
calculation formulas, quantities and export mapping remain unchanged. The migration
validates its replacement check against existing rows and is safe for the already
accepted subset of rows. S10-DB13 protects Save, persisted evidence and downloaded
literal quantities through production paths.

The 14-test runs above predate this additional migration and regression. Two initial
post-migration attempts correctly failed strict migration-count assertions in the
retained foundation and Stage 4 tests, before application acceptance started. Both
test inventory assertions were advanced from 11 to 12 and both failed attempts
completed guarded cleanup with zero remaining containers/volumes. Their safe reports
are `postgres-migration-count-attempt.json` and `postgres-stage4-count-attempt.json`
under `.artifacts/stage10/safe/`.

The subsequent `corepack pnpm db:check` run exited 0 under disposable project
`niedax-dbcheck-10400-1788980283890`. It applied and checksum-verified all 12
migrations and passed both fresh cycles at `2026-09-09T18:58:33.323Z` and
`2026-09-09T18:58:52.740Z`: each discovered exactly two files and passed all 15 tests,
with zero failures, skips, pending tests, module failures or unhandled errors.
S10-DB13 passed in both cycles. Both cycle cleanups and the final cleanup reported
zero remaining project containers/volumes.

A later `validate:full` execution exited 0 and repeated this PostgreSQL gate against
the source checkpoint under project `niedax-dbcheck-37060-1788982747515`. Its two fresh
cycles passed at `2026-09-09T19:39:28.696Z` and `2026-09-09T19:39:47.435Z`, each with
15/15 tests in exactly two files and zero failures, skips, pending tests, module
failures or unhandled errors. Both cycle cleanups and final cleanup again reported
zero remaining project containers/volumes.

The report written at
`2026-09-09T19:39:49.184Z`, records `sourceUnchanged: true`, baseline commit
`52fac048aed95b982c39cec8d26e7f23b2795055`, and exact source identity
`sha256:73b77f094fbec9424ef3ca86df0a22d04c604b5c5fac15f38231f2bf16c8204a`.
This establishes the database acceptance result for that earlier source checkpoint.

After the browser synchronization correction, `validate:full` was repeated against
source `sha256:305207c42cd2f63d7380a5a2da2eeb1ff94717ec1eb313739f3a961d8ea0ad23` and
exited 0 at `2026-09-09T19:55:22.379Z`. Its PostgreSQL project was
`niedax-dbcheck-16148-1788983606015`; the two fresh cycles passed at
`2026-09-09T19:53:49.293Z` and `2026-09-09T19:54:08.058Z`. Each cycle again passed
15/15 tests in exactly two files, with zero failures, skips, pending tests, module
failures or unhandled errors. Both cycle cleanups and final cleanup reported zero
remaining project containers/volumes.

The current `.artifacts/stage10/safe/postgres.json`, written at
`2026-09-09T19:54:09.719Z`, records this successful run, the same baseline commit,
the exact `305207c42...` source identity above, and `sourceUnchanged: true`. This is
the latest database acceptance evidence. The complete local aggregate subsequently passed
at `2026-09-09T20:06:44.144Z`; runtime-image reassessment, remote CI execution and domain
approval retain their separate pending status in the final evidence matrix.
