# ADR 0007: Structured logging, audit, errors, and correlation

- Status: Accepted
- Date: 2026-08-16

## Context

Security and business mutations need traceability, while public errors and logs must not expose
secrets, uploads, credentials, stack traces, or unnecessary personal data.

## Decision

Use structured JSON log events, one validated/generated correlation ID per inbound operation,
append-only audit events, stable application error codes, and `ErrorEnvelopeV1`. Propagate
correlation through services, jobs, logs, audit, response headers, and errors. Map unexpected errors
to generic `INTERNAL_ERROR`.

## Alternatives considered

- Free-form console strings: rejected because they are difficult to query and redact reliably.
- Raw exception messages in responses: rejected as unstable and unsafe.
- Use operational logs as the audit trail: rejected because rotation and purpose differ.

## Consequences

Handlers and services must use structured logger/audit ports. Audit failure aborts its associated
mutation. Localized UI messages map from stable codes rather than server exception text.

## Follow-up actions

Implement audit storage, retention/access policy, and authorization-failure tests.
