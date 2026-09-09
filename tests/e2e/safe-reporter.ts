import { mkdir, writeFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, relative } from "node:path";
import type { FullResult, Reporter, Suite, TestCase, TestResult } from "@playwright/test/reporter";
import { commitIdentity, sourceIdentity } from "../../scripts/lib/stage10-evidence.js";

/** Only this allow-listed summary is retained: no traces, credentials, HTTP data,
 * screenshots, browser storage, raw errors, or attachment bytes. */
export default class SafeReporter implements Reporter {
  private expected = 0;
  private browserVersion = "unreported";
  private sourceHash = "unreported";
  private results: {
    file: string;
    title: string;
    status: string;
    retry: number;
    durationMs: number;
    authenticationThrottleWaits: number;
  }[] = [];
  async onBegin(_config: unknown, suite: Suite) {
    this.sourceHash = await sourceIdentity();
    this.expected = suite.allTests().length;
    process.stdout.write(
      `Playwright discovered ${this.expected} critical tests; retries disabled.\n`
    );
  }
  onTestEnd(test: TestCase, result: TestResult) {
    this.browserVersion =
      test.annotations.find((annotation) => annotation.type === "browserVersion")?.description ??
      this.browserVersion;
    this.results.push({
      file: relative(process.cwd(), test.location.file).replaceAll("\\", "/"),
      title: test.title,
      status: result.status,
      retry: result.retry,
      durationMs: result.duration,
      authenticationThrottleWaits: result.annotations.filter(
        (annotation) => annotation.type === "authenticationThrottle"
      ).length
    });
    process.stdout.write(`${result.status}: ${test.title}\n`);
    if (result.status !== "passed") {
      const accounts = JSON.parse(process.env.STAGE10_ACCOUNTS_JSON ?? "{}") as Record<
        string,
        { password?: string }
      >;
      for (const error of result.errors) {
        let message =
          (error.message ?? "Browser assertion failed").split("\n")[0] ??
          "Browser assertion failed";
        for (const account of Object.values(accounts))
          if (account.password) message = message.replaceAll(account.password, "[REDACTED]");
        process.stderr.write(`${message.slice(0, 500)}\n`);
        if (error.location)
          process.stderr.write(
            `Source: ${relative(process.cwd(), error.location.file).replaceAll("\\", "/")}:${error.location.line}:${error.location.column}\n`
          );
      }
    }
  }
  async onEnd(result: FullResult) {
    const counts = {
      passed: this.results.filter((item) => item.status === "passed").length,
      failed: this.results.filter((item) => !["passed", "skipped"].includes(item.status)).length,
      skipped: this.results.filter((item) => item.status === "skipped").length
    };
    const sourceUnchanged = this.sourceHash === (await sourceIdentity());
    const valid =
      result.status === "passed" &&
      sourceUnchanged &&
      this.expected === 6 &&
      this.results.length === this.expected &&
      counts.passed === this.expected &&
      counts.skipped === 0 &&
      this.results.every((item) => item.retry === 0);
    const directory = resolve(".artifacts/stage10/safe");
    await mkdir(directory, { recursive: true });
    const fixtureHashes = Object.fromEntries(
      await Promise.all(
        [
          "tests/e2e/critical-workflows.spec.ts",
          "tests/e2e/download-checks.ts",
          "tests/e2e/fixtures.ts",
          "apps/backend/tests/stage10-browser-seed.ts",
          "scripts/lib/stage10-browser-fixture.ts",
          "pnpm-lock.yaml"
        ].map(async (file) => [
          file,
          createHash("sha256")
            .update(await readFile(resolve(file)))
            .digest("hex")
        ])
      )
    );
    const playwrightPackage = JSON.parse(
      await readFile(resolve("node_modules/@playwright/test/package.json"), "utf8")
    ) as { version: string };
    const report = JSON.stringify(
      {
        schemaVersion: "stage10-browser-evidence/v1",
        commit: commitIdentity(),
        sourceHash: this.sourceHash,
        sourceUnchanged,
        playwrightVersion: playwrightPackage.version,
        browserVersion: this.browserVersion,
        fixtureHashes,
        timestamp: new Date().toISOString(),
        status: result.status,
        discoveryValid: valid,
        expected: 6,
        discovered: this.expected,
        ...counts,
        durationMs: result.duration,
        project: process.env.STAGE10_PROJECT,
        tests: this.results
      },
      null,
      2
    );
    await writeFile(resolve(directory, "browser.json"), report);
    await writeFile(resolve(directory, `browser-${process.env.STAGE10_PROJECT}.json`), report);
    process.stdout.write(
      `Browser totals: ${counts.passed} passed, ${counts.failed} failed, ${counts.skipped} skipped.\n`
    );
    return valid && result.status === "passed" ? undefined : { status: "failed" as const };
  }
}
