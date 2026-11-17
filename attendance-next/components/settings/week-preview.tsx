import { isWeeklyOff, type WeeklyOffRuleLike } from "@/lib/attendance/weekly-off";
import { STATUS_META } from "@/lib/status";
import { monthDates, monthLabel, weekdayOf } from "@/lib/time";
import { cn } from "@/lib/utils";

const HEAD = ["M", "T", "W", "T", "F", "S", "S"];

/** Next month ("2026-11" -> "2026-12"). */
export function nextMonth(month: string) {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

/** Small month grids showing which days are weekly offs under `rules`, with holidays and custom days marked. */
export function WeekPreview({
  months,
  rules,
  holidays,
  from,
  today,
}: {
  months: string[];
  rules: WeeklyOffRuleLike[];
  holidays: Map<string, string>;
  /** Days before this are dimmed (the old policy still applies) */
  from?: string;
  today: string;
}) {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      {months.map((month) => {
        const dates = monthDates(month);
        const lead = (weekdayOf(dates[0]!) + 6) % 7;
        let offs = 0;
        return (
          <div key={month} className="min-w-0">
            <p className="text-col-header text-ink-3 mb-2">{monthLabel(month)}</p>
            <div className="grid grid-cols-7 gap-1 text-center">
              {HEAD.map((d, i) => (
                <span key={i} className="pb-1 text-caption text-ink-3">
                  {d}
                </span>
              ))}
              {Array.from({ length: lead }, (_, i) => (
                <span key={`b${i}`} />
              ))}
              {dates.map((d) => {
                const holiday = holidays.get(d);
                const off = isWeeklyOff(rules, d, null);
                if (off) offs++;
                const before = from && d < from;
                return (
                  <span
                    key={d}
                    title={holiday ?? (off ? "Weekly off" : undefined)}
                    className={cn(
                      "relative grid aspect-square place-items-center rounded-xs text-caption tabular-nums",
                      holiday ? STATUS_META.HOLIDAY.cell : off ? STATUS_META.WEEKLY_OFF.cell : "text-ink-2",
                      off && !holiday && "font-semibold",
                      before && "opacity-35",
                      d === today && "ring-2 ring-brand",
                    )}
                  >
                    {Number(d.slice(8))}
                    {holiday && <span aria-hidden className="absolute bottom-0.5 size-1 rounded-full bg-st-holiday" />}
                  </span>
                );
              })}
            </div>
            <p className="mt-2 text-caption text-ink-3">
              <span className="tabular-nums text-ink">{offs}</span> weekly off{offs === 1 ? "" : "s"} ·{" "}
              <span className="tabular-nums text-ink">{dates.filter((d) => holidays.has(d)).length}</span> holiday{dates.filter((d) => holidays.has(d)).length === 1 ? "" : "s"}
            </p>
          </div>
        );
      })}
    </div>
  );
}

export function PreviewLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-ink-3">
      <span className="flex items-center gap-1.5">
        <span className={cn("grid h-5 min-w-6 place-items-center rounded-xs px-1 text-caption font-semibold", STATUS_META.WEEKLY_OFF.cell)}>WO</span> Weekly off
      </span>
      <span className="flex items-center gap-1.5">
        <span className={cn("grid h-5 min-w-6 place-items-center rounded-xs px-1 text-caption font-semibold", STATUS_META.HOLIDAY.cell)}>HO</span> Holiday
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-4 rounded-xs ring-2 ring-brand" /> Today
      </span>
    </div>
  );
}
