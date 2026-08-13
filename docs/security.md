# Security model

Runtime code has no cloud SDK, external font/CDN, analytics, telemetry, remote database, updater, or
public DNS dependency. Next.js telemetry is disabled at build and runtime. Internal Docker networks,
one published Gateway port, same-origin routing, application CSRF checks, rate limiting, opaque
server sessions, and least-privilege database roles provide layered controls.

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
