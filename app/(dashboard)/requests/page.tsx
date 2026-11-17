import { Inbox } from "lucide-react";
import { EmptyState, PageHeader, Panel } from "@/components/layout/page-header";
import { RequestsView } from "@/components/requests/requests-view";
import { prisma } from "@/lib/prisma";
import { getBalances, listApprovals, listMyRequests, requestFormOptions } from "@/lib/requests";
import { hasPermission, requireUser, scopeEmployeeIds } from "@/lib/session";
import { istDate } from "@/lib/time";
import { approvalParams, REQUEST_TYPES, type RequestTypeKey } from "@/lib/validations/requests";

export const metadata = { title: "Requests" };

export default async function RequestsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const params = approvalParams.parse(sp);
  const manager = hasPermission(user, "requests.approve");
  const hasEmployee = !!user.employeeId;
  // Approvers land on Approvals; those with their own record can switch to their requests.
  const view: "approvals" | "mine" = manager ? (hasEmployee && params.view === "mine" ? "mine" : "approvals") : "mine";

  if (!manager && !hasEmployee) {
    return (
      <div className="space-y-6">
        <PageHeader title="Requests" />
        <Panel>
          <EmptyState icon={Inbox} title="Not linked to an employee record">
            Ask HR to link your sign-in to your employee record to apply for leave and other requests.
          </EmptyState>
        </Panel>
      </div>
    );
  }

  const year = istDate().slice(0, 4);
  // Approvers only ever see requests of the employees in their reach.
  const reach = view === "approvals" ? await scopeEmployeeIds(user) : null;
  const [options, balances, rows, approvals, employees] = await Promise.all([
    hasEmployee ? requestFormOptions(user.employeeId!) : null,
    hasEmployee && view === "mine" ? getBalances(user.employeeId!, Number(year)) : null,
    hasEmployee && view === "mine" ? listMyRequests(user.employeeId!) : null,
    view === "approvals" ? listApprovals(params, reach) : null,
    view === "approvals"
      ? prisma.employee.findMany({ where: { deletedAt: null, ...(reach && { id: { in: reach } }) }, select: { id: true, fullName: true, code: true }, orderBy: { fullName: "asc" } })
      : null,
  ]);

  const openNew = sp.new !== undefined && hasEmployee ? ((REQUEST_TYPES as readonly string[]).includes(sp.new) ? (sp.new as RequestTypeKey) : "LEAVE") : null;
  const initialId = Number(sp.id);
  // ?record=<employeeId> (from an employee profile): "Record for employee" opens with them picked.
  const recordId = Number(sp.record);
  const recordFor = view === "approvals" && Number.isInteger(recordId) && recordId > 0 && recordId !== user.employeeId ? recordId : null;

  return (
    <RequestsView
      view={view}
      showTabs={manager && hasEmployee}
      openNew={openNew}
      recordFor={recordFor}
      mine={options ? { options, balances: balances ?? [], rows: rows ?? [], year } : null}
      approvals={
        approvals && employees
          ? {
              rows: approvals.rows,
              openCount: approvals.open,
              params,
              employees: employees.map((e) => ({ id: e.id, name: e.fullName, code: e.code })),
              currentUserId: user.id,
              isSuperAdmin: user.isSuperAdmin,
              initialId: Number.isInteger(initialId) && initialId > 0 ? initialId : null,
              selfEmployeeId: user.employeeId,
            }
          : null
      }
    />
  );
}
