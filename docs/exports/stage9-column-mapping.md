# Stage 9 Change Order column mapping

The user explicitly authorized the supplied **26-column A:Z `Change Order`** template
on 2026-09-09. This supersedes the prompt's 29-column A:AC `List1` requirement.
AA:AC do not exist and are not invented. T15/EX acceptance uses this authorized layout.

Template: `Template/Change order - Clients scope BQB10 Gas sensors materials.xlsx`.
SHA-256: `0f1dde6a901cd319870bec8995b37021ab0c38ad887eac846825805deba8a261`.
Template ID: `change-order-clients-scope-26`; mapping: `change-order-clients-scope-26-1`;
renderer: `stage9-exceljs-2`. See [inventory](stage9-template-inventory.md).

Headers occupy row 5; data starts at row 6. `bomLines` below is relative to
`context.snapshot.calculationResult`. `␠` marks a source header's trailing space.
No production column contains an executable formula.

| Index | Column | Exact header | Saved source | Meaning / unit | Blank policy | Cell type | Number format | Permitted formula | Independently checked example |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | A | Item No. | `BOM ordinal + 1` | Presentation sequence | Never | Text | `@` | None | 1 |
| 2 | B | Design Qty | `bomLines[i].technicalQuantity.value` | Technical demand, line.unit | Never | Exact number/text | `0` or saved scale | None | 24 m |
| 3 | C | Order Qty | `bomLines[i].orderedQuantity.value` | Total ordered quantity, line.unit | Never | Exact number/text | `0` or saved scale | None | 30 m |
| 4 | D | Spare Qty | `bomLines[i].totalSpareQuantity.value` | Total spare, line.unit | Never | Exact number/text | `0` or saved scale | None | 6 m |
| 5 | E | Unit | `bomLines[i].unit` | Saved order unit | Never | Text | `@` | None | m |
| 6 | F | Packaging␠ | `Absent packaging type` | Commercial packaging type | Always | Empty | `@` | None | Empty |
| 7 | G | Packaging Qty | `bomLines[i].packageIncrement.value` | Quantity per package, line.unit | Never | Exact number/text | `0` or saved scale | None | 6 m |
| 8 | H | Unit2 | `bomLines[i].unit` | Package-increment unit | Never | Text | `@` | None | m |
| 9 | I | Ordered Qty | `bomLines[i].packageCount?.value` | Number of packages | Null stays empty | Exact number/text | `0` or saved scale | None | 5 packages |
| 10 | J | Unit3 | `bomLines[i].packageCount?.unit` | Saved package-count unit | Empty if count null | Text | `@` | None | packages |
| 11 | K | Description (EN) | `bomLines[i].descriptionEn` | Saved English description | Never | Literal text | `@` | None | Exact saved fixture description |
| 12 | L | Dimension [mm] | `Absent unambiguous display dimension` | No dimension inference or conversion | Always | Empty | `@` | None | Empty |
| 13 | M | Material | `Absent per-product material` | Route selection is not every product's material | Always | Empty | `@` | None | Empty |
| 14 | N | Weight [kg] | `Absent unambiguous saved field` | No weight calculation | Always | Empty | `@` | None | Empty |
| 15 | O | Clear description of content of a set and type designation | `bomLines[i].includedItems[]` | Saved code/description/quantityPerParent | Empty if none | Literal text | `@` | None | Included relations, no extra order rows |
| 16 | P | Price/pcs | `Out of scope` | Price | Always; no zero/formula | Empty | `@` | None | Empty |
| 17 | Q | Total Price | `Out of scope` | Total price | Always; no zero/formula | Empty | `@` | None | Empty |
| 18 | R | Country of origin | `Absent saved evidence` | Country | Always | Empty | `@` | None | Empty |
| 19 | S | Pos./TAG-No | `No unique tag per aggregated line` | Sources retained in details | Always | Empty | `@` | None | Empty |
| 20 | T | Drawing No. | `Absent saved evidence` | Drawing reference | Always | Empty | `@` | None | Empty |
| 21 | U | Revision number | `context.revision.revisionNumber` | Explicit selected revision | Never | Text | `@` | None | 1 |
| 22 | V | Certificates | `Absent saved evidence` | Certificates | Always | Empty | `@` | None | Empty |
| 23 | W | Original Equipment Manufacturer␠ | `Absent saved evidence` | Do not infer OEM from repository name | Always | Empty | `@` | None | Empty |
| 24 | X | Manufacturer Part No. | `bomLines[i].productCode` | Saved identifier | Null stays empty | Literal text | `@` | None | NX STRAIGHT; leading 00123 in test |
| 25 | Y | ACS barcode | `Absent saved evidence` | External identifier | Always | Empty | `@` | None | Empty |
| 26 | Z | Remarks | `bomLines[i].status,kind,manualInputId,includedItems,warningIds` | English saved status/manual/included/warning references | Never | Literal text | `@` | None | Saved status, warning IDs and details reference |

