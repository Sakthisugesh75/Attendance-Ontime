"use client";

import { MessageSquareText, PencilLine, TriangleAlert } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { StatusChip } from "@/components/attendance/status-chip";
import { EmployeeAvatar } from "@/components/employees/employee-avatar";
import type { MusterCell, MusterData, MusterRow } from "@/lib/reports/muster";
import { STATUS_META } from "@/lib/status";
import { formatClock, formatDate, formatDuration, WEEKDAYS } from "@/lib/time";
import { cn } from "@/lib/utils";

type TotalKey = keyof MusterRow["totals"];

/** Totals that scroll with the days (shown after the last day). */
const EXTRA_TOTALS: { key: TotalKey; label: string; title: string }[] = [
  { key: "half", label: "H", title: "Half days" },
  { key: "wfh", label: "WFH", title: "Work from home" },
  { key: "od", label: "OD", title: "On duty" },
  { key: "lop", label: "LOP", title: "Loss of pay: absent + unpaid leave" },
  { key: "workedMinutes", label: "Hrs", title: "Hours worked" },
  { key: "overtimeMinutes", label: "OT", title: "Overtime hours" },
];

/** The summary column (DESIGN.md §4.3): sticky on the right from 1024px. */
const SUMMARY_TOTALS: { key: TotalKey; label: string; title: string; fg: string }[] = [
  { key: "present", label: "P", title: "Present (incl. late)", fg: "text-st-present-fg" },
  { key: "absent", label: "A", title: "Absent", fg: "text-st-absent-fg" },
  { key: "late", label: "L", title: "Late", fg: "text-st-late-fg" },
  { key: "leave", label: "LV", title: "Leave days", fg: "text-st-leave-fg" },
];
/** Width of one summary column in px; the sticky offsets are multiples of it. */
const SUMMARY_W = 44;

const hours = (m: number) => (m ? (Math.round((m / 60) * 10) / 10).toString() : "0");

/** Weekly-off hatch (45°, hairline colour) so weekly offs read as different even in greyscale. */
const HATCH = "bg-[repeating-linear-gradient(45deg,transparent_0_4px,var(--ad-border)_4px_5px)]";

const missingOut = (c: MusterCell, today: boolean) => c.s === "MISSING_PUNCH_OUT" || (c.in !== null && c.out === null && !today);

function describe(name: string, date: string, c: MusterCell, holiday: string | null) {
  const parts = [`${name}, ${formatDate(date)}`];
  if (c.s) parts.push(STATUS_META[c.s].label);
  else if (c.off) parts.push(holiday ?? "Off day");
  else parts.push("No status yet");
  if (c.in !== null) parts.push(`${formatClock(c.in)} – ${c.out !== null ? formatClock(c.out) : "no punch-out"}`);
  if (c.worked) parts.push(formatDuration(c.worked));
  if (c.late) parts.push(`late by ${formatDuration(c.late)}`);
  if (c.edited) parts.push("edited by HR");
  if (c.note) parts.push("has a remark");
  return parts.join(" · ");
}

type Tip = { r: number; c: number; x: number; y: number; below: boolean };

/**
 * The monthly calendar grid (DESIGN.md §4.3): employees × days with a sticky name column, a
 * sticky date header and a sticky summary column. Each day is a 36px tinted cell carrying its
 * status letter. Hover or focus shows the day's detail; arrow keys move, Enter opens the day.
 */
