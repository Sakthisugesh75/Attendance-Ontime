"use client";

import { ChevronDown, NotebookPen, PencilLine } from "lucide-react";
import { useMemo, useState } from "react";
import { EmptyState, Panel } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import type { MyReportsData, ReportRow } from "@/lib/daily-reports";
import { formatDate, WEEKDAYS, weekdayOf } from "@/lib/time";
import { cn } from "@/lib/utils";
import { fmtHours } from "@/lib/validations/daily-reports";
import { BlockedChip, ReportBody, ReviewChip } from "./report-body";
import { DayStrip, ReportComposer } from "./report-composer";

export function MyReports({ data, initialDate }: { data: MyReportsData; initialDate: string }) {
  const [date, setDate] = useState(data.dates.includes(initialDate) ? initialDate : data.today);
  const byDate = useMemo(() => new Map(data.reports.map((r) => [r.date, r])), [data.reports]);
  const report = byDate.get(date);
  const pick = (d: string) => {
    setDate(d);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // This week at a glance: sent out of the working days so far.
  const weekSent = data.dates.filter((d) => byDate.has(d)).length;
  const weekDue = data.dates.filter((d) => byDate.has(d) || !data.hints[d]?.label).length;

  return (
    <div className="space-y-6">
      <section className="space-y-3" aria-labelledby="days-heading">
        <div className="flex items-baseline justify-between gap-3">
          <h3 id="days-heading" className="text-title-3 text-ink tabular-nums">
            Last {data.dates.length} days
          </h3>
          <p className="text-caption text-ink-3 tabular-nums">
            {weekSent}/{weekDue} sent
          </p>
        </div>
        {data.dates.length > 0 && <DayStrip dates={data.dates} today={data.today} selected={date} onSelect={setDate} reports={byDate} hints={data.hints} />}
      </section>

      <ReportComposer key={`${date}:${report?.id ?? "new"}:${report?.submittedAt}:${report?.edited}:${!!report?.reviewed}`} date={date} today={data.today} report={report} hint={data.hints[date] ?? null} form={data.form} />

      <History reports={data.reports} editable={new Set(data.dates)} onEdit={pick} />
    </div>
  );
}

function History({ reports, editable, onEdit }: { reports: ReportRow[]; editable: Set<string>; onEdit: (d: string) => void }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <Panel title="History" description="Your last 30 reports and what your reviewer said" bodyClassName="p-0">
      {reports.length === 0 ? (
        <EmptyState icon={NotebookPen} art="memo" title="No reports yet">
          Your sent reports show up here, with any comments from your reviewer.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line" data-testid="report-history">
          {reports.map((r) => {
            const expanded = open === r.id;
            return (
              <li key={r.id} data-testid={`history-${r.date}`}>
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : r.id)}
                  aria-expanded={expanded}
                  className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-[120ms] outline-none hover:bg-sunken focus-visible:bg-sunken focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset sm:px-6"
                >
                  <span className="grid w-11 shrink-0 place-items-center rounded-md border border-line bg-surface py-1 text-center">
                    <span className="text-caption text-ink-3">{WEEKDAYS[weekdayOf(r.date)]!.slice(0, 3)}</span>
                    <span className="text-title-3 text-ink tabular-nums">{r.date.slice(8)}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body font-medium text-ink">{r.tasks[0]?.title ?? (r.summary || "Report")}</span>
                    <span className="mt-0.5 block text-caption text-ink-3 tabular-nums">
                      {formatDate(r.date).slice(3)} · {r.tasks.length} task{r.tasks.length === 1 ? "" : "s"} · <span>{fmtHours(r.hours)}</span>
                    </span>
                  </span>
                  <span className="hidden shrink-0 items-center gap-1.5 sm:flex">
                    {r.blocked && <BlockedChip />}
                    <ReviewChip reviewed={!!r.reviewed} />
                  </span>
                  <ChevronDown aria-hidden className={cn("size-4 shrink-0 text-ink-3 transition-transform duration-[180ms]", expanded && "rotate-180")} />
                </button>
                {expanded && (
                  <div className="animate-in fade-in slide-in-from-top-1 space-y-4 border-t border-line bg-canvas px-4 py-4 duration-[180ms] sm:px-6">
                    <div className="flex flex-wrap items-center gap-1.5 sm:hidden">
                      {r.blocked && <BlockedChip />}
                      <ReviewChip reviewed={!!r.reviewed} />
                    </div>
                    <ReportBody report={r} />
                    {!r.reviewed && editable.has(r.date) && (
                      <Button variant="outline" size="sm" className="max-md:h-11" onClick={() => onEdit(r.date)}>
                        <PencilLine /> Edit this report
                      </Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
