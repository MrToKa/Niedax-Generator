# Stage 11 — Test Environment and Operational Readiness

## Repository

Project:

`MrToKa/Niedax-Generator`

Work from the current repository state.

At the time this Stage 11 prompt was prepared, the inspected `main` HEAD was:

```text
e4a421b349a65b2779dfa2837f4994eef258fa70
```

Do **not** assume that this SHA is still HEAD when implementation begins.

First inspect the actual current branch, HEAD, working tree, applicable `AGENTS.md` files, documentation, workflows, package manifests, Docker configuration, migrations, tests, and Stage 10 evidence.

Preserve unrelated user changes.

Do not commit, push, merge, register runners, alter host firewall configuration, or deploy to a real server unless explicitly requested by the user.

---

# 1. Goal

Implement **Stage 11 — Test Environment and Operational Readiness**.

The goal is a:

- reproducible;
- isolated;
- observable;
- versioned;
- internally deployable

TEST environment for the Niedax Generator.

It must build on the infrastructure already implemented in Stages 1–10 instead of creating parallel replacements.

The final TEST environment must support internal testing by:

- Designer;
- Reviewer;
- Administrator;
- Viewer.

It must remain consistent with the project's local-first, Docker-based, PostgreSQL-backed and LAN-accessible architecture.

---

# 2. Mandatory Stage 10 Entry Gate

Stage 11 depends on Stage 10.

Before implementing Stage 11, inspect at least:

```text
docs/testing/stage10-evidence.md
docs/testing/stage10-defects.md
docs/testing/stage10-security.md
docs/testing/stage10-ci.md
docs/testing/stage10-regression-review.md
docs/testing/stage10-regression-manifest.json
.github/workflows/stage10.yml
package.json
```

At the repository state inspected when this prompt was written, the local Stage 10 automated suite had passed, but full Stage 10 acceptance was still explicitly pending in three areas:

1. runtime Docker image security reassessment/disposition;
2. actual remote GitHub CI execution on the dedicated runner;
3. human/domain approval of the exact T01–T15 regression identities and proposed performance budgets.

Do not silently change those states to "passed".

Do not manufacture reviewer approval.

Do not claim that a remote CI workflow ran if it did not.

Do not claim that runtime images are clean based only on the npm/source security checks.

### Required Stage 11 behaviour

Implement the Stage 11 infrastructure even when technically possible, but separate:

```text
IMPLEMENTATION COMPLETE
```

from:

```text
OPERATIONAL TEST DEPLOYMENT ACCEPTED
```

If Stage 10 acceptance blockers remain when Stage 11 implementation finishes, the final report must clearly state:

```text
Stage 11 implementation is present, but operational activation remains blocked by unresolved Stage 10 entry criteria.
```

A persistent internal TEST deployment must not be represented as formally accepted until Stage 10 entry criteria are satisfied.

---

# 3. Existing Infrastructure — REUSE IT

The repository already contains substantial infrastructure.

Do not recreate these mechanisms from scratch.

## 3.1 Docker topology

`compose.yaml` already contains:

- PostgreSQL;
- migrations service;
- backend;
- frontend;
- Caddy gateway;
- backup tools service.

It already includes:

- health checks;
- internal Docker networks;
- hardened containers;
- bounded Docker JSON logging;
- PostgreSQL secrets;
- migration dependency ordering;
- port 8080 gateway exposure;
- runtime telemetry disabled where applicable.

Preserve this architecture.

Do not introduce Kubernetes, cloud orchestration, a second reverse proxy, or a second database platform.

---

## 3.2 Health endpoints

The backend already exposes:

```text
GET /api/v1/health/live
GET /api/v1/health/ready
```

`live` verifies process liveness.

`ready` verifies PostgreSQL connectivity.

Do not create duplicate health endpoints.

Extend existing health/status behaviour only where Stage 11 requires additional information.

---

## 3.3 Version endpoint

The backend already exposes:

```text
GET /api/v1/version
```

and currently reports:

- application version;
- catalogue manifest version;
- rules manifest version.

Frontend version sources already exist as well.

Do not replace this mechanism.

Stage 11 must extend the version/diagnostic model to include build identity and TEST-environment information while maintaining backward compatibility with existing consumers and tests.

---

## 3.4 Logging and correlation IDs

The application already uses Fastify structured logging.

The architecture already contains:

