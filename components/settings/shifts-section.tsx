"use client";

import { Clock, Pencil, Plus, Trash2, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { EmptyState } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { deleteShift } from "@/lib/actions/settings";
import { formatDuration, formatHhmm } from "@/lib/time";
import { groupShiftDays } from "@/lib/validations/settings";
import type { ShiftRow } from "@/app/(dashboard)/settings/data";
import { ConfirmButton } from "./confirm-button";
import { SettingsSection } from "./section";
import { ShiftSheet } from "./shift-sheet";

export function ShiftsSection({ shifts }: { shifts: ShiftRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<ShiftRow | null>(null);
  const [open, setOpen] = useState(false);

  const openSheet = (s: ShiftRow | null) => {
    setEditing(s);
    setOpen(true);
  };

  return (
    <SettingsSection
      title="Shifts"
      description="Working hours per weekday and the rules that decide late, half day, early leaving and overtime. Employees are assigned a shift on their profile."
      aside={
        <Button onClick={() => openSheet(null)}>
          <Plus /> New shift
        </Button>
      }
    >
      {shifts.length ? (
        <div className="space-y-3">
          {shifts.map((s) => {
            const groups = groupShiftDays(s.days);
            const blocked = s.isDefault
              ? "This is the default shift. Make another shift the default first."
              : s.assignments > 0
                ? `${s.name} has ${s.assignments} assignment${s.assignments === 1 ? "" : "s"} (including past ones). Move those employees to another shift first so their history stays correct.`
                : undefined;
            return (
              <article key={s.id} className="overflow-hidden rounded-xl bg-surface shadow-card">
                <header className="flex flex-wrap items-start justify-between gap-3 px-4 pt-4 sm:px-5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-title-3 text-ink">{s.name}</h4>
                      {s.isDefault && <span className="inline-flex h-[22px] items-center rounded-full bg-sunken px-2 text-caption font-semibold text-ink-2">Default</span>}
                    </div>
                    <p className="mt-0.5 flex items-center gap-1.5 text-caption text-ink-3">
                      <Users aria-hidden className="size-3.5" />
                      {s.currentEmployees} employee{s.currentEmployees === 1 ? "" : "s"} on this shift today
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="sm" onClick={() => openSheet(s)} aria-label={`Edit ${s.name}`}>
                      <Pencil /> Edit
                    </Button>
                    <ConfirmButton
                      variant="ghost"
                      size="icon"
                      className="text-ink-3 hover:text-danger"
                      aria-label={`Delete ${s.name}`}
                      title={`Delete ${s.name}?`}
                      blockedReason={blocked}
                      description="This shift has never been assigned, so nothing else changes."
                      confirmLabel="Delete shift"
                      action={() => deleteShift(s.id)}
                      onDone={() => router.refresh()}
                    >
                      <Trash2 />
                    </ConfirmButton>
                  </div>
                </header>

                <div className="mt-3 space-y-1.5 px-4 sm:px-5">
                  {groups.length ? (
                    groups.map((g) => (
                      <div key={g.label} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                        <span className="w-16 shrink-0 text-caption text-ink-3">{g.label}</span>
                        <span className="text-body font-medium text-ink tabular-nums">
                          {formatHhmm(g.startTime)} – {formatHhmm(g.endTime)}
                        </span>
                        {g.fullDayMinutes !== null && <span className="text-caption text-ink-3 tabular-nums">full day {formatDuration(g.fullDayMinutes)}</span>}
                      </div>
                    ))
                  ) : (
                    <p className="text-body text-ink-2">No working days set</p>
                  )}
                </div>

                <dl className="mt-4 grid grid-cols-2 border-t border-line bg-sunken sm:grid-cols-5">
                  {[
                    ["Grace", `${s.graceMinutes}m`],
                    ["Full day", formatDuration(s.fullDayMinutes)],
                    ["Half day", formatDuration(s.halfDayMinutes)],
                    ["Early leave", `${s.earlyLeaveMinutes}m`],
                    ["Overtime after", `${s.overtimeAfterMinutes}m`],
                  ].map(([label, value], i) => (
                    <div key={label} className={`border-line px-4 py-2.5 sm:px-5 ${i % 2 === 1 ? "border-l" : ""} sm:border-l sm:first:border-l-0 ${i >= 2 ? "border-t sm:border-t-0" : ""}`}>
                      <dt className="text-caption text-ink-3">{label}</dt>
                      <dd className="mt-0.5 text-body text-ink tabular-nums">{value}</dd>
                    </div>
                  ))}
                </dl>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl bg-surface shadow-card">
          <EmptyState icon={Clock} title="No shifts yet" action={<Button variant="outline" onClick={() => openSheet(null)}>Create the first shift</Button>}>
            Without a shift, nobody can be marked late or half day.
          </EmptyState>
        </div>
      )}
      <ShiftSheet open={open} onOpenChange={setOpen} shift={editing} isFirst={shifts.length === 0} />
    </SettingsSection>
  );
}
