# Stage 12 — Test Phase Entry and Acceptance Package

## Repository and purpose

Implement Stage 12 in `MrToKa/Niedax-Generator`: prepare an inspectable acceptance package and
support a formal human go/no-go decision to begin internal User Acceptance Testing (UAT).

The authority for this stage is Section 12, the T01–T15 scenarios, test-entry criteria and change
control in `Niedax_Implementation_Plan_to_Test_Phase_BG.docx`. Read that document without changing
it. This stage ends at admission to internal testing; it does not certify completed UAT,
production readiness or engineering suitability.

Work from the actual current repository state. This prompt was prepared on 2026-09-30 against
`main` commit `58a5d12c565bdd6045bfde53eea59a6fa6222293`. This is inspection context, not a pin for
future implementation or approval. Check the current branch, HEAD, working tree and applicable
`AGENTS.md` files first. Preserve unrelated user changes.

Implement the package, evidence checks and scoped fixes that can be completed locally. Continue
preparing useful deliverables when an external prerequisite is missing, but leave the affected
criterion pending or blocked and report **NO-GO**. Preparation does not authorize UAT admission.
Do not invent signatures, domain approvals, deployment observations or test results.

Do not commit, push, merge, register runners, change a host firewall or deploy to an actual internal
server unless the user authorizes those actions. Do not send messages to stakeholders or publish
reports outside the repository without authorization.

## 1. Inspect and reuse the existing implementation

Read at least:

```text
AGENTS.md
CONTRIBUTING.md
README.md
package.json
Niedax_Implementation_Plan_to_Test_Phase_BG.docx
docs/testing/stage10-test-plan.md
docs/testing/stage10-evidence.md
docs/testing/stage10-defects.md
docs/testing/stage10-security.md
docs/testing/stage10-ci.md
docs/testing/stage10-performance.md
docs/testing/stage10-regression-review.md
docs/testing/stage10-regression-manifest.json
docs/testing/stage10-acceptance.json
docs/testing/stage11-prompt.md
docs/testing/stage11-evidence.md
docs/testing/TEST_ENVIRONMENT.md
docs/testing/TEST_BACKUP_RESTORE.md
docs/testing/TESTER_GUIDE.md
docs/stage8-users-roles-revisions.md
docs/exports/stage9-decisions.md
docs/exports/stage9-column-mapping.md
docs/exports/stage9-template-inventory.md
docs/exports/stage9-evidence.md
.github/workflows/stage10.yml
.github/workflows/stage11-test.yml
compose.yaml
compose.test.yaml
scripts/test-environment.ts
scripts/lib/stage11-config.ts
scripts/lib/stage11-smoke.ts
apps/backend/src/authorization-policy.ts
apps/backend/src/stage11-demo-projects.ts
packages/calculation-engine/tests/helpers/stage10-scenarios.ts
tests/e2e/critical-workflows.spec.ts
```

Follow additional dependencies referenced by those files. Inspect safe local reports when they
exist; a reference to an ignored artifact is not evidence that the artifact is available.

Reuse the Stage 10 regression manifest, independent expected results, browser/integration tests,
security checks and performance measurements. Reuse Stage 11 provisioning, diagnostics, demo
projects, smoke tests, backup/restore verification and deployment gates. Extend the tester guide
through links and focused additions. Do not build a second deployment system, calculation engine,
approval workflow, export renderer or defect severity policy.

## 2. Establish the entry status honestly

At prompt preparation, Stage 11 evidence explicitly states:

> Stage 11 implementation is present, but operational activation remains blocked by unresolved
> Stage 10 entry criteria.

The tracked Stage 10 acceptance template has null `reviewedCommit` and pending runtime-image
security and domain approvals. Inspect the actual operator-managed sign-off through the existing
safe mechanism where authorized; the tracked template alone does not describe every host.
Do not alter the template or operator records to manufacture acceptance.

GitHub inspection on 2026-09-30 found cancelled Stage 10 validation runs and skipped Stage 11
deployment runs, including these runs for the inspected HEAD:

