# Stage 10 Automated Tests and Integration Stabilization

## How to use this file

Open the Niedax Generator repository root in VS Code and give Codex this file as task context.
Use this instruction:

> Read `Stage_10_Automated_Tests_and_Integration_Stabilization_Codex_Prompt.md` and execute it
> completely in this repository. Implement Stage 10, run the required checks, investigate and fix
> failures, and produce the evidence and review package specified below. Do not stop after planning.
> Preserve existing user changes and report any remaining acceptance gates honestly.

Everything below is the execution prompt. Paths are relative to the repository root. This file
instructs a future implementation run; it is not evidence that Stage 10 has already passed.

## Mission and scope

Implement **Stage 10: Automated tests and integration stabilization** from Section 10 of
`Niedax_Implementation_Plan_to_Test_Phase_BG.docx`. Prove the correctness of the calculation rules,
database, API, and main user workflows by extending the existing implementation from Stages 5–9.
Fix defects exposed by the tests within the approved architecture and product scope.

The source plan requires all eight workstreams:

1. Unit tests for sections, joints, supports, reserve, packaging rounding, templates, and manual items.
2. Property and edge tests for zero/negative values, exact multiples, decimals, and large quantities.
3. Integration tests for database transactions, snapshots, imports, and permissions.
4. Playwright browser tests for create project → routes → connection → calculate → revision → export.
5. Controlled synthetic scenarios because historical decomposed project examples are unavailable.
6. Regression fixtures governed by approved rule/catalog version changes.
7. Security checks for input validation, authorization, secrets, dependencies, and export safety.
8. Defined performance targets and measurements for typical and large projects.

Deliver an automated suite wired into CI, synthetic fixtures with independently justified expected
BOM results, and documented limitations. The plan's Definition of Done is: all critical tests pass,
no unresolved severity-1 or severity-2 defects remain, and a domain reviewer approves the regression
results. Automated success and human approval are separate gates.

Do not implement Stage 11 deployment/operational rollout or Stage 12 UAT/go-no-go. Disposable
environments needed for Stage 10 tests and CI are in scope. Pricing, ERP, structural approval,
automatic anchor capacity selection, 3 m/6 m optimization, and new product families remain outside
this task. Do not redesign working modules merely to increase test counts.

## Read the sources and resolve the current baseline

Read `AGENTS.md`, any more specific applicable agent instructions, `CONTRIBUTING.md`, `README.md`,
`package.json`, the test/build configuration, and the source plan before editing. Extract the Word
plan read-only if necessary; preserve the original file. Read Sections 5–10, the T01–T15 scenario
table, the test-entry criteria, and change-control rules. Sections 11–12 define the scope boundary.

Use these existing documents and implementations to resolve details:

- Architecture: `docs/architecture/module-boundaries.md`, `docs/architecture/api-contracts-v1.md`,
  `docs/architecture/idempotency-and-transactions.md`, and the relevant ADRs.
- Domain/UX: `docs/ux/mvp-input-contract-v1.md`, `docs/ux/data-dictionary.md`,
  `docs/ux/automatic-actions.md`, and `docs/ux/validation-and-error-states.md`.
- Catalog: `docs/catalogs/catalog-import.md` and the versioned P0 catalog and rules.
- Engine: `docs/calculation-engine/overview.md`, `formulas.md`, `stage6-decisions.md`,
  `stage6-evidence.md`, and `packages/calculation-engine/tests/`.
- Application and access: `docs/stage7-web-application.md`,
  `docs/stage8-users-roles-revisions.md`, `docs/authentication.md`, and backend/domain tests.
- Export: `docs/exports/stage9-decisions.md`, `stage9-column-mapping.md`,
  `stage9-template-inventory.md`, `stage9-evidence.md`, `stage9-usage.md`, and
  `packages/export/tests/README.md`.
- Test operations: `docs/operations.md`, `docs/security.md`, `docs/migrations.md`,
  `docs/backups.md`, `scripts/db-check.ts`, `database/tests/compose.check.yaml`,
  `scripts/stage9-browser-environment.ts`, `scripts/lib/stage9-browser-config.ts`, and
  `scripts/test-backup-integration.ts`.

