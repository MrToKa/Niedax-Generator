ALTER TABLE users
  DROP CONSTRAINT users_role_check;

ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('designer', 'reviewer', 'administrator', 'viewer')) NOT VALID;

ALTER TABLE users
  VALIDATE CONSTRAINT users_role_check;

CREATE INDEX users_administration_list_idx ON users (created_at DESC, id DESC);

ALTER TABLE revisions
  DROP CONSTRAINT revisions_idempotency_unique;

CREATE UNIQUE INDEX revisions_v1_idempotency_unique_idx
  ON revisions (project_id, idempotency_key)
  WHERE snapshot_schema_version = 'revision-snapshot/v1';

CREATE FUNCTION is_canonical_decimal_v2(value text) RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
AS $$
  SELECT value ~ '^(0|[1-9][0-9]*)(\.[0-9]*[1-9])?$'
     AND length(replace(value, '.', '')) <= 30
     AND (
       position('.' IN value) = 0
       OR length(split_part(value, '.', 2)) <= 18
     )
$$;

ALTER TABLE revisions
  ADD COLUMN comment text NULL,
  ADD COLUMN calculation_run_id uuid NULL,
  ADD COLUMN source_draft_version integer NULL,
  ADD COLUMN project_snapshot jsonb NULL,
  ADD COLUMN catalog_snapshot_id uuid NULL REFERENCES catalog_versions(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD COLUMN catalog_snapshot_version varchar(64) NULL,
  ADD COLUMN catalog_snapshot_content_hash varchar(71) NULL,
  ADD COLUMN rule_snapshot_id uuid NULL REFERENCES rule_sets(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD COLUMN rule_snapshot_version varchar(64) NULL,
  ADD COLUMN rule_snapshot_content_hash varchar(71) NULL,
  ADD COLUMN approval_ready boolean NULL,
  ADD COLUMN warning_summary jsonb NULL,
  ADD COLUMN project_checksum varchar(71) NULL,
  ADD COLUMN result_checksum varchar(71) NULL,
  ADD COLUMN warnings_checksum varchar(71) NULL,
  ADD COLUMN revision_checksum varchar(71) NULL,
  ADD CONSTRAINT revisions_source_draft_version_nonnegative CHECK (
    source_draft_version IS NULL OR source_draft_version >= 0
  ),
  ADD CONSTRAINT revisions_project_snapshot_object CHECK (
    project_snapshot IS NULL OR jsonb_typeof(project_snapshot) = 'object'
  ),
  ADD CONSTRAINT revisions_warning_summary_object CHECK (
    warning_summary IS NULL OR jsonb_typeof(warning_summary) = 'object'
  ),
  ADD CONSTRAINT revisions_catalog_snapshot_content_hash_format CHECK (
    catalog_snapshot_content_hash IS NULL
    OR catalog_snapshot_content_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  ADD CONSTRAINT revisions_rule_snapshot_content_hash_format CHECK (
    rule_snapshot_content_hash IS NULL
    OR rule_snapshot_content_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  ADD CONSTRAINT revisions_project_checksum_format CHECK (
    project_checksum IS NULL OR project_checksum ~ '^sha256:[0-9a-f]{64}$'
  ),
  ADD CONSTRAINT revisions_result_checksum_format CHECK (
    result_checksum IS NULL OR result_checksum ~ '^sha256:[0-9a-f]{64}$'
  ),
  ADD CONSTRAINT revisions_warnings_checksum_format CHECK (
    warnings_checksum IS NULL OR warnings_checksum ~ '^sha256:[0-9a-f]{64}$'
  ),
  ADD CONSTRAINT revisions_revision_checksum_format CHECK (
    revision_checksum IS NULL OR revision_checksum ~ '^sha256:[0-9a-f]{64}$'
  ),
  ADD CONSTRAINT revisions_id_project_unique UNIQUE (id, project_id),
  ADD CONSTRAINT revisions_v2_required_evidence CHECK (
    snapshot_schema_version <> 'revision-snapshot/v2'
    OR (
      calculation_schema_version = 'calculation-input/v2'
      AND name IS NOT NULL
      AND btrim(name) <> ''
      AND (comment IS NULL OR (btrim(comment) <> '' AND char_length(comment) <= 2000))
      AND calculation_run_id IS NOT NULL
      AND source_draft_version IS NOT NULL
      AND created_by IS NOT NULL
      AND created_by_snapshot <> '{}'::jsonb
      AND project_snapshot IS NOT NULL
      AND catalog_snapshot_id IS NOT NULL
      AND catalog_snapshot_version IS NOT NULL
      AND btrim(catalog_snapshot_version) <> ''
      AND catalog_snapshot_content_hash IS NOT NULL
      AND rule_snapshot_id IS NOT NULL
      AND rule_snapshot_version IS NOT NULL
      AND btrim(rule_snapshot_version) <> ''
      AND rule_snapshot_content_hash IS NOT NULL
      AND approval_ready IS NOT NULL
      AND warning_summary IS NOT NULL
      AND project_checksum IS NOT NULL
      AND result_checksum IS NOT NULL
      AND warnings_checksum IS NOT NULL
      AND revision_checksum IS NOT NULL
      AND coalesce(project_snapshot->>'id' = project_id::text, false)
      AND coalesce(project_snapshot->>'draftVersion' = source_draft_version::text, false)
      AND coalesce(input_snapshot->>'schemaVersion' = 'calculation-input/v2', false)
      AND coalesce(
        input_snapshot #>> '{invocation,calculationRunId}' = calculation_run_id::text,
        false
      )
      AND coalesce(
        input_snapshot #>> '{invocation,inputFingerprint}' = input_fingerprint,
        false
      )
      AND coalesce(
        input_snapshot #>> '{catalogSnapshot,snapshotId}' = catalog_snapshot_id::text,
        false
      )
      AND coalesce(
        input_snapshot #>> '{catalogSnapshot,version}' = catalog_snapshot_version,
        false
      )
      AND coalesce(
        input_snapshot #>> '{catalogSnapshot,contentHash}' = catalog_snapshot_content_hash,
        false
      )
      AND coalesce(
        input_snapshot #>> '{ruleSnapshot,snapshotId}' = rule_snapshot_id::text,
        false
      )
      AND coalesce(
        input_snapshot #>> '{ruleSnapshot,version}' = rule_snapshot_version,
        false
      )
      AND coalesce(
        input_snapshot #>> '{ruleSnapshot,contentHash}' = rule_snapshot_content_hash,
        false
      )
      AND coalesce(catalog_snapshot->>'schemaVersion' = 'catalog-revision-snapshot/v2', false)
      AND coalesce(
        catalog_snapshot #>> '{reference,snapshotId}' = catalog_snapshot_id::text,
        false
      )
      AND coalesce(rule_template_snapshot->>'schemaVersion' = 'rule-template-revision-snapshot/v2', false)
      AND coalesce(
        rule_template_snapshot #>> '{reference,snapshotId}' = rule_snapshot_id::text,
        false
      )
      AND coalesce(
        calculation_result_snapshot->>'schemaVersion' = 'calculation-result/v2',
        false
      )
      AND coalesce(
        calculation_result_snapshot->>'calculationRunId' = calculation_run_id::text,
        false
      )
      AND coalesce(
        calculation_result_snapshot->>'inputFingerprint' = input_fingerprint,
        false
      )
      AND coalesce(
        calculation_result_snapshot #>> '{catalogSnapshot,snapshotId}' = catalog_snapshot_id::text,
        false
      )
      AND coalesce(
        calculation_result_snapshot #>> '{ruleSnapshot,snapshotId}' = rule_snapshot_id::text,
        false
      )
      AND coalesce(
        calculation_result_snapshot #>> '{summary,approvalReady}' = approval_ready::text,
        false
      )
    )
  ) NOT VALID;

ALTER TABLE revisions
  VALIDATE CONSTRAINT revisions_v2_required_evidence;

CREATE INDEX revisions_v2_history_idx
  ON revisions (project_id, revision_number DESC, created_at DESC, id DESC)
  WHERE snapshot_schema_version = 'revision-snapshot/v2';
CREATE INDEX revisions_v2_calculation_run_idx
  ON revisions (calculation_run_id)
  WHERE calculation_run_id IS NOT NULL;

CREATE TABLE revision_bom_lines_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_id uuid NOT NULL REFERENCES revisions(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  schema_version varchar(64) NOT NULL DEFAULT 'revision-bom-line/v2'
    CHECK (schema_version = 'revision-bom-line/v2'),
  line_identity varchar(128) NOT NULL,
  line_order integer NOT NULL CHECK (line_order >= 0),
  kind varchar(16) NOT NULL CHECK (kind IN ('catalog', 'manual')),
  category varchar(32) NOT NULL CHECK (category IN (
    'linearSection', 'fitting', 'connector', 'support', 'structure', 'anchor', 'wstb',
    'endpointMaterial', 'accessory', 'manual'
  )),
  live_product_id uuid NULL REFERENCES products(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  product_id varchar(128) NULL,
  manual_input_id varchar(128) NULL,
  product_code varchar(100) NULL,
  description_en text NOT NULL CHECK (btrim(description_en) <> ''),
  unit varchar(8) NOT NULL CHECK (unit IN ('pcs', 'm', 'kg')),
  status varchar(32) NOT NULL CHECK (status IN (
    'catalogConfirmed', 'calculated', 'projectRule', 'engineeringReview', 'manual'
  )),
  technical_quantity_value varchar(64) NOT NULL CHECK (
    is_canonical_decimal_v2(technical_quantity_value)
  ),
  technical_quantity_unit varchar(8) NOT NULL CHECK (
    technical_quantity_unit IN ('pcs', 'm', 'kg')
  ),
  reserve_quantity_value varchar(64) NOT NULL CHECK (
    is_canonical_decimal_v2(reserve_quantity_value)
  ),
  reserve_quantity_unit varchar(8) NOT NULL CHECK (
    reserve_quantity_unit IN ('pcs', 'm', 'kg')
  ),
  reserved_quantity_value varchar(64) NOT NULL CHECK (
    is_canonical_decimal_v2(reserved_quantity_value)
  ),
  reserved_quantity_unit varchar(8) NOT NULL CHECK (
    reserved_quantity_unit IN ('pcs', 'm', 'kg')
  ),
  package_increment_value varchar(64) NOT NULL CHECK (
    is_canonical_decimal_v2(package_increment_value)
  ),
  package_increment_unit varchar(8) NOT NULL CHECK (
    package_increment_unit IN ('pcs', 'm', 'kg')
  ),
  package_count_value varchar(64) NULL CHECK (
    package_count_value IS NULL
    OR (
      is_canonical_decimal_v2(package_count_value)
      AND package_count_value ~ '^(0|[1-9][0-9]*)$'
    )
  ),
  package_count_unit varchar(8) NULL CHECK (
    (package_count_value IS NULL AND package_count_unit IS NULL)
    OR (package_count_value IS NOT NULL AND package_count_unit = 'packages')
  ),
  packaging_overage_value varchar(64) NOT NULL CHECK (
    is_canonical_decimal_v2(packaging_overage_value)
  ),
  packaging_overage_unit varchar(8) NOT NULL CHECK (
    packaging_overage_unit IN ('pcs', 'm', 'kg')
  ),
  ordered_quantity_value varchar(64) NOT NULL CHECK (
    is_canonical_decimal_v2(ordered_quantity_value)
  ),
  ordered_quantity_unit varchar(8) NOT NULL CHECK (
    ordered_quantity_unit IN ('pcs', 'm', 'kg')
  ),
  total_spare_quantity_value varchar(64) NOT NULL CHECK (
    is_canonical_decimal_v2(total_spare_quantity_value)
  ),
  total_spare_quantity_unit varchar(8) NOT NULL CHECK (
    total_spare_quantity_unit IN ('pcs', 'm', 'kg')
  ),
  section_detail jsonb NULL CHECK (
    section_detail IS NULL OR jsonb_typeof(section_detail) = 'object'
  ),
  included_items_snapshot jsonb NOT NULL CHECK (
    jsonb_typeof(included_items_snapshot) = 'array'
  ),
  source_refs_snapshot jsonb NOT NULL CHECK (
    jsonb_typeof(source_refs_snapshot) = 'array'
    AND jsonb_array_length(source_refs_snapshot) > 0
  ),
  warning_ids_snapshot jsonb NOT NULL CHECK (
    jsonb_typeof(warning_ids_snapshot) = 'array'
  ),
  trace_step_ids_snapshot jsonb NOT NULL CHECK (
    jsonb_typeof(trace_step_ids_snapshot) = 'array'
    AND jsonb_array_length(trace_step_ids_snapshot) > 0
  ),
  provenance_snapshot jsonb NOT NULL CHECK (
    jsonb_typeof(provenance_snapshot) = 'object'
  ),
  line_snapshot jsonb NOT NULL CHECK (
    jsonb_typeof(line_snapshot) = 'object'
    AND coalesce(line_snapshot->>'id' = line_identity, false)
    AND coalesce(line_snapshot->>'kind' = kind, false)
    AND coalesce(line_snapshot->>'category' = category, false)
    AND (line_snapshot->>'productId') IS NOT DISTINCT FROM product_id
    AND (line_snapshot->>'manualInputId') IS NOT DISTINCT FROM manual_input_id
    AND (line_snapshot->>'productCode') IS NOT DISTINCT FROM product_code
    AND coalesce(line_snapshot->>'descriptionEn' = description_en, false)
    AND coalesce(line_snapshot->>'unit' = unit, false)
    AND coalesce(line_snapshot->>'status' = status, false)
    AND coalesce(
      line_snapshot #>> '{technicalQuantity,value}' = technical_quantity_value,
      false
    )
    AND coalesce(
      line_snapshot #>> '{technicalQuantity,unit}' = technical_quantity_unit,
      false
    )
    AND coalesce(line_snapshot #>> '{reserveQuantity,value}' = reserve_quantity_value, false)
    AND coalesce(line_snapshot #>> '{reserveQuantity,unit}' = reserve_quantity_unit, false)
    AND coalesce(line_snapshot #>> '{reservedQuantity,value}' = reserved_quantity_value, false)
    AND coalesce(line_snapshot #>> '{reservedQuantity,unit}' = reserved_quantity_unit, false)
    AND coalesce(line_snapshot #>> '{packageIncrement,value}' = package_increment_value, false)
    AND coalesce(line_snapshot #>> '{packageIncrement,unit}' = package_increment_unit, false)
    AND (line_snapshot #>> '{packageCount,value}') IS NOT DISTINCT FROM package_count_value
    AND (line_snapshot #>> '{packageCount,unit}') IS NOT DISTINCT FROM package_count_unit
    AND coalesce(line_snapshot #>> '{packagingOverage,value}' = packaging_overage_value, false)
    AND coalesce(line_snapshot #>> '{packagingOverage,unit}' = packaging_overage_unit, false)
    AND coalesce(line_snapshot #>> '{orderedQuantity,value}' = ordered_quantity_value, false)
    AND coalesce(line_snapshot #>> '{orderedQuantity,unit}' = ordered_quantity_unit, false)
    AND coalesce(line_snapshot #>> '{totalSpareQuantity,value}' = total_spare_quantity_value, false)
    AND coalesce(line_snapshot #>> '{totalSpareQuantity,unit}' = total_spare_quantity_unit, false)
    AND (
      CASE
        WHEN line_snapshot->'sectionDetail' = 'null'::jsonb THEN NULL
        ELSE line_snapshot->'sectionDetail'
      END
    ) IS NOT DISTINCT FROM section_detail
    AND coalesce(line_snapshot->'includedItems' = included_items_snapshot, false)
    AND coalesce(line_snapshot->'sourceRefs' = source_refs_snapshot, false)
    AND coalesce(line_snapshot->'warningIds' = warning_ids_snapshot, false)
    AND coalesce(line_snapshot->'traceStepIds' = trace_step_ids_snapshot, false)
    AND coalesce(line_snapshot->'provenance' = provenance_snapshot, false)
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT revision_bom_lines_v2_identity_unique UNIQUE (revision_id, line_identity),
  CONSTRAINT revision_bom_lines_v2_order_unique UNIQUE (revision_id, line_order),
  CONSTRAINT revision_bom_lines_v2_identity_kind CHECK (
    (kind = 'catalog' AND product_id IS NOT NULL AND manual_input_id IS NULL)
    OR (kind = 'manual' AND product_id IS NULL AND manual_input_id IS NOT NULL)
  )
);

CREATE INDEX revision_bom_lines_v2_revision_idx
  ON revision_bom_lines_v2 (revision_id, line_order);

CREATE TABLE revision_warnings_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_id uuid NOT NULL REFERENCES revisions(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  schema_version varchar(64) NOT NULL DEFAULT 'calculation-warning/v2'
    CHECK (schema_version = 'calculation-warning/v2'),
  warning_identity varchar(128) NOT NULL,
  warning_order integer NOT NULL CHECK (warning_order >= 0),
  code varchar(128) NOT NULL,
  kind varchar(32) NOT NULL CHECK (
    kind IN ('validation', 'catalog', 'engineering', 'manualOverride', 'projectRule')
  ),
  severity varchar(32) NOT NULL CHECK (
    severity IN ('info', 'warning', 'engineeringReview', 'blocking')
  ),
  approval_impact varchar(32) NOT NULL CHECK (
    approval_impact IN ('none', 'reviewRequired', 'blocksApproval')
  ),
  subject_kind varchar(128) NOT NULL,
  subject_id varchar(128) NOT NULL,
  path_snapshot jsonb NULL CHECK (
    path_snapshot IS NULL OR jsonb_typeof(path_snapshot) = 'array'
  ),
  message_key varchar(128) NOT NULL,
  effect text NOT NULL CHECK (btrim(effect) <> ''),
  rule_id varchar(128) NULL,
  product_id varchar(128) NULL,
  template_id varchar(128) NULL,
  override_id varchar(128) NULL,
  source_refs_snapshot jsonb NOT NULL CHECK (
    jsonb_typeof(source_refs_snapshot) = 'array'
  ),
  warning_payload jsonb NOT NULL CHECK (
    jsonb_typeof(warning_payload) = 'object'
    AND coalesce(warning_payload->>'id' = warning_identity, false)
    AND coalesce(warning_payload->>'code' = code, false)
    AND coalesce(warning_payload->>'kind' = kind, false)
    AND coalesce(warning_payload->>'severity' = severity, false)
    AND coalesce(warning_payload->>'approvalImpact' = approval_impact, false)
    AND coalesce(warning_payload #>> '{subject,kind}' = subject_kind, false)
    AND coalesce(warning_payload #>> '{subject,id}' = subject_id, false)
    AND (
      CASE
        WHEN warning_payload->'path' = 'null'::jsonb THEN NULL
        ELSE warning_payload->'path'
      END
    ) IS NOT DISTINCT FROM path_snapshot
    AND coalesce(warning_payload->>'messageKey' = message_key, false)
    AND coalesce(warning_payload->>'effect' = effect, false)
    AND (warning_payload->>'ruleId') IS NOT DISTINCT FROM rule_id
    AND (warning_payload->>'productId') IS NOT DISTINCT FROM product_id
    AND (warning_payload->>'templateId') IS NOT DISTINCT FROM template_id
    AND (warning_payload->>'overrideId') IS NOT DISTINCT FROM override_id
    AND coalesce(warning_payload->'sourceRefs' = source_refs_snapshot, false)
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT revision_warnings_v2_identity_unique UNIQUE (revision_id, warning_identity),
  CONSTRAINT revision_warnings_v2_order_unique UNIQUE (revision_id, warning_order)
);

CREATE INDEX revision_warnings_v2_revision_idx
  ON revision_warnings_v2 (revision_id, warning_order);
CREATE INDEX revision_warnings_v2_approval_idx
  ON revision_warnings_v2 (revision_id, approval_impact)
  WHERE approval_impact = 'blocksApproval';

CREATE TABLE revision_lifecycle_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_version varchar(64) NOT NULL DEFAULT 'revision-lifecycle-event/v2'
    CHECK (schema_version = 'revision-lifecycle-event/v2'),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  revision_id uuid NOT NULL REFERENCES revisions(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  action varchar(64) NOT NULL CHECK (action IN (
    'revision.saved', 'revision.checked', 'revision.approved', 'revision.archived',
    'revision.authorization_rejected', 'revision.transition_rejected'
  )),
  actor_id uuid NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  actor_role varchar(32) NULL CHECK (
    actor_role IS NULL OR actor_role IN ('designer', 'reviewer', 'administrator', 'viewer')
  ),
  actor_snapshot jsonb NOT NULL CHECK (jsonb_typeof(actor_snapshot) = 'object'),
  prior_status varchar(16) NULL CHECK (
    prior_status IS NULL OR prior_status IN ('calculated', 'checked', 'approved', 'archived')
  ),
  resulting_status varchar(16) NULL CHECK (
    resulting_status IS NULL OR resulting_status IN ('calculated', 'checked', 'approved', 'archived')
  ),
  correlation_id varchar(128) NOT NULL CHECK (
    correlation_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
  ),
  comment text NULL CHECK (comment IS NULL OR char_length(comment) <= 2000),
  reason_code varchar(128) NULL,
  input_fingerprint varchar(71) NOT NULL CHECK (
    input_fingerprint ~ '^sha256:[0-9a-f]{64}$'
  ),
  engine_version varchar(64) NOT NULL CHECK (btrim(engine_version) <> ''),
  catalog_snapshot_id uuid NOT NULL,
  rule_snapshot_id uuid NOT NULL,
  outcome varchar(16) NOT NULL CHECK (outcome IN ('succeeded', 'rejected')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT revision_lifecycle_events_project_revision_fk
    FOREIGN KEY (revision_id, project_id) REFERENCES revisions(id, project_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT revision_lifecycle_events_success_shape CHECK (
    outcome <> 'succeeded'
    OR (
      actor_id IS NOT NULL
      AND actor_role IS NOT NULL
      AND actor_snapshot <> '{}'::jsonb
      AND (
        (action = 'revision.saved' AND prior_status IS NULL AND resulting_status = 'calculated')
        OR (action = 'revision.checked' AND prior_status = 'calculated' AND resulting_status = 'checked')
        OR (action = 'revision.approved' AND prior_status = 'checked' AND resulting_status = 'approved')
        OR (action = 'revision.archived' AND prior_status IN ('calculated', 'checked', 'approved') AND resulting_status = 'archived')
      )
    )
  ),
  CONSTRAINT revision_lifecycle_events_review_role CHECK (
    outcome <> 'succeeded'
    OR action NOT IN ('revision.checked', 'revision.approved')
    OR actor_role IN ('reviewer', 'administrator')
  )
);

CREATE UNIQUE INDEX revision_lifecycle_events_one_success_idx
  ON revision_lifecycle_events (revision_id, action)
  WHERE outcome = 'succeeded';
CREATE INDEX revision_lifecycle_events_project_history_idx
  ON revision_lifecycle_events (project_id, created_at DESC, id DESC);
CREATE INDEX revision_lifecycle_events_revision_history_idx
  ON revision_lifecycle_events (revision_id, created_at DESC, id DESC);
CREATE INDEX revision_lifecycle_events_correlation_idx
  ON revision_lifecycle_events (correlation_id);

CREATE FUNCTION guard_revision_lifecycle_actor() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  current_actor_role varchar(32);
  current_actor_enabled boolean;
BEGIN
  IF NEW.outcome <> 'succeeded' THEN
    RETURN NEW;
  END IF;

  SELECT role, enabled
    INTO current_actor_role, current_actor_enabled
    FROM users
   WHERE id = NEW.actor_id;

  IF current_actor_role IS NULL
     OR current_actor_enabled IS NOT TRUE
     OR NEW.actor_role IS DISTINCT FROM current_actor_role
     OR NEW.actor_snapshot->>'id' IS DISTINCT FROM NEW.actor_id::text
     OR NEW.actor_snapshot->>'role' IS DISTINCT FROM NEW.actor_role THEN
    RAISE EXCEPTION 'revision lifecycle actor is not current and enabled'
      USING ERRCODE = '42501';
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

CREATE TRIGGER revision_lifecycle_events_guard_actor
BEFORE INSERT ON revision_lifecycle_events
FOR EACH ROW EXECUTE FUNCTION guard_revision_lifecycle_actor();

CREATE TABLE user_administration_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_version varchar(64) NOT NULL DEFAULT 'user-administration-audit-event/v1'
    CHECK (schema_version = 'user-administration-audit-event/v1'),
  actor_id uuid NULL,
  actor_role varchar(32) NULL CHECK (
    actor_role IS NULL OR actor_role IN ('designer', 'reviewer', 'administrator', 'viewer')
  ),
  actor_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (
    jsonb_typeof(actor_snapshot) = 'object'
  ),
  target_user_id uuid NOT NULL,
  target_user_snapshot jsonb NOT NULL CHECK (
    jsonb_typeof(target_user_snapshot) = 'object'
  ),
  action varchar(64) NOT NULL CHECK (action IN (
    'user.created', 'user.role_changed', 'user.enabled', 'user.disabled',
    'user.authorization_rejected'
  )),
  prior_role varchar(32) NULL CHECK (
    prior_role IS NULL OR prior_role IN ('designer', 'reviewer', 'administrator', 'viewer')
  ),
  resulting_role varchar(32) NULL CHECK (
    resulting_role IS NULL OR resulting_role IN ('designer', 'reviewer', 'administrator', 'viewer')
  ),
  prior_enabled boolean NULL,
  resulting_enabled boolean NULL,
  correlation_id varchar(128) NOT NULL CHECK (
    correlation_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
  ),
  reason_code varchar(128) NULL,
  outcome varchar(16) NOT NULL CHECK (outcome IN ('succeeded', 'rejected')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_administration_audit_success_actor CHECK (
    outcome <> 'succeeded'
    OR action = 'user.created' AND actor_id IS NULL
    OR (actor_id IS NOT NULL AND actor_role = 'administrator' AND actor_snapshot <> '{}'::jsonb)
  ),
  CONSTRAINT user_administration_audit_transition_shape CHECK (
    outcome <> 'succeeded'
    OR (
      action = 'user.created'
      AND prior_role IS NULL
      AND prior_enabled IS NULL
      AND resulting_role IS NOT NULL
      AND resulting_enabled IS NOT NULL
    )
    OR (
      action = 'user.role_changed'
      AND prior_role IS NOT NULL
      AND resulting_role IS NOT NULL
      AND prior_enabled IS NOT NULL
      AND resulting_enabled IS NOT NULL
    )
    OR (
      action IN ('user.enabled', 'user.disabled')
      AND prior_role IS NOT NULL
      AND resulting_role IS NOT NULL
      AND prior_enabled IS NOT NULL
      AND resulting_enabled IS NOT NULL
    )
  )
);

CREATE INDEX user_administration_audit_history_idx
  ON user_administration_audit_events (created_at DESC, id DESC);
CREATE INDEX user_administration_audit_target_idx
  ON user_administration_audit_events (target_user_id, created_at DESC, id DESC);
CREATE INDEX user_administration_audit_actor_idx
  ON user_administration_audit_events (actor_id, created_at DESC, id DESC);
CREATE INDEX user_administration_audit_correlation_idx
  ON user_administration_audit_events (correlation_id);

CREATE FUNCTION guard_user_administration_audit_actor() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  current_actor_role varchar(32);
  current_actor_enabled boolean;
BEGIN
  IF NEW.outcome <> 'succeeded' THEN
    RETURN NEW;
  END IF;

  IF NEW.actor_id IS NULL THEN
    IF NEW.action = 'user.created' AND NEW.actor_snapshot = '{}'::jsonb THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'successful user administration requires an Administrator actor'
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

CREATE TRIGGER user_administration_audit_events_guard_actor
BEFORE INSERT ON user_administration_audit_events
FOR EACH ROW EXECUTE FUNCTION guard_user_administration_audit_actor();

CREATE OR REPLACE FUNCTION protect_revision_payload() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'saved revisions cannot be deleted' USING ERRCODE = '55000';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.project_id IS DISTINCT FROM OLD.project_id
     OR NEW.revision_number IS DISTINCT FROM OLD.revision_number
     OR NEW.name IS DISTINCT FROM OLD.name
     OR NEW.description IS DISTINCT FROM OLD.description
     OR NEW.comment IS DISTINCT FROM OLD.comment
     OR NEW.calculation_schema_version IS DISTINCT FROM OLD.calculation_schema_version
     OR NEW.engine_version IS DISTINCT FROM OLD.engine_version
     OR NEW.snapshot_schema_version IS DISTINCT FROM OLD.snapshot_schema_version
     OR NEW.input_fingerprint IS DISTINCT FROM OLD.input_fingerprint
     OR NEW.input_checksum IS DISTINCT FROM OLD.input_checksum
     OR NEW.snapshot_checksum IS DISTINCT FROM OLD.snapshot_checksum
     OR NEW.bom_checksum IS DISTINCT FROM OLD.bom_checksum
     OR NEW.project_checksum IS DISTINCT FROM OLD.project_checksum
     OR NEW.result_checksum IS DISTINCT FROM OLD.result_checksum
     OR NEW.warnings_checksum IS DISTINCT FROM OLD.warnings_checksum
     OR NEW.revision_checksum IS DISTINCT FROM OLD.revision_checksum
     OR NEW.input_snapshot IS DISTINCT FROM OLD.input_snapshot
     OR NEW.project_snapshot IS DISTINCT FROM OLD.project_snapshot
     OR NEW.catalog_snapshot IS DISTINCT FROM OLD.catalog_snapshot
     OR NEW.rule_template_snapshot IS DISTINCT FROM OLD.rule_template_snapshot
     OR NEW.calculation_result_snapshot IS DISTINCT FROM OLD.calculation_result_snapshot
     OR NEW.calculation_run_id IS DISTINCT FROM OLD.calculation_run_id
     OR NEW.source_draft_version IS DISTINCT FROM OLD.source_draft_version
     OR NEW.catalog_snapshot_id IS DISTINCT FROM OLD.catalog_snapshot_id
     OR NEW.catalog_snapshot_version IS DISTINCT FROM OLD.catalog_snapshot_version
     OR NEW.catalog_snapshot_content_hash IS DISTINCT FROM OLD.catalog_snapshot_content_hash
     OR NEW.rule_snapshot_id IS DISTINCT FROM OLD.rule_snapshot_id
     OR NEW.rule_snapshot_version IS DISTINCT FROM OLD.rule_snapshot_version
     OR NEW.rule_snapshot_content_hash IS DISTINCT FROM OLD.rule_snapshot_content_hash
     OR NEW.approval_ready IS DISTINCT FROM OLD.approval_ready
     OR NEW.warning_summary IS DISTINCT FROM OLD.warning_summary
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR NEW.correlation_id IS DISTINCT FROM OLD.correlation_id
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_by_snapshot IS DISTINCT FROM OLD.created_by_snapshot
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'saved revision payload is immutable' USING ERRCODE = '55000';
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    IF NEW.checked_at IS DISTINCT FROM OLD.checked_at
       OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
       OR NEW.archived_at IS DISTINCT FROM OLD.archived_at
       OR NEW.updated_at IS DISTINCT FROM OLD.updated_at THEN
      RAISE EXCEPTION 'revision lifecycle timestamps require a status transition'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = 'calculated' AND NEW.status = 'checked' THEN
    IF OLD.checked_at IS NOT NULL
       OR NEW.checked_at IS NULL
       OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
       OR NEW.archived_at IS DISTINCT FROM OLD.archived_at THEN
      RAISE EXCEPTION 'calculated to checked requires exactly one checked timestamp'
        USING ERRCODE = '23514';
    END IF;
  ELSIF OLD.status = 'checked' AND NEW.status = 'approved' THEN
    IF NEW.checked_at IS DISTINCT FROM OLD.checked_at
       OR OLD.approved_at IS NOT NULL
       OR NEW.approved_at IS NULL
       OR NEW.archived_at IS DISTINCT FROM OLD.archived_at THEN
      RAISE EXCEPTION 'checked to approved requires exactly one approved timestamp'
        USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.status = 'archived' AND OLD.status IN ('calculated', 'checked', 'approved') THEN
    IF NEW.checked_at IS DISTINCT FROM OLD.checked_at
       OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
       OR OLD.archived_at IS NOT NULL
       OR NEW.archived_at IS NULL THEN
      RAISE EXCEPTION 'archival requires exactly one archived timestamp'
        USING ERRCODE = '23514';
    END IF;
  ELSE
    RAISE EXCEPTION 'invalid revision lifecycle transition from % to %', OLD.status, NEW.status
      USING ERRCODE = '23514';
  END IF;

  IF NEW.updated_at < OLD.updated_at THEN
    RAISE EXCEPTION 'revision lifecycle timestamp cannot move backwards'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER revision_bom_lines_v2_append_only
BEFORE UPDATE OR DELETE ON revision_bom_lines_v2
FOR EACH ROW EXECUTE FUNCTION reject_immutable_child_change();

CREATE TRIGGER revision_warnings_v2_append_only
BEFORE UPDATE OR DELETE ON revision_warnings_v2
FOR EACH ROW EXECUTE FUNCTION reject_immutable_child_change();

CREATE TRIGGER revision_lifecycle_events_append_only
BEFORE UPDATE OR DELETE ON revision_lifecycle_events
FOR EACH ROW EXECUTE FUNCTION reject_immutable_child_change();

CREATE TRIGGER user_administration_audit_events_append_only
BEFORE UPDATE OR DELETE ON user_administration_audit_events
FOR EACH ROW EXECUTE FUNCTION reject_immutable_child_change();

CREATE FUNCTION guard_v2_revision_child_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  parent_schema_version varchar(64);
  parent_status varchar(16);
BEGIN
  SELECT snapshot_schema_version, status
    INTO parent_schema_version, parent_status
    FROM revisions
   WHERE id = NEW.revision_id;

  IF parent_schema_version IS NULL THEN
    RETURN NEW;
  END IF;
  IF parent_schema_version <> 'revision-snapshot/v2' THEN
    RAISE EXCEPTION 'v2 revision artifacts require a v2 revision'
      USING ERRCODE = '23514';
  END IF;
  IF parent_status <> 'calculated' THEN
    RAISE EXCEPTION 'revision artifacts can only be inserted before lifecycle review'
      USING ERRCODE = '55000';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM revision_lifecycle_events event
     WHERE event.revision_id = NEW.revision_id
       AND event.action = 'revision.saved'
       AND event.outcome = 'succeeded'
  ) THEN
    RAISE EXCEPTION 'saved revision artifacts are sealed'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER revision_bom_lines_v2_guard_insert
BEFORE INSERT ON revision_bom_lines_v2
FOR EACH ROW EXECUTE FUNCTION guard_v2_revision_child_insert();

CREATE TRIGGER revision_warnings_v2_guard_insert
BEFORE INSERT ON revision_warnings_v2
FOR EACH ROW EXECUTE FUNCTION guard_v2_revision_child_insert();

CREATE FUNCTION require_v2_revision_lifecycle_event() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  expected_action varchar(64);
  expected_prior varchar(16);
  expected_result varchar(16);
  expected_bom_count integer;
  expected_warning_count integer;
  expected_blocking_count integer;
  expected_review_count integer;
BEGIN
  IF NEW.snapshot_schema_version <> 'revision-snapshot/v2' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    expected_action := 'revision.saved';
    expected_prior := NULL;
    expected_result := 'calculated';

    IF jsonb_typeof(NEW.calculation_result_snapshot->'bomLines') <> 'array'
       OR jsonb_typeof(NEW.calculation_result_snapshot->'warnings') <> 'array' THEN
      RAISE EXCEPTION 'v2 calculation result requires BOM and warning arrays'
        USING ERRCODE = '23514';
    END IF;

    expected_bom_count := jsonb_array_length(NEW.calculation_result_snapshot->'bomLines');
    expected_warning_count := jsonb_array_length(NEW.calculation_result_snapshot->'warnings');

    IF (SELECT count(*) FROM revision_bom_lines_v2 line WHERE line.revision_id = NEW.id)
         <> expected_bom_count
       OR EXISTS (
         SELECT 1
           FROM jsonb_array_elements(NEW.calculation_result_snapshot->'bomLines')
             WITH ORDINALITY AS expected(payload, position)
           LEFT JOIN revision_bom_lines_v2 line
             ON line.revision_id = NEW.id
            AND line.line_order = (expected.position - 1)::integer
          WHERE line.id IS NULL
             OR line.line_snapshot IS DISTINCT FROM expected.payload
       ) THEN
      RAISE EXCEPTION 'v2 normalized BOM projection is incomplete or not lossless'
        USING ERRCODE = '23514';
    END IF;

    IF (SELECT count(*) FROM revision_warnings_v2 warning WHERE warning.revision_id = NEW.id)
         <> expected_warning_count
       OR EXISTS (
         SELECT 1
           FROM jsonb_array_elements(NEW.calculation_result_snapshot->'warnings')
             WITH ORDINALITY AS expected(payload, position)
           LEFT JOIN revision_warnings_v2 warning
             ON warning.revision_id = NEW.id
            AND warning.warning_order = (expected.position - 1)::integer
          WHERE warning.id IS NULL
             OR warning.warning_payload IS DISTINCT FROM expected.payload
       ) THEN
      RAISE EXCEPTION 'v2 normalized warning projection is incomplete or not lossless'
        USING ERRCODE = '23514';
    END IF;

    SELECT (count(*) FILTER (WHERE payload->>'approvalImpact' = 'blocksApproval'))::integer,
           (count(*) FILTER (WHERE payload->>'approvalImpact' = 'reviewRequired'))::integer
      INTO expected_blocking_count, expected_review_count
      FROM jsonb_array_elements(NEW.calculation_result_snapshot->'warnings') AS item(payload);

    IF NEW.warning_summary->'totalCount' IS DISTINCT FROM to_jsonb(expected_warning_count)
       OR NEW.warning_summary->'blocksApprovalCount'
            IS DISTINCT FROM to_jsonb(expected_blocking_count)
       OR NEW.warning_summary->'reviewRequiredCount'
            IS DISTINCT FROM to_jsonb(expected_review_count) THEN
      RAISE EXCEPTION 'v2 warning summary does not reconcile with saved warnings'
        USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  ELSIF NEW.status = 'checked' THEN
    expected_action := 'revision.checked';
    expected_prior := 'calculated';
    expected_result := 'checked';
  ELSIF NEW.status = 'approved' THEN
    expected_action := 'revision.approved';
    expected_prior := 'checked';
    expected_result := 'approved';
  ELSIF NEW.status = 'archived' THEN
    expected_action := 'revision.archived';
    expected_prior := OLD.status;
    expected_result := 'archived';
  ELSE
    RAISE EXCEPTION 'unsupported v2 revision lifecycle state'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM revision_lifecycle_events event
     WHERE event.revision_id = NEW.id
       AND event.project_id = NEW.project_id
       AND event.action = expected_action
       AND event.outcome = 'succeeded'
       AND event.prior_status IS NOT DISTINCT FROM expected_prior
       AND event.resulting_status = expected_result
       AND event.input_fingerprint = NEW.input_fingerprint
       AND event.engine_version = NEW.engine_version
       AND event.catalog_snapshot_id = NEW.catalog_snapshot_id
       AND event.rule_snapshot_id = NEW.rule_snapshot_id
  ) THEN
    RAISE EXCEPTION 'v2 revision lifecycle transition requires matching append-only audit evidence'
      USING ERRCODE = '23514';
  END IF;

  IF expected_action = 'revision.approved'
     AND NOT EXISTS (
       SELECT 1
         FROM approvals approval
        WHERE approval.revision_id = NEW.id
          AND approval.decision = 'approved'
     ) THEN
    RAISE EXCEPTION 'v2 approval transition requires an immutable approval decision'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE CONSTRAINT TRIGGER revisions_require_v2_lifecycle_event
AFTER INSERT OR UPDATE ON revisions
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION require_v2_revision_lifecycle_event();

CREATE FUNCTION guard_revision_approval() RETURNS trigger
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
   WHERE id = NEW.actor_id;

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

CREATE TRIGGER approvals_guard_insert
BEFORE INSERT ON approvals
FOR EACH ROW EXECUTE FUNCTION guard_revision_approval();

CREATE FUNCTION require_v2_approval_transition() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  current_revision_status varchar(16);
  current_snapshot_schema_version varchar(64);
BEGIN
  SELECT status, snapshot_schema_version
    INTO current_revision_status, current_snapshot_schema_version
    FROM revisions
   WHERE id = NEW.revision_id;

  IF NEW.decision <> 'approved'
     OR current_snapshot_schema_version <> 'revision-snapshot/v2' THEN
    RETURN NEW;
  END IF;

  IF current_revision_status <> 'approved'
     OR NOT EXISTS (
       SELECT 1
         FROM revision_lifecycle_events event
        WHERE event.revision_id = NEW.revision_id
          AND event.action = 'revision.approved'
          AND event.outcome = 'succeeded'
          AND event.actor_id = NEW.actor_id
          AND event.actor_role = NEW.actor_role
          AND event.correlation_id = NEW.correlation_id
          AND event.prior_status = 'checked'
          AND event.resulting_status = 'approved'
     ) THEN
    RAISE EXCEPTION 'v2 approval decision requires its matching approved transition and audit event'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE CONSTRAINT TRIGGER approvals_require_v2_transition
AFTER INSERT ON approvals
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION require_v2_approval_transition();

CREATE UNIQUE INDEX approvals_one_approved_per_revision_idx
  ON approvals (revision_id)
  WHERE decision = 'approved';

COMMENT ON COLUMN revisions.comment IS
  'Optional bounded Stage 8 human comment; retained v1 description semantics remain unchanged.';
COMMENT ON TABLE revision_bom_lines_v2 IS
  'Lossless immutable normalized projection of exact CalculationResultV2 BOM lines.';
COMMENT ON TABLE revision_warnings_v2 IS
  'Lossless immutable normalized projection of exact CalculationResultV2 warnings.';
COMMENT ON TABLE revision_lifecycle_events IS
  'Append-only Stage 8 save/check/approve/archive evidence; payload snapshots remain on revisions.';
COMMENT ON TABLE user_administration_audit_events IS
  'Append-only bounded security audit for administrator-created users, roles, and enabled state.';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'niedax_generator_app') THEN
    REVOKE UPDATE, DELETE, TRUNCATE ON revisions FROM niedax_generator_app;
    GRANT SELECT, INSERT ON revisions TO niedax_generator_app;
    GRANT UPDATE (status, checked_at, approved_at, archived_at, updated_at)
      ON revisions TO niedax_generator_app;

    REVOKE UPDATE, DELETE, TRUNCATE ON revision_bom_lines_v2 FROM niedax_generator_app;
    GRANT SELECT, INSERT ON revision_bom_lines_v2 TO niedax_generator_app;
    REVOKE UPDATE, DELETE, TRUNCATE ON revision_warnings_v2 FROM niedax_generator_app;
    GRANT SELECT, INSERT ON revision_warnings_v2 TO niedax_generator_app;
    REVOKE UPDATE, DELETE, TRUNCATE ON revision_lifecycle_events FROM niedax_generator_app;
    GRANT SELECT, INSERT ON revision_lifecycle_events TO niedax_generator_app;
    REVOKE UPDATE, DELETE, TRUNCATE ON user_administration_audit_events
      FROM niedax_generator_app;
    GRANT SELECT, INSERT ON user_administration_audit_events TO niedax_generator_app;

    REVOKE UPDATE, DELETE, TRUNCATE ON approvals FROM niedax_generator_app;
    GRANT SELECT, INSERT ON approvals TO niedax_generator_app;
    REVOKE UPDATE, DELETE, TRUNCATE ON idempotency_records FROM niedax_generator_app;
    GRANT SELECT, INSERT ON idempotency_records TO niedax_generator_app;
  END IF;
END
$$;
