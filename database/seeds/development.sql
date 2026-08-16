BEGIN;

INSERT INTO catalog_versions (
  id, scope, version, label, source_edition, source_metadata, content_hash, status,
  import_provenance, validation_schema_version, validated_at, activated_at, created_at, updated_at
) VALUES (
  '00000000-0000-4000-8000-000000000001', 'niedax', '0.1.0',
  'Synthetic development catalog 0.1.0', NULL,
  '{"fixture":true,"authoritative":false,"notice":"Synthetic records; replace through a validated catalog import."}',
  'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'active',
  '{"kind":"syntheticDevelopmentSeed","source":"packages/domain test fixture vocabulary"}',
  'catalog-import-validation-result/v1', '2026-08-16T00:00:00Z', '2026-08-16T00:05:00Z',
  '2026-08-16T00:00:00Z', '2026-08-16T00:05:00Z'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO product_sources (
  id, catalog_version_id, document_identity, title, edition, source_page, locale,
  reference_uri, source_hash, verification_status, created_at, updated_at
) VALUES (
  '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000001',
  'synthetic-development-fixture', 'Synthetic development fixture — not a Niedax source document',
  '0.1.0', 'fixture-1', 'en', 'repo:database/seeds/development.sql',
  'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  'unverified', '2026-08-16T00:00:00Z', '2026-08-16T00:00:00Z'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO products (
  id, catalog_version_id, product_code, category, family, series, description_bg, description_en,
  material, coating, variant_key, base_unit, minimum_package_quantity, packaging_unit,
  mass_value, mass_unit, availability_status, metadata, created_at, updated_at
) VALUES
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000001',
   'SYN-NX-TRAY-3000', 'straightSection', 'Synthetic tray', 'SYN-E5',
   'Синтетична права секция', 'Synthetic straight cable-tray section', 'steel', 'synthetic-e5',
   '300x60-3m', 'm', 3, 'm', 2.4, 'kgPerM', 'active', '{"fixture":true}',
   '2026-08-16T00:00:00Z', '2026-08-16T00:00:00Z'),
  ('00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-000000000001',
   'SYN-NX-BEND-90', 'fitting', 'Synthetic tray fitting', 'SYN-E5',
   'Синтетичен хоризонтален завой', 'Synthetic horizontal bend', 'steel', 'synthetic-e5',
   '300x60-90deg', 'pcs', 1, 'pcs', 1.1, 'kg', 'active', '{"fixture":true}',
   '2026-08-16T00:00:00Z', '2026-08-16T00:00:00Z'),
  ('00000000-0000-4000-8000-000000000303', '00000000-0000-4000-8000-000000000001',
   'SYN-NX-SUPPORT', 'support', 'Synthetic support', 'SYN-WALL',
   'Синтетична стенна опора', 'Synthetic wall support', 'steel', 'synthetic-e5',
   'wall-300', 'pcs', 1, 'pcs', 0.8, 'kg', 'active', '{"fixture":true}',
   '2026-08-16T00:00:00Z', '2026-08-16T00:00:00Z'),
  ('00000000-0000-4000-8000-000000000304', '00000000-0000-4000-8000-000000000001',
   'SYN-NX-STRUCTURE', 'structure', 'Synthetic structure', 'SYN-RAIL',
   'Синтетична монтажна шина', 'Synthetic mounting structure', 'steel', 'synthetic-e5',
   'rail-500', 'pcs', 1, 'pcs', 0.5, 'kg', 'active', '{"fixture":true}',
   '2026-08-16T00:00:00Z', '2026-08-16T00:00:00Z'),
  ('00000000-0000-4000-8000-000000000305', '00000000-0000-4000-8000-000000000001',
   'SYN-NX-ANCHOR-M8', 'anchor', 'Synthetic anchor', 'SYN-ANCHOR',
   'Синтетичен анкер M8', 'Synthetic Niedax-shaped anchor fixture M8', 'steel', 'synthetic-zinc',
   'm8', 'pcs', 10, 'pcs', 0.05, 'kg', 'active', '{"fixture":true,"authoritative":false}',
   '2026-08-16T00:00:00Z', '2026-08-16T00:00:00Z'),
  ('00000000-0000-4000-8000-000000000306', '00000000-0000-4000-8000-000000000001',
   'SYN-NX-ANCHOR-M10', 'anchor', 'Synthetic anchor', 'SYN-ANCHOR',
   'Синтетичен анкер M10', 'Synthetic Niedax-shaped anchor fixture M10', 'steel', 'synthetic-zinc',
   'm10', 'pcs', 25, 'pcs', 0.08, 'kg', 'active', '{"fixture":true,"authoritative":false}',
   '2026-08-16T00:00:00Z', '2026-08-16T00:00:00Z'),
  ('00000000-0000-4000-8000-000000000307', '00000000-0000-4000-8000-000000000001',
   'SYN-NX-WSTB', 'wstb', 'Synthetic WSTB', 'SYN-WSTB',
   'Синтетичен WSTB елемент', 'Synthetic WSTB support item', 'steel', 'synthetic-e5',
   'default', 'pcs', 10, 'pcs', 0.02, 'kg', 'active', '{"fixture":true}',
   '2026-08-16T00:00:00Z', '2026-08-16T00:00:00Z'),
  ('00000000-0000-4000-8000-000000000308', '00000000-0000-4000-8000-000000000001',
   'SYN-NX-FASTENER', 'accessory', 'Synthetic fastener', 'SYN-FASTENER',
   'Синтетичен включен крепеж', 'Synthetic included fastener', 'steel', 'synthetic-zinc',
   'm8-fastener', 'pcs', 20, 'pcs', 0.01, 'kg', 'active', '{"fixture":true}',
   '2026-08-16T00:00:00Z', '2026-08-16T00:00:00Z')
