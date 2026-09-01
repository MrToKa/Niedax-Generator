# Stage 7 web application

## Scope and route structure

Stage 7 replaces the in-memory UX prototype on the production route with an authenticated,
PostgreSQL-backed application:

- `/` lists the projects visible to the current user;
- `/projects/new` creates a Bulgarian-first project draft;
- `/projects/[projectId]` edits, validates, calculates, and displays the current transient result;
- `/admin` remains the existing administration area.

The production flow is split into route components, shared application chrome, project/editor
sections, a single API client, pure editor/catalog/autosave transitions, and result view models. The
retained Stage 2 prototype and fixtures are not imported by a production route.

## Contract decision

The HTTP major remains `/api/v1`, while the newly implemented project operations carry strict v2
payload literals. This resolves the previously documented integration gap without changing retained
`CalculationInputV1`, `CalculationResultV1`, or saved v1 revision data. Version literals live in
`packages/domain/src/schemas/versions.ts`; request and response schemas live in the shared domain
package and reject unknown keys.

The draft contract is deliberately less strict than `CalculationInputV2`: it can persist unresolved
catalog selections and nullable support choices. Authoritative validation must resolve those facts
before calculation. Actor identity, source evidence, rule references, catalog snapshots, and
approval facts never come from the browser.

Two v2-only corrections were required by verified persisted data:

- snapshot/rule versions accept a bounded persisted version slug such as `2022-p0`;
- `CalculationResultV2` emits `calculation-trace/v2`, whose rule references accept that bounded
  persisted version identifier. Retained `calculation-trace/v1` remains SemVer-only and is not
  widened; the result reader still accepts a previously persisted nested v1 trace;
- a non-orderable included product may have no package increment, while every orderable product
  still requires a positive increment in its order unit.

The calculation engine formulas are unchanged. Its packaging policy now reports a semantic input
error instead of dereferencing missing packaging data if such a product ever becomes an orderable
demand.

## HTTP operations

All routes require the existing session cookie. Browser mutations additionally require a valid
same-origin request, `X-Niedax-CSRF: 1`, and, where shown below, an `Idempotency-Key`.

| Operation                | Route                                           | Payload                                                              |
| ------------------------ | ----------------------------------------------- | -------------------------------------------------------------------- |
| List accessible projects | `GET /api/v1/projects`                          | `ProjectListResponseV2`                                              |
| Create draft             | `POST /api/v1/projects`                         | `CreateProjectDraftRequestV2` → `ProjectDraftResponseV2`             |
| Hydrate draft            | `GET /api/v1/projects/:projectId`               | `ProjectDraftResponseV2`                                             |
| Replace complete graph   | `PUT /api/v1/projects/:projectId/draft`         | `ReplaceProjectDraftRequestV2` → `ProjectDraftResponseV2`            |
| Validate saved draft     | `POST /api/v1/projects/:projectId/validation`   | `ValidateProjectDraftRequestV2` → `ProjectValidationResponseV2`      |
| Calculate saved draft    | `POST /api/v1/projects/:projectId/calculations` | `CalculateProjectDraftRequestV2` → `CalculateProjectDraftResponseV2` |
| Load transient result    | `GET /api/v1/projects/:projectId/calculation`   | `CurrentCalculationResponseV2`                                       |
| Load editor choices      | `GET /api/v1/catalog/editor-context`            | `EditorCatalogResponseV2`                                            |

Create, replace, and calculate are idempotent. The public error shape remains
`ErrorEnvelopeV1Schema`; unexpected exception text and stack traces are not returned.

## Application and persistence flow

Fastify handlers perform transport validation and map the authenticated actor and trusted headers.
The project application service owns authorization-aware orchestration and canonical hashing. The
PostgreSQL adapter owns transactions, graph projection, optimistic concurrency, idempotency replay,
and transient result storage.

A Stage 7 draft is stored as a strict, schema-versioned JSONB document and as a relational
projection into the existing project, route, geometry, endpoint, connection, support, and manual
item tables. Creation and replacement write the document, graph, project version, append-only audit
event, and replayable idempotency response in one transaction. The complete document is the
authoritative representation for fields that the earlier Stage 4 projection cannot losslessly hold.

Calculation reads one saved draft version and its pinned active catalog/rule pair, resolves only
explicit product, inclusion, compatibility, supply, rule, and template evidence, builds and
runtime-validates `CalculationInputV2`, computes its canonical SHA-256 fingerprint, and invokes
`calculateV2` outside a long database transaction. A short transaction then rechecks the draft and
snapshot versions and replaces only `calculation_drafts` plus its warnings and audit/idempotency
metadata. Calculation does not mutate the project record. Autosave, validation, and calculation do
not insert or mutate a revision.

Active calculation rules are read from the pinned rule set. An internal-joint rule is mapped only
when its stored parameter schema is exactly `calculation-rule/internal-joint/v2` and its straight,
joint, supply-option, quantity, unit, and source references validate; no connector or quantity is
inferred from a product name. If such a product fact is absent, the accepted Stage 6
`warnAndOmit` policy returns and persists the unaffected BOM as `completeWithWarnings`, omits the
unsafe material, retains `UNRESOLVED_JOINT_PRODUCT` with `blocksApproval`, and leaves
`approvalReady=false`. It blocks approval, not inspection of the honest transient result.

