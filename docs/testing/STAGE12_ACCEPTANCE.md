# Stage 12 acceptance package

**ACCEPTANCE PACKAGE PREPARED — NO-GO.** This package supports admission to internal UAT.
It does not certify completed UAT, production readiness or structural suitability. Required
human approvals and accepted deployment evidence are absent. Preparation is not permission to enter UAT.

The authority is Section 12, T01–T15, entry criteria and change control in the
[original plan](../../Niedax_Implementation_Plan_to_Test_Phase_BG.docx), read without changing it,
and the [Stage 12 prompt](stage12-prompt.md). The recorded user decision in
[Stage 9 decisions](../exports/stage9-decisions.md) replaces the old 29-column `List1` with
26-column A:Z `Change Order`, `Calculation details` and `Warnings`. No SAP column is invented;
price cells P/Q remain blank. Earlier source/catalog/role contracts remain in force.

## Inspectable package

| File                                           | Purpose                                                                                                           |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| [stage12-baseline.json](stage12-baseline.json) | Versioned provisional candidate, observed artifact hashes, unknown deployment identities, criteria and sign-offs. |
| [UAT_CHECKLIST.md](UAT_CHECKLIST.md)           | Exact T01–T15 procedures, both T09 anchor variants, synthetic versus P0 provenance and separate demo mapping.     |
| [DEFECT_TEMPLATE.md](DEFECT_TEMPLATE.md)       | Safe reproduction, severity, evidence, triage and retest format.                                                  |
| [stage12-defects.md](stage12-defects.md)       | Central accountable blockers and historical defect dispositions.                                                  |
| [stage12-go-no-go.md](stage12-go-no-go.md)     | Decision protocol, scope, required genuine signatures and reconsideration.                                        |
| [stage12-evidence.md](stage12-evidence.md)     | Observations, commands, exact identities, historical evidence scope and limitations.                              |
| [TESTER_GUIDE.md](TESTER_GUIDE.md)             | Existing application and reporting guide.                                                                         |

## Candidate and current readiness

Candidate ID: `stage12-candidate-2026-09-30-3883afdd`. Freeze: **provisional**.
The authoring checkout starts at `3883afddabae42d5a637faea71167e682982f591`, branch
`codex/stage12-acceptance-prompt`, initially clean. This identifies the inspected proposal;
it is not a verified deployed application SHA. The actual accepted TEST URL, deployed SHA,
runtime identities and active database versions are unknown until verified and remain null.
No live operational TEST URL has been verified for this candidate.

The machine baseline is authoritative for status and hashes. Every criterion retains its
responsible role and next action. `pass` requires exact candidate evidence; `fail` records an
observed unmet assertion; `pending` has no completed review/result; `blocked` needs an unmet
prerequisite. A valid report whose decision is NO-GO does not satisfy entry criteria.

| ID  | Original entry criterion                                  | Current status | Evidence and required action                                                                                                                                                                                                                                     |
| --- | --------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E01 | Accepted TEST deployment reachable; smoke passes          | blocked        | Historical local deployment was explicitly unaccepted. TEST operator must provide gated main deployment, actual LAN URL, second-device reachability and matching smoke. S12-B04.                                                                                 |
| E02 | Active catalog; import validation without critical errors | pending        | P0 import and seed tests exist; actual candidate activation/validation/audit identities need observation. [Stage 11 evidence](stage11-evidence.md), S12-B04.                                                                                                     |
| E03 | Agreed calculation rules have unit coverage               | pending        | Retained independent fixtures cover the rules; current verification and domain-approved rule scope must be bound to the deployed candidate. [Stage 10 plan](stage10-test-plan.md).                                                                               |
| E04 | Exact expected T01–T15 results approved                   | blocked        | Human domain review of manifest, all input/result hashes, both T09 variants and proposed performance budgets is pending. S12-B03.                                                                                                                                |
| E05 | No blocking/high-risk or Severity 1/2 defects             | blocked        | [Central register](stage12-defects.md) retains external and scope blockers; historical S10-D01/D02 were fixed and verified.                                                                                                                                      |
| E06 | Roles/approval/immutable revisions verified               | pending        | Existing unit/disposable DB/browser contracts retained; accepted candidate role accounts and journeys still need matching evidence. [Stage 8](../stage8-users-roles-revisions.md).                                                                               |
| E07 | English Excel matches BOM; scoped native open             | pending        | Existing independent parser/golden checks retained. Candidate workbook hash and attributable Excel/no-repair/visual observation missing. S12-B06.                                                                                                                |
| E08 | Warnings separate facts, assumptions and engineering      | blocked        | Automated warning semantics retained; mandatory unresolved P0 material capabilities and NSA environment scope need domain disposition. S12-B07/B08.                                                                                                              |
| E09 | Build/catalog/rule identities visible and retained        | blocked        | Additive deployment identity capture addresses evidence collection. Existing snapshots retain engine/catalog/rule identities but no application Git/image identity. S12-B09 requires a forward contract change or explicit approved external traceability scope. |
| E10 | Tester guide, checklist and central register available    | pending        | Documents are prepared; their exact package hashes must be checked and attached to the selected accepted candidate.                                                                                                                                              |
| E11 | Stage 10/11 dependencies, security, CI, budgets, restore  | blocked        | Queued/cancelled/skipped CI, pending image disposition/domain review and unaccepted local deployment cannot satisfy this gate. S12-B01–B05.                                                                                                                      |

