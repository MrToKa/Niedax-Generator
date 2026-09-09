import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { cpus, platform, release, totalmem } from "node:os";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";

import {
  CalculateProjectDraftResponseV2Schema,
  CalculationInputV2Schema,
  ExportArtifactV2Schema,
  ProjectDraftResponseV2Schema,
  ProjectRevisionResponseV2Schema
} from "../packages/domain/src/index.js";
import { calculateV2 } from "../packages/calculation-engine/src/index.js";
import {
  performanceInput,
  assertPerformanceResult,
  PERFORMANCE_EXPECTED
} from "../packages/calculation-engine/tests/helpers/stage10-fixtures.js";
import {
  performanceDraft,
  assertApiPerformanceResult,
  API_PERFORMANCE_EXPECTED
} from "../packages/calculation-engine/tests/helpers/stage10-api-performance.js";
import { readCells, readParts } from "../packages/export/tests/helpers/ooxml.js";
import { stage10Catalog } from "./lib/stage10-browser-fixture.js";
import { withStage10BrowserEnvironment } from "./lib/stage10-browser-environment.js";
import { commitIdentity, fileHash, sourceIdentity, writeEvidence } from "./lib/stage10-evidence.js";

const WARMUPS = 3;
const SAMPLES = 20;
const BUDGETS = {
  typical: { engine: 1_000, calculate: 3_000, save: 3_000, export: 10_000 },
  large: { engine: 5_000, calculate: 10_000, save: 10_000, export: 45_000 }
} as const;
type Size = keyof typeof BUDGETS;
type Operation = keyof typeof BUDGETS.typical;
const durations: Record<Size, Record<Operation, number[]>> = {
  typical: { engine: [], calculate: [], save: [], export: [] },
  large: { engine: [], calculate: [], save: [], export: [] }
};
const coldEngine: Partial<Record<Size, number>> = {};
const firstApi: Partial<Record<Size, { calculate: number; save: number; export: number }>> = {};
const measurements: unknown[] = [];
const failures: Array<{ case: string; sample: number; category: string }> = [];
const observed = new Set<string>();
const timestamp = new Date().toISOString();
const sourceHash = await sourceIdentity();
const environment = {
  node: process.version,
  platform: platform(),
  osRelease: release(),
  cpu: cpus()[0]?.model,
  logicalCpus: cpus().length,
  ramBytes: totalmem(),
  docker: null as unknown,
  imageIds: [] as string[],
  dockerMemorySamples: [] as unknown[]
};
let startupMs: number | null = null;
let cleanupPassed = false;
let disposableProject: string | null = null;
let currentCase = "setup";
let currentSample = -1;

function digest(value: string | Uint8Array): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
function stats(values: readonly number[]) {
  if (!values.length) return { samples: 0, p50: null, p95: null, max: null };
  const sorted = [...values].sort((a, b) => a - b);
  return {
    samples: values.length,
    p50: sorted[Math.ceil(sorted.length * 0.5) - 1],
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
    max: sorted.at(-1)
  };
}
function dockerRead(args: string[]): string {
  const response = spawnSync("docker", args, { encoding: "utf8", shell: false });
  if (response.status !== 0) throw new Error("Docker reference-context read failed");
  return response.stdout.trim();
}

