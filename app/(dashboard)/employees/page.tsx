import { EmployeesView } from "@/components/employees/employees-view";
import { employeeFormOptions, listEmployees } from "@/lib/employees";
import { prisma } from "@/lib/prisma";
import { hasPermission, requirePermission, scopeEmployeeIds } from "@/lib/session";
import { employeeListParams } from "@/lib/validations/employee";

export const metadata = { title: "Employees" };

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePermission("employees.view");
  const parsed = employeeListParams.parse(await searchParams);
  const reach = await scopeEmployeeIds(user);
  // The removed list is for people who manage the whole company.
  const canSeeRemoved = hasPermission(user, "employees.manage") && reach === null;
  const params = parsed.status === "REMOVED" && !canSeeRemoved ? { ...parsed, status: "ALL" as const } : parsed;
  const [list, options, departments] = await Promise.all([
    listEmployees(params, reach),
    employeeFormOptions(undefined, reach),
    prisma.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <EmployeesView
      list={list}
      params={params}
      options={options}
      departments={departments}
      canManage={hasPermission(user, "employees.manage")}
      canSeeRemoved={canSeeRemoved}
      canViewAttendance={hasPermission(user, "attendance.view")}
      access={{ canAssignRoles: hasPermission(user, "access.manage"), isSuperAdmin: user.isSuperAdmin, userId: user.id }}
    />
  );
}
