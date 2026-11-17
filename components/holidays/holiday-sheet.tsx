"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CircleAlert, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Controller, useForm, type FieldPath } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { createHoliday, updateHoliday } from "@/lib/actions/holidays";
import { addDays, formatDate, WEEKDAYS, weekdayOf } from "@/lib/time";
import { cn } from "@/lib/utils";
import { HOLIDAY_TYPE_LABEL, HOLIDAY_TYPES, holidayDates, MAX_HOLIDAY_SPAN, newHolidaySchema, type NewHolidayInput } from "@/lib/validations/holidays";
import type { HolidayItem } from "./holidays-view";

const TYPE_HINT: Record<NewHolidayInput["type"], string> = {
  NATIONAL: "Republic Day, Independence Day…",
  STATE: "Tamil Nadu government list",
  COMPANY: "Decided by the company",
  OPTIONAL: "Restricted / optional",
};

const isYmd = (v: string | undefined) => /^\d{4}-\d{2}-\d{2}$/.test(v ?? "");

/**
 * Add or edit a holiday. Adding can cover several days in a row (e.g. a 3-day Pongal break):
 * every day gets the same name and type, and days that already have a holiday are skipped.
 * Editing always works on one day.
 */
export function HolidaySheet({
  open,
  onOpenChange,
  holiday,
  defaultDate,
  existing = [],
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  holiday: HolidayItem | null;
  defaultDate: string;
  /** Holidays already on the calendar, to flag days a range would skip */
  existing?: HolidayItem[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [formError, setFormError] = useState("");
  const [multi, setMulti] = useState(false);
  const initial = (): NewHolidayInput =>
    holiday
      ? { date: holiday.date, toDate: "", name: holiday.name, type: holiday.type, isDeclared: holiday.isDeclared }
      : { date: defaultDate, toDate: "", name: "", type: "STATE", isDeclared: false };
  const form = useForm<NewHolidayInput>({ resolver: zodResolver(newHolidaySchema), defaultValues: initial() });
  const { register, control, watch, formState } = form;
  const errors = formState.errors;
  const date = watch("date");
  const toDate = watch("toDate");

  useEffect(() => {
    if (open) {
      form.reset(initial());
      setMulti(false);
      setFormError("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, holiday]);

  const takenOn = new Map(existing.map((h) => [h.date, h.name]));
  const rangeOk = multi && isYmd(date) && isYmd(toDate) && toDate! >= date;
  const days = rangeOk ? holidayDates(date, toDate) : [];
  const newDays = days.filter((d) => !takenOn.has(d)).length;

  const onSubmit = form.handleSubmit((v) =>
    start(async () => {
      setFormError("");
      const res = holiday ? await updateHoliday(holiday.id, v) : await createHoliday(v);
      if (!res.ok) {
        if (res.field && res.field in v) form.setError(res.field as FieldPath<NewHolidayInput>, { message: res.error });
        else setFormError(res.error);
        return;
      }
      toast.success(res.message);
      onOpenChange(false);
      router.refresh();
    }),
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="gap-0 border-line bg-raised p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[560px]">
        <SheetHeader className="gap-1 border-b border-line px-5 py-4 pr-14 sm:px-6">
          <SheetTitle className="text-title-3 text-ink">{holiday ? "Edit holiday" : "Add holiday"}</SheetTitle>
          <SheetDescription className="text-body text-ink-2">{multi ? "Attendance for those days is recalculated for everyone." : "Attendance for that day is recalculated for everyone."}</SheetDescription>
        </SheetHeader>
        <form id="holiday-form" onSubmit={onSubmit} noValidate className="flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
          {!holiday && (
            <div role="radiogroup" aria-label="How many days" className="grid grid-cols-2 gap-1 rounded-md bg-sunken p-1">
              {[
                { value: false, label: "One day" },
                { value: true, label: "Several days" },
              ].map((o) => (
                <button
                  key={o.label}
                  type="button"
                  role="radio"
                  aria-checked={multi === o.value}
                  onClick={() => {
                    setMulti(o.value);
                    form.clearErrors();
                    // One day = no end date; several days starts as a 3-day range.
                    if (!o.value) form.setValue("toDate", "");
                    else if (!isYmd(form.getValues("toDate"))) form.setValue("toDate", isYmd(date) ? addDays(date, 2) : "");
                  }}
                  className={cn(
                    "h-10 rounded-sm text-label transition-colors duration-[120ms] outline-none focus-visible:ring-2 focus-visible:ring-brand md:h-8",
                    multi === o.value ? "bg-surface text-ink shadow-sm" : "text-ink-2 hover:text-ink",
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          )}

          {multi ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="holiday-date">From</Label>
                  <Input id="holiday-date" type="date" aria-invalid={!!errors.date} {...register("date")} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="holiday-to">To</Label>
                  <Input id="holiday-to" type="date" min={isYmd(date) ? date : undefined} aria-invalid={!!errors.toDate} {...register("toDate")} />
                </div>
              </div>
              {(errors.date || errors.toDate) && <p className="flex items-center gap-1 text-caption text-danger">
                <CircleAlert aria-hidden className="size-3.5 shrink-0" />
                {errors.date?.message ?? errors.toDate?.message}
              </p>}
              {rangeOk && (
                <div className="rounded-md border border-line bg-sunken p-3" aria-live="polite">
                  <p className="flex items-baseline justify-between gap-2 text-body">
                    <span className="font-medium text-ink tabular-nums">
                      {days.length} day{days.length === 1 ? "" : "s"}
                    </span>
                    <span className="text-caption text-ink-3 tabular-nums">
                      {days.length > MAX_HOLIDAY_SPAN
                        ? `Up to ${MAX_HOLIDAY_SPAN} days at a time`
                        : newDays === days.length
                          ? "All will be added"
                          : `${newDays} new · ${days.length - newDays} already a holiday`}
                    </span>
                  </p>
                  <ul className="mt-2.5 flex flex-wrap gap-1.5">
                    {days.slice(0, MAX_HOLIDAY_SPAN).map((d) => {
                      const taken = takenOn.get(d);
                      return (
                        <li
                          key={d}
                          title={taken ? `Already ${taken}: skipped` : `${WEEKDAYS[weekdayOf(d)]}, ${formatDate(d)}`}
                          className={cn(
                            "flex w-11 flex-col items-center rounded-xs border py-1 leading-none",
                            taken ? "border-dashed border-line-strong bg-surface text-ink-3 line-through" : "border-transparent bg-st-holiday-tint text-st-holiday-fg",
                          )}
                        >
                          <span className="text-caption">{WEEKDAYS[weekdayOf(d)]!.slice(0, 3)}</span>
                          <span className="mt-0.5 text-body font-semibold tabular-nums">{d.slice(8)}</span>
                        </li>
                      );
                    })}
                  </ul>
                  {days.some((d) => takenOn.has(d)) && <p className="mt-2 text-caption text-ink-3">Crossed-out days already have a holiday and are skipped.</p>}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="holiday-date">Date</Label>
              <Input id="holiday-date" type="date" className="w-full sm:w-48" aria-invalid={!!errors.date} {...register("date")} />
              {errors.date ? (
                <p className="flex items-center gap-1 text-caption text-danger">
                <CircleAlert aria-hidden className="size-3.5 shrink-0" />
                {errors.date.message}
              </p>
              ) : (
                isYmd(date) && (
                  <p className="text-caption text-ink-3">
                    {WEEKDAYS[weekdayOf(date)]}, {formatDate(date)}
                  </p>
                )
              )}
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="holiday-name">Name</Label>
            <Input id="holiday-name" placeholder="e.g. Pongal" aria-invalid={!!errors.name} {...register("name")} />
            {errors.name && <p className="flex items-center gap-1 text-caption text-danger">
                <CircleAlert aria-hidden className="size-3.5 shrink-0" />
                {errors.name.message}
              </p>}
          </div>
          <div className="space-y-1.5">
            <Label id="holiday-type-label">Type</Label>
            <Controller
              control={control}
              name="type"
              render={({ field }) => (
                <div role="radiogroup" aria-labelledby="holiday-type-label" className="grid grid-cols-2 gap-2">
                  {HOLIDAY_TYPES.map((t) => {
                    const selected = field.value === t;
                    return (
                      <button
                        key={t}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => field.onChange(t)}
                        className={cn(
                          "min-h-11 rounded-md border px-3 py-2.5 text-left transition-colors duration-[120ms] outline-none focus-visible:ring-2 focus-visible:ring-brand",
                          selected ? "border-brand bg-brand-subtle ring-1 ring-brand" : "border-line hover:border-line-strong",
                        )}
                      >
                        <span className={cn("block text-body font-medium", selected ? "text-brand-ink" : "text-ink")}>{HOLIDAY_TYPE_LABEL[t]}</span>
                        <span className="block text-caption leading-snug text-ink-3">{TYPE_HINT[t]}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            />
          </div>
          <label className="flex items-start justify-between gap-4 rounded-md border border-line p-3.5">
            <span>
              <span className="block text-body font-medium">One-off declared holiday</span>
              <span className="block text-caption text-ink-3">Announced at short notice, e.g. an election day or a government order.</span>
            </span>
            <Controller control={control} name="isDeclared" render={({ field }) => <Switch aria-label="One-off declared holiday" checked={field.value} onCheckedChange={field.onChange} />} />
          </label>
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
          <Button type="submit" form="holiday-form" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            {holiday ? "Save holiday" : multi && rangeOk && newDays > 1 ? `Add ${newDays} days` : "Add holiday"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