Earlier stage prompts explain historical intent. Current accepted decisions and explicit recorded
user changes resolve superseded details. Do not silently treat current code as proof of correctness
when it conflicts with an accepted rule; document the conflict and investigate it.

### Accepted Excel change that must be preserved

The original plan and Stage 9 prompt say 29-column `List1`. The user subsequently approved the
supplied **26-column A:Z `Change Order`** template, as recorded in the Stage 9 decisions and evidence.
This is the current T15 target. Keep the exact sheet names `Change Order`, `Calculation details`,
and `Warnings`. Do not restore the obsolete 29-column layout or invent a SAP column.

Preserve the accepted mapping: B technical quantity, G package increment, I package count,
C ordered quantity, and D total spare. Price cells P/Q remain blank. Values come from saved
snapshots; production export does not calculate quantities. Retain the independent OOXML checks
and approved-layout golden. The separate synthetic 29-column workbook tests only renderer machinery.

Stage 9 records a user-observed successful Excel opening of the actual downloaded workbook.
Attribute that historical evidence correctly. A new parser or Playwright pass is not a new observed
Microsoft Excel no-repair result. Recheck native Excel if Stage 10 changes workbook generation;
otherwise preserve the prior evidence with its exact artifact/version scope.

### Discovery findings to verify before implementation

At prompt preparation, the repository has Vitest, test-only fast-check, seven engine golden input/
expected pairs, independent export expectations, and disposable database acceptance. No Playwright
suite/configuration, CI workflow, `test:e2e` command, or performance command was found.

Investigate these specific gaps rather than assuming existing test names prove coverage:

- `packages/calculation-engine/tests/property.test.ts` contains properties exercising local
  arithmetic expressions; its full-engine property varies a diagnostic iteration value but calls
  `calculateV2` with the same fixture. Add properties that actually vary valid engine inputs.
- Root Vitest discovery currently includes `{apps,packages,database,scripts}/**/*.test.ts`;
  integration discovery uses `*.integration.test.ts`. New folders and Playwright specifications need
  explicit runner separation and TypeScript/ESLint coverage.
- Backend disposable acceptance currently explicitly runs
  `apps/backend/tests/project-flow.integration.test.ts`. New integration files must be wired into
  that execution path to run against PostgreSQL.
- Two credentialed application scenarios currently require `STAGE7_ACCEPTANCE=1` and are skipped
  in ordinary integration runs. Record their execution inside `db:check`; ordinary in-memory
  authentication tests are not PostgreSQL acceptance evidence.
- `validate:full` includes normal-project container start/stop/start persistence checks and runtime
  isolation probes. It is not wholly disposable. All credentialed/data-mutating scenarios must
  remain in disposable projects; retain the non-destructive normal-project checks accurately.

Record `git status --short` and the starting commit before changes. Do not reset, stash, overwrite,
commit, or push unrelated work. Inspect package-manager and Docker availability without printing
credentials. Record fresh baseline results and separate inherited failures from regressions.

## Non-negotiable engineering boundaries

- `apps/frontend` is presentation-only and calls relative `/api/v1` URLs. It receives no database
  credentials and contains no product calculation formulas.
- `apps/backend` owns HTTP, authentication, authorization, transactions, and PostgreSQL access.
- Product calculation formulas exist exclusively in `packages/calculation-engine`, which remains
  deterministic, framework-independent TypeScript without I/O. Put independent mathematical test
  references inside its test tree; elsewhere compare saved/literal expected values.
- `packages/export` maps and renders immutable saved evidence. Do not recalculate, look up live
  product facts, or mutate revisions when exporting.
- Preserve the internal `edge`/`backend` network separation and all hardening controls. Retain the
  documented Docker Desktop gateway/ingress exception; do not interpret the two-network boundary
  as permission to remove its justified ingress support.
- Only Caddy publishes a host port. Disposable stacks also publish only their Caddy gateway,
  preferably bound to loopback. Never expose Frontend, Backend, or PostgreSQL to the host.
- Do not add cloud services, external runtime assets, telemetry, public tunnels, or runtime internet
  dependencies. Browser/test dependencies belong to development tooling, not application images.
