import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, identifier: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email, phone or username").fill(identifier);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

/**
 * Switching users: a new browser context, never clearCookies(). Background prefetches still in
 * flight would otherwise put the old session cookie back. Returns the new page.
 */
async function switchTo(page: Page, identifier: string, password: string): Promise<Page> {
  const browser = page.context().browser()!;
  await page.context().close();
  const next = await (await browser.newContext({ baseURL: "http://localhost:3100", timezoneId: "Asia/Kolkata" })).newPage();
  await signIn(next, identifier, password);
  return next;
}

const istToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const addDays = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const today = istToday();
const yesterday = addDays(today, -1);

test.describe.configure({ mode: "serial" });

test("an employee writes today's report with tasks, hours and a blocker", async ({ page }) => {
  await signIn(page, "anitha@example.com", "Employee@123");
  await page.goto("/daily-reports");
  await expect(page.getByRole("heading", { name: "Daily reports", level: 2 })).toBeVisible();
  // Employees have no Team tab.
  await expect(page.getByRole("tab", { name: "Team" })).toHaveCount(0);

  const form = page.getByTestId("report-form");
  await expect(form.getByRole("heading", { name: "Today's report" })).toBeVisible();

  // Nothing filled in: the form asks for a task or a summary.
  await form.getByRole("button", { name: "Send report" }).click();
  await expect(form.getByText("Add at least one task or a short summary of the day")).toBeVisible();

  await form.getByLabel("Task 1", { exact: true }).fill("Prepared the vendor payment sheet");
  await form.getByLabel("Hours for task 1").fill("2.5");
  await form.getByRole("button", { name: "Add task" }).click();
  await form.getByLabel("Task 2", { exact: true }).fill("Courier tracking for the Chennai shoot");
  await form.getByLabel("Hours for task 2").fill("1.25");
  await form.getByLabel("Status of task 2").click();
  await page.getByRole("option", { name: "Blocked" }).click();
  await expect(form.getByTestId("total-hours")).toHaveText("Total 3.75h");

  // Hours must be in quarter steps.
  await form.getByLabel("Hours for task 1").fill("2.3");
  await form.getByRole("button", { name: "Send report" }).click();
  await expect(form.getByText("Use quarter hours (e.g. 1.5 or 2.25)")).toBeVisible();
  await form.getByLabel("Hours for task 1").fill("2.5");

  await form.getByLabel("Tomorrow's plan").fill("Close the October reimbursements");
  await form.getByLabel("Blockers").fill("Waiting on the courier's invoice");
  await form.getByRole("button", { name: "Send report" }).click();
  await expect(page.getByText("Report sent")).toBeVisible();

  // The day is marked as sent, the form now updates, and history lists it.
  await expect(page.getByTestId(`day-${today}`)).toContainText("Sent");
  await expect(form.getByRole("button", { name: "Update report" })).toBeVisible();
  const history = page.getByTestId(`history-${today}`);
  await expect(history).toContainText("Prepared the vendor payment sheet");
  await expect(history).toContainText("2 tasks");
  await expect(history).toContainText("3.75h");

  // Still editable until reviewed.
  await form.getByLabel("Task 1", { exact: true }).fill("Prepared and checked the vendor payment sheet");
  await form.getByRole("button", { name: "Update report" }).click();
  await expect(page.getByText("Report updated")).toBeVisible();
  await expect(history).toContainText("Prepared and checked the vendor payment sheet");
});

test("an employee can fill a missed day from the last week, but not a future one", async ({ page }) => {
  await signIn(page, "anitha@example.com", "Employee@123");
  await page.goto(`/daily-reports?date=${yesterday}`);
  const form = page.getByTestId("report-form");
  await expect(page.getByTestId(`day-${yesterday}`)).toHaveAttribute("aria-selected", "true");
  await expect(form.getByRole("heading", { name: /^Report for / })).toBeVisible();
  await form.getByLabel("Summary").fill("Bank visit and petty cash reconciliation");
  await form.getByRole("button", { name: "Send report" }).click();
  await expect(page.getByText("Report sent")).toBeVisible();
  await expect(page.getByTestId(`history-${yesterday}`)).toBeVisible();

  // A future date in the URL falls back to today.
  await page.goto(`/daily-reports?date=${addDays(today, 3)}`);
  await expect(page.getByTestId(`day-${today}`)).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId(`day-${addDays(today, 1)}`)).toHaveCount(0);
});

