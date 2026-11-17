// Fixed-window counter kept in memory. Good enough for a single-instance internal app;
// swap for Redis if the app is ever run on several instances.
const windows = new Map<string, { count: number; resetAt: number }>();

function current(key: string, windowMs: number) {
  const now = Date.now();
  let w = windows.get(key);
  if (!w || w.resetAt <= now) {
    w = { count: 0, resetAt: now + windowMs };
    windows.set(key, w);
  }
  return w;
}

/** Records a hit and returns true when `key` has gone over `limit` hits in the window. */
export function hitRateLimit(key: string, limit: number, windowMs: number): boolean {
  const w = current(key, windowMs);
  w.count++;
  return w.count > limit;
}

/** True when `key` already has `limit` hits in the window (does not count this check). */
export function isRateLimited(key: string, limit: number, windowMs: number): boolean {
  return current(key, windowMs).count >= limit;
}
