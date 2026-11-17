import { expect, test, type Browser, type Page } from "@playwright/test";

/**
 * Reach (scope) end to end. Seed: Karthik has the custom "Team Lead" role (scope TEAM:
 * org dashboard, view attendance, approve requests, view employees, view reports; no exports,
 * no edits) and Anitha and Divya report to him. Everyone else reports to Lakshmi (HR).
 */

const BASE = "http://localhost:3100";
const TEAM = ["Anitha Raman", "Divya Sundar", "Karthik Selvam"];
const OUTSIDERS = ["Meena Krishnan", "Praveen Kumar", "Lakshmi Narayanan"];

async function fresh(browser: Browser, old?: Page): Promise<Page> {
  if (old) await old.context().close();
  return (await browser.newContext({ baseURL: BASE })).newPage();
}

async function signIn(page: Page, identifier: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email, phone or username").fill(identifier);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

// A working weekday about four months ahead, so these requests never clash with other specs.
const addDays = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const wfhDay = (() => {
  let d = addDays(today, 120);
  while (![1, 2, 3, 4, 5].includes(new Date(`${d}T00:00:00Z`).getUTCDay())) d = addDays(d, 1);
  return d;
})();

/** Signs in as the employee, asks for one WFH day and returns the request id. */
async function requestWfh(page: Page, identifier: string, reason: string): Promise<number> {
  await signIn(page, identifier, "Employee@123");
  await page.goto("/requests");
  await page.getByRole("button", { name: "New request" }).first().click();
  const sheet = page.getByRole("dialog", { name: "New request" });
  await sheet.getByRole("tab", { name: "WFH" }).click();
  await sheet.getByLabel("From", { exact: true }).fill(wfhDay);
  await sheet.getByLabel("To", { exact: true }).fill(wfhDay);
  await sheet.getByLabel("Reason").fill(reason);
  await sheet.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByText("Request sent for approval")).toBeVisible();
  const item = page.getByTestId(/^request-\d+$/).filter({ hasText: reason }).first();
  return Number((await item.getAttribute("data-testid"))!.replace("request-", ""));
}

const ids: { anithaRequest: number; meenaRequest: number; meena: number; anitha: number } = { anithaRequest: 0, meenaRequest: 0, meena: 0, anitha: 0 };

test.describe.configure({ mode: "serial" });

test("setup: Anitha (in Karthik's team) and Meena (outside it) each ask for WFH", async ({ browser }) => {
  let page = await fresh(browser);
  ids.anithaRequest = await requestWfh(page, "anitha@example.com", "Team scope check: Anitha");
  page = await fresh(browser, page);
  ids.meenaRequest = await requestWfh(page, "meena@example.com", "Team scope check: Meena");

  // HR (scope everyone) sees both people; note their profile ids.
  page = await fresh(browser, page);
  await signIn(page, "hr@example.com", "Hr@12345");
  await page.goto("/employees");
  for (const name of [...TEAM, ...OUTSIDERS]) await expect(page.getByRole("link", { name: new RegExp(name) }).first()).toBeVisible();
  ids.meena = Number((await page.getByRole("link", { name: /Meena Krishnan/ }).first().getAttribute("href"))!.split("/").pop());
  ids.anitha = Number((await page.getByRole("link", { name: /Anitha Raman/ }).first().getAttribute("href"))!.split("/").pop());
  expect(ids.meena).toBeGreaterThan(0);
  await page.context().close();
});

