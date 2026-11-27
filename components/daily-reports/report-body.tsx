import { CircleCheck, CircleDashed, Clock3, Hourglass, OctagonAlert, Sunrise, type LucideIcon } from "lucide-react";
import type { ReportRow } from "@/lib/daily-reports";
import { formatDate, formatDuration } from "@/lib/time";
import { cn } from "@/lib/utils";
import { fmtHours, TASK_STATUS_META, type TaskStatus } from "@/lib/validations/daily-reports";
import { answerText } from "@/lib/validations/report-forms";

/** Pill per DESIGN.md §4.4: 22px, icon + word on a tint, never colour alone. */
const base = "inline-flex h-[22px] items-center gap-1 rounded-full pr-2 pl-1.5 text-caption font-semibold whitespace-nowrap";

/** Task states reuse the core palettes (no new colours): done = Present, blocked = Absent, in progress = neutral. */
const TASK_TONE: Record<TaskStatus, { icon: LucideIcon; chip: string; tile: string }> = {
  DONE: { icon: CircleCheck, chip: "bg-st-present-tint text-st-present-fg", tile: "text-st-present-fg" },
  IN_PROGRESS: { icon: CircleDashed, chip: "bg-sunken text-ink-2", tile: "text-ink-3" },
  BLOCKED: { icon: OctagonAlert, chip: "bg-st-absent-tint text-st-absent-fg", tile: "text-st-absent-fg" },
};

export function TaskStatusChip({ status, className }: { status: TaskStatus; className?: string }) {
  const tone = TASK_TONE[status];
  const Icon = tone.icon;
  return (
    <span className={cn(base, tone.chip, className)}>
      <Icon aria-hidden className="size-3.5 shrink-0" />
      {TASK_STATUS_META[status].label}
    </span>
  );
}

/** "Reviewed" / "Awaiting review" pill for a report. Awaiting is the dashed Pending pill. */
export function ReviewChip({ reviewed, className }: { reviewed: boolean; className?: string }) {
  return reviewed ? (
    <span className={cn(base, "bg-st-present-tint text-st-present-fg", className)}>
      <CircleCheck aria-hidden className="size-3.5 shrink-0" /> Reviewed
    </span>
  ) : (
    <span className={cn(base, "border border-dashed border-st-pending bg-st-pending-tint text-st-pending-fg", className)}>
      <Hourglass aria-hidden className="size-3.5 shrink-0" /> Awaiting review
    </span>
  );
}

export function BlockedChip({ className }: { className?: string }) {
  return (
    <span className={cn(base, "bg-st-absent-tint text-st-absent-fg", className)}>
      <OctagonAlert aria-hidden className="size-3.5 shrink-0" /> Blocked
    </span>
  );
}

/** The full report, read-only: tasks, summary, tomorrow's plan, blockers and the review note. */
export function ReportBody({ report, workedMinutes, showReview = true }: { report: ReportRow; workedMinutes?: number | null; showReview?: boolean }) {
  const showTasks = report.tasks.length > 0 || (!report.summary && !report.answers.length);
  return (
    <div className="space-y-5">
      {showTasks && (
      <section>
        <div className="flex items-baseline justify-between gap-3">
          <h4 className="text-label text-ink tabular-nums">Tasks · {report.tasks.length}</h4>
          <p className="text-caption text-ink-3 tabular-nums">
            {fmtHours(report.hours)} logged
            {workedMinutes ? <> · {formatDuration(workedMinutes)} at work</> : null}
          </p>
        </div>
        {report.tasks.length ? (
          <ol className="mt-2 divide-y divide-line overflow-hidden rounded-xl bg-surface shadow-card">
            {report.tasks.map((t, i) => {
              const Icon = TASK_TONE[t.status].icon;
              return (
                <li key={i} className={cn("flex items-start gap-3 px-3 py-2.5", t.status === "BLOCKED" && "bg-st-absent-tint")}>
                  <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", TASK_TONE[t.status].tile)} />
                  <p className="min-w-0 flex-1 text-body break-words text-ink">{t.title}</p>
                  <span className="flex shrink-0 items-center gap-2">
                    {t.hours !== null && <span className="text-caption text-ink-3 tabular-nums">{fmtHours(t.hours)}</span>}
                    <span className="sr-only">{TASK_STATUS_META[t.status].label}</span>
                    <TaskStatusChip status={t.status} className="hidden sm:inline-flex" />
                  </span>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="mt-2 text-body text-ink-3">No tasks listed.</p>
        )}
      </section>
      )}

      {report.summary && <TextBlock label="Summary">{report.summary}</TextBlock>}
      {report.answers.length > 0 && (
        <dl className="grid gap-x-5 gap-y-3 sm:grid-cols-2">
          {report.answers.map((a) => (
            <div key={a.id} className={cn("min-w-0", a.type === "textarea" && "sm:col-span-2")}>
              <dt className="text-label text-ink">{a.label}</dt>
              <dd className="mt-0.5 text-body whitespace-pre-line text-ink-2 tabular-nums">{answerText(a)}</dd>
            </div>
          ))}
        </dl>
      )}
      {report.tomorrowPlan && (
        <TextBlock label="Tomorrow" icon={<Sunrise aria-hidden className="size-3.5" />}>
          {report.tomorrowPlan}
        </TextBlock>
      )}
      {report.blockers && (
        <div className="rounded-md bg-st-absent-tint px-4 py-3 text-st-absent-fg">
          <p className="flex items-center gap-1.5 text-label">
            <OctagonAlert aria-hidden className="size-3.5" /> Blockers
          </p>
          <p className="mt-1 text-body whitespace-pre-line">{report.blockers}</p>
        </div>
      )}

      {showReview && report.reviewed && (
        <div className="rounded-md bg-sunken px-3.5 py-2.5">
          <p className="flex items-start gap-2 text-caption text-ink-2">
            <CircleCheck aria-hidden className="mt-px size-3.5 shrink-0 text-st-present" />
            <span className="min-w-0 tabular-nums">
              Reviewed by {report.reviewed.by} · {report.reviewed.at}
            </span>
          </p>
          {report.reviewed.comment && <p className="mt-1 pl-5.5 text-body text-ink">{report.reviewed.comment}</p>}
        </div>
      )}

      <p className="flex items-center gap-1.5 text-caption text-ink-3 tabular-nums">
        <Clock3 aria-hidden className="size-3.5" />
        Sent {report.submittedDate !== report.date && `${formatDate(report.submittedDate)}, `}
        {report.submittedAt}
        {report.edited && " · edited"}
      </p>
    </div>
  );
}

function TextBlock({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-label text-ink">
        {icon}
        {label}
      </p>
      <p className="mt-1 border-l-2 border-line-strong pl-3 text-body whitespace-pre-line text-ink-2">{children}</p>
    </div>
  );
}