An authorized optimistic draft replacement atomically rebases the mutable draft to the currently
active catalog/rule pair. This prevents a catalog activation from stranding an open editor while
keeping the change explicit in the project audit metadata. Validation and calculation never
silently rebase: they use the pair pinned by the acknowledged save and fail closed if that evidence
is no longer active. Every project hydration/save response carries that pinned catalog/rule pair.
The editor compares it with the active editor context after load and every acknowledged save; a
mismatch remains visibly pending and forces a versioned replacement even when the draft content is
otherwise unchanged. The refreshed context clears invalid dependent selections with a visible
review notice and never replaces them with a different product. A snapshot-missing calculation
response schedules the same recoverable rebase flow before a later retry.

WSTB behavior (one, two, or explicit custom quantity) remains a project choice. A WSTB product is
required and selectable only when the exact selected active assembly template contains a WSTB
component; a template without one keeps the product null. The application does not borrow a WSTB
product from another system or infer cross-system compatibility.

## Autosave and stale results

The editor keeps stable UUIDs and a complete local graph. A debounced save is sent only after the
local draft satisfies the persistence schema. A content signature chooses a new idempotency key for
new content; an explicit retry reuses the key for the same logical request. Generation checks and
abort handling suppress stale responses.

The acknowledged `draftVersion` is the optimistic-concurrency token. A stale server version enters
an explicit conflict state and is never overwritten automatically. Invalid local input remains in
the form and does not replace the last valid server draft. Calculate is tied to the latest
successfully acknowledged draft. Any later edit marks the displayed calculation stale.

## Ownership policy before Stage 8

New projects are owned by the authenticated creator. A Reviewer can list, read, replace, validate,
calculate, and retrieve only their own projects. An Administrator may access all projects under the
existing administrative policy. Owner identity is displayed read-only. This is the narrow Stage 7
mapping; it does not add Designer/Viewer roles, checking, approval, or capability redesign.

Authorized projects retained from before Stage 7 are listed as `retainedReadOnly`; they are not
silently hidden or fabricated into a v2 draft. Their editor action explains that no lossless Stage 7
document exists. Direct draft access returns `UNSUPPORTED_SCHEMA_VERSION`.

## User-facing errors and accessibility

Loading, empty, authentication, forbidden, validation, autosave, conflict, calculation, and
recoverable failure states are distinct. Correlation IDs are shown for support on bounded server
errors. Bulgarian is initially selected; switching UI resources does not translate or mutate
project data, identifiers, exact decimal strings, product descriptions, or result provenance.

Controls use labels and accessible names, asynchronous state is announced through live regions,
keyboard focus remains visible, reduced-motion preferences are respected, and wide result tables
remain usable inside bounded overflow containers at narrow widths.

## Deferred work

Stage 7 intentionally does not create immutable revisions or implement check/approval workflows and
new roles (Stage 8), export artifacts (Stage 9), or the complete Playwright regression program
(Stage 10). It also does not add prices, structural/anchor-capacity approval, cutting optimization,
new product formulas, external services, or telemetry.

## Verification evidence

Focused contract, frontend-state, backend HTTP/service, calculation-engine, and PostgreSQL checks
cover strict payload parsing, graph integrity, catalog invalidation, autosave transitions,
ownership, CSRF, idempotency replay/conflict, stale versions, calculation errors, result provenance,
and unchanged revision counts. `corepack pnpm db:check` also runs a real
`PgProjectRepository` + `ProjectApplicationService` + `calculateV2` acceptance scenario twice from
an empty disposable PostgreSQL database. It creates an incomplete project, replaces it with two
configured routes joined by a logical continuation and a tracked manual item, reloads the exact
draft, validates and calculates a schema-valid partial result, parses the persisted v2 input/result,
replays the calculation idempotently, and proves the revision count is unchanged. The exact final
commands and observed outcomes are recorded in the Stage 7 handoff.

On 2026-09-01, the production image was also exercised with controlled Chrome through Caddy at
`http://localhost:8080`; no direct frontend or backend port was published. The run covered the
signed-out state and authenticated administrator session, empty and populated project lists,
project creation, two configured three-metre routes, their logical continuation with shared
supports, exact catalog-backed support products, Manual item add/edit/delete and final catalog
Manual input, autosave, hard-reload hydration, validation, calculation, persisted results, included
items, warnings, and an expanded “Why?” trace. Changing an upstream system visibly cleared every
invalid dependent choice without selecting a substitute. A two-tab edit produced the visible
stale-version conflict and the reconcile action loaded the newer server draft; a temporary backend
outage produced a recoverable autosave failure, retained the local edit, and saved it through the
Retry action after service recovery. All probe text was then removed.

The same run verified keyboard step activation and tab order, a visible three-pixel focus outline,
BG→EN→BG state preservation, distinct accessible combobox names for Material and Finish in both
languages, language-reactive live calculation announcements, and a 390 × 844 viewport with no
page-level horizontal overflow. The wide BOM remained keyboard-visible inside its bounded
horizontal scroll container. The final browser draft was version 26 with four BOM rows and the
tracked `DAM 6X5` Manual row. A read-only database check returned project/document/calculation
versions `26/26/26`, one replaceable calculation draft, and zero immutable revisions.
