# Codex Prompt — Stage 3: Technical Architecture and API Contracts

## Role

Act as a senior software architect and TypeScript engineer working inside the existing Niedax generator repository in VS Code.

Your task is to complete **Stage 3: Technical Architecture and API Contracts**. Convert the approved Stage 2 UX and input contract into a concrete, versioned, testable architecture that cleanly separates:

- catalog data and catalog import;
- project data and revisions;
- calculation rules and formulas;
- application orchestration;
- web/UI presentation;
- exports.

The result must be more than an architecture proposal. Create the actual architecture documents, TypeScript domain contracts, runtime validation schemas, boundary interfaces, error model, and focused tests required to prove the design.

## Primary objective

Define stable module boundaries and API contracts so that each major part of the application can be developed and tested independently.

The decisive acceptance condition is:

> The calculation engine can be called from a unit test using plain JSON and without a database, browser, Next.js runtime, server action, HTTP request, ORM entity, or UI type.

## Required input and repository discovery

Before changing files:

1. Read the repository instructions, including every applicable `AGENTS.md`, `README`, and existing architecture/contribution document.
2. Inspect the current workspace structure, package manager, TypeScript configuration, linting, formatting, test framework, database layer, and Next.js conventions.
3. Locate and read the approved Stage 2 outputs, UX contracts, domain terminology, existing schemas, and any prior ADRs.
4. Inspect the current code before proposing module paths. Reuse established conventions where they are sound.
5. Run the existing relevant checks once to establish a baseline. Record pre-existing failures and do not misrepresent them as regressions caused by this stage.

If a Stage 2 artifact is missing or contradictory, continue with the least risky explicit assumption when possible and record it in the implementation summary. Ask a question only when the missing decision would materially change a public contract or cause destructive rework.

## Approved product context that must be preserved

The architecture must support the already approved behavior:

- BG/EN web interface; the first export language is English.
- Projects contain routes with a stable unique `code`, `name`, and `description`.
- Route geometry includes straight sections, fittings, and endpoints.
- Connections can represent logical continuation, splice, bend, tee, transition, or custom connection.
- Logically connected routes are calculated as continuous geometry unless a physical break is explicitly defined.
- Endpoint type is selected from a controlled list and may add compatible materials automatically: free end, end cap, equipment, route continuation, physical splice, or custom.
- Section length is selected per route as 3 m or 6 m, with 6 m as the default and no automatic mixing.
- Project-level spare can be overridden or disabled per BOM line.
- Supports, structures, anchors, WSTB quantity, additional fitting supports, and manual corrections must be representable.
- WSTB defaults to 2 per support, with options for 1, 2, or a manual quantity; this remains visibly classified as a project rule until confirmed.
- Anchors are Niedax catalog products. The selected model/size is explicit; quantities come from an assembly template and can be manually overridden. Suitability remains subject to engineering review.
- Users can add both catalog products and free-text manual BOM lines.
- BOM output distinguishes technical quantity, packaging quantity, ordered quantity, spare quantity, included items, source, status, and warnings.
- Catalog versions are managed entities, and every calculation preserves an immutable snapshot of the product/rule data used.
- Only explicit revisions are retained. Draft recalculation does not create permanent revision history automatically.
- Only users with Administrator or Checker permissions can approve a revision.
- Relevant statuses include Draft, Calculated, Checked, Approved, and Archived.
- Do not introduce prices, ERP integration, or automatic structural verification in this stage.

## Scope

Complete all work necessary for the architecture and contracts listed below. Implement only the minimum supporting code required to compile and test the contracts. Do **not** implement the complete calculation formulas, complete UI, catalog ingestion pipeline, or final exports unless they already exist and require a small compatibility adjustment.

### 1. Define module boundaries

Define and document these logical modules:

1. **Web / presentation**
   - Next.js routes, React components, form/view models, localization, and transport adapters.
   - May depend on application services and public contracts.
   - Must not contain engineering formulas or direct catalog import logic.

2. **Application services**
   - Use-case orchestration for project commands, calculation, explicit revision save, checking, approval, and export requests.
   - Owns authorization checks, idempotency coordination, transaction boundaries, repository interfaces, and mapping between transport DTOs and domain contracts.
   - Must not embed UI behavior or duplicate calculation formulas.

3. **Calculation engine**
   - Pure TypeScript domain calculation package/module.
   - Accepts plain JSON-compatible `CalculationInput` and returns `CalculationResult`.
   - No imports from Next.js, React, server actions, HTTP frameworks, ORM/database clients, filesystem APIs, browser APIs, or environment-specific globals.
   - Deterministic for identical input, rule version, catalog snapshot, and engine version.

