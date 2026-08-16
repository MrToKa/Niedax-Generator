# Stage 3 architecture overview

Status: **Accepted contract; formula and persistence implementation deferred**  
Date: 2026-08-16  
Contract generation: `v1`

## Outcome

Stage 3 turns the Stage 2 proposed input shape into strict, versioned application and calculation
contracts. The contracts deliberately preserve unresolved engineering choices as explicit rule
records, unresolved material states, warnings, and engineering-review requirements. They do not
freeze the Stage 2 product decisions or implement product compatibility, support spacing, anchor
capacity, or BOM quantity formulas.

Detailed contracts: [module boundaries](module-boundaries.md),
[HTTP API v1](api-contracts-v1.md),
[idempotency and transactions](idempotency-and-transactions.md), and
[logging/audit/errors](operational-contract.md).

The decisive boundary is executable today: `@niedax/calculation-engine` accepts a parsed
`CalculationInputV1` composed only of JSON-compatible values and returns a
`CalculationResultV1`. It does not start or import Next.js, React, Fastify, PostgreSQL, a browser,
an ORM, a repository, the filesystem, the network, the clock, or an ID generator. Its Stage 3
implementation returns an honest `contractOnly` result with an engineering-review warning.

## Physical placement

| Location                                     | Ownership                                                                                                           |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `apps/frontend`                              | Presentation, BG/EN resources, React/Next.js UI state, and relative `/api/v1` adapters                              |
| `apps/backend/src/application`               | Use-case interfaces, authorization policy, idempotency, transaction coordination, and infrastructure ports          |
| `packages/domain`                            | Framework-independent domain vocabulary, strict Zod runtime schemas, v1 commands, results, and safe error envelopes |
| `packages/calculation-engine`                | Pure deterministic calculation boundary and future reviewed formulas                                                |
| `packages/catalog-import`                    | Source-row mapping, staging, import validation, and activation-facing contracts                                     |
| `packages/export`                            | Immutable-result-to-English-export-model mapping and renderer ports; never quantity recalculation                   |
| `apps/backend` infrastructure and `database` | HTTP, sessions, PostgreSQL adapters, forward-only migrations, audit and idempotency persistence                     |

## Contract separation

Domain values and transport envelopes are exported by different schema modules even though they
share one dependency-light package:

- `schemas/domain.ts` owns `Project`, `Route`, `Connection`, `Product`, `AssemblyTemplate`, `Rule`,
  `CalculationRun`, `BomLine`, and `Warning`.
- `schemas/v1/calculation.ts` owns only the pure engine input and immutable result contracts.
- `schemas/v1/transport.ts` owns application commands, HTTP-facing responses, catalog import
  diagnostics, export requests, and the error envelope.

UI form state and PostgreSQL rows are intentionally absent. Application adapters map form/HTTP
DTOs to commands and persistence rows to domain values; neither shape may be passed to the engine.

## JSON serialization policy

- Dates are ISO 8601 UTC strings ending in `Z`; JavaScript `Date` objects never cross a boundary.
- Decimal quantities are canonical base-10 strings, such as `"12"` or `"18.5"`, paired with an
  explicit unit. Exponents, `NaN`, infinity, leading zeros, and negative unsigned quantities fail
  validation.
- Intentional absence is `null`. Missing required members and `undefined` are invalid.
- Identifiers are opaque strings. A route `code` is a mutable business identifier and never a
  relationship key.
- All public objects are strict: unknown keys are rejected rather than silently retained or
  stripped.

## Determinism and fingerprinting

The application service resolves all referenced products, assemblies, catalog snapshots, and rules
before calculation. The engine never fetches missing values.

For a calculation fingerprint, the application service:

1. parses `CalculationInputV1` and rejects unknown values;
2. omits `invocation.calculationRunId` and `invocation.inputFingerprint`;
3. sorts object keys lexicographically;
4. sorts semantically unordered arrays by stable ID: routes, connections, products, rules,
   assembly templates, manual BOM inputs, adjustments, line policies, accessories, structures, and
   included item IDs;
5. preserves semantically ordered arrays: geometry order and connection participant order;
6. prefixes the canonical value with the exact engine version;
7. hashes UTF-8 canonical JSON with SHA-256 and serializes it as `sha256:<lowercase hex>`.

The application supplies the run ID and fingerprint in `invocation`; the pure engine echoes them.
Result BOM lines are ordered by category, then product code (null last), source stable ID, and line
ID. Warnings are ordered by code and subject reference. Identical normalized input, snapshot data,
rule data, and engine version therefore produce byte-stable normalized output.

## Lifecycle and immutability

Draft calculation may create or replace a transient `CalculationRun`; it never creates revision
history. `Save revision` is the only operation that commits an explicit durable revision. A saved
revision owns an immutable calculation result and exact catalog/rule snapshot references. Checking,
approval, and archival change lifecycle metadata but do not mutate the saved calculation payload.

Activation changes only the active snapshot pointer. Catalog products, rule records, saved
calculation results, and approved revisions are append-only/immutable once referenced.

## Security and authorization

The browser continues to use same-origin relative `/api/v1` routes. Fastify remains the boundary for
authentication, CSRF, authorization, validation, safe error mapping, and correlation IDs. The
application layer authorizes capabilities, not UI visibility. `revision:approve` is grantable only
to Administrator or Checker permission holders.

The current Stage 1 database calls the second role `reviewer`. Until a forward migration introduces
or renames a role, the authorization adapter may map `reviewer` to the Checker capability set. This
compatibility mapping is an explicit Stage 4 decision, not a domain type leaked into v1 contracts.

## Deferred work

- Engineering formulas and compatibility decisions remain Stage 4+ work.
- HTTP handlers, repositories, idempotency tables, audit tables, snapshot storage, and migrations
  are specified but not implemented in Stage 3.
- CSV/Excel parsing and renderer implementations are deferred; their ports and validated data
  contracts are present.
- Stage 2 `OPEN-01` through `OPEN-10` remain product/engineering decisions. Stage 3 represents them
  safely and does not claim they are resolved.
