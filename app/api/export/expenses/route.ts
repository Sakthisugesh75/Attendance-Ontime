import type { NextRequest } from "next/server";
import { approvalClaims } from "@/lib/expenses";
import { exportHeader, fileResponse, visibleColumns, XLSX_TYPE } from "@/lib/reports/export";
import type { ReportRow } from "@/lib/reports/types";
import { EXPENSE_COLUMNS } from "@/lib/reports/columns";
import { reportWorkbook } from "@/lib/reports/xlsx";
import { routeUser } from "@/lib/session";
import { istDate, monthDates } from "@/lib/time";
import { EXPENSE_STATUS_META, expenseListParams } from "@/lib/validations/expenses";

export const dynamic = "force-dynamic";


/** GET /api/export/expenses?status=&month= : the expense claims an HR / accounts user sees, as Excel. */
export async function GET(req: NextRequest) {
  const res = await routeUser("expenses.manage");
  if ("status" in res) return new Response(res.status === 401 ? "Your session has ended. Sign in again." : "You don't have permission to do that.", { status: res.status });
  const params = expenseListParams.parse({ ...Object.fromEntries(req.nextUrl.searchParams), view: "approvals" });
  try {
    const { rows } = await approvalClaims(res.user, params);
    const days = params.month ? monthDates(params.month) : null;
    const header = await exportHeader("Expense claims", days?.[0] ?? rows.at(-1)?.expenseDate ?? istDate(), days?.at(-1) ?? rows[0]?.expenseDate ?? istDate());
    const data: ReportRow[] = rows.map((r) => ({
      name: r.employee.name,
      code: r.employee.code,
      designation: r.employee.designation,
      date: r.expenseDate,
      category: r.category,
      description: r.description,
      amount: r.amount,
      status: EXPENSE_STATUS_META[r.status].label,
      approvedBy: [r.manager?.name, r.hr?.name].filter(Boolean).join(", ") || null,
      paidOn: r.paid ? istDate(new Date(r.paid.at)) : null,
      paymentRef: r.paid?.ref ?? null,
    }));
    const columns = await visibleColumns("expenses", EXPENSE_COLUMNS);
    const totals = columns.some((c) => c.key === "amount") ? { amount: Math.round(rows.reduce((s, r) => s + r.amount, 0) * 100) / 100 } : null;
    const wb = reportWorkbook(header, columns, data, totals);
    return fileResponse(await wb.xlsx.writeBuffer(), XLSX_TYPE, `expenses_${params.month ?? istDate()}.xlsx`);
  } catch (err) {
    console.error("expenses export failed", err);
    return new Response("Could not create the file. Try again.", { status: 500 });
  }
}
