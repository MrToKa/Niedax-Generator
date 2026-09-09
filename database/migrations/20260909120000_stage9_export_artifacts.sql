-- Export snapshots and bytes belong to the local database and its existing backup boundary.
-- Enforce the existing append-only idempotency contract for schema-owner connections as well as the app ACL.
CREATE TRIGGER idempotency_records_append_only BEFORE UPDATE OR DELETE ON idempotency_records
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_child_change();
CREATE TRIGGER idempotency_records_no_truncate BEFORE TRUNCATE ON idempotency_records
  FOR EACH STATEMENT EXECUTE FUNCTION reject_immutable_child_change();

CREATE TABLE export_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_id uuid NOT NULL REFERENCES revisions(id) ON DELETE RESTRICT,
  requested_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  correlation_id varchar(128) NOT NULL,
  cache_identity varchar(71) NOT NULL CHECK (cache_identity ~ '^sha256:[0-9a-f]{64}$'),
  context_payload jsonb NOT NULL CHECK (jsonb_typeof(context_payload) = 'object' AND
    (context_payload->>'schemaVersion') IS NOT DISTINCT FROM 'english-export-context/v3'),
  status varchar(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ready','failed')),
  format varchar(8) NOT NULL DEFAULT 'xlsx' CHECK (format = 'xlsx'),
  language varchar(2) NOT NULL DEFAULT 'en' CHECK (language = 'en'),
  created_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
  claim_token uuid,
  lease_until timestamptz,
  completed_at timestamptz,
  failure_code varchar(32) CHECK (failure_code IN (
    'TEMPLATE_UNAVAILABLE','UNSUPPORTED_REVISION','RENDER_FAILED','RECOVERY_EXHAUSTED')),
  file_name varchar(180) CHECK (file_name ~ '^[A-Za-z0-9][A-Za-z0-9._-]*\.xlsx$'),
  media_type text CHECK (media_type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
  content_bytes bytea,
  content_length integer CHECK (content_length BETWEEN 1 AND 52428800),
  content_hash varchar(71) CHECK (content_hash ~ '^sha256:[0-9a-f]{64}$'),
  CONSTRAINT export_artifact_state CHECK (
    (status = 'pending' AND completed_at IS NULL AND failure_code IS NULL
      AND content_bytes IS NULL AND content_length IS NULL AND content_hash IS NULL
      AND file_name IS NULL AND media_type IS NULL)
    OR (status = 'failed' AND completed_at IS NOT NULL AND failure_code IS NOT NULL
      AND content_bytes IS NULL AND content_length IS NULL AND content_hash IS NULL
      AND file_name IS NULL AND media_type IS NULL AND claim_token IS NULL AND lease_until IS NULL)
    OR (status = 'ready' AND completed_at IS NOT NULL AND failure_code IS NULL
      AND content_bytes IS NOT NULL AND content_length IS NOT NULL AND content_hash IS NOT NULL
      AND file_name IS NOT NULL AND media_type IS NOT NULL AND claim_token IS NULL AND lease_until IS NULL
      AND content_length = octet_length(content_bytes)
      AND content_hash = 'sha256:' || encode(sha256(content_bytes),'hex'))
  ),
  CONSTRAINT export_claim_pair CHECK ((claim_token IS NULL) = (lease_until IS NULL)),
  CONSTRAINT export_context_revision CHECK ((context_payload->'revision'->>'id') IS NOT DISTINCT FROM revision_id::text)
);

CREATE INDEX export_artifacts_revision_idx ON export_artifacts(revision_id,created_at DESC,id DESC);
CREATE UNIQUE INDEX export_artifacts_cache_idx ON export_artifacts(revision_id,cache_identity)
  WHERE status IN ('pending','ready');
CREATE INDEX export_artifacts_recovery_idx ON export_artifacts(created_at,id) WHERE status = 'pending';

CREATE FUNCTION guard_export_request() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  actor_role text;
  source revisions%ROWTYPE;
BEGIN
  SELECT role INTO actor_role FROM users WHERE id=NEW.requested_by AND enabled FOR SHARE;
  IF actor_role IS NULL OR actor_role NOT IN ('designer','reviewer','administrator') THEN
    RAISE EXCEPTION 'An enabled export creator is required' USING ERRCODE='42501';
  END IF;
  SELECT revision.* INTO source FROM revisions revision JOIN projects project ON project.id=revision.project_id
    WHERE revision.id=NEW.revision_id AND (actor_role <> 'designer' OR project.owner_id=NEW.requested_by)
    FOR SHARE OF revision,project;
  IF source.id IS NULL OR source.snapshot_schema_version <> 'revision-snapshot/v2' THEN
    RAISE EXCEPTION 'A readable supported saved revision is required' USING ERRCODE='42501';
  END IF;
  IF NEW.status <> 'pending' OR NEW.attempts <> 0 OR NEW.claim_token IS NOT NULL THEN
    RAISE EXCEPTION 'Export requests must start unclaimed and pending' USING ERRCODE='23514';
  END IF;
  IF NEW.context_payload->'checksums'->>'revisionChecksum' IS DISTINCT FROM source.revision_checksum
    OR NEW.context_payload->'revision'->>'status' IS DISTINCT FROM source.status
    OR NEW.context_payload->'snapshot'->'project' IS DISTINCT FROM source.project_snapshot
    OR NEW.context_payload->'snapshot'->'calculationInput' IS DISTINCT FROM source.input_snapshot
    OR NEW.context_payload->'snapshot'->'calculationResult' IS DISTINCT FROM source.calculation_result_snapshot THEN
    RAISE EXCEPTION 'Export context must capture the exact saved evidence' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER export_artifacts_request_guard BEFORE INSERT ON export_artifacts
  FOR EACH ROW EXECUTE FUNCTION guard_export_request();

CREATE FUNCTION protect_export_artifact() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD.status <> 'pending' THEN
    RAISE EXCEPTION 'Export artifacts are immutable after finalization' USING ERRCODE = '55000';
  END IF;
  IF (to_jsonb(NEW) - ARRAY['status','attempts','claim_token','lease_until','completed_at',
      'failure_code','file_name','media_type','content_bytes','content_length','content_hash'])
    IS DISTINCT FROM
    (to_jsonb(OLD) - ARRAY['status','attempts','claim_token','lease_until','completed_at',
      'failure_code','file_name','media_type','content_bytes','content_length','content_hash']) THEN
    RAISE EXCEPTION 'Captured export evidence is immutable' USING ERRCODE = '55000';
  END IF;
  IF NEW.attempts < OLD.attempts OR NEW.attempts > OLD.attempts + 1 THEN
    RAISE EXCEPTION 'Export attempts must advance monotonically' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER export_artifacts_immutable BEFORE UPDATE OR DELETE ON export_artifacts
  FOR EACH ROW EXECUTE FUNCTION protect_export_artifact();
CREATE TRIGGER export_artifacts_no_truncate BEFORE TRUNCATE ON export_artifacts
  FOR EACH STATEMENT EXECUTE FUNCTION reject_immutable_child_change();

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'niedax_generator_app') THEN
    REVOKE ALL PRIVILEGES ON export_artifacts FROM niedax_generator_app;
    GRANT SELECT,INSERT ON export_artifacts TO niedax_generator_app;
    GRANT UPDATE (status,attempts,claim_token,lease_until,completed_at,failure_code,
      file_name,media_type,content_bytes,content_length,content_hash)
      ON export_artifacts TO niedax_generator_app;
  END IF;
END
$$;
