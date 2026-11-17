"use client";

import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from "@tanstack/react-table";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronsUpDown, ChevronUp, FileSpreadsheet, FileText, SearchX, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useTransition } from "react";
import { EmptyState, PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatValue, isNumeric, REPORT_KEYS, REPORT_META, type ReportKey } from "@/lib/reports/definitions";
import { PAGE_SIZE, reportQuery, type ReportParams } from "@/lib/reports/params";
import type { ReportColumn, ReportRow } from "@/lib/reports/types";
import { addDays, formatDate, monthDates } from "@/lib/time";
import { cn } from "@/lib/utils";
import { EmployeePicker, type PickerEmployee } from "./employee-picker";
import * as T from "./table-styles";

export interface ReportView {
  title: string;
  description: string;
  columns: ReportColumn[];
  rows: ReportRow[];
  totals: ReportRow | null;
  total: number;
  pageCount: number;
}

function presets(today: string) {
  const thisMonth = monthDates(today.slice(0, 7));
  const lastMonth = monthDates(addDays(thisMonth[0]!, -1).slice(0, 7));
  return [
    { label: "This month", from: thisMonth[0]!, to: thisMonth.at(-1)! },
    { label: "Last month", from: lastMonth[0]!, to: lastMonth.at(-1)! },
    { label: "Year to date", from: `${today.slice(0, 4)}-01-01`, to: today },
  ];
}

