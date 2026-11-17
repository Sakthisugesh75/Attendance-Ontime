import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type StatTone = "present" | "absent" | "late" | "halfday" | "leave" | "holiday" | "weeklyoff" | "pending";

/** Icon tile colours: the status tint with its fg (DESIGN.md §4.6). Neutral when no tone. */
const TILE: Record<StatTone, string> = {
  present: "bg-st-present-tint text-st-present-fg",
  absent: "bg-st-absent-tint text-st-absent-fg",
  late: "bg-st-late-tint text-st-late-fg",
  halfday: "bg-st-halfday-tint text-st-halfday-fg",
  leave: "bg-st-leave-tint text-st-leave-fg",
  holiday: "bg-st-holiday-tint text-st-holiday-fg",
  weeklyoff: "bg-st-weeklyoff-tint text-st-weeklyoff-fg",
  pending: "bg-st-pending-tint text-st-pending-fg",
};

/**
 * Stat card (DESIGN.md §4.6): label + 32px tinted icon tile, display value, caption context.
 * A trailing "AM"/"PM" on the value is set smaller so times fit two-up on a phone.
 */
export function StatCard({ icon: Icon, label, value, hint, tone, className }: { icon: LucideIcon; label: string; value: string; hint?: string; tone?: StatTone; className?: string }) {
  const time = /^(.+) (AM|PM)$/.exec(value);
  return (
    <div className={cn("flex min-w-0 flex-col rounded-xl bg-surface p-4 shadow-card sm:p-5", className)}>
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 pt-1.5 text-label font-normal text-ink-2">{label}</p>
        <span aria-hidden className={cn("grid size-9 shrink-0 place-items-center rounded-full", tone ? TILE[tone] : "border border-line bg-glass text-ink-2")}>
          <Icon className="size-4" />
        </span>
      </div>
      <p className="mt-2 text-[32px] leading-10 font-light tracking-[-0.04em] text-ink tabular-nums sm:text-display">
        {time ? (
          <>
            {time[1]}
            <span className="ml-1 text-m-meta tracking-normal text-ink-2">{time[2]}</span>
          </>
        ) : (
          value
        )}
      </p>
      {hint && <p className="mt-1 text-caption text-ink-3 tabular-nums">{hint}</p>}
    </div>
  );
}