- Never print secrets, session cookies, authorization headers, passwords, or complete sensitive
  request bodies. Never commit `data/`, dumps, customer workbook content, browser storage state,
  credentials, raw traces, logs, or build output. Use generated synthetic test accounts.
- Preserve forward-only, timestamp-prefixed, checksum-protected migrations owned by the migration
  role. Never edit applied migration SQL, disable constraints/triggers, or widen application grants
  to make a test pass. A necessary migration must pass `pnpm db:check`.
- Never reset the normal persistent database or run `docker compose down -v` against it. Cleanup
  must validate the exact disposable project, volume, and resolved paths before deletion. Avoid
  global Docker cleanup and never change the host firewall as part of this task.
- Preserve existing schemas/readers, explicit decimal/null semantics, versioned snapshots, role
  boundaries, audit integrity, idempotency, and optimistic concurrency.

## Execution steps

### 1. Build a traceable test plan and synthetic reference set

Create `docs/testing/stage10-test-plan.md` with a requirement-to-test matrix. Each requirement and
T01–T15 scenario must point to its fixture, exact automated test, expected outcomes, runner, and
execution evidence. Map existing passing tests before adding missing coverage. Mark tests critical
by behavior, not by their current pass/fail state.

Retain the following scenario IDs and original intent:

| ID  | Controlled scenario                                 | Required independent checks                                                                                   |
| --- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| T01 | KL 60, 100 m, 6 m sections, no fittings             | Section count, unused section length, joints, and KLTB demand; actual order unit and supply evidence          |
| T02 | WSL 105, 100 m, WSTB = 2                            | Support count and dedicated WSTB demand; project-rule status retained                                         |
| T03 | Exact 6 m segment and 8.5 m segment                 | Separate rounding, exact multiples, and immediately adjacent decimal boundaries                               |
| T04 | Two named routes with logical continuation          | Continuous support/joint ownership without duplicate boundary materials                                       |
| T05 | Two named routes with a physical joint              | Exactly the proven connector/fastener event and correct support behavior                                      |
| T06 | Horizontal bend with manual additional supports     | Fitting-port rules, additional supports, reason, and manual trace                                             |
| T07 | T-connection with three endpoints                   | Participant validation, compatibility, event ownership, and material count                                    |
| T08 | Capped end and equipment end                        | Proven automatic materials, missing-data behavior, and no duplicate connection event                          |
| T09 | DAM and DAZ anchor variants in an assembly          | Exact product/size, per-axis quantity, package rounding, ETA/engineering warning                              |
| T10 | NSA anchor                                          | Indoor-only and concrete constraints; missing/incompatible context warnings and approval effect               |
| T11 | 5% reserve and packaging                            | Technical, reserve, reserved, package increment/count/overage, ordered, and total spare kept distinct         |
| T12 | Manual Niedax catalog product and free-text item    | Add/edit/remove, Manual marking, identity, reason, and independent reserve/package policies                   |
| T13 | Saved revision followed by a new active catalog     | Old inputs/products/rules/BOM/warnings/checksums/export stay unchanged; new draft uses explicit pins          |
| T14 | Designer versus Reviewer/Administrator, plus Viewer | Ownership/capabilities, check/approve restrictions, read-only access, revoked sessions, and audit             |
| T15 | English Excel from a saved revision                 | Approved 26-column Change Order layout, details/warnings, literal codes, exact saved quantities, blank prices |

Make every fixture fully specified: units, lengths, segment selection, support spacing, topology,
product/supply IDs, compatibility evidence, template, anchors, reserve/pack policies, and pinned
catalog/rule/engine versions and hashes. The short scenario descriptions alone are not executable
inputs. Identify synthetic products/rules explicitly; never present them as catalog-confirmed facts.
If P0 lacks a required confirmed mapping, test the accepted unresolved behavior and document the
gap; do not fabricate compatibility or suppress engineering warnings.

