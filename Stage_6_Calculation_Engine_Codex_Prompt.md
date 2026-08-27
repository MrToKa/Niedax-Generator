# Codex Implementation Prompt — Stage 6: Calculation Engine

You are Codex working inside the existing Niedax Generator repository in VS Code. Implement Stage 6 completely in the current codebase. Do not stop after producing a plan, a contract-only placeholder, pseudocode, mock formulas, or tests without implementation. Inspect the repository first, preserve the architecture and versioned data established in Stages 3–5, implement the pure calculation engine, run the required validation, and report evidence for every Definition of Done item.

## Role

Act as a senior TypeScript domain engineer with experience in deterministic calculation systems, exact decimal arithmetic, graph-based route processing, BOM generation, traceability, and property-based testing.

Your implementation must be conservative about engineering facts:

- implement the formulas and behaviors explicitly approved in this prompt;
- resolve product identity, compatibility, packaging, included items, fitting connections, endpoint materials, templates, and rule confidence only from versioned input data;
- never infer catalog facts from a product code, family name, UI label, or naming convention;
- never fabricate a product code, compatibility relation, anchor suitability, fitting connector, 3 m order code, included fastener, package size, template component, or engineering approval;
- preserve unresolved facts as structured warnings or deterministic validation failures, as specified below.

## Stage objective

Replace the current honest Stage 3 contract-only engine with a deterministic, framework-independent TypeScript implementation that:

1. accepts a fully resolved, versioned, plain-JSON calculation input;
2. calculates every supported BOM demand according to explicit rules;
3. returns a stable JSON result for identical normalized input and identical engine/catalog/rule versions;
4. provides a structured calculation trace for every BOM line;
5. emits deterministic warnings for missing, provisional, incompatible, manually overridden, or engineering-review data;
6. never performs I/O and never fetches missing facts;
7. is proven by focused unit, property-based, golden, schema, determinism, and architecture-boundary tests.

The decisive acceptance condition is:

> Identical normalized input plus identical engine, catalog snapshot, rule snapshot, and formula versions always produces the same schema-valid, canonically ordered JSON result, and every BOM line is backed by at least one complete trace chain from source demand through technical quantity, reserve, packaging, and final ordered quantity.

## Repository baseline that must be respected

The current repository already establishes these facts. Verify them before implementation and adapt only if the checkout has legitimately evolved:

- The workspace uses pnpm 11.21.0, Node.js 24, strict TypeScript 6, Vitest 4, and Zod 4.
- packages/calculation-engine is the only owner of product calculation formulas. It is a pure package with no I/O and currently returns calculationStatus: contractOnly with CALCULATION_FORMULAS_NOT_IMPLEMENTED.
- packages/domain owns framework-independent domain vocabulary and strict versioned calculation schemas.
- apps/backend owns HTTP, authentication, authorization, application orchestration, PostgreSQL access, snapshot resolution, and mapping persistence data into engine input.
- apps/frontend is presentation-only and must contain no calculation formulas.
- packages/catalog-import owns Stage 5 import parsing and normalized catalog-import records. The calculation engine must not import this package or consume staging/import DTOs directly.
- database owns forward-only SQL migrations and immutable saved-revision storage. Stage 6 does not require database, Docker, authentication, or infrastructure changes.
- packages/export consumes immutable calculation results and must not recalculate quantities.
- rules/manifest.json currently identifies a draft rules version.
- CalculationInputV1 and CalculationResultV1 are retained public contracts. Their decimal values are canonical base-10 strings paired with explicit units.
- Existing canonical domain units include pcs, m, mm, kg, kgPerM, and packages. Stage 5 import-only units such as pairs, Nm, and weight-basis labels must not leak into calculations unless a versioned domain contract deliberately adds and defines them.
- Stage 5 catalog records use actual order units and package quantities. Straight KL/WSL products in the P0 data are typically represented with 6000 mm length and a 6 m pack/order quantity. The official source notes 3000 mm availability without necessarily defining a separate order code. Never invent such a code.
- Stage 5 included-item rows carry parent product, included product, quantity, and unit. Included hardware is informational in the BOM unless the same product is also independently required by a separate demand.
- Stage 5 assembly template components carry a component role, quantity, unit, quantity mode, and included-item suppression behavior. Do not discard those semantics when resolving engine input.
- AGENTS.md currently contains a stage-era sentence that forbids adding product calculation logic “at this stage.” Stage 6 is the explicitly authorized calculation stage. As the first implementation change, replace only that stale portion with a permanent boundary: product formulas are allowed exclusively in packages/calculation-engine, while cloud services, external runtime assets, telemetry, and formulas in frontend/backend/database remain forbidden. Do not weaken any security, secret, Docker, database, or validation instruction.

## Required discovery and baseline

Before changing source files:

1. Read every applicable AGENTS.md, README.md, CONTRIBUTING.md, package manifest, TypeScript/Vitest configuration, and architecture convention.
2. Read the Stage 3, Stage 4, and Stage 5 implementation prompts at repository root.
3. Read:
   - docs/architecture/architecture-overview.md;
   - docs/architecture/module-boundaries.md;
   - docs/architecture/adr/0002-pure-calculation-engine-and-json-contract.md;
   - docs/architecture/adr/0005-catalog-rule-snapshots-and-reproducibility.md;
   - docs/architecture/adr/0008-decimal-quantity-and-unit-representation.md;
   - docs/ux/mvp-input-contract-v1.md;
   - docs/ux/automatic-actions.md;
   - docs/ux/data-dictionary.md;
   - docs/database/stage4-implementation-notes.md;
   - docs/catalogs/catalog-import.md.
4. Inspect all current schemas and fixtures under packages/domain, all source/tests under packages/calculation-engine, the Stage 5 normalized contracts and representative catalog CSVs, the rules manifest, and export tests that consume CalculationResultV1.
5. Inspect Git status and preserve unrelated user changes.
6. Run the existing relevant baseline checks before implementation:

       corepack pnpm --filter @niedax/domain test
       corepack pnpm --filter @niedax/calculation-engine test
       corepack pnpm validate

7. Record pre-existing failures exactly. Do not misrepresent them as Stage 6 regressions, and do not weaken tests or validation to hide them.

