# Stage 9 verification evidence

Verification date: 2026-09-09. The user's explicit instruction to use the supplied **26-column
A:Z `Change Order`** workbook supersedes the original 29-column `List1` acceptance text.
The required supplemental sheets remain `Calculation details` and `Warnings`.

## Reviewed inputs and independent checks

The original workbook was inspected read-only. Its inventory, source hash, exact headers,
widths, merges and formula meanings are recorded in [the inventory](stage9-template-inventory.md).
The [mapping](stage9-column-mapping.md) distinguishes package increment G, package count I,
ordered quantity C, technical quantity B and total spare D. No production formula computes
quantities. Price cells P/Q and unavailable metadata are truly empty; this template has no SAP
column and no defective `#REF!` name. No customer workbook is committed or copied into images.

The reviewed redistributable golden is
[`change-order-control.xlsx`](../../packages/export/tests/fixtures/change-order-control.xlsx),
with [independent expectations](../../packages/export/tests/fixtures/change-order-control.expected.json).
Its final reviewed length is 149,672 bytes and SHA-256 is
`351b6dcf642ffebf53b6c5c7e57898ae8d4a7f1839183bbdc1eac66085ddc337`.
It uses the retained `all-major-rules-combined` engine result: 12 distinct BOM rows,
with the first line preserving 24 m technical, 6 m reserve, 30 m reserved, 6 m increment,
5 packages, 0 m package overage, 30 m ordered and 6 m total spare. The connector example
preserves 2/1/3/2/2/1/4/2 in those same fields, with pcs except package count.
The separate invented 29-column golden is strictly a renderer-framework test.

The independent reader in `packages/export/tests/helpers/ooxml.ts` checks ZIP central
directories, CRC/size, internal OOXML relationships and typed cells. Tests compare the
complete normalized cell structure as well as saved quantities, evidence leaves and
independently specified values. ExcelJS reopening is an additional check, not the only reader.
Fixed fixture times stabilize workbook metadata; raw ZIP hashes are not semantic golden tests.

The tests also cover retained route-end/manual-item and assembly-anchor/manual-support
fixtures, warnings, empty BOM/no warnings, repeated product codes, null packaging, kg zero,
leading-zero codes, exact decimal overflow and literal formula-trigger text. Engine fixtures
and formulas were not changed. Both saved trace occurrences with duplicate trace ID
`trace-bd4f2f3197c11056` are preserved by distinct source paths and sequence.

## Acceptance matrix

| ID    | Evidence and outcome                                                                                                                                                                                                                                                                                                             |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| EX-01 | Passed with the authorized A:Z variant. Exact 26 source headers including trailing spaces, no added order column, no customer/sample rows. Inventory and approved-workbook tests.                                                                                                                                                |
| EX-02 | Passed automated structure checks: three sheets, exact order/count, types, widths, merges, filters, freeze panes, print areas and repeated titles. Native print inspection is recorded below.                                                                                                                                    |
| EX-03 | Passed independent per-line reconciliation in renderer tests and authenticated disposable API acceptance. One saved BOM line per order row, original order, included relations informational, codes literal.                                                                                                                     |
| EX-04 | Passed saved reserve/package/spare distinctions, null package count, m/pcs/kg, zero, manual rows and decimal precision boundaries. Unsafe precision uses the canonical exact text.                                                                                                                                               |
| EX-05 | Passed every source evidence leaf and warning/trace reference; global warnings, engineering caveats, blockers, adjustments and no-warning state preserved.                                                                                                                                                                       |
| EX-06 | Passed no executable production formulas, invalid names, external links, macros, injection or populated P/Q price fields. Separate synthetic reference-formula tests verify exact same-row references and caches.                                                                                                                |
| EX-07 | Passed reviewed approved-layout golden and independent semantic expectations, with separate candidate generation. Final renderer identity is `stage9-exceljs-2`.                                                                                                                                                                 |
| EX-08 | Passed real authenticated Fastify/API/PostgreSQL acceptance: request, status and binary download; media type, attachment, length, SHA-256, nosniff/private cache and safe errors.                                                                                                                                                |
| EX-09 | Passed role/resource matrix, current enabled actor, role changes, unauthenticated/disabled users, CSRF/Origin, cross-owner cache/status/download, malformed/unknown fields, fingerprint and unsupported format/version. Denied and nonexistent artifact responses have identical not-found semantics.                            |
| EX-10 | Passed append-only original pending replay, key conflict, concurrent cross-actor cache deduplication, coherent lifecycle capture, render failure, expired claim recovery/exhaustion, claim-token finalization and immutable ready bytes. Truncated ZIP cannot become ready.                                                      |
| EX-11 | Passed in both fresh database cycles: later draft/recalculation/revision, distinct active catalog/rule versions and a privileged test-only live author rename leave old snapshots/checksums/bytes unchanged. A distinct new artifact preserves all three sheets semantics except capture-time and test mapping-version metadata. |
| EX-12 | Passed actual native Brave/Caddy BG and EN request/download, including keyboard activation. Both files have identical bytes and independently validated English contents; source state is unchanged.                                                                                                                             |
| EX-13 | Passed final validate:full: production runtime builds, two-cycle database/API checks, Caddy-only published port, authentication, persistence, network isolation and exact artifact storage restore/privileges.                                                                                                                   |
| EX-14 | Passed: native Excel golden inspection by the agent; actual browser-downloaded file opened manually by the user, who explicitly confirmed no repair warning and readable sheets/print. These are separately attributed observations.                                                                                             |

