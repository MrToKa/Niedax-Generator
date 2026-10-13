# Stage 12 internal UAT checklist

Status: **prepared; execution pending; domain review pending; UAT entry NO-GO**.
This document specifies checks. It records no completed human UAT, native Excel observation,
engineering approval or permission to enter UAT. The candidate and entry evidence are in
[the acceptance package](STAGE12_ACCEPTANCE.md), [baseline](stage12-baseline.json),
[decision protocol](stage12-go-no-go.md) and [evidence](stage12-evidence.md).

Authority: Section 12, T01–T15, entry criteria and change control in
[`Niedax_Implementation_Plan_to_Test_Phase_BG.docx`](../../Niedax_Implementation_Plan_to_Test_Phase_BG.docx),
read without changing it. The approved [Stage 9 decision](../exports/stage9-decisions.md)
supersedes its 29-column `List1`: T15 uses 26 columns A:Z on `Change Order`, plus
`Calculation details` and `Warnings`. [Tester guide](TESTER_GUIDE.md) supplies login/reporting;
[defect template](DEFECT_TEMPLATE.md) and [central register](stage12-defects.md) supply triage.

## Entry and safe execution

Before an admitted UAT session, the technical owner and operator attach accepted deployment
evidence and the product owner/domain reviewer approve exact expectations. Technical verification
before GO is permitted in its documented scope, but it is not an admitted UAT session.

| Check | Prerequisite and procedure                                                                                                                                                                                                 | Evidence required                                                                                                                                                                                           | Current status / owner                 |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| OP-01 | Operator verifies the exact candidate on the intended LAN TEST URL through existing `test-env:preflight`, `test-env:status` and `test-env:smoke`. Observe TEST badge, system information and all four enabled role logins. | Actual URL, UTC time, deployed SHA/source/build, immutable image digests, successful gated deployment/CI references and safe smoke result; loopback `--local-verification` is implementation evidence only. | pending / TEST operator                |
| OP-02 | Compare active catalog/rule ID, version and content hash from authenticated system information against deployment and baseline. Review matching import validation and deployment migration verification.                   | No critical import errors, actual active IDs/hashes, verified migration-history identity; manifest versions alone are insufficient.                                                                         | pending / catalog steward and operator |
| OP-03 | Operator uses existing TEST backup and disposable restore-verification runbook for the candidate.                                                                                                                          | Matching TEST archive checksum/evidence, protected graph fingerprints, successful restore/privilege/migration checks and cleanup; no dump is attached.                                                      | pending / TEST operator                |
| OP-04 | Verify source-bound Stage 10 unit/integration/browser/security/performance evidence, required successful remote CI and exact runtime-image security disposition.                                                           | Matching source/artifact hashes and attributable image/domain/performance reviews.                                                                                                                          | pending / technical and domain owners  |
| OP-05 | Review every open blocker and required human sign-off. Freeze only an accepted deployed candidate with matching evidence.                                                                                                  | Zero unresolved mandatory/high-risk blockers or Severity 1/2 defects; genuine product/domain and technical signatures for candidate/evidence digest.                                                        | blocked / product and technical owners |

Use private operator-issued TEST credentials. Create new, uniquely coded projects through
**Create project**; copy the documented geometry/settings into the new draft. The supported
**Duplicate route** action copies a route inside a draft; this checklist does not assume a
whole-project clone or historical-revision restore UI. A new draft receives its own project/route
identities, so record its actual input fingerprint. Save a named working revision when needed.
Never overwrite seeded draft baselines or mutate saved revisions. Draft autosave and Calculate
must leave revision count unchanged until **Save revision**.

Run catalog activation, denied compatibility, disabled-account/session-revocation, transaction
rollback and concurrency negatives only in guarded disposable environments through retained tests.
Do not activate/archive a live TEST catalog, disable real tester accounts, reset persistent data
or issue unguarded database/Compose commands. A disposable test records its own source/environment
identity and supplements accepted TEST evidence.

## Fixture identity and independent expectations