Before implementation, write a short plan naming the contracts, modules, tests, and documentation that will change. Then continue autonomously through implementation and validation.

## Dependencies from Stages 3–5

Stage 6 consumes, but does not replace, these outputs:

### From Stage 3

- the pure CalculationEngine boundary;
- versioned CalculationInput and CalculationResult schemas;
- strict JSON serialization and unit conventions;
- catalog and rule snapshot references;
- deterministic canonicalization and ordering policy;
- domain types for projects, routes, connections, products, templates, rules, BOM lines, and warnings;
- the rule-confidence vocabulary: catalogConfirmed, calculated, projectRule, engineeringReview, and manual.

### From Stage 4

- route, segment, fitting, endpoint, connection, support, manual-item, rule-set, template, and immutable-revision semantics;
- exact numeric storage and canonical-unit decisions;
- mutable calculation drafts versus immutable explicit revisions;
- complete snapshot requirements for products, rules, templates, included items, warnings, and BOM;
- the rule that live catalog changes cannot alter saved results.

### From Stage 5

- normalized, versioned product facts;
- exact package quantity and order unit;
- explicit project-selection and compatibility allow lists;
- fitting/connection relationships;
- included-item quantities;
- assembly templates and template components;
- product engineering-verification flags;
- exact source provenance and content hashes;
- the rule that absent compatibility is not implicit compatibility.

The engine input must contain the resolved subset it needs. The engine must not query PostgreSQL, read CSV/XLSX/PDF files, inspect the active catalog, or resolve application IDs through a repository.

## Scope

Implement all of the following:

- versioned input/result/trace contracts sufficient for the approved formulas;
- exact unit and decimal normalization for calculation;
- per-segment straight-section calculation with explicit 3 m or 6 m supply selection and no automatic mixing;
- reserve and delivery/package rounding in the required order;
- internal straight-section joints;
- fitting-specific and physical-connection material demands;
- included-item suppression and informational relationships;
- support calculation across logical continuation groups;
- fitting/connection/manual additional supports with full trace;
- assembly-template components and anchors per support axis;
- anchor and component manual overrides with warnings;
- WSTB one/two/custom quantities, default two, and project-rule status;
- route-end material behavior;
- manual catalog products and free-text products with reserve and packaging policies;
- deterministic demand aggregation, BOM generation, trace generation, warning generation, summaries, ordering, and stable JSON;
- unit, schema, property-based, golden, determinism, and architecture-boundary tests;
- concise engine documentation, decisions log, formula catalog, and completion evidence.

## Non-scope

Do not implement or redesign:

- frontend forms, result tables, localization, or visual design;
- HTTP endpoints, authentication, authorization, application transactions, revision saving, or approval workflow;
- database migrations, catalog import, PDF extraction, catalog activation, backup, Docker, networking, or deployment;
- prices, currency, ERP integration, procurement optimization, stock optimization, or mixed-length cutting optimization;
- structural verification, load capacity calculations, anchor capacity, seismic/fire verification, or automatic approval;
- a solver that substitutes alternative products when selected data is missing;
- automatic mixing of 3 m and 6 m sections;
- time-dependent behavior, random identifiers, telemetry, network calls, filesystem reads, environment-variable behavior, or hidden global state.

If a contract change requires a small update to packages/domain, tests, documentation, or packages/export compatibility, make it. Do not expand into persistence or UI integration.

## Architecture requirements

### Pure package boundary

packages/calculation-engine must remain:

- synchronous unless an already accepted repository convention requires otherwise;
- deterministic and referentially transparent;
- framework-independent;
- free from Node-specific I/O APIs and browser APIs;
- free from React, Next.js, Fastify, PostgreSQL, pg, ORM, filesystem, network, process environment, clock, random, locale-sensitive formatting, and ID-generation dependencies;
- dependent only on stable domain contracts, the versioned rules manifest, and a deliberately selected exact-arithmetic runtime dependency if one is justified.

No formula may be copied into frontend, backend, database SQL, catalog-import, or export.

### Pipeline

Implement an explicit, reviewable pipeline equivalent to:

1. validate and normalize the already resolved engine input;
2. build stable indexes by ID;
3. validate referential and dimensional consistency;
4. build route topology and logical-continuation support groups;
5. emit atomic demand events for straight sections, fittings, joints, connections, endpoints, supports, templates, anchors, WSTB, accessories, and manual items;
6. suppress only demands proven included by versioned included-item relations;
7. aggregate compatible demand events by a documented stable key;
8. apply quantity overrides and line policies in their defined order;
9. apply reserve;
10. apply supply-section and package rounding;
11. construct BOM lines and included-item relationships;
12. construct trace chains and warnings;
13. compute summaries;
14. sort and freeze/return a schema-valid stable result.

Use small pure functions for rules. Avoid one large mutable calculate function.

### Suggested folder structure

Adapt to the existing package, but aim for a structure equivalent to:

    packages/calculation-engine/
      src/
        index.ts
        contracts.ts
        calculate.ts
        errors.ts
        arithmetic/
          decimal.ts
          quantity.ts
          units.ts
          rounding.ts
        model/
          indexes.ts
          demand-event.ts
          aggregation-key.ts
        topology/
          route-graph.ts
          support-groups.ts
          straight-runs.ts
        rules/
          sections.ts
          reserve.ts
          packaging.ts
          joints.ts
          fittings.ts
          connections.ts
          supports.ts
          assemblies.ts
          anchors.ts
          wstb.ts
          endpoints.ts
          manual-items.ts
          included-items.ts
          warnings.ts
        trace/
          trace-builder.ts
          formula-catalog.ts
        stable/
          ids.ts
          ordering.ts
          canonical-json.ts
      tests/
        unit/
        property/
        golden/
          fixtures/
          expected/
        helpers/

Keep public exports narrow. Internal helpers must not become public API accidentally.

## Contract versioning and domain-model work

### Protect retained v1

Do not silently change the meaning of retained CalculationInputV1 or CalculationResultV1 snapshots. First perform and document a contract-gap analysis.

The current v1 contract is likely insufficient for all Stage 6 requirements because it does not fully represent:

- supply options and their exact product/rule provenance;
- included-item quantities and units;
- resolved compatibility relations;
- fitting-port connection requirements;
- component roles and quantity modes from Stage 5;
- manual metadata on every additional-support correction;
- a structured trace;
- warning severity and approval impact;
- distinct reserve versus packaging overage;
- stable demand-source aggregation across multiple contributing routes.

When any required addition would change v1 meaning or make a formerly invalid v1 payload valid, create CalculationInputV2 and CalculationResultV2, plus CalculationTraceV1, and preserve v1 parsing and retained fixtures unchanged. Export version constants from one authoritative module. Do not edit old golden snapshots to make a breaking change appear compatible.

If the gap analysis proves a backward-compatible extension is genuinely safe under repository versioning rules, document the proof. Otherwise prefer v2.

### Required resolved input model

The implemented engine input must provide, directly or through equivalent discriminated types:

- schema version and application-supplied calculation run identity/fingerprint;
- exact engine-compatible project data;
- ordered route geometry with stable segment/fitting IDs;
- per-route and, when supported by persisted data, per-segment 3 m/6 m section selection;
- endpoints and connections with physical-break and support-sharing semantics;
- support spacing, template selection, selected support/structure/anchor/WSTB products, and manual corrections;
- project spare and line-level spare/packaging policies;
- resolved catalog snapshot reference and resolved product subset;
- for each relevant product: stable ID, exact code, English description, role/type, order unit, package increment, supply options, engineering-review flag, source reference, and included-item relations with quantity/unit;
- resolved compatibility and product-assembly relations required by this run;
- resolved fitting/connection/endpoint rules with stable IDs, versions, confidence, and source references;
- resolved assembly templates with component role, quantity, unit, quantity mode, inclusion behavior, and required manual parameters;
- rule snapshot reference and every rule used or eligible for use;
- manual catalog/free-text items, quantity adjustments, and policy overrides with reason metadata;
- calculation options with explicit unresolved-data policy.

The engine must reject duplicate stable IDs, broken references, mismatched snapshot IDs, dimensionally invalid quantities, fractional piece counts, non-positive spacing/package increments, unsupported units, and ambiguous duplicate policies before BOM generation.

### Core domain concepts

Model these concepts explicitly rather than passing loosely related objects:

- Quantity and unit/dimension;
- SupplyOption;
- ProductSnapshot;
- IncludedItemRelation;
- CompatibilityRelation;
- RuleReference;
- FormulaReference;
- SourceReference;
- RouteSegmentDemand;
- StraightRun;
- LogicalSupportGroup;
- PhysicalConnectionEvent;
- DemandEvent;
- DemandAggregationKey;
- AppliedPolicy;
- RoundingDecision;
- BomLine;
- TraceStep;
- Warning;
- CalculationSummary.

Use discriminated unions and exhaustive switches. Avoid any, unsafe casts, broad string maps, and behavior selected by parsing product-code text.

## Exact arithmetic and unit normalization

### Decimal policy

All externally visible decimals remain canonical base-10 strings. Do not use binary floating-point arithmetic for domain formulas, comparisons, multiplication by reserve percentages, division, or rounding. In particular, do not implement business formulas with Number, parseFloat, Math.ceil, or locale formatting.

Choose one deterministic exact approach:

- a small internal BigInt-backed decimal/rational implementation with explicit scale rules; or
- a mature exact-decimal library pinned to an exact version.

Document the choice and add tests for canonicalization, large values, decimal percentages, and boundary rounding. Reject exponent notation, NaN, infinity, negative zero, non-canonical leading zeros, and precision that exceeds the documented safe limit.

### Supported calculation dimensions

At minimum support:

- m for length;
- mm for catalog dimensions and supply-length input;
- kgPerM for linear mass/load rates;
- kg for mass;
- pcs for countable products;
- packages only as a result count, not as a physical material dimension.

Required conversions:

- 1 m = 1000 mm exactly;
- kgPerM multiplied by m yields kg;
- m and mm may be compared/converted only through explicit functions;
- pcs and packages are non-negative integers;
- custom WSTB quantities, support counts, joint counts, connector counts, anchor counts, and count-based template components are integer pcs;
- quantities with different dimensions must never be added, compared, or packaged together.

Normalize every output decimal to one canonical representation: no trailing fractional zeros, no exponent notation, and exactly 0 for zero.

## Approved formula semantics

The formula IDs below are stable trace identifiers. Minor implementation refactoring must not change their meaning. If a meaning changes later, introduce a new formula ID/version.

### 1. Straight sections — per segment, no automatic mixing

Formula ID: SECTION.REQUIRED_PER_SEGMENT.V1

For every straight geometry segment independently:

    requiredSectionCount = ceil(segmentLength / selectedSupplyLength)
    deliverableTechnicalLength = requiredSectionCount × selectedSupplyLength

Rules:

- Resolve selectedSupplyLength from the segment override when the versioned input supports one; otherwise from the route selection.
- The only approved choices are exactly 3 m and 6 m.
- Never pool unrelated segment lengths before ceiling. For example, 3.1 m and 2.9 m as two 6 m segments require two sections, not one.
- Never replace 3 m with 6 m, 6 m with 3 m, or mix lengths to reduce waste.
- The demand aggregation key must include selected supply length. A 3 m demand and a 6 m demand must remain distinguishable even if they reference the same catalog product code.
- A selected length must resolve to an explicit versioned SupplyOption with product/rule/source provenance.
- The same catalog product code may be referenced for both lengths only when the versioned snapshot explicitly represents that fact. The Stage 5 note about 3000 mm availability is not permission to invent a new code.
- If the selected option is missing, inactive, incompatible, or unresolved, do not substitute another option. Emit the specified warning/error according to unresolved-data policy and do not create a fabricated orderable line.
- For straight products ordered in m, technical BOM quantity is the section-rounded deliverable length before reserve. Keep raw segment length, section count, section length, and cutting/waste delta in trace.

Aggregate section demand only after calculating each segment independently. The aggregated technical section count is the sum of segment section counts for the same product, supply option, policy bucket, and compatible provenance.

### 2. Reserve — after required deliverable sections/count

Formula ID: RESERVE.APPLY_AFTER_TECHNICAL.V1

For straight-section demand:

    reservedSectionCount = ceil(technicalSectionCount × (1 + reservePercent / 100))
    reservedQuantity = reservedSectionCount × selectedSupplyLength

