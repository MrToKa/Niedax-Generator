-- preserve manual catalog revision identity
-- Forward-only migration.

-- Catalog-backed manual lines retain both product identity and manual-input
-- provenance in the v2 engine result. The original check incorrectly rejected
-- those valid lines during immutable revision projection. Free-text manual lines
-- still require manual identity and cannot claim a catalog product.
ALTER TABLE revision_bom_lines_v2
  DROP CONSTRAINT revision_bom_lines_v2_identity_kind;

ALTER TABLE revision_bom_lines_v2
  ADD CONSTRAINT revision_bom_lines_v2_identity_kind CHECK (
    (kind = 'catalog' AND product_id IS NOT NULL)
    OR (kind = 'manual' AND product_id IS NULL AND manual_input_id IS NOT NULL)
  );
