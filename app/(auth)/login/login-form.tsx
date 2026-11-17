"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CircleAlert, Eye, EyeOff, Loader2 } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login } from "@/lib/actions/auth";
import { loginSchema, type LoginInput } from "@/lib/auth-schemas";

export function LoginForm({ next }: { next: string }) {
  const [error, setError] = useState("");
  const [show, setShow] = useState(false);
  const [pending, start] = useTransition();
  const form = useForm<LoginInput>({ resolver: zodResolver(loginSchema), defaultValues: { identifier: "", password: "", remember: false } });
  const errors = form.formState.errors;

  const onSubmit = form.handleSubmit((values) =>
    start(async () => {
      setError("");
      const res = await login(values);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // Full navigation so the new session cookie is used everywhere.
      window.location.assign(next);
    }),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <div className="space-y-1.5 text-center">
        <h1 className="text-[30px] leading-9 font-medium tracking-[-0.02em] text-ink">Sign in</h1>
        <p className="text-body text-ink-3">Use your username, work email or mobile number.</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="identifier">Email, phone or username</Label>
        <Input id="identifier" autoComplete="username" autoFocus inputMode="email" aria-invalid={!!errors.identifier} {...form.register("identifier")} />
        {errors.identifier && (
          <p className="flex items-center gap-1.5 text-caption text-danger">
            <CircleAlert aria-hidden className="size-3.5 shrink-0" />
            {errors.identifier.message}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <Link href="/forgot-password" className="-my-2 py-2 text-label text-ink-2 underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none">
            Forgot password?
          </Link>
        </div>
        <div className="relative">
          <Input id="password" type={show ? "text" : "password"} autoComplete="current-password" className="pr-14" aria-invalid={!!errors.password} {...form.register("password")} />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute inset-y-0 right-0 grid w-14 place-items-center rounded-r-full text-ink-3 outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-brand md:w-10"
            aria-label={show ? "Hide password" : "Show password"}
          >
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        {errors.password && (
          <p className="flex items-center gap-1.5 text-caption text-danger">
            <CircleAlert aria-hidden className="size-3.5 shrink-0" />
            {errors.password.message}
          </p>
        )}
      </div>

      <label className="-my-1 flex min-h-11 cursor-pointer items-center gap-3 text-body text-ink-2">
        <Checkbox checked={!!form.watch("remember")} onCheckedChange={(v) => form.setValue("remember", v === true)} />
        Keep me signed in for 30 days
      </label>

      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-md bg-danger-subtle px-3 py-2.5 text-body text-danger">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}

      <Button type="submit" size="lg" className="h-[52px] w-full text-[15px]" disabled={pending} aria-busy={pending}>
        {pending && <Loader2 className="animate-spin" />}
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
