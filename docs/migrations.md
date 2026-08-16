# Migrations

Migration files are UTC `YYYYMMDDHHMMSS_description.sql`, forward-only, and lexically ordered. Create
one with `pnpm db:new -- <description>`, review it, then run `pnpm db:check`.

The TypeScript runner acquires a project advisory lock, creates `schema_migrations`, validates the
repository list against every applied filename and SHA-256 checksum, and uses one transaction per
migration. It stops at the first error. Missing, renamed, reordered, or edited applied history is a
hard failure. Backend never runs migrations at startup; Compose requires the one-shot migration
service to complete first.

Use `pnpm db:status` for read-only status and `pnpm db:migrate` to apply pending files to the normal
local database. Run `pnpm db:seed` after migration to apply the deterministic, idempotent synthetic
development fixture. The fixture is explicitly non-authoritative and may be run repeatedly.

Run `pnpm db:test` for the real-PostgreSQL migration, double-seed, constraint, concurrency, and
revision-immutability suite. `pnpm db:reset:test` runs the same verified disposable lifecycle: it
creates an empty randomly named Compose database, tests it, destroys only that ephemeral database,
then migrates and tests a second fresh database. There is intentionally no reset command for the
normal persistent `data/postgres` database.

The exact normal workflow is:

```powershell
corepack pnpm setup
corepack pnpm db:migrate
corepack pnpm db:status
corepack pnpm db:seed
corepack pnpm db:test
```

Normal runtime credentials are generated under ignored `data/secrets` by `pnpm setup`; no database
password belongs in `.env`. The disposable database test generates its own short-lived password.

To create the next migration:

```powershell
corepack pnpm db:new -- concise_description
corepack pnpm db:check
```

Never edit an applied/shared migration. Use a forward corrective migration. Development rollback
uses a verified backup restore; test reset uses `pnpm db:reset:test`. The implemented ER model and
snapshot/delete notes are in [Stage 4 ER model](database/stage4-er-model.md).
