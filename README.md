# Niedax Generator

Niedax Generator is currently a local-only modular application foundation. It provides a responsive
Next.js shell, a Fastify API, a pure calculation-engine package, PostgreSQL 18 authentication data,
forward-only migrations, a Caddy same-origin gateway, and manual backup tools. It intentionally does
not contain the real catalogue, engineering calculations, BOM logic, pricing, or export features.

## Architecture and access

Open `http://localhost:8080`. A colleague on the same private LAN can use an address printed by
`pnpm access:url` while this computer and Docker remain running. DHCP can change that LAN address.

Only Caddy binds `0.0.0.0:8080`. It sends `/api/*` to Fastify without rewriting the path and all
other requests to Next.js. Frontend is connected only to the internal edge network; PostgreSQL is
connected only to the internal backend network. Backend, migrations, and backup tools also use that
private backend network. No CORS policy is needed because browser requests remain same-origin.

| Service      | Responsibility                          | Host port | Lifecycle              |
| ------------ | --------------------------------------- | --------- | ---------------------- |
| `gateway`    | Caddy HTTP routing and security headers | `8080`    | long-running           |
| `frontend`   | Next.js App Router UI                   | none      | long-running           |
| `backend`    | Fastify API, sessions, authorization    | none      | long-running           |
| `postgres`   | PostgreSQL 18 local persistence         | none      | long-running           |
| `migrations` | checksum-protected forward SQL          | none      | one-shot               |
| `backup`     | PostgreSQL 18 dump/restore client       | none      | manual `tools` profile |

More detail is in [architecture](docs/architecture.md), [security](docs/security.md), and
[operations](docs/operations.md).

## Prerequisites

- Windows 11 with Docker Desktop (Linux containers), or a current Linux Docker Engine
- Docker Engine with Compose v2 supporting long-form dependency conditions and Compose secrets
- Node.js `24.19.0` (Node 24 Active LTS) and pnpm `11.21.0`
- At least 8 GiB RAM and enough disk for images plus `data/postgres` and backups

Enable the pinned package manager with `corepack enable pnpm`. On a locked-down Windows Node
installation this may require an elevated terminal because Corepack writes the shim beneath Program
Files. Without that shim, every documented `pnpm ...` command has an equivalent
`corepack pnpm ...` form and uses the same pinned release.

The repository pins Next.js `16.3.0`, Fastify `5.11.3`, TypeScript `6.0.3`, Vitest `4.1.10`, `pg`
`8.23.0`, Caddy `2.11.4`, and PostgreSQL `18.4`. Image tags also include immutable multi-platform
digests. See [versioning](docs/versioning.md) for the reviewed update process.

## First start

```text
pnpm install --frozen-lockfile
pnpm setup
pnpm start
pnpm status
pnpm access:url
```

`pnpm setup` safely creates `data/postgres`, `data/backups`, and strong, non-overwritten secrets in
`data/secrets`. It never prints values. On Windows, keep the directory protected by the current
user's NTFS ACL because POSIX file modes do not apply. `pnpm start` builds missing images, starts the
stack detached, waits through Compose health dependencies, and never deletes persistent data.

Daily commands:

```text
pnpm stop       # stop/remove project containers; preserve data and backups
pnpm restart
pnpm status
pnpm logs       # bounded last 200 lines; use `docker compose logs --follow` explicitly to follow
pnpm dev        # containerized hot reload; Ctrl+C stops the foreground view
```

Never use `docker compose down -v` against the normal project. The database uses a bind mount rather
than a named volume, but broad destructive cleanup remains unsafe.

## Accounts and authentication

There is no registration route or registration UI. Create the first administrator after the stack is
healthy:

```text
pnpm user:create-admin
```

The command prompts for username, display name, and a hidden password; it never accepts a password
argument and refuses to create a first administrator if one already exists. Passwords need at least
14 characters with lower/upper case, a digit, and a symbol, and cannot contain the username.
Administrators create or disable colleagues and assign the explicit `administrator` or `reviewer`
role through the protected API. See [authentication](docs/authentication.md).

