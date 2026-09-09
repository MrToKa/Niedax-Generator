# Stage 10 regression review package

Status: **candidate coverage implemented; domain review pending**. No reviewer identity, approval
date, or approval is inferred from an automated test. Engine `0.1.0` and formula catalog `1.0.0`
are unchanged. No persisted revision is recalculated or rewritten. Baseline commit:
`52fac048aed95b982c39cec8d26e7f23b2795055`.

The [machine-readable manifest](stage10-regression-manifest.json) records every retained fixture
and expected-file SHA-256, catalog/rule pins, exact executable test names, scenario input hashes,
and source dependencies. Text hashes use UTF-8 with CRLF normalized to LF, explicitly identified as
`sha256-normalized-lf`; JSON semantic hashes use sorted object keys and unchanged array order.
Synthetic snapshot hash placeholders (`1` repeated 64 times for catalog, `2` for rules) are input
contract values, **not** integrity evidence. The manifest's actual SHA-256 values provide integrity.

## Independently specified focused cases

Executable inputs are in
[`stage10-scenarios.ts`](../../packages/calculation-engine/tests/helpers/stage10-scenarios.ts),
with shared fully resolved definitions in
[`stage10-fixtures.ts`](../../packages/calculation-engine/tests/helpers/stage10-fixtures.ts).
The [literal expected document](../../packages/calculation-engine/tests/fixtures/stage10-expected.json)
contains the complete BOM technical/ordered quantities and exact warning-code multiplicities for
13 focused inputs. Test expectations were entered from the formulas and source facts below; no
engine output generator wrote them. IDs T01–T12 are mapped in the manifest, with separate DAM and
DAZ variants under T09. These augment the seven retained golden pairs instead of replacing them.

Common input: synthetic catalog/rules `stage10-synthetic-v1`; explicit 6,000 mm supply selected;
each physical segment rounds independently; spacing 1.5 m; concrete mounting substrate; wall
template with two anchors per support; WSTB axis two per support; zero reserve unless stated;
package increments one piece except the documented product cases below; free unconnected ends
unless stated. The extra 3,000 mm supply is explicitly synthetic and never inferred from P0.
All `NX ...` product codes, allow-list relations, joint/port rules and assembly assumptions are
synthetic. Rules marked `catalogConfirmed` inside these engine fixtures model the resolved-rule
contract; they do not certify a real Niedax combination. The source files label their synthetic
origin. The matching historical synthetic fixture originally uses `verified-catalog.pdf`; this is
also synthetic test provenance, not an additional source document.

The literal Niedax product facts used below come from
[`products.csv`](../../catalogue/imports/niedax-p0-2022/products.csv), with source pages preserved
on the product snapshot. Compatibility and quantity assignments remain synthetic unless a
specific P0 rule is separately exercised through the application. In particular, the fixture's
`NX JOINT` is not an invented Niedax connector code. A separate T01 unresolved-mapping regression
omits connectors and blocks approval rather than substituting this synthetic rule into P0.

In this table, numbers are technical → ordered; piece units apply except straight and free-text
lengths. Each listed set is the entire focused BOM, also stored in the literal JSON document.

