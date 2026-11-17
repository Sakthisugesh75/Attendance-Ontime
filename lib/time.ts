import { TZDate } from "@date-fns/tz";

/** All business logic runs on the India calendar. Stored instants are UTC. */
export const TZ = "Asia/Kolkata";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** A business date ("2026-11-04") as stored in a DATE column (UTC midnight). */
export const ymdToDb = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

/** DATE column value -> "YYYY-MM-DD". */
export const dbToYmd = (d: Date) => d.toISOString().slice(0, 10);

/** The IST calendar date of an instant. */
export function istDate(instant: Date = new Date()): string {
  const z = new TZDate(instant, TZ);
  return `${z.getFullYear()}-${pad(z.getMonth() + 1)}-${pad(z.getDate())}`;
}

/** Minutes since IST midnight of `ymd` for an instant (can exceed 1440 for after-midnight punch-outs). */
export function istMinutes(instant: Date, ymd: string): number {
  return Math.round((instant.getTime() - istMidnight(ymd).getTime()) / 60000);
}

/** The UTC instant of IST midnight at the start of `ymd`. */
export function istMidnight(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  return new Date(new TZDate(y, m - 1, d, 0, 0, 0, TZ).getTime());
}

/** The UTC instant for "HH:mm" IST on `ymd`. */
export function istAt(ymd: string, hhmm: string): Date {
  return new Date(istMidnight(ymd).getTime() + hhmmToMinutes(hhmm) * 60000);
}

export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return h * 60 + m;
}

export function minutesToHhmm(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

/** 0 = Sunday … 6 = Saturday for a business date. */
export const weekdayOf = (ymd: string) => ymdToDb(ymd).getUTCDay();

/** Which occurrence of its weekday in the month (1st, 2nd, …) a date is. */
export const nthWeekdayOfMonth = (ymd: string) => Math.ceil(Number(ymd.slice(8, 10)) / 7);

export function addDays(ymd: string, days: number): string {
  const d = ymdToDb(ymd);
  d.setUTCDate(d.getUTCDate() + days);
  return dbToYmd(d);
}

/** Every date of a month ("2026-11") in order. */
export function monthDates(month: string): string[] {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: last }, (_, i) => `${month}-${pad(i + 1)}`);
}

// ---- Display (always IST) ---------------------------------------------------

/** "2026-11-04" -> "04 Nov 2026" */
export function formatDate(ymd: string | null | undefined): string {
  if (!ymd) return "—";
  const [y, m, d] = ymd.split("-");
  return `${d} ${MONTHS[Number(m) - 1]} ${y}`;
}

/** Instant -> "09:45 AM" in IST */
export function formatTime(instant: Date | string | null | undefined): string {
  if (!instant) return "—";
  const z = new TZDate(new Date(instant), TZ);
  return formatClock(z.getHours() * 60 + z.getMinutes());
}

/** Minutes since midnight -> "09:45 AM" */
export function formatClock(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  return `${pad(h % 12 || 12)}:${pad(m % 60)} ${h >= 12 ? "PM" : "AM"}`;
}

/** "HH:mm" -> "09:45 AM" */
export const formatHhmm = (hhmm: string | null | undefined) => (hhmm ? formatClock(hhmmToMinutes(hhmm)) : "—");

/** 485 -> "8h 05m" */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h ? `${h}h ${pad(m)}m` : `${m}m`;
}

export const monthLabel = (month: string) => `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;

function pad(n: number) {
  return String(n).padStart(2, "0");
}
