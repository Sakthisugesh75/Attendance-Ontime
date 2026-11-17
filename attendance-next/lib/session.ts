import "server-only";
import type { Role } from "@prisma/client";
import { redirect } from "next/navigation";
import { cache } from "react";
import { accessOf, can, canAny, type Permission, type Scope } from "@/lib/access/permissions";
import { reachIds } from "@/lib/access/team";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type SessionUser = {
  id: number;
  name: string;
  email: string;
  role: Role;
  employeeId: number | null;
  isSuperAdmin: boolean;
  permissions: Permission[];
  scope: Scope;
  roleName: string;
  /** Has an employee record and is expected to send daily reports (own setting, else the role's switch). */
  writesReports: boolean;
};

/** Thrown by server actions when the caller may not do something. */
export class Forbidden extends Error {
  constructor(message = "You don't have permission to do that.") {
    super(message);
  }
}

/**
 * The signed-in user with their CURRENT access, read from the database once per request.
 * A role change, disabled sign-in or "sign out everywhere" takes effect on the next request,
 * not at the next sign-in. Returns null when there is no valid session.
 */
const currentUser = cache(async (): Promise<(SessionUser & { mustChangePassword: boolean }) | null> => {
  const session = await auth();
  if (!session?.user) return null;
  const row = await prisma.user.findUnique({
    where: { id: Number(session.user.id) },
    include: { accessRole: true, employee: { select: { id: true, fullName: true, deletedAt: true, reportRequired: true } } },
  });
  if (!row || !row.isActive || row.sessionVersion !== (session.user.sessionVersion ?? 0)) return null;
  const access = accessOf(row);
  return {
    id: row.id,
    name: row.employee?.fullName || row.name || row.email || "User",
    email: row.email ?? "",
    role: row.role,
    employeeId: row.employee && !row.employee.deletedAt ? row.employee.id : null,
    writesReports: !!row.employee && !row.employee.deletedAt && (row.employee.reportRequired ?? row.accessRole?.dailyReports ?? true),
    mustChangePassword: row.mustChangePassword,
    ...access,
  };
});

/** For pages: the signed-in user, or a redirect to /login. */
export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/change-password");
  return user;
}

/** For pages: the signed-in user holding at least one of `permissions`, or a redirect to the dashboard. */
export async function requirePermission(...permissions: Permission[]): Promise<SessionUser> {
  const user = await requireUser();
  if (permissions.length && !canAny(user, ...permissions)) redirect("/dashboard");
  return user;
}

/** For server actions and route handlers: the user (holding at least one of `permissions`) or a thrown Forbidden. */
export async function actionUser(...permissions: Permission[]): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) throw new Forbidden("Your session has ended. Sign in again.");
  if (permissions.length && !canAny(user, ...permissions)) throw new Forbidden();
  return user;
}

/** Same as actionUser, for route handlers that answer with a status code instead of throwing. */
export async function routeUser(...permissions: Permission[]): Promise<{ user: SessionUser } | { status: 401 | 403 }> {
  const user = await currentUser();
  if (!user) return { status: 401 };
  if (permissions.length && !canAny(user, ...permissions)) return { status: 403 };
  return { user };
}

export const hasPermission = (user: Pick<SessionUser, "isSuperAdmin" | "permissions">, permission: Permission) => can(user, permission);

/**
 * Which employees a user's permissions reach: null = everyone (scope ALL); otherwise a list of
 * employee ids: TEAM = themselves + everyone reporting to them, directly or through others;
 * SELF = only themselves. Add `id: { in: ids }` / `employeeId: { in: ids }` to queries when not null.
 */
export const scopeEmployeeIds = cache(async (user: Pick<SessionUser, "scope" | "employeeId" | "isSuperAdmin">): Promise<number[] | null> => {
  if (user.isSuperAdmin || user.scope !== "TEAM" || !user.employeeId) return reachIds(user, user.employeeId, []);
  const links = await prisma.employee.findMany({ where: { deletedAt: null }, select: { id: true, managerId: true } });
  return reachIds(user, user.employeeId, links);
});

/** True when the employee is within the user's reach. */
export async function canReachEmployee(user: Pick<SessionUser, "scope" | "employeeId" | "isSuperAdmin">, employeeId: number): Promise<boolean> {
  const ids = await scopeEmployeeIds(user);
  return ids === null || ids.includes(employeeId);
}

/** Prisma filter for employees in reach (spread into a where clause). */
export async function employeeScopeWhere(user: Pick<SessionUser, "scope" | "employeeId" | "isSuperAdmin">): Promise<{ id?: { in: number[] } }> {
  const ids = await scopeEmployeeIds(user);
  return ids === null ? {} : { id: { in: ids } };
}
