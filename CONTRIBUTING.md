# Contributing

Use English for code, filenames, commits, and repository documentation. Create focused local topic
branches when useful and write Conventional Commits such as `feat(auth): add session revocation`.

Keep the Frontend, Backend, calculation engine, database, and gateway boundaries explicit. Validate
input at HTTP boundaries, return non-sensitive errors, and add tests for authorization or lifecycle
changes. Never commit secrets, local data, generated dumps, logs, coverage, or build output.

Database changes use `pnpm db:new -- <description>`. Review SQL for least privilege, never edit an
applied migration, and run `pnpm db:check`. Before local review run `pnpm validate`; infrastructure
changes also require `pnpm validate:full`. Reviews should check scope, security, migration safety,
offline runtime behavior, and README accuracy.
