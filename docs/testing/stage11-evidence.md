# Stage 11 implementation evidence

Execution date: 2026-09-24. Starting branch `main`, commit
`81036b81a0e32193b0cc609afeaf0f14a6b13420`; initial working tree clean. No commit, push,
runner registration, firewall change or real internal-server deployment was performed.
All implementation changes remain in the working tree. The supplied prompt received only
Prettier Markdown normalization because its initial formatting failed the required check.

## Acceptance boundary

Stage 11 implementation is present, but operational activation remains blocked by unresolved Stage 10 entry criteria.

The repository still records pending runtime-image security reassessment/disposition, actual
remote Stage 10 CI and domain approval of the exact T01–T15 identities/results/performance budgets.
The new machine-readable sign-off template remains pending. A normal `test-env:start` was executed
and correctly exited 1 at the acceptance gate before container mutation. No acceptance was invented.

The configured workflow is `Stage 11 TEST deployment`, triggered only by successful main
push/manual runs of `Stage 10 validation`, on `[self-hosted, Windows, X64, niedax-test-deploy]`.
It was not executed remotely. The real deployment address remains `http://<test-server>:8080`.
Local verification used loopback port 18091, with `operationallyAccepted: false` and an explicit
dirty-tree/source-hash record. It is not a verified LAN deployment.

## Observed local verification

- `corepack pnpm test-env:setup`: passed, including repeated setup; isolated secrets stayed local.
- `corepack pnpm test-env:preflight`: passed against actual resolved Compose after canonical
  Compose normalizations were covered by rejection tests.
- `corepack pnpm test-env:start -- --local-verification`: passed initial migration, seed,
  production topology health and real HTTP smoke.
- `corepack pnpm test-env:backup`: passed custom-format archive and SHA-256 verification.
- `corepack pnpm test-env:seed`: passed repeated provisioning. Before/after backup fingerprints
  were identical: four enabled role accounts, one active catalog/rule pair, 13 projects and
  13 immutable revisions. `S11-DEMO-APPROVAL` was approved through the actual demo lifecycle;
  the other 12 saved baselines remained calculated.
- `corepack pnpm test-env:verify-restore`: passed at `2026-09-24T08:35:15.395Z`, archive
  `20260924T083450Z_niedax_generator_pg18.dump`. Checksum, migration history, application-role
  privilege policy and representative records all verified; temporary environment removed.
- Real Chromium UI verification passed: TEST badge before login; designer/admin login;
  application/Git/active versions; selectable copy text; role-based metrics; 390 px layout;
  no horizontal overflow or page errors. Safe record and inspected screenshot remain in
  `.artifacts/stage11/safe/ui-verification.json` and `system-information-narrow.png`.
- `corepack pnpm test:stage11`: 49 tests in six files passed (guards, provisioning, smoke,
  diagnostics, logs, flags and rendered UI). Scoped and repository lint/type checks passed.

Initial failing attempts were fixed and are not presented as passes: resolved Compose empty
IPAM/absolute secret targets, Windows mixed path separators in restore preflight, and differing
timestamp string representations during restore comparison. Backup fingerprints now explicitly
use UTC; evidence from before that convention fails safely. No live database was restored/reset.

The final repeat deployment passed at `2026-09-24T08:37:24.251Z`, including a verified backup
before migrations, preserved seed baselines and smoke. The separate `test-env:smoke` passed at
`08:38:12.708Z`. Selecting the same verified archive explicitly with
`corepack pnpm test-env:verify-restore -- 20260924T083450Z_niedax_generator_pg18.dump` passed at
`08:38:32.381Z`; its safe result is retained under `data/test/deployment/restore-verification-*.json`.

## Final aggregate validation

`corepack pnpm validate:stage10` started at `2026-09-24T08:48:21.070Z` and finished at
`2026-09-24T09:10:35.347Z` with exit 0, `complete: true`, `passed: true`, `ci: null`.
The exact working-tree source identity is
`sha256:762ec416bf4cbc520edec1b20a5e753c4679851d6012b5a332a3bac60c8b37d3`;
the frozen lockfile identity remains
`sha256:0ea90062871d16be184861b59e8ed9266f7b9a3fa8172809cea62029aa33ce9d`.
Machine evidence: `.artifacts/stage10/safe/stage10-run.json`; bounded reports for each gate are
in that same safe directory. Diagnostic log: `.artifacts/stage11/validate-stage10.log`.

| Executed command                        | Result                                                                                                 |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `corepack pnpm validate:full`           | Passed at `08:52:06.904Z`; includes all source/database/container/network/backup gates                 |
| `corepack pnpm validate`                | Passed within the full gate                                                                            |
| `corepack pnpm format:check`            | Passed                                                                                                 |
| `corepack pnpm lint`                    | Passed                                                                                                 |
| `corepack pnpm typecheck`               | Passed for all projects and tests                                                                      |
| `corepack pnpm test:unit`               | 566/566 in 66 files; zero skips, failures or module errors                                             |
| `corepack pnpm build`                   | All production builds passed                                                                           |
| `corepack pnpm db:check`                | 12 migrations; 15/15 PostgreSQL tests in each of two clean cycles                                      |
| `corepack pnpm test:integration`        | 13 passed; 15 documented DB-only cases executed in the dedicated cycles                                |
| `corepack pnpm test:containers`         | Passed, including stop/start persistence                                                               |
| `corepack pnpm test:runtime-isolation`  | Passed                                                                                                 |
| `corepack pnpm test:backup-integration` | Passed; existing backup framework unchanged                                                            |
| `corepack pnpm test:e2e`                | 6/6; zero failures, skips or retries; cleanup passed                                                   |
| `corepack pnpm test:security`           | 470 source paths, 50 built assets, no findings; both dependency audits exit 0                          |
| `corepack pnpm test:performance`        | All eight proposed budgets passed; 20 samples each, 46 real API pipelines, no failures; cleanup passed |
| `corepack pnpm test:fixtures`           | 32 retained files, exact T01–T15 identities and complete matching-source execution evidence passed     |