```text
StructuredLogger
LogContext
correlationId
actorId
projectId
revisionId
errorCode
```

and HTTP responses already expose correlation IDs.

Do not introduce a second logging framework.

Extend the existing infrastructure.

---

## 3.5 Database migrations and seeds

Existing commands include:

```text
pnpm db:migrate
pnpm db:status
pnpm db:seed
pnpm db:check
pnpm db:reset:test
```

Forward-only, checksum-protected migrations are already established.

Do not introduce another migration framework.

Do not create down migrations.

Do not edit previously applied migrations.

---

## 3.6 Backup and restore

Existing commands already include:

```text
pnpm backup:create
pnpm backup:list
pnpm backup:verify
pnpm backup:restore
pnpm backup:prune
pnpm test:backup-integration
```

Current implementation already provides:

- PostgreSQL custom-format backups;
- SHA-256 sidecars;
- archive validation;
- 28-day retention;
- manual destructive restore confirmation;
- safety backup before restore;
- migration verification after restore;
- privilege reconciliation;
- integration testing.

Do not replace this system.

Stage 11 must adapt/reuse it for the dedicated TEST environment and add TEST-specific restore verification where required.

---

## 3.7 Authentication and roles

The canonical roles already exist:

```text
designer
reviewer
administrator
viewer
```

The authorization model and role tests are already implemented.

Do not create a new role model.

---

## 3.8 Stage 10 disposable browser environment

Stage 10 already implements a disposable production-topology browser environment with:

- isolated PostgreSQL;
- generated credentials;
- production frontend/backend topology;
- synthetic catalog/rules;
- Designer;
- Reviewer;
- Administrator;
- Viewer;
- additional Designer account;
- Playwright workflows;
- deterministic cleanup.

Important:

This is **not** the persistent Stage 11 internal TEST environment.

Reuse its:

- topology validation;
- secret handling;
- generated-account patterns;
- synthetic-data safety rules;
- environment guards;
- cleanup safety;
- Playwright fixtures

where appropriate.

Do not simply rename the Stage 10 disposable environment to Stage 11.

---

# 4. Missing Stage 11 Capabilities

Based on the current repository architecture, Stage 11 should primarily implement these missing capabilities:

1. persistent dedicated TEST deployment configuration;
2. dedicated TEST PostgreSQL persistence;
3. automatic TEST deployment after successful Stage 10 CI;
4. deployment preflight and Stage 10 gate handling;
5. TEST-specific migration and seed orchestration;
6. deterministic internal demo projects;
7. persistent TEST role accounts;
8. build commit/timestamp/environment identity;
9. active database catalog/rule version visibility;
10. TEST environment visual indicator;
11. basic operational metrics;
12. central feature flags;
13. TEST-specific backup and isolated restore verification;
14. post-deployment smoke test;
15. tester documentation;
16. rollback/runbook documentation.

Do not spend Stage 11 rewriting capabilities that are already present and verified.

---

# 5. Dedicated Persistent TEST Environment

Create an explicit persistent TEST environment separate from the normal local runtime and from Stage 10 disposable tests.

Prefer a Compose override/profile design that reuses `compose.yaml` instead of copying the complete topology.

For example, consider:

```text
compose.test.yaml
```

or an equivalent repository-consistent approach.

The TEST environment must have isolated persistence for:

```text
PostgreSQL data
backups
runtime/test secrets
deployment metadata
```

Suggested host-side structure:

```text
data/
  test/
    postgres/
    backups/
    secrets/
    deployment/
```

Adapt this if the repository already has a better convention.

Do not place TEST data in the normal:

```text
data/postgres
data/backups
data/secrets
```

paths.

---

# 6. TEST Environment Identity

Do not overload `NODE_ENV`.

The application containers should continue to use:

```text
NODE_ENV=production
```

because TEST runs production builds.

Add an explicit application environment identity such as:

```text
NIEDAX_ENV=test
```

or another clearly named central variable.

Use one canonical environment identifier throughout the backend, frontend and deployment scripts.

Do not scatter multiple competing environment variables.

Required logical environments should remain distinguishable, for example:

```text
development
test
production
```

even if production deployment is not implemented yet.

---

# 7. Safety Guard Against Wrong Data / Credentials

Stage 11 must explicitly prevent the TEST deployment from accidentally using normal/production-like persistent data or credentials.

The best fit for the current repository is an orchestration/preflight guard similar to the existing Stage 10 topology guards.

