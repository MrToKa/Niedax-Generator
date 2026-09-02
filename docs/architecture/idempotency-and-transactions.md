# Idempotency, concurrency, and transaction strategy

## Shared storage assumptions

PostgreSQL transactions use `READ COMMITTED` by default with explicit row locks and optimistic
predicates. This avoids holding a transaction across pure calculation or file rendering while still
making each business state change atomic. A later measurement may justify stronger isolation for a
specific use case; silent reliance on serializable behavior is forbidden.

The implemented persistence constraints include:

- idempotency: `(scope, idempotency_key)`; Stage 8 revision scopes include operation, resource, and
  authenticated actor ID so actors and operations do not alias each other's retries;
- project revision: `(project_id, revision_number)`;
- saved calculation fingerprint per revision: `(revision_id, input_fingerprint)`;
- catalog/rule snapshot identity: `(kind, version, content_hash)`;
- one active pointer per snapshot kind, enforced by the activation transaction;
- transient calculation cache: `(project_id, draft_version, input_fingerprint, engine_version)`.

Retained v1 revision commands keep their original project/key uniqueness through a v1-only partial
index. V2 revision commands use the actor-, resource-, and operation-qualified scope above. The
same opaque key text in the v1 and v2 contract namespaces therefore does not alias; this preserves
v1 replay semantics without weakening v2 actor or action isolation.

An idempotency record stores the canonical request hash, resulting resource ID, and response status.
Same scope/key plus the same request hash returns the prior representation. Same scope/key plus a
different request hash returns `IDEMPOTENCY_KEY_CONFLICT`. Records are written in the same
transaction as their durable side effect.

Stage 7 also stores the strict response schema version and response JSON for newly implemented
project mutations. This permits an exact status/body replay after a process restart; a resource ID
alone is insufficient because the project may have advanced since the original response.

## Stage 7 draft replacement

Project creation and complete-graph replacement lock an idempotency scope and then commit the
project row, authoritative versioned draft document, relational graph projection, incremented
`draft_version`, append-only audit event, and replayable response together. A stale expected version
or any child-graph/constraint failure rolls back the whole change. Validation is read-only and does
not receive an idempotency key.

## Calculate

1. Validate the implemented Stage 7 v2 command (or a retained v1 command for future compatibility)
   and authorize `calculation:execute`.
2. Read the exact project draft version and resolve immutable catalog/rule snapshots, products, and
   assemblies in a consistent read.
3. Canonicalize the fully resolved calculation input and derive SHA-256 using the documented engine
   version prefix.
4. Return a matching succeeded transient run if one exists.
5. Execute the pure engine outside a database transaction.
6. In a short transaction, verify the draft version is still current, then save/replace the
   transient result, calculation audit metadata, and idempotency record.

The Stage 7 transaction additionally records the exact calculated draft version and the replayable
v2 response. Its integration assertion verifies that the revision count is unchanged before and
after autosave, validation, and calculation.

A successful `warnAndOmit` result is stored with its exact warnings. Material carrying
`blocksApproval` is omitted from demand rather than guessed; the transient result remains
inspectable and replayable while approval readiness remains false.

A transient run is cacheable and replaceable. It is not revision history. A stale draft at step 6
returns `CONFLICT_STALE_VERSION`; the computed value may be discarded. Retrying cannot create a
permanent revision.

## Save revision

The Stage 8 application authorizes `revision:save` for the project resource before opening the
repository mutation. The repository locks the project row and actor-scoped idempotency key, checks
`expectedDraftVersion` and `expectedLatestRevisionNumber`, and verifies that the requested
successful transient v2 run belongs to that exact project/draft. Its run ID, input fingerprint,
engine version, and catalog/rule ID/version/hash must agree across the database record, validated
input, result, and project pins. It then atomically writes:

- the next explicit project revision;
- self-contained immutable v2 project, input/result, catalog/product/source,
  rule/template/component, BOM, warning, provenance, and safe actor snapshots;
- independent deterministic checksums plus lossless normalized v2 BOM/warning projections;
- catalog and rule snapshot identity;
- the `revision.saved` lifecycle event;
- the replayable response and idempotency record.

Deferred database checks reconcile the child ordinals/content with the exact result and require
matching lifecycle evidence before commit. Any failure rolls back every write. A matching scoped
idempotency request returns its original status/body after restart; different canonical input maps
to a stable conflict. There is no auto-save, background revision creation, or persistent history
for ordinary recalculation, and Save never invokes the calculation engine.

## Check and approve

Check authorizes only Reviewer/Administrator, locks the owning project and exact latest non-archived
Calculated revision, compares expected latest number/status/fingerprint, and transitions it to
Checked with an immutable actor snapshot, lifecycle event, and idempotency response in one
transaction.

Approve applies the same lock and concurrency proof to one Checked revision and also requires its
saved `approvalReady=true` and zero saved `blocksApproval` warnings. It commits the Approved
transition, immutable approval decision, actor snapshot and UTC metadata, lifecycle event, and
idempotency response atomically. The revision name, author, calculation result, BOM, warnings,
checksums, and snapshot references are never rewritten.

The approval command carries `expectedStatus="checked"` and the fingerprint. These checks reject a
changed, stale, already superseded, archived, or otherwise invalid revision with
`CONFLICT_STALE_VERSION` or `INVALID_STATE_TRANSITION`. Replaying the same successful idempotency
key returns the approved revision. A different request under the same key conflicts.

Expected stale/invalid Check and Approve attempts use a failed-attempt tombstone rather than a
rollback-only result. While holding the project/revision and attempt locks, the repository inserts
one bounded rejected lifecycle event and commits it as the transaction's sole durable side effect;
only then does the service return the mapped error. Its SHA-256 `attempt_hash` binds operation,
revision, actor, and idempotency key, while `request_hash` binds the canonical request. A later exact
retry returns the original rejection even if lifecycle state has advanced; a different request for
the same attempt returns `IDEMPOTENCY_KEY_CONFLICT`. Capability denials are also audited without a
protected business mutation, and a duplicate audit insert is harmless under the unique attempt
index.

## Activation and export

Catalog/rule activation locks the active-pointer row, verifies the expected prior snapshot and a
successful staged validation, then atomically updates the pointer and writes audit/idempotency.
Snapshot contents are immutable, so old calculations do not change.

Export request creation verifies the immutable revision/fingerprint in a short transaction and
stores an export job plus idempotency record. Rendering and filesystem I/O happen outside the
transaction. Completion updates only the export artifact record; it never updates the revision or
recomputes quantities.

## Retry and failure policy

- Retry automatically only serialization/deadlock/transient connection failures, with bounded
  attempts and jitter in infrastructure.
- Never retry validation, authorization, stale version, idempotency conflict, or invalid transition
  errors automatically.
- Pure calculation may be retried because its input is complete and deterministic.
- A process failure after a successful commit is recovered by the idempotency lookup; a failure
  before commit has no durable business-state side effect. An expected rejected lifecycle command
  intentionally commits only its append-only tombstone so a retry cannot become a different
  outcome after concurrent state advancement.
- Audit write failure aborts its associated business mutation.
