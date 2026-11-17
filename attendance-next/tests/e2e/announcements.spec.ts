import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";
import { E2E_DATABASE_URL } from "../../playwright.config";

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

test.describe.configure({ mode: "serial" });

// Posting with "Notify everyone" gives every demo user an announcement pop-up. Clear them so
// the specs that run afterwards start without a pop-up in the way.
test.afterEach(async () => {
  const db = new PrismaClient({ datasources: { db: { url: E2E_DATABASE_URL } } });
  await db.notification.updateMany({ where: { link: "/announcements" }, data: { popup: false } });
  await db.$disconnect();
});

const TITLE = "Team lunch on Friday";

test("admin posts an announcement; an employee sees it with its line breaks and can't post", async ({ page }) => {
  await signIn(page, "admin", "admin");
  await page.goto("/announcements");
  await expect(page.getByRole("heading", { name: "Announcements", level: 2 })).toBeVisible();
  // The seeded pinned notice is on the board.
  await expect(page.getByText("Deepavali sweets & early leave on Friday")).toBeVisible();

  await page.getByRole("button", { name: "Post announcement" }).first().click();
  const sheet = page.getByRole("dialog", { name: "New announcement" });
  await expect(sheet).toBeVisible();
  // Validation: a title and a message are required.
  await sheet.getByRole("button", { name: "Post announcement" }).click();
  await expect(sheet.getByText("Give it a short title")).toBeVisible();
  await expect(sheet.getByText("Write the announcement")).toBeVisible();

  await sheet.getByLabel("Title").fill(TITLE);
  await sheet.getByLabel("Message").fill("Lunch is on the company this Friday.\nMeet at the lobby at 1 PM.");
  await expect(sheet.getByLabel("Notify everyone")).toBeChecked();
  await sheet.getByRole("button", { name: "Post announcement" }).click();
  await expect(page.getByText(/Announcement posted/)).toBeVisible();
  await expect(sheet).toBeHidden();

  const card = page.getByTestId("announcement").filter({ hasText: TITLE });
  await expect(card).toBeVisible();
  await expect(card).toContainText("Suresh Babu");

  // Anitha (Employee role) gets it as a pop-up when she opens the app…
  page = await switchTo(page, "anitha@example.com", "Employee@123");
  const popup = page.getByRole("dialog", { name: TITLE });
  await expect(popup).toBeVisible();
  await expect(popup).toContainText("New announcement");
  await popup.getByRole("button", { name: "Read announcement" }).click();
  await page.waitForURL(/\/announcements/);
  await expect(page.getByRole("dialog", { name: TITLE })).toHaveCount(0);

  // …and sees it on the board, without any way to post or change it.
  const seen = page.getByTestId("announcement").filter({ hasText: TITLE });
  await expect(seen).toBeVisible();
  await expect(seen.getByText(/Lunch is on the company this Friday\.\s+Meet at the lobby at 1 PM\./)).toBeVisible();
  await expect(page.getByRole("button", { name: "Post announcement" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: `Edit ${TITLE}` })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Show past" })).toHaveCount(0);
});

test("HR records an employee's date of birth and it shows on the profile", async ({ page }) => {
  await signIn(page, "hr@example.com", "Hr@12345");
  await page.goto("/employees");
  await page.getByRole("link", { name: /Meena Krishnan/ }).first().click();
  await page.waitForURL(/\/employees\/\d+$/);
  await expect(page.getByRole("heading", { name: "Meena Krishnan" })).toBeVisible();

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const edit = page.getByRole("dialog");
  await edit.getByLabel("Date of birth").fill("2030-01-01");
  await edit.getByRole("button", { name: "Save changes" }).click();
  await expect(edit.getByText("Date of birth must be in the past")).toBeVisible();

  await edit.getByLabel("Date of birth").fill("1992-03-18");
  await edit.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Changes saved")).toBeVisible();
  await expect(page.getByText("18 Mar 1992")).toBeVisible();
});
