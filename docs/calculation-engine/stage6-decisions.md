# Stage 6 calculation-engine decisions

This log records the implementation decisions that turn the retained Stage 3 contract boundary
into a calculation engine. Evidence and final validation results are recorded separately in
`stage6-evidence.md`.

## S6-001 — Exact arithmetic

- Status: accepted
- Context: formulas, comparisons, percentages, and ceiling operations must not use binary floating
  point.
- Decision: use a small internal BigInt-backed rational value with canonical decimal parsing, a
  30-digit input precision limit, an 18-digit scale limit, exact unit conversion, and explicit
  upward rounding.
- Alternatives: JavaScript `number` was rejected as inexact; a runtime decimal dependency was
  rejected because the required operations are small and auditable.
- Consequence: public data stays canonical decimal strings; BigInt never crosses the JSON boundary.
- Evidence: ADR 0008 and Stage 6 decimal policy.
- Affected code/tests: `arithmetic/decimal.ts`, arithmetic and property tests.

## S6-002 — Contract gap and v2

- Status: accepted
- Context: v1 contains product IDs without quantified included-item relations, no supply-option
  provenance, simplified template components, ambiguous packaging fields, and no machine trace or
  structured warning severity.
- Decision: preserve `CalculationInputV1` and `CalculationResultV1` unchanged and introduce
  `CalculationInputV2`, `CalculationResultV2`, and `CalculationTraceV1`. The public dispatcher keeps
  the honest v1 contract-only behavior and executes formulas only for v2.
- Alternatives: extending v1 was rejected because formerly invalid payloads would become valid and
  retained result field meanings would change.
- Consequence: saved v1 fixtures continue to parse byte-for-byte while application integration can
  migrate deliberately to v2.
- Evidence: Stage 3 schemas and Stage 6 gap list.
- Affected code/tests: domain v2 schemas, retained-v1 tests, engine dispatcher.

## S6-003 — Straight BOM unit and supply options

- Status: accepted
- Context: the official P0 straight products are ordered in metres with 6000 mm package/delivery
  increments; a source note mentions 3000 mm availability without a separate code.
- Decision: straight BOM quantity uses the snapshot product's actual order unit. A 3 m or 6 m
  choice is an explicit `SupplyOption` on that exact product, with its own rule/source evidence; no
  code is generated. Missing options are warned/omitted or fail by policy.
- Alternatives: treating every straight as pieces and inventing a separate 3 m code were rejected.
- Consequence: one code may explicitly expose two lengths, while absent 3 m data never implies it.
- Evidence: Stage 5 catalog notes and Stage 6 section semantics.
- Affected code/tests: v2 product schema, section and package rules.

## S6-004 — Per-segment calculation and aggregation

- Status: accepted
- Context: pooling lengths before ceiling under-orders independent physical segments.
- Decision: ceiling happens for every straight segment before demand aggregation. The aggregation
  key includes product, supply option, order unit, reserve, packaging, provenance/status, and
  override boundary.
- Alternatives: route-total and project-total ceiling were rejected because they erase cut/waste
  boundaries.
- Consequence: 3.1 m plus 2.9 m selected as 6 m produces two sections and 3 m/6 m never merge.
- Evidence: approved `SECTION.REQUIRED_PER_SEGMENT.V1` semantics.
- Affected code/tests: `rules/sections.ts`, aggregation, per-segment golden/property tests.

## S6-005 — Reserve and package semantics

- Status: accepted
- Context: v1 fields did not distinguish reserve overage from delivery/package overage.
- Decision: technical deliverable demand is calculated first, reserve second, and package rounding
  last. Reserve-only and package-only deltas are separate result fields. Straight reserve rounds
  section count, count reserve rounds pieces, and continuous manual quantities remain exact.
- Alternatives: one combined spare field and package-before-reserve were rejected as ambiguous.
- Consequence: every line reconciles technical → reserved → ordered without hiding either delta.
- Evidence: approved reserve and packaging formulas.
- Affected code/tests: `rules/policies.ts`, result/trace builders, arithmetic/property/golden tests.

## S6-006 — Physical event ownership

- Status: accepted
- Context: endpoints, connections, and fittings can describe the same physical boundary.
- Decision: fittings own fitting-port assemblies, physical connections own their connection event,
  and endpoints defer to a connection whenever `connectionId` is present. Deterministic source IDs
  prevent duplicate event creation.