For count-based pcs demand:

    reservedQuantity = ceil(technicalQuantity × (1 + reservePercent / 100))

For continuous m or kg manual demand that is not a deliverable-section product:

    reservedQuantity = technicalQuantity × (1 + reservePercent / 100)

Rules:

- Determine the technical deliverable demand first. Apply reserve second.
- Resolve spare policy in this order: explicit line policy, manual-item policy, project default.
- Disabled reserve means exactly 0 percent and must retain its manual metadata when it is an override.
- Percentage override must retain original/default percent, selected percent, actor/reference metadata, and reason.
- Reserve never reduces technical demand.
- Reserve rounding for sections and pcs is upward to a whole count.
- Preserve a separate reserveQuantity delta. Do not merge reserve overage with packaging overage.

### 3. Package/delivery rounding

Formula ID: PACKAGING.ROUND_UP_TO_INCREMENT.V1

When package rounding is enabled:

    packageCount = ceil(reservedQuantity / packageIncrement)
    orderedQuantity = packageCount × packageIncrement
    packagingOverage = orderedQuantity - reservedQuantity

When package rounding is disabled:

    orderedQuantity = reservedQuantity
    packagingOverage = 0
    packageCount is null or an explicitly documented exact quotient; do not imply whole packages

Rules:

- Resolve a catalog product package increment from the versioned product snapshot.
- A manual override of package increment requires reason metadata and a warning.
- Free-text items require an explicit positive package increment when rounding is enabled.
- Package unit/dimension must match the order quantity dimension.
- For straight supply, the package increment must be compatible with the selected section length. If it is not an integer multiple that can be ordered without violating the selected supply length, fail semantic validation or emit a blocking incompatibility result; never silently create a mixed or fractional section.
- orderedQuantity must be greater than or equal to reservedQuantity.
- totalSpareQuantity may be reported as orderedQuantity minus technicalQuantity, but reserveQuantity and packagingOverage must also remain separate and unambiguous.

### 4. Internal joints and fitting-specific connections

Formula ID: JOINT.INTERNAL_STRAIGHT_RUN.V1

Create maximal physical straight runs using ordered geometry and non-breaking logical continuation edges. Section calculation remains per segment; only the joint-event topology may span a logical route boundary.

For a maximal straight run without an intervening fitting or physical break:

    internalJointEventCount = max(sum(sectionCount across contributing straight segments) - 1, 0)

Rules:

- A fitting boundary is not a generic internal-joint boundary. Its connection products come from fitting-specific rules.
- A physical break ends the straight run.
- A logical continuation adds no connection material by itself, but it may allow the straight-run joint topology and support topology to continue.
- Resolve the actual joint product/assembly only from an explicit versioned rule compatible with system, dimensions, finish/material, product role, and supply option.
- Missing compatibility or joint-product mapping is not permission to choose a likely connector from its code.

Formula ID: CONNECTION.FITTING_SPECIFIC.V1

For every resolved fitting and physical connection:

- add the fitting product itself once when it is an orderable demand;
- resolve the number and type of required connection assemblies per fitting port/side from explicit fitting-specific rules;
- add separately ordered connectors/accessories exactly once per physical event;
- respect connection type, orientation, participant count, system transition, material/finish, and rule applicability;
- use stable physical-event keys to prevent the same endpoint/connection from being counted by both endpoint and connection rules;
- apply a manual connector correction only after the calculated connector event count, preserve original and adjusted quantity, and emit a warning/trace step.

Included fasteners and accessories:

- attach included-item relations to the parent BOM line as informational data;
- do not create a top-level order demand for an included child merely because it is included;
- suppress a child only up to the quantity proven included for that exact parent demand;
- if the same child is independently required elsewhere, order only the independent net demand and retain both source traces;
- a Stage 5 “must be ordered separately” rule is a demand rule, not an included-item relation;
- detect and deterministically reject inclusion cycles or contradictory inclusion data if they reach the resolved input.

### 5. Supports and logical continuation

Formula ID: SUPPORT.BASE_CONTINUOUS_GROUP.V1

Build maximal logical support groups over connections that:

- are logicalContinuation;
- have physicalBreak false;
- have shared support behavior;
- have compatible support spacing, template, support type, and other required support-policy inputs.

For each group:

    baseSupportCount = ceil(totalStraightLength / spacing) + 1

Rules:

- totalStraightLength is the exact sum of straight geometry lengths in the group.
- Do not calculate each logically continued route independently and then add the results.
- Example: two 6 m routes logically continued with 1.5 m spacing produce ceil(12 / 1.5) + 1 = 9 base supports, not 5 + 5 = 10.
- A physical break or separate support behavior starts a new group.
- Fittings contribute length only if the versioned input explicitly provides a supported physical length; otherwise they contribute zero length and remain separate support-adjustment events.
- When logically continued routes have incompatible support configuration, never silently choose one configuration. Use the deterministic mismatch policy documented in the decisions log: reject as a semantic input error when safe calculation is impossible; otherwise split groups, emit ENGINEERING_REVIEW severity, and trace the split. Do not claim continuous calculation across a mismatch.
- The base formula count is always an integer.

### 6. Additional and manual supports

Formula IDs:

- SUPPORT.EXTRA_AROUND_FITTING.V1
- SUPPORT.EXTRA_AT_CONNECTION.V1
- SUPPORT.MANUAL_CORRECTION.V1

Calculate additional support events separately from the base count:

- around each fitting, use the explicit per-fitting or fitting-specific rule quantity;
- at each connection side, use explicit supportsBefore/supportsAfter or resolved rule quantities;
- shared versus separate connection behavior must be applied exactly once;
- a manual addition/correction must have stable ID, original calculated quantity when applicable, adjusted/additional quantity, reason, actor/reference metadata, and source entity;
- negative totals are invalid; no correction may reduce a required count below zero;
- every adjustment must produce a trace step and MANUAL_OVERRIDE or MANUAL_EXTRA_SUPPORT warning.

The final support count for a support group is:

    totalSupportCount =
      baseSupportCount
      + fittingAdditionalSupports
      + connectionAdditionalSupports
      + manualAdditionalSupports

Do not hide additional supports inside the base formula.

### 7. Assembly templates, structures, and anchors

