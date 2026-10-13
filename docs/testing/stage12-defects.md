# Stage 12 central defect and entry-blocker register

Current admission outcome: **NO-GO**. This register carries Stage 10/11 acceptance blockers and
records source-inspected scope gaps. No new executed product failure, human signature or severity
downgrade is inferred. Candidate identity and exact evidence availability are in
[stage12-baseline.json](stage12-baseline.json) and [stage12-evidence.md](stage12-evidence.md).
Use [DEFECT_TEMPLATE.md](DEFECT_TEMPLATE.md) for actual observations and retests.

All entries below are **entry blockers**, severity **null (not an asserted Severity 1–4 product
defect)**, issue status **open**, reviewer/assigned human **null**, fix reference **null**, retest
result/evidence **pending**, release impact **blocks UAT entry**. Responsible roles are accountable
roles, not fabricated assignments/signatures. An explicitly recorded focused implementation fix
below overrides the default null fix/retest fields without closing its remaining entry criterion.
Criteria use `pending`/`blocked`; closed defects
require attributable disposition and exact-candidate retest. Historical passing evidence does not
close current identity/evidence gaps.

## S12-B01 — successful required remote CI

- Baseline/scenario: candidate application SHA in baseline; all T01–T15 and Stage 10 dependency gate.
- Expected: completed successful remote Stage 10 validation for that exact main candidate on the
  required dedicated runner/event with source-bound aggregate artifacts.
- Actual: tracked documents report local aggregate success and pending remote CI. Prompt-time
  cancelled run and skipped Stage 11 run are not success; current inspection is recorded separately
  in Stage 12 evidence. No current matching accepted remote run is supplied by this register.
- Reproduction/evidence: inspect [Stage 10 CI](stage10-ci.md), [Stage 11 evidence](stage11-evidence.md),
  then compare actual Actions run conclusion/SHA/workflow/runner with candidate via existing gate.
  Do not treat a workflow file, queued/skipped/cancelled run or local `ci:null` as success.
- Responsible role: technical owner/CI operator. Criterion: pending.
- Next action/retest/disposition: run authorized configured remote workflow; attach exact successful
  run URL and matching reports, then reviewer verifies identity. Runner registration is a separately
  authorized operation. Retest reviewer: null; release impact: blocks UAT entry.

## S12-B02 — exact runtime-image security disposition

- Baseline/scenario: immutable deployed backend/frontend/gateway/database image digests; security gate.
- Expected: current image assessment and authorized disposition for those exact identities.
- Actual: Stage 10 source/package audits do not establish current runtime-image acceptance;
  historical August critical/high findings stay visible. No replacement clean-image claim is made.
- Reproduction/evidence: [Stage 10 security](stage10-security.md), [defects](stage10-defects.md);
  compare actual assessment, scanner/time and disposition with deployed digests.
- Responsible role: security reviewer and technical owner. Criterion: pending.
- Next action/retest/disposition: use an approved scanner/method, record exact image results and
  attributable disposition. Prior external scan automatic-approval rejection is historical context;
  do not bypass it or infer isolation reduces severity. Retest/reviewer pending/null; blocks entry.

## S12-B03 — exact domain and performance approval

- Baseline/scenario: all 15 scenario identities, **both T09-DAM and T09-DAZ**, independent expected
  hashes, retained golden/source dependencies and performance budgets.
- Expected: identified authorized domain reviewer approves exact candidate/inputs/results/evidence
  and proposed budgets, preserving catalog/project/engineering distinctions.
- Actual: [manifest](stage10-regression-manifest.json), [review package](stage10-regression-review.md),
  [performance](stage10-performance.md) and tracked [acceptance template](stage10-acceptance.json)
  still state pending approval. Automated passing quantities and demo approval are not signatures.
- Reproduction: inspect each scenario `reviewStatus`, input/expected hashes, budget status and actual
  operator sign-off through its existing safe mechanism; compare exact identities to baseline.
- Responsible role: product owner/domain reviewer. Criterion: pending.
- Next action/retest/disposition: review independent derivations/source limitations and budgets;
  record genuine reviewer/date/evidence/candidate. Any changed expectations need impact review and
  affected retained retests. Reviewer null, fix null, retest pending; blocks entry.

## S12-B04 — accepted TEST deployment and operational identity