- [Stage 10 validation, cancelled](https://github.com/MrToKa/Niedax-Generator/actions/runs/35993102300).
- [Stage 11 TEST deployment, skipped](https://github.com/MrToKa/Niedax-Generator/actions/runs/36227878559).

Recheck current evidence when implementation starts. Cancelled, skipped, queued and local-only
executions are not successful remote CI or accepted deployment evidence. A configured workflow
or `http://<test-server>:8080` placeholder is not a verified test environment.

Record each entry criterion with an ID, status, exact baseline identity, evidence reference,
execution/review time, responsible role and next action. Use explicit `pass`, `fail`, `pending`
and `blocked` states. A mandatory criterion without evidence cannot pass. Keep implementation
verification separate from operational acceptance and from human permission to begin UAT.

Carry forward unresolved Stage 10 criteria:

- Successful remote Stage 10 CI for the candidate deployment commit on the required runner.
- Current runtime-image security assessment and authorized disposition for exact deployed image
  digests; source scans and package audits do not replace it.
- Domain approval of exact T01–T15 inputs, expected results, hashes and performance budgets.

Stage 11 operational acceptance additionally needs the actual TEST deployment identity and URL,
successful gated deployment, smoke evidence, role accounts, migrations, active data versions and
backup/restore verification. Local `--local-verification` remains loopback implementation
evidence with `operationallyAccepted: false`; it cannot satisfy accepted LAN deployment.

## 3. Deliver the acceptance package

Create a cohesive package under `docs/testing/`, using these proposed paths or explaining a
better fit with existing conventions:

| Deliverable             | Required content                                                                                                |
| ----------------------- | --------------------------------------------------------------------------------------------------------------- |
| `STAGE12_ACCEPTANCE.md` | Package index, scope, authority, all entry criteria, evidence links, current readiness and blockers.            |
| `stage12-baseline.json` | Versioned candidate identity, artifact hashes, environment identity and freeze status.                          |
| `UAT_CHECKLIST.md`      | Executable T01–T15 checklist, role journeys, warnings, Excel and operational entry checks.                      |
| `DEFECT_TEMPLATE.md`    | Reusable safe report format, existing severity definitions and triage instructions.                             |
| `stage12-defects.md`    | Central Stage 12 register with carried blockers, owner roles, retests and dispositions.                         |
| `stage12-go-no-go.md`   | Decision scope, criterion outcomes, blocker list and genuine human sign-off records.                            |
| `stage12-evidence.md`   | Observed validation, exact identities, dates, limitations and distinction between automated and human evidence. |

Keep a missing result visibly pending. Use nulls for unknown identities rather than fake values,
sample URLs, synthetic timestamps or placeholder hashes that resemble verified evidence.
Expected outcomes in a checklist are instructions, not executed results.

Prefer Markdown and small versioned JSON documents. Do not add a database schema, application
admin screen or external QA service merely to store this package. Add a small repository-local
evidence validator/report command only where it prevents material consistency errors. It may
evaluate supplied evidence and report readiness; it must not grant deployment permission, write
human approvals, bypass the Stage 11 gate or contact external services at application runtime.
If introduced, document its inputs, output and exit codes, and test missing evidence, mismatched
identities, stale approvals and open blocking defects. A valid NO-GO report is not a GO outcome.

## 4. Identify and freeze the candidate baseline

Record the actual tested and deployed application, not merely the authoring checkout:

- Baseline ID, creation time, environment and actual TEST URL when verified.
- Application version, deployed Git SHA, build timestamp, build/source identity and clean/dirty
  state as provided by the existing deployment and diagnostics records.
- Immutable runtime image identities/digests, lockfile hash and verified migration history identity.
- Actual active catalog and rule versions, IDs and content hashes from the running system.
- Engine/formula version, export template/mapping/renderer identity and feature-flag state.
- Exact Stage 10 regression manifest, scenario, expected-result and execution evidence hashes.
- Demo/input dataset provenance and fingerprints, saved revision/result identities and safe export
  artifact hashes used during acceptance.
- Successful CI/deployment run URLs, smoke evidence and verified restore reference.

State the hash algorithm and canonicalization. Distinguish file-byte hashes, normalized text
hashes and canonical JSON hashes. Reuse established algorithms; never equate repeated-digit
synthetic catalog/rule placeholders with real integrity evidence.

A candidate may remain incomplete while prerequisites are blocked. Formal freeze requires
matching evidence for an accepted deployed build. Freeze a reproducible reference, not the live
database or testers' ability to create drafts. Preserve saved baseline revisions and existing
immutability. Define how testers create working copies through supported application workflows.

Keep package-authoring commit identity separate from the reviewed application commit, avoiding
a self-referential Git SHA requirement. Human approvals must identify the candidate and evidence
digest they reviewed. A changed build, catalog, rule, scenario expectation, export implementation
or material flag configuration requires documented impact review, affected retests and renewed
sign-off; documentation edits unrelated to behavior must be assessed explicitly.

## 5. Verify T01–T15 without changing their meaning

Build traceability from the original plan to the retained Stage 10 tests, independent expectations
and a human UAT procedure. Preserve scenario IDs and include both DAM and DAZ variants for T09.

| ID  | Scenario and required observations                                                                                     |
| --- | ---------------------------------------------------------------------------------------------------------------------- |
| T01 | KL 60, 100 m, explicit 6 m supply: sections, unused length, joints, KLTB and trace.                                    |
| T02 | WSL 105, 100 m, WSTB=2: support quantities and visible configurable project-rule provenance.                           |
| T03 | Separate exact 6 m and 8.5 m segments: segment-level rounding and retained boundary cases.                             |
| T04 | Two named routes with logical continuation: shared support/joint ownership without duplication.                        |
| T05 | Physical joint: appropriate connectors/fasteners and informational included items without duplicate orders.            |
| T06 | Horizontal bend and manual extra supports: resolved fitting behavior, explicit correction and trace.                   |
| T07 | Three-port T connection: endpoint model, ownership and valid versus unresolved material behavior.                      |
| T08 | Cap and equipment endpoints: confirmed compatible materials or explicit unresolved warnings.                           |
| T09 | DAM and DAZ in assembly templates: recorded sizes, quantities, packaging and ETA/engineering warnings.                 |
| T10 | NSA anchor: concrete and indoor-only restrictions, invalid conditions and engineering verification.                    |
| T11 | 5% reserve and package rounding: distinct technical, ordered and spare quantities with trace.                          |
| T12 | Manual catalog and free-text items: identity, provenance, units and reserve/package settings.                          |
| T13 | Saved revision followed by catalog change: unchanged historical inputs, rules, BOM, warnings and export facts.         |
| T14 | Designer, Reviewer, Administrator and Viewer: permitted actions, denials, approval and immutable history.              |
| T15 | English Excel from a saved revision: approved 26-column structure, details, warnings and matching snapshot quantities. |

For each case record prerequisites, role, exact input/fixture identity, source-backed or synthetic
provenance, steps, independently specified expected outcome, actual outcome, evidence, defects,
execution status and domain review status. Do not generate expected quantities from the engine
being tested or silently update goldens to match current output.

The 13 `S11-DEMO-` projects are demonstrations, not a one-to-one replacement for all 15 regression
scenarios. Map each separately. Stage 10 synthetic resolved-rule fixtures differ from the active
source-backed P0 catalog. Never import synthetic compatibility/connector assumptions into the
real catalog to make a demonstration succeed. For unresolved production combinations verify the
documented warning and approval blocker; identify any unfulfilled mandatory capability separately
and keep it blocking unless scope is formally changed by the responsible humans.

Run catalog-change and destructive negative scenarios in guarded disposable environments.
Do not activate/archive a live TEST catalog, disable real tester accounts, overwrite drafts or
reset persistent data to obtain evidence. A disposable result supplements deployment checks;
it must retain its own environment and source identity.

## 6. Check roles, approval, revisions and warnings

Use the implemented authorization policy as the precise action/read-scope contract. Check UI
availability and backend denials, including project ownership, Viewer read-only behavior,
unauthenticated access and disabled/session-revoked identities in disposable tests.
Viewer can download permitted existing exports but cannot create them. Designer cannot approve.
Reviewer and Administrator remain subject to validation and actual approval blockers.

Verify the real Calculated → Checked → Approved lifecycle, revision numbering/metadata and audit
records. A draft recalculation does not create a saved revision. New work creates a draft/revision
through supported workflows; it does not mutate or recalculate approved historical snapshots.
Check duplicate/idempotent requests and retained rollback/concurrency coverage using existing tests.

Check that UI, saved snapshots and exports consistently distinguish catalog-confirmed facts,
project rules/assumptions and engineering verification. Cover missing load, mounting substrate,
anchor selection, compatibility, manual overrides/supports and incomplete relations.
Preserve NSA indoor-only/concrete limits and DAM/DAZ engineering/ETA context. A successful BOM or
automated demo approval does not establish structural suitability or human domain acceptance.

## 7. Verify the current Excel contract

The original plan mentions 29 `List1` columns. The explicit user decision recorded in
`docs/exports/stage9-decisions.md` supersedes it: use the 26-column A:Z `Change Order` template,
plus `Calculation details` and `Warnings`. Do not restore 29 columns or rename the main sheet
based on the old plan. Retain the approved mapping and blank SAP/price fields.

Verify values against the exact saved revision snapshot, including technical, packaging, order
and spare quantities, English descriptions, manual/included items and warning details.
Verify template/mapping/renderer versions, formula behavior, safe literal text, workbook validity
and captured approval labeling. Current active catalog/rules must not rewrite historical exports.

Use existing parser, OOXML, golden and downloaded-artifact checks. These checks do not prove a
native Microsoft Excel open without repair prompts. Record a genuine native-open observation with
the exact workbook hash, Excel version, observer/date, no-repair result and relevant visual checks,
or leave this criterion pending. Prior Stage 9 observations apply only to their recorded artifacts
and renderer scope; explain whether evidence can be reused for the candidate, and repeat native
review when generated workbook semantics change.

Keep generated workbooks and screenshots under controlled local/internal access. Commit only
sanitized summaries and permitted references, never customer/sample workbook content.

## 8. Triage defects and retain blocking criteria

Use the Stage 10 severity policy and Stage 11 tester guide. Carry forward open acceptance blockers
with links and distinguish historical fixed defects from still-open issues.

- Severity 1: data loss/corruption, unauthorized access or unusable critical workflow.
- Severity 2: wrong material/order quantities, broken immutability/approval or critical workflow
  failure without a safe workaround.
- Severity 3: limited functional defect or bounded workaround.
- Severity 4: cosmetic/usability defect.

The central register must include ID, severity, type, baseline/scenario, expected/actual behavior,
reproduction steps, safe evidence/correlation ID, owner role, status, fix reference, retest result,
reviewer and release impact. Missing external approvals need accountable blocker records, not
invented product defects or downgraded severities. Separate `fixed` from `fixed and verified`.

No open Severity 1/2 or other high-risk entry blocker permits GO. Document lower-severity
workarounds with residual impact and genuine authorized acceptance; they cannot waive mandatory
domain approval, accepted TEST deployment, required security disposition or other entry criteria.
Apply scoped reproducible fixes where authorized, then rerun affected checks and update evidence.
Do not invent product facts, weaken validation or rewrite persisted history to close a defect.

## 9. Produce a genuine go/no-go protocol

Evaluate the original test-entry criteria explicitly:

1. Actual accepted TEST deployment is reachable and passes smoke checks.
2. Active catalog import validation has no critical errors.
3. Agreed calculation rules have unit-test coverage.
4. All T01–T15 expected results have human domain approval for their exact identities.
5. No open blocking/high-risk defects or Severity 1/2 defects remain.
6. Roles, approval and immutable revision behavior are verified.
7. English Excel matches the BOM and has valid scoped native-open evidence.
8. Warnings clearly identify catalog facts, project assumptions and engineering checks.
9. Build/catalog/rule identities are visible and preserved in the appropriate existing records;
   inspect actual snapshot fields and identify any traceability gap without inventing stored metadata.
10. Tester guide, UAT checklist and central defect register are available.
11. Stage 10 and Stage 11 dependency gates are satisfied for this candidate, including security,
    successful remote CI, performance-budget approval and backup/restore evidence.

Require attributable sign-off from the product owner/domain reviewer and technical owner, recording
name, role, date, candidate/evidence identity, decision, evidence reviewed and any permitted
non-blocking limitations. Preserve how each sign-off was obtained. Automated tests, application
approval roles and synthetic demo lifecycle events cannot supply these human signatures.

Use **NO-GO** while any required criterion or sign-off is missing, failed or blocked. List the
exact blocker, responsible role, next action and evidence needed for reconsideration.
GO is allowed only when all mandatory criteria pass for one consistent candidate and the required
humans actually sign. A signed NO-GO decision is a completed decision record; it does not mean the
project has entered testing. Do not introduce a conditional-GO path around mandatory requirements.

## 10. Preserve architecture and data safety

Follow `AGENTS.md`: frontend presentation with relative `/api/v1`; backend HTTP/auth/PostgreSQL;
deterministic calculation formulas exclusively in `packages/calculation-engine`; forward-only,
timestamped, checksum-protected migrations owned by the migration role.

Preserve both internal networks, container hardening and Caddy as the only host-published service.
No cloud runtime, external assets, telemetry, pricing/ERP, automatic structural selection or 3/6 m
optimization. Do not broaden the MVP while preparing acceptance.

Normal data stays under `data/`; TEST data/secrets/backups remain isolated under `data/test/`.
Never log or commit passwords, tokens, cookies, secret files, database dumps or raw browser state.
Do not reset persistent databases, execute `docker compose down -v` against normal/persistent TEST,
edit applied migrations or run automatic destructive recovery. Use existing guarded disposable
environments and restore-verification tooling.

## 11. Validation and evidence

For documentation-only preparation run focused formatting, reference and JSON checks. Explain why
runtime tests were not rerun and avoid describing preparation as deployed acceptance verification.

For source changes run `pnpm validate`; for Docker, networking, database, authentication, backup
or infrastructure changes run `pnpm validate:full`. Use `corepack pnpm` with the same arguments
when the Windows shim is unavailable. Run required affected checks and any added evidence-validator
tests without weakening existing assertions, budgets, discovery guards or security scans.

To establish candidate acceptance, reuse current Stage 10 aggregate evidence only when its exact
source/artifact identity matches and the criteria permit reuse; otherwise execute
`corepack pnpm validate:stage10`. Verify relevant Stage 11 behavior with
`corepack pnpm test:stage11`, actual TEST preflight/smoke and TEST backup/restore verification
through the existing commands when the environment and authorization permit them.
Do not launch another aggregate merely to duplicate already-valid evidence.

Record every observed result with command/check, UTC timestamp, environment, commit/source hash,
artifact identity, outcome and sanitized evidence reference. Keep local runs, remote CI and
deployed checks separate. Missing Docker, native Excel access, runner, network, actual deployment
or human sign-off is an explicit limitation; mocks and inferred results cannot replace them.

Review the complete package for valid links, readable procedures, valid JSON, identity consistency,
scope accuracy and secret-safe evidence. Ensure unresolved catalog relationships, historical
security findings, proposed budgets and acceptance blockers remain visible.

## 12. Definition of Done and final report

Report these outcomes separately:

- **Acceptance package prepared**: traceable criteria, candidate baseline, runnable checklist,
  safe defect template/register, evidence and decision protocol are complete and inspectable.
- **Candidate technically verified**: claimed automated and operational checks actually passed
  for matching identities; unresolved checks remain explicit.
- **UAT entry accepted — GO**: all mandatory prerequisites pass, baseline is frozen and genuine
  required human sign-offs authorize internal UAT.

The original Stage 12 Definition of Done is satisfied only by the final GO condition. If external
criteria remain blocked, finish the preparation work and report **ACCEPTANCE PACKAGE PREPARED —
NO-GO**, with incomplete operational checks identified. Do not mark Stage 12 fully accepted.

The final report must name created/changed files, candidate identity and freeze status, actual
TEST URL only if verified, T01–T15 execution/domain-review coverage, roles/revisions/warnings/Excel
outcomes, commands run, carried/new defects, pending sign-offs and exact go/no-go reasons.
Distinguish prepared templates, observed evidence and signed decisions. State the next responsible
roles and actions without claiming unperformed deployment, review or engineering approval.
