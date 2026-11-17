import { expect, test, type Browser, type Page } from "@playwright/test";

async function signIn(browser: Browser, identifier: string, password: string, viewport?: { width: number; height: number }) {
  const page = await (await browser.newContext(viewport ? { viewport } : {})).newPage();
  await page.goto("/login");
  await page.getByLabel("Email, phone or username").fill(identifier);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  return page;
}

const closePopups = async (page: Page) => {
  for (let k = 0; k < 3 && (await page.getByRole("dialog").count()); k++) await page.keyboard.press("Escape");
};

async function setEmployeeRoleReports(admin: Page, on: boolean) {
  await admin.goto("/access");
  const card = admin.getByTestId("role-card").filter({ has: admin.getByRole("heading", { name: "Employee", exact: true }) });
  await card.getByRole("button", { name: "Edit role" }).click();
  const sheet = admin.getByRole("dialog", { name: "Edit Employee" });
  const toggle = sheet.getByRole("switch", { name: /Writes daily reports/ });
  if ((await toggle.getAttribute("aria-checked")) !== String(on)) await toggle.click();
  await sheet.getByRole("button", { name: "Save role" }).click();
  await expect(admin.getByText('Role "Employee" saved')).toBeVisible();
  await expect(card.getByTestId("role-daily-reports")).toHaveText(on ? "Writes daily reports" : "No daily reports");
}

async function setPraveenOverride(admin: Page, choice: "Follow their sign-in role" | "Required for this person" | "Not required for this person") {
  await admin.goto("/employees");
  await admin.getByRole("link", { name: /Praveen Kumar/ }).first().click();
  await admin.getByRole("button", { name: "Edit" }).click();
  const sheet = admin.getByRole("dialog", { name: "Edit Praveen Kumar" });
  await sheet.getByLabel("Daily report").click();
  await admin.getByRole("option", { name: choice, exact: true }).click();
  await sheet.getByRole("button", { name: "Save changes" }).click();
  await expect(sheet).toBeHidden();
}

test("daily reports follow the role, a person can be overridden, and the phone dock follows access", async ({ browser }) => {
  const admin = await signIn(browser, "admin", "admin");

  // 1. Switch daily reports off for the built-in Employee role.
  await setEmployeeRoleReports(admin, false);

  // Praveen (Employee) no longer sees Daily reports anywhere, and the page says why.
  const praveen = await signIn(browser, "praveen@example.com", "Employee@123", { width: 390, height: 844 });
  await closePopups(praveen);
  const dock = praveen.getByRole("navigation", { name: "Main" });
  await expect(dock.getByRole("link", { name: "Home" })).toBeVisible();
  await expect(dock.getByRole("link", { name: "Attendance" })).toBeVisible();
  await expect(dock.getByRole("link", { name: "Requests" })).toBeVisible();
  await expect(dock.getByRole("link", { name: "Report" })).toHaveCount(0);
  // The 4th slot goes to the next module the role allows.
  await expect(dock.getByRole("link", { name: "Holidays" })).toBeVisible();
  await expect(praveen.getByRole("link", { name: /Daily report: Write today's/ })).toHaveCount(0);
  await expect(praveen.getByRole("link", { name: /My calendar: See the month/ })).toBeVisible();
  await praveen.goto("/daily-reports");
  await expect(praveen.getByText("No daily report needed")).toBeVisible();

  // HR's team view no longer counts Employees as missing.
  const hr = await signIn(browser, "hr@example.com", "Hr@12345");
  await hr.goto("/daily-reports");
  await closePopups(hr);
  await expect(hr.getByText(/not required to report|off or on leave/)).toBeVisible();
  const notSubmitted = hr.locator("section, div").filter({ has: hr.getByRole("heading", { name: "Not submitted" }) }).last();
  await expect(notSubmitted.getByText("Praveen Kumar")).toHaveCount(0);

  // HR also writes reports (HR role is on): "Write my report" opens their own form.
  await hr.getByRole("button", { name: "Write my report" }).click();
  await expect(hr).toHaveURL(/view=mine/);
  await expect(hr.getByRole("tab", { name: "My reports", selected: true })).toBeVisible();

  // 2. A person override wins over the role: Praveen must report even though Employees don't.
  await setPraveenOverride(admin, "Required for this person");
  await praveen.goto("/dashboard");
  await closePopups(praveen);
  await expect(dock.getByRole("link", { name: "Report" })).toBeVisible();
  await expect(praveen.getByRole("link", { name: /Daily report: Write today's/ })).toBeVisible();
  await praveen.goto("/daily-reports");
  await expect(praveen.getByText("No daily report needed")).toHaveCount(0);

  // 3. Put everything back for the other tests.
  await setPraveenOverride(admin, "Follow their sign-in role");
  await setEmployeeRoleReports(admin, true);
  await praveen.goto("/dashboard");
  await closePopups(praveen);
  await expect(dock.getByRole("link", { name: "Report" })).toBeVisible();
});
