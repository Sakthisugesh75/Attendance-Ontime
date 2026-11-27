"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Ban, BriefcaseBusiness, CalendarCheck2, CircleAlert, CircleCheck, Loader2, Pencil, Plane, Plus, SlidersHorizontal, Trash2, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Controller, useForm, type FieldPath } from "react-hook-form";
import { toast } from "sonner";
import { EmptyState } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmployeeCombobox } from "@/components/requests/employee-combobox";
import { allocateBalances, deleteLeaveType, deleteQuotaRule, saveLeaveType, saveQuotaRule } from "@/lib/actions/settings";
import * as T from "@/components/reports/table-styles";
import { cn } from "@/lib/utils";
import { leaveTypeSchema, quotaRuleFormSchema, type LeaveTypeInput, type QuotaRuleInput } from "@/lib/validations/settings";
import type { LeaveTypeRow, LeaveTypesData, QuotaRuleRow } from "@/app/(dashboard)/settings/data";
import { ConfirmButton } from "./confirm-button";
import { NumberField, SettingsCard, SettingsSection } from "./section";

const days = (n: number) => `${n % 1 ? n.toFixed(1) : n} day${n === 1 ? "" : "s"}`;
const availableTo = (t: LeaveTypeRow, designations: LeaveTypesData["designations"]) =>
  designations
    .filter((d) => t.designationIds.includes(d.id))
    .map((d) => d.name)
    .join(", ");

