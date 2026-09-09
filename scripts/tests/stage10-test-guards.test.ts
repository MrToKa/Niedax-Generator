import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  assertBrowserEvidence,
  assertFixtureDigest,
  assertScenarioExecution,
  assertScenarioMappings,
  assertSuiteEvidence,
  hasExactPassedTest,
  BROWSER_ACCEPTANCE_TESTS,
  POSTGRES_ACCEPTANCE_TESTS,
  safeFixturePath,
  summarizeStage10Tests,
  type ScenarioMapping,
  type Stage10ModuleEvidence,
  type Stage10TestEvidence
} from "../lib/stage10-test-guards.js";

const unit: Stage10TestEvidence = {
  file: "packages/example/tests/rules.test.ts",
  name: "Rule suite > exact required behavior",
  localName: "exact required behavior",
  status: "passed"
};
const modules: Stage10ModuleEvidence[] = [{ file: unit.file!, state: "passed", ok: true }];
const acceptance = POSTGRES_ACCEPTANCE_TESTS.map((test) => ({
  ...test,
  name: `Credentialed suite > ${test.localName}`,
  status: "passed"
}));
const databaseModules = [...new Set(acceptance.map((test) => test.file))].map((file) => ({
  file,
  state: "passed",
  ok: true
}));
function scenarios(): ScenarioMapping[] {
  return Array.from({ length: 15 }, (_, index) => ({
    id: `T${String(index + 1).padStart(2, "0")}`,
    critical: true,
    runner: "vitest-unit",
    testFile: unit.file!,
    testNames: [unit.localName!],
    fixtureRefs: ["approved-reference"]
  }));
}

