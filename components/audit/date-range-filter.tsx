"use client";

import { CalendarRange, X } from "lucide-react";
import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { addDays, formatDate, istDate } from "@/lib/time";
import { cn } from "@/lib/utils";

const pad = (n: number) => String(n).padStart(2, "0");
/** Calendar days are local Dates; the URL holds IST calendar dates ("YYYY-MM-DD"). */
const toYmd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromYmd = (s: string) => {
  const [y, m, d] = s.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
};

export function rangeLabel(from?: string, to?: string): string {
  if (!from && !to) return "Any date";
  if (from && to && from === to) return formatDate(from);
  if (from && to) return from.slice(0, 4) === to.slice(0, 4) ? `${formatDate(from).slice(0, 6)} – ${formatDate(to)}` : `${formatDate(from)} – ${formatDate(to)}`;
  return from ? `From ${formatDate(from)}` : `Until ${formatDate(to)}`;
}

export function DateRangeFilter({ from, to, onChange }: { from?: string; to?: string; onChange: (from?: string, to?: string) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>(undefined);
  const today = istDate();
  const selected = draft ?? (from ? { from: fromYmd(from), to: to ? fromYmd(to) : undefined } : undefined);

  const apply = (f?: string, t?: string) => {
    onChange(f, t);
    setDraft(undefined);
    setOpen(false);
  };

  const presets: [string, string, string][] = [
    ["Today", today, today],
    ["Last 7 days", addDays(today, -6), today],
    ["Last 30 days", addDays(today, -29), today],
    ["This month", `${today.slice(0, 7)}-01`, today],
  ];

  return (
    <div className="flex items-center">
      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setDraft(undefined);
        }}
      >
        <PopoverTrigger asChild>
          <Button variant="outline" className={cn("justify-start gap-2 font-normal text-ink", (from || to) && "rounded-r-none border-r-0", !(from || to) && "text-ink-2")} aria-label={`Date range: ${rangeLabel(from, to)}`}>
            <CalendarRange aria-hidden className="size-4 text-ink-3" />
            <span className="truncate tabular-nums">{rangeLabel(from, to)}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto border-line bg-raised p-0 shadow-md">
          <div className="flex flex-col sm:flex-row">
            <div className="flex flex-wrap gap-1 border-b border-line p-2 sm:w-36 sm:flex-col sm:border-r sm:border-b-0">
              {presets.map(([label, f, t]) => (
                <Button key={label} variant="ghost" size="sm" className="justify-start" onClick={() => apply(f, t)}>
                  {label}
                </Button>
              ))}
            </div>
            <div>
              <Calendar
                mode="range"
                selected={selected}
                defaultMonth={selected?.from ?? fromYmd(today)}
                disabled={{ after: fromYmd(today) }}
                onSelect={(r) => setDraft(r)}
                className="p-3"
              />
              <div className="flex items-center justify-end gap-2 border-t border-line p-2">
                <Button variant="ghost" size="sm"
            className="max-sm:h-11" onClick={() => apply(undefined, undefined)}>
                  Any date
                </Button>
                <Button size="sm" disabled={!draft?.from} onClick={() => draft?.from && apply(toYmd(draft.from), toYmd(draft.to ?? draft.from))}>
                  Apply
                </Button>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
      {(from || to) && (
        <Button variant="outline" size="icon" className="rounded-l-none" aria-label="Clear date range" onClick={() => apply(undefined, undefined)}>
          <X />
        </Button>
      )}
    </div>
  );
}
