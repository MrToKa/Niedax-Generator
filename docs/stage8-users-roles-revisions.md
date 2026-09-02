# Stage 8 users, roles, approval, and revisions

Stage 8 adds the production role model, capability/resource authorization, explicit immutable v2
revisions, review transitions, and append-only evidence. It does not add product facts or formulas;
Save revision copies one already-successful persisted `CalculationInputV2`/`CalculationResultV2`
run without invoking the calculation engine.

## Roles and resource scope

Persisted and public role identifiers are lowercase and exact: `designer`, `reviewer`,
`administrator`, and `viewer`. The UI translates `viewer` as **View only**.

| Action                           | Designer | Reviewer            | Administrator       | View only          |
| -------------------------------- | -------- | ------------------- | ------------------- | ------------------ |
| Sign in and read identity        | Yes      | Yes                 | Yes                 | Yes                |
| List/read projects and revisions | Owned    | All                 | All                 | All, non-sensitive |
| Create project                   | Yes      | Yes                 | Yes                 | No                 |
| Edit/autosave draft              | Owned    | Owned               | Any                 | No                 |
| Validate/calculate               | Owned    | Owned               | Any                 | No                 |
| Save named revision              | Owned    | Owned               | Any                 | No                 |
| Check calculated revision        | No       | Any latest revision | Any latest revision | No                 |
| Approve checked revision         | No       | Any latest revision | Any latest revision | No                 |
| Administer users/roles/status    | No       | No                  | Yes                 | No                 |
| Administer catalog lifecycle     | No       | No                  | Yes                 | No                 |
| Read revision audit              | Owned    | All                 | All                 | All, non-sensitive |

Reviewer and Viewer all-project read scope is an explicit local-MVP choice because no project
assignment model exists. It grants no cross-owner draft mutation: a Reviewer may edit, calculate,
or save only an owned project, while a Viewer cannot mutate any project. Hidden controls are only a
presentation aid; services authorize capabilities before mutations and PostgreSQL queries enforce
the resource scope again. Hidden resources use the existing `404 RESOURCE_NOT_FOUND`
non-disclosure policy.

The canonical capability map lives in `apps/backend/src/authorization-policy.ts`. Session identity
responses include only the safe user identity, current role, and derived capabilities. Each request
resolves the current database user, so disabling a user invalidates sessions and a role change
cannot retain an old higher privilege. The final enabled Administrator cannot be disabled or
demoted.

## HTTP contracts

The API remains same-origin under `/api/v1`; the access/revision JSON payloads have explicit v2
schema literals and the paginated project list has the explicit `project-list-response/v3`
literal. All mutations require the session cookie, matching Origin, `X-Niedax-CSRF: 1`, and a
bounded correlation ID; Save, Check, and Approve additionally require an `Idempotency-Key`.

| Operation           | Route                                              | Contract                             |
| ------------------- | -------------------------------------------------- | ------------------------------------ |
| Current identity    | `GET /api/v1/auth/me`                              | `authenticated-identity-response/v2` |
| List/create users   | `GET/POST /api/v1/admin/users`                     | strict admin-user v2 contracts       |
| Change role/status  | `PATCH /api/v1/admin/users/{id}/role` or `/status` | strict admin-user v2 contracts       |
| List projects       | `GET /api/v1/projects`                             | `project-list-response/v3`           |
| Project access      | `GET /api/v1/projects/{projectId}/access`          | `project-access-response/v2`         |
| List/save revisions | `GET/POST /api/v1/projects/{projectId}/revisions`  | revision list/save v2                |
| Revision detail     | `GET /api/v1/revisions/{revisionId}`               | revision response v2                 |
| Check revision      | `POST /api/v1/revisions/{revisionId}/check`        | check request v2                     |
| Approve revision    | `POST /api/v1/revisions/{revisionId}/approve`      | approve request v2                   |
| Revision audit      | `GET /api/v1/projects/{projectId}/revision-audit`  | revision audit list v2               |

Project, revision, user, and audit lists accept only `limit=1..100` and an optional UUID cursor.
The project list uses ascending project-UUID `id` keyset order and returns the final emitted ID as
`nextCursor`, or `null` after the last page. Unknown query or body fields are rejected. Revision
envelopes stay v2 while each revision record identifies its own reader as `revision/v2` or retained
`revision/v1`.

## Exact revision save

Save revision serializes on the owning project row and an actor-scoped idempotency lock. In one
short transaction it:

1. rechecks capability, ownership, project draft version, and latest revision number;
2. loads the requested successful current calculation run;
3. matches project, draft version, run ID, fingerprint, engine version, and the ID/version/hash of
   both catalog and rule snapshots across the database row, input, result, and project pins;
4. allocates the next project-scoped positive revision number;
5. copies the exact project, v2 input, products, compatibility sources, rules, templates,
   components, result, trace, BOM, warnings, provenance, safe actor snapshot, and snapshot
   references;
6. computes deterministic SHA-256 checksums for project, input, source snapshots, result, BOM,
   warnings, and the complete revision evidence;