describe("Stage 10 evidence gates", () => {
  it("requires successful overall browser status in addition to all six passing tests", () => {
    const browser = {
      status: "passed",
      sourceHash: "synthetic",
      sourceUnchanged: true,
      discoveryValid: true,
      discovered: 6,
      passed: 6,
      failed: 0,
      skipped: 0,
      project: "niedax-stage10-123-456",
      tests: BROWSER_ACCEPTANCE_TESTS.map((test) => ({ ...test, status: "passed", retry: 0 }))
    };
    const cleanup = { passed: true, project: browser.project };
    expect(() => assertBrowserEvidence(browser, cleanup)).not.toThrow();
    expect(() => assertBrowserEvidence({ ...browser, status: "failed" }, cleanup)).toThrow(
      "Incomplete browser acceptance"
    );
    expect(() => assertBrowserEvidence({ ...browser, sourceUnchanged: false }, cleanup)).toThrow(
      "Incomplete browser acceptance"
    );
    expect(() =>
      assertBrowserEvidence({ ...browser, tests: [...browser.tests, browser.tests[0]!] }, cleanup)
    ).toThrow("Incomplete browser acceptance");
    expect(() =>
      assertBrowserEvidence(
        {
          ...browser,
          tests: browser.tests.map((test, index) => ({ ...test, retry: index === 0 ? 1 : 0 }))
        },
        cleanup
      )
    ).toThrow("Incomplete browser acceptance");
    expect(() =>
      assertBrowserEvidence(
        {
          ...browser,
          tests: browser.tests.map((test, index) => ({
            ...test,
            title: index === 0 ? "different passing workflow" : test.title
          }))
        },
        cleanup
      )
    ).toThrow("Incomplete critical browser workflow identity");
  });

  it("requires cleanup of the same browser run and rejects successful performance cleanup as its substitute", () => {
    const browser = {
      status: "passed",
      sourceHash: "synthetic",
      sourceUnchanged: true,
      discoveryValid: true,
      discovered: 6,
      passed: 6,
      failed: 0,
      skipped: 0,
      project: "niedax-stage10-123-456",
      tests: BROWSER_ACCEPTANCE_TESTS.map((test) => ({ ...test, status: "passed", retry: 0 }))
    };
    expect(() =>
      assertBrowserEvidence(browser, { passed: false, project: browser.project })
    ).toThrow("Missing successful cleanup");
    expect(() =>
      assertBrowserEvidence(browser, { passed: true, project: "niedax-stage10-999-999" })
    ).toThrow("Missing successful cleanup");
  });

  it("accepts a passed named test while retaining its describe-qualified diagnostic name", () => {
    const result = summarizeStage10Tests([unit], modules, 0, "unit", false, "passed");
    expect(result.passed).toBe(true);
    expect(hasExactPassedTest([unit], unit.file!, unit.localName!)).toBe(true);
  });

  it("rejects zero discovered tests and an empty module without treating them as passed", () => {
    expect(summarizeStage10Tests([], [], 0, "unit", false, "passed").passed).toBe(false);
    expect(summarizeStage10Tests([], modules, 0, "unit", false, "passed").passed).toBe(false);
  });

  it("rejects collection failures even when every collected test passed and there are no unhandled errors", () => {
    const failedModules = Array.from({ length: 33 }, (_, index) => ({
      file: `collection-${index}.test.ts`,
      state: "failed",
      ok: false
    }));
    const result = summarizeStage10Tests(
      [unit],
      [...modules, ...failedModules],
      0,
      "unit",
      false,
      "failed"
    );
    expect(result.counts.passed).toBe(1);
    expect(result.counts.failed).toBe(0);
    expect(result.counts.unhandledErrors).toBe(0);
    expect(result.counts.failedModules).toBe(33);
    expect(result.passed).toBe(false);
    expect(summarizeStage10Tests([unit], failedModules, 0, "unit", false, "passed").passed).toBe(
      false
    );
  });

  it.each(["pending", "failed", "unknown"])(
    "rejects unfinished or invalid test status %s",
    (status) => {
      expect(
        summarizeStage10Tests([{ ...unit, status }], modules, 0, "unit", false, "passed").passed
      ).toBe(false);
    }
  );

  it.each(["failed", "interrupted"])(
    "rejects run-end reason %s despite passed tests and modules",
    (reason) => {
      expect(summarizeStage10Tests([unit], modules, 0, "unit", false, reason).passed).toBe(false);
    }
  );

  it("permits only the exact declared credentialed skips in ordinary integration", () => {
    const skipped = acceptance.map((test) => ({ ...test, status: "skipped" }));
    const hostModules = databaseModules.map((module) => ({ ...module, state: "skipped" }));
    expect(
      summarizeStage10Tests(skipped, hostModules, 0, "integration", false, "passed").passed
    ).toBe(true);
    skipped[0] = { ...skipped[0]!, localName: "new skipped test in an otherwise permitted file" };
    const result = summarizeStage10Tests(skipped, hostModules, 0, "integration", false, "passed");
    expect(result.passed).toBe(false);
    expect(result.unexpectedSkips).toHaveLength(1);
    expect(
      summarizeStage10Tests(
        acceptance.map((test) => ({ ...test, status: "skipped" })),
        hostModules,
        0,
        "unit",
        false,
        "passed"
      ).passed
    ).toBe(false);
  });

  it("requires all fifteen exact PostgreSQL acceptance cases without any skipped case", () => {
    expect(acceptance).toHaveLength(15);
    expect(
      summarizeStage10Tests(acceptance, databaseModules, 0, "integration", true, "passed").passed
    ).toBe(true);
    const renamed = acceptance.map((test, index) =>
      index === 0 ? { ...test, localName: "a different test with the same passing count" } : test
    );
    expect(
      summarizeStage10Tests(renamed, databaseModules, 0, "integration", true, "passed").passed
    ).toBe(false);
    const skipped = acceptance.map((test, index) =>
      index === 0 ? { ...test, status: "skipped" } : test
    );
    expect(
      summarizeStage10Tests(skipped, databaseModules, 0, "integration", true, "passed").passed
    ).toBe(false);
    expect(
      summarizeStage10Tests(acceptance.slice(1), databaseModules, 0, "integration", true, "passed")
        .passed
    ).toBe(false);
  });

  it("recounts raw evidence instead of trusting declared passing totals", () => {
    const summary = summarizeStage10Tests([unit], modules, 0, "unit", false, "passed");
    const report = {
      tests: [unit],
      modules,
      reason: "passed",
      passed: true,
      counts: summary.counts
    };
    expect(() => assertSuiteEvidence(report, "unit")).not.toThrow();
    expect(() =>
      assertSuiteEvidence({ ...report, counts: { ...report.counts, total: 400 } }, "unit")
    ).toThrow("Execution count mismatch");
    expect(() =>
      assertSuiteEvidence(
        { ...report, modules: [{ ...modules[0]!, state: "failed", ok: false }] },
        "unit"
      )
    ).toThrow();
  });

  it("requires T01 through T15 with known runners and resolvable critical baseline mappings", () => {
    expect(() => assertScenarioMappings(scenarios(), ["approved-reference"])).not.toThrow();
    expect(() =>
      assertScenarioMappings(scenarios().slice(0, 14), ["approved-reference"])
    ).toThrow();
    for (const change of [
      { id: "T14" },
      { runner: "mistyped-browser-runner" },
      { critical: false },
      { fixtureRefs: ["missing-reference"] },
      { testNames: [] }
    ]) {
      const invalid = scenarios();
      invalid[14] = { ...invalid[14]!, ...change };
      expect(() => assertScenarioMappings(invalid, ["approved-reference"])).toThrow();
    }
    expect(() =>
      assertScenarioMappings(scenarios(), ["approved-reference", "approved-reference"])
    ).toThrow("Duplicate baseline identity");
  });

  it("does not substitute a matching substring, different test file, or failed browser test", () => {
    expect(
      hasExactPassedTest(
        [{ ...unit, localName: `${unit.localName} plus unrelated behavior` }],
        unit.file!,
        unit.localName!
      )
    ).toBe(false);
    expect(
      hasExactPassedTest([{ ...unit, file: "wrong-file.test.ts" }], unit.file!, unit.localName!)
    ).toBe(false);
    expect(
      hasExactPassedTest(
        [{ file: "critical.spec.ts", title: "exact browser case", status: "failed" }],
        "critical.spec.ts",
        "exact browser case"
      )
    ).toBe(false);
    expect(
      hasExactPassedTest(
        [{ title: "exact browser case", status: "passed" }],
        "critical.spec.ts",
        "exact browser case"
      )
    ).toBe(false);
  });

  it("requires every critical name separately in each PostgreSQL cycle", () => {
    const scenario = {
      ...scenarios()[0]!,
      id: "T13",
      runner: "postgres",
      testNames: ["snapshot remains immutable", "new catalog activates explicitly"]
    };
    const complete = scenario.testNames.map((localName) => ({ ...unit, localName }));
    expect(() =>
      assertScenarioExecution(scenario, { unit: [], browser: [], postgres: [complete, complete] })
    ).not.toThrow();
    expect(() =>
      assertScenarioExecution(scenario, {
        unit: [],
        browser: [],
        postgres: [[complete[0]!], [complete[1]!]]
      })
    ).toThrow("Critical scenario not executed");
    expect(() =>
      assertScenarioExecution(scenario, { unit: [], browser: [], postgres: [] })
    ).toThrow("Missing execution reports");
  });

  it("normalizes text line endings while rejecting any unaccepted content change", () => {
    const hash = createHash("sha256").update("reference\nquantity=17\n").digest("hex");
    expect(() =>
      assertFixtureDigest("expected.json", Buffer.from("reference\r\nquantity=17\r\n"), hash)
    ).not.toThrow();
    expect(() =>
      assertFixtureDigest("expected.json", Buffer.from("reference\nquantity=18\n"), hash)
    ).toThrow("Unaccepted fixture drift");
    expect(() =>
      assertFixtureDigest("expected.json", Buffer.from("reference"), "not-a-digest")
    ).toThrow("Malformed fixture digest");
  });

  it("preserves raw binary workbook hashing instead of normalizing ZIP bytes", () => {
    const workbook = Buffer.from("PK\r\nsynthetic ZIP bytes"),
      raw = createHash("sha256").update(workbook).digest("hex");
    expect(() => assertFixtureDigest("reference.xlsx", workbook, raw)).not.toThrow();
    const normalized = createHash("sha256").update("PK\nsynthetic ZIP bytes").digest("hex");
    expect(() => assertFixtureDigest("reference.xlsx", workbook, normalized)).toThrow(
      "Unaccepted fixture drift"
    );
  });

  it("rejects resolved data paths and workspace escapes before any file is opened", () => {
    const workspace = process.cwd();
    expect(
      safeFixturePath("packages/calculation-engine/tests/fixtures/stage10-expected.json", workspace)
    ).toBe(resolve(workspace, "packages/calculation-engine/tests/fixtures/stage10-expected.json"));
    for (const path of [
      "data/secrets/example",
      "data\\secrets\\example",
      "./data/secrets/example",
      "DATA/secrets/example",
      resolve(workspace, "data/secrets/example"),
      "../outside.json",
      workspace
    ])
      expect(() => safeFixturePath(path, workspace), path).toThrow("Unsafe fixture path");
  });
});
