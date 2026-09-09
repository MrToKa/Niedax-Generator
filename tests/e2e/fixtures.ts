import {
  test as base,
  expect,
  type Page,
  type BrowserContext,
  type Response
} from "@playwright/test";
import { CalculateProjectDraftResponseV2Schema } from "../../packages/domain/src/index.js";
import {
  readStage10Accounts,
  stage10Catalog,
  type Stage10AccountName
} from "../../scripts/lib/stage10-browser-fixture.js";

export { expect, stage10Catalog };
export const test = base.extend<{
  monitor: { watch: (page: Page) => void; allow: (path: string, status: number) => void };
}>({
  monitor: [
    async ({ context, browser }, use, testInfo) => {
      testInfo.annotations.push({ type: "browserVersion", description: browser.version() });
      const failures: string[] = [];
      const allowed = new Map<string, Set<number>>([
        ["/api/v1/auth/me", new Set([401])],
        // The real limiter is retained across repeated UI role sign-ins. The
        // login helper respects its explicit Retry-After rather than bypassing it.
        ["/api/v1/auth/login", new Set([429])]
      ]);
      const watch = (page: Page) => {
        page.on("pageerror", () => failures.push("unexpected application page error"));
        page.on("console", (message) => {
          if (message.type() !== "error") return;
          const location = message.location().url;
          const status =
            /Failed to load resource: the server responded with a status of ([0-9]+)/u.exec(
              message.text()
            );
          if (location && status && allowed.get(new URL(location).pathname)?.has(Number(status[1])))
            return;
          failures.push("unexpected application console error");
        });
      };
      context.on("page", watch);
      for (const page of context.pages()) watch(page);
      await use({
        watch,
        allow: (path, status) => {
          const codes = allowed.get(path) ?? new Set<number>();
          codes.add(status);
          allowed.set(path, codes);
        }
      });
      expect(failures, "Application console/page errors must be absent").toEqual([]);
    },
    { auto: true }
  ]
});

export async function login(page: Page, name: Stage10AccountName) {
  const account = readStage10Accounts()[name];
  await page.goto("/admin");
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await page.getByRole("textbox", { name: "Username", exact: true }).fill(account.username);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  for (const attempt of [0, 1]) {
    const loginResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" && response.url().endsWith("/api/v1/auth/login")
    );
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    const response = await loginResponse;
    if (response.status() === 429 && attempt === 0) {
      const retryAfter = Number(await response.headerValue("retry-after"));
      expect(retryAfter, "Authentication throttle supplies a bounded Retry-After").toBeGreaterThan(
        0
      );
      expect(retryAfter).toBeLessThanOrEqual(60);
      const permittedAfter = Date.now() + retryAfter * 1000;
      test
        .info()
        .annotations.push({ type: "authenticationThrottle", description: String(retryAfter) });
      await expect
        .poll(() => Date.now() >= permittedAfter, { timeout: 65_000, intervals: [250] })
        .toBe(true);
      continue;
    }
    expect(response.status(), `UI sign-in HTTP ${response.status()}`).toBe(200);
    break;
  }
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
}

export async function createProject(page: Page, code: string) {
  await page.getByRole("link", { name: "Projects", exact: true }).click();
  await page.getByRole("link", { name: "+ Create project", exact: true }).click();
  await page.getByRole("textbox", { name: "Project code", exact: true }).fill(code);
  await page.getByRole("textbox", { name: "Project name", exact: true }).fill(`Synthetic ${code}`);
  await page.getByRole("button", { name: "Create project", exact: true }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/u);
  await expect(page.getByRole("heading", { name: `Synthetic ${code}`, exact: true })).toBeVisible();
  return new URL(page.url()).pathname;
}

export async function step(page: Page, name: string, mobileValue?: string) {
  if (mobileValue)
    await page.getByRole("combobox", { name: "Step", exact: true }).selectOption(mobileValue);
  else
    await page
      .getByRole("navigation", { name: "Step", exact: true })
      .getByRole("button", { name: new RegExp(`^[0-9]+ ${name}$`, "u") })
      .click();
}

