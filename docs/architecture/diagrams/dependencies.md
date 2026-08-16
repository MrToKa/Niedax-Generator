# Allowed dependency direction

```mermaid
flowchart LR
  Browser[Browser]
  Gateway[Caddy gateway]
  Web[apps/frontend\nWeb presentation]
  HTTP[apps/backend\nFastify HTTP adapters]
  App[Application services]
  Domain[packages/domain\nJSON contracts + Zod schemas]
  Engine[packages/calculation-engine\nPure formulas]
  Import[packages/catalog-import\nMapping + validation contracts]
  Export[packages/export\nImmutable export mapping]
  Infra[Backend infrastructure\nrepositories, files, hashing]
  DB[(PostgreSQL)]

  Browser --> Gateway
  Gateway --> Web
  Gateway --> HTTP
  Web -->|relative /api/v1 only| HTTP
  HTTP --> App
  HTTP --> Domain
  App --> Domain
  App --> Engine
  App --> Import
  App --> Export
  Infra -. implements ports .-> App
  Infra --> DB
  Engine --> Domain
  Import --> Domain
  Export --> Domain
```

The dashed arrow is dependency inversion: infrastructure depends on application port definitions.
The application layer does not import PostgreSQL implementations. No arrow may point from the
calculation engine to web, application, infrastructure, database, import, or export modules.
