# Codex Prompt — Stage 4: Data Model and Migrations

## Role

Act as a senior backend and database engineer working inside the existing Niedax Generator repository in VS Code. Implement Stage 4 completely and leave the repository in a reproducible, tested state.

The application is a bilingual BG/EN engineering tool that models Niedax cable-tray routes, calculates a bill of materials, preserves approved revisions, and keeps every calculated result traceable to catalog products, engineering rules, assembly templates, and source pages.

## Stage goal

Create a stable, versioned PostgreSQL data foundation for:

- catalog versions and products;
- product attributes, included items, and catalog sources;
- compatibility and calculation rules;
- assembly templates and their components;
- projects, routes, geometry, fittings, endpoints, connections, supports, and manual items;
- mutable calculation drafts;
- immutable saved revisions with BOM lines, warnings, and approvals.

The data model must support independent testing of catalog data, project data, calculation rules, calculation results, and presentation concerns.

## Dependency

Stage 3 — Technical Architecture and API Contracts — is the required input.

Before modifying code:

1. Inspect the repository structure, package manager, workspace configuration, database tooling, ORM/query builder, validation library, test framework, and CI commands.
2. Locate and read the Stage 3 architecture documents, ADRs, domain types, and versioned `CalculationInput` / `CalculationResult` schemas.
3. Inspect `AGENTS.md` and all relevant repository instructions.
4. Review the current Git status and preserve all unrelated user changes.
5. Reuse the technology and conventions already selected in Stage 3. Do not introduce a second ORM, migration framework, validation library, identifier strategy, or test framework.
6. If a Stage 3 decision is missing, make the smallest reasonable assumption, record it in the Stage 4 implementation notes, and continue unless it creates a material conflict or risks data loss.

Do not redesign the UI, calculation formulas, or API layer in this stage. Make only the minimal application changes required to compile, migrate, seed, and test the database model.

## Non-negotiable domain decisions

- PostgreSQL is the authoritative persistent store.
- Catalog versions are managed entities, not free-text product fields.
- Every product belongs to exactly one catalog version and keeps traceability to its source and source page.
- A product code may appear in more than one catalog version. Uniqueness must therefore be scoped appropriately, normally by catalog version.
- Updating or activating a new catalog version must not change an existing saved revision.
- Calculation drafts may be recalculated and replaced.
- Only explicitly saved revisions are retained as project history.
- Saved revisions and their snapshots are immutable.
- Revision snapshots must include all product and rule/template data required to understand and reproduce the saved BOM without depending on later mutable catalog records.
- Route codes are unique within a project, not necessarily globally.
- Logically connected routes can represent one continuous physical route even when their route names/codes differ.
- Route endpoints and route connections must be structurally valid and must not silently reference another project.
- Quantities must be positive where a row represents a material or calculated quantity.
- Units must use the canonical unit set from the Stage 3 domain contracts; arbitrary free-text units are not allowed.
- Manual BOM inputs must support both a selected Niedax catalog product and a free-text material, with an explicit origin/reason and validation that exactly one item form is used.
- Product quantities distinguish technical quantity, packaging data, and order quantity.
- Admin and reviewer roles may approve revisions; preserve the Stage 3 authorization boundary in the schema and service layer without duplicating authentication data unnecessarily.
- All identifiers, timestamps, numeric precision, audit metadata, and deletion behavior must follow Stage 3 conventions.

## Required implementation work

### 1. Produce the ER model

Create an ER model for the implemented schema and save it in the repository documentation. Mermaid ER syntax is acceptable if that is consistent with the repository.

The diagram and accompanying notes must show:

- primary keys;
- important foreign keys;
- one-to-many and many-to-many relationships;
- ownership boundaries between catalog, rules/templates, projects, drafts, and revisions;
- which records are mutable and which are immutable;
- the snapshot boundary at revision creation;
- delete and archival behavior;
- catalog/rule version relationships.

The ER model must describe the schema actually implemented, not an aspirational alternative.