| Scenario | Complete expected BOM                                                                                                          | Independent derivation and evidence                                                                                                                                                                                                                                                                                                                                                                                               |
| -------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T01      | KL 60.203 102→102 m; NX JOINT 16→16; KLTB 6 68→100; DAM 6X5 136→150                                                            | One 100 m segment needs 17×6 m = 102 m; unused capacity 2 m; 16 internal joints. Ceiling(100/1.5)+1 = 68 supports, one fixing each; two anchors each. P0 KR 340: metre order unit and 6 m delivery; KR 355: KLTB 6 pack 50; page 156: DAM 6X5 pack 50. No WSTB axis in this case.                                                                                                                                                 |
| T02      | WSL 105.200 102→102 m; NX JOINT 16→16; NX SUPPORT 68→68; NX ANCHOR 136→136; WSTB 2 136→150                                     | Same 100 m geometry, 68 supports, 2×68 WSTB. P0 KR 426: 6 m/metre order; KR 449: WSTB 2 pack 50. Dedicated quantity remains `projectRule`, including its warning.                                                                                                                                                                                                                                                                 |
| T03      | NX STRAIGHT 18→18 m; NX JOINT 2→2; NX SUPPORT 11→11; NX ANCHOR 22→22; NX WSTB 22→22                                            | Separate 6 m and 8.5 m segments need 1+2 sections. A single straight run owns two joints. Supported length 14.5 m gives 11 supports. Adjacent boundary tests use 18 decimal places below/above both 3 m and 6 m.                                                                                                                                                                                                                  |
| T04      | NX STRAIGHT 12→12 m; NX JOINT 1→1; NX SUPPORT 9→9; NX ANCHOR 18→18; NX WSTB 18→18                                              | Two named 6 m routes, one logical shared continuation: ceiling(12/1.5)+1 = 9 supports and 2−1 = 1 joint. The connection emits no material. Separate 6 m routes remain 5+5 supports.                                                                                                                                                                                                                                               |
| T05      | NX STRAIGHT 12→12 m; NX CONNECTOR 2→2; NX SUPPORT 10→10; NX ANCHOR 20→20; NX WSTB 20→20                                        | Physical splice breaks straight/support groups; each one-section run has no internal joint. Exactly one synthetic physical event with two ports. Each ordered connector contains two fasteners informationally; no separate fastener line.                                                                                                                                                                                        |
| T06      | NX STRAIGHT 12→12 m; NX BEND 1→1; NX CONNECTOR 2→2; NX SUPPORT 8→8; NX ANCHOR 16→16; NX WSTB 16→16                             | 3.1 m and 2.9 m either side of a horizontal bend each need one 6 m section. Five base supports + one resolved fitting support + two explicit manual supports = eight. Original six and additional two are distinct trace inputs.                                                                                                                                                                                                  |
| T07      | NX STRAIGHT 18→18 m; NX CONNECTOR 3→3; NX SUPPORT 15→15; NX ANCHOR 30→30; NX WSTB 30→30                                        | Three named 6 m routes meet at a synthetic tee with three distinct endpoints and separate support groups: 3×5 supports. One event × three ports; six included fasteners remain informational. Duplicate participants are rejected; an unresolved port rule omits connectors and blocks approval.                                                                                                                                  |
| T08      | NX STRAIGHT 6→6 m; NX SUPPORT 5→5; NX ANCHOR 10→10; NX WSTB 10→10; NX END CAP 1→1                                              | One known synthetic cap rule contributes one cap. Equipment end has no proven material rule and contributes no material; its blocking warning is required. A connected equipment endpoint defers to the connection owner.                                                                                                                                                                                                         |
| T09 DAM  | NX STRAIGHT 6→6 m; NX SUPPORT 5→5; DAM 6X5 10→50; NX WSTB 10→10                                                                | Five supports × two exact DAM 6X5 anchors. P0 page 156 selects pack 50 through the documented conflict policy; this test does not choose the conflicting older observation of 100.                                                                                                                                                                                                                                                |
| T09 DAZ  | NX STRAIGHT 6→6 m; NX SUPPORT 5→5; DAZ 8X10 10→50; NX WSTB 10→10                                                               | Same geometry with the exact DAZ 8X10 size, pack 50 on page 156; no alias/substitution across DAM/DAZ.                                                                                                                                                                                                                                                                                                                            |
| T10      | NX STRAIGHT 6→6 m; NX SUPPORT 5→5; NSA 6X35/FKK-T30 V 10→100; NX WSTB 10→10                                                    | P0 page 157: exact NSA identity, pack 100, engineering review. Missing/unknown substrate, missing resolved compatibility or explicit denied compatibility omit NSA and block approval. The engine accepts resolved compatibility; it has no indoor/outdoor field. Indoor-only/concrete-only source and application policy are separately covered in the test plan; this engine test is not proof of automatic indoor suitability. |
| T11      | NX STRAIGHT 102→120 m; NX JOINT 16→17; NX SUPPORT 68→72; NX ANCHOR 136→143; NX WSTB 136→143                                    | 100 m, 5% reserve, synthetic 24 m package (four 6 m sections). Technical 17 sections/102 m; reserved 18 sections/108 m; reserve-only 6 m; five packages/120 m; packaging-only 12 m; total spare 18 m. Ordinary piece lines round their 5% reserve upward.                                                                                                                                                                         |
| T12      | NX STRAIGHT 6→12 m; NX SUPPORT 5→6; NX ANCHOR 10→11; NX WSTB 10→11; NX MANUAL CATALOG 3→10; free-text `stage10-manual` 2.5→3 m | Project reserve 5%. Catalog manual item disables reserve and packs by ten. Free text retains exact 2.5×1.05 = 2.625 m reserved, then rounds to 3 m. Editing to 3.5 m with packaging disabled yields 3.675 m and null package count; removal deletes only that manual identity.                                                                                                                                                    |

## Warnings, provenance and approval interpretation

The exact warning multiplicities are part of each expected JSON case. The common warnings are
`MISSING_CABLE_LOAD` and `ANCHOR_ENGINEERING_CHECK_REQUIRED` (engineering review, review required),
and `WSTB_PROJECT_RULE_UNCONFIRMED` when a WSTB product is selected. Physical groups retain one
WSTB warning per group: two in T05, three in T07. T06 adds `MANUAL_EXTRA_SUPPORT`. T08 adds
`UNRESOLVED_ENDPOINT_MATERIAL` with `blocksApproval`. T12 retains two occurrences each of
`MANUAL_PACKAGE_OVERRIDE` and `MANUAL_QUANTITY_OVERRIDE`, because the manual-input and manual-policy
subjects are distinct evidence. They must not be collapsed by code alone.

