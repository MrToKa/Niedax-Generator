# Supplied Change Order workbook inventory

Inspected read-only as ZIP/OOXML on 2026-09-09. Embedded content was not executed and no
external links were followed. The original business workbook is not a redistributable fixture.

- Filename: `Template/Change order - Clients scope BQB10 Gas sensors materials.xlsx`
- Length: 13,366 bytes.
- SHA-256: `0f1dde6a901cd319870bec8995b37021ab0c38ad887eac846825805deba8a261`.
- Sheets: one visible sheet named `Change Order`.
- Used range: A1:Z26. Metadata rows 1:4; headers row 5; 20 existing customer/order rows 6:25;
  price total row 26. All customer metadata, product/sample rows and prices must be discarded.
- There are 26 column headers, not the 29 required by the prompt. AA:AC do not exist.
- Freeze: ySplit 5, top-left A6, zoom 70%. Filter A5:Z25. No tables.
- Merges: A1:C1, D1:J1, K1:X2, A2:C2, D2:J2, A3:C4, D3:J4, K3:X4.
- Names: sheet-scoped `_xlnm.Print_Area` = `'Change Order'!$A1:$Z26` and
  `_xlnm.Print_Titles` = `'Change Order'!$5:$5`. No defective `#REF!` defined name exists
  in this supplied variant. There is no name to claim to have repaired.
- Print: A3 (paperSize 8), landscape, fit width 1, fit height 0, scale 38. Margins
  left/right 0.25 in, top/bottom 0.75, header/footer 0.3. The odd header requests a
  left image and right page numbers; the archive contains no image/drawing asset.
- Numeric quantity cells use style 35; weight uses style 36; price uses style 37.
  Headers use styles 31:33, height 36 pt. Existing item rows have height 25.5 pt.
  The archive contains a local theme, shared strings and style definitions.
- No macros, external workbook relationships, connections, hyperlinks or comments parts
  were found. Workbook formulas are internal references.

## Exact supplied headers and widths

Trailing spaces are explicitly represented as `␠` below; they are part of the source spelling.

| Column | Header                                                     |       Width |
| ------ | ---------------------------------------------------------- | ----------: |
| A      | Item No.                                                   | 10.06640625 |
| B      | Design Qty                                                 | 12.19921875 |
| C      | Order Qty                                                  | 11.19921875 |
| D      | Spare Qty                                                  | 11.33203125 |
| E      | Unit                                                       |    6.796875 |
| F      | Packaging␠                                                 | 11.86328125 |
| G      | Packaging Qty                                              |  14.9296875 |
| H      | Unit2                                                      |   7.6640625 |
| I      | Ordered Qty                                                | 13.06640625 |
| J      | Unit3                                                      |  7.73046875 |
| K      | Description (EN)                                           | 47.19921875 |
| L      | Dimension [mm]                                             | 16.46484375 |
| M      | Material                                                   | 20.46484375 |
| N      | Weight [kg]                                                | 13.59765625 |
| O      | Clear description of content of a set and type designation | 55.73046875 |
| P      | Price/pcs                                                  | 11.86328125 |
| Q      | Total Price                                                |  13.1328125 |
| R      | Country of origin                                          | 12.73046875 |
| S      | Pos./TAG-No                                                |          15 |
| T      | Drawing No.                                                |  22.1328125 |
| U      | Revision number                                            | 12.59765625 |
| V      | Certificates                                               |  11.1328125 |
| W      | Original Equipment Manufacturer␠                           |   15.265625 |
| X      | Manufacturer Part No.                                      |   22.265625 |
| Y      | ACS barcode                                                | 13.86328125 |
| Z      | Remarks                                                    | 47.86328125 |

## Formula meaning and mapping proposal

Each item row r has C[r] = G[r] * I[r], D[r] = C[r] - B[r], and
Q[r] = P[r] * C[r]. Q26 sums Q6:Q25. Z3 = Z2 + 28 is a commercial date formula.
No customer quantities or prices are reproduced here.

These references indicate G (Packaging Qty) is a package increment and I (Ordered Qty)
is package count, while C (Order Qty) is the total ordered base-unit quantity. This differs
from interpreting the label Ordered Qty as the domain field `orderedQuantity`.
For this variant the compatible proposal is B = saved `technicalQuantity`,
G = saved `packageIncrement`, I = saved `packageCount`, C = saved `orderedQuantity`,
D = saved `totalSpareQuantity`. Copy every value directly; the source's multiplication
and spare subtraction must not become duplicated product rules in Excel. Price fields P/Q
and the total row remain empty. A null package count remains null, requiring an explicit
compatible presentation for packaging-disabled lines.

The user explicitly authorized this 26-column template after the discrepancy was reported.
It supersedes the initial 29-column `List1` contract; no extra headers or SAP column are
invented. The complete final source mapping is in `stage9-column-mapping.md`.
