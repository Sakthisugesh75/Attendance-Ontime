"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarMinus, CalendarPlus, CircleCheck, Hourglass, Loader2, Undo2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Controller, useForm, type FieldPath } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { deleteScheduledRule, removeCustomDate, scheduleWeeklyOff, setCustomDate } from "@/lib/actions/settings";
import { SATURDAY_POLICIES, type WeeklyOffRuleLike } from "@/lib/attendance/weekly-off";
import { addDays, formatDate, WEEKDAYS, weekdayOf } from "@/lib/time";
import { cn } from "@/lib/utils";
import { buildPattern, describePattern, SATURDAY_POLICY_KEYS, weeklyOffSchema, type SaturdayPolicy, type WeeklyOffInput } from "@/lib/validations/settings";
import type { WorkingWeekData } from "@/app/(dashboard)/settings/data";
import { ConfirmButton } from "./confirm-button";
import { GroupWeeklyOffs } from "./group-weekly-offs";
import { SaveBar } from "./save-bar";
import { FieldError, SettingsCard, SettingsSection } from "./section";
import { nextMonth, PreviewLegend, WeekPreview } from "./week-preview";

const SAT_HINT: Record<SaturdayPolicy, string> = {
  ALL_WORKING: "6-day week",
  ALL_OFF: "5-day week",
  ALT_1_3: "Alternate Saturdays",
  ALT_2_4: "Alternate Saturdays",
};