ON CONFLICT (id) DO NOTHING;

INSERT INTO product_source_links (product_id, catalog_version_id, source_id, fact_scope, is_primary)
SELECT product_id, '00000000-0000-4000-8000-000000000001',
       '00000000-0000-4000-8000-000000000201', 'product', true
FROM (VALUES
  ('00000000-0000-4000-8000-000000000301'::uuid),
  ('00000000-0000-4000-8000-000000000302'::uuid),
  ('00000000-0000-4000-8000-000000000303'::uuid),
  ('00000000-0000-4000-8000-000000000304'::uuid),
  ('00000000-0000-4000-8000-000000000305'::uuid),
  ('00000000-0000-4000-8000-000000000306'::uuid),
  ('00000000-0000-4000-8000-000000000307'::uuid),
  ('00000000-0000-4000-8000-000000000308'::uuid)
) AS seeded(product_id)
ON CONFLICT (product_id, source_id, fact_scope) DO NOTHING;

INSERT INTO product_attributes (
  id, product_id, attribute_key, value_type, value_text, value_numeric, value_boolean, value_json, unit,
  source_id, created_at, updated_at
) VALUES
  ('00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-000000000305',
   'thread', 'text', 'M8', NULL, NULL, NULL, NULL, '00000000-0000-4000-8000-000000000201',
   '2026-08-16T00:00:00Z', '2026-08-16T00:00:00Z'),
  ('00000000-0000-4000-8000-000000000402', '00000000-0000-4000-8000-000000000305',
   'length', 'numeric', NULL, 80, NULL, NULL, 'mm', '00000000-0000-4000-8000-000000000201',
   '2026-08-16T00:00:00Z', '2026-08-16T00:00:00Z'),
  ('00000000-0000-4000-8000-000000000403', '00000000-0000-4000-8000-000000000305',
   'holeDiameter', 'numeric', NULL, 10, NULL, NULL, 'mm', '00000000-0000-4000-8000-000000000201',
   '2026-08-16T00:00:00Z', '2026-08-16T00:00:00Z'),
  ('00000000-0000-4000-8000-000000000404', '00000000-0000-4000-8000-000000000305',
   'maximumFixtureThickness', 'numeric', NULL, 15, NULL, NULL, 'mm', '00000000-0000-4000-8000-000000000201',
   '2026-08-16T00:00:00Z', '2026-08-16T00:00:00Z'),
  ('00000000-0000-4000-8000-000000000405', '00000000-0000-4000-8000-000000000305',
   'effectiveAnchoringDepth', 'numeric', NULL, 45, NULL, NULL, 'mm', '00000000-0000-4000-8000-000000000201',
   '2026-08-16T00:00:00Z', '2026-08-16T00:00:00Z'),
  ('00000000-0000-4000-8000-000000000406', '00000000-0000-4000-8000-000000000305',
   'headDriveType', 'text', 'synthetic-fixture', NULL, NULL, NULL, NULL,
   '00000000-0000-4000-8000-000000000201', '2026-08-16T00:00:00Z', '2026-08-16T00:00:00Z'),
  ('00000000-0000-4000-8000-000000000407', '00000000-0000-4000-8000-000000000305',
   'intendedSubstrate', 'text', 'concrete — engineering review required', NULL, NULL, NULL, NULL,
   '00000000-0000-4000-8000-000000000201', '2026-08-16T00:00:00Z', '2026-08-16T00:00:00Z'),
  ('00000000-0000-4000-8000-000000000408', '00000000-0000-4000-8000-000000000306',
   'thread', 'text', 'M10', NULL, NULL, NULL, NULL, '00000000-0000-4000-8000-000000000201',
   '2026-08-16T00:00:00Z', '2026-08-16T00:00:00Z'),
  ('00000000-0000-4000-8000-000000000409', '00000000-0000-4000-8000-000000000306',
   'length', 'numeric', NULL, 100, NULL, NULL, 'mm', '00000000-0000-4000-8000-000000000201',
   '2026-08-16T00:00:00Z', '2026-08-16T00:00:00Z')
ON CONFLICT (id) DO NOTHING;

