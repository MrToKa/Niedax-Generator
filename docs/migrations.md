# Migrations

Migration files are UTC `YYYYMMDDHHMMSS_description.sql`, forward-only, and lexically ordered. Create
one with `pnpm db:new -- <description>`, review it, then run `pnpm db:check`.

The TypeScript runner acquires a project advisory lock, creates `schema_migrations`, validates the
repository list against every applied filename and SHA-256 checksum, and uses one transaction per
migration. It stops at the first error. Missing, renamed, reordered, or edited applied history is a
hard failure. Backend never runs migrations at startup; Compose requires the one-shot migration
service to complete first.

Use `pnpm db:status` for read-only status and `pnpm db:migrate` to apply pending files to the normal
local database. There is intentionally no normal reset command.
