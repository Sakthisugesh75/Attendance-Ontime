/**
 * Frees the app port before `npm run dev`, `npm start` or `npm run prod`, so starting the app by
 * hand always works even if an earlier copy is still running. Only the process listening on the
 * port is stopped. Usage: node scripts/free-port.mjs [port] (default 6001).
 */
import { execSync } from "node:child_process";

const port = Number(process.argv[2] ?? 6001);

function listeners() {
  try {
    if (process.platform === "win32") {
      const out = execSync(`netstat -ano -p tcp`, { encoding: "utf8" });
      return [
        ...new Set(
          out
            .split(/\r?\n/)
            .map((l) => l.trim().split(/\s+/))
            .filter((c) => c[0] === "TCP" && c[3] === "LISTENING" && c[1].endsWith(`:${port}`))
            .map((c) => Number(c[4]))
            .filter((pid) => pid > 0 && pid !== process.pid),
        ),
      ];
    }
    return execSync(`lsof -ti tcp:${port} -sTCP:LISTEN`, { encoding: "utf8" }).split(/\s+/).filter(Boolean).map(Number);
  } catch {
    return [];
  }
}

const pids = listeners();
for (const pid of pids) {
  try {
    if (process.platform === "win32") execSync(`taskkill /PID ${pid} /T /F`, { stdio: "ignore" });
    else process.kill(pid, "SIGKILL");
    console.log(`Port ${port} was in use: stopped the old copy (process ${pid}).`);
  } catch {
    console.warn(`Port ${port} is used by process ${pid}, which could not be stopped. Close it and try again.`);
  }
}