export function ReportsView({
  params,
  today,
  report,
  departments,
  employees,
  canExport,
}: {
  params: ReportParams;
  today: string;
  report: ReportView;
  departments: { id: number; name: string }[];
  employees: PickerEmployee[];
  /** Shows the download buttons (the export routes check reports.export themselves). */
  canExport: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, start] = useTransition();

  /** Writes filters to the URL; the server re-runs the report. Filter changes go back to page 1. */
  const setParams = (patch: Partial<Record<"report" | "from" | "to" | "dept" | "emp" | "sort" | "dir" | "page", string | number | undefined>>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === "" || (k === "page" && v === 1)) next.delete(k);
      else next.set(k, String(v));
    }
    if (!("page" in patch)) next.delete("page");
    if ("report" in patch) {
      next.delete("sort");
      next.delete("dir");
    }
    start(() => router.push(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false }));
  };

  const isNumericKey = (key: string) => {
    const c = report.columns.find((x) => x.key === key);
    return !!c && isNumeric(c.kind) && c.kind !== "clock";
  };
  /** First click sorts numbers high-to-low and text A–Z; the next click flips it. */
  const sortBy = (key: string) =>
    setParams({ sort: key, dir: params.sort === key ? (params.dir === "asc" ? "desc" : "asc") : isNumericKey(key) ? "desc" : "asc" });

  const columns = useMemo<ColumnDef<ReportRow>[]>(
    () =>
      report.columns.map((c) => ({
        id: c.key,
        header: () => (
          <button
            type="button"
            onClick={() => sortBy(c.key)}
            className={cn(
              "-mx-1 inline-flex items-center gap-1 rounded-xs px-1 py-0.5 whitespace-nowrap outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-brand",
              params.sort === c.key && "text-ink",
              isNumeric(c.kind) && "flex-row-reverse",
            )}
            aria-label={`Sort by ${c.label}`}
          >
            {c.label}
            {params.sort !== c.key ? <ChevronsUpDown aria-hidden className="size-3.5 text-ink-3" /> : params.dir === "asc" ? <ChevronUp aria-hidden className="size-3.5" /> : <ChevronDown aria-hidden className="size-3.5" />}
          </button>
        ),
        cell: ({ row }) => {
          const v = row.original[c.key] ?? null;
          if (c.key === "name") return <span className="font-medium whitespace-nowrap text-ink">{String(v)}</span>;
          return <span className={cn(c.kind === "code" && "text-caption font-semibold tabular-nums", c.kind === "date" && "whitespace-nowrap tabular-nums", v === null && "text-ink-3")}>{formatValue(c.kind, v, c.key)}</span>;
        },
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [report.columns, params.sort, params.dir],
  );
  const ariaSort = (key: string) => (params.sort === key ? (params.dir === "asc" ? "ascending" : "descending") : undefined);

  const table = useReactTable({ data: report.rows, columns, getCoreRowModel: getCoreRowModel(), manualPagination: true, manualSorting: true, pageCount: report.pageCount });

  const exportQuery = reportQuery({ from: params.from, to: params.to, dept: params.dept ?? undefined, emp: params.emp, sort: params.sort, dir: params.dir });
  const filtered = !!(params.dept || params.emp.length);
  const first = report.total ? (params.page - 1) * PAGE_SIZE + 1 : 0;
  const last = Math.min(params.page * PAGE_SIZE, report.total);
  const numericCol = (key: string) => isNumeric(report.columns.find((c) => c.key === key)?.kind ?? "text");

  /** Summary stat row (DESIGN.md §4.6): row count plus the first few report totals. */
  const stats = [
    { label: "Rows", value: String(report.total), hint: `${formatDate(params.from)} – ${formatDate(params.to)}` },
    ...(report.totals
      ? report.columns
          .filter((c) => isNumeric(c.kind) && report.totals![c.key] !== undefined && report.totals![c.key] !== null)
          .slice(0, 3)
          .map((c) => ({ label: c.label, value: formatValue(c.kind, report.totals![c.key] ?? null, c.key), hint: "Total for the period" }))
      : []),
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Insights · reports"
        title="Reports"
        description="Pick a report, set the period and who it covers, then download it for payroll or the files."
        actions={
          canExport && (
            <>
              <Button variant="outline" asChild>
                <a href={`/api/export/${params.report}?format=xlsx&${exportQuery}`} download>
                  <FileSpreadsheet /> Export Excel
                </a>
              </Button>
              <Button variant="outline" asChild>
                <a href={`/api/export/${params.report}?format=pdf&${exportQuery}`} download>
                  <FileText /> Export PDF
                </a>
              </Button>
            </>
          )
        }
      />

      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        {/* Report list: a left rail on desktop, a scrolling row on phones */}
        <nav aria-label="Reports" className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 lg:overflow-visible">
          <ul className="flex w-max gap-1.5 sm:w-auto sm:flex-wrap lg:flex-col lg:gap-0.5">
            {REPORT_KEYS.map((k: ReportKey) => {
              const active = params.report === k;
              return (
                <li key={k}>
                  <button
                    type="button"
                    aria-current={active ? "page" : undefined}
                    onClick={() => !active && setParams({ report: k })}
                    className={cn(
                      "flex h-11 w-full items-center rounded-md px-3 text-label whitespace-nowrap transition-colors duration-[120ms] outline-none focus-visible:ring-2 focus-visible:ring-brand lg:h-9",
                      "max-lg:rounded-full max-lg:border max-lg:px-4",
                      active ? "bg-brand-subtle text-brand-ink max-lg:border-transparent" : "text-ink-2 hover:bg-sunken hover:text-ink max-lg:border-line max-lg:bg-surface",
                    )}
                  >
                    {REPORT_META[k].title}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="min-w-0 space-y-4">
          <div>
            <h3 className="text-title-2 text-ink">{report.title}</h3>
            <p className="mt-0.5 text-body text-ink-2">{report.description}</p>
          </div>

          {/* Filter bar: date range with presets, department, employee */}
          <div className="flex flex-col gap-2 rounded-xl bg-surface shadow-card p-3 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="flex items-center gap-2">
              <Input type="date" value={params.from} max={params.to} onChange={(e) => e.target.value && setParams({ from: e.target.value })} aria-label="From" className="w-full tabular-nums sm:w-40" />
              <span aria-hidden className="text-ink-3">–</span>
              <Input type="date" value={params.to} min={params.from} onChange={(e) => e.target.value && setParams({ to: e.target.value })} aria-label="To" className="w-full tabular-nums sm:w-40" />
            </div>
            <Select
              value={presets(today).find((p) => p.from === params.from && p.to === params.to)?.label ?? "custom"}
              onValueChange={(v) => {
                const p = presets(today).find((x) => x.label === v);
                if (p) setParams({ from: p.from, to: p.to });
              }}
            >
              <SelectTrigger className="w-full sm:w-36" aria-label="Period">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {presets(today).map((p) => (
                  <SelectItem key={p.label} value={p.label}>
                    {p.label}
                  </SelectItem>
                ))}
                <SelectItem value="custom" disabled>
                  Custom range
                </SelectItem>
              </SelectContent>
            </Select>
            <Select value={params.dept ? String(params.dept) : "all"} onValueChange={(v) => setParams({ dept: v === "all" ? undefined : v })}>
              <SelectTrigger className="w-full sm:w-48" aria-label="Department">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All departments</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={String(d.id)}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <EmployeePicker
              employees={params.dept ? employees.filter((e) => e.departmentId === params.dept) : employees}
              value={params.emp}
              onChange={(ids) => setParams({ emp: ids.length ? ids.join(",") : undefined })}
            />
            {filtered && (
              <Button variant="ghost" size="sm" className="max-sm:h-11" onClick={() => setParams({ dept: undefined, emp: undefined })}>
                <X /> Clear
              </Button>
            )}
          </div>

          {/* Summary stat row */}
          {report.total > 0 && (
            <dl className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              {stats.map((st) => (
                <div key={st.label} className="min-w-0 rounded-xl bg-surface shadow-card p-4">
                  <dt className="truncate text-label text-ink-2">{st.label}</dt>
                  <dd className="mt-1 truncate text-[24px] leading-8 font-semibold tracking-[-0.02em] text-ink tabular-nums sm:text-display">{st.value}</dd>
                  <dd className="mt-0.5 truncate text-caption text-ink-3 tabular-nums">{st.hint}</dd>
                </div>
              ))}
            </dl>
          )}

          <section className={T.tablePanel}>
            {report.total === 0 ? (
              <EmptyState icon={SearchX} title="Nothing to report">
                No {report.title.toLowerCase()} for this period{filtered ? " and these people" : ""}. Try a wider range or clear the filters.
              </EmptyState>
            ) : (
              <div className={cn("transition-opacity duration-[180ms]", pending && "opacity-60")}>
                <Table aria-label={report.title} aria-busy={pending}>
                  <TableHeader>
                    {table.getHeaderGroups().map((hg) => (
                      <TableRow key={hg.id} className={T.headRow}>
                        {hg.headers.map((h) => (
                          <TableHead key={h.id} aria-sort={ariaSort(h.column.id)} className={cn(T.th, numericCol(h.column.id) && "text-right")}>
                            {flexRender(h.column.columnDef.header, h.getContext())}
                          </TableHead>
                        ))}
                      </TableRow>
                    ))}
                  </TableHeader>
                  <TableBody>
                    {table.getRowModel().rows.map((row) => (
                      <TableRow key={row.id} className={T.row}>
                        {row.getVisibleCells().map((cell) => (
                          <TableCell key={cell.id} className={cn(T.td, "text-cell", numericCol(cell.column.id) && T.num)}>
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                  {report.totals && (
                    <TableFooter className="border-line bg-sunken">
                      <TableRow className="border-line hover:bg-transparent">
                        {report.columns.map((c, i) => (
                          <TableCell key={c.key} className={cn(T.td, "text-cell font-semibold text-ink", isNumeric(c.kind) && T.num)}>
                            {i === 0 ? (
                              <>
                                Total · <span className="tabular-nums">{report.total}</span> {report.total === 1 ? "row" : "rows"}
                              </>
                            ) : report.totals![c.key] === undefined ? (
                              ""
                            ) : (
                              formatValue(c.kind, report.totals![c.key] ?? null, c.key)
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableFooter>
                  )}
                </Table>
              </div>
            )}

            {report.total > 0 && (
              <div className={T.footer}>
                <span>
                  <span className="tabular-nums">
                    {first}–{last}
                  </span>{" "}
                  of <span className="tabular-nums">{report.total}</span>
                </span>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon" className="size-11 sm:size-8" disabled={params.page <= 1} onClick={() => setParams({ page: params.page - 1 })} aria-label="Previous page">
                    <ChevronLeft />
                  </Button>
                  <span className="px-2 tabular-nums">
                    {params.page} / {report.pageCount}
                  </span>
                  <Button variant="outline" size="icon" className="size-11 sm:size-8" disabled={params.page >= report.pageCount} onClick={() => setParams({ page: params.page + 1 })} aria-label="Next page">
                    <ChevronRight />
                  </Button>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