Before starting TEST, validate the fully resolved Compose configuration.

At minimum verify:

- environment is TEST;
- PostgreSQL storage points only to TEST-owned paths/volumes;
- TEST secrets are used;
- TEST backup directory is used;
- no production/normal data directory is mounted;
- no unexpected externally published PostgreSQL port exists;
- only the intended gateway port is published;
- database networking remains internal;
- expected image/build definitions are being used.

Fail closed.

Do not start containers when the resolved topology is unsafe.

Add automated tests for these guards.

---

# 8. TEST Environment Commands

Add clear repository commands for operators.

Prefer commands consistent with the existing TypeScript script approach.

Provide equivalents of:

```text
pnpm test-env:setup
pnpm test-env:start
pnpm test-env:stop
pnpm test-env:status
pnpm test-env:logs
pnpm test-env:seed
pnpm test-env:reset
pnpm test-env:smoke
pnpm test-env:backup
pnpm test-env:verify-restore
```

Names may differ if repository conventions strongly suggest another naming scheme.

### Safety requirements

`test-env:reset` is destructive.

It must:

- operate only on an explicitly recognized TEST environment;
- never target the normal persistent database;
- never target a Stage 10 disposable project accidentally;
- require appropriate validation before removing TEST data.

Do not implement a generic unsafe `docker compose down -v`.

---

# 9. Database Migrations on TEST Deployment

Do not create a new migration mechanism.

Use the existing `migrations` service.

The existing normal Compose dependency:

```text
postgres healthy
→ migrations successful
→ backend start
```

should remain the architectural model.

TEST deployment must fail if migrations fail.

Do not hide migration errors.

Record enough deployment information to identify:

- migration success/failure;
- database schema/migration state;
- build identity.

Where practical include the migration state in the TEST system-information view.

---

# 10. TEST Catalog and Rule Seed

Do not blindly reuse the Stage 10 synthetic catalog as the internal tester's official Niedax catalog.

Stage 10 synthetic data is explicitly marked non-authoritative.

Inspect the Stage 5 catalog import and activation implementation and the currently approved/validated catalog assets.

For the TEST environment:

1. use the existing catalog import pipeline;
2. load a validated catalog candidate;
3. validate it;
4. activate it through the existing lifecycle;
5. load/activate the corresponding calculation rule version;
6. preserve all source/version/audit semantics.

If the repository does not yet contain sufficient authoritative active catalog data for a realistic TEST seed:

- do not invent Niedax product facts;
- keep clearly marked synthetic fixtures;
- report the limitation.

Never present synthetic fixture data as catalog-confirmed Niedax engineering data.

---

# 11. Deterministic Demo Projects

Stage 10 creates projects dynamically through E2E tests but does not provide a persistent set of internal TEST demo projects.

Add deterministic demo projects for Stage 11.

Prefer using the actual project application/repository APIs and domain contracts instead of raw SQL wherever practical.

At minimum cover representative workflows corresponding to the existing accepted Stage 10 scenario model:

- simple KL route;
- simple WSL route;
- logical continuation;
- physical joint;
- bend;
- T connection;
- route end/cap/equipment case;
- support configuration;
- anchor scenario;
- reserve and package rounding;
- manual catalog item;
- free-text manual item;
- saved revision;
- reviewable/approved revision where valid.

Do not duplicate formulas inside the seed code.

Do not manually calculate BOM values in seed scripts.

Use the real application calculation and revision flows.

Reuse existing T01–T15 fixture inputs where their semantics fit.

---

# 12. Persistent TEST Accounts

Stage 10 already knows how to create:

```text
administrator
designer
reviewer
viewer
```

accounts.

Reuse this pattern.

Stage 11 needs persistent TEST accounts for internal human testing.

Recommended usernames may be predictable, for example:

```text
test.administrator
test.designer
test.reviewer
test.viewer
```

but passwords must not be committed.

Generate or provision credentials through TEST-only secret/config storage.

Do not include passwords in:

- Git;
- Docker image layers;
- `.env.example`;
- documentation;
- CI artifacts;
- logs.

Provisioning must be idempotent.

Repeated deployment must not duplicate users.

Role assignment must use the existing canonical role model.

---

# 13. Build Identity

The current application version is already sourced from package/manifest files.

Extend build identity without removing existing version fields.

Each TEST deployment must identify:

```text
application version
Git commit SHA
build timestamp
environment
catalog version
calculation rule version
```

Optionally include:

```text
Git ref/tag
Docker image identity
database migration/schema state
```

where reliable.

### Build metadata

Generate Git/build metadata during build or deployment.

It is non-secret metadata and may safely be supplied through Docker build args or generated version files.

Do not determine Git SHA dynamically from inside a runtime image that has no `.git` directory.

Do not copy `.git` into runtime images.

---

# 14. Active Catalog / Rule Version

The current `/api/v1/version` reports manifest versions.

Stage 11 also needs the **actual active database versions used by the running application**.

Do not mislabel static manifest versions as active database state.

Implement a backward-compatible diagnostic contract.

Options include:

```text
GET /api/v1/system/info
```

or a versioned extension to the existing version API.

Prefer the approach that preserves existing tests and API compatibility.

The diagnostic response should distinguish clearly between:

```text
application/build version
repository catalogue manifest version
repository rules manifest version
active database catalog version
active database rule-set version
```

when these are different concepts.

---

# 15. TEST Environment UI Indicator

A human tester must immediately see that the application is TEST.

Add a visible TEST indicator to the main application shell.

Example:

```text
TEST
```

badge in the header or system/status area.

Do not rely only on browser URL recognition.

Do not show the TEST badge in non-test environments.

---

# 16. System Information UI

Add or extend a small system-information area accessible to testers.

It should make it easy to copy:

```text
Environment
Application version
Git commit
Build timestamp
Active catalog version
Active rule version
```

Where available:

```text
database migration state
```

This information must be easy to include in defect reports.

Do not require direct database access.

---

# 17. Existing Health Checks — Extend, Do Not Duplicate

Retain:

```text
/api/v1/health/live
/api/v1/health/ready
```

Do not turn `/live` into a database check.

Keep liveness cheap.

Keep readiness dependency-aware.

If additional Stage 11 status is required, expose it separately rather than bloating liveness.

Never expose:

- passwords;
- secret paths with sensitive values;
- tokens;
- cookies;
- connection-string credentials.

---

# 18. Basic Metrics

No dedicated application metrics implementation was found in the inspected repository.

Add lightweight local metrics suitable for TEST operations.

Do not introduce a mandatory cloud or Internet service.

Do not add Datadog, Sentry, New Relic, hosted Grafana, or similar services.

A small local JSON metrics/status endpoint is sufficient.

At minimum provide:

```text
process uptime
request count
server error count
critical application error count
database readiness state
build identity
```

Where useful also expose bounded counts for:

```text
export worker failures
calculation failures
```

Do not use unbounded high-cardinality labels such as project IDs or user IDs as metric dimensions.

Metrics must not expose personal or secret data.

Prefer Administrator-only access unless there is a strong reason for a public operational endpoint.

---

# 19. Structured Error Logging

Do not replace Fastify logging.

Improve the existing logging so critical server failures can be correlated with a tester report.

For an unexpected server error, logs should include safe fields such as:

```text
timestamp
level
NIEDAX_ENV
build version
Git commit
correlationId
HTTP method
route
error code
actor ID where appropriate
role where appropriate
project ID where appropriate
revision ID where appropriate
stack/error details server-side
```

Never log:

```text
passwords
session tokens
cookies
Authorization headers
secret files
complete uploaded catalog data
complete request bodies by default
```

The frontend should display a safe error reference/correlation ID for unexpected failures where practical.

---

# 20. Docker Log Retention

The normal Compose configuration already uses bounded Docker JSON logging:

```text
max-size: 10m
max-file: 5
```

Preserve it unless there is measured justification to change it.

Do not create a second persistent file-log mechanism.

Document:

```text
pnpm test-env:logs
```

and relevant Docker log inspection commands.

---

# 21. Feature Flags

No central feature-flag implementation was found in the inspected `main`.

Implement one lightweight central mechanism.

Do not scatter direct `process.env.FEATURE_*` conditions through components.

Create a typed feature registry.

Feature flags are:

- environment configuration;
- not permissions;
- not authorization;
- not calculation rules.

Server-side functionality must enforce a disabled flag even if an HTTP request bypasses the UI.

### Important

Do not invent active product functionality just to have flags.

Inspect the actual current application and Stage 10 known limitations.

Create flags only for real incomplete/experimental functionality that exists or is being staged.

