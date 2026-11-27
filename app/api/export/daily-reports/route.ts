import ExcelJS from "exceljs";
import type { NextRequest } from "next/server";
import { reportsForExport } from "@/lib/daily-reports";
import { exportHeader, fileResponse, XLSX_TYPE } from "@/lib/reports/export";
import { parseReportParams, periodSlug } from "@/lib/reports/params";
import { routeUser, scopeEmployeeIds } from "@/lib/session";
import { istDate } from "@/lib/time";
import { TASK_STATUS_META } from "@/lib/validations/daily-reports";
import { answerText } from "@/lib/validations/report-forms";
import { writeLetterhead, writeSignOff } from "@/lib/reports/xlsx";

export const dynamic = "force-dynamic";

const COLUMNS: { header: string; key: string; width: number }[] = [
  { header: "Date", key: "date", width: 13 },
  { header: "Code", key: "code", width: 10 },
  { header: "Employee", key: "name", width: 24 },
  { header: "Department", key: "department", width: 16 },
  { header: "Task", key: "task", width: 44 },
  { header: "Hours", key: "hours", width: 8 },
  { header: "Status", key: "status", width: 12 },
  { header: "Summary", key: "summary", width: 40 },
  { header: "Tomorrow's plan", key: "plan", width: 36 },
  { header: "Blockers", key: "blockers", width: 36 },
  { header: "Sent at", key: "sent", width: 10 },
  { header: "Reviewed by", key: "reviewer", width: 20 },
  { header: "Reviewed at", key: "reviewedAt", width: 20 },
  { header: "Review comment", key: "comment", width: 36 },
];

/**
 * GET /api/export/daily-reports?from=&to=
 * Daily work reports as Excel, one row per task (a report without tasks gets one row).
 * Needs reports.export or dailyreports.review and covers only the employees in reach.
 */
export async function GET(req: NextRequest) {
  const res = await routeUser("reports.export", "dailyreports.review");
  if ("status" in res) return new Response(res.status === 401 ? "Your session has ended. Sign in again." : "You don't have permission to do that.", { status: res.status });

  // Same date handling as reports: defaults to this month, at most a year.
  const p = parseReportParams(Object.fromEntries(req.nextUrl.searchParams), istDate());
  try {
    const [reports, header] = await Promise.all([reportsForExport(p.from, p.to, await scopeEmployeeIds(res.user)), exportHeader("Daily work reports", p.from, p.to)]);

    const wb = new ExcelJS.Workbook();
    wb.creator = header.company;
    wb.created = new Date();
    // Custom report-form fields get a column each, in the order they first appear.
    const answerLabels = [...new Set(reports.flatMap((r) => r.answers.map((a) => a.label)))];
    const columns = [...COLUMNS, ...answerLabels.map((label) => ({ header: label, key: `answer:${label}`, width: 24 }))];
    const ws = wb.addWorksheet("Daily reports", { pageSetup: { orientation: header.orientation ?? "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
    const H = writeLetterhead(wb, ws, { ...header, period: `${header.period} · ${reports.length} report${reports.length === 1 ? "" : "s"}` }, columns.length);
    ws.views = [{ state: "frozen", ySplit: H }];

    const head = ws.getRow(H);
    columns.forEach((c, i) => {
      ws.getColumn(i + 1).width = c.width;
      const cell = head.getCell(i + 1);
      cell.value = c.header;
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFECE9E1" } };
      cell.border = { bottom: { style: "thin", color: { argb: "FFB5B1A6" } } };
      cell.alignment = { vertical: "middle", horizontal: c.key === "hours" ? "right" : "left" };
    });
    ws.autoFilter = { from: { row: H, column: 1 }, to: { row: H, column: columns.length } };

    let row = H + 1;
    for (const r of reports) {
      const tasks = r.tasks.length ? r.tasks : [null];
      for (const t of tasks) {
        const values = [
          new Date(`${r.date}T00:00:00.000Z`),
          r.employee.code,
          r.employee.name,
          r.employee.department,
          t?.title ?? "",
          t?.hours ?? null,
          t ? TASK_STATUS_META[t.status].label : "",
          r.summary,
          r.tomorrowPlan,
          r.blockers,
          r.submittedAt,
          r.reviewed?.by ?? "",
          r.reviewed?.at ?? "",
          r.reviewed?.comment ?? "",
          ...answerLabels.map((label) => {
            const a = r.answers.find((x) => x.label === label);
            return a ? answerText(a) : "";
          }),
        ];
        const xr = ws.getRow(row++);
        values.forEach((v, i) => (xr.getCell(i + 1).value = v));
        xr.getCell(1).numFmt = "dd mmm yyyy";
        xr.getCell(6).numFmt = "0.##";
        xr.alignment = { vertical: "top", wrapText: true };
        if (t?.status === "BLOCKED") xr.getCell(7).font = { color: { argb: "FFC0392B" }, bold: true };
      }
    }

    writeSignOff(ws, header, row, columns.length);
    return fileResponse(await wb.xlsx.writeBuffer(), XLSX_TYPE, `daily-reports_${periodSlug(p.from, p.to)}.xlsx`);
  } catch (err) {
    console.error("daily reports export failed", err);
    return new Response("Could not create the file. Try again.", { status: 500 });
  }
}
