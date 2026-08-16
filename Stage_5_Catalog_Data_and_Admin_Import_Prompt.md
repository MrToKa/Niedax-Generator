# Codex Implementation Prompt - Stage 5: Catalog Data and Administrative Import

You are Codex working inside the existing Niedax Generator repository in VS Code. Implement Stage 5 completely in the current codebase. Do not stop after producing a plan, mock data, or UI-only placeholders. Inspect the repository first, preserve the architecture and conventions established in Stages 1-4, make the required code and data changes, run the relevant checks, and report the concrete result.

## Stage objective

Convert the supplied official Niedax catalog sources into validated, machine-readable, versioned catalog records that can be imported, reviewed, approved, activated, and archived by an administrator.

The completed stage must provide:

1. A canonical CSV/XLSX import contract with templates and documentation.
2. A reproducible initial catalog dataset populated from the supplied official PDFs.
3. An import parser, normalizer, validator, diff engine, validation report, and error export.
4. An administrative workflow: `draft -> validate -> approve -> activate -> archive`.
5. Included-item and compatibility data that prevents duplicate ordering and invalid selections.
6. Automated tests and evidence that the Definition of Done is satisfied.

## Required source files

Use the local copies of these official catalogs as the only authoritative sources for this stage:

- `KAT_NX_KR 2022.pdf`
- `1.-Electrical-installation-materials(1).pdf`

Search for these exact filenames in the repository and common project documentation/data directories. If the repository uses a configured catalog-source directory, use it. If either file is absent, stop and report the missing filename; do not download a substitute or invent product data.

Treat PDF page ordinals and printed catalog page labels as different fields. Store both whenever they can be determined. In the supplied copies, useful observed mappings include:

- `1.-Electrical-installation-materials(1).pdf`: printed pages 156-157 are PDF pages 19-20.
- `KAT_NX_KR 2022.pdf`: printed page `KR 340` is PDF page 344 and printed page `KR 426` is PDF page 430.

Verify page labels against the actual local files instead of assuming that every copy has the same offset.

Record a SHA-256 checksum and file metadata for each source. Do not silently replace or duplicate large source PDFs, and do not commit them if the repository policy excludes binary catalog sources. The normalized dataset, import templates, manifests, and extraction/verification notes must be source-controlled.

## Existing data model and architecture

Stage 4 should already define or migrate the following catalog-side entities:

- `catalog_versions`
- `products`
- `product_attributes`
- `included_items`
- `product_sources`
- `compatibility_rules`
- `calculation_rules`
- `assembly_templates`
- `template_components`

Reuse these tables and the Stage 3 service/API boundaries. Do not create a parallel catalog database or bypass the application/domain layer. Add a migration only when the existing schema cannot satisfy a requirement. If names differ, map this prompt to the existing equivalent entities and document the mapping.

Preserve the Stage 4 revision snapshot behavior: activating a new catalog version must never mutate an existing saved revision or BOM snapshot.

Use the existing package manager, validation library, test framework, authentication, authorization, error format, audit trail, correlation ID, transaction, and idempotency conventions. Do not introduce a second framework for an already solved concern.

## Non-negotiable data rules

- Never fabricate a code, description, attribute, quantity, finish, approval, EAN, packaging value, compatibility, or source page.
- OCR or PDF text extraction is only a first pass. Every imported family must be checked against the rendered source tables, especially decimal commas, inequality symbols, page labels, included hardware, and packaging quantities.
- Preserve exact Niedax model numbers, including spaces, decimal points, slashes, suffixes, and finish codes. Store a separate normalized lookup key if needed, but never replace the display code.
- Normalize decimal commas to decimal values internally without changing the source evidence.
- Store numeric values and units separately. Do not store values such as `6 m`, `100 St.`, or `10 Nm` as an unparsed number field.
- Store weight together with its basis, for example `kg per 100 m`, `kg per 100 pcs`, or `kg per 100 pairs`.
- A product may exist in multiple catalog versions. The product identity must therefore include its managed catalog version; do not globally overwrite a product by code.
- The managed application catalog version and the edition/version of an individual source document are separate concepts. If the edition of a source is unclear, record it as unconfirmed and raise a validation warning instead of inventing a year.
- Conflicting values from two official sources must remain visible as a source/version conflict. They must not be merged by last-write-wins behavior.
- Products with validation errors remain in the draft import staging area and are not selectable in projects.
- Only active products from the active catalog version are selectable by normal project users.