## Database and migrations

PostgreSQL data persists below `data/postgres`. The bootstrap superuser, application, migration, and
backup credentials are separate. Runtime Backend uses only `niedax_generator_app`; the one-shot
runner uses only `niedax_generator_migrator`; dumps use read-only
`niedax_generator_backup` privileges.

```text
pnpm db:status
pnpm db:migrate
pnpm db:new -- describe_change
pnpm db:check
```

`db:check` creates an isolated PostgreSQL 18 Compose project with ephemeral random credentials,
applies migrations from scratch, reruns with no pending work, validates history/checksums, executes
database assertions, and cleans up its own temporary volume. It never touches `data/postgres`.

## Manual backups

Backups are manual, unencrypted, and may contain sensitive data. Restrict access to `data/backups`.
Every dump is PostgreSQL 18 custom format with a SHA-256 sidecar:

```text
pnpm backup:create
pnpm backup:list
pnpm backup:verify -- 20260813T120000Z_niedax_generator_pg18.dump
pnpm backup:prune
pnpm backup:restore -- 20260813T120000Z_niedax_generator_pg18.dump
```

A successful create prunes only checksum-valid files older than 28 days. Manual prune previews and
requires `PRUNE niedax_generator`. Restore verifies the target, requires typing the exact database
and filename, stops application writers, creates a safety backup, restores as the migration owner,
checks migration metadata, and restarts the application. Details are in [backups](docs/backups.md).

## LAN firewall

The application listens on all host interfaces, but the host firewall may still block a colleague.
First find the private subnet (`Get-NetIPAddress` on Windows or `ip route` on Linux), then review the
narrow commands in [local network](docs/local-network.md). They permit inbound TCP 8080 only from
that subnet. No setup command changes the firewall. Applying a system rule requires administrator
approval. A second physical LAN device is the final real-network check.

## Validation

```text
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

`test:containers` checks health, same-origin routing, LAN-style host access, published ports, and
persistence across a normal stop/start. `test:runtime-isolation` scans runtime sources/assets,
probes egress from every image on internal networks, verifies the published-port boundary, and
rechecks readiness. `test:backup-integration` uses a disposable PostgreSQL project and temporary
backup directory.

## Safe updates

1. Create a local topic branch and update exact package versions and image tags/digests together.
2. Review official compatibility and security notes; never switch to floating tags.
3. Run `pnpm install` to intentionally update `pnpm-lock.yaml`.
4. Create forward-only migrations where needed and run `pnpm validate:full`.
5. Make and verify a manual backup before rebuilding an established database.
6. Run `pnpm stop`, then `pnpm start`; do not delete `data`.

## Troubleshooting

- Port conflict: `Get-NetTCPConnection -LocalPort 8080` (Windows) or `ss -ltnp 'sport = :8080'`
  (Linux), then stop the unrelated listener. Do not publish another application port.
- Docker unavailable: start Docker Desktop/Engine and confirm `docker version` plus
  `docker compose version` work in the same terminal.
- Unhealthy service: run `pnpm status`, then `pnpm logs`; inspect the first unhealthy dependency.
- Changed LAN URL: rerun `pnpm access:url`; DHCP addresses are intentionally not hard-coded.
- Permission failure: protect `data/secrets`, ensure Docker Desktop can share the workspace drive,
  and do not run containers from a network share.
- Migration failure: use `pnpm db:status` and logs. Never edit an applied SQL file or reset the
  persistent database; add a corrective forward migration.
- Restore failure: retain both the target and its checksum, fix the reported validation issue, and
  use the automatically created safety backup if recovery is needed.

## Definition of Done for this stage

The stage is done when exact versions and images build, migrations apply and rerun cleanly, all
validation passes, only Caddy publishes 8080, local and host-side LAN URLs work, authentication role
tests pass with no registration, data survives stop/start, disposable backup/restore passes,
application and data services have no public egress or external assets, README operations are
reproducible, and the only remaining physical check is confirmed access from a second LAN device.
No cloud, GitHub remote,
hosted service, public deployment, or Niedax product business logic belongs in this stage.
