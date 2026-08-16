# Logging, audit, correlation, and errors

## Structured logging

Application and infrastructure logs are JSON events. Each event has at least timestamp, level,
event name, operation, correlation ID, outcome, and bounded entity identifiers. Relevant optional
fields include actor ID, project ID, revision ID, calculation run ID, snapshot IDs, duration, and
stable error code.

Never log passwords, session tokens or hashes, CSRF values, secret paths/contents, database
credentials, full uploaded files, complete catalog rows, export bytes, stack traces in public
responses, or unnecessary personal data. Request bodies are not logged by default. Unexpected
exceptions may be attached to protected server logs through Fastify's structured error serializer,
but their messages are not copied into API envelopes.

## Correlation IDs

The Fastify boundary validates a trusted inbound `X-Correlation-ID`; otherwise it generates an
opaque value. The ID is inserted into the application command and propagated through service calls,
repository operations, structured logs, audit events, asynchronous job metadata, response headers,
and `ErrorEnvelopeV1`. The calculation engine does not log; correlation belongs to orchestration,
not formula input or result hashing.

## Immutable audit trail

Audit events are append-only and stored in the same transaction as successful business mutations.
They identify actor, UTC time, correlation ID, action, entity type/ID, outcome, and stable reason
code without storing secret or bulky payload content.

Required successful events:

- project creation and material draft edit;
- calculation execution metadata, including engine version, fingerprint, and snapshot IDs;
- explicit revision save;
- manual BOM addition, removal, and quantity/spare/package override;
- catalog and rule activation;
- revision check and approval.

Rejected authorization and invalid transition attempts produce security/audit events when doing so
does not reveal a hidden resource. These rejection events may commit independently because no
business mutation is committed. Routine field-validation mistakes need structured operational logs
but not an immutable security audit record unless policy requires it.

## Error taxonomy

| Code                         | Class          | Public meaning                                            |
| ---------------------------- | -------------- | --------------------------------------------------------- |
| `VALIDATION_FAILED`          | Client input   | One or more safe structured field issues                  |
| `CONFLICT_STALE_VERSION`     | Concurrency    | Expected draft/revision/fingerprint no longer matches     |
| `INVALID_STATE_TRANSITION`   | Lifecycle      | Requested status change is not allowed                    |
| `AUTHENTICATION_REQUIRED`    | Authentication | No valid session                                          |
| `FORBIDDEN`                  | Authorization  | Actor lacks the required capability                       |
| `RESOURCE_NOT_FOUND`         | Lookup         | Resource is absent or intentionally hidden                |
| `CATALOG_SNAPSHOT_MISSING`   | Resolution     | Required immutable catalog snapshot cannot be resolved    |
| `RULE_SNAPSHOT_MISSING`      | Resolution     | Required immutable rule snapshot cannot be resolved       |
| `UNSUPPORTED_SCHEMA_VERSION` | Contract       | Payload version is unsupported                            |
| `IDEMPOTENCY_KEY_CONFLICT`   | Idempotency    | Key was reused for different canonical input              |
| `CALCULATION_FAILED`         | Use case       | Calculation could not produce a valid result              |
| `CATALOG_IMPORT_FAILED`      | Use case       | Upload, parse, staging, or validation failed unexpectedly |
| `EXPORT_FAILED`              | Use case       | Export model/rendering failed                             |
| `INTERNAL_ERROR`             | Unexpected     | Generic safe server error                                 |

Domain/application errors are stable codes with curated English API messages; the BG/EN UI maps
codes to localized text. `details` is a strict discriminated union for validation, conflict, or
state-transition context. Arbitrary exception data and broad key/value detail bags are forbidden.

## Audit versus calculation provenance

Audit answers who performed a business action and when. Calculation provenance explains which
project inputs, product snapshot, assembly template, rules, and manual changes produced each BOM
line. They are linked by stable IDs and fingerprint but remain separate records so neither becomes
an unbounded log of the other.