4. **Catalog and catalog import**
   - Catalog domain records, versioning, source metadata, validation, staging, import diagnostics, activation, and mapping from CSV/Excel rows.
   - Imported data must be validated before activation.
   - Activation of a new catalog/rule version must not mutate existing calculation snapshots or approved revisions.

5. **Export**
   - Maps an immutable calculation/revision result to Excel, PDF, CSV, and print-oriented output models.
   - Must not recalculate engineering quantities.
   - First Excel contract is English and must preserve the approved business fields.

For every module, document:

- responsibility;
- allowed dependencies;
- forbidden dependencies;
- public entry points;
- owned data/types;
- expected unit and integration tests.

Create a dependency diagram showing the allowed direction of dependencies. Prevent circular dependencies and prevent infrastructure types from leaking into the calculation engine.

### 2. Decide the transport boundary

Evaluate and document which operations should use:

- Next.js Server Actions;
- versioned HTTP API endpoints;
- internal application-service calls.

Do not choose one mechanism indiscriminately. Use these criteria:

- browser-only form mutation versus reusable machine-readable integration;
- support for Excel/catalog upload and file download;
- stable versioned contracts;
- authentication and authorization;
- idempotency;
- observability and correlation IDs;
- testability;
- future external integrations without exposing domain internals.

At minimum, define contracts for:

- create/update project draft;
- validate project input;
- calculate draft;
- save explicit revision;
- check revision;
- approve revision;
- retrieve a calculation/revision result;
- import and validate a catalog file;
- activate a catalog or rule version;
- request/download an export.

For each public operation, specify:

- method and route or server-action name;
- versioning strategy;
- request schema;
- response schema;
- authorization requirement;
- idempotency requirement;
- transaction boundary;
- possible domain error codes;
- expected status/result behavior.

Keep domain types separate from transport envelopes. Never return raw ORM records, stack traces, or unvalidated exception text.

### 3. Define TypeScript domain types

Create or refine serializable, framework-independent types for at least:

- `Project`
- `Route`
- `Connection`
- `Product`
- `AssemblyTemplate`
- `Rule`
- `CalculationRun`
- `BomLine`
- `Warning`

Add supporting value types and enums where necessary, for example identifiers, quantities, units, endpoint types, connection types, source references, rule status, product status, approval status, and catalog snapshot references.

Requirements:

- Prefer explicit discriminated unions for connection, endpoint, warning, and manual/catalog BOM variants.
- Make units explicit; do not pass ambiguous naked numbers when the unit matters.
- Use stable IDs for references; route `code` is a business identifier and must not replace the internal immutable ID.
- Make catalog/rule provenance and version/snapshot identity explicit.
- Represent manual overrides together with reason, author/reference metadata where appropriate, and original calculated value when relevant.
- Separate editable project input from immutable calculation/revision output.
- Keep persistence models and UI form state outside the domain contract.
- All values crossing a process boundary must be JSON-compatible. Define how dates, decimal quantities, and optional values are serialized.
- Avoid `any`, unsafe broad index signatures, and framework-specific objects.

### 4. Create versioned runtime validation schemas

Use the validation library already adopted by the repository. If none exists, select a TypeScript-first runtime schema library appropriate for Next.js, justify it in an ADR, and add only the minimal dependency required.

Create versioned schemas for external/application boundaries, including:

- `CalculationInputV1Schema`
- `CalculationResultV1Schema`
- command schemas for Calculate, Save revision, Check, and Approve;
- shared error envelope schema;
- catalog import validation result schema;
- export request schema.

Requirements:

- Infer TypeScript types from schemas where practical, or add compile-time checks that prevent schema/type drift.
- Reject unknown or invalid discriminators at public boundaries.
- Define the policy for unknown object keys explicitly.
- Validate numeric ranges, units, identifiers, required reasons for manual overrides, and valid status transitions.
- Make schema versioning visible in the payload or endpoint contract.
- Include representative valid and invalid fixtures.
- Do not couple validation schemas to React forms or ORM models.

### 5. Define the pure calculation contract

Define a self-contained `CalculationInputV1` containing everything the calculation engine needs, including:

- schema version;
- project calculation data;
- routes, geometry, endpoints, and connections;
- support and assembly selections;
- project-level and per-line policies for spare and packaging;
- resolved catalog snapshot or normalized catalog subset;
- resolved assembly templates;
- resolved rule set and rule version;
- explicit manual products/adjustments;
- calculation options;
- engine-compatible locale-neutral values.

