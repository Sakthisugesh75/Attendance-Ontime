/**
 * Packs the app into one file for uploading to a server:  npm run bundle
 * Output: Attendance-private/exports/attendance-deploy.tgz (code only: no node_modules, builds, tests, .env or uploads).
 */
import { spawnSync } from "node:child_process";
import { statSync } from "node:fs";
import path from "node:path";
import { privateDir } from "./private-dir.mjs";

// --cpanel: also packs the production build (.next, minus its cache), because shared hosting has
// too little memory to build there. Run through `npm run bundle:cpanel`, which builds first.
const cpanel = process.argv.includes("--cpanel");
const out = path.join(privateDir("exports"), cpanel ? "attendance-cpanel.tgz" : "attendance-deploy.tgz");
const exclude = [
  "node_modules", ...(cpanel ? ["./.next/cache", "./.next/trace"] : [".next"]), ".next-*", "test-results", "playwright-report", "storage", "backups",
  ".env", ".env.local", ".serve.lock", "tsconfig.tsbuildinfo", "docs", ".q-tmp.cjs", ".agents", ".claude", "skills-lock.json", "mobile",
];
const args = [...(process.platform === "win32" ? ["--no-fflags", "--no-xattrs"] : []), "-czf", out, ...exclude.flatMap((e) => ["--exclude", e]), "."];
// Windows: use the built-in bsdtar (GNU tar from Git Bash reads "C:…" as a remote host).
const tar = process.platform === "win32" ? path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe") : "tar";
const res = spawnSync(tar, args, { stdio: "inherit" });
if (res.status !== 0) process.exit(res.status ?? 1);
console.log(`\n✔  ${out}  (${(statSync(out).size / 1024 / 1024).toFixed(1)} MB)`);
console.log(
  cpanel
    ? "   cPanel: upload it with File Manager into the app folder (e.g. ~/attendance) and Extract it there.\n"
    : "   Upload it to the server and unpack:  mkdir -p ~/attendance && tar -xzf attendance-deploy.tgz -C ~/attendance\n",
);
