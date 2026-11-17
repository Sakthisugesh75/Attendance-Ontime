import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, identifier: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email, phone or username").fill(identifier);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

/** HR sends today's daily-report reminder to everyone missing (Praveen has a sign-in and no report). */
async function hrReminds(page: Page) {
  await signIn(page, "hr@example.com", "Hr@12345");
  await page.goto("/daily-reports?view=team");
  await page.getByRole("button", { name: "Remind" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Send reminder" }).click();
  await expect(page.getByText(/Reminder sent to \d+/)).toBeVisible();
}

test.describe.configure({ mode: "serial" });

test("a reminder pops up; 'Remind me later' hides it but keeps it in the bell", async ({ browser }) => {
  const hr = await (await browser.newContext()).newPage();
  await hrReminds(hr);
  await hr.context().close();

  const page = await (await browser.newContext({ timezoneId: "Asia/Kolkata" })).newPage();
  await signIn(page, "praveen@example.com", "Employee@123");
  const popup = page.getByRole("dialog", { name: "Reminder: send today's report" }).first();
  await expect(popup).toBeVisible();
  await expect(popup).toContainText("It takes a minute");

  // Snooze every pending copy of the reminder (earlier specs may have sent one too).
  while (await popup.isVisible().catch(() => false)) {
    await popup.getByRole("button", { name: "In 30 min" }).click();
    await page.waitForTimeout(300);
  }
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("dialog", { name: "Reminder: send today's report" })).toHaveCount(0);

  // Still unread in the bell.
  await expect(page.getByRole("button", { name: /Notifications, \d+ unread/ })).toBeVisible();
  await page.context().close();
});

test("'Write report now' opens the report page and the pop-up stays out of the way there", async ({ browser }) => {
  const hr = await (await browser.newContext()).newPage();
  await hrReminds(hr);
  await hr.context().close();

  const page = await (await browser.newContext({ timezoneId: "Asia/Kolkata" })).newPage();
  await signIn(page, "praveen@example.com", "Employee@123");
  const popup = page.getByRole("dialog", { name: "Reminder: send today's report" });
  await expect(popup).toBeVisible();
  await popup.getByRole("button", { name: "Write report now" }).click();
  await page.waitForURL(/\/daily-reports/);
  await expect(page.getByRole("heading", { name: "Daily reports", level: 2 })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Reminder: send today's report" })).toHaveCount(0);
  await page.context().close();
});
