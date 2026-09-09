# Stage 9 implementation decisions

## Input and implementation plan

The implementation follows Section 9, T15 and the test-entry criteria extracted read-only
from `Niedax_Implementation_Plan_to_Test_Phase_BG.docx`, and the accepted Stage 6–8 contracts.
The plan requires an approved Change Order workbook and an observed Microsoft Excel open.
Neither a synthetic fixture nor a parser is evidence of those acceptance requirements.

Initial workspace discovery on 2026-09-09 found the two catalog-import Excel files only.
During implementation, `Template/Change order - Clients scope BQB10 Gas sensors materials.xlsx`
became available. Its SHA-256 is
`0f1dde6a901cd319870bec8995b37021ab0c38ad887eac846825805deba8a261`.
Read-only inspection found one sheet, `Change Order`, with 26 columns A:Z. The user explicitly
answered “Използвай този шаблон с 26 колони”. This supersedes the prompt's 29-column `List1`
requirement. Production uses a sanitized code-owned recreation of this structure, without
copying customer/sample data. See [the inventory](stage9-template-inventory.md) and
[resolved mapping](stage9-column-mapping.md).

Independent implementation proceeds in these increments:

1. Strict export transport and capabilities, with retained v1 readers unchanged.
2. A complete immutable v3 export context and pure snapshot mapping in `packages/export`.
3. ExcelJS renderer, explicit internal mapping, exact decimal and literal-text handling,
   full details/warnings, and synthetic-only structural/value/formula fixtures.
4. Authenticated backend request/list/status/download, PostgreSQL artifacts and recovery,
   a forward migration, privilege reconciliation and production package wiring.
5. Saved-revision UI with English output notice, availability, retries, bounded polling and
   validated downloads in both UI languages.
6. Focused tests, independent OOXML checks, disposable integration and full source/runtime
   gates, followed by the real Caddy/UI/Excel T15 walkthrough.

## Contracts and evidence

`ExportRequestV1Schema` remains the retained application command. The HTTP body uses
`CreateExportRequestV1Schema`, which omits trusted correlation/idempotency header fields.
The strict `export-artifact/v2` and `export-list-response/v2` contracts add explicit durable
metadata, failure reporting and bounded per-revision discovery without changing v1 semantics.
The artifact contains no bytes, internal paths, credentials or security audit metadata.

The export context captures the saved project, input/result, author snapshot, revision
identity and checksums, plus request-time lifecycle and renderer/mapping/template identity.
Product quantities are copied from the saved result, never calculated again. Historical
names come from saved snapshots. Existing v1 revisions remain readable; creating their
export returns an explicit unsupported-schema outcome because a lossless approved mapping
has not been established.

## Roles and lifecycle

Designer may create exports for owned readable revisions. Reviewer and Administrator may
create exports for every readable revision. Viewer may discover, read status and download
existing artifacts but has no `export:create` capability. All four have `export:read` within
their project read scope. Each request rechecks current enabled identity and source access,
including idempotency/cache hits and downloads.

Calculated and Checked output must say not approved. Only captured actual approval evidence
permits an Approved label. Historical saved revisions remain eligible independently of the
latest revision number. Archived saved v2 evidence may be exported with its archived state;
no archive workflow or lifecycle mutation is introduced by export.

## Storage, recovery and cache identity

Artifacts and bytes live in PostgreSQL so they follow the existing transactional backup and
restore boundary. No external service, host-published port or filesystem mount is added.
Request capture and append-only idempotency evidence commit atomically; rendering happens
outside that short transaction. Ready metadata and complete bytes finalize together. Ready
bytes cannot be rewritten. Status is read separately from the immutable original idempotent
response, which may continue to say pending.

Cache identity includes the complete captured revision and lifecycle evidence and
template/mapping/renderer identity, plus format/language. A later approval must not reuse a
Calculated workbook. Bounded claims, leases and attempts recover interrupted pending work;
terminal failures expose only stable safe codes. Each pass claims at most four jobs, with a
two-minute lease and three attempts. The worker ticks every two seconds; exhausted leases
become terminal failures. The evidence records observed recovery results.

A render attempt has a 90-second deadline. Before finalization the worker verifies the ZIP
end record, complete central directory, local entries and required workbook parts, in
addition to the artifact size limit. Truncated ZIP output cannot become ready.

Artifacts have no automatic expiry or deletion workflow in this stage. `expiresAt` is
always null. Backup capacity planning must include workbook byte storage. Public file names
are bounded ASCII `.xlsx` attachment names derived by the backend/renderer; original Unicode
project names remain in the workbook. Download content type, length, digest, private cache
headers and `nosniff` are mandatory.

## Resolved quantity mapping

Source formulas establish G Packaging Qty = package increment, I Ordered Qty = package count
and C Order Qty = total ordered quantity. B is technical and D is total spare. All copy saved
values; source quantity formulas are removed. P/Q prices remain blank. No SAP column exists
in the authorized variant and none is invented. Numeric overflow uses exact text; null package
count stays empty. Missing per-product material stays blank; route selection is retained only
as route evidence. Full source paths, blanks and examples are in the mapping document.

## Browser compatibility

The application supports HTTP on the LAN. `subtle` and `randomUUID` require secure contexts;
`getRandomValues` does not, per the
[W3C Crypto interface](https://www.w3.org/TR/WebCryptoAPI/#crypto-interface).
Downloads require exact backend-verified digest headers, length, media type, attachment and
ZIP signature. Secure contexts additionally recompute SHA-256; LAN HTTP uses the backend's
mandatory hash verification. Request keys use secure `getRandomValues` UUID generation when
`randomUUID` is absent. Polling has eight checks and a 60-second overall deadline.

## Retained trace identity limitation

The accepted all-major-rules fixture has two assembly trace occurrences sharing
`trace-bd4f2f3197c11056`, with distinct saved sequences/inputs. Export preserves both by their
full source paths and sequence rather than changing snapshots or collapsing them. References
remain resolvable to the same BOM line. No engine expectation was changed.

## Acceptance boundary

The template conflict is resolved by the user's explicit 26-column choice. Automated and
observed Caddy/UI/Excel checks remain distinct evidence. A parser result alone is never an
observed Excel no-repair UI result.