### 2. Implement catalog tables

Implement, at minimum:

#### `catalog_versions`

Represent a managed catalog release/import set. Include fields needed for identity, human-readable label, source/version metadata, lifecycle status, activation, import provenance, timestamps, and audit ownership where supported by Stage 3.

Define an explicit lifecycle such as `draft`, `validated`, `active`, and `archived`, or reuse the Stage 3 lifecycle. Enforce that activation is deliberate. If the design permits only one active version per catalog scope, enforce it safely with a database constraint or partial unique index.

#### `products`

Each row represents a product as published in one catalog version. Include at least:

- catalog version reference;
- manufacturer/product code;
- category and product family/series where defined;
- BG and EN descriptions where available;
- material/coating and variant identity;
- base unit;
- minimum package quantity and packaging unit where applicable;
- mass/weight data where applicable;
- active/available state;
- source traceability;
- timestamps and audit metadata.

Use exact numeric types for quantities, dimensions, mass, and factors. Do not use floating-point types for values that participate in deterministic calculations.

#### `product_attributes`

Store versioned, typed product characteristics without turning core relational fields into an unvalidated property bag. The model must preserve:

- attribute key/type;
- unit where applicable;
- typed or safely validated value representation;
- uniqueness of an attribute per product/key when appropriate;
- support for dimensions and anchor data such as thread, length, hole diameter, maximum fixture thickness, effective anchoring depth, head/drive type, tightening torque, ETA reference, and intended substrate/use.

Use normal columns for frequently queried invariant fields and extensible attributes only where the catalog genuinely varies.

#### `included_items`

Represent items included with a parent product or assembly so that bolts and accessories are not duplicated in the BOM. Include parent product, included product or clearly defined included item identity, included quantity, unit, applicability/conditions if required, and source traceability.

Prevent invalid self-reference and duplicate included-item definitions.

#### `product_sources`

Represent the source document/reference for product facts. Include source document identity, title, edition/version if known, source page, locale, URL/file reference where permitted, verification status, and relevant timestamps.

Model product-to-source relationships in the normalized form that best fits the Stage 3 contracts. A product must be traceable to its catalog version and at least one source/page where the imported data provides one.

### 3. Implement rule and assembly-template tables

Implement, at minimum:

#### `compatibility_rules`

Represent allowed, disallowed, or conditional combinations of systems, series, dimensions, materials/coatings, fittings, supports, anchors, and other product roles. Include:

- stable rule identity and version;
- status/lifecycle;
- priority or deterministic evaluation order if required;
- structured condition and outcome payloads validated against versioned schemas;
- reason/message in BG/EN where applicable;
- source and source page;
- effective catalog/rule-set relationship;
- audit fields.

Avoid storing executable code in the database.

#### `calculation_rules`

Represent versioned formula parameters and project rules such as section selection, reserve handling, packaging rounding, support spacing, fitting support overrides, WSTB quantity per support, and other rules defined in Stage 3. Include a versioned schema discriminator and validated structured parameters.

Rules must have explicit provenance/status, including catalog-confirmed, calculated, project assumption, engineering review required, or manual where these statuses belong in Stage 3.

#### `assembly_templates`

Represent managed wall, ceiling, multi-level, and other support/installation templates. Include identity, version, lifecycle state, applicability constraints, BG/EN names/descriptions, catalog/rule-set relationship, and source/audit data.

#### `template_components`

Represent the components and quantities required by an assembly template, including component/product role, optional concrete product reference where appropriate, quantity or quantity expression parameters, unit, ordering, optional/required state, included-item behavior, and anchor count.

Enforce positive quantities and prevent duplicate component definitions that would create ambiguous BOM output.

### 4. Implement project-input tables

Implement, at minimum:

#### `projects`

Include stable identity, project metadata, locale/export defaults, status, active catalog/rule selection if required by Stage 3, ownership/audit information, and timestamps. Reuse the Stage 3 project lifecycle.

#### `routes`

