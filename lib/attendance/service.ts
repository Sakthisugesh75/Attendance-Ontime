import "server-only";
import type { AttendanceRecord, AttendanceStatus, HalfDaySession, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { addDays, dbToYmd, hhmmToMinutes, istDate, istMinutes, weekdayOf, ymdToDb } from "@/lib/time";
import { computeDayStatus, type DayInput, type DayResult } from "./compute-status";
import { isWeeklyOff, type WeeklyOffPattern, type WeeklyOffRuleLike } from "./weekly-off";

const shiftInclude = { days: true } as const;
type ShiftWithDays = Prisma.ShiftGetPayload<{ include: typeof shiftInclude }>;

/** Everything needed to compute days for a set of employees over a date range, loaded in a few queries. */
export interface AttendanceContext {
  employees: Map<number, CtxEmployee>;
  defaultShift: ShiftWithDays | null;
  shifts: Map<number, ShiftWithDays>;
  rules: WeeklyOffRuleLike[];
  holidays: Map<string, string>;
  requests: CtxRequest[];
  records: Map<string, AttendanceRecord>;
}

interface CtxEmployee {
  id: number;
  joiningDate: string;
  exitDate: string | null;
  assignments: { shiftId: number; from: string; to: string | null }[];
  /** Current department / designation: pick their own weekly-off rule, if any */
  departmentId?: number | null;
  designationId?: number | null;
}

interface CtxRequest {
  employeeId: number;
  type: "LEAVE" | "WFH" | "PERMISSION" | "ON_DUTY";
  from: string;
  to: string;
  halfDay: HalfDaySession | null;
  startTime: string | null;
  endTime: string | null;
}

const recordKey = (employeeId: number, ymd: string) => `${employeeId}:${ymd}`;

export async function loadContext(employeeIds: number[], from: string, to: string): Promise<AttendanceContext> {
  const [employees, shifts, rules, holidays, requests, records] = await Promise.all([
    prisma.employee.findMany({
      where: { id: { in: employeeIds } },
      select: { id: true, joiningDate: true, exitDate: true, departmentId: true, designationId: true, shifts: { orderBy: { effectiveFrom: "asc" } } },
    }),
    prisma.shift.findMany({ include: shiftInclude }),
    prisma.weeklyOffRule.findMany(),
    prisma.holiday.findMany({ where: { date: { gte: ymdToDb(from), lte: ymdToDb(to) } } }),
    prisma.attendanceRequest.findMany({
      where: {
        employeeId: { in: employeeIds },
        status: { in: ["APPROVED", "CANCEL_REQUESTED"] },
        type: { in: ["LEAVE", "WFH", "PERMISSION", "ON_DUTY"] },
        fromDate: { lte: ymdToDb(to) },
        toDate: { gte: ymdToDb(from) },
      },
    }),
    prisma.attendanceRecord.findMany({
      where: { employeeId: { in: employeeIds }, date: { gte: ymdToDb(from), lte: ymdToDb(to) } },
    }),
  ]);

  return {
    employees: new Map(
      employees.map((e) => [
        e.id,
        {
          id: e.id,
          joiningDate: dbToYmd(e.joiningDate),
          exitDate: e.exitDate ? dbToYmd(e.exitDate) : null,
          assignments: e.shifts.map((s) => ({ shiftId: s.shiftId, from: dbToYmd(s.effectiveFrom), to: s.effectiveTo ? dbToYmd(s.effectiveTo) : null })),
          departmentId: e.departmentId,
          designationId: e.designationId,
        },
      ]),
    ),
    defaultShift: shifts.find((s) => s.isDefault) ?? shifts[0] ?? null,
    shifts: new Map(shifts.map((s) => [s.id, s])),
    rules: rules.map((r) => ({
      shiftId: r.shiftId,
      departmentId: r.departmentId,
      designationId: r.designationId,
      inherit: r.inherit,
      effectiveFrom: dbToYmd(r.effectiveFrom),
      pattern: r.pattern as WeeklyOffPattern,
      customOffDates: (r.customOffDates as string[] | null) ?? null,
      customWorkDates: (r.customWorkDates as string[] | null) ?? null,
    })),
    holidays: new Map(holidays.map((h) => [dbToYmd(h.date), h.name])),
    requests: requests.map((r) => ({
      employeeId: r.employeeId,
      type: r.type as CtxRequest["type"],
      from: dbToYmd(r.fromDate),
      to: dbToYmd(r.toDate),
      halfDay: r.halfDay,
      startTime: r.startTime,
      endTime: r.endTime,
    })),
    records: new Map(records.map((r) => [recordKey(r.employeeId, dbToYmd(r.date)), r])),
  };
}

/** The shift in force for an employee on a date (assignment history, then the default shift). */
export function shiftFor(ctx: AttendanceContext, employeeId: number, ymd: string): ShiftWithDays | null {
  const emp = ctx.employees.get(employeeId);
  const a = emp?.assignments.filter((x) => x.from <= ymd && (!x.to || x.to >= ymd)).at(-1);
  return (a && ctx.shifts.get(a.shiftId)) ?? ctx.defaultShift;
}

export interface DayView extends DayResult {
  date: string;
  holiday: string | null;
  weeklyOff: boolean;
  record: AttendanceRecord | null;
  /** Expected shift timing in minutes since midnight */
  timing: DayInput["timing"];
}

/** Computes one employee-day from a loaded context. `now` decides whether the day is over. */
export function computeFromContext(ctx: AttendanceContext, employeeId: number, ymd: string, now = new Date()): DayView {
  const emp = ctx.employees.get(employeeId);
  if (!emp) throw new Error(`Employee ${employeeId} not in context`);
  const shift = shiftFor(ctx, employeeId, ymd);
  const sd = shift?.days.find((d) => d.weekday === weekdayOf(ymd));
  const timing = sd
    ? { start: hhmmToMinutes(sd.startTime), end: hhmmToMinutes(sd.endTime), fullDayMinutes: sd.fullDayMinutes ?? shift!.fullDayMinutes }
    : null;
  const record = ctx.records.get(recordKey(employeeId, ymd)) ?? null;
  const today = istDate(now);
  const holiday = ctx.holidays.get(ymd) ?? null;
  const weeklyOff = isWeeklyOff(ctx.rules, ymd, { shiftId: shift?.id ?? null, departmentId: emp.departmentId, designationId: emp.designationId });

  const reqs = ctx.requests.filter((r) => r.employeeId === employeeId && r.from <= ymd && r.to >= ymd);
  const leave = reqs.find((r) => r.type === "LEAVE");
  const permission = reqs.find((r) => r.type === "PERMISSION" && r.startTime && r.endTime);

  const input: DayInput = {
    date: ymd,
    joiningDate: emp.joiningDate,
    exitDate: emp.exitDate,
    holiday,
    weeklyOff,
    timing,
    rules: {
      graceMinutes: shift?.graceMinutes ?? 15,
      halfDayMinutes: shift?.halfDayMinutes ?? 240,
      earlyLeaveMinutes: shift?.earlyLeaveMinutes ?? 15,
      overtimeAfterMinutes: shift?.overtimeAfterMinutes ?? 30,
    },
    punchIn: record?.punchInAt ? istMinutes(record.punchInAt, ymd) : null,
    punchOut: record?.punchOutAt ? istMinutes(record.punchOutAt, ymd) : null,
    approved: {
      leave: leave ? (leave.halfDay ?? "FULL") : null,
      wfh: reqs.some((r) => r.type === "WFH"),
      onDuty: reqs.some((r) => r.type === "ON_DUTY"),
      permission: permission ? { start: hhmmToMinutes(permission.startTime!), end: hhmmToMinutes(permission.endTime!) } : null,
    },
    override: record?.statusOverride ?? null,
    dayOver: ymd < today,
    nowMinutes: ymd === today ? istMinutes(now, ymd) : undefined,
  };
  return { ...computeDayStatus(input), date: ymd, holiday, weeklyOff, record, timing };
}

/** Recomputes and stores one employee-day. Creates the record only when there is something to store. */
export async function recomputeDay(employeeId: number, ymd: string, opts: { dayOver?: boolean } = {}) {
  const ctx = await loadContext([employeeId], ymd, ymd);
  // The end-of-day job runs at 23:59, so it treats "today" as over.
  const now = opts.dayOver ? new Date(Date.now() + 24 * 60 * 60 * 1000) : new Date();
  const view = computeFromContext(ctx, employeeId, ymd, now);
  return saveDay(employeeId, ymd, view);
}

async function saveDay(employeeId: number, ymd: string, view: DayView) {
  const data = {
    status: view.status,
    workedMinutes: view.workedMinutes,
    lateMinutes: view.lateMinutes,
    earlyLeaveMinutes: view.earlyLeaveMinutes,
    overtimeMinutes: view.overtimeMinutes,
    flags: view.flags.length ? view.flags : undefined,
  };
  if (view.record) {
    return prisma.attendanceRecord.update({ where: { id: view.record.id }, data: { ...data, flags: view.flags } });
  }
  // Nothing to store for open days or days outside employment.
  if (view.status === null || view.status === "NOT_JOINED" || view.status === "EXITED") return null;
  return prisma.attendanceRecord.create({ data: { employeeId, date: ymdToDb(ymd), source: "WEB", ...data } });
}

/**
 * End-of-day job: stores a final status for every employee employed on `ymd`
 * (absent, holiday, weekly off …) and returns the ones left with an open punch.
 */
export async function closeDay(ymd: string): Promise<{ processed: number; missingPunchOut: number[] }> {
  const employees = await prisma.employee.findMany({
    where: { deletedAt: null, joiningDate: { lte: ymdToDb(ymd) }, OR: [{ exitDate: null }, { exitDate: { gte: ymdToDb(ymd) } }] },
    select: { id: true },
  });
  const ids = employees.map((e) => e.id);
  const ctx = await loadContext(ids, ymd, ymd);
  const after = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const missingPunchOut: number[] = [];
  for (const id of ids) {
    const view = computeFromContext(ctx, id, ymd, after);
    await saveDay(id, ymd, view);
    if (view.status === "MISSING_PUNCH_OUT") missingPunchOut.push(id);
  }
  return { processed: ids.length, missingPunchOut };
}

/** Day-by-day view of a month for one employee, without writing anything. */
export async function monthView(employeeId: number, dates: string[]): Promise<DayView[]> {
  if (!dates.length) return [];
  const ctx = await loadContext([employeeId], dates[0]!, dates.at(-1)!);
  const now = new Date();
  return dates.map((d) => computeFromContext(ctx, employeeId, d, now));
}

export const PRESENT_LIKE: AttendanceStatus[] = ["PRESENT", "LATE", "HALF_DAY", "WFH", "ON_DUTY", "PERMISSION"];

/**
 * Re-stores every past day in [from, to] for one employee after something that changes
 * the result (joining/exit dates, shift). Days that never had a record and are still
 * open are left alone; the end-of-day job creates those.
 */
export async function recomputeRange(employeeId: number, from: string, to: string) {
  const today = istDate();
  const end = to < today ? to : addDays(today, -1);
  if (from > end) return;
  const ctx = await loadContext([employeeId], from, end);
  const after = new Date(Date.now() + 24 * 60 * 60 * 1000);
  for (let d = from; d <= end; d = addDays(d, 1)) {
    await saveDay(employeeId, d, computeFromContext(ctx, employeeId, d, after));
  }
}
