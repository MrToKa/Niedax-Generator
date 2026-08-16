# ADR 0006: Idempotency, optimistic concurrency, and transactions

- Status: Accepted
- Date: 2026-08-16

## Context

Network retries must not duplicate revisions or approvals, while concurrent draft edits and status
changes must not silently overwrite each other. Calculation must not hold database locks during
formula execution.

## Decision

Require scoped idempotency keys for mutations, store canonical request hashes with outcomes, and use
draft/revision expected versions. Use PostgreSQL `READ COMMITTED`, explicit row locks, unique
constraints, and short transactions. Calculate outside a long transaction; save revision and
approval commit their complete business mutation and audit event atomically.

## Alternatives considered

- Last-write-wins: rejected because stale engineering input could be approved.
- One transaction around formula/export work: rejected due to long locks and failure coupling.
- Idempotency by fingerprint alone: rejected because different operations can legitimately share a
  calculation fingerprint.

## Consequences

Clients must retain idempotency keys for retries and expected versions for edits. Infrastructure
needs idempotency and audit persistence. Pure calculation remains safely retryable.

## Follow-up actions

Add forward-only migrations and concurrency integration tests with the application implementation.
