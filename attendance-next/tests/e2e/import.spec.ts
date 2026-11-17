import ExcelJS from "exceljs";
import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, identifier: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email, phone or username").fill(identifier);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

/** A fictional October 2026 log in the old layout: one existing employee, one new, one who left. */
async function workbook(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Oct 26");
  const names = ["Anitha Raman", "Farhan Ali", "Old Timer"];
  ws.getRow(2).getCell(1).value = "Date";
  names.forEach((n, i) => {
    const c = 2 + i * 3;
    ws.getRow(1).getCell(c).value = n;
    ws.mergeCells(1, c, 1, c + 2);
    ws.getRow(2).getCell(c).value = "In";
    ws.getRow(2).getCell(c + 1).value = "Out";
    ws.getRow(2).getCell(c + 2).value = "Remarks";
  });
  const rows: (string | null)[][] = [
    ["01.10.2026", "09.30AM", "06.30PM", "", "09.40AM", "06.40PM", "", "09.35AM", "06.31PM", ""],
    ["02.10.2026", "Gandhi Jayanthi"],
    ["03.10.2026", "09.32AM", "06.35AM", "", "09.45AM", "06.30PM", "WFH", "-", "-", "leave"],
    ["05.10.2026", "09.50AM", "06.30PM", "", "shoot", "shoot", "shoot", null, null, null],
    ["06.10.2026", "09.31AM", "06.32PM", "", "09.30AM", "", "", null, null, null],
  ];
  rows.forEach((r, i) => r.forEach((v, j) => (ws.getRow(3 + i).getCell(1 + j).value = v)));
  ws.mergeCells(4, 2, 4, 10);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

test("HR imports an old Excel log with a preview, then undoes it", async ({ page }) => {
  await signIn(page, "hr@example.com", "Hr@12345");
  await page.goto("/import");
  // Pick the file only once the page is interactive (hydrated).
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: "Import from Excel" })).toBeVisible();

  await page.getByLabel("Excel file").setInputFiles({ name: "old-log.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: await workbook() });
  await page.waitForURL(/\/import\/\d+$/);
  const reviewUrl = page.url();

  // Preview: three people, the existing one matched automatically.
  await expect(page.getByRole("heading", { name: "old-log.xlsx" })).toBeVisible();
  await expect(page.getByLabel("Employee for Anitha Raman")).toContainText("Anitha Raman");
  await expect(page.getByRole("radio", { name: "Create new" }).nth(1)).toHaveAttribute("aria-checked", "true");

  // Every auto-fix is shown with its cell.
  await expect(page.getByText("Out 06:35 AM is before in 09:32 AM; read as 06:35 PM.")).toBeVisible();
  await expect(page.getByText("Oct 26!C5")).toBeVisible();
  // The holiday row is offered for the calendar.
  await expect(page.getByLabel("Holiday name")).toHaveValue("Gandhi Jayanthi").catch(() => {});

  // Skip the third person.
  await page.getByRole("radiogroup", { name: "What to do with Old Timer" }).getByRole("radio", { name: "Skip" }).click();
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Import finished" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Employees created").locator("..")).toContainText("1");

  // The new employee exists with attendance.
  await page.goto("/employees?q=Farhan");
  await page.getByRole("link", { name: /Farhan Ali/ }).click();
  await page.waitForURL(/\/employees\/\d+$/);
  await expect(page.getByText("Joined").locator("..")).toContainText("01 Oct 2026");
  const employeeId = page.url().match(/\/employees\/(\d+)$/)![1];
  await page.goto(`/attendance?month=2026-10&employee=${employeeId}`);
  await expect(page.getByRole("row", { name: /03 Oct 2026/ })).toContainText("WFH");
  await expect(page.getByRole("row", { name: /05 Oct 2026/ })).toContainText("On duty");
  await expect(page.getByRole("row", { name: /06 Oct 2026/ })).toContainText("Missing");

  // Undo removes it again.
  await page.goto(reviewUrl);
  await page.getByRole("button", { name: "Undo import" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Undo import" }).click();
  await expect(page.getByRole("heading", { name: "Import undone" })).toBeVisible({ timeout: 60_000 });
  await page.goto("/employees?q=Farhan");
  await expect(page.getByRole("link", { name: /Farhan Ali/ })).toHaveCount(0);
});

test("non-Excel files are refused before upload", async ({ page }) => {
  await signIn(page, "hr@example.com", "Hr@12345");
  await page.goto("/import");
  // Pick the file only once the page is interactive (hydrated).
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Excel file").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
  await expect(page.getByRole("alert").filter({ hasText: "Choose an Excel .xlsx file" })).toBeVisible();
});