## Commands and gates

All mutations in acceptance tests run in named disposable environments. The normal persistent
database is not reset and no normal `docker compose down -v` command is used. The browser
setup validates its project prefix, loopback gateway port, named temporary volume, secret paths,
image names and full network/hardening configuration before each Compose action.

```powershell
corepack pnpm --filter @niedax/export test
corepack pnpm --filter @niedax/export typecheck
corepack pnpm --filter @niedax/domain test
corepack pnpm --filter @niedax/backend test
corepack pnpm --filter @niedax/frontend test
corepack pnpm --filter @niedax/calculation-engine test
corepack pnpm validate
corepack pnpm db:check
corepack pnpm validate:full
corepack pnpm stage9:browser up
corepack pnpm stage9:browser status
corepack pnpm stage9:browser down
git diff --check
git status --short
```

On this Windows host, commands used `CI=true` and
`npm_config_verify_deps_before_run=false` (equivalently
`corepack pnpm --config.verify-deps-before-run=false ...`) after an explicit successful
dependency installation. This avoids the unavailable auto-install pnpm shim; it does not
exclude tests, type checks, builds or any full-gate stage. Docker commands require access
outside the shell sandbox to the local Docker Desktop pipe.

The initial exporter baseline passed 2 tests. A later source gate passed 55 files/433 tests
and all builds. A development `db:check` passed both fresh disposable cycles, including
the real Stage 9 PostgreSQL acceptance. Final totals after review fixes are recorded below.
Intermediate gate failures exposed concurrent documentation formatting and a golden style
change during native QA; these were corrected by formatting and deliberate reviewed golden
updates, without changing saved engine expectations or skipping checks.

The final focused database run returned explicit exit 0 in both fresh cycles with 11 applied
migrations and the complete Stage 9 acceptance. A test-only author rename initially attempted
to change `updated_at` without a security-role transition; the existing trigger correctly
rejected it. The fixture now changes only name fields under its migration-owner connection,
preserving all security audit metadata. No trigger was disabled and no applied migration was
edited. The scratch independent download validator's Node globals were also declared for
ESLint without weakening lint or test discovery.

## T15 actual application and Microsoft Excel

The browser environment runs the production images/topology through Caddy at loopback
port 18089, with separate image tags, generated test credentials and an ephemeral database.
The supported acceptance setup creates `SYN-STAGE9-EXPORT`, approves eligible
revision 1 through the lifecycle service and saves later calculated revision 2. Export never
performs those lifecycle mutations itself.

Read-only source baseline for the actual browser walkthrough:

- Project: `bda6e064-78a2-48fd-8c08-22cc0e985d16` (`SYN-STAGE9-EXPORT`).
- Revision: `bb41fac7-0f36-4da5-aa46-1bb941fc8dc4`, number 2, Calculated.
- Input fingerprint: `sha256:ce6b13fef50b9bb7e2e71a2be6ea8ae6a8c1cd1741145ae7a324550c09864e55`.
- Revision checksum: `sha256:9f4460d475422f8e233ef2307454669aa2ea2676877b6a6e492d68c8b6db1581`.
- Saved result: four BOM rows, two warnings, including a manual row with null package count.

The exact baseline and independent browser-download verifier are retained locally under the
ignored `.artifacts/stage9-browser/` directory; neither contains a saved session token. Test
credentials remain separate local fixture inputs and are not included in this document.

Native Microsoft Excel was observed as version 16.0, build 20326, Windows 64-bit. Initial
normal opening of the synthetic golden produced no repair prompt. Visual QA found an
unwanted trailing decimal separator and overly compressed one-page-wide printing. Renderer
version 2 uses integer format `0` or the saved decimal scale and A3 output with reviewed
page scaling, preserving the approved column widths/positions and saved values.

