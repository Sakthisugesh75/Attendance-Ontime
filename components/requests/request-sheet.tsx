"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarRange, CircleAlert, Loader2, Paperclip, TriangleAlert, UserRoundSearch, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Controller, useForm, type FieldPath } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { createRequest, createRequestForEmployee } from "@/lib/actions/requests";
import type { RequestFormOptions } from "@/lib/requests";
import { addDays, formatDate, istDate, monthLabel } from "@/lib/time";
import { cn } from "@/lib/utils";
import {
  ATTACHMENT_MAX_BYTES,
  checkLeaveBalance,
  checkPermission,
  countWorkingDays,
  eachDate,
  findClash,
  fmtDays,
  fmtNum,
  formatMinutes,
  minutesBetween,
  REQUEST_TYPE_META,
  REQUEST_TYPES,
  requestSchema,
  speakAbout,
  wfhOverCap,
  type RequestInput,
  type RequestTypeKey,
} from "@/lib/validations/requests";
import { DrawerContent, drawerBody, drawerDescription, drawerFooter, drawerHeader, drawerTitle } from "./drawer";

const TAB_LABEL: Record<RequestTypeKey, string> = { LEAVE: "Leave", WFH: "WFH", PERMISSION: "Permission", ON_DUTY: "On duty", REGULARIZATION: "Regularize" };
const TYPE_HINT: Record<RequestTypeKey, string> = {
  LEAVE: "Paid leave comes out of your balance. Weekly offs and holidays aren't counted.",
  WFH: "Working from home for one or more days.",
  PERMISSION: "Come in late or leave early for a short while.",
  ON_DUTY: "Working away from the office, e.g. a shoot at a client location.",
  REGULARIZATION: "Fix a missed or wrong punch on a past day.",
};

function defaults(options: RequestFormOptions, type: RequestTypeKey = "LEAVE"): RequestInput {
  const year = options.today.slice(0, 4);
  const firstPaid = options.balances[year]?.find((b) => b.isPaid && b.available > 0) ?? options.balances[year]?.[0];
  const date = type === "REGULARIZATION" ? addDays(options.today, -1) : options.today;
  return { type, leaveTypeId: firstPaid?.leaveTypeId ?? null, fromDate: date, toDate: date, halfDay: "NONE", startTime: "", endTime: "", reason: "" };
}

/** Stand-in figures while HR hasn't picked an employee yet (nothing is submitted with them). */
function emptyOptions(today: string): RequestFormOptions {
  return {
    today,
    joiningDate: "2000-01-01",
    exitDate: null,
    offDates: {},
    balances: {},
    caps: { wfhPerMonth: 0, permissionPerMonth: 0, permissionMaxMinutes: 0 },
    wfhDaysByMonth: {},
    permissionsByMonth: {},
    punches: {},
    active: [],
  };
}

/**
 * "On behalf" mode: HR / a manager records a request for an employee. The caller renders the
 * picker and loads that employee's figures into `options`.
 */
export interface BehalfMode {
  employeeId: number | null;
  name: string | null;
  picker: React.ReactNode;
  loading: boolean;
  error: string;
}

