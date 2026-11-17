import "server-only";
import { ruleInForce, type WeeklyOffPattern } from "@/lib/attendance/weekly-off";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { dbToYmd, istDate } from "@/lib/time";
import { describePattern, detectPolicy } from "@/lib/validations/settings";

/** View models for each settings tab; only the open tab's data is loaded. */

export async function companyData() {
  return (await getSettings("company")).company;
}

export async function workingWeekData() {
  const today = istDate();
  const rows = await prisma.weeklyOffRule.findMany({ orderBy: { effectiveFrom: "desc" }, include: { shift: { select: { name: true } } } });
  const rules = rows.map((r) => {
    const pattern = r.pattern as WeeklyOffPattern;
    return {
      id: r.id,
      shiftId: r.shiftId,
      shiftName: r.shift?.name ?? null,
      effectiveFrom: dbToYmd(r.effectiveFrom),
      pattern,
      policy: detectPolicy(pattern),
      label: describePattern(pattern),
      customOffDates: (r.customOffDates as string[] | null) ?? [],
      customWorkDates: (r.customWorkDates as string[] | null) ?? [],
    };
  });
  const company = rules.filter((r) => r.shiftId === null);
  const current = ruleInForce(company, today, null);
  const holidays = await prisma.holiday.findMany({
    where: { date: { gte: new Date(`${today.slice(0, 4)}-01-01T00:00:00.000Z`) } },
    select: { date: true, name: true },
    orderBy: { date: "asc" },
  });
  return {
    today,
    rules: company,
    shiftRules: rules.filter((r) => r.shiftId !== null),
    currentId: current?.id ?? null,
    holidays: holidays.map((h) => ({ date: dbToYmd(h.date), name: h.name })),
  };
}
export type WorkingWeekData = Awaited<ReturnType<typeof workingWeekData>>;

export async function shiftsData() {
  const today = new Date(`${istDate()}T00:00:00.000Z`);
  const shifts = await prisma.shift.findMany({
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    include: {
      days: { orderBy: { weekday: "asc" } },
      _count: { select: { assignments: true } },
      assignments: { where: { effectiveFrom: { lte: today }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }], employee: { deletedAt: null } }, select: { employeeId: true } },
    },
  });
  return shifts.map((s) => ({
    id: s.id,
    name: s.name,
    isDefault: s.isDefault,
    graceMinutes: s.graceMinutes,
    fullDayMinutes: s.fullDayMinutes,
    halfDayMinutes: s.halfDayMinutes,
    earlyLeaveMinutes: s.earlyLeaveMinutes,
    overtimeAfterMinutes: s.overtimeAfterMinutes,
    days: s.days.map((d) => ({ weekday: d.weekday, startTime: d.startTime, endTime: d.endTime, fullDayMinutes: d.fullDayMinutes })),
    assignments: s._count.assignments,
    currentEmployees: new Set(s.assignments.map((a) => a.employeeId)).size,
  }));
}
export type ShiftRow = Awaited<ReturnType<typeof shiftsData>>[number];

export async function leaveTypesData() {
  const year = Number(istDate().slice(0, 4));
  const [types, balances, activeEmployees, rules, designations, employees] = await Promise.all([
    prisma.leaveType.findMany({ orderBy: [{ isActive: "desc" }, { code: "asc" }], include: { _count: { select: { requests: true } } } }),
    prisma.leaveBalance.groupBy({ by: ["year"], _count: { _all: true }, where: { year: { in: [year, year + 1] } } }),
    prisma.employee.count({ where: { deletedAt: null, status: { not: "EXITED" } } }),
    prisma.leaveQuotaRule.findMany({
      include: { leaveType: { select: { code: true, name: true } }, designation: { select: { name: true, employees: { where: { deletedAt: null, status: { not: "EXITED" } }, select: { id: true } } } }, employee: { select: { fullName: true, code: true, deletedAt: true } } },
    }),
    prisma.designation.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, employees: { where: { deletedAt: null, status: { not: "EXITED" } }, select: { id: true } } } }),
    prisma.employee.findMany({ where: { deletedAt: null, status: { not: "EXITED" } }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, code: true, designation: { select: { name: true } } } }),
  ]);
  return {
    year,
    activeEmployees,
    allocated: Object.fromEntries(balances.map((b) => [b.year, b._count._all])) as Record<number, number>,
    types: types.map((t) => ({
      id: t.id,
      code: t.code,
      name: t.name,
      yearlyQuota: Number(t.yearlyQuota),
      isPaid: t.isPaid,
      carryForward: t.carryForward,
      maxCarryForward: Number(t.maxCarryForward),
      isActive: t.isActive,
      requests: t._count.requests,
    })),
    /** Custom quotas: people first, then designations, each by name. */
    rules: rules
      .filter((r) => !r.employee?.deletedAt)
      .map((r) => ({
        id: r.id,
        leaveTypeId: r.leaveTypeId,
        leaveCode: r.leaveType.code,
        leaveName: r.leaveType.name,
        appliesTo: r.employeeId ? ("employee" as const) : ("designation" as const),
        targetId: (r.employeeId ?? r.designationId)!,
        targetName: r.employee?.fullName ?? r.designation?.name ?? "—",
        detail: r.employee ? r.employee.code : `${r.designation?.employees.length ?? 0} employee${r.designation?.employees.length === 1 ? "" : "s"}`,
        yearlyQuota: Number(r.yearlyQuota),
      }))
      .sort((a, b) => (a.appliesTo === b.appliesTo ? a.targetName.localeCompare(b.targetName) || a.leaveCode.localeCompare(b.leaveCode) : a.appliesTo === "employee" ? -1 : 1)),
    designations: designations.map((d) => ({ id: d.id, name: d.name, employees: d.employees.length })),
    employees: employees.map((e) => ({ id: e.id, name: e.fullName, code: e.code, designation: e.designation?.name ?? null })),
  };
}
export type LeaveTypesData = Awaited<ReturnType<typeof leaveTypesData>>;
export type LeaveTypeRow = LeaveTypesData["types"][number];
export type QuotaRuleRow = LeaveTypesData["rules"][number];

export async function policiesData() {
  return (await getSettings("caps")).caps;
}

export async function punchingData() {
  return getSettings("geofence", "punch");
}

export async function organisationData() {
  const [departments, designations] = await Promise.all([
    prisma.department.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { employees: true } }, employees: { where: { deletedAt: null }, select: { id: true } } } }),
    prisma.designation.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { employees: true } }, employees: { where: { deletedAt: null }, select: { id: true } } } }),
  ]);
  const map = (rows: typeof departments) => rows.map((r) => ({ id: r.id, name: r.name, employees: r.employees.length, references: r._count.employees }));
  return { departments: map(departments), designations: map(designations) };
}
export type LookupRow = Awaited<ReturnType<typeof organisationData>>["departments"][number];