try {
  environment.docker = JSON.parse(
    dockerRead([
      "info",
      "--format",
      '{"version":"{{.ServerVersion}}","cpus":{{.NCPU}},"ramBytes":{{.MemTotal}}}'
    ])
  ) as unknown;
  for (const size of ["typical", "large"] as const) {
    currentCase = `engine-${size}`;
    const input = CalculationInputV2Schema.parse(performanceInput(size));
    const start = performance.now();
    const cold = calculateV2(input);
    coldEngine[size] = performance.now() - start;
    assertPerformanceResult(size, cold);
    for (let index = 0; index < WARMUPS + SAMPLES; index++) {
      currentSample = index - WARMUPS;
      const before = performance.now();
      const result = calculateV2(input);
      const elapsed = performance.now() - before;
      assertPerformanceResult(size, result);
      assert.deepEqual(result, cold);
      if (index >= WARMUPS) durations[size].engine.push(elapsed);
    }
    measurements.push({
      case: `engine-${size}`,
      entities: PERFORMANCE_EXPECTED[size],
      straightSegments: PERFORMANCE_EXPECTED[size].segments,
      totalGeometryEntries:
        PERFORMANCE_EXPECTED[size].segments + PERFORMANCE_EXPECTED[size].fittings,
      inputBytes: Buffer.byteLength(JSON.stringify(input)),
      inputHash: digest(JSON.stringify(input)),
      bomLines: cold.bomLines.length,
      warnings: cold.warnings.length,
      traceSteps: cold.trace.steps.length,
      resultBytes: Buffer.byteLength(JSON.stringify(cold)),
      peakProcessRssKiB: process.resourceUsage().maxRSS
    });
    process.stdout.write(`Engine ${size}: ${JSON.stringify(stats(durations[size].engine))}\n`);
  }

  const setupStart = performance.now();
  await withStage10BrowserEnvironment(
    async (runtime) => {
      disposableProject = runtime.project;
      startupMs = performance.now() - setupStart;
      environment.imageIds = ["backend", "frontend", "gateway"].map((service) =>
        dockerRead([
          "image",
          "inspect",
          `${runtime.project}/${service}:local`,
          "--format",
          "{{.Id}}"
        ])
      );
      let cookie = "";
      async function request(path: string, body?: unknown): Promise<Response> {
        const response = await fetch(`${runtime.baseUrl}${path}`, {
          method: body === undefined ? "GET" : "POST",
          headers: {
            origin: runtime.baseUrl,
            "x-niedax-csrf": "1",
            ...(cookie ? { cookie } : {}),
            ...(body === undefined
              ? {}
              : {
                  "content-type": "application/json",
                  "idempotency-key": randomUUID()
                })
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          signal: AbortSignal.timeout(110_000)
        });
        if (!response.ok) {
          const value = (await response.json().catch(() => null)) as {
            error?: {
              code?: string;
              details?: { issues?: Array<{ code?: string; path?: unknown[] }> };
            };
          } | null;
          process.stderr.write(
            `Benchmark HTTP failure ${body === undefined ? "GET" : "POST"} ${path.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gu, ":id")}: ${JSON.stringify(value?.error?.details?.issues?.map((issue) => ({ code: issue.code, path: issue.path })) ?? [])}\n`
          );
          throw new Error(`HTTP ${response.status} ${value?.error?.code ?? "request-failed"}`);
        }
        return response;
      }
      const login = await request("/api/v1/auth/login", runtime.accounts.designer);
      cookie = login.headers
        .getSetCookie()
        .map((value) => value.split(";", 1)[0])
        .join("; ");
      if (!cookie) throw new Error("Synthetic authentication did not create a session");
      let nextSampleAt = 0;
      for (const size of ["typical", "large"] as const) {
        currentCase = `caddy-${size}`;
        for (let index = 0; index < WARMUPS + SAMPLES; index++) {
          currentSample = index - WARMUPS;
          await delay(Math.max(0, nextSampleAt - performance.now()));
          nextSampleAt = performance.now() + 3_100;
          const draft = {
            ...performanceDraft(size, stage10Catalog, randomUUID),
            code: `S10-PERF-${size}-${index}-${randomUUID()}`
          };
          const created = ProjectDraftResponseV2Schema.parse(
            await (
              await request("/api/v1/projects", {
                schemaVersion: "create-project-draft-request/v2",
                draft
              })
            ).json()
          );
          const project = created.project;
          const beforeCalculate = performance.now();
          const calculated = CalculateProjectDraftResponseV2Schema.parse(
            await (
              await request(`/api/v1/projects/${project.id}/calculations`, {
                schemaVersion: "calculate-project-draft-request/v2",
                expectedDraftVersion: project.draftVersion
              })
            ).json()
          ).calculation;
          const calculationMs = performance.now() - beforeCalculate;
          assertApiPerformanceResult(size, calculated.result);
          assert.equal(calculated.stale, false);
          const beforeSave = performance.now();
          const revision = ProjectRevisionResponseV2Schema.parse(
            await (
              await request(`/api/v1/projects/${project.id}/revisions`, {
                schemaVersion: "save-project-revision-request/v2",
                expectedDraftVersion: project.draftVersion,
                expectedLatestRevisionNumber: 0,
                calculationRunId: calculated.run.id,
                inputFingerprint: calculated.run.inputFingerprint,
                name: `Synthetic benchmark ${size} ${index}`,
                comment: "Stage 10 performance only"
              })
            ).json()
          ).revision;
          const saveMs = performance.now() - beforeSave;
          if (!("snapshot" in revision)) throw new Error("Expected immutable v2 revision");
          assert.deepEqual(revision.snapshot.calculationResult, calculated.result);
          assert.equal(revision.summary.revisionNumber, 1);
          const beforeExport = performance.now();
          let artifact = ExportArtifactV2Schema.parse(
            await (
              await request(`/api/v1/revisions/${revision.summary.id}/exports`, {
                schemaVersion: "export-request/v1",
                revisionId: revision.summary.id,
                inputFingerprint: calculated.run.inputFingerprint,
                format: "xlsx",
                language: "en"
              })
            ).json()
          );
          if (observed.has(artifact.exportId))
            throw new Error("Fresh export benchmark hit an old artifact");
          observed.add(artifact.exportId);
          while (artifact.status === "pending" && performance.now() - beforeExport < 100_000) {
            await delay(100);
            artifact = ExportArtifactV2Schema.parse(
              await (await request(`/api/v1/exports/${artifact.exportId}`)).json()
            );
          }
          const exportMs = performance.now() - beforeExport;
          if (index === 0)
            firstApi[size] = { calculate: calculationMs, save: saveMs, export: exportMs };
          assert.equal(artifact.status, "ready");
          const downloaded = await request(artifact.downloadPath!);
          const bytes = new Uint8Array(await downloaded.arrayBuffer());
          assert.equal(bytes.length, artifact.contentLength);
          assert.equal(digest(bytes), artifact.contentHash);
          const parts = readParts(bytes);
          const cells = readCells(parts, 1);
          for (const [ordinal, line] of revision.snapshot.calculationResult.bomLines.entries()) {
            const row = ordinal + 6;
            for (const [column, value] of [
              ["B", line.technicalQuantity.value],
              ["C", line.orderedQuantity.value],
              ["D", line.totalSpareQuantity.value],
              ["G", line.packageIncrement?.value ?? null],
              ["I", line.packageCount?.value ?? null]
            ] as const)
              assert.equal(
                cells.get(`${column}${row}`)?.value?.toString() ?? null,
                value?.toString() ?? null
              );
            assert.equal(cells.get(`X${row}`)?.value ?? null, line.productCode);
            for (const column of ["P", "Q"])
              assert.equal(cells.get(`${column}${row}`)?.value ?? null, null);
          }
          for (const sheet of [1, 2, 3])
            assert([...readCells(parts, sheet).values()].every((cell) => cell.formula === null));
          const later = ProjectRevisionResponseV2Schema.parse(
            await (await request(`/api/v1/revisions/${revision.summary.id}`)).json()
          ).revision;
          assert.deepEqual(later, revision);
          if (index >= WARMUPS) {
            durations[size].calculate.push(calculationMs);
            durations[size].save.push(saveMs);
            durations[size].export.push(exportMs);
            measurements.push({
              case: `caddy-${size}`,
              sample: currentSample,
              entities: API_PERFORMANCE_EXPECTED[size],
              straightSegments: API_PERFORMANCE_EXPECTED[size].segments,
              totalGeometryEntries:
                API_PERFORMANCE_EXPECTED[size].segments + API_PERFORMANCE_EXPECTED[size].fittings,
              draftBytes: Buffer.byteLength(JSON.stringify(draft)),
              inputBytes: Buffer.byteLength(JSON.stringify(revision.snapshot.calculationInput)),
              inputHash: digest(JSON.stringify(revision.snapshot.calculationInput)),
              catalog: revision.summary.catalogSnapshot,
              rules: revision.summary.ruleSnapshot,
              engineVersion: revision.summary.engineVersion,
              snapshotBytes: Buffer.byteLength(JSON.stringify(revision.snapshot)),
              exportBytes: bytes.length,
              bomLines: calculated.result.bomLines.length,
              warnings: calculated.result.warnings.length,
              traceSteps: calculated.result.trace.steps.length,
              revisionChecksum: revision.checksums
            });
          }
          process.stdout.write(
            `Caddy ${size} ${index < WARMUPS ? "warmup" : "sample"} ${index < WARMUPS ? index + 1 : currentSample + 1}: calculate=${calculationMs.toFixed(1)} save=${saveMs.toFixed(1)} export=${exportMs.toFixed(1)} ms\n`
          );
        }
        environment.dockerMemorySamples.push(
          JSON.parse(
            dockerRead([
              "stats",
              "--no-stream",
              "--format",
              "{{json .}}",
              `${runtime.project}-backend`
            ])
          ) as unknown
        );
      }
    },
    { cleanupEvidence: "performance" }
  );
  cleanupPassed = true;
} catch (error) {
  // Only bounded safe categories are persisted; assertions may contain complete synthetic snapshots.
  const category =
    error instanceof Error && /^HTTP \d{3} [A-Z_]+$/u.test(error.message)
      ? error.message
      : error instanceof assert.AssertionError
        ? "correctness-assertion"
        : "execution-error";
  failures.push({ case: currentCase, sample: currentSample, category });
  process.stderr.write(
    `Performance failed: ${currentCase} sample=${currentSample} category=${category}\n`
  );
}
if (disposableProject) {
  const cleanup = JSON.parse(
    await readFile(`.artifacts/stage10/safe/cleanup-${disposableProject}.json`, "utf8")
  ) as { passed: boolean; project: string };
  cleanupPassed = cleanup.project === disposableProject && cleanup.passed;
}
const outcomes = Object.fromEntries(
  Object.entries(durations).map(([size, operations]) => [
    size,
    Object.fromEntries(
      Object.entries(operations).map(([operation, values]) => {
        const summary = stats(values);
        const budget = BUDGETS[size as Size][operation as Operation];
        return [
          operation,
          {
            ...summary,
            budgetMs: budget,
            individualMs: values,
            passed:
              summary.samples === SAMPLES &&
              summary.p95 !== null &&
              summary.p95 !== undefined &&
              summary.p95 <= budget
          }
        ];
      })
    )
  ])
);
const sourceUnchanged = sourceHash === (await sourceIdentity());
const passed =
  sourceUnchanged &&
  failures.length === 0 &&
  cleanupPassed &&
  Object.values(outcomes).every((caseResults) =>
    Object.values(caseResults).every((result) => result.passed)
  );
await writeEvidence("performance.json", {
  schemaVersion: "stage10-performance/v1",
  timestamp,
  completedAt: new Date().toISOString(),
  commit: commitIdentity(),
  sourceHash,
  sourceUnchanged,
  lockfileHash: await fileHash("pnpm-lock.yaml"),
  fixtureSourceHashes: await Promise.all(
    [
      "packages/calculation-engine/tests/helpers/stage10-fixtures.ts",
      "packages/calculation-engine/tests/helpers/stage10-api-performance.ts",
      "apps/backend/tests/stage10-browser-seed.ts"
    ].map(async (path) => ({ path, hash: await fileHash(path) }))
  ),
  budgetsStatus: "proposed-domain-review-pending",
  warmups: WARMUPS,
  expectedSamples: SAMPLES,
  environment,
  startupMs,
  coldEngineMs: coldEngine,
  firstApiPipelineMs: firstApi,
  outcomes,
  measurements,
  failures,
  disposableProject,
  cleanupPassed,
  passed
});
if (!passed) process.exitCode = 1;
