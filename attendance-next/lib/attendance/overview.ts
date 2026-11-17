import "server-only";
import type { AttendanceStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { addDays, istDate, istMinutes, monthDates, weekdayOf, ymdToDb } from "@/lib/time";
import { computeFromContext, loadContext, type DayView } from "./service";

/** Statuses that mean the person worked (in office, remote or on duty). */
const WORKED: AttendanceStatus[] = ["PRESENT", "LATE", "HALF_DAY", "WFH", "ON_DUTY", "PERMISSION", "MISSING_PUNCH_OUT"];
/** Days nobody is expected to work. */
const NOT_EXPECTED: AttendanceStatus[] = ["HOLIDAY", "WEEKLY_OFF", "NOT_JOINED", "EXITED"];

export const MIX_KEYS = ["LEAVE", "HALF_DAY", "WFH", "ON_DUTY", "ABSENT", "PERMISSION"] as const;
export type MixKey = (typeof MIX_KEYS)[number];

export interface TrendPoint {
  date: string;
  day: number;
  present: number;
  late: number;
  expected: number;
  off: boolean;
}

export interface Overview {
  month: string;
  /** Last date included ("so far" for the current month) */
  until: string;
  employees: number;
  stats: {
    avgInMinutes: number | null;
    punctualityPct: number | null;
    avgWorkedMinutes: number | null;
    attendancePct: number | null;
    pendingApprovals: number;
  };
  trend: TrendPoint[];
  lateByEmployee: { id: number; name: string; count: number; minutes: number }[];
  mix: { key: MixKey; count: number }[];
  /** Average hours worked per day, for completed punches */
  hours: { date: string; avgMinutes: number | null; people: number; off: boolean; future: boolean }[];
  attention: {
    missingPunchOut: { id: number; name: string; date: string }[];
    repeatedLate: { id: number; name: string; weekStart: string; count: number }[];
    overCap: { id: number; name: string; kind: "WFH" | "PERMISSION"; count: number; cap: number }[];
  };
}

const mondayOf = (ymd: string) => addDays(ymd, -((weekdayOf(ymd) + 6) % 7));

/**
 * Organisation-wide numbers for one month (up to today for the current month).
 * `ids` limits everything to the employees in the viewer's reach (null = everyone).
 */
export async function monthOverview(month: string, ids: number[] | null = null, now = new Date()): Promise<Overview> {
  const today = istDate(now);
  const all = monthDates(month);
  const start = all[0]!;
  const end = all.at(-1)!;
  const until = end < today ? end : today;
  const past = all.filter((d) => d <= until);

  const [employees, caps, pendingApprovals] = await Promise.all([
    prisma.employee.findMany({
      where: { deletedAt: null, ...(ids && { id: { in: ids } }), joiningDate: { lte: ymdToDb(end) }, OR: [{ exitDate: null }, { exitDate: { gte: ymdToDb(start) } }] },
      select: { id: true, fullName: true },
      orderBy: { fullName: "asc" },
    }),
    getSetting("caps"),
    prisma.attendanceRequest.count({ where: { status: { in: ["PENDING", "CANCEL_REQUESTED"] }, ...(ids && { employeeId: { in: ids } }) } }),
  ]);
  const ctx = employees.length ? await loadContext(employees.map((e) => e.id), start, end) : null;

  // One computed view per employee-day, the same rules as everywhere else.
  const views = new Map<number, DayView[]>();
  for (const e of employees) views.set(e.id, ctx ? past.map((d) => computeFromContext(ctx, e.id, d, now)) : []);
  const everyDay = [...views.values()].flat();

  const withIn = everyDay.filter((v) => v.record?.punchInAt && v.status && WORKED.includes(v.status) && !v.holiday && !v.weeklyOff);
  const complete = everyDay.filter((v) => v.record?.punchInAt && v.record?.punchOutAt && v.workedMinutes > 0);
  const expected = everyDay.filter((v) => v.status && !NOT_EXPECTED.includes(v.status));
  const worked = expected.filter((v) => WORKED.includes(v.status!));

  const trend: TrendPoint[] = all.map((date) => {
    const day = everyDay.filter((v) => v.date === date);
    const anyOff = day.length > 0 && day.every((v) => v.status === "HOLIDAY" || v.status === "WEEKLY_OFF" || v.status === "NOT_JOINED" || v.status === "EXITED");
    return {
      date,
      day: Number(date.slice(8)),
      present: day.filter((v) => v.status && WORKED.includes(v.status)).length,
      late: day.filter((v) => v.lateMinutes > 0).length,
      expected: day.filter((v) => v.status && !NOT_EXPECTED.includes(v.status)).length,
      off: anyOff,
    };
  });

  const lateByEmployee = employees
    .map((e) => {
      const late = (views.get(e.id) ?? []).filter((v) => v.lateMinutes > 0);
      return { id: e.id, name: e.fullName, count: late.length, minutes: late.reduce((s, v) => s + v.lateMinutes, 0) };
    })
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count || b.minutes - a.minutes);

  const mix = MIX_KEYS.map((key) => ({ key, count: everyDay.filter((v) => v.status === key).length }));

  const hours = all.map((date) => {
    const done = complete.filter((v) => v.date === date && !v.holiday && !v.weeklyOff);
    const day = trend.find((t) => t.date === date)!;
    return {
      date,
      avgMinutes: done.length ? Math.round(done.reduce((s, v) => s + v.workedMinutes, 0) / done.length) : null,
      people: done.length,
      off: day.off,
      future: date > until,
    };
  });

  // Needs attention
  const missingPunchOut: Overview["attention"]["missingPunchOut"] = [];
  const repeatedLate: Overview["attention"]["repeatedLate"] = [];
  const overCap: Overview["attention"]["overCap"] = [];
  for (const e of employees) {
    const days = views.get(e.id) ?? [];
    for (const v of days) if (v.status === "MISSING_PUNCH_OUT") missingPunchOut.push({ id: e.id, name: e.fullName, date: v.date });
    const weeks = new Map<string, number>();
    for (const v of days) if (v.lateMinutes > 0) weeks.set(mondayOf(v.date), (weeks.get(mondayOf(v.date)) ?? 0) + 1);
    for (const [weekStart, count] of weeks) if (count >= 3) repeatedLate.push({ id: e.id, name: e.fullName, weekStart, count });
    const wfh = days.filter((v) => v.status === "WFH").length;
    const permission = days.filter((v) => v.status === "PERMISSION").length;
    if (wfh > caps.wfhPerMonth) overCap.push({ id: e.id, name: e.fullName, kind: "WFH", count: wfh, cap: caps.wfhPerMonth });
    if (permission > caps.permissionPerMonth) overCap.push({ id: e.id, name: e.fullName, kind: "PERMISSION", count: permission, cap: caps.permissionPerMonth });
  }
  missingPunchOut.sort((a, b) => b.date.localeCompare(a.date));
  repeatedLate.sort((a, b) => b.weekStart.localeCompare(a.weekStart) || b.count - a.count);

  const onTime = withIn.filter((v) => v.lateMinutes === 0);
  return {
    month,
    until,
    employees: employees.length,
    stats: {
      avgInMinutes: withIn.length ? Math.round(withIn.reduce((s, v) => s + istMinutes(v.record!.punchInAt!, v.date), 0) / withIn.length) : null,
      punctualityPct: withIn.length ? Math.round((onTime.length / withIn.length) * 100) : null,
      avgWorkedMinutes: complete.length ? Math.round(complete.reduce((s, v) => s + v.workedMinutes, 0) / complete.length) : null,
      attendancePct: expected.length ? Math.round((worked.length / expected.length) * 100) : null,
      pendingApprovals,
    },
    trend,
    lateByEmployee,
    mix,
    hours,
    attention: { missingPunchOut, repeatedLate, overCap },
  };
}
