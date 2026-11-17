/**
 * Production server for everyday use (`npm run serve` via nodemon, or `npm start`):
 * frees the port, builds only when the code is newer than the last build, runs `next start`,
 * starts it again if it ever stops unexpectedly, and keeps the terminal informed at each step.
 * Under nodemon, saving a code change restarts this script, which triggers a fresh build.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createConnection } from "node:net";
import { networkInterfaces } from "node:os";
import path from "node:path";

const PORT = process.env.PORT ?? "6001";
const SOURCES = ["app", "components", "lib", "public", "next.config.ts", "package.json", ".env"];
const BUILD_ID = path.join(".next", "BUILD_ID");
const LOCK = ".serve.lock";
const WATCHING = !!process.env.NODEMON; // set in nodemon.json
/** Runs `npx next …` (one command string, so Windows needs no argument escaping). */
const next = (args, options) => spawn(`npx next ${args}`, { shell: true, ...options });
const nextSync = (args, options) => spawnSync(`npx next ${args}`, { shell: true, ...options });

const clock = (ms = Date.now()) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true }).format(ms);
const color = (code) => (text) => (process.stdout.isTTY ? `\x1b[${code}m${text}\x1b[0m` : text);
const lime = color("92");
const amber = color("33");
const red = color("91");
const dim = color("2");
const say = (icon, text) => console.log(`\n${icon}  ${text}`);

/** Source files changed after `since`, newest first. */
function changedSince(since, entry, out = []) {
  if (!existsSync(entry)) return out;
  const stat = statSync(entry);
  if (stat.isDirectory()) for (const name of readdirSync(entry)) changedSince(since, path.join(entry, name), out);
  else if (stat.mtimeMs > since) out.push({ file: entry.replaceAll("\\", "/"), at: stat.mtimeMs });
  return out;
}

function lanAddresses() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((a) => a && a.family === "IPv4" && !a.internal && !a.address.startsWith("169.254."))
    .map((a) => a.address);
}

// ---- One copy at a time ------------------------------------------------------------------
// Two copies would keep stopping each other's server (each frees the port when it starts).
function lockHolder() {
  try {
    const { pid, since } = JSON.parse(readFileSync(LOCK, "utf8"));
    process.kill(pid, 0); // throws if that process is gone
    return pid === process.pid ? null : { pid, since };
  } catch {
    return null;
  }
}
const holder = lockHolder();
if (holder) {
  console.log(amber(`
Attendance is already running in another window (since ${clock(holder.since)} IST).`));
  console.log(`Open http://localhost:${PORT}, or press Ctrl+C in that window first if you want to restart it here.
`);
  process.exit(0);
}
writeFileSync(LOCK, JSON.stringify({ pid: process.pid, since: Date.now() }));
process.on("exit", () => {
  if (lockHolder() === null) rmSync(LOCK, { force: true });
});