For each scenario store a small human-readable expected-result explanation and exact expected BOM,
warnings, and trace references. Derive expectations independently from accepted rules and versioned
source facts. For example, Section 6's accepted 3.1 m plus 2.9 m at 6 m selection must remain two
sections; compatible logical 6 m + 6 m routes at 1.5 m support spacing must retain the documented
nine-support result, with ten when treated separately. These are regression checks, not new rules.

Reuse the existing seven golden cases where they cover scenarios, adding focused cases where needed.
Do not force 15 redundant full snapshots or mistake one large golden for complete scenario coverage.
Do not compute expected output by calling the same engine/renderer being tested.

### 2. Strengthen unit, property, and boundary tests

Exercise the public calculation entry point and observable results, with focused unit tests where
they isolate meaningful arithmetic/rule boundaries. Cover:

- Per-segment 3 m/6 m selection, no automatic mixing, exact multiples, just below/above boundaries,
  and demand aggregation that respects unit, supply option, policy, provenance, and manual identity.
- Internal joints, fitting ports, logical continuation, physical joints, three-participant
  connections, included fasteners, and endpoint/connection ownership without double counting.
- Continuous support groups, physical breaks, incompatible support configurations, manual support
  changes, assembly component scopes, anchors, and WSTB one/two/custom policy.
- Reserve after technical demand and packaging last; separate deltas, null package counts when
  disabled, zero where allowed, integral pieces, and continuous manual m/kg quantities.
- Catalog/manual items, overrides and reasons, missing-data policies, warnings, approval-blocking
  flags, trace completeness, and reconciliation of every final BOM line.
- Invalid units, malformed/negative values, invalid zero lengths/spacing/package increments,
  permitted zero reserve/adjustments, canonical decimal limits, and very large valid values.
  Distinguish schema rejection from accepted warning/omission policies; never require zero to be
  either universally accepted or universally rejected.
- Deterministic output under repeated execution and permutations of semantically unordered arrays;
  do not permute physically ordered geometry and then assert unchanged topology.

Use reproducible fast-check seeds and record the shrunk counterexample/seed on failure. Generate
multiple schema-valid inputs that vary actual geometry, counts, policies, templates, and applicable
topologies. For valid domains, check conservation/reconciliation, monotonic demand with other inputs
fixed, package multiples, non-negativity, integer pieces, valid references, and deterministic replay.
Ensure generators reach boundary values; an unused random iteration variable is not property coverage.

Avoid copying implementation formulas into tests without an independent check. Use literal reviewed
examples and independent test-only references under `packages/calculation-engine/tests` as appropriate.
Do not add blanket coverage thresholds merely to inflate a score. If collecting coverage, install and
wire the compatible test provider and use uncovered branches to assess missing critical behavior.

### 3. Prove persistence and authorization with real PostgreSQL

Extend the existing disposable migration/application harness. Ensure new test files are actually
discovered in the backend acceptance image/command. Keep fresh migration/seed/checksum verification
and repeat-cycle guarantees. Use production services and application-role connections for operations;
use privileged test setup only for explicit synthetic fixture preparation or constraint probes.

Verify at minimum:

- Atomic Calculate/Save/Check/Approve/import activation/export transitions. Inject a controlled
  failure after an intermediate write and prove rollback leaves no partial revision, projection,
  approval, artifact finalization, audit success event, or idempotency success result.
- Same-key replay, conflicting payload/key reuse, actor scoping, and current authorization on replay.
  Use coordinated concurrent requests to test revision numbering, stale draft versions, stale
  lifecycle state, simultaneous saves/checks/approvals, and atomic catalog activation.
- Exact immutable snapshots and lossless BOM/warning/trace projections. Later edits, recalculation,
  new revisions, catalog/rule activation, and export requests must not rewrite saved evidence.
  Historical exports must use saved data even when live records have changed.
- Catalog draft → validate → approve → activate → archive, invalid/missing attributes and
  compatibility, unauthorized transitions, and no partial activation after failure.
- All four roles, owned versus other-owner projects, unauthenticated and disabled users, role/status
  changes that revoke sessions, last enabled Administrator protection, and resource non-disclosure.
  Follow the current capability matrix: Reviewer cross-project read/check/approve does not grant
  cross-owner draft editing. Viewer may read/download existing exports but cannot create one.