If no incomplete endpoint needs immediate gating, implement the infrastructure and tests and document that no production functionality is currently enabled behind an experimental flag.

Out-of-MVP future features must remain disabled/not exposed.

---

# 22. TEST Backup

Reuse the existing PostgreSQL backup implementation.

Do not create a second dump format.

A TEST backup must:

- use the TEST database;
- write only to TEST backup storage;
- retain checksum validation;
- retain PostgreSQL custom format;
- remain clearly distinguishable from normal persistent backups.

Do not let `test-env:backup` operate on the normal persistent database.

Reuse the existing backup container/tooling with TEST-specific Compose configuration.

---

# 23. TEST Restore Verification

The repository already has `test:backup-integration`.

Keep it.

Stage 11 additionally needs an operational verification that a real TEST database backup can be restored safely without replacing the live TEST database during verification.

Implement something equivalent to:

```text
pnpm test-env:verify-restore
```

The verification should:

1. create or select a verified TEST backup;
2. create an isolated temporary PostgreSQL instance/database;
3. restore the backup there;
4. validate the archive/checksum;
5. run migration-history verification;
6. verify application-role privilege policy;
7. verify active catalog/rule identities;
8. verify representative TEST project/revision records;
9. report pass/fail;
10. remove only the temporary verification environment.

Do not perform this verification by destructively restoring over the active TEST database.

---

# 24. Automated Deployment

The repository already contains:

```text
.github/workflows/stage10.yml
```

Do not replace it.

Stage 11 needs a separate TEST deployment workflow.

Prefer a design such as:

```text
Stage 10 validation
        ↓
successful main-branch run
        ↓
Stage 11 TEST deployment
```

Use the existing `main` CI model unless repository policy has changed.

A reasonable GitHub Actions design is a `workflow_run`-based deployment triggered only by successful completion of the Stage 10 workflow for `main`.

Do not deploy pull-request code directly.

Also support explicit manual execution through `workflow_dispatch` for recovery/operations if appropriate.

---

# 25. Deployment Target

The actual application is LAN-only.

Do not convert it into a public Internet application.

The deployment runner should be self-hosted on or securely able to reach the internal TEST host.

Use a dedicated runner identity/label for TEST deployment.

For example:

```text
niedax-test-deploy
```

but follow existing infrastructure naming if one already exists.

Do not claim such a runner exists merely because the workflow file references it.

Document runner prerequisites separately.

Do not automatically register a GitHub runner from repository code.

---

# 26. Deployment Workflow

Implement a deployment orchestration script rather than placing complex destructive logic directly in YAML.

Conceptual flow:

```text
successful Stage 10 CI
        ↓
checkout exact reviewed SHA
        ↓
TEST deployment preflight
        ↓
build images with build metadata
        ↓
backup existing TEST DB
        ↓
start/update postgres
        ↓
run migrations
        ↓
run TEST seed/idempotent provisioning
        ↓
start backend/frontend/gateway
        ↓
wait for readiness
        ↓
system/version checks
        ↓
smoke test
        ↓
mark deployment successful
```

If any critical step fails:

```text
deployment = failed
```

Do not report success merely because containers started.

---

# 27. Stage 10 Acceptance Gate in Deployment

The Stage 11 deployment workflow must depend on a successful Stage 10 CI result.

However, the repository currently also records human/external Stage 10 acceptance requirements.

Do not hardcode those requirements as `true`.

If there is no existing machine-readable sign-off mechanism:

- document the human acceptance precondition;
- add a safe preflight/reporting mechanism if useful;
- do not manufacture approval data.

The final Stage 11 report must state any remaining external activation blockers.

---

# 28. Smoke Test

Add a Stage 11 smoke test against the deployed TEST environment.

Do not replace the comprehensive Stage 10 E2E suite.

The smoke test should be small and fast.

At minimum verify:

```text
gateway reachable
frontend reachable
/api/v1/health/live succeeds
/api/v1/health/ready succeeds
build/system info succeeds
environment == test
active catalog exists
active rules exist
authentication works
```

Also perform one small end-to-end functional check using real application behaviour.

For example:

```text
login as Designer
→ open deterministic demo project
→ calculate
→ validate a successful result contract
```

Avoid mutating an approved baseline revision unnecessarily.

A failed smoke test must fail deployment.

---

# 29. Test Accounts and Smoke Credentials

Deployment automation must not print account passwords.

Use TEST secrets or generated credential files excluded from Git.