export function LeaveTypesSection({ data }: { data: LeaveTypesData }) {
  const router = useRouter();
  const [editing, setEditing] = useState<LeaveTypeRow | null>(null);
  const [open, setOpen] = useState(false);
  const openSheet = (t: LeaveTypeRow | null) => {
    setEditing(t);
    setOpen(true);
  };

  return (
    <div className="space-y-8">
      <SettingsSection
        title="Leave types"
        description="Each type has a yearly quota per employee. Inactive types can't be requested but keep their history."
        aside={
          <Button onClick={() => openSheet(null)}>
            <Plus /> New leave type
          </Button>
        }
      >
        <div className="overflow-hidden rounded-xl bg-surface shadow-card">
          {data.types.length ? (
            <>
              {/* Phones: stacked rows */}
              <ul className="divide-y divide-line sm:hidden">
                {data.types.map((t) => (
                  <li key={t.id} className={cn("flex items-start gap-3 px-4 py-3.5", !t.isActive && "text-ink-3")}>
                    <span className="mt-0.5 w-11 shrink-0 rounded-xs bg-st-leave-tint py-1 text-center text-caption font-semibold text-st-leave-fg">{t.code}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-body font-medium">{t.name}</p>
                      <p className="mt-0.5 text-caption text-ink-3 tabular-nums">
                        {days(t.yearlyQuota)} / year · {t.isPaid ? "Paid" : "Unpaid"}
                        {t.carryForward ? ` · carry ≤ ${days(t.maxCarryForward)}` : ""}
                        {t.designationIds.length ? ` · ${availableTo(t, data.designations)}` : ""}
                        {!t.isActive && " · Inactive"}
                      </p>
                    </div>
                    <LeaveRowActions t={t} onEdit={() => openSheet(t)} onDone={() => router.refresh()} />
                  </li>
                ))}
              </ul>
              <Table className="hidden sm:table">
                <TableHeader>
                  <TableRow className={T.headRow}>
                    <TableHead className={T.th}>Type</TableHead>
                    <TableHead className={cn(T.th, "text-right")}>Quota / year</TableHead>
                    <TableHead className={T.th}>Paid</TableHead>
                    <TableHead className={T.th}>Carry forward</TableHead>
                    <TableHead className={T.th}>Available to</TableHead>
                    <TableHead className={T.th}>Status</TableHead>
                    <TableHead className={cn(T.th, "w-24")}>
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.types.map((t) => (
                    <TableRow key={t.id} className={cn(T.row, !t.isActive && "[&_td]:text-ink-3")}>
                      <TableCell className={T.td}>
                        <span className="flex items-center gap-3">
                          <span className="w-11 shrink-0 rounded-xs bg-st-leave-tint py-1 text-center text-caption font-semibold text-st-leave-fg">{t.code}</span>
                          <span className="font-medium text-ink">{t.name}</span>
                        </span>
                      </TableCell>
                      <TableCell className={cn(T.td, T.num)}>{t.yearlyQuota}</TableCell>
                      <TableCell className={T.td}>{t.isPaid ? "Paid" : "Unpaid"}</TableCell>
                      <TableCell className={T.td}>{t.carryForward ? <span className="tabular-nums">up to {days(t.maxCarryForward)}</span> : <span className="text-ink-3">No</span>}</TableCell>
                      <TableCell className={cn(T.td, "max-w-48")}>
                        {t.designationIds.length ? (
                          <span className="block truncate" title={availableTo(t, data.designations)}>
                            {availableTo(t, data.designations)}
                          </span>
                        ) : (
                          <span className="text-ink-3">Everyone</span>
                        )}
                      </TableCell>
                      <TableCell className={T.td}>
                        <span className={cn("inline-flex h-[22px] items-center gap-1 rounded-full pr-2 pl-1.5 text-caption font-semibold", t.isActive ? "bg-st-present-tint text-st-present-fg" : "bg-sunken text-ink-2")}>
                          {t.isActive ? <CircleCheck aria-hidden className="size-3.5" /> : <Ban aria-hidden className="size-3.5" />}
                          {t.isActive ? "Active" : "Inactive"}
                        </span>
                      </TableCell>
                      <TableCell className={cn(T.td, "py-2 text-right")}>
                        <LeaveRowActions t={t} onEdit={() => openSheet(t)} onDone={() => router.refresh()} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          ) : (
            <EmptyState icon={Plane} title="No leave types yet" action={<Button variant="outline" onClick={() => openSheet(null)}>Add a leave type</Button>}>
              Add Casual, Sick or Earned leave so employees can request time off.
            </EmptyState>
          )}
        </div>
      </SettingsSection>

      <QuotaRulesPanel data={data} />
      <AllocatePanel data={data} />
      <LeaveTypeSheet open={open} onOpenChange={setOpen} type={editing} designations={data.designations} />
    </div>
  );
}

function LeaveRowActions({ t, onEdit, onDone }: { t: LeaveTypeRow; onEdit: () => void; onDone: () => void }) {
  return (
    <span className="inline-flex items-center gap-1">
      <Button variant="ghost" size="icon" className="text-ink-3" aria-label={`Edit ${t.name}`} onClick={onEdit}>
        <Pencil />
      </Button>
      <ConfirmButton
        variant="ghost"
        size="icon"
        className="text-ink-3 hover:text-danger"
        aria-label={`Delete ${t.name}`}
        title={`Delete ${t.name}?`}
        blockedReason={t.requests > 0 ? `${t.name} has ${t.requests} leave request${t.requests === 1 ? "" : "s"}. Edit it and switch it to inactive instead, so history stays intact.` : undefined}
        description="Its leave balances are removed too. This can't be undone."
        confirmLabel="Delete"
        action={() => deleteLeaveType(t.id)}
        onDone={onDone}
      >
        <Trash2 />
      </ConfirmButton>
    </span>
  );
}

function AllocatePanel({ data }: { data: LeaveTypesData }) {
  const router = useRouter();
  const [year, setYear] = useState(String(data.year));
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const active = data.types.filter((t) => t.isActive);
  const y = Number(year);

  const run = () =>
    start(async () => {
      const res = await allocateBalances(y);
      setConfirm(false);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(res.message);
      router.refresh();
    });

  return (
    <SettingsSection
      title="Yearly balances"
      description="Balances follow on their own: each person gets their quota (custom or default), and types with carry forward add last year's unused days, up to the limit, even if nobody allocated last year. Run this to store the figures for a year or to re-apply a changed quota. Days already used are kept, so it's safe to run again."
    >
      <SettingsCard
        footer={
          <>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger className="w-28" aria-label="Year">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[data.year - 1, data.year, data.year + 1].map((yr) => (
                  <SelectItem key={yr} value={String(yr)}>
                    {yr}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {confirm ? (
              <span className="flex items-center gap-1.5">
                <Button variant="ghost" onClick={() => setConfirm(false)} disabled={pending}>
                  Cancel
                </Button>
                <Button onClick={run} disabled={pending}>
                  {pending && <Loader2 className="animate-spin" />}
                  Confirm for {y}
                </Button>
              </span>
            ) : (
              <Button onClick={() => setConfirm(true)} disabled={!active.length || !data.activeEmployees}>
                <CalendarCheck2 /> Allocate balances for {y}
              </Button>
            )}
          </>
        }
      >
        <div className="grid grid-cols-3 gap-4">
          <Figure label="Employees" value={data.activeEmployees} />
          <Figure label="Active types" value={active.length} />
          <Figure label={`Rows for ${y}`} value={data.allocated[y] ?? 0} hint={data.allocated[y] ? "already allocated" : "not allocated yet"} />
        </div>
        {confirm && (
          <p role="status" className="rounded-md border border-dashed border-line px-3 py-2.5 text-body text-ink-2 tabular-nums">
            Creates or updates {data.activeEmployees * active.length} balances ({data.activeEmployees} employees × {active.length} types: {active.map((t) => t.code).join(", ")}).
          </p>
        )}
      </SettingsCard>
    </SettingsSection>
  );
}

function Figure({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-label text-ink-2">{label}</p>
      <p className="mt-1 text-display text-ink tabular-nums">{value}</p>
      {hint && <p className="truncate text-caption text-ink-3">{hint}</p>}
    </div>
  );
}

function leaveDefaults(t: LeaveTypeRow | null): LeaveTypeInput {
  return t
    ? { code: t.code, name: t.name, yearlyQuota: t.yearlyQuota, isPaid: t.isPaid, carryForward: t.carryForward, maxCarryForward: t.maxCarryForward, isActive: t.isActive, designationIds: t.designationIds }
    : { code: "", name: "", yearlyQuota: 12, isPaid: true, carryForward: false, maxCarryForward: 0, isActive: true, designationIds: [] };
}

function LeaveTypeSheet({ open, onOpenChange, type, designations }: { open: boolean; onOpenChange: (o: boolean) => void; type: LeaveTypeRow | null; designations: LeaveTypesData["designations"] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [formError, setFormError] = useState("");
  const form = useForm<LeaveTypeInput>({ resolver: zodResolver(leaveTypeSchema), defaultValues: leaveDefaults(type) });
  const { register, control, watch, formState } = form;
  const errors = formState.errors;
  const carry = watch("carryForward");

  useEffect(() => {
    if (open) {
      form.reset(leaveDefaults(type));
      setFormError("");
    }
  }, [open, type, form]);

  const onSubmit = form.handleSubmit((v) =>
    start(async () => {
      setFormError("");
      const res = await saveLeaveType(type?.id ?? null, v);
      if (!res.ok) {
        if (res.field && res.field in v) form.setError(res.field as FieldPath<LeaveTypeInput>, { message: res.error });
        else setFormError(res.error);
        return;
      }
      toast.success(res.message);
      onOpenChange(false);
      router.refresh();
    }),
  );

  const toggle = (name: "isPaid" | "carryForward" | "isActive", label: string, hint: string) => (
    <label className="flex items-start justify-between gap-4 rounded-md border border-line p-3.5">
      <span>
        <span className="block text-body font-medium">{label}</span>
        <span className="block text-caption text-ink-3">{hint}</span>
      </span>
      <Controller control={control} name={name} render={({ field }) => <Switch aria-label={label} checked={field.value} onCheckedChange={field.onChange} />} />
    </label>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="gap-0 border-line bg-raised p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[560px]">
        <SheetHeader className="gap-1 border-b border-line px-5 py-4 pr-14 sm:px-6">
          <SheetTitle className="text-title-3 text-ink">{type ? `Edit ${type.name}` : "New leave type"}</SheetTitle>
          <SheetDescription className="text-body text-ink-2">The default for everyone without a custom quota. Stored balances pick up a changed quota when you next allocate.</SheetDescription>
        </SheetHeader>
        <form id="leave-type-form" onSubmit={onSubmit} noValidate className="flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
          <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="lt-code">Code</Label>
              <Input id="lt-code" placeholder="CL" className="uppercase tabular-nums" maxLength={10} aria-invalid={!!errors.code} {...register("code")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lt-name">Name</Label>
              <Input id="lt-name" placeholder="Casual Leave" aria-invalid={!!errors.name} {...register("name")} />
            </div>
          </div>
          {(errors.code || errors.name) && <p className="-mt-3 text-caption text-danger">{errors.code?.message ?? errors.name?.message}</p>}
          <NumberField id="lt-quota" label="Yearly quota" suffix="days" step={0.5} inputMode="decimal" error={errors.yearlyQuota?.message} {...register("yearlyQuota", { valueAsNumber: true })} />
          {toggle("isPaid", "Paid leave", "Unpaid leave (LOP) is deducted from salary")}
          {toggle("carryForward", "Carry forward", "Days not taken this year are added to next year, up to the limit below")}
          {carry && (
            <NumberField
              id="lt-max-carry"
              label="Max carry forward"
              suffix="days"
              step={0.5}
              inputMode="decimal"
              error={errors.maxCarryForward?.message}
              {...register("maxCarryForward", { valueAsNumber: true })}
            />
          )}
          <Controller
            control={control}
            name="designationIds"
            render={({ field }) => {
              const picked: number[] = field.value ?? [];
              const flip = (id: number) => field.onChange(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]);
              return (
                <fieldset className="space-y-2 rounded-md border border-line p-3.5">
                  <legend className="sr-only">Available to</legend>
                  <span className="block text-body font-medium">Available to</span>
                  <span className="block text-caption text-ink-3">
                    {picked.length ? "Only employees with the designations picked below can apply for it." : "Everyone can apply for it. Pick designations to limit it to them."}
                  </span>
                  {designations.length ? (
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-pressed={!picked.length}
                        className={cn("rounded-full max-md:h-11", !picked.length && "border-brand bg-brand-subtle text-brand-ink hover:bg-brand-subtle")}
                        onClick={() => field.onChange([])}
                      >
                        Everyone
                      </Button>
                      {designations.map((d) => {
                        const on = picked.includes(d.id);
                        return (
                          <Button
                            key={d.id}
                            type="button"
                            variant="outline"
                            size="sm"
                            aria-pressed={on}
                            className={cn("rounded-full max-md:h-11", on && "border-brand bg-brand-subtle text-brand-ink hover:bg-brand-subtle")}
                            onClick={() => flip(d.id)}
                          >
                            {d.name}
                            <span className="text-caption text-ink-3 tabular-nums">{d.employees}</span>
                          </Button>
                        );
                      })}
                    </div>
                  ) : (
                    <span className="block text-caption text-ink-3">Add designations under Departments to limit leave types by designation.</span>
                  )}
                </fieldset>
              );
            }}
          />
          {toggle("isActive", "Active", "Inactive types can't be requested")}
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
          <Button type="submit" form="leave-type-form" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            {type ? "Save" : "Add leave type"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ---- Custom quotas ---------------------------------------------------------------------------

function QuotaRulesPanel({ data }: { data: LeaveTypesData }) {
  const router = useRouter();
  const [editing, setEditing] = useState<QuotaRuleRow | null>(null);
  const [open, setOpen] = useState(false);
  const openSheet = (r: QuotaRuleRow | null) => {
    setEditing(r);
    setOpen(true);
  };
  const defaultOf = (leaveTypeId: number) => data.types.find((t) => t.id === leaveTypeId)?.yearlyQuota ?? 0;

  return (
    <SettingsSection
      title="Custom quotas"
      description="Give a designation (for example Managers) or one person a different yearly quota. A person's own quota wins over their designation's; everyone else gets the leave type's quota."
      aside={
        <Button variant="outline" onClick={() => openSheet(null)} disabled={!data.types.some((t) => t.isActive)}>
          <Plus /> Add custom quota
        </Button>
      }
    >
      <div className="overflow-hidden rounded-xl bg-surface shadow-card" data-testid="quota-rules">
        {data.rules.length ? (
          <ul className="divide-y divide-line">
            {data.rules.map((r) => {
              const def = defaultOf(r.leaveTypeId);
              const Icon = r.appliesTo === "employee" ? UserRound : BriefcaseBusiness;
              return (
                <li key={r.id} className="flex items-center gap-3 px-4 py-3 sm:px-6">
                  <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-glass text-ink-2 ring-1 ring-line ring-inset">
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body font-medium text-ink">{r.targetName}</p>
                    <p className="truncate text-caption text-ink-3 tabular-nums">
                      {r.appliesTo === "employee" ? "Person" : "Designation"} · {r.detail}
                    </p>
                  </div>
                  <span className="w-11 shrink-0 rounded-xs bg-st-leave-tint py-1 text-center text-caption font-semibold text-st-leave-fg" title={r.leaveName}>
                    {r.leaveCode}
                  </span>
                  <div className="w-24 shrink-0 text-right sm:w-32">
                    <p className="text-body font-medium text-ink tabular-nums">{days(r.yearlyQuota)}</p>
                    <p className="text-caption text-ink-3 tabular-nums">default {def}</p>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1">
                    <Button variant="ghost" size="icon" className="text-ink-3" aria-label={`Edit ${r.leaveCode} quota for ${r.targetName}`} onClick={() => openSheet(r)}>
                      <Pencil />
                    </Button>
                    <ConfirmButton
                      variant="ghost"
                      size="icon"
                      className="text-ink-3 hover:text-danger"
                      aria-label={`Remove ${r.leaveCode} quota for ${r.targetName}`}
                      title={`Remove the custom ${r.leaveCode} quota for ${r.targetName}?`}
                      description={`They go back to ${r.appliesTo === "employee" ? "their designation's quota or " : ""}the default of ${days(def)} a year. Days already used are kept.`}
                      confirmLabel="Remove"
                      action={() => deleteQuotaRule(r.id)}
                      onDone={() => router.refresh()}
                    >
                      <Trash2 />
                    </ConfirmButton>
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState icon={SlidersHorizontal} title="Everyone gets the default quota">
            Add a custom quota when a designation or a person should get more or fewer days.
          </EmptyState>
        )}
      </div>
      <QuotaRuleSheet open={open} onOpenChange={setOpen} rule={editing} data={data} />
    </SettingsSection>
  );
}

function quotaDefaults(r: QuotaRuleRow | null, data: LeaveTypesData): QuotaRuleInput {
  const first = data.types.find((t) => t.isActive);
  return r
    ? { leaveTypeId: r.leaveTypeId, appliesTo: r.appliesTo, targetId: r.targetId, yearlyQuota: r.yearlyQuota }
    : { leaveTypeId: first?.id ?? 0, appliesTo: "designation", targetId: 0, yearlyQuota: first?.yearlyQuota ?? 12 };
}

function QuotaRuleSheet({ open, onOpenChange, rule, data }: { open: boolean; onOpenChange: (o: boolean) => void; rule: QuotaRuleRow | null; data: LeaveTypesData }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [formError, setFormError] = useState("");
  const form = useForm<QuotaRuleInput>({ resolver: zodResolver(quotaRuleFormSchema), defaultValues: quotaDefaults(rule, data) });
  const { register, control, watch, setValue, formState } = form;
  const errors = formState.errors;
  const appliesTo = watch("appliesTo");
  const leaveTypeId = Number(watch("leaveTypeId"));
  const type = data.types.find((t) => t.id === leaveTypeId);

  useEffect(() => {
    if (open) {
      form.reset(quotaDefaults(rule, data));
      setFormError("");
    }
  }, [open, rule, data, form]);

  const onSubmit = form.handleSubmit((v) =>
    start(async () => {
      setFormError("");
      const res = await saveQuotaRule(rule?.id ?? null, v);
      if (!res.ok) {
        if (res.field && res.field in v) form.setError(res.field as FieldPath<QuotaRuleInput>, { message: res.error });
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
      <SheetContent className="gap-0 border-line bg-raised p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[520px]">
        <SheetHeader className="gap-1 border-b border-line px-5 py-4 pr-14 sm:px-6">
          <SheetTitle className="text-title-3 text-ink">{rule ? "Edit custom quota" : "Add custom quota"}</SheetTitle>
          <SheetDescription className="text-body text-ink-2">This year&apos;s balances update right away. Days already used are kept.</SheetDescription>
        </SheetHeader>
        <form id="quota-rule-form" onSubmit={onSubmit} noValidate className="flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
          <div className="space-y-1.5">
            <Label htmlFor="qr-type">Leave type</Label>
            <Controller
              control={control}
              name="leaveTypeId"
              render={({ field }) => (
                <Select value={field.value ? String(field.value) : ""} onValueChange={(v) => field.onChange(Number(v))}>
                  <SelectTrigger id="qr-type" className="w-full" aria-invalid={!!errors.leaveTypeId}>
                    <SelectValue placeholder="Pick a leave type" />
                  </SelectTrigger>
                  <SelectContent>
                    {data.types
                      .filter((t) => t.isActive || t.id === Number(field.value))
                      .map((t) => (
                        <SelectItem key={t.id} value={String(t.id)}>
                          {t.code} · {t.name} (default {t.yearlyQuota})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.leaveTypeId && <p className="text-caption text-danger">{errors.leaveTypeId.message}</p>}
          </div>

          <fieldset>
            <legend className="mb-1.5 text-label text-ink">Applies to</legend>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["designation", "A designation", BriefcaseBusiness],
                  ["employee", "One person", UserRound],
                ] as const
              ).map(([value, label, Icon]) => (
                <label
                  key={value}
                  className={cn(
                    "flex h-11 cursor-pointer items-center justify-center gap-2 rounded-full text-body font-medium ring-1 ring-line transition-colors ring-inset has-[:focus-visible]:shadow-[var(--ad-focus)]",
                    appliesTo === value ? "bg-brand text-on-brand ring-transparent" : "bg-glass text-ink hover:bg-raised",
                  )}
                >
                  <input
                    type="radio"
                    name="qr-applies"
                    className="sr-only"
                    value={value}
                    checked={appliesTo === value}
                    onChange={() => {
                      setValue("appliesTo", value);
                      setValue("targetId", 0);
                    }}
                  />
                  <Icon aria-hidden className="size-4" />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="space-y-1.5">
            <Label htmlFor="qr-target">{appliesTo === "employee" ? "Employee" : "Designation"}</Label>
            <Controller
              control={control}
              name="targetId"
              render={({ field }) =>
                appliesTo === "employee" ? (
                  <EmployeeCombobox id="qr-target" employees={data.employees} value={field.value ? Number(field.value) : null} onChange={(id) => field.onChange(id)} invalid={!!errors.targetId} />
                ) : (
                  <Select value={field.value ? String(field.value) : ""} onValueChange={(v) => field.onChange(Number(v))}>
                    <SelectTrigger id="qr-target" className="w-full" aria-invalid={!!errors.targetId}>
                      <SelectValue placeholder={data.designations.length ? "Pick a designation" : "Add designations in Organisation first"} />
                    </SelectTrigger>
                    <SelectContent>
                      {data.designations.map((d) => (
                        <SelectItem key={d.id} value={String(d.id)}>
                          {d.name} ({d.employees})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )
              }
            />
            {errors.targetId && <p className="text-caption text-danger">{errors.targetId.message}</p>}
          </div>

          <NumberField id="qr-quota" label="Days a year" suffix="days" step={0.5} inputMode="decimal" error={errors.yearlyQuota?.message} {...register("yearlyQuota", { valueAsNumber: true })} />
          {type && (
            <p className="-mt-3 text-caption text-ink-3">
              Default for {type.code} is {days(type.yearlyQuota)}.{type.carryForward ? ` Unused days carry forward, up to ${days(type.maxCarryForward)}.` : " This type doesn't carry forward."}
            </p>
          )}

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
          <Button type="submit" form="quota-rule-form" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            {rule ? "Save" : "Add custom quota"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
