import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { isAbsolute, relative, resolve, sep } from "node:path";

export interface Stage10TestEvidence {
  readonly file?: string;
  readonly name?: string;
  readonly localName?: string;
  readonly title?: string;
  readonly status: string;
}

const projectFile = "apps/backend/tests/project-flow.integration.test.ts";
const postgresFile = "apps/backend/tests/stage10-postgres.integration.test.ts";

/** Only these exact credentialed cases may be skipped by ordinary host integration. */
export const POSTGRES_ACCEPTANCE_TESTS = [
  {
    file: projectFile,
    localName:
      "persists draft changes, reloads and calculates two connected routes without a revision"
  },
  {
    file: projectFile,
    localName:
      "runs Stage 9 export authorization, binary integrity, idempotency, lifecycle capture and recovery using the application database role"
  },
  ...[
    "S10-DB01 rolls Calculate back after replacing its transient result and before success evidence",
    "S10-DB02 rolls Save back after BOM projection with no revision, numbering gap, audit or replay success",
    "S10-DB03 rolls Check back after its lifecycle update without a success event or idempotency result",
    "S10-DB04 rolls Approve back after inserting its approval record",
    "S10-DB05 rolls export capture back after artifact insertion and rejects invalid atomic finalization",
    "S10-DB06 coordinates simultaneous same-key saves into one immutable revision and rejects changed payload replay",
    "S10-DB07 keeps snapshot and exact BOM/warning/trace projections unchanged after later draft calculation",
    "S10-DB08 rolls catalog import and validation materialization back after intermediate writes",
    "S10-DB09 retains invalid import evidence and rejects unauthorized or unvalidated activation",
    "S10-DB10 rolls catalog approval and active-version replacement back with their audit evidence",
    "S10-DB11 serializes simultaneous activation of the same approved catalog without duplicate success transitions",
    "S10-DB12 preserves exact P0 NSA indoor/concrete/ETA source policy through the production importer",
    "S10-DB13 saves manual catalog identity separately from automatic demand and persists literal export values"
  ].map((localName) => ({ file: postgresFile, localName }))
] as const;

export const BROWSER_ACCEPTANCE_TESTS = [
  ...[1, 2, 3].map(
    (cycle) =>
      `T04 T11 T12 T14 T15 critical UI journey, independent download and immutable history \u2014 fresh cycle ${cycle}`
  ),
  "T14 narrow keyboard, upstream selection invalidation, autosave retry and two-tab conflict recovery",
  "T04 LAN-style insecure HTTP generates editor UUIDs and calculates through loopback Caddy",
  "T09 T14 T15 blocked approval, later revision and recoverable calculate/export requests"
].map((title) => ({ file: "tests/e2e/critical-workflows.spec.ts", title }));

export interface Stage10BrowserEvidence {
  readonly status: string;
  readonly sourceHash: string;
  readonly sourceUnchanged: boolean;
  readonly discoveryValid: boolean;
  readonly discovered: number;
  readonly passed: number;
  readonly failed: number;
  readonly skipped: number;
  readonly project: string;
  readonly tests: readonly (Stage10TestEvidence & { readonly retry: number })[];
}

export function assertBrowserEvidence(
  browser: Stage10BrowserEvidence,
  cleanup: { readonly passed: boolean; readonly project: string }
): void {
  assert(
    browser.status === "passed" &&
      browser.sourceUnchanged &&
      browser.discoveryValid &&
      browser.discovered === BROWSER_ACCEPTANCE_TESTS.length &&
      browser.tests.length === BROWSER_ACCEPTANCE_TESTS.length &&
      browser.passed === BROWSER_ACCEPTANCE_TESTS.length &&
      browser.failed === 0 &&
      browser.skipped === 0 &&
      browser.tests.every((test) => test.status === "passed" && test.retry === 0),
    "Incomplete browser acceptance"
  );
  for (const test of BROWSER_ACCEPTANCE_TESTS)
    assert(
      hasExactPassedTest(browser.tests, test.file, test.title),
      "Incomplete critical browser workflow identity"
    );
  assert(
    browser.project.length > 0 && cleanup.passed && cleanup.project === browser.project,
    "Missing successful cleanup for the exact browser environment"
  );
}

