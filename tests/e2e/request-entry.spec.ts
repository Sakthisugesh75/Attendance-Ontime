import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, identifier: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email, phone or username").fill(identifier);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

// ---- Seed calendar: Sunday + 2nd/4th Saturday off, TN 2026 holidays --------------------
const HOLIDAYS = new Set([
  "2026-01-01", "2026-01-15", "2026-01-16", "2026-01-17", "2026-01-26", "2026-04-03", "2026-04-14", "2026-05-01",
  "2026-08-15", "2026-09-14", "2026-10-02", "2026-10-19", "2026-10-20", "2026-11-08", "2026-12-25",
]);
const istToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const addDays = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const isOff = (ymd: string) => {
  const wd = new Date(`${ymd}T00:00:00Z`).getUTCDay();
  if (wd === 0) return true;
  if (wd === 6 && [2, 4].includes(Math.ceil(Number(ymd.slice(8)) / 7))) return true;
  return HOLIDAYS.has(ymd);
};
const nextWorking = (from: string) => {
  let d = from;
  while (isOff(d)) d = addDays(d, 1);
  return d;
};

// requests.spec.ts fills Anitha's monthly permission cap (2) in the month after next, so this
// spec records its permission the month after that, from the 15th, to stay clear of it.
const entryMonth = (() => {
  const d = new Date(`${istToday().slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 3);
  return d.toISOString().slice(0, 7);
})();
const entryDay = nextWorking(`${entryMonth}-15`);
const REASON = "Told HR in person: leaving at 4 for a family function";

test.describe.configure({ mode: "serial" });

test("HR records a 1-hour permission for an employee; it is approved and shows who entered it", async ({ page }) => {
  await signIn(page, "hr@example.com", "Hr@12345");
  await page.goto("/requests");
  await page.getByRole("button", { name: "Record for employee" }).click();
  const sheet = page.getByRole("dialog", { name: "Record for employee" });
  await expect(sheet).toBeVisible();
  // Permission is the default in this mode; the form waits for an employee.
  await expect(sheet.getByRole("tab", { name: "Permission" })).toHaveAttribute("aria-selected", "true");
  await expect(sheet.getByText("Who is this for?")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Record & approve" })).toBeDisabled();

  await sheet.getByRole("combobox", { name: "Employee" }).click();
  await page.getByPlaceholder("Search people").fill("Anitha");
  // HR's own record is never offered: their own requests go through "New request".
  await expect(page.getByRole("option", { name: /Lakshmi Narayanan/ })).toHaveCount(0);
  await page.getByRole("option", { name: /Anitha Raman/ }).click();
  await expect(sheet.getByTestId("entry-figures")).toBeVisible();

  await sheet.getByLabel("Date", { exact: true }).fill(entryDay);
  await sheet.getByLabel("Start time").fill("16:00");
  await sheet.getByLabel("End time").fill("17:00");
  await sheet.getByLabel("Reason").fill(REASON);
  await expect(sheet.getByTestId("entry-figures")).toContainText("Permissions 0 of 2");
  await expect(sheet.getByRole("checkbox", { name: /Approve now/ })).toBeChecked();
  await sheet.getByRole("button", { name: "Record & approve" }).click();
  await expect(page.getByText("Permission recorded and approved for Anitha Raman")).toBeVisible();
  await expect(sheet).toBeHidden();

  // It lands straight in Approved, marked as entered by HR.
  await page.goto("/requests?status=APPROVED");
  const row = page.getByRole("row").filter({ hasText: "Anitha Raman" }).filter({ hasText: "Entered by Lakshmi Narayanan" }).first();
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: /Review request/ }).click();
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByText(REASON)).toBeVisible();
  await expect(drawer.getByText(/Entered by Lakshmi Narayanan/)).toBeVisible();
});

test("the employee profile opens the same sheet with the employee picked", async ({ page }) => {
  await signIn(page, "hr@example.com", "Hr@12345");
  await page.goto("/employees");
  await page.getByRole("link", { name: /Anitha Raman/ }).first().click();
  await page.waitForURL(/\/employees\/\d+/);
  await page.getByRole("link", { name: "Record leave / permission" }).click();
  const sheet = page.getByRole("dialog", { name: "Record for employee" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("combobox", { name: "Employee" })).toContainText("Anitha Raman");
  await expect(sheet.getByTestId("entry-figures")).toBeVisible();
  // The permission already recorded counts towards that month's cap.
  await sheet.getByLabel("Date", { exact: true }).fill(entryDay);
  await expect(sheet.getByTestId("entry-figures")).toContainText("Permissions 1 of 2");
  await sheet.getByRole("button", { name: "Cancel" }).click();
  await expect(sheet).toBeHidden();
});

test("the employee sees the recorded permission as approved, entered by HR", async ({ page }) => {
  await signIn(page, "anitha@example.com", "Employee@123");
  await page.goto("/requests");
  const item = page.getByTestId(/^request-\d+$/).filter({ hasText: REASON });
  await expect(item.getByText("Approved", { exact: true })).toBeVisible();
  await expect(item.getByText(/Entered by Lakshmi Narayanan/)).toBeVisible();
});