The engine must not fetch missing data. Resolution of database/catalog references belongs to an application service before engine invocation.

Define `CalculationResultV1` with at least:

- schema version and engine version;
- deterministic calculation fingerprint/input hash policy;
- calculation/run identity supplied or assigned outside the pure formula core as appropriate;
- BOM lines;
- included-item relationships;
- technical, packaging, ordered, and spare quantities;
- warnings and engineering-review requirements;
- source/provenance for calculated values;
- catalog and rule snapshot references;
- totals/summary fields only where their semantics are unambiguous;
- no UI-form state and no ORM entities.

Document canonicalization and deterministic ordering rules so identical normalized inputs produce stable results and hashes.

Provide a minimal callable engine boundary such as:

```ts
export interface CalculationEngine {
  calculate(input: CalculationInputV1): CalculationResultV1;
}
```

or an equivalent pure function. A placeholder implementation may return a structurally valid empty/minimal result if the real engine is not yet implemented, but it must not pretend that Stage 3 implements the approved engineering formulas.

### 6. Idempotency and transaction strategy

Design separate semantics for **Calculate**, **Save revision**, and **Approve**.

At minimum, address:

#### Calculate

- Repeating the same normalized input with the same catalog snapshot, rule version, and engine version must be safe.
- Define the request/idempotency key and calculation fingerprint behavior.
- State whether a draft result is cached, replaced, or persisted as a transient run.
- A retry must not create duplicate permanent revisions.

#### Save revision

- This is the only operation that creates a durable explicit project revision from the current draft/calculation result.
- Repeating a request with the same idempotency key must return the existing revision, not create another one.
- Define optimistic concurrency using project/draft version or equivalent.
- The project revision, immutable calculation result, catalog/rule snapshot references, and audit event must be committed atomically.

#### Approve

- Only Administrator or Checker may approve.
- Approval applies to one immutable revision and exact calculation fingerprint.
- Repeating an approval request must be safe.
- Reject stale, changed, already superseded, invalid-status, or unauthorized requests with stable domain error codes.
- Revision status change and audit event must be atomic.

Document isolation assumptions, unique constraints, retry behavior, and failure handling. Keep transaction implementation in the application/infrastructure layer, not in the calculation engine.

### 7. Logging, audit trail, errors, and correlation IDs

Define a practical operational contract:

- structured logs rather than unstructured console messages;
- correlation ID accepted from trusted inbound requests when valid, otherwise generated at the boundary;
- correlation ID propagated through application services, logs, audit events, and error responses;
- no secrets, full uploaded file content, sensitive authentication data, or unnecessary personal data in logs;
- stable domain/application error codes with safe user-facing messages;
- unexpected internal errors mapped to a generic public error without leaking stack traces;
- immutable audit events for security- and business-relevant mutations.

The audit trail must cover at least:

- project creation and material edits;
- calculation execution metadata;
- explicit revision save;
- manual BOM override/addition/removal;
- catalog/rule activation;
- check and approval actions;
- failed authorization or invalid status-transition attempts where appropriate.

Define an error taxonomy and versioned response envelope. Include codes for validation failure, conflict/stale version, invalid state transition, unauthorized/forbidden action, missing catalog/rule snapshot, unsupported schema version, idempotency-key conflict, calculation failure, import failure, and export failure.

### 8. Architecture Decision Records

Create a concise ADR set using the repository's existing ADR format. If none exists, use a standard structure with:

- title;
- status;
- date;
- context;
- decision;
- alternatives considered;
- consequences;
- follow-up actions.

Create ADRs for at least:

1. Module boundaries and dependency direction.
2. Pure calculation engine and JSON contract.
3. Server Actions versus versioned API endpoints.
4. Runtime validation and schema versioning.
5. Catalog/rule snapshots and reproducible calculations.
6. Idempotency, optimistic concurrency, and transaction boundaries.
7. Structured logging, audit trail, error codes, and correlation IDs.
8. Quantity/decimal and unit representation, if not already resolved by an existing ADR.

Use sequential ADR numbering consistent with existing repository records. Mark genuinely accepted Stage 3 choices as `Accepted`; do not label undecided guesses as accepted.

## Expected repository deliverables

Adapt exact paths to the established repository structure, but produce the equivalent of:

```text
docs/
  architecture/
    architecture-overview.md
    module-boundaries.md
    api-contracts-v1.md
    diagrams/
    adr/
      NNNN-*.md

src/ or packages/
  domain/
    types/
    schemas/v1/
  calculation-engine/
    index.ts
    contracts.ts
  application/
    ports/
    commands/
  catalog-import/
    contracts.ts
  export/
    contracts.ts

tests/ or colocated tests/
  calculation-contract.test.ts
  schema-validation.test.ts
  architecture-boundaries.test.ts
```

