import { ReportsView } from "@/components/reports/reports-view";
import { prisma } from "@/lib/prisma";
import { PAGE_SIZE, parseReportParams } from "@/lib/reports/params";
import { runReport } from "@/lib/reports/run";
import { hasPermission, requirePermission, scopeEmployeeIds } from "@/lib/session";
import { istDate } from "@/lib/time";

export const metadata = { title: "Reports" };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePermission("reports.view");
  const reach = await scopeEmployeeIds(user);
  const today = istDate();
  const params = parseReportParams(await searchParams, today);
  const [result, departments, employees] = await Promise.all([
    runReport(params, reach),
    prisma.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.employee.findMany({
      where: { deletedAt: null, ...(reach && { id: { in: reach } }) },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true, code: true, departmentId: true },
    }),
  ]);

  // Server-side pagination: only the page's rows go to the browser.
  const total = result.rows.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(params.page, pageCount);
  const rows = result.rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <ReportsView
      params={{ ...params, page, sort: result.sort }}
      today={today}
      report={{ title: result.title, description: result.description, columns: result.columns, rows, totals: result.totals, total, pageCount }}
      departments={departments}
      canExport={hasPermission(user, "reports.export")}
      employees={employees.map((e) => ({ id: e.id, name: e.fullName, code: e.code, departmentId: e.departmentId }))}
    />
  );
}