INSERT INTO included_items (
  id, parent_product_id, catalog_version_id, included_product_id, included_item_code,
  included_quantity, unit, source_id, created_at
) VALUES (
  '00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-000000000303',
  '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000308',
  'SYN-NX-FASTENER', 2, 'pcs', '00000000-0000-4000-8000-000000000201', '2026-08-16T00:00:00Z'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO rule_sets (
  id, scope, version, label, content_hash, schema_version, catalog_version_id, status,
  validated_at, activated_at, provenance, created_at, updated_at
) VALUES (
  '00000000-0000-4000-8000-000000000101', 'niedax', '0.1.0',
  'Synthetic development rule set 0.1.0',
  'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
  'rule-set/v1', '00000000-0000-4000-8000-000000000001', 'active',
  '2026-08-16T00:00:00Z', '2026-08-16T00:05:00Z',
  '{"fixture":true,"authoritative":false}', '2026-08-16T00:00:00Z', '2026-08-16T00:05:00Z'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO compatibility_rules (
  id, rule_set_id, stable_code, version, status, priority, decision,
  condition_schema_version, condition_payload, outcome_schema_version, outcome_payload,
  reason_en, confidence, source_id, created_at, updated_at
) VALUES (
  '00000000-0000-4000-8000-000000000601', '00000000-0000-4000-8000-000000000101',
  'SYN-SUPPORT-SERIES-COMPATIBILITY', '0.1.0', 'active', 10, 'conditional',
  'compatibility-condition/v1', '{"series":"SYN-E5","supportRole":"wall"}',
  'compatibility-outcome/v1', '{"requiresEngineeringReview":true}',
  'Synthetic compatibility fixture; not an engineering determination.', 'engineeringReview',
  '00000000-0000-4000-8000-000000000201', '2026-08-16T00:00:00Z', '2026-08-16T00:00:00Z'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO calculation_rules (
  id, rule_set_id, stable_code, version, rule_type, status, priority,
  parameter_schema_version, parameters, confidence, reason_en, source_id, created_at, updated_at
) VALUES
  ('00000000-0000-4000-8000-000000000611', '00000000-0000-4000-8000-000000000101',
   'SYN-WSTB-TWO-PER-SUPPORT', '0.1.0', 'wstbPerSupport', 'active', 10,
   'wstb-per-support/v1', '{"quantity":{"value":"2","unit":"pcs"}}', 'projectRule',
   'Two per support is a synthetic provisional project rule.',
   '00000000-0000-4000-8000-000000000201', '2026-08-16T00:00:00Z', '2026-08-16T00:00:00Z'),
  ('00000000-0000-4000-8000-000000000612', '00000000-0000-4000-8000-000000000101',
   'SYN-PACKAGING-ROUNDING', '0.1.0', 'packagingRounding', 'active', 20,
   'packaging-rounding/v1', '{"mode":"roundToPackage"}', 'projectRule',
   'Synthetic package rounding fixture.',
   '00000000-0000-4000-8000-000000000201', '2026-08-16T00:00:00Z', '2026-08-16T00:00:00Z')
ON CONFLICT (id) DO NOTHING;

INSERT INTO assembly_templates (
  id, catalog_version_id, rule_set_id, stable_code, version, status, template_type,
  name_bg, name_en, description_en, applicability_schema_version, applicability,
  source_id, created_at, updated_at
) VALUES (
  '00000000-0000-4000-8000-000000000701', '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000101', 'SYN-WALL-2-POINT', '0.1.0', 'active', 'wall',
  'Синтетична стенна конструкция с 2 точки', 'Synthetic two-point wall assembly',
  'Fixture only; anchor suitability always requires engineering review.',
  'assembly-applicability/v1', '{"supportType":"wall","series":["SYN-E5"]}',
  '00000000-0000-4000-8000-000000000201', '2026-08-16T00:00:00Z', '2026-08-16T00:00:00Z'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO template_components (
  id, template_id, catalog_version_id, component_role, product_id, quantity, unit,
  sequence, is_required, suppress_when_included, anchor_count
) VALUES
  ('00000000-0000-4000-8000-000000000711', '00000000-0000-4000-8000-000000000701',
   '00000000-0000-4000-8000-000000000001', 'support',
   '00000000-0000-4000-8000-000000000303', 1, 'pcs', 0, true, true, NULL),
  ('00000000-0000-4000-8000-000000000712', '00000000-0000-4000-8000-000000000701',
   '00000000-0000-4000-8000-000000000001', 'structure',
   '00000000-0000-4000-8000-000000000304', 1, 'pcs', 1, true, true, NULL),
  ('00000000-0000-4000-8000-000000000713', '00000000-0000-4000-8000-000000000701',
   '00000000-0000-4000-8000-000000000001', 'anchor',
   '00000000-0000-4000-8000-000000000305', 2, 'pcs', 2, true, true, 2)
ON CONFLICT (id) DO NOTHING;

INSERT INTO projects (
  id, code, name, description, status, default_locale, export_locale, default_spare_percent,
  cable_load_kg_per_m, draft_version, active_catalog_version_id, active_rule_set_id, created_at, updated_at
) VALUES (
  '00000000-0000-4000-8000-000000000801', 'SYN-PROJECT-01', 'Synthetic connected-route project',
  'Development/test fixture; contains no authoritative engineering data.', 'calculated', 'bg', 'en',
  5, NULL, 1, '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000101', '2026-08-16T01:00:00Z', '2026-08-16T01:30:00Z'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO routes (
  id, project_id, code, name, description, system_series_id, product_family, material, coating,
  nominal_width_mm, nominal_height_mm, default_section_length_m, sequence, created_at, updated_at
) VALUES
  ('00000000-0000-4000-8000-000000000811', '00000000-0000-4000-8000-000000000801',
   'R-A', 'Synthetic route A', 'First half of one physical route', 'SYN-E5', 'Synthetic tray',
   'steel', 'synthetic-e5', 300, 60, 3, 0, '2026-08-16T01:00:00Z', '2026-08-16T01:00:00Z'),
  ('00000000-0000-4000-8000-000000000812', '00000000-0000-4000-8000-000000000801',
   'R-B', 'Synthetic route B', 'Logical continuation under another route code', 'SYN-E5', 'Synthetic tray',
   'steel', 'synthetic-e5', 300, 60, 6, 1, '2026-08-16T01:00:00Z', '2026-08-16T01:00:00Z')
ON CONFLICT (id) DO NOTHING;

INSERT INTO segments (id, route_id, project_id, sequence, length_m, geometry, created_at, updated_at)
VALUES
  ('00000000-0000-4000-8000-000000000821', '00000000-0000-4000-8000-000000000811',
   '00000000-0000-4000-8000-000000000801', 0, 12.5, '{"kind":"straight"}',
   '2026-08-16T01:00:00Z', '2026-08-16T01:00:00Z'),
  ('00000000-0000-4000-8000-000000000822', '00000000-0000-4000-8000-000000000812',
   '00000000-0000-4000-8000-000000000801', 0, 8.25, '{"kind":"straight"}',
   '2026-08-16T01:00:00Z', '2026-08-16T01:00:00Z')
ON CONFLICT (id) DO NOTHING;

INSERT INTO fittings (
  id, route_id, project_id, fitting_type, sequence, position_m, geometry, orientation,
  selected_product_id, additional_supports_before, additional_supports_after, created_at, updated_at
) VALUES (
  '00000000-0000-4000-8000-000000000831', '00000000-0000-4000-8000-000000000811',
  '00000000-0000-4000-8000-000000000801', 'horizontalBend', 0, 12.5,
  '{"angleDegrees":"90"}', 'horizontal', '00000000-0000-4000-8000-000000000302',
  1, 1, '2026-08-16T01:00:00Z', '2026-08-16T01:00:00Z'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO route_endpoints (
  id, route_id, project_id, position, endpoint_kind, equipment_reference,
  material_behavior, validation_metadata, created_at, updated_at
) VALUES
  ('00000000-0000-4000-8000-000000000841', '00000000-0000-4000-8000-000000000811',
   '00000000-0000-4000-8000-000000000801', 'start', 'freeEnd', NULL, '{}', '{}',
   '2026-08-16T01:00:00Z', '2026-08-16T01:00:00Z'),
  ('00000000-0000-4000-8000-000000000842', '00000000-0000-4000-8000-000000000811',
   '00000000-0000-4000-8000-000000000801', 'end', 'routeContinuation', NULL, '{}', '{}',
   '2026-08-16T01:00:00Z', '2026-08-16T01:00:00Z'),
  ('00000000-0000-4000-8000-000000000843', '00000000-0000-4000-8000-000000000812',
   '00000000-0000-4000-8000-000000000801', 'start', 'routeContinuation', NULL, '{}', '{}',
   '2026-08-16T01:00:00Z', '2026-08-16T01:00:00Z'),
  ('00000000-0000-4000-8000-000000000844', '00000000-0000-4000-8000-000000000812',
   '00000000-0000-4000-8000-000000000801', 'end', 'equipment', 'SYN-EQUIPMENT-01',
   '{"status":"unresolved"}', '{"engineeringReviewRequired":true}',
   '2026-08-16T01:00:00Z', '2026-08-16T01:00:00Z')
ON CONFLICT (id) DO NOTHING;

INSERT INTO route_connections (
  id, project_id, connection_type, physical_material_behavior, support_behavior,
  supports_before, supports_after, notes, created_at, updated_at
) VALUES (
  '00000000-0000-4000-8000-000000000851', '00000000-0000-4000-8000-000000000801',
  'logicalContinuation', 'none', 'shared', 0, 0,
  'Routes R-A and R-B form one continuous physical route.',
  '2026-08-16T01:00:00Z', '2026-08-16T01:00:00Z'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO route_connection_endpoints (
  connection_id, endpoint_id, project_id, participant_order, participant_role
) VALUES
  ('00000000-0000-4000-8000-000000000851', '00000000-0000-4000-8000-000000000842',
   '00000000-0000-4000-8000-000000000801', 0, 'from'),
  ('00000000-0000-4000-8000-000000000851', '00000000-0000-4000-8000-000000000843',
   '00000000-0000-4000-8000-000000000801', 1, 'to')
ON CONFLICT (connection_id, endpoint_id) DO NOTHING;

INSERT INTO support_configurations (
  id, route_id, project_id, spacing_m, support_type, assembly_template_id, construction_base,
  anchor_product_id, anchor_size_mm, anchors_per_mounting_point, wstb_mode,
  wstb_quantity_per_support, fitting_supports_before, fitting_supports_after,
  connection_support_behavior, engineering_review_required, engineering_review_state,
  review_reason, created_at, updated_at
) VALUES
  ('00000000-0000-4000-8000-000000000861', '00000000-0000-4000-8000-000000000811',
   '00000000-0000-4000-8000-000000000801', 1.5, 'wall',
   '00000000-0000-4000-8000-000000000701', 'concrete',
   '00000000-0000-4000-8000-000000000305', 8, 2, 'two', 2, 1, 1, 'shared', true, 'required',
   'Synthetic anchor suitability is not confirmed.', '2026-08-16T01:00:00Z', '2026-08-16T01:00:00Z'),
  ('00000000-0000-4000-8000-000000000862', '00000000-0000-4000-8000-000000000812',
   '00000000-0000-4000-8000-000000000801', 1.5, 'wall',
   '00000000-0000-4000-8000-000000000701', 'concrete',
   '00000000-0000-4000-8000-000000000305', 8, 2, 'two', 2, 0, 0, 'shared', true, 'required',
   'Synthetic anchor suitability is not confirmed.', '2026-08-16T01:00:00Z', '2026-08-16T01:00:00Z')
ON CONFLICT (id) DO NOTHING;

INSERT INTO calculation_drafts (
  id, project_id, calculation_schema_version, engine_version, input_fingerprint, idempotency_key,
  catalog_version_id, rule_set_id, status, correlation_id, input_payload,
  result_schema_version, result_payload, started_at, completed_at, created_at, updated_at
) VALUES (
  '00000000-0000-4000-8000-000000000871', '00000000-0000-4000-8000-000000000801',
  'calculation-input/v1', '0.1.0',
  'sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
  'seed-calculate-0001', '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000101', 'succeeded', 'seed-correlation-calculate-0001',
  $json${
    "schemaVersion":"calculation-input/v1",
    "invocation":{"calculationRunId":"00000000-0000-4000-8000-000000000871","inputFingerprint":"sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"},
    "project":{"id":"00000000-0000-4000-8000-000000000801","code":"SYN-PROJECT-01","name":"Synthetic connected-route project","description":"Development fixture","draftVersion":1,"defaultSparePercent":"5","cableLoad":null,
      "routes":[
        {"id":"00000000-0000-4000-8000-000000000811","code":"R-A","name":"Synthetic route A","description":"Fixture route A","system":{"seriesId":"SYN-E5","dimensionId":"300x60","finishId":"synthetic-e5","variantId":"300x60-3m"},"deliverableSectionLength":{"metres":3,"unit":"m"},"startEndpoint":{"id":"00000000-0000-4000-8000-000000000841","type":"freeEnd"},"endEndpoint":{"id":"00000000-0000-4000-8000-000000000842","type":"routeContinuation","connectionId":"00000000-0000-4000-8000-000000000851"},"geometry":[{"id":"00000000-0000-4000-8000-000000000821","kind":"straight","length":{"value":"12.5","unit":"m"}}],"supports":{"spacing":{"value":"1.5","unit":"m"},"supportType":"wall","supportProductId":"00000000-0000-4000-8000-000000000303","structureProductIds":["00000000-0000-4000-8000-000000000304"],"assemblyTemplateId":"00000000-0000-4000-8000-000000000701","connectionBehavior":"shared","additionalSupports":{"aroundFittings":{"value":"2","unit":"pcs"},"beforeConnections":{"value":"0","unit":"pcs"},"afterConnections":{"value":"0","unit":"pcs"}},"anchor":{"productId":"00000000-0000-4000-8000-000000000305","model":"Synthetic M8 fixture","size":{"value":"8","unit":"mm"},"substrate":"concrete","assemblyTemplateId":"00000000-0000-4000-8000-000000000701","quantityPerMountingPoint":{"value":"2","unit":"pcs"},"quantityOverride":null,"engineeringReviewRequired":true},"wstb":{"mode":"two","quantityPerSupport":"2","ruleId":"00000000-0000-4000-8000-000000000611"}}},
        {"id":"00000000-0000-4000-8000-000000000812","code":"R-B","name":"Synthetic route B","description":"Fixture route B","system":{"seriesId":"SYN-E5","dimensionId":"300x60","finishId":"synthetic-e5","variantId":"300x60-6m"},"deliverableSectionLength":{"metres":6,"unit":"m"},"startEndpoint":{"id":"00000000-0000-4000-8000-000000000843","type":"routeContinuation","connectionId":"00000000-0000-4000-8000-000000000851"},"endEndpoint":{"id":"00000000-0000-4000-8000-000000000844","type":"equipment","equipmentReference":"SYN-EQUIPMENT-01","material":{"status":"unresolved","reason":"Synthetic endpoint material requires review"}},"geometry":[{"id":"00000000-0000-4000-8000-000000000822","kind":"straight","length":{"value":"8.25","unit":"m"}}],"supports":{"spacing":{"value":"1.5","unit":"m"},"supportType":"wall","supportProductId":"00000000-0000-4000-8000-000000000303","structureProductIds":["00000000-0000-4000-8000-000000000304"],"assemblyTemplateId":"00000000-0000-4000-8000-000000000701","connectionBehavior":"shared","additionalSupports":{"aroundFittings":{"value":"0","unit":"pcs"},"beforeConnections":{"value":"0","unit":"pcs"},"afterConnections":{"value":"0","unit":"pcs"}},"anchor":{"productId":"00000000-0000-4000-8000-000000000305","model":"Synthetic M8 fixture","size":{"value":"8","unit":"mm"},"substrate":"concrete","assemblyTemplateId":"00000000-0000-4000-8000-000000000701","quantityPerMountingPoint":{"value":"2","unit":"pcs"},"quantityOverride":null,"engineeringReviewRequired":true},"wstb":{"mode":"two","quantityPerSupport":"2","ruleId":"00000000-0000-4000-8000-000000000611"}}}
      ],
      "connections":[{"id":"00000000-0000-4000-8000-000000000851","type":"logicalContinuation","participants":[{"routeId":"00000000-0000-4000-8000-000000000811","endpointId":"00000000-0000-4000-8000-000000000842"},{"routeId":"00000000-0000-4000-8000-000000000812","endpointId":"00000000-0000-4000-8000-000000000843"}],"physicalBreak":false,"materialBehavior":"none","supportBehavior":"shared","supportsBefore":{"value":"0","unit":"pcs"},"supportsAfter":{"value":"0","unit":"pcs"},"connectorCorrection":null,"note":null}],"accessoryProductIds":[]},
    "catalogSnapshot":{"snapshotId":"00000000-0000-4000-8000-000000000001","version":"0.1.0","contentHash":"sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},
    "catalogProducts":[{"id":"00000000-0000-4000-8000-000000000305","code":"SYN-NX-ANCHOR-M8","descriptionEn":"Synthetic Niedax-shaped anchor fixture M8","productType":"anchor","baseUnit":"pcs","packageSize":{"value":"10","unit":"pcs"},"includedProductIds":[],"status":"active","catalogSnapshotId":"00000000-0000-4000-8000-000000000001","source":{"sourceFileName":"synthetic-development-fixture","sourceRow":1,"sourceHash":"sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}}],
    "ruleSnapshot":{"snapshotId":"00000000-0000-4000-8000-000000000101","version":"0.1.0","contentHash":"sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"},
    "rules":[{"id":"00000000-0000-4000-8000-000000000611","code":"SYN-WSTB-TWO-PER-SUPPORT","version":"0.1.0","status":"active","confidence":"projectRule","ruleSnapshotId":"00000000-0000-4000-8000-000000000101","type":"wstbPerSupport","quantityPerSupport":{"value":"2","unit":"pcs"}}],
    "assemblyTemplates":[{"id":"00000000-0000-4000-8000-000000000701","code":"SYN-WALL-2-POINT","name":"Synthetic two-point wall assembly","status":"active","catalogSnapshotId":"00000000-0000-4000-8000-000000000001","components":[{"productId":"00000000-0000-4000-8000-000000000305","quantityPerAssembly":{"value":"2","unit":"pcs"},"included":false}]}],
    "manualBomLines":[{"kind":"freeText","productCode":null,"id":"00000000-0000-4000-8000-000000000881","descriptionEn":"Synthetic warning label","technicalQuantity":{"value":"2","unit":"pcs"},"reason":"Development fixture","note":"Not a catalog product","sparePolicy":{"mode":"project"},"packagingPolicy":{"mode":"none"},"enteredBy":"seed-actor","enteredAt":"2026-08-16T01:10:00Z"}],
    "manualProductAdjustments":[],"linePolicies":[],
    "options":{"failOnUnresolvedMaterial":false,"includePackaging":true,"outputLanguage":"en"}
  }$json$::jsonb,
  'calculation-result/v1',
  $json${
    "schemaVersion":"calculation-result/v1","engineVersion":"0.1.0",
    "calculationRunId":"00000000-0000-4000-8000-000000000871",
    "inputFingerprint":"sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
    "calculationStatus":"complete",
    "catalogSnapshot":{"snapshotId":"00000000-0000-4000-8000-000000000001","version":"0.1.0","contentHash":"sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},
    "ruleSnapshot":{"snapshotId":"00000000-0000-4000-8000-000000000101","version":"0.1.0","contentHash":"sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"},
    "bomLines":[{"id":"seed-bom-anchor","kind":"catalog","category":"anchor","productId":"00000000-0000-4000-8000-000000000305","productCode":"SYN-NX-ANCHOR-M8","descriptionEn":"Synthetic Niedax-shaped anchor fixture M8","technicalQuantity":{"value":"18","unit":"pcs"},"packagingQuantity":{"value":"18","unit":"pcs"},"packageSize":{"value":"10","unit":"pcs"},"packageCount":{"value":"2","unit":"packages"},"orderedQuantity":{"value":"20","unit":"pcs"},"spareQuantity":{"value":"2","unit":"pcs"},"includedItems":[],"source":{"kind":"catalog","productId":"00000000-0000-4000-8000-000000000305"},"status":"engineeringReview","warnings":[{"kind":"engineeringReview","code":"ANCHOR_UNCONFIRMED","message":"Synthetic anchor suitability requires engineering review.","subjectRef":"00000000-0000-4000-8000-000000000305"}],"sparePolicy":{"mode":"project"},"packagingPolicy":{"mode":"roundToPackage","packageSize":{"value":"10","unit":"pcs"}},"quantityOverride":null,"provenance":{"catalogSnapshotId":"00000000-0000-4000-8000-000000000001","ruleSnapshotId":"00000000-0000-4000-8000-000000000101","ruleIds":["00000000-0000-4000-8000-000000000611"]}}],
    "warnings":[{"kind":"engineeringReview","code":"ANCHOR_UNCONFIRMED","message":"Synthetic anchor suitability requires engineering review.","subjectRef":"00000000-0000-4000-8000-000000000305"}],
    "summary":{"bomLineCount":1,"warningCount":1,"engineeringReviewRequired":true,"orderedTotalsByUnit":[{"unit":"pcs","quantity":{"value":"20","unit":"pcs"}}]}
  }$json$::jsonb,
  '2026-08-16T01:20:00Z', '2026-08-16T01:20:01Z',
  '2026-08-16T01:20:00Z', '2026-08-16T01:20:01Z'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO manual_items (
  id, project_id, route_id, calculation_draft_id, catalog_product_id, free_text_description,
  quantity, unit, reason, note, reserve_applicable, packaging_rounding_applicable,
  origin, status, created_at, updated_at
) VALUES (
  '00000000-0000-4000-8000-000000000881', '00000000-0000-4000-8000-000000000801',
  '00000000-0000-4000-8000-000000000812', '00000000-0000-4000-8000-000000000871',
  NULL, 'Synthetic warning label', 2, 'pcs', 'Development fixture', 'Not a catalog product',
  false, false, 'user', 'manual', '2026-08-16T01:10:00Z', '2026-08-16T01:10:00Z'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO warnings (
  id, calculation_draft_id, warning_identity, code, category, severity, message_en,
  affected_entity, affected_entity_id, source_status, snapshot_context, created_at
) VALUES (
  '00000000-0000-4000-8000-000000000891', '00000000-0000-4000-8000-000000000871',
  'draft-anchor-unconfirmed', 'ANCHOR_UNCONFIRMED', 'unconfirmedAnchor', 'engineeringReview',
  'Synthetic anchor suitability requires engineering review.', 'product',
  '00000000-0000-4000-8000-000000000305', 'engineeringReview',
  '{"fixture":true}', '2026-08-16T01:20:01Z'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO revisions (
  id, project_id, revision_number, name, description, status, calculation_schema_version,
  engine_version, snapshot_schema_version, input_fingerprint, input_checksum, snapshot_checksum,
  bom_checksum, input_snapshot, catalog_snapshot, rule_template_snapshot,
  calculation_result_snapshot, idempotency_key, correlation_id, created_by_snapshot,
  created_at, updated_at
)
SELECT
  '00000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-000000000801', 1,
  'Synthetic saved revision', 'Explicit fixture revision proving snapshot independence.', 'calculated',
  'calculation-input/v1', '0.1.0', 'revision-snapshot/v1', draft.input_fingerprint,
  'sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  'sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
  'sha256:1111111111111111111111111111111111111111111111111111111111111111',
  draft.input_payload,
  jsonb_build_object(
    'schemaVersion', 'catalog-revision-snapshot/v1',
    'catalogVersion', (SELECT to_jsonb(catalog) FROM catalog_versions catalog WHERE catalog.id = draft.catalog_version_id),
    'products', (SELECT jsonb_agg(to_jsonb(product) ORDER BY product.product_code) FROM products product WHERE product.catalog_version_id = draft.catalog_version_id),
    'attributes', (SELECT jsonb_agg(to_jsonb(attribute) ORDER BY attribute.attribute_key) FROM product_attributes attribute JOIN products product ON product.id = attribute.product_id WHERE product.catalog_version_id = draft.catalog_version_id),
    'includedItems', (SELECT jsonb_agg(to_jsonb(item) ORDER BY item.id) FROM included_items item WHERE item.catalog_version_id = draft.catalog_version_id),
    'sources', (SELECT jsonb_agg(to_jsonb(source) ORDER BY source.document_identity, source.source_page) FROM product_sources source WHERE source.catalog_version_id = draft.catalog_version_id)
  ),
  jsonb_build_object(
    'schemaVersion', 'rule-template-revision-snapshot/v1',
    'ruleSet', (SELECT to_jsonb(rule_set) FROM rule_sets rule_set WHERE rule_set.id = draft.rule_set_id),
    'compatibilityRules', (SELECT jsonb_agg(to_jsonb(rule) ORDER BY rule.priority, rule.stable_code) FROM compatibility_rules rule WHERE rule.rule_set_id = draft.rule_set_id),
    'calculationRules', (SELECT jsonb_agg(to_jsonb(rule) ORDER BY rule.priority, rule.stable_code) FROM calculation_rules rule WHERE rule.rule_set_id = draft.rule_set_id),
    'assemblyTemplates', (SELECT jsonb_agg(to_jsonb(template) ORDER BY template.stable_code) FROM assembly_templates template WHERE template.rule_set_id = draft.rule_set_id),
    'templateComponents', (SELECT jsonb_agg(to_jsonb(component) ORDER BY component.template_id, component.sequence) FROM template_components component JOIN assembly_templates template ON template.id = component.template_id WHERE template.rule_set_id = draft.rule_set_id)
  ),
  draft.result_payload, 'seed-save-revision-0001', 'seed-correlation-save-0001',
  '{"kind":"syntheticSeed","actor":null}', '2026-08-16T01:30:00Z', '2026-08-16T01:30:00Z'
FROM calculation_drafts draft
WHERE draft.id = '00000000-0000-4000-8000-000000000871'
ON CONFLICT (id) DO NOTHING;

INSERT INTO bom_lines (
  id, revision_id, line_identity, line_order, category, live_product_id, product_snapshot,
  product_code, description_bg, description_en, material, coating, technical_quantity,
  reserve_quantity, packaging_quantity, package_size, ordered_packages, order_quantity,
  spare_quantity, unit, mass_value, mass_unit, included_items_snapshot, source_snapshot,
  origin, rule_template_snapshot, manual_adjustment_snapshot, created_at
)
SELECT
  '00000000-0000-4000-8000-000000000911', '00000000-0000-4000-8000-000000000901',
  'seed-bom-anchor', 0, 'anchor', product.id,
  jsonb_build_object(
    'schemaVersion', 'product-revision-snapshot/v1',
    'product', to_jsonb(product),
    'attributes', (SELECT coalesce(jsonb_agg(to_jsonb(attribute) ORDER BY attribute.attribute_key), '[]'::jsonb) FROM product_attributes attribute WHERE attribute.product_id = product.id),
    'sources', (SELECT coalesce(jsonb_agg(to_jsonb(source) ORDER BY source.source_page), '[]'::jsonb) FROM product_source_links link JOIN product_sources source ON source.id = link.source_id WHERE link.product_id = product.id),
    'includedItems', (SELECT coalesce(jsonb_agg(to_jsonb(item) ORDER BY item.id), '[]'::jsonb) FROM included_items item WHERE item.parent_product_id = product.id)
  ),
  product.product_code, product.description_bg, product.description_en, product.material, product.coating,
  18, 2, 18, 10, 2, 20, 2, 'pcs', product.mass_value, product.mass_unit,
  '[]'::jsonb,
  jsonb_build_object('documentIdentity', source.document_identity, 'title', source.title,
    'sourcePage', source.source_page, 'locale', source.locale, 'verificationStatus', source.verification_status),
  'engineeringReview',
  jsonb_build_object('ruleIds', jsonb_build_array('00000000-0000-4000-8000-000000000611'),
    'templateId', '00000000-0000-4000-8000-000000000701'),
  NULL, '2026-08-16T01:30:00Z'
FROM products product
JOIN product_source_links link ON link.product_id = product.id AND link.is_primary
JOIN product_sources source ON source.id = link.source_id
WHERE product.id = '00000000-0000-4000-8000-000000000305'
ON CONFLICT (id) DO NOTHING;

INSERT INTO warnings (
  id, revision_id, warning_identity, code, category, severity, message_en,
  affected_entity, affected_entity_id, source_status, snapshot_context, created_at
) VALUES (
  '00000000-0000-4000-8000-000000000921', '00000000-0000-4000-8000-000000000901',
  'revision-anchor-unconfirmed', 'ANCHOR_UNCONFIRMED', 'unconfirmedAnchor', 'engineeringReview',
  'Synthetic anchor suitability requires engineering review.', 'product',
  '00000000-0000-4000-8000-000000000305', 'engineeringReview',
  '{"schemaVersion":"warning-snapshot/v1","fixture":true}', '2026-08-16T01:30:00Z'
) ON CONFLICT (id) DO NOTHING;

COMMIT;
