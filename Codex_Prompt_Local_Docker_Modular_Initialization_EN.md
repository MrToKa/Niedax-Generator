# Complete Codex Prompt for VS Code: Local Modular Docker Application Foundation

Copy the entire text under **Prompt** into Codex in VS Code. All user decisions required for this stage are already fixed below. Do not add cloud, hosted, remote, or public-internet infrastructure.

---

## Prompt

You are the lead software engineer and local infrastructure engineer for the **Niedax Generator** project. Work directly in the current VS Code workspace and fully execute the “Project and Local Modular Docker Foundation” stage.

Do not return only a plan or sample snippets. Inspect the workspace, create the implementation and documentation, run the relevant commands, diagnose failures, and verify the completed local stack. Ask a question only when a genuine external blocker requires a user decision or elevated system permission. Do not ask the user to reconfirm decisions fixed in this prompt.

### 1. Fixed task parameters

```text
PROJECT_NAME=niedax-generator
SOURCE_CONTROL_MODE=local-git-only

OFFLINE_MODE=runtime-only
ALLOW_INTERNET_INGRESS=false
ALLOW_INTERNET_EGRESS_AT_RUNTIME=false
ALLOW_EXTERNAL_DNS_AT_RUNTIME=false
ALLOW_EXTERNAL_TELEMETRY=false
ALLOW_EXTERNAL_CDN=false
ALLOW_REMOTE_DATABASE=false
ALLOW_CLOUD_SERVICES=false

CONTAINER_ORCHESTRATION=docker-compose
DOCKER_COMPOSE_PROJECT_NAME=niedax-generator

LAN_APPLICATION_PORT=8080
LOCAL_DATA_DIRECTORY=./data
DATABASE_BACKUP_DIRECTORY=./data/backups
DATABASE_BACKUP_POLICY=manual-only
DATABASE_BACKUP_RETENTION_DAYS=28
BACKUP_ENCRYPTION=disabled

GATEWAY_IMPLEMENTATION=caddy
FRONTEND_FRAMEWORK=nextjs
BACKEND_FRAMEWORK=fastify
POSTGRES_MAJOR_VERSION=18

GATEWAY_CONTAINER_NAME=niedax-gateway
FRONTEND_CONTAINER_NAME=niedax-frontend
BACKEND_CONTAINER_NAME=niedax-backend
POSTGRES_CONTAINER_NAME=niedax-postgres
MIGRATIONS_CONTAINER_NAME=niedax-migrations
BACKUP_CONTAINER_NAME=niedax-db-backup

FRONTEND_INTERNAL_PORT=3000
BACKEND_INTERNAL_PORT=3001
POSTGRES_INTERNAL_PORT=5432

POSTGRES_DATABASE=niedax_generator
POSTGRES_APPLICATION_ROLE=niedax_generator_app
POSTGRES_MIGRATION_ROLE=niedax_generator_migrator
POSTGRES_BACKUP_ROLE=niedax_generator_backup
POSTGRES_ENCODING=UTF8
POSTGRES_TIMEZONE=Europe/Sofia
POSTGRES_SSL_MODE=disable

COLLEAGUE_ACCESS_MODE=individual-accounts-created-by-admin
PUBLIC_REGISTRATION=false
AUTH_SESSION_STRATEGY=server-side-session

REPOSITORY_DOCUMENTATION_LANGUAGE=english
CODE_AND_FILENAMES_LANGUAGE=english
PRODUCT_UI_LANGUAGES=bg,en
CODEX_FINAL_REPORT_LANGUAGE=bulgarian
```

Interpretation of `runtime-only`:

- The development machine may use the internet while installing dependencies and building/pulling images.
- Once the application stack is running, application code and containers must not require or intentionally contact the public internet.
- Do not add offline pnpm stores, imported image archives, internal registries, or air-gap transfer procedures at this stage.
- Do not add any external font, CDN asset, analytics, telemetry, error-reporting SaaS, cloud API, remote database, update checker, or hosted authentication dependency.
- Disable framework and tool telemetry wherever the selected tools support it.

### 2. Required outcome

Create a reproducible local application foundation where:

- all application services run as Docker containers;
- the stack starts with one documented command;
- the user opens the application locally at `http://localhost:8080`;
- a colleague on the same LAN opens it at `http://<current-LAN-IP>:8080` while the user's computer and containers are running;
- only Caddy publishes a host port;
- Frontend, Backend, PostgreSQL, migrations, and backup tooling are not directly exposed to the host or LAN;
- Caddy provides one same-origin endpoint, routing `/api/*` to Backend and all other requests to Frontend;
- no CORS configuration is required for normal operation;
- PostgreSQL data and backups persist below `./data`;
- users have individual accounts created by an administrator, with no public registration;
- the stack has no runtime dependency on GitHub, Supabase, cloud services, or internet connectivity;
- a new developer can build, start, verify, back up, restore, and stop the application by following the README only.

### 3. Scope boundaries

This stage includes:

- local Git repository initialization and conventions;
- a pnpm TypeScript workspace;
- Next.js App Router Frontend;
- Fastify Backend API;
- a framework-independent calculation-engine package;
- PostgreSQL 18;
- SQL migrations and a migration runner;
- minimal local authentication foundation;
- Caddy gateway;
- Dockerfiles and Docker Compose;
- local-only validation and container integration tests;
- manual database backup/restore tooling;
- documentation and operational commands.

This stage does **not** include:

- GitHub repository creation, GitHub Actions, GHCR, pull requests, or cloud CI;
- public deployment, a public domain, public DNS, Let's Encrypt, or public TLS;
- Kubernetes, Docker Swarm, remote servers, SSH deployment, or container registries;
- Supabase, Firebase, hosted PostgreSQL, SaaS authentication, or external object storage;
- Redis, queues, background workers, pgAdmin, Prometheus, Grafana, MinIO, or monitoring containers;
- the real Niedax catalogue, BOM calculation rules, Excel/PDF export, or full product UI;
- automatic backup scheduling;
- automatic host firewall mutation without explicit user approval.

Do not add out-of-scope components “for later.” Document extension points instead.

### 4. First actions and compatibility checks

1. Inspect the current directory, `git status`, existing files, and every applicable `AGENTS.md`.
2. Determine the host OS, CPU architecture, available CPU, memory, disk, Docker version, Docker Compose version, Node.js version, and pnpm availability.
3. Detect active private IPv4 LAN addresses without hard-coding one. Ignore loopback, Docker bridges, link-local addresses, VPN adapters unless they are the only usable option, and public addresses.
4. Check current official documentation for compatibility among the selected current Next.js, Fastify, Node.js Active LTS, pnpm, TypeScript, Vitest, `pg`, Caddy, Docker Compose, and PostgreSQL 18 versions.
5. Pin exact package versions. Pin base container images to explicit non-floating versions; use immutable image digests when practical and record how to update them.
6. If Docker is missing or unusable, do not install system software without approval. Continue all safe file work and report the exact prerequisite or permission needed.
7. If the current folder contains an existing application, preserve it and implement incrementally. Do not overwrite unrelated work. Stop only for a real conflict that cannot be resolved safely.

### 5. Safety rules

- Never use `git reset --hard`, force push, broad recursive deletion, or destructive cleanup outside explicitly validated project-owned paths.
- Never commit passwords, session secrets, `.env` files, Docker secret files, database data, database dumps, coverage output, build output, or local runtime files.
- Never print passwords, complete database URLs, session secrets, or secret-file contents.
- Never use real secrets as Docker build arguments or image-layer environment variables.
- Do not use PostgreSQL superuser credentials in Frontend, Backend, migration, or backup application code.
- Restrict destructive database commands to the project-owned local PostgreSQL container and exact database name `niedax_generator`.
- Backup restore is destructive. Require an explicit typed confirmation containing both the exact backup filename and database name before replacing data.
- Do not change the host firewall automatically. Generate and document narrowly scoped instructions, then request approval before applying system-level firewall changes.
- Do not claim verification unless the command or test was actually executed.

### 6. Source control

1. Initialize a local Git repository only if the directory is not already one.
2. Use `main` as the local default branch.
3. Do not create a GitHub remote or any other remote.
4. Use Conventional Commits and short-lived local topic branches when appropriate.
5. Create:

   - `.gitignore` covering `./data`, secrets, env files, build outputs, logs, dumps, coverage, and editor/runtime state;
   - `CONTRIBUTING.md` with code, commit, review, migration, and local validation conventions;
   - `AGENTS.md` with architecture boundaries, required validation commands, secret-handling rules, Docker constraints, and migration rules.