- Latest eligible Calculated → Checked → Approved transitions, denied Designer approval, saved
  approval blockers, and immutable approved revisions. Hidden buttons alone do not enforce access.
- Export pending/ready/failed states, cache/lifecycle identity, recovery after interrupted claims,
  stale claim rejection, current access on status/download, and immutable complete ready bytes.
- Audit actor/action/correlation evidence, append-only protection, and no sensitive error details.

Use the existing disposable backup test to retain byte-identical export storage and metadata after
restore. Do not use normal data or disable database protections to inject test failures. Mock-only
repository tests can supplement but cannot replace these database assertions.

### 4. Add reliable Playwright end-to-end tests

Add a pinned, development-only Playwright test dependency, explicit configuration, typed fixtures,
and a documented `pnpm test:e2e` command. Reuse and carefully generalize the guarded Stage 9 browser
environment instead of copying it without its safety checks. Preserve its existing command behavior
or document compatible replacements. Validate project/port/path/image/volume/network boundaries
before every Compose operation, including cleanup; retain tests for these guards.

The browser stack must use the real built frontend, backend, PostgreSQL, migrations, catalog/rules,
and Caddy. Provision synthetic role accounts and versioned fixture data in a disposable database.
The default command must start, wait for health, test, and clean up its own environment, including
on failure. Avoid port/project collisions; a diagnostic keep-on-failure option must be explicit.
Keep credentials/storage state outside committed files and redact or disable credential-bearing
traces, network logs, videos, screenshots, and CI attachments.

Implement an actual UI-driven critical journey:

1. Sign in as Designer and create a new project with explicit locale and valid catalog selections.
2. Create two named routes with geometry, endpoints, supports, and a logical or physical connection.
3. Wait for autosave, reload, and prove persisted inputs without an unintended revision.
4. Calculate and verify the BOM, included items, warning severity, provenance, and selected expected
   quantities. Recalculation must not silently create revision history.
5. Add/edit/remove a manual item through the UI and verify marking, persistence, and calculation.
6. Save a named revision with a comment, reload it, and check identity, number, status, and saved BOM.
7. In a separate role workflow, have Reviewer/Administrator check and approve an eligible revision;
   also prove blocked approval for a scenario with saved approval-blocking warnings.
8. Request export for the selected saved revision, wait for real completion, capture the actual
   browser download, and independently inspect its OOXML and saved expected quantities.
9. Edit the draft/save a later revision and prove the earlier revision and downloaded artifact stay
   unchanged. Verify read-only historical review and Viewer download without export creation.

Setup APIs may provision prerequisite accounts/catalogs and cleanup. Do not create the project,
routes, calculation, revision, or export with APIs and then label the main journey UI coverage.
Do not intercept the happy-path backend with mocks. Targeted recovery tests may inject failures,
provided the real successful journey and separate PostgreSQL checks remain intact.

Cover BG and EN application flows while keeping workbook labels in English, keyboard interaction,
at least one narrow viewport, validation errors, loading/double submission, stale-input conflicts,
and recoverable calculate/export failures. Assert states and behavior, not unstable CSS snapshots.
Use accessible locators, condition-based waiting, bounded timeouts, isolated contexts, and no fixed
sleeps. Unexpected application console/page errors fail the test.

Use Chromium as the required browser baseline. Document the actual browser/version and any broader
compatibility coverage. Preserve LAN HTTP behavior when secure-context crypto APIs are unavailable;
localhost-only execution cannot by itself prove that case. Retain focused fallback tests and add a
controlled LAN-style browser check where feasible without changing firewall or exposure boundaries.

A retry must not hide a flaky critical test. Record first-attempt failures and fix their cause.
During stabilization run the critical journey repeatedly on fresh isolated state with retries off;
do not repeatedly rerun an unchanged failing suite until it happens to pass.

### 5. Perform focused security verification

Add or retain automated cases for strict body/query schemas, unknown fields, size/precision limits,
invalid IDs, HTML/script-like user text, ownership bypass, forged lifecycle/role fields, missing or
wrong Origin/CSRF, expired/revoked sessions, and idempotency/cache authorization.