The native Brave walkthrough selected saved revision 2 through the real Caddy application.
The BG request used visible keyboard focus and Enter; request/pending/ready states were
observed. The UI identified the selected Calculated revision and English output. Switching
to EN and making a new request returned the same ready cached artifact. Both languages
downloaded the actual workbook through the application.

- Artifact: `5b07deac-e007-44f7-814a-00d09d646a7e`.
- Local files: `.artifacts/stage9-browser-BG.xlsx` and `.artifacts/stage9-browser-EN.xlsx`.
- Each length: 56,271 bytes.
- Each SHA-256: `336fa04d084c245a6182dd61f6ffb31c322d502da7493e9fdcc423128ee1d3d2`.
- Normalized semantic SHA-256: `b1944de9c86a4f99fbf349a8bd740306ff219b331d0626835b9d55164474a7ee`.

The independent verifier passed with exit 0 at 12:06:34 UTC. Per file, it checked all 26
original headers including whitespace, four BOM rows and 20 direct quantity/null matches,
units/order/blank compatibility fields, 1,276 saved evidence leaves with types and row links,
both warnings including global evidence, no executable formulas, 18 ZIP parts with valid
CRC/relationships, freeze/filter/print bounds and renderer version 2. It recomputed five
directly checkable source hashes. Exact project draft, current calculation, revision history
and saved revision matched the pre-export baseline. The pair had identical bytes.

```powershell
node .artifacts/stage9-browser/verify-browser-downloads.mjs verify .artifacts/stage9-browser-BG.xlsx .artifacts/stage9-browser-EN.xlsx
```

The report is `.artifacts/stage9-browser/download-verification.json`. The scratch verifier
normalizes equivalent absolute/relative row markers in print-area references; it does not
change workbook bytes. The downloaded order print area is `'Change Order'!$A1:$Z9`.

After both downloads, the native Computer Use policy guard stopped automation because it
could not reliably determine the current browser URL. No further native UI actions were
attempted. In particular, the agent did not claim to have opened the downloaded workbook
in Excel. The user then opened that exact BG download manually and explicitly confirmed:
“Отваря се без поправка; листовете и печатът са четливи” (opens without repair; sheets and
print are readable). This user-observed check completes the actual-file EX-14/T15 requirement,
separately from the earlier agent-observed golden check. A separate native narrow-window
walkthrough was not completed; the native keyboard flow and responsive/focus implementation
were checked without claiming a narrow-window observation.

The browser test environment was removed with `stage9:browser down`, explicit exit 0, after
all API comparisons completed. Only its validated temporary containers/networks/volume were
removed. Downloaded files and local evidence remain; the normal database was not reset. The
native test browser tab could not be closed after the guard stopped UI automation.

## Final verification result

`corepack pnpm validate:full` completed with explicit `FULL_EXIT=0`. This includes:

- `validate`: formatting, ESLint, all workspace type checks, 55 unit-test files / 434 passing
  tests, and every package/application build.
- `db:check`: both fresh database cycles, 11 checksum-verified migrations, Stage 4–8 database
  assertions and both application-flow/Stage 9 acceptance scenarios in each cycle.
- Production Docker builds and ordinary integration: 13 passing tests. The two credentialed
  application-flow scenarios are intentionally skipped outside the disposable environment;
  both ran and passed in each `db:check` cycle, with unchanged test discovery.
- Container session boundary, Caddy-only published port, LAN access and persistent data
  across normal stop/start.
- Runtime network isolation with the existing documented Docker Desktop gateway boundary.
  Two hostile test URLs were changed to loopback examples; the scanner was not weakened.
- Disposable backup/restore, byte-identical export storage and metadata, append-only guards,
  migration history and restored column privileges. The storage-specific fixture is explicitly
  a four-byte opaque bytea probe, not a workbook-validity test; real workbook validity is
  established by the renderer/API/browser checks above. Intentional failed-password backup
  output belongs to the required fail-closed negative test, which passed.

Focused checks also passed: exporter 24 tests and typecheck, domain 52 tests, backend 169
tests, frontend 137 tests and calculation engine 31 tests. Final document formatting and
`git diff --check` passed. Logs remain local in ignored `stage9-*.log` / `.stage9-db-check.log`.

EX-01 through EX-14 and T15 are satisfied for the user-authorized 26-column variant, with the
actual Excel check attributed to the user's explicit observation. No required acceptance
blocker remains. No commit or push was made; customer workbooks, runtime secrets, temporary
evidence and generated builds are not included in version-control changes.