Formula ID: ASSEMBLY.COMPONENT_QUANTITY.V1

Apply an assembly template to an explicitly identified support group/application. Preserve component role and quantity mode:

- fixed: quantity applies once per documented template application scope;
- perSupport: component quantity × totalSupportCount;
- perLevel: component quantity × explicit levelCount; missing levelCount is unresolved and must not default to 1;
- manual: use an explicit positive manual quantity and reason; missing manual quantity is unresolved.

The implementation must document the exact scope of fixed and perLevel to prevent accidental multiplication.

For selected anchors on the support axis/mounting point:

    calculatedAnchorQuantity =
      totalSupportCount × anchorsPerSupportAxis

Rules:

- use the exact selected Niedax anchor product and size from the resolved snapshot;
- assembly-template anchor quantity is the original calculated quantity;
- a manual anchor quantity-per-axis override replaces the template value before multiplication;
- preserve original and adjusted values plus reason metadata;
- emit MANUAL_ANCHOR_OVERRIDE when overridden;
- emit ANCHOR_ENGINEERING_CHECK_REQUIRED whenever product or template policy requires review;
- missing substrate/base, unknown substrate, missing anchor, incompatible substrate/product, or missing compatibility evidence produces structured warnings and may prevent an orderable anchor line under unresolved-data policy;
- never claim anchor capacity or structural suitability.

Included template components must remain informational and must not be ordered twice.

### 8. WSTB

Formula ID: WSTB.PER_SUPPORT.V1

Resolve WSTB quantity per support as:

- mode one: 1;
- mode two: 2;
- mode custom/manual: the explicit positive integer custom quantity.

Then:

    technicalWstbQuantity = totalSupportCount × quantityPerSupport

Rules:

- default selection is mode two;
- one, two, and custom are supported;
- the WSTB line remains status projectRule until a future versioned catalog/engineering rule explicitly changes its confidence;
- mode two always emits WSTB_PROJECT_RULE_UNCONFIRMED while its source rule confidence is projectRule;
- custom emits the project-rule warning and a manual-override warning with reason metadata;
- the WSTB product must be explicitly selected/resolved and compatible;
- WSTB quantity ownership must be single-source. If a template also identifies the same WSTB component, merge it by semantic role and use the dedicated WSTB rule for quantity; do not add template quantity plus WSTB rule quantity. Emit WSTB_TEMPLATE_RULE_CONFLICT when versioned values disagree.

### 9. Route ends

Formula ID: ENDPOINT.MATERIAL.V1

Apply controlled endpoint behavior:

- freeEnd: no material;
- routeContinuation: no endpoint material; the connection/topology owns any physical event;
- endCap: add only a resolved compatible end-cap product/rule;
- equipment: add only the resolved compatible equipment-termination material;
- physicalSplice: add only the resolved compatible splice assembly when the event is not already owned by a connection;
- custom: add no automatic product; use explicit manual BOM inputs.

Rules:

- use one stable event-ownership policy so an endpoint participating in a connection is never counted twice;
- validate compatibility using versioned allow-list data;
- unresolved material produces a warning and no invented product;
- respect the existing failOnUnresolvedMaterial option or its versioned successor deterministically;
- attach included-item information to any added endpoint parent product.

### 10. Manual catalog and free-text products

Formula ID: MANUAL.ITEM.V1

For a manual catalog item:

- resolve exact product ID/code from the supplied snapshot;
- require the input quantity unit to match or be explicitly convertible to the product order unit;
- use catalog package increment by default;
- allow explicit reserve and package overrides only with metadata and warnings.

For a free-text item:

- preserve the user-provided English description, optional code, positive quantity, canonical unit, reason, note, and stable input ID;
- require explicit positive package increment if package rounding is enabled;
- never attach catalog-confirmed status or catalog provenance;
- keep one BOM line per manual input unless a future explicit merge policy is supplied.

Apply reserve and packaging using the same shared policy pipeline as calculated lines. A manual item is not exempt from trace requirements.

## Demand aggregation and BOM semantics

Generate atomic DemandEvent records before aggregation. Each event must include:

- stable event ID derived solely from stable input references and formula ID;
- product/manual identity;
- category and role;
- quantity and unit;
- selected supply option when relevant;
- source entity references;
- rule/formula references;
- status/confidence;
- applied policy identity;
- included-item evidence;
- trace-parent references;
- warnings.

Aggregate catalog events only when all semantics match:

- same product snapshot ID;
- same selected supply option;
- same quantity dimension/order unit;
- same effective reserve policy;
- same packaging policy/increment;
- same override boundary;
- compatible status and provenance semantics.

Do not merge manual free-text rows. Do not merge 3 m and 6 m demand. Do not merge a manually overridden line with a calculated line in a way that hides the override.

Define BOM quantities unambiguously. If v2 is introduced, include at least:

- technicalQuantity: physical deliverable demand before reserve;
- reserveQuantity: reserve-only delta;
- reservedQuantity: technical plus reserve;
- packageIncrement;
- packageCount when meaningful;
- packagingOverage: package-only delta;
- orderedQuantity;
- totalSpareQuantity: ordered minus technical;
- unit;
- includedItems;
- source/provenance;
- status;
- warning references;
- trace step references.

For straight sections also retain section count and selected section length in structured detail or trace. Do not silently reinterpret ambiguous v1 fields.

Every BOM line must have a human-independent machine trace. User-facing prose can be derived later and is not the source of truth.

## Calculation trace schema

Create a strict CalculationTraceV1 schema or equivalent with:

    CalculationTrace {
      schemaVersion;
      steps: TraceStep[];
    }

    TraceStep {
      id;
      bomLineId;
      sequence;
      formula: {
        id;
        version;
        expression;
      };
      rule: {
        id;
        code;
        version;
        confidence;
        ruleSnapshotId;
      } | null;
      inputs: TraceInput[];
      output: TraceValue;
      rounding: {
        mode;
        before;
        increment;
        after;
      } | null;
      sourceRefs: SourceReference[];
      parentStepIds: string[];
    }

Requirements:

- expression is a stable symbolic formula label, not executable code and not localized prose;
- every numeric input has value and unit/dimension;
- every rule-driven step identifies rule ID, version, confidence, and snapshot;
- every step identifies its source route/segment/fitting/connection/template/manual input/product as applicable;
- reserve and package rounding are separate steps;
- manual corrections show original and adjusted quantities;
- final trace output reconciles exactly to the BOM line fields;
- every BOM line has one or more trace steps and one finalization step;
- no orphan trace step, missing parent, cycle, duplicate step ID, or cross-line trace reference;
- trace ordering is deterministic and topological;
- included items record the parent relation and are not disguised as zero-quantity BOM lines;
- formulas and values must remain usable without parsing human text.

Add an internal reconciliation assertion in tests, and optionally in development code, proving all line quantities equal their trace derivation.

## Warning engine

Warnings must be structured, stable, deduplicated, and deterministically ordered. Extend the versioned result contract when needed rather than encoding important state only in a message string.

Each warning must include or resolve:

- stable warning code;
- kind/category;
- severity such as info, warning, engineeringReview, or blocking;
- deterministic subject reference and optional field/path;
- message key or safe English snapshot;
- rule/product/template/source references where relevant;
- effect on calculation and approval readiness;
- related override ID when relevant.

At minimum implement and test:

- MISSING_CABLE_LOAD;
- MISSING_SUBSTRATE_OR_BASE;
- UNKNOWN_SUBSTRATE;
- MISSING_ANCHOR_SELECTION;
- ANCHOR_ENGINEERING_CHECK_REQUIRED;
- ANCHOR_PRODUCT_INCOMPATIBLE;
- MISSING_COMPATIBILITY_RULE;
- PRODUCT_SELECTION_INCOMPATIBLE;
- UNRESOLVED_SECTION_SUPPLY_OPTION;
- UNRESOLVED_JOINT_PRODUCT;
- UNRESOLVED_FITTING_CONNECTION;
- UNRESOLVED_ENDPOINT_MATERIAL;
- SUPPORT_CONFIGURATION_MISMATCH;
- FITTING_ADDITIONAL_SUPPORT_UNRESOLVED;
- MANUAL_EXTRA_SUPPORT;
- MANUAL_QUANTITY_OVERRIDE;
- MANUAL_ANCHOR_OVERRIDE;
- MANUAL_PACKAGE_OVERRIDE;
- WSTB_PROJECT_RULE_UNCONFIRMED;
- WSTB_TEMPLATE_RULE_CONFLICT;
- ASSEMBLY_TEMPLATE_MISSING;
- TEMPLATE_COMPONENT_MANUAL_VALUE_REQUIRED;
- ENGINEERING_CHECK_REQUIRED.

Use the established warning discriminators where sufficient. If warning severity/subject semantics require v2, preserve v1 and create a strict new schema.

Missing cable load must generate a warning even when current BOM formulas do not consume load. It must not cause the engine to invent a load or structural result.

Manual override warnings must never be removed merely because the adjusted value equals the calculated value; the fact that an override was explicitly applied remains traceable.

## Determinism and stable JSON

The engine must generate no clock values, random IDs, UUIDs, locale-formatted strings, environment-derived data, or filesystem/network data.

### Stable identifiers

Derive engine-owned event, BOM-line, warning, and trace IDs from stable source IDs, semantic aggregation keys, and formula versions. Use a documented deterministic encoder/hash with no platform-dependent behavior. Do not derive identity from array insertion order when the array is semantically unordered.

### Ordering

Preserve semantically ordered input:

- route geometry order;
- fitting port/connection participant order where the contract defines it;
- trace parent order when meaningful.

Canonicalize semantically unordered collections:

- routes and connections by stable ID for global processing;
- products, rules, templates, policies, and manual adjustments by stable ID;
- BOM lines by documented category ordinal, product code with null last, selected supply length, source key, and line ID;
- included items by parent line, child product code/ID;
- warnings by severity ordinal, code, subject reference, and warning ID;
- trace steps by BOM line order, sequence, formula ID, and step ID;
- summary totals by unit ordinal.

### Canonical JSON

- output contains no undefined, NaN, infinity, negative zero, Date, Map, Set, class instance, function, or BigInt;
- decimals use canonical strings;
- intentional absence is null;
- object keys are emitted by a defined canonical serializer when computing or testing byte stability;
- the application-supplied calculationRunId and inputFingerprint are echoed, not regenerated from hidden state;
- identical valid input invoked repeatedly returns deep-equal output and identical canonical JSON bytes;
- permutations of semantically unordered input arrays yield the same canonical result;
- changing a relevant product, rule, template, policy, or snapshot value changes the output/trace or produces an explicit warning; it must never be ignored accidentally.

Do not mutate the input. Add a deep-freeze input test.

## Error behavior

Differentiate:

- structural/schema-invalid input: reject deterministically with structured validation details;
- semantically contradictory input that prevents a safe calculation: reject with a stable engine error code;
- valid but unresolved/provisional engineering data: calculate unaffected demands and emit warnings, unless failOnUnresolvedMaterial or its successor explicitly requires a deterministic failure;
- internal invariant failure: throw a stable non-sensitive engine error and never return a partially inconsistent BOM.

Do not leak stack traces or library-specific error objects into CalculationResult.

## Required tests

### Unit tests

Add focused tests for every formula and branch. At minimum cover:

1. exact m/mm conversion and kgPerM × m = kg;
2. rejection of fractional pcs, invalid unit combinations, exponent notation, and negative zero;
3. 6.1 m with a 6 m option yields 2 sections;
4. two independent 6 m-selected segments of 3.1 m and 2.9 m yield 2 sections total, not 1;
5. selected 3 m and 6 m demands never merge or substitute;
6. unresolved 3 m option does not invent a code or use 6 m;
7. reserve is applied after technical section count;
8. 10 percent reserve over 10 sections yields 11; over 11 sections yields 13;
9. reserve disabled and percentage override retain metadata;
10. package rounding produces a whole package multiple and separate packaging overage;
11. internal joints for N sections are N minus 1 within a continuous straight run;
12. a fitting boundary uses fitting-specific connection rules instead of a generic internal joint;
13. logical continuation adds no direct material;
14. included fasteners are informational and are not ordered twice;
15. separately required connectors remain order demands;
16. support formula for 12 m at 1.5 m spacing yields 9;
17. two logical 6 m continuations at 1.5 m yield 9, while a physical/separate break yields 10;
18. support-configuration mismatch follows the documented deterministic policy;
19. fitting/connection/manual additional supports are counted once and fully traced;
20. template perSupport and fixed components use the correct multiplication scope;
21. perLevel without levelCount and manual mode without quantity are unresolved;
22. anchors equal total supports × anchors per support axis;
23. manual anchor override replaces the per-axis value and produces warning/trace;
24. WSTB mode one, two, and custom produce exact counts;
25. default two remains projectRule and emits its warning;
26. a template WSTB component does not double-count the dedicated WSTB rule;
27. free and continuation endpoints add no materials;
28. resolved compatible end-cap/equipment/splice endpoints add exactly one owned event;
29. unresolved/incompatible endpoint materials produce no fabricated line;
30. manual catalog items use catalog package settings unless explicitly overridden;
31. free-text items apply explicit reserve/package settings and remain manual status;
32. all required warning codes have deterministic subject references;
33. every BOM line has a complete reconciling trace;
34. summary counts/totals equal line data;
35. the public result passes its runtime schema.

