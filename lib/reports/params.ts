import { z } from "zod";
import { addDays, monthDates } from "@/lib/time";
import { REPORT_KEYS, REPORT_META, type ReportKey } from "./definitions";

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const PAGE_SIZE = 25;
/** Longest range a report covers (a year and a day, so a full leap year fits). */
export const MAX_RANGE_DAYS = 366;

const raw = z.object({
  report: z.enum(REPORT_KEYS).catch("monthly-summary"),
  from: ymd.optional().catch(undefined),
  to: ymd.optional().catch(undefined),
  dept: z.coerce.number().int().positive().optional().catch(undefined),
  emp: z
    .string()
    .optional()
    .transform((s) => [...new Set((s ?? "").split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0))])
    .catch([]),
  sort: z.string().regex(/^[a-zA-Z]+$/).optional().catch(undefined),
  dir: z.enum(["asc", "desc"]).optional().catch(undefined),
  page: z.coerce.number().int().min(1).catch(1),
});

export interface ReportParams {
  report: ReportKey;
  from: string;
  to: string;
  dept: number | null;
  emp: number[];
  sort: string;
  dir: "asc" | "desc";
  page: number;
}

const validDate = (s: string | undefined) => !!s && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);

/** URL search params -> report parameters with defaults (this month, the report's default sort). */
export function parseReportParams(input: Record<string, string | string[] | undefined>, today: string): ReportParams {
  const flat = Object.fromEntries(Object.entries(input).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const p = raw.parse(flat);
  const month = monthDates(today.slice(0, 7));
  let from = validDate(p.from) ? p.from! : month[0]!;
  let to = validDate(p.to) ? p.to! : month.at(-1)!;
  if (from > to) [from, to] = [to, from];
  if (addDays(from, MAX_RANGE_DAYS - 1) < to) to = addDays(from, MAX_RANGE_DAYS - 1);
  const meta = REPORT_META[p.report];
  return { report: p.report, from, to, dept: p.dept ?? null, emp: p.emp, sort: p.sort ?? meta.defaultSort, dir: p.dir ?? meta.defaultDir, page: p.page };
}

/** "2026-10" for a whole calendar month, otherwise "2026-10-01_2026-10-15". */
export function periodSlug(from: string, to: string): string {
  const days = monthDates(from.slice(0, 7));
  return from === days[0] && to === days.at(-1) ? from.slice(0, 7) : `${from}_${to}`;
}

/** Query string for the same filters (used by links and export URLs). */
export function reportQuery(p: Partial<ReportParams>): string {
  const q = new URLSearchParams();
  if (p.report) q.set("report", p.report);
  if (p.from) q.set("from", p.from);
  if (p.to) q.set("to", p.to);
  if (p.dept) q.set("dept", String(p.dept));
  if (p.emp?.length) q.set("emp", p.emp.join(","));
  if (p.sort) q.set("sort", p.sort);
  if (p.dir) q.set("dir", p.dir);
  if (p.page && p.page > 1) q.set("page", String(p.page));
  return q.toString();
}
