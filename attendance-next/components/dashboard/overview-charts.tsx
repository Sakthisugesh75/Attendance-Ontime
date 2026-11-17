"use client";

import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from "recharts";
import type { MixKey, Overview, TrendPoint } from "@/lib/attendance/overview";
import { formatDate, formatDuration, WEEKDAYS, weekdayOf } from "@/lib/time";
import { cn } from "@/lib/utils";

const AXIS = { fontSize: 12, fill: "var(--ad-text-muted)" };
/** 45° hatch for off days, in the hairline colour (DESIGN.md §4.3). */
const HATCH = "bg-[repeating-linear-gradient(135deg,var(--ad-border)_0_1px,transparent_1px_5px)]";

/** Recessive tooltip card: text in text colours, series identified by a swatch. */
function TipCard({ title, rows }: { title: string; rows: { label: string; value: string; color?: string }[] }) {
  return (
    <div className="min-w-40 rounded-md border border-line bg-raised px-3 py-2 text-caption text-ink shadow-md">
      <p className="mb-1 font-semibold tabular-nums">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="flex items-center gap-2">
          {r.color && <span aria-hidden className="size-2 rounded-full" style={{ background: r.color }} />}
          <span className="text-ink-3">{r.label}</span>
          <span className="ml-auto font-semibold tabular-nums">{r.value}</span>
        </p>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Daily attendance trend
// ---------------------------------------------------------------------------

/** Columns per day: on time + late stacked = present. Off days are shaded and left empty. */
export function TrendChart({ data, until }: { data: TrendPoint[]; until: string }) {
  const rows = data.map((d) => {
    const show = !d.off && d.date <= until;
    return { ...d, onTime: show ? Math.max(0, d.present - d.late) : 0, lateV: show ? d.late : 0 };
  });
  const offDays = data.filter((d) => d.off && d.date <= until);
  const max = Math.max(1, ...data.map((d) => d.expected), ...data.map((d) => d.present));

  return (
    <div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-ink-2">
        {[
          { label: "On time (incl. WFH / on duty)", color: "var(--viz-present)" },
          { label: "Late", color: "var(--viz-late)" },
        ].map((i) => (
          <li key={i.label} className="flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-xs" style={{ background: i.color }} />
            {i.label}
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <span aria-hidden className={`size-2.5 rounded-xs bg-sunken ring-1 ring-line ${HATCH}`} />
          Holiday / weekly off
        </li>
      </ul>
      <div className="mt-3 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: -20 }} barCategoryGap="22%">
            <CartesianGrid vertical={false} stroke="var(--viz-grid)" strokeDasharray="0" />
            {offDays.map((d) => (
              <ReferenceArea key={d.date} x1={d.day} x2={d.day} fill="var(--ad-surface-sunken)" fillOpacity={1} ifOverflow="extendDomain" />
            ))}
            <XAxis dataKey="day" tick={AXIS} tickLine={false} axisLine={{ stroke: "var(--viz-grid)" }} interval="preserveStartEnd" minTickGap={6} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} domain={[0, max]} width={44} />
            <Tooltip
              cursor={{ fill: "var(--ad-surface-sunken)", fillOpacity: 0.8 }}
              content={({ active, payload }: TooltipProps<number, string>) => {
                const p = payload?.[0]?.payload as TrendPoint | undefined;
                if (!active || !p) return null;
                const title = `${WEEKDAYS[weekdayOf(p.date)]!.slice(0, 3)}, ${formatDate(p.date)}`;
                if (p.date > until) return <TipCard title={title} rows={[{ label: "Upcoming", value: "" }]} />;
                if (p.off) return <TipCard title={title} rows={[{ label: "Holiday / weekly off", value: "" }]} />;
                return (
                  <TipCard
                    title={title}
                    rows={[
                      { label: "Present", value: `${p.present} of ${p.expected}` },
                      { label: "On time", value: String(Math.max(0, p.present - p.late)), color: "var(--viz-present)" },
                      { label: "Late", value: String(p.late), color: "var(--viz-late)" },
                    ]}
                  />
                );
              }}
            />
            {/* 2px card-coloured stroke = the gap between stacked segments */}
            <Bar dataKey="onTime" stackId="day" fill="var(--viz-present)" stroke="var(--ad-surface)" strokeWidth={1} maxBarSize={22} isAnimationActive={false} />
            <Bar dataKey="lateV" stackId="day" fill="var(--viz-late)" stroke="var(--ad-surface)" strokeWidth={1} radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Late arrivals by employee
// ---------------------------------------------------------------------------

export function LateByEmployeeChart({ data }: { data: Overview["lateByEmployee"] }) {
  if (!data.length) return <p className="py-10 text-center text-body text-ink-2">Nobody was late this month.</p>;
  const rows = data.slice(0, 10).map((d) => ({ ...d, short: d.name.length > 18 ? `${d.name.slice(0, 17)}…` : d.name }));
  return (
    <div style={{ height: rows.length * 34 + 16 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 32, bottom: 0, left: 0 }} barCategoryGap={8}>
          <XAxis type="number" hide allowDecimals={false} />
          <YAxis type="category" dataKey="short" tick={{ ...AXIS, fill: "var(--ad-text-secondary)" }} tickLine={false} axisLine={false} width={136} />
          <Tooltip
            cursor={{ fill: "var(--ad-surface-sunken)", fillOpacity: 0.8 }}
            content={({ active, payload }: TooltipProps<number, string>) => {
              const p = payload?.[0]?.payload as (typeof rows)[number] | undefined;
              if (!active || !p) return null;
              return (
                <TipCard
                  title={p.name}
                  rows={[
                    { label: "Late days", value: String(p.count), color: "var(--viz-late)" },
                    { label: "Total late time", value: formatDuration(p.minutes) },
                  ]}
                />
              );
            }}
          />
          <Bar
            dataKey="count"
            fill="var(--viz-late)"
            radius={[0, 4, 4, 0]}
            maxBarSize={18}
            isAnimationActive={false}
            label={{ position: "right", fontSize: 12, fill: "var(--ad-text)", className: "tabular-nums" }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Leave, absence & remote-work mix
// ---------------------------------------------------------------------------

const MIX_META: Record<MixKey, { label: string; color: string }> = {
  LEAVE: { label: "Leave", color: "var(--viz-leave)" },
  HALF_DAY: { label: "Half day", color: "var(--viz-half)" },
  WFH: { label: "WFH", color: "var(--viz-wfh)" },
  ON_DUTY: { label: "On duty", color: "var(--viz-duty)" },
  ABSENT: { label: "Absent", color: "var(--viz-absent)" },
  PERMISSION: { label: "Permission", color: "var(--viz-permission)" },
};

export function MixDonut({ data }: { data: Overview["mix"] }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  if (!total) return <p className="py-10 text-center text-body text-ink-2">No leave, absence or remote days this month.</p>;
  const slices = data.filter((d) => d.count > 0);

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row">
      <div className="relative size-44 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={slices} dataKey="count" nameKey="key" innerRadius="64%" outerRadius="100%" paddingAngle={slices.length > 1 ? 2 : 0} stroke="var(--ad-surface)" strokeWidth={2} isAnimationActive={false}>
              {slices.map((s) => (
                <Cell key={s.key} fill={MIX_META[s.key].color} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }: TooltipProps<number, string>) => {
                const p = payload?.[0]?.payload as Overview["mix"][number] | undefined;
                if (!active || !p) return null;
                return <TipCard title={MIX_META[p.key].label} rows={[{ label: "Days", value: `${p.count} · ${Math.round((p.count / total) * 100)}%`, color: MIX_META[p.key].color }]} />;
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <span>
            <span className="block text-title-1 text-ink tabular-nums">{total}</span>
            <span className="block text-caption text-ink-3">days</span>
          </span>
        </div>
      </div>
      {/* Legend doubles as the data table */}
      <ul className="w-full space-y-2 text-body">
        {data.map((d) => (
          <li key={d.key} className={cn("flex items-center gap-2.5", d.count ? "text-ink" : "text-ink-3")}>
            <span aria-hidden className="size-2.5 rounded-xs" style={{ background: MIX_META[d.key].color }} />
            <span className="flex-1">{MIX_META[d.key].label}</span>
            <span className="font-semibold tabular-nums">{d.count}</span>
            <span className="w-10 text-right text-caption text-ink-3 tabular-nums">{total ? `${Math.round((d.count / total) * 100)}%` : ""}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Working-hours heatmap (calendar)
// ---------------------------------------------------------------------------

/** Monday-first weeks (DESIGN.md §7). */
const HEAD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
/** Sequential, butter to deep amber (charts only, not a status): light -> dark by average hours. */
const STEPS = [
  { min: 0, label: "< 6h", mix: 18 },
  { min: 360, label: "6–7h", mix: 38 },
  { min: 420, label: "7–8h", mix: 58 },
  { min: 480, label: "8–9h", mix: 78 },
  { min: 540, label: "9h +", mix: 100 },
];
const stepFor = (m: number) => [...STEPS].reverse().find((s) => m >= s.min)!;
const stepBg = (mix: number) => `color-mix(in oklch, var(--ad-late) ${mix}%, var(--ad-surface-raised))`;

export function HoursHeatmap({ data }: { data: Overview["hours"] }) {
  const lead = data.length ? (weekdayOf(data[0]!.date) + 6) % 7 : 0;
  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5">
        {HEAD.map((h) => (
          <div key={h} aria-hidden className="pb-1 text-center text-col-header text-ink-3">
            {h.slice(0, 1)}
            <span className="hidden sm:inline">{h.slice(1)}</span>
          </div>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <div key={`lead-${i}`} />
        ))}
        {data.map((d) => {
          const step = d.avgMinutes !== null ? stepFor(d.avgMinutes) : null;
          const label = d.future ? "Upcoming" : d.off ? "Holiday / weekly off" : d.avgMinutes !== null ? `Avg ${formatDuration(d.avgMinutes)} · ${d.people} people` : "No completed days";
          return (
            <div
              key={d.date}
              title={`${formatDate(d.date)} · ${label}`}
              aria-label={`${formatDate(d.date)}: ${label}`}
              className={`text-caption ${cn(
                "grid aspect-square place-items-center rounded-xs border border-transparent",
                step ? (step.mix >= 58 ? "text-on-butter" : "text-ink") : "text-ink-3",
                !step && d.future && "border-dashed border-line bg-surface",
                !step && !d.future && (d.off ? `bg-sunken ${HATCH}` : "bg-sunken"),
              )}`}
              style={step ? { background: stepBg(step.mix) } : undefined}
            >
              <span className="tabular-nums">{Number(d.date.slice(8))}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-caption text-ink-2">
        <span>Avg hours worked:</span>
        {STEPS.map((s) => (
          <span key={s.label} className="flex items-center gap-1">
            <span aria-hidden className="size-3 rounded-xs" style={{ background: stepBg(s.mix) }} />
            <span className="tabular-nums">{s.label}</span>
          </span>
        ))}
        <span className="flex items-center gap-1">
          <span aria-hidden className={`size-3 rounded-xs bg-sunken ring-1 ring-line ${HATCH}`} /> Off day
        </span>
      </div>
    </div>
  );
}
