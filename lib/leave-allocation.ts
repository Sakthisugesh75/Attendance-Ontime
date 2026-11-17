import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Who gets how much paid leave, and what carries over (one source for balances, approvals and
 * the yearly allocation).
 *
 * Quota precedence: the employee's own rule > their designation's rule > the leave type's yearly quota.
 * Carry forward: last year's unused days (allotted + carried − used), capped at the type's
 * maximum. A year with no balance row counts as untouched: its whole allotment was unused. So a new
 * year's balance is right even if nobody pressed "Allocate balances".
 */

export type QuotaRule = { leaveTypeId: number; designationId: number | null; employeeId: number | null; yearlyQuota: number };
export type LeaveTypeInfo = { id: number; yearlyQuota: number; carryForward: boolean; maxCarryForward: number };
export type EmployeeInfo = { id: number; designationId: number | null; joiningYear: number };
export type BalanceFigures = { allotted: number; carriedForward: number; used: number };
export type QuotaSource = "person" | "designation" | "default";

/** How far back an untouched history is replayed (carry forward is capped, so older years never matter). */
const MAX_LOOKBACK = 10;
const round1 = (n: number) => Math.round(n * 10) / 10;

export function quotaFor(type: LeaveTypeInfo, emp: Pick<EmployeeInfo, "id" | "designationId">, rules: QuotaRule[]): { quota: number; source: QuotaSource } {
  const mine = rules.filter((r) => r.leaveTypeId === type.id);
  const person = mine.find((r) => r.employeeId === emp.id);
  if (person) return { quota: person.yearlyQuota, source: "person" };
  const role = emp.designationId !== null ? mine.find((r) => r.employeeId === null && r.designationId === emp.designationId) : undefined;
  if (role) return { quota: role.yearlyQuota, source: "designation" };
  return { quota: type.yearlyQuota, source: "default" };
}

/**
 * The allotment and carry forward for `year`. `row(y)` returns the stored balance for year y, if any.
 * Stored rows are trusted as they are (HR may have adjusted them); missing years are worked out.
 */
export function planBalance(
  type: LeaveTypeInfo,
  emp: EmployeeInfo,
  rules: QuotaRule[],
  year: number,
  row: (year: number) => BalanceFigures | undefined,
): { allotted: number; carriedForward: number } {
  const allotted = quotaFor(type, emp, rules).quota;
  const prevYear = year - 1;
  if (!type.carryForward || prevYear < emp.joiningYear) return { allotted, carriedForward: 0 };
  const prev =
    row(prevYear) ??
    // Beyond the look-back window an untouched year is assumed full (the cap was reached long ago).
    (year - emp.joiningYear > MAX_LOOKBACK
      ? { allotted: quotaFor(type, emp, rules).quota, carriedForward: type.maxCarryForward, used: 0 }
      : { ...planBalance(type, emp, rules, prevYear, row), used: 0 });
  const unused = Math.max(0, prev.allotted + prev.carriedForward - prev.used);
  return { allotted, carriedForward: round1(Math.min(unused, type.maxCarryForward)) };
}

type Db = Prisma.TransactionClient | typeof prisma;

/** Everything `planBalance` needs for some employees and a target year, in four queries. */
export async function loadAllocation(db: Db, employeeIds: number[], year: number) {
  const [types, rules, employees, balances] = await Promise.all([
    db.leaveType.findMany(),
    db.leaveQuotaRule.findMany(),
    db.employee.findMany({ where: { id: { in: employeeIds } }, select: { id: true, designationId: true, joiningDate: true } }),
    db.leaveBalance.findMany({ where: { employeeId: { in: employeeIds }, year: { gte: year - MAX_LOOKBACK - 1, lte: year } } }),
  ]);
  const typeInfo = new Map(types.map((t) => [t.id, { id: t.id, yearlyQuota: Number(t.yearlyQuota), carryForward: t.carryForward, maxCarryForward: Number(t.maxCarryForward) }]));
  const empInfo = new Map(employees.map((e) => [e.id, { id: e.id, designationId: e.designationId, joiningYear: e.joiningDate.getUTCFullYear() }]));
  const ruleList: QuotaRule[] = rules.map((r) => ({ leaveTypeId: r.leaveTypeId, designationId: r.designationId, employeeId: r.employeeId, yearlyQuota: Number(r.yearlyQuota) }));
  const rows = new Map(balances.map((b) => [`${b.employeeId}:${b.leaveTypeId}:${b.year}`, { id: b.id, allotted: Number(b.allotted), carriedForward: Number(b.carriedForward), used: Number(b.used) }]));
  const stored = (employeeId: number, leaveTypeId: number, y: number) => rows.get(`${employeeId}:${leaveTypeId}:${y}`);

  return {
    rules: ruleList,
    stored,
    /** Planned allotment + carry forward (ignores any stored row for `y` itself). */
    plan(employeeId: number, leaveTypeId: number, y = year) {
      const t = typeInfo.get(leaveTypeId);
      const e = empInfo.get(employeeId);
      if (!t || !e) return { allotted: 0, carriedForward: 0 };
      return planBalance(t, e, ruleList, y, (py) => stored(employeeId, leaveTypeId, py));
    },
    /** The stored row for `y` if there is one, otherwise the plan with nothing used. */
    figures(employeeId: number, leaveTypeId: number, y = year): BalanceFigures {
      return stored(employeeId, leaveTypeId, y) ?? { ...this.plan(employeeId, leaveTypeId, y), used: 0 };
    },
    quota(employeeId: number, leaveTypeId: number) {
      const t = typeInfo.get(leaveTypeId);
      const e = empInfo.get(employeeId);
      return t && e ? quotaFor(t, e, ruleList) : { quota: 0, source: "default" as QuotaSource };
    },
  };
}
