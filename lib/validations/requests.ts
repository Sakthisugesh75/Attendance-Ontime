import { z } from "zod";
import { addDays, hhmmToMinutes, istAt } from "@/lib/time";

/**
 * Requests & approvals: the form schema shared by the "New request" sheet (client) and the
 * server actions, plus the pure rules (day counting, balance maths, caps, overlaps) that
 * both sides use. Nothing here touches the database.
 */

export const REQUEST_TYPES = ["LEAVE", "WFH", "PERMISSION", "ON_DUTY", "REGULARIZATION"] as const;
export type RequestTypeKey = (typeof REQUEST_TYPES)[number];
export const REQUEST_STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED", "CANCEL_REQUESTED"] as const;
export type RequestStatusKey = (typeof REQUEST_STATUSES)[number];

/** Requests that hold their dates (and their leave days). */
export const ACTIVE_STATUSES: RequestStatusKey[] = ["PENDING", "APPROVED", "CANCEL_REQUESTED"];

/** Tailwind needs literal class names, so every type and status spells its classes out. */
export const REQUEST_TYPE_META: Record<RequestTypeKey, { label: string; short: string; dot: string; chip: string }> = {
  LEAVE: { label: "Leave", short: "Leave", dot: "bg-st-leave", chip: "bg-st-leave-tint text-st-leave-fg ring-transparent" },
  WFH: { label: "Work from home", short: "WFH", dot: "bg-st-present", chip: "bg-st-present-tint text-st-present-fg ring-transparent" },
  PERMISSION: { label: "Permission", short: "Permission", dot: "bg-st-leave", chip: "bg-st-leave-tint text-st-leave-fg ring-transparent" },
  ON_DUTY: { label: "On duty", short: "On duty", dot: "bg-st-present", chip: "bg-st-present-tint text-st-present-fg ring-transparent" },
  REGULARIZATION: { label: "Regularization", short: "Regularize", dot: "bg-st-holiday", chip: "bg-st-holiday-tint text-st-holiday-fg ring-transparent" },
};

/** Pending is the only dashed outline (DESIGN.md §2.4), so it reads even in greyscale. */
export const REQUEST_STATUS_META: Record<RequestStatusKey, { label: string; dot: string; chip: string }> = {
  PENDING: { label: "Pending", dot: "bg-st-pending", chip: "bg-st-pending-tint text-st-pending-fg ring-0 outline outline-1 -outline-offset-1 outline-dashed outline-st-pending" },
  APPROVED: { label: "Approved", dot: "bg-st-present", chip: "bg-st-present-tint text-st-present-fg ring-transparent" },
  REJECTED: { label: "Rejected", dot: "bg-st-absent", chip: "bg-st-absent-tint text-st-absent-fg ring-transparent" },
  CANCELLED: { label: "Cancelled", dot: "bg-ink-3/50", chip: "bg-sunken text-ink-3 ring-transparent" },
  CANCEL_REQUESTED: { label: "Cancellation requested", dot: "bg-st-pending", chip: "bg-st-pending-tint text-st-pending-fg ring-0 outline outline-1 -outline-offset-1 outline-dashed outline-st-pending" },
};

export const HALF_DAY_LABEL = { FIRST: "First half", SECOND: "Second half" } as const;

// ---- Form schema ------------------------------------------------------------

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Enter a time");
const optionalHhmm = z.union([hhmm, z.literal("")]);
/** Longest span one request may cover. */
export const MAX_SPAN_DAYS = 60;

/**
 * One flat shape for every type (react-hook-form handles that better than a union); the
 * refinements decide which fields matter for the chosen type.
 */
