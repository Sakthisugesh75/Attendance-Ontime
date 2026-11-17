import { defineConfig } from "@playwright/test";

const PORT = 3100;
/** E2E runs against its own database; global-setup refuses any name not ending in _test. */
export const E2E_DATABASE_URL = process.env.E2E_DATABASE_URL ?? "mysql://root:@127.0.0.1:3306/attendance_next_test";

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Uses the locally installed Chrome; run `npx playwright install chromium` and drop this if there is none.
    channel: "chrome",
    timezoneId: "Asia/Kolkata",
    trace: "retain-on-failure",
  },
  webServer: {
    // Production build: closer to real use and much faster than compiling pages on demand.
    command: `npx next build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    timeout: 420_000,
    reuseExistingServer: false,
    env: { DATABASE_URL: E2E_DATABASE_URL, NEXT_DIST_DIR: ".next-e2e", APP_URL: `http://localhost:${PORT}` },
  },
});
