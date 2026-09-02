-- Bounded rejection evidence and current-actor enforcement for Stage 8 audit events.

ALTER TABLE revision_lifecycle_events
  ADD COLUMN attempt_hash varchar(71) NULL CHECK (
    attempt_hash IS NULL OR attempt_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  ADD COLUMN request_hash varchar(71) NULL CHECK (
    request_hash IS NULL OR request_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  ADD CONSTRAINT revision_lifecycle_events_rejection_shape CHECK (
    outcome <> 'rejected'
    OR (
      action IN ('revision.authorization_rejected', 'revision.transition_rejected')
      AND actor_id IS NOT NULL
      AND actor_role IS NOT NULL
      AND actor_snapshot <> '{}'::jsonb
      AND resulting_status IS NULL
      AND reason_code IS NOT NULL
      AND attempt_hash IS NOT NULL
      AND request_hash IS NOT NULL
      AND metadata->>'requestedAction' IN ('revision.checked', 'revision.approved')
    )
  ) NOT VALID,
  ADD CONSTRAINT revision_lifecycle_events_metadata_bounded CHECK (
    octet_length(metadata::text) <= 4096
    AND octet_length(actor_snapshot::text) <= 2048
  ) NOT VALID;

ALTER TABLE revision_lifecycle_events
  VALIDATE CONSTRAINT revision_lifecycle_events_rejection_shape;
ALTER TABLE revision_lifecycle_events
  VALIDATE CONSTRAINT revision_lifecycle_events_metadata_bounded;

CREATE UNIQUE INDEX revision_lifecycle_one_successful_action_idx
  ON revision_lifecycle_events (revision_id, action)
  WHERE outcome = 'succeeded';

CREATE UNIQUE INDEX revision_lifecycle_one_rejection_per_attempt_idx
  ON revision_lifecycle_events (revision_id, actor_id, attempt_hash)
  WHERE outcome = 'rejected';

CREATE OR REPLACE FUNCTION guard_revision_lifecycle_actor() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  current_actor_role varchar(32);
  current_actor_enabled boolean;
BEGIN
  IF NEW.actor_id IS NULL THEN
    RAISE EXCEPTION 'revision lifecycle evidence requires an authenticated actor'
      USING ERRCODE = '42501';
  END IF;

  SELECT role, enabled
    INTO current_actor_role, current_actor_enabled
    FROM users
   WHERE id = NEW.actor_id
     FOR SHARE;

  IF current_actor_role IS NULL
     OR current_actor_enabled IS NOT TRUE
     OR NEW.actor_role IS DISTINCT FROM current_actor_role
     OR NEW.actor_snapshot->>'id' IS DISTINCT FROM NEW.actor_id::text
     OR NEW.actor_snapshot->>'role' IS DISTINCT FROM NEW.actor_role THEN
    RAISE EXCEPTION 'revision lifecycle actor is not current and enabled'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.outcome = 'rejected' THEN
    RETURN NEW;
  END IF;

  IF NEW.action = 'revision.saved'
     AND current_actor_role NOT IN ('designer', 'reviewer', 'administrator') THEN
    RAISE EXCEPTION 'revision save requires a mutable-project role'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.action IN ('revision.checked', 'revision.approved', 'revision.archived')
     AND current_actor_role NOT IN ('reviewer', 'administrator') THEN
    RAISE EXCEPTION 'revision review transition requires Reviewer or Administrator'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$$;

ALTER TABLE user_administration_audit_events
  ALTER COLUMN target_user_id DROP NOT NULL,
  ADD CONSTRAINT user_administration_audit_target_required CHECK (
    target_user_id IS NOT NULL
    OR (
      outcome = 'rejected'
      AND action = 'user.authorization_rejected'
      AND metadata->>'requestedAction' = 'user.create'
    )
  ) NOT VALID,
  ADD CONSTRAINT user_administration_audit_rejection_shape CHECK (
    outcome <> 'rejected'
    OR (
      action = 'user.authorization_rejected'
      AND actor_id IS NOT NULL
      AND actor_role IS NOT NULL
      AND actor_snapshot <> '{}'::jsonb
      AND reason_code IS NOT NULL
      AND prior_role IS NULL
      AND resulting_role IS NULL
      AND prior_enabled IS NULL
      AND resulting_enabled IS NULL
      AND target_user_snapshot = '{}'::jsonb
      AND metadata->>'requestedAction' IN ('user.create', 'user.role', 'user.status')
    )
  ) NOT VALID,
  ADD CONSTRAINT user_administration_audit_metadata_bounded CHECK (
    octet_length(metadata::text) <= 4096
    AND octet_length(actor_snapshot::text) <= 2048
    AND octet_length(target_user_snapshot::text) <= 2048
  ) NOT VALID;

ALTER TABLE user_administration_audit_events
  VALIDATE CONSTRAINT user_administration_audit_target_required;
ALTER TABLE user_administration_audit_events
  VALIDATE CONSTRAINT user_administration_audit_rejection_shape;
ALTER TABLE user_administration_audit_events
  VALIDATE CONSTRAINT user_administration_audit_metadata_bounded;

CREATE OR REPLACE FUNCTION guard_user_administration_audit_actor() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  current_actor_role varchar(32);
  current_actor_enabled boolean;
  bootstrap_target_matches boolean;
  administrator_count integer;
BEGIN
  IF NEW.actor_id IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('users.initial-administrator', 0));
    SELECT EXISTS (
             SELECT 1
               FROM users target
              WHERE target.id = NEW.target_user_id
                AND target.role = 'administrator'
                AND target.enabled = true
                AND target.created_by IS NULL
           ),
           (SELECT count(*)::integer FROM users WHERE role = 'administrator')
      INTO bootstrap_target_matches, administrator_count;
    IF NEW.outcome = 'succeeded'
       AND NEW.action = 'user.created'
       AND NEW.actor_snapshot = '{}'::jsonb
       AND NEW.resulting_role = 'administrator'
       AND NEW.resulting_enabled IS TRUE
       AND NEW.target_user_snapshot->>'id' = NEW.target_user_id::text
       AND NEW.target_user_snapshot->>'role' = 'administrator'
       AND NEW.target_user_snapshot->>'enabled' = 'true'
       AND bootstrap_target_matches
       AND administrator_count = 1 THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'successful user creation without an actor is limited to initial bootstrap'
      USING ERRCODE = '42501';
  END IF;

  SELECT role, enabled
    INTO current_actor_role, current_actor_enabled
    FROM users
   WHERE id = NEW.actor_id
     FOR SHARE;

  IF current_actor_role IS NULL
     OR current_actor_enabled IS NOT TRUE
     OR NEW.actor_role IS DISTINCT FROM current_actor_role
     OR NEW.actor_snapshot->>'id' IS DISTINCT FROM NEW.actor_id::text
     OR NEW.actor_snapshot->>'role' IS DISTINCT FROM NEW.actor_role THEN
    RAISE EXCEPTION 'user administration actor snapshot is inconsistent'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.outcome = 'rejected' THEN
    RETURN NEW;
  END IF;

  IF current_actor_role <> 'administrator' THEN
    RAISE EXCEPTION 'successful user administration requires an enabled Administrator'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$$;

ALTER TABLE project_audit_events
  DROP CONSTRAINT project_audit_events_action_check,
  ADD COLUMN actor_role varchar(32) NULL CHECK (
    actor_role IS NULL OR actor_role IN ('designer', 'reviewer', 'administrator', 'viewer')
  ),
  ADD COLUMN actor_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (
    jsonb_typeof(actor_snapshot) = 'object'
  ),
  ADD COLUMN outcome varchar(16) NOT NULL DEFAULT 'succeeded' CHECK (
    outcome IN ('succeeded', 'rejected')
  ),
  ADD COLUMN reason_code varchar(128) NULL,
  ADD CONSTRAINT project_audit_events_action_check CHECK (action IN (
    'project.created', 'project.draft_replaced', 'project.calculated',
    'revision.save_authorization_rejected'
  )),
  ADD CONSTRAINT project_audit_events_rejection_shape CHECK (
    (
      action = 'revision.save_authorization_rejected'
      AND outcome = 'rejected'
      AND actor_id IS NOT NULL
      AND actor_role IS NOT NULL
      AND actor_snapshot <> '{}'::jsonb
      AND reason_code = 'FORBIDDEN'
      AND metadata->>'requestedAction' = 'revision.saved'
    )
    OR (
      action <> 'revision.save_authorization_rejected'
      AND outcome = 'succeeded'
      AND reason_code IS NULL
    )
  ) NOT VALID,
  ADD CONSTRAINT project_audit_events_stage8_metadata_bounded CHECK (
    octet_length(metadata::text) <= 4096
    AND octet_length(actor_snapshot::text) <= 2048
  ) NOT VALID;

ALTER TABLE project_audit_events
  VALIDATE CONSTRAINT project_audit_events_rejection_shape;
ALTER TABLE project_audit_events
  VALIDATE CONSTRAINT project_audit_events_stage8_metadata_bounded;

CREATE FUNCTION guard_project_rejection_audit_actor() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  current_actor_role varchar(32);
  current_actor_enabled boolean;
BEGIN
  IF NEW.action <> 'revision.save_authorization_rejected' THEN
    RETURN NEW;
  END IF;

  SELECT role, enabled
    INTO current_actor_role, current_actor_enabled
    FROM users
   WHERE id = NEW.actor_id
     FOR SHARE;

  IF current_actor_role IS NULL
     OR current_actor_enabled IS NOT TRUE
     OR NEW.actor_role IS DISTINCT FROM current_actor_role
     OR NEW.actor_snapshot->>'id' IS DISTINCT FROM NEW.actor_id::text
     OR NEW.actor_snapshot->>'role' IS DISTINCT FROM NEW.actor_role THEN
    RAISE EXCEPTION 'project rejection audit actor is not current and enabled'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER project_audit_events_guard_rejection_actor
BEFORE INSERT ON project_audit_events
FOR EACH ROW EXECUTE FUNCTION guard_project_rejection_audit_actor();

CREATE OR REPLACE FUNCTION guard_revision_approval() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  current_actor_role varchar(32);
  current_actor_enabled boolean;
  current_revision_status varchar(16);
  current_snapshot_schema_version varchar(64);
  current_approval_ready boolean;
BEGIN
  SELECT role, enabled
    INTO current_actor_role, current_actor_enabled
    FROM users
   WHERE id = NEW.actor_id
     FOR SHARE;

  IF current_actor_role IS NOT NULL AND (
    current_actor_enabled IS NOT TRUE
    OR current_actor_role NOT IN ('reviewer', 'administrator')
    OR NEW.actor_role IS DISTINCT FROM current_actor_role
  ) THEN
    RAISE EXCEPTION 'revision approval requires an enabled Reviewer or Administrator'
      USING ERRCODE = '42501';
  END IF;

  SELECT status, snapshot_schema_version, approval_ready
    INTO current_revision_status, current_snapshot_schema_version, current_approval_ready
    FROM revisions
   WHERE id = NEW.revision_id;

  IF current_snapshot_schema_version = 'revision-snapshot/v2'
     AND (
       NEW.actor_snapshot->>'id' IS DISTINCT FROM NEW.actor_id::text
       OR NEW.actor_snapshot->>'role' IS DISTINCT FROM NEW.actor_role
     ) THEN
    RAISE EXCEPTION 'revision approval actor snapshot is inconsistent'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.decision = 'approved' AND current_revision_status IS NOT NULL
     AND current_revision_status <> 'checked' THEN
    RAISE EXCEPTION 'only a checked saved revision can be approved'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.decision = 'approved'
     AND current_snapshot_schema_version = 'revision-snapshot/v2' THEN
    IF current_approval_ready IS NOT TRUE THEN
      RAISE EXCEPTION 'saved revision is not approval ready'
        USING ERRCODE = '23514';
    END IF;
    IF EXISTS (
      SELECT 1
        FROM revision_warnings_v2 warning
       WHERE warning.revision_id = NEW.revision_id
         AND warning.approval_impact = 'blocksApproval'
    ) THEN
      RAISE EXCEPTION 'saved revision has an approval-blocking warning'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

CREATE FUNCTION guard_user_role_status_update() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  current_actor_role varchar(32);
  current_actor_enabled boolean;
  another_enabled_administrator boolean;
BEGIN
  IF NEW.role IS NOT DISTINCT FROM OLD.role
     AND NEW.enabled IS NOT DISTINCT FROM OLD.enabled THEN
    IF NEW.updated_at IS DISTINCT FROM OLD.updated_at
       OR NEW.updated_by IS DISTINCT FROM OLD.updated_by THEN
      RAISE EXCEPTION 'user security audit metadata requires a role or enabled-state change'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role
     AND NEW.enabled IS DISTINCT FROM OLD.enabled THEN
    RAISE EXCEPTION 'role and enabled status must be changed in separate audited operations'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.updated_by IS NULL OR NEW.updated_at <= OLD.updated_at THEN
    RAISE EXCEPTION 'user security changes require an actor and a new timestamp'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.updated_by = OLD.id
     AND (NEW.role <> 'administrator' OR NEW.enabled IS NOT TRUE) THEN
    RAISE EXCEPTION 'the current Administrator cannot demote or disable itself'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('users.enabled-administrator-change', 0));
  SELECT role, enabled
    INTO current_actor_role, current_actor_enabled
    FROM users
   WHERE id = NEW.updated_by
     FOR SHARE;
  IF current_actor_role <> 'administrator' OR current_actor_enabled IS NOT TRUE THEN
    RAISE EXCEPTION 'user security changes require a current enabled Administrator'
      USING ERRCODE = '42501';
  END IF;

  IF OLD.role = 'administrator'
     AND OLD.enabled = true
     AND (NEW.role <> 'administrator' OR NEW.enabled = false) THEN
    SELECT EXISTS (
      SELECT 1 FROM users
       WHERE id <> OLD.id AND role = 'administrator' AND enabled = true
    ) INTO another_enabled_administrator;
    IF another_enabled_administrator IS NOT TRUE THEN
      RAISE EXCEPTION 'at least one enabled Administrator must remain'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER users_guard_role_status_update
