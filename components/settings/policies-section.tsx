"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useForm, type FieldPath } from "react-hook-form";
import { toast } from "sonner";
import { saveCaps } from "@/lib/actions/settings";
import { formatDuration } from "@/lib/time";
import { capsSchema, type CapsFormInput } from "@/lib/validations/settings";
import { SaveBar } from "./save-bar";
import { NumberField, SettingsCard, SettingsSection } from "./section";

type Caps = { wfhPerMonth: number; permissionPerMonth: number; permissionMaxMinutes: number };

export function PoliciesSection({ caps }: { caps: Caps }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const form = useForm<CapsFormInput>({ resolver: zodResolver(capsSchema), values: caps });
  const { register, formState, watch } = form;
  const errors = formState.errors;

  const onSubmit = form.handleSubmit((v) =>
    start(async () => {
      const res = await saveCaps(v);
      if (!res.ok) {
        if (res.field && res.field in v) form.setError(res.field as FieldPath<CapsFormInput>, { message: res.error });
        else toast.error(res.error);
        return;
      }
      toast.success(res.message);
      form.reset(v);
      router.refresh();
    }),
  );

  const maxMinutes = Number(watch("permissionMaxMinutes"));

  return (
    <form id="policies-form" onSubmit={onSubmit} noValidate className="space-y-8">
      <SettingsSection title="Work from home" description="How many WFH days one employee can request in a calendar month. 0 turns WFH requests off.">
        <SettingsCard>
          <NumberField id="wfhPerMonth" label="WFH days per month" suffix="days" error={errors.wfhPerMonth?.message} {...register("wfhPerMonth", { valueAsNumber: true })} />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="Permission" description="Short absences within a working day (late arrival or early leaving) that don't count as a half day.">
        <SettingsCard>
          <div className="grid gap-5 sm:grid-cols-2">
            <NumberField id="permissionPerMonth" label="Permissions per month" suffix="times" error={errors.permissionPerMonth?.message} {...register("permissionPerMonth", { valueAsNumber: true })} />
            <NumberField
              id="permissionMaxMinutes"
              label="Longest permission"
              suffix="min"
              hint={Number.isFinite(maxMinutes) && maxMinutes > 0 ? `= ${formatDuration(maxMinutes)} per request` : undefined}
              error={errors.permissionMaxMinutes?.message}
              step={15}
              {...register("permissionMaxMinutes", { valueAsNumber: true })}
            />
          </div>
        </SettingsCard>
      </SettingsSection>
      <SaveBar form="policies-form" show={formState.isDirty} pending={pending} onDiscard={() => form.reset(caps)} />
    </form>
  );
}
