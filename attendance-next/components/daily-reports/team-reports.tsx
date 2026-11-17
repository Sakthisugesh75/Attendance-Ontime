"use client";

import { BellRing, ChevronLeft, ChevronRight, CircleDashed, FileCheck2, Inbox, Loader2, OctagonAlert, PartyPopper, UserX } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { StatCard } from "@/components/attendance/stat-card";
import { EmployeeAvatar } from "@/components/employees/employee-avatar";
import { EmptyState, Panel } from "@/components/layout/page-header";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { remindMissing } from "@/lib/actions/daily-reports";
import type { TeamDay, TeamReportRow } from "@/lib/daily-reports";
import { addDays, formatDate, formatDuration, WEEKDAYS, weekdayOf } from "@/lib/time";
import { cn } from "@/lib/utils";
import { fmtHours, MAX_BACK_DAYS } from "@/lib/validations/daily-reports";
import { BlockedChip, ReviewChip } from "./report-body";
import { ReviewSheet } from "./review-sheet";

const FILTERS = [
  { key: "ALL", label: "All" },
  { key: "AWAITING", label: "Awaiting review" },
  { key: "BLOCKED", label: "Blocked" },
] as const;
type Filter = (typeof FILTERS)[number]["key"];

export function TeamReports({ day, today, currentEmployeeId, isSuperAdmin }: { day: TeamDay; today: string; currentEmployeeId: number | null; isSuperAdmin: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [navigating, startNav] = useTransition();
  const [pending, start] = useTransition();
  const [filter, setFilter] = useState<Filter>("ALL");
  const [openId, setOpenId] = useState<number | null>(null);
  const [confirmRemind, setConfirmRemind] = useState(false);

  const setDate = (d: string) => {
    if (!d || d > today) return;
    const next = new URLSearchParams(searchParams.toString());
    if (d === today) next.delete("date");
    else next.set("date", d);
    setFilter("ALL");
    startNav(() => router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false }));
  };

  const shown = day.rows.filter((r) => filter === "ALL" || (filter === "AWAITING" && !r.reviewed) || (filter === "BLOCKED" && r.blocked));
  const open = day.rows.find((r) => r.id === openId) ?? null;
  const remindable = day.missing.filter((m) => m.hasLogin && m.id !== currentEmployeeId).length;
  const canRemind = day.date >= addDays(today, -MAX_BACK_DAYS) && remindable > 0;
  const expected = day.stats.submitted + day.stats.missing;
  const pct = expected ? Math.round((day.stats.submitted / expected) * 100) : 0;

  const remind = () =>
    start(async () => {
      const res = await remindMissing(day.date);
      if (!res.ok) toast.error(res.error);
      else toast.success(res.message);
      setConfirmRemind(false);
    });

  return (
    <div className={cn("space-y-6 transition-opacity", navigating && "opacity-60")}>
      {/* Day picker */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-0.5 rounded-md border border-line-strong bg-surface p-0.5">
          <Button variant="ghost" size="icon" className="size-11 md:size-9" onClick={() => setDate(addDays(day.date, -1))} aria-label="Previous day">
            <ChevronLeft />
          </Button>
          <Input type="date" value={day.date} max={today} onChange={(e) => setDate(e.target.value)} aria-label="Report date" className="h-11 w-36 border-0 bg-transparent px-1 tabular-nums shadow-none focus-visible:ring-0 md:h-9" />
          <Button variant="ghost" size="icon" className="size-11 md:size-9" onClick={() => setDate(addDays(day.date, 1))} disabled={day.date >= today} aria-label="Next day">
            <ChevronRight />
          </Button>
        </div>
        <p className="text-body text-ink-2 tabular-nums">
          {day.date === today ? "Today" : WEEKDAYS[weekdayOf(day.date)]} · {formatDate(day.date)}
        </p>
        {day.date !== today && (
          <Button variant="link" size="sm" className="px-1" onClick={() => setDate(today)}>
            Back to today
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={FileCheck2} label="Submitted" value={String(day.stats.submitted)} hint={expected ? `${pct}% of ${expected} expected` : "Nobody expected"} />
        <StatCard icon={UserX} label="Missing" value={String(day.stats.missing)} hint={day.stats.notExpected ? `${day.stats.notExpected} off or on leave` : day.stats.notRequired ? `${day.stats.notRequired} not required to report` : "Not sent yet"} tone={day.stats.missing ? "late" : undefined} />
        <StatCard icon={OctagonAlert} label="Blocked" value={String(day.stats.blocked)} hint="Reports with blockers" />
        <StatCard icon={CircleDashed} label="To review" value={String(day.stats.awaitingReview)} hint={day.stats.submitted ? `${day.stats.submitted - day.stats.awaitingReview} reviewed` : "Nothing yet"} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {/* Submitted */}
        <Panel bodyClassName="p-0" className="min-w-0">
          <div className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-line px-2 [scrollbar-width:none] sm:px-3" role="tablist" aria-label="Filter reports">
            {FILTERS.map((f) => {
              const count = f.key === "ALL" ? day.rows.length : f.key === "AWAITING" ? day.stats.awaitingReview : day.stats.blocked;
              const active = filter === f.key;
              return (
                <button
                  key={f.key}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setFilter(f.key)}
                  className={cn("relative flex h-11 shrink-0 items-center gap-2 rounded-xs px-3 text-label whitespace-nowrap transition-colors duration-[120ms] outline-none focus-visible:ring-2 focus-visible:ring-brand md:h-10", active ? "text-ink" : "text-ink-3 hover:text-ink")}
                >
                  {f.label}
                  <span className={cn("rounded-full px-1.5 text-caption tabular-nums", f.key === "BLOCKED" && count ? "bg-st-absent-tint text-st-absent-fg" : "bg-sunken text-ink-2")}>{count}</span>
                  {active && <span aria-hidden className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-ink" />}
                </button>
              );
            })}
          </div>
          {shown.length === 0 ? (
            <EmptyState icon={Inbox} title={day.rows.length ? "Nothing here" : "No reports yet"}>
              {day.rows.length ? "No reports match this filter." : `Nobody in your team has sent a report for ${formatDate(day.date)} yet.`}
            </EmptyState>
          ) : (
            <ul className="divide-y divide-line" data-testid="team-reports">
              {shown.map((r) => (
                <TeamRow key={r.id} r={r} onOpen={() => setOpenId(r.id)} />
              ))}
            </ul>
          )}
        </Panel>

        {/* Not submitted */}
        <Panel
          title="Not submitted"
          description={day.missing.length ? `${day.missing.length} expected, no report yet` : undefined}
          actions={
            day.missing.length > 0 && (
              <Button size="sm" variant="outline" onClick={() => setConfirmRemind(true)} disabled={!canRemind || pending}>
                <BellRing /> Remind
              </Button>
            )
          }
          bodyClassName="p-0"
          className="h-fit"
        >
          {day.missing.length === 0 ? (
            <EmptyState icon={PartyPopper} art="party" title="Everyone's in">
              {day.stats.submitted ? "Every expected report has been sent." : "Nobody was expected to report on this day."}
            </EmptyState>
          ) : (
            <ul className="max-h-[28rem] divide-y divide-line overflow-y-auto" data-testid="missing-list">
              {day.missing.map((m) => (
                <li key={m.id} className="flex min-h-14 items-center gap-3 px-4 py-2.5 sm:px-5">
                  <EmployeeAvatar name={m.name} photo={m.photo} className="size-7" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body font-medium text-ink">{m.name}</p>
                    <p className="truncate text-caption text-ink-3">
                      <span className="tabular-nums">{m.code}</span>
                      {m.department && ` · ${m.department}`}
                    </p>
                  </div>
                  {m.note && <span className="inline-flex h-[22px] shrink-0 items-center rounded-full bg-sunken px-2 text-caption text-ink-2">{m.note}</span>}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <ReviewSheet report={open} onClose={() => setOpenId(null)} currentEmployeeId={currentEmployeeId} isSuperAdmin={isSuperAdmin} />

      <AlertDialog open={confirmRemind} onOpenChange={setConfirmRemind}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remind {remindable} {remindable === 1 ? "person" : "people"}?</AlertDialogTitle>
            <AlertDialogDescription>
              Everyone on the &ldquo;Not submitted&rdquo; list who can sign in gets a notification asking for their report for {formatDate(day.date)}.
              {day.missing.length > remindable && ` ${day.missing.length - remindable} without a sign-in won't get it.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Not now</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(e) => {
                e.preventDefault();
                remind();
              }}
            >
              {pending && <Loader2 className="animate-spin" />}
              Send reminder
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function TeamRow({ r, onOpen }: { r: TeamReportRow; onOpen: () => void }) {
  const done = r.tasks.filter((t) => t.status === "DONE").length;
  return (
    <li data-testid={`team-report-${r.employee.code}`}>
      <button type="button" onClick={onOpen} className="flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors duration-[120ms] outline-none hover:bg-sunken focus-visible:bg-sunken focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset sm:px-5" aria-label={`Open the report from ${r.employee.name}`}>
        <EmployeeAvatar name={r.employee.name} photo={r.employee.photo} className="mt-0.5 size-8" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 truncate text-body font-medium text-ink">
              {r.employee.name} <span className="text-caption font-normal text-ink-3 tabular-nums">{r.employee.code}</span>
            </p>
            <span className="shrink-0 text-caption text-ink-3 tabular-nums">{r.submittedAt}</span>
          </div>
          <p className="truncate text-caption text-ink-3">{r.employee.department ?? "—"}</p>
          <p className="mt-1.5 line-clamp-1 text-body text-ink-2">{r.tasks.map((t) => t.title).join(" · ") || r.summary}</p>
          {r.blockers && (
            <p className="mt-1.5 line-clamp-2 flex gap-1.5 text-caption text-st-absent-fg">
              <OctagonAlert aria-hidden className="mt-px size-3.5 shrink-0" />
              {r.blockers}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex h-[22px] items-center rounded-full bg-sunken px-2 text-caption text-ink-2 tabular-nums">
              {done}/{r.tasks.length} done
            </span>
            <span className="inline-flex h-[22px] items-center rounded-full bg-sunken px-2 text-caption text-ink-2 tabular-nums">
              {fmtHours(r.hours)}
              {r.workedMinutes ? <span className="ml-1 text-ink-3">/ {formatDuration(r.workedMinutes)}</span> : null}
            </span>
            {r.blocked && <BlockedChip />}
            <ReviewChip reviewed={!!r.reviewed} />
          </div>
        </div>
      </button>
    </li>
  );
}