BEFORE UPDATE OF role, enabled, updated_at, updated_by ON users
FOR EACH ROW EXECUTE FUNCTION guard_user_role_status_update();

CREATE FUNCTION require_user_role_status_audit() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  expected_action varchar(64);
BEGIN
  IF NEW.role IS NOT DISTINCT FROM OLD.role
     AND NEW.enabled IS NOT DISTINCT FROM OLD.enabled THEN
    RETURN NEW;
  END IF;

  expected_action := CASE
    WHEN NEW.role IS DISTINCT FROM OLD.role THEN 'user.role_changed'
    WHEN NEW.enabled THEN 'user.enabled'
    ELSE 'user.disabled'
  END;

  IF NOT EXISTS (
    SELECT 1
      FROM user_administration_audit_events event
     WHERE event.target_user_id = NEW.id
       AND event.actor_id = NEW.updated_by
       AND event.action = expected_action
       AND event.outcome = 'succeeded'
       AND event.prior_role = OLD.role
       AND event.resulting_role = NEW.role
       AND event.prior_enabled = OLD.enabled
       AND event.resulting_enabled = NEW.enabled
       AND event.target_user_snapshot->>'id' = NEW.id::text
       AND event.target_user_snapshot->>'role' = NEW.role
       AND (event.target_user_snapshot->>'enabled')::boolean = NEW.enabled
       AND event.created_at >= NEW.updated_at
  ) THEN
    RAISE EXCEPTION 'user role/status update requires matching append-only audit evidence'
      USING ERRCODE = '23514';
  END IF;

  IF (NEW.role IS DISTINCT FROM OLD.role OR NEW.enabled = false)
     AND EXISTS (
       SELECT 1 FROM sessions
        WHERE user_id = NEW.id AND revoked_at IS NULL
     ) THEN
    RAISE EXCEPTION 'user role/status update requires session revocation'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE CONSTRAINT TRIGGER users_require_role_status_audit
