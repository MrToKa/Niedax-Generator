# TEST backup, restore verification and recovery

Stage 11 uses the existing [backup implementation](../backups.md), PostgreSQL custom-format
archives, exact SHA-256 sidecars, archive-list checks, 28-day verified-dump retention, safety
backups and privilege reconciliation. The normal `backup:*` commands still address the normal
local environment. Use the `test-env:*` commands below for TEST.

## Create and verify

```powershell
corepack pnpm test-env:backup
corepack pnpm test-env:verify-restore
```

The TEST topology guard runs before either action. TEST archives reside exclusively in
`data/test/backups`; database credentials come exclusively from `data/test/secrets`. The archive
basename retains the existing format. Its directory and adjacent `.test.json` evidence identify
it as TEST. Evidence includes archive SHA-256, active catalog/rule identities, bounded counts,
and fingerprints of representative demo records and migration history. It contains no passwords,
session tokens, project payloads or workbook bytes. Do not upload the archive or secrets as CI
artifacts. Dumps contain sensitive application data and password hashes and remain unencrypted;
restrict filesystem access as described in the existing backup guide.

Record fingerprints use an explicit UTC database session, so the live and disposable PostgreSQL
timezones cannot change the serialized timestamp evidence.

Backup creation compares representative state before and after the dump. If a tester changes demo
records, approval state, active versions or exports during this interval, the command fails closed.
Retry during a quiet interval. An archive without matching TEST evidence cannot be selected for
Stage 11 verification. Existing dump retention remains unchanged; small historical `.test.json`
records may remain after their associated archive has been pruned.

By default, restore verification creates a fresh TEST backup. To verify an existing Stage 11 archive:

```powershell
corepack pnpm test-env:verify-restore -- 20260924T120000Z_niedax_generator_pg18.dump
```

Replace the example with an exact filename in `data/test/backups`. Paths, normal-environment
backups and archives lacking a matching TEST evidence sidecar are rejected.

The command reuses `database/tests/compose.backup.yaml` and the existing backup integration
tooling. It copies only the selected archive and checksum into a temporary directory, generates
temporary credentials, and starts a uniquely named `niedax-test-restore-*` PostgreSQL project.
It publishes no ports and uses its own internal database network and disposable PostgreSQL
storage. Neither the live TEST database nor the normal database receives a restore command.

It verifies the checksum and archive, restores using the existing safety-backup and privilege
reconciliation path, runs the existing full migration-history verification, checks export privilege
restrictions, and compares active catalog/rule identities, all four role accounts, representative
demo projects, saved revisions and protected revision graph fingerprints. The graph includes BOM,
warnings, approvals, lifecycle events and stored exports. Verification reports success only after
removing its temporary containers, volumes and directory. A failed teardown preserves the temporary
directory for operator inspection; remove only the explicitly reported disposable project after
confirming its identity. Never run volume deletion against the normal or persistent TEST project.

`corepack pnpm test:backup-integration` remains the separate existing fixture-based integration
test. It does not establish that a particular operational TEST archive has been restored.

## Before deployment or recovery

Create and verify a TEST backup before changing persisted state. Preserve the last successful
deployment's Git SHA/image identity and the matching archive filename. Do not delete revision
history to make a rollback easier.

Application rollback should use a previous known build only after confirming that it supports
the current schema. Migrations are forward-only: prefer a reviewed corrective migration when a
schema change needs repair. Do not edit applied migrations or create down migrations. See
[migrations](../migrations.md) and [TEST operations](TEST_ENVIRONMENT.md).

A database recovery is a separately authorized, destructive operation; `test-env:verify-restore`
is not a recovery command. First isolate and investigate the failed deployment, keep backend and
gateway stopped, and verify the chosen TEST archive through the temporary environment. Under an
operator-controlled maintenance window, use the existing `backup restore-confirmed` procedure
with the **validated TEST Compose project and both Compose files**, exact filename and exact
`RESTORE_CONFIRMATION=niedax_generator <filename>`. Its safety backup must succeed before restore.
Run current forward migrations and then migration-history verification through that same TEST
project. Restart backend/gateway only after verification succeeds, and run `test-env:smoke` before
reopening access. If any step fails, keep application services stopped for diagnosis. Do not run
the normal `backup:restore` wrapper, which targets normal local persistence.

Older archives may require the matching reviewed checkout to pass exact migration-history
verification before a forward upgrade. A checksum alone is never evidence of recoverability.

Operational activation still depends on unresolved Stage 10 acceptance gates; a successful
restore verification does not supply security, remote CI or domain sign-off.
