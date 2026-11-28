import { Smartphone } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";
import { androidApp } from "@/lib/mobile-app";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  // Only same-site paths, never an absolute URL.
  const safeNext = next?.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  // Offer the Android app, except inside the app itself (it adds AttendanceDeskApp to its user agent).
  const inApp = ((await headers()).get("user-agent") ?? "").includes("AttendanceDeskApp");
  const app = inApp ? null : await androidApp();
  return (
    <>
      <LoginForm next={safeNext} />
      {app && (
        <div className="mt-5 border-t border-line pt-4 text-center">
          <Link href="/app" className="inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-label text-ink-2 underline-offset-4 outline-none hover:text-ink hover:underline focus-visible:ring-2 focus-visible:ring-brand">
            <Smartphone aria-hidden className="size-4 text-ink-3" />
            Get the Android app
          </Link>
        </div>
      )}
    </>
  );
}
