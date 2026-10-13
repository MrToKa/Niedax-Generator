# Stage 12 evidence

Preparation date: 2026-09-30. **Acceptance package prepared; operational acceptance and human
UAT admission remain NO-GO.** Local implementation verification, historical records,
remote CI, operational acceptance and human observations have separate scopes below.

## Inspected authority and source

Read the original plan DOCX read-only, including Section 12, T01–T15, entry criteria and
change control. Read Stage 10 manifest/review/tests/evidence/security/CI/performance/defects,
Stage 11 prompt/evidence/runbooks/workflows/demo/seed/smoke/gates, Stage 8 role/snapshot policy,
Stage 9 decisions/mapping/template/golden/evidence and applicable root AGENTS/CONTRIBUTING.

Initial branch `codex/stage12-acceptance-prompt`; HEAD
`3883afddabae42d5a637faea71167e682982f591`; working tree clean. At
`2026-09-30T15:41:20.187Z` the existing Stage 10 source identity was
`sha256:762ec416bf4cbc520edec1b20a5e753c4679851d6012b5a332a3bac60c8b37d3`.
This matches the historical aggregate's behavioral source inventory despite documentation-only
commit changes. The Stage 12 validator and identity collector change that inventory; current
verification needs new evidence. Authoring SHA/source identity never substitutes for deployed identity.

The safe operator-managed Stage 10 sign-off was inspected through `assertTestPaths` and the
existing `assertStage10Acceptance` mechanism, without logging secret files. Its last file
modification was `2026-09-24T08:23:38.557Z`: reviewedCommit null; image-security and domain
statuses pending; exact-current-commit acceptance false. The tracked template was not altered.
Local safe summary: `.artifacts/stage12/safe/inspection.json`.

## Remote and historical evidence