### Property-based tests

Use a recognized property-testing library such as fast-check as a dev dependency, pinned consistently with repository policy. Use fixed seeds and explicit run counts so failures replay deterministically.

Prove at least:

- section capacity is always greater than or equal to segment length;
- per-segment unused length is non-negative and less than one selected section;
- increasing segment length never decreases required section count;
- increasing non-negative reserve never decreases reserved/ordered quantity;
- rounded ordered quantity is a multiple of package increment;
- ordered quantity is at least reserved quantity, which is at least technical quantity;
- support count equals ceil(length/spacing)+1 over positive generated inputs;
- merging compatible logical lengths and calculating once matches the group formula;
- all pcs outputs are integers and non-negative;
- included-only child demand never becomes a top-level line without independent demand;
- aggregation is associative/commutative for semantically unordered compatible demand events;
- input array permutation does not change canonical output;
- repeated calculation is byte-stable;
- every generated valid result passes the runtime schema and trace reconciliation.

Do not use unconstrained generators that mostly create invalid data. Build domain-aware arbitraries.

### Golden tests

Commit human-reviewable input and expected JSON files. Do not rely only on opaque framework snapshots.

Include at least these scenarios:

1. connected-routes-6m-support-continuation;
2. per-segment-rounding-and-3m-6m-separation;
3. fittings-joints-and-included-fasteners;
4. assembly-anchors-wstb-and-manual-supports;
5. route-ends-and-manual-items;
6. unresolved-data-warning-matrix;
7. all-major-rules-combined.

Each expected result must include BOM, trace, warnings, summary, snapshot/version references, and stable IDs. Add one intentional golden-update command or documented procedure that requires review; tests must fail on unreviewed drift.

### Contract and boundary tests

Prove:

- retained v1 fixtures still parse unchanged when v2 is introduced;
- v2 valid/invalid fixtures exercise strict unknown-key rejection;
- JSON stringify/parse round trips preserve input/result/trace;
- engine import/invocation starts no database, server, browser, or infrastructure;
- source imports and package dependencies contain no forbidden modules;
- calculate does not mutate frozen input;
- export compatibility is either preserved or explicitly adapted without quantity recalculation;
- current Stage 3 contract-only warning is removed only when the complete Stage 6 engine path is active.

## Documentation deliverables

Create or update:

### Engine overview

docs/calculation-engine/overview.md:

- package boundary and pipeline;
- input resolution boundary;
- arithmetic/unit policy;
- demand aggregation;
- stable ordering/ID/canonical JSON rules;
- error versus warning behavior;
- how to add a reviewed formula version.

### Formula catalog

docs/calculation-engine/formulas.md:

- every formula ID/version;
- symbolic expression;
- input dimensions;
- rounding point;
- output semantics;
- applicable rule confidence;
- edge cases;
- examples;
- associated tests.

### Decisions log

docs/calculation-engine/stage6-decisions.md:

Record each material decision with:

- ID;
- status: accepted, deferred, or blocked;
- context;
- decision;
- alternatives considered;
- consequence;
- source contract/catalog/rule evidence;
- affected code/tests.

At minimum record:

- exact arithmetic implementation;
- v1 preservation versus v2 introduction;
- straight BOM unit semantics;
- 3 m supply-option representation without invented code;
- per-segment calculation and later aggregation;
- reserve/package quantity semantics;
- physical event ownership and de-duplication;
- logical continuation support grouping;
- support mismatch policy;
- template fixed/perSupport/perLevel/manual scope;
- WSTB/template single ownership;
- unresolved-data severity policy;
- deterministic ID and canonical JSON method.

### Completion evidence

docs/calculation-engine/stage6-evidence.md:

- baseline commands/results;
- final commands/results;
- formula-to-test matrix;
- golden fixture list;
- property-test seeds/run counts;
- architecture-boundary evidence;
- deterministic replay evidence, including canonical hashes for golden outputs;
- known non-blocking engineering warnings;
- intentionally deferred integration work.

Do not write “all tests passed” without command output observed in the current environment.

## Implementation sequence

Use this order unless repository evidence requires a documented adjustment:

1. Inspect and baseline the repository.
2. Update only the stale Stage-era AGENTS.md product-formula prohibition while preserving permanent boundaries.
3. Write the contract-gap analysis and decisions skeleton.
4. Add/adjust versioned domain input, result, trace, warning, supply-option, included-item, compatibility, and template schemas.
5. Preserve v1 and add v2 fixtures/tests when required.
6. Implement exact arithmetic, unit normalization, quantity validation, and rounding primitives.
7. Implement stable indexes, deterministic IDs, ordering, and canonical JSON.
8. Implement route graph, straight runs, logical support groups, and event ownership.
9. Implement straight sections, reserve, and packaging.
10. Implement joints, fittings, connections, and included-item suppression.
11. Implement supports and additional/manual support corrections.
12. Implement assembly templates, structures, anchors, and WSTB.
13. Implement endpoints, accessories, and manual items.
14. Implement aggregation, BOM line finalization, trace reconciliation, warning de-duplication, and summaries.
15. Add unit tests alongside each rule.
16. Add property-based tests with fixed seeds.
17. Add golden fixtures and review expected JSON.
18. Update docs and evidence.
19. Run focused checks, then the complete required validation.
20. Review the final diff for generated artifacts, accidental v1 changes, secrets, unrelated files, formula duplication, and scope creep.

