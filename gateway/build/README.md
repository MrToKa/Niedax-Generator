# Gateway build inputs

The gateway rebuilds the upstream Caddy `v2.11.4` entrypoint with its standard
modules and embedded time zone data. It adds no plugins. The exact Go `1.26.8`
Alpine `3.23` compiler image is pinned in `../Dockerfile`; automatic toolchain
downloads are disabled.

The committed `go.mod` and `go.sum` retain the dependency graph, including the
compatible security fixes for `google.golang.org/grpc` `v1.83.2`, the affected
OpenTelemetry trace modules and SDK `v1.45.0`, and log exporter and SDK
`v0.21.0`. Go's minimum version selection also retains their required compatible
dependencies, including `golang.org/x/text` `v0.41.0`. These existing standard
modules enable no new telemetry endpoint or plugin. Go verifies downloaded module checksums with the
official checksum database, runs `go mod verify`, and builds with
`-mod=readonly`, `-trimpath` and `CGO_ENABLED=0`. Build tools and source are absent
from the final runtime stage.

The runtime retains the pinned official Caddy base and its container defaults.
The freshly compiled binary has no file capability, which the Docker build
checks. Port `8080` requires no `cap_net_bind_service`. The runtime user,
read-only filesystem, dropped capabilities, `no-new-privileges`, network
boundaries and sole published gateway port remain defined by Compose.

Validation must compare the rebuilt Caddy version and complete module list with
the official release, validate the actual Caddyfile, run `pnpm validate:full`,
exercise browser traffic, and scan the exact final runtime image identities.
Dependency patches and a successful build do not waive other image findings.

The entrypoint follows the [official Caddy v2.11.4 source](https://github.com/caddyserver/caddy/blob/v2.11.4/cmd/caddy/main.go).
Its original copyright and Apache 2.0 license attribution are retained.
