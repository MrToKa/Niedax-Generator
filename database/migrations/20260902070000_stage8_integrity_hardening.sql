-- Corrective forward migration for Stage 8 snapshot identity and bootstrap authorization.

ALTER TABLE revisions
  ADD CONSTRAINT revisions_v2_snapshot_identity_complete CHECK (
    snapshot_schema_version <> 'revision-snapshot/v2'
    OR (
      coalesce(
        catalog_snapshot #>> '{reference,version}' = catalog_snapshot_version,
        false
      )
      AND coalesce(
        catalog_snapshot #>> '{reference,contentHash}' = catalog_snapshot_content_hash,
        false
      )
      AND coalesce(
        rule_template_snapshot #>> '{reference,version}' = rule_snapshot_version,
        false
      )
      AND coalesce(
        rule_template_snapshot #>> '{reference,contentHash}' = rule_snapshot_content_hash,
        false
      )
      AND coalesce(calculation_result_snapshot->>'engineVersion' = engine_version, false)
      AND coalesce(
        calculation_result_snapshot #>> '{catalogSnapshot,version}' = catalog_snapshot_version,
        false
      )
      AND coalesce(
        calculation_result_snapshot #>> '{catalogSnapshot,contentHash}' =
          catalog_snapshot_content_hash,
        false
      )
      AND coalesce(
        calculation_result_snapshot #>> '{ruleSnapshot,version}' = rule_snapshot_version,
        false
      )
      AND coalesce(
        calculation_result_snapshot #>> '{ruleSnapshot,contentHash}' = rule_snapshot_content_hash,
        false
      )
    )
  ) NOT VALID;

ALTER TABLE revisions
  VALIDATE CONSTRAINT revisions_v2_snapshot_identity_complete;

CREATE OR REPLACE FUNCTION guard_user_administration_audit_actor() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  current_actor_role varchar(32);
  current_actor_enabled boolean;
  bootstrap_target_matches boolean;
  administrator_count integer;
BEGIN
  IF NEW.outcome <> 'succeeded' THEN
    RETURN NEW;
  END IF;

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
    IF NEW.action = 'user.created'
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

  IF NEW.actor_role <> 'administrator'
     OR NEW.actor_snapshot->>'id' IS DISTINCT FROM NEW.actor_id::text
     OR NEW.actor_snapshot->>'role' IS DISTINCT FROM NEW.actor_role THEN
    RAISE EXCEPTION 'user administration actor snapshot is inconsistent'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.actor_id = NEW.target_user_id
     AND NEW.action IN ('user.role_changed', 'user.disabled')
     AND NEW.prior_role = 'administrator'
     AND NEW.prior_enabled IS TRUE THEN
    RETURN NEW;
  END IF;

  SELECT role, enabled
    INTO current_actor_role, current_actor_enabled
    FROM users
   WHERE id = NEW.actor_id;

  IF current_actor_role IS DISTINCT FROM 'administrator'
     OR current_actor_enabled IS NOT TRUE THEN
    RAISE EXCEPTION 'successful user administration requires an enabled Administrator'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$$;

