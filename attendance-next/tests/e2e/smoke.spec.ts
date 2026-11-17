import { readFileSync } from "node:fs";
import { expect, test, type Browser, type Page } from "@playwright/test";

/**
 * Smoke test: every screen, as every role. Fails on server errors, uncaught exceptions,
 * console errors, missing page titles, and on any page a role can open but shouldn't.
 */

const BASE = "http://localhost:3100";
const REPORTS = ["monthly-summary", "late-arrivals", "leave", "overtime", "working-hours", "wfh", "payroll"];
const SETTINGS_TABS = ["company", "working-week", "shifts", "leave-types", "policies", "punching", "organisation"];
const EVERYONE = ["/dashboard", "/attendance", "/requests", "/daily-reports", "/holidays", "/announcements", "/notifications"];
const MANAGERS = ["/employees", "/muster", "/muster?month=2026-10", "/import", ...REPORTS.map((r) => `/reports?report=${r}`)];
const ADMIN = [...SETTINGS_TABS.map((t) => `/settings?tab=${t}`), "/audit-log"];

async function session(browser: Browser, identifier: string, password: string) {
  const context = await browser.newContext({ baseURL: BASE });
  const page = await context.newPage();
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(`exception: ${e.message}`));
  page.on("console", (m) => {
    // Expected 401 probes and favicon noise aside, any console error is a bug.
    if (m.type() === "error" && !/401|Failed to load resource: the server responded with a status of 40[134]/.test(m.text())) problems.push(`console: ${m.text().slice(0, 300)}`);
  });
  page.on("response", (r) => {
    if (r.status() >= 500) problems.push(`HTTP ${r.status()} ${r.url()}`);
  });
  await page.goto("/login");
  await page.getByLabel("Email, phone or username").fill(identifier);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  return { page, problems, close: () => context.close() };
}

async function visitAll(page: Page, problems: string[], paths: string[]) {
  for (const path of paths) {
    const res = await page.goto(path);
    expect(res?.status(), `${path} status`).toBeLessThan(400);
    await page.waitForLoadState("networkidle");
    expect(new URL(page.url()).pathname, `${path} should not redirect`).toBe(path.split("?")[0]);
    // Every page has a title (the top bar h1) and its own heading.
    await expect(page.locator("main h2, [data-slot=sidebar-inset] h2").first(), `${path} heading`).toBeVisible();
    await expect(page.getByText(/Application error|Something went wrong/i), `${path} error screen`).toHaveCount(0);
  }
  expect(problems, problems.join("\n")).toEqual([]);
}

async function expectRedirected(page: Page, paths: string[]) {
  for (const path of paths) {
    await page.goto(path);
    await expect(page, `${path} must be blocked`).toHaveURL(/\/dashboard$/);
  }
}

test("Super Admin can open every screen without errors", async ({ browser }) => {
  test.setTimeout(240_000);
  const s = await session(browser, "admin", "admin");
  await visitAll(s.page, s.problems, [...EVERYONE, ...MANAGERS, ...ADMIN]);
  // An employee profile and an import batch page
  await s.page.goto("/employees");
  await s.page.getByRole("link", { name: /Anitha Raman/ }).first().click();
  await s.page.waitForURL(/\/employees\/\d+$/);
  await expect(s.page.getByRole("heading", { name: "Anitha Raman" })).toBeVisible();
  expect(s.problems, s.problems.join("\n")).toEqual([]);
  await s.close();
});

test("HR can open every HR screen, and not the admin ones", async ({ browser }) => {
  test.setTimeout(180_000);
  const s = await session(browser, "hr@example.com", "Hr@12345");
  await visitAll(s.page, s.problems, [...EVERYONE, ...MANAGERS]);
  await expectRedirected(s.page, ADMIN.map((p) => p.split("?")[0]));
  await s.close();
});

test("an employee can open their screens, and nothing else", async ({ browser }) => {
  test.setTimeout(180_000);
  // Praveen has the plain Employee role (Karthik is a Team Lead in the seed).
  const s = await session(browser, "praveen@example.com", "Employee@123");
  await visitAll(s.page, s.problems, EVERYONE);
  await expect(s.page.getByRole("link", { name: "Employees" })).toHaveCount(0); // not in the sidebar
  await expectRedirected(s.page, ["/employees", "/muster", "/reports", "/import", "/settings", "/audit-log"]);
  // Exports refuse employees even when called directly.
  for (const url of ["/api/export/monthly-summary?format=xlsx", "/api/export/muster-xlsx", "/api/audit-log/export"]) {
    expect((await s.page.request.get(url)).status(), url).toBe(403);
  }
  await s.close();
});

test("APIs refuse anonymous callers; cron jobs need the secret", async ({ request }) => {
  for (const url of [
    "/api/export/monthly-summary?format=xlsx",
    "/api/export/payroll?format=pdf",
    "/api/export/muster-xlsx",
    "/api/audit-log/export",
    "/api/files/photos/1-1.png",
    "/api/requests/1/attachment",
  ]) {
    expect((await request.get(url)).status(), url).toBe(401);
  }
  for (const url of ["/api/cron/close-day", "/api/cron/daily-summary"]) {
    expect((await request.get(url)).status(), `${url} without secret`).toBe(401);
    expect((await request.get(url, { headers: { Authorization: "Bearer wrong" } })).status(), `${url} wrong secret`).toBe(401);
  }
  // With the real secret both jobs run against the test database.
  const secret = readFileSync(".env", "utf8").match(/^CRON_SECRET="?([^"\n]+)"?/m)?.[1];
  expect(secret).toBeTruthy();
  const close = await request.get("/api/cron/close-day?date=2026-10-30", { headers: { Authorization: `Bearer ${secret}` } });
  expect(close.status()).toBe(200);
  expect((await close.json()).processed).toBeGreaterThan(0);
  const summary = await request.get("/api/cron/daily-summary", { headers: { Authorization: `Bearer ${secret}` } });
  expect(summary.status()).toBe(200);
});

test("the app is installable: manifest, icons, service worker and offline page", async ({ request }) => {
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.status()).toBe(200);
  const m = await manifest.json();
  expect(m.display).toBe("standalone");
  for (const icon of m.icons as { src: string }[]) {
    const res = await request.get(icon.src);
    expect(res.status(), icon.src).toBe(200);
    expect(res.headers()["content-type"]).toBe("image/png");
  }
  expect((await request.get("/sw.js")).status()).toBe(200);
  expect((await request.get("/offline")).status()).toBe(200);
});

test("signed-out visitors are sent to sign-in, keeping where they were going", async ({ page }) => {
  await page.goto("/muster?month=2026-10");
  await expect(page).toHaveURL(/\/login\?next=%2Fmuster%3Fmonth%3D2026-10$/);
  await page.getByLabel("Email, phone or username").fill("admin");
  await page.getByLabel("Password", { exact: true }).fill("admin");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/muster\?month=2026-10$/);
});
