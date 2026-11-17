"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CircleAlert, CopyCheck, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Controller, useForm, type FieldPath } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { saveShift } from "@/lib/actions/settings";
import { formatDuration, WEEKDAYS } from "@/lib/time";
import { cn } from "@/lib/utils";
import { shiftSchema, type ShiftInput } from "@/lib/validations/settings";
import type { ShiftRow } from "@/app/(dashboard)/settings/data";
import { NumberField } from "./section";

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

function defaults(shift: ShiftRow | null, isFirst: boolean): ShiftInput {
  if (shift) {
    return {
      name: shift.name,
      isDefault: shift.isDefault,
      graceMinutes: shift.graceMinutes,
      fullDayMinutes: shift.fullDayMinutes,
      halfDayMinutes: shift.halfDayMinutes,
      earlyLeaveMinutes: shift.earlyLeaveMinutes,
      overtimeAfterMinutes: shift.overtimeAfterMinutes,
      days: Array.from({ length: 7 }, (_, wd) => {
        const d = shift.days.find((x) => x.weekday === wd);
        return d
          ? { enabled: true, startTime: d.startTime, endTime: d.endTime, fullDayMinutes: d.fullDayMinutes ?? "" }
          : { enabled: false, startTime: "09:30", endTime: "18:30", fullDayMinutes: "" };
      }),
    };
  }
  return {
    name: "",
    isDefault: isFirst,
    graceMinutes: 15,
    fullDayMinutes: 480,
    halfDayMinutes: 240,
    earlyLeaveMinutes: 15,
    overtimeAfterMinutes: 30,
    days: Array.from({ length: 7 }, (_, wd) => ({ enabled: wd >= 1 && wd <= 5, startTime: "09:30", endTime: "18:30", fullDayMinutes: "" })),
  };
}

