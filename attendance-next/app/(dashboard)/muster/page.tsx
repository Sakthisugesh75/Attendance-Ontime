import { MusterView } from "@/components/muster/muster-view";
import { prisma } from "@/lib/prisma";
import { loadMuster } from "@/lib/reports/muster";
import { hasPermission, requirePermission, scopeEmployeeIds } from "@/lib/session";
import { istDate } from "@/lib/time";
import { musterParams } from "@/lib/validations/muster";

export const metadata = { title: "Muster roll" };

export default async function MusterPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePermission("attendance.view");
  const reach = await scopeEmployeeIds(user);
  const p = musterParams.parse(await searchParams);
  const month = p.month ?? istDate().slice(0, 7);
  const [data, departments] = await Promise.all([
    loadMuster(month, p.dept ?? null, reach),
    prisma.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <MusterView
      key={`${month}:${p.dept ?? ""}`}
      data={data}
      departments={departments}
      department={p.dept ?? null}
      initialQuery={p.q}
      canEdit={hasPermission(user, "attendance.edit")}
      canExport={hasPermission(user, "reports.export")}
    />
  );
}