Do not create duplicate parallel structures if the repository already has suitable locations.

Required outputs:

- architecture overview and dependency diagram;
- explicit module-boundary matrix;
- versioned API/operation contract document;
- versioned runtime input/output schemas;
- framework-independent TypeScript domain types;
- pure calculation engine public boundary;
- idempotency and transaction design;
- logging, audit, error-code, and correlation-ID design;
- ADR set for the principal decisions;
- fixtures and automated tests proving the core contracts.

## Required tests and architecture checks

Add focused tests that prove at least:

1. A valid plain-JSON `CalculationInputV1` passes runtime validation.
2. Invalid discriminators, units, ranges, and missing required data fail with useful structured validation details.
3. `JSON.stringify`/`JSON.parse` round-tripping preserves the calculation contract.
4. The calculation engine can be imported and invoked in a unit test without starting Next.js, a browser, or a database.
5. The calculation-engine package/module has no forbidden imports from web, React, Next.js, ORM, database, or infrastructure modules.
6. A valid result satisfies `CalculationResultV1Schema`.
7. Representative warning and manual/catalog BOM variants are validated.
8. Public error envelopes and command schemas are validated.
9. If practical within the existing setup, type-level or dependency-boundary tests fail when forbidden coupling is introduced.

Use fixtures that are small but representative of the approved domain: at least two connected routes, one logical continuation, one physical connection or fitting, a support/assembly selection, a Niedax anchor choice, a manual BOM line, a project-rule warning, and catalog/rule snapshot references.

## Definition of Done

Stage 3 is complete only when all of the following are true:

- Module ownership and allowed dependency direction are documented and reflected in code.
- Catalog, project persistence, calculation formulas, application orchestration, presentation, import, and export are independently separable.
- All required domain types exist and compile under strict TypeScript settings.
- `CalculationInputV1` and `CalculationResultV1` have runtime schemas and documented versioning rules.
- The calculation engine accepts plain JSON and returns plain JSON-compatible data.
- A unit test invokes the engine with no database, browser, Next.js runtime, or UI dependency.
- Calculate, Save revision, Check, and Approve have clear idempotency, concurrency, authorization, and transaction semantics.
- Logs, audit trail, correlation IDs, and stable error codes have explicit contracts.
- The required ADRs exist and match the implemented architecture.
- New tests pass, and relevant existing tests, type checks, lint checks, and build checks do not regress.
- Documentation contains no claims that are contradicted by the code.
- Deferred questions and intentionally unimplemented Stage 4+ behavior are listed explicitly.

## Working rules

- Preserve existing user changes and avoid unrelated refactors.
- Prefer small, reviewable changes.
- Do not weaken TypeScript, lint, validation, or test settings to make checks pass.
- Do not use `any` to bypass contract design.
- Do not place formulas in UI handlers or transport adapters.
- Do not let the calculation engine query repositories, read environment variables, access the clock directly, generate random IDs, or perform I/O.
- Inject or supply nondeterministic metadata outside the pure calculation core.
- Do not expose database primary-key structure or ORM-generated models as the public API.
- Do not silently invent engineering formulas or product compatibility rules.
- Clearly mark provisional project rules and engineering-review requirements.
- Keep terminology consistent with the approved Stage 2 UX contract.
- Add comments only where they explain a non-obvious invariant or architectural constraint.

## Validation commands

Use the repository's actual package manager and scripts. Run the closest available equivalents of:

```text
format/check
lint
typecheck
unit tests
architecture/dependency tests
build
```

If a full build requires unavailable external services, run the maximum local subset and report the exact blocker. Do not claim a check passed unless it was executed successfully.

## Final response format

When finished, report:

1. **Outcome** — what is now implemented.
2. **Architecture decisions** — short summary of the chosen boundaries and transport strategy.
3. **Files changed** — grouped by documentation, contracts/code, schemas, ADRs, and tests.
4. **Contract versions** — exact names and current versions of public input/output schemas.
5. **Verification** — commands run and their results.
6. **Definition of Done** — pass/fail for each Stage 3 criterion.
7. **Assumptions and deferred work** — only unresolved or later-stage items.
8. **Risks** — any issue that could affect Stage 4 implementation.

Do not stop after describing what should be done. Make the repository changes, run the checks, and leave Stage 3 in a reviewable state.