test("a Team Lead sees only their team in employees, muster, reports and approvals", async ({ browser }) => {
  const page = await fresh(browser);
  await signIn(page, "karthik@example.com", "Employee@123");

  // Navigation follows the role's permissions.
  const nav = page.locator("[data-sidebar=sidebar]");
  for (const label of ["Employees", "Muster roll", "Reports"]) await expect(nav.getByRole("link", { name: label, exact: true })).toBeVisible();
  for (const label of ["Import Excel", "Settings", "Audit log", "Access & roles"]) await expect(nav.getByRole("link", { name: label })).toHaveCount(0);

  // Employees: the team only, read-only.
  await page.goto("/employees");
  for (const name of TEAM) await expect(page.getByRole("link", { name: new RegExp(name) }).first()).toBeVisible();
  for (const name of OUTSIDERS) await expect(page.getByRole("link", { name: new RegExp(name) })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add employee" })).toHaveCount(0);
  // Searching can't reach outside the team either.
  await page.getByLabel("Search employees").fill("Meena");
  await expect(page.getByRole("link", { name: /Meena Krishnan/ })).toHaveCount(0);

  // Muster: the team's rows, no bulk mark or export.
  await page.goto("/muster?month=2026-10");
  const grid = page.getByRole("table", { name: "Muster roll" });
  for (const name of TEAM) await expect(grid.getByRole("rowheader", { name: new RegExp(name) })).toBeVisible();
  for (const name of OUTSIDERS) await expect(grid.getByRole("rowheader", { name: new RegExp(name) })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Bulk mark" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Excel/ })).toHaveCount(0);
  // A day can be looked at but not changed.
  await grid.getByRole("button", { name: /^Anitha Raman, 05 Oct 2026/ }).click();
  await expect(page.getByRole("dialog").getByText("You can view this day but not change it.")).toBeVisible();
  await page.keyboard.press("Escape");

  // Reports: the team's rows, even when an outsider is asked for by id.
  await page.goto("/reports?from=2026-10-01&to=2026-10-31");
  const table = page.getByRole("table", { name: "Monthly summary" });
  await expect(table.getByText("Anitha Raman")).toBeVisible();
  for (const name of OUTSIDERS) await expect(table.getByText(name)).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Export Excel" })).toHaveCount(0);
  await page.goto(`/reports?from=2026-10-01&to=2026-10-31&emp=${ids.meena}`);
  await expect(page.getByRole("table", { name: "Monthly summary" }).getByText("Meena Krishnan")).toHaveCount(0);

  // Approvals: Anitha's request is there, Meena's isn't.
  await page.goto("/requests");
  await expect(page.getByRole("button", { name: `Review request ${ids.anithaRequest} from Anitha Raman` }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: new RegExp(`Review request ${ids.meenaRequest} `) })).toHaveCount(0);
  await expect(page.getByText("Meena Krishnan")).toHaveCount(0);

  // Only approvers in reach were told about the requests.
  await page.goto("/notifications");
  await expect(page.getByText(/New work from home request from Anitha Raman/).first()).toBeVisible();
  await expect(page.getByText(/from Meena Krishnan/)).toHaveCount(0);
  await page.context().close();
});

test("a Team Lead is refused outside their team: profile, attendance, exports, request detail and decisions", async ({ browser }) => {
  const page = await fresh(browser);
  await signIn(page, "karthik@example.com", "Employee@123");

  // Profile of an outsider: back to the dashboard. A team member's profile opens.
  await page.goto(`/employees/${ids.meena}`);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto(`/employees/${ids.anitha}`);
  await expect(page.getByRole("heading", { name: "Anitha Raman" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit" })).toHaveCount(0);

  // Attendance picker: team members yes, outsiders not found.
  // The page streams after a loading skeleton, so "not found" arrives as the 404 screen (not the status code).
  await page.goto(`/attendance?employee=${ids.meena}`);
  await expect(page.getByRole("heading", { name: "This page doesn't exist" })).toBeVisible();
  await expect(page.getByText("Meena Krishnan")).toHaveCount(0);
  await page.goto(`/attendance?employee=${ids.anitha}`);
  await expect(page.getByRole("heading", { name: "Anitha Raman", level: 2 })).toBeVisible();

  // No reports.export in the role: every download is refused.
  for (const url of ["/api/export/monthly-summary?format=xlsx", "/api/export/muster-xlsx"]) expect((await page.request.get(url)).status(), url).toBe(403);
  expect((await page.request.get("/api/audit-log/export")).status()).toBe(403);

  // Opening an outsider's request by id shows an error instead of the details.
  await page.goto(`/requests?view=approvals&id=${ids.meenaRequest}`);
  await expect(page.getByText("You don't have permission to do that.")).toBeVisible();
  await expect(page.getByText("Team scope check: Meena")).toHaveCount(0);

  // Approve the team member's request through the UI, recording the server action call...
  let action: { url: string; headers: Record<string, string>; body: string } | null = null;
  page.on("request", (req) => {
    const id = req.headers()["next-action"];
    if (req.method() === "POST" && id && req.postData()?.includes('"decision"')) action = { url: req.url(), headers: req.headers(), body: req.postData()! };
  });
  await page.goto(`/requests?view=approvals&id=${ids.anithaRequest}`);
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByText("Team scope check: Anitha")).toBeVisible();
  await drawer.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByText("Approved", { exact: true }).first()).toBeVisible();
  expect(action).not.toBeNull();
  expect(action!.body).toContain(`[${ids.anithaRequest}]`);

  // ...then replay it by hand for the outsider's request: the server refuses it.
  const { url, headers, body } = action!;
  const forged = await page.request.post(url, {
    headers: { "next-action": headers["next-action"]!, "content-type": headers["content-type"] ?? "text/plain;charset=UTF-8", accept: "text/x-component" },
    data: body.replace(`[${ids.anithaRequest}]`, `[${ids.meenaRequest}]`),
  });
  expect(await forged.text()).toContain("outside your team");
  await page.context().close();
});

test("an employee without permissions is blocked; HR still reaches everyone and decides the outsider's request", async ({ browser }) => {
  let page = await fresh(browser);
  await signIn(page, "praveen@example.com", "Employee@123");
  for (const path of ["/employees", "/muster", "/reports", "/import", "/settings", "/audit-log", "/access", `/employees/${ids.anitha}`]) {
    await page.goto(path);
    await expect(page, `${path} must be blocked`).toHaveURL(/\/dashboard$/);
  }
  for (const url of ["/api/export/monthly-summary?format=xlsx", "/api/export/muster-xlsx", "/api/audit-log/export"]) expect((await page.request.get(url)).status(), url).toBe(403);
  // ?employee= is ignored: they always see their own attendance.
  await page.goto(`/attendance?employee=${ids.anitha}`);
  await expect(page.getByRole("heading", { name: "My attendance", level: 2 })).toBeVisible();
  // No approvals inbox: only their own requests.
  await page.goto("/requests?view=approvals");
  await expect(page.getByText("Team scope check: Meena")).toHaveCount(0);

  // HR: everyone, including Meena's request, which Karthik couldn't decide.
  page = await fresh(browser, page);
  await signIn(page, "hr@example.com", "Hr@12345");
  await page.goto("/muster?month=2026-10");
  const grid = page.getByRole("table", { name: "Muster roll" });
  for (const name of [...TEAM, ...OUTSIDERS]) await expect(grid.getByRole("rowheader", { name: new RegExp(name) })).toBeVisible();
  await page.goto(`/requests?view=approvals&id=${ids.meenaRequest}`);
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByText("Team scope check: Meena")).toBeVisible();
  await drawer.getByLabel(/Comment/).fill("Scope test: not needed");
  await drawer.getByRole("button", { name: "Reject", exact: true }).click();
  await expect(page.getByText("Rejected", { exact: true }).first()).toBeVisible();
  await page.context().close();
});
