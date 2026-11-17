import "server-only";
import type { AttendanceStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatTime, istDate, istMinutes, monthDates, ymdToDb } from "@/lib/time";
import { computeFromContext, loadContext, monthView, type DayView } from "./service";

/** Serializable day for client components. */
export interface CalendarDay {
  date: string;
  status: AttendanceStatus | null;
  holiday: string | null;
  weeklyOff: boolean;
  inTime: string | null;
  outTime: string | null;
  workedMinutes: number;
  lateMinutes: number;
  isToday: boolean;
  isFuture: boolean;
}

export interface TodayInfo {
  date: string;
  status: AttendanceStatus | null;
  holiday: string | null;
  weeklyOff: boolean;
  /** ISO instants, so the client can tick "hours so far" live */
  punchInAt: string | null;
  punchOutAt: string | null;
  workedMinutes: number;
  lateMinutes: number;
  /** Minutes since IST midnight */
  shiftStart: number | null;
  shiftEnd: number | null;
  expectedOut: number | null;
  graceMinutes: number;
}

export interface PersonalStats {
  avgInMinutes: number | null;
  avgWorkedMinutes: number | null;
  lateCount: number;
  presentDays: number;
  workingDaysSoFar: number;
}

const toCalendarDay = (v: DayView, today: string): CalendarDay => ({
  date: v.date,
  status: v.status,
  holiday: v.holiday,
  weeklyOff: v.weeklyOff,
  inTime: v.record?.punchInAt ? formatTime(v.record.punchInAt) : null,
  outTime: v.record?.punchOutAt ? formatTime(v.record.punchOutAt) : null,
  workedMinutes: v.workedMinutes,
  lateMinutes: v.lateMinutes,
  isToday: v.date === today,
  isFuture: v.date > today,
});

export async function employeeDashboard(employeeId: number, now = new Date()) {
  const today = istDate(now);
  const month = today.slice(0, 7);
  const days = await monthView(employeeId, monthDates(month));
  const todayView = days.find((d) => d.date === today)!;

  const shift = await prisma.shiftAssignment.findFirst({
    where: { employeeId, effectiveFrom: { lte: ymdToDb(today) }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: ymdToDb(today) } }] },
    orderBy: { effectiveFrom: "desc" },
    include: { shift: true },
  });
  const grace = shift?.shift.graceMinutes ?? 15;
  const timing = todayView.timing;
  const punchIn = todayView.record?.punchInAt ?? null;
  // Expected out: shift end, or later if a late start still needs the full day's hours.
  const expectedOut = timing ? Math.max(timing.end, punchIn ? istMinutes(punchIn, today) + timing.fullDayMinutes : timing.end) : null;

  const past = days.filter((d) => d.date < today);
  const withIn = past.filter((d) => d.record?.punchInAt && d.status && !["HOLIDAY", "WEEKLY_OFF"].includes(d.status));
  const complete = past.filter((d) => d.record?.punchInAt && d.record?.punchOutAt);
  const working = past.filter((d) => d.status && !["HOLIDAY", "WEEKLY_OFF", "NOT_JOINED", "EXITED"].includes(d.status));

  const stats: PersonalStats = {
    avgInMinutes: withIn.length ? Math.round(withIn.reduce((s, d) => s + istMinutes(d.record!.punchInAt!, d.date), 0) / withIn.length) : null,
    avgWorkedMinutes: complete.length ? Math.round(complete.reduce((s, d) => s + d.workedMinutes, 0) / complete.length) : null,
    lateCount: days.filter((d) => d.date <= today && d.lateMinutes > 0).length,
    presentDays: past.filter((d) => d.status && ["PRESENT", "LATE", "HALF_DAY", "WFH", "ON_DUTY", "PERMISSION"].includes(d.status)).length,
    workingDaysSoFar: working.length,
  };

  const todayInfo: TodayInfo = {
    date: today,
    status: todayView.status,
    holiday: todayView.holiday,
    weeklyOff: todayView.weeklyOff,
    punchInAt: punchIn?.toISOString() ?? null,
    punchOutAt: todayView.record?.punchOutAt?.toISOString() ?? null,
    workedMinutes: todayView.workedMinutes,
    lateMinutes: todayView.lateMinutes,
    shiftStart: timing?.start ?? null,
    shiftEnd: timing?.end ?? null,
    expectedOut,
    graceMinutes: grace,
  };

  return { today: todayInfo, month, calendar: days.map((d) => toCalendarDay(d, today)), stats };
}

export interface TeamMemberToday {
  id: number;
  name: string;
  code: string;
  department: string | null;
  status: AttendanceStatus | null;
  inTime: string | null;
  lateMinutes: number;
  /** For the live register strip: minutes since IST midnight. */
  inMin: number | null;
  outMin: number | null;
  shiftStart: number | null;
  shiftEnd: number | null;
}

/**
 * "Today at a glance": everyone employed today with their live status.
 * `ids` limits it to the employees in the viewer's reach (null = everyone).
 */
export async function teamToday(ids: number[] | null = null, now = new Date()) {
  const today = istDate(now);
  const employees = await prisma.employee.findMany({
    where: { deletedAt: null, ...(ids && { id: { in: ids } }), joiningDate: { lte: ymdToDb(today) }, OR: [{ exitDate: null }, { exitDate: { gte: ymdToDb(today) } }] },
    include: { department: true },
    orderBy: { fullName: "asc" },
  });
  const ctx = await loadContext(
    employees.map((e) => e.id),
    today,
    today,
  );
  const people: TeamMemberToday[] = employees.map((e) => {
    const v = computeFromContext(ctx, e.id, today, now);
    return {
      id: e.id,
      name: e.fullName,
      code: e.code,
      department: e.department?.name ?? null,
      status: v.status,
      inTime: v.record?.punchInAt ? formatTime(v.record.punchInAt) : null,
      lateMinutes: v.lateMinutes,
      inMin: v.record?.punchInAt ? istMinutes(v.record.punchInAt, today) : null,
      outMin: v.record?.punchOutAt ? istMinutes(v.record.punchOutAt, today) : null,
      shiftStart: v.timing?.start ?? null,
      shiftEnd: v.timing?.end ?? null,
    };
  });
  const inStatuses: AttendanceStatus[] = ["PRESENT", "LATE", "HALF_DAY", "PERMISSION"];
  return {
    date: today,
    nowMin: istMinutes(now, today),
    total: people.length,
    present: people.filter((p) => p.status && inStatuses.includes(p.status)),
    late: people.filter((p) => p.lateMinutes > 0),
    leave: people.filter((p) => p.status === "LEAVE"),
    wfh: people.filter((p) => p.status === "WFH" || p.status === "ON_DUTY"),
    notIn: people.filter((p) => p.status === null || p.status === "ABSENT"),
    off: people.filter((p) => p.status === "HOLIDAY" || p.status === "WEEKLY_OFF"),
  };
}
