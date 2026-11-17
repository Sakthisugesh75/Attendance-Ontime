import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, identifier: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email, phone or username").fill(identifier);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dashboard");
}

test("employee punches in, punches out, and sees the day in their attendance", async ({ page }) => {
  await signIn(page, "anitha@example.com", "Employee@123");
  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening), Anitha/ })).toBeVisible();

  // Punch in
  await page.getByRole("button", { name: "Punch in" }).click();
  await expect(page.getByText("Punched in", { exact: true }).first()).toBeVisible();
  const punchOut = page.getByRole("button", { name: "Punch out" });
  await expect(punchOut).toBeVisible();

  // Punch out
  await punchOut.click();
  await expect(page.getByRole("button", { name: "Done for today" })).toBeDisabled();
  await expect(page.getByText("You're done for today. See you tomorrow!")).toBeVisible();

  // The day appears in the attendance history with both punches.
  await page.goto("/attendance");
  const firstRow = page.getByRole("row").nth(1);
  const today = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date());
  await expect(firstRow).toContainText(today);
  await expect(firstRow).not.toContainText("Missing");
  await expect(firstRow.getByRole("cell").nth(2)).toHaveText(/\d{2}:\d{2} (AM|PM)/);
  await expect(firstRow.getByRole("cell").nth(3)).toHaveText(/\d{2}:\d{2} (AM|PM)/);
});

test("signing in with a phone number works, and wrong passwords lock the account after 5 tries", async ({ page, browser }) => {
  await signIn(page, "+91 98765 00003", "Employee@123");
  await expect(page.getByRole("heading", { name: /Karthik/ })).toBeVisible();

  // A fresh browser: no session cookie can come back from requests still in flight.
  const fresh = await browser.newContext({ baseURL: "http://localhost:3100" });
  page = await fresh.newPage();
  await page.goto("/login");
  for (let i = 0; i < 5; i++) {
    await page.getByLabel("Email, phone or username").fill("meena@example.com");
    await page.getByLabel("Password", { exact: true }).fill("wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.locator("form [role=alert]")).toBeVisible();
  }
  await expect(page.locator("form [role=alert]")).toContainText("locked for 15 minutes");
  // Even the right password is refused while locked.
  await page.getByLabel("Password", { exact: true }).fill("Employee@123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator("form [role=alert]")).toContainText("locked");
  await fresh.close();
});

test("employees cannot open HR pages", async ({ page }) => {
  await signIn(page, "divya@example.com", "Employee@123");
  await page.goto("/employees");
  await expect(page).toHaveURL(/\/dashboard$/);
});
