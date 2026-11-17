/**
 * Exports the database for a Linux server:  npm run export-db
 * Output: Attendance-private/exports/attendance-db-<date>.sql
 *
 * MySQL on Windows (WAMP) stores table names in lowercase ("accessrole"), but on Linux names are
 * case-sensitive and the app needs Prisma's names ("AccessRole"). This dump renames every table
 * back to its model name, so it imports cleanly on the AWS server.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { privateDir } from "./private-dir.mjs";

const url = new URL(readFileSync(".env", "utf8").match(/^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/m)?.[1] ?? "");
const db = url.pathname.slice(1);

/** mysqldump from PATH, or the newest WAMP MySQL. */
function findMysqldump() {
  if (spawnSync("mysqldump", ["--version"]).status === 0) return "mysqldump";
  const base = "C:\\wamp64\\bin\\mysql";
  if (!existsSync(base)) return null;
  const dirs = readdirSync(base).filter((d) => d.startsWith("mysql")).sort().reverse();
  for (const d of dirs) {
    const exe = path.join(base, d, "bin", "mysqldump.exe");
    if (existsSync(exe)) return exe;
  }
  return null;
}

const bin = findMysqldump();
if (!bin) {
  console.error("✖  mysqldump not found (WAMP's MySQL bin folder or PATH).");
  process.exit(1);
}

const args = ["-h", url.hostname, "-P", url.port || "3306", "-u", decodeURIComponent(url.username), "--single-transaction", "--routines", "--no-tablespaces", db];
const env = { ...process.env, ...(url.password && { MYSQL_PWD: decodeURIComponent(url.password) }) };
const res = spawnSync(bin, args, { env, maxBuffer: 1024 * 1024 * 1024, encoding: "utf8" });
if (res.status !== 0) {
  console.error(res.stderr);
  process.exit(res.status ?? 1);
}

// lowercase table name -> Prisma model name (only exact backtick-quoted identifiers are touched)
const models = [...readFileSync("prisma/schema.prisma", "utf8").matchAll(/^model (\w+)/gm)].map((m) => m[1]);
const rename = new Map(models.map((m) => [m.toLowerCase(), m]));
let renamed = 0;
const sql = res.stdout.replace(/`([a-z_]+)`/g, (all, name) => {
  const to = rename.get(name);
  if (!to || to === name) return all;
  renamed++;
  return `\`${to}\``;
});

const out = path.join(privateDir("exports"), `attendance-db-${new Date().toISOString().slice(0, 10)}.sql`);
writeFileSync(out, sql);
console.log(`✔  ${out}  (${(statSync(out).size / 1024 / 1024).toFixed(1)} MB, ${renamed} table-name fixes for Linux)`);

// Uploads (photos, logo, selfies, imported workbooks) go with the data.
if (existsSync("storage")) {
  const tar = process.platform === "win32" ? path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe") : "tar";
  const files = path.join(privateDir("exports"), "attendance-storage.tgz");
  const t = spawnSync(tar, [...(process.platform === "win32" ? ["--no-fflags", "--no-xattrs"] : []), "-czf", files, "storage"], { stdio: "inherit" });
  if (t.status === 0) console.log(`✔  ${files}  (${(statSync(files).size / 1024 / 1024).toFixed(1)} MB of uploads)`);
}
console.log("   These hold real staff data: keep them private and delete them after the upload.");
