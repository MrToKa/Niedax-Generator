CREATE TABLE catalog_source_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_version_id uuid NOT NULL REFERENCES catalog_versions(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  validation_report_id uuid NOT NULL REFERENCES catalog_validation_reports(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  product_code varchar(100) NOT NULL,
  field_name varchar(128) NOT NULL,
  value_text text NOT NULL,
  source_document varchar(255) NOT NULL,
  source_printed_page varchar(64) NOT NULL,
  source_pdf_page integer NULL CHECK (source_pdf_page > 0),
  is_authoritative_for_candidate boolean NOT NULL,
  resolution_policy text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT catalog_source_observations_unique UNIQUE (
    validation_report_id, product_code, field_name, source_document, source_printed_page, value_text
  )
);

CREATE TRIGGER catalog_source_observations_append_only
BEFORE UPDATE OR DELETE ON catalog_source_observations
FOR EACH ROW EXECUTE FUNCTION reject_immutable_child_change();

COMMENT ON TABLE catalog_source_observations IS 'Immutable parallel official-source facts retained without last-write-wins merging.';