AFTER UPDATE OF role, enabled ON users
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION require_user_role_status_audit();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'niedax_generator_app') THEN
    REVOKE UPDATE, DELETE, TRUNCATE ON users FROM niedax_generator_app;
    GRANT SELECT, INSERT ON users TO niedax_generator_app;
    GRANT UPDATE (role, enabled, updated_at, updated_by) ON users TO niedax_generator_app;

    REVOKE UPDATE, DELETE, TRUNCATE ON sessions FROM niedax_generator_app;
    GRANT SELECT, INSERT ON sessions TO niedax_generator_app;
    GRANT UPDATE (revoked_at, last_seen_at) ON sessions TO niedax_generator_app;
  END IF;
END
$$;

CREATE FUNCTION guard_v2_revision_initial_state() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.snapshot_schema_version = 'revision-snapshot/v2'
     AND (
       NEW.status <> 'calculated'
       OR NEW.checked_at IS NOT NULL
       OR NEW.approved_at IS NOT NULL
       OR NEW.archived_at IS NOT NULL
       OR NEW.updated_at IS DISTINCT FROM NEW.created_at
     ) THEN
    RAISE EXCEPTION 'a v2 revision must begin in the calculated state without lifecycle timestamps'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER revisions_guard_v2_initial_state
BEFORE INSERT ON revisions
FOR EACH ROW EXECUTE FUNCTION guard_v2_revision_initial_state();

