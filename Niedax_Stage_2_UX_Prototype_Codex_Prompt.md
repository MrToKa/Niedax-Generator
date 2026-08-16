# Stage 2 — UX Prototype and Final Input Contract

You are working in the existing Niedax Generator repository. Implement Stage 2 of the project: transform the approved functional specification into a clickable UX prototype with explicit user actions, a complete field-level data dictionary, and documented validation/error states.

Do not stop after producing a plan. Inspect the repository, implement the prototype, verify it, and create the required documentation.

## 1. Start by inspecting the repository

Before changing code:

1. Read `AGENTS.md` and all relevant repository instructions.
2. Inspect the existing architecture, package manager, design system, routes, localization setup, tests, and documentation from Stage 1.
3. Locate the approved functional specification and existing domain terminology.
4. Reuse the current stack, conventions, components, and dependencies.
5. Do not rewrite unrelated code or replace established project structure.
6. If no UI scaffold exists, create the smallest appropriate Next.js App Router and TypeScript prototype consistent with the agreed architecture.
7. Use the repository’s existing validation solution. If none exists, introduce a lightweight typed schema approach only when necessary.

Document any conflict between this prompt and the existing approved specification. The approved Stage 1 decisions take precedence.

## 2. Objective

Create a desktop-first, clickable UX prototype that makes every MVP input, automatic action, dependency, validation, warning, and result visible and unambiguous.

The prototype must cover this wizard:

1. Project
2. System
3. Geometry
4. Supports
5. Load & Accessories
6. Results

The prototype may use mock data or local prototype state. Do not build the production calculation engine, production authentication, catalog import, database persistence, or final export generator during this stage unless those capabilities already exist.

Mock calculations and automatic material actions must be clearly isolated so they can later be replaced by the real calculation engine.

## 3. Fixed functional decisions

Treat the following as approved MVP decisions:

- The interface supports Bulgarian and English.
- Bulgarian is the default UI language unless Stage 1 defines another default.
- Excel export terminology is always English and must be stored separately from the UI translation resources.
- Every route has an internal stable ID, a unique user-facing `code`, `name`, and `description`.
- Relationships use stable IDs so renaming a route does not break connections.
- Logically connected routes are treated as one continuous geometry unless a physical break is explicitly selected.
- A logical continuation must not add physical materials automatically.
- Straight section length is selected per route: 3 m or 6 m; default: 6 m. Do not automatically mix both lengths.
- Project reserve can be overridden or disabled for an individual BOM row.
- For linear sections, reserve is applied after determining the required sections and is then rounded to deliverable sections.
- WSTB supports 1 per support, 2 per support, or manual quantity. Default: 2, visibly marked as a design rule until confirmed by Niedax.
- Anchor quantity comes from the mounting template and can be manually overridden.
- The exact Niedax anchor model and size are selected by the user in the MVP.
- Anchor suitability for substrate and load remains marked for engineering review.
- Additional supports around fittings are entered manually according to the construction.
- Users can add a catalogued Niedax product or a free-text material.
- A manual item contains quantity, unit, reason, note, reserve behaviour, and packaging-rounding behaviour.
- Manual quantity changes are visibly identified and produce a warning.
- Do not duplicate fasteners or accessories already included with a product.
- Only explicitly created revisions are retained.
- Approval is restricted to Administrator and Reviewer roles if represented in the prototype.

Do not invent unapproved engineering formulas, compatibility rules, load limits, anchor capacities, or Niedax product data. Label UX-only values as mock data or design assumptions.

## 4. Wizard requirements

### 4.1 Project

Create project setup using only Stage 1-approved fields. Show project identity, description, defaults, default reserve, UI language, and status/revision context where applicable. Record any unavoidable UX placeholder in the data dictionary.

### 4.2 System

Provide catalog-oriented selectors for system/series, dimensions and variants, material/finish, and other Stage 1 system-dependent options. F and E3 are commonly used; S and E5 remain available when supported by catalog data.

Dependent dropdowns must update visibly, preserve valid choices, clear invalid choices, explain unavailability, and never silently substitute products. Use a small labelled fixture dataset if the real catalog is unavailable.