Test export literal strings beginning with `=`, `+`, `-`, `@`, whitespace/control characters, and
leading-zero codes. Verify canonical decimal preservation, null/zero differences, safe filenames,
attachment/media type/length/digest, private cache policy, `nosniff`, and denied cross-owner access.
Independent OOXML checks must reject unintended executable formulas, macros, external workbook
relationships, invalid references, and truncated/corrupt ZIP output. Approved production quantity
cells remain saved values. Preserve the retained duplicate trace occurrences by source path/sequence;
do not collapse evidence because two occurrences share an ID.

Review tracked files and built runtime assets for secret exposure and external runtime references
without printing matching secret values or opening `data/secrets`. Keep diagnostics to safe file
locations and finding categories. Verify ignore rules and CI artifact filters exclude credentials.

Run the package manager's dependency audit for production and development dependencies, for example
`corepack pnpm audit --prod --json` and `corepack pnpm audit --json`, after checking supported options.
Record date, tool, advisory IDs, affected paths, runtime/dev reachability, severity, fix, and result.
An offline/unavailable registry is an unexecuted audit, not a clean audit. Use normal permission
handling for required network access; do not add runtime internet access. Apply minimal compatible
fixes and rerun affected checks. Do not suppress advisories, blindly update all dependencies, or use
an audit-fix override as evidence of safety. Explicitly triage remaining findings in the defect log.

### 6. Define and measure performance

Create reproducible synthetic benchmark inputs and `docs/testing/stage10-performance.md`. Inspect
current schema/body/export limits before choosing sizes; do not weaken limits to fit a benchmark.
Use a typical target of 10 routes/100 total segments and a large target of 100 routes/1,000 total
segments, including connections, supports, fittings, and manual items. Record actual entity counts,
input bytes, BOM lines, warning/trace counts, snapshot size, and export bytes. If these sizes exceed
an existing accepted limit, document it and choose the largest valid case before measuring.

Use these as provisional engineering budgets unless an accepted project target already exists:

| Operation measured after warm-up                            | Typical project p95 | Large project p95 |
| ----------------------------------------------------------- | ------------------- | ----------------- |
| Pure calculation engine                                     | 1 second            | 5 seconds         |
| Authenticated calculate request through Caddy               | 3 seconds           | 10 seconds        |
| Save immutable revision through Caddy                       | 3 seconds           | 10 seconds        |
| New export request until ready, excluding download transfer | 10 seconds          | 45 seconds        |

Record targets before measuring and label them as proposed until reviewed. Do not raise budgets or
shrink the fixture after a failure merely to obtain a pass. Keep targets compatible with the actual
UI polling deadline/attempt count, worker deadline, and API timeouts; expose any mismatch.

Measure engine and end-to-end operations separately. Exclude install/build/browser startup from
request timings, measure cold start separately, and distinguish a fresh export from cache hits.
Use at least 3 warm-up and 20 measured samples per case where practical; disclose any smaller sample
and its limitation. Record individual timings, p50/p95/max, peak memory where measurable, tool/runtime
versions, CPU/RAM, Docker limits, build/fixture hashes, and failure rate. Avoid simultaneous heavy
validation during benchmarks. Verify result correctness while benchmarking so a fast partial result
cannot pass. Keep timing data out of deterministic calculation output.

Provide a documented `pnpm test:performance` command with explicit exit status on budget violations
for the stated reference environment. CI must execute the benchmark and report its hardware context;
do not silently gate on incomparable host measurements. Investigate bottlenecks without changing
business semantics, weakening checks, or adding speculative caching/concurrency.

### 7. Govern regression fixtures and triage defects

Create `docs/testing/stage10-regression-review.md` and `docs/testing/stage10-defects.md`.
For every baseline record scenario IDs, exact fixture/expected hashes, rule/catalog/engine versions,
expected quantities/warnings, independent derivation, change reason, and review status.

Keep candidate generation separate from acceptance. Ordinary tests and CI must never update golden
files. Do not use `pnpm calculation:golden:update` or export candidate generation to overwrite
accepted expectations just because the implementation differs. A business formula change requires
a new calculation rule version; product-attribute changes require a catalog version/correction with
audit evidence. Present changed expected results and rationale for explicit domain review before
promoting them. Preserve old fixtures/snapshot readers. New scenarios at unchanged versions may add
coverage but their expected results still need review.

