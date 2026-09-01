# Idempotency, concurrency, and transaction strategy

## Shared storage assumptions

PostgreSQL transactions use `READ COMMITTED` by default with explicit row locks and optimistic
predicates. This avoids holding a transaction across pure calculation or file rendering while still
making each business state change atomic. A later measurement may justify stronger isolation for a
specific use case; silent reliance on serializable behavior is forbidden.

Required unique constraints for the future persistence implementation:

- idempotency: `(scope, idempotency_key)`;
- project revision: `(project_id, revision_number)`;
- saved calculation fingerprint per revision: `(revision_id, input_fingerprint)`;
- catalog/rule snapshot identity: `(kind, version, content_hash)`;
- one active pointer per snapshot kind, enforced by the activation transaction;
- transient calculation cache: `(project_id, draft_version, input_fingerprint, engine_version)`.

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

The application locks the project row, checks `expectedDraftVersion` and
`expectedLatestRevisionNumber`, verifies that the successful transient result belongs to that exact
draft and fingerprint, and then atomically writes:

- the next explicit project revision;
- the immutable `CalculationResultV1` payload;
- immutable normalized input or its content-addressed snapshot reference;
- catalog and rule snapshot references;
- the revision-created audit event;
- the idempotency record.

Any failure rolls back all six writes. A unique conflict is re-read: a matching idempotency request
returns the existing revision; otherwise it maps to a stable conflict. There is no auto-save,
background revision creation, or persistent history for ordinary recalculation.

## Check and approve

Check locks one Calculated revision and transitions it to Checked with an immutable audit event and
idempotency record in one transaction.

Approve locks one Checked revision and verifies authorization, exact fingerprint, current status,
non-supersession policy, and approval readiness. It then commits the Approved transition, actor and
UTC metadata, audit event, and idempotency record atomically. The calculation result and snapshot
references are not rewritten.

The approval command carries `expectedStatus="checked"` and the fingerprint. These checks reject a
changed, stale, already superseded, archived, or otherwise invalid revision with
`CONFLICT_STALE_VERSION` or `INVALID_STATE_TRANSITION`. Replaying the same successful idempotency
key returns the approved revision. A different request under the same key conflicts.

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
- A process failure after commit is recovered by the idempotency lookup; a failure before commit
  has no durable business side effect.
- Audit write failure aborts its associated business mutation.