export const requestSchema = z
  .object({
    type: z.enum(REQUEST_TYPES),
    leaveTypeId: z.number().int().positive().nullable(),
    fromDate: ymd,
    toDate: z.union([ymd, z.literal("")]),
    halfDay: z.enum(["NONE", "FIRST", "SECOND"]),
    startTime: optionalHhmm,
    endTime: optionalHhmm,
    reason: z.string().trim().min(3, "Add a short reason (at least 3 characters)").max(1000, "Keep the reason under 1000 characters"),
  })
  .superRefine((v, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
    const multi = v.type === "LEAVE" || v.type === "WFH" || v.type === "ON_DUTY";
    if (multi) {
      if (!v.toDate) issue("toDate", "Pick the last date");
      else if (v.toDate < v.fromDate) issue("toDate", "The last date can't be before the first");
      else if (spanDays(v.fromDate, v.toDate) > MAX_SPAN_DAYS) issue("toDate", `One request can cover at most ${MAX_SPAN_DAYS} days`);
    }
    if (v.type === "LEAVE") {
      if (!v.leaveTypeId) issue("leaveTypeId", "Pick a leave type");
      if (v.halfDay !== "NONE" && v.toDate && v.toDate !== v.fromDate) issue("halfDay", "A half day is for a single date");
      if (v.toDate && v.fromDate.slice(0, 4) !== v.toDate.slice(0, 4)) issue("toDate", "Leave can't run into the next year. Split it into two requests.");
    }
    if (v.type === "PERMISSION") {
      if (!v.startTime) issue("startTime", "Enter the start time");
      if (!v.endTime) issue("endTime", "Enter the end time");
      if (v.startTime && v.endTime && v.endTime <= v.startTime) issue("endTime", "End must be after the start");
    }
    if (v.type === "ON_DUTY") {
      if (!!v.startTime !== !!v.endTime) issue(v.startTime ? "endTime" : "startTime", "Give both times, or neither");
      else if (v.startTime && v.endTime <= v.startTime) issue("endTime", "End must be after the start");
      if (v.startTime && v.toDate && v.toDate !== v.fromDate) issue("startTime", "A time range is for a single date");
    }
    if (v.type === "REGULARIZATION") {
      if (!v.startTime && !v.endTime) issue("startTime", "Enter the punch-in or punch-out time (or both)");
      if (v.startTime && v.endTime && v.endTime <= v.startTime) issue("endTime", "Punch-out must be after punch-in");
    }
  });

export type RequestInput = z.input<typeof requestSchema>;
export type RequestValues = z.output<typeof requestSchema>;

/** What gets stored: irrelevant fields cleared, single-date types get toDate = fromDate. */
export interface NormalizedRequest {
  type: RequestTypeKey;
  leaveTypeId: number | null;
  fromDate: string;
  toDate: string;
  halfDay: "FIRST" | "SECOND" | null;
  startTime: string | null;
  endTime: string | null;
  reason: string;
}

export function normalizeRequest(v: RequestValues): NormalizedRequest {
  const single = v.type === "PERMISSION" || v.type === "REGULARIZATION";
  const toDate = single || !v.toDate ? v.fromDate : v.toDate;
  const timed = v.type === "PERMISSION" || v.type === "REGULARIZATION" || (v.type === "ON_DUTY" && !!v.startTime);
  return {
    type: v.type,
    leaveTypeId: v.type === "LEAVE" ? v.leaveTypeId : null,
    fromDate: v.fromDate,
    toDate,
    halfDay: v.type === "LEAVE" && toDate === v.fromDate && v.halfDay !== "NONE" ? v.halfDay : null,
    startTime: timed ? v.startTime || null : null,
    endTime: timed ? v.endTime || null : null,
    reason: v.reason.trim(),
  };
}

export const decisionSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1, "Select at least one request").max(100),
  decision: z.enum(["APPROVE", "REJECT"]),
  comment: z.string().trim().max(500, "Keep the comment under 500 characters"),
});
export type DecisionInput = z.input<typeof decisionSchema>;

