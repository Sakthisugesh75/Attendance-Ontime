import { redirect } from "next/navigation";
import { Logo } from "@/components/layout/logo";
import { auth } from "@/lib/auth";
import { ChangePasswordForm } from "./change-password-form";

export const metadata = { title: "Change password" };

/** Reached on first sign-in (forced) or from the profile menu. */
export default async function ChangePasswordPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const forced = session.user.mustChangePassword;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-10">
      <div className="rise w-full max-w-sm space-y-6 rounded-xl bg-surface shadow-card p-6 sm:p-8">
        <div className="space-y-1.5">
          <Logo className="mb-6 size-11 rounded-lg" />
          <h1 className="text-m-title text-ink sm:text-title-1">{forced ? "Set your own password" : "Change password"}</h1>
          <p className="text-body text-ink-2">
            {forced ? "You signed in with a temporary password. Choose a new one to continue." : `Signed in as ${session.user.email || session.user.name}.`}
          </p>
        </div>
        <ChangePasswordForm forced={forced} />
      </div>
    </main>
  );
}