export async function acknowledged(page: Page) {
  await expect(page.locator(".save-indicator")).toHaveText(/Saved|No unsaved changes/u);
}

export function calculationResponse(page: Page): Promise<Response> {
  const path = `/api/v1${new URL(page.url()).pathname}/calculations`;
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" && new URL(response.url()).pathname === path
  );
}

export async function completedCalculation(page: Page, pendingResponse: Promise<Response>) {
  const response = await pendingResponse;
  expect(response.status(), `Calculate HTTP ${response.status()}`).toBe(200);
  const { calculation } = CalculateProjectDraftResponseV2Schema.parse(await response.json());
  expect(calculation.stale).toBe(false);
  // An old BOM stays visible while recalculation runs. The response alone does
  // not prove React has applied it or completed its automatic Results navigation.
  await expect(page.locator(".editor-workspace")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator(".editor-workspace").getByRole("status")).toHaveText(
    "Calculation completed. Results are open."
  );
  await expect(page.getByRole("heading", { name: "Detailed BOM", exact: true })).toBeVisible();
  await expect(page.getByText(calculation.run.inputFingerprint, { exact: true })).toBeVisible();
  await expect(
    page.getByText("This result belongs to an earlier saved draft.", { exact: true })
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Calculate", exact: true })).toBeEnabled();
  return calculation;
}

export async function calculate(page: Page) {
  const response = calculationResponse(page);
  await page.getByRole("button", { name: "Calculate", exact: true }).click();
  return completedCalculation(page, response);
}

export async function addConfiguredRoute(page: Page, code: string) {
  await step(page, "Routes");
  const list = page.getByRole("region", { name: "Routes", exact: true });
  await list.getByRole("textbox", { name: "Route code", exact: true }).fill(code);
  await list.getByRole("textbox", { name: "Route name", exact: true }).fill(`Synthetic ${code}`);
  await list.getByRole("button", { name: "Add route" }).click();
  await page
    .getByRole("combobox", { name: "System / series", exact: true })
    .selectOption(stage10Catalog.system);
  await page
    .getByRole("combobox", { name: "Dimensions", exact: true })
    .selectOption(`dimension:${stage10Catalog.system}:60x200`);
  await page.getByRole("combobox", { name: "Material", exact: true }).selectOption("steel");
  await page.getByRole("combobox", { name: "Finish", exact: true }).selectOption("F");
  await page
    .getByRole("combobox", { name: "Straight product", exact: true })
    .selectOption(stage10Catalog.straight);
  await page
    .getByRole("combobox", { name: "Supply option", exact: true })
    .selectOption(stage10Catalog.supply);
  await step(page, "Geometry");
  await page.getByRole("button", { name: "Add straight segment" }).click();
  await page.getByRole("textbox", { name: "Length (m)", exact: true }).fill("6");
  await step(page, "Supports");
  await page.getByRole("textbox", { name: "Support spacing (m)", exact: true }).fill("1.5");
  await page.getByRole("combobox", { name: "Support type", exact: true }).selectOption("wall");
  await page
    .getByRole("combobox", { name: "Assembly template", exact: true })
    .selectOption(stage10Catalog.template);
  await page
    .getByRole("combobox", { name: "Product", exact: true })
    .selectOption(stage10Catalog.support);
  await page
    .getByRole("combobox", { name: "Substrate / construction base", exact: true })
    .selectOption("concrete");
  await page
    .getByRole("combobox", { name: "Exact anchor product", exact: true })
    .selectOption(stage10Catalog.anchor);
  await page.getByRole("combobox", { name: "WSTB", exact: true }).selectOption("one");
  await acknowledged(page);
}

export async function readSavedRevision(context: BrowserContext, id: string): Promise<unknown> {
  const response = await context.request.get(`/api/v1/revisions/${id}`);
  expect(response.status()).toBe(200);
  return response.json();
}
