# Stage 2 UX prototype contract

Status: **Implemented prototype / contract proposed**  
Version: `stage-2-ux-1.0.0`  
Reviewed source: `Niedax_Stage_2_UX_Prototype_Codex_Prompt.md`  
Prototype route: `/`

## Outcome

The root Next.js route is a desktop-first, clickable Bulgarian/English wizard with local in-memory
state. It covers Project, System, Geometry, Supports, Load & Accessories, and Results. Fixture
catalogue values, UX-only calculations, design assumptions, manual changes, and engineering-review
items are visibly distinguished. The frontend does not receive credentials and does not implement
database persistence, catalogue import, production calculations, or export generation.

The existing Stage 1 authentication foundation remains in the repository and backend. Stage 2 does
not alter its API, authorization, database, networking, migration, or secret boundaries.

## Stage 1 comparison and precedence

No approved Stage 1 functional specification or field-level product specification exists in the
repository. The only Stage 1 material found is the local modular infrastructure foundation, whose
README explicitly defers catalogue, route, support, anchor, BOM, and export behavior. Therefore:

- the fixed functional decisions in the Stage 2 brief are treated as authoritative;
- no production catalogue code, engineering formula, compatibility rule, load limit, or anchor
  capacity is inferred;
- `series F`, `E3`, `S`, and `E5` choices are explicitly labelled fixture data;
- unresolved decisions affecting persistence or calculation keep the input contract at
  **Proposed**, not Frozen;
- values described as calculated are isolated UX mock results and are never engineering approval.

This is a gap, not a silent conflict: Stage 1 defines architecture and security, while the absent
functional specification prevents final field freeze.

## Wizard interaction map

| Step               | Primary user actions                                                                                               | Automatic or dependent behavior                                                                                                       | Visible checks                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Project            | Enter code, name, description, reserve; inspect status/revision; switch BG/EN                                      | Language changes copy only and preserves data/step                                                                                    | Required code/name; reserve `0..100%`; read-only approved state                                   |
| System             | Select fixture series, dimensions, finish, and variant; apply to active route                                      | Valid dependent choices persist; invalid choices clear with an explanation; no substitution                                           | Missing dependent value blocks next step; empty E5 variant fixture exposes catalogue gap          |
| Geometry           | Add/open/duplicate/remove routes; add/edit/reorder/duplicate/remove straight sections and fittings; edit endpoints | New routes get stable IDs and 6 m default; connected removal requires confirmation; endpoint effect previews before confirmation      | Duplicate code, length `<= 0`, empty geometry, endpoint material review, stable reference display |
| Connections        | Choose 2 endpoints, or 3 for T; set material and support behavior; add corrections/products/reason/note            | Logical continuation defaults to no physical material; other connection types surface unresolved product behavior                     | Exact participant count; no reused endpoint; no self-connection; reason required to save          |
| Supports           | Set spacing/type/template, shared/separate behavior, additions, anchors, substrate, WSTB, and route section length | Template proposes 2/4 anchors; manual override replaces it; route remains exclusively 3 m or 6 m                                      | Anchor review, unsupported/unknown substrate, manual override, WSTB design assumption             |
| Load & Accessories | Enter cable load, choose fixture accessories, add catalogue/free-text manual rows, control reserve and packaging   | Row reserve and package rounding are explicit; unresolved included fasteners are not duplicated                                       | Missing load open decision; catalogue code required for catalogue manual row; positive quantities |
| Results            | Inspect summary and detailed BOM; expand “Why?” rows                                                               | UX mock BOM derives linear-section count, applies reserve, and rounds deliverable sections; manual row packaging remains row-specific | Product code gaps, version/source, included items, statuses, warnings, manual indicator           |

## Review-state gallery

The persistent “Review state” selector exposes normal and non-happy-path states without a hidden
debug route. Selecting a state moves to the most relevant wizard step without changing entered
domain data.

