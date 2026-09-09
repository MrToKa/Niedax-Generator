# Stage 10 CI

The configured `origin` is GitHub (`MrToKa/Niedax-Generator`). The supplied Actions workflow
runs `corepack pnpm validate:stage10`. No remote job or runner registration is implied by a
local pass. Domain acceptance remains a separate review of exact fixture/result hashes.

Provision a **dedicated Windows x64 Docker Desktop runner**, Node 24.19.0 and Corepack, with
label `niedax-stage10-dedicated` and machine environment `NIEDAX_STAGE10_DEDICATED_RUNNER=1`.
The label is a required isolation contract, not a claim that a runner is registered. Allow only
this repository on that host. Workflow concurrency serializes its jobs; foreign-fork pull requests
are not executed on the self-hosted host. The workflow refuses pre-existing normal service names
before any runtime action, checks out into a fresh per-run directory, and disables checkout clean.
The normal-project stop/start persistence checks use that job's generated `data/`, fixed service
names and TCP 8080; they cannot safely share a user's Docker host.

Installation uses `--frozen-lockfile`; the explicit pinned Playwright Chromium installation follows
the [Playwright CI instructions](https://playwright.dev/docs/ci). Browsers stay outside application
images. The Windows verify-deps setting is used only after the explicit successful installation,
to avoid pnpm attempting to invoke a missing auto-install shim. It skips no validation stage.

`validate:stage10` runs `validate:full` once, then browser, security/audit, performance and the
fixture/evidence integrity gate. Each failure propagates its nonzero exit. Unit and integration
reporters reject zero-test discovery and unexpected skips. Both PostgreSQL cycles require the
original two credentialed scenarios plus thirteen Stage 10 cases, zero skips. Browser retries are
off, and every critical browser scenario must execute. Fixture hashes are checked; tests never
generate or accept goldens.

Only the explicit sanitized JSON filenames in the workflow are uploaded, with seven-day retention.
These include the eight fixed download metadata reports (hashes, saved-revision identity, counts
and independent verification status) and separate browser/performance cleanup reports.
No wildcard upload of `.artifacts`, logs, traces, screenshots, downloads, passwords, cookies,
browser state, customer templates or backups is allowed. Cleanup executes after failure; an error
in cleanup fails the job without concealing the earlier gate result. Normal-topology cleanup is
`down --remove-orphans`, preserving data. Destructive cleanup is restricted to individually
validated disposable test projects.

Local use (Docker and dependency-audit network access required):

```powershell
corepack pnpm install --frozen-lockfile
$env:npm_config_verify_deps_before_run = 'false'
corepack pnpm exec playwright install chromium
corepack pnpm validate:stage10
```

The source validation also type-checks backend/package test fixtures and browser configuration.
`test:e2e`, `test:security`, `test:performance` and `test:fixtures` are independently runnable;
security requires built runtime assets and the final fixture gate requires the other safe reports.
Hardware, timestamps, fixture hashes and individual performance samples remain in the report.
Proposed budgets are enforced consistently, while an incomparable host must be identified in review.
