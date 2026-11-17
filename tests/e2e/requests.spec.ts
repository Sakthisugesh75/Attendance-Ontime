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

// ---- Seed calendar: Sunday + 2nd/4th Saturday off, TN 2026 holidays --------------------
const HOLIDAYS = new Set([
  "2026-01-01", "2026-01-15", "2026-01-16", "2026-01-17", "2026-01-26", "2026-04-03", "2026-04-14", "2026-05-01",
  "2026-08-15", "2026-09-14", "2026-10-02", "2026-10-19", "2026-10-20", "2026-11-08", "2026-12-25",
]);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const istToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const addDays = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const weekday = (ymd: string) => new Date(`${ymd}T00:00:00Z`).getUTCDay();
const isOff = (ymd: string) => {
  const wd = weekday(ymd);
  if (wd === 0) return true;
  if (wd === 6 && [2, 4].includes(Math.ceil(Number(ymd.slice(8)) / 7))) return true;
  return HOLIDAYS.has(ymd);
};
const nextWorking = (from: string) => {
  let d = from;
  while (isOff(d)) d = addDays(d, 1);
  return d;
};
const formatDate = (ymd: string) => `${ymd.slice(8)} ${MONTHS[Number(ymd.slice(5, 7)) - 1]} ${ymd.slice(0, 4)}`;

const today = istToday();
// Leave: two consecutive working weekdays (Mon–Fri) at least a week ahead, in one month.
const leaveFrom = (() => {
  let d = addDays(today, 7);
  while (!(weekday(d) >= 1 && weekday(d) <= 4 && !isOff(d) && !isOff(addDays(d, 1)) && d.slice(0, 7) === addDays(d, 1).slice(0, 7))) d = addDays(d, 1);
  return d;
})();
const leaveTo = addDays(leaveFrom, 1);
const wfhDay = nextWorking(addDays(leaveTo, 3));
// Permissions: the first three working days of the month after next.
const permissionMonth = (() => {
  const d = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 2);
  return d.toISOString().slice(0, 7);
})();
const p1 = nextWorking(`${permissionMonth}-01`);
const p2 = nextWorking(addDays(p1, 1));
const p3 = nextWorking(addDays(p2, 1));
// Regularization: the last working day before today.
const regDay = (() => {
  let d = addDays(today, -1);
  while (isOff(d)) d = addDays(d, -1);
  return d;
})();

test.describe.configure({ mode: "serial" });

async function openNewRequest(page: Page, tab?: string) {
  await page.goto("/requests");
  await page.getByRole("button", { name: "New request" }).first().click();
  const sheet = page.getByRole("dialog", { name: "New request" });
  await expect(sheet).toBeVisible();
  if (tab) await sheet.getByRole("tab", { name: tab }).click();
  return sheet;
}

/** HR opens the first open request of a type from Anitha and decides it. */
async function hrDecide(old: Page, typeText: string, decision: "Approve" | "Reject", comment = ""): Promise<Page> {
  const page = await switchTo(old, "hr@example.com", "Hr@12345");
  await page.goto("/requests");
  await expect(page.getByRole("heading", { name: "Requests", level: 2 })).toBeVisible();
  const row = page.getByRole("row").filter({ hasText: "Anitha Raman" }).filter({ hasText: typeText }).first();
  await row.getByRole("button", { name: /Review request/ }).click();
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByText("Anitha Raman").first()).toBeVisible();
  if (comment) await drawer.getByLabel(/Comment/).fill(comment);
  await drawer.getByRole("button", { name: decision, exact: true }).click();
  await expect(page.getByText(decision === "Approve" ? "Approved" : "Rejected", { exact: true }).first()).toBeVisible();
  return page;
}

