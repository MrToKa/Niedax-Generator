# Stage 12 security remediation and remaining review

The final [local verification record](stage12-local-verification.json) binds actual
immutable TEST images to the source, build and offline scan. Base-image scans and
dependency audits have separate scopes. A successful package audit cannot establish
an accepted runtime-image security disposition.

## Changes implemented

- Next.js and its ESLint configuration move to `16.3.6`. Compatible same-major
  transitive dependency fixes are locked in `pnpm-lock.yaml`; the existing export
  dependency exception retains its documented scope.
- Node.js build/runtime bases and the portable local validation runtime move to
  `24.21.0`. PostgreSQL bases move to `18.6`, retaining PostgreSQL major 18 and its
  persistent data. Official image digests are pinned.
- The gateway rebuilds standard Caddy `2.11.4` with pinned Go `1.26.8`, locked
  `grpc 1.83.2`, OpenTelemetry trace/SDK `1.45.0` and logs `0.21.0`, with their
  compatible dependency closure including `x/text 0.41.0`. These retained standard
  module dependencies enable no telemetry configuration or extra plugin. The
  [build inputs](../../gateway/build/README.md) retain the full dependency graph.
  Runtime tools/source are absent. The gateway uses port 8080, so the new binary
  needs no file capability. Compose retains its runtime user, capability drops,
  read-only filesystem, `no-new-privileges` and network boundaries.
- The source fingerprint includes Go source, `go.mod`, `go.sum` and the Node pin.
  It rejects linked paths and multiply-linked files before reading source.

The failed security attempt is retained with the other failed aggregate records.
No expected calculation outputs, formulas or golden workbook were regenerated.

## Actual assessment and residual finding

Grype `0.119.0` uses its checksum-verified official executable and a hash-verified
public database built on 2026-09-30. Final scans operate in a network-disabled,
read-only, unprivileged helper with no Docker socket, exclusions or ignore rules.
Image archives and inventories are processed locally; they are not uploaded.
Actual per-image findings and database identity are in the local verification record.

The official Alpine 3.23 bases retain zlib `1.3.2-r0`, matched as High
`CVE-2026-85091`. The
[maintainer fix](https://github.com/madler/zlib/commit/df84af25dc1942490e1d1c899a07619152a46148)
addresses stale input state after a nonblocking gzip write stalls. The observed
[distribution build recipe](https://raw.githubusercontent.com/alpinelinux/aports/3.23-stable/main/zlib/APKBUILD)
does not carry that patch. Generic compression use alone does not prove whether
the affected API sequence is reachable in this application.

A bounded read-only review found that the
[Node 24.21 binding](https://raw.githubusercontent.com/nodejs/node/v24.21.0/src/node_zlib.cc)
uses buffer-based `deflate()` for its built-in gzip path. The actual backup command
uses `pg_dump --format=custom --compress=6`; the reviewed
[PostgreSQL 18.6 custom archive](https://raw.githubusercontent.com/postgres/postgres/REL_18_6/src/bin/pg_dump/pg_backup_custom.c)
and [gzip compressor](https://raw.githubusercontent.com/postgres/postgres/REL_18_6/src/bin/pg_dump/compress_gzip.c)
use `deflate()` and the archive write callback. PostgreSQL also contains a separate
`gzwrite` file API. The
[Caddy gzip module](https://raw.githubusercontent.com/caddyserver/caddy/v2.11.4/modules/caddyhttp/encode/gzip/gzip.go)
uses Go compression. These observations do not establish application-wide
non-reachability across installed binaries, native addons or all dependencies.
They leave the High finding and required security decision unchanged.

No custom zlib package was installed and no unexecuted backport test was treated
as proof. An experimental verification task was rejected by platform cybersecurity
review before execution; that path was stopped. The finding remains visible.
Absence of a supported fixed package and an attributable security decision keeps
S12-B02 open. Network isolation does not change the scanner severity.

Alpine BusyBox `1.37.0-r30` also has three Medium scanner matches for
`CVE-2025-60876` (`busybox`, `busybox-binsh` and `ssl_client`). The
[Alpine tracker](https://security.alpinelinux.org/vuln/CVE-2025-60876) and inspected
[vendor recipe](https://raw.githubusercontent.com/alpinelinux/aports/1e823a60eb85606954b3a5af5f8e5bbd1ea680cf/main/busybox/APKBUILD)
provide no verified supported fix for that package. The wget healthcheck uses a
literal loopback URL; that bounds its configured input but does not establish
universal non-reachability. These findings remain visible in the final scan.

## Accountable completion

The security/technical owner must review the exact six image identities, advisory
matches, affected APIs and operational context. Adopt a verified supported fix when
available and rerun affected checks and exact-image scans. A disposition requires
the real reviewer, date and evidence; this document supplies no approval or waiver.