Smoke tests may receive credentials through:

- generated secret files;
- runner secrets;
- tightly scoped environment injection.

Sanitize CI logs.

Do not upload credential-bearing artifacts.

Reuse the Stage 10 safe-reporter philosophy.

---

# 30. Tester Guide

Create:

```text
docs/testing/TESTER_GUIDE.md
```

unless repository naming conventions strongly prefer another path.

It must be short enough for a non-developer tester.

Include:

## Access

```text
http://<test-server-hostname-or-ip>:8080
```

Do not hardcode a workstation-specific IP into application code.

## TEST identification

Explain the visible TEST badge.

## Accounts

Explain the four roles:

```text
Designer
Reviewer
Administrator
Viewer
```

Explain where approved TEST credentials are obtained.

Do not put passwords in the guide.

## Suggested workflow

```text
Login
→ open/select demo project
→ inspect geometry
→ calculate
→ inspect BOM
→ inspect warnings
→ save revision
→ review/check
→ approve where permitted
→ export Excel
```

## Version information

Explain how to copy:

```text
build version
Git commit
catalog version
rule version
correlation ID
```

## Defect reporting

Require:

```text
Title
Date/time
Environment
Build version
Git commit
Catalog version
Rule version
Role
Project/demo scenario
Steps to reproduce
Expected result
Actual result
Severity
Screenshot if useful
Downloaded workbook if relevant
Correlation/error ID
```

---

# 31. Defect Severity

Document the existing Stage 10 severity philosophy rather than creating an incompatible classification.

Use:

### Severity 1

Examples:

- data corruption/loss;
- unauthorized access;
- unusable critical workflow.

### Severity 2

Examples:

- incorrect material/order quantities;
- broken immutability;
- broken approval;
- critical workflow failure without safe workaround.

### Severity 3

Examples:

- limited functional defect;
- bounded workaround;
- incorrect non-critical warning/validation.

### Severity 4

Use only for cosmetic/usability defects if Stage 11 tester workflow needs a lower severity.

Do not downgrade an unresolved acceptance blocker merely by relabeling it.

---

# 32. TEST Operations Documentation

Create/update:

```text
docs/testing/TEST_ENVIRONMENT.md
docs/testing/TESTER_GUIDE.md
docs/testing/TEST_BACKUP_RESTORE.md
```

Adapt paths to existing repository conventions.

`TEST_ENVIRONMENT.md` must document:

```text
architecture
data isolation
secrets
commands
deployment workflow
runner prerequisites
migration behaviour
seed behaviour
demo data
health
metrics
logs
build/version information
feature flags
backup
restore verification
smoke test
rollback
troubleshooting
```

Avoid duplicating the existing:

```text
docs/operations.md
docs/backups.md
docs/migrations.md
```

Link/refer to those where appropriate.

---

# 33. Rollback

Document a safe TEST rollback process.

Do not implement unsafe automatic database down-migrations.

Use the repository's existing forward-only migration policy.

Application rollback should prefer:

```text
previous known build/image
```

Database recovery should prefer:

```text
forward corrective migration
```

or:

```text
verified TEST backup restore
```

as appropriate.

Before a deployment that can change persisted state, create/verify a TEST backup.

Do not delete historical revision data to simplify rollback.

---

# 34. Build Metadata in Docker

Update image build configuration only as needed to include non-secret metadata.

Do not bake passwords or tokens into images.

Pass safe values such as:

```text
application version
Git SHA
build timestamp
environment
```

Ensure metadata is deterministic and testable.

Do not invalidate Docker cache unnecessarily through unrelated dynamic values in early build layers.

---

# 35. Metrics and Observability Tests

Add automated tests for:

- health liveness;
- health readiness;
- system/build information;
- TEST environment indicator;
- active catalog/rule version resolution;
- metrics endpoint authorization/safety;
- error correlation ID;
- log redaction where testable.

Existing health/version tests must continue to pass.

---

# 36. Feature Flag Tests

Test:

- defined flags have typed/default values;
- unknown flags fail safely;
- disabled UI functionality is hidden/disabled;
- corresponding backend functionality is also unavailable when disabled;
- feature flags cannot override authorization.

Do not change the role matrix.

---

# 37. Environment Isolation Tests

Add tests that reject unsafe TEST configuration.

Examples:

```text
TEST stack using normal data/postgres path → reject
TEST stack using normal secrets path → reject
TEST stack exposing PostgreSQL host port → reject
TEST stack missing NIEDAX_ENV=test → reject
TEST stack with unexpected project identity → reject
```

Follow the existing Stage 10 guard-testing style.

---

# 38. Seed Idempotency Tests

Repeated TEST seed execution must not create duplicate:

```text
users
catalog versions
rule sets
demo projects
revisions
```

Where records intentionally change, make the transition explicit.

Do not silently modify an immutable saved revision.

---

# 39. CI / Deployment Evidence

Produce bounded, sanitized deployment evidence.

A successful TEST deployment record should contain only safe operational metadata, for example:

```text
schemaVersion
timestamp
Git SHA
application version
environment
catalog version
rule version
migration status
health status
smoke status
backup verification status
deployment result
```

Do not include:

```text
passwords
tokens
cookies
database dump contents
customer data
raw browser state
complete project payloads
```

---

# 40. `.env.example`

The existing `.env.example` intentionally contains almost nothing because runtime credentials are generated under `data/secrets`.

Preserve that philosophy.

Do not turn `.env.example` into a secret-management system.

Add only safe TEST configuration examples if needed, for example:

```text
NIEDAX_ENV=test
LAN_APPLICATION_PORT=8080
```

Do not include passwords.

Document secret generation separately.

---

# 41. Keep Runtime Offline-Capable

The application runtime must remain usable without:

```text
external DNS
external telemetry
external CDN
remote database
cloud runtime services
Internet egress
```

Do not add runtime telemetry SDKs.

GitHub Actions may orchestrate CI/deployment, but the running Niedax application must not depend on GitHub availability to serve internal users after deployment.

---

# 42. Do Not Reimplement Stage 10

Do not create a second:

- Playwright framework;
- regression suite;
- database-check framework;
- security scanner wrapper;
- performance framework;
- backup integration harness.

Stage 11 may call these existing tools when appropriate.

Stage 11 tests should focus on:

```text
persistent TEST environment
deployment
operational diagnostics
environment isolation
seed/provisioning
build identity
feature flags
backup verification
smoke testing
tester usability
```

---

# 43. Required Repository Commands Before Completion

Run the appropriate existing validation sequence.

At minimum:

```text
corepack pnpm format:check
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test:unit
corepack pnpm build
```

Then the relevant database/integration checks.

Where the required infrastructure is available:

```text
corepack pnpm validate:stage10
```

must still pass.

Add and execute the Stage 11-specific tests.

Do not weaken Stage 10 tests merely to make Stage 11 pass.

---

# 44. Stage 11 Verification

Where a safe TEST runtime can be created locally, verify:

```text
test environment preflight
TEST secrets isolated
TEST PostgreSQL isolated
migrations successful
seed successful
four role accounts exist
demo data exists
gateway reachable
frontend reachable
health/live healthy
health/ready healthy
system info correct
environment reports TEST
Git SHA correct
catalog version correct
rule version correct
metrics available
feature flags respected
structured error correlation works
TEST backup succeeds
isolated TEST restore verification succeeds
smoke test succeeds
```

If an actual LAN deployment runner/server is not available, distinguish:

```text
implementation verified locally
```

from:

```text
real internal deployment verified
```

Do not fabricate a test URL or deployment result.

---

# 45. Definition of Done

Stage 11 is complete only when:

## Isolation

A persistent TEST environment has dedicated database/data/secrets/backups and cannot accidentally target the normal persistent environment.

## Reproducibility

The environment can be recreated through documented automation.

## CI Gate

TEST deployment can occur only after successful Stage 10 CI for the intended commit/ref.

## Deployment

The test deployment process is automated and deterministic.

## Migrations

Existing forward-only migrations execute successfully during deployment.

## Seed

The TEST environment has:

- active catalog/rules appropriate for testing;
- deterministic demo projects;
- Designer;
- Reviewer;
- Administrator;
- Viewer.

## Build identity

The application exposes:

- application version;
- Git commit;
- build timestamp;
- TEST environment;
- active catalog version;
- active calculation-rule version.

## Observability

Existing structured logging is extended with sufficient correlation context.

## Health

Existing liveness/readiness checks remain functional.

## Metrics

Basic safe local operational metrics exist.

## Backup

TEST backup creation is functional.

## Restore verification

A TEST backup is restored successfully into an isolated verification database/environment.