CREATE FUNCTION require_succeeded_revision_lifecycle_state() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  current_revision revisions%ROWTYPE;
BEGIN
  IF NEW.outcome <> 'succeeded' THEN
    RETURN NEW;
  END IF;

  SELECT *
    INTO current_revision
    FROM revisions
   WHERE id = NEW.revision_id;
  IF current_revision.id IS NULL
     OR current_revision.snapshot_schema_version <> 'revision-snapshot/v2' THEN
    RETURN NEW;
  END IF;

  IF NEW.project_id IS DISTINCT FROM current_revision.project_id
     OR NEW.input_fingerprint IS DISTINCT FROM current_revision.input_fingerprint
     OR NEW.engine_version IS DISTINCT FROM current_revision.engine_version
     OR NEW.catalog_snapshot_id IS DISTINCT FROM current_revision.catalog_snapshot_id
     OR NEW.rule_snapshot_id IS DISTINCT FROM current_revision.rule_snapshot_id THEN
    RAISE EXCEPTION 'successful lifecycle evidence does not match its v2 revision snapshot'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.action = 'revision.saved' THEN
    IF current_revision.status <> 'calculated'
       OR NEW.prior_status IS NOT NULL
       OR NEW.resulting_status <> 'calculated'
       OR NEW.actor_id IS DISTINCT FROM current_revision.created_by
       OR NEW.actor_snapshot IS DISTINCT FROM current_revision.created_by_snapshot
       OR NEW.correlation_id IS DISTINCT FROM current_revision.correlation_id
       OR NEW.comment IS DISTINCT FROM current_revision.comment
       OR NEW.created_at IS DISTINCT FROM current_revision.created_at THEN
      RAISE EXCEPTION 'revision.saved evidence requires the exact calculated v2 revision state'
        USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.action = 'revision.checked' THEN
    IF current_revision.status <> 'checked'
       OR NEW.prior_status <> 'calculated'
       OR NEW.resulting_status <> 'checked'
       OR current_revision.checked_at IS NULL
       OR NEW.created_at IS DISTINCT FROM current_revision.checked_at THEN
      RAISE EXCEPTION 'revision.checked evidence requires the exact checked v2 revision state'
        USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.action = 'revision.approved' THEN
    IF current_revision.status <> 'approved'
       OR NEW.prior_status <> 'checked'
       OR NEW.resulting_status <> 'approved'
       OR current_revision.approved_at IS NULL
       OR NEW.created_at IS DISTINCT FROM current_revision.approved_at
       OR NOT EXISTS (
         SELECT 1
           FROM approvals approval
          WHERE approval.revision_id = NEW.revision_id
            AND approval.decision = 'approved'
            AND approval.actor_id = NEW.actor_id
            AND approval.actor_role = NEW.actor_role
            AND approval.actor_snapshot = NEW.actor_snapshot
            AND approval.correlation_id = NEW.correlation_id
            AND approval.decided_at = NEW.created_at
            AND approval.comment IS NOT DISTINCT FROM NEW.comment
       ) THEN
      RAISE EXCEPTION 'revision.approved evidence requires the exact approved state and decision'
        USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.action = 'revision.archived' THEN
    IF current_revision.status <> 'archived'
       OR NEW.resulting_status <> 'archived'
       OR current_revision.archived_at IS NULL
       OR NEW.created_at IS DISTINCT FROM current_revision.archived_at THEN
      RAISE EXCEPTION 'revision.archived evidence requires the exact archived v2 revision state'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