export function MusterGrid({ data, rows, onOpen }: { data: MusterData; rows: MusterRow[]; onOpen: (employeeId: number, date: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const selectable = (c: MusterCell, ci: number) => !data.dates[ci]!.future && c.s !== "NOT_JOINED" && c.s !== "EXITED";
  // The first selectable cell is the grid's single Tab stop until another cell gets focus.
  const firstRow = rows.findIndex((r) => r.cells.some(selectable));
  const first = firstRow >= 0 ? [firstRow, rows[firstRow]!.cells.findIndex(selectable)] : [-1, -1];

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const r = Number(el.dataset.r);
      const c = Number(el.dataset.c);
      if (Number.isNaN(r) || Number.isNaN(c)) return;
      if (e.key === "Escape") {
        setTip(null);
        return;
      }
      const moves: Record<string, [number, number]> = { ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0] };
      let step = moves[e.key];
      let [nr, nc] = [r, c];
      if (e.key === "Home") [nr, nc, step] = [r, -1, [0, 1]];
      if (e.key === "End") [nr, nc, step] = [r, data.dates.length, [0, -1]];
      if (!step) return;
      e.preventDefault();
      // Skip cells that aren't selectable (upcoming days, before joining).
      for (let i = 0; i < 40; i++) {
        nr += step[0];
        nc += step[1];
        if (nr < 0 || nr >= rows.length || nc < 0 || nc >= data.dates.length) return;
        const next = ref.current?.querySelector<HTMLButtonElement>(`button[data-r="${nr}"][data-c="${nc}"]`);
        if (next) {
          next.focus();
          next.scrollIntoView({ block: "nearest", inline: "nearest" });
          return;
        }
      }
    },
    [data.dates.length, rows.length],
  );

  const showTip = (el: HTMLElement) => {
    const r = Number(el.dataset.r);
    const c = Number(el.dataset.c);
    if (Number.isNaN(r) || Number.isNaN(c)) return;
    const rect = el.getBoundingClientRect();
    const below = rect.top < 170;
    setTip({ r, c, x: rect.left + rect.width / 2, y: below ? rect.bottom + 8 : rect.top - 8, below });
  };

  const tipRow = tip ? rows[tip.r] : undefined;
  const tipCell = tip && tipRow ? tipRow.cells[tip.c] : undefined;
  const tipDate = tip ? data.dates[tip.c] : undefined;

  return (
    <>
      <div
        ref={ref}
        className="max-h-[min(72vh,52rem)] overflow-auto overscroll-x-contain bg-surface"
        onKeyDown={onKeyDown}
        onScroll={() => tip && setTip(null)}
        onMouseOver={(e) => {
          const btn = (e.target as HTMLElement).closest<HTMLElement>("button[data-r]");
          if (btn) showTip(btn);
          else if (tip) setTip(null);
        }}
        onMouseLeave={() => setTip(null)}
        onFocus={(e) => {
          const el = e.target as HTMLElement;
          if (el.dataset.r !== undefined && el.matches(":focus-visible")) showTip(el);
        }}
        onBlur={() => setTip(null)}
      >
        <table className="w-max border-separate border-spacing-0 text-cell" aria-label="Muster roll" aria-rowcount={rows.length + 1}>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky top-0 left-0 z-30 h-14 w-36 min-w-36 border-r border-b border-line bg-sunken px-3 pb-2 text-left align-bottom text-col-header text-ink-3 sm:w-[220px] sm:min-w-[220px] sm:px-4"
              >
                Employee
              </th>
              {data.dates.map((d) => (
                <th
                  key={d.date}
                  scope="col"
                  title={`${WEEKDAYS[d.weekday]}, ${formatDate(d.date)}${d.holiday ? ` · ${d.holiday}` : ""}`}
                  className={cn(
                    "sticky top-0 z-20 h-14 w-[38px] min-w-[38px] border-b border-line bg-sunken px-0 pb-1.5 text-center align-bottom font-normal",
                    d.off ? "text-ink-3" : "text-ink-2",
                  )}
                >
                  {d.today && <span aria-hidden className="absolute inset-0 bg-brand-subtle" />}
                  <span className="relative block text-caption">{WEEKDAYS[d.weekday]!.slice(0, 1)}</span>
                  <span
                    className={cn(
                      "relative mx-auto mt-0.5 grid size-7 place-items-center rounded-full text-caption font-semibold tabular-nums",
                      d.today && "text-brand-ink ring-2 ring-brand",
                      d.future && !d.today && "font-medium text-ink-3",
                    )}
                  >
                    {String(d.day).padStart(2, "0")}
                  </span>
                </th>
              ))}
              {EXTRA_TOTALS.map((t, i) => (
                <th
                  key={t.key}
                  scope="col"
                  className={cn("sticky top-0 z-20 h-14 min-w-11 border-b border-line bg-sunken px-2 pb-2 text-right align-bottom text-col-header text-ink-3", i === 0 && "border-l pl-3")}
                >
                  <abbr title={t.title} className="no-underline">
                    {t.label}
                  </abbr>
                </th>
              ))}
              {SUMMARY_TOTALS.map((t, i) => (
                <th
                  key={t.key}
                  scope="col"
                  style={{ "--r": `${(SUMMARY_TOTALS.length - 1 - i) * SUMMARY_W}px`, width: SUMMARY_W, minWidth: SUMMARY_W } as React.CSSProperties}
                  className={cn(
                    "sticky top-0 z-20 h-14 border-b border-line bg-sunken px-2 pb-2 text-right align-bottom text-col-header text-ink-3 lg:right-(--r) lg:z-30",
                    i === 0 && "border-l border-line",
                    i === SUMMARY_TOTALS.length - 1 && "pr-3",
                  )}
                >
                  <abbr title={t.title} className="no-underline">
                    {t.label}
                  </abbr>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={row.id} className="group/row">
                <th
                  scope="row"
                  className="sticky left-0 z-10 h-[38px] w-36 max-w-36 min-w-36 border-r border-line bg-raised px-3 text-left font-normal group-hover/row:bg-sunken sm:w-[220px] sm:max-w-[220px] sm:min-w-[220px] sm:px-4"
                >
                  <span className="flex items-center gap-2.5">
                    <span aria-hidden className="hidden shrink-0 sm:block">
                      <EmployeeAvatar name={row.name} photo={null} className="size-7" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-cell font-medium text-ink">{row.name}</span>
                      <span className="block truncate text-caption text-ink-3 tabular-nums [font-feature-settings:'zero']">
                        {row.code}
                        {row.department ? ` · ${row.department}` : ""}
                      </span>
                    </span>
                  </span>
                </th>
                {row.cells.map((c, ci) => {
                  const d = data.dates[ci]!;
                  const outside = c.s === "NOT_JOINED" || c.s === "EXITED";
                  const meta = c.s ? STATUS_META[c.s] : null;
                  const weeklyOff = c.s === "WEEKLY_OFF" || (!c.s && c.off && !d.holiday);
                  return (
                    <td key={d.date} className={cn("relative h-[38px] p-px", d.today && "bg-brand-subtle")}>
                      {!selectable(c, ci) ? (
                        <span
                          className={cn("mx-auto block size-9 rounded-xs", outside ? "bg-sunken" : "border border-dashed border-line bg-surface")}
                          title={outside ? "Not employed" : undefined}
                        />
                      ) : (
                        <button
                          type="button"
                          data-r={ri}
                          data-c={ci}
                          tabIndex={ri === first[0] && ci === first[1] ? 0 : -1}
                          onFocus={(e) => {
                            // Roving tab stop: the focused cell is the one Tab returns to.
                            ref.current?.querySelectorAll<HTMLButtonElement>("button[data-r]").forEach((b) => (b.tabIndex = -1));
                            e.currentTarget.tabIndex = 0;
                          }}
                          onClick={() => {
                            setTip(null);
                            onOpen(row.id, d.date);
                          }}
                          aria-label={describe(row.name, d.date, c, d.holiday)}
                          className={cn(
                            "relative mx-auto grid size-9 place-items-center overflow-hidden rounded-xs text-caption font-semibold tracking-[0.02em] outline-none",
                            "transition-shadow duration-[120ms] hover:ring-1 hover:ring-line-strong focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
                            meta ? meta.cell : c.off ? (d.holiday ? "bg-st-holiday-tint text-st-holiday-fg" : "bg-st-weeklyoff-tint text-st-weeklyoff-fg") : "border border-line bg-surface text-ink-3",
                            weeklyOff && HATCH,
                          )}
                        >
                          <span className="relative">{meta?.short ?? (c.off ? (d.holiday ? "HO" : "WO") : "·")}</span>
                          {c.edited && <span aria-hidden className="absolute top-[3px] right-[3px] size-[5px] rounded-full bg-ink-3" />}
                          {missingOut(c, d.today) && <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 bg-danger" />}
                        </button>
                      )}
                    </td>
                  );
                })}
                {EXTRA_TOTALS.map((t, i) => {
                  const v = row.totals[t.key];
                  const text = t.key === "workedMinutes" || t.key === "overtimeMinutes" ? hours(v) : String(v);
                  return (
                    <td
                      key={t.key}
                      className={cn(
                        "h-[38px] px-2 text-right text-cell tabular-nums group-hover/row:bg-sunken",
                        i === 0 && "border-l border-line pl-3",
                        v ? "text-ink-2" : "text-ink-3",
                        t.key === "lop" && v > 0 && "font-semibold text-danger",
                      )}
                    >
                      {text}
                    </td>
                  );
                })}
                {SUMMARY_TOTALS.map((t, i) => {
                  const v = row.totals[t.key];
                  return (
                    <td
                      key={t.key}
                      style={{ "--r": `${(SUMMARY_TOTALS.length - 1 - i) * SUMMARY_W}px`, width: SUMMARY_W, minWidth: SUMMARY_W } as React.CSSProperties}
                      className={cn(
                        "h-[38px] bg-surface px-2 text-right text-cell font-semibold tabular-nums group-hover/row:bg-sunken lg:sticky lg:right-(--r) lg:z-10",
                        i === 0 && "border-l border-line",
                        i === SUMMARY_TOTALS.length - 1 && "pr-3",
                        v ? t.fg : "font-normal text-ink-3",
                      )}
                    >
                      {v}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {tip && tipRow && tipCell && tipDate && (
        <div
          aria-hidden
          className="pointer-events-none fixed z-[70] w-64 rounded-md border border-line bg-raised p-3 text-body text-ink shadow-md"
          style={{ left: Math.min(Math.max(tip.x, 136), (typeof window !== "undefined" ? window.innerWidth : 1200) - 136), top: tip.y, transform: `translate(-50%, ${tip.below ? "0" : "-100%"})` }}
        >
          <p className="text-caption text-ink-3 tabular-nums">
            {WEEKDAYS[tipDate.weekday]}, {formatDate(tipDate.date)}
          </p>
          <p className="mt-0.5 truncate font-medium">{tipRow.name}</p>
          <div className="mt-2">
            <StatusChip status={tipCell.s} label={tipCell.s ? undefined : tipCell.off ? (tipDate.holiday ?? "Weekly off") : "No status yet"} />
          </div>
          {(tipCell.in !== null || tipCell.worked > 0) && (
            <dl className="mt-2.5 grid grid-cols-3 gap-2 border-t border-line pt-2.5">
              <div>
                <dt className="text-caption text-ink-3">In</dt>
                <dd className="text-cell font-medium tabular-nums">{tipCell.in !== null ? formatClock(tipCell.in) : "—"}</dd>
              </div>
              <div>
                <dt className="text-caption text-ink-3">Out</dt>
                <dd className={cn("text-cell font-medium tabular-nums", tipCell.in !== null && tipCell.out === null && !tipDate.today && "text-danger")}>
                  {tipCell.out !== null ? formatClock(tipCell.out) : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-caption text-ink-3">Worked</dt>
                <dd className="text-cell font-medium tabular-nums">{tipCell.worked ? formatDuration(tipCell.worked) : "—"}</dd>
              </div>
            </dl>
          )}
          {(tipCell.late > 0 || tipCell.edited || tipCell.note || missingOut(tipCell, tipDate.today)) && (
            <ul className="mt-2 space-y-1 text-caption text-ink-2">
              {tipCell.late > 0 && <li className="tabular-nums text-st-late-fg">Late by {formatDuration(tipCell.late)}</li>}
              {missingOut(tipCell, tipDate.today) && (
                <li className="flex items-center gap-1.5 text-danger">
                  <TriangleAlert className="size-3.5" /> No punch-out recorded
                </li>
              )}
              {tipCell.edited && (
                <li className="flex items-center gap-1.5">
                  <PencilLine className="size-3.5 text-ink-3" /> Edited by HR
                </li>
              )}
              {tipCell.note && (
                <li className="flex items-center gap-1.5">
                  <MessageSquareText className="size-3.5 text-ink-3" /> Has a remark (open the day to read it)
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </>
  );
}
