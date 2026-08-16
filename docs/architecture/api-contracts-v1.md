# Versioned HTTP API and operation contracts

Status: **Accepted Stage 3 contract; handlers are not implemented in this stage**  
Base path: `/api/v1`  
Media type: `application/json` except upload and download operations

## Boundary choice

The existing deployment has a dedicated Fastify backend and requires the frontend to call relative
`/api/v1` URLs. Durable business operations therefore use versioned HTTP endpoints. This gives file
upload/download, machine-readable contracts, one authentication/authorization boundary,
idempotency, correlation, and a reusable path for future local integrations.

Next.js Server Actions are reserved for future browser-only presentation mutations that neither
persist business data nor need reuse outside one page. They must call the same application service
or HTTP contract and may not contain authorization, formulas, catalog import, revision, or approval
logic. No Stage 3 business operation is assigned exclusively to a Server Action.

Fastify handlers are transport adapters. They validate HTTP details, resolve the authenticated
actor, create the command correlation metadata, call an application-service interface, and map
errors. Internal application calls use the same command/service interfaces but do not pretend to be
HTTP requests.

## Common HTTP rules

- `X-Correlation-ID` may be accepted only when it is 8-128 safe identifier characters and the
  ingress is trusted. Otherwise the HTTP boundary generates one. The validated value is inserted
  into the application command and returned in `X-Correlation-ID` and response/error JSON.
- Mutating operations marked idempotent require `Idempotency-Key` (8-128 safe identifier
  characters). The adapter inserts it into the application command. Reusing a key with different
  canonical request bytes returns `409 IDEMPOTENCY_KEY_CONFLICT`.
- `X-Niedax-CSRF: 1`, same-origin validation, and the session cookie remain mandatory for browser
  mutations. Machine authentication is not introduced by Stage 3.
- The request-schema column names the runtime application command after trusted headers and actor
  context have been mapped. The JSON body is the same object except `correlationId` and
  `idempotencyKey` come from headers and must not be trusted from body data.
- No response exposes a database row, ORM object, stack trace, exception text, secret, or uploaded
  file contents.

## Versioning and unknown keys

The URL carries the public API major version. Every JSON command/result also carries a literal
`schemaVersion`, for example `calculation-input/v1`. All Zod object schemas use strict mode and
reject unknown keys. An unsupported literal returns `422 UNSUPPORTED_SCHEMA_VERSION`.

Breaking field, discriminator, unit, numeric, or semantic changes require a new payload major and,
when the HTTP behavior changes, `/api/v2`. Existing v1 schemas remain readable for retained
revisions and exports. Corrections that narrow no accepted v1 data may ship as implementation patch
changes; the repository application/package version records them.

## Authorization capabilities

| Capability            | Meaning                                                                   |
| --------------------- | ------------------------------------------------------------------------- |
| `project:read`        | Read projects, calculations, revisions, and export status                 |
| `project:write`       | Create or materially edit a draft                                         |
| `calculation:execute` | Validate and calculate a draft                                            |
| `revision:save`       | Create an explicit immutable revision                                     |
| `revision:check`      | Transition exact Calculated revision to Checked                           |
| `revision:approve`    | Transition exact Checked revision to Approved; Administrator/Checker only |
| `catalog:import`      | Upload and validate staged catalog data                                   |
| `catalog:activate`    | Activate catalog/rule snapshot; Administrator only                        |
| `export:create`       | Request an export from an immutable revision                              |

The current persisted `reviewer` role may be mapped to Checker capabilities by the authorization
adapter until the role-name decision is migrated. UI visibility is never authorization.

## Operations

### Project drafts and validation

| Operation              | Method and route                               | Request / response schema                                                                                          | Authorization                                  | Idempotency and transaction                                                               | Success behavior                                                  | Domain errors                                                                                                |
| ---------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Create project draft   | `POST /api/v1/projects`                        | `UpsertProjectDraftCommandV1Schema` with `expectedDraftVersion=null` / `ProjectDraftResponseV1Schema`              | `project:write`                                | Required; one transaction for project, draft, audit, and idempotency record               | `201`; replay returns the original `201` representation           | `VALIDATION_FAILED`, `FORBIDDEN`, `IDEMPOTENCY_KEY_CONFLICT`                                                 |
| Replace/update draft   | `PUT /api/v1/projects/{projectId}/draft`       | `UpsertProjectDraftCommandV1Schema` with matching project ID and expected version / `ProjectDraftResponseV1Schema` | `project:write`                                | Required; optimistic `draft_version` predicate; update + audit + idempotency atomic       | `200`; increments draft version once; replay returns same version | `VALIDATION_FAILED`, `CONFLICT_STALE_VERSION`, `RESOURCE_NOT_FOUND`, `FORBIDDEN`, `IDEMPOTENCY_KEY_CONFLICT` |
| Validate project input | `POST /api/v1/projects/{projectId}/validation` | `ValidateProjectInputCommandV1Schema` / `ValidationResultV1Schema`                                                 | `project:read`, normally `calculation:execute` | No idempotency needed and no write transaction; reads one consistent active-snapshot view | `200`; separates blocking, warning, and engineering-review issues | `VALIDATION_FAILED`, `RESOURCE_NOT_FOUND`, `CATALOG_SNAPSHOT_MISSING`, `RULE_SNAPSHOT_MISSING`               |