`approvalReady` is the accepted absence-of-blocking-warnings flag, not a structural approval or
waiver of review-required warnings. It is true for the resolved focused cases and false for T08
and the explicitly unresolved/denied variants. Anchor review remains visible in all resolved DAM,
DAZ and NSA results. No ETA capacity or anchor suitability is calculated.

Every BOM line's final trace must reference `BOM.FINALIZE.V1` and equal its ordered quantity.
Section, joint, connection, support, anchor, WSTB, manual, reserve and package trace formulas are
checked at their public result boundary. Manual reasons remain in the immutable input evidence;
trace steps carry the corresponding `manualOverride` reference plus original/additional values.
The engine trace schema does not duplicate arbitrary reason prose into formula steps.

## Retained baseline review

All seven Stage 6 input/expected pairs are unchanged. Their exact hashes and complete saved warnings,
quantities and traces are linked by the manifest. Existing tests compare the whole expected result,
replay each input five times and check unordered-array permutations. Stage 10 neither runs
`calculation:golden:update` nor changes the accepted export golden.

| Retained case                             | Quantity rationale to check against the existing expected file                                                                                                                                                                                                             |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| connected-routes-6m-support-continuation  | Four individually rounded physical segments give 24 m technical/30 m ordered at 10% reserve; 3 joints→4; shared support count 9→10; cap 1→2. The different 24 m straight quantity versus focused T04 follows its four-segment geometry, not a rule change.                 |
| per-segment-rounding-and-3m-6m-separation | Separate supply lines: 3 m choice 6→12 m and 6 m choice 12→18 m. Neither section choice merges into the other. Remaining axes retain the combined fixture's original policies.                                                                                             |
| fittings-joints-and-included-fasteners    | 24→30 m straight; one bend→two; two fitting connectors→four; two joints→four; ten supports→eleven; cap one→two. Fitting breaks joint topology and owns its two ports.                                                                                                      |
| assembly-anchors-wstb-and-manual-supports | Shared nine base supports plus one manual = ten→eleven. Fixed two plus two levels = four structure→five. Anchor override replaces two by three: 30→40. WSTB two each: 20→30. No connector inclusion capacity means four eligible fasteners→ten.                            |
| route-ends-and-manual-items               | Combined routes keep 24→30 m, support 11→13, anchor33→40, WSTB22→30. Catalog manual3→10 and free-text2→3 m keep independent policies; cap1→2.                                                                                                                              |
| unresolved-data-warning-matrix            | Only proven 3 m supply remains:6→12 m. Incompatible/missing mappings omit unsafe lines. Support mismatch splits the two groups and preserves11→13 supports; the one resolved WSTB axis is10→20. Complete blocking-warning identities remain in the retained expected JSON. |
| all-major-rules-combined                  | Four segments→24 m;10% reserve→30 m. Shared9+fitting1+manual1=11 supports→13. Structure4→5, anchor33→40, WSTB22→30, cap/accessory1→2 each. Two connectors supply four eligible fasteners informationally, so no fastener order line.                                       |

## Properties and benchmark reference control

The five public-engine properties generate actual different geometries, explicit 3/6 m choices,
reserve percentages, package increments/enabled state, pcs/m/kg manual quantities, shared/physical
topology, spacing, template fixed/per-level quantities, anchor axes, and custom WSTB quantities.
Seeds are `10020260`–`10020264`; run counts are 80, 80, 80, 60 and 50 (350 total). Fast-check's
verbose failure reporting includes the seed, shrink path and smallest counterexample. References
use independent BigInt arithmetic in the test tree. The replay property additionally requires more
than 40 distinct actual input bodies among 50 examples, so a diagnostic-only random variable cannot
satisfy it. Geometry and participant order are not permuted.

Dedicated tests distinguish rejected zero length/spacing/package/manual/custom-WSTB quantities
from accepted zero reserve, zero cable load and zero manual support additions. Decimal aliases,
negative values, invalid units, precision/scale overflow, 18-place boundary neighbors and exact
quantities beyond JavaScript integer precision are checked. Template manual values are used once;
an absent parameter is omitted with a blocking warning. Identically named manual rows retain their
separate units and identities.

