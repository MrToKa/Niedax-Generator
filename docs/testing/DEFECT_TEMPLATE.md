# Stage 12 safe defect report

Copy this form for one reproducible issue and reference its ID in
[stage12-defects.md](stage12-defects.md) and the affected [UAT case](UAT_CHECKLIST.md).
Use the existing [Stage 10 policy](stage10-defects.md) and [tester guide](TESTER_GUIDE.md).
Missing deployment/review evidence is an **entry blocker**, not an invented product failure.
Keep unknown values null/pending. Do not submit outside the repository without authorization.

## Severity and status

| Severity | Existing definition                                                                                                   |
| -------- | --------------------------------------------------------------------------------------------------------------------- |
| 1        | Data loss/corruption, unauthorized access or unusable critical workflow.                                              |
| 2        | Wrong material/order quantities, broken immutability/approval or critical workflow failure without a safe workaround. |
| 3        | Limited functional defect or bounded workaround; non-critical warning/validation issue.                               |
| 4        | Cosmetic/usability defect.                                                                                            |

An accountable entry blocker uses severity **null (not a product defect)** and explicitly states
mandatory criterion and release impact. Severity changes require recorded rationale and reviewer;
relabeling cannot waive a mandatory criterion. No open Severity 1/2, high-risk or mandatory blocker
allows GO. Lower-severity workarounds need residual impact and genuine authorized acceptance.

Issue statuses: `open`, `triaged`, `in progress`, `fixed`, `fixed and verified`, `closed`.
Use `fixed` only for a recorded correction, and `fixed and verified` only after an actual matching
retest. Criterion outcomes remain separate `pass`, `fail`, `pending`, `blocked`.
Human domain/security approval and go/no-go signatures cannot be supplied by automated tests.

The machine baseline uses `open`, `fixed`, `verified` and `accepted`: map triaged/in-progress
reports to `open`, and `fixed and verified` to `verified`. A closed report maps to `verified`
only with its actual successful retest, or to `accepted` only for an attributable permitted
non-blocking residual limitation. Closing prose alone never closes a machine blocker.

## Report form

```text
ID:
Title:
Type (product defect, security defect, data/source gap, tooling defect, entry blocker):
Severity (1–4 or null for an entry blocker):
Severity rationale / triage reviewer:
Status:
Mandatory criterion / release impact (blocking or non-blocking with rationale):

Reported by / role:
Observed UTC time / local timezone if relevant:
Candidate baseline ID / evidence digest:
Reviewed/deployed application Git SHA:
Build version / build timestamp / source hash / clean-dirty state:
Environment (accepted TEST, loopback implementation, guarded disposable):
Verified TEST URL or environment identity (null if unknown):
Immutable runtime image identities/digests (if relevant):
Active catalog ID / version / content hash:
Active rule ID / version / content hash:
Engine / formula version:
Role / project ownership context:
Scenario ID / variant / exact fixture selector and input/expected hash:
Project / draft version / calculation run / input fingerprint:
Saved revision ID / number / checksum:
Export artifact ID / template / mapping / renderer / raw workbook SHA-256:

Preconditions (exact selections, units, supply, substrate, settings and provenance):
Reproduction steps (numbered, through supported UI or guarded retained tests):
Independent expected behavior and authority (document / reviewed fixture / source page):
Actual observed behavior (include quantity, unit, warning/status and stable error code):
Reproducibility / affected frequency:
Safe evidence reference / UTC / command exit status / correlation ID:
Environment cleanup result for disposable checks:

Owner role / assigned human (null until assigned):
Impact assessment (materials, order, source facts, security, approval/history, exports):
Workaround / residual impact (null unless demonstrated):
Change request / disposition rationale and authorized reviewer:
Fix reference (path/diff or commit; null until correction exists):
Affected retest scope and independent unchanged expectations:
Retest source/environment/artifact identity / UTC / observer:
Retest actual result / evidence / criterion outcome:
Retest reviewer / acceptance authority:
Closure disposition / UTC / genuine reviewer:
Required renewed baseline review/sign-offs:
```

## Triage and verification

1. Preserve the original observed facts. The technical owner reproduces with exact inputs and
   identifies source/environment scope. A displayed safe correlation ID locates sanitized logs;
   hidden controls alone do not prove backend authorization.
2. Classify product failure versus source limitation or missing external evidence; assign the
   responsible role and mandatory criterion. Link carried Stage 10 issues and retain their original
   fixed/verified scope instead of reopening or closing them without evidence.
3. Record an independent expected result and reviewed source. Do not import synthetic `NX`
   compatibility assumptions into active P0, update goldens from engine output, remove warnings,
   weaken permissions or rewrite saved history to obtain a pass.
4. Apply an authorized scoped fix; record its reference. Run required source/full gates and affected
   retained checks. Negative catalog/account and rollback tests remain guarded disposable checks.
5. Capture retest identities, actual results and reviewer. A matching test pass verifies that fix's
   scope; domain, security, native Excel and operational reviews remain separately attributable.
6. Review change impact against [baseline](stage12-baseline.json) and
   [decision protocol](stage12-go-no-go.md). Changed build/catalog/rules/expectations/export/flags
   require affected retests and renewed exact-candidate sign-off; unrelated documentation edits
   still need an explicit impact assessment. Update register, checklist and readiness together.

Keep passwords, session cookies/tokens, browser storage, account files, raw logs, database dumps
and customer/sample workbook content out of this form and Git. Workbooks/screenshots stay under
approved local/internal access; record a sanitized reference, artifact ID/hash and relevant
observation only. Do not paste raw request headers or browser state. Normal data stays under
`data/`; TEST secrets/backups remain under `data/test/`. A restore-verification report supplements
deployment evidence and never authorizes a live database restore.
