# ADR 0001: Module boundaries and dependency direction

- Status: Accepted
- Date: 2026-08-16

## Context

The repository already separates Next.js, Fastify, PostgreSQL, and a calculation package. Stage 3
needs enforceable ownership for domain contracts, application orchestration, catalog import, and
export without introducing formulas or persistence prematurely.

## Decision

Use `apps/frontend` for presentation, backend application ports for use cases, and separate
`@niedax/domain`, `@niedax/calculation-engine`, `@niedax/catalog-import`, and `@niedax/export`
packages. Dependencies point toward domain contracts. Infrastructure implements application ports;
the calculation engine may depend only on pure domain contracts and the reviewed rules manifest.

## Alternatives considered

- Put all logic in Fastify: rejected because it couples formulas and contracts to HTTP/database.
- Share frontend form types: rejected because UI state is mutable and transport-specific.
- Create one large common package: rejected because import/export/orchestration ownership would be
  ambiguous.

## Consequences

Package APIs and mapping code are explicit. Additional workspace packages add small build overhead.
Architecture tests guard the highest-risk calculation boundary.

## Follow-up actions

Implement adapters behind application ports and extend dependency checks as the graph grows.
