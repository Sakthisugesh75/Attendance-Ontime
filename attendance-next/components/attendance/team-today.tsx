import type { CSSProperties } from "react";
import type { teamToday } from "@/lib/attendance/dashboard";
import { Illustration } from "@/components/ui/illustration";
import { cn, initials } from "@/lib/utils";
import { StatusChip } from "./status-chip";

type Team = Awaited<ReturnType<typeof teamToday>>;
type Person = Team["present"][number];

/** Today's counts: glass tiles with a light number, 3D art and a share-of-team bar (DESIGN.md §0). */
const TILES = [
  { key: "present", label: "Present", art: "check", bar: "bg-st-present" },
  { key: "late", label: "Came in late", art: "snail", bar: "bg-st-late" },
  { key: "leave", label: "On leave", art: "palm", bar: "bg-st-leave" },
  { key: "wfh", label: "WFH / On duty", art: "house", bar: "bg-st-present" },
  { key: "notIn", label: "Not punched in", art: "zzz", bar: "bg-st-absent" },
] as const;

/** Soft avatar colours, picked by id so a person keeps theirs. */
const AVATAR = ["bg-st-pending-tint text-st-pending-fg", "bg-butter/60 text-on-butter", "bg-st-holiday-tint text-st-holiday-fg", "bg-st-absent-tint text-st-absent-fg", "bg-st-present-tint text-st-present-fg", "bg-st-halfday-tint text-st-halfday-fg", "bg-st-leave-tint text-st-leave-fg"];

const BAR: Partial<Record<NonNullable<Person["status"]>, string>> = {
  PRESENT: "bg-st-present",
  LATE: "bg-st-late",
  HALF_DAY: "bg-st-halfday",
  PERMISSION: "bg-st-leave",
  ABSENT: "bg-st-absent",
  WFH: "bg-st-present",
  ON_DUTY: "bg-st-present",
};

const hourLabel = (m: number) => {
  const h = Math.floor(m / 60);
  return h === 12 ? "12 PM" : h === 0 || h === 24 ? "12 AM" : h > 12 ? `${h - 12} PM` : `${h} AM`;
};

/**
 * HR / admin view of everyone today: counts, then the live register, with each person's working
 * day drawn as a strip (shift window, time in, late minutes hatched, a "now" line).
 */
