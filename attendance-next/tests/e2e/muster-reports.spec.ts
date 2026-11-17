import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import ExcelJS from "exceljs";

async function signIn(page: Page, identifier: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email, phone or username").fill(identifier);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

test("HR corrects a day on the muster, sees its history, and bulk-marks a date", async ({ page }) => {
  await signIn(page, "hr@example.com", "Hr@12345");
  await page.goto("/muster?month=2026-10");
  await expect(page.getByRole("heading", { name: "Muster roll", level: 2 })).toBeVisible();
  const grid = page.getByRole("table", { name: "Muster roll" });
  await expect(grid.getByRole("rowheader", { name: /Anitha Raman/ })).toBeVisible();
  // Praveen joined on 12 Oct: earlier days aren't selectable.
  await expect(grid.getByRole("button", { name: /^Praveen Kumar, 05 Oct 2026/ })).toHaveCount(0);
  await expect(grid.getByRole("button", { name: /^Praveen Kumar, 12 Oct 2026/ })).toBeVisible();

  // Edit one cell with a reason
  await grid.getByRole("button", { name: /^Anitha Raman, 05 Oct 2026/ }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("heading", { name: "Anitha Raman" })).toBeVisible();
  await expect(sheet.getByText("Monday, 05 Oct 2026")).toBeVisible();
  await sheet.getByLabel("Punch in (IST)").fill("09:40");
  await sheet.getByLabel("Punch out (IST)").fill("18:45");
  await sheet.getByRole("button", { name: "Save change" }).click();
  await expect(sheet.getByText("Give a reason (at least 3 characters)")).toBeVisible();
  await sheet.getByLabel("Reason for the change").fill("Biometric missed the punch; confirmed with manager");
  await sheet.getByRole("button", { name: "Save change" }).click();
  await expect(page.getByText("Saved Anitha Raman, 05 Oct 2026")).toBeVisible();

  // The audit entry shows who, what and why.
  const history = sheet.getByRole("region", { name: "History" });
  await expect(history.getByText(/(Edited|Created) by Lakshmi Narayanan/)).toBeVisible();
  await expect(history.getByText("09:40 AM")).toBeVisible();
  await expect(history.getByText("06:45 PM")).toBeVisible();
  await expect(history.getByText("Biometric missed the punch; confirmed with manager")).toBeVisible();
  await expect(sheet.getByText("Edited by HR")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(grid.getByRole("button", { name: /^Anitha Raman, 05 Oct 2026 · Present · 09:40 AM – 06:45 PM/ })).toBeVisible();

  // Future dates can't be edited
  await page.goto("/muster?month=2026-12");
  await expect(page.getByRole("table", { name: "Muster roll" }).getByRole("button", { name: /^Anitha Raman, 15 Dec 2026/ })).toHaveCount(0);

  // Bulk mark two people "On duty" on 22 Oct
  await page.goto("/muster?month=2026-10");
  await page.getByRole("button", { name: "Bulk mark" }).click();
  const dialog = page.getByRole("dialog", { name: "Bulk mark attendance" });
  await dialog.getByLabel("Date").fill("2026-10-22");
  await dialog.getByRole("combobox", { name: "Mark as" }).click();
  await page.getByRole("option", { name: "On duty" }).click();
  await dialog.getByRole("radio", { name: "Selected people" }).click();
  await dialog.getByRole("checkbox", { name: "Karthik Selvam" }).click();
  await dialog.getByRole("checkbox", { name: "Meena Krishnan" }).click();
  await dialog.getByLabel("Reason").fill("Client shoot at Ooty");
  await dialog.getByRole("button", { name: "Mark attendance" }).click();
  await expect(page.getByText("2 people marked on duty on 22 Oct 2026")).toBeVisible();
  await expect(grid.getByRole("button", { name: /^Karthik Selvam, 22 Oct 2026 · On duty/ })).toBeVisible();
  await expect(grid.getByRole("button", { name: /^Meena Krishnan, 22 Oct 2026 · On duty/ })).toBeVisible();
  await expect(grid.getByRole("button", { name: /^Divya Sundar, 22 Oct 2026 · On duty/ })).toHaveCount(0);

  // Each marked record has its own history entry with the reason.
  await grid.getByRole("button", { name: /^Karthik Selvam, 22 Oct 2026/ }).click();
  await expect(page.getByRole("dialog").getByText(/Bulk marked by Lakshmi Narayanan/)).toBeVisible();
  await expect(page.getByRole("dialog").getByText("Client shoot at Ooty")).toBeVisible();
});

test("HR downloads the monthly summary as Excel and PDF", async ({ page }) => {
  await signIn(page, "hr@example.com", "Hr@12345");
  await page.goto("/reports?from=2026-10-01&to=2026-10-31");
  await expect(page.getByRole("heading", { name: "Reports", level: 2 })).toBeVisible();
  const table = page.getByRole("table", { name: "Monthly summary" });
  await expect(table.getByText("Anitha Raman")).toBeVisible();
  await expect(table.getByText("Praveen Kumar")).toBeVisible();

  // Sorting is server-side through the URL.
  await table.getByRole("button", { name: "Sort by Employee" }).click();
  await expect(page).toHaveURL(/sort=name&dir=desc/);

  const xlsxDownload = page.waitForEvent("download");
  await page.getByRole("link", { name: "Export Excel" }).click();
  const xlsx = await xlsxDownload;
  expect(xlsx.suggestedFilename()).toBe("monthly-summary_2026-10.xlsx");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await readFile((await xlsx.path())!)) as unknown as ArrayBuffer);
  const ws = wb.worksheets[0]!;
  expect(ws.getCell("A2").value).toBe("Monthly summary");
  expect(ws.getCell("A5").value).toBe("Employee");
  const names = ws.getColumn(1).values.filter((v): v is string => typeof v === "string");
  expect(names).toEqual(expect.arrayContaining(["Anitha Raman", "Divya Sundar", "Total"]));

  const pdfDownload = page.waitForEvent("download");
  await page.getByRole("link", { name: "Export PDF" }).click();
  const pdf = await pdfDownload;
  expect(pdf.suggestedFilename()).toBe("monthly-summary_2026-10.pdf");
  const bytes = await readFile((await pdf.path())!);
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  expect(bytes.length).toBeGreaterThan(2000);

  // Payroll report renders with payable / LOP columns.
  await page.getByRole("button", { name: "Payroll summary" }).click();
  await expect(page.getByRole("table", { name: "Payroll summary" }).getByRole("columnheader", { name: /Payable/ })).toBeVisible();
});

test("employees can't open the muster, reports or exports", async ({ page }) => {
  await signIn(page, "anitha@example.com", "Employee@123");
  await page.goto("/muster");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/reports");
  await expect(page).toHaveURL(/\/dashboard$/);
  const res = await page.request.get("/api/export/monthly-summary?format=xlsx");
  expect(res.status()).toBe(403);
  expect((await page.request.get("/api/export/muster-xlsx")).status()).toBe(403);
});
