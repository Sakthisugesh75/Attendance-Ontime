"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CircleAlert, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Controller, useForm, type FieldPath } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { bulkMark } from "@/lib/actions/muster";
import { STATUS_META } from "@/lib/status";
import { cn } from "@/lib/utils";
import { bulkMarkSchema, OVERRIDE_STATUSES, type BulkMarkInput } from "@/lib/validations/muster";

/** Marks many employees for one date: shift-time punches (system was down) or a status. */
export function BulkMarkDialog({
  open,
  onOpenChange,
  employees,
  today,
  month,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employees: { id: number; name: string; code: string }[];
  today: string;
  month: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [formError, setFormError] = useState("");
  const initialDate = today.startsWith(month) ? today : `${month}-01` < today ? `${month}-01` : today;
  const defaults: BulkMarkInput = { date: initialDate, scope: "ALL", employeeIds: [], action: "PRESENT_SHIFT", reason: "" };
  const form = useForm<BulkMarkInput>({ resolver: zodResolver(bulkMarkSchema), defaultValues: defaults });
  const { register, control, watch, formState } = form;
  const errors = formState.errors;

  useEffect(() => {
    if (open) {
      form.reset(defaults);
      setFormError("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const scope = watch("scope");
  const selected = watch("employeeIds");

  const onSubmit = form.handleSubmit((values) =>
    start(async () => {
      setFormError("");
      const res = await bulkMark(values);
      if (!res.ok) {
        if (res.field && res.field in values) form.setError(res.field as FieldPath<BulkMarkInput>, { message: res.error });
        else setFormError(res.error);
        return;
      }
      toast.success(res.message, { description: res.skipped.length ? `Skipped: ${res.skipped.join(", ")}` : undefined });
      onOpenChange(false);
      router.refresh();
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden rounded-xl border-line bg-raised p-0 shadow-lg sm:max-w-[560px]">
        <DialogHeader className="border-b border-line px-5 py-4 sm:px-6">
          <DialogTitle className="text-title-3 text-ink">Bulk mark attendance</DialogTitle>
          <DialogDescription className="text-body text-ink-2">Mark many people for one day, e.g. when the system was down or the office closed unexpectedly.</DialogDescription>
        </DialogHeader>
        <form id="bulk-form" onSubmit={onSubmit} noValidate className="min-h-0 flex-1 space-y-5 overflow-x-hidden overflow-y-auto px-5 py-5 sm:px-6">
          <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
            <div className="space-y-1.5">
              <Label htmlFor="bulk-date">Date</Label>
              <Input id="bulk-date" type="date" max={today} aria-invalid={!!errors.date} {...register("date")} />
              {err(errors.date?.message)}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bulk-action">Mark as</Label>
              <Controller
                control={control}
                name="action"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="bulk-action" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PRESENT_SHIFT">Present with shift times</SelectItem>
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
          </div>
          <p className="-mt-2 text-caption text-ink-3">
            {watch("action") === "PRESENT_SHIFT"
              ? "Fills each person's shift start and end for that weekday. Punches already recorded are kept."
              : "Sets the status for the day. Punches already recorded are kept."}
          </p>

          <div className="space-y-1.5">
            <Label id="bulk-scope">Who</Label>
            <Controller
              control={control}
              name="scope"
              render={({ field }) => (
                <ToggleGroup
                  type="single"
                  aria-labelledby="bulk-scope"
                  className="w-full flex-wrap justify-start gap-1 rounded-md bg-sunken p-1 sm:w-fit"
                  value={field.value}
                  onValueChange={(v) => v && field.onChange(v)}
                >
                  <ToggleGroupItem value="ALL" className="h-10 flex-1 rounded-sm px-3 text-label text-ink-2 data-[state=on]:bg-surface data-[state=on]:text-ink data-[state=on]:shadow-sm sm:h-8 sm:flex-none">
                    Everyone employed that day
                  </ToggleGroupItem>
                  <ToggleGroupItem value="SELECTED" className="h-10 flex-1 rounded-sm px-3 text-label text-ink-2 data-[state=on]:bg-surface data-[state=on]:text-ink data-[state=on]:shadow-sm sm:h-8 sm:flex-none">
                    Selected people
                  </ToggleGroupItem>
                </ToggleGroup>
              )}
            />
            {scope === "SELECTED" && (
              <Controller
                control={control}
                name="employeeIds"
                render={({ field }) => (
                  <div className="overflow-hidden rounded-md border border-line bg-surface">
                    <div className="flex items-center justify-between border-b border-line bg-sunken px-3 py-2 text-caption text-ink-3">
                      <span>
                        <span className="tabular-nums">{selected.length}</span> selected
                      </span>
                      <button
                        type="button"
                        className="-my-2 py-2 font-semibold text-brand-ink hover:underline"
                        onClick={() => field.onChange(selected.length === employees.length ? [] : employees.map((e) => e.id))}
                      >
                        {selected.length === employees.length ? "Clear" : "Select all"}
                      </button>
                    </div>
                    <ul className="max-h-52 overflow-y-auto py-1">
                      {employees.map((e) => {
                        const checked = field.value.includes(e.id);
                        return (
                          <li key={e.id}>
                            <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-1.5 text-body text-ink hover:bg-sunken sm:min-h-9">
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(c) => field.onChange(c ? [...field.value, e.id] : field.value.filter((x) => x !== e.id))}
                                aria-label={e.name}
                              />
                              <span className="min-w-0 flex-1 truncate">{e.name}</span>
                              <span className="text-caption text-ink-3 tabular-nums">{e.code}</span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              />
            )}
            {err(errors.employeeIds?.message)}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bulk-reason">Reason</Label>
            <Textarea id="bulk-reason" rows={2} placeholder="e.g. Punch system was down all morning" aria-invalid={!!errors.reason} {...register("reason")} />
            {err(errors.reason?.message)}
            <p className="text-caption text-ink-3">Required. Each changed day gets its own history entry with this reason.</p>
          </div>

          {formError && (
            <p role="alert" className="flex items-start gap-2 rounded-md bg-danger-subtle px-3 py-2.5 text-body text-danger">
              <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              {formError}
            </p>
          )}
        </form>
        <DialogFooter className="mx-0 mb-0 border-t border-line bg-raised px-5 py-4 sm:px-6">
          <Button type="button" variant="outline" className="h-11 sm:h-10" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="bulk-form" disabled={pending} aria-busy={pending || undefined} className="h-11 sm:h-10">
            {pending && <Loader2 className="animate-spin" />}
            Mark attendance
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