export const AUTH_INTEGRATION_TESTS = [
  "accepts a six-character password that meets the complexity requirements",
  "rejects a five-character password",
  "supports login, expiry, and explicit logout revocation",
  "lets an administrator create and disable a reviewer",
  "maps a duplicate normalized username to a stable safe conflict",
  "denies administrator actions to reviewers",
  "rejects a missing actor at the internal user-administration boundary",
  "lets an administrator create and page every canonical Stage 8 role",
  ...["designer", "reviewer", "viewer"].map(
    (role) => `denies every user administration operation to ${role}`
  ),
  "revokes active sessions immediately after role or enabled-state changes",
  "protects both the current and last enabled Administrator"
].map((name) => ({ file: "apps/backend/tests/auth.integration.test.ts", name }));

function localName(test: Stage10TestEvidence): string | undefined {
  return test.localName ?? test.title ?? test.name;
}

export function hasExactPassedTest(
  tests: readonly Stage10TestEvidence[],
  file: string,
  name: string
): boolean {
  return tests.some(
    (test) => test.status === "passed" && test.file === file && localName(test) === name
  );
}

export interface Stage10ModuleEvidence {
  readonly file: string;
  readonly state: string;
  readonly ok: boolean;
}

export function summarizeStage10Tests(
  tests: readonly Stage10TestEvidence[],
  modules: readonly Stage10ModuleEvidence[],
  errors: number,
  mode: "unit" | "integration",
  acceptance: boolean,
  reason: string
) {
  const files = modules.length;
  const failedModules = modules.filter(
    (module) =>
      !module.ok ||
      !["passed", "skipped"].includes(module.state) ||
      (module.state === "skipped" &&
        (acceptance ||
          mode !== "integration" ||
          !POSTGRES_ACCEPTANCE_TESTS.some((test) => test.file === module.file)))
  ).length;
  const counts = {
    files,
    total: tests.length,
    passed: tests.filter((test) => test.status === "passed").length,
    failed: tests.filter((test) => test.status === "failed").length,
    skipped: tests.filter((test) => test.status === "skipped").length,
    pending: tests.filter((test) => test.status === "pending").length,
    unhandledErrors: errors,
    failedModules
  };
  const unexpectedSkips = tests.filter(
    (test) =>
      test.status === "skipped" &&
      (acceptance ||
        mode !== "integration" ||
        !POSTGRES_ACCEPTANCE_TESTS.some(
          (expected) => test.file === expected.file && localName(test) === expected.localName
        ))
  );
  const acceptanceValid =
    !acceptance ||
    (files === 2 &&
      tests.length === POSTGRES_ACCEPTANCE_TESTS.length &&
      POSTGRES_ACCEPTANCE_TESTS.every((expected) =>
        hasExactPassedTest(tests, expected.file, expected.localName)
      ));
  return {
    counts,
    passed:
      reason === "passed" &&
      files > 0 &&
      counts.total > 0 &&
      counts.failed === 0 &&
      counts.pending === 0 &&
      errors === 0 &&
      failedModules === 0 &&
      counts.passed + counts.skipped === counts.total &&
      unexpectedSkips.length === 0 &&
      acceptanceValid,
    unexpectedSkips,
    acceptanceValid
  };
}

export interface Stage10SuiteEvidence {
  readonly passed: boolean;
  readonly reason: string;
  readonly tests: readonly Stage10TestEvidence[];
  readonly modules: readonly Stage10ModuleEvidence[];
  readonly counts: ReturnType<typeof summarizeStage10Tests>["counts"];
}

