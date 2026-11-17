import { execSync } from "node:child_process";
import { E2E_DATABASE_URL } from "../../playwright.config";

/** Fresh schema + seed in the E2E database before the run. Never touches a non-test database. */
export default function globalSetup() {
  const dbName = new URL(E2E_DATABASE_URL).pathname.slice(1);
  if (!dbName.endsWith("_test")) throw new Error(`Refusing to reset "${dbName}": E2E database names must end in _test`);
  const env = { ...process.env, DATABASE_URL: E2E_DATABASE_URL };
  execSync("npx prisma db push --skip-generate --accept-data-loss", { stdio: "inherit", env });
  execSync("npx tsx --conditions=react-server prisma/seed.ts", { stdio: "inherit", env });
}
