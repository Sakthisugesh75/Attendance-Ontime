"use client";

import type { AttendanceStatus } from "@prisma/client";
import { useState } from "react";
import type { CalendarDay } from "@/lib/attendance/dashboard";
import { STATUS_META } from "@/lib/status";
import { formatDate, formatDuration, monthLabel, WEEKDAYS, weekdayOf } from "@/lib/time";
import { cn } from "@/lib/utils";
import { StatusChip } from "./status-chip";

/** Monday-first weeks (DESIGN.md §7). */
const HEAD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const LEGEND: AttendanceStatus[] = ["PRESENT", "LATE", "HALF_DAY", "ABSENT", "LEAVE", "WFH", "ON_DUTY", "PERMISSION", "MISSING_PUNCH_OUT", "HOLIDAY", "WEEKLY_OFF"];
/** Upcoming days show approved leave / WFH / on duty and holidays; other future days stay blank. */
const FUTURE_SHOWN: (AttendanceStatus | null)[] = ["LEAVE", "WFH", "ON_DUTY", "HOLIDAY"];
const HATCH = "bg-[repeating-linear-gradient(135deg,var(--ad-border)_0_1px,transparent_1px_6px)]";

/** Employee self-view month (DESIGN.md §4.3): 7 columns, tinted cells with letter codes, tap a day for details. */
export function MonthCalendar({ month, days, title = "This month" }: { month: string; days: CalendarDay[]; title?: string }) {
  const lead = days.length ? (weekdayOf(days[0]!.date) + 6) % 7 : 0;
  const present = new Set(days.map((d) => d.status).filter(Boolean));
  const [selected, setSelected] = useState<string | null>(() => days.find((d) => d.isToday)?.date ?? null);
  const sel = days.find((d) => d.date === selected) ?? null;
  const shows = (d: CalendarDay) => !!d.status && (!d.isFuture || FUTURE_SHOWN.includes(d.status));

  return (
    <section className="rounded-xl bg-surface shadow-card">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-line px-4 py-4 sm:px-6">
        <h3 className="text-m-section sm:text-title-3">{title}</h3>
        <span className="text-m-caption text-ink-3 tabular-nums sm:text-caption">{monthLabel(month)}</span>
      </div>

      <div className="px-3 pt-4 pb-4 sm:px-6">
        <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
          {HEAD.map((h) => (
            <div key={h} aria-hidden className="pb-1 text-center text-col-header text-ink-3">
              <span className="sm:hidden">{h.slice(0, 1)}</span>
              <span className="hidden sm:inline">{h}</span>
            </div>
          ))}
          {Array.from({ length: lead }, (_, i) => (
            <div key={`lead-${i}`} aria-hidden />
          ))}
          {days.map((d) => {
            const meta = d.status ? STATUS_META[d.status] : null;
            const show = shows(d);
            const word = d.holiday ?? (show ? meta?.label : null) ?? (d.isFuture ? "Upcoming" : "No record");
            const isSel = d.date === selected;
            return (
              <button
                key={d.date}
                type="button"
                onClick={() => setSelected(d.date)}
                aria-pressed={isSel}
                aria-label={`${formatDate(d.date)}: ${word}${d.isToday ? " (today)" : ""}`}
                className={cn(
                  "relative flex h-12 min-w-0 flex-col items-center justify-between rounded-sm border border-transparent py-1 outline-none transition-colors duration-[120ms] focus-visible:shadow-[var(--ad-focus)] sm:h-16 sm:items-start sm:px-2 sm:py-1.5",
                  show && meta ? meta.cell : d.isFuture ? "border-dashed border-line bg-surface text-ink-3" : "bg-sunken text-ink-3",
                  show && d.status === "WEEKLY_OFF" && HATCH,
                  d.isToday && "ring-2 ring-brand ring-offset-2 ring-offset-surface",
                  isSel && !d.isToday && "ring-2 ring-line-strong ring-offset-1 ring-offset-surface",
                )}
              >
                <span className="text-m-meta font-semibold tabular-nums sm:text-label sm:font-semibold">{Number(d.date.slice(8))}</span>
                <span aria-hidden className="text-[11px] leading-4 font-semibold tracking-[0.02em] sm:text-caption sm:font-semibold">
                  {show && meta ? meta.short : ""}
                </span>
              </button>
            );
          })}
        </div>

        {/* Selected day: the full status word, times and hours */}
        <div className="mt-4 min-h-[60px] rounded-md bg-sunken px-3.5 py-3" aria-live="polite">
          {sel ? (
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <div className="min-w-0">
                <p className="text-m-meta font-semibold text-ink tabular-nums sm:text-body sm:font-medium">
                  {WEEKDAYS[weekdayOf(sel.date)]}, {formatDate(sel.date)}
                </p>
                <p className="mt-0.5 text-m-caption text-ink-2 tabular-nums sm:text-caption">
                  {sel.inTime ? (
                    <>
                      {sel.inTime} – {sel.outTime ?? "no punch-out"}
                      {sel.workedMinutes ? ` · ${formatDuration(sel.workedMinutes)} worked` : ""}
                      {sel.lateMinutes ? ` · ${formatDuration(sel.lateMinutes)} late` : ""}
                    </>
                  ) : sel.isFuture ? (
                    "Upcoming"
                  ) : (
                    "No punches"
                  )}
                </p>
              </div>
              {shows(sel) ? (
                <StatusChip status={sel.status} label={sel.holiday && sel.status === "HOLIDAY" ? sel.holiday : undefined} />
              ) : (
                <span className="text-m-caption text-ink-3 sm:text-caption">{sel.isFuture ? "Upcoming" : "No record"}</span>
              )}
            </div>
          ) : (
            <p className="text-m-caption text-ink-3 sm:text-caption">Tap a day to see its times.</p>
          )}
        </div>

        {/* Legend: icon + word, only for statuses in this month */}
        {present.size > 0 && (
          <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2" aria-label="Legend">
            {LEGEND.filter((s) => present.has(s)).map((s) => {
              const m = STATUS_META[s];
              return (
                <li key={s} className="flex items-center gap-1.5 text-m-caption text-ink-2 sm:text-caption">
                  <span aria-hidden className={cn("grid size-5 place-items-center rounded-xs", m.cell)}>
                    <m.icon className="size-3" />
                  </span>
                  {m.label}
                  <span className="text-ink-3">({m.short})</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