Include project ownership, immutable route identity, unique code within the project, name, description, selected system/product family, material/coating, nominal dimensions, default section length (3 m or 6 m), reserve/packaging overrides where supported, ordering, and timestamps.

Enforce a unique route code per project using a database constraint, respecting the repository's documented case-sensitivity policy.

#### `segments`

Represent each straight route segment independently. Include route ownership, sequence/order, length, relevant geometry, selected section length/overrides, and timestamps. Enforce positive segment length and deterministic ordering.

Do not calculate straight-section counts from the total length of unrelated segments; the schema must preserve segment boundaries.

#### `fittings`

Represent bends, tees, transitions/reducers, custom fittings, and other supported fitting types. Include route/project ownership, type discriminator, sequence/position, geometry/orientation parameters, selected catalog product where applicable, support overrides, and custom/manual metadata where allowed.

#### `route_endpoints`

Represent explicit start/end endpoints for routes. Include endpoint kind/position, terminal behavior selected from the Stage 3 contract (for example free, end cap, equipment, continuation, splice, or custom), optional selected products/material behavior, and validation metadata.

Each route must have exactly the endpoint cardinality required by Stage 3. For the standard linear route model, enforce one start and one end endpoint per route with a unique constraint.

#### `route_connections`

Connect valid endpoints and represent logical continuation, splice, horizontal bend, vertical bend, tee, transition, or custom connection types from Stage 3. Include:

- endpoint references;
- connection type;
- physical-material behavior;
- common versus separate support behavior;
- manual support counts before/after;
- connector/fitting overrides where supported;
- notes and audit metadata.

Database constraints and transactional service validation must prevent:

- an endpoint connecting to itself;
- invalid start/end role combinations;
- cross-project connections;
- duplicate connections that violate endpoint cardinality;
- impossible connection cardinality for two-way versus branching connection types;
- orphan connections after route changes.

Use database constraints wherever PostgreSQL can reliably enforce the invariant. Use a transaction-safe application/service check only for invariants that cannot be expressed safely as a simple constraint, and test concurrent attempts where relevant.

#### `support_configurations`

Represent support spacing, structure/template selection, construction/base type, anchor selection and size, anchors per mounting point, WSTB mode (`1`, `2`, or manual quantity), fitting support overrides, shared/separate support behavior, and engineering-verification state.

Preserve the rule that anchor suitability may require engineering review even when the exact Niedax anchor and calculated quantity are known.

#### `manual_items`

Allow a user to add either:

- a referenced catalog product; or
- a free-text item.

Include project/route/revision-draft scope as defined by Stage 3, quantity, canonical unit, reason, note, reserve applicability, packaging-rounding applicability, source/status, and audit information.

Enforce an exclusive-or constraint so that a manual item cannot be both a catalog product and a free-text item, and cannot be neither.

### 5. Implement result and workflow tables

Implement, at minimum:

#### `calculation_drafts`

Store the current mutable calculated result or calculation execution metadata according to Stage 3. Include calculation schema version, input hash/idempotency key, catalog/rule references, status, correlation ID, calculation timestamps, and the current draft payload or normalized draft child records as justified by the architecture.

Recalculation must update/replace the mutable draft transactionally without creating retained project-history revisions.

#### `revisions`

Represent explicitly saved, numbered project revisions. Include:

- project reference;
- revision number and optional name/description;
- status and timestamps;
- creator;
- calculation schema/engine version;
- input snapshot;
- catalog snapshot metadata;
- rule/template snapshot metadata;
- correlation/idempotency information where defined by Stage 3;
- checksum/hash fields useful for integrity and reproducibility.

Revision numbers must be unique and assigned safely within a project under concurrent requests.

#### `bom_lines`

Store the immutable BOM output for a saved revision. Include stable line identity/order, product reference for traceability where retained, complete product snapshot, product code and descriptions, material/coating, technical quantity, reserve, packaging quantity, ordered packages/order quantity, spare quantity, unit, mass/weight, included-item detail, source/page snapshot, origin/status, rule/template references or snapshots, manual-adjustment metadata, and warning linkage where appropriate.

