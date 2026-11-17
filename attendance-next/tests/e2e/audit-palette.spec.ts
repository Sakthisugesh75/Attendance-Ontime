import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, identifier: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email, phone or username").fill(identifier);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

test("Super Admin filters the audit log, expands an entry and exports CSV", async ({ page }) => {
  await signIn(page, "admin", "admin");
  await page.goto("/audit-log");
  await expect(page.getByRole("heading", { name: "Audit log", level: 2 })).toBeVisible();
  // Breadcrumb in the top bar
  await expect(page.getByRole("navigation", { name: "breadcrumb" })).toContainText("Audit log");

  // Filter by action: the URL carries the filter and every row is a LOGIN.
  await page.getByRole("combobox", { name: "Action" }).click();
  await page.getByRole("option", { name: "LOGIN", exact: true }).click();
  await expect(page).toHaveURL(/action=LOGIN/);
  const table = page.locator("table");
  await expect(table.getByText("LOGIN").first()).toBeVisible();
  await expect(table.getByText(/^(CREATE|UPDATE|DELETE)$/)).toHaveCount(0);

  // Expand the first entry
  const toggle = page.getByRole("button", { name: /Show changes for entry/ }).first();
  await toggle.click();
  await expect(page.getByRole("button", { name: /Hide changes for entry/ }).first()).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("No field changes were recorded for this entry.").first()).toBeVisible();

  // Export the current filter
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Export CSV" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^audit-log-\d{4}-\d{2}-\d{2}\.csv$/);
  const csv = await readFile((await download.path())!, "utf8");
  const lines = csv.replace(/^﻿/, "").trim().split(/\r\n/);
  expect(lines[0]).toBe("ID,Time (IST),Actor,Actor email,Action,Entity,Entity ID,Reason,IP,Before (JSON),After (JSON)");
  expect(lines.length).toBeGreaterThan(1);
  for (const line of lines.slice(1)) expect(line).toContain(",LOGIN,User,");
});

test("Ctrl+K palette opens pages and finds employees", async ({ page }) => {
  await signIn(page, "admin", "admin");
  await page.goto("/dashboard");

  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await expect(palette).toBeVisible();
  await palette.getByRole("combobox", { name: "Search" }).fill("Muster");
  await expect(palette.getByRole("option", { name: /Muster roll/ })).toBeVisible();
  await page.keyboard.press("Enter");
  await page.waitForURL("**/muster");
  await expect(palette).toBeHidden();

  // Employee search (HR / Super Admin)
  await page.keyboard.press("Control+k");
  await palette.getByRole("combobox", { name: "Search" }).fill("Anitha");
  const hit = palette.getByRole("option", { name: /Anitha Raman/ });
  await expect(hit).toBeVisible();
  await hit.click();
  await page.waitForURL(/\/employees\/\d+$/);
  await expect(page.getByRole("heading", { name: "Anitha Raman" }).first()).toBeVisible();
  await expect(page.getByRole("navigation", { name: "breadcrumb" })).toContainText("Profile");

  // Escape closes; the trigger button opens it too.
  await page.getByRole("button", { name: /^Search/ }).click();
  await expect(palette).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(palette).toBeHidden();
});

test("HR can't open the audit log or its export", async ({ page }) => {
  await signIn(page, "hr@example.com", "Hr@12345");
  await page.goto("/audit-log");
  await expect(page).toHaveURL(/\/dashboard$/);
  const res = await page.request.get("/api/audit-log/export");
  expect(res.status()).toBe(403);
});

test("the daily-summary cron needs the secret", async ({ request }) => {
  const res = await request.get("/api/cron/daily-summary");
  expect(res.status()).toBe(401);
  const wrong = await request.get("/api/cron/daily-summary", { headers: { Authorization: "Bearer wrong" } });
  expect(wrong.status()).toBe(401);
});
