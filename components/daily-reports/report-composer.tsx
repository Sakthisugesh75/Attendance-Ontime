"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Check, CheckCheck, CircleAlert, Loader2, Lock, OctagonAlert, Plus, Send, Sunrise, Timer, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Controller, useFieldArray, useForm, useWatch, type FieldPath } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { saveDailyReport } from "@/lib/actions/daily-reports";
import type { DayHint, ReportRow } from "@/lib/daily-reports";
import { formatDate, formatDuration, WEEKDAYS, weekdayOf } from "@/lib/time";
import { cn } from "@/lib/utils";
import { blankTask, checkReportContent, fmtHours, MAX_TASKS, reportSchema, TASK_STATUS_META, TASK_STATUSES, totalHours, type ReportInput, type ReportValues } from "@/lib/validations/daily-reports";
import { checkAnswers, type AnswerValue, type FormField, type ReportForm } from "@/lib/validations/report-forms";
import { ReportBody } from "./report-body";

/** One custom field of the report form. */
function AnswerField({ field: f, value, error, onChange }: { field: FormField; value: AnswerValue; error?: string; onChange: (v: AnswerValue) => void }) {
  const id = `answer-${f.id}`;
  const wide = f.type === "textarea";
  return (
    <div className={cn("space-y-2", wide && "sm:col-span-2")}>
      <Label htmlFor={id}>
        {f.label}
        {!f.required && <span className="font-normal text-ink-3"> (optional)</span>}
      </Label>
      {f.type === "textarea" ? (
        <Textarea id={id} rows={3} maxLength={2000} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} aria-invalid={!!error} />
      ) : f.type === "select" || f.type === "yesno" ? (
        <Select
          value={f.type === "yesno" ? (value === true ? "yes" : value === false ? "no" : "") : typeof value === "string" ? value : ""}
          onValueChange={(v) => onChange(f.type === "yesno" ? v === "yes" : v)}
        >
          <SelectTrigger id={id} className="w-full" aria-invalid={!!error}>
            <SelectValue placeholder="Choose" />
          </SelectTrigger>
          <SelectContent>
            {(f.type === "yesno" ? ["yes", "no"] : f.options).map((o) => (
              <SelectItem key={o} value={o}>
                {f.type === "yesno" ? (o === "yes" ? "Yes" : "No") : o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Input
          id={id}
          type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
          inputMode={f.type === "number" ? "decimal" : undefined}
          maxLength={f.type === "text" ? 300 : undefined}
          value={value === null || typeof value === "boolean" ? "" : String(value)}
          onChange={(e) => onChange(f.type === "number" ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value)}
          className={cn((f.type === "number" || f.type === "date") && "tabular-nums")}
          aria-invalid={!!error}
        />
      )}
      {error ? (
        <p className="flex items-center gap-1.5 text-caption text-danger">
          <CircleAlert aria-hidden className="size-3.5 shrink-0" />
          {error}
        </p>
      ) : (
        f.hint && <p className="text-caption text-ink-3">{f.hint}</p>
      )}
    </div>
  );
}

const dayName = (d: string, today: string) => (d === today ? "Today" : WEEKDAYS[weekdayOf(d)]!.slice(0, 3));

/** Horizontal strip of the days that can still be filled, with each day's state. */
export function DayStrip({ dates, today, selected, onSelect, reports, hints }: { dates: string[]; today: string; selected: string; onSelect: (d: string) => void; reports: Map<string, ReportRow>; hints: Record<string, DayHint | null> }) {
  const activeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [selected]);
  return (
    <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0" role="tablist" aria-label="Report day">
      <div className="flex w-max gap-2">
        {dates.map((d) => {
          const r = reports.get(d);
          const h = hints[d];
          const off = !r && !!h?.label;
          const missed = !r && !off && d < today;
          const active = d === selected;
          return (
            <button
              key={d}
              ref={active ? activeRef : undefined}
              type="button"
              role="tab"
              aria-selected={active}
              data-testid={`day-${d}`}
              onClick={() => onSelect(d)}
              className={cn(
                "relative flex w-[4.25rem] shrink-0 flex-col items-center rounded-lg border px-2 pt-2 pb-2.5 transition-[background-color,border-color] duration-[120ms] outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-canvas active:translate-y-px",
                active ? "border-brand bg-brand text-on-brand" : "border-line bg-surface text-ink hover:border-line-strong",
                !active && d === today && "border-brand",
              )}
            >
              <span className={cn("text-caption", active ? "text-on-brand" : "text-ink-3")}>{dayName(d, today)}</span>
              <span className="mt-0.5 text-title-2 tabular-nums">{d.slice(8)}</span>
              <span className="mt-1 flex h-[18px] items-center">
                {r ? (
                  <span
                    className={cn("grid size-[18px] place-items-center rounded-full", r.reviewed ? "bg-st-present-tint text-st-present-fg" : "bg-sunken text-ink-2")}
                    title={r.reviewed ? "Reviewed" : "Sent"}
                  >
                    {r.reviewed ? <CheckCheck aria-hidden className="size-3" strokeWidth={3} /> : <Check aria-hidden className="size-3" strokeWidth={3} />}
                  </span>
                ) : off ? (
                  <span className={cn("max-w-full truncate text-caption", active ? "text-on-brand" : "text-ink-3")}>{h!.label === "Weekly off" ? "Off" : h!.label}</span>
                ) : missed ? (
                  <span className="size-1.5 rounded-full bg-st-late" title="Not sent" />
                ) : (
                  <span className={cn("size-1.5 rounded-full", active ? "bg-on-brand/50" : "bg-line")} />
                )}
              </span>
              {r && <span className="sr-only">{r.reviewed ? "Reviewed" : "Sent"}</span>}
              {missed && <span className="sr-only">Not sent</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function defaults(date: string, r: ReportRow | undefined): ReportInput {
  return r
    ? { date, tasks: r.tasks.length ? r.tasks.map((t) => ({ ...t })) : [blankTask()], summary: r.summary, tomorrowPlan: r.tomorrowPlan, blockers: r.blockers, answers: [] }
    : { date, tasks: [blankTask()], summary: "", tomorrowPlan: "", blockers: "", answers: [] };
}

/**
 * The report for one day: an editable form until it is reviewed, then a read-only view.
 * Give it a key per day + report version so switching days starts from fresh values.
 * `form` (from Settings → Report forms) decides which sections show and adds custom fields.
 */
export function ReportComposer({ date, today, report, hint, form: reportForm }: { date: string; today: string; report: ReportRow | undefined; hint: DayHint | null; form: ReportForm }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const form = useForm<ReportInput, unknown, ReportValues>({ resolver: zodResolver(reportSchema), defaultValues: defaults(date, report) });
  const { register, control, formState, handleSubmit } = form;
  const errors = formState.errors;
  const { fields, append, remove } = useFieldArray({ control, name: "tasks" });
  const tasks = useWatch({ control, name: "tasks" });
  const hours = totalHours(tasks ?? []);
  const blockersText = useWatch({ control, name: "blockers" });
  const S = reportForm.sections;
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>(() => Object.fromEntries((report?.answers ?? []).map((a) => [a.id, a.value])));
  const [answerErrors, setAnswerErrors] = useState<Record<string, string>>({});

  const onSubmit = handleSubmit((raw) =>
    start(async () => {
      const values = { ...raw, answers: reportForm.fields.map((f) => ({ id: f.id, value: answers[f.id] ?? null })) };
      // Same checks as the server, so problems show next to the field straight away.
      const content = checkReportContent(values, S);
      if (content) {
        if (content.field === "summary") form.setError("summary", { message: content.message });
        else form.setError("tasks", { message: content.message });
        return;
      }
      const checked = checkAnswers(reportForm.fields, values.answers);
      if (!checked.ok) {
        setAnswerErrors({ [checked.fieldId]: checked.message });
        document.getElementById(`answer-${checked.fieldId}`)?.focus();
        return;
      }
      setAnswerErrors({});
      const res = await saveDailyReport(values);
      if (!res.ok) {
        if (res.field && ["summary", "tomorrowPlan", "blockers"].includes(res.field)) form.setError(res.field as FieldPath<ReportInput>, { message: res.error });
        else if (res.field === "tasks") form.setError("tasks", { message: res.error });
        else if (res.field?.startsWith("answer:")) setAnswerErrors({ [res.field.slice(7)]: res.error });
        else toast.error(res.error);
        return;
      }
      toast.success(res.message, { description: formatDate(date) });
      navigator.vibrate?.(30);
      router.refresh();
    }),
  );

  const heading = date === today ? "Today's report" : `Report for ${WEEKDAYS[weekdayOf(date)]}, ${formatDate(date).slice(0, 6)}`;
  const worked = hint && hint.workedMinutes > 0 ? hint.workedMinutes : null;
  const err = (msg?: string) =>
    msg ? (
      <p className="flex items-center gap-1.5 text-caption text-danger">
        <CircleAlert aria-hidden className="size-3.5 shrink-0" />
        {msg}
      </p>
    ) : null;

  // Reviewed: final, read-only.
  if (report?.reviewed) {
    return (
      <section className="rounded-xl bg-surface shadow-card">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
          <div>
            <h3 className="text-title-3 text-ink">{heading}</h3>
            <p className="mt-0.5 flex items-center gap-1.5 text-caption text-ink-3">
              <Lock aria-hidden className="size-3.5" /> Reviewed, so it can&apos;t be changed
            </p>
          </div>
        </header>
        <div className="px-5 py-5 sm:px-6">
          <ReportBody report={report} workedMinutes={worked} />
        </div>
      </section>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="rounded-xl bg-surface shadow-card" aria-label={heading} data-testid="report-form">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <h3 className="text-title-3 text-ink">{heading}</h3>
          <p className="mt-0.5 text-caption text-ink-3 tabular-nums">
            {report ? `Sent at ${report.submittedAt}${report.edited ? " · edited" : ""}. You can change it until it's reviewed.` : "What you did, what's next and anything in your way."}
          </p>
        </div>
        {hint?.label && !report && <span className="inline-flex h-[22px] items-center rounded-full bg-sunken px-2 text-caption text-ink-2">{hint.label}</span>}
      </header>

      <div className="space-y-6 px-4 py-5 sm:px-6">
        {/* Attendance hint vs logged hours */}
        {worked !== null && (
          <div className="flex items-center gap-3 rounded-lg bg-sunken px-3.5 py-3">
            <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-md bg-surface text-ink-2">
              <Timer className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-body text-ink">
                <span className="font-semibold tabular-nums">{formatDuration(worked)}</span> at work{hint?.inProgress ? " so far" : ""}
                {S.tasks && <span className="text-ink-3 tabular-nums"> · {fmtHours(hours)} logged below</span>}
              </p>
              {S.tasks && (
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
                  <span className="block h-full rounded-full bg-ink-2 transition-[width] duration-[180ms]" style={{ width: `${Math.min(100, (hours * 60 * 100) / worked)}%` }} />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tasks */}
        {S.tasks && (
        <fieldset className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <legend className="text-label text-ink">What did you work on?</legend>
            <span className="text-caption text-ink-3 tabular-nums" data-testid="total-hours">
              Total {fmtHours(hours)}
            </span>
          </div>
          <ol className="space-y-2.5">
            {fields.map((f, i) => {
              const status = tasks?.[i]?.status ?? "DONE";
              const rowErr = errors.tasks?.[i];
              return (
                <li key={f.id} className={cn("relative rounded-xl bg-surface shadow-card p-2.5 pl-4 transition-colors focus-within:border-line-strong sm:p-2 sm:pl-4", status === "BLOCKED" && "border-st-absent bg-st-absent-tint")}>
                  <span aria-hidden className={cn("absolute inset-y-2.5 left-1.5 w-1 rounded-full", TASK_STATUS_META[status].dot)} />
                  <div className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_5.5rem_9.5rem_auto] sm:items-center">
                    <Input
                      {...register(`tasks.${i}.title`)}
                      placeholder={i === 0 ? "e.g. Edited the client promo video" : "Another task"}
                      aria-label={`Task ${i + 1}`}
                      aria-invalid={!!rowErr?.title}
                      maxLength={200}
                      className="col-span-2 h-11 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0 sm:col-span-1 md:h-9"
                    />
                    <div className="col-span-2 flex items-center gap-2 sm:contents">
                      <Controller
                        control={control}
                        name={`tasks.${i}.hours`}
                        render={({ field }) => (
                          <div className="relative w-24 shrink-0 sm:w-auto">
                            <Input
                              type="number"
                              inputMode="decimal"
                              min={0}
                              max={24}
                              step={0.25}
                              placeholder="Hours"
                              aria-label={`Hours for task ${i + 1}`}
                              aria-invalid={!!rowErr?.hours}
                              value={field.value ?? ""}
                              onChange={(e) => field.onChange(e.target.value === "" ? null : Number(e.target.value))}
                              onBlur={field.onBlur}
                              className="h-11 pr-6 tabular-nums md:h-9"
                            />
                            <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-caption text-ink-3">h</span>
                          </div>
                        )}
                      />
                      <Controller
                        control={control}
                        name={`tasks.${i}.status`}
                        render={({ field }) => (
                          <Select value={field.value} onValueChange={field.onChange}>
                            <SelectTrigger className="h-11 min-w-0 flex-1 data-[size=default]:h-11 sm:w-full md:data-[size=default]:h-9" aria-label={`Status of task ${i + 1}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {TASK_STATUSES.map((s) => (
                                <SelectItem key={s} value={s}>
                                  <span className={cn("size-2 rounded-full", TASK_STATUS_META[s].dot)} />
                                  {TASK_STATUS_META[s].label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-11 shrink-0 text-ink-3 hover:text-danger md:size-9"
                        onClick={() => (fields.length > 1 ? remove(i) : form.setValue(`tasks.${i}`, blankTask()))}
                        aria-label={`Remove task ${i + 1}`}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                  {(rowErr?.title || rowErr?.hours) && <div className="mt-1 px-1">{err(rowErr.title?.message ?? rowErr.hours?.message)}</div>}
                </li>
              );
            })}
          </ol>
          {err(errors.tasks?.root?.message ?? errors.tasks?.message)}
          <Button type="button" variant="outline" size="sm" className="w-full border-dashed max-md:h-11 sm:w-auto" onClick={() => append(blankTask(), { shouldFocus: true })} disabled={fields.length >= MAX_TASKS}>
            <Plus /> Add task
          </Button>
        </fieldset>
        )}

        {S.summary.on && (
          <div className="space-y-2">
            <Label htmlFor="summary">
              {S.summary.label} {S.tasks && <span className="font-normal text-ink-3">(optional if you listed tasks)</span>}
            </Label>
            <Textarea id="summary" rows={3} {...register("summary")} placeholder="How the day went, in a line or two" aria-invalid={!!errors.summary} maxLength={2000} />
            {err(errors.summary?.message)}
          </div>
        )}

        {reportForm.fields.length > 0 && (
          <div className="grid gap-5 sm:grid-cols-2">
            {reportForm.fields.map((f) => (
              <AnswerField
                key={f.id}
                field={f}
                value={answers[f.id] ?? null}
                error={answerErrors[f.id]}
                onChange={(v) => {
                  setAnswers((a) => ({ ...a, [f.id]: v }));
                  if (answerErrors[f.id]) setAnswerErrors({});
                }}
              />
            ))}
          </div>
        )}

        {(S.tomorrowPlan.on || S.blockers.on) && (
        <div className="grid gap-5 sm:grid-cols-2">
          {S.tomorrowPlan.on && (
          <div className="space-y-2">
            <Label htmlFor="tomorrowPlan" className="flex items-center gap-1.5">
              <Sunrise aria-hidden className="size-3.5 text-ink-3" /> {S.tomorrowPlan.label}
            </Label>
            <Textarea id="tomorrowPlan" rows={3} {...register("tomorrowPlan")} placeholder="What you'll pick up next" aria-invalid={!!errors.tomorrowPlan} maxLength={1000} />
            {err(errors.tomorrowPlan?.message)}
          </div>
          )}
          {S.blockers.on && (
          <div className="space-y-2">
            <Label htmlFor="blockers" className={cn("flex items-center gap-1.5", blockersText?.trim() && "text-st-absent-fg")}>
              <OctagonAlert aria-hidden className="size-3.5" /> {S.blockers.label}
            </Label>
            <Textarea
              id="blockers"
              rows={3}
              {...register("blockers")}
              placeholder="Waiting on someone? Missing something? Say so here."
              aria-invalid={!!errors.blockers}
              maxLength={1000}
              className={cn(blockersText?.trim() && "border-st-absent bg-st-absent-tint")}
            />
            {err(errors.blockers?.message)}
          </div>
          )}
        </div>
        )}
      </div>

      {/* Sticky on phones so the send button is always under the thumb. */}
      <div className="sticky bottom-0 z-10 flex items-center justify-between gap-3 rounded-b-lg border-t border-line bg-raised px-4 py-3 sm:px-6">
        <p className="min-w-0 text-caption text-ink-3 tabular-nums">
          {S.tasks ? (
            <>
              <span className="font-semibold text-ink">{tasks?.filter((t) => t.title.trim()).length ?? 0}</span> tasks ·{" "}
              <span className="font-semibold text-ink">{fmtHours(hours)}</span>
            </>
          ) : (
            reportForm.name
          )}
        </p>
        <Button type="submit" size="lg" disabled={pending} aria-busy={pending} className="min-w-32 px-4 md:h-10 md:text-body md:font-medium">
          {pending ? <Loader2 className="animate-spin" /> : <Send />}
          {report ? "Update report" : "Send report"}
        </Button>
      </div>
    </form>
  );
}