export function WorkingWeekSection({ data }: { data: WorkingWeekData }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const current = data.rules.find((r) => r.id === data.currentId) ?? null;
  const firstOfNextMonth = `${nextMonth(data.today.slice(0, 7))}-01`;
  const defaults: WeeklyOffInput = {
    saturday: current?.policy?.saturday ?? "ALT_2_4",
    sundayOff: current?.policy?.sundayOff ?? true,
    effectiveFrom: firstOfNextMonth,
  };
  const form = useForm<WeeklyOffInput>({ resolver: zodResolver(weeklyOffSchema), values: defaults });
  const { control, register, watch, formState } = form;
  const saturday = watch("saturday");
  const sundayOff = watch("sundayOff");
  const effectiveFrom = watch("effectiveFrom");
  const changed = formState.dirtyFields.saturday || formState.dirtyFields.sundayOff;
  const pattern = buildPattern(saturday, sundayOff);

  const holidays = useMemo(() => new Map(data.holidays.map((h) => [h.date, h.name])), [data.holidays]);
  const validFrom = /^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom ?? "") ? effectiveFrom : data.today;
  const previewRules: WeeklyOffRuleLike[] = useMemo(() => {
    const others = data.rules.filter((r) => r.effectiveFrom !== validFrom);
    return changed ? [...others, { shiftId: null, effectiveFrom: validFrom, pattern }] : data.rules;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.rules, validFrom, changed, saturday, sundayOff]);
  const previewStart = (changed ? validFrom : data.today).slice(0, 7);

  const onSubmit = form.handleSubmit((v) =>
    start(async () => {
      const res = await scheduleWeeklyOff(v);
      if (!res.ok) {
        if (res.field && res.field in v) form.setError(res.field as FieldPath<WeeklyOffInput>, { message: res.error });
        else toast.error(res.error);
        return;
      }
      toast.success(res.message);
      form.reset(defaults);
      router.refresh();
    }),
  );

  return (
    <div className="space-y-8">
      <form id="weekly-off-form" onSubmit={onSubmit} noValidate className="space-y-8">
        <SettingsSection
          title="Weekly offs"
          description="Changing the policy starts a new rule from a date you choose. Earlier months keep the rule that applied then."
          aside={
            current && (
              <div className="rounded-md border border-line bg-surface p-3.5">
                <p className="text-caption text-ink-3 tabular-nums">In force since {formatDate(current.effectiveFrom)}</p>
                <p className="mt-1 text-body font-medium text-ink">{current.label}</p>
              </div>
            )
          }
        >
          <SettingsCard>
            <div className="space-y-2.5">
              <Label id="sat-label">Saturdays</Label>
              <Controller
                control={control}
                name="saturday"
                render={({ field }) => (
                  <div role="radiogroup" aria-labelledby="sat-label" className="grid gap-2 sm:grid-cols-2">
                    {SATURDAY_POLICY_KEYS.map((key) => {
                      const selected = field.value === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          onClick={() => field.onChange(key)}
                          className={cn(
                            "flex min-h-11 items-center gap-3 rounded-md border px-3.5 py-3 text-left transition-colors duration-[120ms] outline-none focus-visible:ring-2 focus-visible:ring-brand",
                            selected ? "border-brand bg-brand-subtle ring-1 ring-brand" : "border-line hover:border-line-strong",
                          )}
                        >
                          <span className={cn("grid size-[18px] shrink-0 place-items-center rounded-full border", selected ? "border-brand" : "border-line-strong")}>
                            {selected && <span className="size-2 rounded-full bg-brand" />}
                          </span>
                          <span className="min-w-0">
                            <span className={cn("block text-body font-medium", selected ? "text-brand-ink" : "text-ink")}>{SATURDAY_POLICIES[key].label}</span>
                            <span className="block text-caption text-ink-3">{SAT_HINT[key]}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              />
              <FieldError message={formState.errors.saturday?.message} />
            </div>

            <label className="flex items-center justify-between gap-4 rounded-md border border-line px-3.5 py-3">
              <span>
                <span className="block text-body font-medium">Sunday off</span>
                <span className="block text-caption text-ink-3">Every Sunday is a weekly off</span>
              </span>
              <Controller control={control} name="sundayOff" render={({ field }) => <Switch aria-label="Sunday off" checked={field.value} onCheckedChange={field.onChange} />} />
            </label>

            <div className="grid gap-4 border-t border-line pt-5 sm:grid-cols-[12rem_minmax(0,1fr)] sm:items-end">
              <div className="space-y-1.5">
                <Label htmlFor="effectiveFrom">Effective from</Label>
                <Input id="effectiveFrom" type="date" min={addDays(data.today, -400)} aria-invalid={!!formState.errors.effectiveFrom} {...register("effectiveFrom")} />
              </div>
              <p className="text-caption text-ink-3 sm:pb-2">
                {changed ? (
                  <>
                    <span className="font-medium text-ink">{describePattern(pattern)}</span> from {formatDate(validFrom)}
                    {validFrom < data.today ? ". Past days from that date are recalculated." : "."}
                  </>
                ) : (
                  "Pick a different policy above to schedule a change."
                )}
              </p>
              <FieldError message={formState.errors.effectiveFrom?.message} />
            </div>
          </SettingsCard>
        </SettingsSection>
        <SaveBar form="weekly-off-form" show={!!changed} pending={pending} onDiscard={() => form.reset(defaults)} label={validFrom > data.today ? "Schedule change" : "Apply change"} />
      </form>

      <SettingsSection title="Preview" description={changed ? "How the next two months look with the policy you picked." : "How the next two months look under the current policy."} aside={<PreviewLegend />}>
        <SettingsCard>
          <WeekPreview months={[previewStart, nextMonth(previewStart)]} rules={previewRules} holidays={holidays} from={changed ? validFrom : undefined} today={data.today} />
        </SettingsCard>
      </SettingsSection>

      <GroupWeeklyOffs data={data} />

      <CustomDates data={data} />

      <SettingsSection title="History" description="Every weekly-off policy, newest first. Rules that have started are kept so old months stay correct.">
        <SettingsCard className="p-0 sm:p-0">
          <ol className="relative">
            {data.rules.map((r, i) => {
              const isCurrent = r.id === data.currentId;
              const scheduled = r.effectiveFrom > data.today;
              const newer = data.rules[i - 1];
              return (
                <li key={r.id} data-testid="weekly-off-rule" className="relative flex gap-4 border-line px-4 py-4 sm:px-6 [&:not(:last-child)]:border-b">
                  <span className="relative flex w-3 shrink-0 justify-center pt-1.5">
                    <span aria-hidden className={cn("size-2.5 rounded-full ring-4 ring-surface", isCurrent ? "bg-st-present" : scheduled ? "border border-dashed border-st-pending bg-surface" : "bg-line-strong")} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-body font-medium text-ink">{r.label}</p>
                      {isCurrent && (
                        <span className="inline-flex h-[22px] items-center gap-1 rounded-full bg-st-present-tint pr-2 pl-1.5 text-caption font-semibold text-st-present-fg">
                          <CircleCheck aria-hidden className="size-3.5" />
                          In force
                        </span>
                      )}
                      {scheduled && (
                        <span className="inline-flex h-[22px] items-center gap-1 rounded-full border border-dashed border-st-pending bg-st-pending-tint pr-2 pl-1.5 text-caption font-semibold text-st-pending-fg">
                          <Hourglass aria-hidden className="size-3.5" />
                          Scheduled
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-caption text-ink-3 tabular-nums">
                      {formatDate(r.effectiveFrom)}
                      {newer ? ` – ${formatDate(addDays(newer.effectiveFrom, -1))}` : " onwards"}
                      {r.customOffDates.length + r.customWorkDates.length > 0 &&
                        ` · ${r.customOffDates.length} custom off, ${r.customWorkDates.length} custom working`}
                    </p>
                  </div>
                  {scheduled && (
                    <ConfirmButton
                      title="Withdraw this scheduled policy?"
                      description={`${r.label} from ${formatDate(r.effectiveFrom)} won't take effect. The policy before it continues.`}
                      confirmLabel="Withdraw"
                      action={() => deleteScheduledRule(r.id)}
                      onDone={() => router.refresh()}
                      variant="ghost"
                      size="sm"
                    >
                      <Undo2 /> Withdraw
                    </ConfirmButton>
                  )}
                </li>
              );
            })}
            {!data.rules.length && <li className="px-6 py-8 text-center text-body text-ink-2">No weekly-off policy yet: every day counts as a working day.</li>}
          </ol>
          {data.shiftRules.length > 0 && (
            <p className="border-t border-line px-4 py-3 text-caption text-ink-3 sm:px-6">
              {data.shiftRules.length} shift-specific rule{data.shiftRules.length === 1 ? "" : "s"} also exist ({[...new Set(data.shiftRules.map((r) => r.shiftName))].join(", ")}) and override this policy for those shifts.
            </p>
          )}
        </SettingsCard>
      </SettingsSection>
    </div>
  );
}

function CustomDates({ data }: { data: WorkingWeekData }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [date, setDate] = useState("");
  const [kind, setKind] = useState<"OFF" | "WORK">("OFF");
  const [error, setError] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);

  // Custom days on the rule in force and on scheduled rules, upcoming first.
  const entries = data.rules
    .filter((r) => r.id === data.currentId || r.effectiveFrom > data.today)
    .flatMap((r) => [...r.customOffDates.map((d) => ({ date: d, kind: "OFF" as const })), ...r.customWorkDates.map((d) => ({ date: d, kind: "WORK" as const }))])
    .sort((a, b) => b.date.localeCompare(a.date));

  const add = () =>
    start(async () => {
      setError("");
      if (!date) return setError("Pick a date");
      const res = await setCustomDate({ date, kind });
      if (!res.ok) return setError(res.error);
      toast.success(res.message);
      setDate("");
      router.refresh();
    });

  const remove = (d: string) => {
    setRemoving(d);
    start(async () => {
      const res = await removeCustomDate(d);
      setRemoving(null);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(res.message);
      router.refresh();
    });
  };

  return (
    <SettingsSection
      title="Custom per month"
      description="One-off changes on top of the company weekly pattern: give an extra day off, or make a usual off day a working day (e.g. a compensatory Saturday). Teams with their own policy keep their own week."
    >
      <SettingsCard>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="custom-date">Date</Label>
            <Input id="custom-date" type="date" className="w-full sm:w-44" min={addDays(data.today, -400)} value={date} onChange={(e) => setDate(e.target.value)} aria-invalid={!!error} />
          </div>
          <div className="space-y-2">
            <span className="block text-label text-ink" id="custom-kind">
              Make it
            </span>
            <ToggleGroup type="single" variant="outline" value={kind} onValueChange={(v) => v && setKind(v as "OFF" | "WORK")} aria-labelledby="custom-kind">
              <ToggleGroupItem value="OFF" className="px-3">
                <CalendarMinus /> Off day
              </ToggleGroupItem>
              <ToggleGroupItem value="WORK" className="px-3">
                <CalendarPlus /> Working day
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          <Button type="button" variant="outline" onClick={add} disabled={pending}>
            {pending && !removing && <Loader2 className="animate-spin" />}
            Add date
          </Button>
        </div>
        {date && !error && <p className="-mt-2 text-caption text-ink-3">{WEEKDAYS[weekdayOf(date)]}, {formatDate(date)}</p>}
        <FieldError message={error} />

        {entries.length > 0 ? (
          <ul className="divide-y divide-line rounded-md border border-line">
            {entries.map((e) => (
              <li key={`${e.kind}${e.date}`} className={cn("flex items-center gap-3 px-3.5 py-2.5", e.date < data.today && "text-ink-3")}>
                <span className={cn("inline-flex h-[22px] w-12 items-center justify-center rounded-xs text-caption font-semibold", e.kind === "OFF" ? "bg-st-weeklyoff-tint text-st-weeklyoff-fg" : "bg-st-present-tint text-st-present-fg")}>{e.kind === "OFF" ? "Off" : "Work"}</span>
                <span className="min-w-0 flex-1 truncate text-body tabular-nums">
                  {formatDate(e.date)} <span className="text-ink-3">· {WEEKDAYS[weekdayOf(e.date)]}</span>
                </span>
                <Button type="button" variant="ghost" size="icon" className="text-ink-3" aria-label={`Remove ${formatDate(e.date)}`} disabled={pending} onClick={() => remove(e.date)}>
                  {removing === e.date ? <Loader2 className="animate-spin" /> : <X />}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-md border border-dashed border-line px-4 py-5 text-center text-body text-ink-2">No custom days on the current policy.</p>
        )}
      </SettingsCard>
    </SettingsSection>
  );
}