Draft replacement accepts incomplete route arrays so work can be saved. Calculation validation adds
the stricter `CalculationInputV1Schema` readiness checks. Validation does not change project status.

### Calculation and explicit revisions

| Operation              | Method and route                                 | Request / response schema                                     | Authorization                                  | Idempotency and transaction                                                                                                                                                                         | Success behavior                                                                                                     | Domain errors                                                                                                                                        |
| ---------------------- | ------------------------------------------------ | ------------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Calculate draft        | `POST /api/v1/projects/{projectId}/calculations` | `CalculateCommandV1Schema` / `CalculationRunResponseV1Schema` | `calculation:execute`                          | Required; unique `(project_id,input_fingerprint,engine_version)`. Resolution and pure calculation occur outside a long DB transaction; transient run/result + audit + idempotency commit atomically | `200` for completed/cache hit, `202` if queued later. Replaces/caches transient draft result; never creates revision | `VALIDATION_FAILED`, `CONFLICT_STALE_VERSION`, `CATALOG_SNAPSHOT_MISSING`, `RULE_SNAPSHOT_MISSING`, `CALCULATION_FAILED`, `IDEMPOTENCY_KEY_CONFLICT` |
| Save explicit revision | `POST /api/v1/projects/{projectId}/revisions`    | `SaveRevisionCommandV1Schema` / `RevisionResponseV1Schema`    | `revision:save`                                | Required; optimistic draft and latest-revision versions. Revision, immutable result, input/snapshot references, audit, and idempotency record commit in one transaction                             | `201`; same key returns the existing revision and cannot duplicate history                                           | `VALIDATION_FAILED`, `CONFLICT_STALE_VERSION`, `RESOURCE_NOT_FOUND`, `INVALID_STATE_TRANSITION`, `IDEMPOTENCY_KEY_CONFLICT`                          |
| Check revision         | `POST /api/v1/revisions/{revisionId}/check`      | `CheckRevisionCommandV1Schema` / `RevisionResponseV1Schema`   | `revision:check`                               | Required; lock exact revision and atomically transition Calculated to Checked with audit/idempotency                                                                                                | `200`; same actor-independent request key returns the checked revision                                               | `FORBIDDEN`, `RESOURCE_NOT_FOUND`, `CONFLICT_STALE_VERSION`, `INVALID_STATE_TRANSITION`, `IDEMPOTENCY_KEY_CONFLICT`                                  |
| Approve revision       | `POST /api/v1/revisions/{revisionId}/approve`    | `ApproveRevisionCommandV1Schema` / `RevisionResponseV1Schema` | `revision:approve`; Administrator/Checker only | Required; row lock plus exact fingerprint/status predicate; status and immutable audit event commit atomically                                                                                      | `200`; repeat of the same approval is safe and returns exact approved revision                                       | `FORBIDDEN`, `RESOURCE_NOT_FOUND`, `CONFLICT_STALE_VERSION`, `INVALID_STATE_TRANSITION`, `IDEMPOTENCY_KEY_CONFLICT`                                  |
| Get calculation        | `GET /api/v1/calculations/{runId}`               | Identifier path / `CalculationRunResponseV1Schema`            | `project:read` on owning project               | Read-only; no idempotency                                                                                                                                                                           | `200`; transient runs may be `running`, `succeeded`, or `failed`                                                     | `RESOURCE_NOT_FOUND`, `FORBIDDEN`                                                                                                                    |
| Get revision           | `GET /api/v1/revisions/{revisionId}`             | Identifier path / `RevisionResponseV1Schema`                  | `project:read` on owning project               | Read-only; no idempotency                                                                                                                                                                           | `200`; exact immutable result and snapshot provenance                                                                | `RESOURCE_NOT_FOUND`, `FORBIDDEN`                                                                                                                    |

`Calculate` retries never create durable revision rows. `Save revision` is the sole creation path.
Approval rejects a stale fingerprint, a changed/superseded revision, any status other than Checked,
unresolved blocking review policy, and unauthorized actors.

### Catalog and rule versions