export function RequestSheet({
  open,
  onOpenChange,
  options: given,
  initialType,
  behalf,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The requester's figures; null in on-behalf mode until an employee is picked and loaded */
  options: RequestFormOptions | null;
  initialType?: RequestTypeKey;
  behalf?: BehalfMode;
}) {
  const router = useRouter();
  const [placeholder] = useState(() => emptyOptions(istDate()));
  const options = given ?? placeholder;
  const who = behalf ? behalf.name : null;
  const ready = !behalf || (!!behalf.employeeId && !!given && !behalf.loading);
  const [approveNow, setApproveNow] = useState(true);
  const [pending, start] = useTransition();
  const [formError, setFormError] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const activeTab = useRef<HTMLButtonElement>(null);

  const form = useForm<RequestInput>({ resolver: zodResolver(requestSchema), defaultValues: defaults(options, initialType) });
  const { register, control, watch, setValue, getValues, formState } = form;
  const errors = formState.errors;

  // A fresh form each time the sheet opens. In on-behalf mode, switching employee keeps what
  // was typed and only swaps the figures, so the full reset waits for the next opening.
  const resetOptions = behalf ? null : options;
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });
  useEffect(() => {
    if (open) {
      form.reset(defaults(resetOptions ?? optionsRef.current, initialType));
      setFormError("");
      setFile(null);
      setFileError("");
      setApproveNow(true);
    }
  }, [open, resetOptions, initialType, form]);
  const behalfMode = !!behalf;
  useEffect(() => {
    if (!behalfMode || !given) return;
    setFormError("");
    form.clearErrors();
    if (form.getValues("leaveTypeId") === null) form.setValue("leaveTypeId", defaults(given).leaveTypeId);
  }, [behalfMode, given, form]);

  const v = watch();
  const type = v.type;
  const single = type === "PERMISSION" || type === "REGULARIZATION";
  const toDate = single || !v.toDate ? v.fromDate : v.toDate;
  const oneDay = v.fromDate && toDate === v.fromDate;

  const switchType = (t: RequestTypeKey) => {
    if (t === type) return;
    const keep = getValues();
    const d = defaults(options, t);
    const keepDates = t !== "REGULARIZATION" && keep.type !== "REGULARIZATION" && !!keep.fromDate;
    form.reset({ ...d, reason: keep.reason, leaveTypeId: keep.leaveTypeId ?? d.leaveTypeId, ...(keepDates && { fromDate: keep.fromDate, toDate: keep.toDate || keep.fromDate }) });
    setFormError("");
  };

  // Fields that only apply to a single date are cleared once the range grows.
  useEffect(() => {
    if (oneDay) return;
    if (v.halfDay !== "NONE") setValue("halfDay", "NONE");
    if (type === "ON_DUTY" && (v.startTime || v.endTime)) {
      setValue("startTime", "");
      setValue("endTime", "");
    }
  }, [oneDay, type, v.halfDay, v.startTime, v.endTime, setValue]);

  // Keep the chosen type visible in the scrollable tab strip on phones.
  useEffect(() => {
    activeTab.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [type]);

  // ---- Live figures (the server recounts everything) ----
  const live = useMemo(() => {
    const isOff = (d: string) => d in options.offDates;
    const out: { days?: number; excluded: { date: string; label: string }[]; error?: string; warning?: string; info?: string; balance?: { name: string; available: number; after: number; isPaid: boolean } } = { excluded: [] };
    if (!v.fromDate || (!single && toDate && toDate < v.fromDate)) return out;
    const range = eachDate(v.fromDate, toDate);
    out.excluded = range.filter(isOff).map((d) => ({ date: d, label: options.offDates[d]! }));

    if (v.fromDate < options.joiningDate) out.error = `You joined on ${formatDate(options.joiningDate)}.`;
    else if (options.exitDate && toDate > options.exitDate) out.error = `Your last working day is ${formatDate(options.exitDate)}.`;

    const halfDay = type === "LEAVE" && oneDay && v.halfDay !== "NONE" ? v.halfDay : null;
    if (type === "LEAVE") {
      out.days = countWorkingDays(v.fromDate, toDate, isOff, halfDay as "FIRST" | "SECOND" | null);
      const b = (options.balances[v.fromDate.slice(0, 4)] ?? []).find((x) => x.leaveTypeId === v.leaveTypeId);
      if (b) {
        out.balance = { name: b.name, available: b.available, after: b.available - out.days, isPaid: b.isPaid };
        out.error ??= checkLeaveBalance(out.days, b.available, b.isPaid) ?? undefined;
      }
      if (!out.days && !out.error) out.error = "Those dates are all weekly offs or holidays.";
    } else if (type === "WFH") {
      out.days = countWorkingDays(v.fromDate, toDate, isOff);
      if (!out.days) out.error ??= "Those dates are all weekly offs or holidays.";
      const over = wfhOverCap(range.filter((d) => !isOff(d)), options.wfhDaysByMonth, options.caps.wfhPerMonth);
      if (over.length) out.warning = `Goes past the WFH limit of ${options.caps.wfhPerMonth} days a month (${over.map((o) => `${monthLabel(o.month)}: ${o.total}`).join(", ")}).${who ? "" : " You can still send it; HR decides."}`;
    } else if (type === "ON_DUTY") {
      out.days = countWorkingDays(v.fromDate, toDate, isOff);
    } else if (type === "PERMISSION") {
      const used = options.permissionsByMonth[v.fromDate.slice(0, 7)] ?? 0;
      if (isOff(v.fromDate)) out.error ??= `${formatDate(v.fromDate)} is ${options.offDates[v.fromDate] === "Weekly off" ? "a weekly off" : options.offDates[v.fromDate]}.`;
      if (v.startTime && v.endTime && v.endTime > v.startTime) {
        out.error ??= checkPermission(v.startTime, v.endTime, used, options.caps) ?? undefined;
        out.info = `${formatMinutes(minutesBetween(v.startTime, v.endTime))} of up to ${formatMinutes(options.caps.permissionMaxMinutes)}`;
      } else if (used >= options.caps.permissionPerMonth) {
        out.error ??= `You've already used ${options.caps.permissionPerMonth} permissions in ${monthLabel(v.fromDate.slice(0, 7))} (the monthly limit).`;
      }
      out.info = [out.info, `${used} of ${options.caps.permissionPerMonth} used in ${monthLabel(v.fromDate.slice(0, 7))}`].filter(Boolean).join(" · ");
    } else if (type === "REGULARIZATION") {
      if (v.fromDate >= options.today) out.error ??= "Pick a past day. Use punch in/out for today.";
      const p = options.punches[v.fromDate];
      out.info = p ? `Recorded: in ${p.in ?? "—"} · out ${p.out ?? "—"}` : "No punches recorded that day.";
      if (!v.startTime && v.endTime && !p?.in) out.error ??= "There's no punch-in on that day. Add the punch-in time too.";
    }

    if (!out.error) {
      const slot = { type, fromDate: v.fromDate, toDate, halfDay: halfDay as "FIRST" | "SECOND" | null };
      const clash = findClash(slot, options.active);
      if (clash) out.error = `Clashes with your ${clash.label.charAt(0).toLowerCase()}${clash.label.slice(1)}.`;
    }
    // On behalf: the same rules, worded about the employee instead of "you".
    if (who) {
      if (out.error) out.error = speakAbout(out.error, who);
      if (out.warning) out.warning = speakAbout(out.warning, who);
    }
    return out;
  }, [v.fromDate, toDate, v.halfDay, v.leaveTypeId, v.startTime, v.endTime, type, single, oneDay, options, who]);

  const onPickFile = (f: File | null) => {
    setFileError("");
    if (!f) return setFile(null);
    if (!["application/pdf", "image/jpeg", "image/png"].includes(f.type)) {
      setFileError("Attach a PDF, JPG or PNG file.");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    if (f.size > ATTACHMENT_MAX_BYTES) {
      setFileError("The attachment must be 5 MB or smaller.");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setFile(f);
  };

  const onSubmit = form.handleSubmit((values) =>
    start(async () => {
      setFormError("");
      if (!ready) return setFormError("Pick the employee first.");
      if (live.error) return setFormError(live.error);
      const fd = new FormData();
      fd.set("payload", JSON.stringify(values));
      if (file && values.type === "LEAVE") fd.set("attachment", file);
      if (behalf) {
        fd.set("employeeId", String(behalf.employeeId));
        fd.set("approve", approveNow ? "1" : "0");
      }
      const res = behalf ? await createRequestForEmployee(fd) : await createRequest(fd);
      if (!res.ok) {
        if (res.field && res.field in values) form.setError(res.field as FieldPath<RequestInput>, { message: res.error });
        else if (res.field === "attachment") setFileError(res.error);
        else setFormError(res.error);
        return;
      }
      toast.success(res.message);
      if (res.warning) toast.warning(res.warning);
      onOpenChange(false);
      router.refresh();
    }),
  );

  const err = (msg?: string) =>
    msg ? (
      <p className="flex items-center gap-1.5 text-caption text-danger">
        <CircleAlert aria-hidden className="size-3.5 shrink-0" />
        {msg}
      </p>
    ) : null;
  const year = (v.fromDate || options.today).slice(0, 4);
  const leaveTypes = options.balances[year] ?? options.balances[options.today.slice(0, 4)] ?? [];
  const meta = REQUEST_TYPE_META[type];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        size="form"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          activeTab.current?.focus({ preventScroll: true });
          activeTab.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
        }}
      >
        <SheetHeader className={drawerHeader}>
          <SheetTitle className={drawerTitle}>{behalf ? "Record for employee" : "New request"}</SheetTitle>
          <SheetDescription className={drawerDescription}>{behalf ? speakAbout(TYPE_HINT[type], who ?? "the employee") : TYPE_HINT[type]}</SheetDescription>
        </SheetHeader>

        <div className="shrink-0 border-b border-line">
          <div className="flex gap-1 overflow-x-auto px-2 [scrollbar-width:none] sm:px-3" role="tablist" aria-label="Request type">
            {REQUEST_TYPES.map((t) => {
              const active = t === type;
              return (
                <button
                  key={t}
                  ref={active ? activeTab : undefined}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => switchType(t)}
                  className={cn(
                    "relative flex h-11 shrink-0 items-center gap-2 rounded-xs px-3 text-label whitespace-nowrap transition-colors duration-[120ms] outline-none focus-visible:ring-2 focus-visible:ring-brand md:h-10",
                    active ? "text-ink" : "text-ink-3 hover:text-ink",
                  )}
                >
                  <span aria-hidden className={cn("size-1.5 rounded-full", REQUEST_TYPE_META[t].dot)} />
                  {TAB_LABEL[t]}
                  {active && <span aria-hidden className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-ink" />}
                </button>
              );
            })}
          </div>
        </div>

        <form id="request-form" onSubmit={onSubmit} noValidate className={cn(drawerBody, "space-y-5")}>
          {behalf && (
            <div className="space-y-2">
              <Label htmlFor="entry-employee">Employee</Label>
              {behalf.picker}
              {behalf.error ? err(behalf.error) : ready && <EmployeeFigures options={options} month={(v.fromDate || options.today).slice(0, 7)} />}
            </div>
          )}

          {behalf && !ready ? (
            <BehalfPlaceholder loading={behalf.loading} />
          ) : (
            <>
            {type === "LEAVE" && (
              <div className="space-y-2">
                <Label htmlFor="leaveTypeId">Leave type</Label>
                <Controller
                  control={control}
                  name="leaveTypeId"
                  render={({ field }) => (
                    <Select value={field.value ? String(field.value) : undefined} onValueChange={(x) => field.onChange(Number(x))}>
                      <SelectTrigger id="leaveTypeId" className="w-full" aria-invalid={!!errors.leaveTypeId}>
                        <SelectValue placeholder="Pick a leave type" />
                      </SelectTrigger>
                      <SelectContent>
                        {leaveTypes.map((b) => (
                          <SelectItem key={b.leaveTypeId} value={String(b.leaveTypeId)}>
                            {b.name}
                            <span className="text-ink-3 tabular-nums">· {b.isPaid ? `${fmtNum(b.available)} available` : "unpaid"}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {err(errors.leaveTypeId?.message)}
              </div>
            )}

            {single ? (
              <div className="space-y-2">
                <Label htmlFor="fromDate">Date</Label>
                <Input
                  id="fromDate"
                  type="date"
                  min={options.joiningDate}
                  max={type === "REGULARIZATION" ? addDays(options.today, -1) : (options.exitDate ?? undefined)}
                  aria-invalid={!!errors.fromDate}
                  {...register("fromDate")}
                />
                {err(errors.fromDate?.message)}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="fromDate">From</Label>
                  <Input
                    id="fromDate"
                    type="date"
                    min={options.joiningDate}
                    max={options.exitDate ?? undefined}
                    aria-invalid={!!errors.fromDate}
                    {...register("fromDate", {
                      onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                        const to = getValues("toDate");
                        if (!to || to < e.target.value) setValue("toDate", e.target.value);
                      },
                    })}
                  />
                  {err(errors.fromDate?.message)}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="toDate">To</Label>
                  <Input id="toDate" type="date" min={v.fromDate || options.joiningDate} max={options.exitDate ?? undefined} aria-invalid={!!errors.toDate} {...register("toDate")} />
                  {err(errors.toDate?.message)}
                </div>
              </div>
            )}

            {type === "LEAVE" && oneDay && (
              <div className="space-y-2">
                <Label id="halfDay-label">Duration</Label>
                <Controller
                  control={control}
                  name="halfDay"
                  render={({ field }) => (
                    <Segmented
                      labelledBy="halfDay-label"
                      value={field.value}
                      onChange={field.onChange}
                      options={[
                        { value: "NONE", label: "Full day" },
                        { value: "FIRST", label: "First half" },
                        { value: "SECOND", label: "Second half" },
                      ]}
                    />
                  )}
                />
                {err(errors.halfDay?.message)}
              </div>
            )}

            {(type === "PERMISSION" || type === "REGULARIZATION" || (type === "ON_DUTY" && oneDay)) && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="startTime">{type === "REGULARIZATION" ? "Punch-in" : type === "ON_DUTY" ? "Start time (optional)" : "Start time"}</Label>
                  <Input id="startTime" type="time" className="tabular-nums" aria-invalid={!!errors.startTime} {...register("startTime")} />
                  {err(errors.startTime?.message)}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="endTime">{type === "REGULARIZATION" ? "Punch-out" : type === "ON_DUTY" ? "End time (optional)" : "End time"}</Label>
                  <Input id="endTime" type="time" className="tabular-nums" aria-invalid={!!errors.endTime} {...register("endTime")} />
                  {err(errors.endTime?.message)}
                </div>
                {type === "REGULARIZATION" && <p className="col-span-2 -mt-1 text-caption text-ink-3">Fill only the time that needs fixing. The other one stays as recorded.</p>}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="reason">{type === "ON_DUTY" ? "Purpose" : "Reason"}</Label>
              <Textarea
                id="reason"
                rows={3}
                placeholder={type === "ON_DUTY" ? "e.g. Shooting at client location" : type === "REGULARIZATION" ? "e.g. Forgot to punch out; left at 6:40 PM" : "A line for HR"}
                aria-invalid={!!errors.reason}
                {...register("reason")}
              />
              {err(errors.reason?.message)}
            </div>

            {type === "LEAVE" && (
              <div className="space-y-2">
                <Label htmlFor="attachment">
                  Attachment <span className="font-normal text-ink-3">(optional)</span>
                </Label>
                {file ? (
                  <div className="flex min-h-12 items-center gap-2 rounded-md border border-line bg-surface py-1 pr-1 pl-3 text-body md:min-h-10">
                    <Paperclip aria-hidden className="size-4 shrink-0 text-ink-3" />
                    <span className="min-w-0 flex-1 truncate text-ink">{file.name}</span>
                    <span className="shrink-0 text-caption text-ink-3 tabular-nums">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Remove attachment"
                      onClick={() => {
                        setFile(null);
                        if (fileRef.current) fileRef.current.value = "";
                      }}
                    >
                      <X />
                    </Button>
                  </div>
                ) : (
                  <Input id="attachment" ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png" onChange={(e) => onPickFile(e.target.files?.[0] ?? null)} className="text-body file:mr-3 file:text-label file:text-brand-ink" />
                )}
                <p className="text-caption text-ink-3">Medical certificate or similar. PDF, JPG or PNG, up to 5 MB.</p>
                {err(fileError)}
              </div>
            )}

            {/* Live summary */}
            <div className="rounded-lg border border-line bg-sunken p-4" aria-live="polite">
              <div className="flex items-start gap-3">
                <span aria-hidden className={cn("mt-0.5 grid size-8 shrink-0 place-items-center rounded-md", meta.chip.replace(/ring-\S+/, ""))}>
                  <CalendarRange className="size-4" />
                </span>
                <div className="min-w-0 flex-1 text-body text-ink-2">
                  {live.days !== undefined ? (
                    <p className="font-medium text-ink">
                      <span className="text-title-2 tabular-nums" data-testid="live-days">
                        {fmtDays(live.days)}
                      </span>
                      {type === "LEAVE" || type === "WFH" ? "" : " on working days"}
                    </p>
                  ) : (
                    <p className="text-title-3 text-ink tabular-nums">{v.fromDate ? formatDate(v.fromDate) : "Pick a date"}</p>
                  )}
                  {live.balance && (
                    <p className="mt-0.5 tabular-nums" data-testid="live-balance">
                      {live.balance.isPaid ? (
                        <>
                          {live.balance.name}: {fmtNum(live.balance.available)} available → <span className={cn("font-semibold text-ink", live.balance.after < 0 && "text-danger")}>{fmtNum(live.balance.after)}</span> after this
                        </>
                      ) : (
                        <>{live.balance.name} is unpaid: no balance needed</>
                      )}
                    </p>
                  )}
                  {live.info && <p className="mt-0.5 tabular-nums">{live.info}</p>}
                  {live.excluded.length > 0 && !single && (
                    <p className="mt-1 text-caption text-ink-3 tabular-nums">
                      Not counted: {live.excluded.slice(0, 4).map((x) => `${formatDate(x.date).slice(0, 6)} (${x.label})`).join(", ")}
                      {live.excluded.length > 4 ? ` +${live.excluded.length - 4} more` : ""}
                    </p>
                  )}
                </div>
              </div>
              {live.warning && (
                <p className="mt-3 flex gap-2 rounded-md bg-st-late-tint px-3 py-2 text-caption text-st-late-fg">
                  <TriangleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
                  {live.warning}
                </p>
              )}
              {live.error && (
                <p role="alert" className="mt-3 flex gap-2 rounded-md bg-danger-subtle px-3 py-2 text-caption text-danger">
                  <CircleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
                  {live.error}
                </p>
              )}
            </div>

            {behalf && (
              <label htmlFor="approve-now" className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface px-4 py-3 transition-colors has-data-[state=checked]:border-brand has-data-[state=checked]:bg-brand-subtle">
                <Checkbox id="approve-now" className="mt-0.5" checked={approveNow} onCheckedChange={(c) => setApproveNow(c === true)} />
                <span className="min-w-0 text-body">
                  <span className="block font-medium text-ink">Approve now</span>
                  <span className="block text-caption text-ink-2">
                    {approveNow ? `${who ?? "The employee"} is told it's approved. Leave days come out of the balance right away.` : "It waits in Approvals like any other request."}
                  </span>
                </span>
              </label>
            )}
            </>
          )}

          {formError && formError !== live.error && (
            <p role="alert" className="flex gap-2 rounded-md bg-danger-subtle px-3 py-2.5 text-body text-danger">
              <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              {formError}
            </p>
          )}
        </form>

        <SheetFooter className={drawerFooter}>
          <Button type="button" variant="outline" className="max-md:h-12 max-md:flex-1" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="request-form" className="max-md:h-12 max-md:flex-1" disabled={pending || !ready || !!live.error} aria-busy={pending}>
            {pending && <Loader2 className="animate-spin" />}
            {behalf ? (approveNow ? "Record & approve" : "Record request") : "Send request"}
          </Button>
        </SheetFooter>
      </DrawerContent>
    </Sheet>
  );
}

/** On behalf, before the form: a skeleton while the employee's figures load, else a prompt to pick someone. */
function BehalfPlaceholder({ loading }: { loading: boolean }) {
  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading the employee's balances">
        <Skeleton className="h-12 w-full rounded-md md:h-10" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-12 rounded-md md:h-10" />
          <Skeleton className="h-12 rounded-md md:h-10" />
        </div>
        <Skeleton className="h-20 w-full rounded-md" />
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed border-line-strong px-6 py-10 text-center">
      <span aria-hidden className="grid size-16 place-items-center rounded-full bg-sunken text-ink-3">
        <UserRoundSearch className="size-7" />
      </span>
      <p className="mt-3 text-title-3 text-ink">Who is this for?</p>
      <p className="mt-1 max-w-xs text-body text-ink-2">Pick the employee who asked. Their balance, permission count and existing requests are checked as you fill it in.</p>
    </div>
  );
}

/** On behalf: the picked employee's paid balances and the permissions used in the month, at a glance. */
function EmployeeFigures({ options, month }: { options: RequestFormOptions; month: string }) {
  const paid = (options.balances[month.slice(0, 4)] ?? []).filter((b) => b.isPaid);
  const used = options.permissionsByMonth[month] ?? 0;
  const cap = options.caps.permissionPerMonth;
  return (
    <ul className="flex flex-wrap gap-1.5 pt-0.5" aria-label="Balances" data-testid="entry-figures">
      {paid.map((b) => (
        <li key={b.leaveTypeId} className="inline-flex h-7 items-center gap-1 rounded-full bg-sunken px-2.5 text-caption text-ink-2 tabular-nums" title={b.name}>
          <span className="font-semibold text-ink">{b.code}</span> {fmtNum(b.available)} left
        </li>
      ))}
      <li className={cn("inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-caption tabular-nums", used >= cap ? "bg-danger-subtle text-danger" : "bg-st-leave-tint text-st-leave-fg")}>
        <span className="font-semibold">Permissions</span> {used} of {cap} in {monthLabel(month)}
      </li>
    </ul>
  );
}

function Segmented<T extends string>({ value, onChange, options, labelledBy }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; labelledBy: string }) {
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="grid grid-cols-3 gap-1 rounded-md bg-sunken p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-10 rounded-sm text-label transition-colors duration-[120ms] outline-none focus-visible:ring-2 focus-visible:ring-brand md:h-8",
            value === o.value ? "bg-surface text-ink shadow-sm" : "text-ink-3 hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