## Quantity meaning and checked examples

Source formulas C=G×I and D=C−B establish that **Ordered Qty (I)** is package count,
**Packaging Qty (G)** is package increment, and **Order Qty (C)** is total ordered quantity.
Mapping I to domain `orderedQuantity` would be incorrect. C/D copy saved ordered/spare
totals. Neither renderer nor workbook repeats reserve/package/included-item product rules.

The first `all-major-rules-combined` line (`bom-42a46d5c146ec784`) contains technical
24 m, reserve 6 m, reserved 30 m, increment 6 m, count 5 packages, package overage 0 m,
ordered 30 m and total spare 6 m. The connector line (`bom-f99473cb870ca91a`) contains
technical 2 pcs, reserve 1 pcs, reserved 3 pcs, increment 2 pcs, count 2 packages,
package overage 1 pcs, ordered 4 pcs and total spare 2 pcs. These examples were read
independently from the saved engine fixture, not generated by the renderer.

Details retain reserve, reserved total and packaging overage separately. Disabled packaging
keeps `packageCount=null`, leaving I/J empty; G preserves its saved effective increment and
C preserves the saved order quantity. Zero stays numeric zero.

## Decimal and literal-text policy

A number requires at most 15 significant decimal digits and equality after a canonical
15-digit round trip. Otherwise production quantity cells store the original exact text
with format `@`. Excel supports text cells in these positions and the export has no
formulas depending on them. No rounded substitute is emitted. Details preserve canonical
strings and explicit units for all m/pcs/kg lines.

Numeric cells use `0` for integers and the exact saved decimal scale (for example `0.00`
for two decimal places). This avoids the trailing decimal separator Excel displayed with
the initial optional-decimal format. The quantity-column format entries above describe this
decimal-capable policy; the actual per-cell format follows the saved value's scale.

All supplied strings, including =, +, -, @, tabs, newlines and trace formula text, remain
literal shared-string values. Invalid XML controls and text exceeding Excel's 32,767 UTF-16
cell limit are rejected rather than silently truncated. Excel's row limit and the 50 MiB
artifact limit are enforced.

## Missing data, identity and corrections

A saved route's `context.snapshot.project.draft.routes[].selection.materialCode` is
not a material attribute for every anchor, accessory or manual product. Keep it in details;
M remains empty without live catalog lookup or code inference. Dimension, weight, packaging
type, origin, OEM, drawing, certificate and barcode likewise stay empty without an
unambiguous authoritative field. The supplied layout supports genuinely blank cells.

Each saved BOM line creates one row in original order, including distinct lines sharing a
code. Included relations stay informational. Details link BOM IDs and saved trace/source
paths to their exact order rows; there is no extra order column or unlike-unit grand total.

C=G×I and D=C−B are replaced with saved values. P/Q prices and Q26's total formula are
removed, as is commercial Z3=Z2+28 because no authorized expiry date is saved. Production
has no executable formulas; formula explanations remain literal evidence. Allow-listed
reference formulas are verified only in the separate synthetic renderer tests.

This template contains no defective `#REF!` name. Sanitized output recreates valid print
areas/titles and removes the source's orphan image-header token and customer/sample data.
The print area follows the actual data rows and 26 columns; freeze panes/repeated headers
cover rows 1:5.

Native Excel print preview showed the source's one-page-wide scaling compressed order text
too far. Output therefore uses A3 landscape over two pages across with A:E repeated. The
approved column widths and positions remain intact. Details use A3; warnings use two A3
pages across with A:C repeated. This is a reviewed print-scaling correction.
