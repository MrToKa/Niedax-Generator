# Stage 13 — Defect Remediation and Full Application Verification

## Repository, authority and objective

Implement **Stage 13 — Defect Remediation and Full Application Verification** in
`MrToKa/Niedax-Generator`.

The user-defined objective is to find and fix defects and thoroughly verify the existing
application. Deliver a working, inspected application with reproducible evidence across its
complete implemented workflow, together with an honest register of unresolved issues.
Do the remediation and verification work; a plan, source review or checklist alone is insufficient.

Stage 13 is an extension requested by the user. The original
`Niedax_Implementation_Plan_to_Test_Phase_BG.docx` ends at Stage 12; do not imply that it already
defines or approves Stage 13. Retain its MVP scope, T01–T15 scenarios and change-control rules.
The explicit Stage 9 decision supersedes its obsolete 29-column Excel requirement.

This prompt was prepared on 2026-10-13. At inspection, remote `main` was
`58a5d12c565bdd6045bfde53eea59a6fa6222293`; the Stage 12 prompt was in the open draft
[pull request #1](https://github.com/MrToKa/Niedax-Generator/pull/1), with head
`3883afddabae42d5a637faea71167e682982f591`. The local Stage 12 checkout also contained substantial
uncommitted implementation and acceptance-package changes. These are inspection facts, not a
required future checkout or proof of accepted deployment. Recheck the current state before work.

The inspected Stage 12 package reports **NO-GO**, with missing operational evidence and human
approvals. Full local engineering verification and scoped repairs may proceed while formal UAT
admission remains blocked. Do not claim formal UAT, accepted TEST deployment, production readiness
or engineering suitability from successful automated tests or a localhost walkthrough.

## 1. Establish the actual implementation and preserve existing work

Start by inspecting branch, HEAD, remote/default branch, working-tree changes, applicable
`AGENTS.md` files and `CONTRIBUTING.md`. Identify which Stage 10–12 deliverables actually exist
on the working branch, which exist only in another branch or uncommitted work, and which are
missing. Do not assume that documentation references prove implementation or executed results.

Preserve unrelated user changes and running services. Do not reset, clean, stash or overwrite
them. Use a focused topic branch or isolated checkout when useful. A new checkout does not
contain uncommitted Stage 12 work: report missing prerequisites instead of silently dropping
that behavior. Keep new changes attributable and reviewable.

Read at least the following, where present, and follow their relevant dependencies:

```text
AGENTS.md
CONTRIBUTING.md
README.md
package.json
pnpm-workspace.yaml
.node-version
Niedax_Implementation_Plan_to_Test_Phase_BG.docx
docs/architecture.md
docs/architecture/module-boundaries.md
docs/architecture/api-contracts-v1.md
docs/authentication.md
docs/security.md
docs/operations.md
docs/backups.md
docs/migrations.md
docs/ux/mvp-input-contract-v1.md
docs/ux/validation-and-error-states.md
docs/catalogs/catalog-import.md
docs/calculation-engine/formulas.md
docs/calculation-engine/stage6-decisions.md
docs/stage8-users-roles-revisions.md
docs/exports/stage9-decisions.md
docs/exports/stage9-column-mapping.md
docs/exports/stage9-template-inventory.md
docs/testing/stage10-test-plan.md
docs/testing/stage10-regression-review.md
docs/testing/stage10-regression-manifest.json
docs/testing/stage10-defects.md
docs/testing/stage10-evidence.md
docs/testing/stage10-security.md
docs/testing/stage10-performance.md
docs/testing/stage10-ci.md
docs/testing/stage10-acceptance.json
docs/testing/stage11-evidence.md
docs/testing/TEST_ENVIRONMENT.md
docs/testing/TEST_BACKUP_RESTORE.md
docs/testing/TESTER_GUIDE.md
docs/testing/stage12-prompt.md
docs/testing/STAGE12_ACCEPTANCE.md
docs/testing/STAGE12_LOCAL_START_BG.md
docs/testing/UAT_CHECKLIST.md
docs/testing/DEFECT_TEMPLATE.md
docs/testing/stage12-baseline.json
docs/testing/stage12-defects.md
docs/testing/stage12-evidence.md
docs/testing/stage12-go-no-go.md
docs/testing/stage12-security-remediation.md
compose.yaml
compose.test.yaml
.github/workflows/stage10.yml
.github/workflows/stage11-test.yml
scripts/test-environment.ts
scripts/lib/stage11-config.ts
scripts/lib/stage11-identity.ts
scripts/lib/stage12-acceptance.ts
apps/backend/src/authorization-policy.ts
apps/backend/src/project-service.ts
apps/backend/src/revision-service.ts
apps/backend/src/export-service.ts
apps/backend/src/stage11-demo-projects.ts
packages/domain/src/schemas/v2/calculation.ts
packages/domain/src/schemas/v2/project-transport.ts
packages/domain/src/schemas/v2/revision-transport.ts
packages/calculation-engine/tests/helpers/stage10-scenarios.ts
packages/export/src/workbook-mapping.ts
packages/export/src/renderer.ts
tests/e2e/critical-workflows.spec.ts
```

Missing Stage 12 helpers/documents are explicit prerequisites, not permission to build a parallel
acceptance system. Continue independent inspection, existing tests and safe repairs. Inspect
available sanitized evidence before deciding whether it is current and reusable; never read
secrets, credentials or raw authenticated browser state into logs.

## 2. Capture a reproducible starting point

Create a verification inventory before changes. Record the inspected application commit,
clean/dirty state, behavioral source identity, lockfile hash, pinned toolchain and verified
environment identity. For a running application, also capture actual build information,
runtime image identities, migration history, active catalog/rule versions and hashes,
engine/formula versions, export mapping/renderer/template identity and material feature flags
through existing safe mechanisms. Use null for anything not observed.

Separate authoring commit, tested source and deployed build. A dirty checkout must not be
presented as the unchanged committed build. Hash files and canonical data using existing
algorithms and declare the algorithm/normalization. Do not copy stale identity values from
Stage 12 into a new candidate or create self-referential authoring-SHA requirements.

Reuse current evidence only when its source/artifact/environment identity matches and the
required scope permits reuse. Otherwise run the appropriate existing checks. Capture failing
attempts and initial product observations before fixing them; do not erase them after a pass.

Build a matrix covering frontend, API, domain contracts, calculation engine, catalog workflow,
database, revision lifecycle, export, authentication, infrastructure and operations. Each row
must identify the check, expected behavior, environment, execution status, evidence and defect
references. Distinguish `pass`, `fail`, `pending`, `blocked` and justified `not-applicable`.
A mandatory check cannot become optional merely because its environment is unavailable.

## 3. Reconcile known defects and Stage 12 blockers

Read existing registers before creating new issues. Retain original IDs and history; use
`S13-D001`, `S13-D002`, etc. for newly reproduced defects. Link carried issues to their original
records, current observations and exact fix/retest evidence.

Inspect these Stage 12 blocker groups without assuming their earlier status remains current:

| Existing record                          | Stage 13 action                                                                                                                                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| S12-B01: remote CI                       | Verify exact candidate run/event/runner and full artifacts. A local pass or queued/cancelled/skipped run cannot establish remote success.                                                  |
| S12-B02: image security                  | Reassess exact current runtime/tool images and dependency graph; implement justified patches and retain findings needing authorized disposition.                                           |
| S12-B03: domain expectations and budgets | Preserve independent T01–T15 results, both T09 variants and actual measured budgets; obtain or retain pending attributable human review.                                                   |
| S12-B04: accepted TEST deployment        | Verify existing deployment gates, actual environment identity, reachability and smoke where authorized. Local verification remains explicitly unaccepted.                                  |
| S12-B05: backup/restore                  | Verify exact candidate backup and guarded disposable restore with integrity comparison and cleanup.                                                                                        |
| S12-B06: native Excel                    | Reconcile exact downloaded workbook and obtain genuine scoped native-open evidence where supported; otherwise retain pending status.                                                       |
| S12-B07: real material capabilities      | Investigate source-backed fitting/connector/endpoint/assembly gaps. Fix verified data or implementation defects; never invent compatibility to satisfy a scenario.                         |
| S12-B08: NSA restrictions                | Inspect optional source-fact propagation already added in Stage 12 and actual UI/snapshot/export behavior. Do not claim outdoor-condition rejection without an implemented input contract. |
| S12-B09: calculation build provenance    | Verify already-added build capture at Calculate, save/reload/lifecycle/export retention, original-build display and explicit unavailable legacy provenance.                                |
| S12-B10: human admission decision        | Preserve genuine sign-off requirements and pending records. Automated repair or verification cannot sign an admission protocol.                                                            |

Some blockers are evidence, domain-scope or external-operation prerequisites rather than
software failures. Keep their type explicit. Do not assign a fabricated product severity,
human owner, signature or approved scope change. A focused Stage 12 implementation fix does
not close its remaining domain or operational acceptance criterion.

## 4. Verify the complete implemented user journey

Use the existing isolated TEST/browser environment and synthetic data. Confirm its identity
before seeding or mutation. Verify through the actual UI and real backend/database wherever
available; mocked responses alone cannot establish that an application flow works.

Execute and record:

1. Login, logout, session expiry/revocation behavior and safe unauthenticated responses.
2. Project list, permitted visibility, create/open project, edit and persist draft, reopen after
   refresh and confirm values. Check empty/loading/error states and actionable validation.
3. Add/edit/remove routes and segments; select catalog products, supply lengths, supports,
   fittings, connections/endpoints and available assembly/anchor inputs.
4. Add catalog and free-text manual items, configure reserve/package behavior and manual
   supports/overrides, then confirm persistence and trace.
5. Calculate, inspect technical/ordered/spare quantities, included informational items and
   warnings; verify that changed inputs do not misleadingly display an older result as current.
6. Save an immutable revision, reopen/reload it, move through Calculated → Checked → Approved
   with the permitted roles, and inspect its inputs, results, metadata and audit history.
7. Change the working draft and calculate/save a later revision. Confirm older inputs, BOM,
   warnings, checksums, source facts and original calculation build remain unchanged.
8. Generate and download English Excel from an authorized saved revision. Verify the actual
   downloaded artifact against that snapshot and the export's captured lifecycle context.
9. Repeat critical read/mutation/lifecycle/export actions with Designer, Reviewer,
   Administrator and Viewer, checking UI availability and backend enforcement independently.
10. Test recoverable API/export errors, supported retry/idempotency behavior and refresh after
    delayed export completion, without duplicate mutations, corrupt revisions or lost drafts.

The authorization policy is authoritative: Designer mutation is owner-scoped; Reviewer can
read across projects and perform permitted lifecycle actions but draft mutation remains
owner-scoped; Administrator has permitted administration/all-project mutation; Viewer is
read-only and can download permitted existing exports but cannot create them. Validation and
approval blockers apply to all roles. Check the actual policy for precise action boundaries.

There is no general project-clone or historical-revision-restore workflow to assume. Use
Create project and supported draft/revision operations. Preserve baseline projects and
approved revisions. Test destructive account/catalog/connection negatives in disposable
fixtures, never by disabling real users or altering an active persistent TEST catalog.

Inspect BG/EN behavior, readable warnings, layout at desktop and narrow widths, keyboard
navigation, focus, labels, contrast and validation feedback for the critical journey. Record
reproducible console/network failures through sanitized tooling. Fix functional/accessibility
defects within the existing design; do not turn the stage into a visual redesign.

## 5. Reverify calculations and T01–T15 independently

Retain scenario IDs, exact controlled inputs and independently specified expectations. Use
existing golden, property, integration and browser coverage. Add meaningful regression tests
for reproduced faults; do not mirror implementation or generate expected values from the
engine under test. Do not regenerate goldens or relax assertions to make failures disappear.

| ID  | Required verification                                                                                                  |
| --- | ---------------------------------------------------------------------------------------------------------------------- |
| T01 | KL 60, 100 m, explicit 6 m sections: section count, unused length, joints, KLTB and trace.                             |
| T02 | WSL 105, 100 m, WSTB=2: support quantities and visible configurable project-rule provenance.                           |
| T03 | Separate exact 6 m and 8.5 m segments: boundary/segment rounding; no unintended whole-route aggregation.               |
| T04 | Two named routes with logical continuation: explicit ownership and no duplicated shared joint/support.                 |
| T05 | Physical joint: resolved source-compatible connectors/fasteners and included items without duplicate orders.           |
| T06 | Horizontal bend plus manual extra supports: fitting behavior, explicit correction and calculation trace.               |
| T07 | Three-port T connection: endpoint/ownership model, valid resolved behavior and unresolved-material blocking.           |
| T08 | Cap/equipment endpoints: confirmed compatible materials or explicit unresolved warnings and approval impact.           |
| T09 | Execute DAM and DAZ separately: selected size, assembly quantity, packaging and ETA/engineering context.               |
| T10 | NSA: verified concrete/indoor-only source facts, invalid/missing substrate behavior and engineering warnings.          |
| T11 | 5% reserve plus package rounding: separate technical/ordered/spare values, precision and trace.                        |
| T12 | Manual catalog/free-text items: identity, provenance, units, reserve/package options and persistence.                  |
| T13 | Saved revision followed by catalog change in a disposable environment: unchanged historical input/result/export facts. |
| T14 | Four-role permission matrix, cross-owner denials, lifecycle, audit, validation blockers and immutable history.         |
| T15 | Actual downloaded English workbook: approved 26-column layout, details/warnings and saved-snapshot reconciliation.     |

For each case record fixture/input hash, expected-result reference/hash, synthetic versus
source-backed provenance, automated result, observed UI result when relevant, defects and
domain review status. The 13 `S11-DEMO-` projects do not replace all 15 exact scenarios.
Synthetic resolved `NX` relationships prove algorithms, not real Niedax compatibility.

Where active P0 data lacks mandatory material relationships, check safe omission/warnings and
retain the capability blocker. Correct warning behavior cannot substitute for absent required
material capability. Only verified source evidence plus audited catalog/rule versioning, or an
actual authorized scope change, can resolve that requirement.

Inspect decimal precision, zero/absent values, unit conversion, reserve/package ordering,
boundary rounding, included-versus-ordered handling, manual adjustments, deterministic replay
and stable input/snapshot/revision checksums. Product formulas belong exclusively in
`packages/calculation-engine`. Formula changes require a new calculation rule version and
independently reviewed regression changes; product-fact changes require a new audited catalog
version. Never retroactively recalculate approved historical revisions.

## 6. Verify API, persistence, lifecycle and security

Review and exercise HTTP-boundary validation, safe errors/correlation IDs, authorization,
ownership and current domain contracts. Test invalid/missing/out-of-range inputs, unsupported
versions, inaccessible project/revision/export IDs and repeated requests with existing harnesses.
Preserve `/api/v1` routing and inspect current schema versions; do not invent `/api/v2` routes
because some domain payloads use v2 schemas.

Verify real PostgreSQL constraints, rollback, idempotency, optimistic concurrency, concurrent
save/lifecycle/export behavior, revision numbering and immutable snapshot persistence. Check
catalog import validation/approval/activation boundaries and active-version references in guarded
fixtures. Inspect applied migration ownership/checksums and least privilege without altering them.

Check authentication/session handling, disabled-user enforcement, logout/revocation, backend role
denials, same-origin protections as implemented, secret isolation, log redaction, file/path safety
and export literal-text handling. Avoid exposing credentials, cookies, tokens or payloads with
private information in evidence. Use synthetic controlled malicious-input cases.

Run existing dependency/source security checks and current exact-image assessment where supported.
Check Docker/build graph findings and pinned image digests; source audit success is not image scan
success. Use the least disruptive verified patches and retest their affected behavior. Record
scanner version/date, exact artifact, severity and authorized residual-risk disposition. No
security finding is closed merely by excluding it, weakening a gate or copying an older clean report.

## 7. Verify Excel end to end

Retain the approved 26-column A:Z `Change Order` sheet plus `Calculation details` and `Warnings`.
Do not reinstate the obsolete 29-column `List1` requirement. Preserve approved mapping, blank
price cells P/Q and unpopulated external/SAP facts; do not invent pricing or ERP data.

Verify actual saved-snapshot quantities and descriptors, technical/ordered/spare distinctions,
catalog/manual/included items, warning detail, calculation build/source facts where retained,
renderer/mapping identity and captured approval labeling. Historical exports must not acquire
current catalog facts, a newer calculation build or a later lifecycle label through mutable lookup.

Use existing parser/OOXML/golden/browser-download checks for exact columns, sheet names/types,
English content, null/zero handling, escaping, literal formula-like text and absence of executable
formulas/macros/external relationships. Exercise permitted export generation/status/download,
feature-flag boundaries, unauthorized access and delayed completion without duplicate artifacts.

Native Excel evidence must identify the exact workbook SHA-256, saved revision/export context,
observer/date, Excel version/build, no-repair outcome and visual/print checks. Obtain it only
through supported authorized access; if unavailable, retain a pending check. Parser success or
an unchanged renderer name cannot replace native observation. Do not bypass a denied tool action.
Keep generated workbooks/screenshots in controlled local storage; publish only safe summaries.

## 8. Verify Docker, operations, performance and recovery

Verify the existing topology, health/readiness, relative same-origin API routing, startup/migration
sequence, build diagnostics and sanitized logs. Caddy remains the only host-published service;
frontend stays on the internal edge network, PostgreSQL on the private backend network, with
backend/tool connections as specified. Preserve hardening and runtime secret mounts.

Reuse Stage 11 preflight/deploy/smoke/diagnostic commands. Keep normal, isolated TEST and disposable
verification environments clearly identified. Loopback `--local-verification` records remain
`operationallyAccepted: false`. If LAN verification is authorized and available, record actual
second-device reachability separately; never infer it from localhost access or a sample URL.

Verify safe restart/persistence behavior and backup creation/checksum plus disposable restore,
including catalog/rule/revision identity comparisons and cleanup. Coordinate before interrupting
an in-use environment. Do not restore into a live persistent database as a test.

Measure existing typical/large calculation and Excel workloads using the approved or explicitly
pending budgets, consistent fixtures and recorded environment. Investigate timeouts, excessive
requests, memory/error symptoms and regressions without inventing a new arbitrary threshold.
Specifically inspect the documented roughly 43-second scheduled export polling window versus
the proposed 45-second large-export budget. Reproduce actual behavior before calling it a defect;
if fixing polling/recovery, add a meaningful delayed-completion regression. Do not silently
increase budgets, retries or timeouts to pass.

## 9. Fix defects in priority order and prove each repair

Reuse the Stage 10/12 severity policy:

- Severity 1: data loss/corruption, unauthorized access or unusable critical workflow.
- Severity 2: wrong material/order quantities, broken immutability/approval or critical workflow
  failure without a safe workaround.
- Severity 3: limited functional defect or bounded workaround.
- Severity 4: cosmetic/usability defect.

Prioritize data/security/quantity/immutability failures, then critical workflows, then remaining
functional/accessibility issues. Fix confirmed defects within the existing MVP, including findings
from this stage's checks. Do not stop after documentation or merely propose fixes that are safely
implementable within scope.

For every fix:

1. Record a reproducible failure, exact inputs/build/environment and expected versus actual behavior.
2. Identify root cause and affected boundaries; make the smallest maintainable complete repair.
3. Add or extend regression coverage where the defect has material behavior to protect. Tests must
   fail on the old behavior and pass after the fix. Low-impact wording/format edits need focused
   review, not tests that duplicate implementation.
4. Run affected checks, required validation and relevant end-to-end retests. Record failures too.
5. Mark `fixed` until matching-candidate retest evidence exists; then mark `fixed and verified`.
   Human/native/operational closure still needs the corresponding genuine evidence.

Use forward-only timestamp-prefixed checksum-protected migrations owned by the migration role
when a persistence fix requires one. Never edit applied migrations, reset persistent data or
backfill invented build/source facts into legacy revisions. Preserve backward compatibility
and explicit legacy-unavailable labeling for optional Stage 12 metadata.

Do not suppress warnings, relax role checks, skip failing tests, remove security controls, change
expected quantities, promote synthetic compatibility or downgrade severity to obtain acceptance.
No cloud services, external runtime assets, telemetry, pricing/ERP, automatic structural selection,
cut optimization, broad refactoring or unrelated new features are part of Stage 13.

## 10. Produce a compact, inspectable verification package

Create the following under `docs/testing/`, following existing English documentation conventions:

| Deliverable                        | Required content                                                                                                                                                              |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `STAGE13_VERIFICATION.md`          | Package index, scope, inspected baseline, complete verification matrix, overall status, limitations and next actions.                                                         |
| `stage13-defects.md`               | Carried and new issues, reproduction/root cause/severity, fix/retest records and unresolved accountable blockers.                                                             |
| `stage13-evidence.md`              | Actual commands/UI observations, UTC times, exact source/build/environment/artifact identities, safe references and all relevant failed attempts.                             |
| `stage13-baseline.json`            | Versioned starting/final candidate identities, declared hashes and explicit unknown fields; links to the existing Stage 12 identity rather than a competing acceptance model. |
| `stage13-verification-matrix.json` | Machine-readable check IDs, required scope, status, baseline/evidence/defect references and remaining gaps.                                                                   |
| `stage13-final-report.md`          | Fixes, final verified coverage, unresolved defects/checks, residual risks and separate technical/formal acceptance outcomes.                                                  |

Use the existing `DEFECT_TEMPLATE.md`, `UAT_CHECKLIST.md`, severity policy and Stage 12 validator.
Do not duplicate all earlier documentation. Update affected runbooks/tester instructions with
focused corrections and add a README link without overwriting unrelated edits.

Each defect record needs ID/type/severity, originating record, scenario/check, candidate identity,
expected/actual behavior, safe reproduction/evidence, root cause, responsible role, status,
changed files/fix reference, retest method/result/time, reviewer when actually available and
acceptance impact. Unknown humans/signatures remain null. Preserve original failure history.

Each matrix row needs stable check ID, component/scenario, requirement, verification method,
mandatory/optional scope, baseline identity, status, actual observation, evidence reference,
executed/reviewed time when real, defect references and next action. Count all required rows,
including pending/blocked ones; do not present a pass rate over executed checks as full coverage.

Keep raw reports, traces, downloads, backups, screenshots and browser state in existing ignored
controlled locations. Commit only sanitized summaries and permitted references. If a small
report consistency checker prevents material mistakes, extend existing mechanisms where possible;
document and test its semantics. It must reject missing/stale/mismatched evidence and never
create human approvals, grant deployment permission or equate valid JSON with verified behavior.

## 11. Execute the required validation

Use repository-pinned Node/pnpm versions from the actual manifests, not assumed prompt-time
versions. Prefer `corepack pnpm` on Windows when the pnpm shim is unavailable. Install from the
frozen lockfile when required; do not change dependencies merely to initialize tooling.

For source changes run `corepack pnpm validate`. For Docker, networking, database, authentication,
backup or infrastructure changes run `corepack pnpm validate:full`. Run `corepack pnpm db:check`
for migrations and persistence changes, including its existing disposable protections.

For the final full-application verification, use the existing Stage 10 aggregate:

```powershell
corepack pnpm validate:stage10
```

Inspect its actual implementation before execution. It currently orchestrates the full gate,
browser workflows, security/audit, measured performance and fixture integrity. Do not run both
the aggregate and identical standalone full gates merely to duplicate matching successful
evidence; run focused checks during repair and a final matching-candidate aggregate afterward.
If a later repair changes relevant source/artifacts, rerun the affected gates and ensure the
final evidence covers that new identity. Do not endlessly repeat unchanged passing checks.

Also run the relevant Stage 11/12 checks when implemented:

```powershell
corepack pnpm test:stage11
corepack pnpm test:stage12
corepack pnpm stage12:report
corepack pnpm stage12:report -- --require-go
```

The Stage 12 report's ordinary exit 0 means structurally consistent supplied evidence and may
still report NO-GO. `--require-go` exit 2 means a valid NO-GO; retain that acceptance outcome,
not a fabricated software failure. Malformed/inconsistent evidence is a distinct validation
failure. Verify actual current command semantics and do not edit the baseline to force GO.

Run authorized environment checks through the existing commands, after inspecting their
configuration and prerequisites:

```powershell
corepack pnpm test-env:preflight
corepack pnpm test-env:status
corepack pnpm test-env:smoke
corepack pnpm test-env:backup
corepack pnpm test-env:verify-restore
```

Use the documented guarded local mode where appropriate; do not copy these commands into a
different environment without checking their target. Environment creation/deployment, shared
runner registration and host changes require the appropriate existing authorization.

If Docker, scanner, browser, native Excel, accepted TEST deployment, dedicated runner or a
required human review is unavailable, continue independent useful work, record the exact
limitation and leave the corresponding check pending/blocked. Do not substitute mocks or
historical evidence for the missing verification. Review links, formatting, JSON validity,
identity consistency, evidence availability and redaction before completion.

Documentation-only edits to this prompt require focused formatting/reference checks, not
application test execution. Implementing Stage 13 fixes and claiming complete application
verification requires the validation described above.

## 12. Safety and authorization boundaries

Follow `AGENTS.md`: frontend presentation and relative `/api/v1`; backend HTTP/auth/PostgreSQL;
deterministic framework-independent engine without I/O; formulas only in
`packages/calculation-engine`; forward-only database-owned migrations and manual backup tools.
Preserve both internal networks and all container hardening unless a verified platform requirement
is documented. Frontend/backend/PostgreSQL must never receive published host ports.

Runtime credentials come from `pnpm setup` and Compose secrets under `data/secrets`, with isolated
TEST paths as configured. Never log/commit secrets, `data/`, dumps, raw logs/browser state or
credentials in examples, build arguments, browser code or image layers. Never reset normal or
persistent TEST databases or run `docker compose down -v` against them. Disposable cleanup
must verify the intended guarded environment first.

Proceed with authorized reversible fixes and verification without routine confirmation loops.
Do not commit/push/merge, register runners, alter host firewall settings, interrupt shared
environments or deploy to a real internal server unless the user has authorized that action.
Do not send stakeholder messages or publish private evidence externally without authorization.
Respect existing tool denials and report what remains unavailable.

## 13. Definition of Done and final response

Report three distinct outcomes:

1. **Defect remediation:** every identified issue is fixed and verified, or has an explicit
   unresolved status, responsible role, impact and evidence needed for closure. No safely
   implementable in-scope blocking fix is left as a mere proposal.
2. **Application verification:** required automated gates pass for the final matching candidate;
   actual UI/API/database/export/operational checks have attributable results; every missing
   check remains visible. A partially executed matrix is not complete verification.
3. **Formal acceptance:** current Stage 12 admission status is reevaluated using existing criteria
   and genuine records. Local technical success alone cannot authorize UAT or claim production
   readiness. Preserve NO-GO while mandatory prerequisites/signatures are missing.

Full technical completion requires no open Severity 1/2 or other blocking product defect,
complete required verification coverage, matching final identities, successful required gates,
verified repaired workflows and accurate documentation. If external verification remains
unavailable, complete all feasible repairs/package work but report **REMEDIATION COMPLETED
WITH LIMITATIONS — FULL VERIFICATION INCOMPLETE**, identifying any unresolved remediation
separately. Do not mark Stage 13 fully complete merely because local tests passed.

The final user-facing report must state:

- Which defects were found/fixed and why the application behavior is now correct.
- Which checks actually ran and their results, including relevant failures/retests.
- Which application commit/source/build/environment/artifacts the results cover.
- Which checks, defects, domain decisions or operational approvals remain unresolved.
- The technical verification outcome and separate Stage 12 GO/NO-GO status.
- Links to the verification package, defect register and evidence, plus concrete next actions.

Make the report concise, evidence-backed and understandable to a nontechnical owner. Never
claim that the app has no defects, that all checks passed, that humans accepted it or that a
production deployment occurred without evidence for that exact claim.