## Initial catalog scope

Create a committed, reproducible scope manifest, for example `catalog-scope.yml`, and use it to drive extraction, completeness checks, and missing-product detection.

The P0 initial scope is:

### KL system

Use the KL system overview and all product tables required by that overview in `KAT_NX_KR 2022.pdf`, including at minimum:

- KL ladder products, including the KL 60 variants on printed page `KR 340`;
- straight-joint connectors and relevant connection accessories;
- bends, T-pieces, crossings, adjustable/vertical connectors, end and connection pieces;
- ladder fixing parts, especially KLTB variants;
- directly referenced fasteners and included hardware;
- relevant support/construction components needed by the approved assembly templates.

Use the printed KL system overview around `KR 338` and its page references as the scope index. For P0, fully cover KL 60 variants and their direct accessories. If the Stage 4 templates already require additional KL heights, import the complete required family rather than a few example rows.

Expected KL 60 straight-ladder coverage from `KR 340` includes widths 200, 300, 400, 500, and 600 mm, with the S, F, E3, and E5 variants that are actually present in the table. The catalog lists 6000 mm supply length and notes 3000 mm availability. Model supply variants in accordance with the existing product model; do not invent a new order code where the catalog does not provide one.

### WSL system

Use the WSL system overview and all directly required product tables in `KAT_NX_KR 2022.pdf`, including at minimum:

- WSL ladder products, including WSL 105 variants on printed page `KR 426`;
- straight, vertical, and horizontal connection parts;
- bends, T-pieces, end protection, mounting plates, and related accessories;
- WSTB ladder fixing parts and their included fasteners;
- relevant support/construction components used by approved assembly templates.

Use the printed WSL system overview around `KR 423` and its page references through the WSL accessory section as the scope index. For P0, fully cover WSL 105 variants and their direct accessories. If existing Stage 4 templates require WSL 150/200, WSLM, WSLSN, or WSLS products, import the complete required family and explicitly expand the scope manifest.

Expected WSL 105 straight-ladder coverage from `KR 426` includes widths 200, 300, 400, 500, and 600 mm, with S, F, and E3 variants actually present in the table. The catalog lists 6000 mm supply length and notes 3000 mm availability.

### Anchors

Use printed pages 156-157 of `1.-Electrical-installation-materials(1).pdf` for the mandatory anchor seed. Import every listed DAM, DAZ, and NSA row, not a sample.

Use the following facts as minimum extraction acceptance checks. Verify them visually against the PDF before committing the normalized records.

| Family | Required models | Approval | Pack quantities from pages 156-157 |
| --- | --- | --- | --- |
| DAM | `DAM 6X5`, `DAM 6X10` | `ETA-18/0541`, DoP `NI 001` | 50, 50 pcs |
| DAZ | `DAZ 8X10`, `DAZ 10X10`, `DAZ 12X10`, `DAZ 10X30`, `DAZ 16X25` | `ETA-18/0542`, DoP `NI 002` | 50, 50, 20, 25, 10 pcs |
| NSA | `NSA 6X35/FKK-T30 V`, `NSA 6X50/FKK-T30 V`, `NSA 6X55/SW10-M6 V`, `NSA 7.5X40/FKG-T30 V`, `NSA 7.5X50/FKG-T30 V` | `ETA 15/0784` | 100 pcs each |

For DAM and DAZ, extract connection thread, length, drill-hole diameter, clamping range, effective anchoring depth, washer diameter where applicable, weight basis, pack quantity, approval, DoP, and source.

For NSA, extract diameter, length, head/drive, drill-hole diameter, maximum mounting thickness where given, M6 connection thread where applicable, weight basis, pack quantity, recommended tightening torque, approval, and source.

All NSA records in this initial scope must have:

- `indoor_only = true`;
- substrate/base restricted to `concrete`;
- `engineering_verification_required = true`;
- a clear engineering note that suitability must be verified against ETA, substrate condition, edge distances, loads, and installation instructions.

The same engineering-verification flag must be available for DAM and DAZ where the application cannot prove structural suitability from the catalog table alone.

Important catalog-version test: the larger KR catalog can contain overlapping anchor codes and may show a different pack quantity for the same DAM code than pages 156-157 of the electrical-installation-materials catalog. Do not silently select one value or combine rows. Preserve both source observations, associate them with their source/candidate version, emit a conflict in the validation report, and require an explicit administrative resolution before activation. For the Stage 5 anchor seed requested here, pages 156-157 are the designated authoritative values, but the conflicting observation must remain auditable.

