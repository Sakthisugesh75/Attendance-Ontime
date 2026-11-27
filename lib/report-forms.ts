import "server-only";
import { prisma } from "@/lib/prisma";
import { idList, pickForm, readForm, STANDARD_FORM, type ReportForm } from "@/lib/validations/report-forms";

/** Every report form with who it's for (settings page). */
export async function allReportForms() {
  const rows = await prisma.reportTemplate.findMany({ orderBy: [{ isDefault: "desc" }, { name: "asc" }] });
  return rows.map((r) => ({ ...readForm(r), id: r.id, isDefault: r.isDefault, designationIds: idList(r.designationIds), departmentIds: idList(r.departmentIds) }));
}
export type ReportFormRow = Awaited<ReturnType<typeof allReportForms>>[number];

/** The form an employee fills in (by designation, then department, then the default one). */
export async function formForEmployee(employeeId: number): Promise<ReportForm> {
  const [employee, forms] = await Promise.all([
    prisma.employee.findUnique({ where: { id: employeeId }, select: { designationId: true, departmentId: true } }),
    allReportForms(),
  ]);
  const f = pickForm(forms, employee?.designationId ?? null, employee?.departmentId ?? null);
  return f ? { id: f.id, name: f.name, sections: f.sections, fields: f.fields } : STANDARD_FORM;
}
