import { mkdirSync } from "node:fs";
import { expect, test, type Browser, type Page } from "@playwright/test";

/**
 * Responsive check: every screen at phone, large-phone, tablet and laptop widths, as an employee
 * and as an admin. Fails when a page scrolls sideways or a visible element sticks out of the
 * screen (tables and other deliberately scrolling areas excepted). Screenshots of every page land
 * in test-results/responsive/ for a visual review (`npx playwright test responsive`).
 */

const BASE = "http://localhost:3100";
const OUT = "test-results/responsive";

const VIEWPORTS = [
  { name: "phone-360", width: 360, height: 780, mobile: true },
  { name: "phone-412", width: 412, height: 915, mobile: true },
  { name: "tablet-768", width: 768, height: 1024, mobile: true },
  { name: "laptop-1280", width: 1280, height: 800, mobile: false },
];

const EMPLOYEE_PAGES = ["/dashboard", "/attendance", "/requests", "/daily-reports", "/holidays", "/announcements", "/notifications", "/expenses", "/assets", "/app"];
const ADMIN_PAGES = [
  "/dashboard",
  "/dashboard?tab=me",
  "/attendance",
  "/requests",
  "/employees",
  "/muster",
  "/reports?report=monthly-summary",
  "/import",
  "/daily-reports",
  "/expenses",
  "/assets",
  "/settings?tab=company",
  "/settings?tab=shifts",
  "/settings?tab=punching",
  "/settings?tab=mobile-app",
  "/access",
  "/audit-log",
];

async function signIn(browser: Browser, vp: (typeof VIEWPORTS)[number], identifier: string, password: string) {
  const context = await browser.newContext({
    baseURL: BASE,
    viewport: { width: vp.width, height: vp.height },
    isMobile: vp.mobile,
    hasTouch: vp.mobile,
    deviceScaleFactor: vp.mobile ? 2 : 1,
  });
  const page = await context.newPage();
  await page.goto("/login");
  await page.screenshot({ path: `${OUT}/${vp.name}/login.png`, fullPage: true });
  await page.getByLabel("Email, phone or username").fill(identifier);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  return { page, close: () => context.close() };
}

/** Elements wider than the screen that aren't inside something meant to scroll sideways. */
async function overflow(page: Page) {
  return page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    const scrollsX = (el: Element) => {
      for (let p: Element | null = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const o = getComputedStyle(p).overflowX;
        if (o === "auto" || o === "scroll" || o === "hidden" || o === "clip") return true;
      }
      return false;
    };
    const offenders = [...document.querySelectorAll("body *")]
      .filter((el) => {
        const b = el.getBoundingClientRect();
        if (!b.width || !b.height || getComputedStyle(el).visibility === "hidden") return false;
        if (getComputedStyle(el).position === "fixed") return false;
        return (b.right > w + 1 || b.left < -1) && !scrollsX(el);
      })
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()}.${String((el as HTMLElement).className).split(" ").slice(0, 4).join(".")}`);
    return { pageScrollsX: document.documentElement.scrollWidth > w + 1, offenders };
  });
}

async function check(page: Page, vp: (typeof VIEWPORTS)[number], who: string, paths: string[]) {
  const problems: string[] = [];
  for (const path of paths) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(300);
    const name = `${who}-${path.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "")}`;
    await page.screenshot({ path: `${OUT}/${vp.name}/${name}.png`, fullPage: true });
    const o = await overflow(page);
    if (o.pageScrollsX || o.offenders.length) problems.push(`${path}: ${o.pageScrollsX ? "page scrolls sideways; " : ""}${o.offenders.join(", ")}`);
  }
  return problems;
}

for (const vp of VIEWPORTS) {
  test(`no sideways overflow at ${vp.name}`, async ({ browser }) => {
    test.setTimeout(300_000);
    mkdirSync(`${OUT}/${vp.name}`, { recursive: true });
    const employee = await signIn(browser, vp, "anitha@example.com", "Employee@123");
    const problems = await check(employee.page, vp, "employee", EMPLOYEE_PAGES);
    if (vp.mobile && vp.width < 768) {
      // The phone menu (opened from the dock's last button).
      await employee.page.goto("/dashboard");
      await employee.page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "More" }).click();
      await employee.page.waitForTimeout(400);
      await employee.page.screenshot({ path: `${OUT}/${vp.name}/employee-menu.png` });
    }
    await employee.close();

    const admin = await signIn(browser, vp, "admin", "admin");
    problems.push(...(await check(admin.page, vp, "admin", ADMIN_PAGES)));
    await admin.close();

    expect(problems, problems.join("\n")).toEqual([]);
  });
}