Each row has the same candidate ID and explicit machine status in the baseline. Observation/review
times and references live in its evidence entries; missing execution has no synthetic timestamp.
The local implementation results in [evidence](stage12-evidence.md) are separate from these entry states.

## Verify this package

Use the pinned patched Node.js `24.21.0` and pnpm `11.21.0`. On the prepared Windows
computer, apply the portable runtime prefix from the
[Bulgarian local guide](STAGE12_LOCAL_START_BG.md) before these commands.

```powershell
corepack pnpm test:stage12
corepack pnpm stage12:report
corepack pnpm stage12:report -- --require-go
```

The read-only report defaults to `docs/testing/stage12-baseline.json`. `--input` selects a
repository-relative sanitized JSON file. It checks strict schema, E01–E11 coverage, artifact
hashes, identities, dependency evidence types, freeze, open defects and stale signatures. It
does not contact GitHub/TEST, authenticate signatures, change approvals or authorize deployment.
Exit 0 means a structurally consistent report, including NO-GO; exit 1 means malformed,
unsafe, missing or inconsistent supplied evidence; exit 2 means valid NO-GO with `--require-go`.
Use controlled human review and existing Stage 11 gates for actual admission/deployment.

Artifacts contain file-byte, normalized LF text or engine canonical JSON hashes as declared
per artifact. Canonical JSON uses the existing engine algorithm for JSON values: it sorts object
keys and preserves array order. Candidate digest excludes authoring metadata and freeze/signatures; evidence digest
binds candidate digest, hashing, artifacts, criteria and defects. This avoids a self-referential
authoring Git SHA. Signatures and freeze identify the exact evidence digest they reviewed.

## Freeze and change control

Freeze only after the same accepted deployment has complete immutable images, lockfile,
migration history, active catalog/rule hashes, engine/formula/export/flag identities, exact
regression inputs/expectations, safe demo/revision/export fingerprints, successful CI/deployment,
smoke and restore evidence. Preserve evidence in controlled internal storage and its safe hashes
in the repository. Freeze that reference; keep ordinary draft creation available.

Testers preserve existing baseline revisions and create an owned project through **Create project**,
then enter the checklist's geometry/selections/manual settings and save a new named revision.
There is no general project-clone or revision-restore operation. Route duplication only duplicates
a route inside a permitted draft. Never overwrite baseline projects, recalculate historical
snapshots, activate a live catalog for T13, reset persistent data or disable real accounts.
Run catalog-change and negative-account cases through existing disposable harnesses.

A changed application build, catalog/product fact, rule/formula, input/expectation, export
implementation or material flag configuration needs a change record, impact assessment,
affected retests, new digests and renewed human approval. Formula/catalog changes follow
versioning rules; expectations cannot be regenerated to hide a mismatch. Documentation changes
need an explicit behavioral impact assessment; unrelated wording may reuse matching behavior
evidence, but reviewed package evidence/signatures must remain current. Follow the
[Stage 10 review process](stage10-regression-review.md) and [TEST runbook](TEST_ENVIRONMENT.md).

The product/domain owner decides material scope and quantities; the technical/security owners
decide technical dispositions; the TEST operator supplies operational evidence. Their genuine
GO signatures are required after every mandatory criterion passes. No conditional-GO path exists.
