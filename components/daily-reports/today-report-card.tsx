import { ArrowRight, CircleCheck, NotebookPen, OctagonAlert } from "lucide-react";
import Link from "next/link";
import { todayReportStatus, type TodayReportStatus } from "@/lib/daily-reports";
import { cn } from "@/lib/utils";
import { fmtHours } from "@/lib/validations/daily-reports";

/**
 * Dashboard card for the signed-in employee: has today's report gone in? Server component;
 * pass the employee id (or an already-loaded `status` from todayReportStatus()).
 */
export async function TodayReportCard({ employeeId, status }: { employeeId: number; status?: TodayReportStatus }) {
  const s = status ?? (await todayReportStatus(employeeId));
  return (
    <Link
      href="/daily-reports?view=mine"
      data-testid="today-report-card"
      className={cn(
        "group flex min-h-[72px] items-center gap-3.5 rounded-lg border bg-surface p-4 outline-none transition-colors duration-[120ms] hover:border-line-strong focus-visible:shadow-[var(--ad-focus)]",
        s.sent ? "border-line" : "border-dashed border-line-strong",
      )}
    >
      <span aria-hidden className={cn("grid size-10 shrink-0 place-items-center rounded-md", s.sent ? "bg-st-present-tint text-st-present-fg" : "bg-sunken text-ink-2")}>
        {s.sent ? <CircleCheck className="size-5" /> : <NotebookPen className="size-5" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-caption text-ink-3">Today&apos;s report</span>
        {s.sent ? (
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-m-meta sm:text-body">
            <span className="font-medium text-ink tabular-nums">Sent at {s.submittedAt}</span>
            <span className="text-ink-3 tabular-nums">
              · {s.taskCount} task{s.taskCount === 1 ? "" : "s"} · {fmtHours(s.hours)}
            </span>
            {s.blocked && (
              <span className="inline-flex items-center gap-1 text-caption text-st-absent-fg">
                <OctagonAlert aria-hidden className="size-3.5" /> Blocked
              </span>
            )}
            {s.reviewed && (
              <span className="inline-flex items-center gap-1 text-caption text-st-present-fg">
                <CircleCheck aria-hidden className="size-3.5" /> Reviewed
              </span>
            )}
          </span>
        ) : (
          <span className="mt-0.5 block text-m-meta sm:text-body">
            <span className="font-medium text-ink">Not sent yet</span>
            <span className="text-ink-3"> · takes a minute</span>
          </span>
        )}
      </span>
      <span className={`flex shrink-0 items-center gap-1 text-body font-medium ${s.sent ? "text-ink-2" : "text-brand-ink"}`}>
        <span className="hidden sm:inline">{s.sent ? (s.reviewed ? "View" : "Edit") : "Write report"}</span>
        <ArrowRight aria-hidden className="size-4 transition-transform duration-[120ms] group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