Do not commit or push unless explicitly asked.

## Required validation commands

Run focused checks during implementation:

    corepack pnpm --filter @niedax/domain test
    corepack pnpm --filter @niedax/domain typecheck
    corepack pnpm --filter @niedax/calculation-engine test
    corepack pnpm --filter @niedax/calculation-engine typecheck
    corepack pnpm --filter @niedax/calculation-engine build
    corepack pnpm --filter @niedax/export test

Then run the repository-required validation:

    corepack pnpm validate

Stage 6 should not change Docker, networking, database, authentication, backup, or infrastructure. Therefore validate:full is not required unless the actual diff crosses one of those boundaries. If it does, explain the scope expansion and run:

    corepack pnpm validate:full

Also run a deterministic replay check that calculates every golden input multiple times and compares canonical JSON bytes/hashes. Run property tests with the documented seeds at least once in the final verification.

If the pnpm shim works directly, pnpm with the same arguments is acceptable. Never claim a check passed unless it was run and succeeded.

## Definition of Done

Stage 6 is complete only when all of the following are true:

- packages/calculation-engine contains real formulas and no longer returns a contract-only placeholder for valid Stage 6 input.
- The package remains pure TypeScript with no I/O, infrastructure, UI, database, clock, random, or environment dependency.
- Versioned input contains every product/rule/template/compatibility/included-item fact used by the engine.
- Retained v1 contracts/snapshots remain valid and semantically unchanged, or a documented non-breaking proof exists.
- Exact decimal arithmetic is used for all domain calculations.
- Units m, mm, kgPerM, kg, and pcs normalize and compose correctly.
- Every straight segment is calculated independently.
- 3 m/6 m selection is explicit, versioned, and never automatically mixed or substituted.
- Reserve is applied after technical section/count demand and before package rounding.
- Reserve overage and packaging overage are separately visible.
- Internal joints and fitting-specific connection products are calculated without duplicate physical events.
- Included fasteners/items are informational and are not ordered twice.
- Supports follow ceil(length/spacing)+1 and logical continuation is calculated continuously when configurations are compatible.
- Fitting, connection, and manual additional supports are explicit and traced.
- Assembly-template components and anchors multiply on the correct support axis/scope.
- Manual overrides preserve original value, adjusted value, reason metadata, warning, and trace.
- WSTB supports one, two, and custom; defaults to two; remains projectRule; and is not double-counted with templates.
- Route-end dropdown semantics add only resolved compatible materials.
- Manual catalog and free-text products support explicit reserve and packaging behavior.
- Every BOM line has source/provenance, status, warnings, and a complete reconciling trace.
- Required warning categories exist and are deterministic.
- Identical normalized/versioned input produces byte-stable canonical JSON.
- Semantically unordered input permutations do not change the result.
- The result contains no generated timestamps/random IDs or non-JSON values.
- Unit tests cover every rule and edge branch.
- Property-based tests prove the required invariants with replayable seeds.
- Golden scenarios are committed as readable JSON and pass exact comparison.
- Runtime schemas validate input, result, warnings, and trace strictly.
- Architecture-boundary tests prevent forbidden dependencies and formula leakage.
- packages/export still consumes immutable quantities without recalculation.
- docs/calculation-engine contains overview, formulas, decisions, and completion evidence.
- corepack pnpm validate passes with no regression.
- No catalog fact, code, compatibility, anchor suitability, connector, supply option, or engineering approval was fabricated.

The final critical acceptance test is:

> Parse one fully resolved versioned input containing multiple routes, independent straight segments, a logical continuation, a physical fitting/connection, supports, an assembly template, anchors, WSTB, route ends, included hardware, a manual catalog item, a free-text item, overrides, reserve, and packaging. Run the engine repeatedly and under permutations of semantically unordered arrays. Prove identical canonical JSON; prove every ordered BOM quantity reconciles through trace; prove included hardware is not duplicated; prove all unresolved/manual/engineering facts remain visible as warnings.

## Working rules

- Preserve unrelated user changes and avoid broad refactors.
- Prefer small, reviewable increments.
- Use existing conventions and exact dependency versions.
- Do not alter Stage 5 official catalog data merely to make a Stage 6 test pass.
- Do not hardcode KL, WSL, KSV, WSTB, DAM, DAZ, NSA, or other product mappings in formula code. Test fixtures may use representative names, but production selection is data-driven.
- Do not read official PDFs from the engine.
- Do not bypass Zod runtime validation with casts.
- Do not weaken strict TypeScript, lint, architecture tests, or schema checks.
- Do not change a golden expected file without reviewing the associated formula/trace diff.
- If a product/engineering ambiguity does not block unaffected calculation, emit a structured warning and continue deterministically.
- If ambiguity makes an order quantity unsafe or unknowable, return a stable semantic error or blocking warning according to the documented policy; never guess.
- Ask a question only when the missing decision would force an incompatible public contract or an unsafe engineering assumption. Continue all unaffected work first.

## Final response format

When finished, provide a concise evidence-based implementation report with:

1. Implemented — contracts, arithmetic, topology, formulas, BOM, trace, warnings, and docs.
2. Contract/version decision — whether v2 was introduced and how v1 was preserved.
3. Formula behavior — section, reserve/package, joints/connections, supports, templates/anchors, WSTB, endpoints, and manual items.
4. Files changed — grouped by domain contracts, engine, tests/fixtures, and documentation.
5. Verification — exact commands and observed outcomes, including property seeds and golden replay.
6. Determinism evidence — canonical replay/hash result and permutation result.
7. Trace evidence — how every BOM line was reconciled.
8. Assumptions/warnings — only genuine remaining non-blocking engineering items.
9. Deferred integration — narrowly scoped application/UI/database work not part of Stage 6.

Do not claim Stage 6 is complete if the engine still returns an empty/contract-only result, if formulas depend on UI/database state, if any BOM line lacks trace, if 3 m/6 m are mixed automatically, if included fasteners are duplicated, if manual overrides are unmarked, if unresolved product facts are guessed, or if deterministic replay/property/golden tests were not run.
