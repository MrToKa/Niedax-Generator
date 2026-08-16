ALTER TYPE canonical_unit ADD VALUE IF NOT EXISTS 'pairs';
ALTER TYPE canonical_unit ADD VALUE IF NOT EXISTS 'Nm';

ALTER TABLE catalog_versions DROP CONSTRAINT catalog_versions_status_check;
ALTER TABLE catalog_versions ADD CONSTRAINT catalog_versions_status_check
  CHECK (status IN ('draft', 'validated', 'approved', 'active', 'archived'));
ALTER TABLE catalog_versions DROP CONSTRAINT catalog_versions_lifecycle_dates;
ALTER TABLE catalog_versions
  ADD COLUMN validated_content_hash varchar(71) NULL
    CHECK (validated_content_hash IS NULL OR validated_content_hash ~ '^sha256:[0-9a-f]{64}$'),
  ADD COLUMN approved_content_hash varchar(71) NULL
    CHECK (approved_content_hash IS NULL OR approved_content_hash ~ '^sha256:[0-9a-f]{64}$'),
  ADD COLUMN approved_at timestamptz NULL,
  ADD COLUMN approved_by uuid NULL REFERENCES users(id) ON DELETE SET NULL ON UPDATE RESTRICT,
  ADD COLUMN validation_report_id uuid NULL;

UPDATE catalog_versions
SET validated_content_hash = content_hash,
    approved_content_hash = content_hash,
    approved_at = coalesce(activated_at, validated_at, created_at)
WHERE status IN ('active', 'archived');

ALTER TABLE catalog_versions ADD CONSTRAINT catalog_versions_lifecycle_dates CHECK (
  updated_at >= created_at
  AND (validated_at IS NULL OR validated_at >= created_at)
  AND (approved_at IS NULL OR approved_at >= coalesce(validated_at, created_at))
  AND (activated_at IS NULL OR activated_at >= coalesce(approved_at, validated_at, created_at))
  AND (archived_at IS NULL OR archived_at >= coalesce(activated_at, approved_at, validated_at, created_at))
  AND (status <> 'validated' OR (
    validated_at IS NOT NULL AND validated_content_hash = content_hash
  ))
  AND (status <> 'approved' OR (
    validated_at IS NOT NULL AND validated_content_hash = content_hash
    AND approved_at IS NOT NULL AND approved_content_hash = content_hash
  ))
  AND (status <> 'active' OR (
    validated_at IS NOT NULL AND validated_content_hash = content_hash
    AND approved_at IS NOT NULL AND approved_content_hash = content_hash
    AND activated_at IS NOT NULL
  ))
  AND (status <> 'archived' OR archived_at IS NOT NULL)
);

ALTER TABLE product_sources
  ADD COLUMN source_pdf_page integer NULL CHECK (source_pdf_page > 0),
  ADD COLUMN source_table_or_row varchar(255) NULL;

ALTER TABLE products
  ADD COLUMN normalized_code varchar(100) GENERATED ALWAYS AS (lower(btrim(product_code))) STORED,
  ADD COLUMN is_orderable boolean NOT NULL DEFAULT true,
  ADD COLUMN indoor_only boolean NOT NULL DEFAULT false,
  ADD COLUMN engineering_verification_required boolean NOT NULL DEFAULT false,
  ADD COLUMN engineering_note text NULL,
  ADD COLUMN weight_basis_quantity numeric(24, 8) NULL CHECK (weight_basis_quantity > 0),
  ADD COLUMN weight_basis_unit varchar(32) NULL CHECK (
    weight_basis_unit IS NULL OR weight_basis_unit IN ('kg_per_100_m', 'kg_per_100_pcs', 'kg_per_100_pairs')
  ),
  ADD CONSTRAINT products_weight_basis_pair CHECK (
    (weight_basis_quantity IS NULL) = (weight_basis_unit IS NULL)
  ),
  ADD CONSTRAINT products_engineering_note CHECK (
    NOT engineering_verification_required OR (engineering_note IS NOT NULL AND btrim(engineering_note) <> '')
  );

