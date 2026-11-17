import { ArrowLeft, Compass } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-canvas px-4 py-10">
      <div className="w-full max-w-md text-center">
        <Logo className="mx-auto size-11 rounded-lg" />
        <div className="mt-8 rounded-xl bg-surface shadow-card px-6 py-10">
          <span aria-hidden className="mx-auto grid size-16 place-items-center rounded-full bg-sunken">
            <Compass className="size-8 text-ink-3" />
          </span>
          <p className="mt-4 text-caption text-ink-3 tabular-nums">Error 404</p>
          <h1 className="mt-1 text-title-2 text-ink">This page doesn&apos;t exist</h1>
          <p className="mt-2 text-body text-ink-2">The link may be old, or the record was removed. Check the address, or head back to your dashboard.</p>
          <Button asChild size="lg" className="mt-6 max-sm:w-full md:h-10 md:text-body md:font-medium">
            <Link href="/dashboard">
              <ArrowLeft /> Back to dashboard
            </Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