T01–T12 use [`stage10Scenarios`](../../packages/calculation-engine/tests/helpers/stage10-scenarios.ts)
and [`stage10-fixtures.ts`](../../packages/calculation-engine/tests/helpers/stage10-fixtures.ts),
catalog/rules `stage10-synthetic-v1`. Their literal expectations are
[`stage10-expected.json`](../../packages/calculation-engine/tests/fixtures/stage10-expected.json)
with independent derivations in [the review package](stage10-regression-review.md).
The [manifest](stage10-regression-manifest.json) is authoritative for complete hashes,
`baselines`, `fixtureDependencies`, `scenarios[id].inputs[key]`, retained golden pairs and exact
executable test names. Before execution compare these hashes to the candidate baseline; retain
the selected manifest/expectation digest in the result record. No expectation is generated from
the engine under test or refreshed to match a failure.

For each focused case, the fixture identity below is the exact function key and the manifest
selector `scenarios[id].inputs[key]`, containing `canonicalInputSha256` and
`canonicalExpectedSha256`. It also binds the source fixture byte identity via
`baselines[id=stage10-focused-independent-references]`. Text uses UTF-8 normalized LF SHA-256;
scenario/expected objects use existing engine canonical JSON, sorted object keys with array order
preserved. Repeated-digit snapshot hashes in synthetic inputs are contract placeholders, not
catalog/rule integrity evidence. Production input fingerprints, IDs and hashes must be captured
separately from the actual running application.

