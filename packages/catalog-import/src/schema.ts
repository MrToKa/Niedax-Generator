import type { CatalogSheetName } from "./contracts.js";

export const catalogColumns: Readonly<Record<CatalogSheetName, readonly string[]>> = {
  manifest: [
    "schema_version",
    "candidate_catalog_version",
    "manufacturer",
    "import_scope",
    "is_full_snapshot",
    "source_document",
    "source_document_edition",
    "source_sha256",
    "prepared_at",
    "prepared_by",
    "notes"
  ],
  products: [
    "code",
    "description_en",
    "category",
    "product_family",
    "system",
    "catalog_version",
    "pack_quantity",
    "pack_unit",
    "order_unit",
    "ean",
    "height_mm",
    "width_mm",
    "length_mm",
    "material_code",
    "finish_code",
    "weight_value",
    "weight_unit",
    "weight_basis_quantity",
    "weight_basis_unit",
    "approval_number",
    "dop_number",
    "indoor_only",
    "engineering_verification_required",
    "is_orderable",
    "source_document",
    "source_printed_page",
    "source_pdf_page",
    "source_table_or_row",
    "engineering_note"
  ],
  product_attributes: [
    "product_code",
    "attribute_key",
    "value_text",
    "value_number",
    "value_boolean",
    "unit",
    "source_document",
    "source_printed_page",
    "source_pdf_page",
    "source_table_or_row"
  ],
  included_items: [
    "parent_product_code",
    "included_product_code",
    "quantity",
    "unit",
    "source_document",
    "source_printed_page",
    "source_pdf_page",
    "source_table_or_row",
    "note"
  ],
  compatibility_rules: [
    "rule_code",
    "relation_type",
    "source_product_code",
    "source_selector_json",
    "target_product_code",
    "target_selector_json",
    "allowed",
    "system",
    "height_mm",
    "width_mm",
    "material_code",
    "finish_code",
    "source_document",
    "source_printed_page",
    "source_pdf_page",
    "verification_status",
    "note"
  ],
  assembly_templates: [
    "template_code",
    "name_en",
    "template_type",
    "system",
    "source_document",
    "source_printed_page",
    "source_pdf_page",
    "engineering_verification_required"
  ],
  template_components: [
    "template_code",
    "product_code",
    "component_role",
    "quantity",
    "unit",
    "quantity_mode",
    "suppress_when_included"
  ],
  source_observations: [
    "product_code",
    "field_name",
    "value_text",
    "source_document",
    "source_printed_page",
    "source_pdf_page",
    "is_authoritative_for_candidate",
    "resolution_policy"
  ]
};

export const supportedUnits = new Set([
  "pcs",
  "pairs",
  "m",
  "mm",
  "kg",
  "Nm",
  "kg_per_100_m",
  "kg_per_100_pcs",
  "kg_per_100_pairs"
]);

export const compatibilitySelectorKeys = new Set([
  "category",
  "product_family",
  "system",
  "height_mm",
  "width_mm",
  "material_code",
  "finish_code",
  "connection_type",
  "slot_width_mm",
  "substrate",
  "connection_thread",
  "maximum_mounting_thickness_mm"
]);
