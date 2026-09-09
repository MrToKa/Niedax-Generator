import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";

const baseURL = process.env.STAGE10_BASE_URL;
if (
  !baseURL ||
  !/^http:\/\/127\.0\.0\.1:[0-9]+$/u.test(baseURL) ||
  !/^niedax-stage10-[0-9]+-[0-9]+$/u.test(process.env.STAGE10_PROJECT ?? "")
)
  throw new Error("Playwright requires the generated disposable Stage 10 runtime; run test:e2e");

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  reporter: [["./tests/e2e/safe-reporter.ts"]],
  outputDir: resolve(
    ".artifacts/stage10-browser",
    process.env.STAGE10_PROJECT!,
    "playwright-output"
  ),
  use: {
    baseURL,
    trace: "off",
    screenshot: "off",
    video: "off",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    acceptDownloads: true,
    ...devices["Desktop Chrome"],
    launchOptions: {
      args: ["--host-resolver-rules=MAP niedax-stage10.test 127.0.0.1", "--no-proxy-server"]
    }
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }]
});