On 2026-09-30 public GitHub Actions pages were read in the in-app browser after the web tool
could not fetch them. [Current Stage 10 PR run 36737620712](https://github.com/MrToKa/Niedax-Generator/actions/runs/36737620712)
identifies `3883afdd` and remained **queued** at observation. It is a pull-request run, not an
accepted main deployment trigger. Earlier main [Stage 10 run 35993102300](https://github.com/MrToKa/Niedax-Generator/actions/runs/35993102300)
was cancelled; [Stage 11 run 36227878559](https://github.com/MrToKa/Niedax-Generator/actions/runs/36227878559)
was skipped. No successful remote validation/deployment is claimed. A queued run does not prove
why a runner is unavailable; runner registration/administration requires authenticated access.

Available ignored safe records were inspected rather than inferred from document references:

| Record                                                    | Actual identity/result                                                                                                                                                                        | Reuse limit                                                                                                              |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `.artifacts/stage10/safe/stage10-run.json`                | 2026-09-24 08:48:21.070Z–09:10:35.347Z; commit `81036b81a0e32193b0cc609afeaf0f14a6b13420`; source `762ec416…`; lockfile `0ea90062…`; all five commands exit 0; complete/passed true; ci null. | Historical local implementation proof. It does not prove remote CI or the changed Stage 12 source.                       |
| `.artifacts/stage11/safe/deployment.json` before Stage 12 | 2026-09-24T08:36:18.619Z; same historical commit; source `56cd224e…`; dirty true; migration/backup/health/smoke/deployment passed; operationallyAccepted false.                               | Different behavior source from aggregate; loopback verification cannot establish LAN acceptance or candidate freeze.     |
| Stage 9 native Excel record                               | Historical native golden and user-observed downloaded workbook; renderer `stage9-exceljs-2`.                                                                                                  | Scoped to exact recorded artifact. No new candidate native-open result inferred from parser tests or unchanged renderer. |

Historical runtime-image findings remain in [Stage 10 security](stage10-security.md): gateway
0 critical/2 high, PostgreSQL 4/21, backup 3/5 on 2026-08-13; these are historical counts,
not current findings or clean evidence. A fresh exact-image assessment and disposition remain required.
No external image inventory/SBOM upload has been performed during preparation.

## Current implementation verification

Command results, UTC times and final source/artifact identities are recorded here after execution.
Unexecuted checks remain pending; a failed attempt is never counted as a successful result.

The user selected local TEST preparation on this computer; no separate TEST server is available.
The existing normal stack and unrelated `wfc-*` containers were running after Docker startup.
Checks preserve normal persistent data and unrelated services. The local TEST uses the existing
guarded loopback mode, with `operationallyAccepted:false`, and is kept available for inspection.

Three early aggregate attempts stopped before runtime gates: one lint control-character-regex
rule and two optional-field TypeScript boundaries. The validator now checks character codes
without changing its rejection behavior. Controlled fixture canonical hashing retains its
original algorithm and assertions, with explicit JSON type boundaries for optional metadata.
Failed attempts are retained in `.artifacts/stage12/safe/stage10-attempt1/2/3.json` and their
diagnostic logs. They are not passed validation.

The fourth attempt ran at `2026-09-30T16:16:23.641Z`–`16:25:31.250Z` for source
`5127ad85…`. `validate:full` passed, including 602 unit tests, real PostgreSQL integration,
container/network hardening and disposable backup/restore checks. All six critical browser
journeys passed. `test:security` then failed on newly published dependency advisories;
performance and fixture commands had not run. The retained `stage10-attempt4.json` is
incomplete/failed and is not final-candidate success. The affected dependencies were patched;
the final source requires a new aggregate below.

The fifth attempt ran at `2026-09-30T17:54:24.559Z`–`18:20:43.468Z` for source
`ef5575ff…` and lockfile `3398c189…`. Full validation passed with 637 unit tests,
real DB/hardening/backup checks; all six browser journeys and both zero-advisory
package audits passed. Performance measurements passed with disposable cleanup.
The fixture gate failed because the added B09 lifecycle/build assertions changed
`project-flow.integration.test.ts` while its manifest source reference was old.
That one normalized executable-test reference is updated with the exact reason in
the reference change record. Thirty-five references across 32 files then matched.
No expected quantity or golden was regenerated. Attempt 5 remains failed, and its
gateway graph is superseded by the subsequent gRPC/OpenTelemetry security fixes.

Only the normalized source-file references for the unchanged varied-input property assertions
were refreshed in the Stage 10 manifest. [The exact old/new record](stage12-reference-change.json)
states the reason. BigInt references, five seeds, 350 examples, scenarios, expected quantities,
warning multisets and golden workbook bytes are unchanged. Human domain review remains pending
for the new manifest identity; no golden generator was run. All TypeScript projects then passed.

Initial `corepack pnpm install --frozen-lockfile` exited 0, already up to date with pnpm 11.21.0.
An optional update-metadata lookup failed under restricted networking; pinned installation itself
completed. Sandbox Node/pnpm-bin startup attempts failed (`tsx`/`prettier` unavailable and Node
userInfo failure); the same existing tooling ran successfully outside the restricted shell.
`npm_config_verify_deps_before_run=false` is used after that frozen installation, as documented.

Docker initially had no running Linux engine. Docker Desktop was started locally with approval;
the subsequent read-only version check returned Docker 28.5.1. Normal/persistent data was not reset.

## Contracts, conflicts and scope

The obsolete 29-column Excel requirement is resolved by the existing explicit 26-column user
decision. All 15 original scenario IDs are preserved, with DAM and DAZ as two T09 executions.
The 13 short `S11-DEMO-` projects are separately mapped workflow examples; they do not meet
the exact 100 m, 6/8.5 m or 5% fixture specifications by name alone. The checklist retains
independent expected outcomes and labels synthetic resolved relationships separately from P0.

Role and revision verification uses the implemented policy: Designer owned scope, Reviewer
all-project reading/lifecycle with owner-only draft mutations, Administrator administration/
all-project mutation, Viewer read-only existing-export downloads. Save creates immutable
numbered snapshots; draft recalculation does not. Validation/approval blockers apply to every role.
New work uses Create project/draft/save; there is no general project clone operation.

Retained historical revision v2 stores project, input and result, engine/catalog/rule versions,
content hashes and checksums, without application build identity. Stage 12 fixes that programming
gap for new calculations: optional `invocation.applicationBuild` captures the actual backend build
at Calculate and survives save/reload/export under the existing immutable checksums. The UI shows
the original captured build or explicitly states that legacy provenance is unavailable. Existing
JSON storage is reused; no migration or historical backfill. Source fingerprint is not invented
when runtime lacks it. Deployment records separately bind observed source and immutable images;
image identities are not falsely attributed to historical calculations. S12-B09 has focused
implementation coverage; final aggregate and local TEST probe evidence are recorded below.

The final focused B08/B09 rerun passed 47 tests across ten files at
`2026-09-30T16:56:43Z`, with format, lint and workspace/test typechecks passed. Input checksum
and its transitive revision checksum bind the captured application build. The separate snapshot
checksum binds project/catalog/rule data. Added PostgreSQL lifecycle assertions verify the
stored build remains original through Checked/Approved and later draft mutations.

Source-backed P0 has unresolved fitting/connector/endpoint/assembly relations. Omission and
approval-blocking warnings remain correct safety behavior; mandatory unfulfilled material
capabilities remain S12-B07. A programming propagation gap was corrected: optional `sourceFacts`
now carries actually stored, verified-source NSA indoor-only/concrete facts, DAM/DAZ ETA/DoP
and engineering notes into current editor selections and new immutable inputs. Selected anchors
and saved-revision views display those facts; existing Excel details serialization retains them.
Four focused test files/22 tests passed at `2026-09-30T16:01:42Z`; an earlier module-import failure
was corrected and is not accepted evidence. Old snapshots omit these optional fields and are
not backfilled; engine formulas and warning multiplicities are unchanged. No accepted input
field models indoor/outdoor, so an automatic outdoor denial cannot be claimed. S12-B08 still
requires domain scope disposition. No product facts or synthetic compatibility were promoted.

Excel automated checks cover exact saved quantities, 26 columns/three English sheets,
packaging/order/spare distinctions, literal text, blank P/Q, warnings and immutable historical
bytes. Candidate native Excel version, observer/date, workbook hash, no-repair and visual checks
remain pending. Proposed performance budgets have measured historical success but no domain
approval; the documented 43-second scheduled polling/45-second budget limitation is retained.

The installed Microsoft Excel app was observed through the Computer Use app inventory. Its
launch was rejected by automatic approval review with `Computer Use was not approved to use
Excel`. No workbook was opened through that attempt, and no alternative automation was used
to bypass the denial. Native candidate observation therefore remains pending despite Excel
being installed; parser checks cannot be substituted for it.

## Safety and acceptance limits

No commit, push, merge, runner registration, firewall change or real server deployment is part
of these observations. No human signatures, engineering approvals or completed UAT were invented.
Passwords/cookies/tokens, raw browser state, workbook contents and dumps stay outside this package.
The [register](stage12-defects.md) distinguishes carried blockers from historical verified fixes.
See [the protocol](stage12-go-no-go.md) for accountable roles and exact reconsideration evidence.