### Included items

Extract every `included accessories`/`Zubehor inkl.` statement for the scoped rows into `included_items`. The parent product and child product must both resolve to versioned product records. Store quantity and unit and link the relation to source evidence.

Examples that must be tested against the catalog include:

- KSV connectors with their included FLM fasteners;
- KLTB variants with their included FLM fastener;
- WSV/WSGV/WSWV connectors with their included FLM fasteners;
- WSTB variants with their included FLM/FLDM fastener;
- fittings that include fasteners versus fittings whose connectors are explicitly not included and must be ordered separately.

Do not convert a `must be ordered separately` note into an included item. Represent it through a compatibility/assembly/calculation rule so the BOM engine can add it once. Add tests proving that included bolts, nuts, and washers are not ordered again.

### Compatibility

Populate explicit compatibility rules/matrices for the scoped product families using the dimensions and applicability statements in the catalogs. At minimum cover:

- system/family;
- height;
- width;
- material/finish;
- connection/fitting type;
- ladder slot/profile requirements where stated;
- anchor substrate and relevant connection-thread/mounting-thickness filters;
- separately ordered connectors required by fittings;
- support/fixing applicability.

Compatibility must be allow-list based for project selection: the absence of a validated allowed combination must not be treated as compatible. Do not infer that every S/F/E3/E5 product has a matching variant. Store only combinations supported by actual catalog rows or explicit applicability text.

## Canonical import contract

Implement one normalized import bundle that works as either:

1. an XLSX workbook with the required sheet names below; or
2. a directory/ZIP of UTF-8 CSV files with the same names and columns.

Use the same validation schemas for CSV and XLSX. Generate an empty template and a populated initial-catalog file from the same schema definition to prevent drift.

### `manifest`

Required fields:

- `schema_version`
- `candidate_catalog_version`
- `manufacturer`
- `import_scope`
- `is_full_snapshot`
- `source_document`
- `source_document_edition`
- `source_sha256`
- `prepared_at`
- `prepared_by`
- `notes`

An import can contain more than one manifest/source row if several source documents contribute to the candidate version. Missing-product detection must operate only inside a declared complete scope. A partial import must never mark unrelated active products as missing.

### `products`

Required fields for every usable product:

- `code`
- `description_en`
- `category`
- `product_family`
- `system`
- `catalog_version`
- `pack_quantity`
- `pack_unit`
- `order_unit`
- `source_document`
- `source_printed_page`

Supported typed fields should include, when applicable:

- `ean`
- `height_mm`
- `width_mm`
- `length_mm`
- `material_code`
- `finish_code`
- `weight_value`
- `weight_unit`
- `weight_basis_quantity`
- `weight_basis_unit`
- `approval_number`
- `dop_number`
- `indoor_only`
- `engineering_verification_required`
- `is_orderable`
- `source_pdf_page`
- `source_table_or_row`
- `engineering_note`

Do not require irrelevant values for every category. Category-specific required attributes belong in the versioned validation schema.

### `product_attributes`

Required fields:

- `product_code`
- `attribute_key`
- exactly one typed value column: `value_text`, `value_number`, or `value_boolean`
- `unit` when the value is dimensional
- source document/page fields

Reject duplicate attribute keys for the same product/version unless the schema explicitly defines the attribute as multivalued.

### `included_items`

Required fields:

- `parent_product_code`
- `included_product_code`
- `quantity`
- `unit`
- source document/page fields
- optional `note`

Quantities must be positive. Both codes must exist in the same candidate version or resolve through an explicitly supported shared component policy.

### `compatibility_rules`

Required fields:

- `rule_code`
- `relation_type`
- source selector or source product code
- target selector or target product code
- `allowed`
- applicable `system`, `height_mm`, `width_mm`, `material_code`, and `finish_code` constraints
- source document/page fields
- `verification_status`

Use deterministic selector JSON only if the current Stage 4 model already supports it; otherwise use normalized columns/tables. Validate selector keys against an allow-list.

### `assembly_templates` and `template_components`

Include or reuse these sheets when the initial support/construction records are imported. Every component must reference an imported product, have a positive quantity and supported unit, and state whether its quantity is fixed, per support, per level, or manually configurable.

