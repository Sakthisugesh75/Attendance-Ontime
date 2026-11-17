/**
 * Where private files go: the "Attendance-private" folder next to the project (never in Git).
 * Found by walking up from the project folder; created next to it if it doesn't exist yet.
 *
 *   Attendance-private/db-backups   database backups
 *   Attendance-private/exports      npm run bundle / export-db output (real data: keep private)
 *   Attendance-private/tools        cloudflared.exe for npm run tunnel
 */
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

export const PRIVATE_NAME = "Attendance-private";

export function privateDir(...sub) {
  let dir = process.cwd();
  for (let i = 0; i < 4; i++) {
    const candidate = path.join(dir, PRIVATE_NAME);
    if (existsSync(candidate)) return ensure(path.join(candidate, ...sub));
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return ensure(path.resolve("..", PRIVATE_NAME, ...sub));
}

function ensure(dir) {
  mkdirSync(dir, { recursive: true });
  return dir;
}
