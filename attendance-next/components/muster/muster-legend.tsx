import type { AttendanceStatus } from "@prisma/client";
import { STATUS_META } from "@/lib/status";
import { cn } from "@/lib/utils";

const HATCH = "bg-[repeating-linear-gradient(45deg,transparent_0_4px,var(--ad-border)_4px_5px)]";

/** Core statuses first, then the variants that reuse a core palette (DESIGN.md §2.4). */
const LEGEND: AttendanceStatus[] = ["PRESENT", "ABSENT", "LATE", "HALF_DAY", "LEAVE", "HOLIDAY", "WEEKLY_OFF", "WFH", "ON_DUTY", "PERMISSION", "MISSING_PUNCH_OUT"];

function Swatch({ className, children }: { className?: string; children?: React.ReactNode }) {
  return <span className={cn("relative grid h-6 min-w-6 shrink-0 place-items-center overflow-hidden rounded-xs px-1 text-caption font-semibold tracking-[0.02em]", className)}>{children}</span>;
}

/**
 * Legend for the monthly grid (DESIGN.md §4.3): always visible above it. Every status is a tint
 * square with its letter and word, followed by the extra marks.
 */
export function MusterLegend() {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-2 text-caption text-ink-2" aria-label="Legend">
      {LEGEND.map((s) => (
        <li key={s} className="flex items-center gap-1.5">
          <Swatch className={cn(STATUS_META[s].cell, s === "WEEKLY_OFF" && HATCH)}>
            <span className="relative">{STATUS_META[s].short}</span>
          </Swatch>
          {STATUS_META[s].label}
        </li>
      ))}
      <li aria-hidden className="hidden h-4 w-px bg-line sm:block" />
      <li className="flex items-center gap-1.5">
        <Swatch className="bg-brand-subtle">
          <span className="size-3 rounded-full ring-2 ring-brand" />
        </Swatch>
        Today
      </li>
      <li className="flex items-center gap-1.5">
        <Swatch className="border border-line bg-surface">
          <span className="absolute top-[3px] right-[3px] size-[5px] rounded-full bg-ink-3" />
        </Swatch>
        Edited by HR
      </li>
      <li className="flex items-center gap-1.5">
        <Swatch className="border border-line bg-surface">
          <span className="absolute inset-x-0 bottom-0 h-0.5 bg-danger" />
        </Swatch>
        No punch-out
      </li>
      <li className="flex items-center gap-1.5">
        <Swatch className="border border-dashed border-line bg-surface" />
        Upcoming
      </li>
      <li className="flex items-center gap-1.5">
        <Swatch className="bg-sunken" />
        Not employed
      </li>
    </ul>
  );
}
