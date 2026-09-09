import { relative } from "node:path";
import type { Reporter, TestModule } from "vitest/node";
import { commitIdentity, sourceIdentity, writeEvidence } from "./lib/stage10-evidence.js";
import { summarizeStage10Tests } from "./lib/stage10-test-guards.js";

export default class Stage10Reporter implements Reporter {
  private startedSourceHash: string | null = null;

  constructor(private readonly options: { mode?: "unit" | "integration" } = {}) {}

  async onTestRunStart(): Promise<void> {
    if (process.env.STAGE7_ACCEPTANCE !== "1") this.startedSourceHash = await sourceIdentity();
  }

  async onTestRunEnd(
    modules: readonly TestModule[],
    errors: readonly unknown[],
    reason: "passed" | "failed" | "interrupted"
  ): Promise<void> {
    const acceptance = process.env.STAGE7_ACCEPTANCE === "1";
    const tests = modules.flatMap((module) =>
      [...module.children.allTests()].map((test) => ({
        file: relative(process.cwd(), module.moduleId).replaceAll("\\", "/"),
        name: test.fullName,
        localName: test.name,
        status: test.result().state
      }))
    );
    const moduleEvidence = modules.map((module) => ({
      file: relative(process.cwd(), module.moduleId).replaceAll("\\", "/"),
      state: module.state(),
      ok: module.ok()
    }));
    const discovery = summarizeStage10Tests(
      tests,
      moduleEvidence,
      errors.length,
      this.options.mode ?? "unit",
      acceptance,
      reason
    );
    const currentSourceHash = acceptance ? null : await sourceIdentity();
    const sourceUnchanged =
      acceptance ||
      (this.startedSourceHash !== null && this.startedSourceHash === currentSourceHash);
    const { counts } = discovery;
    const passed = discovery.passed && sourceUnchanged;
    const report = {
      schemaVersion: "stage10-suite/v1",
      timestamp: new Date().toISOString(),
      mode: acceptance ? "postgres" : (this.options.mode ?? "unit"),
      reason,
      sourceUnchanged,
      modules: moduleEvidence,
      counts,
      passed,
      tests
    };
    if (acceptance) process.stdout.write(`STAGE10_POSTGRES_REPORT=${JSON.stringify(report)}\n`);
    else
      await writeEvidence(`${this.options.mode ?? "unit"}.json`, {
        ...report,
        commit: commitIdentity(),
        sourceHash: this.startedSourceHash
      });
    process.stdout.write(
      `Stage 10 discovery: ${JSON.stringify(counts)}; gate=${passed ? "passed" : "failed"}\n`
    );
    if (!passed) process.exitCode = 1;
  }
}
