ALTER TABLE bom_lines
  DROP CONSTRAINT bom_lines_live_product_id_fkey;

ALTER TABLE bom_lines
  ADD CONSTRAINT bom_lines_live_product_id_fkey
  FOREIGN KEY (live_product_id) REFERENCES products(id) ON DELETE RESTRICT ON UPDATE RESTRICT;

COMMENT ON CONSTRAINT bom_lines_live_product_id_fkey ON bom_lines IS
  'Saved BOM rows are immutable; archive referenced products instead of deleting or nulling traceability.';
