# Architecture

The browser reaches Caddy over plain local HTTP on port 8080. Caddy retains API paths and proxies
`/api/*` to Fastify; all other paths go to Next.js. This creates one same-origin security boundary
and avoids CORS. Frontend knows only relative `/api/v1` URLs and contains no PostgreSQL code.

The internal edge network contains Gateway and Frontend. The internal backend network contains
Gateway, Backend, PostgreSQL, migrations, and the on-demand backup image. Frontend never shares a
network with PostgreSQL. On Docker Desktop, Gateway additionally joins a non-internal ingress-only
bridge because published ports are not forwarded from containers attached exclusively to internal
networks. No other service joins it, and only Gateway has a published port.

Backend owns validation, authentication, authorization, sessions, and bounded database pooling.
The calculation engine is pure TypeScript with no framework, database, filesystem, or network
dependency. Version manifests are independent sources for application, catalogue, and calculation
rules. Catalogue/BOM/routing/formula/export behavior is an explicit later extension point.
