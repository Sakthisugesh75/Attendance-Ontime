import { Receipt } from "lucide-react";
import { EmptyState, PageHeader, Panel } from "@/components/layout/page-header";
import { ExpensesView } from "@/components/expenses/expenses-view";
import { approvalClaims, designationOptions, expenseCategories, isExpenseApprover, myClaims } from "@/lib/expenses";
import { prisma } from "@/lib/prisma";
import { hasPermission, requireUser } from "@/lib/session";
import { claimLimit, expenseListParams } from "@/lib/validations/expenses";

export const metadata = { title: "Expenses" };

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const params = expenseListParams.parse(sp);
  const hasEmployee = !!user.employeeId;
  const manages = hasPermission(user, "expenses.manage");
  const approver = await isExpenseApprover(user);

  if (!hasEmployee && !approver) {
    return (
      <div className="space-y-6">
        <PageHeader title="Expenses" />
        <Panel>
          <EmptyState icon={Receipt} title="Not linked to an employee record">
            Ask HR to link your sign-in to your employee record to claim expenses.
          </EmptyState>
        </Panel>
      </div>
    );
  }

  const tabs = [...(hasEmployee ? (["mine"] as const) : []), ...(approver ? (["approvals"] as const) : []), ...(manages ? (["categories"] as const) : [])];
  const view = tabs.includes(params.view as (typeof tabs)[number]) ? params.view : tabs[0]!;

  const [categories, mine, approvals, designations, me] = await Promise.all([
    expenseCategories(view !== "categories"),
    view === "mine" && hasEmployee ? myClaims(user.employeeId!, params) : null,
    view === "approvals" ? approvalClaims(user, params) : null,
    view === "categories" ? designationOptions() : null,
    hasEmployee ? prisma.employee.findUnique({ where: { id: user.employeeId! }, select: { designationId: true } }) : null,
  ]);

  // The claim form shows each category's limit for this person.
  const claimCategories = hasEmployee
    ? categories.filter((c) => c.isActive).map((c) => ({ id: c.id, name: c.name, receiptRequired: c.receiptRequired, limit: claimLimit(c, me?.designationId ?? null) }))
    : [];
  const initialId = Number(sp.id);

  return (
    <ExpensesView
      view={view}
      tabs={[...tabs]}
      params={params}
      canClaim={hasEmployee}
      canPay={manages}
      claimCategories={claimCategories}
      mine={mine}
      approvals={approvals}
      categories={view === "categories" ? categories : null}
      designations={designations ?? []}
      initialId={Number.isInteger(initialId) && initialId > 0 ? initialId : null}
      openNew={sp.new !== undefined && hasEmployee}
    />
  );
}
