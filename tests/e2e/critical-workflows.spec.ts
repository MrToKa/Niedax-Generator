import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Page } from "@playwright/test";
import {
  ProjectRevisionResponseV2Schema,
  type ProjectRevisionDetailV2
} from "../../packages/domain/src/index.js";
import { checkDownloadedWorkbook } from "./download-checks.js";
import {
  test,
  expect,
  login,
  createProject,
  addConfiguredRoute,
  acknowledged,
  step,
  calculate,
  calculationResponse,
  completedCalculation,
  readSavedRevision,
  stage10Catalog
} from "./fixtures.js";

function v2Revision(value: unknown): ProjectRevisionDetailV2 {
  const detail = ProjectRevisionResponseV2Schema.parse(value).revision;
  if ("recordVersion" in detail) throw new Error("Expected a saved v2 revision");
  return detail;
}

async function saveUiRevision(page: Page, projectPath: string, name: string) {
  await step(page, "Revisions");
  await page.getByRole("textbox", { name: "Revision name", exact: true }).fill(name);
  await page
    .getByRole("textbox", { name: /^Revision comment/u })
    .fill("Synthetic browser revision evidence");
  const response = page.waitForResponse(
    (item) => item.request().method() === "POST" && item.url().endsWith(`${projectPath}/revisions`)
  );
  await page.getByRole("button", { name: "Save revision", exact: true }).click();
  const saved = await response;
  expect(saved.status()).toBe(201);
  return v2Revision(await saved.json());
}