export function TeamToday({ team }: { team: Team }) {
  const everyone = [...team.present, ...team.wfh, ...team.leave, ...team.notIn, ...team.off].filter((p, i, all) => all.findIndex((q) => q.id === p.id) === i);

  // One time axis for everyone, in whole 2-hour steps around the shifts and punches.
  const marks = everyone.flatMap((p) => [p.shiftStart, p.shiftEnd, p.inMin, p.outMin]).filter((m): m is number => m !== null);
  const lo = Math.min(9 * 60, team.nowMin, ...marks);
  const hi = Math.max(18 * 60, team.nowMin, ...marks);
  const start = Math.max(0, Math.floor((lo - 60) / 120) * 120);
  const end = Math.min(24 * 60, Math.ceil((hi + 60) / 120) * 120);
  const pct = (m: number) => Math.min(100, Math.max(0, ((m - start) / (end - start)) * 100));
  const span = (from: number, to: number): CSSProperties => ({ left: `${pct(from)}%`, width: `${Math.max(0, pct(to) - pct(from))}%` });
  const ticks: number[] = [];
  for (let m = start; m <= end; m += 120) ticks.push(m);
  const nowInRange = team.nowMin >= start && team.nowMin <= end;

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {TILES.map((t, i) => {
          const list = team[t.key];
          return (
            <div key={t.key} className={cn("relative min-w-0 overflow-hidden rounded-lg bg-surface p-4 shadow-card sm:p-5", i === TILES.length - 1 && "max-sm:col-span-2")}>
              <Illustration name={t.art} size={64} className="absolute top-2.5 right-2.5" />
              <span className="block pr-16 text-label font-normal text-ink-2">{t.label}</span>
              <p className="mt-3 text-[40px] leading-[44px] font-light tracking-[-0.04em] text-ink tabular-nums">
                {list.length}
                {t.key === "present" && <span className="ml-1 text-[17px] tracking-normal text-ink-3">/{team.total}</span>}
              </p>
              <div aria-hidden className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--ad-text)_7%,transparent)]">
                <div className={cn("h-full rounded-full", t.bar)} style={{ width: `${team.total ? (list.length / team.total) * 100 : 0}%` }} />
              </div>
              <p className="mt-2 line-clamp-1 text-caption text-ink-3">{list.length ? list.map((p) => p.name.split(" ")[0]).join(", ") : "No one"}</p>
            </div>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-xl bg-surface shadow-card">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-4 pt-5 pb-3 sm:px-6">
          <h3 className="text-title-2 text-ink">Live register</h3>
          <span className="text-caption text-ink-3 tabular-nums">{team.total} employees expected today</span>
        </div>

        {/* Hour axis (desktop): lines up with the strips below */}
        <div aria-hidden className="hidden grid-cols-[minmax(0,200px)_minmax(0,1fr)_64px_136px] gap-4 px-6 pb-1 text-[11px] text-ink-3 tabular-nums sm:grid">
          <span />
          <span className="relative h-4">
            {ticks.map((m, i) => (
              <span key={m} className={cn("absolute whitespace-nowrap", i === 0 ? "" : i === ticks.length - 1 ? "-translate-x-full" : "-translate-x-1/2")} style={{ left: `${pct(m)}%` }}>
                {hourLabel(m)}
              </span>
            ))}
          </span>
          <span className="text-right">In</span>
          <span />
        </div>

        <ul className="pb-2">
          {everyone.map((p) => {
            const late = p.lateMinutes > 0 && p.inMin !== null && p.shiftStart !== null;
            const until = p.outMin ?? team.nowMin;
            const bar = (p.status && BAR[p.status]) ?? "bg-st-present";
            const off = p.status === "HOLIDAY" || p.status === "WEEKLY_OFF";
            return (
              <li
                key={p.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-t border-line px-4 py-2.5 transition-colors duration-[120ms] first:border-t-0 hover:bg-glass sm:grid-cols-[minmax(0,200px)_minmax(0,1fr)_64px_136px] sm:gap-x-4 sm:px-6"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span aria-hidden className={cn("grid size-9 shrink-0 place-items-center rounded-full text-caption font-medium", AVATAR[p.id % AVATAR.length])}>
                    {initials(p.name)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-body font-medium text-ink">{p.name}</span>
                    <span className="block truncate text-caption text-ink-3">
                      <span className="tabular-nums [font-feature-settings:'zero']">{p.code}</span>
                      {p.department ? ` · ${p.department}` : ""}
                    </span>
                  </span>
                </span>

                {/* The day strip (decorative: the time and status beside it say the same in words) */}
                <span aria-hidden className="relative col-span-2 h-[30px] rounded-full bg-[color-mix(in_srgb,var(--ad-text)_6%,transparent)] sm:col-span-1 sm:row-auto">
                  {p.shiftStart !== null && p.shiftEnd !== null && <span className="absolute inset-y-[3px] rounded-full bg-glass" style={span(p.shiftStart, p.shiftEnd)} />}
                  {p.status === "LEAVE" && p.shiftStart !== null && p.shiftEnd !== null ? (
                    <>
                      <span className="absolute inset-y-[7px] rounded-full bg-st-leave-tint" style={span(p.shiftStart, p.shiftEnd)} />
                      <span className="absolute top-1/2 -translate-y-1/2 pl-3 text-[12px] font-medium whitespace-nowrap text-st-leave-fg" style={{ left: `${pct(p.shiftStart)}%` }}>
                        On leave
                      </span>
                    </>
                  ) : p.inMin !== null ? (
                    <>
                      {late && <span className="absolute inset-y-[7px] rounded-l-full bg-[repeating-linear-gradient(-45deg,var(--ad-late)_0_3px,transparent_3px_6px)] opacity-50" style={span(p.shiftStart!, p.inMin)} />}
                      <span className={cn("absolute inset-y-[7px] rounded-full", bar)} style={span(p.inMin, until)} />
                    </>
                  ) : (
                    <span
                      className={cn("absolute top-1/2 -translate-y-1/2 pl-3 text-[12px] font-medium whitespace-nowrap", off ? "text-ink-3" : "text-st-absent-fg")}
                      style={{ left: `${pct(p.shiftStart ?? 9 * 60 + 30)}%` }}
                    >
                      {off ? "Day off" : "Not punched in yet"}
                    </span>
                  )}
                  {nowInRange && <span className="absolute -inset-y-[3px] w-0.5 -translate-x-1/2 rounded-full bg-ink" style={{ left: `${pct(team.nowMin)}%` }} />}
                </span>

                <span className={cn("hidden text-right text-body tabular-nums sm:block", p.inTime ? (late ? "font-medium text-st-late-fg" : "text-ink-2") : "text-ink-3")}>{p.inTime ?? "—"}</span>
                <StatusChip status={p.status} className="col-start-2 row-start-1 sm:col-auto sm:row-auto sm:w-36 sm:justify-center" />
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