A saved BOM line must remain understandable if its live product is later edited, archived, or absent from the active catalog.

#### `warnings`

Store warnings attached to a calculation draft and/or saved revision according to the Stage 3 result contract. Include stable code, severity, BG/EN message or message parameters, affected entity/field, source/status, acknowledgement/resolution state where supported, and snapshot context.

Support at least the warning categories already defined by the product specification, including missing load, support spacing outside a diagram range, incompatible support, missing construction base, unconfirmed anchor, fitting without defined additional support, mixed material/coating, missing product variant, manual quantity override, provisional/project rule, and unconfirmed/expired catalog version.

#### `approvals`

Store append-only approval decisions for saved revisions. Include revision, decision (`approved` or `rejected`, plus any Stage 3 states), actor, actor role at decision time, comment/reason, timestamp, and correlation/audit metadata.

Do not allow approval of a mutable draft. Ensure approval authorization remains enforced in the application/service layer for administrator and reviewer roles. Preserve prior approval events rather than overwriting them.

### 6. Design revision snapshots and immutability

Implement a deliberate snapshot strategy. Do not rely solely on foreign keys to live catalog/rule rows.

At revision creation, transactionally snapshot at least:

- the validated calculation input;
- calculation schema and engine version;
- catalog version identity and metadata;
- every product fact used in the result;
- relevant product attributes, included items, packaging data, and source pages;
- compatibility/calculation rules that affected the result;
- assembly templates and template components that affected the result;
- warnings and manual overrides;
- the final BOM line values.

Use normalized snapshot tables, JSONB documents, or a justified hybrid that matches Stage 3. Snapshot payloads must be schema-versioned and validated before persistence. Add checksums where useful for detecting accidental mutation.

Enforce saved-revision immutability through the strongest practical combination of:

- database permissions or triggers if consistent with the repository;
- repository/service API design with no update/delete method for immutable rows;
- explicit database constraints;
- tests proving that later catalog/rule changes do not change stored revision results.

If hard database immutability is intentionally not used, document the trust boundary and compensate with focused tests and restricted write paths.

### 7. Add database constraints and indexes

Implement database-level constraints for all invariants PostgreSQL can enforce reliably, including:

- primary and foreign keys;
- explicit `ON DELETE` / `ON UPDATE` behavior;
- unique route code within a project;
- unique product code within the appropriate catalog-version scope;
- valid route endpoint identity/cardinality;
- valid connection references and non-self-connections;
- positive material, component, packaging, and calculated quantities;
- non-negative values only where zero is semantically valid;
- positive straight-segment length;
- allowed canonical units;
- allowed enum/status/type values;
- manual-item catalog/free-text exclusive-or rule;
- unique project revision number;
- sensible date/lifecycle ordering;
- no invalid included-item self-reference.

Add indexes for proven access paths such as:

- project-to-routes and route children;
- endpoint connection lookup;
- catalog version and product code/category/filter fields;
- active catalog/rule/template queries;
- current project draft lookup;
- revision history and BOM-by-revision lookup;
- warnings and approvals by revision;
- idempotency key and correlation ID where used operationally.

Avoid speculative indexes. Document non-obvious index choices.

### 8. Create migrations

Create ordered, executable migrations using the repository's existing migration framework.

Requirements:

- A completely empty development/test database can be built from zero using only committed configuration and commands.
- Migration ordering is deterministic.
- Database extensions, enums/domains, tables, constraints, indexes, functions, and triggers are created explicitly.
- Every foreign-key deletion behavior is intentional.
- Migrations do not depend on manual SQL steps.
- Migrations are safe for development/test data and do not contain destructive production assumptions.
- Add a documented rollback procedure for development/test.
- If the migration framework supports down migrations, implement and test them.
- If it intentionally uses forward-only migrations, provide a tested development/test reset/rollback procedure and explain why.

