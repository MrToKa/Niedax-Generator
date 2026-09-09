# Stage 10 browser acceptance

Run `corepack pnpm exec playwright install chromium` after the frozen dependency install,
then `corepack pnpm test:e2e`. The pinned Playwright release installs its matching Chromium.
Application containers do not contain browser dependencies and have no runtime internet dependency.

The command builds a fresh production-topology stack, migrates an empty disposable volume,
creates generated synthetic accounts with the production authentication service, and seeds the
explicitly synthetic `stage10-synthetic-v1` catalog. Only Caddy publishes an ephemeral loopback
port. Frontend, Backend and PostgreSQL are never exposed directly. Every teardown validates
project/container/volume/network/secret-path identity before removing its disposable volume.
The normal project and its persistent database are not used by this command.

Six critical Chromium tests are required, with one worker and no retries:

- Three fresh UI project journeys: configure two 6 m routes at 1.5 m spacing, connect their
  endpoints logically, add/edit/remove Manual items, reload, calculate, inspect explanations,
  save revision, change/recalculate the draft, switch BG/EN, check/approve as Reviewer and
  download. Designer, Viewer and another Designer exercise their distinct restrictions.
- Narrow 390 × 844 keyboard navigation, upstream catalog-selection invalidation, a controlled
  failed autosave followed by Retry, and two-tab optimistic conflict followed by reconcile.
- An actual insecure `http://niedax-stage10.test` Chromium origin mapped internally to loopback,
  proving route/geometry UUID creation and calculation when `crypto.randomUUID` is unavailable.
  No host DNS/firewall changes or additional LAN exposure are needed.
- Required-anchor input validation, then a later saved revision with an unresolved fitting's
  blocking warnings, disabled approval, unchanged older
  revision/download, and controlled calculate/export failure recovery, including disabled
  double submission and preservation of the export retry key.

The critical project is created and edited exclusively through UI controls. Read-only API calls
corroborate the selected saved revision; they do not create its draft, calculation or lifecycle.
An independent ZIP/OOXML reader checks the bytes emitted by the actual browser download against
the saved revision's quantities, descriptions, literal identifiers, warnings and evidence. It
verifies the approved 26-column `Change Order`, `Calculation details`, and `Warnings` sheets,
blank P/Q prices, nullable package counts, no formulas/macros/external links, and HTTP integrity
headers. This is parser/browser evidence, not a new observed native Microsoft Excel opening.

`tests/e2e/safe-reporter.ts` fails missing/zero discovery, skips, retries and any failed test.
Unexpected page or console errors also fail; deliberate 401/404/409/429/503 responses are allowed
only for the explicitly tested paths. Waits use UI state, responses and download events rather
than fixed delays. Every successful calculation waits for its own HTTP response, the rendered
result fingerprint, the completion announcement and the end of the busy state. Recalculation
explicitly holds its request while the earlier BOM remains visible, then releases it and checks
the new fingerprint before navigating to revisions. Trace, screenshot and video capture are
disabled. Account credentials stay in
process memory/environment; no storage-state file is created. Download bytes are deleted after
inspection. Only bounded sanitized JSON summaries, hashes, versions and counts belong under
`.artifacts/stage10/safe`; raw browser output and disposable state are excluded from CI upload.
The application's five-sign-ins-per-minute limiter stays enabled. Repeated role workflows honor
an actual login `429` response's bounded `Retry-After` with condition polling before one UI retry;
the suite does not disable the limiter or send forged client IP headers.

The synthetic catalog contains a 6 m straight section (6 m package), one connector per proven
joint (2 pcs package), a support (1 pcs package), and a concrete anchor (10 pcs package) with
two anchors per support. Engineering review remains visible. None of these records is an
authoritative Niedax compatibility or anchor-capacity claim. The two connected 6 m routes have
literal reference demand of 12 m straight and nine shared supports; the separate catalog Manual
item is 2 pcs and the free-text item is 2.5 m with reserve/packaging disabled. The workflow also
calculates a later draft at 5% reserve while preserving the older saved revision.

All three repeated journeys use new project IDs in one clean run, and an additional clean run
provides stabilization evidence. Browser versions and individual first-attempt failures are
recorded by the sanitized reporter. Broader browser compatibility and human domain approval
remain separate acceptance gates.
