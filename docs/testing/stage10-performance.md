# Stage 10 performance

Status: proposed engineering budgets, declared before measurements. Domain acceptance is pending.

| Operation after warm-up                              | Typical: 10 routes / 100 segments p95 | Large: 100 routes / 1,000 segments p95 |
| ---------------------------------------------------- | ------------------------------------: | -------------------------------------: |
| Pure engine                                          |                              1,000 ms |                               5,000 ms |
| Authenticated Calculate through Caddy                |                              3,000 ms |                              10,000 ms |
| Save immutable revision through Caddy                |                              3,000 ms |                              10,000 ms |
| Fresh export request until ready (download excluded) |                             10,000 ms |                              45,000 ms |

Run `corepack pnpm test:performance` after dependency installation/build. The command runs engine
and Caddy measurements separately, with three warm-ups and twenty measured samples per case.
Startup/build time is excluded and reported separately. A fresh synthetic project, calculation,
revision and artifact are used for each API sample; cache hits cannot satisfy the export benchmark.
Pacing between samples respects the existing 20 export requests/minute rate limit and is excluded
from operation timings. Budget or correctness failures return nonzero; targets and fixture sizes
are never adjusted automatically to turn a failure green.

The fully resolved engine fixtures contain supports, anchors, bends, logical connections and manual
items. The predeclared workload has 100/1,000 straight segments **plus** 10/100 fitting geometry
entries: actual total geometry counts are 110/1,100. The original short `segments` metadata refers
to straight segments; explicit `straightSegments` and `totalGeometryEntries` fields remove that
ambiguity. This workload is slightly larger than the prompt's total-segment target and was retained
without shrinking after measurement. The API resolver cannot supply confirmed selected fitting mappings in the existing catalog
contract: its synthetic draft uses an unresolved fitting and verifies accepted omission/warnings.
That API result must not be described as a complete, fitting-resolved BOM. Independent quantity
references and benchmark assertions live exclusively under `packages/calculation-engine/tests`.

The global API body limit is 35 MiB; export request bodies are limited to 4 KiB and output to 50 MiB.
The benchmark verifies schema-valid inputs before timing. It records actual input/snapshot/export
sizes and entity/BOM/warning/trace counts, fixture/build hashes, individual durations, p50/p95/max,
failure counts, host Node/OS/CPU/RAM, Docker CPU/RAM and image IDs. Node's process high-water RSS
is reported as a whole-process measurement, not an isolated allocation per calculation. Docker
memory samples are point-in-time values, not a peak-memory claim.

The UI has a 60-second overall deadline but eight scheduled polls total only 43 seconds plus request
time; the 45-second large-export target can therefore require a deliberate status refresh near its
upper bound. The worker has a 90-second render deadline, a 120-second lease, two-second polling and
three attempts. These are distinct limits; an automatic UI deadline or worker retry is not a passed
performance sample.

Machine-readable results: `.artifacts/stage10/safe/performance.json`. Final observed values and
reference hardware are recorded below. CI always records its own hardware context;
these provisional budgets apply consistently, but comparisons across different hardware need review.

The initial development API sample failed selection validation because its dimension ID omitted the
catalog namespace. The fixture now uses the same authoritative dimension ID offered by the editor;
no product rule or accepted limit changed. The failed run is retained as
`.artifacts/stage10/safe/performance-development-failed-selection.json`. First API pipeline timings
are recorded separately: the typical case is the fresh runtime's first calculation/save/export,
while the large case begins after the typical workload has already warmed the runtime.

The complete development run at `2026-09-09T19:15` completed all warm-ups and20 measured samples
for each operation/case, with zero correctness failures and all eight p95 budgets passing. Its
command nevertheless exited1 because the start/end source identity differed while the last guard
edit was being completed. Cleanup passed. This is diagnostic evidence, not a passed final gate:
`.artifacts/stage10/safe/performance-development-source-drift.json`. The final aggregate below reran
against unchanged source and passed; the freshness check remained enabled.

## Final observed run

**Passed, exit0**, `2026-09-09T19:59:04.437Z`–`20:06:43.204Z`, as part of the successful
`validate:stage10` aggregate. All eight budgets pass with20 measured samples per operation/case
after three warm-ups. All46 fresh API pipelines (six warm-ups plus40 measured pipelines) completed
their calculation, immutable save, new export, independent ZIP/OOXML/quantity checks and retained
revision comparison: **0 failures /46 pipelines (0%)**. Source remained unchanged and cleanup passed.
No heavy validation ran alongside these measurements; the fixture and budgets were not reduced.

