/**
 * Puts the running app (npm run serve, port 6001) on a public https address with Cloudflare Tunnel,
 * so phones can install the app and use location / selfie punching.
 *
 *   npm run tunnel
 *
 * - With CLOUDFLARE_TUNNEL_TOKEN in .env: runs your named tunnel (a fixed address on your own
 *   domain, set up once in the Cloudflare dashboard → Zero Trust → Networks → Tunnels).
 * - Without it: a free "quick tunnel" on a random https://….trycloudflare.com address that changes
 *   every time this starts. Good for trying it out; use a named tunnel for everyday staff use.
 *
 * Keep this window open: closing it takes the public address down. The app itself keeps working
 * on http://localhost:6001 either way.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { privateDir } from "./private-dir.mjs";

const PORT = process.env.PORT ?? "6001";
const color = (code) => (text) => (process.stdout.isTTY ? `\x1b[${code}m${text}\x1b[0m` : text);
const lime = color("92");
const amber = color("33");
const red = color("91");
const dim = color("2");

/** .env values without printing them (only the token is read here). */
function envValue(key) {
  if (process.env[key]) return process.env[key];
  if (!existsSync(".env")) return "";
  const line = readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .find((l) => l.trim().startsWith(`${key}=`));
  return line ? line.slice(line.indexOf("=") + 1).trim().replace(/^"|"$/g, "") : "";
}

function findCloudflared() {
  if (spawnSync("cloudflared", ["--version"]).status === 0) return "cloudflared";
  const candidates = [
    // The standalone copy in Attendance-private/tools (no admin rights needed).
    path.join(privateDir("tools", "cloudflared"), "cloudflared.exe"),
    path.join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "cloudflared", "cloudflared.exe"),
    path.join(process.env.ProgramFiles ?? "C:\\Program Files", "cloudflared", "cloudflared.exe"),
    path.join(process.env.LOCALAPPDATA ?? "", "Microsoft", "WinGet", "Links", "cloudflared.exe"),
  ];
  return candidates.find((p) => p && existsSync(p)) ?? null;
}

async function appIsUp() {
  try {
    const res = await fetch(`http://localhost:${PORT}/login`, { redirect: "manual" });
    return res.status < 500;
  } catch {
    return false;
  }
}

const bin = findCloudflared();
if (!bin) {
  console.log(red("\n✖  cloudflared is not installed."));
  console.log("   Download cloudflared-windows-amd64.exe from https://github.com/cloudflare/cloudflared/releases");
  console.log("   and save it as Attendance-private\\tools\\cloudflared\\cloudflared.exe (or: winget install --id Cloudflare.cloudflared),");
  console.log("   then run  npm run tunnel  again.\n");
  process.exit(1);
}
if (!(await appIsUp())) {
  console.log(amber(`\n!  Nothing answers on http://localhost:${PORT} yet.`));
  console.log("   Start the app first in another window:  npm run serve\n   The tunnel will start anyway and work as soon as the app is up.\n");
}

const token = envValue("CLOUDFLARE_TUNNEL_TOKEN");
const args = token ? ["tunnel", "--no-autoupdate", "run", "--token", token] : ["tunnel", "--no-autoupdate", "--url", `http://localhost:${PORT}`];
console.log(dim(token ? "\nStarting your named Cloudflare tunnel…" : "\nStarting a free quick tunnel (the address changes each time)…"));

// No shell: the token stays a plain argument (never parsed by a shell).
const child = spawn(bin, args, { windowsHide: true });
let announced = false;
const watch = (chunk) => {
  const text = chunk.toString();
  const quick = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (quick && !announced) {
    announced = true;
    console.log(`\n${lime("✔  Public address:")}  ${quick[0]}`);
    console.log(dim("   Open it on a phone, sign in, then Install app (account menu) or Add to Home Screen."));
    console.log(dim("   Keep this window open. Ctrl+C stops the public address.\n"));
  }
  if (token && !announced && /Registered tunnel connection/.test(text)) {
    announced = true;
    console.log(`\n${lime("✔  Tunnel connected.")} Your app is live on the address set for this tunnel in Cloudflare.\n`);
  }
  if (/ERR|error/i.test(text) && !/Retrying|context canceled/i.test(text)) process.stdout.write(dim(text));
};
child.stdout.on("data", watch);
child.stderr.on("data", watch);
child.on("exit", (code) => {
  console.log(code ? red(`\n✖  Tunnel stopped (code ${code}).`) : "\nTunnel stopped.");
  process.exit(code ?? 0);
});
process.on("SIGINT", () => child.kill("SIGINT"));
