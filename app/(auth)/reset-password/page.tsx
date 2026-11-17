"use client";

import { CircleAlert, CircleCheck } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { PasswordForm } from "@/components/password-form";
import { Button } from "@/components/ui/button";
import { resetPassword } from "@/lib/actions/auth";

function ResetPassword() {
  const token = useSearchParams().get("token") ?? "";
  const [done, setDone] = useState("");

  if (done) {
    return (
      <div className="space-y-5">
        <span aria-hidden className="grid size-16 place-items-center rounded-full bg-sunken">
          <CircleCheck className="size-8 text-success" />
        </span>
        <h1 className="text-m-title text-ink sm:text-title-1">Password updated</h1>
        <p className="text-body text-ink-2">{done}</p>
        <Button asChild size="lg" className="w-full md:h-11">
          <Link href="/login">Go to sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-m-title text-ink sm:text-title-1">Choose a new password</h1>
        <p className="text-body text-ink-2">The link in your email works once, for 1 hour.</p>
      </div>
      {token ? (
        <PasswordForm
          withCurrent={false}
          submitLabel="Update password"
          onSubmit={async (v) => {
            const res = await resetPassword({ token, newPassword: v.newPassword, confirmPassword: v.confirmPassword });
            if (res.ok) setDone(res.message ?? "");
            return res;
          }}
        />
      ) : (
        <p role="alert" className="flex items-start gap-2 rounded-md bg-danger-subtle px-3 py-2.5 text-body text-danger">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
          This link is incomplete. Open the link from the email again, or{" "}
          <Link href="/forgot-password" className="font-medium underline">
            ask for a new one
          </Link>
          .
          </span>
        </p>
      )}
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPassword />
    </Suspense>
  );
}
