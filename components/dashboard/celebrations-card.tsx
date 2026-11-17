import { Cake, PartyPopper } from "lucide-react";
import { EmployeeAvatar } from "@/components/employees/employee-avatar";
import { Panel } from "@/components/layout/page-header";
import { loadCelebrations, ordinal, type Celebration } from "@/lib/celebrations";
import { WEEKDAYS, weekdayOf } from "@/lib/time";
import { cn } from "@/lib/utils";

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Dashboard card: today's birthdays and work anniversaries (highlighted), then the next `days`
 * days. Self-contained server component: render `<CelebrationsCard />`.
 */
export async function CelebrationsCard({ days = 14 }: { days?: number }) {
  const all = await loadCelebrations(days);
  const today = all.filter((c) => c.daysAway === 0);
  const upcoming = all.filter((c) => c.daysAway > 0);

  return (
    <Panel
      title="Celebrations"
      description={`Birthdays & work anniversaries · next ${days} days`}
      actions={
        <span className="grid size-8 place-items-center rounded-md bg-sunken text-ink-2" aria-hidden>
          <PartyPopper className="size-4" />
        </span>
      }
      bodyClassName="p-0"
    >
      {all.length === 0 ? (
        <div className="flex items-center gap-3 px-4 py-6 sm:px-6">
          <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-sunken">
            <Cake className="size-5 text-ink-3" />
          </span>
          <p className="text-body text-ink-2">No birthdays or work anniversaries in the next {days} days.</p>
        </div>
      ) : (
        <>
          {today.length > 0 && (
            <ul className="space-y-2 p-3 sm:px-4" aria-label="Today">
              {today.map((c) => (
                <TodayItem key={`${c.kind}-${c.person.id}`} c={c} />
              ))}
            </ul>
          )}
          {upcoming.length > 0 && (
            <div className={cn(today.length > 0 && "border-t border-line")}>
              <p className="px-4 pt-4 text-caption text-ink-3 sm:px-6">Coming up</p>
              <ul className="divide-y divide-line px-1 pb-2 sm:px-3" aria-label="Coming up">
                {upcoming.map((c) => (
                  <UpcomingItem key={`${c.kind}-${c.person.id}`} c={c} />
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </Panel>
  );
}

function TodayItem({ c }: { c: Celebration }) {
  const birthday = c.kind === "BIRTHDAY";
  const first = c.person.name.split(/s+/)[0];
  const Icon = birthday ? Cake : PartyPopper;
  return (
    <li className="flex items-center gap-3.5 rounded-lg border border-line bg-sunken px-4 py-3.5" data-testid="celebration-today">
      <EmployeeAvatar name={c.person.name} photo={c.person.photo} className="size-11 ring-2 ring-surface" />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-caption text-ink-2">
          <Icon aria-hidden className="size-3.5" /> Today · {birthday ? "Birthday" : "Work anniversary"}
        </p>
        <p className="mt-0.5 truncate text-m-meta font-semibold text-ink sm:text-title-3">
          {birthday ? `Happy birthday, ${first}!` : `${c.years} year${c.years === 1 ? "" : "s"} with us, ${first}!`}
        </p>
        <p className="truncate text-caption text-ink-3">
          {c.person.name}
          {c.person.designation && ` · ${c.person.designation}`}
        </p>
      </div>
    </li>
  );
}

function UpcomingItem({ c }: { c: Celebration }) {
  const birthday = c.kind === "BIRTHDAY";
  const when = c.daysAway === 1 ? "Tomorrow" : c.daysAway < 7 ? WEEKDAYS[weekdayOf(c.date)] : `In ${c.daysAway} days`;
  return (
    <li className="flex min-h-14 items-center gap-3 px-3 py-2.5">
      <span className="grid w-11 shrink-0 place-items-center rounded-md border border-line bg-surface py-1">
        <span className="text-title-3 text-ink tabular-nums">{c.date.slice(8)}</span>
        <span className="text-caption text-ink-3">{MONTH_SHORT[Number(c.date.slice(5, 7)) - 1]}</span>
      </span>
      <EmployeeAvatar name={c.person.name} photo={c.person.photo} className="size-8" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-body font-medium text-ink">{c.person.name}</p>
        <p className="flex items-center gap-1 truncate text-caption text-ink-3">
          {birthday ? (
            <>
              <Cake aria-hidden className="size-3.5 shrink-0" /> Birthday
            </>
          ) : (
            <>
              <PartyPopper aria-hidden className="size-3.5 shrink-0" /> {ordinal(c.years)} work anniversary
            </>
          )}
        </p>
      </div>
      <span className={`shrink-0 text-caption ${c.daysAway === 1 ? "text-ink" : "text-ink-3"}`}>{when}</span>
    </li>
  );
}
