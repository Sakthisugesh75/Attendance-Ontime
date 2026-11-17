import { expect, test, type Browser, type Page } from "@playwright/test";

/**
 * Access & roles. Each person gets their own browser context (never clearCookies(): background
 * prefetches still in flight could put an old session cookie back), so admin and Meena can be
 * signed in at the same time. The spec puts Meena back as an Employee at the end so later
 * specs see the seeded state.
 */
const BASE = "http://localhost:3100";
const ROLE = "Accounts Supervisor";

async function newPage(browser: Browser): Promise<Page> {
  return (await browser.newContext({ baseURL: BASE })).newPage();
}

async function signIn(page: Page, identifier: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email, phone or username").fill(identifier);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

async function failedSignIn(page: Page, identifier: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email, phone or username").fill(identifier);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
}

/** Opens the Users tab filtered to one person and returns their row's actions menu trigger. */
async function openUser(admin: Page, search: string, name: RegExp) {
  await admin.goto(`/access?tab=users&q=${encodeURIComponent(search)}`);
  await expect(admin.getByTestId("access-user-row")).toHaveCount(1);
  await admin.getByRole("button", { name: new RegExp(`Account actions for ${name.source}`) }).click();
}

async function confirmMenuAction(admin: Page, search: string, name: RegExp, item: string, confirmLabel: string) {
  await openUser(admin, search, name);
  await admin.getByRole("menuitem", { name: item }).click();
  const dialog = admin.getByRole("alertdialog");
  await dialog.getByRole("button", { name: confirmLabel }).click();
  await expect(dialog).toBeHidden();
}

test("Super Admin creates a role, assigns it, and controls sign-in; HR can't open Access", async ({ browser }) => {
  const admin = await newPage(browser);
  await signIn(admin, "admin", "admin");

  // ---- Create a custom role: two permissions, own-team reach -----------------------
  await admin.goto("/access");
  await expect(admin.getByRole("heading", { name: "Access & roles", level: 2 })).toBeVisible();
  await admin.getByRole("button", { name: "New role" }).click();
  const sheet = admin.getByRole("dialog");
  await sheet.getByLabel("Name").fill(ROLE);
  await sheet.getByLabel("Description").fill("Checks the accounts team's attendance");
  await sheet.getByRole("radio", { name: /Own team/ }).check();
  await sheet.getByRole("checkbox", { name: /View employees/ }).check();
  await sheet.getByRole("checkbox", { name: /View others' attendance/ }).check();
  await expect(sheet.getByTestId("role-summary")).toHaveText("Can: View others' attendance, View employees · Reaches: Own team");
  await sheet.getByRole("button", { name: "Create role" }).click();
  await expect(admin.getByText(`Role "${ROLE}" created`)).toBeVisible();
  const card = admin.getByTestId("role-card").filter({ hasText: ROLE });
  await expect(card).toContainText("Own team");
  await expect(card).toContainText("2/15");

  // ---- Assign it to Meena --------------------------------------------------------
  await openUser(admin, "meena@example.com", /Meena Krishnan/);
  await admin.getByRole("menuitem", { name: "Change role" }).click();
  const roleDialog = admin.getByRole("alertdialog");
  await roleDialog.getByRole("combobox", { name: "Role" }).click();
  await admin.getByRole("option", { name: ROLE }).click();
  await roleDialog.getByRole("button", { name: "Save role" }).click();
  await expect(admin.getByText(`Meena Krishnan is now ${ROLE}`)).toBeVisible();

  // ---- Meena sees the newly allowed page, but not others ----------------------------
  let meena = await newPage(browser);
  await signIn(meena, "meena@example.com", "Employee@123");
  await meena.goto("/employees");
  await expect(meena).toHaveURL(/\/employees$/);
  await expect(meena.getByRole("heading", { name: "Employees" }).first()).toBeVisible();
  await meena.goto("/settings");
  await expect(meena).toHaveURL(/\/dashboard$/);
  await meena.goto("/access");
  await expect(meena).toHaveURL(/\/dashboard$/);

  // ---- "Sign out everywhere" ends her live session ----------------------------------
  await confirmMenuAction(admin, "meena@example.com", /Meena Krishnan/, "Sign out everywhere", "Sign out everywhere");
  await expect(admin.getByText("Meena Krishnan was signed out on every device")).toBeVisible();
  await meena.goto("/dashboard");
  await expect(meena).toHaveURL(/\/login/);
  await meena.context().close();

  // ---- Disabling sign-in signs her out on the next request ---------------------------
  meena = await newPage(browser);
  await signIn(meena, "meena@example.com", "Employee@123");
  await confirmMenuAction(admin, "meena@example.com", /Meena Krishnan/, "Disable sign-in", "Disable sign-in");
  await expect(admin.getByText("Meena Krishnan can no longer sign in and was signed out")).toBeVisible();
  await meena.goto("/employees");
  await expect(meena).toHaveURL(/\/login/);
  await failedSignIn(meena, "meena@example.com", "Employee@123");
  await failedSignIn(meena, "nobody@example.com", "guess-1234");
  await meena.context().close();

  // ---- Failed sign-ins show up in Activity ------------------------------------------
  await admin.goto("/access?tab=activity");
  const failed = admin.getByTestId("failed-sign-ins");
  await expect(failed.getByRole("row").filter({ hasText: "nobody@example.com" })).toContainText("no such account");
  await expect(failed.getByRole("row").filter({ hasText: "meena@example.com" }).first()).toContainText("sign-in disabled");

  // ---- Admin can't change their own role ---------------------------------------------
  await admin.goto("/access?tab=users&q=admin%40example.com");
  await expect(admin.getByTestId("access-user-row")).toHaveCount(1);
  await expect(admin.getByRole("combobox", { name: /Role for Suresh Babu/ })).toBeDisabled();
  await admin.getByRole("button", { name: /Account actions for Suresh Babu/ }).click();
  await expect(admin.getByRole("menuitem", { name: "Change role" })).toBeDisabled();
  await expect(admin.getByRole("menuitem", { name: "Disable sign-in" })).toBeDisabled();
  await admin.keyboard.press("Escape");

  // ---- Per-user timeline records what happened ----------------------------------------
  await openUser(admin, "meena@example.com", /Meena Krishnan/);
  await admin.getByRole("menuitem", { name: "View activity" }).click();
  await admin.waitForURL(/\/access\/users\/\d+$/);
  await expect(admin.getByRole("heading", { name: "Meena Krishnan" })).toBeVisible();
  await expect(admin.getByText("Sign-in disabled").first()).toBeVisible();
  await expect(admin.getByText("Signed out everywhere").first()).toBeVisible();
  await expect(admin.getByText("Role changed").first()).toBeVisible();

  // ---- Put Meena back (enable + Employee role) and delete the custom role ---------------
  await confirmMenuAction(admin, "meena@example.com", /Meena Krishnan/, "Enable sign-in", "Enable sign-in");
  await openUser(admin, "meena@example.com", /Meena Krishnan/);
  await admin.getByRole("menuitem", { name: "Change role" }).click();
  await admin.getByRole("alertdialog").getByRole("combobox", { name: "Role" }).click();
  await admin.getByRole("option", { name: "Employee", exact: true }).click();
  await admin.getByRole("alertdialog").getByRole("button", { name: "Save role" }).click();
  await expect(admin.getByText("Meena Krishnan is now Employee")).toBeVisible();
  await admin.goto("/access");
  await admin.getByRole("button", { name: `Actions for ${ROLE}` }).click();
  await admin.getByRole("menuitem", { name: "Delete role" }).click();
  await admin.getByRole("alertdialog").getByRole("button", { name: "Delete role" }).click();
  await expect(admin.getByText(`Role "${ROLE}" deleted`)).toBeVisible();
  await expect(admin.getByTestId("role-card").filter({ hasText: ROLE })).toHaveCount(0);
  await admin.context().close();

  // ---- HR can't open Access & roles -----------------------------------------------------
  const hr = await newPage(browser);
  await signIn(hr, "hr@example.com", "Hr@12345");
  await expect(hr.getByRole("link", { name: "Access & roles" })).toHaveCount(0);
  await hr.goto("/access");
  await expect(hr).toHaveURL(/\/dashboard$/);
  await hr.context().close();
});
