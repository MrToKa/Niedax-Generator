# Workbook evidence

`fixtures/change-order-control.xlsx` is a synthetic project rendered with the user-approved
26-column `Change Order` layout. Its source template hash and exact A:Z headers, widths,
merges and blank policy are reviewed in `change-order-control.expected.json`. It contains
no customer template rows, logo, images or external relationships. The project, actor and
revision metadata are explicitly synthetic. Saved quantities and calculation evidence come
from the existing Stage 6 `all-major-rules-combined` fixtures; no engine expectations change.

The separate `synthetic-control.xlsx` uses an intentionally invented 29-column test layout.
It tests renderer-owned same-row reference formulas and cached values. It is never selected
by the production renderer and does not assert compatibility with a business template.

Run the exporter checks:

```powershell
corepack pnpm --filter @niedax/export test
corepack pnpm --filter @niedax/export typecheck
```

Generate review candidates without changing approved expectations:

```powershell
corepack pnpm --filter @niedax/export golden:candidate
```

The command writes both candidate workbooks and their normalized semantic JSON dumps into
`.artifacts/stage9-candidate/`. Review each semantic diff against the committed golden,
the independently specified expected quantities and source template inventory before
deliberately replacing a golden. Generation does not approve candidates or rewrite
expectation files. Workbook timestamps use a fixed captured request time; raw ZIP hashes
are not used as the semantic acceptance test.

Native Microsoft Excel QA led to renderer `stage9-exceljs-2`: numeric cells use the
exact saved decimal scale (`0` for integers) to avoid Excel's trailing separator
display. Order print settings use A3 landscape on two pages across with A:E repeated;
details use A3, and warnings use two A3 pages across with A:C repeated. These documented
print-scaling changes improve readability while preserving all approved order columns,
widths, merges and saved values.

`helpers/ooxml.ts` reads ZIP central directories, checks each part's CRC and size, resolves
internal OOXML relationships and reads typed cells independently of ExcelJS. Tests also
reopen bytes with ExcelJS, compare all saved evidence leaves, validate every BOM line and
warning, and check absence of external relationships, executable source text and prices.
The production layout has no executable formulas: its quantity formulas are replaced by
the authoritative saved values. Canonical decimals are numeric only with at most 15
significant digits and an exact decimal round trip; larger values remain exact text.

Parser tests do not establish an observed Microsoft Excel open without a repair warning.
That observation must be recorded separately against the downloaded application artifact.