export const approvalParams = z.object({
  view: z.enum(["approvals", "mine"]).optional().catch(undefined),
  status: z.enum(["OPEN", "ALL", ...REQUEST_STATUSES]).catch("OPEN"),
  type: z.enum(["ALL", ...REQUEST_TYPES]).catch("ALL"),
  employee: z.coerce.number().int().positive().optional().catch(undefined),
});
export type ApprovalParams = z.infer<typeof approvalParams>;

// ---- Attachments ------------------------------------------------------------

export const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
export const ATTACHMENT_TYPES: Record<string, "pdf" | "jpg" | "png"> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" };

/** Checks the file's first bytes, so a renamed file can't pass as a PDF or image. */
export function sniffAttachment(bytes: Uint8Array): "pdf" | "jpg" | "png" | null {
  const starts = (sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (starts([0x25, 0x50, 0x44, 0x46])) return "pdf"; // %PDF
  if (starts([0xff, 0xd8, 0xff])) return "jpg";
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  return null;
}

// ---- Pure rules -------------------------------------------------------------

/** Calendar days from `from` to `to`, both included. */
export function spanDays(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

export function eachDate(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length <= 400; d = addDays(d, 1)) out.push(d);
  return out;
}

/**
 * Working days in [from, to]: weekly offs and holidays don't count. A half day counts 0.5
 * (and nothing when that date is itself off).
 */
export function countWorkingDays(from: string, to: string, isOff: (ymd: string) => boolean, halfDay: "FIRST" | "SECOND" | null = null): number {
  if (!from || !to || to < from) return 0;
  const working = eachDate(from, to).filter((d) => !isOff(d)).length;
  return halfDay && from === to ? working * 0.5 : working;
}

export interface BalanceFigures {
  allotted: number;
  carriedForward: number;
  used: number;
  pending: number;
}

/** allotted + carried forward − used − pending */
export function availableBalance(b: BalanceFigures): number {
  return round1(b.allotted + b.carriedForward - b.used - b.pending);
}

/** Paid leave can't go past the available balance; unpaid leave (LOP) is never blocked. */
export function checkLeaveBalance(days: number, available: number, isPaid: boolean): string | null {
  if (!isPaid) return null;
  if (days > available) {
    return available <= 0 ? "No balance left for this leave type. Pick another type or Loss of Pay." : `Only ${fmtDays(available)} available. Shorten the leave or pick another type.`;
  }
  return null;
}

export function minutesBetween(start: string, end: string): number {
  return hhmmToMinutes(end) - hhmmToMinutes(start);
}

/** Permission: window within the maximum length and fewer than the monthly count already used. */
export function checkPermission(start: string, end: string, usedThisMonth: number, caps: { permissionPerMonth: number; permissionMaxMinutes: number }): string | null {
  const minutes = minutesBetween(start, end);
  if (minutes <= 0) return "End must be after the start";
  if (minutes > caps.permissionMaxMinutes) return `A permission can be at most ${formatMinutes(caps.permissionMaxMinutes)}.`;
  if (usedThisMonth >= caps.permissionPerMonth) {
    return `You've already used ${caps.permissionPerMonth} permission${caps.permissionPerMonth === 1 ? "" : "s"} this month (the monthly limit).`;
  }
  return null;
}

/**
 * WFH days per month after adding this request; months past the cap are returned so the
 * form can warn (the cap never blocks).
 */
export function wfhOverCap(dates: string[], usedByMonth: Record<string, number>, cap: number): { month: string; total: number }[] {
  const added: Record<string, number> = {};
  for (const d of dates) added[d.slice(0, 7)] = (added[d.slice(0, 7)] ?? 0) + 1;
  return Object.entries(added)
    .map(([month, n]) => ({ month, total: (usedByMonth[month] ?? 0) + n }))
    .filter((m) => m.total > cap);
}

export interface RequestSlot {
  id?: number;
  type: RequestTypeKey;
  fromDate: string;
  toDate: string;
  halfDay: "FIRST" | "SECOND" | null;
  status?: RequestStatusKey;
}

/**
 * Two requests clash when their dates overlap and the types can't share a day:
 * - full-day leave clashes with everything except a regularization;
 * - two half-day leaves only clash on the same half;
 * - WFH and on duty clash with each other and themselves;
 * - one permission per day; one open regularization per day.
 */
export function clashes(a: RequestSlot, b: RequestSlot): boolean {
  if (a.fromDate > b.toDate || b.fromDate > a.toDate) return false;
  const pair = new Set([a.type, b.type]);
  if (a.type === "LEAVE" && b.type === "LEAVE") return !(a.halfDay && b.halfDay && a.halfDay !== b.halfDay);
  if (pair.has("REGULARIZATION")) return a.type === b.type;
  if (pair.has("LEAVE")) {
    const leave = a.type === "LEAVE" ? a : b;
    return !leave.halfDay;
  }
  const away = (t: RequestTypeKey) => t === "WFH" || t === "ON_DUTY";
  if (away(a.type) && away(b.type)) return true;
  return a.type === "PERMISSION" && b.type === "PERMISSION";
}

/** The first existing active request that clashes with `next`, if any. */
export function findClash<T extends RequestSlot>(next: RequestSlot, existing: T[]): T | null {
  return existing.find((e) => e.id !== next.id && (!e.status || ACTIVE_STATUSES.includes(e.status)) && clashes(next, e)) ?? null;
}

// ---- Formatting -------------------------------------------------------------

export const round1 = (n: number) => Math.round(n * 10) / 10;

/** 1 -> "1 day", 2.5 -> "2.5 days" */
export function fmtDays(n: number): string {
  const v = round1(n);
  return `${Number.isInteger(v) ? v : v.toFixed(1)} day${v === 1 ? "" : "s"}`;
}

export function fmtNum(n: number): string {
  const v = round1(n);
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

export function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

// ---- Regularization ---------------------------------------------------------

type Punches = { punchInAt: Date | null; punchOutAt: Date | null };
type RegFields = { fromDate: string; startTime: string | null; endTime: string | null };

/** The day's punches once a regularization is applied (times given replace, others stay). */
export function regularizedPunches(record: Punches | null, v: RegFields): Punches {
  return {
    punchInAt: v.startTime ? istAt(v.fromDate, v.startTime) : (record?.punchInAt ?? null),
    punchOutAt: v.endTime ? istAt(v.fromDate, v.endTime) : (record?.punchOutAt ?? null),
  };
}

export function checkRegularization(record: Punches | null, v: RegFields): string | null {
  if (!v.startTime && !record?.punchInAt) return "There's no punch-in on that day. Add the punch-in time too.";
  const p = regularizedPunches(record, v);
  if (p.punchInAt && p.punchOutAt && p.punchOutAt <= p.punchInAt) return "Punch-out must be after punch-in.";
  return null;
}

// ---- Requests entered by HR on someone's behalf ------------------------------

/**
 * Rewords a rule message written to the requester ("You joined on…", "Clashes with your…")
 * so it reads correctly when HR enters the request for `name`.
 */
export function speakAbout(message: string, name: string): string {
  return message
    .replace(/\bYou've\b/g, `${name} has`)
    .replace(/\bYou\b/g, name)
    .replace(/\b[Yy]our\b/g, `${name}'s`);
}

const ENTERED_NOUN: Record<RequestTypeKey, string> = { LEAVE: "leave", WFH: "work from home", PERMISSION: "a permission", ON_DUTY: "on duty", REGULARIZATION: "a punch fix" };

/** The employee's bell/email title when HR records a request for them. */
export function enteredNoticeTitle(type: RequestTypeKey, approved: boolean): string {
  return approved ? `HR recorded ${ENTERED_NOUN[type]} for you` : `HR raised a ${REQUEST_TYPE_META[type].label.toLowerCase()} request for you`;
}
