import "server-only";
import type { Prisma } from "@prisma/client";
import { computeFromContext, loadContext, type DayView } from "@/lib/attendance/service";
import { prisma } from "@/lib/prisma";
import { addDays, dbToYmd, istDate, istMinutes, ymdToDb } from "@/lib/time";
import type { DayFacts, EmployeeDays, EmployeeInfo } from "./types";

export interface DayFilters {
  from: string;
  to: string;
  department?: number | null;
  employees?: number[];
  /** Employees in the viewer's reach (null/undefined = everyone). Always narrows, never widens. */
  reach?: number[] | null;
}

/** Every date from `from` to `to` inclusive. */
export function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Employees employed at some point in [from, to], filtered, ordered by name. */
export async function employeesInRange(f: DayFilters): Promise<EmployeeInfo[]> {
  const where: Prisma.EmployeeWhereInput = {
    deletedAt: null,
    joiningDate: { lte: ymdToDb(f.to) },
    OR: [{ exitDate: null }, { exitDate: { gte: ymdToDb(f.from) } }],
  };
  if (f.department) where.departmentId = f.department;
  if (f.employees?.length) where.id = { in: f.employees };
  if (f.reach) where.AND = [{ id: { in: f.reach } }];
  const rows = await prisma.employee.findMany({
    where,
    select: { id: true, code: true, fullName: true, department: { select: { name: true } } },
    orderBy: [{ fullName: "asc" }, { code: "asc" }],
  });
  return rows.map((e) => ({ id: e.id, code: e.code, name: e.fullName, department: e.department?.name ?? null }));
}

type LeaveInfo = NonNullable<DayFacts["leave"]>;

/** Approved leave per employee-day, with its type (for paid / unpaid). */
async function leaveIndex(ids: number[], from: string, to: string): Promise<Map<string, LeaveInfo>> {
  const reqs = await prisma.attendanceRequest.findMany({
    where: {
      employeeId: { in: ids },
      type: "LEAVE",
      status: { in: ["APPROVED", "CANCEL_REQUESTED"] },
      fromDate: { lte: ymdToDb(to) },
      toDate: { gte: ymdToDb(from) },
    },
    select: { employeeId: true, fromDate: true, toDate: true, halfDay: true, leaveType: { select: { code: true, name: true, isPaid: true } } },
  });
  const map = new Map<string, LeaveInfo>();
  for (const r of reqs) {
    const start = dbToYmd(r.fromDate) < from ? from : dbToYmd(r.fromDate);
    const end = dbToYmd(r.toDate) > to ? to : dbToYmd(r.toDate);
    for (let d = start; d <= end; d = addDays(d, 1)) {
      map.set(`${r.employeeId}:${d}`, { code: r.leaveType?.code ?? null, name: r.leaveType?.name ?? null, paid: r.leaveType?.isPaid ?? true, half: r.halfDay !== null });
    }
  }
  return map;
}

/** DayView (service) -> DayFacts (plain, serialisable). */
export function toFacts(v: DayView, today: string, leave: LeaveInfo | null): DayFacts {
  const r = v.record;
  return {
    date: v.date,
    status: v.status,
    flags: v.flags,
    workedMinutes: v.workedMinutes,
    lateMinutes: v.lateMinutes,
    earlyLeaveMinutes: v.earlyLeaveMinutes,
    overtimeMinutes: v.overtimeMinutes,
    inMin: r?.punchInAt ? istMinutes(r.punchInAt, v.date) : null,
    outMin: r?.punchOutAt ? istMinutes(r.punchOutAt, v.date) : null,
    holiday: v.holiday,
    weeklyOff: v.weeklyOff,
    future: v.date > today,
    leave,
    remarks: r?.remarks ?? null,
    shiftStart: v.timing?.start ?? null,
    hasRecord: !!r,
    source: r?.source ?? null,
    overridden: !!r?.statusOverride,
  };
}

/**
 * Computes every employee-day in [from, to] with the same rules as the rest of the app
 * (loadContext + computeFromContext). Days after today are included and marked `future`.
 */
export async function loadEmployeeDays(f: DayFilters, now = new Date()): Promise<EmployeeDays[]> {
  const employees = await employeesInRange(f);
  if (!employees.length) return [];
  const ids = employees.map((e) => e.id);
  const today = istDate(now);
  const dates = datesBetween(f.from, f.to);
  const [ctx, leaves] = await Promise.all([loadContext(ids, f.from, f.to), leaveIndex(ids, f.from, f.to)]);
  return employees.map((employee) => ({
    employee,
    days: dates.map((d) => toFacts(computeFromContext(ctx, employee.id, d, now), today, leaves.get(`${employee.id}:${d}`) ?? null)),
  }));
}