## Import pipeline

Implement the following deterministic pipeline:

1. Parse CSV/XLSX into an import staging model; never write directly to active catalog tables.
2. Normalize encodings, whitespace, decimal commas, booleans, units, codes, and page references.
3. Validate the file-level schema and manifest.
4. Validate row-level types, required fields, enums, positive quantities, supported units, uniqueness, and product references.
5. Validate category-specific product attributes.
6. Validate included-item references and detect inclusion cycles.
7. Validate compatibility selectors and detect contradictory allow/deny rules.
8. Detect duplicate product codes inside the candidate version.
9. Detect cross-source conflicts and preserve all source observations.
10. Compute a semantic row hash and generate a diff against the current active version.
11. Store an immutable validation report tied to the candidate content hash.
12. Allow activation only after the exact validated content hash receives admin approval.

The diff must classify at least:

- `new`: code is not present in the comparable active scope;
- `changed`: code exists, but one or more semantic fields changed;
- `invalid`: row cannot enter the candidate catalog;
- `missing`: active code is absent from a declared full-snapshot scope.

Also report `unchanged` for completeness. For changed rows, show field-level before/after values. For invalid rows, show sheet, row number, product code if available, stable error code, field, message, and suggested correction. Missing products are not hard-deleted; they require explicit archival/deactivation handling in the candidate version.

Imports must be idempotent. Re-importing identical content into the same draft must not duplicate products, attributes, included items, sources, rules, or reports.

## Validation and activation workflow

Implement and enforce this state machine in the application service and database constraints where practical:

`draft -> validated -> approved -> active -> archived`

Rules:

- Import creates or updates a `draft` candidate only.
- Any content change after validation invalidates the previous report and approval and returns the candidate to `draft`.
- Validation produces a report with counts, errors, warnings, conflicts, missing products, source checksums, schema version, and candidate content hash.
- Approval is allowed only for an administrator and applies to the exact validated content hash.
- Activation is allowed only for an administrator, with zero validation errors and all blocking conflicts/missing-product decisions resolved.
- Activation is transactional and idempotent. It activates the candidate and archives the previous active version atomically.
- Never leave two active versions in the same managed catalog scope unless the existing architecture explicitly supports that rule.
- Archive is non-destructive. Historical versions and their product/source records remain queryable for audit and revision snapshots.
- Every transition records actor, timestamp, correlation ID, prior/new state, validation report ID, approval, and reason.

Engineering-verification warnings can remain non-blocking when explicitly designed as such, but they must remain visible on the product and downstream BOM. Unconfirmed source editions and conflicting pack quantities require an explicit, audited admin resolution policy.

## Administrative UI/API

Implement the admin experience using the existing web/API conventions:

- upload CSV or XLSX;
- choose/create a draft catalog version and declared import scope;
- preview parsing and normalization problems;
- run validation;
- display summary cards/counts for new, changed, unchanged, invalid, and missing products;
- filter and inspect field-level diffs;
- inspect product source evidence and included-item relations;
- download the validation/error report as CSV or XLSX;
- approve the exact validated candidate;
- activate it with a clear confirmation and audit reason;
- view current active and archived catalog versions.

Admin pages and mutation endpoints must be protected by server-side role checks. Hiding buttons is not authorization. Reuse the Stage 3 error codes and correlation ID response contract. Enforce reasonable file-size/type limits, reject macro-enabled workbooks, and avoid executing spreadsheet formulas or embedded content.

Normal product-selection endpoints must return only active, valid, compatible products. Add server-side filtering; do not rely only on disabled dropdown options in the UI.

## Database population and reproducibility

Create the initial normalized catalog data from the official sources and load it through the same importer/validator used by administrators. Do not create a separate hand-written SQL seed that bypasses validation.

Provide:

- canonical populated import files;
- a deterministic import/seed command for development and test;
- a dry-run mode that produces the diff/report without database mutation;
- a rollback procedure that removes or archives only the candidate created by the command;
- fixtures small enough for focused tests plus the complete initial dataset for acceptance tests.

Production migrations must not auto-activate catalog data. In development/test, activation may be driven by an explicit command or test fixture that performs validation and approval with a documented test administrator identity.

## Required tests

Add unit, integration, authorization, and UI/browser tests as supported by the repository. At minimum cover:

1. CSV and XLSX representations normalize to the same domain records.
2. Decimal commas and weight bases are parsed correctly.
3. Exact model codes containing spaces, dots, slashes, and suffixes round-trip unchanged.
4. Every mandatory DAM, DAZ, and NSA model from pages 156-157 is imported.
5. NSA is indoor-only, concrete-only, and engineering-verification-required.
6. The page 156 anchor pack quantities match the official table.
7. A conflicting DAM pack quantity from another source is reported and is never silently overwritten.
8. KL 60 and WSL 105 representative variants exist for every finish actually listed in their source table.
9. An impossible system/height/width/finish combination cannot be selected through the server API.
10. Included fasteners are not added to the BOM a second time.
11. A separately ordered connector is not mistaken for an included item.
12. Unknown included-product references fail validation.
13. Zero/negative pack or included quantities fail validation.
14. Duplicate codes in one candidate version fail validation.
15. Missing-product detection is limited to a declared full scope.
16. Re-importing identical content is idempotent.
17. Changing draft content invalidates validation and approval.
18. Non-admin users cannot approve or activate.
19. Activation archives the prior active version atomically.
20. A forced activation failure rolls back the transaction without changing the active version.
21. Old project revision snapshots remain unchanged after catalog activation.
22. Validation/error report export contains stable error codes and source row references.

Create record-count and checksum-based acceptance assertions for the normalized initial dataset so accidental row loss is detected. Derive the expected counts from the completed, visually verified scope rather than guessing them in advance.

## Documentation and operational deliverables

Update or create concise documentation covering:

- canonical workbook/CSV schema and examples;
- catalog scope and exclusions;
- source documents, checksums, printed/PDF page mapping, and verification notes;
- all normalization rules and unit mappings;
- finish/material code mapping based on the catalog legend;
- import, dry-run, validation, approval, activation, archive, and rollback procedures;
- interpretation of new/changed/invalid/missing/conflict states;
- known warnings or facts requiring later engineering verification;
- how to add a new official catalog version without changing historical versions.

Add an extraction audit file that lists, per imported family, the source document, printed page range, PDF page range, extracted row count, verified row count, reviewer/status, and unresolved issues. This is evidence, not a substitute for automated validation.

## Definition of Done

Stage 5 is complete only when all of the following are true:

- every usable product in the initial scope has code, English description, category, managed version, positive pack quantity, source, and valid category attributes;
- the official KL/WSL products, fittings, connectors, fixings, constructions, accessories, and required anchors are present in the normalized initial catalog according to the committed scope;
- every mandatory DAM, DAZ, and NSA row from pages 156-157 is represented accurately;
- included items prevent duplicate ordering of supplied bolts, nuts, and washers;
- unsupported system/height/width/material/finish combinations cannot be selected through the server API or UI;
- the validator produces actionable row-level errors and a field-level import diff;
- catalog activation requires a successful validation report and admin approval of the exact content hash;
- version activation is transactional, auditable, idempotent, and non-destructive to historical revisions;
- automated tests, type checking, linting, migrations, and the relevant build all pass;
- no placeholder product records, guessed attributes, or unresolved silent source conflicts remain in the active catalog.

## Execution approach

1. Inspect repository instructions, current branch/worktree, Stage 3/4 schemas, ADRs, tests, and admin patterns.
2. Summarize the implementation plan and exact files/modules to change.
3. Implement in small coherent increments while preserving unrelated user changes.
4. Extract the catalog data into the canonical format, verify it against rendered PDF tables, and import it through the real pipeline.
5. Run the narrow tests during development, then the full relevant validation suite.
6. Review the final diff for accidental generated files, secrets, binary duplication, and scope creep.
7. Do not commit or push unless explicitly asked.

If an ambiguity does not block correctness, choose the safest reversible option and document it. Ask a question only when the missing decision would change persistent data semantics, authorization, or the authoritative source value.

## Final response format

When finished, report:

- what was implemented;
- which catalog families and printed pages were imported;
- exact normalized product counts by category/family and counts of included-item/compatibility records;
- validation/diff results and any resolved source conflicts;
- migrations and important files created or changed;
- commands and tests run with results;
- any remaining non-blocking engineering warnings or clearly scoped follow-up work.

Do not claim Stage 5 is complete if the database contains only fixtures/examples, if the official PDFs were not used, if activation can bypass validation/approval, or if invalid combinations are merely hidden in the client UI.