## Feature flags

A central typed feature-flag mechanism exists and is server-enforced.

## Smoke test

Post-deployment smoke testing passes.

## Tester documentation

A tester can independently:

- access the environment;
- log in;
- identify versions;
- execute the basic workflow;
- report a defect with useful diagnostic information.

---

# 46. Important Stage 10 Dependency Rule

Even if every Stage 11 code change passes technically:

Do **not** mark Stage 11 operationally accepted while required Stage 10 entry criteria remain pending.

At the current known repository baseline these included:

```text
runtime-image security reassessment/disposition
remote Stage 10 GitHub CI execution
domain approval of Stage 10 regression identity/results/budgets
```

Re-check the repository because these may have changed after this prompt was written.

---

# 47. Required Deliverables

The expected implementation should include, as appropriate:

```text
TEST Compose/configuration layer
TEST environment orchestration scripts
TEST topology/preflight guards
TEST persistent data layout
TEST secret provisioning
TEST account provisioning
TEST catalog/rule provisioning
TEST demo-project seed
build metadata injection
system information endpoint/model
TEST UI badge/system info
basic metrics
central feature flags
TEST backup command
isolated restore verification
TEST smoke test
GitHub TEST deployment workflow
rollback/runbook documentation
TEST_ENVIRONMENT.md
TESTER_GUIDE.md
TEST_BACKUP_RESTORE.md
Stage 11 automated tests
```

Reuse existing files/modules rather than creating unnecessary duplicates.

---

# 48. Final Codex Report

At the end, provide a concise but evidence-based report.

Use exactly these sections.

## 1. Repository Baseline

Report:

```text
starting branch
starting commit
ending commit/working-tree state
```

Do not claim commits were created if they were not.

## 2. Stage 10 Entry Status

Report separately:

```text
automated technical status
runtime-image security status
remote CI status
domain approval status
```

Identify remaining blockers.

## 3. Existing Infrastructure Reused

List important components reused from Stages 1–10.

## 4. Files Changed

List created and modified files.

## 5. TEST Architecture

Explain:

```text
Compose structure
data isolation
database isolation
secrets
gateway/port
```

## 6. Deployment Trigger

State exactly:

```text
workflow
source branch/ref
Stage 10 dependency
runner label
```

Distinguish configured from actually executed.

## 7. TEST URL

If actually verified, provide the real configured internal URL.

Otherwise provide only:

```text
http://<test-server>:8080
```

and state that real server deployment remains unverified.

## 8. Database

Describe:

```text
migrations
catalog/rule provisioning
demo seed
account provisioning
backup
restore verification
```

## 9. Observability

Describe:

```text
health
metrics
structured logs
correlation IDs
```

## 10. Versioning

Show where these come from and where testers see them:

```text
application version
Git SHA
build timestamp
environment
catalog version
rule version
```

## 11. Feature Flags

List actual implemented flags.

Do not list hypothetical flags as implemented.

## 12. Test Accounts

List usernames/roles only.

Never print passwords.

## 13. Demo Projects

List the deterministic test projects and what they exercise.

## 14. Tests Executed

Provide exact commands and pass/fail results.

Do not state that a test passed unless it actually ran.

## 15. Operations Commands

Provide exact commands for:

```text
setup
start
stop
status
logs
seed
reset
smoke
backup
restore verification
```

## 16. Remaining Limitations / Blockers

Clearly separate:

```text
code limitation
infrastructure requirement
external security action
domain approval
real deployment verification
```

## 17. Stage 11 Status

Finish with exactly one of:

```text
STAGE 11 OPERATIONALLY READY
```

or:

```text
STAGE 11 IMPLEMENTED BUT NOT OPERATIONALLY ACCEPTED
```

and list the exact reasons for the latter.

---

# Final Principle

Stage 11 is not about building another test framework.

Stages 1–10 already provide the application architecture, Docker topology, database model, migrations, catalog pipeline, calculation engine, roles, revisions, export, regression tests, disposable test environments, health checks, backup tooling and extensive automated verification.

Stage 11 must convert those existing capabilities into a **safe, persistent, reproducible and observable internal TEST deployment** with:

```text
isolated TEST data
controlled deployment
visible build identity
deterministic tester data
persistent test accounts
safe observability
backup/restore confidence
feature gating
smoke verification
clear tester documentation
```

while preserving all existing Stage 10 safety and acceptance controls.