For a proven implementation defect against unchanged accepted semantics, add the failing regression,
make the minimal fix, and record whether engine version and affected persisted-result policy must
change. Never rewrite historical revisions. Correcting an erroneous expected fixture also requires
an explained diff and reviewer decision; it is not an automatic snapshot refresh.

Use a concrete severity model: severity 1 covers data loss/corruption, unauthorized access, or
unusable critical flows; severity 2 covers wrong material/order quantities, broken immutability/
approval, or critical workflow failure without a safe workaround. Record reproduction, expected/
actual behavior, affected versions, owner, fix, regression test, retest evidence, and open/closed
status. Do not downgrade a defect simply to satisfy acceptance. Keep lower-severity limitations and
workarounds visible.

### 8. Wire the suite into CI and complete validation

Inspect existing repository remote/provider configuration before selecting a CI format. Use the
existing provider if configured. If none is configured, provide a provider-neutral local CI entry
script and a documented pipeline configuration for a self-hosted Docker-capable runner, recording
the remaining provider/runner setup. Do not register services, publish code, or provision cloud
infrastructure. A checked-in workflow plus local execution is not proof that a remote CI job ran.

Pin dependencies and install from the lockfile. Explicitly install the pinned Playwright browser
during CI/test setup, keeping application runtime offline. Wire formatting, lint, all relevant
TypeScript checks, unit/property/golden suites, builds, real database acceptance, ordinary integration,
container/network/backup validation, Playwright, dependency audit, and performance. Test orchestration
must propagate nonzero exits and must never weaken or silently skip existing gates.

Required repository commands remain:

```powershell
corepack pnpm validate
corepack pnpm validate:full
```

`validate:full` already includes `validate` and `db:check`, so one final successful full run can
satisfy those component gates. During development use the narrow relevant suites, then run the full
gate after the final changes. Stage 10 spans database/authentication/test infrastructure and therefore
requires `validate:full`, even if a particular edit appears to affect only a test.

Add and document these Stage 10 entry points, or equivalent names integrated into the existing gates:

```powershell
corepack pnpm test:e2e
corepack pnpm test:performance
corepack pnpm test:security
corepack pnpm validate:stage10
```

`validate:stage10` must orchestrate the complete required gates, including `validate:full`, browser,
security/audit, performance, and fixture/coverage-manifest integrity. Avoid duplicate execution of
heavy gates already included. Every new command listed as available in final documentation must
exist and be exercised. Keep configuration/spec/helper code inside explicit lint/typecheck coverage;
keep Playwright specs out of Vitest discovery.

Use `pnpm` normally or `corepack pnpm` on Windows when the shim is unavailable. Inspect the installed
pinned versions rather than updating them unnecessarily. The prior Stage 9 workaround for pnpm's
auto-install shim is historical context only; diagnose the current failure and prove dependencies
installed before using any documented equivalent. Do not bypass test stages or dependency auditing.

CI must fail for missing critical scenarios, zero-test discovery, unexpected skips, failed commands,
unaccepted golden drift, or missing required evidence. Run conditional database tests in their
required environment. Expose expected and actual suite counts, passed/failed/skipped counts, and
scenario IDs so an empty or partially discovered suite cannot look green.

Retain sanitized machine-readable reports and human-readable summaries with commit/build and fixture
identity. Upload only explicit safe artifact paths with bounded retention. Cleanup runs even after
failure and reports its own outcome without hiding the original error. On shared self-hosted hosts,
isolate each job and prevent normal-project stop/start checks from disrupting another job or a user's
working stack; use a dedicated runner workspace/project configuration with the same validated topology.

If Docker, browser binaries, network audit access, or CI credentials are unavailable, complete all
independent work and report the exact blocked gate and runnable remediation. Never replace a required
browser/database test with a manual checklist and call Stage 10 complete.

## Deliverables and acceptance evidence

Implement the missing tests, fixtures, safe environment/orchestration, CI configuration, and minimal
defect fixes. Update README/CONTRIBUTING only where commands or workflow need clarification. Produce:

- `docs/testing/stage10-test-plan.md`: all eight workstreams and T01–T15 mapped to executable tests.
- `docs/testing/stage10-regression-review.md`: exact expected results, derivations, immutable baseline
  identity, candidate diffs, and domain-review fields.
- `docs/testing/stage10-security.md`: executed checks, dependency findings/triage, and artifact safety.
- `docs/testing/stage10-performance.md`: fixture sizes, proposed/accepted budgets, methodology, actual
  measurements, environment, and pass/fail outcomes.
- `docs/testing/stage10-defects.md`: defects, fixes/retests, known limitations, and remaining blockers.
- `docs/testing/stage10-evidence.md`: final command results, CI run identity or pending setup, browser
  evidence, database-cycle evidence, cleanup result, and the acceptance matrix below.

| Gate                          | Evidence required to mark passed                                                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| S10-01 Rules and edges        | Executed rule/unit/property tests with actually varied input, boundary coverage, and valid independent expectations                        |
| S10-02 Synthetic regression   | All T01–T15 mapped; versioned fixtures and expected BOM/warnings; retained golden baselines unchanged or explicitly reviewed               |
| S10-03 PostgreSQL integration | Fresh disposable cycles run the intended test files; transaction rollback, concurrency, imports, permissions, and immutable snapshots pass |
| S10-04 Browser workflow       | Real Playwright UI creation through download; BG/EN, role restrictions, keyboard/narrow viewport, and recovery evidence                    |
| S10-05 Export correctness     | Actual downloaded bytes reconciled independently to selected saved revision and authorized 26-column mapping                               |
| S10-06 Security               | Input/access/export checks and current dependency audit executed; no unresolved severity-1/2 security defects                              |
| S10-07 Performance            | Typical/large measurements against declared budgets with correctness checks, hardware context, and no hidden failures                      |
| S10-08 CI and validation      | Required gates execute with correct discovery and exits; actual CI outcome identified, or CI execution explicitly pending                  |
| S10-09 Stabilization          | All critical tests pass; no unresolved severity-1/2 defects; lower-severity limitations documented                                         |
| S10-10 Domain acceptance      | Identified domain reviewer approves exact scenario/fixture/result hashes and any proposed budgets or semantic changes requiring review     |

For each gate record `passed`, `failed`, or `pending`, evidence path/test/command, timestamp, and any
remaining action. Distinguish agent-observed runs, historical documentation, and human observations.
Never invent CI URLs, measurements, passing counts, Excel observations, or reviewer approval.

Complete all authorized implementation, corrections, and verification before requesting the final
domain review. Populate a concrete review package with expected quantities, warnings, source/rule
rationale, candidate changes, and exact hashes. Ask only for missing business decisions or external
access that cannot be resolved from accepted sources; continue independent work meanwhile.

If human approval has not been provided, report **technical verification complete; domain approval
pending** only when the technical gates actually passed. Do not claim full Stage 10 completion or
move into Stage 11 until the complete Definition of Done is satisfied.

## Final response for the implementation run

Lead with the actual outcome and remaining acceptance status. Include:

1. Implemented changes and defects fixed, with relevant file links.
2. Coverage of T01–T15 and the eight Stage 10 workstreams, including real discovery/skips.
3. Executed commands, exit status, meaningful test totals, and CI run/status.
4. Typical/large performance results and unresolved security findings, if any.
5. Location of the evidence, defect log, and concrete domain-review package.
6. Any pending gate with its precise next action; no automatic claim of domain signoff.

End by checking `git diff --check` and `git status --short`. State that no normal database reset
occurred, describe disposable cleanup, and make no commit/push/deployment unless separately requested.

## Prompt preparation reference

The execution structure follows official [Codex prompting guidance](https://learn.chatgpt.com/docs/prompting):
name the desired behavior, point to relevant code and context, preserve constraints, and specify
concrete verification. Product requirements and acceptance rules come from the local implementation
plan and accepted project decisions listed above. This reference is explanatory; implementation
does not require online OpenAI documentation or an OpenAI API integration.
