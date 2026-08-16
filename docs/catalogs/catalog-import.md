# Catalog import and lifecycle

Stage 5 uses one canonical `catalog-import/v1` schema for both UTF-8 CSV bundles and `.xlsx` workbooks. The empty templates are in `catalogue/templates/catalog-import-v1`; the reproducible official P0 bundle is in `catalogue/imports/niedax-p0-2022`. Both are generated from `packages/catalog-import/src/schema.ts` by `pnpm catalog:generate`.

## Source evidence and scope

`catalogue/catalog-scope.yml` is the completeness contract. The generator reads it, checks both local source SHA-256 values, required anchor codes, record counts, and every family count before writing output. `docs/catalogs/niedax/extraction-audit.csv` records the family/page review.

| Local source                               | Edition status |      Bytes | SHA-256                                                            | Verified page mapping                                                       |
| ------------------------------------------ | -------------- | ---------: | ------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `KAT_NX_KR 2022.pdf`                       | 2022           | 67,704,909 | `b1b90b6af08793e9f7322781918365071476fa7cbbd96e2c3a4a38cf20ab1b6c` | printed KR 340 = PDF 344; KR 426 = PDF 430; relevant ranges use printed + 4 |
| `1.-Electrical-installation-materials.pdf` | unconfirmed    |  3,690,541 | `2fb555d445bebc68f2a86f02ceb77a8dcf69123bdf87bb3eedd8e629b197f82c` | printed 156-157 = PDF 19-20                                                 |

The second filename is the local file explicitly authorized for this stage; its document edition is deliberately `unconfirmed`, producing visible provenance rather than an invented year.

P0 is a complete snapshot only for `p0-kl60-wsl105-anchors`: KL 60 straight ladders and direct connector/fitting/fixing/support rows from KR 340-347 and KR 355-356; WSL 105 straight ladders and direct rows from KR 426-429 and KR 448-450; shared referenced fasteners; and every DAM, DAZ, and NSA row on printed pages 156-157. The overview pages KR 338 and KR 423 were used as indexes. Higher KL/WSL systems, WSLM/WSLSN/WSLS, and decorative/non-direct rows are excluded unless a scoped assembly directly references a shared component. The catalog's optional 3000 mm supply note does not create a fabricated order code.

## Sheets and validation

The workbook and CSV bundle use these exact names:

- `manifest`: managed version, declared complete scope, source identity/edition/checksum, preparation metadata.
- `products`: exact display code, English description, family/category/system, packaging/order units, dimensions, finish/material, weight and basis, approval, source page, orderability, and engineering policy.
- `product_attributes`: one typed value (`text`, `number`, or `boolean`) per product/key, optional separate unit, and source evidence.
- `included_items`: version-local parent/child, positive quantity/unit, evidence, and note.
- `compatibility_rules`: allow-list or assembly relation, deterministic selector JSON, dimensional constraints, evidence, and verification state.
- `assembly_templates` / `template_components`: versioned assemblies, positive quantities, quantity mode, and included-item suppression.
- `source_observations`: parallel official observations plus the selected candidate value and explicit resolution policy.

Parsing never evaluates formulas, macros, or embedded workbook content. Only `.xlsx` is accepted, uploads are limited to 25 MiB, CSV must be valid UTF-8, and all CSV/XLSX rows run through the same schemas. Unknown columns, duplicate codes/attributes, invalid enums or typed values, unsupported units, non-positive quantities, unresolved references, inclusion cycles, selector keys outside the allow-list, contradictory rules, anchor policy violations, and unresolved source conflicts are blocking errors.

Normalization is deterministic:

- Unicode NFC, trimmed/collapsed whitespace; the exact product display code remains unchanged and a separate normalized lookup key is derived.
- Decimal comma becomes a decimal point; period thousands separators are removed only when a comma is present.
- Boolean inputs are normalized from `true/false`, `1/0`, or `yes/no`.
- Numeric value and unit remain separate. Supported units are `pcs`, `pairs`, `m`, `mm`, `kg`, and `Nm`; weight bases are `kg_per_100_m`, `kg_per_100_pcs`, and `kg_per_100_pairs`.
- Printed label and one-based PDF ordinal are separate fields.
- Semantic hashes exclude staging row numbers but include source evidence and all catalog semantics.

The verified catalog legend is mapped as follows:

| Finish | Material mapping                             |
| ------ | -------------------------------------------- |
| `S`    | steel strip galvanized to DIN EN 10346       |
| `F`    | steel, hot-dip galvanized to DIN EN ISO 1461 |
| `E3`   | stainless steel 1.4301 / 1.4303              |
| `E5`   | stainless steel 1.4571                       |

Hardware-specific `V`, `G`, and polymer `K..` values remain literal source codes; the importer does not infer equivalence to S/F/E3/E5.

## Diff and report interpretation

- `new`: no same normalized code in the comparable active scope.
- `changed`: same code with field-level semantic before/after values.
- `unchanged`: semantically identical row.
- `invalid`: one or more blocking row errors; the row remains in staging only.
- `missing`: an active code omitted from the same declared full-snapshot scope. Partial imports never report unrelated products missing.
- `conflict`: incompatible official observations without an authoritative observation and policy. A resolved conflict remains a warning and an immutable `catalog_conflict_resolutions` audit row.

CSV error exports contain stable error code, sheet, source row number, product code, field, message, and suggested correction.

## Commands and administrative workflow

Regenerate all canonical files and verify source/scope checks:

```powershell
corepack pnpm catalog:generate
```

Deterministic dry-run, with optional row-level CSV report and no database mutation:

```powershell
corepack pnpm catalog:import -- --report tmp/catalog-validation.csv
```

After the local stack is running, import and validate through the same repository used by the admin API. The actor UUID must be an enabled development/test administrator:

```powershell
corepack pnpm catalog:seed:dev -- --actor-id <administrator-uuid>
```

Approval and activation are separate explicit operations. For a test environment they may be combined only by an explicit command with a reason:

```powershell
corepack pnpm catalog:seed:dev -- --actor-id <administrator-uuid> --approve --activate --reason "Verified Stage 5 official P0 import"
```

The normal UI/API workflow is `draft -> validated -> approved -> active -> archived`:

1. Open `/admin` on the same application host, sign in as an administrator, and upload one populated
   `.xlsx` or the eight canonical CSV files. Preview is read-only.
2. Import creates/idempotently reuses a draft; changed content clears validation and approval.
3. Validate stores one immutable report for the exact content hash and materializes only valid staging content into the existing Stage 4 catalog entities.
4. An administrator records the approval reason for the exact validated hash.
5. Activation locks the candidate and current active scope, archives the previous active catalog/rule set, and activates the candidate/rules/templates in one transaction.
6. Archive is non-destructive. Products, evidence, transition events, approvals, reports, and saved revision/BOM snapshots remain queryable.

Administrative routes are under `/api/v1/admin/catalog-imports` and `/api/v1/admin/catalog-versions`; all mutation and download routes re-check the administrator role server-side. `/api/v1/catalog/products` requires authentication and returns only orderable products from the active version with an exact verified allow-list rule for the supplied system, height, width, material, and finish.

The project configurator links to `/admin`. After activation, its System step reads the authenticated
`/api/v1/catalog/options` endpoint and exposes only the straight-section variants backed by active,
verified `project_selection` allow-list rules. Fittings, connectors, included hardware, supports, and
anchors remain governed by their assembly/compatibility relations rather than appearing as arbitrary
system variants.

Rollback never resets the persistent database or deletes historical data. Before activation, abandon the inactive candidate and import corrected content under a new managed version. After activation, prepare/validate/approve the recovery content as a new version and activate it transactionally; this archives only the command-created candidate. If no replacement should become active, use the admin Archive action with a reason. An archived version is never mutated or reactivated.

To add another official edition, place the authorized source in the source directory, add its exact checksum/scope/pages to a new scope manifest/version, update the generator extraction, generate a new candidate, and use the same validation/approval flow. Never edit a historical version's normalized files or database records.

## Known non-blocking engineering warnings

- All scoped anchors require project-specific structural verification against the applicable ETA, substrate condition, edge distances, loads, and installation instructions. NSA is additionally indoor-only and concrete-only.
- The electrical-installation-materials document edition is unconfirmed.
- DAM 6X5 and DAM 6X10 are 50 pcs in the designated printed page 156 source while KR 139 reports 100 pcs. Both observations remain stored; P0 selects 50 through the documented Stage 5 policy and validation records two resolved warnings.
