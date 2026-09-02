# Stage 4 implementation notes

## Decisions

- The existing raw `pg` adapter and forward-only SQL migration runner remain the only persistence
  and migration technologies. No ORM or second validator was introduced.
- PostgreSQL UUID primary keys follow the Stage 1 database convention. Stage 3 API identifiers stay
  opaque strings; the persistence adapter validates UUID compatibility at the infrastructure edge.
- `numeric(24, 8)` stores deterministic quantities, dimensions, mass, factors, and percentages.
  `canonical_unit` contains exactly the Stage 3 units: `pcs`, `m`, `mm`, `kg`, `kgPerM`, and
  `packages`.
- A managed `rule_sets` entity supplies the rule snapshot identity implied by Stage 3. It binds
  compatibility rules, calculation rules, and assembly templates to a catalog version.
- Revision storage is hybrid: four schema-versioned JSONB documents preserve the validated input
  and fully resolved provenance, while BOM lines and warnings remain normalized for review/export.
- Connection participants are normalized. Composite foreign keys enforce project ownership, unique
  endpoint participation enforces linear-route cardinality, and deferred triggers validate complete
  start/end, two-way, tee, and custom structures at transaction commit.
- The existing database role `reviewer` maps to the Stage 3 Checker capability. Approval
  authorization is checked by `PgStage4Repository`; `approvals.actor_role` is only the historical
  role snapshot.

## Immutability trust boundary

Database triggers protect revision payloads, normalized BOM lines, revision warnings, and approval
events even from a migration-owner connection. The application role also lacks delete permission
on revisions and update/delete permission on BOM/approval rows. Only documented revision lifecycle
columns are mutable. `PgStage4Repository` exposes creation/read/lifecycle operations and no payload
update/delete method.

Catalog and rule rows remain manageable live data. Their later mutation or archival cannot change a
saved result because revision JSONB and normalized BOM values contain independent copies. The real
PostgreSQL acceptance test records their serialized values and checksums, changes/activates later
catalog and rule data, and compares the saved values byte-for-byte.

## Seed-data assumption

The repository contains no approved Niedax catalog facts. Every seeded product code, dimension,
package size, anchor value, source page, compatibility rule, and template is therefore prefixed or
labelled `SYN`/synthetic, `unverified`, and non-authoritative. The fixtures exercise the model only;
they must be replaced through a validated catalog import before engineering use.

Torque is not seeded because Stage 3 has no canonical torque unit. The typed attribute model can
store text or schema-versioned JSON without inventing a unit, but production torque data needs a
future domain-contract decision before import.

## Forward-only migration and reset

Migration history is checksum-protected and intentionally has no down migrations. Rollback in a
normal persistent environment means a forward corrective migration or verified backup restore.
`pnpm db:reset:test` operates only on a randomly named disposable Compose project, removes that
ephemeral database, rebuilds it from zero, seeds twice, and reruns the full constraint/immutability
suite. It never targets `data/postgres` or runs `docker compose down -v` on the normal project.

## Stage 8 forward extension

`20260902052553_stage8_users_roles_approval_revisions.sql` extends this model without rewriting an
applied migration or reinterpreting retained data. The later forward migration
`20260902070000_stage8_integrity_hardening.sql` strengthens snapshot-reference coupling and the
initial-Administrator bootstrap guard. The third forward migration,
`20260902073000_stage8_rejection_audit_hardening.sql`, adds bounded rejection evidence, retry
tombstone digests, current-actor locking, successful-lifecycle uniqueness, audited user/session
coupling, and tighter application ACLs without changing previously applied SQL. Existing
`revision-snapshot/v1` rows keep their nullable Stage 4 columns and adapter semantics. Their
project/idempotency uniqueness is retained by a v1-only partial index. Stage 8 revision commands
use the immutable, actor-qualified `idempotency_records(scope, idempotency_key)` record instead, so
the same opaque key in another actor, resource, operation, or contract-major scope does not
collide.

The `users.role` constraint now accepts exactly `designer`, `reviewer`, `administrator`, and
`viewer`; existing Administrator and Reviewer rows remain valid. V2 revision rows add the source
draft/run identity, immutable project and actor snapshots, catalog/rule snapshot references,
approval-readiness and warning summary, and separate project/input/snapshot/result/BOM/warning/full
revision checksums. The v2-only constraint cross-checks those identities against the exact saved
`CalculationInputV2` and `CalculationResultV2` payloads while leaving v1 rows untouched.

`revision_bom_lines_v2` stores every v2 quantity value as its canonical decimal string and stores
each quantity unit separately, including nullable package count value/unit pairs. It also preserves
line status, section detail, included items, source references, warning and trace identifiers,
provenance, and the exact line JSON. `revision_warnings_v2` likewise stores queryable warning fields
beside the exact warning JSON. Per-row constraints reconcile normalized fields to those JSON values;
a deferred commit-time trigger additionally reconciles row counts, array order, exact payloads, and
the three warning-summary counts to the authoritative result snapshot. Missing, reordered, partial,
or extra normalized evidence therefore aborts the revision transaction.

Revision save/check/approve evidence is append-only in `revision_lifecycle_events`. Deferred
triggers require the matching successful event in the same transaction as every v2 insert or status
transition, and v2 approval decisions are coupled to the approved status and matching lifecycle
event. Current enabled actor-role guards reject forged lifecycle and approval roles while stored
actor snapshots remain immutable if a live user later changes. `user_administration_audit_events`
records bounded create/role/enabled-state evidence with an enabled-Administrator insert guard. Its
actor and target identifiers intentionally remain plain UUID evidence rather than live-user foreign
keys so account retirement does not erase history or make test/operator cleanup impossible.

Expected stale/invalid Check or Approve decisions insert one rejected lifecycle row while the same
project/revision and attempt locks are held, and commit that row as the transaction's only durable
effect before returning the application error. `attempt_hash` deduplicates the actor/revision/key
attempt; `request_hash` distinguishes exact replay from `IDEMPOTENCY_KEY_CONFLICT`. Both values are
bounded SHA-256 digests, and no request body is stored. Revision/user authorization rejections and
visible-project Save authorization rejections are likewise bounded and append-only.

The application role has only `SELECT`/`INSERT` on v2 normalized evidence, lifecycle/admin audit,
approvals, and idempotency records, plus column-scoped revision lifecycle updates. For `users`, it
can update only role/enabled/audit-attribution columns; for `sessions`, only revocation and
last-seen columns. Role/status changes require a current enabled Administrator, matching deferred
audit evidence, and transactional session revocation; self-demotion/disable and removal of the last
enabled Administrator are rejected. Payload, child, approval, audit, and idempotency rows cannot be
updated, deleted, or truncated. The restore-time
privilege reconciliation and backup integration assertions mirror this policy. The disposable
`db:check` workflow runs the dedicated Stage 8 PostgreSQL acceptance program after the retained
foundation/Stage 4/Stage 5/Stage 7 checks in both fresh-database cycles.

The Stage 8 persistence acceptance also inserts and activates a later synthetic catalog/rule pair,
repins only the mutable project, and proves the previously saved revision still references and
serializes the original immutable snapshots.

## Follow-up boundary

Stage 4 adds the persistence adapter but deliberately does not add Stage 5 HTTP endpoints or
calculation formulas. The next application stage can wire `PgStage4Repository` into authenticated
use cases, add import workflows that populate these managed entities, and keep all calculation
logic inside `packages/calculation-engine`.