- Baseline/scenario: intended LAN deployment; OP-01/02 and T14; actual URL/build/images/migrations/active data.
- Expected: successful gated exact-candidate deployment, reachable actual TEST URL, smoke, four role
  accounts, verified forward migration history and active import validation without critical errors.
- Actual: [Stage 11 evidence](stage11-evidence.md) describes loopback implementation verification
  with `operationallyAccepted:false`; it does not certify accepted LAN deployment. URL placeholders
  and historical P0 hashes do not establish current operational identity.
- Reproduction: compare safe operator deployment/build/acceptance and smoke records, authenticated
  system information and preflight/status against baseline using [TEST operations](TEST_ENVIRONMENT.md).
- Responsible role: TEST operator/technical owner, catalog steward for import evidence. Criterion: blocked.
- Next action/retest/disposition: clear Stage 10 gates, perform authorized gated deployment and
  capture exact URL/digests/source/build/migrations/active IDs/hashes/import/smoke/account evidence.
  Keep local-only verification separate. Retest/reviewer pending/null; blocks entry.

## S12-B05 — candidate-specific TEST restore verification

- Baseline/scenario: candidate operational TEST protected graph and active/migration identities; OP-03.
- Expected: actual TEST archive/evidence checksum, matching protected graph fingerprints, successful
  disposable restore/migration/privilege comparison and cleanup for the accepted candidate.
- Actual: historical Stage 11 local restore passed for its recorded source/archive. Reuse requires
  exact matching candidate/deployment/data identities and available sanitized evidence; it cannot
  prove another deployment's recoverability.
- Reproduction/evidence: compare archive sidecar and safe restore verification to baseline using
  [TEST_BACKUP_RESTORE.md](TEST_BACKUP_RESTORE.md); checksum alone is insufficient.
- Responsible role: TEST operator. Criterion: pending.
- Next action/retest/disposition: run existing authorized `test-env:backup`/`test-env:verify-restore`
  in quiet operational scope after accepted deployment. Attach sanitized successful identity and
  cleanup reference, never dump/secrets. Do not restore live TEST. Retest/reviewer pending/null; blocks entry.

## S12-B06 — current scoped native Excel observation

- Baseline/scenario: T15 saved revision/export context and exact raw workbook SHA-256.
- Expected: independent parser/OOXML/snapshot reconciliation plus attributable native Excel open
  without repair, readable sheets/print, exact hash, version/build, observer/time and scope review.
- Actual: historical [Stage 9 observation](../exports/stage9-evidence.md) applies to downloaded
  hash `336fa04d084c245a6182dd61f6ffb31c322d502da7493e9fdcc423128ee1d3d2` and renderer
  `stage9-exceljs-2`. Parser/browser pass and unchanged renderer name alone do not supply new native evidence.
- Reproduction: compare candidate export dependencies/semantics and exact artifact/context against
  recorded scope; inspect actual downloaded workbook through native Excel or document justified reuse.
- Responsible role: domain/export reviewer and native Excel observer. Criterion: pending.
- Next action/retest/disposition: record real candidate artifact no-repair/visual observation or
  attributable scope-valid reuse review; repeat native check if workbook semantics changed.
  Keep workbook/screenshots controlled. Fix null; retest/reviewer pending/null; blocks entry.

## S12-B07: unresolved required material capabilities

- Baseline/scenario: source-backed active P0; T01 joints and T05–T08 fitting/physical/endpoint materials,
  plus assembly compatibility where unresolved.
- Expected: original mandatory scenarios use confirmed compatible materials/quantities, or a genuine
  documented authorized MVP scope change. Unresolved combinations still omit unsupported material
  and visibly block approval.
- Actual: [Stage 11 limitations](stage11-evidence.md) and
  [`stage11-demo-projects.ts`](../../apps/backend/src/stage11-demo-projects.ts) retain null physical/
  tee material, unselected bend and cap/equipment selections. Stage 10 resolved `NX` fixtures prove
  algorithm contracts, not Niedax compatibility. Warning correctness alone does not fulfill
  required real-material capability.
- Reproduction: inspect source-backed demo inputs and active catalog rules; calculate newly created
  working copies through supported UI when available; compare omitted materials/warnings with
  [UAT T05–T08](UAT_CHECKLIST.md). Exact observed current warnings remain pending until execution.
