# ADR 0003: Server Actions versus versioned HTTP API

- Status: Accepted
- Date: 2026-08-16

## Context

Operations include browser forms, reusable calculation commands, catalog file upload, binary export
download, authorization, idempotency, and future local integrations. The deployed backend is a
separate Fastify service behind Caddy.

## Decision

Use relative versioned `/api/v1` HTTP endpoints for all durable business operations. Use internal
application-service interfaces behind handlers. Reserve Server Actions for presentation-only
browser mutations and never make them the sole path to project, calculation, revision, catalog, or
export behavior.

## Alternatives considered

- Server Actions for every mutation: rejected because uploads/downloads, machine clients, and the
  existing backend boundary would be awkward or duplicated.
- HTTP for all UI-only state: rejected because transient display state needs no server contract.
- Direct service calls from React server components: rejected because the frontend service has no
  database/auth ownership.

## Consequences

One Fastify boundary owns security, validation, correlation, and observability. The frontend remains
same-origin and presentation-only. HTTP adapters must map rather than leak transport objects inward.

## Follow-up actions

Implement handlers from `api-contracts-v1.md` and publish generated OpenAPI only after schemas and
security mapping are wired.