CREATE INDEX products_normalized_code_idx ON products (catalog_version_id, normalized_code);

CREATE TABLE catalog_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_version_id uuid NOT NULL REFERENCES catalog_versions(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  file_name varchar(255) NOT NULL,
  media_type varchar(128) NOT NULL,
  file_size_bytes bigint NOT NULL CHECK (file_size_bytes > 0 AND file_size_bytes <= 26214400),
  declared_scope varchar(128) NOT NULL,
  content_hash varchar(71) NOT NULL CHECK (content_hash ~ '^sha256:[0-9a-f]{64}$'),
  normalized_bundle jsonb NOT NULL CHECK (jsonb_typeof(normalized_bundle) = 'object'),
  status varchar(16) NOT NULL CHECK (status IN ('draft', 'validated', 'invalid', 'superseded')),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT catalog_imports_candidate_hash_unique UNIQUE (catalog_version_id, content_hash)
);

CREATE INDEX catalog_imports_candidate_idx ON catalog_imports (catalog_version_id, created_at DESC);

CREATE TABLE catalog_validation_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_version_id uuid NOT NULL REFERENCES catalog_versions(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  import_id uuid NOT NULL REFERENCES catalog_imports(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  content_hash varchar(71) NOT NULL CHECK (content_hash ~ '^sha256:[0-9a-f]{64}$'),
  schema_version varchar(64) NOT NULL,
  is_valid boolean NOT NULL,
  error_count integer NOT NULL CHECK (error_count >= 0),
  warning_count integer NOT NULL CHECK (warning_count >= 0),
  conflict_count integer NOT NULL CHECK (conflict_count >= 0),
  report jsonb NOT NULL CHECK (jsonb_typeof(report) = 'object'),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT catalog_validation_reports_import_hash_unique UNIQUE (import_id, content_hash),
  CONSTRAINT catalog_validation_reports_valid_counts CHECK (
    NOT is_valid OR (error_count = 0 AND conflict_count = 0)
  )
);

ALTER TABLE catalog_versions
  ADD CONSTRAINT catalog_versions_validation_report_fk
  FOREIGN KEY (validation_report_id) REFERENCES catalog_validation_reports(id)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE TABLE catalog_conflict_resolutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_version_id uuid NOT NULL REFERENCES catalog_versions(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  validation_report_id uuid NOT NULL REFERENCES catalog_validation_reports(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  conflict_code varchar(128) NOT NULL,
  product_code varchar(100) NULL,
  field_name varchar(128) NULL,
  selected_source_document varchar(255) NOT NULL,
  selected_value text NOT NULL,
  policy_reason text NOT NULL CHECK (btrim(policy_reason) <> ''),
  resolved_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  correlation_id varchar(128) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT catalog_conflict_resolution_unique
    UNIQUE (validation_report_id, conflict_code, product_code, field_name)
);

CREATE TABLE catalog_version_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_version_id uuid NOT NULL REFERENCES catalog_versions(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  validation_report_id uuid NOT NULL REFERENCES catalog_validation_reports(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  content_hash varchar(71) NOT NULL CHECK (content_hash ~ '^sha256:[0-9a-f]{64}$'),
  approved_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  reason text NOT NULL CHECK (btrim(reason) <> ''),
  correlation_id varchar(128) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT catalog_version_approvals_hash_unique UNIQUE (catalog_version_id, content_hash)
);

CREATE FUNCTION enforce_catalog_approval_exact_hash() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  candidate catalog_versions%ROWTYPE;
  report catalog_validation_reports%ROWTYPE;
  actor_role varchar(32);
BEGIN
  SELECT * INTO STRICT candidate FROM catalog_versions WHERE id = NEW.catalog_version_id;
  SELECT * INTO STRICT report FROM catalog_validation_reports WHERE id = NEW.validation_report_id;
  SELECT role INTO STRICT actor_role FROM users WHERE id = NEW.approved_by;
  IF actor_role <> 'administrator' THEN
    RAISE EXCEPTION 'catalog approval requires an administrator'
      USING ERRCODE = '42501';
  END IF;
  IF candidate.status <> 'validated'
     OR candidate.content_hash <> NEW.content_hash
     OR candidate.validated_content_hash <> NEW.content_hash
     OR candidate.validation_report_id <> NEW.validation_report_id
     OR report.catalog_version_id <> NEW.catalog_version_id
     OR report.content_hash <> NEW.content_hash
     OR NOT report.is_valid THEN
    RAISE EXCEPTION 'catalog approval must reference the exact valid report and content hash'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER catalog_version_approvals_exact_hash
BEFORE INSERT ON catalog_version_approvals
FOR EACH ROW EXECUTE FUNCTION enforce_catalog_approval_exact_hash();

CREATE TABLE catalog_version_transitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_version_id uuid NOT NULL REFERENCES catalog_versions(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  prior_state varchar(16) NULL CHECK (
    prior_state IS NULL OR prior_state IN ('draft', 'validated', 'approved', 'active', 'archived')
  ),
  new_state varchar(16) NOT NULL CHECK (
    new_state IN ('draft', 'validated', 'approved', 'active', 'archived')
  ),
  validation_report_id uuid NULL REFERENCES catalog_validation_reports(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  approval_id uuid NULL REFERENCES catalog_version_approvals(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  actor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  reason text NOT NULL CHECK (btrim(reason) <> ''),
  correlation_id varchar(128) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX catalog_version_transitions_audit_idx
  ON catalog_version_transitions (catalog_version_id, created_at, id);

CREATE FUNCTION enforce_catalog_version_transition() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> NEW.status AND NOT (
    (OLD.status = 'draft' AND NEW.status = 'validated')
    OR (OLD.status = 'validated' AND NEW.status = 'approved')
    OR (OLD.status = 'approved' AND NEW.status = 'active')
    OR (OLD.status = 'active' AND NEW.status = 'archived')
    OR (OLD.status IN ('validated', 'approved') AND NEW.status = 'draft' AND OLD.content_hash <> NEW.content_hash)
  ) THEN
    RAISE EXCEPTION 'invalid catalog lifecycle transition: % -> %', OLD.status, NEW.status
      USING ERRCODE = '23514';
  END IF;

  IF OLD.content_hash <> NEW.content_hash AND (
    NEW.status <> 'draft'
    OR NEW.validated_at IS NOT NULL OR NEW.approved_at IS NOT NULL
    OR NEW.validation_report_id IS NOT NULL OR NEW.validated_content_hash IS NOT NULL
    OR NEW.approved_content_hash IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'catalog content changes must remain draft and invalidate validation/approval'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER catalog_versions_enforce_transition
BEFORE UPDATE ON catalog_versions
FOR EACH ROW EXECUTE FUNCTION enforce_catalog_version_transition();

CREATE TRIGGER catalog_validation_reports_append_only
BEFORE UPDATE OR DELETE ON catalog_validation_reports
FOR EACH ROW EXECUTE FUNCTION reject_immutable_child_change();
CREATE TRIGGER catalog_conflict_resolutions_append_only
BEFORE UPDATE OR DELETE ON catalog_conflict_resolutions
FOR EACH ROW EXECUTE FUNCTION reject_immutable_child_change();
CREATE TRIGGER catalog_version_approvals_append_only
BEFORE UPDATE OR DELETE ON catalog_version_approvals
FOR EACH ROW EXECUTE FUNCTION reject_immutable_child_change();
CREATE TRIGGER catalog_version_transitions_append_only
BEFORE UPDATE OR DELETE ON catalog_version_transitions
FOR EACH ROW EXECUTE FUNCTION reject_immutable_child_change();

COMMENT ON TABLE catalog_imports IS 'Mutable draft staging payload; active catalog tables are populated only from validated content.';
COMMENT ON TABLE catalog_validation_reports IS 'Immutable validation and semantic-diff evidence tied to an exact candidate content hash.';
COMMENT ON TABLE catalog_version_approvals IS 'Append-only administrator approval of one exact validated catalog content hash.';
COMMENT ON TABLE catalog_version_transitions IS 'Append-only catalog lifecycle audit including actor, reason, correlation ID, report, and approval.';
