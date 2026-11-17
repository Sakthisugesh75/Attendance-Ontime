"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CircleAlert, Loader2, Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Controller, useForm, useWatch, type FieldPath } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { createRole, updateRole } from "@/lib/actions/access";
import { PERMISSION_GROUPS, PERMISSION_KEYS, PERMISSIONS, SCOPE_LABEL, type Permission } from "@/lib/access/permissions";
import type { RoleRow } from "@/lib/access/queries";
import { cn } from "@/lib/utils";
import { grantError, roleSchema, roleSummary, SCOPES, type GuardActor, type RoleInput } from "@/lib/validations/access";

const SCOPE_RANK = { SELF: 0, TEAM: 1, ALL: 2 } as const;

const defaults = (role: RoleRow | null): RoleInput =>
  role
    ? { name: role.name, description: role.description, scope: role.scope, permissions: [...role.permissions], dailyReports: role.dailyReports }
    : { name: "", description: "", scope: "TEAM", permissions: [], dailyReports: true };

export function RoleSheet({ open, onOpenChange, role, actor }: { open: boolean; onOpenChange: (open: boolean) => void; role: RoleRow | null; actor: GuardActor }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [formError, setFormError] = useState("");
  const editing = !!role;
  const readOnly = role?.systemKey === "SUPER_ADMIN";
  const builtIn = !!role?.systemKey;

  const form = useForm<RoleInput>({ resolver: zodResolver(roleSchema), defaultValues: defaults(role) });
  const { register, control, formState, setValue } = form;
  const errors = formState.errors;

  useEffect(() => {
    if (open) {
      form.reset(defaults(role));
      setFormError("");
    }
  }, [open, role, form]);

  const permissions = useWatch({ control, name: "permissions" }) ?? [];
  const scope = useWatch({ control, name: "scope" }) ?? "SELF";
  const selected = new Set(permissions);
  /** Permissions this actor may hand out (all for a Super Admin). */
  const grantable = (p: Permission) => actor.isSuperAdmin || actor.permissions.includes(p);

  const setPerms = (next: Set<Permission>) =>
    setValue(
      "permissions",
      PERMISSION_KEYS.filter((k) => next.has(k)),
      { shouldDirty: true },
    );

  const toggle = (p: Permission, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(p);
    else next.delete(p);
    setPerms(next);
  };

  const onSubmit = form.handleSubmit((values) =>
    start(async () => {
      setFormError("");
      const local = grantError(actor, values.permissions, values.scope);
      if (local) return setFormError(local);
      const res = editing ? await updateRole(role!.id, values) : await createRole(values);
      if (!res.ok) {
        if (res.field && res.field in values) form.setError(res.field as FieldPath<RoleInput>, { message: res.error });
        else setFormError(res.error);
        return;
      }
      toast.success(res.message);
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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="gap-0 border-line bg-raised p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[560px]">
        <SheetHeader className="gap-1 border-b border-line px-5 py-4 pr-14 sm:px-6">
          <SheetTitle className="text-title-3 text-ink">{readOnly ? "Super Admin" : editing ? `Edit ${role!.name}` : "New role"}</SheetTitle>
          <SheetDescription className="text-body text-ink-2">
            {readOnly
              ? "The owner role always has every permission and reaches everyone. It can't be changed."
              : editing
                ? `${role!.userCount} ${role!.userCount === 1 ? "person has" : "people have"} this role · changes apply on their next click`
                : "Pick what people with this role can do and whose records they reach."}
          </SheetDescription>
        </SheetHeader>

        <form id="role-form" onSubmit={onSubmit} noValidate className="flex-1 space-y-7 overflow-y-auto px-5 py-5 sm:px-6">
          <fieldset className="space-y-4" disabled={readOnly}>
            <legend className="text-label font-semibold text-ink mb-3">Role</legend>
            <div className="space-y-1.5">
              <Label htmlFor="role-name">Name</Label>
              <Input id="role-name" autoFocus={!editing} readOnly={builtIn} className={cn(builtIn && "bg-sunken text-ink-3")} placeholder="e.g. Team Lead" aria-invalid={!!errors.name} {...register("name")} />
              {builtIn && !readOnly && <p className="text-caption text-ink-3">Built-in roles keep their name.</p>}
              {err(errors.name?.message)}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="role-description">Description</Label>
              <Textarea id="role-description" rows={2} placeholder="Who this role is for" aria-invalid={!!errors.description} {...register("description")} />
              {err(errors.description?.message)}
            </div>
          </fieldset>

          <fieldset className="space-y-3" disabled={readOnly}>
            <legend className="text-label font-semibold text-ink mb-3">Reach · whose records</legend>
            <Controller
              control={control}
              name="scope"
              render={({ field }) => (
                <RadioGroup value={field.value} onValueChange={field.onChange} className="gap-2 sm:grid-cols-3" aria-label="Reach">
                  {SCOPES.map((s) => {
                    const blocked = !actor.isSuperAdmin && SCOPE_RANK[s] > SCOPE_RANK[actor.scope];
                    return (
                      <label
                        key={s}
                        htmlFor={`scope-${s}`}
                        className={cn(
                          "flex min-h-11 cursor-pointer items-start gap-3 rounded-md border border-line p-3.5 transition-colors duration-[120ms] has-data-checked:border-brand has-data-checked:bg-brand-subtle has-data-checked:ring-1 has-data-checked:ring-brand",
                          (blocked || readOnly) && "cursor-not-allowed bg-sunken text-ink-disabled",
                        )}
                      >
                        <RadioGroupItem id={`scope-${s}`} value={s} disabled={blocked || readOnly} className="mt-0.5" />
                        <span className="min-w-0">
                          <span className="block text-body font-medium">{SCOPE_LABEL[s].label}</span>
                          <span className="mt-0.5 block text-caption text-ink-3">{SCOPE_LABEL[s].hint}</span>
                        </span>
                      </label>
                    );
                  })}
                </RadioGroup>
              )}
            />
          </fieldset>

          <fieldset disabled={readOnly}>
            <legend className="mb-3 text-label font-semibold text-ink">Daily reports</legend>
            <label htmlFor="role-daily-reports" className={cn("flex items-start justify-between gap-4 rounded-md border border-line p-3.5", readOnly ? "cursor-not-allowed" : "cursor-pointer")}>
              <span className="min-w-0">
                <span className="block text-body font-medium">Writes daily reports</span>
                <span className="mt-0.5 block text-caption text-ink-3">
                  On: people with this role see Daily reports, get the evening reminder and count as &quot;missing&quot; when they don&apos;t send one. HR can override it for one person on their employee record.
                </span>
              </span>
              <Controller
                control={control}
                name="dailyReports"
                render={({ field }) => <Switch id="role-daily-reports" checked={field.value} onCheckedChange={field.onChange} disabled={readOnly} />}
              />
            </label>
          </fieldset>

          <fieldset className="space-y-4">
            <div className="flex items-baseline justify-between gap-3">
              <legend className="text-label font-semibold text-ink">Permissions</legend>
              <span className="text-caption text-ink-3 tabular-nums">
                {permissions.length} / {PERMISSION_KEYS.length}
              </span>
            </div>
            <div className="space-y-4">
              {PERMISSION_GROUPS.map((group) => {
                const keys = PERMISSION_KEYS.filter((k) => PERMISSIONS[k].group === group);
                const allowed = keys.filter(grantable);
                const on = keys.filter((k) => selected.has(k)).length;
                const groupState = on === 0 ? false : on === keys.length ? true : "indeterminate";
                const groupId = `group-${group.replace(/\W+/g, "-").toLowerCase()}`;
                return (
                  <div key={group} className="overflow-hidden rounded-lg border border-line">
                    <div className="flex items-center gap-3 border-b border-line bg-sunken px-3.5 py-2.5">
                      <Checkbox
                        id={groupId}
                        checked={groupState}
                        disabled={readOnly || allowed.length === 0}
                        aria-label={`Select all in ${group}`}
                        onCheckedChange={(v) => {
                          const next = new Set(selected);
                          for (const k of allowed) {
                            if (v === true) next.add(k);
                            else next.delete(k);
                          }
                          setPerms(next);
                        }}
                      />
                      <label htmlFor={groupId} className="flex-1 text-body font-semibold">
                        {group}
                      </label>
                      <span className="text-caption text-ink-3 tabular-nums">
                        {on}/{keys.length}
                      </span>
                    </div>
                    <ul className="divide-y divide-line">
                      {keys.map((k) => {
                        const blocked = !grantable(k);
                        const id = `perm-${k.replace(".", "-")}`;
                        return (
                          <li key={k}>
                            <label htmlFor={id} className={cn("flex items-start gap-3 px-3.5 py-3", readOnly || blocked ? "cursor-not-allowed" : "cursor-pointer hover:bg-sunken")}>
                              <Checkbox id={id} className="mt-0.5" checked={selected.has(k)} disabled={readOnly || blocked} onCheckedChange={(v) => toggle(k, v === true)} />
                              <span className="min-w-0 flex-1">
                                <span className="flex flex-wrap items-center gap-x-2 text-body font-medium">
                                  {PERMISSIONS[k].label}
                                  <code className="tabular-nums text-caption font-normal text-ink-3">{k}</code>
                                </span>
                                <span className="mt-0.5 block text-caption text-ink-3">{PERMISSIONS[k].hint}</span>
                                {blocked && !readOnly && (
                                  <span className="mt-1 inline-flex items-center gap-1 text-caption text-ink-3">
                                    <Lock className="size-3" /> You don&apos;t have this yourself
                                  </span>
                                )}
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
            {err(errors.permissions?.message)}
          </fieldset>

          {formError && (
            <p role="alert" className="flex items-start gap-2 rounded-md bg-danger-subtle px-3 py-2.5 text-body text-danger">
              <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              {formError}
            </p>
          )}
        </form>

        {/* Live summary */}
        <div className="border-t border-line bg-sunken px-5 py-3 sm:px-6" aria-live="polite">
          <p className="text-caption text-ink-3">Summary</p>
          <p className="mt-1 line-clamp-3 text-body text-ink" data-testid="role-summary">
            {roleSummary(readOnly ? PERMISSION_KEYS : permissions, readOnly ? "ALL" : scope)}
          </p>
        </div>

        <SheetFooter className="flex-row justify-end gap-2 border-t border-line bg-raised px-5 py-4 sm:px-6">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {readOnly ? "Close" : "Cancel"}
          </Button>
          {!readOnly && (
            <Button type="submit" form="role-form" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              {editing ? "Save role" : "Create role"}
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
