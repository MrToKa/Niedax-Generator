# ADR 0004: Runtime validation and schema versioning

- Status: Accepted
- Date: 2026-08-16

## Context

The repository had JSON Schema snippets in Fastify but no shared TypeScript-first runtime library.
Stage 3 requires discriminated unions, reusable strict schemas, type drift prevention, and useful
boundary diagnostics.

## Decision

Adopt exact dependency `zod@4.4.3` in `@niedax/domain`. Infer TypeScript types from schemas. Use an
API major in the URL and a literal `schemaVersion` in each payload. All public objects are strict and
reject unknown keys. Breaking changes create a new schema/API major; retained v1 data remains
readable.

## Alternatives considered

- Hand-maintained Fastify JSON Schema plus interfaces: rejected due to duplicated shapes and drift.
- Validation only in HTTP handlers: rejected because unit tests and internal/application boundaries
  need the same contract.
- Silently strip unknown keys: rejected because misspellings could change engineering input without
  an actionable error.

## Consequences

One small pure runtime dependency is added. Zod errors must be mapped to stable safe validation
issues instead of exposed directly. Fastify may generate or adapt JSON Schema but the Zod contracts
remain authoritative.

## Follow-up actions

Add HTTP adapter tests for error mapping and unsupported versions.
