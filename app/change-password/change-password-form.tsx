"use client";

import Link from "next/link";
import { toast } from "sonner";
import { PasswordForm } from "@/components/password-form";
import { changePassword, logout } from "@/lib/actions/auth";

export function ChangePasswordForm({ forced }: { forced: boolean }) {
  return (
    <>
      <PasswordForm
        withCurrent
        submitLabel={forced ? "Save and continue" : "Change password"}
        onSubmit={async (values) => {
          const res = await changePassword(values);
          if (res.ok) {
            toast.success(res.message ?? "Password changed");
            window.location.assign("/dashboard");
          }
          return res;
        }}
      />
      <div className="text-center text-body">
        {forced ? (
          <form action={logout}>
            <button className="min-h-11 rounded-md px-3 text-ink-2 outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-brand">Sign out instead</button>
          </form>
        ) : (
          <Link href="/dashboard" className="inline-flex min-h-11 items-center rounded-md px-3 text-ink-2 outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-brand">
            Cancel
          </Link>
        )}
      </div>
    </>
  );
}