All values below are milliseconds. p95 uses the nearest-rank19th sorted sample out of20.

| Operation                | Typical p50 | Typical p95 | Typical max | Large p50 | Large p95 | Large max |
| ------------------------ | ----------: | ----------: | ----------: | --------: | --------: | --------: |
| Pure engine              |        7.87 |        8.79 |        9.37 |     63.89 |     65.51 |     69.15 |
| Calculate through Caddy  |       88.80 |      113.89 |      116.26 |    536.10 |    572.27 |    574.03 |
| Save immutable revision  |      126.23 |      142.52 |      142.73 |    883.48 |    905.90 |    931.07 |
| Fresh export until ready |    1,840.92 |    2,806.02 |    2,853.75 |  8,328.04 |  8,533.84 |  9,193.59 |

Setup/build/runtime readiness took25,512.60ms and is excluded from the table. Cold pure-engine
calls took33.70ms /74.90ms. First API pipeline Calculate/Save/export timings were
160.84/175.45/1,598.96ms for typical and563.47/864.22/8,562.21ms for large; the large pipeline
starts after the typical case has already warmed the shared runtime. Download and independent
verification time are excluded from export timing and still must pass for every sample.

| Observed input/evidence                                     |         Typical |               Large |
| ----------------------------------------------------------- | --------------: | ------------------: |
| Routes / straight segments / fitting entries                |     10 /100 /10 |     100 /1,000 /100 |
| Total geometry entries / logical connections / manual items |      110 /9 /10 |      1,100 /99 /100 |
| Pure input bytes / result bytes                             | 51,540 /371,035 |  410,904 /3,407,154 |
| Pure BOM rows / warnings / trace steps                      |     17 /23 /221 |     107 /203 /1,931 |
| API draft bytes                                             |   33,987–33,988 |     341,336–341,337 |
| API hydrated input bytes                                    |   44,354–44,355 |     374,024–374,025 |
| Immutable snapshot bytes                                    | 466,390–466,392 | 4,375,896–4,375,898 |
| Actual XLSX bytes                                           | 534,805–535,072 | 4,942,624–4,943,409 |
| API BOM rows / warnings / trace steps                       |     14 /21 /178 |     104 /201 /1,618 |

The pure and API BOM differences are intentional and independently asserted, as described above:
the API unresolved fitting policy preserves omission and approval blockers. No timing pass grants
structural or domain approval. The largest observed export is below the50MiB limit and its9.19s
maximum is within current UI polling limits; the theoretical45s-versus43s budget/polling mismatch
still requires owner review before accepting the provisional budget.

Reference host: Windows build26200, Intel Core i7-13850HX,28 logical CPUs,
34,029,162,496 bytes RAM, Node24.19.0 and pnpm11.21.0. Docker28.5.1 exposes28 CPUs and
16,605,958,144 bytes RAM. Whole-process high-water RSS after the pure cases was194,344KiB and
388,572KiB; these are cumulative host-process observations, not isolated per-call allocation or
API-worker peaks. Backend point samples were507.2MiB after typical and886.9MiB after large,
against the15.47GiB Docker limit. No backend peak-memory claim is made.

The report records all individual timings, per-sample input/snapshot checksums, seed/helper hashes,
catalog/rule snapshots and backend/frontend/gateway image IDs. Review identity:

- Commit: `52fac048aed95b982c39cec8d26e7f23b2795055` plus the uncommitted source below.
- Source: `sha256:305207c42cd2f63d7380a5a2da2eeb1ff94717ec1eb313739f3a961d8ea0ad23`.
- Lockfile: `sha256:0ea90062871d16be184861b59e8ed9266f7b9a3fa8172809cea62029aa33ce9d`.
- Pure typical input: `sha256:a7fecab370f2a0792e97abc31f3ffddaad2e2780316adf098fc921384c183a27`.
- Pure large input: `sha256:fa5b0c0a2b3ab887d71ce40562364ee3ee99f08e5ce3deb863b87d62d67fed99`.
- Disposable project: `niedax-stage10-18248-1788983946854`; matching
  `.artifacts/stage10/safe/performance-cleanup.json` reports success.

The measurements pass the proposed budgets on this machine. Acceptance of those budgets and any
claim that another CI runner is a comparable performance environment remain separate review actions.
