"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Camera, CircleAlert, History, Loader2, Lock, MapPin } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { Controller, useForm, type FieldPath } from "react-hook-form";
import { toast } from "sonner";
import { StatusChip } from "@/components/attendance/status-chip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { getMusterDay, saveMusterDay, type DayDetail } from "@/lib/actions/muster";
import { STATUS_META } from "@/lib/status";
import { formatClock, formatDate, formatDuration, formatHhmm, WEEKDAYS, weekdayOf } from "@/lib/time";
import { cn } from "@/lib/utils";
import { musterEditSchema, OVERRIDE_STATUSES, type MusterEditInput } from "@/lib/validations/muster";

const FLAG_LABEL: Record<string, string> = {
  WORKED_ON_OFF_DAY: "Worked on an off day",
  LATE: "Late",
  EARLY_LEAVE: "Left early",
  IN_PROGRESS: "In progress",
  HALF_DAY_LEAVE: "Half-day leave",
  PERMISSION_USED: "Permission used",
};
const SOURCE_LABEL: Record<string, string> = { WEB: "Punched in the app", IMPORT: "Excel import", MANUAL: "Edited by HR", ARRIVAL: "Arrival notification" };
const ACTION_LABEL: Record<string, string> = { CREATE: "Created", UPDATE: "Edited", BULK_MARK: "Bulk marked", IMPORT: "Imported", UNDO_IMPORT: "Import undone" };
const REQUEST_LABEL: Record<string, string> = { LEAVE: "Leave", WFH: "Work from home", PERMISSION: "Permission", ON_DUTY: "On duty", REGULARIZATION: "Regularization" };

function defaults(day: DayDetail): MusterEditInput {
  return {
    employeeId: day.employee.id,
    date: day.date,
    punchIn: day.record?.punchIn ?? "",
    punchOut: day.record?.punchOut ?? "",
    status: day.record?.statusOverride && (OVERRIDE_STATUSES as readonly string[]).includes(day.record.statusOverride) ? (day.record.statusOverride as MusterEditInput["status"]) : "AUTO",
    remarks: day.record?.remarks ?? "",
    reason: "",
  };
}

/** Side sheet for one employee-day: punches, status, flags, history, and the edit form. */
export function DaySheet({ target, onClose }: { target: { employeeId: number; date: string } | null; onClose: () => void }) {
  const [day, setDay] = useState<DayDetail | null>(null);
  const [error, setError] = useState("");
  const [loading, startLoad] = useTransition();

  const load = useCallback((t: { employeeId: number; date: string }) => {
    setError("");
    startLoad(async () => {
      const res = await getMusterDay(t.employeeId, t.date);
      if (res.ok) setDay(res.day);
      else setError(res.error);
    });
  }, []);

  useEffect(() => {
    if (target) {
      setDay(null);
      load(target);
    }
  }, [target, load]);

  const title = target ? `${WEEKDAYS[weekdayOf(target.date)]}, ${formatDate(target.date)}` : "";

  return (
    <Sheet open={!!target} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="gap-0 border-line bg-raised p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[560px]">
        <SheetHeader className="gap-1 border-b border-line bg-raised px-5 py-4 pr-14 sm:px-6">
          <p className="text-caption text-ink-3 tabular-nums">{day ? `${day.employee.code}${day.employee.department ? ` · ${day.employee.department}` : ""}` : "Day detail"}</p>
          <SheetTitle className="text-title-3 text-ink">{day?.employee.name ?? (loading ? "Loading…" : "Day")}</SheetTitle>
          <SheetDescription className="text-body text-ink-2 tabular-nums">{title}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {error && (
            <p role="alert" className="m-5 flex items-start gap-2 rounded-md bg-danger-subtle px-3 py-2.5 text-body text-danger sm:m-6">
              <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              {error}
            </p>
          )}
          {!day && !error && <DaySkeleton />}
          {day && <DayBody day={day} onSaved={() => target && load(target)} refreshing={loading} />}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DaySkeleton() {
  return (
    <div className="space-y-5 p-5 sm:p-6" aria-busy="true">
      <Skeleton className="h-[22px] w-24 rounded-full bg-sunken" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-4 w-16 rounded-xs bg-sunken" />
            <Skeleton className="h-5 w-20 rounded-xs bg-sunken" />
          </div>
        ))}
      </div>
      <Skeleton className="h-64 rounded-lg bg-sunken" />
    </div>
  );
}

function Fact({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-caption text-ink-3">{label}</dt>
      <dd className="mt-1 text-body text-ink">{children}</dd>
    </div>
  );
}

