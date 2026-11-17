import type { CellValue } from "exceljs";

/** The plain value behind an ExcelJS cell (formula results, rich text, hyperlinks). */
export function plainValue(v: CellValue | undefined): string | number | Date | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date || typeof v === "number" || typeof v === "string") return v;
  if (typeof v === "boolean") return String(v);
  if (typeof v === "object") {
    if ("result" in v) return plainValue(v.result as CellValue);
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("text" in v) return String(v.text);
    if ("error" in v) return null;
  }
  return null;
}

const pad = (n: number) => String(n).padStart(2, "0");

function validYmd(y: number, m: number, d: number): string | null {
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1) return null;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d <= last ? `${y}-${pad(m)}-${pad(d)}` : null;
}

/** Excel serial day number (1900 system) -> YYYY-MM-DD */
export function serialToYmd(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 30000 || serial > 80000) return null;
  const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000);
  return d.toISOString().slice(0, 10);
}

/**
 * Date cell -> YYYY-MM-DD. Accepts real Excel dates, serial numbers and text like
 * 21.01.2026, 21/1/2026, 21-01-26, 2026-01-21.
 */
export function parseDateCell(raw: string | number | Date | null): string | null {
  if (raw === null) return null;
  if (raw instanceof Date) {
    // ExcelJS gives date-only cells as UTC midnight.
    return Number.isNaN(raw.getTime()) ? null : validYmd(raw.getUTCFullYear(), raw.getUTCMonth() + 1, raw.getUTCDate());
  }
  if (typeof raw === "number") return serialToYmd(raw);
  const s = raw.trim();
  let m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/);
  if (m) return validYmd(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.match(/^(\d{1,2})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{2}|\d{4})$/);
  if (m) {
    const y = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return validYmd(y, Number(m[2]), Number(m[1]));
  }
  return null;
}

export type TimeParse =
  | { kind: "empty" }
  | { kind: "time"; minutes: number; /** true when written without AM/PM (24-hour or bare) */ ambiguous: boolean }
  | { kind: "text"; text: string };

/**
 * Time cell -> minutes since midnight. Accepts 09.45AM, 9.45 am, 6.32PM, 10..05AM, 10AM,
 * 18:30, 9:45, Excel time fractions and Date values. "0", "-" and blanks are empty.
 */
export function parseTimeCell(raw: string | number | Date | null): TimeParse {
  if (raw === null) return { kind: "empty" };
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return { kind: "empty" };
    return { kind: "time", minutes: raw.getUTCHours() * 60 + raw.getUTCMinutes(), ambiguous: false };
  }
  if (typeof raw === "number") {
    if (raw === 0) return { kind: "empty" };
    if (raw > 0 && raw < 1) return { kind: "time", minutes: Math.round(raw * 1440) % 1440, ambiguous: false };
    return { kind: "text", text: String(raw) };
  }
  const s = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (s === "" || s === "0" || /^-+$/.test(s) || s === "nil" || s === "na" || s === "n/a") return { kind: "empty" };

  // 12-hour: 09.45AM, 9.45 am, 6:32pm, 10..05 am, 10 am, 9.45a.m.
  let m = s.match(/^(\d{1,2})(?:\s*[.:;,]+\s*(\d{1,2}))?\s*([ap])\.?\s*m?\.?$/);
  if (m) {
    const h = Number(m[1]);
    const min = m[2] ? Number(m[2]) : 0;
    if (h < 1 || h > 12 || min > 59) return { kind: "text", text: raw.trim() };
    const pm = m[3] === "p";
    return { kind: "time", minutes: ((h % 12) + (pm ? 12 : 0)) * 60 + min, ambiguous: false };
  }
  // 24-hour or bare: 18:30, 9.45, 09.5
  m = s.match(/^(\d{1,2})\s*[.:]\s*(\d{1,2})$/);
  if (m) {
    const h = Number(m[1]);
    const min = Number(m[2]!.length === 1 ? `${m[2]}0` : m[2]);
    if (h > 23 || min > 59) return { kind: "text", text: raw.trim() };
    return { kind: "time", minutes: h * 60 + min, ambiguous: h <= 12 };
  }
  return { kind: "text", text: raw.trim() };
}

const WEEKDAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
export const isWeekdayName = (text: string) => WEEKDAY_NAMES.includes(text.trim().toLowerCase().replace(/[^a-z]/g, ""));

export type RemarkStatus = "LEAVE" | "WFH" | "HALF_DAY" | "ON_DUTY" | "PERMISSION";

/** Remark text -> the status it means, or null when it is just a note. */
export function classifyRemark(text: string): RemarkStatus | null {
  const t = text.toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return null;
  if (/\b(wfh|work from home|working from home)\b/.test(t)) return "WFH";
  if (/\bhalf\b/.test(t)) return "HALF_DAY";
  if (/\bpermission\b/.test(t)) return "PERMISSION";
  if (/\b(shoot|shooting|on duty|onduty|od|field|client visit|site visit)\b/.test(t)) return "ON_DUTY";
  if (/\b(leave|sick|lop|cl|sl|el)\b/.test(t)) return "LEAVE";
  return null;
}

/** "18:30" style label for previews */
export const minutesLabel = (m: number) => {
  const h = Math.floor(m / 60) % 24;
  return `${pad(h % 12 || 12)}:${pad(m % 60)} ${h >= 12 ? "PM" : "AM"}`;
};