Do not claim rollback support unless it has been executed successfully against a disposable database.

### 9. Create a deterministic seed mechanism

Provide a repeatable, idempotent seed mechanism for development and test.

Seed the smallest representative dataset needed to exercise the schema, including:

- one managed catalog version;
- representative Niedax product categories;
- at least one straight cable-tray product variant;
- one fitting;
- one support/assembly component;
- representative Niedax anchors from the catalog model, including differing sizes/packaging where data already exists in the repository;
- product attributes and source-page references;
- an included-item relationship;
- compatibility and calculation rules;
- an assembly template with components and anchor quantity;
- one project with multiple uniquely coded, logically connected routes;
- straight segments, a fitting, endpoints, a valid connection, support configuration, and a manual item;
- a mutable calculation draft;
- one explicitly saved revision with BOM lines and warnings;
- an approval event only if the seeded actor/role model supports it cleanly.

Do not invent authoritative catalog facts. Use existing imported fixtures or clearly label synthetic development/test records as synthetic and unverified.

Running the seed twice must not create duplicates or corrupt existing seed data.

### 10. Add database constraint and integration tests

Add automated tests against a real disposable PostgreSQL database, not mocks alone.

At minimum, test that:

1. all migrations apply successfully to an empty database;
2. the seed succeeds after a clean migration;
3. the seed is idempotent;
4. product code uniqueness is correctly scoped by catalog version;
5. route codes are unique within a project but may repeat in another project;
6. zero and negative quantities are rejected where prohibited;
7. invalid/free-text units are rejected;
8. a route has the required valid endpoint structure;
9. an endpoint cannot connect to itself;
10. cross-project endpoint connections are rejected;
11. invalid duplicate endpoint connections/cardinality are rejected;
12. invalid included-item self-reference is rejected;
13. invalid manual-item product/free-text combinations are rejected;
14. concurrent revision creation cannot produce duplicate revision numbers;
15. a mutable calculation draft can be replaced without creating a saved revision;
16. a saved revision cannot be modified through supported persistence APIs;
17. changing or activating catalog products, attributes, rules, included items, or templates after revision creation does not change the saved revision snapshot or BOM;
18. a saved BOM remains readable after its source product is archived, where permitted;
19. approvals can reference saved revisions but not mutable drafts;
20. rollback/reset works for development/test and a fresh migrate-up still succeeds afterward.

Add focused repository/service integration tests for invariants that cannot be enforced solely by simple SQL constraints. Test failure modes and expected database/application error codes, not only happy paths.

### 11. Document the developer workflow

Add or update concise repository documentation with exact commands for:

- starting the development/test PostgreSQL instance;
- configuring environment variables without committing secrets;
- creating the database from zero;
- applying migrations;
- checking migration status;
- seeding data;
- resetting or rolling back development/test;
- running database constraint tests;
- inspecting the ER model;
- creating the next migration safely.

Use the repository's actual package-manager commands. Do not provide pseudocommands when an executable command can be supplied.

## Transaction boundaries

Implement and test transaction boundaries consistent with Stage 3:

- catalog activation must not leave multiple conflicting active versions;
- calculation-draft replacement is atomic;
- saving a revision atomically assigns the next project revision number and writes all snapshots, BOM lines, and warnings;
- approval creation is atomic and targets an existing immutable revision;
- a partial revision must never be visible after an error;
- idempotency keys must not create duplicate drafts, revisions, or approvals where Stage 3 requires idempotency.

Do not hold long transactions while performing external I/O.

## Data-quality and security requirements

- Validate structured JSON/JSONB against the versioned Stage 3 schemas at the application boundary and add database checks where practical.
- Never store JavaScript expressions, SQL fragments, or arbitrary executable rules in database fields.
- Store timestamps in UTC and display them in the user-selected locale.
- Use database-generated or application-generated identifiers consistently with Stage 3.
- Avoid cascading deletes that could remove revisions, BOM lines, warnings, snapshots, or approvals.
- Prefer archival/status changes for catalog and project records referenced by history.
- Do not commit credentials, local database volumes, generated secrets, or machine-specific paths.
- Preserve correlation IDs and audit fields required by Stage 3.
- Keep persistence models separate from calculation-engine domain types; map explicitly at module boundaries.

