CREATE TYPE canonical_unit AS ENUM ('pcs', 'm', 'mm', 'kg', 'kgPerM', 'packages');

CREATE TABLE catalog_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope varchar(64) NOT NULL DEFAULT 'niedax',
  version varchar(64) NOT NULL,
  label varchar(200) NOT NULL,
  source_edition varchar(200) NULL,
  source_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  content_hash varchar(71) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'validated', 'active', 'archived')),
  import_provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  validation_schema_version varchar(64) NOT NULL,
  validated_at timestamptz NULL,
  activated_at timestamptz NULL,
  archived_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL REFERENCES users(id) ON DELETE SET NULL ON UPDATE RESTRICT,
  updated_by uuid NULL REFERENCES users(id) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT catalog_versions_scope_version_unique UNIQUE (scope, version),
  CONSTRAINT catalog_versions_content_hash_format
    CHECK (content_hash ~ '^sha256:[0-9a-f]{64}$'),
  CONSTRAINT catalog_versions_json_objects
    CHECK (jsonb_typeof(source_metadata) = 'object' AND jsonb_typeof(import_provenance) = 'object'),
  CONSTRAINT catalog_versions_lifecycle_dates CHECK (
    updated_at >= created_at
    AND (validated_at IS NULL OR validated_at >= created_at)
    AND (activated_at IS NULL OR activated_at >= coalesce(validated_at, created_at))
    AND (archived_at IS NULL OR archived_at >= coalesce(activated_at, validated_at, created_at))
    AND (status <> 'validated' OR validated_at IS NOT NULL)
    AND (status <> 'active' OR (validated_at IS NOT NULL AND activated_at IS NOT NULL))
    AND (status <> 'archived' OR archived_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX catalog_versions_one_active_per_scope_idx
  ON catalog_versions (scope) WHERE status = 'active';
CREATE INDEX catalog_versions_status_idx ON catalog_versions (status, version);

CREATE TABLE product_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_version_id uuid NOT NULL REFERENCES catalog_versions(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  document_identity varchar(255) NOT NULL,
  title varchar(500) NOT NULL,
  edition varchar(200) NULL,
  source_page varchar(64) NOT NULL,
  locale varchar(8) NOT NULL CHECK (locale IN ('bg', 'en', 'de', 'multi')),
  reference_uri text NULL,
  source_hash varchar(71) NULL CHECK (source_hash IS NULL OR source_hash ~ '^sha256:[0-9a-f]{64}$'),
  verification_status varchar(32) NOT NULL
    CHECK (verification_status IN ('unverified', 'verified', 'superseded')),
  verified_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_sources_catalog_identity_unique
    UNIQUE (catalog_version_id, document_identity, source_page, locale),
  CONSTRAINT product_sources_id_catalog_unique UNIQUE (id, catalog_version_id),
  CONSTRAINT product_sources_verification_date CHECK (
    updated_at >= created_at
    AND (verified_at IS NULL OR verified_at >= created_at)
    AND (verification_status <> 'verified' OR verified_at IS NOT NULL)
  )
);

CREATE INDEX product_sources_document_idx ON product_sources (catalog_version_id, document_identity);

CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_version_id uuid NOT NULL REFERENCES catalog_versions(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  product_code varchar(100) NOT NULL,
  category varchar(32) NOT NULL CHECK (category IN (
    'straightSection', 'fitting', 'support', 'structure', 'anchor', 'wstb', 'accessory', 'other'
  )),
  family varchar(128) NULL,
  series varchar(128) NULL,
  description_bg text NULL,
  description_en text NOT NULL,
  material varchar(128) NULL,
  coating varchar(128) NULL,
  variant_key varchar(200) NOT NULL DEFAULT 'default',
  base_unit canonical_unit NOT NULL,
  minimum_package_quantity numeric(24, 8) NULL CHECK (minimum_package_quantity > 0),
  packaging_unit canonical_unit NULL,
  mass_value numeric(24, 8) NULL CHECK (mass_value >= 0),
  mass_unit canonical_unit NULL,
  availability_status varchar(16) NOT NULL DEFAULT 'active'
    CHECK (availability_status IN ('active', 'inactive', 'superseded', 'archived')),
  available_from date NULL,
  available_until date NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL REFERENCES users(id) ON DELETE SET NULL ON UPDATE RESTRICT,
  updated_by uuid NULL REFERENCES users(id) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT products_id_catalog_unique UNIQUE (id, catalog_version_id),
  CONSTRAINT products_package_pair CHECK (
    (minimum_package_quantity IS NULL) = (packaging_unit IS NULL)
  ),
  CONSTRAINT products_mass_pair CHECK ((mass_value IS NULL) = (mass_unit IS NULL)),
  CONSTRAINT products_availability_dates CHECK (
    updated_at >= created_at AND (available_until IS NULL OR available_from IS NULL OR available_until >= available_from)
  )
);

CREATE UNIQUE INDEX products_catalog_code_unique_idx
  ON products (catalog_version_id, lower(product_code));
CREATE UNIQUE INDEX products_catalog_variant_unique_idx
  ON products (catalog_version_id, lower(product_code), lower(variant_key));
CREATE INDEX products_catalog_category_idx
  ON products (catalog_version_id, category, family, series);
CREATE INDEX products_available_idx
  ON products (catalog_version_id, category, product_code)
  WHERE availability_status = 'active';

CREATE TABLE product_source_links (
  product_id uuid NOT NULL,
  catalog_version_id uuid NOT NULL,
  source_id uuid NOT NULL,
  fact_scope varchar(128) NOT NULL DEFAULT 'product',
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, source_id, fact_scope),
  FOREIGN KEY (product_id, catalog_version_id)
    REFERENCES products(id, catalog_version_id) ON DELETE CASCADE ON UPDATE RESTRICT,
  FOREIGN KEY (source_id, catalog_version_id)
    REFERENCES product_sources(id, catalog_version_id) ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX product_source_links_one_primary_idx
  ON product_source_links (product_id) WHERE is_primary;
CREATE INDEX product_source_links_source_idx ON product_source_links (source_id);

CREATE TABLE product_attributes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE ON UPDATE RESTRICT,
  attribute_key varchar(128) NOT NULL,
  value_type varchar(16) NOT NULL CHECK (value_type IN ('text', 'numeric', 'boolean', 'json')),
  value_text text NULL,
  value_numeric numeric(24, 8) NULL,
  value_boolean boolean NULL,
  value_json jsonb NULL,
  unit canonical_unit NULL,
  source_id uuid NULL REFERENCES product_sources(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_attributes_product_key_unique UNIQUE (product_id, attribute_key),
  CONSTRAINT product_attributes_typed_value CHECK (
    (value_type = 'text' AND value_text IS NOT NULL AND num_nonnulls(value_numeric, value_boolean, value_json) = 0 AND unit IS NULL)
    OR (value_type = 'numeric' AND value_numeric IS NOT NULL AND num_nonnulls(value_text, value_boolean, value_json) = 0)
    OR (value_type = 'boolean' AND value_boolean IS NOT NULL AND num_nonnulls(value_text, value_numeric, value_json) = 0 AND unit IS NULL)
    OR (value_type = 'json' AND value_json IS NOT NULL AND num_nonnulls(value_text, value_numeric, value_boolean) = 0 AND unit IS NULL)
  ),
  CONSTRAINT product_attributes_json_container CHECK (
    value_json IS NULL OR jsonb_typeof(value_json) IN ('object', 'array')
  ),
  CONSTRAINT product_attributes_dates CHECK (updated_at >= created_at)
);

CREATE INDEX product_attributes_lookup_idx ON product_attributes (attribute_key, value_numeric);

CREATE TABLE included_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_product_id uuid NOT NULL,
  catalog_version_id uuid NOT NULL,
  included_product_id uuid NULL,
  included_item_code varchar(100) NULL,
  included_description text NULL,
  included_quantity numeric(24, 8) NOT NULL CHECK (included_quantity > 0),
  unit canonical_unit NOT NULL,
  applicability_conditions jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(applicability_conditions) = 'object'),
  source_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (parent_product_id, catalog_version_id)
    REFERENCES products(id, catalog_version_id) ON DELETE CASCADE ON UPDATE RESTRICT,
  FOREIGN KEY (included_product_id, catalog_version_id)
    REFERENCES products(id, catalog_version_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  FOREIGN KEY (source_id, catalog_version_id)
    REFERENCES product_sources(id, catalog_version_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT included_items_identity_xor CHECK (
    (included_product_id IS NOT NULL AND included_description IS NULL)
    OR (included_product_id IS NULL AND included_description IS NOT NULL AND btrim(included_description) <> '')
  ),
  CONSTRAINT included_items_not_self CHECK (included_product_id IS NULL OR included_product_id <> parent_product_id)
);

CREATE UNIQUE INDEX included_items_product_unique_idx
  ON included_items (parent_product_id, included_product_id) WHERE included_product_id IS NOT NULL;
CREATE UNIQUE INDEX included_items_text_unique_idx
  ON included_items (parent_product_id, lower(included_description)) WHERE included_description IS NOT NULL;

CREATE TABLE rule_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope varchar(64) NOT NULL DEFAULT 'niedax',
  version varchar(64) NOT NULL,
  label varchar(200) NOT NULL,
  content_hash varchar(71) NOT NULL CHECK (content_hash ~ '^sha256:[0-9a-f]{64}$'),
  schema_version varchar(64) NOT NULL,
  catalog_version_id uuid NOT NULL REFERENCES catalog_versions(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  status varchar(16) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'validated', 'active', 'archived')),
  validated_at timestamptz NULL,
  activated_at timestamptz NULL,
  archived_at timestamptz NULL,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(provenance) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL REFERENCES users(id) ON DELETE SET NULL ON UPDATE RESTRICT,
  updated_by uuid NULL REFERENCES users(id) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT rule_sets_scope_version_unique UNIQUE (scope, version),
  CONSTRAINT rule_sets_lifecycle_dates CHECK (
    updated_at >= created_at
    AND (validated_at IS NULL OR validated_at >= created_at)
    AND (activated_at IS NULL OR activated_at >= coalesce(validated_at, created_at))
    AND (archived_at IS NULL OR archived_at >= coalesce(activated_at, validated_at, created_at))
    AND (status <> 'validated' OR validated_at IS NOT NULL)
    AND (status <> 'active' OR (validated_at IS NOT NULL AND activated_at IS NOT NULL))
    AND (status <> 'archived' OR archived_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX rule_sets_one_active_per_scope_idx ON rule_sets (scope) WHERE status = 'active';
CREATE INDEX rule_sets_catalog_status_idx ON rule_sets (catalog_version_id, status);

CREATE TABLE compatibility_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_set_id uuid NOT NULL REFERENCES rule_sets(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  stable_code varchar(128) NOT NULL,
  version varchar(64) NOT NULL,
  status varchar(16) NOT NULL CHECK (status IN ('draft', 'active', 'retired')),
  priority integer NOT NULL CHECK (priority >= 0),
  decision varchar(16) NOT NULL CHECK (decision IN ('allowed', 'disallowed', 'conditional')),
  condition_schema_version varchar(64) NOT NULL,
  condition_payload jsonb NOT NULL CHECK (jsonb_typeof(condition_payload) = 'object'),
  outcome_schema_version varchar(64) NOT NULL,
  outcome_payload jsonb NOT NULL CHECK (jsonb_typeof(outcome_payload) = 'object'),
  reason_bg text NULL,
  reason_en text NOT NULL,
  confidence varchar(32) NOT NULL CHECK (confidence IN (
    'catalogConfirmed', 'calculated', 'projectRule', 'engineeringReview', 'manual'
  )),
  source_id uuid NULL REFERENCES product_sources(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL REFERENCES users(id) ON DELETE SET NULL ON UPDATE RESTRICT,
  updated_by uuid NULL REFERENCES users(id) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT compatibility_rules_identity_unique UNIQUE (rule_set_id, stable_code, version),
  CONSTRAINT compatibility_rules_dates CHECK (updated_at >= created_at)
);

CREATE INDEX compatibility_rules_evaluation_idx
  ON compatibility_rules (rule_set_id, status, priority, stable_code);

CREATE TABLE calculation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_set_id uuid NOT NULL REFERENCES rule_sets(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  stable_code varchar(128) NOT NULL,
  version varchar(64) NOT NULL,
  rule_type varchar(64) NOT NULL CHECK (rule_type IN (
    'sectionSelection', 'reserveHandling', 'packagingRounding', 'supportSpacing',
    'fittingSupportOverride', 'wstbPerSupport', 'endpointMaterial', 'connectionAssembly', 'other'
  )),
  status varchar(16) NOT NULL CHECK (status IN ('draft', 'active', 'retired')),
  priority integer NOT NULL CHECK (priority >= 0),
  parameter_schema_version varchar(64) NOT NULL,
  parameters jsonb NOT NULL CHECK (jsonb_typeof(parameters) = 'object'),
  confidence varchar(32) NOT NULL CHECK (confidence IN (
    'catalogConfirmed', 'calculated', 'projectRule', 'engineeringReview', 'manual'
  )),
  reason_bg text NULL,
  reason_en text NOT NULL,
  source_id uuid NULL REFERENCES product_sources(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL REFERENCES users(id) ON DELETE SET NULL ON UPDATE RESTRICT,
  updated_by uuid NULL REFERENCES users(id) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT calculation_rules_identity_unique UNIQUE (rule_set_id, stable_code, version),
  CONSTRAINT calculation_rules_dates CHECK (updated_at >= created_at)
);

CREATE INDEX calculation_rules_evaluation_idx
  ON calculation_rules (rule_set_id, status, priority, rule_type);

CREATE TABLE assembly_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_version_id uuid NOT NULL REFERENCES catalog_versions(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  rule_set_id uuid NOT NULL REFERENCES rule_sets(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  stable_code varchar(128) NOT NULL,
  version varchar(64) NOT NULL,
  status varchar(16) NOT NULL CHECK (status IN ('draft', 'active', 'retired')),
  template_type varchar(32) NOT NULL CHECK (template_type IN ('wall', 'ceiling', 'floor', 'multiLevel', 'custom')),
  name_bg varchar(500) NULL,
  name_en varchar(500) NOT NULL,
  description_bg text NULL,
  description_en text NULL,
  applicability_schema_version varchar(64) NOT NULL,
  applicability jsonb NOT NULL CHECK (jsonb_typeof(applicability) = 'object'),
  source_id uuid NULL REFERENCES product_sources(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL REFERENCES users(id) ON DELETE SET NULL ON UPDATE RESTRICT,
  updated_by uuid NULL REFERENCES users(id) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT assembly_templates_identity_unique UNIQUE (rule_set_id, stable_code, version),
  CONSTRAINT assembly_templates_id_catalog_unique UNIQUE (id, catalog_version_id),
  CONSTRAINT assembly_templates_dates CHECK (updated_at >= created_at)
);

CREATE INDEX assembly_templates_active_idx
  ON assembly_templates (rule_set_id, template_type, stable_code) WHERE status = 'active';

CREATE TABLE template_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL,
  catalog_version_id uuid NOT NULL,
  component_role varchar(64) NOT NULL,
  product_id uuid NULL,
  quantity numeric(24, 8) NULL CHECK (quantity > 0),
  quantity_expression jsonb NULL,
  expression_schema_version varchar(64) NULL,
  unit canonical_unit NOT NULL,
  sequence integer NOT NULL CHECK (sequence >= 0),
  is_required boolean NOT NULL DEFAULT true,
  suppress_when_included boolean NOT NULL DEFAULT true,
  anchor_count integer NULL CHECK (anchor_count > 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  FOREIGN KEY (template_id, catalog_version_id)
    REFERENCES assembly_templates(id, catalog_version_id) ON DELETE CASCADE ON UPDATE RESTRICT,
  FOREIGN KEY (product_id, catalog_version_id)
    REFERENCES products(id, catalog_version_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT template_components_quantity_xor CHECK (
    (quantity IS NOT NULL AND quantity_expression IS NULL AND expression_schema_version IS NULL)
    OR (quantity IS NULL AND quantity_expression IS NOT NULL AND expression_schema_version IS NOT NULL
      AND jsonb_typeof(quantity_expression) = 'object')
  ),
  CONSTRAINT template_components_role_sequence_unique UNIQUE (template_id, component_role, sequence)
);

CREATE INDEX template_components_template_idx ON template_components (template_id, sequence);

CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(100) NOT NULL,
  name varchar(500) NOT NULL,
  description text NULL,
  status varchar(16) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'calculated', 'checked', 'approved', 'archived')),
  default_locale varchar(2) NOT NULL DEFAULT 'bg' CHECK (default_locale IN ('bg', 'en')),
  export_locale varchar(2) NOT NULL DEFAULT 'en' CHECK (export_locale = 'en'),
  default_spare_percent numeric(7, 4) NOT NULL DEFAULT 0 CHECK (default_spare_percent BETWEEN 0 AND 100),
  cable_load_kg_per_m numeric(24, 8) NULL CHECK (cable_load_kg_per_m >= 0),
  draft_version integer NOT NULL DEFAULT 0 CHECK (draft_version >= 0),
  active_catalog_version_id uuid NOT NULL REFERENCES catalog_versions(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  active_rule_set_id uuid NOT NULL REFERENCES rule_sets(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  owner_id uuid NULL REFERENCES users(id) ON DELETE SET NULL ON UPDATE RESTRICT,
  created_by uuid NULL REFERENCES users(id) ON DELETE SET NULL ON UPDATE RESTRICT,
  updated_by uuid NULL REFERENCES users(id) ON DELETE SET NULL ON UPDATE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz NULL,
  CONSTRAINT projects_code_unique UNIQUE (code),
  CONSTRAINT projects_dates CHECK (
    updated_at >= created_at AND (archived_at IS NULL OR archived_at >= created_at)
    AND (status <> 'archived' OR archived_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX projects_code_case_insensitive_idx ON projects (lower(code));
CREATE INDEX projects_owner_status_idx ON projects (owner_id, status, updated_at DESC);

CREATE TABLE routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE ON UPDATE RESTRICT,
  code varchar(100) NOT NULL,
  name varchar(500) NOT NULL,
  description text NULL,
  system_series_id varchar(128) NOT NULL,
  product_family varchar(128) NULL,
  material varchar(128) NULL,
  coating varchar(128) NULL,
  nominal_width_mm numeric(24, 8) NULL CHECK (nominal_width_mm > 0),
  nominal_height_mm numeric(24, 8) NULL CHECK (nominal_height_mm > 0),
  default_section_length_m numeric(4, 1) NOT NULL CHECK (default_section_length_m IN (3, 6)),
  reserve_percent_override numeric(7, 4) NULL CHECK (reserve_percent_override BETWEEN 0 AND 100),
  packaging_rounding_override boolean NULL,
  sequence integer NOT NULL CHECK (sequence >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT routes_id_project_unique UNIQUE (id, project_id),
  CONSTRAINT routes_project_sequence_unique UNIQUE (project_id, sequence),
  CONSTRAINT routes_dates CHECK (updated_at >= created_at)
);

CREATE UNIQUE INDEX routes_project_code_unique_idx ON routes (project_id, lower(code));
CREATE INDEX routes_project_idx ON routes (project_id, sequence);

CREATE TABLE segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id uuid NOT NULL,
  project_id uuid NOT NULL,
  sequence integer NOT NULL CHECK (sequence >= 0),
  length_m numeric(24, 8) NOT NULL CHECK (length_m > 0),
  geometry jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(geometry) = 'object'),
  section_length_override_m numeric(4, 1) NULL CHECK (section_length_override_m IN (3, 6)),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (route_id, project_id) REFERENCES routes(id, project_id) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT segments_route_sequence_unique UNIQUE (route_id, sequence),
  CONSTRAINT segments_dates CHECK (updated_at >= created_at)
);

CREATE INDEX segments_route_idx ON segments (route_id, sequence);

CREATE TABLE fittings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id uuid NOT NULL,
  project_id uuid NOT NULL,
  fitting_type varchar(32) NOT NULL CHECK (fitting_type IN (
    'horizontalBend', 'verticalBend', 'tee', 'transition', 'reducer', 'custom'
  )),
  sequence integer NOT NULL CHECK (sequence >= 0),
  position_m numeric(24, 8) NULL CHECK (position_m >= 0),
  geometry jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(geometry) = 'object'),
  orientation varchar(32) NULL CHECK (orientation IS NULL OR orientation IN ('horizontal', 'vertical', 'left', 'right', 'up', 'down')),
  selected_product_id uuid NULL REFERENCES products(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  additional_supports_before integer NULL CHECK (additional_supports_before >= 0),
  additional_supports_after integer NULL CHECK (additional_supports_after >= 0),
  custom_description text NULL,
  manual_metadata jsonb NULL CHECK (manual_metadata IS NULL OR jsonb_typeof(manual_metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (route_id, project_id) REFERENCES routes(id, project_id) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT fittings_route_sequence_unique UNIQUE (route_id, sequence),
  CONSTRAINT fittings_custom_metadata CHECK (
    fitting_type <> 'custom' OR (custom_description IS NOT NULL AND btrim(custom_description) <> '')
  ),
  CONSTRAINT fittings_dates CHECK (updated_at >= created_at)
);

CREATE INDEX fittings_route_idx ON fittings (route_id, sequence);

CREATE TABLE route_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id uuid NOT NULL,
  project_id uuid NOT NULL,
  position varchar(8) NOT NULL CHECK (position IN ('start', 'end')),
  endpoint_kind varchar(32) NOT NULL CHECK (endpoint_kind IN (
    'freeEnd', 'endCap', 'equipment', 'routeContinuation', 'physicalSplice', 'custom'
  )),
  selected_product_id uuid NULL REFERENCES products(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  equipment_reference varchar(500) NULL,
  custom_description text NULL,
  material_behavior jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(material_behavior) = 'object'),
  validation_metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(validation_metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (route_id, project_id) REFERENCES routes(id, project_id) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT route_endpoints_route_position_unique UNIQUE (route_id, position),
  CONSTRAINT route_endpoints_id_project_unique UNIQUE (id, project_id),
  CONSTRAINT route_endpoints_equipment_reference CHECK (
    endpoint_kind <> 'equipment' OR (equipment_reference IS NOT NULL AND btrim(equipment_reference) <> '')
  ),
  CONSTRAINT route_endpoints_custom_description CHECK (
    endpoint_kind <> 'custom' OR (custom_description IS NOT NULL AND btrim(custom_description) <> '')
  ),
  CONSTRAINT route_endpoints_dates CHECK (updated_at >= created_at)
);

CREATE INDEX route_endpoints_route_idx ON route_endpoints (route_id, position);

CREATE TABLE route_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE ON UPDATE RESTRICT,
  connection_type varchar(32) NOT NULL CHECK (connection_type IN (
    'logicalContinuation', 'physicalSplice', 'horizontalBend', 'verticalBend', 'tee', 'transition', 'custom'
  )),
  physical_material_behavior varchar(16) NOT NULL CHECK (physical_material_behavior IN ('none', 'connector', 'fitting', 'custom')),
  support_behavior varchar(16) NOT NULL CHECK (support_behavior IN ('shared', 'separate')),
  supports_before integer NOT NULL DEFAULT 0 CHECK (supports_before >= 0),
  supports_after integer NOT NULL DEFAULT 0 CHECK (supports_after >= 0),
  connector_product_id uuid NULL REFERENCES products(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  fitting_product_id uuid NULL REFERENCES products(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  notes text NULL,
  created_by uuid NULL REFERENCES users(id) ON DELETE SET NULL ON UPDATE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT route_connections_id_project_unique UNIQUE (id, project_id),
  CONSTRAINT route_connections_logical_material CHECK (
    connection_type <> 'logicalContinuation' OR physical_material_behavior = 'none'
  ),
  CONSTRAINT route_connections_dates CHECK (updated_at >= created_at)
);

CREATE INDEX route_connections_project_idx ON route_connections (project_id, created_at);

CREATE TABLE route_connection_endpoints (
  connection_id uuid NOT NULL,
  endpoint_id uuid NOT NULL,
  project_id uuid NOT NULL,
  participant_order smallint NOT NULL CHECK (participant_order BETWEEN 0 AND 2),
  participant_role varchar(16) NOT NULL CHECK (participant_role IN ('from', 'to', 'branch')),
  PRIMARY KEY (connection_id, endpoint_id),
  FOREIGN KEY (connection_id, project_id)
    REFERENCES route_connections(id, project_id) ON DELETE CASCADE ON UPDATE RESTRICT,
  FOREIGN KEY (endpoint_id, project_id)
    REFERENCES route_endpoints(id, project_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT route_connection_endpoints_order_unique UNIQUE (connection_id, participant_order),
  CONSTRAINT route_connection_endpoints_role_unique UNIQUE (connection_id, participant_role)
);

CREATE UNIQUE INDEX route_connection_endpoints_cardinality_idx ON route_connection_endpoints (endpoint_id);
CREATE INDEX route_connection_endpoints_lookup_idx ON route_connection_endpoints (connection_id, participant_order);

CREATE TABLE support_configurations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id uuid NOT NULL,
  project_id uuid NOT NULL,
  spacing_m numeric(24, 8) NOT NULL CHECK (spacing_m > 0),
  support_type varchar(16) NOT NULL CHECK (support_type IN ('wall', 'ceiling', 'floor', 'custom')),
  assembly_template_id uuid NOT NULL REFERENCES assembly_templates(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  construction_base varchar(16) NOT NULL CHECK (construction_base IN ('concrete', 'steel', 'masonry', 'unknown')),
  anchor_product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  anchor_size_mm numeric(24, 8) NOT NULL CHECK (anchor_size_mm > 0),
  anchors_per_mounting_point numeric(24, 8) NOT NULL CHECK (anchors_per_mounting_point > 0),
  wstb_mode varchar(8) NOT NULL CHECK (wstb_mode IN ('one', 'two', 'manual')),
  wstb_quantity_per_support numeric(24, 8) NOT NULL CHECK (wstb_quantity_per_support >= 0),
  fitting_supports_before integer NOT NULL DEFAULT 0 CHECK (fitting_supports_before >= 0),
  fitting_supports_after integer NOT NULL DEFAULT 0 CHECK (fitting_supports_after >= 0),
  connection_support_behavior varchar(16) NOT NULL CHECK (connection_support_behavior IN ('shared', 'separate')),
  engineering_review_required boolean NOT NULL DEFAULT true,
  engineering_review_state varchar(16) NOT NULL DEFAULT 'required'
    CHECK (engineering_review_state IN ('required', 'reviewed', 'rejected')),
  review_reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (route_id, project_id) REFERENCES routes(id, project_id) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT support_configurations_route_unique UNIQUE (route_id),
  CONSTRAINT support_configurations_wstb_mode CHECK (
    (wstb_mode = 'one' AND wstb_quantity_per_support = 1)
    OR (wstb_mode = 'two' AND wstb_quantity_per_support = 2)
    OR (wstb_mode = 'manual')
  ),
  CONSTRAINT support_configurations_review_boundary CHECK (
    engineering_review_required OR engineering_review_state = 'reviewed'
  ),
  CONSTRAINT support_configurations_dates CHECK (updated_at >= created_at)
);

CREATE INDEX support_configurations_project_idx ON support_configurations (project_id, route_id);

CREATE TABLE calculation_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE ON UPDATE RESTRICT,
  calculation_schema_version varchar(64) NOT NULL,
  engine_version varchar(64) NOT NULL,
  input_fingerprint varchar(71) NOT NULL CHECK (input_fingerprint ~ '^sha256:[0-9a-f]{64}$'),
  idempotency_key varchar(128) NOT NULL,
  catalog_version_id uuid NOT NULL REFERENCES catalog_versions(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  rule_set_id uuid NOT NULL REFERENCES rule_sets(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  status varchar(16) NOT NULL CHECK (status IN ('requested', 'running', 'succeeded', 'failed')),
  correlation_id varchar(128) NOT NULL,
  input_payload jsonb NOT NULL CHECK (jsonb_typeof(input_payload) = 'object'),
  result_schema_version varchar(64) NULL,
  result_payload jsonb NULL CHECK (result_payload IS NULL OR jsonb_typeof(result_payload) = 'object'),
  started_at timestamptz NOT NULL,
  completed_at timestamptz NULL,
  failure_code varchar(128) NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT calculation_drafts_project_unique UNIQUE (project_id),
  CONSTRAINT calculation_drafts_idempotency_unique UNIQUE (project_id, idempotency_key),
  CONSTRAINT calculation_drafts_status_payload CHECK (
    (status = 'succeeded' AND result_payload IS NOT NULL AND result_schema_version IS NOT NULL AND completed_at IS NOT NULL AND failure_code IS NULL)
    OR (status = 'failed' AND completed_at IS NOT NULL AND failure_code IS NOT NULL)
    OR (status IN ('requested', 'running') AND result_payload IS NULL AND completed_at IS NULL AND failure_code IS NULL)
  ),
  CONSTRAINT calculation_drafts_dates CHECK (
    updated_at >= created_at AND (completed_at IS NULL OR completed_at >= started_at)
  )
);

CREATE INDEX calculation_drafts_current_idx ON calculation_drafts (project_id, updated_at DESC);
CREATE INDEX calculation_drafts_fingerprint_idx
  ON calculation_drafts (project_id, input_fingerprint, engine_version);
CREATE INDEX calculation_drafts_correlation_idx ON calculation_drafts (correlation_id);

CREATE TABLE manual_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE ON UPDATE RESTRICT,
  route_id uuid NULL,
  calculation_draft_id uuid NULL REFERENCES calculation_drafts(id) ON DELETE CASCADE ON UPDATE RESTRICT,
  catalog_product_id uuid NULL REFERENCES products(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  free_text_description text NULL,
  quantity numeric(24, 8) NOT NULL CHECK (quantity > 0),
  unit canonical_unit NOT NULL,
  reason text NOT NULL CHECK (btrim(reason) <> ''),
  note text NULL,
  reserve_applicable boolean NOT NULL DEFAULT false,
  packaging_rounding_applicable boolean NOT NULL DEFAULT false,
  origin varchar(32) NOT NULL CHECK (origin IN ('user', 'connection', 'endpoint', 'projectRule', 'engineeringReview')),
  status varchar(32) NOT NULL CHECK (status IN ('catalogConfirmed', 'projectRule', 'engineeringReview', 'manual')),
  created_by uuid NULL REFERENCES users(id) ON DELETE SET NULL ON UPDATE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (route_id, project_id) REFERENCES routes(id, project_id) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT manual_items_identity_xor CHECK (
    (catalog_product_id IS NOT NULL AND free_text_description IS NULL)
    OR (catalog_product_id IS NULL AND free_text_description IS NOT NULL AND btrim(free_text_description) <> '')
  ),
  CONSTRAINT manual_items_dates CHECK (updated_at >= created_at)
);

CREATE INDEX manual_items_project_route_idx ON manual_items (project_id, route_id);
CREATE INDEX manual_items_draft_idx ON manual_items (calculation_draft_id);

CREATE TABLE revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  revision_number integer NOT NULL CHECK (revision_number > 0),
  name varchar(500) NULL,
  description text NULL,
  status varchar(16) NOT NULL DEFAULT 'calculated'
    CHECK (status IN ('calculated', 'checked', 'approved', 'archived')),
  calculation_schema_version varchar(64) NOT NULL,
  engine_version varchar(64) NOT NULL,
  snapshot_schema_version varchar(64) NOT NULL,
  input_fingerprint varchar(71) NOT NULL CHECK (input_fingerprint ~ '^sha256:[0-9a-f]{64}$'),
  input_checksum varchar(71) NOT NULL CHECK (input_checksum ~ '^sha256:[0-9a-f]{64}$'),
  snapshot_checksum varchar(71) NOT NULL CHECK (snapshot_checksum ~ '^sha256:[0-9a-f]{64}$'),
  bom_checksum varchar(71) NOT NULL CHECK (bom_checksum ~ '^sha256:[0-9a-f]{64}$'),
  input_snapshot jsonb NOT NULL CHECK (jsonb_typeof(input_snapshot) = 'object'),
  catalog_snapshot jsonb NOT NULL CHECK (jsonb_typeof(catalog_snapshot) = 'object'),
  rule_template_snapshot jsonb NOT NULL CHECK (jsonb_typeof(rule_template_snapshot) = 'object'),
  calculation_result_snapshot jsonb NOT NULL CHECK (jsonb_typeof(calculation_result_snapshot) = 'object'),
  idempotency_key varchar(128) NOT NULL,
  correlation_id varchar(128) NOT NULL,
  created_by uuid NULL REFERENCES users(id) ON DELETE SET NULL ON UPDATE RESTRICT,
  created_by_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(created_by_snapshot) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  checked_at timestamptz NULL,
  approved_at timestamptz NULL,
  archived_at timestamptz NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT revisions_project_number_unique UNIQUE (project_id, revision_number),
  CONSTRAINT revisions_idempotency_unique UNIQUE (project_id, idempotency_key),
  CONSTRAINT revisions_fingerprint_unique UNIQUE (id, input_fingerprint),
  CONSTRAINT revisions_lifecycle CHECK (
    updated_at >= created_at
    AND (checked_at IS NULL OR checked_at >= created_at)
    AND (approved_at IS NULL OR approved_at >= coalesce(checked_at, created_at))
    AND (archived_at IS NULL OR archived_at >= created_at)
    AND (status <> 'checked' OR (checked_at IS NOT NULL AND approved_at IS NULL))
    AND (status <> 'approved' OR (checked_at IS NOT NULL AND approved_at IS NOT NULL))
    AND (status <> 'archived' OR archived_at IS NOT NULL)
  )
);

CREATE INDEX revisions_history_idx ON revisions (project_id, revision_number DESC);
CREATE INDEX revisions_correlation_idx ON revisions (correlation_id);

CREATE TABLE bom_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_id uuid NOT NULL REFERENCES revisions(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  line_identity varchar(128) NOT NULL,
  line_order integer NOT NULL CHECK (line_order >= 0),
  category varchar(32) NOT NULL CHECK (category IN (
    'linearSection', 'fitting', 'support', 'structure', 'anchor', 'wstb', 'accessory', 'manual'
  )),
  live_product_id uuid NULL REFERENCES products(id) ON DELETE SET NULL ON UPDATE RESTRICT,
  product_snapshot jsonb NOT NULL CHECK (jsonb_typeof(product_snapshot) = 'object'),
  product_code varchar(100) NULL,
  description_bg text NULL,
  description_en text NOT NULL,
  material varchar(128) NULL,
  coating varchar(128) NULL,
  technical_quantity numeric(24, 8) NOT NULL CHECK (technical_quantity > 0),
  reserve_quantity numeric(24, 8) NOT NULL CHECK (reserve_quantity >= 0),
  packaging_quantity numeric(24, 8) NOT NULL CHECK (packaging_quantity >= 0),
  package_size numeric(24, 8) NOT NULL CHECK (package_size > 0),
  ordered_packages numeric(24, 8) NOT NULL CHECK (ordered_packages >= 0),
  order_quantity numeric(24, 8) NOT NULL CHECK (order_quantity >= 0),
  spare_quantity numeric(24, 8) NOT NULL CHECK (spare_quantity >= 0),
  unit canonical_unit NOT NULL,
  mass_value numeric(24, 8) NULL CHECK (mass_value >= 0),
  mass_unit canonical_unit NULL,
  included_items_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(included_items_snapshot) = 'array'),
  source_snapshot jsonb NOT NULL CHECK (jsonb_typeof(source_snapshot) = 'object'),
  origin varchar(32) NOT NULL CHECK (origin IN (
    'catalogConfirmed', 'calculated', 'projectRule', 'engineeringReview', 'manual'
  )),
  rule_template_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(rule_template_snapshot) = 'object'),
  manual_adjustment_snapshot jsonb NULL CHECK (
    manual_adjustment_snapshot IS NULL OR jsonb_typeof(manual_adjustment_snapshot) = 'object'
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bom_lines_revision_identity_unique UNIQUE (revision_id, line_identity),
  CONSTRAINT bom_lines_revision_order_unique UNIQUE (revision_id, line_order),
  CONSTRAINT bom_lines_mass_pair CHECK ((mass_value IS NULL) = (mass_unit IS NULL))
);

CREATE INDEX bom_lines_revision_idx ON bom_lines (revision_id, line_order);

CREATE TABLE warnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calculation_draft_id uuid NULL REFERENCES calculation_drafts(id) ON DELETE CASCADE ON UPDATE RESTRICT,
  revision_id uuid NULL REFERENCES revisions(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  warning_identity varchar(128) NOT NULL,
  code varchar(128) NOT NULL,
  category varchar(64) NOT NULL CHECK (category IN (
    'missingLoad', 'supportSpacingOutOfRange', 'incompatibleSupport', 'missingConstructionBase',
    'unconfirmedAnchor', 'fittingSupportUndefined', 'mixedMaterialCoating', 'missingProductVariant',
    'manualQuantityOverride', 'provisionalProjectRule', 'catalogVersionUnconfirmed', 'validation', 'other'
  )),
  severity varchar(24) NOT NULL CHECK (severity IN ('info', 'warning', 'error', 'engineeringReview')),
  message_bg text NULL,
  message_en text NOT NULL,
  message_parameters jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(message_parameters) = 'object'),
  affected_entity varchar(64) NULL,
  affected_entity_id varchar(128) NULL,
  affected_field varchar(256) NULL,
  source_status varchar(32) NOT NULL CHECK (source_status IN (
    'catalogConfirmed', 'calculated', 'projectRule', 'engineeringReview', 'manual'
  )),
  acknowledged_at timestamptz NULL,
  acknowledged_by uuid NULL REFERENCES users(id) ON DELETE SET NULL ON UPDATE RESTRICT,
  resolution_state varchar(16) NOT NULL DEFAULT 'open' CHECK (resolution_state IN ('open', 'acknowledged', 'resolved')),
  snapshot_context jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(snapshot_context) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT warnings_scope_xor CHECK (num_nonnulls(calculation_draft_id, revision_id) = 1),
  CONSTRAINT warnings_acknowledgement CHECK (
    (resolution_state = 'open' AND acknowledged_at IS NULL AND acknowledged_by IS NULL)
    OR (resolution_state IN ('acknowledged', 'resolved') AND acknowledged_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX warnings_draft_identity_idx
  ON warnings (calculation_draft_id, warning_identity) WHERE calculation_draft_id IS NOT NULL;
CREATE UNIQUE INDEX warnings_revision_identity_idx
  ON warnings (revision_id, warning_identity) WHERE revision_id IS NOT NULL;
CREATE INDEX warnings_revision_idx ON warnings (revision_id, severity, code);
CREATE INDEX warnings_draft_idx ON warnings (calculation_draft_id, severity, code);

CREATE TABLE approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_id uuid NOT NULL REFERENCES revisions(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  decision varchar(16) NOT NULL CHECK (decision IN ('approved', 'rejected')),
  actor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  actor_role varchar(32) NOT NULL CHECK (actor_role IN ('administrator', 'reviewer')),
  actor_snapshot jsonb NOT NULL CHECK (jsonb_typeof(actor_snapshot) = 'object'),
  comment text NULL,
  reason text NULL,
  decided_at timestamptz NOT NULL DEFAULT now(),
  correlation_id varchar(128) NOT NULL,
  idempotency_key varchar(128) NOT NULL,
  CONSTRAINT approvals_idempotency_unique UNIQUE (revision_id, idempotency_key)
);

CREATE INDEX approvals_revision_idx ON approvals (revision_id, decided_at);
CREATE INDEX approvals_correlation_idx ON approvals (correlation_id);

CREATE TABLE idempotency_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope varchar(128) NOT NULL,
  idempotency_key varchar(128) NOT NULL,
  request_hash varchar(71) NOT NULL CHECK (request_hash ~ '^sha256:[0-9a-f]{64}$'),
  resource_type varchar(64) NOT NULL,
  resource_id uuid NOT NULL,
  response_status integer NOT NULL CHECK (response_status BETWEEN 100 AND 599),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NULL,
  CONSTRAINT idempotency_records_scope_key_unique UNIQUE (scope, idempotency_key),
  CONSTRAINT idempotency_records_dates CHECK (expires_at IS NULL OR expires_at > created_at)
);

CREATE INDEX idempotency_records_resource_idx ON idempotency_records (resource_type, resource_id);

CREATE FUNCTION assert_product_has_source(target_product_id uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM products WHERE id = target_product_id)
     AND NOT EXISTS (SELECT 1 FROM product_source_links WHERE product_id = target_product_id) THEN
    RAISE EXCEPTION 'product % must have at least one source', target_product_id USING ERRCODE = '23514';
  END IF;
END
$$;

CREATE FUNCTION check_product_source_cardinality() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'products' THEN
    PERFORM assert_product_has_source(coalesce(NEW.id, OLD.id));
  ELSE
    IF TG_OP <> 'INSERT' THEN PERFORM assert_product_has_source(OLD.product_id); END IF;
    IF TG_OP <> 'DELETE' AND (TG_OP = 'INSERT' OR NEW.product_id IS DISTINCT FROM OLD.product_id) THEN
      PERFORM assert_product_has_source(NEW.product_id);
    END IF;
  END IF;
  RETURN NULL;
END
$$;

CREATE CONSTRAINT TRIGGER products_require_source
AFTER INSERT OR UPDATE ON products DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION check_product_source_cardinality();
CREATE CONSTRAINT TRIGGER product_source_links_preserve_source
AFTER INSERT OR UPDATE OR DELETE ON product_source_links DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION check_product_source_cardinality();

CREATE FUNCTION assert_route_endpoint_cardinality(target_route_id uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE endpoint_count integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM routes WHERE id = target_route_id) THEN RETURN; END IF;
  SELECT count(*) INTO endpoint_count FROM route_endpoints WHERE route_id = target_route_id;
  IF endpoint_count <> 2
     OR NOT EXISTS (SELECT 1 FROM route_endpoints WHERE route_id = target_route_id AND position = 'start')
     OR NOT EXISTS (SELECT 1 FROM route_endpoints WHERE route_id = target_route_id AND position = 'end') THEN
    RAISE EXCEPTION 'route % must have exactly one start and one end endpoint', target_route_id
      USING ERRCODE = '23514';
  END IF;
END
$$;

CREATE FUNCTION check_route_endpoint_cardinality() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'routes' THEN
    IF TG_OP <> 'DELETE' THEN PERFORM assert_route_endpoint_cardinality(NEW.id); END IF;
  ELSE
    IF TG_OP <> 'INSERT' THEN PERFORM assert_route_endpoint_cardinality(OLD.route_id); END IF;
    IF TG_OP <> 'DELETE' AND (TG_OP = 'INSERT' OR NEW.route_id IS DISTINCT FROM OLD.route_id) THEN
      PERFORM assert_route_endpoint_cardinality(NEW.route_id);
    END IF;
  END IF;
  RETURN NULL;
END
$$;

CREATE CONSTRAINT TRIGGER routes_require_endpoints
AFTER INSERT OR UPDATE ON routes DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION check_route_endpoint_cardinality();
CREATE CONSTRAINT TRIGGER route_endpoints_preserve_cardinality
AFTER INSERT OR UPDATE OR DELETE ON route_endpoints DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION check_route_endpoint_cardinality();

CREATE FUNCTION assert_connection_cardinality(target_connection_id uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE connection_kind varchar(32);
DECLARE participant_count integer;
DECLARE route_count integer;
DECLARE position_count integer;
DECLARE continuation_count integer;
BEGIN
  SELECT connection_type INTO connection_kind FROM route_connections WHERE id = target_connection_id;
  IF connection_kind IS NULL THEN RETURN; END IF;

  SELECT count(*), count(DISTINCT endpoint.route_id), count(DISTINCT endpoint.position),
         count(*) FILTER (WHERE endpoint.endpoint_kind = 'routeContinuation')
    INTO participant_count, route_count, position_count, continuation_count
    FROM route_connection_endpoints participant
    JOIN route_endpoints endpoint ON endpoint.id = participant.endpoint_id
   WHERE participant.connection_id = target_connection_id;

  IF route_count <> participant_count THEN
    RAISE EXCEPTION 'connection % cannot use two endpoints from the same route', target_connection_id
      USING ERRCODE = '23514';
  END IF;
  IF connection_kind = 'tee' AND participant_count <> 3 THEN
    RAISE EXCEPTION 'tee connection % requires three endpoints', target_connection_id USING ERRCODE = '23514';
  ELSIF connection_kind = 'custom' AND participant_count NOT BETWEEN 2 AND 3 THEN
    RAISE EXCEPTION 'custom connection % requires two or three endpoints', target_connection_id USING ERRCODE = '23514';
  ELSIF connection_kind NOT IN ('tee', 'custom') AND participant_count <> 2 THEN
    RAISE EXCEPTION 'connection % requires two endpoints', target_connection_id USING ERRCODE = '23514';
  END IF;
  IF participant_count = 2 AND position_count <> 2 THEN
    RAISE EXCEPTION 'two-way connection % must join a start endpoint to an end endpoint', target_connection_id
      USING ERRCODE = '23514';
  END IF;
  IF connection_kind = 'logicalContinuation' AND continuation_count <> participant_count THEN
    RAISE EXCEPTION 'logical continuation % requires continuation endpoints', target_connection_id
      USING ERRCODE = '23514';
  END IF;
END
$$;

CREATE FUNCTION check_connection_cardinality() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'route_connections' THEN
    IF TG_OP <> 'DELETE' THEN PERFORM assert_connection_cardinality(NEW.id); END IF;
  ELSE
    IF TG_OP <> 'INSERT' THEN PERFORM assert_connection_cardinality(OLD.connection_id); END IF;
    IF TG_OP <> 'DELETE' AND (TG_OP = 'INSERT' OR NEW.connection_id IS DISTINCT FROM OLD.connection_id) THEN
      PERFORM assert_connection_cardinality(NEW.connection_id);
    END IF;
  END IF;
  RETURN NULL;
END
$$;

CREATE CONSTRAINT TRIGGER connections_require_participants
AFTER INSERT OR UPDATE ON route_connections DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION check_connection_cardinality();
CREATE CONSTRAINT TRIGGER connection_endpoints_preserve_cardinality
AFTER INSERT OR UPDATE OR DELETE ON route_connection_endpoints DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION check_connection_cardinality();

CREATE FUNCTION protect_revision_payload() RETURNS trigger
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
     OR NEW.calculation_schema_version IS DISTINCT FROM OLD.calculation_schema_version
     OR NEW.engine_version IS DISTINCT FROM OLD.engine_version
     OR NEW.snapshot_schema_version IS DISTINCT FROM OLD.snapshot_schema_version
     OR NEW.input_fingerprint IS DISTINCT FROM OLD.input_fingerprint
     OR NEW.input_checksum IS DISTINCT FROM OLD.input_checksum
     OR NEW.snapshot_checksum IS DISTINCT FROM OLD.snapshot_checksum
     OR NEW.bom_checksum IS DISTINCT FROM OLD.bom_checksum
     OR NEW.input_snapshot IS DISTINCT FROM OLD.input_snapshot
     OR NEW.catalog_snapshot IS DISTINCT FROM OLD.catalog_snapshot
     OR NEW.rule_template_snapshot IS DISTINCT FROM OLD.rule_template_snapshot
     OR NEW.calculation_result_snapshot IS DISTINCT FROM OLD.calculation_result_snapshot
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR NEW.correlation_id IS DISTINCT FROM OLD.correlation_id
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_by_snapshot IS DISTINCT FROM OLD.created_by_snapshot
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'saved revision payload is immutable' USING ERRCODE = '55000';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    (OLD.status = 'calculated' AND NEW.status IN ('checked', 'archived'))
    OR (OLD.status = 'checked' AND NEW.status IN ('approved', 'archived'))
    OR (OLD.status = 'approved' AND NEW.status = 'archived')
  ) THEN
    RAISE EXCEPTION 'invalid revision lifecycle transition from % to %', OLD.status, NEW.status
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER revisions_protect_payload
BEFORE UPDATE OR DELETE ON revisions FOR EACH ROW EXECUTE FUNCTION protect_revision_payload();

CREATE FUNCTION reject_immutable_child_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% rows are append-only', TG_TABLE_NAME USING ERRCODE = '55000';
END
$$;

CREATE TRIGGER bom_lines_append_only
BEFORE UPDATE OR DELETE ON bom_lines FOR EACH ROW EXECUTE FUNCTION reject_immutable_child_change();
CREATE TRIGGER approvals_append_only
BEFORE UPDATE OR DELETE ON approvals FOR EACH ROW EXECUTE FUNCTION reject_immutable_child_change();

CREATE FUNCTION protect_revision_warning() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (TG_OP = 'DELETE' AND OLD.revision_id IS NOT NULL)
     OR (TG_OP = 'UPDATE' AND (OLD.revision_id IS NOT NULL OR NEW.revision_id IS NOT NULL)) THEN
    RAISE EXCEPTION 'saved revision warnings are immutable' USING ERRCODE = '55000';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END
$$;

CREATE TRIGGER warnings_protect_revision_rows
BEFORE UPDATE OR DELETE ON warnings FOR EACH ROW EXECUTE FUNCTION protect_revision_warning();

COMMENT ON TABLE catalog_versions IS 'Managed catalog snapshots; activation changes lifecycle state, never saved revisions.';
COMMENT ON TABLE rule_sets IS 'Versioned rule snapshot identity tied to a catalog version.';
COMMENT ON TABLE calculation_drafts IS 'One replaceable calculation result per project; not retained revision history.';
COMMENT ON TABLE revisions IS 'Explicit saved revision with schema-versioned, checksummed input/catalog/rule/result snapshots.';
COMMENT ON TABLE bom_lines IS 'Immutable normalized BOM values copied from the saved calculation result.';
COMMENT ON TABLE approvals IS 'Append-only decisions for immutable saved revisions; authorization is enforced by the application service.';
COMMENT ON INDEX products_catalog_category_idx IS 'Supports catalog browsing by version/category/family/series.';
COMMENT ON INDEX route_connection_endpoints_cardinality_idx IS 'An endpoint can participate in at most one connection in the linear route model.';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'niedax_generator_app') THEN
    REVOKE UPDATE, DELETE ON revisions FROM niedax_generator_app;
    REVOKE UPDATE, DELETE ON bom_lines, approvals FROM niedax_generator_app;
    REVOKE UPDATE, DELETE ON warnings FROM niedax_generator_app;
    GRANT UPDATE (status, checked_at, approved_at, archived_at, updated_at)
      ON revisions TO niedax_generator_app;
    GRANT UPDATE, DELETE ON warnings TO niedax_generator_app;
  END IF;
END
$$;