7. writes lossless v2 BOM/warning projections, the `revision.saved` event, and the replayable
   response before commit.

The normalized v2 BOM projection preserves every decimal string and unit independently, nullable
package count, status, section detail, included items, source references, warning and trace IDs,
provenance, and the complete line JSON. Deferred constraints reconcile every ordinal and count with
the authoritative saved result, so missing, extra, or changed projection rows cannot commit.

Autosave, validation, and Calculate never invoke this transaction. Calculate continues to replace
the single transient result for the project.

## Check and approval

Only Reviewer and Administrator have `revision:check` and `revision:approve`. Check permits only
the latest non-archived `calculated -> checked` transition. Approve permits only the latest
non-archived `checked -> approved` transition, and additionally requires the saved
`approvalReady=true` plus zero saved `blocksApproval` warnings. Both operations lock the project
and exact revision, compare expected status/latest number/fingerprint, and atomically write the
timestamp, immutable actor evidence, lifecycle event, and replay response. Approval also appends an
immutable approval decision.

Same scope/key/request replay returns the original status and body after restart. Reusing a key in
that scope with different canonical input returns `409 IDEMPOTENCY_KEY_CONFLICT`. An expected
stale/invalid Check or Approve attempt commits exactly one bounded rejected lifecycle tombstone as
the sole durable side effect while the project/revision and attempt locks are still held, then
returns its stable error. A same-request retry keeps that original rejection even if the revision
later advances; a different request under the same attempt identity conflicts. Authorization
rejections are also recorded without changing revision state: revision-targeted attempts use the
revision audit, while a visible-project Save rejection uses project audit. Audit failure aborts any
associated business mutation.

## Retained v1 and immutable storage

The Stage 4 `revision-snapshot/v1`, `CalculationInputV1`, `CalculationResultV1`, and v1 command
schemas are unchanged. A separate retained reader lists and displays those rows without inventing a
v2 author, run, readiness, catalog, or rule field. Retained v1 lifecycle actions are always disabled
with `unsupportedVersion`. Because legacy descriptions were not bounded, the reader safely limits
the displayed comment to 10,000 characters and sets `commentTruncated=true` when it did so. Projects
that have no Stage 7 draft document open a history-only view instead of attempting to reinterpret
their old draft.

The three forward-only migrations are
`20260902052553_stage8_users_roles_approval_revisions.sql`,
`20260902070000_stage8_integrity_hardening.sql`, and
`20260902073000_stage8_rejection_audit_hardening.sql`. Together they expand the role constraint, add
v2 revision metadata/checksums and lossless BOM/warning projections, couple successful lifecycle
and approval evidence at commit, add bounded rejection tombstones, and enforce append-only audit
storage. The integrity migration binds saved catalog/rule reference versions and hashes, result
engine version, and result snapshot identities to immutable revision columns, and restricts
actorless account creation to the first Administrator bootstrap. The rejection hardening migration
adds SHA-256 attempt/request digests, current-enabled-actor locks, successful-action uniqueness,
audited user role/status constraints, transactional session revocation, and column-scoped
application ACLs for `users` and `sessions`. Saved revision payload, children, approvals,
idempotency evidence, and audit evidence cannot be updated or deleted by the application role.
Backup/restore and privilege reconciliation include every new protected table.

## Frontend behavior

The frontend calls only relative `/api/v1` URLs. It derives available controls from the safe server
identity and project-access response, while treating `403` as authoritative. The editor disables
autosave, validation, calculation, and mutation reconciliation in read-only sessions. The revision
workspace provides a named-save form, newest-first history, immutable detail from saved snapshots,
warning/readiness explanations, confirmation dialogs, and check/approve actions. Selecting history
does not overwrite the mutable draft. Status, errors, roles, and workflow text are available in BG
and EN, with keyboard focus, dialog focus restoration, live status announcements, and narrow-width
layout support.

## Verification scope

Automated coverage includes strict role/contracts, the full capability/resource matrix, live
session role/status behavior, last-Administrator protection, catalog service authorization,
bounded rejection evidence, exact persisted application flow, idempotent/stale transitions,
PostgreSQL concurrency and immutability, backup reconciliation, and frontend
state/API/localization logic. T13 replaces the mutable project's pins with a later synthetic
catalog/rule pair and proves the saved revision still has the original IDs and bytes. T14 exercises
real authenticated Designer, Reviewer, Administrator, and Viewer sessions plus rejection, lifecycle,
and cross-owner boundaries in a disposable database. `pnpm db:check` runs both acceptance programs
in both fresh-migration cycles. The normal persistent-stack authentication smoke is intentionally
read-only; credentialed role mutations stay in the disposable integration environment so immutable
audit history in `data/postgres` is never test cleanup.

Exports, an archive mutation workflow, project assignment/sharing, catalog/rule authoring, and
ERP/pricing remain deferred to their planned later stages. Rejected authorization and transition
evidence is implemented in Stage 8.
