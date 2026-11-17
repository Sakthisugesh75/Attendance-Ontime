import "server-only";
import { buildReport, REPORT_META, sortRows, totalsRow } from "./definitions";
import { loadEmployeeDays } from "./data";
import type { ReportParams } from "./params";
import type { ReportRow, ReportTable } from "./types";

export interface ReportResult extends ReportTable {
  title: string;
  description: string;
  totals: ReportRow | null;
  sort: string;
  dir: "asc" | "desc";
}

/**
 * Runs a report for the filters: computes the days, builds the table, sorts it.
 * `reach` limits it to the employees the viewer may see (null = everyone).
 */
export async function runReport(p: ReportParams, reach: number[] | null = null, now = new Date()): Promise<ReportResult> {
  const list = await loadEmployeeDays({ from: p.from, to: p.to, department: p.dept, employees: p.emp, reach }, now);
  const table = buildReport(p.report, list);
  const sort = table.columns.some((c) => c.key === p.sort) ? p.sort : REPORT_META[p.report].defaultSort;
  return {
    ...REPORT_META[p.report],
    columns: table.columns,
    rows: sortRows(table.rows, sort, p.dir),
    totals: totalsRow(table),
    sort,
    dir: p.dir,
  };
}
