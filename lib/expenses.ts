import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasPermission, scopeEmployeeIds, type SessionUser } from "@/lib/session";
import { dbToYmd, monthDates } from "@/lib/time";
import type { ExpenseListParams, ExpenseStatusKey } from "@/lib/validations/expenses";

const claimInclude = {
  category: { select: { id: true, name: true } },
  employee: { select: { id: true, fullName: true, code: true, managerId: true, userId: true, designation: { select: { name: true } } } },
} satisfies Prisma.ExpenseClaimInclude;
type ClaimRecord = Prisma.ExpenseClaimGetPayload<{ include: typeof claimInclude }>;

function toRow(c: ClaimRecord) {
  return {
    id: c.id,
    employee: { id: c.employee.id, name: c.employee.fullName, code: c.employee.code, designation: c.employee.designation?.name ?? null },
    category: c.category.name,
    categoryId: c.category.id,
    expenseDate: dbToYmd(c.expenseDate),
    amount: Number(c.amount),
    description: c.description,
    hasReceipt: !!c.receiptPath,
    status: c.status as ExpenseStatusKey,
    manager: c.managerAt ? { name: c.managerByName ?? "", at: c.managerAt.toISOString(), comment: c.managerComment } : null,
    hr: c.hrAt ? { name: c.hrByName ?? "", at: c.hrAt.toISOString(), comment: c.hrComment } : null,
    paid: c.paidAt ? { name: c.paidByName ?? "", at: c.paidAt.toISOString(), ref: c.paymentRef } : null,
    createdAt: c.createdAt.toISOString(),
  };
}
export type ClaimRow = ReturnType<typeof toRow>;

const monthWhere = (month?: string): Prisma.ExpenseClaimWhereInput => {
  if (!month) return {};
  const days = monthDates(month);
  return { expenseDate: { gte: new Date(`${days[0]}T00:00:00Z`), lte: new Date(`${days.at(-1)}T00:00:00Z`) } };
};

function statusWhere(status: ExpenseListParams["status"], open: ExpenseStatusKey[]): Prisma.ExpenseClaimWhereInput {
  if (status === "ALL") return {};
  if (status === "OPEN") return { status: { in: open } };
  return { status };
}

/** Categories for the claim form and the settings panel. */
export async function expenseCategories(activeOnly = true) {
  const rows = await prisma.expenseCategory.findMany({
    where: activeOnly ? { isActive: true } : {},
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    include: { limits: { include: { designation: { select: { name: true } } } }, _count: { select: { claims: true } } },
  });
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    defaultLimit: c.defaultLimit === null ? null : Number(c.defaultLimit),
    receiptRequired: c.receiptRequired,
    isActive: c.isActive,
    claims: c._count.claims,
    limits: c.limits.map((l) => ({ designationId: l.designationId, designation: l.designation.name, maxAmount: Number(l.maxAmount) })),
  }));
}
export type CategoryRow = Awaited<ReturnType<typeof expenseCategories>>[number];

export async function myClaims(employeeId: number, params: ExpenseListParams) {
  const rows = await prisma.expenseClaim.findMany({
    where: { employeeId, ...statusWhere(params.status, ["PENDING_MANAGER", "PENDING_HR", "APPROVED"]), ...monthWhere(params.month) },
    include: claimInclude,
    orderBy: [{ expenseDate: "desc" }, { id: "desc" }],
    take: 300,
  });
  return rows.map(toRow);
}

/**
 * Who may approve a claim right now:
 * - waiting for the manager: the employee's reporting manager, or anyone with expenses.manage
 *   (who then approves both steps);
 * - waiting for HR: expenses.manage. Nobody decides their own claim.
 */
export function canDecide(user: Pick<SessionUser, "employeeId" | "isSuperAdmin" | "permissions">, claim: { status: string; employee: { id: number; managerId: number | null } }, reach: number[] | null): boolean {
  if (claim.employee.id === user.employeeId) return false;
  const manages = hasPermission(user, "expenses.manage") && (reach === null || reach.includes(claim.employee.id));
  if (claim.status === "PENDING_MANAGER") return manages || (!!user.employeeId && claim.employee.managerId === user.employeeId);
  if (claim.status === "PENDING_HR") return manages;
  return false;
}

/** Can mark approved claims paid. */
export const canPay = (user: Pick<SessionUser, "isSuperAdmin" | "permissions">) => hasPermission(user, "expenses.manage");

/** Where clause for the claims an approver may see: their direct reports' claims, plus everyone in reach with expenses.manage. */
export async function approverScope(user: SessionUser): Promise<Prisma.ExpenseClaimWhereInput | null> {
  const ors: Prisma.ExpenseClaimWhereInput[] = [];
  if (hasPermission(user, "expenses.manage")) {
    const reach = await scopeEmployeeIds(user);
    // Everyone: no filter. (Prisma treats `{}` inside OR as "matches nothing", so never put it there.)
    if (reach === null) return {};
    ors.push({ employeeId: { in: reach } });
  }
  if (user.employeeId) ors.push({ employee: { managerId: user.employeeId } });
  return ors.length ? { OR: ors } : null;
}

/** True when the user approves for someone (has direct reports or expenses.manage). */
export async function isExpenseApprover(user: SessionUser): Promise<boolean> {
  if (hasPermission(user, "expenses.manage")) return true;
  return !!user.employeeId && (await prisma.employee.count({ where: { managerId: user.employeeId, deletedAt: null } })) > 0;
}

export async function approvalClaims(user: SessionUser, params: ExpenseListParams) {
  const scope = await approverScope(user);
  if (!scope) return { rows: [], waiting: 0, toPay: { count: 0, amount: 0 } };
  const manages = hasPermission(user, "expenses.manage");
  const open: ExpenseStatusKey[] = manages ? ["PENDING_MANAGER", "PENDING_HR", "APPROVED"] : ["PENDING_MANAGER"];
  const reach = manages ? await scopeEmployeeIds(user) : null;
  const notSelf: Prisma.ExpenseClaimWhereInput = user.employeeId ? { employeeId: { not: user.employeeId } } : {};
  const [rows, toPay] = await Promise.all([
    prisma.expenseClaim.findMany({
      where: { AND: [scope, notSelf, statusWhere(params.status, open), monthWhere(params.month)] },
      include: claimInclude,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 500,
    }),
    manages ? prisma.expenseClaim.aggregate({ where: { AND: [scope, notSelf, { status: "APPROVED" }] }, _count: true, _sum: { amount: true } }) : null,
  ]);
  const mapped = rows.map((c) => ({ ...toRow(c), canDecide: canDecide(user, c, reach) }));
  return {
    rows: mapped,
    waiting: mapped.filter((r) => r.canDecide).length,
    toPay: { count: toPay?._count ?? 0, amount: Number(toPay?._sum.amount ?? 0) },
  };
}

/** Claims waiting for this user's decision (for the nav badge / dashboard). */
export async function expenseWaitingCount(user: SessionUser): Promise<number> {
  const scope = await approverScope(user);
  if (!scope) return 0;
  const manages = hasPermission(user, "expenses.manage");
  const status: ExpenseStatusKey[] = manages ? ["PENDING_MANAGER", "PENDING_HR"] : ["PENDING_MANAGER"];
  return prisma.expenseClaim.count({ where: { AND: [scope, { status: { in: status } }, user.employeeId ? { employeeId: { not: user.employeeId } } : {}] } });
}

/** Designations, for per-designation limits. */
export const designationOptions = () => prisma.designation.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