| State                            | Severity           | Representative rendering                                           |
| -------------------------------- | ------------------ | ------------------------------------------------------------------ |
| Valid populated                  | Information        | Normal fixture project and all wizard interactions                 |
| Initial / empty                  | Information        | Empty guidance and blocked continuation                            |
| Required / invalid number        | Blocking error     | Empty project code and reserve outside range                       |
| Duplicate route code             | Blocking error     | Inline duplicate code and blocked continuation                     |
| Unavailable variant              | Warning + block    | Fixture E5 has no resolved variant; no fallback is selected        |
| Incomplete geometry / connection | Blocking error     | Zero-length straight item and connection guidance                  |
| Unresolved endpoint material     | Engineering review | Endpoint preview and manual catalogue/free-text resolution actions |
| Missing cable load               | Open warning       | Missing Stage 1 severity decision is stated explicitly             |
| Anchor review                    | Engineering review | Model/size/substrate suitability warning                           |
| Manual quantity override         | Warning            | Manual checkbox and persistent BOM override indicator              |
| Catalogue version warning        | Warning            | Fixture result version requires reconciliation                     |
| Loading                          | Information        | Labelled skeleton and live loading message                         |
| No results                       | Information        | Empty result guidance                                              |
| Approved read-only               | Information        | Disabled editing and explicit-revision guidance                    |

Notices always include a text severity, title, explanation, and resolution. Color is supplemental.

## Localization contract

- Bulgarian is the initial language.
- `prototype-i18n.ts` contains stable UI keys for Bulgarian and English.
- Labels, controls, options, buttons, validations, warning banners, empty states, and BOM
  explanations use those resources.
- User-entered content and controlled identifiers are preserved and never translated.
- `export-terminology.ts` is a separate English-only resource for future export field/category and
  item descriptions.
- Switching language does not rebuild prototype state or change the active step.

## Prototype calculation boundary

`prototype-logic.ts` contains deterministic UI fixture logic. It has no I/O and does not import the
production calculation engine. It may later be replaced by a typed adapter to
`packages/calculation-engine`. Current support count (`12`) is deliberately a labelled fixture value,
not a spacing formula. No load-selection, load-capacity, anchor-capacity, compatibility, or physical
material rule is claimed.

## Decision log

| ID   | Decision / assumption                                                                | Rationale and consequence                                                                |
| ---- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| D-01 | Bulgarian is the default language                                                    | Fixed Stage 2 decision; data and wizard position survive switching                       |
| D-02 | Root route hosts the prototype                                                       | Smallest change to the existing Next.js scaffold; no new service or public port          |
| D-03 | Fixture catalogue contains only selection shape, not product codes                   | Makes dependent behavior reviewable without inventing Niedax product identifiers         |
| D-04 | Unresolved product code is rendered as “Unresolved”                                  | Prevents fixture values from being mistaken for orderable products                       |
| D-05 | Missing load is non-blocking but marks review in this prototype                      | Stage 1 severity is missing; final decision remains blocker `OPEN-01`                    |
| D-06 | Mock support count is a fixed fixture, not `length / spacing`                        | Avoids inventing an engineering support-spacing formula                                  |
| D-07 | Existing explicit revisions only; approved state is read-only                        | Matches fixed revision and approval decisions                                            |
| D-08 | A route-connected removal deletes prototype connection references after confirmation | Keeps local state referentially valid; production deletion policy remains open           |
| D-09 | Catalogue/manual endpoint resolution routes to the manual-material form              | Represents both required resolution paths without pretending a compatible product exists |
| D-10 | English BOM item/category descriptions stay English                                  | Preserves the future export terminology boundary while UI chrome remains localized       |

## Open engineering and product decisions

1. `OPEN-01`: whether missing cable load blocks calculation or is only a warning.
2. `OPEN-02`: approved product/system/dimension/finish/variant catalogue, stable IDs, product codes,
   included items, package sizes, and compatibility rules.
3. `OPEN-03`: confirmed endpoint and connection material rules, including mounting plates,
   connectors, and non-included fasteners.
4. `OPEN-04`: support count/spacing engineering rules and rules around fittings/connections.
5. `OPEN-05`: exact mounting templates and their anchor quantities.
6. `OPEN-06`: exact Niedax anchor models/sizes and suitability rules by substrate/load.
7. `OPEN-07`: confirmation or replacement of the default WSTB rule (`2/support`).
8. `OPEN-08`: production reserve precision, package-size source, rounding policy, and units per
   product family.
9. `OPEN-09`: persisted project status/revision workflow and approval transition rules beyond the
   existing Administrator/Reviewer roles.
10. `OPEN-10`: authoritative Stage 1 field list and decision references needed for final freeze.

## Explicitly excluded future scope

Production calculation formulas, automatic load-diagram selection, real catalogue import,
production persistence, final Excel/PDF output, prices/suppliers/ERP comparisons, automatic anchor
verification, new authentication behavior, cloud services, telemetry, and external runtime assets.
