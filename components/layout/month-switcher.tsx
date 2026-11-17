"use client";

import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const shift = (month: string, by: number) => {
  const d = new Date(`${month}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + by);
  return d.toISOString().slice(0, 7);
};
const ym = (year: number, index: number) => `${year}-${String(index + 1).padStart(2, "0")}`;

/**
 * Month navigation for pages that read `?month=YYYY-MM`: arrows step a month, the centre opens
 * a year grid to jump anywhere, and "This month" comes back. Other query params are kept.
 * Arrow keys also step while the control has focus. Shows a spinner while the page loads.
 */
export function MonthSwitcher({
  month,
  current,
  max,
  min = "2020-01",
  param = "month",
  className,
}: {
  month: string;
  /** Today's month (IST), marked in the grid and used by "This month" */
  current: string;
  /** Latest month that can be chosen; omit to allow future months */
  max?: string;
  min?: string;
  param?: string;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(Number(month.slice(0, 4)));
  useEffect(() => setYear(Number(month.slice(0, 4))), [month, open]);

  const allowed = (m: string) => m >= min && (!max || m <= max);
  const go = (m: string) => {
    if (!allowed(m) || m === month) return;
    const next = new URLSearchParams(searchParams.toString());
    if (m === current) next.delete(param);
    else next.set(param, m);
    setOpen(false);
    start(() => router.push(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false }));
  };
  const prev = shift(month, -1);
  const next = shift(month, 1);
  const index = Number(month.slice(5, 7)) - 1;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        role="group"
        aria-label="Month"
        onKeyDown={(e) => {
          if (open || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
          e.preventDefault();
          go(e.key === "ArrowLeft" ? prev : next);
        }}
        className="flex h-10 items-center rounded-full border bg-card p-1 shadow-xs"
      >
        <StepButton label="Previous month" disabled={!allowed(prev)} onClick={() => go(prev)}>
          <ChevronLeft />
        </StepButton>

        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            aria-label={`Choose month, ${LONG[index]} ${month.slice(0, 4)}`}
            className="group flex h-8 min-w-36 items-center justify-center gap-2 rounded-full px-3 transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-muted"
          >
            {pending ? <Loader2 className="size-3.5 animate-spin text-muted-foreground" /> : <CalendarDays className="size-3.5 text-muted-foreground" />}
            <span className="font-display text-sm font-semibold tracking-tight">{LONG[index]}</span>
            <span className="tabular font-mono text-xs text-muted-foreground">{month.slice(0, 4)}</span>
            <ChevronDown className="size-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
          </PopoverTrigger>
          <PopoverContent align="center" collisionPadding={16} className="w-72 rounded-2xl p-0">
            <div className="flex items-center justify-between border-b px-3 py-2.5">
              <StepButton label="Previous year" disabled={`${year - 1}-12` < min} onClick={() => setYear(year - 1)}>
                <ChevronLeft />
              </StepButton>
              <span className="tabular font-display text-base font-semibold">{year}</span>
              <StepButton label="Next year" disabled={!!max && `${year + 1}-01` > max} onClick={() => setYear(year + 1)}>
                <ChevronRight />
              </StepButton>
            </div>
            <div className="grid grid-cols-3 gap-1.5 p-3">
              {SHORT.map((label, i) => {
                const m = ym(year, i);
                const selected = m === month;
                const isCurrent = m === current;
                return (
                  <button
                    key={m}
                    type="button"
                    disabled={!allowed(m)}
                    aria-pressed={selected}
                    aria-label={`${LONG[i]} ${year}`}
                    onClick={() => go(m)}
                    className={cn(
                      "relative h-11 rounded-xl text-sm font-medium transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      selected ? "bg-foreground text-background shadow-sm" : "hover:bg-muted",
                      isCurrent && !selected && "ring-1 ring-foreground/20",
                      "disabled:pointer-events-none disabled:opacity-30",
                    )}
                  >
                    {label}
                    {isCurrent && <span aria-hidden className={cn("absolute top-1.5 right-1.5 size-1.5 rounded-full", selected ? "bg-brand" : "bg-brand ring-1 ring-foreground/30")} />}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-brand ring-1 ring-foreground/30" /> This month
              </span>
              <button
                type="button"
                onClick={() => go(current)}
                disabled={month === current}
                className="rounded-md px-2 py-1 font-medium text-foreground hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
              >
                Jump to {SHORT[Number(current.slice(5, 7)) - 1]} {current.slice(0, 4)}
              </button>
            </div>
          </PopoverContent>
        </Popover>

        <StepButton label="Next month" disabled={!allowed(next)} onClick={() => go(next)}>
          <ChevronRight />
        </StepButton>
      </div>

      {month !== current && (
        <button
          type="button"
          onClick={() => go(current)}
          className="rise h-8 rounded-full bg-brand px-3 text-xs font-semibold text-brand-foreground shadow-xs transition-transform hover:-translate-y-px"
        >
          This month
        </button>
      )}
    </div>
  );
}

function StepButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-8 place-items-center rounded-full text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-30 [&_svg]:size-4"
    >
      {children}
    </button>
  );
}
