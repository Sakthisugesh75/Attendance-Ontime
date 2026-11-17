"use client";

import { CircleAlert, Eye, EyeOff, Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FormResult } from "@/lib/actions/auth";

/** New-password form used by reset-password and change-password. */
export function PasswordForm({
  withCurrent,
  submitLabel,
  onSubmit,
}: {
  withCurrent: boolean;
  submitLabel: string;
  onSubmit: (values: { currentPassword: string; newPassword: string; confirmPassword: string }) => Promise<FormResult>;
}) {
  const [values, setValues] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const set = (k: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) => setValues((v) => ({ ...v, [k]: e.target.value }));
  const type = show ? "text" : "password";

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setError("");
          const res = await onSubmit(values);
          if (!res.ok) setError(res.error);
        });
      }}
    >
      {withCurrent && (
        <div className="space-y-1.5">
          <Label htmlFor="current">Current password</Label>
          <Input id="current" type={type} autoComplete="current-password" required value={values.currentPassword} onChange={set("currentPassword")} />
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="new">New password</Label>
        <div className="relative">
          <Input id="new" type={type} autoComplete="new-password" required className="pr-12 md:pr-10" aria-describedby="new-hint" value={values.newPassword} onChange={set("newPassword")} />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute inset-y-0 right-0 grid w-12 place-items-center rounded-r-md text-ink-3 outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-brand md:w-10"
            aria-label={show ? "Hide passwords" : "Show passwords"}
          >
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        <p id="new-hint" className="text-caption text-ink-3">At least 8 characters, with a letter and a number.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirm">Confirm new password</Label>
        <Input id="confirm" type={type} autoComplete="new-password" required value={values.confirmPassword} onChange={set("confirmPassword")} />
      </div>
      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-md bg-danger-subtle px-3 py-2.5 text-body text-danger">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}
      <Button type="submit" size="lg" className="w-full md:h-11" disabled={pending} aria-busy={pending}>
        {pending && <Loader2 className="animate-spin" />}
        {submitLabel}
      </Button>
    </form>
  );
}
