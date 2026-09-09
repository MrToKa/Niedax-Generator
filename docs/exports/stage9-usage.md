# Stage 9 Excel export

Open a project's revision history and select an explicitly saved revision. Its export panel
shows the selected revision and that workbook output is English, independently of BG/EN UI
language. The server supplies export availability and the latest 20 artifacts for that exact
revision. Export never saves the draft, recalculates, creates a revision or approves it.

The user-authorized template has 26 columns A:Z on `Change Order`, plus `Calculation details`
and `Warnings`. This replaces the initial 29-column `List1` requirement. The production
renderer recreates the sanitized layout using saved evidence; the customer template stays local.
See [mapping decisions](stage9-column-mapping.md) and [acceptance evidence](stage9-evidence.md).

Designer can request an owned saved revision; Reviewer
and Administrator can request any readable revision. Viewer can discover and download existing
permitted artifacts. Retained v1 revisions display an unsupported-version explanation.

The panel supports pending, ready, failed and retry states. Retrying an interrupted request
uses the original idempotency key. A deliberately new request gets a new key. Polling is bounded
and is cancelled when changing revisions or leaving the panel. Ready downloads validate the
HTTP response and binary metadata before creating a browser file; JSON errors are not saved
as XLSX. Backend denial or session expiry remains authoritative.

Artifacts are retained in PostgreSQL with no advertised expiry. The stored bytes are immutable;
later draft, catalog or lifecycle changes cannot rewrite an existing download. A new approval
state has a distinct cache identity. Calculated/Checked workbooks explicitly say not approved.

## Template and quantities

Design Qty is saved technical demand, Packaging Qty is saved package increment, Ordered Qty
is saved package count, Order Qty is saved total ordered quantity and Spare Qty is saved total
spare. These labels reflect the supplied template's formulas. Prices and unavailable metadata
remain empty. Values beyond Excel's numeric precision remain exact text, visibly unchanged.

To change this layout later, inspect the new workbook, review every mapping and update the
template/mapping version. Never enable the separate synthetic renderer test mapping as a
production contract.

## Operations

The backend owns requests, authorization, rendering recovery and downloads. PostgreSQL stores
captured immutable evidence plus complete workbook bytes; no additional mount or published
port is required. Standard migrations must finish before backend startup. The dedicated export
worker claims a bounded number of pending jobs and retries interrupted work, exposing only safe
failure codes. Backup/restore includes artifacts with the rest of the database.

No automatic pruning, external download URL, PDF/CSV/print endpoint, pricing or ERP integration
is introduced. Capacity planning must include stored workbook bytes and captured evidence.
