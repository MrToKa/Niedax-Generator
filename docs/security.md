# Security model

Runtime code has no cloud SDK, external font/CDN, analytics, telemetry, remote database, updater, or
public DNS dependency. Next.js telemetry is disabled at build and runtime. Internal Docker networks,
one published Gateway port, same-origin routing, application CSRF checks, rate limiting, opaque
server sessions, and least-privilege database roles provide layered controls.

## Authorization and object access

The backend is the authority for every action. One table-driven capability policy defines all four
roles, while resource-aware decisions add project ownership and revision lifecycle state. Fastify
handlers authenticate and parse strict requests; application services enforce capabilities before a
use case; PostgreSQL repository predicates independently limit rows before reads, idempotency replay,
or mutation. UI visibility and backend-provided action hints are presentation aids, not security
boundaries.

The accepted local-MVP visibility scope is explicit: Designer sees owned projects only; Reviewer and
Viewer may read all projects and their non-sensitive revision history; Administrator may read and
mutate across projects. Reviewer still cannot alter, validate, calculate, or save another user's
draft. Viewer has no mutation capability. Only Reviewer and Administrator can check or approve a
revision, and only Administrator can administer accounts or catalog lifecycle. The repository has no
assignment model, so no implicit sharing or assignment claim is made.

Owner-scoped queries apply the ownership predicate in SQL. When a Designer requests a foreign object,
the backend returns the same `404 RESOURCE_NOT_FOUND` used for an absent object, preventing an IDOR
probe from confirming hidden project existence. Roles with the documented all-project read scope can
receive only the bounded public project/revision representation; Viewer never receives account,
session, credential, password, or administrative-security audit data. Retained-v1 projects use a
metadata-only access lookup so history can be read without fabricating a v2 draft, actor, or approval
readiness.

Authenticated identity responses contain server-derived effective public capabilities. Request
bodies do not accept role claims, capabilities, actor IDs, approval actors, or session authority.
Disabling an account and changing a role revoke that account's sessions transactionally, and every
later request resolves the current enabled database user. This prevents stale-cookie vertical
privilege escalation.

PostgreSQL narrows the application role on `users` to role/enabled/audit-attribution updates and on
`sessions` to revocation/last-seen updates; it cannot update arbitrary identity/session fields or
delete/truncate either table. Deferred guards couple every role/status change to matching append-only
audit evidence and required session revocation. User administration, catalog mutation, revision
lifecycle, approval, and rejection-audit writes recheck a current enabled actor under a database
share lock; service-only role claims cannot bypass that boundary.

All state-changing routes pass the global same-origin check: `X-Niedax-CSRF: 1` must be present and
the `Origin` host must equal the effective request host. This applies even when a hidden UI action is
invoked directly. Mutations additionally keep their domain concurrency/idempotency checks; a CSRF or
authorization rejection reaches no protected business mutation.

Critical user-administration and revision lifecycle changes write safe append-only audit evidence in
the same transaction as the successful state change. Database triggers and privileges reject audit
updates/deletes. Snapshots retain the historical actor role and display data but exclude passwords,
password hashes, credentials, cookies, tokens, session hashes, complete request bodies, and
unbounded mutable metadata.

Denied revision/user actions and a visible-project Save denial also leave bounded append-only
rejection evidence without mutating protected business state. Expected stale/invalid Check and
Approve failures commit exactly one rejection tombstone while their locks are held, closing the
retry/state-advance race. Revision tombstones store only SHA-256 attempt and canonical-request
digests plus a bounded reason/actor snapshot: an exact retry preserves the original rejection and a
different request under that attempt identity conflicts. Raw request bodies, passwords, cookies,
tokens, and session hashes are never audit metadata.

Custom images run non-root with read-only root filesystems, dropped capabilities, no-new-privileges,
and bounded writable tmpfs. Gateway is non-root. PostgreSQL is the documented exception: its official
entrypoint begins with the minimal ownership/setuid capabilities needed to initialize the writable
bind mount, while its remaining root filesystem is read-only. No service is privileged, uses host
namespaces, or mounts the Docker socket.

Secrets originate only below ignored `data/secrets`, are mounted through Compose secrets, and never
enter browser bundles, build arguments, committed env files, or logs. SQL connections use separate
application/migration/backup roles; only the official database container receives its bootstrap
credential.

Docker Desktop requires Gateway alone to join a non-internal ingress bridge for published port 8080;
the internal edge and backend networks remain the service paths. This leaves a network-level Gateway
egress route until an administrator approves a platform-specific host firewall rule. Caddy has no
external targets, and the isolation test reports this residual explicitly rather than claiming full
network isolation.

Docker Scout `1.18.3`, already installed as a Docker CLI plugin, scanned every runtime image on
2026-08-13 for critical and high findings. No scanner or network dependency was added to the
runtime stack. The results are recorded as findings, not as a clean/pass claim:

| Runtime image             | Critical | High | Notes                                                                                                                                 |
| ------------------------- | -------: | ---: | ------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend                  |        0 |    0 | Unused npm/Corepack tooling is absent from the runtime layer.                                                                         |
| Backend                   |        0 |    0 | Unused npm/Corepack tooling is absent from the runtime layer.                                                                         |
| Migrations                |        0 |    0 | Unused npm/Corepack tooling is absent from the runtime layer.                                                                         |
| Gateway                   |        0 |    2 | Findings are in the Go standard library and gRPC embedded in current Caddy `2.11.4`; the unused vulnerable curl package was removed.  |
| PostgreSQL official image |        4 |   21 | Upstream `libcurl` and `gosu` findings in the pinned PostgreSQL `18.4-alpine3.23` image.                                              |
| Backup                    |        3 |    5 | The unused `gosu` binary was removed; the remaining finding is the PostgreSQL image's `libcurl`, required by its runtime package set. |

PostgreSQL is not published and the backup client can reach only the internal database network, so
these findings do not create a public listener. They remain actionable upstream risk: re-scan and
advance the pinned Caddy/PostgreSQL digests when rebuilt official images contain the fixes. Do not
silence them or treat network isolation as a vulnerability waiver.