| Operation                   | Method and route                                       | Request / response schema                                                                | Authorization                      | Idempotency and transaction                                                                                  | Success behavior                                                        | Domain errors                                                                                                   |
| --------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Upload and validate catalog | `POST /api/v1/catalog-imports` (`multipart/form-data`) | File part plus `CatalogImportMetadataV1Schema` / `CatalogImportValidationResultV1Schema` | `catalog:import`                   | Required; bounded streaming upload, content hash check, staged records and diagnostics commit; no activation | `200` after validation; invalid rows return `status=invalid`, not a 500 | `VALIDATION_FAILED`, `CATALOG_IMPORT_FAILED`, `IDEMPOTENCY_KEY_CONFLICT`, `FORBIDDEN`                           |
| Retrieve import validation  | `GET /api/v1/catalog-imports/{importId}/validation`    | Identifier path / `CatalogImportValidationResultV1Schema`                                | `catalog:import`                   | Read-only                                                                                                    | `200`                                                                   | `RESOURCE_NOT_FOUND`, `FORBIDDEN`                                                                               |
| Activate catalog snapshot   | `POST /api/v1/catalog-versions/{snapshotId}/activate`  | catalog variant of `ActivateVersionCommandV1Schema` / `ActivationResponseV1Schema`       | Administrator + `catalog:activate` | Required; validated-status and expected-active pointer check; pointer, audit, idempotency atomic             | `200`; never mutates old products or calculation snapshots              | `VALIDATION_FAILED`, `CONFLICT_STALE_VERSION`, `CATALOG_IMPORT_FAILED`, `IDEMPOTENCY_KEY_CONFLICT`, `FORBIDDEN` |
| Activate rule snapshot      | `POST /api/v1/rule-versions/{snapshotId}/activate`     | rules variant of `ActivateVersionCommandV1Schema` / `ActivationResponseV1Schema`         | Administrator + `catalog:activate` | Required; same pointer-swap transaction semantics                                                            | `200`; existing revisions retain old rule snapshot                      | `VALIDATION_FAILED`, `CONFLICT_STALE_VERSION`, `RULE_SNAPSHOT_MISSING`, `IDEMPOTENCY_KEY_CONFLICT`, `FORBIDDEN` |

File name, media type, size, and SHA-256 are logged as bounded metadata. File bodies and complete
row contents are never logged. CSV/Excel parsing adapters must convert rows to
`CatalogSourceRowV1`; activation is forbidden until validation is successful.

### Exports

| Operation         | Method and route                              | Request / response schema                          | Authorization                    | Idempotency and transaction                                                                                   | Success behavior                                                                      | Domain errors                                                                                                    |
| ----------------- | --------------------------------------------- | -------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Request export    | `POST /api/v1/revisions/{revisionId}/exports` | `ExportRequestV1Schema` / `ExportArtifactV1Schema` | `project:read` + `export:create` | Required; exact revision/fingerprint check; export record + idempotency atomic; rendering occurs after commit | `202` pending or `200` cache hit/ready                                                | `VALIDATION_FAILED`, `CONFLICT_STALE_VERSION`, `RESOURCE_NOT_FOUND`, `EXPORT_FAILED`, `IDEMPOTENCY_KEY_CONFLICT` |
| Get export status | `GET /api/v1/exports/{exportId}`              | Identifier path / `ExportArtifactV1Schema`         | Access to source revision        | Read-only                                                                                                     | `200`                                                                                 | `RESOURCE_NOT_FOUND`, `FORBIDDEN`                                                                                |
| Download export   | `GET /api/v1/exports/{exportId}/download`     | Identifier path / binary response                  | Access to source revision        | Read-only; artifact immutable                                                                                 | `200` with format media type, content length/hash, safe filename; `409` while pending | `RESOURCE_NOT_FOUND`, `INVALID_STATE_TRANSITION`, `EXPORT_FAILED`, `FORBIDDEN`                                   |

Export v1 language is English. `buildEnglishExportModel` copies immutable quantities, provenance,
included items, status, and warnings. Export code must not query the active catalog and must not
recalculate engineering or packaging quantities.

## Status and error mapping

| HTTP status | Error codes                                                                                                      |
| ----------- | ---------------------------------------------------------------------------------------------------------------- |
| `400`       | malformed multipart/JSON before schema parsing                                                                   |
| `401`       | `AUTHENTICATION_REQUIRED`                                                                                        |
| `403`       | `FORBIDDEN`                                                                                                      |
| `404`       | `RESOURCE_NOT_FOUND`, `CATALOG_SNAPSHOT_MISSING`, `RULE_SNAPSHOT_MISSING` where hiding existence is not required |
| `409`       | `CONFLICT_STALE_VERSION`, `INVALID_STATE_TRANSITION`, `IDEMPOTENCY_KEY_CONFLICT`                                 |
| `422`       | `VALIDATION_FAILED`, `UNSUPPORTED_SCHEMA_VERSION`                                                                |
| `500`       | `CALCULATION_FAILED`, `CATALOG_IMPORT_FAILED`, `EXPORT_FAILED`, `INTERNAL_ERROR`                                 |

All JSON errors validate against `ErrorEnvelopeV1Schema`. Validation issues expose safe field paths,
stable issue codes, and curated messages. Unexpected errors become `INTERNAL_ERROR` with a generic
message; diagnostic exceptions and stack traces remain only in protected structured logs.
