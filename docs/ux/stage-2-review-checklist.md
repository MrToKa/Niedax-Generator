# Stage 2 MVP field review checklist

Review date: 2026-08-16  
Prototype version: `stage-2-ux-1.0.0`  
Contract result: **MVP Input Contract v1 — Proposed**

## Repository and architecture

- [x] Read root `AGENTS.md`, Stage 1 architecture, conventions, README, frontend scaffold, package
      scripts, versions, tests, and Next.js version-local guidance.
- [x] Preserved Next.js App Router, TypeScript, relative `/api/v1` boundary, backend/database roles,
      Docker networks, Caddy-only publishing, secrets, migrations, and version manifests.
- [x] Added no cloud service, external runtime asset, telemetry, database change, production auth
      behavior, catalogue import, or production calculation dependency.
- [x] Isolated deterministic UX fixture logic from the production calculation engine.
- [x] Confirmed no separate approved Stage 1 functional specification exists; recorded `OPEN-10`.

## Wizard and actions

- [x] All six named steps are clickable and preserve local state.
- [x] Project identity, defaults, status, explicit revision context, and BG/EN behavior are visible.
- [x] System fixture selectors preserve valid dependent choices, clear invalid choices visibly, and
      never silently substitute a product.
- [x] Route list shows code/name/description, system and geometry summaries, status, warning count,
      open/duplicate/remove actions, and stable IDs.
- [x] Connected-route removal requires confirmation.
- [x] Straight sections and fittings support add/edit/reorder/duplicate/remove actions.
- [x] Route section length defaults to 6 m and can switch to 3 m without automatic mixing.
- [x] Six endpoint types preview material effects before confirmation.
- [x] Logical continuation adds no physical material.
- [x] Physical endpoint/connection types remain unresolved without confirmed rules and offer manual
      catalogue/free-text resolution.
- [x] Connection editor covers continuation, splice, horizontal/vertical bend, T, transition, and
      custom; exact endpoint cardinality and self-connection rules are enforced.
- [x] Shared/separate supports, supports before/after, connector correction, manual product,
      quantity, reason, and note are represented.
- [x] Support spacing/type/template, connection support behavior, manual additions, anchor fields,
      substrate, override, WSTB, and section length show sources.
- [x] WSTB defaults to 2/support and is labelled an unconfirmed design rule.
- [x] Anchor suitability and overrides produce engineering/manual warnings.
- [x] Cable load has no invented selection algorithm; its missing severity is recorded as open.
- [x] Catalogue and free-text manual materials include quantity, unit, reason, note, reserve,
      package rounding/size, and manual-adjustment state.
- [x] Detailed BOM separates technical quantity, unit, package size/count, order quantity, spare,
      included items, source/version, status, warnings, override, and Why trace.

## Field reconciliation

- [x] Every implemented domain/input/output field appears in `data-dictionary.md`.
- [x] Every field records source, type/control, requiredness, normalized unit, default (including
      intentional null), validation/dependency, visibility/effect, persistence/revision intent, BOM
      impact, warnings, and decision reference.
- [x] Stable IDs are separated from user-facing codes/names.
- [x] Speculative product identifiers and catalogue compatibility values were removed.
- [x] Exact product codes are unresolved instead of invented.
- [x] Support count remains a labelled fixture value, not a derived engineering formula.
- [x] English export terminology is stored separately from BG/EN UI resources.

## Automatic actions and validation

- [x] Every automatic action in the interaction model has trigger, preconditions, inputs, result,
      material effect, source, reversibility, explanation, and fallback.
- [x] Endpoint materials, dependent selects, continuation, templates, anchor quantities, included
      accessories, reserve, packaging, and WSTB are explicitly covered.
- [x] No automatic action silently creates or substitutes a product.
- [x] Field errors are inline; cross-route/catalogue/engineering state uses summary notices.
- [x] Information, warning, blocking error, engineering review, and manual states use icons/text in
      addition to color.
- [x] Blocking project/system/route/geometry errors disable the corresponding next/add/save action.
- [x] Pure interaction contract tests cover unique codes, dependencies, endpoint effects,
      continuation, T cardinality, self-connections, geometry reorder/length, 6 m/WSTB defaults,
      reserve order, manual packaging, manual indicators, and localized explanations.

## Localization and review states

- [x] Bulgarian is default; English is complete for rendered prototype resources.
- [x] User data, product codes, stable IDs, and export English are not translated.
- [x] Switching BG/EN preserves entered data and wizard step.
- [x] Normal selector exposes empty, valid, required/invalid, duplicate, incompatible,
      disconnected, unresolved endpoint, missing load, anchor, manual override, catalogue version,
      loading, no-results, and approved read-only states.

## Verification record

- [x] Frontend type check executed during implementation.
- [x] Stage 2 unit tests executed with the repository test runner.
- [ ] Integrated in-app browser screenshots/click QA — browser runtime reported no connected
      browser in this session; no substitute browser surface was used.
- [x] Final `pnpm validate` completed successfully: formatting, lint, type checking, 22 unit tests,
      and the production build passed.

## Freeze decision

The contract is **Proposed**. `OPEN-01` through `OPEN-10` in the contract and UX decision log affect
stored data, readiness, catalogue/material resolution, calculation, or approval. Marking the
contract Frozen before those decisions exist would invent Stage 1 and engineering rules.