export function assertSuiteEvidence(
  report: Stage10SuiteEvidence,
  mode: "unit" | "integration",
  acceptance = false
): void {
  const actual = summarizeStage10Tests(
    report.tests,
    report.modules,
    report.counts.unhandledErrors,
    mode,
    acceptance,
    report.reason
  );
  assert.deepEqual(report.counts, actual.counts, "Execution count mismatch");
  assert(
    report.passed && actual.passed,
    "Execution evidence did not pass discovery and module checks"
  );
}

export interface ScenarioMapping {
  readonly id: string;
  readonly critical: boolean;
  readonly runner: string;
  readonly testFile: string;
  readonly testNames: readonly string[];
  readonly fixtureRefs: readonly string[];
}

export function assertScenarioMappings(
  scenarios: readonly ScenarioMapping[],
  baselineIds: readonly string[]
): void {
  assert.deepEqual(
    scenarios.map((scenario) => scenario.id).sort(),
    Array.from({ length: 15 }, (_, index) => `T${String(index + 1).padStart(2, "0")}`),
    "Exactly T01–T15 must be mapped"
  );
  assert.equal(new Set(baselineIds).size, baselineIds.length, "Duplicate baseline identity");
  for (const scenario of scenarios) {
    assert(
      scenario.critical && scenario.testNames.length > 0 && scenario.fixtureRefs.length > 0,
      `Missing critical mapping: ${scenario.id}`
    );
    assert(
      ["vitest-unit", "postgres", "playwright"].includes(scenario.runner),
      `Unknown scenario runner: ${scenario.id}`
    );
    assert(
      scenario.testFile.length > 0 && scenario.testNames.every((name) => name.trim().length > 0),
      `Missing exact test identity: ${scenario.id}`
    );
    for (const reference of scenario.fixtureRefs)
      assert(baselineIds.includes(reference), `Missing baseline: ${reference}`);
  }
}

/** Each fresh database cycle must independently execute the complete required scenario. */
export function assertScenarioExecution(
  scenario: ScenarioMapping,
  suites: {
    readonly unit: readonly Stage10TestEvidence[];
    readonly postgres: readonly (readonly Stage10TestEvidence[])[];
    readonly browser: readonly Stage10TestEvidence[];
  }
): void {
  assert(
    ["vitest-unit", "postgres", "playwright"].includes(scenario.runner),
    `Unknown scenario runner: ${scenario.id}`
  );
  const reports =
    scenario.runner === "postgres"
      ? suites.postgres
      : [scenario.runner === "vitest-unit" ? suites.unit : suites.browser];
  assert(reports.length > 0, `Missing execution reports: ${scenario.id}`);
  for (const [cycle, tests] of reports.entries())
    for (const name of scenario.testNames)
      assert(
        hasExactPassedTest(tests, scenario.testFile, name),
        `Critical scenario not executed: ${scenario.id} cycle ${cycle + 1} ${name}`
      );
}

/** Resolve before checking so alternate separators and absolute aliases cannot reach data/. */
export function safeFixturePath(path: string, workspace = process.cwd()): string {
  const absolute = resolve(workspace, path.replaceAll("\\", "/"));
  const local = relative(resolve(workspace), absolute);
  const segments = local.split(sep);
  assert(
    local !== "" &&
      !isAbsolute(local) &&
      segments[0] !== ".." &&
      segments[0]?.toLowerCase() !== "data",
    "Unsafe fixture path"
  );
  return absolute;
}

export function assertFixtureDigest(path: string, bytes: Uint8Array, expectedHash: string): void {
  assert(/^(?:sha256:)?[0-9a-f]{64}$/u.test(expectedHash), "Malformed fixture digest");
  const actual = createHash("sha256")
    .update(
      path.toLowerCase().endsWith(".xlsx")
        ? bytes
        : Buffer.from(bytes).toString("utf8").replaceAll("\r\n", "\n")
    )
    .digest("hex");
  assert.equal(actual, expectedHash.replace(/^sha256:/u, ""), `Unaccepted fixture drift: ${path}`);
}