test("HR sees team reports, who is missing, reviews one and the employee is told", async ({ page }) => {
  const hr = await switchTo(page, "hr@example.com", "Hr@12345");
  await hr.goto("/daily-reports");
  // Reviewers land on the Team tab.
  await expect(hr.getByRole("tab", { name: "Team" })).toHaveAttribute("aria-selected", "true");
  await expect(hr.getByText("Submitted", { exact: true })).toBeVisible();

  const row = hr.getByTestId("team-report-EMP002");
  await expect(row).toContainText("Anitha Raman");
  await expect(row).toContainText("Waiting on the courier's invoice");
  await expect(row).toContainText("Blocked");
  await expect(row).toContainText("Awaiting review");
  // Anitha is not on the "Not submitted" list; somebody else may be.
  await expect(hr.getByTestId("missing-list").or(hr.getByText("Everyone's in"))).toBeVisible();
  await expect(hr.getByTestId("missing-list").getByText("Anitha Raman")).toHaveCount(0);

  // Blocked filter keeps her report.
  await hr.getByRole("tab", { name: /^Blocked/ }).click();
  await expect(row).toBeVisible();

  await row.getByRole("button").click();
  const sheet = hr.getByRole("dialog", { name: "Daily report" });
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText("Prepared and checked the vendor payment sheet");
  await expect(sheet).toContainText("Close the October reimbursements");
  await sheet.getByLabel(/Comment/).fill("Thanks. Chase the courier first thing tomorrow.");
  await sheet.getByRole("button", { name: "Mark reviewed" }).click();
  await expect(hr.getByText("Marked as reviewed")).toBeVisible();
  await expect(row).toContainText("Reviewed");

  // Remind the rest (only when someone with a sign-in is missing).
  const remind = hr.getByRole("button", { name: "Remind" });
  if (await remind.isEnabled().catch(() => false)) {
    await remind.click();
    await hr.getByRole("alertdialog").getByRole("button", { name: "Send reminder" }).click();
    await expect(hr.getByText(/Reminder sent to \d+/)).toBeVisible();
  }

  // Back as the employee: a notification, and the report is now read-only with the comment.
  const emp = await switchTo(hr, "anitha@example.com", "Employee@123");
  await emp.goto("/notifications");
  await expect(emp.getByText(/Your daily report for .* was reviewed/).first()).toBeVisible();
  await emp.goto("/daily-reports");
  await expect(emp.getByText("Reviewed, so it can't be changed")).toBeVisible();
  await expect(emp.getByText("Thanks. Chase the courier first thing tomorrow.").first()).toBeVisible();
  await expect(emp.getByRole("button", { name: "Update report" })).toHaveCount(0);
});

test("exports: HR downloads Excel, employees can't; the reminder cron needs the secret", async ({ page, request }) => {
  await signIn(page, "anitha@example.com", "Employee@123");
  expect((await page.request.get(`/api/export/daily-reports?from=${yesterday}&to=${today}`)).status()).toBe(403);

  const hr = await switchTo(page, "hr@example.com", "Hr@12345");
  const res = await hr.request.get(`/api/export/daily-reports?from=${yesterday}&to=${today}`);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("spreadsheetml");
  expect(res.headers()["content-disposition"]).toContain("daily-reports_");

  expect((await request.get("/api/cron/report-reminder")).status()).toBe(401);
  expect((await request.get("/api/cron/report-reminder", { headers: { Authorization: "Bearer wrong" } })).status()).toBe(401);
  const secret = readFileSync(".env", "utf8").match(/^CRON_SECRET="?([^"\n]+)"?/m)?.[1];
  const run = await request.get("/api/cron/report-reminder", { headers: { Authorization: `Bearer ${secret}` } });
  expect(run.status()).toBe(200);
  const body = await run.json();
  expect(body.date).toBe(today);
  // Anitha already sent today's report, so she is never reminded.
  expect((body.reminded as { name: string }[]).some((p) => p.name === "Anitha Raman")).toBe(false);
});