// ---- Start-up -----------------------------------------------------------------------------
console.log(lime("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
console.log(`  Attendance · starting at ${clock()} IST`);
console.log(lime("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));

spawnSync(process.execPath, ["scripts/free-port.mjs", PORT], { stdio: "inherit" });

// ---- Wait for MySQL ------------------------------------------------------------------------
// After a reboot WAMP starts MySQL a little after Windows; starting before it is ready makes
// every sign-in fail. Read host/port from DATABASE_URL in .env and wait until it answers.
function dbAddress() {
  try {
    const url = readFileSync(".env", "utf8").match(/^DATABASE_URL="?([^"\n]+)"?/m)?.[1];
    const u = new URL(url);
    return { host: u.hostname || "127.0.0.1", port: Number(u.port || 3306) };
  } catch {
    return { host: "127.0.0.1", port: 3306 };
  }
}
const reachable = ({ host, port }) =>
  new Promise((resolve) => {
    const socket = createConnection({ host, port, timeout: 1500 });
    socket.once("connect", () => (socket.destroy(), resolve(true)));
    socket.once("error", () => resolve(false));
    socket.once("timeout", () => (socket.destroy(), resolve(false)));
  });
const db = dbAddress();
if (!(await reachable(db))) {
  say("⏳", amber(`MySQL isn't running yet (${db.host}:${db.port}). Start WAMP; waiting for it…`));
  for (let i = 1; !(await reachable(db)); i++) {
    if (i % 10 === 0) console.log(dim(`     Still waiting for MySQL (${i * 3}s). Is the WAMP icon green?`));
    await new Promise((r) => setTimeout(r, 3000));
  }
  say("✅", "MySQL is up.");
}

const builtAt = existsSync(BUILD_ID) ? statSync(BUILD_ID).mtimeMs : 0;
const changed = builtAt ? SOURCES.flatMap((s) => changedSince(builtAt, s)).sort((a, b) => b.at - a.at) : [];
if (!builtAt || changed.length) {
  if (!builtAt) say("🔨", "No build yet: building the app (about 2 minutes)…");
  else {
    say("🔨", `${changed.length} file${changed.length === 1 ? "" : "s"} changed since the last build (${clock(builtAt)}): rebuilding (about 2 minutes)…`);
    for (const c of changed.slice(0, 6)) console.log(dim(`     • ${c.file}  ${clock(c.at)}`));
    if (changed.length > 6) console.log(dim(`     • …and ${changed.length - 6} more`));
  }
  const t = Date.now();
  if (nextSync("build", { stdio: "inherit" }).status !== 0) {
    say("❌", red("Build failed. Fix the error above") + (WATCHING ? " and save: it will try again by itself." : ", then run the command again."));
    process.exit(1);
  }
  say("✅", `Build finished in ${Math.round((Date.now() - t) / 1000)}s.`);
} else {
  say("✅", `No code changes since the last build (${clock(builtAt)}): starting straight away.`);
}

// ---- Run and watch over the server --------------------------------------------------------
let server;
let stopping = false;
let restarts = 0;

function announceReady() {
  say("🟢", lime(`Attendance is running  (${clock()} IST)`));
  console.log(`     On this PC:      http://localhost:${PORT}`);
  for (const ip of lanAddresses()) console.log(`     On office Wi-Fi: http://${ip}:${PORT}`);
  console.log(
    dim(
      WATCHING
        ? "     Saving a code change rebuilds and restarts by itself. Type rs + Enter to restart, Ctrl+C to stop."
        : "     Press Ctrl+C to stop. Use npm run serve to rebuild automatically when code changes.",
    ),
  );
}

function start() {
  if (restarts === 0) say("🚀", "Starting the server…");
  server = next(`start -p ${PORT}`, { stdio: ["ignore", "pipe", "inherit"] });
  const startedAt = Date.now();
  server.stdout.on("data", (chunk) => {
    const text = chunk.toString();
    // Next's own start-up banner is replaced by announceReady(); everything else passes through.
    if (/Ready in/.test(text)) return announceReady();
    if (/▲ Next\.js|- Local:|- Network:|Starting\.\.\./.test(text)) return;
    process.stdout.write(text);
  });
  server.on("exit", (code) => {
    if (stopping) return;
    // Back off if it keeps failing straight after starting (e.g. the database is down).
    restarts = Date.now() - startedAt < 10_000 ? restarts + 1 : 1;
    const wait = Math.min(30, 2 ** (restarts - 1));
    say("⚠️ ", amber(`The server stopped unexpectedly at ${clock()} (code ${code}). Starting it again in ${wait}s…`));
    if (restarts >= 4) console.log(dim("     It keeps stopping: check that WAMP / MySQL is running."));
    setTimeout(start, wait * 1000);
  });
}

function stop(signal) {
  if (stopping) return;
  stopping = true;
  if (server?.pid) {
    if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" });
    else server.kill("SIGTERM");
  }
  // nodemon restarting for a code change also sends a signal; only say "stopped" when it's for real.
  if (signal === "SIGINT" || !WATCHING) {
    say("⏹ ", `Attendance stopped at ${clock()} IST.`);
    console.log(dim(`     Start again with:  npm run serve   (any code changes are picked up automatically)`));
  } else {
    say("🔄", "Code changed: restarting with the new version…");
  }
  process.exit(0);
}
for (const signal of ["SIGINT", "SIGTERM", "SIGUSR2", "SIGHUP"]) process.on(signal, () => stop(signal));

start();
