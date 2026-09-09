# Stage 10 security verification

The 2026-09-09 pnpm audits found 17 advisory entries across production and development
dependencies. Compatible package patches and one explicitly scoped ExcelJS dependency
replacement removed all reported npm advisories. The latest observed local
`corepack pnpm test:security` run exited successfully: its final scoped report at
`2026-09-09T19:59:03.679Z` scanned 439 source paths and 44 built assets (18 frontend,
26 backend), found zero scanner findings, and completed both dependency audits with
exit 0 and zero advisories. It recorded `sourceUnchanged: true` and `secretsRead: false`.

This is a scoped source/asset/dependency result. The final local aggregate completed
with exit0 at `2026-09-09T20:06:44.144Z` and matching source evidence. Historical critical/high Docker
image findings remain recorded below; no new Docker vulnerability scan has been
performed during this security-document preparation, and those images are not
declared clean. Technical success does not constitute domain approval.

## Audit execution and evidence

Tooling: Node `24.19.0`, pnpm `11.21.0`, repository lockfile installation with
`--frozen-lockfile`. Audit commands are `corepack pnpm audit --prod --json` and
`corepack pnpm audit --json`; no severity exclusion or audit suppression is used.
The Stage 10 command treats an unavailable/invalid audit response, missing metadata,
or nonzero exit as a failed gate. A disconnected registry cannot produce a clean result.

| Observed report                                             |                 Production entries |              All dependency entries | Interpretation                                                                                |
| ----------------------------------------------------------- | ---------------------------------: | ----------------------------------: | --------------------------------------------------------------------------------------------- |
| Initial audit, 2026-09-09                                   | 14: 2 critical, 9 high, 3 moderate | 17: 2 critical, 10 high, 5 moderate | Actionable findings present                                                                   |
| After direct and compatible transitive patches              |                         1 moderate |                          1 moderate | Only ExcelJS's old UUID dependency remained                                                   |
| After scoped UUID replacement                               |                                  0 |                                   0 | Both final raw audit files contain empty advisory objects and zero severity counts            |
| Wrapped security command, `18:43:28.735Z` / `18:43:29.355Z` |                          0, exit 0 |                           0, exit 0 | Both audits executed, recorded and passed                                                     |
| Earlier checkpoint, `19:48:25.170Z` / `19:48:25.825Z`       |                          0, exit 0 |                           0, exit 0 | Both audits executed after the browser synchronization correction                             |
| Final scoped run, `19:59:03.009Z` / `19:59:03.611Z`         |                          0, exit 0 |                           0, exit 0 | Both audits executed after repeated full validation and browser acceptance on the same source |

Raw audit JSON is local and ignored under `.artifacts/stage10/`:
`audit-prod-initial.json`, `audit-all-initial.json`, `audit-prod-after-patches.json`,
`audit-all-after-patches.json`, `audit-prod-final.json`, `audit-all-final.json`.
The final wrapped reports are `.artifacts/stage10/safe/audit-prod.json` and
`.artifacts/stage10/safe/audit-all.json`; the complete scoped result is
`.artifacts/stage10/safe/security.json`. The latter records commit, source and lockfile
hashes, discovered path/asset counts, finding categories and audit execution/exit states.

Both the `19:48:25.913Z` checkpoint and final `19:59:03.679Z` scoped result identify baseline commit
`52fac048aed95b982c39cec8d26e7f23b2795055`, source
`sha256:305207c42cd2f63d7380a5a2da2eeb1ff94717ec1eb313739f3a961d8ea0ad23`, and lockfile
`sha256:0ea90062871d16be184861b59e8ed9266f7b9a3fa8172809cea62029aa33ce9d`.
The repeated full validation, browser acceptance and final scoped scan use that
same source identity. The scoped passing result does not replace remaining aggregate
performance/evidence checks or the unresolved runtime-image reassessment.

Immutable identity of the initial/final raw evidence:

| File                      | SHA-256                                                            |
| ------------------------- | ------------------------------------------------------------------ |
| `audit-prod-initial.json` | `b56ad973272d93c2818383ea05b171d948c1a151d00cd4621cf86539994823d7` |
| `audit-all-initial.json`  | `7d4925851dab813c14ed8aed7f39343c3360dbc52b5712ced00593ef696ccd2f` |
| `audit-prod-final.json`   | `e319d17fdae25b3953bac84d9e55ddc49d00a7d0a848f81c6de984c6dd03096c` |
| `audit-all-final.json`    | `e2db8bc4df2235d00b9e56bd0529e24635f8b3d828d1175d5963d4d5d513454b` |

## Advisory triage

The 17 entries include separate affected-major-version records for the same fast-uri
advisory and separate `vitest`/`@vitest/mocker` records. They are not 17 distinct
exploits. The audit-provided primary GitHub advisory identifiers are retained below.
All rows are resolved in the current lockfile; the final scoped audit and repeated
full validation passed for the source identity recorded above.

| Audit entry | Advisory / issue                                                                                                       | Severity | Initial affected version and paths       | Exact installed fix     |
| ----------- | ---------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------- | ----------------------- |
| 1119441     | [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq), UUID short-buffer bounds                     | Moderate | `uuid 8.3.2`, P1                         | Scoped `uuid 11.1.1`    |
| 1158514     | [GHSA-w2qp-rph6-63g4](https://github.com/advisories/GHSA-w2qp-rph6-63g4), Fastify primitive coercion validation bypass | Moderate | `fastify 5.11.3`, P2                     | `fastify 5.12.1`        |
| 1158519     | [GHSA-3m5p-2c4r-xxw2](https://github.com/advisories/GHSA-3m5p-2c4r-xxw2), forwarded-header hop-count spoofing          | Moderate | `fastify 5.11.3`, P2                     | `fastify 5.12.1`        |
| 1158520     | [GHSA-5jgf-p345-68v8](https://github.com/advisories/GHSA-5jgf-p345-68v8), skipped IDN normalization                    | High     | `fast-uri 4.1.2`, P3                     | `fast-uri 4.1.4`        |
| 1158521     | [GHSA-5jgf-p345-68v8](https://github.com/advisories/GHSA-5jgf-p345-68v8), affected v3 branch                           | High     | `fast-uri 3.1.5`, P4                     | `fast-uri 3.1.7`        |
| 1158523     | [GHSA-f65p-4m7j-42xc](https://github.com/advisories/GHSA-f65p-4m7j-42xc), malformed IPv6 normalization / SSRF          | High     | `fast-uri 4.1.2`, P3                     | `fast-uri 4.1.4`        |
| 1158524     | [GHSA-f65p-4m7j-42xc](https://github.com/advisories/GHSA-f65p-4m7j-42xc), affected v3 branch                           | High     | `fast-uri 3.1.5`, P4                     | `fast-uri 3.1.7`        |
| 1158526     | [GHSA-fph4-wmhf-6fwf](https://github.com/advisories/GHSA-fph4-wmhf-6fwf), repeated hostname decoding / SSRF            | High     | `fast-uri 4.1.2`, P3                     | `fast-uri 4.1.4`        |
| 1158527     | [GHSA-fph4-wmhf-6fwf](https://github.com/advisories/GHSA-fph4-wmhf-6fwf), affected v3 branch                           | High     | `fast-uri 3.1.5`, P4                     | `fast-uri 3.1.7`        |
| 1158529     | [GHSA-jqff-g426-hqxp](https://github.com/advisories/GHSA-jqff-g426-hqxp), percent-encoded scheme host confusion        | High     | `fast-uri 4.1.2`, P3                     | `fast-uri 4.1.4`        |
| 1158530     | [GHSA-jqff-g426-hqxp](https://github.com/advisories/GHSA-jqff-g426-hqxp), affected v3 branch                           | High     | `fast-uri 3.1.5`, P4                     | `fast-uri 3.1.7`        |
| 1193676     | [GHSA-p293-qw3h-jr36](https://github.com/advisories/GHSA-p293-qw3h-jr36), Windows-hosted Next.js unauthenticated RCE   | Critical | `next 16.3.0`, P5                        | `next 16.3.3`           |
| 1193683     | [GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9), redirect mock arbitrary file read            | Moderate | `vitest 4.1.10`, P7, development         | `vitest 4.1.11`         |
| 1193684     | [GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9), transitive mocker record                     | Moderate | `@vitest/mocker 4.1.10`, P8, development | `@vitest/mocker 4.1.11` |
| 1193725     | [GHSA-rgj7-g3m4-5g8c](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c), sharp/libheif                                | High     | `sharp 0.35.3`, P6, optional runtime     | `sharp 0.35.4`          |
| 1193727     | [GHSA-2883-xcg3-v3hh](https://github.com/advisories/GHSA-2883-xcg3-v3hh), YAML merge CPU exhaustion                    | High     | `js-yaml 4.3.1`, P9, development         | `js-yaml 4.3.2`         |
| 1193732     | [GHSA-2xp9-vwfh-vxw4](https://github.com/advisories/GHSA-2xp9-vwfh-vxw4), Next.js AVIF image optimization RCE          | Critical | `next 16.3.0`, P5                        | `next 16.3.3`           |

Affected path definitions preserve the package-manager dependency direction:

| Path | Initial dependency path(s)                                                                                                                                                                                                                                                                                                                                          |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1   | `packages/catalog-import > exceljs > uuid`; `packages/export > exceljs > uuid`                                                                                                                                                                                                                                                                                      |
| P2   | `apps/backend > fastify`                                                                                                                                                                                                                                                                                                                                            |
| P3   | P2 `> @fastify/ajv-compiler > fast-uri`; P2 `> @fastify/fast-json-stringify-compiler > fast-json-stringify > fast-uri`; P2 `> fast-json-stringify > fast-uri`                                                                                                                                                                                                       |
| P4   | P2 `> @fastify/ajv-compiler > ajv > fast-uri`; P2 `> @fastify/ajv-compiler > ajv-formats > ajv > fast-uri`; P2 `> @fastify/fast-json-stringify-compiler > fast-json-stringify > ajv > fast-uri`; same compiler/stringifier `> ajv-formats > ajv > fast-uri`; P2 `> fast-json-stringify > ajv > fast-uri`; P2 `> fast-json-stringify > ajv-formats > ajv > fast-uri` |
| P5   | `apps/frontend > next`                                                                                                                                                                                                                                                                                                                                              |
| P6   | `apps/frontend > next > sharp`                                                                                                                                                                                                                                                                                                                                      |
| P7   | `vitest` under the root, `apps/backend`, `apps/frontend`, `database`, `packages/calculation-engine`, `packages/domain`, `packages/export`                                                                                                                                                                                                                           |
| P8   | Every P7 path `> @vitest/mocker`                                                                                                                                                                                                                                                                                                                                    |
| P9   | Root and frontend ESLint/config/plugin/resolver/TypeScript-ESLint branches, each ending `eslint > @eslint/eslintrc > js-yaml`; every fully expanded path remains in entry 1193727 of `audit-all-initial.json`                                                                                                                                                       |

Reachability was reviewed without using it as a waiver. Fastify and its URI dependencies
are in the backend runtime; strict body/query validation and Caddy-only ingress remain
required. The app uses `trustProxy: true`, not a numeric hop-count, but both Fastify
advisories were fixed together. The URI findings are in JSON-schema/serialization
dependencies; the existing internal-network policy and absence of arbitrary outbound
URL features constrain exposure but do not prove library safety.

Next.js and optional sharp are frontend runtime dependencies. The Windows-specific
Next.js advisory's platform condition does not match the Linux application images,
but development tooling runs on Windows and the AVIF/image-processing findings remain
relevant to the installed package. Both were patched. Vitest/mocker and js-yaml belong
to test/lint tooling and are omitted from deployed application production dependencies;
their patching protects the development/CI environment as well.

## Scoped UUID compatibility decision

`pnpm-workspace.yaml` contains only the deliberate consumer override
`exceljs@4.4.0>uuid: 11.1.1`. It is not an audit-fix blanket override. The installed
ExcelJS source's UUID calls are `require('uuid').v4()` in
`lib/xlsx/xform/sheet/cf-ext/cf-rule-ext-xform.js`; no ExcelJS call to the advisory's
v3/v5/v6 short-buffer API was found. UUID 11.1.1 retains a Node CommonJS export and
the v4 call shape. This source compatibility check supports the narrowly scoped
replacement in both catalog import and export consumers.

`packages/export/tests/dependency-security.test.ts` resolves UUID from ExcelJS's own
module location, asserts exactly 11.1.1, checks a valid CommonJS v4 result, and requires
the vulnerable v5 short-buffer request to throw. The focused dependency and approved
workbook suites passed three tests across two files during implementation. The two
approved-workbook tests independently compare generated OOXML with the retained golden,
literal saved quantities, metadata, exact 26-column layout and precision/null behavior.
They did not regenerate any expected workbook or accept output drift.

The production workbook remains `Change Order`, `Calculation details`, `Warnings`;
P/Q price cells remain blank and all quantity cells come from immutable saved evidence.
This package compatibility/OOXML observation is not a new native Microsoft Excel
opening result. The user's historical Stage 9 no-repair observation retains the exact
scope documented in [Stage 9 evidence](../exports/stage9-evidence.md).

## Automated security behavior

The aggregate `validate:stage10` workflow combines these behavior tests with the scoped
scanner/audit command. `test:security` itself runs source/build scanning, ignore checks
and dependency audits; it does not independently rerun all API/database tests.

| Boundary                                                             | Exact executable coverage                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Strict version/body/query/ID validation, CSRF and same origin        | `apps/backend/tests/project-routes.test.ts`: `requires CSRF and Idempotency-Key for project mutations`; `apps/backend/tests/revision-routes.test.ts`: `rejects unsupported versions and unknown request keys before service mutation`, `rejects unbounded or unknown history query parameters`; `apps/backend/tests/export.test.ts`: `enforces authentication, Origin, CSRF, trusted headers, strict body, path and query` |
| Roles, capabilities, account revocation and owner non-disclosure     | Table-driven `authorization-policy.test.ts`; `user-admin.test.ts`: `invalidates an existing cookie when an Administrator changes its user's role`; ordinary `auth.integration.test.ts`: `supports login, expiry, and explicit logout revocation`, `revokes active sessions immediately after role or enabled-state changes`; the two real-PostgreSQL credentialed tests in `project-flow.integration.test.ts`              |
| Current export permissions, cache/idempotency and cross-owner access | `export.test.ts`: `uses current database permission when a role changes during listing`; `export-acceptance.ts` invoked by the PostgreSQL Stage 9 acceptance test covers Viewer read-only access, foreign Designer 404, revoked-cookie 401, concurrent/cached/replayed creation and lifecycle-specific artifacts                                                                                                           |
| Atomic security-relevant state and audit integrity                   | `stage10-postgres.integration.test.ts` S10-DB01–DB11; retained Stage 8 SQL assertions; no partial approval/artifact/idempotency success after controlled failure, and no unauthorized catalog transition                                                                                                                                                                                                                   |
| Export strings, precision and executable content                     | `packages/export/tests/workbook.test.ts`: `rejects XML controls, unpaired surrogates and cell overflow while retaining literal trigger characters`, `writes literal injection-like text, leading-zero codes and all units without formulas or numeric coercion`; approved workbook golden tests prohibit formulas, macros, external parts and invalid references                                                           |
| Binary integrity and transport                                       | `export.test.ts`: `finalizes only complete bounded ZIP bytes using a backend-generated safe filename`, `rejects tampered stored bytes before transport`, `serves authorized binary with XLSX headers and keeps pending errors JSON`; independent ZIP CRC/OOXML relationship checks in `packages/export/tests/helpers/ooxml.ts`; actual browser download reconciliation in `tests/e2e/download-checks.ts`                   |
| Disposable target refusal                                            | 13 cases in `scripts/tests/db-check-config.test.ts`; browser environment guard tests retain exact project/port/path/network/volume restrictions                                                                                                                                                                                                                                                                            |

The real-PostgreSQL run documented in [database evidence](stage10-database.md) passed
15/15 tests in each of two fresh cycles, with no skips, after the documented
manual-catalog identity correction and its S10-DB13 regression. In-memory authentication
integration tests are identified separately and are not described as database proof.
The repeated fresh browser acceptance report at `2026-09-09T19:58:56.823Z` records
6/6 passing cases with `sourceUnchanged: true` on the same `305207c42...` source.
Its separate guarded cleanup report passed at `2026-09-09T19:59:01.579Z`. These
results support the executable browser/export security boundaries above; remaining
aggregate performance and evidence checks retain their own status.

## Scanner and artifact scope

`scripts/stage10-security.ts` inventories tracked and non-ignored untracked paths via
Git. It reports sensitive path or credential-signature categories without printing
matched values and rejects tracked data/secrets before opening their content. It
scans supported source/config/document text, including `.env.example`, SQL, CSV and Caddyfile,
for private-key, GitHub-token, AWS-key
and credentialed PostgreSQL-URL signatures, plus actual external asset references in
runtime source. These are explicit heuristic checks, not a general secret detector
or proof that every possible credential representation is absent.

Built JavaScript/CSS/HTML under `apps/frontend/.next/static` and `apps/backend/dist`
is scanned separately. A missing build directory or zero assets in either frontend or backend fails the
command. The existing `test:runtime-isolation` gate adds runtime-source URL checks,
rendered HTML asset checks, published-port assertions and live egress probes. These
network checks are distinct from the static signatures and from vulnerability scans.

Ignore checks cover `data/secrets`, generated browser state, test traces, Playwright
reports and storage-state filenames. Browser configuration disables trace, screenshot
and video capture; generated credentials and downloads stay outside committed files.
Safe reports contain allow-listed names/counts/statuses and bounded artifact metadata,
not cookies, authorization headers, sensitive request bodies or workbook contents.
The CI workflow uploads explicit safe JSON filenames with seven-day retention rather
than a directory wildcard. `.artifacts`, customer templates, dumps, browser outputs
and local secrets must also remain excluded from Docker build contexts.

The final security command must be rerun after any review fixes to scanner, artifact
filters, dependencies or runtime assets. Only its matching final source/lock/build
identity may satisfy the Stage 10 security gate.

## Historical image findings and remaining action

[Existing security documentation](../security.md) records a Docker Scout 1.18.3 scan
on **2026-08-13**, before Stage 10. It reported the following critical/high counts:

| Historical runtime image  | Critical | High |
| ------------------------- | -------: | ---: |
| Frontend                  |        0 |    0 |
| Backend                   |        0 |    0 |
| Migrations                |        0 |    0 |
| Gateway                   |        0 |    2 |
| PostgreSQL official image |        4 |   21 |
| Backup                    |        3 |    5 |

The recorded Gateway findings concerned embedded Go/gRPC dependencies; PostgreSQL
and backup findings concerned upstream libcurl/gosu components. The old aggregate
record does not provide current per-advisory reachability or a fresh image scan.
It cannot establish that the rebuilt Stage 10 frontend/backend images are clean,
or that the pinned Caddy/PostgreSQL/backup findings have disappeared.

The owner of the runtime-image update process must re-scan the exact final image IDs,
record advisory IDs and reachable components, and apply verified pinned updates where
available. Remaining severity-1/2 findings require resolution before the full Stage 10
Definition of Done can be claimed. Keep this work in the defect/evidence log; do not
silence scanner findings or treat internal networking as an exemption.

Docker Desktop's documented Gateway-only ingress bridge also retains a network-level
egress route. Its existing exception and the requirement for separately authorized
host-firewall changes remain unchanged. Stage 10 adds no cloud service, public tunnel,
telemetry, external runtime asset or runtime internet requirement.
