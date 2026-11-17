import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, identifier: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email, phone or username").fill(identifier);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

test("Super Admin schedules a Saturday policy, creates a shift and adds a holiday", async ({ page }) => {
  await signIn(page, "admin", "admin");

  // Working week: the seed has Sunday + 2nd & 4th Saturday off from 01 Jan 2026.
  await page.goto("/settings?tab=working-week");
  await expect(page.getByRole("heading", { name: "Settings", level: 2 })).toBeVisible();
  await expect(page.getByText("In force since 01 Jan 2026")).toBeVisible();
  await page.getByRole("radio", { name: /All Saturdays off/ }).click();
  await expect(page.getByText("Unsaved changes")).toBeVisible();
  await page.getByLabel("Effective from").fill("2027-01-01");
  await page.getByRole("button", { name: "Schedule change" }).click();
  await expect(page.getByText("Sunday + all Saturdays off from 01 Jan 2027. Scheduled.")).toBeVisible();
  const history = page.getByTestId("weekly-off-rule").filter({ hasText: "Sunday + all Saturdays off" });
  await expect(history.getByText("Scheduled", { exact: true })).toBeVisible();
  await expect(history.getByText("01 Jan 2027 onwards")).toBeVisible();
  // The old rule is kept and now ends the day before.
  await expect(page.getByText("01 Jan 2026 – 31 Dec 2026")).toBeVisible();

  // Shifts
  await page.goto("/settings?tab=shifts");
  await page.getByRole("button", { name: "New shift" }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByLabel("Shift name").fill("Evening");
  await sheet.getByLabel("Monday start").fill("13:00");
  await sheet.getByLabel("Monday end").fill("22:00");
  await sheet.getByRole("button", { name: "Copy Mon to Tue–Fri" }).click();
  await sheet.getByLabel("Grace period").fill("10");
  await sheet.getByRole("button", { name: "Create shift" }).click();
  await expect(page.getByText("Evening created")).toBeVisible();
  const card = page.locator("article", { hasText: "Evening" });
  await expect(card.getByText("01:00 PM – 10:00 PM")).toBeVisible();
  await expect(card.getByText("Mon–Fri")).toBeVisible();

  // The default shift can't be deleted.
  await page.getByRole("button", { name: "Delete General" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("This is the default shift");
  await page.getByRole("button", { name: "OK" }).click();

  // Holidays
  await page.goto("/holidays?year=2026");
  await page.getByRole("button", { name: "Add holiday" }).click();
  const hs = page.getByRole("dialog");
  await hs.getByLabel("Date").fill("2026-12-31");
  await hs.getByLabel("Name").fill("Year End Break");
  await hs.getByRole("radio", { name: /Company/ }).click();
  await hs.getByRole("button", { name: "Add holiday" }).click();
  await expect(page.getByText("Year End Break added on 31 Dec 2026")).toBeVisible();
  await expect(page.getByTestId("holiday").filter({ hasText: "Year End Break" })).toContainText("Thursday");

  // A second holiday on the same date is refused.
  await page.getByRole("button", { name: "Add holiday" }).click();
  await hs.getByLabel("Date").fill("2026-12-31");
  await hs.getByLabel("Name").fill("Duplicate");
  await hs.getByRole("button", { name: "Add holiday" }).click();
  await expect(hs.getByText("31 Dec 2026 is already Year End Break.")).toBeVisible();
});

test("HR can add a holiday but is sent away from settings", async ({ page }) => {
  await signIn(page, "hr@example.com", "Hr@12345");
  await page.goto("/settings");
  await page.waitForURL("**/dashboard");

  await page.goto("/holidays?year=2026");
  await page.getByRole("button", { name: "Add holiday" }).click();
  const hs = page.getByRole("dialog");
  await hs.getByLabel("Date").fill("2026-12-24");
  await hs.getByLabel("Name").fill("Christmas Eve");
  await hs.getByRole("radio", { name: /Optional/ }).click();
  await hs.getByRole("button", { name: "Add holiday" }).click();
  await expect(page.getByText("Christmas Eve added on 24 Dec 2026")).toBeVisible();
  await expect(page.getByTestId("holiday").filter({ hasText: "Christmas Eve" })).toContainText("Optional");
});

test("an employee sees holidays read-only", async ({ page }) => {
  await signIn(page, "anitha@example.com", "Employee@123");
  await page.goto("/holidays?year=2026");
  await expect(page.getByRole("heading", { name: "Holidays", level: 2 })).toBeVisible();
  await expect(page.getByTestId("holiday").filter({ hasText: "Pongal" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add holiday" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Edit / })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Delete / })).toHaveCount(0);

  await page.goto("/settings");
  await page.waitForURL("**/dashboard");
});
