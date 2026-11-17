"use client";

import { Building2, CalendarHeart, ChevronLeft, ChevronRight, Flag, Landmark, Megaphone, PartyPopper, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { StatCard } from "@/components/attendance/stat-card";
import { EmptyState, PageHeader, Panel } from "@/components/layout/page-header";
import { ConfirmButton } from "@/components/settings/confirm-button";
import { Button } from "@/components/ui/button";
import { deleteHoliday } from "@/lib/actions/holidays";
import { formatDate, monthLabel, WEEKDAYS, weekdayOf, ymdToDb } from "@/lib/time";
import { cn } from "@/lib/utils";
import { HOLIDAY_TYPE_LABEL, HOLIDAY_TYPES, type HolidayTypeKey } from "@/lib/validations/holidays";
import { HolidaySheet } from "./holiday-sheet";

export interface HolidayItem {
  id: number;
  date: string;
  name: string;
  type: HolidayTypeKey;
  isDeclared: boolean;
}

const TYPE_CHIP: Record<HolidayTypeKey, string> = {
  NATIONAL: "bg-st-holiday-tint text-st-holiday-fg",
  STATE: "bg-st-holiday-tint text-st-holiday-fg",
  COMPANY: "bg-sunken text-ink-2",
  OPTIONAL: "border border-dashed border-line-strong text-ink-2",
};
const TYPE_ICON = { NATIONAL: Flag, STATE: Landmark, COMPANY: Building2, OPTIONAL: Sparkles } as const;
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const daysBetween = (a: string, b: string) => Math.round((ymdToDb(b).getTime() - ymdToDb(a).getTime()) / 86_400_000);

export function TypeChip({ type }: { type: HolidayTypeKey }) {
  const Icon = TYPE_ICON[type];
  return (
    <span className={cn("inline-flex h-[22px] items-center gap-1 rounded-full pr-2 pl-1.5 text-caption font-semibold whitespace-nowrap", TYPE_CHIP[type])}>
      <Icon aria-hidden className="size-3.5 shrink-0" />
      {HOLIDAY_TYPE_LABEL[type]}
    </span>
  );
}

export function HolidaysView({ year, today, canEdit, holidays, yearsWithData }: { year: number; today: string; canEdit: boolean; holidays: HolidayItem[]; yearsWithData: number[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<HolidayItem | null>(null);
  const openSheet = (h: HolidayItem | null) => {
    setEditing(h);
    setOpen(true);
  };

  const next = holidays.find((h) => h.date >= today) ?? null;
  const months = new Map<string, HolidayItem[]>();
  for (const h of holidays) {
    const m = h.date.slice(0, 7);
    months.set(m, [...(months.get(m) ?? []), h]);
  }
  const counts = Object.fromEntries(HOLIDAY_TYPES.map((t) => [t, holidays.filter((h) => h.type === t).length])) as Record<HolidayTypeKey, number>;
  const remaining = holidays.filter((h) => h.date >= today).length;
  const sundays = holidays.filter((h) => weekdayOf(h.date) === 0).length;
  const currentYear = Number(today.slice(0, 4));
  const defaultDate = year === currentYear ? today : `${year}-01-01`;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`Calendar · ${year}`}
        title="Holidays"
        description={
          holidays.length
            ? `${holidays.length} holiday${holidays.length === 1 ? "" : "s"} in ${year}${year === currentYear ? `, ${remaining} still to come` : ""}. They count as paid days off for everyone.`
            : `No holidays listed for ${year} yet.`
        }
        actions={
          <>
            <nav aria-label="Year" className="flex items-center rounded-md border border-line-strong bg-surface">
              <Button variant="ghost" size="icon" asChild className="rounded-r-none">
                <Link href={`/holidays?year=${year - 1}`} aria-label={`Holidays in ${year - 1}`} scroll={false}>
                  <ChevronLeft />
                </Link>
              </Button>
              <span className="min-w-14 px-1 text-center text-body font-medium text-ink tabular-nums" aria-current="page">
                {year}
              </span>
              <Button variant="ghost" size="icon" asChild className="rounded-l-none">
                <Link href={`/holidays?year=${year + 1}`} aria-label={`Holidays in ${year + 1}`} scroll={false}>
                  <ChevronRight />
                </Link>
              </Button>
            </nav>
            {year !== currentYear && (
              <Button variant="ghost" asChild>
                <Link href="/holidays">This year</Link>
              </Button>
            )}
            {canEdit && (
              <Button onClick={() => openSheet(null)}>
                <Plus /> Add holiday
              </Button>
            )}
          </>
        }
      />

      {next && <NextHoliday holiday={next} today={today} />}

      {holidays.length > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {HOLIDAY_TYPES.map((t) => (
            <StatCard key={t} icon={TYPE_ICON[t]} label={HOLIDAY_TYPE_LABEL[t]} value={String(counts[t])} hint={t === "OPTIONAL" ? "Restricted holidays" : t === "COMPANY" ? "Company declared" : `${t === "NATIONAL" ? "Gazetted" : "Tamil Nadu"} holidays`} />
          ))}
        </div>
      )}

      {holidays.length ? (
        <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[...months.entries()].map(([month, list]) => (
            <Panel
              key={month}
              className="rise"
              title={monthLabel(month).split(" ")[0]}
              actions={<span className="text-col-header text-ink-3 tabular-nums">{list.length} day{list.length === 1 ? "" : "s"}</span>}
            >
              <ul className="divide-y divide-line">
                {list.map((h) => {
                  const past = h.date < today;
                  const isNext = next?.id === h.id;
                  return (
                    <li key={h.id} className={cn("flex items-center gap-3.5 px-4 py-3 hover:bg-sunken sm:px-5", past && "text-ink-3")} data-testid="holiday">
                      <span
                        className={cn(
                          "grid w-11 shrink-0 place-items-center rounded-md py-1.5 leading-none",
                          isNext ? "bg-st-holiday-tint text-st-holiday-fg ring-2 ring-st-holiday" : past ? "bg-sunken text-ink-3" : "bg-st-holiday-tint text-st-holiday-fg",
                        )}
                      >
                        <span className="text-title-2 tabular-nums">{h.date.slice(8)}</span>
                        <span className="mt-0.5 text-caption">{MONTH_SHORT[Number(h.date.slice(5, 7)) - 1]}</span>
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={cn("truncate text-body font-medium", !past && "text-ink")}>{h.name}</p>
                        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-caption text-ink-3">
                          <span>{WEEKDAYS[weekdayOf(h.date)]}</span>
                          <TypeChip type={h.type} />
                          {h.isDeclared && (
                            <span className="inline-flex items-center gap-1 text-caption" title="One-off declared holiday">
                              <Megaphone aria-hidden className="size-3.5" /> Declared
                            </span>
                          )}
                        </p>
                      </div>
                      {canEdit && (
                        <span className="flex shrink-0 items-center">
                          <Button variant="ghost" size="icon" className="text-ink-3" aria-label={`Edit ${h.name}`} onClick={() => openSheet(h)}>
                            <Pencil />
                          </Button>
                          <ConfirmButton
                            variant="ghost"
                            size="icon"
                            className="text-ink-3 hover:text-danger"
                            aria-label={`Delete ${h.name}`}
                            title={`Delete ${h.name}?`}
                            description={`${formatDate(h.date)} becomes a normal day. ${past ? "Attendance for that day is recalculated: anyone who didn't punch will show as absent." : "Staff will be expected at work."}`}
                            confirmLabel="Delete holiday"
                            action={() => deleteHoliday(h.id)}
                            onDone={() => router.refresh()}
                          >
                            <Trash2 />
                          </ConfirmButton>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Panel>
          ))}
        </div>
      ) : (
        <Panel>
          <EmptyState
            icon={CalendarHeart}
            art="party"
            title={`No holidays for ${year}`}
            action={
              canEdit ? (
                <Button onClick={() => openSheet(null)}>
                  <Plus /> Add the first holiday
                </Button>
              ) : yearsWithData.length ? (
                <Button variant="outline" asChild>
                  <Link href={`/holidays?year=${yearsWithData.at(-1)}`}>See {yearsWithData.at(-1)}</Link>
                </Button>
              ) : undefined
            }
          >
            {canEdit ? "Add the national, state and company holidays for the year. Imported Excel files can add them too." : "HR hasn't published the holiday list for this year yet."}
          </EmptyState>
        </Panel>
      )}

      {holidays.length > 0 && (
        <p className="text-caption text-ink-3">
          {sundays > 0 && `${sundays} of ${holidays.length} fall on a Sunday. `}Festival dates that follow the lunar calendar can shift; HR updates them when the government order is out.
        </p>
      )}

      {canEdit && <HolidaySheet open={open} onOpenChange={setOpen} holiday={editing} defaultDate={defaultDate} existing={holidays} />}
    </div>
  );
}

function NextHoliday({ holiday, today }: { holiday: HolidayItem; today: string }) {
  const days = daysBetween(today, holiday.date);
  const when = days === 0 ? "Today" : days === 1 ? "Tomorrow" : `In ${days} days`;
  return (
    <section aria-label="Next holiday" className="rise rounded-xl bg-surface shadow-card p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div className="flex min-w-0 items-center gap-4 sm:gap-5">
          <span className="grid w-16 shrink-0 place-items-center rounded-lg bg-st-holiday-tint py-2.5 leading-none text-st-holiday-fg">
            <span className="text-display tabular-nums">{holiday.date.slice(8)}</span>
            <span className="mt-1 text-caption">{MONTH_SHORT[Number(holiday.date.slice(5, 7)) - 1]}</span>
          </span>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-label text-st-holiday-fg">
              <PartyPopper aria-hidden className="size-4" /> Next holiday · {when}
            </p>
            <p className="mt-1 truncate text-title-2 text-ink sm:text-title-1">{holiday.name}</p>
            <p className="mt-0.5 text-body text-ink-2 tabular-nums">
              {WEEKDAYS[weekdayOf(holiday.date)]}, {formatDate(holiday.date)}
            </p>
          </div>
        </div>
        <span className="flex items-center gap-2 text-caption text-ink-3">
          <TypeChip type={holiday.type} />
          {holiday.isDeclared && "Declared"}
        </span>
      </div>
    </section>
  );
}
