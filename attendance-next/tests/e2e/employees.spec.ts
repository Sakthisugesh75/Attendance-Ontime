import { expect, test, type Browser, type Page } from "@playwright/test";

/**
 * Switching users: a new browser context, never clearCookies(). Background prefetches still in
 * flight would otherwise put the old session cookie back.
 */
async function freshPage(browser: Browser, old: Page): Promise<Page> {
  await old.context().close();
  return (await browser.newContext({ baseURL: "http://localhost:3100" })).newPage();
}

async function signIn(page: Page, identifier: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email, phone or username").fill(identifier);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

test("HR adds an employee with sign-in; the new employee must set a password; HR edits and removes them", async ({ page, browser }) => {
  await signIn(page, "hr@example.com", "Hr@12345");
  await page.goto("/employees");
  await expect(page.getByRole("heading", { name: "Employees", level: 2 })).toBeVisible();

  // Add
  await page.getByRole("button", { name: "Add employee" }).first().click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText("Will be created as EMP007")).toBeVisible();
  await sheet.getByLabel("Full name").fill("Revathi Mohan");
  await sheet.getByLabel("Mobile").fill("+91 99887 76655");
  await sheet.getByLabel("Email").fill("revathi@example.com");
  await sheet.getByLabel("Department").fill("Creative");
  await sheet.getByLabel("Designation").fill("Editor");
  await sheet.getByLabel("Date of joining").fill("2026-11-02");
  await sheet.getByRole("button", { name: "Add employee" }).click();

  // Temporary password, shown once
  const dialog = page.getByRole("dialog", { name: /Temporary password for Revathi Mohan/ });
  await expect(dialog).toBeVisible();
  const temp = (await dialog.locator("code").textContent())!.trim();
  expect(temp).toMatch(/^[A-Za-z2-9]{10}$/);
  await dialog.getByRole("button", { name: "Done" }).click();
  await page.waitForURL(/\/employees\/\d+$/);
  const profileUrl = page.url();
  await expect(page.getByRole("heading", { name: "Revathi Mohan" })).toBeVisible();
  await expect(page.getByText("EMP007 · Editor · Creative")).toBeVisible();
  await expect(page.getByText("Waiting for first sign-in")).toBeVisible();

  // The new employee signs in with the phone number and is forced to change the password.
  page = await freshPage(browser, page);
  await signIn(page, "9988776655", temp);
  await expect(page).toHaveURL(/\/change-password$/);
  await page.getByLabel("Current password").fill(temp);
  await page.getByLabel("New password", { exact: true }).fill("Revathi@2026");
  await page.getByLabel("Confirm new password").fill("Revathi@2026");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await page.waitForURL("**/dashboard");
  await expect(page.getByRole("heading", { name: /Revathi/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Punch in" })).toBeVisible();

  // HR edits: put them on notice (needs a last working day).
  page = await freshPage(browser, page);
  await signIn(page, "hr@example.com", "Hr@12345");
  await page.goto(profileUrl);
  await page.getByRole("button", { name: "Edit" }).click();
  const edit = page.getByRole("dialog");
  await edit.getByRole("combobox", { name: "Status" }).click();
  await page.getByRole("option", { name: "On notice" }).click();
  await edit.getByRole("button", { name: "Save changes" }).click();
  await expect(edit.getByText("Set the last working day for someone on notice")).toBeVisible();
  await edit.getByLabel("Last working day").fill("2026-12-31");
  await edit.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Changes saved")).toBeVisible();
  await expect(page.getByText("On notice").first()).toBeVisible();

  // Search finds them by phone
  await page.goto("/employees");
  await page.getByLabel("Search employees").fill("99887");
  await expect(page.getByRole("row")).toHaveCount(2);
  await expect(page.getByRole("link", { name: /Revathi Mohan/ })).toBeVisible();

  // Remove (soft delete) needs a reason
  await page.goto(profileUrl);
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Remove employee" }).click();
  await page.getByLabel("Reason").fill("Test record");
  await page.getByRole("button", { name: "Remove" }).click();
  await page.waitForURL("**/employees");
  await expect(page.getByRole("link", { name: /Revathi Mohan/ })).toHaveCount(0);

  // Removed employees can no longer sign in.
  page = await freshPage(browser, page);
  await page.goto("/login");
  await page.getByLabel("Email, phone or username").fill("revathi@example.com");
  await page.getByLabel("Password", { exact: true }).fill("Revathi@2026");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator("form [role=alert]")).toContainText("Wrong email/phone or password");
});

test("HR can only give the Employee role; the Super Admin picks from every role", async ({ page, browser }) => {
  await signIn(page, "hr@example.com", "Hr@12345");
  await page.goto("/employees");
  await page.getByRole("button", { name: "Add employee" }).first().click();
  const role = page.getByRole("dialog").getByRole("combobox", { name: "Role" });
  await expect(role).toBeDisabled();
  await expect(role).toContainText("Employee");
  await expect(page.getByText("Only people who can manage access can give a role other than Employee.")).toBeVisible();

  page = await freshPage(browser, page);
  await signIn(page, "admin", "admin");
  await page.goto("/employees");
  await page.getByRole("button", { name: "Add employee" }).first().click();
  const adminRole = page.getByRole("dialog").getByRole("combobox", { name: "Role" });
  await expect(adminRole).toBeEnabled();
  await adminRole.click();
  for (const name of ["Employee", "HR / Manager", "Super Admin", "Team Lead"]) await expect(page.getByRole("option", { name: new RegExp(`^${name}`) })).toBeVisible();
});

test("HR uploads a profile photo and it is served back", async ({ page }) => {
  await signIn(page, "hr@example.com", "Hr@12345");
  await page.goto("/employees");
  await page.getByRole("link", { name: /Divya Sundar/ }).click();
  await page.waitForURL(/\/employees\/\d+$/);

  // 1×1 PNG
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
  await page.locator('input[type="file"]').setInputFiles({ name: "divya.png", mimeType: "image/png", buffer: png });
  await expect(page.getByText("Photo updated")).toBeVisible();

  const src = await page.locator("img[src^='/api/files/photos/']").first().getAttribute("src");
  expect(src).toBeTruthy();
  const res = await page.request.get(src!);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("image/png");

  // Signed-out requests are refused.
  const anon = await page.context().browser()!.newContext();
  expect((await anon.request.get(`http://localhost:3100${src}`)).status()).toBe(401);
  await anon.close();
});