function Punch({ time, location, selfie, label }: { time: string | null; location: { lat: number; lng: number; accuracy: number | null } | null; selfie: string | null; label: string }) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className={cn("font-medium tabular-nums", !time && "text-ink-3")}>{time ? formatHhmm(time) : "—"}</span>
      {location && (
        <a
          href={`https://www.google.com/maps?q=${location.lat},${location.lng}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-6 items-center gap-1 rounded-xs bg-sunken px-1.5 text-caption text-ink-2 hover:text-brand-ink"
          title={`${label} location${location.accuracy ? ` (±${location.accuracy} m)` : ""}`}
        >
          <MapPin className="size-3" /> Map
        </a>
      )}
      {selfie && (
        <a href={selfie} target="_blank" rel="noreferrer" className="inline-flex h-6 items-center gap-1 rounded-xs bg-sunken px-1.5 text-caption text-ink-2 hover:text-brand-ink" title={`${label} selfie`}>
          <Camera className="size-3" /> Selfie
        </a>
      )}
    </span>
  );
}

function DayBody({ day, onSaved, refreshing }: { day: DayDetail; onSaved: () => void; refreshing: boolean }) {
  const r = day.record;
  const off = day.holiday ?? (day.weeklyOff ? "Weekly off" : null);
  return (
    <div className={cn("space-y-6 px-5 py-5 transition-opacity duration-[180ms] sm:px-6", refreshing && "opacity-70")} aria-busy={refreshing || undefined}>
      <section aria-label="Day detail" className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip status={day.status} />
          {r?.statusOverride && <span className="text-caption text-ink-3">Set by HR</span>}
          {off && <span className="inline-flex h-[22px] items-center rounded-full bg-sunken px-2 text-caption text-ink-2">{off}</span>}
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-4 rounded-lg border border-line bg-surface p-4 sm:grid-cols-3">
          <Fact label="Punch in">
            <Punch time={r?.punchIn ?? null} location={r?.inLocation ?? null} selfie={r?.inSelfie ?? null} label="Punch-in" />
          </Fact>
          <Fact label="Punch out">
            <Punch time={r?.punchOut ?? null} location={r?.outLocation ?? null} selfie={r?.outSelfie ?? null} label="Punch-out" />
          </Fact>
          <Fact label="Shift">
            <span className="whitespace-nowrap tabular-nums">{day.shift ? `${formatClock(day.shift.start)} – ${formatClock(day.shift.end)}` : "No timing"}</span>
          </Fact>
          <Fact label="Worked">
            <span className="tabular-nums">{day.workedMinutes ? formatDuration(day.workedMinutes) : "—"}</span>
          </Fact>
          <Fact label="Late / early">
            <span className="tabular-nums">
              {day.lateMinutes ? formatDuration(day.lateMinutes) : "—"} / {day.earlyLeaveMinutes ? formatDuration(day.earlyLeaveMinutes) : "—"}
            </span>
          </Fact>
          <Fact label="Overtime">
            <span className="tabular-nums">{day.overtimeMinutes ? formatDuration(day.overtimeMinutes) : "—"}</span>
          </Fact>
          <Fact label="Source" className="col-span-2 sm:col-span-3">
            {r ? (
              <span>
                {SOURCE_LABEL[r.source] ?? r.source} <span className="text-ink-3 tabular-nums">· updated {r.updated}</span>
              </span>
            ) : (
              <span className="text-ink-3">No record yet</span>
            )}
          </Fact>
          {day.flags.length > 0 && (
            <Fact label="Flags" className="col-span-2 sm:col-span-3">
              <span className="flex flex-wrap gap-1.5">
                {day.flags.map((f) => (
                  <span key={f} className="inline-flex h-6 items-center rounded-xs border border-line bg-sunken px-2 text-caption text-ink-2">
                    {FLAG_LABEL[f] ?? f}
                  </span>
                ))}
              </span>
            </Fact>
          )}
          {day.requests.length > 0 && (
            <Fact label="Approved requests" className="col-span-2 sm:col-span-3">
              <ul className="space-y-0.5">
                {day.requests.map((q, i) => (
                  <li key={i}>
                    {REQUEST_LABEL[q.type] ?? q.type}
                    {q.detail && <span className="text-ink-3"> · {q.detail}</span>}
                  </li>
                ))}
              </ul>
            </Fact>
          )}
          {r?.remarks && (
            <Fact label="Remarks" className="col-span-2 sm:col-span-3">
              {r.remarks}
            </Fact>
          )}
        </dl>
      </section>

      <section aria-labelledby="edit-day" className="rounded-lg border border-line bg-surface p-4">
        <h3 id="edit-day" className="text-title-3 text-ink">
          Correct this day
        </h3>
        {day.editBlock ? (
          <p className="mt-2 flex items-center gap-2 text-body text-ink-2">
            <Lock aria-hidden className="size-4 shrink-0 text-ink-3" /> {day.editBlock}
          </p>
        ) : (
          <EditForm day={day} onSaved={onSaved} />
        )}
      </section>

      <section aria-labelledby="day-history">
        <h3 id="day-history" className="flex items-center gap-2 text-title-3 text-ink">
          <History aria-hidden className="size-4 text-ink-3" /> History
        </h3>
        {day.audit.length === 0 ? (
          <p className="mt-2 text-body text-ink-2">No changes recorded for this day.</p>
        ) : (
          <ol className="mt-3 space-y-4 border-l border-line pl-4">
            {day.audit.map((a) => (
              <li key={a.id} className="relative text-body text-ink">
                <span aria-hidden className="absolute top-1.5 -left-[21px] size-2 rounded-full bg-ink-3 ring-2 ring-raised" />
                <p>
                  <span className="font-medium">{ACTION_LABEL[a.action] ?? a.action}</span> by {a.actor}
                  <span className="text-caption text-ink-3 tabular-nums"> · {a.when}</span>
                </p>
                {a.changes.length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-caption text-ink-2 tabular-nums">
                    {a.changes.map((c) => (
                      <li key={c.field}>
                        <span className="text-ink-3">{c.field}:</span> <span className="line-through decoration-ink-3">{c.before}</span> →{" "}
                        <span className="font-semibold text-ink">{c.after}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {a.reason && <p className="mt-1.5 rounded-xs bg-sunken px-2 py-1 text-caption text-ink-2">“{a.reason}”</p>}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function EditForm({ day, onSaved }: { day: DayDetail; onSaved: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [formError, setFormError] = useState("");
  const form = useForm<MusterEditInput>({ resolver: zodResolver(musterEditSchema), defaultValues: defaults(day) });
  const { register, control, formState } = form;
  const errors = formState.errors;

  useEffect(() => {
    form.reset(defaults(day));
    setFormError("");
  }, [day, form]);

  const onSubmit = form.handleSubmit((values) =>
    start(async () => {
      setFormError("");
      const res = await saveMusterDay(values);
      if (!res.ok) {
        if (res.field && res.field in values) form.setError(res.field as FieldPath<MusterEditInput>, { message: res.error });
        else setFormError(res.error);
        return;
      }
      toast.success(res.message);
      router.refresh();
      onSaved();
    }),
  );

  const err = (msg?: string) =>
    msg ? (
      <p className="flex items-center gap-1 text-caption text-danger">
        <CircleAlert aria-hidden className="size-3.5 shrink-0" />
        {msg}
      </p>
    ) : null;

  return (
    <form onSubmit={onSubmit} noValidate className="mt-4 space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="punchIn">Punch in (IST)</Label>
          <Input id="punchIn" type="time" aria-invalid={!!errors.punchIn} {...register("punchIn")} />
          {err(errors.punchIn?.message)}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="punchOut">Punch out (IST)</Label>
          <Input id="punchOut" type="time" aria-invalid={!!errors.punchOut} {...register("punchOut")} />
          {err(errors.punchOut?.message)}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="status">Status</Label>
        <Controller
          control={control}
          name="status"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="AUTO">Automatic (from punches, leave and holidays)</SelectItem>
                {OVERRIDE_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    <span className={cn("size-2 rounded-full", STATUS_META[s].dot)} /> {STATUS_META[s].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="remarks">Remarks</Label>
        <Textarea id="remarks" rows={2} placeholder="Shown on the muster and in exports" {...register("remarks")} />
        {err(errors.remarks?.message)}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="reason">Reason for the change</Label>
        <Textarea id="reason" rows={2} placeholder="e.g. Biometric was down; confirmed with the manager" aria-invalid={!!errors.reason} {...register("reason")} />
        {err(errors.reason?.message)}
        <p className="text-caption text-ink-3">Required. Saved in the history with who changed what.</p>
      </div>
      {formError && (
        <p role="alert" className="flex items-start gap-2 rounded-md bg-danger-subtle px-3 py-2.5 text-body text-danger">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          {formError}
        </p>
      )}
      <div className="flex justify-end border-t border-line pt-4">
        <Button type="submit" disabled={pending} aria-busy={pending || undefined} className="h-11 w-full sm:h-10 sm:w-auto">
          {pending && <Loader2 className="animate-spin" />}
          Save change
        </Button>
      </div>
    </form>
  );
}