6. After all validation succeeds, create one local bootstrap commit such as:

```text
chore(repo): initialize local modular Docker foundation
```

Do not push anywhere.

### 7. Target workspace structure

Create at least this structure, adjusting only for justified output differences from current official generators:

```text
.
├── apps/
│   ├── frontend/
│   │   ├── src/app/
│   │   ├── public/
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── backend/
│       ├── src/
│       ├── tests/
│       ├── Dockerfile
│       ├── package.json
│       └── tsconfig.json
├── packages/
│   └── calculation-engine/
│       ├── src/
│       ├── tests/
│       ├── package.json
│       └── tsconfig.json
├── database/
│   ├── migrations/
│   ├── scripts/
│   ├── tests/
│   ├── Dockerfile.migrations
│   ├── Dockerfile.backup
│   └── README.md
├── catalogue/
│   └── manifest.json
├── rules/
│   └── manifest.json
├── gateway/
│   └── Caddyfile
├── docs/
│   ├── architecture.md
│   ├── authentication.md
│   ├── backups.md
│   ├── conventions.md
│   ├── local-network.md
│   ├── migrations.md
│   ├── operations.md
│   ├── security.md
│   └── versioning.md
├── scripts/
│   ├── setup.*
│   ├── show-access-url.*
│   └── verify-runtime-isolation.*
├── compose.yaml
├── compose.dev.yaml
├── .dockerignore
├── .editorconfig
├── .env.example
├── .gitignore
├── AGENTS.md
├── CONTRIBUTING.md
├── README.md
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

Use cross-platform Node.js scripts where practical. When OS-specific scripts are unavoidable, provide both PowerShell and POSIX shell variants and keep their behavior equivalent.

### 8. Frontend container

1. Create `apps/frontend` with current Next.js, TypeScript, App Router, ESLint, and strict compiler settings.
2. Use the production standalone output suitable for a minimal multi-stage Docker image.
3. The production container must run as a non-root user and listen on `0.0.0.0:3000` inside the container.
4. It must not publish a host port.
5. Do not include database code or database credentials in Frontend.
6. Do not expose Backend location to browser code. Browser API calls must use relative same-origin URLs beginning with `/api/v1`.
7. Do not load fonts, scripts, styles, images, icons, or other assets from the internet. Use system fonts and repository-local assets only.
8. Set `NEXT_TELEMETRY_DISABLED=1` during build and runtime.
9. Create a minimal responsive foundation UI showing:

   - `Niedax Generator`;
   - foundation readiness status;
   - application, catalogue, and calculation-rules versions;
   - signed-in user and role when authenticated;
   - login form when unauthenticated;
   - Bulgarian/English language switch foundation without translating a full product UI.

10. Add container health verification that does not require curl to remain in the final image if a Node-based check is more appropriate.

### 9. Backend container

1. Create `apps/backend` as a strict TypeScript Fastify application.
2. It must listen on `0.0.0.0:3001` inside the container and must not publish a host port.
3. Use structured JSON logs to stdout/stderr. Do not write application logs to persistent files.
4. Provide:

   - `GET /api/v1/health/live` — process liveness, with no database query;
   - `GET /api/v1/health/ready` — readiness including a minimal database connectivity check;
   - `GET /api/v1/version` — application, catalogue, and calculation-rules versions;
   - minimal authentication endpoints required by section 13.

5. Use request/response validation schemas and typed handlers. Return consistent non-sensitive errors.
6. Use `pg` with a bounded connection pool. Read credentials from mounted secret files at runtime.
7. Handle `SIGTERM` and `SIGINT`: stop accepting requests, close the HTTP server, and close the PostgreSQL pool cleanly.
8. Consume `@niedax/calculation-engine` through its public API, proving workspace integration.
9. Do not implement catalogue, routes, supports, anchors, BOM, pricing, or export business logic.
10. The production image must be multi-stage, minimal, non-root, and contain only runtime requirements.

### 10. Calculation engine package

Create `packages/calculation-engine` as a private pure TypeScript workspace package:

- package name `@niedax/calculation-engine`;
- no Next.js, Fastify, React, Docker, database, filesystem, or network dependencies;
- explicit public API through `src/index.ts`;
- strict compiler options;
- deterministic readiness/version export only;
- unit tests proving the public API and rules-version source;
- build output with JavaScript and declarations.

Do not implement engineering formulas at this stage.

### 11. Caddy gateway and LAN access

1. Create a Caddy container using an explicit pinned official image.
2. Publish exactly:

```text
0.0.0.0:8080 -> gateway:8080
```

3. Do not publish ports for Frontend, Backend, PostgreSQL, migrations, or backup.
4. Configure plain HTTP only. Do not configure automatic HTTPS, public certificates, DNS, or external ACME access.
5. Route:

   - `/api/*` to `backend:3001` without changing the API path unexpectedly;
   - all other routes to `frontend:3000`.

6. Add sensible local security headers compatible with HTTP and the minimal application. Do not enable HSTS on plain HTTP.
7. Disable the Caddy admin API unless it is required for health/reload behavior; if retained, keep it unexposed and document why.
8. Do not create permissive `Access-Control-Allow-Origin: *` headers. Same-origin gateway routing is the default.
9. Verify access from:

   - the host via `http://localhost:8080`;
   - the detected private LAN IP via `http://<LAN-IP>:8080`;
   - a second LAN device when the user can perform that final physical-network check.

10. Create `pnpm access:url` that lists usable private IPv4 URLs without exposing public or Docker-interface addresses.
11. Document that a changing DHCP address changes the URL. Do not require a static IP for this stage.
12. Detect the host firewall state. Provide narrowly scoped Windows Firewall and Linux firewall guidance allowing TCP port 8080 from the local subnet only. Do not apply firewall changes without explicit approval.

### 12. Docker Compose topology

Create `compose.yaml` for normal local runtime with these services:

- `gateway` — always running;
- `frontend` — always running;
- `backend` — always running;
- `postgres` — always running;
- `migrations` — one-shot service that completes successfully before Backend becomes ready;
- `backup` — tools-profile service invoked only by manual commands.

Networking requirements:

- only `gateway` publishes port 8080;
- create an edge network for Gateway-to-Frontend traffic;
- create a private backend network for Gateway, Backend, PostgreSQL, migrations, and backup as required;
- PostgreSQL must not share a network directly with Frontend;
- mark application-only networks `internal: true` wherever this remains compatible with published LAN access;
- prevent normal runtime services from having unnecessary public-internet routes;
- if Docker platform behavior prevents a published Gateway port on an internal network, use the smallest viable edge exception and document/test the host-level egress restriction required for the Gateway;
- do not set `network_mode: host`;
- do not mount the Docker socket into any container.

Lifecycle and storage requirements:

- add health checks for PostgreSQL, Backend, Frontend, and Gateway;
- use long-form `depends_on` conditions where supported, but never treat ordering alone as readiness;
- migrations must finish successfully before Backend becomes ready;
- use `restart: unless-stopped` for long-running services;
- do not restart one-shot migrations or backup jobs forever;
- persist PostgreSQL below `./data/postgres` and backups below `./data/backups` as requested;
- create missing project-owned directories safely;
- never let container processes write arbitrary files into the repository outside `./data`;
- use log rotation with Docker `json-file`, maximum size `10m`, maximum 5 files;
- do not set arbitrary CPU or memory limits. Inspect host capacity and document observed usage during verification; recommend limits only if evidence warrants them.

Create `compose.dev.yaml` for development with hot reload while retaining containerized Frontend, Backend, and PostgreSQL. Development overrides may mount source directories but must not overwrite container-owned dependency directories with incompatible host contents.

### 13. Minimal authentication foundation

Implement enough authentication to support individual colleague accounts safely, but no broader identity platform.

1. Create initial database structures for:

   - users;
   - roles `administrator` and `reviewer`;
   - disabled/enabled status;
   - password hash metadata;
   - server-side sessions with expiry and revocation;
   - created/updated timestamps and basic audit attribution where practical.

2. No public registration endpoint or UI may exist.
3. Provide a one-shot local admin command such as `pnpm user:create-admin` that:

   - prompts interactively for username/display name and password;
   - never accepts the password as a command-line argument;
   - never logs the password;
   - refuses weak passwords using a documented local policy;
   - creates the first administrator only when none exists, unless an authenticated administrator explicitly creates another.

4. Provide minimal authenticated flows:

   - login;
   - logout;
   - current session/user;
   - admin-only creation, disabling, and role assignment for users.

5. Use opaque high-entropy session identifiers stored only as hashes in PostgreSQL.
6. Use an `HttpOnly`, `SameSite=Lax` cookie. Because this stage uses LAN HTTP, do not set `Secure` in HTTP mode; document that it must become `Secure` if internal HTTPS is introduced.
7. Protect state-changing requests from CSRF using an appropriate same-origin strategy and explicit validation. Do not rely on CORS alone.
8. Hash passwords with a well-supported memory-hard algorithm available in the selected Node.js runtime ecosystem. Pin the library and document parameters. Never invent cryptography.
9. Add rate limiting for login scoped appropriately for a small LAN deployment without requiring Redis.
10. Do not implement password-reset email, OAuth, MFA, LDAP, Active Directory, or internet-dependent identity features.
11. Make `administrator` and `reviewer` authorization checks explicit and test them.

### 14. PostgreSQL 18 container and roles

1. Use PostgreSQL major version 18 with an explicit pinned container tag/digest.
2. Configure UTF-8 and `Europe/Sofia` timezone.
3. Keep PostgreSQL reachable only by the necessary services on the private Docker network.
4. Use separate least-privilege roles:

   - `niedax_generator_app` for Backend runtime;
   - `niedax_generator_migrator` for schema migrations;
   - `niedax_generator_backup` for read-only backup access.

5. Use a separate initialization/admin credential only for container bootstrap. Do not expose it to application services after initialization.
6. Store secret source files under `./data/secrets`, excluded from Git, with restrictive permissions where supported. Mount them through Docker Compose secrets. Use `_FILE` conventions where supported.
7. Create a safe idempotent `pnpm setup` workflow that:

   - creates required directories;
   - generates cryptographically strong database and session secrets using local cryptographic APIs;
   - never overwrites existing secrets silently;
   - never displays secret values;
   - explains Windows permission limitations when applicable;
   - validates that required secret files exist before startup.

8. Do not commit hard-coded development passwords, including in Compose examples or tests.
9. Provide safe CI/test-only ephemeral credentials inside isolated test commands if necessary; never reuse them for the normal stack.

### 15. SQL migrations

Create a repository-owned TypeScript migration runner using pinned `pg`:

- forward-only SQL files in `database/migrations`;
- UTC timestamp filenames: `YYYYMMDDHHMMSS_description.sql`;
- a `schema_migrations` table storing filename, SHA-256 checksum, and applied timestamp;
- PostgreSQL advisory lock preventing concurrent migration runs;
- lexical application order;
- one transaction per migration by default;
- non-zero exit on the first error;
- failure when an applied migration is missing, renamed, reordered, or modified;
- no secret or full connection-string logging.

Initial migrations may create only foundation structures: migration metadata, authentication/session tables, roles/permissions needed by the minimal foundation, and version metadata. Do not invent the Niedax product schema.

The one-shot migrations container must use only the migration role. Backend startup must not auto-run migrations independently.

Provide:

```text
pnpm db:migrate
pnpm db:status
pnpm db:check
pnpm db:new -- <description>
```

`db:check` must use a separate temporary PostgreSQL 18 container/project, apply all migrations from scratch, rerun with zero pending changes, validate checksums, run database tests, and clean up even after failure.

Do not provide any command capable of resetting the normal persistent database without an explicit destructive confirmation.

### 16. Manual database backups

Backups are manual only. Do not add cron, schedulers, timers, or always-running backup processes.

Implement these stable commands:

```text
pnpm backup:create
pnpm backup:list
pnpm backup:verify -- <backup-file>
pnpm backup:restore -- <backup-file>
pnpm backup:prune
```

Requirements:

- run backup tooling as an ephemeral Compose service under a `tools` profile;
- create PostgreSQL custom-format dumps using PostgreSQL 18 client tools;
- name files with UTC timestamp, database name, and PostgreSQL major version;
- create a SHA-256 checksum sidecar for every backup;
- write only below `./data/backups`;
- do not encrypt backups, per the fixed decision;
- never print backup-role credentials;
- `backup:list` shows timestamp, size, checksum status, and age;
- `backup:verify` verifies checksum and uses appropriate PostgreSQL tooling to validate that the archive is readable;
- `backup:create` prunes successfully verified backups older than 28 days only after a new verified backup succeeds;
- `backup:prune` removes only verified project backup files older than 28 days and requires a clear preview/confirmation;
- `backup:restore` verifies the checksum and archive first, creates a safety backup of the current database, requires typed confirmation containing the exact database and filename, restores through a documented controlled process, reapplies required grants if necessary, and runs readiness/integrity checks afterward;
- failure at any step must preserve the original backup and produce a non-zero exit;
- document that unencrypted backups contain sensitive application data and must remain access-controlled.

Add unit tests for filename/retention/target validation and an integration test using a disposable database, never the persistent normal database.

### 17. Versioning

Implement three independent versions:

1. Application version: SemVer `0.1.0`, single source of truth in root `package.json`.
2. Catalogue version: SemVer `0.1.0`, single source of truth in `catalogue/manifest.json`, initial status `draft`, unknown source edition/hash stored as `null`.
3. Calculation-rules version: SemVer `0.1.0`, single source of truth in `rules/manifest.json`, initial status `draft`.

The Backend version endpoint, Frontend, and calculation-engine public API must consume these sources without duplicated hard-coded values. Add tests for valid SemVer and cross-layer consistency.

Document that future project revisions and BOM snapshots must retain exact catalogue and rules versions.

### 18. Root commands and developer tooling

Use pnpm workspaces without Turborepo. Pin exact Node.js and pnpm versions through committed configuration.

Provide these stable root commands:

```text
pnpm setup
pnpm dev
pnpm start
pnpm stop
pnpm restart
pnpm status
pnpm logs
pnpm access:url
pnpm build
pnpm lint
pnpm format
pnpm format:check
pnpm typecheck
pnpm test
pnpm test:unit
pnpm test:integration
pnpm test:containers
pnpm db:migrate
pnpm db:status
pnpm db:check
pnpm user:create-admin
pnpm backup:create
pnpm backup:list
pnpm backup:verify
pnpm backup:restore
pnpm backup:prune
pnpm validate
pnpm validate:full
```

Command behavior:

- `pnpm dev`: start the containerized development stack with hot reload;
- `pnpm start`: build if required and start the normal detached stack;
- `pnpm stop`: stop containers without deleting PostgreSQL data or backups;
- `pnpm status`: show service health without exposing secrets;
- `pnpm logs`: show bounded recent logs, with follow behavior documented separately;
- `pnpm validate`: formatting check, lint, type-check, unit tests, and package builds;
- `pnpm validate:full`: `validate` plus migration check, image build, container integration tests, runtime-isolation tests, and backup/restore test against disposable data.

Also configure Prettier, ESLint, strict shared TypeScript settings, EditorConfig, Vitest, VS Code recommended extensions/settings/tasks, and Docker ignore files.

### 19. Container hardening

Apply security controls where compatible and test them rather than copying them blindly:

- non-root users for custom application images;
- `read_only: true` for Gateway, Frontend, Backend, migrations, and backup where compatible;
- explicit `tmpfs` for required temporary paths;
- `cap_drop: [ALL]` by default;
- add back only a demonstrated required capability;
- `security_opt: [no-new-privileges:true]`;
- no privileged containers;
- no host PID, IPC, or network namespaces;
- no Docker socket mounts;
- no source-code bind mounts in the normal runtime Compose file;
- health checks with bounded timeouts and retries;
- minimal build contexts and multi-stage images;
- a `.dockerignore` excluding Git history, `data`, secrets, docs not needed at runtime, tests where not required, and build artifacts;
- run vulnerability scanning locally only if a compatible scanner is already installed or can be added without introducing runtime connectivity. Otherwise document it as deferred, not passed.

PostgreSQL may require a writable data volume and specific runtime ownership; document each exception to read-only/non-root policies rather than misrepresenting it.

### 20. Runtime internet isolation

Implement and verify defense in depth:

1. Application layer:

   - no external URLs or SDKs in runtime code;
   - no external fonts/assets/CDNs;
   - telemetry disabled;
   - no remote DNS names in runtime environment variables;
   - no update checks;
   - no cloud services.

2. Docker layer:

   - internal networks where compatible;
   - only Gateway published;
   - no host networking;
   - no unnecessary DNS configuration;
   - no exposed/published database or application ports beyond 8080.

3. Host layer:

   - detect and document the narrow firewall rule required to allow inbound TCP 8080 from the local subnet only;
   - detect and document the egress-control rule needed if Docker's platform-specific networking still gives Gateway outbound access;
   - do not apply system firewall rules without explicit approval.

Create `pnpm test:runtime-isolation` that verifies, as far as the local platform permits:

- the application loads without external network requests;
- no HTML/CSS/JS references external origins;
- Backend, Frontend, PostgreSQL, migrations, and backup cannot reach a known external test address when the host itself has internet access;
- only host port 8080 is published by this Compose project;
- PostgreSQL is inaccessible from the host/LAN port space;
- the stack remains functional after host internet connectivity is temporarily unavailable, when this can be tested safely.

If complete network-level egress blocking requires host firewall approval, report that exact residual risk and do not claim full isolation until the rule is applied and retested.

### 21. Tests

Add meaningful tests for the foundation:

- calculation-engine public API and version consistency;
- Backend liveness/readiness/version endpoints;
- authentication login/logout/session expiry/revocation;
- no public registration;
- admin can create and disable a reviewer;
- reviewer cannot perform administrator actions;
- migration ordering, locking, checksum changes, and idempotent rerun;
- backup filename, checksum, retention, verify, and disposable restore;
- Caddy same-origin routing;
- container health and dependency recovery;
- persistence across `stop` and `start`;
- LAN-style access using the detected host IP;
- no host-published ports other than 8080;
- runtime operation without internet dependencies.

Tests must never modify or delete the normal `./data/postgres` contents. Use uniquely named temporary Compose projects and temporary directories for destructive integration tests.

### 22. Documentation

The English README must be sufficient for a new developer and a non-developer operator. Include:

- purpose and current stage scope;
- architecture and container responsibilities;
- exact prerequisites and supported Docker platforms;
- first-time `pnpm setup`;
- `pnpm start`, `stop`, `status`, and `logs`;
- how to find the LAN URL and share it with a colleague;
- Windows and Linux firewall guidance scoped to TCP 8080 and the local subnet;
- explanation that the computer and Docker must remain running;
- creation of the first administrator and additional reviewer accounts;
- no-public-registration rule;
- persistent data and secret locations;
- manual backup, verify, prune, and restore procedures;
- safe update/rebuild procedure;
- migration workflow;
- runtime internet-isolation model and its platform-specific limits;
- troubleshooting for port conflicts, Docker Desktop/Engine, unhealthy services, changed LAN IP, permissions, migrations, and restore failures;
- full validation commands;
- Definition of Done.

Add focused documentation in `docs/` matching the target structure. Do not include public/cloud deployment instructions.

### 23. Local validation workflow

Perform validation incrementally. Before the local bootstrap commit, run and fix all applicable failures from:

```text
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build
docker compose config --quiet
docker compose -f compose.yaml -f compose.dev.yaml config --quiet
pnpm db:check
pnpm test:integration
pnpm test:containers
pnpm test:runtime-isolation
pnpm validate
pnpm validate:full
```

Then perform this clean operational test:

1. Stop only this Compose project without deleting data.
2. Prepare a fresh temporary project-owned data directory.
3. Run first-time setup without displaying secrets.
4. Build and start the normal stack.
5. Wait for migrations and every health check.
6. Create a temporary administrator through the safe interactive/test mechanism.
7. Verify login and role-protected endpoints.
8. Verify `http://localhost:8080`.
9. Verify the detected private LAN URL from the host and ask the user for a second-device check if physical access is required.
10. Verify only port 8080 is published.
11. Verify persistence across `pnpm stop` and `pnpm start`.
12. Create, list, verify, and restore a backup against disposable test data.
13. Verify retention logic without deleting recent backups.
14. Test runtime isolation.
15. Stop and remove only temporary verification resources; preserve the user's normal data.

Never use `docker compose down -v` against the normal stack as a routine validation or stop command.

### 24. Definition of Done

This stage is complete only when all applicable items are proven:

- local Git repository exists on `main`, with no remote required;
- exact tool and dependency versions are pinned;
- Frontend, Backend, calculation engine, Gateway, PostgreSQL, migrations, and backup tooling are modular and documented;
- normal and development Compose configurations validate;
- all custom images build;
- only Gateway publishes `0.0.0.0:8080`;
- Frontend, Backend, and PostgreSQL are not directly reachable from the host/LAN;
- same-origin Gateway routing works;
- local and detected LAN URLs work from the host;
- second-device LAN verification is either confirmed by the user or explicitly listed as the only physical check remaining;
- the application starts without internet-dependent runtime assets or services;
- telemetry and external runtime calls are absent;
- any host-firewall requirement remaining for complete egress enforcement is clearly identified and not falsely marked complete;
- PostgreSQL 18 persists below `./data/postgres`;
- secrets are generated locally, mounted safely, excluded from Git, and absent from image layers/logs;
- migrations apply from scratch and rerun with no changes;
- administrator and reviewer authorization works, and public registration does not exist;
- backup create/list/verify/restore/prune work against disposable test data;
- manual backups are stored below `./data/backups`, unencrypted, and subject to 28-day pruning rules;
- formatting, lint, type-check, unit, integration, container, migration, and isolation checks pass;
- data survives a normal stop/start cycle;
- README alone is sufficient for first-time setup and daily operation;
- a local bootstrap commit is created without secrets or runtime data;
- no GitHub, cloud, remote server, public deployment, or real Niedax business logic was added.

### 25. Final report

Respond in **Bulgarian** and lead with the outcome. Include:

1. what was created;
2. local branch and commit SHA;
3. detected host OS, architecture, CPU, memory, Docker, and Compose versions;
4. exact selected Node.js, pnpm, Next.js, Fastify, TypeScript, Vitest, `pg`, Caddy, and PostgreSQL image versions;
5. container/service health table;
6. localhost URL and every usable detected private LAN URL;
7. confirmation of published ports and private services;
8. authentication foundation status and how to create the first administrator, without credentials;
9. database persistence, migration, and manual-backup status;
10. status of every validation command;
11. runtime internet-isolation evidence and any firewall approval still required;
12. deviations, blockers, or physical checks requiring the user;
13. concise list of the main files created.

Do not finish with a plan. Complete and verify all safe work. If a step is blocked by Docker availability, system permissions, host firewall approval, or a physical second-device check, finish everything else and state the exact minimum user action required.

### 26. Official sources

When uncertain, use current official documentation only:

- Next.js installation and App Router: https://nextjs.org/docs/app/getting-started/installation
- Next.js deployment and Docker: https://nextjs.org/docs/app/getting-started/deploying
- Fastify TypeScript: https://fastify.dev/docs/latest/Reference/TypeScript/
- Docker Compose: https://docs.docker.com/compose/
- Docker Compose networks: https://docs.docker.com/reference/compose-file/networks/
- Docker Compose secrets: https://docs.docker.com/compose/how-tos/use-secrets/
- Docker container security: https://docs.docker.com/engine/security/
- Caddy reverse proxy: https://caddyserver.com/docs/caddyfile/directives/reverse_proxy
- PostgreSQL 18 documentation: https://www.postgresql.org/docs/18/
- PostgreSQL `pg_dump`: https://www.postgresql.org/docs/18/app-pgdump.html
- PostgreSQL `pg_restore`: https://www.postgresql.org/docs/18/app-pgrestore.html
- pnpm workspaces: https://pnpm.io/workspaces
- Vitest: https://vitest.dev/guide/
- Node.js releases: https://nodejs.org/en/about/previous-releases

---

## Expected outcome

- A modular, locally hosted Docker application foundation.
- One LAN entry point at port 8080 through Caddy.
- Containerized Next.js Frontend, Fastify Backend, PostgreSQL 18, migrations, and manual backup tooling.
- Individual administrator-created accounts with administrator/reviewer roles and no public registration.
- Persistent local data, safe local secrets, manual 28-day backup retention, and no runtime cloud/internet dependency.
- A verified local build ready for the next product-development stage.