### 4.3 Geometry

Create a route list showing code, name, description, system summary, total length/geometry summary, validation status, warning count, and open/duplicate/remove actions. Confirm removal when a route participates in connections.

The editor must support ordered straight sections, section length, fittings, start/end points, additional supports around fittings, and clear add/edit/reorder/duplicate/remove actions. Length must be greater than zero; incomplete geometry must never fail silently.

### 4.4 Route endpoints

Provide endpoint options:

- Free end
- End cap
- Equipment connection
- Continuation to another route
- Physical splice
- Custom

Show material effects before confirmation:

- Free end: no automatic material.
- End cap: compatible cap only when a confirmed rule exists.
- Equipment connection: defined mounting plate and fasteners when available.
- Continuation: open/create a route connection without duplicating material.
- Physical splice: required connectors and non-included fasteners when confirmed.
- Custom: catalogued and free-text materials.

If a compatible product cannot be resolved, warn and require review. Never invent a product code.

### 4.5 Connection editor

Support logical continuation, physical splice, horizontal/vertical bend, T-connection, transition/reduction, and custom connection.

Support participating routes/endpoints; two endpoints normally and three for T; physical-material behaviour; shared/separate supports; manual supports before/after; manual connector correction; manual products; note and reason.

Prevent self-connections and invalid references. Make endpoint conflicts actionable. State clearly that logical continuation changes route identity without automatically adding a physical product.

### 4.6 Supports

Provide support spacing, support type, construction template, shared/separate support behaviour, additional supports, anchor model/size, anchors per mounting point, substrate, manual anchor override, WSTB rule, and 3/6 m route section length.

Show each value’s source: user input, project default, catalog, mounting template, design rule, manual override, or calculated value. Unconfirmed anchors, unsupported substrate, or manual anchor overrides produce engineering warnings.

### 4.7 Load & Accessories

Provide cable load where defined, project reserve, per-item reserve override, accessories, manual Niedax products, free-text materials, and packaging-rounding behaviour. Missing load is a warning or blocking error according to Stage 1. Do not invent a load-selection algorithm.

### 4.8 Results and BOM

The detailed BOM must include category, product code, English description, technical quantity, unit, package size, package count, order quantity, spare quantity, included items, source, catalog/source version, rule/status badge, warnings, and manual override indicator.

Use statuses: Confirmed by catalog, Calculated, Design assumption, Requires engineering review, and Manual.

Each row needs a “Why?” detail explaining originating input, applied rule and source, included items, reserve, packaging rounding, manual corrections, and warnings. Clearly distinguish technical quantity, package size, package count, and ordered quantity. Never present prototype values as engineering-approved.

## 5. Reviewable UI states

Expose important states through the normal flow, scenario selector, or state-gallery route:

- initial/empty and valid populated states;
- required-field and invalid-number validation;
- duplicate route code;
- missing product variant or incompatible dependent selection;
- disconnected/incomplete geometry and invalid connection;
- unresolved endpoint material;
- missing load;
- unconfirmed anchor and unsupported substrate;
- manual quantity override and design-rule warning;
- catalog-version warning;
- loading and no-results states;
- read-only/approved state when already in Stage 1.

Differentiate information, warning, blocking validation error, and engineering review requirement. Explain resolution and do not rely on color alone.

## 6. Localization

Implement Bulgarian and English UI resources using stable keys. Do not duplicate hard-coded UI strings. Language switching must preserve entered data and wizard position. Translate labels, options, validation, warnings, buttons, and empty states. Keep fixed English export terminology separate. Never translate product codes or controlled identifiers.

## 7. Data dictionary

Document every implemented field with:

- stable field key and parent entity;
- wizard step/screen;
- Bulgarian and English labels;
- description, type, and UI control;
- required/optional status;
- unit and normalized internal unit;
- default, including intentional `null`;
- source and allowed values;
- validation and dependencies;
- visibility conditions and automatic effect;
- future persistence and revision inclusion;
- BOM impact and warning/error behaviour;
- Stage 1 decision reference.

