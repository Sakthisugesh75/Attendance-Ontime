// Writes www/server.js so the local "can't reach the server" page knows where to retry.
// Runs before every `cap sync` (npm run sync / android / ios). Reads SERVER_URL like capacitor.config.ts.
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const envFile = new URL("../.env", import.meta.url);
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const url = (process.env.SERVER_URL ?? "").replace(/\/$/, "");
if (!url) {
  console.error("SERVER_URL is not set. Copy mobile/.env.example to mobile/.env and set it to your https address.");
  process.exit(1);
}
writeFileSync(new URL("../www/server.js", import.meta.url), `window.ATTENDANCE_SERVER_URL = ${JSON.stringify(url)};\n`);
console.log(`App will load ${url}/dashboard`);
