"use client";

import { Download, ListChecks, Search, Users, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { MonthSwitcher } from "@/components/layout/month-switcher";
import { EmptyState, PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { MusterData } from "@/lib/reports/muster";
import { monthDates, monthLabel } from "@/lib/time";
import { cn } from "@/lib/utils";
import { BulkMarkDialog } from "./bulk-mark-dialog";
import { DaySheet } from "./day-sheet";
import { MusterGrid } from "./muster-grid";
import { MusterLegend } from "./muster-legend";

/** `canEdit` / `canExport` only hide buttons; the actions and the export route check permissions and reach. */
export function MusterView({
  data,
  departments,
  department,
  initialQuery,
  canEdit,
  canExport,
}: {
  data: MusterData;
  departments: { id: number; name: string }[];
  department: number | null;
  initialQuery: string;
  canEdit: boolean;
  canExport: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(initialQuery);
  const [open, setOpen] = useState<{ employeeId: number; date: string } | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);

  const currentMonth = data.today.slice(0, 7);
  const dates = monthDates(data.month);

  const go = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === "") next.delete(k);
      else next.set(k, v);
    }
    start(() => router.push(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false }));
  };

  // Search filters on the client; the URL keeps it for sharing / reloads.
  useEffect(() => {
    const id = setTimeout(() => {
      const next = new URLSearchParams(window.location.search);
      if (q) next.set("q", q);
      else next.delete("q");
      window.history.replaceState(null, "", `${pathname}${next.size ? `?${next}` : ""}`);
    }, 250);
    return () => clearTimeout(id);
  }, [q, pathname]);

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? data.rows.filter((r) => r.name.toLowerCase().includes(t) || r.code.toLowerCase().includes(t)) : data.rows;
  }, [data.rows, q]);

  const exportHref = `/api/export/muster-xlsx?from=${dates[0]}&to=${dates.at(-1)}`;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="People · monthly register"
        title="Muster roll"
        description="Everyone's month at a glance. Select a day to see punches and history, or to correct it."
        actions={
          <>
            {canExport && (
              <Button variant="outline" className="h-11 sm:h-10" asChild>
                <a href={exportHref} download>
                  <Download /> Excel (old layout)
                </a>
              </Button>
            )}
            {canEdit && (
              <Button className="h-11 sm:h-10" onClick={() => setBulkOpen(true)}>
                <ListChecks /> Bulk mark
              </Button>
            )}
          </>
        }
      />

      <section className="overflow-hidden rounded-xl bg-surface shadow-card">
        {/* Toolbar (DESIGN.md §4.3): month stepper, department, search, count */}
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5 sm:px-4">
          <MonthSwitcher month={data.month} current={currentMonth} />
          <Select value={department ? String(department) : "all"} onValueChange={(v) => go({ dept: v === "all" ? undefined : v })}>
            <SelectTrigger className="w-full min-w-0 sm:w-48" aria-label="Department">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All departments</SelectItem>
              {departments.map((d) => (
                <SelectItem key={d.id} value={String(d.id)}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative w-full sm:w-60">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or code" className="pl-9" aria-label="Search employees" />
          </div>
          {(q || department) && (
            <Button
              variant="ghost"
              className="h-11 sm:h-8"
              onClick={() => {
                setQ("");
                go({ dept: undefined, q: undefined });
              }}
            >
              <X /> Clear
            </Button>
          )}
          <p className="ml-auto hidden text-caption text-ink-3 lg:block">
            <span className="tabular-nums">{rows.length}</span> {rows.length === 1 ? "person" : "people"} · <span className="tabular-nums">{monthLabel(data.month)}</span>
          </p>
        </div>

        {/* Legend: always visible above the grid */}
        <div className="border-b border-line bg-surface px-3 py-3 sm:px-4">
          <MusterLegend />
        </div>

        {rows.length === 0 ? (
          <EmptyState icon={Users} title={data.rows.length ? "No one matches this search" : "No one was employed this month"}>
            {data.rows.length ? "Try another name or clear the filters." : "Pick another month or department."}
          </EmptyState>
        ) : (
          <div className={cn("transition-opacity duration-[180ms]", pending && "opacity-60")} aria-busy={pending || undefined}>
            <MusterGrid data={data} rows={rows} onOpen={(employeeId, date) => setOpen({ employeeId, date })} />
          </div>
        )}
        <p className="border-t border-line px-3 py-2.5 text-caption text-ink-3 sm:px-4">
          Select a day to see its punches and history. Arrow keys move between days, Enter opens one.
        </p>
      </section>

      <DaySheet target={open} onClose={() => setOpen(null)} />
      {canEdit && <BulkMarkDialog open={bulkOpen} onOpenChange={setBulkOpen} employees={data.rows.map((r) => ({ id: r.id, name: r.name, code: r.code }))} today={data.today} month={data.month} />}
    </div>
  );
}
