import type { NextRequest } from "next/server";
import { REPORT_KEYS, type ReportKey } from "@/lib/reports/definitions";
import { exportGuard, exportHeader, fileResponse, visibleColumns, XLSX_TYPE } from "@/lib/reports/export";
import { parseReportParams, periodSlug } from "@/lib/reports/params";
import { reportPdf } from "@/lib/reports/pdf";
import { runReport } from "@/lib/reports/run";
import { reportWorkbook } from "@/lib/reports/xlsx";
import { istDate } from "@/lib/time";

export const dynamic = "force-dynamic";

/** GET /api/export/<report>?format=xlsx|pdf&from=&to=&dept=&emp=&sort=&dir= (reports.export; only people in reach) */
export async function GET(req: NextRequest, { params }: { params: Promise<{ report: string }> }) {
  const guard = await exportGuard();
  if ("denied" in guard) return guard.denied;

  const { report } = await params;
  if (!(REPORT_KEYS as readonly string[]).includes(report)) return new Response("Unknown report", { status: 404 });
  const search = Object.fromEntries(req.nextUrl.searchParams);
  const p = parseReportParams({ ...search, report: report as ReportKey }, istDate());
  const format = search.format === "pdf" ? "pdf" : "xlsx";

  try {
    const result = await runReport(p, guard.reach);
    const header = await exportHeader(result.title, p.from, p.to);
    const columns = await visibleColumns(report, result.columns);
    const filename = `${report}_${periodSlug(p.from, p.to)}.${format}`;
    if (format === "pdf") {
      const pdf = await reportPdf(header, columns, result.rows, result.totals);
      return fileResponse(pdf, "application/pdf", filename);
    }
    const wb = reportWorkbook(header, columns, result.rows, result.totals);
    return fileResponse(await wb.xlsx.writeBuffer(), XLSX_TYPE, filename);
  } catch (err) {
    console.error("export failed", report, err);
    return new Response("Could not create the file. Try again.", { status: 500 });
  }
}
