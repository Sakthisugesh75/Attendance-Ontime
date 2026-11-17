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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { createEmployee, updateEmployee } from "@/lib/actions/employees";
import type { EmployeeDetail, EmployeeFormOptions } from "@/lib/employees";
import { formatDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import { EMPLOYEE_STATUS_LABEL, employeeSchema, type EmployeeInput } from "@/lib/validations/employee";
import { TempPasswordDialog } from "./temp-password-dialog";

/** What the signed-in user may do with sign-in roles (the actions check the same rules). */
export interface RoleAccess {
  /** access.manage: may give roles other than Employee */
  canAssignRoles: boolean;
  isSuperAdmin: boolean;
  /** The signed-in user's id (nobody changes their own role here) */
  userId: number;
}

function defaults(options: EmployeeFormOptions, employee?: EmployeeDetail | null): EmployeeInput {
  if (employee) {
    return {
      fullName: employee.fullName,
      phone: employee.phone,
      email: employee.email,
      dateOfBirth: employee.dateOfBirth,
      department: employee.department,
      designation: employee.designation,
      joiningDate: employee.joiningDate,
      exitDate: employee.exitDate,
      status: employee.status,
      managerId: employee.managerId,
      reportRequired: employee.reportRequired === true ? "YES" : employee.reportRequired === false ? "NO" : "ROLE",
      shiftId: employee.shiftId ?? options.shifts[0]?.id ?? 0,
      shiftEffectiveFrom: options.today,
      login: { enabled: !!employee.user?.isActive, accessRoleId: employee.user?.accessRoleId ?? options.employeeRoleId },
    };
  }
  return {
    fullName: "",
    phone: "",
    email: "",
    dateOfBirth: "",
    department: "",
    designation: "",
    joiningDate: options.today,
    exitDate: "",
    status: "ACTIVE",
    managerId: null,
    reportRequired: "ROLE",
    shiftId: options.shifts.find((s) => s.isDefault)?.id ?? options.shifts[0]?.id ?? 0,
    shiftEffectiveFrom: "",
    login: { enabled: true, accessRoleId: options.employeeRoleId },
  };
}

export function EmployeeSheet({
  open,
  onOpenChange,
  options,
  employee,
  access,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options: EmployeeFormOptions;
  /** Present when editing */
  employee?: EmployeeDetail | null;
  access: RoleAccess;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [formError, setFormError] = useState("");
  // After creating, open the new profile — but only once HR has seen the temporary password.
  const [temp, setTemp] = useState<{ password: string; name: string; goTo: number | null } | null>(null);
  const editing = !!employee;

  const form = useForm<EmployeeInput>({ resolver: zodResolver(employeeSchema), defaultValues: defaults(options, employee) });
  const { register, control, watch, formState } = form;
  const errors = formState.errors;

  useEffect(() => {
    if (open) {
      form.reset(defaults(options, employee));
      setFormError("");
    }
  }, [open, employee, options, form]);

  const status = watch("status");
  const loginEnabled = watch("login.enabled");
  const shiftChanged = editing && watch("shiftId") !== employee?.shiftId;
  const isSuperAdminRecord = employee?.user?.role === "SUPER_ADMIN";
  const lockedOut = isSuperAdminRecord && !access.isSuperAdmin;
  const ownAccount = !!employee?.user && employee.user.id === access.userId;
  // Roles offered: the Super Admin role only to a Super Admin.
  const roles = options.roles.filter((r) => r.systemKey !== "SUPER_ADMIN" || access.isSuperAdmin);
  const roleLocked = !access.canAssignRoles || ownAccount;

  const onSubmit = form.handleSubmit((values) =>
    start(async () => {
      setFormError("");
      const res = editing ? await updateEmployee(employee!.id, values) : await createEmployee(values);
      if (!res.ok) {
        if (res.field && res.field in values) form.setError(res.field as FieldPath<EmployeeInput>, { message: res.error });
        else setFormError(res.error);
        return;
      }
      toast.success(res.message);
      onOpenChange(false);
      if (res.tempPassword) setTemp({ password: res.tempPassword, name: values.fullName, goTo: editing ? null : res.id });
      else if (!editing) router.push(`/employees/${res.id}`);
      else router.refresh();
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
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="gap-0 border-line bg-raised p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[560px]">
          <SheetHeader className="gap-1 border-b border-line px-5 py-4 pr-14 sm:px-6">
            <SheetTitle className="text-title-3 text-ink">{editing ? `Edit ${employee!.fullName}` : "Add employee"}</SheetTitle>
            <SheetDescription className="text-body text-ink-2">{editing ? `${employee!.code} · changes are recorded in the audit log` : `Will be created as ${options.nextCode}`}</SheetDescription>
          </SheetHeader>

          <form id="employee-form" onSubmit={onSubmit} noValidate className="flex-1 space-y-7 overflow-y-auto px-5 py-5 sm:px-6">
            <fieldset className="space-y-4">
              <legend className="mb-3 text-label font-semibold text-ink">Personal</legend>
              <div className="space-y-1.5">
                <Label htmlFor="fullName">Full name</Label>
                <Input id="fullName" autoFocus={!editing} aria-invalid={!!errors.fullName} {...register("fullName")} />
                {err(errors.fullName?.message)}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="phone">Mobile</Label>
                  <Input id="phone" inputMode="tel" placeholder="98765 43210" aria-invalid={!!errors.phone} {...register("phone")} />
                  {err(errors.phone?.message)}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" placeholder="name@company.com" aria-invalid={!!errors.email} {...register("email")} />
                  {err(errors.email?.message)}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dateOfBirth">
                  Date of birth <span className="font-normal text-ink-3">(optional)</span>
                </Label>
                <Input id="dateOfBirth" type="date" className="w-full sm:w-48" max={options.today} aria-invalid={!!errors.dateOfBirth} {...register("dateOfBirth")} />
                {errors.dateOfBirth ? err(errors.dateOfBirth.message) : <p className="text-caption text-ink-3">Shown on their profile; the dashboard wishes them on the day.</p>}
              </div>
            </fieldset>

            <fieldset className="space-y-4">
              <legend className="mb-3 text-label font-semibold text-ink">Job</legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="department">Department</Label>
                  <Input id="department" list="department-options" placeholder="e.g. Operations" {...register("department")} />
                  <datalist id="department-options">
                    {options.departments.map((d) => (
                      <option key={d} value={d} />
                    ))}
                  </datalist>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="designation">Designation</Label>
                  <Input id="designation" list="designation-options" placeholder="e.g. Video Editor" {...register("designation")} />
                  <datalist id="designation-options">
                    {options.designations.map((d) => (
                      <option key={d} value={d} />
                    ))}
                  </datalist>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="manager">Reporting manager</Label>
                  <Controller
                    control={control}
                    name="managerId"
                    render={({ field }) => (
                      <Select value={field.value ? String(field.value) : "none"} onValueChange={(v) => field.onChange(v === "none" ? null : Number(v))}>
                        <SelectTrigger id="manager" className="w-full" aria-invalid={!!errors.managerId}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No manager</SelectItem>
                          {options.managers
                            .filter((m) => m.id !== employee?.id)
                            .map((m) => (
                              <SelectItem key={m.id} value={String(m.id)}>
                                {m.fullName} <span className="text-ink-3">· {m.code}</span>
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {err(errors.managerId?.message)}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="shift">Shift</Label>
                  <Controller
                    control={control}
                    name="shiftId"
                    render={({ field }) => (
                      <Select value={field.value ? String(field.value) : undefined} onValueChange={(v) => field.onChange(Number(v))}>
                        <SelectTrigger id="shift" className="w-full" aria-invalid={!!errors.shiftId}>
                          <SelectValue placeholder="Pick a shift" />
                        </SelectTrigger>
                        <SelectContent>
                          {options.shifts.map((s) => (
                            <SelectItem key={s.id} value={String(s.id)}>
                              {s.name} <span className="text-ink-3">· {s.summary}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {err(errors.shiftId?.message)}
                </div>
              </div>
              {shiftChanged && (
                <div className="space-y-2 rounded-md border border-dashed border-line p-3">
                  <Label htmlFor="shiftEffectiveFrom">New shift starts on</Label>
                  <Input id="shiftEffectiveFrom" type="date" className="w-full sm:w-48" min={watch("joiningDate")} {...register("shiftEffectiveFrom")} />
                  <p className="text-caption text-ink-3">Days before this keep the old shift&apos;s timings.</p>
                  {err(errors.shiftEffectiveFrom?.message)}
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="reportRequired">Daily report</Label>
                <Controller
                  control={control}
                  name="reportRequired"
                  render={({ field }) => (
                    <Select value={field.value ?? "ROLE"} onValueChange={field.onChange}>
                      <SelectTrigger id="reportRequired" className="w-full sm:w-72">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ROLE">Follow their sign-in role</SelectItem>
                        <SelectItem value="YES">Required for this person</SelectItem>
                        <SelectItem value="NO">Not required for this person</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
                <p className="text-caption text-ink-3">Whether they send an end-of-day report, get the reminder and show as &quot;missing&quot;.</p>
              </div>
            </fieldset>

            <fieldset className="space-y-4">
              <legend className="mb-3 text-label font-semibold text-ink">Employment</legend>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="joiningDate">Date of joining</Label>
                  <Input id="joiningDate" type="date" aria-invalid={!!errors.joiningDate} {...register("joiningDate")} />
                  {err(errors.joiningDate?.message)}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="exitDate">{status === "ON_NOTICE" ? "Last working day" : "Date of exit"}</Label>
                  <Input id="exitDate" type="date" min={watch("joiningDate")} aria-invalid={!!errors.exitDate} {...register("exitDate")} />
                  {err(errors.exitDate?.message)}
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
                          {Object.entries(EMPLOYEE_STATUS_LABEL).map(([k, label]) => (
                            <SelectItem key={k} value={k}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
              </div>
              <p className="text-caption text-ink-3">
                Days before joining{watch("exitDate") ? ` and after ${formatDate(watch("exitDate"))}` : " and after exit"} never count as absent or leave.
              </p>
            </fieldset>

            <fieldset className="space-y-4">
              <legend className="mb-3 text-label font-semibold text-ink">Sign-in</legend>
              {lockedOut ? (
                <p className="text-body text-ink-2">This is a Super Admin&apos;s account. Only a Super Admin can change it.</p>
              ) : ownAccount ? (
                <p className="text-body text-ink-2">This is your own sign-in ({employee?.user?.accessRole?.name ?? "Employee"}). Someone else has to change its role.</p>
              ) : (
                <>
                  <label className="flex items-start justify-between gap-4 rounded-md border border-line p-3.5">
                    <span>
                      <span className="block text-body font-medium">Can sign in</span>
                      <span className="block text-caption text-ink-3">
                        {editing && employee?.user
                          ? "Turn off to block sign-in. Their history stays."
                          : "Creates an account with a temporary password, shown to you once after saving."}
                      </span>
                    </span>
                    <Controller control={control} name="login.enabled" render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} />} />
                  </label>
                  {loginEnabled && (
                    <div className="space-y-1.5">
                      <Label htmlFor="role">Role</Label>
                      <Controller
                        control={control}
                        name="login.accessRoleId"
                        render={({ field }) => (
                          <Select value={field.value ? String(field.value) : ""} onValueChange={(v) => field.onChange(Number(v))} disabled={roleLocked}>
                            <SelectTrigger id="role" className="w-full sm:w-80">
                              <SelectValue placeholder="Pick a role" />
                            </SelectTrigger>
                            <SelectContent>
                              {/* Keep the current role listed even when it isn't offered (e.g. Super Admin). */}
                              {options.roles.filter((r) => r.id === field.value || roles.includes(r)).map((r) => (
                                <SelectItem key={r.id} value={String(r.id)}>
                                  {r.name}
                                  {r.description ? `: ${r.description}` : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                      {err(errors.login?.accessRoleId?.message)}
                      {!access.canAssignRoles && <p className="text-caption text-ink-3">Only people who can manage access can give a role other than Employee.</p>}
                    </div>
                  )}
                </>
              )}
            </fieldset>

            {formError && (
              <p role="alert" className="flex items-start gap-2 rounded-md bg-danger-subtle px-3 py-2.5 text-body text-danger">
                <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                {formError}
              </p>
            )}
          </form>

          <SheetFooter className={cn("flex-row justify-end gap-2 border-t border-line bg-raised px-5 py-4 sm:px-6")}>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" form="employee-form" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              {editing ? "Save changes" : "Add employee"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      <TempPasswordDialog
        password={temp?.password ?? null}
        name={temp?.name ?? ""}
        onClose={() => {
          const goTo = temp?.goTo;
          setTemp(null);
          if (goTo) router.push(`/employees/${goTo}`);
          else router.refresh();
        }}
      />
    </>
  );
}