test("employee applies 2 days of casual leave; HR approves with a comment; balance drops and the days show as leave", async ({ page }) => {
  await signIn(page, "anitha@example.com", "Employee@123");
  await page.goto("/requests");
  let cl = page.getByTestId("balance-CL");
  await expect(cl.getByTestId("available")).toHaveText("12");

  const sheet = await openNewRequest(page);
  await sheet.getByRole("combobox", { name: "Leave type" }).click();
  await page.getByRole("option", { name: /Casual Leave/ }).click();
  await sheet.getByLabel("From", { exact: true }).fill(leaveFrom);
  await sheet.getByLabel("To", { exact: true }).fill(leaveTo);
  await sheet.getByLabel("Reason").fill("Family function in Madurai");
  await expect(sheet.getByTestId("live-days")).toHaveText("2 days");
  await expect(sheet.getByTestId("live-balance")).toContainText("12 available → 10 after this");
  await sheet.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByText("Request sent for approval")).toBeVisible();
  // Pending days are held back from the available figure.
  await expect(cl.getByTestId("available")).toHaveText("10");
  await expect(cl).toContainText("2 pending");

  page = await hrDecide(page, "CL", "Approve", "Enjoy the function");

  page = await switchTo(page, "anitha@example.com", "Employee@123");
  await page.goto("/requests");
  cl = page.getByTestId("balance-CL");
  await expect(cl.getByTestId("available")).toHaveText("10");
  await expect(cl).toContainText("2 used");
  const item = page.getByTestId(/^request-\d+$/).filter({ hasText: "Casual Leave" }).first();
  await expect(item.getByText("Approved", { exact: true })).toBeVisible();
  await expect(item.getByText("Enjoy the function")).toBeVisible();

  // The attendance calendar reports the day as leave.
  await page.goto(`/attendance?month=${leaveFrom.slice(0, 7)}`);
  // Tapping a day (works on phones too) shows its status in the panel under the grid.
  const cell = page.getByRole("button", { name: new RegExp(`^${formatDate(leaveFrom)}: Leave`) });
  await cell.click();
  await expect(cell).toHaveAttribute("aria-pressed", "true");
  const details = page.locator('[aria-live="polite"]').filter({ hasText: formatDate(leaveFrom) });
  await expect(details).toContainText("Leave");
});

test("employee cancels a pending WFH request", async ({ page }) => {
  await signIn(page, "anitha@example.com", "Employee@123");
  const sheet = await openNewRequest(page, "WFH");
  await sheet.getByLabel("From", { exact: true }).fill(wfhDay);
  await sheet.getByLabel("To", { exact: true }).fill(wfhDay);
  await sheet.getByLabel("Reason").fill("Internet installation at home");
  await expect(sheet.getByTestId("live-days")).toHaveText("1 day");
  await sheet.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByText("Request sent for approval")).toBeVisible();

  // Find this request by its reason: other tests leave other WFH requests in the list.
  const item = page.getByTestId(/^request-\d+$/).filter({ hasText: "Internet installation at home" });
  await item.getByRole("button", { name: "Cancel request" }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm.getByText("Cancel this request?")).toBeVisible();
  await confirm.getByRole("button", { name: "Cancel request" }).click();
  await expect(page.getByText("Request withdrawn")).toBeVisible();
  await expect(item.getByText("Cancelled", { exact: true })).toBeVisible();
});

test("a permission past the monthly count is blocked", async ({ page }) => {
  await signIn(page, "anitha@example.com", "Employee@123");
  for (const day of [p1, p2]) {
    const sheet = await openNewRequest(page, "Permission");
    await sheet.getByLabel("Date", { exact: true }).fill(day);
    await sheet.getByLabel("Start time").fill("09:30");
    await sheet.getByLabel("End time").fill("10:30");
    await sheet.getByLabel("Reason").fill("Bank visit");
    await sheet.getByRole("button", { name: "Send request" }).click();
    await expect(page.getByText("Request sent for approval").first()).toBeVisible();
    await expect(sheet).toBeHidden();
  }

  const sheet = await openNewRequest(page, "Permission");
  await sheet.getByLabel("Date", { exact: true }).fill(p3);
  await sheet.getByLabel("Start time").fill("17:00");
  await sheet.getByLabel("End time").fill("18:00");
  await sheet.getByLabel("Reason").fill("School meeting");
  await expect(sheet.getByRole("alert").filter({ hasText: "monthly limit" })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Send request" })).toBeDisabled();
});

test("approving a regularization fills the missing punch", async ({ page }) => {
  await signIn(page, "anitha@example.com", "Employee@123");
  const sheet = await openNewRequest(page, "Regularize");
  await sheet.getByLabel("Date", { exact: true }).fill(regDay);
  await sheet.getByLabel("Punch-in").fill("09:20");
  await sheet.getByLabel("Punch-out").fill("18:40");
  await sheet.getByLabel("Reason").fill("Forgot to punch; worked the full day");
  await sheet.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByText("Request sent for approval")).toBeVisible();

  page = await hrDecide(page, "Regularize", "Approve");

  page = await switchTo(page, "anitha@example.com", "Employee@123");
  await page.goto(`/attendance?month=${regDay.slice(0, 7)}`);
  const row = page.getByRole("row").filter({ hasText: formatDate(regDay) });
  await expect(row).toContainText("09:20 AM");
  await expect(row).toContainText("06:40 PM");
});