Large-workload p95: engine 70.11 ms, Calculate 871.66 ms, Save 1,260.15 ms, Export 10,718.65 ms.
Budget status remains `proposed-domain-review-pending`; measured success is not domain approval.

An earlier aggregate passed `validate:full` and all six browser cases, then correctly stopped on
a credential-signature match in a **synthetic exception fixture** in the new logging test. The
fixture now constructs that fake signature at runtime, following the scanner's existing fixture
pattern; scanner rules and the redaction assertion were not weakened. The focused 17 diagnostics
tests and unchanged security scanner passed, then the entire aggregate above passed on the final
source. The failed aggregate record/log remain `.artifacts/stage11/stage10-first-run.json` and
`validate-stage10-initial.log` and are not accepted results.

After verification, `corepack pnpm test-env:stop` removed TEST containers/networks while retaining
its data, secrets, backups and deployment metadata; `test-env:status` confirmed no running TEST
services. Normal local containers started by the full validation were stopped with
`docker compose stop`, preserving their persistent data. Unrelated containers were left running.
The ending commit remains the starting commit, with 30 new and 13 modified repository files.
No remote deployment or CI execution occurred.

## Data and operational limitations

The TEST seed uses the validated source-backed Stage 5 P0 catalog (`2022-p0`, 308 products),
existing import/validation/approval/activation services and corresponding active rules.
Catalog hash: `sha256:ab420723a0c2d143a2c1adf6dabd9e10932ebbf23310292d9941f93253bfe115`.
Rule hash: `sha256:36b9af40039f4a403919fe6069063e5d3b3025f966a3593b0bea1b36fe5c1ed0`.
Geometry is explicitly synthetic demonstration input. Unresolved fitting, physical-joint and
endpoint facts keep their warnings; no Niedax product or BOM facts were invented. Automated
demo approval is not engineering/domain approval. No formula code or migration was changed.

Application version comes from package metadata; SHA/timestamp from deployment and late Docker
build arguments; environment from `NIEDAX_ENV`; active catalog/rule identities from PostgreSQL.
The authenticated system information panel separates active versions from repository manifests.
The app role cannot read the protected migration ledger; deployment verifies that history instead.
The implemented flag is `operationalMetrics`, default enabled for TEST/development and disabled
for production. Its endpoint remains Administrator-only and disabled flags are enforced server-side.

Deployment and restore runbooks are in [TEST_ENVIRONMENT.md](TEST_ENVIRONMENT.md),
[TEST_BACKUP_RESTORE.md](TEST_BACKUP_RESTORE.md) and [TESTER_GUIDE.md](TESTER_GUIDE.md).
The destructive reset command was implemented with guards, backup and interactive confirmation,
but was not executed against persistent data. Runtime-image security disposition remains a
separate external action regardless of source/package audit results.

## Changed files

Created:

- `compose.test.yaml`, `.github/workflows/stage11-test.yml`.
- `scripts/test-environment.ts`; `scripts/lib/stage11-{config,process,seed,smoke,backup}.ts`.
- `scripts/tests/stage11-{config,seed-smoke,backup}.test.ts` and
  `scripts/tests/fixtures/stage11-compose.json`.
- `apps/backend/src/cli/stage11-seed.ts`, `apps/backend/src/stage11-{seed,seed-contract,demo-projects}.ts`,
  `apps/backend/src/system-diagnostics.ts`, `apps/backend/src/safe-logging.ts`.
- `apps/backend/tests/stage11-seed.test.ts`, `apps/backend/tests/system-diagnostics.test.ts`.
- `packages/domain/src/schemas/v1/system.ts`.
- `apps/frontend/src/app/system-information.tsx`, `apps/frontend/src/app/system-information-view.tsx`,
  `apps/frontend/src/lib/system-information.ts`, `apps/frontend/src/lib/system-information.test.ts`.
- `docs/testing/TEST_ENVIRONMENT.md`, `docs/testing/TESTER_GUIDE.md`,
  `docs/testing/TEST_BACKUP_RESTORE.md`, `docs/testing/stage10-acceptance.json`, this evidence file.

Modified:

- `apps/backend/Dockerfile`; `apps/backend/src/{app,config,server,project-routes,revision-routes,export-routes}.ts`.
- `apps/frontend/src/app/app-header.tsx`, `apps/frontend/src/app/styles.css`.
- `packages/domain/src/index.ts`, `package.json`, `vitest.config.ts`.
- `docs/testing/stage11-prompt.md` (formatting only).
