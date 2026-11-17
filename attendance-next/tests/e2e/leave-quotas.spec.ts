import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, identifier: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email, phone or username").fill(identifier);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

/** Praveen's Earned Leave card: "available" figure (2026 seed: 15 allotted + 4 carried forward). */
async function earnedLeave(page: Page) {
  await page.goto("/requests?view=mine");
  for (let k = 0; k < 3 && (await page.getByRole("dialog").count()); k++) await page.keyboard.press("Escape");
  return page.getByTestId("balance-EL");
}

async function pickLeaveType(sheet: ReturnType<Page["getByRole"]>, page: Page, code: string) {
  await sheet.getByLabel("Leave type").click();
  await page.getByRole("option", { name: new RegExp(`^${code} ·`) }).click();
}

test("admin sets custom paid-leave quotas by designation and by person; unused days carry forward", async ({ browser }) => {
  const admin = await (await browser.newContext()).newPage();
  const emp = await (await browser.newContext()).newPage();
  await signIn(admin, "admin", "admin");
  await signIn(emp, "praveen@example.com", "Employee@123");

  // Before: the leave type's default (15) + 4 carried forward from last year.
  let el = await earnedLeave(emp);
  await expect(el.getByTestId("available")).toHaveText("19");
  await expect(el).toContainText("incl. 4 carried forward");
  await expect(el.getByTestId("carry-next")).toHaveText("Up to 19 carry into next year if not taken");

  // 1. Designation quota: every Photographer gets 18 EL a year.
  await admin.goto("/settings?tab=leave-types");
  const rules = admin.getByTestId("quota-rules");
  await expect(rules.getByText("Everyone gets the default quota")).toBeVisible();
  await admin.getByRole("button", { name: "Add custom quota" }).click();
  let sheet = admin.getByRole("dialog", { name: "Add custom quota" });
  await pickLeaveType(sheet, admin, "EL");
  await expect(sheet.getByText("Default for EL is 15 days. Unused days carry forward, up to 30 days.")).toBeVisible();
  await sheet.getByRole("combobox", { name: "Designation" }).click();
  await admin.getByRole("option", { name: /^Photographer/ }).click();
  await sheet.getByLabel("Days a year").fill("18");
  await sheet.getByRole("button", { name: "Add custom quota" }).click();
  await expect(admin.getByText(/Photographer: 18 EL a year/)).toBeVisible();
  await expect(rules.getByText("Photographer")).toBeVisible();

  el = await earnedLeave(emp);
  await expect(el.getByTestId("available")).toHaveText("22");

  // 2. A person's own quota wins over the designation's.
  await admin.getByRole("button", { name: "Add custom quota" }).click();
  sheet = admin.getByRole("dialog", { name: "Add custom quota" });
  await pickLeaveType(sheet, admin, "EL");
  await sheet.getByText("One person").click();
  await sheet.getByLabel("Employee", { exact: true }).click();
  await admin.getByRole("option", { name: /Praveen Kumar/ }).click();
  await sheet.getByLabel("Days a year").fill("20");
  await sheet.getByRole("button", { name: "Add custom quota" }).click();
  await expect(admin.getByText(/Praveen Kumar: 20 EL a year \(1 balance updated\)/)).toBeVisible();

  el = await earnedLeave(emp);
  await expect(el.getByTestId("available")).toHaveText("24");
  await expect(el.getByTestId("carry-next")).toHaveText("Up to 24 carry into next year if not taken");

  // The same person can't get two EL rules.
  await admin.getByRole("button", { name: "Add custom quota" }).click();
  sheet = admin.getByRole("dialog", { name: "Add custom quota" });
  await pickLeaveType(sheet, admin, "EL");
  await sheet.getByText("One person").click();
  await sheet.getByLabel("Employee", { exact: true }).click();
  await admin.getByRole("option", { name: /Praveen Kumar/ }).click();
  await sheet.getByLabel("Days a year").fill("25");
  await sheet.getByRole("button", { name: "Add custom quota" }).click();
  await expect(sheet.getByText("Praveen Kumar already has a custom Earned Leave quota. Edit that one instead.")).toBeVisible();
  await admin.keyboard.press("Escape");

  // 3. Removing them puts the default back (used days and carry forward are kept).
  await admin.getByRole("button", { name: "Remove EL quota for Praveen Kumar" }).click();
  await admin.getByRole("alertdialog").getByRole("button", { name: "Remove" }).click();
  await expect(admin.getByText("Custom EL quota for Praveen Kumar removed")).toBeVisible();
  el = await earnedLeave(emp);
  await expect(el.getByTestId("available")).toHaveText("22");

  await admin.getByRole("button", { name: "Remove EL quota for Photographer" }).click();
  await admin.getByRole("alertdialog").getByRole("button", { name: "Remove" }).click();
  await expect(admin.getByText("Custom EL quota for Photographer removed")).toBeVisible();
  await expect(rules.getByText("Everyone gets the default quota")).toBeVisible();
  el = await earnedLeave(emp);
  await expect(el.getByTestId("available")).toHaveText("19");

  // Only admins can change quotas.
  await emp.goto("/settings?tab=leave-types");
  await expect(emp).toHaveURL(/\/dashboard/);
});