Use normalized units such as `m`, `mm`, `kg/m`, `kg`, and `pcs`. No implemented field may be absent.

## 8. Automatic-action contract

For every automatic UI action document trigger, preconditions, inputs, result, materials added/removed, source, reversibility, user explanation, warning/error behaviour, and unresolved-rule fallback.

Cover endpoint materials, dependent dropdowns, logical continuation, support templates, anchor quantities, included accessories, reserve, packaging, and WSTB. No silent automation is allowed.

## 9. Validation and error-state register

Document validation ID, entity/field, condition, severity, Bulgarian and English messages, whether it blocks the next step or calculation, resolution guidance, rule source, and test coverage. Prefer inline errors for fields and summary banners for cross-route or engineering issues.

## 10. MVP field review and freeze

After implementation:

1. Compare every field/action against Stage 1.
2. Remove speculative MVP fields.
3. Ensure every field has source, unit, default, and validation.
4. Ensure every automation has a documented rule and visible explanation.
5. Check BG/EN terminology.
6. Record unresolved decisions without inventing answers.
7. Create a versioned MVP input contract.

If no blockers remain, mark `MVP Input Contract v1 — Frozen`. If unresolved decisions affect stored data or calculations, mark `MVP Input Contract v1 — Proposed` and list exact blockers.

## 11. Required deliverables

Create:

1. Complete clickable wizard prototype.
2. Reviewable representation of important UI states.
3. Complete data dictionary.
4. Validation/error-state register.
5. Automatic-action contract.
6. MVP field review checklist.
7. Versioned MVP input contract.
8. Short decision log for assumptions, open issues, and excluded future scope.

Prefer repository paths such as:

- `docs/ux/stage-2-ux-contract.md`
- `docs/ux/data-dictionary.md`
- `docs/ux/validation-and-error-states.md`
- `docs/ux/automatic-actions.md`
- `docs/ux/mvp-input-contract-v1.md`
- `docs/ux/stage-2-review-checklist.md`

Adapt to existing conventions.

## 12. Out of scope

Unless already implemented, do not build the production calculation engine, automatic load-diagram selection, production authentication, catalog CSV/Excel import, production database persistence, final Excel/PDF generation, prices/suppliers/ERP/offer comparison, automatic anchor load verification, or unapproved product compatibility logic. Prepare clean interfaces for future modules.

## 13. Verification

Use existing test tools and verify at minimum:

1. Project creation and navigation through all steps.
2. Adding a route with unique code, name, and description.
3. Duplicate route rejection.
4. Add/edit/reorder/remove straight sections and fittings.
5. Endpoint material behaviour.
6. Logical continuation adds no physical material.
7. Physical connection shows material/support effects.
8. T-connection accepts three endpoints.
9. Section length defaults to 6 m and can become 3 m per route.
10. WSTB defaults to 2 and is labelled as a design rule.
11. Anchor choices/overrides produce warnings.
12. Catalogued and free-text manual materials can be added.
13. BOM quantity/packaging concepts are visually distinct.
14. BOM rows expose sources, included items, and warnings.
15. BG/EN switching preserves user input.
16. Blocking validations prevent corresponding actions.
17. Production build succeeds.

Run applicable formatter, linter, type checker, tests, and build. Report commands as successful only if actually run. If browser/screenshot verification is available, inspect desktop screens and fix clipping, overlap, unreadable tables, broken dialogs, and spacing issues.

## 14. Definition of Done

Stage 2 is complete only when the wizard is clickable; all route, geometry, endpoint, connection, support, anchor, accessory, and BOM interactions are represented; required states are reviewable; BG/EN works; English export terminology is isolated; every field has a source, unit, default, and validation; every automation is documented and visible; documentation matches implementation; validations are documented/tested; the contract has an honest status; and lint, type checking, tests, and production build pass.

## 15. Final response

When finished, provide:

- concise implementation summary;
- main files/routes created or changed;
- how to start and review the prototype;
- commands executed and results;
- MVP contract status;
- remaining blockers or engineering decisions;
- confirmation that unrelated files were not modified.

Do not return only mockups or recommendations. Implement the working prototype and documentation in the repository.