export function ShiftSheet({ open, onOpenChange, shift, isFirst }: { open: boolean; onOpenChange: (o: boolean) => void; shift: ShiftRow | null; isFirst: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [formError, setFormError] = useState("");
  const form = useForm<ShiftInput>({ resolver: zodResolver(shiftSchema), defaultValues: defaults(shift, isFirst) });
  const { register, control, watch, formState, getValues, setValue } = form;
  const errors = formState.errors;

  useEffect(() => {
    if (open) {
      form.reset(defaults(shift, isFirst));
      setFormError("");
    }
  }, [open, shift, isFirst, form]);

  const onSubmit = form.handleSubmit((v) =>
    start(async () => {
      setFormError("");
      const res = await saveShift(shift?.id ?? null, v);
      if (!res.ok) {
        if (res.field && res.field !== "days") form.setError(res.field as FieldPath<ShiftInput>, { message: res.error });
        else setFormError(res.error);
        return;
      }
      toast.success(res.message);
      onOpenChange(false);
      router.refresh();
    }),
  );

  const copyMonday = () => {
    const mon = getValues("days.1");
    for (const wd of [2, 3, 4, 5]) {
      setValue(`days.${wd}`, { ...mon }, { shouldDirty: true });
    }
    toast.message("Monday's timing copied to Tuesday – Friday");
  };

  const fullDay = Number(watch("fullDayMinutes"));
  const lockedDefault = !!shift?.isDefault || isFirst;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="gap-0 border-line bg-raised p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[560px]">
        <SheetHeader className="gap-1 border-b border-line px-5 py-4 pr-14 sm:px-6">
          <SheetTitle className="text-title-3 text-ink">{shift ? `Edit ${shift.name}` : "New shift"}</SheetTitle>
          <SheetDescription className="text-body text-ink-2">
            {shift && shift.assignments > 0 ? "Changing timings recalculates past days for everyone on this shift (up to 400 days back)." : "Timings per weekday, with its own full-day minimum if a day is shorter."}
          </SheetDescription>
        </SheetHeader>

        <form id="shift-form" onSubmit={onSubmit} noValidate className="flex-1 space-y-7 overflow-y-auto px-5 py-5 sm:px-6">
          <fieldset className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <div className="space-y-1.5">
                <Label htmlFor="shift-name">Shift name</Label>
                <Input id="shift-name" placeholder="e.g. General" aria-invalid={!!errors.name} {...register("name")} />
                {errors.name && <p className="flex items-center gap-1 text-caption text-danger">
                <CircleAlert aria-hidden className="size-3.5 shrink-0" />
                {errors.name.message}
              </p>}
              </div>
              <label className="flex h-11 items-center gap-3 rounded-md border border-line-strong px-3 md:h-10">
                <Controller
                  control={control}
                  name="isDefault"
                  render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} disabled={lockedDefault} aria-label="Default shift" />}
                />
                <span className="text-body">Default shift</span>
              </label>
            </div>
            {errors.isDefault && <p className="flex items-center gap-1 text-caption text-danger">
                <CircleAlert aria-hidden className="size-3.5 shrink-0" />
                {errors.isDefault.message}
              </p>}
            <p className="text-caption text-ink-3">
              {lockedDefault ? "This is the default shift. To change it, make another shift the default." : "New employees get the default shift. Only one shift can be the default."}
            </p>
          </fieldset>

          <fieldset className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <legend className="text-label font-semibold text-ink">Weekly timings</legend>
              <Button type="button" variant="ghost" size="sm"
            className="max-sm:h-11" onClick={copyMonday}>
                <CopyCheck /> Copy Mon to Tue–Fri
              </Button>
            </div>
            <div className="overflow-hidden rounded-lg border border-line">
              <div className="hidden grid-cols-[7.5rem_1fr_1fr_7rem] gap-3 border-b border-line bg-sunken px-3 py-2 sm:grid">
                <span className="text-col-header text-ink-3">Day</span>
                <span className="text-col-header text-ink-3">Start</span>
                <span className="text-col-header text-ink-3">End</span>
                <span className="text-col-header text-ink-3">Full day</span>
              </div>
              {DAY_ORDER.map((wd) => {
                const enabled = watch(`days.${wd}.enabled`);
                const dayErr = errors.days?.[wd];
                return (
                  <div key={wd} className={cn("grid grid-cols-2 items-center gap-x-3 gap-y-2 border-b px-3 py-2.5 last:border-b-0 sm:grid-cols-[7.5rem_1fr_1fr_7rem]", !enabled && "bg-sunken")}>
                    <label className="col-span-2 flex items-center gap-2.5 sm:col-span-1">
                      <Controller
                        control={control}
                        name={`days.${wd}.enabled`}
                        render={({ field }) => <Switch size="sm" checked={field.value} onCheckedChange={field.onChange} aria-label={`${WEEKDAYS[wd]} is a working day`} />}
                      />
                      <span className={cn("text-body", enabled ? "font-medium" : "text-ink-3")}>{WEEKDAYS[wd]!.slice(0, 3)}</span>
                      {!enabled && <span className="text-caption text-ink-3 sm:hidden">· no timing</span>}
                    </label>
                    {enabled ? (
                      <>
                        <Input type="time" aria-label={`${WEEKDAYS[wd]} start`} className="tabular-nums" {...register(`days.${wd}.startTime`)} />
                        <Input type="time" aria-label={`${WEEKDAYS[wd]} end`} aria-invalid={!!dayErr?.endTime} className="tabular-nums" {...register(`days.${wd}.endTime`)} />
                        <div className="relative col-span-2 sm:col-span-1">
                          <Input
                            inputMode="numeric"
                            aria-label={`${WEEKDAYS[wd]} full-day minutes`}
                            placeholder={Number.isFinite(fullDay) ? String(fullDay) : ""}
                            aria-invalid={!!dayErr?.fullDayMinutes}
                            className="pr-10 tabular-nums"
                            {...register(`days.${wd}.fullDayMinutes`)}
                          />
                          <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center tabular-nums text-caption text-ink-3">min</span>
                        </div>
                      </>
                    ) : (
                      <span className="hidden text-caption text-ink-3 sm:col-span-3 sm:block">Off / no timing</span>
                    )}
                    {(dayErr?.endTime || dayErr?.startTime || dayErr?.fullDayMinutes) && (
                      <p className="col-span-full flex items-center gap-1 text-caption text-danger">{dayErr.endTime?.message ?? dayErr.startTime?.message ?? dayErr.fullDayMinutes?.message}</p>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="text-caption text-ink-3">Leave &ldquo;Full day&rdquo; empty to use the shift&apos;s minimum below. Weekly offs come from the Working week settings, not from here.</p>
            {errors.days?.root?.message || errors.days?.message ? <p className="flex items-center gap-1 text-caption text-danger">
                <CircleAlert aria-hidden className="size-3.5 shrink-0" />
                {errors.days?.root?.message ?? errors.days?.message}
              </p> : null}
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="mb-3 text-label font-semibold text-ink">Rules</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <NumberField
                id="fullDayMinutes"
                label="Full day minimum"
                suffix="min"
                hint={Number.isFinite(fullDay) ? `${formatDuration(fullDay)} worked = full day` : undefined}
                error={errors.fullDayMinutes?.message}
                {...register("fullDayMinutes", { valueAsNumber: true })}
              />
              <NumberField
                id="halfDayMinutes"
                label="Half day minimum"
                suffix="min"
                hint="Less than this is absent"
                error={errors.halfDayMinutes?.message}
                {...register("halfDayMinutes", { valueAsNumber: true })}
              />
              <NumberField id="graceMinutes" label="Grace period" suffix="min" hint="Late after start + grace" error={errors.graceMinutes?.message} {...register("graceMinutes", { valueAsNumber: true })} />
              <NumberField
                id="earlyLeaveMinutes"
                label="Early-leave threshold"
                suffix="min"
                hint="Leaving earlier than end − this"
                error={errors.earlyLeaveMinutes?.message}
                {...register("earlyLeaveMinutes", { valueAsNumber: true })}
              />
              <NumberField
                id="overtimeAfterMinutes"
                label="Overtime after"
                suffix="min"
                hint="Counted beyond shift end + this"
                error={errors.overtimeAfterMinutes?.message}
                {...register("overtimeAfterMinutes", { valueAsNumber: true })}
              />
            </div>
          </fieldset>

          {formError && (
            <p role="alert" className="flex items-start gap-2 rounded-md bg-danger-subtle px-3 py-2.5 text-body text-danger">
              <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              {formError}
            </p>
          )}
        </form>

        <SheetFooter className="flex-row justify-end gap-2 border-t border-line bg-raised px-5 py-4 sm:px-6">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="shift-form" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            {shift ? "Save shift" : "Create shift"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