- Alternatives: independent emission followed by product-code de-duplication was rejected because
  equal codes do not prove equal physical events.
- Consequence: logical continuations add no material and endpoint/connection material is never
  counted twice.
- Evidence: Stage 3 endpoint/connection semantics and Stage 6 ownership requirements.
- Affected code/tests: `rules/materials.ts`, straight-run topology, fittings/endpoint golden tests.

## S6-007 — Logical support groups and mismatches

- Status: accepted
- Context: route-by-route support counts over-count a physically continuous shared run.
- Decision: compatible logical continuations with no physical break and shared support behavior are
  unioned and calculated once. The configured mismatch policy either rejects or splits the routes
  and emits `SUPPORT_CONFIGURATION_MISMATCH` at engineering-review severity.
- Alternatives: first-route-wins and silent split were rejected because both hide engineering facts.
- Consequence: two 6 m routes at 1.5 m yield 9 supports when compatible and 10 when separated.
- Evidence: approved support formula and Stage 4 connection behavior.
- Affected code/tests: `topology/support-groups.ts`, support rules, edge/property/golden tests.

## S6-008 — Template scope

- Status: accepted
- Context: Stage 5 retains fixed/per-support/per-level/manual component semantics.
- Decision: `fixed` applies once per logical support group, `perSupport` uses the final group count,
  `perLevel` applies once per group times explicit `levelCount`, and `manual` uses the component's
  explicit route/group parameter. Missing values remain unresolved. Dedicated support, anchor, and
  WSTB axes own those roles so template rows cannot double count them.
- Alternatives: multiplying all components by supports and defaulting missing levels to one were
  rejected.
- Consequence: template scope is explicit and unresolved parameters cannot silently change demand.
- Evidence: Stage 5 template-component contract and approved assembly formula.
- Affected code/tests: v2 template schema, `rules/supports.ts`, assembly golden tests.

## S6-009 — Anchor and WSTB ownership

- Status: accepted
- Context: selected anchor identity and WSTB quantity each have a dedicated user/rule axis that can
  overlap template components.
- Decision: the selected anchor product uses the template anchor quantity per support axis; a
  manual override replaces that value before multiplication. WSTB uses its dedicated one/two/custom
  rule, defaults through the explicit input to two, remains `projectRule`, and wins over a template
  WSTB component while conflicts remain visible.
- Alternatives: adding template plus dedicated quantities and inferring anchor suitability were
  rejected.
- Consequence: each semantic role has one owner; manual/engineering status stays visible.
- Evidence: Stage 2 automatic actions, Stage 5 templates, and Stage 6 anchor/WSTB rules.
- Affected code/tests: support/anchor/WSTB rules and assembly/edge golden tests.

## S6-010 — Unresolved data

- Status: accepted
- Context: some missing engineering facts block only one material while others make the whole order
  unsafe.
- Decision: `warnAndOmit` calculates unaffected demand and omits only unsafe material; `fail`
  throws a stable semantic engine error. Engineering-review facts remain warnings and never become
  implicit approval.
- Alternatives: guessing a likely catalog product and failing every warning were rejected.
- Consequence: partial results remain deterministic and honestly expose approval impact.
- Evidence: Stage 3 material resolution and Stage 6 error behavior.
- Affected code/tests: compatibility/warning rules, unresolved matrix, fail-policy edge test.

## S6-011 — Deterministic identity and JSON

- Status: accepted
- Context: result IDs and bytes must not depend on insertion order, platform state, clock, or random
  generation.
- Decision: engine-owned IDs use FNV-1a 64-bit over UTF-8-independent JavaScript code units of a
  length-prefixed semantic key. Semantically unordered inputs are sorted by stable IDs, result
  arrays use documented ordinals, and canonical JSON recursively sorts object keys.
- Alternatives: UUID/random and clock identity were rejected; Node crypto was rejected to preserve
  the runtime-independent package boundary.
- Consequence: IDs are deterministic trace identifiers, not cryptographic integrity hashes.
- Evidence: Stage 3 canonicalization policy and Stage 6 stable-JSON requirements.
- Affected code/tests: `stable/ids.ts`, `stable/canonical-json.ts`, golden replay/permutation tests.