Common focused input unless changed below: explicit 6,000 mm supply; one 6 m route; 1.5 m support
spacing; concrete substrate; two anchors per support; WSTB two per support; zero reserve;
piece packages of one. `NX ...` products, compatible relations, joints, templates and port counts
are synthetic, even where a rule says `catalogConfirmed`. Cited real P0 product codes/packages
retain their sources; the surrounding resolved assembly/compatibility is still synthetic.
UI work uses source-backed active P0 facts and synthetic geometry. It cannot claim the focused
synthetic BOM unless separately provisioned through the existing guarded test fixture mechanism.
If a mandatory P0 material combination remains unresolved, verify omission/warning/approval block
and retain [S12-B07](stage12-defects.md#s12-b07-unresolved-required-material-capabilities).

All following quantities are independently specified **technical → ordered**. Length is metres;
other quantities are pieces. The complete literal warning multiset is in `stage10-expected.json`.
Common warnings are `MISSING_CABLE_LOAD` and `ANCHOR_ENGINEERING_CHECK_REQUIRED`, plus
`WSTB_PROJECT_RULE_UNCONFIRMED` when selected. Review-required engineering warnings remain visible
even when `approvalReady=true`; that flag supplies no structural suitability or human acceptance.

Retained checks are invoked from the repository root as appropriate to the evidence gap:

```powershell
corepack pnpm --filter @niedax/calculation-engine test
corepack pnpm db:check
corepack pnpm test:e2e
corepack pnpm --filter @niedax/export test
corepack pnpm test:stage11
```

The engine/export commands verify retained automated expectations. `db:check` runs guarded fresh
database cycles; `test:e2e` owns guarded disposable Caddy/browser setup and cleanup. They do not
admit UAT. Reuse current matching aggregate evidence instead of duplicating it; obtain any missing
aggregate using `corepack pnpm validate:stage10` only when authorized prerequisites are available.

## T01 — KL 60, 100 m, explicit 6 m supply

- Prerequisites/role: common focused fixture and approved independent expectations; Designer owns
  a fresh project; Reviewer observes warnings/history. UI P0 equivalence requires confirmed rules.
- Exact input/provenance: `stage10Scenarios.T01`, manifest `T01/inputs[T01]`; single 100 m segment,
  `KL 60.203`, `KLTB 6`, `DAM 6X5`, WSTB absent. KL KR 340, KLTB KR 355 and DAM page 156 are P0
  facts; connector/support assignment is synthetic.
- Steps: select explicit 6 m supply, Calculate, inspect section detail, internal joints, supports,
  anchors, warnings and each final trace; Save a working revision and compare saved result.
  Execute the retained unresolved-joint variant in the engine suite.
- Independent expected: 17 sections, 102 m technical/ordered, 2 m unused capacity; `NX JOINT` 16→16;
  `KLTB 6` 68→100; `DAM 6X5` 136→150; no WSTB line. Final trace `BOM.FINALIZE.V1` equals order
  quantity. Unresolved joint mapping emits its blocking warning and omits a guessed connector.
- Actual: pending. Evidence: pending (fingerprint/revision/checksums/trace and safe warning record).
  Defects: pending observation; linked scope blocker S12-B07. Execution: pending. Domain review: pending.

## T02 — WSL 105, 100 m, WSTB=2

- Prerequisites/role: common fixture; Designer owns new project; domain reviewer assesses project rule.
- Exact input/provenance: `stage10Scenarios.T02`, manifest `T02/inputs[T02]`; 100 m,
  `WSL 105.200` KR 426 and `WSTB 2` KR 449, explicit 6 m; two WSTB per support is a project rule.
- Steps: Calculate at 1.5 m spacing and WSTB two; expand rule/trace/warnings. In a separate working
  draft change WSTB configuration, recalculate, compare the explicit changed input and save if needed.
- Independent expected for original fixture: straight 102→102 m; joints 16→16; supports 68→68;
  anchors 136→136; WSTB 136→150. Dedicated WSTB provenance remains `projectRule`, with
  `WSTB_PROJECT_RULE_UNCONFIRMED`; package 50 does not become the technical demand.
- Actual: pending. Evidence: pending (original and changed input fingerprints, rule trace, warnings).
  Defects: pending observation. Execution: pending. Domain review: pending.

## T03 — separate exact 6 m and 8.5 m segments

- Prerequisites/role: common fixture; Designer; retained boundary cases in engine suite.
- Exact input/provenance: `stage10Scenarios.T03`, manifest `T03/inputs[T03]`; one route with two
  separate straight geometry entries, lengths 6 and 8.5 m. Entire resolved `NX` data is synthetic.
- Steps: preserve both entries, choose 6 m supply explicitly, Calculate and inspect each rounding
  contribution; run retained immediate-below/equal/above 3 m and 6 m decimal boundary tests.
- Independent expected: sections 1+2, straight 18→18 m (3.5 m unused); joints 2→2 for the single
  run, supports 11→11 over 14.5 m, anchors 22→22, WSTB 22→22. Do not round the combined 14.5 m
  instead of each segment. Boundary tests preserve 18-decimal precision and explicit supply choice.
- Actual: pending. Evidence: pending (per-segment trace and source-bound boundary test report).
  Defects: pending observation. Execution: pending. Domain review: pending.

## T04 — two named routes and logical continuation

- Prerequisites/role: common fixture; Designer; two unique route codes and endpoint identities.
- Exact input/provenance: `stage10Scenarios.T04`, manifest `T04/inputs[T04]`; two named 6 m routes,
  one logical continuation, shared supports, no physical break. Resolved `NX` rules are synthetic.
- Steps: create distinct routes, connect end A to start B once, Calculate; inspect joint/support
  ownership. In a working copy remove continuation and compare; run mismatch/reject retained cases.
- Independent expected: straight 12→12 m; one joint 1→1; shared supports 9→9, anchors 18→18,
  WSTB 18→18; connection adds no separate material. Unconnected runs each have five supports,
  total ten; mismatched settings separate groups or follow explicit reject policy without duplicate
  endpoint ownership. Retained combined golden uses different geometry and is not this quantity oracle.
- Actual: pending. Evidence: pending (routes/participant IDs, group/ownership trace and comparisons).
  Defects: pending observation. Execution: pending. Domain review: pending.

## T05 — physical joint and included fasteners

- Prerequisites/role: common resolved fixture for successful-material path; Designer/Reviewer;
  source-backed unresolved path must also be reviewed.
- Exact input/provenance: `stage10Scenarios.T05`, manifest `T05/inputs[T05]`; two 6 m routes,
  one physical splice with two ports, separate support groups; `NX CONNECTOR` includes two fasteners
  per parent. All connector/fastener relations are synthetic.
- Steps: Calculate the physical event, expand included items and trace, Save/export the result;
  inspect source-backed `S11-DEMO-PHYSICAL` read-only and record unresolved behavior separately.
- Independent expected for resolved fixture: straight 12→12 m; connectors 2→2; supports 10→10;
  anchors/WSTB each 20→20. Four fasteners are informational, with no additional order line and
  no internal joint within either one-section run. P0 unresolved material is omitted with a blocker,
  never replaced by `NX` products. Mandatory source-backed material fulfillment remains S12-B07.
- Actual: pending. Evidence: pending (event/ports, included-item quantities, saved and Excel line IDs).
  Defects: pending observation; S12-B07. Execution: pending. Domain review: pending.

## T06 — horizontal bend and manual extra supports

- Prerequisites/role: common resolved fixture; Designer enters correction with reason; Reviewer sees trace.
- Exact input/provenance: `stage10Scenarios.T06`, manifest `T06/inputs[T06]`; 3.1 m and 2.9 m
  separated by one resolved bend, correction `manual-bend-supports`: original six plus additional two,
  source `bend-0`, reason `Synthetic Stage 10 review reason: manual-bend-supports`. `NX` relations synthetic.
- Steps: Calculate with fitting/support correction; inspect fitting ports, base/resolved/manual
  support contributions, input reason and trace; save revision. Compare unselected P0 demo bend
  warnings separately; no live compatibility data is filled to force it to succeed.
- Independent expected: straight 12→12 m; bend 1→1; connectors 2→2; supports 8→8 = five base +
  one fitting + two manual; anchors/WSTB 16→16. `MANUAL_EXTRA_SUPPORT` and override reference persist.
  Reason prose belongs to immutable input; trace retains original/additional values.
- Actual: pending. Evidence: pending (correction identity/reason, trace and saved input checksum).
  Defects: pending observation; S12-B07. Execution: pending. Domain review: pending.

## T07 — three-port T connection

- Prerequisites/role: common resolved fixture; Designer; negative participant/mapping tests disposable.
- Exact input/provenance: `stage10Scenarios.T07`, manifest `T07/inputs[T07]`; three named 6 m routes,
  one tee event, three distinct endpoints, separate supports, resolved synthetic three-port connector rule.
- Steps: connect each participant once, Calculate and inspect the single physical owner; execute
  retained duplicate/nonexistent participant and missing compatible mapping cases; inspect P0 tee warnings.
- Independent expected: straight 18→18 m; connectors 3→3; supports 15→15; anchors/WSTB 30→30;
  six included fasteners informational. Duplicate/nonexistent participants are rejected; missing
  material rule omits connectors and blocks approval. A successful unresolved warning check does
  not fulfill the required source-backed connector capability (S12-B07).
- Actual: pending. Evidence: pending (participant IDs, owner/port trace and rejection/warning record).
  Defects: pending observation; S12-B07. Execution: pending. Domain review: pending.

## T08 — cap and equipment endpoints

- Prerequisites/role: common fixture with known synthetic cap rule; Designer/Reviewer.
- Exact input/provenance: `stage10Scenarios.T08`, manifest `T08/inputs[T08]`; one 6 m route,
  start cap with `rule-endcap-a`, equipment end without a proven material rule. Relations synthetic.
- Steps: Calculate and inspect each endpoint source; attempt Check then Approve as permitted;
  run retained connected-equipment-end variant to verify the physical connection owns materials.
- Independent expected: straight 6→6 m; supports 5→5; anchors/WSTB 10→10; cap 1→1;
  equipment adds no guessed product, `UNRESOLVED_ENDPOINT_MATERIAL` blocks approval and
  `approvalReady=false`. Connected endpoint defers to physical owner without duplicate materials.
  Real P0 cap/equipment fulfillment stays blocked where neither rule is confirmed.
- Actual: pending. Evidence: pending (endpoint rule/warning IDs and actual approval denial).
  Defects: pending observation; S12-B07. Execution: pending. Domain review: pending.

## T09 — DAM and DAZ in assembly templates

- Prerequisites/role: common fixture; Designer chooses exact anchor size; domain reviewer reviews ETA
  context. Execute **both** variants; one anchor or the generic ANCHOR demo cannot cover T09.
- Exact input/provenance: `stage10Scenarios["T09-DAM"]` and `["T09-DAZ"]`, manifest
  `T09/inputs[T09-DAM]` and `T09/inputs[T09-DAZ]`. One 6 m route; five supports, two anchors each.
  Exact P0 page 156 facts: `DAM 6X5` pack 50, ETA-18/0541; `DAZ 8X10` pack 50, ETA-18/0542.
  Template quantity/compatible assembly model is synthetic.
- Steps: create separately identified cases, Calculate each, inspect exact codes, template component
  quantity, package and engineering/source evidence; save separate revisions. Review ETA/source and
  installation requirements, without deriving load capacity or substituting sizes.
- Independent expected in each: straight 6→6 m; supports 5→5; WSTB 10→10;
  exact selected anchor 10→50 (one package), spare 40. Preserve
  `ANCHOR_ENGINEERING_CHECK_REQUIRED`; no suitability/structural sign-off inferred. DAM uses the
  documented selected pack-50 source conflict policy, not the conflicting older observation of 100.
- DAM actual: pending. Evidence: pending. Defects: pending observation. Execution: pending.
  Domain review: pending.
- DAZ actual: pending. Evidence: pending. Defects: pending observation. Execution: pending.
  Domain review: pending.

## T10 — NSA restrictions and engineering review

- Prerequisites/role: common resolved fixture; Designer; invalid substrate/compatibility cases disposable;
  domain owner assesses accepted indoor-only context scope (S12-B08).
- Exact input/provenance: `stage10Scenarios.T10`, manifest `T10/inputs[T10]`; `NSA 6X35/FKK-T30 V`,
  page 157, pack 100, ETA 15/0784, concrete substrate. P0 `indoor_only=true`; relations synthetic.
- Steps: Calculate concrete case; inspect exact anchor, source/indoor-only fact and engineering warning
  in selection, saved evidence and export. Run missing/unknown/denied substrate or compatibility
  variants in retained suite. Record whether an indoor-only restriction is explicitly understandable
  to a tester. The accepted contract has no outdoor/indoor input: do not invent an outdoor rejection.
- Independent expected resolved fixture: straight 6→6 m; supports 5→5; NSA 10→100;
  WSTB 10→10. Missing/unknown/denied context omits NSA and blocks approval; engineering review
  remains. Concrete compatibility and source restriction do not prove environmental suitability.
  The retained importer proves the P0 indoor-only fact in database storage. Stage 12 adds optional
  source-backed `sourceFacts` to new verified anchor editor/input snapshots: explicit indoor-only,
  catalog substrate, ETA/DoP, engineering note and exact source. Selection and saved-revision views
  display these facts; Excel details preserves them without changing quantities or formal warning
  multiplicities. Legacy saved snapshots remain unchanged and may lack this optional evidence.
  Verify actual candidate UI/save/export propagation separately. Enforceable environmental context
  remains S12-B08 until the domain scope is disposed; no outdoor rejection is inferred.
- Actual: pending. Evidence: pending (source restriction, substrate case/warnings and scope review).
  Defects: pending observation; S12-B08. Execution: pending. Domain review: pending.

## T11 — 5% reserve and packaging

- Prerequisites/role: common fixture with synthetic 24 m straight package; Designer/Reviewer.
- Exact input/provenance: `stage10Scenarios.T11`, manifest `T11/inputs[T11]`; 100 m segment,
  explicit 6 m sections, 5% reserve, four-section/24 m package. Package configuration synthetic.
- Steps: Calculate; expand section, reserve and package trace; save revision and check separate
  quantity fields in BOM, details and Excel. Do not use the ROUNDING demo's 7 m/10% expectation.
- Independent expected: straight technical 17 sections/102 m; reserved 18 sections/108 m;
  reserve-only 6 m; five packages/120 m ordered; packaging-only 12 m; total spare 18 m.
  Joints 16→17; supports 68→72; anchors/WSTB each 136→143. Trace distinguishes all six quantities.
- Actual: pending. Evidence: pending (exact reserve/package inputs, trace, saved and export quantities).
  Defects: pending observation. Execution: pending. Domain review: pending.

## T12 — manual catalog and free-text positions

- Prerequisites/role: common fixture with 5% reserve; Designer; independent manual identities retained.
- Exact input/provenance: `stage10Scenarios.T12`, manifest `T12/inputs[T12]`; catalog
  `NX MANUAL CATALOG` three pcs, reserve disabled, package ten; free text `stage10-manual` 2.5 m,
  project reserve, package rounding enabled. Synthetic choices; P0 UI counterpart uses actual code/ID.
- Steps: add both lines with explicit reasons/settings, Calculate and save; edit free text to 3.5 m
  and disable its packaging in a new draft; calculate/save a later revision, then remove only that
  manual item in another draft. Verify same-description different-ID/unit retained tests and S10-DB13.
- Independent expected original: straight 6→12 m; supports 5→6; anchors/WSTB 10→11;
  manual catalog 3→10, free text 2.5→3 m (reserved 2.625). Edited free text orders exactly 3.675 m
  with null package count. Removing it leaves the catalog/manual and automatic lines distinct.
  Both manual-input and manual-policy warning subjects persist: two each of
  `MANUAL_PACKAGE_OVERRIDE` and `MANUAL_QUANTITY_OVERRIDE`; IDs, unit, provenance and reasons survive save/export.
- Actual: pending. Evidence: pending (manual IDs, policies, successive fingerprints/revisions/export rows).
  Defects: pending observation. Execution: pending. Domain review: pending.

## T13 — immutable revision after catalog change

- Prerequisites/role: guarded disposable database; Designer owns project, Administrator exercises
  retained catalog lifecycle tests; Viewer compares old snapshot. The retained export acceptance
  harness uses explicitly privileged synthetic setup inside the disposable test, not a tester SQL
  operation or production import/activation action. No live TEST activation is permitted here.
- Exact input/provenance: manifest baseline `stage10-persisted-activation`, exact
  [`persisted-project-fixture.ts`](../../apps/backend/tests/persisted-project-fixture.ts) and
  [`stage10-postgres.integration.test.ts`](../../apps/backend/tests/stage10-postgres.integration.test.ts)
  hashes/test names; retained Stage 9 historical export case invoked by
  [`project-flow.integration.test.ts`](../../apps/backend/tests/project-flow.integration.test.ts),
  implemented in [`export-acceptance.ts`](../../apps/backend/tests/export-acceptance.ts).
  Synthetic acceptance catalog/rules; record actual IDs/version/hash, revision and export hashes.
- Steps: run guarded `corepack pnpm db:check` and inspect the matching source-bound report. Capture
  saved input/result/BOM/warning/trace/revision checksums and Excel artifact; create later draft
  and Calculate (S10-DB07). The Stage 9 export case substitutes distinct synthetic live version
  identities/project pins through its private fixture helper, then compares old revision/export.
  S10-DB10 independently exercises real catalog approval/activation services and rollback evidence;
  neither its rollback nor the privileged export substitution alone proves a complete human
  import→validate→activate→historical-export journey. Any required additional human catalog-change
  journey must use supported application services in a separately guarded disposable environment
  and retain its own identities/results.
- Independent expected: old input, rules, products, BOM, warnings, traces, checksums and ready workbook
  bytes unchanged; new active version not substituted into historical rendering. Recalculation alone
  creates no saved revision; a later explicit save gets the next positive number. New calculations
  preserve their original Calculate-time `invocation.applicationBuild` through save, replay and export.
  Historical snapshots without that optional metadata remain unchanged; the UI labels their original
  build unavailable. Never substitute the current server build or backfill an inferred historical build.
- Actual: pending. Evidence: pending (before/after identities, checksums, export hash, guarded cleanup).
  Defects: pending observation; S12-B09. Execution: pending. Domain review: pending.

## T14 — roles, approval and immutable history

- Prerequisites/role: Designer, Reviewer, Administrator and Viewer privately provisioned; two projects
  with distinct owners, one approval-ready synthetic revision and one saved blocking-warning revision.
  Account disable/revocation and rollback/concurrency checks are disposable.
- Exact input/provenance: manifest baseline `stage10-persisted-roles`; retained
  [`project-flow.integration.test.ts`](../../apps/backend/tests/project-flow.integration.test.ts),
  [`stage10-postgres.integration.test.ts`](../../apps/backend/tests/stage10-postgres.integration.test.ts)
  S10-DB01–06 and S10-DB11, and
  [`critical-workflows.spec.ts`](../../tests/e2e/critical-workflows.spec.ts) T14 journeys.
  Synthetic actors/material fixture is not human acceptance. Record actual project/revision/actor-role IDs.
- Steps: exercise UI controls and backend denials using retained tests and the matrix below; Calculate
  then Save; Reviewer Check latest Calculated, then Approve latest Checked where no blocker exists.
  Attempt Designer approval and blocking-revision approval; inspect status, author/date/comment/audit.
  Save a later revision, inspect earlier history, and run duplicate-key/concurrency/rollback coverage.
- Independent expected: `Calculated → Checked → Approved` only through permitted transitions;
  numbered immutable snapshots and append-only success/rejection evidence. Designer never approves;
  Reviewer/Admin still obey latest revision, validation and `blocksApproval`; Viewer cannot create
  exports but may download existing readable artifacts. Same-key same-request replays stable result;
  changed request conflicts; rollback leaves no partial mutation or revision numbering gap.
- Actual: pending. Evidence: pending (UI/action denials, safe codes/correlation IDs, audit/lifecycle and checksums).
  Defects: pending observation. Execution: pending. Domain review: pending.

| Action/read scope                                | Designer       | Reviewer     | Administrator               | Viewer            |
| ------------------------------------------------ | -------------- | ------------ | --------------------------- | ----------------- |
| Read project/history/audit                       | Owned          | All          | All                         | All non-sensitive |
| Create project                                   | Yes            | Yes          | Yes                         | No                |
| Edit, validate, calculate, save                  | Owned          | Owned        | Any                         | No                |
| Check/approve latest eligible revision           | No             | Any          | Any                         | No                |
| Create saved-revision export                     | Owned readable | All readable | All readable                | No                |
| List/status/download existing export             | Owned readable | All readable | All readable                | All readable      |
| User/catalog administration; operational metrics | No             | No           | Yes (metrics flag required) | No                |

The exact contract is [`authorization-policy.ts`](../../apps/backend/src/authorization-policy.ts),
[Stage 8](../stage8-users-roles-revisions.md) and [Stage 9](../exports/stage9-decisions.md).
Cross-owner hidden resources use `404 RESOURCE_NOT_FOUND`; a hidden UI control alone is insufficient.
Unauthenticated, disabled/revoked and stale higher-role sessions must not retain privileges.

## T15 — English Excel from a saved revision

- Prerequisites/role: exact saved v2 revision, captured lifecycle, known template/mapping/renderer;
  Designer/Reviewer/Administrator creates export within scope, Viewer downloads permitted existing
  artifact; native Microsoft Excel observer has approved access to the workbook.
- Exact input/provenance: manifest `approved-change-order-26` raw workbook and independent expected
  hashes, retained [approved-workbook test](../../packages/export/tests/approved-workbook.test.ts),
  [parser/OOXML checks](../exports/stage9-evidence.md) and Playwright T15 exact names in manifest.
  Actual application run records selected revision ID/checksum/fingerprint, export context identity,
  template `change-order-clients-scope-26`, mapping `change-order-clients-scope-26-1`, renderer
  `stage9-exceljs-2` (confirm actual candidate), artifact ID/raw SHA-256 and workbook byte length.
- Steps: select saved revision, request English Excel in BG then EN UI, download through application,
  independently compare values to saved result and run retained parser/OOXML/golden checks. Open
  exact hash-identified download normally in native Microsoft Excel; inspect all sheets/print preview,
  record any repair prompt, Excel version/build, observer, UTC time, observation source and screenshot
  reference under controlled local/internal access. Later active catalog/rules must not rewrite it.
- Independent expected: `Change Order` A:Z, exact row-5 headers; `Calculation details` and `Warnings`;
  one original-order row per saved BOM line, included items informational, literal English text.
  B technical, C ordered total, D total spare, G increment, I package count (null I/J blank), E/H units;
  full manual/source/warning/trace details and exact revision/approval label. P/Q prices and unsupported
  external/SAP facts remain blank/no invented columns. Production has no executable formulas; strings
  beginning `=`, `+`, `-`, `@` remain literal. Valid ZIP/CRC/relationships, exact decimals, readable print,
  no native repair prompt. Calculated/Checked label remains not approved; only actual captured approval
  permits Approved. Current active data cannot replace saved facts.
- Actual: pending. Automated evidence: pending. Native observation: pending; historical Stage 9
  `336fa04d084c245a6182dd61f6ffb31c322d502da7493e9fdcc423128ee1d3d2` user observation is scoped to
  that artifact/renderer, not a new candidate observation. Defects: pending observation; S12-B06.
  Execution: pending. Domain review: pending.

## Separate Stage 11 demo map

All 13 demo geometries are synthetic and use the active source-backed P0 catalog; their actual
project/input/revision identities are operator evidence, currently pending. Definitions are
[`stage11-demo-projects.ts`](../../apps/backend/src/stage11-demo-projects.ts).
Default is 3 m, 1.5 m spacing, concrete, first selectable supply and applicable assembly template,
WSTB mode one, reserve zero and missing cable load. This is not the 6 m focused fixture.

| Demo                    | Actual definition to inspect                                                 | Related case / remaining difference                                                    |
| ----------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `S11-DEMO-KL`           | One KL 60.203 3 m route.                                                     | T01 selection/warnings only; recreate 100 m and explicit 6 m independently.            |
| `S11-DEMO-WSL`          | One WSL 105.200 3 m route, WSTB one.                                         | T02 selection only; 100 m/two-per-support absent.                                      |
| `S11-DEMO-CONTINUATION` | Two named 3 m KL routes, shared logical continuation.                        | T04 topology demonstration; focused 6+6 m geometry differs.                            |
| `S11-DEMO-PHYSICAL`     | Two 3 m KL routes, physical splice, separate supports, material null.        | T05 unresolved warning/ownership; no confirmed connector/fastener result.              |
| `S11-DEMO-BEND`         | 3 m KL then unselected horizontal bend.                                      | T06 unresolved fitting only; no resolved fitting or two-extra-support correction.      |
| `S11-DEMO-TEE`          | Three 3 m KL routes, three distinct tee participants, material null.         | T07 endpoint/ownership/warnings; resolved connectors absent.                           |
| `S11-DEMO-ENDS`         | KL start cap unselected, equipment end `TEST-DEMO-PANEL-01`.                 | T08 unresolved endpoints; no confirmed cap material.                                   |
| `S11-DEMO-SUPPORT`      | KL 3 m route, spacing changed to 1 m.                                        | T02/T06 support settings only; no manual-extra-support record.                         |
| `S11-DEMO-ANCHOR`       | Default KL 3 m route and template anchor.                                    | T09/T10 selector/source context only; DAM, DAZ and NSA must each be tested explicitly. |
| `S11-DEMO-ROUNDING`     | One 7 m segment, reserve 10%, actual catalog package.                        | T03/T11 concept only; lacks exact 6/8.5 segments and 5%/24 m test package.             |
| `S11-DEMO-CATALOG`      | Manual `KLTB 6 F`, three pcs, project reserve/catalog package.               | T12 manual catalog identity; not synthetic reserve-disabled ten-pack fixture.          |
| `S11-DEMO-TEXT`         | Manual free text `TEST site supplied marker`, three pcs, packaging disabled. | T12 free text identity; 2.5 m/edit/remove settings absent.                             |
| `S11-DEMO-APPROVAL`     | Default KL; seed may save/check/approve through actual lifecycle.            | T14 lifecycle demo only, not role-negative coverage or human/domain signature.         |

T13 catalog change and T15 native Excel need separate guarded/history/workbook procedures; demo
count 13 does not imply all 15 scenarios executed. Seed lifecycle approval is explicitly synthetic
demonstration evidence. Current unresolved P0 facts and approval blockers remain visible.

## Result record and coverage

Create one safe record per case/variant; do not fill unknown identity fields with examples:

```text
Case / variant:
Candidate baseline ID / reviewed application SHA / evidence digest:
Environment identity / verified TEST URL or disposable identity:
Executor role / observer identity / execution UTC:
Fixture selector / input fingerprint / independent expected digest:
Catalog and rule IDs / versions / content hashes:
Project / draft / calculation run / saved revision IDs and checksums:
Export artifact ID / template / mapping / renderer / raw workbook SHA-256, if applicable:
Steps actually performed:
Actual observations and comparison to independent expected:
Safe evidence reference / correlation ID:
Defect IDs / retest scope:
Execution status (pass, fail, pending, blocked):
Domain-review status (pass, fail, pending, blocked):
Domain reviewer / UTC / exact reviewed candidate and expectation identity:
```

Initial human coverage: T01–T08, T09-DAM, T09-DAZ, T10–T15 execution **pending** and domain review
**pending**. Retained automated evidence is separately assessed in [stage12-evidence.md](stage12-evidence.md).
The availability of runnable tests and specified expected outcomes is not a recorded execution.
Every successful case still needs a source-matching result and attributable domain review before GO.

Warning review across cases includes missing load, substrate, anchor selection/compatibility,
manual quantities/packages/supports, incomplete relations and distinct catalog/project/engineering
provenance in UI, saved snapshots and Excel. Record absence or misleading labeling as a defect;
never hide blockers to complete a case. Refer proposed export latency/polling constraints to the
technical/domain owners through the existing performance review, without silently increasing budgets.
