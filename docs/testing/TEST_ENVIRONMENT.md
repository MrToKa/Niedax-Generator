# Internal TEST operations

Stage 11 adds a persistent TEST deployment to the existing local Docker architecture.
Implementation verification is separate from operational acceptance. Stage 10 runtime-image
security disposition, remote CI execution and domain approval remain pending in the repository.
No runner registration, firewall change or real server deployment is implied by this configuration.

## Architecture and isolation

`compose.test.yaml` overlays `compose.yaml`; use the commands below instead of raw Compose.
The project is exactly `niedax-test`. PostgreSQL, migrations, backend, frontend, Caddy and
backup tooling retain the existing hardened containers, two internal networks (`edge`, `backend`)
and gateway-only ingress. Caddy alone publishes TCP 8080 on the intended LAN host.
No credentials reach the frontend. Production builds use `NODE_ENV=production`, with the
separate canonical identity `NIEDAX_ENV=test`. The runtime remains offline-capable.

All state stays within this checkout's `data/test/`:

| Directory     | Contents                                                               |
| ------------- | ---------------------------------------------------------------------- |
| `postgres/`   | Persistent TEST database                                               |
| `backups/`    | TEST-only custom-format dumps, checksums and verification metadata     |
| `secrets/`    | Generated database/session secrets and `accounts.json`                 |
| `deployment/` | Ownership, build, binding, acceptance and sanitized deployment records |

Normal `data/postgres`, `data/secrets` and `data/backups` are never reused. The fully resolved
Compose model is checked before every operation: exact project/service/image identities,
approved mounts and secrets, internal database networking, gateway port, build identity,
hardening and bounded logging. Unexpected definitions fail closed. Links/junctions and
hard-linked secret files are rejected. Protect `data/test` using host filesystem permissions;
on Windows, the operator must restrict NTFS ACLs to the dedicated runner and approved operators.
Do not put this directory in a shared checkout, cloud sync folder or CI artifacts.

## Commands

Use Node 24.19.0, Corepack/pnpm 11.21.0 and Docker Desktop Linux containers with Compose
2.40.2 or compatible support for `!override`. Run from the repository root.

```text
corepack pnpm test-env:setup
corepack pnpm test-env:preflight
corepack pnpm test-env:start
corepack pnpm test-env:stop
corepack pnpm test-env:status
corepack pnpm test-env:logs
corepack pnpm test-env:seed
corepack pnpm test-env:reset
corepack pnpm test-env:smoke
corepack pnpm test-env:backup
corepack pnpm test-env:verify-restore
```

Setup is idempotent and never rotates existing credentials. Start builds, stops application writers,
backs up any existing TEST database, runs existing forward-only migrations and verifies their history,
seeds through application services, starts the production topology and requires a successful
smoke check. A failed migration leaves application writers stopped. Failed smoke stops ingress.
Stop preserves all data. Seed creates a verified backup before provisioning existing state.
Reset requires an interactive `RESET niedax-test` confirmation, creates a verified backup,
stops only TEST, and archives its PostgreSQL directory under `deployment/` before recreation.
It is never part of deployment or automated validation. No command runs persistent `down -v`.
An operation lock serializes mutating commands; after a terminated process, verify no TEST
operation is running before an operator removes `deployment/operation.lock`.

For local implementation verification while acceptance is pending:

```text
corepack pnpm test-env:setup
corepack pnpm test-env:start -- --local-verification
corepack pnpm test-env:smoke
corepack pnpm test-env:verify-restore
corepack pnpm test-env:stop
```

This mode is refused inside GitHub Actions, binds Caddy only to loopback (default port 18091,
optional `NIEDAX_TEST_PORT`), and records `operationallyAccepted: false`. It does not clear
Stage 10 blockers and must not be used to announce an accepted LAN deployment.

## Deployment and Stage 10 gate

`.github/workflows/stage11-test.yml` is triggered by a successful **Stage 10 validation**
`main` push or manual validation run, never a pull-request run. It checks out that exact SHA
on `[self-hosted, Windows, X64, niedax-test-deploy]` in the stable `stage11-test` directory.
Use a dedicated host distinct from the Stage 10 disposable-test host, with machine opt-in
`NIEDAX_TEST_DEPLOY_RUNNER=1`, Docker access, sufficient disk and LAN TCP 8080 routing.
Register the runner and configure the `internal-test` GitHub environment outside this task.
Restrict runner/repository write access to trusted maintainers. No registration script is provided.

Setup copies the pending template `stage10-acceptance.json` into
`data/test/deployment/stage10-acceptance.json` only if absent. An authorized human must record
the exact target `reviewedCommit` and explicit `approved` status, reviewer and evidence references
for `runtimeImageSecurity` and `domainApproval` after those reviews actually happen. This is
operator-managed sign-off, not cryptographic proof; protect it with host ACLs and review policy.
Never change the template to manufacture acceptance. The local file avoids a self-referential
Git SHA in a tracked approval record.