- Responsible role: catalog steward and product owner/domain reviewer. Criterion: blocked.
- Next action/retest/disposition: supply verified source-backed relationships in a new audited
  catalog/rule version and retest affected scenarios, or record authorized scope change and impact.
  Never import synthetic allow lists/connectors or suppress warnings. Fix null; retest/reviewer
  pending/null; blocks entry while mandatory capability remains unresolved.

## S12-B08 — NSA indoor-only accepted-contract scope

- Baseline/scenario: T10; NSA exact product/source, concrete restrictions and engineering context.
- Expected: indoor-only/concrete limits understandable and preserved; invalid known conditions
  rejected/omitted with blocker; no environmental suitability falsely inferred.
- Actual: source P0 `products.csv` records NSA `indoor_only=true`; Stage 10 test plan/review documents
  no project indoor/outdoor field. The engine's missing/unknown/denied substrate checks cannot
  demonstrate rejection of an outdoor condition that cannot be entered. Source inspection initially
  found that strict editor/product snapshots and catalog hydration omitted the explicit restriction,
  ETA/DoP and engineering note. Stage 12 corrects that transmission/presentation gap for new verified
  anchor inputs through optional `sourceFacts`; existing snapshots remain byte-for-byte unchanged.
  Current deployed human T10 propagation/interpretation has not yet been observed.
- Reproduction/evidence: inspect [Stage 10 plan](stage10-test-plan.md),
  [review](stage10-regression-review.md),
  [P0 products](../../catalogue/imports/niedax-p0-2022/products.csv) and actual T10 UI/snapshot/export
  source/engineering warnings. Native/current observation remains pending.
- Responsible role: domain reviewer/product owner with technical owner. Criterion: pending.
- Programming fix reference: [optional product contract](../../packages/domain/src/schemas/v2/calculation.ts),
  [editor contract](../../packages/domain/src/schemas/v2/project-transport.ts),
  [source hydration](../../apps/backend/src/project-service.ts),
  [catalog query](../../apps/backend/src/project-repository.ts),
  [anchor facts view](../../apps/frontend/src/app/anchor-source-facts.tsx) and saved-revision view.
  No formulas, migrations, environmental selection field or existing fixture/golden bytes changed.
- Focused implementation retest: domain build passed; four focused files/22 tests passed without
  skips or module errors, captured at `2026-09-30T16:01:42Z`. Contract tests preserve absent legacy
  fields, hydration checks NSA/DAM/DAZ plus unverified-source omission, BG/EN display shows exact
  restrictions and lack of environmental context, and generated Excel preserves detached saved
  facts/unchanged quantities/literal cells. Initial frontend module failure was fixed by relative
  imports before the successful rerun. Full candidate/operational retests remain in Stage 12 evidence;
  human retest/domain reviewer remains null.
- Next action/retest/disposition: verify source-bound current candidate and actual TEST selection,
  saved revision and export; obtain domain decision whether preserved explicit restriction and
  engineering review satisfy T10 or require a versioned environmental-context contract. Repeat native
  Excel review for new workbook semantics. Do not claim outdoor rejection or invent suitability.
  Entry criterion remains pending and blocks admission until operational/domain scope is disposed.

## S12-B09 — saved revision application-build traceability

- Baseline/scenario: original entry criterion 9; T13/T14/T15 saved v2 identity.
- Expected: visible/preserved application build, catalog and calculation-rule identities; no invented
  stored revision metadata. Original plan requests build/catalog/rule versions recorded in revision.
- Original source-inspected gap: strict
  [`ProjectRevisionSnapshotV2Schema`](../../packages/domain/src/schemas/v2/revision-transport.ts)
  stores project, calculation input and calculation result. Engine and catalog/rule identities/checksums
  are present in their defined fields; application version/Git SHA/build timestamp are supplied by
  system information/deployment records and are not persisted in that revision snapshot.
  [`loadStoredDetail`](../../apps/backend/src/revision-repository.ts) reconstructs the same fields.
- Reproduction of the original gap: read schema and reconstruction; compare actual selected revision response to
  authenticated system information/deployment build. Displaying a current build does not prove the
  historical revision's build. Runtime observation remains pending.
- Responsible role: technical owner. Programming status: fixed; final current-candidate retest pending.
- Fix: optional, strict `calculationInput.invocation.applicationBuild` records the backend's actual
  application version, configured Git SHA, build timestamp and environment at **Calculate**, before
  saving. The corresponding calculation run exposes the same captured value. The existing input
  checksum and its transitive revision checksum protect the captured build metadata. The separate
  snapshot checksum covers project/catalog/rule data. Save/replay/reload never replace the build
  with the current server's identity. Source fingerprint is absent unless actually supplied by
  runtime configuration. The normal server and fresh TEST demo seed pass actual runtime build data.
