import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { canonicalJson } from "../packages/calculation-engine/src/index.js";
import { stage10Scenarios } from "../packages/calculation-engine/tests/helpers/stage10-scenarios.js";
import focusedExpected from "../packages/calculation-engine/tests/fixtures/stage10-expected.json" with { type: "json" };
import {
  commitIdentity,
  evidenceDirectory,
  sourceIdentity,
  writeEvidence
} from "./lib/stage10-evidence.js";
import {
  assertBrowserEvidence,
  assertFixtureDigest,
  assertScenarioExecution,
  assertScenarioMappings,
  assertSuiteEvidence,
  AUTH_INTEGRATION_TESTS,
  hasExactPassedTest,
  POSTGRES_ACCEPTANCE_TESTS,
  safeFixturePath,
  type Stage10BrowserEvidence,
  type Stage10SuiteEvidence
} from "./lib/stage10-test-guards.js";

interface Reference {
  id: string;
  fixturePath: string;
  fixtureSha256: string;
  expectedPath: string;
  expectedSha256: string;
  testFile: string;
  testNames: string[];
}
interface Scenario {
  id: string;
  critical: boolean;
  runner: string;
  testFile: string;
  testNames: string[];
  fixtureRefs: string[];
  inputs?: Array<{ key: string; canonicalInputSha256: string; canonicalExpectedSha256: string }>;
}
interface Manifest {
  schemaVersion: string;
  hashAlgorithm: string;
  baselines: Reference[];
  fixtureDependencies: Array<{ path: string; sha256: string }>;
  scenarios: Scenario[];
}
interface SuiteEvidence extends Stage10SuiteEvidence {
  sourceHash?: string;
}

const sourceHash = await sourceIdentity();
const failures: string[] = [];
const checked: string[] = [];
const files = new Set<string>();
function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
async function checkFile(path: string, expectedHash: string): Promise<void> {
  const absolute = safeFixturePath(path);
  const bytes = await readFile(absolute);
  assertFixtureDigest(path, bytes, expectedHash);
  files.add(path);
}
async function evidence<T>(name: string): Promise<T> {
  return JSON.parse(await readFile(resolve(evidenceDirectory, `${name}.json`), "utf8")) as T;
}

try {
  const manifest = JSON.parse(
    await readFile("docs/testing/stage10-regression-manifest.json", "utf8")
  ) as Manifest;
  assert.equal(manifest.schemaVersion, "stage10-regression-manifest/v1");
  assert.equal(manifest.hashAlgorithm, "sha256-normalized-lf");
  assertScenarioMappings(
    manifest.scenarios,
    manifest.baselines.map((baseline) => baseline.id)
  );
  for (const baseline of manifest.baselines) {
    await checkFile(baseline.fixturePath, baseline.fixtureSha256);
    await checkFile(baseline.expectedPath, baseline.expectedSha256);
  }
  for (const dependency of manifest.fixtureDependencies)
    await checkFile(dependency.path, dependency.sha256);

  const unit = await evidence<SuiteEvidence>("unit");
  const integration = await evidence<SuiteEvidence>("integration");
  const postgres = await evidence<{
    sourceHash: string;
    passed: boolean;
    cycles: Array<{ passed: boolean; postgres: SuiteEvidence }>;
  }>("postgres");
  const browser = await evidence<Stage10BrowserEvidence>("browser");
  const browserCleanup = await evidence<{ passed: boolean; project: string }>("browser-cleanup");
  for (const report of [unit, integration, postgres, browser])
    assert.equal(
      report.sourceHash,
      sourceHash,
      "Stale execution evidence: source changed since tests ran"
    );
  assertSuiteEvidence(unit, "unit");
  assertSuiteEvidence(integration, "integration");
  assert(
    unit.passed === true &&
      unit.counts.total > 0 &&
      unit.counts.files > 0 &&
      unit.counts.skipped === 0,
    "Incomplete unit discovery"
  );
  assert(
    integration.passed === true &&
      integration.counts.skipped === POSTGRES_ACCEPTANCE_TESTS.length &&
      integration.counts.files === 3,
    "Ordinary integration skip/discovery mismatch"
  );
  for (const test of AUTH_INTEGRATION_TESTS)
    assert(
      hasExactPassedTest(integration.tests, test.file, test.name),
      "Incomplete ordinary authentication integration"
    );
  assert(postgres.passed && postgres.cycles.length === 2, "Both PostgreSQL cycles are required");
  for (const cycle of postgres.cycles) {
    assertSuiteEvidence(cycle.postgres, "integration", true);
    assert(
      cycle.passed &&
        cycle.postgres.counts.total === POSTGRES_ACCEPTANCE_TESTS.length &&
        cycle.postgres.counts.passed === POSTGRES_ACCEPTANCE_TESTS.length &&
        cycle.postgres.counts.skipped === 0,
      "Incomplete PostgreSQL acceptance"
    );
  }
  assertBrowserEvidence(browser, browserCleanup);

  const suites = {
    unit: unit.tests,
    postgres: postgres.cycles.map((cycle) => cycle.postgres.tests),
    browser: browser.tests
  };
  for (const baseline of manifest.baselines)
    assertScenarioExecution(
      {
        ...baseline,
        critical: true,
        fixtureRefs: [baseline.id],
        runner: baseline.testFile.endsWith(".integration.test.ts")
          ? "postgres"
          : baseline.testFile.endsWith(".spec.ts")
            ? "playwright"
            : "vitest-unit"
      },
      suites
    );
  for (const scenario of manifest.scenarios) {
    assertScenarioExecution(scenario, suites);
    for (const input of scenario.inputs ?? []) {
      const create = stage10Scenarios[input.key];
      const expected =
        focusedExpected.scenarios[input.key as keyof typeof focusedExpected.scenarios];
      assert(create && expected, "Missing independently specified scenario input/expectation");
      assert.equal(
        hash(canonicalJson(create())),
        input.canonicalInputSha256,
        `Scenario input drift: ${input.key}`
      );
      assert.equal(
        hash(canonicalJson(expected)),
        input.canonicalExpectedSha256,
        `Scenario expected drift: ${input.key}`
      );
    }
    checked.push(scenario.id);
  }
  for (const name of ["security", "performance"]) {
    const report = await evidence<{ passed: boolean; sourceHash: string }>(name);
    assert(report.passed, `Required evidence failed: ${name}`);
    assert.equal(report.sourceHash, sourceHash, `Stale evidence: ${name}`);
  }
} catch (error) {
  const message =
    error instanceof Error ? error.message.split("\n")[0]! : "Fixture verification failed";
  failures.push(message.slice(0, 240));
}
await writeEvidence("fixtures.json", {
  schemaVersion: "stage10-fixture-integrity/v1",
  timestamp: new Date().toISOString(),
  commit: commitIdentity(),
  sourceHash,
  checkedFiles: [...files],
  scenarios: checked,
  domainApproval: "pending",
  passed: failures.length === 0,
  failures
});
if (failures.length) {
  process.stderr.write(`${failures.join("\n")}\n`);
  process.exitCode = 1;
} else
  process.stdout.write(
    `Fixture and execution integrity passed: ${files.size} files, T01–T15, complete critical evidence. Domain approval remains separate.\n`
  );
