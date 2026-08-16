# Module boundaries

## Dependency rule

Dependencies point inward toward JSON contracts and pure policy. Infrastructure implements
application ports. No inward module imports a web framework, database adapter, UI type, or export
renderer.

See the [dependency diagram](diagrams/dependencies.md).

## Boundary matrix

| Module               | Responsibility                                                                                                                     | Allowed dependencies                                                                                                                | Forbidden dependencies                                                                                                    | Public entry points and owned data                                                                          | Expected tests                                                                                             |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Web / presentation   | Next.js routes, React components, BG/EN localization, form/view models, relative HTTP adapters                                     | React/Next.js, transport schema types, relative `/api/v1` client                                                                    | PostgreSQL/ORM, secrets, catalog import mapping, formulas, direct filesystem export                                       | App Router pages/components and browser DTO adapters; owns UI state only                                    | Component and adapter tests, localization preservation, browser flow                                       |
| Application services | Project commands, validation, calculation orchestration, explicit revision save, check/approve, catalog activation, export request | Domain/transport contracts, calculation engine, catalog/export ports, auth capabilities, repository/UoW/log/audit/idempotency ports | React/Next.js UI behavior, formula duplication, raw ORM records in responses                                              | `ProjectApplicationService`, `CatalogApplicationService`, `ExportApplicationService`; owns use-case policy  | Authorization, idempotency replay/conflict, optimistic concurrency, transaction rollback integration tests |
| Calculation engine   | Deterministic formula evaluation over fully resolved JSON input                                                                    | `@niedax/domain`, reviewed static rule manifest                                                                                     | Next.js, React, Fastify, server actions, HTTP, ORM, DB, repositories, filesystem, network, environment, clock, random IDs | `calculate`, `calculationEngine`, `CalculationEngine`; owns formula implementation only                     | Golden formula tests later, JSON contract test, determinism and forbidden-import scan now                  |
| Catalog/import       | Catalog records, source mapping, validation, diagnostics, staging, activation input                                                | Domain contracts and parser adapters supplied by infrastructure                                                                     | UI, formula code, revision mutation, activation before successful validation                                              | `CatalogRowMapper`, `CatalogImportValidator`, `CatalogStagingRepository`; owns staged import representation | Row mapping, invalid data diagnostics, staging/activation integration tests                                |
| Export               | Map immutable results to Excel/PDF/CSV/print models and render bytes                                                               | Domain calculation/revision result, renderer libraries in adapters                                                                  | Engineering recalculation, repositories from pure mapper, UI form state, active-catalog lookup                            | `buildEnglishExportModel`, `ExportModelBuilder`, `ExportRenderer`; owns English export model                | Field-preservation tests, renderer layout/file tests, proof that quantities are copied unchanged           |
| Domain/contracts     | Stable domain vocabulary, units, snapshot provenance, runtime boundary schemas, safe errors                                        | Zod only                                                                                                                            | Frameworks, DB/ORM, I/O, UI state, mutable persistence models                                                             | `@niedax/domain`; owns all named v1 schemas and inferred types                                              | Valid/invalid fixtures, unknown-key rejection, JSON round trip, schema/type compilation                    |
| Infrastructure       | Fastify adapters, PostgreSQL repositories/UoW, file parsing/rendering, crypto hashing, clock/ID providers                          | Application ports, domain contracts, database/client libraries                                                                      | Business formulas in handlers, raw persistence objects across boundaries                                                  | Implementations under backend/database; owns rows, SQL, multipart/binary mechanics                          | Database, HTTP, auth, concurrency, failure and recovery integration tests                                  |

## Enforced rules

- `packages/calculation-engine/tests/architecture-boundaries.test.ts` scans source imports and the
  package dependency allowlist.
- Workspace package manifests make domain, calculation, import, and export dependencies explicit.
- Strict TypeScript, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, and lint rules apply
  to all packages.
- Runtime schemas infer their TypeScript types, preventing a hand-maintained schema/type fork.
- Future dependency tooling may replace the focused scan when the module graph becomes larger; it
  must preserve these rules.

## Public versus internal calls

HTTP adapters are public process boundaries. They validate and map v1 transport input to an
application command. Application services call the calculation engine, catalog import, export, and
repositories through TypeScript interfaces. Internal service calls do not bypass authorization,
idempotency, audit, or transaction policy merely because they do not cross HTTP.