- Fix references: [calculation contract](../../packages/domain/src/schemas/v2/calculation.ts),
  [calculation transport](../../packages/domain/src/schemas/v2/project-transport.ts),
  [application capture](../../apps/backend/src/project-service.ts),
  [stored calculation reload](../../apps/backend/src/project-repository.ts),
  [server](../../apps/backend/src/server.ts),
  [build view](../../apps/frontend/src/app/calculation-build-provenance.tsx) and saved-revision view.
  Storage reuses existing JSON fields; no SQL migration, formulas or historical backfill.
- Focused retest: ten files/47 tests passed at `2026-09-30T16:56:43Z`, including new/legacy save and replay, two different
  calculation builds, immutable checksums, unchanged engine quantities and exact Details export.
  Workspace typecheck passed. Final aggregate and actual local TEST save/download evidence will
  determine verified status; no focused result is substituted for a deployment observation.
- Next action/retest/disposition: verify a fresh local candidate calculation/save/export against
  authenticated system information and retain its immutable checksums and workbook hash. Retain
  old snapshots and old exports unchanged, with explicit unavailable-build labeling in the UI.
  Human UAT review/signatures remain separate; no original historical build is inferred.

## S12-B10 — genuine formal entry signatures

- Baseline/scenario: entire candidate/evidence digest and freeze; all mandatory entry criteria.
- Expected: product owner/domain reviewer and technical owner record name, role, UTC/date, exact
  candidate/evidence identity, decision, reviewed evidence, source of signature and permitted
  non-blocking limitations. GO requires all mandatory criteria pass for the same frozen candidate.
- Actual: this package creates no signatures; decisions/unknown identity fields remain pending/null.
  Automated tests, application Reviewer role and demo approval cannot sign this protocol.
- Reproduction/evidence: inspect [stage12-go-no-go.md](stage12-go-no-go.md) and criterion outcomes.
- Responsible role: product owner/domain reviewer and technical owner. Criterion: blocked.
- Next action/retest/disposition: review complete package and actually sign GO only after all
  mandatory blockers clear; signed NO-GO is a valid completed decision but does not admit UAT.
  Preserve actual signature provenance. Fix null; retest/reviewer pending/null; blocks entry.

## Historical Stage 10 fixes and remaining risk

[Stage 10 register](stage10-defects.md) remains authoritative for original reproduction, fixes
and retest scope. S10-D01 insecure-LAN UUID flow and S10-D02 manual catalog persistence are
**fixed and verified for recorded historical source**. S10-D03 dependency advisories have recorded
package fixes/final full retest; runtime images remain S12-B02. S10-D04–D10 retain their documented
fixed/tooling/fixture/control status and evidence; do not relabel all as newly verified for this
candidate. Current verification claims belong in Stage 12 evidence.

The proposed 45 s large-export budget versus eight fast UI polls across about 43 s remains an
existing bounded refresh/workflow limitation, not an observed new candidate failure. Preserve
the [performance review](stage10-performance.md) and owner review under S12-B03; no budget or
timeout is silently relaxed. A workaround cannot waive domain/performance approval or another
mandatory criterion. No open newly reproduced Severity 1/2 product defect is claimed by this
documentation-only inspection; the open mandatory blockers above independently prohibit GO.

Source review was captured at `2026-09-30T15:45:40Z` against authoring checkout HEAD
`3883afddabae42d5a637faea71167e682982f591`. This is an inspected source reference, not an accepted
deployed baseline or a defect execution time. For every open entry, actual deployment identity,
execution time, domain/security review time, fix reference, retest time and human reviewer remain
null/pending until attributable evidence is attached. Later source changes require reinspection
of any affected gap before this reference can be reused.

For any fix or newly observed issue, add a complete report with exact candidate/scenario,
expected/actual, reproduction, safe evidence/correlation ID, responsible role, status, fix reference,
retest result, reviewer and release impact. Preserve history and distinguish `fixed` from
`fixed and verified`. An attributable disposition updates the acceptance/decision/baseline evidence
together; no documentation edit alone closes an external approval or operational check.
