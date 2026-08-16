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

## Follow-up boundary

Stage 4 adds the persistence adapter but deliberately does not add Stage 5 HTTP endpoints or
calculation formulas. The next application stage can wire `PgStage4Repository` into authenticated
use cases, add import workflows that populate these managed entities, and keep all calculation
logic inside `packages/calculation-engine`.