## Required deliverables

Commit-ready repository changes must include:

1. the implemented database schema/model definitions;
2. ordered executable migrations;
3. a deterministic seed mechanism and representative fixtures;
4. the ER diagram and relationship notes;
5. database constraint tests and required integration tests;
6. development/test rollback or reset procedure;
7. exact database workflow commands in developer documentation;
8. any required persistence mappers/repositories needed to validate snapshot creation and immutability;
9. Stage 4 implementation notes listing assumptions, deviations, and follow-up items.

## Definition of Done

Stage 4 is complete only when all of the following are true:

- A completely empty database can be created from zero by following the documented commands.
- Every migration applies successfully in order.
- The seed mechanism completes successfully and is repeatable without duplicates.
- The ER model matches the implemented schema.
- All required tables, relations, constraints, indexes, and lifecycle states exist.
- Database constraint and integration tests pass against a real disposable PostgreSQL database.
- Route codes are proven unique within a project.
- Endpoint connections are proven valid and project-scoped.
- Positive quantities and canonical units are enforced.
- Revision creation snapshots the exact product, source, rule, template, warning, and BOM data used by the calculation.
- A saved revision remains byte-for-byte or semantically unchanged after the active catalog, product attributes, included items, compatibility rules, calculation rules, or assembly templates are changed.
- Saved revisions cannot be silently updated through supported write paths.
- Development/test rollback or reset has been executed and verified.
- Existing lint, type-check, unit-test, and build commands still pass, except for clearly documented pre-existing failures.
- No unrelated files or user changes have been overwritten.

The critical acceptance test is:

> Create an empty database, migrate it, seed it, calculate and save a revision, record its snapshot/BOM checksum, activate or modify a later catalog/rule set, reload the saved revision, and prove that its stored snapshot, BOM values, warnings, and checksum have not changed.

## Execution rules

- Work autonomously through inspection, implementation, migration, seeding, testing, and documentation.
- Prefer small, reviewable changes that follow existing repository conventions.
- Use the existing development database/container setup. Create only disposable development/test data.
- Do not run destructive commands against an unidentified or non-test database.
- Before reset or rollback, verify from configuration that the target is disposable development/test infrastructure.
- Do not weaken constraints merely to make a failing test pass.
- Do not edit generated migration history after it has been treated as applied/shared; create a corrective migration instead.
- Do not leave TODO-only placeholders for required Stage 4 behavior.
- If blocked by a missing Stage 3 decision, document the exact blocker, propose the smallest safe decision, and continue with all unaffected work.

## Verification procedure

Run and report the actual repository commands for:

1. dependency installation only if needed;
2. database/container startup;
3. migration from an empty database;
4. seed execution twice;
5. database constraint and integration tests;
6. revision immutability acceptance test;
7. development/test rollback or reset;
8. migrate-up and seed again after rollback/reset;
9. formatting and linting;
10. TypeScript type checking;
11. relevant unit tests;
12. production build, if available in the current stage.

Do not state that a command passed unless you ran it and observed a successful result. If infrastructure prevents a command from running, report the exact command, error, affected verification, and the smallest next action needed.

## Final response format

When the work is complete, return a concise implementation report containing:

1. **Implemented** — schema areas, snapshot strategy, constraints, migrations, seed, and tests.
2. **Key decisions** — important choices and why they match Stage 3.
3. **Files changed** — grouped by migrations/schema, seeds, tests, and documentation.
4. **Verification** — commands run and their outcomes.
5. **Acceptance evidence** — how the empty-database and immutable-revision criteria were proven.
6. **Assumptions or blockers** — only unresolved or material items.
7. **Next stage handoff** — exact inputs now available for the following implementation stage.