Activation independently queries GitHub with a read-only Actions token to verify
`NIEDAX_STAGE10_RUN_ID`: completed success, expected repository and workflow, main branch,
push/manual event and exact checked-out SHA. A clean checkout and current main SHA are required;
stale queued deployments fail. Recovery operators can run `test-env:start` with the same token,
run ID and sign-off. No manual command bypasses these gates for LAN activation. Once running,
the application has no GitHub dependency. Workflow configuration is not remote execution evidence.

## Database and demo data

Reuse [migrations](../migrations.md) and [backup operations](TEST_BACKUP_RESTORE.md).
No historical migration is edited and no down migration is added. Deployment records report
migration verification separately from startup and smoke status. Catalog import, validation,
approval and activation retain existing audit/version semantics. Accounts use canonical roles.
Provisioning must fail on incompatible existing identities rather than overwrite tester work.
Saved revisions are immutable; repeated seeding must not create duplicate baselines.

The available source-backed P0 catalog has unresolved engineering relations. Geometry demos
exercise KL/WSL, continuations, physical joints, bends, tees, ends, supports, anchors, reserve,
package rounding, manual lines and revision workflows. Unresolved material selections retain
their warnings and approval constraints. These examples are demonstrations, not engineering
sign-off. See [tester guide](TESTER_GUIDE.md) for workflow and reporting.

| Demo suffix (`S11-DEMO-`)  | Workflow                                                               |
| -------------------------- | ---------------------------------------------------------------------- |
| `KL`, `WSL`                | Simple source-backed selections and calculation                        |
| `CONTINUATION`, `PHYSICAL` | Logical continuation and physical joint ownership                      |
| `BEND`, `TEE`, `ENDS`      | Bend, T connection, cap/equipment ends with unresolved facts retained  |
| `SUPPORT`, `ANCHOR`        | Support template, manual support and anchor selection                  |
| `ROUNDING`                 | Reserve and package rounding through the engine                        |
| `CATALOG`, `TEXT`          | Catalog and free-text manual items                                     |
| `APPROVAL`                 | Saved, checked and approved demo revision when domain actions allow it |

Each demo has an immutable saved baseline. An automated demo approval is explicitly labeled as
a lifecycle demonstration; it is neither engineering sign-off nor Stage 10 domain acceptance.

## Health, metrics, logs and feature configuration

Existing `/api/v1/health/live` stays a cheap liveness check;
`/api/v1/health/ready` checks PostgreSQL. `/api/v1/version` remains backward-compatible.
Authenticated `/api/v1/system/info` distinguishes manifest versions from actual active database
catalog/rule identities, environment, application version, Git commit and build timestamp.
The app role cannot inspect the migration ledger; deployment evidence owns that status.
Testers see a TEST badge and can copy system information from the shell.

Administrator-only `/api/v1/system/metrics` provides process uptime, bounded counters, database
readiness and build identity. Metrics reset on backend restart; they contain no user/project labels.
The central typed flag `operationalMetrics` controls this staged operational feature on both server
and UI; it defaults on in TEST/development and off in production. `NIEDAX_FEATURE_FLAGS` accepts
strict JSON boolean overrides, for example `{"operationalMetrics":false}`. Unknown flags,
nonboolean values and malformed JSON fail startup. Flags never grant role permissions.

Fastify logs remain structured stdout/stderr with safe correlation IDs. Docker keeps five 10 MiB
JSON files per container. Use `test-env:logs` for bounded, secret-scrubbed logs, or approved local
`docker logs --tail 200 niedax-test-backend` inspection. Never attach raw logs, cookies or account
files to defect reports. Record the safe error/correlation reference shown in the app.

Build metadata is generated by deployment, supplied through late backend Docker build arguments,
and persisted in `deployment/build.json`; runtime never shells out to Git. Images are tagged by
source SHA. Local records also retain the source hash and dirty-tree indicator. The last successful
build and previous successful build remain separate from `operation-build.json`, which records
the current attempt for cleanup/status. Only the bounded sanitized deployment JSON for the exact
CI run/attempt is uploaded; never upload `data/test`.
The smoke checks frontend/gateway, health, identity, active versions, role login and a real
demo calculation without changing an approved saved revision.

## Rollback and troubleshooting

Before changing persisted state, deployment creates/verifies a TEST backup. Keep prior immutable
images and deployment records on the host. For application rollback, select a known compatible
build and its reviewed CI/sign-off, review newer schema compatibility, then start through the
same gate. Current-main freshness blocks automatic rollback to stale commits: use a reviewed
forward revert commit with successful Stage 10 CI, or a supervised maintenance recovery reviewed
by the operator. Do not loosen the gate or run database down migrations. Prefer a forward
corrective migration; otherwise restore a verified TEST backup following
[TEST backup/restore](TEST_BACKUP_RESTORE.md), preserving the live safety backup and all history.

If preflight fails, fix the indicated configuration/ownership mismatch before Docker mutations.
If port 8080 is occupied, do not stop a normal/user stack to claim it; use the dedicated host,
or loopback-only local verification. If migrations fail, keep writers stopped and inspect safe
logs plus `deployment/latest.json`. If smoke fails, inspect active catalog/rules and accounts;
do not weaken required warnings or authorization. If approval is blocked, resolve the recorded
Stage 10 conditions rather than treating a local green check as sign-off.
