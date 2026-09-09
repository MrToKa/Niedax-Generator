# Contributing

Use English for code, filenames, commits, and repository documentation. Create focused local topic
branches when useful and write Conventional Commits such as `feat(auth): add session revocation`.

Keep the Frontend, Backend, calculation engine, database, and gateway boundaries explicit. Validate
input at HTTP boundaries, return non-sensitive errors, and add tests for authorization or lifecycle
changes. Never commit secrets, local data, generated dumps, logs, coverage, or build output.

Database changes use `pnpm db:new -- <description>`. Review SQL for least privilege, never edit an
applied migration, keep fixtures synthetic/non-authoritative, and run `pnpm db:check`. Use only
`pnpm db:reset:test` for destructive reset verification; never reset the normal persistent
database. Before local review run `pnpm validate`; infrastructure changes also require
`pnpm validate:full`. Reviews should check scope, security, migration safety, offline runtime
behavior, and README accuracy.

Stage 10 changes use `pnpm validate:stage10`, which includes the full infrastructure gate and
the browser, security/audit, performance and fixture-integrity checks. Install the pinned Chromium
with `corepack pnpm exec playwright install chromium`. New helpers/specs must stay in lint and
TypeScript coverage; Playwright specs must not enter Vitest discovery. Never accept new golden
expectations by rerunning a generator: review exact T01–T15 input/result hashes and independent
derivations in `docs/testing/stage10-regression-review.md`. Formula/catalog changes require their
own version and domain approval. Commit only explicit sanitized evidence, never raw traces,
browser state, credentials, generated downloads or `.artifacts/`.