CREATE CONSTRAINT TRIGGER revision_lifecycle_require_succeeded_state
AFTER INSERT ON revision_lifecycle_events
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION require_succeeded_revision_lifecycle_state();

CREATE FUNCTION require_user_creation_audit() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  administrator_count integer;
BEGIN
  IF current_user <> 'niedax_generator_app' THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM user_administration_audit_events event
     WHERE event.target_user_id = NEW.id
       AND event.action = 'user.created'
       AND event.outcome = 'succeeded'
       AND event.prior_role IS NULL
       AND event.resulting_role = NEW.role
       AND event.prior_enabled IS NULL
       AND event.resulting_enabled = NEW.enabled
       AND event.target_user_snapshot->>'id' = NEW.id::text
       AND event.target_user_snapshot->>'role' = NEW.role
       AND (event.target_user_snapshot->>'enabled')::boolean = NEW.enabled
       AND event.actor_id IS NOT DISTINCT FROM NEW.created_by
       AND event.created_at >= NEW.created_at
  ) THEN
    RAISE EXCEPTION 'application user creation requires matching append-only audit evidence'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.created_by IS NULL THEN
    SELECT count(*)::integer
      INTO administrator_count
      FROM users
     WHERE role = 'administrator';
    IF NEW.role <> 'administrator'
       OR NEW.enabled IS NOT TRUE
       OR administrator_count <> 1 THEN
      RAISE EXCEPTION 'actorless application user creation is limited to initial bootstrap'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

CREATE CONSTRAINT TRIGGER users_require_creation_audit
AFTER INSERT ON users
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION require_user_creation_audit();

CREATE FUNCTION guard_session_security_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.revoked_at IS NOT NULL
     AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at THEN
    RAISE EXCEPTION 'session revocation is irreversible'
      USING ERRCODE = '55000';
  END IF;
  IF NEW.last_seen_at < OLD.last_seen_at THEN
    RAISE EXCEPTION 'session last-seen timestamp cannot move backwards'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER sessions_guard_security_update
BEFORE UPDATE OF revoked_at, last_seen_at ON sessions
FOR EACH ROW EXECUTE FUNCTION guard_session_security_update();