for (const cycle of [1, 2, 3]) {
  test(`T04 T11 T12 T14 T15 critical UI journey, independent download and immutable history — fresh cycle ${cycle}`, async ({
    page,
    context,
    browser,
    monitor
  }) => {
    await login(page, "designer");
    const projectPath = await createProject(page, `S10-UI-${cycle}`);
    await addConfiguredRoute(page, "R-A");
    await addConfiguredRoute(page, "R-B");
    await step(page, "Connections");
    await page
      .getByRole("combobox", { name: "Endpoint A", exact: true })
      .selectOption({ label: "R-A · End endpoint" });
    await page
      .getByRole("combobox", { name: "Endpoint B", exact: true })
      .selectOption({ label: "R-B · Start endpoint" });
    await page.getByRole("button", { name: "Add connection" }).click();
    await acknowledged(page);
    await step(page, "Load & manual items");
    await page.getByRole("combobox", { name: "Catalog item", exact: true }).selectOption("catalog");
    await page
      .getByRole("combobox", { name: "Product", exact: true })
      .selectOption(stage10Catalog.support);
    await page.getByRole("textbox", { name: "Quantity", exact: true }).fill("2");
    await page
      .getByRole("textbox", { name: "Reason", exact: true })
      .fill("Synthetic catalog manual requirement");
    await page.getByRole("button", { name: "Add manual item", exact: true }).click();
    const catalogManual = page
      .locator(".manual-list-item")
      .filter({ hasText: "Synthetic catalog manual requirement" });
    await catalogManual.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByRole("textbox", { name: "Quantity", exact: true }).fill("3");
    await page.getByRole("button", { name: "Update manual item", exact: true }).click();
    await expect(catalogManual).toContainText("3 pcs");
    await catalogManual.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByRole("textbox", { name: "Quantity", exact: true }).fill("2");
    await page.getByRole("button", { name: "Update manual item", exact: true }).click();
    await page
      .getByRole("combobox", { name: "Catalog item", exact: true })
      .selectOption("freeText");
    await page
      .getByRole("textbox", { name: "English description", exact: true })
      .fill("<script>synthetic literal =1+1</script>");
    await page.getByRole("textbox", { name: "Product code", exact: true }).fill("00123");
    await page.getByRole("textbox", { name: "Quantity", exact: true }).fill("2.5");
    await page.getByRole("combobox", { name: "Unit", exact: true }).selectOption("m");
    await page
      .getByRole("textbox", { name: "Reason", exact: true })
      .fill("Synthetic independent continuous manual quantity");
    await page
      .getByRole("combobox", { name: "Reserve policy", exact: true })
      .selectOption("disabled");
    await page.getByRole("button", { name: "Add manual item", exact: true }).click();
    await page
      .getByRole("textbox", { name: "English description", exact: true })
      .fill("Temporary removable synthetic item");
    await page
      .getByRole("textbox", { name: "Reason", exact: true })
      .fill("Synthetic remove workflow");
    await page.getByRole("button", { name: "Add manual item", exact: true }).click();
    const temporaryManual = page
      .locator(".manual-list-item")
      .filter({ hasText: "Temporary removable synthetic item" });
    await temporaryManual.getByRole("button", { name: "Remove", exact: true }).click();
    await expect(temporaryManual).toHaveCount(0);
    await expect(page.locator(".manual-list-item")).toHaveCount(2);
    await acknowledged(page);
    await page.reload();
    await page.getByRole("button", { name: "EN", exact: true }).click();
    await step(page, "Connections");
    await expect(page.getByText("R-A · End endpoint", { exact: false }).first()).toBeVisible();
    await calculate(page);
    await expect(
      page.getByText("<script>synthetic literal =1+1</script>", { exact: true })
    ).toBeVisible();
    await page.locator("summary").filter({ hasText: "Why?" }).first().click();
    await expect(page.getByText("Formula", { exact: true }).first()).toBeVisible();
    await step(page, "Revisions");
    await expect(
      page.getByText("No explicitly saved revisions yet.", { exact: true })
    ).toBeVisible();
    await page
      .getByRole("textbox", { name: "Revision name", exact: true })
      .fill(`UI revision ${cycle}`);
    await page
      .getByRole("textbox", { name: /^Revision comment/u })
      .fill("Synthetic browser revision evidence");
    const savedResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().endsWith(`${projectPath}/revisions`)
    );
    await page.getByRole("button", { name: "Save revision", exact: true }).click();
    const saveResponse = await savedResponse;
    const saveBody = (await saveResponse.json()) as { error?: { code?: string } };
    expect(
      saveResponse.status(),
      `Save revision HTTP ${saveResponse.status()}, error category: ${saveBody.error?.code ?? "none"}`
    ).toBe(201);
    const saved = v2Revision(saveBody);
    expect(saved.summary.revisionNumber).toBe(1);
    expect(saved.summary.comment).toBe("Synthetic browser revision evidence");
    expect(saved.summary.approvalReady).toBe(true);
    const lines = saved.snapshot.calculationResult.bomLines;
    // Literal controlled reference; no product arithmetic is implemented in browser tests.
    expect(
      lines.find((line) => line.productCode === "S10-SYN-STRAIGHT")?.technicalQuantity.value
    ).toBe("12");
    expect(lines.find((line) => line.productCode === "00123")?.orderedQuantity.value).toBe("2.5");
    expect(lines.find((line) => line.productCode === "00123")?.packageCount).toBeNull();
    expect(
      lines
        .filter((line) => line.productCode === "S10-SYN-SUPPORT")
        .map((line) => line.technicalQuantity.value)
        .sort()
    ).toEqual(["2", "9"]);
    await expect(page.getByRole("button", { name: "Check revision", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Approve revision", exact: true })).toHaveCount(
      0
    );
    await page.getByRole("button", { name: "BG", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "bg");
    await expect(page.getByRole("button", { name: "Изход", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Експорт в Excel", exact: true })).toBeVisible();
    await expect(
      page.getByText("Файлът Excel е на английски и при двата езика на интерфейса.", {
        exact: true
      })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: `1 · UI revision ${cycle}`, exact: true })
    ).toBeVisible();
    await page.getByRole("button", { name: "EN", exact: true }).click();
    await step(page, "Project");
    await page.getByRole("textbox", { name: "Default reserve (%)", exact: true }).fill("5");
    await acknowledged(page);
    await step(page, "Results");
    await expect(
      page.getByText("This result belongs to an earlier saved draft.", { exact: true })
    ).toBeVisible();
    const calculationPath = `/api/v1${projectPath}/calculations`;
    let releaseRecalculation!: () => void;
    const recalculationGate = new Promise<void>((release) => {
      releaseRecalculation = release;
    });
    await page.route(`**${calculationPath}`, async (route) => {
      await recalculationGate;
      await route.continue();
    });
    const recalculationResponse = calculationResponse(page);
    try {
      await page.getByRole("button", { name: "Calculate", exact: true }).click();
      await expect(page.getByRole("button", { name: /^Calculating/u })).toBeDisabled();
      // Deterministically retain the old visible BOM until the new request is released.
      await expect(page.getByRole("heading", { name: "Detailed BOM", exact: true })).toBeVisible();
      await expect(page.getByText(saved.summary.inputFingerprint, { exact: true })).toBeVisible();
    } finally {
      releaseRecalculation();
    }
    const recalculated = await completedCalculation(page, recalculationResponse);
    await page.unroute(`**${calculationPath}`);
    expect(recalculated.run.inputFingerprint).not.toBe(saved.summary.inputFingerprint);
    await step(page, "Revisions");
    await expect(page.getByRole("button", { name: /^View revision /u })).toHaveCount(1);
    const afterRecalculation = v2Revision(await readSavedRevision(context, saved.summary.id));
    expect(afterRecalculation.snapshot).toEqual(saved.snapshot);
    expect(afterRecalculation.checksums).toEqual(saved.checksums);
    await page.getByRole("button", { name: "Sign out", exact: true }).click();

    await login(page, "reviewer");
    await page.goto(projectPath);
    await page.getByRole("button", { name: "EN", exact: true }).click();
    await expect(page.getByRole("button", { name: "Calculate", exact: true })).toHaveCount(0);
    await step(page, "Revisions");
    await page
      .getByRole("button", { name: `View revision 1: UI revision ${cycle}`, exact: true })
      .click();
    await page.getByRole("button", { name: "Check revision", exact: true }).click();
    const checkDialog = page.getByRole("dialog");
    await expect(checkDialog.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
    await checkDialog.getByRole("textbox").focus();
    await page.keyboard.press("Shift+Tab");
    await expect(
      checkDialog.getByRole("button", { name: "Check revision", exact: true })
    ).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(checkDialog.getByRole("textbox")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Check revision", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Check revision", exact: true })
      .click();
    await expect(page.getByRole("button", { name: "Approve revision", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Approve revision", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Approve revision", exact: true })
      .click();
    await expect(
      page.getByText(
        "This approved revision is read-only. Continue work in the mutable draft and save a new revision.",
        { exact: true }
      )
    ).toBeVisible();
    const approved = v2Revision(await readSavedRevision(context, saved.summary.id));
    expect(approved.snapshot).toEqual(saved.snapshot);
    expect(approved.checksums).toEqual(saved.checksums);
    expect(approved.summary.status).toBe("approved");
    const exportPanel = page.getByRole("region", { name: "Export Excel", exact: true });
    await exportPanel.getByRole("button", { name: "Export Excel", exact: true }).click();
    const downloadButton = exportPanel
      .getByRole("button", { name: "Download Excel", exact: true })
      .first();
    await expect(downloadButton).toBeEnabled({ timeout: 40_000 });
    const downloaded = page.waitForEvent("download");
    const binaryResponse = page.waitForResponse((response) =>
      /\/api\/v1\/exports\/[0-9a-f-]+\/download$/u.test(response.url())
    );
    await downloadButton.click();
    const firstHash = await checkDownloadedWorkbook(
      await downloaded,
      approved,
      `cycle-${cycle}`,
      await binaryResponse
    );
    await page.getByRole("button", { name: "Sign out", exact: true }).click();

    await login(page, "viewer");
    await page.goto(projectPath);
    await page.getByRole("button", { name: "EN", exact: true }).click();
    await expect(page.getByRole("button", { name: "Calculate", exact: true })).toHaveCount(0);
    await step(page, "Revisions");
    await page
      .getByRole("button", { name: `View revision 1: UI revision ${cycle}`, exact: true })
      .click();
    await expect(page.getByRole("button", { name: "Save revision", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Check revision", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Approve revision", exact: true })).toHaveCount(
      0
    );
    await expect(
      page
        .getByRole("region", { name: "Export Excel", exact: true })
        .getByRole("button", { name: "Request a new export", exact: true })
    ).toBeDisabled();
    const viewerDownload = page.waitForEvent("download");
    const viewerBinaryResponse = page.waitForResponse((response) =>
      /\/api\/v1\/exports\/[0-9a-f-]+\/download$/u.test(response.url())
    );
    await page.getByRole("button", { name: "Download Excel", exact: true }).first().click();
    expect(
      await checkDownloadedWorkbook(
        await viewerDownload,
        approved,
        `viewer-${cycle}`,
        await viewerBinaryResponse
      )
    ).toBe(firstHash);
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await login(page, "otherDesigner");
    monitor.allow(`/api/v1${projectPath}`, 404);
    monitor.allow(`/api/v1${projectPath}/access`, 404);
    monitor.allow(`/api/v1${projectPath}/calculation`, 404);
    await page.goto(projectPath);
    await page.getByRole("button", { name: "EN", exact: true }).click();
    await expect(
      page.getByText("The project draft could not be loaded.", { exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: `Synthetic S10-UI-${cycle}`, exact: true })
    ).toHaveCount(0);
    const directory = resolve(".artifacts/stage10/safe");
    await mkdir(directory, { recursive: true });
    await writeFile(
      resolve(directory, "browser-version.json"),
      JSON.stringify(
        {
          browser: "Chromium",
          version: browser.version(),
          retries: 0,
          widerBrowserCoverage: "not executed"
        },
        null,
        2
      )
    );
  });
}

test("T14 narrow keyboard, upstream selection invalidation, autosave retry and two-tab conflict recovery", async ({
  page,
  context,
  monitor
}) => {
  await login(page, "administrator");
  const path = await createProject(page, "S10-RECOVERY");
  await addConfiguredRoute(page, "R-A");
  await step(page, "Routes");
  await page.getByRole("combobox", { name: "System / series", exact: true }).selectOption("");
  await expect(page.getByRole("combobox", { name: "Straight product", exact: true })).toHaveValue(
    ""
  );
  await expect(page.getByRole("combobox", { name: "Supply option", exact: true })).toHaveValue("");
  await acknowledged(page);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
  const mobileStep = page.getByRole("combobox", { name: "Step", exact: true });
  await mobileStep.focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("textbox", { name: "Project name", exact: true })).toBeVisible();
  await expect(mobileStep).toBeFocused();
  const draftPath = `/api/v1${path}/draft`;
  monitor.allow(draftPath, 503);
  await page.route(`**${draftPath}`, async (route) => {
    if (route.request().method() === "PUT")
      await route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
    else await route.continue();
  });
  await page
    .getByRole("textbox", { name: "Project name", exact: true })
    .fill("Synthetic recoverable local edit");
  await expect(
    page.getByText("Autosave failed. Your local changes remain available.", { exact: true })
  ).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Project name", exact: true })).toHaveValue(
    "Synthetic recoverable local edit"
  );
  await page.unroute(`**${draftPath}`);
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await acknowledged(page);
  const second = await context.newPage();
  await second.goto(path);
  await second.getByRole("button", { name: "EN", exact: true }).click();
  await expect(second.getByRole("textbox", { name: "Project name", exact: true })).toHaveValue(
    "Synthetic recoverable local edit"
  );
  await page
    .getByRole("textbox", { name: "Project name", exact: true })
    .fill("Synthetic newer server edit");
  await acknowledged(page);
  monitor.allow(draftPath, 409);
  await second
    .getByRole("textbox", { name: "Project name", exact: true })
    .fill("Synthetic stale second-tab edit");
  await expect(
    second.getByText("A newer server draft exists. Local changes were not overwritten.", {
      exact: true
    })
  ).toBeVisible();
  await second.getByRole("button", { name: "Reload and reconcile", exact: true }).click();
  await second.getByRole("button", { name: "EN", exact: true }).click();
  await expect(second.getByRole("textbox", { name: "Project name", exact: true })).toHaveValue(
    "Synthetic newer server edit"
  );
  await second.close();
});

test("T04 LAN-style insecure HTTP generates editor UUIDs and calculates through loopback Caddy", async ({
  browser,
  monitor
}) => {
  const base = new URL(process.env.STAGE10_BASE_URL!);
  const context = await browser.newContext({ baseURL: `http://niedax-stage10.test:${base.port}` });
  const page = await context.newPage();
  monitor.watch(page);
  try {
    await login(page, "designer");
    expect(await page.evaluate(() => window.isSecureContext)).toBe(false);
    expect(await page.evaluate(() => typeof crypto.randomUUID)).toBe("undefined");
    await createProject(page, "S10-LAN-HTTP");
    await addConfiguredRoute(page, "R-LAN");
    await calculate(page);
    await expect(page.getByText("S10-SYN-STRAIGHT", { exact: true }).first()).toBeVisible();
  } finally {
    await context.close();
  }
});

test("T09 T14 T15 blocked approval, later revision and recoverable calculate/export requests", async ({
  page,
  context,
  monitor
}) => {
  await login(page, "designer");
  const projectPath = await createProject(page, "S10-LIFECYCLE-RECOVERY");
  await addConfiguredRoute(page, "R-RECOVERY");
  const spacing = page.getByRole("textbox", { name: "Support spacing (m)", exact: true });
  await spacing.fill("0");
  await expect(
    page.getByText("Enter a value greater than zero.", { exact: true }).first()
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Calculate", exact: true })).toBeDisabled();
  await spacing.fill("1.5");
  await acknowledged(page);
  const calculationPath = `/api/v1${projectPath}/calculations`;
  monitor.allow(calculationPath, 503);
  let calculationAttempts = 0;
  let releaseCalculation!: () => void;
  const release = new Promise<void>((resolveRelease) => {
    releaseCalculation = resolveRelease;
  });
  await page.route(`**${calculationPath}`, async (route) => {
    calculationAttempts += 1;
    if (calculationAttempts === 1)
      await route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
    else {
      await release;
      await route.continue();
    }
  });
  await page.getByRole("button", { name: "Calculate", exact: true }).click();
  await expect(
    page.getByText("Calculation failed. The draft remains editable.", { exact: true })
  ).toBeVisible();
  const successfulCalculation = calculationResponse(page);
  try {
    await page.getByRole("button", { name: "Calculate", exact: true }).click();
    await expect(page.getByRole("button", { name: /^Calculating/u })).toBeDisabled();
  } finally {
    releaseCalculation();
  }
  await completedCalculation(page, successfulCalculation);
  expect(calculationAttempts).toBe(2);
  await page.unroute(`**${calculationPath}`);
  const first = await saveUiRevision(page, projectPath, "Recovery revision 1");
  const exportPath = `/api/v1/revisions/${first.summary.id}/exports`;
  monitor.allow(exportPath, 503);
  const requestKeys: string[] = [];
  await page.route(`**${exportPath}`, async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    requestKeys.push(route.request().headers()["idempotency-key"] ?? "");
    if (requestKeys.length === 1)
      await route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
    else await route.continue();
  });
  const panel = page.getByRole("region", { name: "Export Excel", exact: true });
  await panel.getByRole("button", { name: "Export Excel", exact: true }).click();
  await expect(
    page.getByText(
      "The export request could not be completed. Retry the same request or refresh its status.",
      { exact: true }
    )
  ).toBeVisible();
  await page.getByRole("button", { name: "Retry the same request", exact: true }).click();
  await expect(page.getByRole("button", { name: "Download Excel", exact: true })).toBeEnabled({
    timeout: 40_000
  });
  expect(requestKeys).toHaveLength(2);
  expect(requestKeys[0]?.length).toBeGreaterThan(7);
  expect(requestKeys[0]).toBe(requestKeys[1]);
  const firstDownload = page.waitForEvent("download");
  const firstBinary = page.waitForResponse((response) =>
    /\/api\/v1\/exports\/[0-9a-f-]+\/download$/u.test(response.url())
  );
  await page.getByRole("button", { name: "Download Excel", exact: true }).click();
  const originalHash = await checkDownloadedWorkbook(
    await firstDownload,
    first,
    "recovery-before",
    await firstBinary
  );
  await page.unroute(`**${exportPath}`);
  await step(page, "Supports");
  await page.getByRole("combobox", { name: "Exact anchor product", exact: true }).selectOption("");
  await acknowledged(page);
  await expect(page.getByRole("button", { name: "Calculate", exact: true })).toBeDisabled();
  await page
    .getByRole("combobox", { name: "Exact anchor product", exact: true })
    .selectOption(stage10Catalog.anchor);
  await step(page, "Geometry");
  await page.getByRole("button", { name: "Add fitting" }).click();
  await acknowledged(page);
  await expect(page.getByRole("button", { name: "Calculate", exact: true })).toBeEnabled();
  await calculate(page);
  await expect(page.getByText("UNRESOLVED_FITTING_CONNECTION", { exact: true })).toBeVisible();
  const second = await saveUiRevision(page, projectPath, "Recovery revision 2 blocked");
  expect(second.summary.revisionNumber).toBe(2);
  expect(second.summary.approvalReady).toBe(false);
  expect(
    second.snapshot.calculationResult.warnings.some(
      (warning) => warning.approvalImpact === "blocksApproval"
    )
  ).toBe(true);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await login(page, "reviewer");
  await page.goto(projectPath);
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await step(page, "Revisions");
  await page
    .getByRole("button", { name: "View revision 2: Recovery revision 2 blocked", exact: true })
    .click();
  await page.getByRole("button", { name: "Check revision", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Check revision", exact: true })
    .click();
  await expect(page.getByRole("button", { name: "Approve revision", exact: true })).toBeDisabled();
  await expect(
    page.getByText("Approval is blocked by saved warnings.", { exact: true }).first()
  ).toBeVisible();
  await page
    .getByRole("button", { name: "View revision 1: Recovery revision 1", exact: true })
    .click();
  const historical = v2Revision(await readSavedRevision(context, first.summary.id));
  expect(historical.snapshot).toEqual(first.snapshot);
  expect(historical.checksums).toEqual(first.checksums);
  expect(historical.summary.revisionNumber).toBe(1);
  const finalDownload = page.waitForEvent("download");
  const finalBinary = page.waitForResponse((response) =>
    /\/api\/v1\/exports\/[0-9a-f-]+\/download$/u.test(response.url())
  );
  await page.getByRole("button", { name: "Download Excel", exact: true }).click();
  expect(
    await checkDownloadedWorkbook(
      await finalDownload,
      historical,
      "recovery-after",
      await finalBinary
    )
  ).toBe(originalHash);
});
