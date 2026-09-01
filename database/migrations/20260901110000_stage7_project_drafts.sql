CREATE TABLE project_draft_documents (
  project_id uuid PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE ON UPDATE RESTRICT,
  draft_version integer NOT NULL CHECK (draft_version > 0),
  schema_version varchar(64) NOT NULL CHECK (schema_version = 'project-draft-document/v2'),
  payload jsonb NOT NULL CHECK (
    jsonb_typeof(payload) = 'object'
    AND payload->>'schemaVersion' = schema_version
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_draft_documents_dates CHECK (updated_at >= created_at)
);

COMMENT ON TABLE project_draft_documents IS
  'Authoritative strict versioned Stage 7 draft payload; mutable and replaced atomically with the project draft version.';

-- Stage 7 deliberately persists incomplete editor drafts.  The strict document above is
-- authoritative while these existing graph tables remain the queryable relational projection.
-- Fields that are required only at calculation time therefore cannot remain storage-time NOT NULL
-- boundaries.
ALTER TABLE routes
  ALTER COLUMN system_series_id DROP NOT NULL,
  ALTER COLUMN default_section_length_m DROP NOT NULL;

ALTER TABLE support_configurations
  ALTER COLUMN spacing_m DROP NOT NULL,
  ALTER COLUMN support_type DROP NOT NULL,
  ALTER COLUMN assembly_template_id DROP NOT NULL,
  ALTER COLUMN construction_base DROP NOT NULL,
  ALTER COLUMN anchor_product_id DROP NOT NULL,
  ALTER COLUMN anchor_size_mm DROP NOT NULL,
  ALTER COLUMN anchors_per_mounting_point DROP NOT NULL,
  ALTER COLUMN wstb_mode DROP NOT NULL,
  ALTER COLUMN wstb_quantity_per_support DROP NOT NULL;

ALTER TABLE calculation_drafts
  ADD COLUMN calculated_draft_version integer NULL;

ALTER TABLE calculation_drafts
  ADD CONSTRAINT calculation_drafts_draft_version_nonnegative
    CHECK (calculated_draft_version IS NULL OR calculated_draft_version >= 0);

COMMENT ON COLUMN calculation_drafts.calculated_draft_version IS
  'Exact Stage 7 draft version used for a v2 calculation; NULL means unknowable retained pre-Stage7 data.';

DROP INDEX calculation_drafts_fingerprint_idx;
CREATE INDEX calculation_drafts_fingerprint_idx
  ON calculation_drafts (project_id, calculated_draft_version, input_fingerprint, engine_version);

ALTER TABLE idempotency_records
  ADD COLUMN response_schema_version varchar(64) NULL,
  ADD COLUMN response_payload jsonb NULL,
  -- Historical v1 keys were not constrained to the Stage 7 public format. NOT VALID preserves
  -- those immutable replay records while PostgreSQL enforces the check for every new write.
  ADD CONSTRAINT idempotency_records_key_format CHECK (
    idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
  ) NOT VALID,
  ADD CONSTRAINT idempotency_records_response_pair CHECK (
    (response_schema_version IS NULL AND response_payload IS NULL)
    OR (
      response_schema_version IS NOT NULL
      AND btrim(response_schema_version) <> ''
      AND jsonb_typeof(response_payload) = 'object'
      AND response_payload->>'schemaVersion' = response_schema_version
    )
  );

CREATE TABLE project_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  actor_id uuid NULL REFERENCES users(id) ON DELETE SET NULL ON UPDATE RESTRICT,
  action varchar(64) NOT NULL CHECK (action IN (
    'project.created', 'project.draft_replaced', 'project.calculated'
  )),
  correlation_id varchar(128) NOT NULL CHECK (
    correlation_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
  ),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX project_audit_events_project_idx
  ON project_audit_events (project_id, created_at, id);
CREATE INDEX project_audit_events_correlation_idx
  ON project_audit_events (correlation_id);

CREATE TRIGGER project_audit_events_append_only
BEFORE UPDATE OR DELETE ON project_audit_events
FOR EACH ROW EXECUTE FUNCTION reject_immutable_child_change();

COMMENT ON TABLE project_audit_events IS
  'Append-only bounded audit metadata for Stage 7 project creation, draft replacement, and calculation.';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'niedax_generator_app') THEN
    REVOKE UPDATE, DELETE, TRUNCATE ON project_audit_events FROM niedax_generator_app;
    GRANT SELECT, INSERT ON project_audit_events TO niedax_generator_app;
  END IF;
END
$$;
