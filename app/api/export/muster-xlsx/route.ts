import type { NextRequest } from "next/server";
import { loadEmployeeDays } from "@/lib/reports/data";
import { exportGuard, fileResponse, XLSX_TYPE } from "@/lib/reports/export";
import { buildMusterWorkbook, musterMonths } from "@/lib/reports/muster-xlsx";
import { parseReportParams, periodSlug } from "@/lib/reports/params";
import { getSetting } from "@/lib/settings";
import { istDate } from "@/lib/time";

export const dynamic = "force-dynamic";

/**
 * GET /api/export/muster-xlsx?from=&to=[&dept=]
 * The company's old monthly sheet layout (one sheet per month), readable by the importer.
 * Needs reports.export and covers only the employees in the caller's reach.
 */
export async function GET(req: NextRequest) {
  const guard = await exportGuard();
  if ("denied" in guard) return guard.denied;

  // Same date handling as reports: defaults to this month, at most a year.
  const p = parseReportParams(Object.fromEntries(req.nextUrl.searchParams), istDate());
  try {
    const [list, company] = await Promise.all([loadEmployeeDays({ from: p.from, to: p.to, department: p.dept, reach: guard.reach }), getSetting("company")]);
    const wb = buildMusterWorkbook(musterMonths(list, p.from, p.to), company.name);
    return fileResponse(await wb.xlsx.writeBuffer(), XLSX_TYPE, `muster_${periodSlug(p.from, p.to)}.xlsx`);
  } catch (err) {
    console.error("muster export failed", err);
    return new Response("Could not create the file. Try again.", { status: 500 });
  }
}
