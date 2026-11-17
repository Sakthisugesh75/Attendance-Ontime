"use client";

import { ArrowLeft, CircleAlert, Loader2, MailCheck } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordReset } from "@/lib/actions/auth";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="space-y-6">
      <Link href="/login" className="-ml-1 inline-flex min-h-11 items-center gap-1.5 rounded-md px-1 text-label text-ink-2 outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-brand">
        <ArrowLeft className="size-4" /> Back to sign in
      </Link>
      <div className="space-y-1.5">
        <h1 className="text-m-title text-ink sm:text-title-1">Forgot your password?</h1>
        <p className="text-body text-ink-2">Enter your work email and we&apos;ll send you a link to choose a new one.</p>
      </div>

      {result?.ok ? (
        <div role="status" className="flex gap-3 rounded-xl bg-surface shadow-card p-4 text-body text-ink">
          <MailCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-success" />
          <p>{result.text}</p>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const res = await requestPasswordReset({ email });
              setResult(res.ok ? { ok: true, text: res.message ?? "" } : { ok: false, text: res.error });
            });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
            {result && !result.ok && (
              <p className="flex items-center gap-1.5 text-caption text-danger">
                <CircleAlert aria-hidden className="size-3.5 shrink-0" />
                {result.text}
              </p>
            )}
          </div>
          <Button type="submit" size="lg" className="w-full md:h-11" disabled={pending} aria-busy={pending}>
            {pending && <Loader2 className="animate-spin" />}
            Send reset link
          </Button>
          <p className="text-caption text-ink-3">Signed up with a phone number only? Ask HR to reset your password.</p>
        </form>
      )}
    </div>
  );
}