Pure and API benchmark references are deliberately separate. Both use 10 routes/100 straight
segments or 100/1,000, one bend and one manual row per route, and shared logical connections.
The pure fixture has resolved fitting ports and one extra support per bend (411/4,101 supports).
The existing application deliberately retains unresolved fitting mappings: the API fixture keeps
401/4,001 supports, omits fitting materials, preserves the blocking warnings, and retains literal
anchor 802→810 / 8,002→8,010 and joint 89→90 / 899→900 values. Both sets have independently pinned
correctness assertions inside the engine test tree; API latency evidence must not be described as
an approved complete fitting-material order. See [performance evidence](stage10-performance.md).

## Change control and review record

No accepted expected fixture changed. New expectations at existing semantics require domain review
before promotion. New formula semantics require a new rule version; changed product facts require
a new catalog/correction version with audit evidence. A proven implementation defect needs its own
failing regression, minimal fix, engine-version decision and persisted-result policy. Historical
revisions remain immutable. Normal tests/CI are read-only with respect to expectations.

Initial candidate tests incorrectly assumed all review-required warnings imply `approvalReady=false`,
that manual catalog rows have free-text `kind=manual`, and that reason prose is embedded inside a
formula trace. Inspection of the accepted schemas and Stage 6/8 policy corrected those test
assumptions, without changing an existing expected result. Initial generated zero manual quantity
and zero custom-WSTB counterexamples correctly failed the positive input schemas (seeds `10020261`,
path `37:0:0:0`, `[0,"pcs",0,1,false]`; and `10020263`, path `10:0:0`, `[1,1,1,0]`). Generators now
stay in the valid domain and focused invalid-input cases preserve both rejected zeros explicitly.
These were candidate test defects, not changes to business rules.

| Review field                         | Value                                                                                                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Candidate change                     | Added coverage and independent expected references; unchanged engine/catalog semantics, with LAN UUID and manual-catalog persistence defects corrected |
| Exact review identity                | `stage10-regression-manifest.json`, including each input/result/source SHA-256                                                                         |
| Technical run evidence               | See `stage10-evidence.md`; focused engine command and counts recorded there                                                                            |
| Reviewer name / role                 | Pending                                                                                                                                                |
| Review date                          | Pending                                                                                                                                                |
| Decision / reason                    | Pending                                                                                                                                                |
| Approved scenario hashes             | Pending                                                                                                                                                |
| Proposed benchmark budgets           | Pending domain/engineering owner acceptance                                                                                                            |
| Follow-up for unresolved P0 mappings | Keep omission/approval-blocking behavior until source-backed versioned rules are approved                                                              |

## T13–T15 persistence, role and downloaded-workbook review

T13 uses the production PostgreSQL repositories, synthetic `acceptance-v2` catalog/rule fixture,
later draft/calculation and a separately imported active version. Expected invariant: the earlier
revision's project/input/product/rule/result/BOM/warning/trace snapshots, independent checksums and
downloaded workbook bytes are exactly unchanged. The later draft acknowledges explicit new pins;
activation never rewrites saved evidence. S10-DB07/S10-DB10 and the retained export acceptance test
assert this in both fresh cycles. Their exact fixture/assertion file hashes are in the manifest.

T14's expected capability matrix is: Designer mutates/exports owned projects, cannot approve or read
foreign projects; Reviewer can read all, Check/Approve eligible latest revisions, and edit owned
drafts; Administrator can administer users/catalogs and mutate permitted all-project resources;
Viewer can read history and existing exports but cannot mutate or create exports. Revoked sessions
lose access, current authorization is rechecked on replay/cache/download, and lifecycle/audit writes
remain atomic. Both credentialed application tests and the exact browser scenarios bind this matrix
to synthetic accounts without publishing their credentials.

T15 retains `stage9-exceljs-2`, mapping `change-order-clients-scope-26-1` and the approved workbook
SHA-256 `351b6dcf642ffebf53b6c5c7e57898ae8d4a7f1839183bbdc1eac66085ddc337`.
The golden contains twelve saved BOM rows. Its first row is24m technical,6m reserve,30m reserved,
6m increment,5packages,0m pack overage,30m ordered and6m total spare. The connector's corresponding
values are2/1/3/2/2/1/4/2. Actual downloaded rows copy B technical, G increment, I package count,
C ordered and D total spare from the selected saved revision. P/Q stay empty; three exact English
sheets, literal codes and every warning/trace occurrence are preserved. The manifest also hashes
independent quantities and OOXML checker sources; ordinary tests cannot replace these baselines.

The new manual-catalog persistence correction changes a database constraint to accept the identity
the published engine contract already emits. Engine/rule versions remain unchanged; no persisted
results are recomputed and no old fixture quantity is rewritten. New browser/persistence cases
require domain review of that retained identity and their exact hashes, alongside T01–T12 and the
proposed performance budgets. Native Excel observation remains separately attributed to Stage9.
