import { expect, test } from "@playwright/test";

test("HR adds a 3-day holiday in one go; overlapping days are skipped", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email, phone or username").fill("hr@example.com");
  await page.getByLabel("Password", { exact: true }).fill("Hr@12345");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));

  await page.goto("/holidays?year=2027");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Add holiday" }).first().click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("radio", { name: "Several days" }).click();
  await sheet.getByLabel("From").fill("2027-01-13");
  await sheet.getByLabel("To", { exact: true }).fill("2027-01-15");
  await sheet.getByLabel("Name").fill("Pongal Break");
  await expect(sheet.getByText("3 days", { exact: true })).toBeVisible();
  await sheet.getByRole("button", { name: "Add 3 days" }).click();
  await expect(page.getByText("Pongal Break added on 13–15 Jan 2027 · 3 days")).toBeVisible();
  await expect(page.getByTestId("holiday").filter({ hasText: "Pongal Break" })).toHaveCount(3);

  // A range that overlaps: the taken day is crossed out and skipped.
  await page.getByRole("button", { name: "Add holiday" }).first().click();
  await sheet.getByRole("radio", { name: "Several days" }).click();
  await sheet.getByLabel("From").fill("2027-01-15");
  await sheet.getByLabel("To", { exact: true }).fill("2027-01-16");
  await sheet.getByLabel("Name").fill("Uzhavar Thirunal");
  await expect(sheet.getByText("1 new · 1 already a holiday")).toBeVisible();
  await sheet.getByRole("button", { name: "Add holiday" }).click();
  await expect(page.getByText(/Uzhavar Thirunal added on 15–16 Jan 2027 · 1 day\. Skipped 15 Jan \(Pongal Break\)/)).toBeVisible();
  await expect(page.getByTestId("holiday").filter({ hasText: "Uzhavar Thirunal" })).toHaveCount(1);
});
