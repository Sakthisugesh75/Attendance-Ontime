"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/** Error boundary for every signed-in page: the sidebar and top bar stay usable. */
export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // The digest matches the server log entry for this error (the message is hidden in production).
    console.error(`[page-error] digest=${error.digest ?? "none"}`, error);
  }, [error]);

  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div role="alert" className="w-full max-w-md rounded-xl bg-surface shadow-card px-6 py-10 text-center">
        <span aria-hidden className="mx-auto grid size-16 place-items-center rounded-full bg-danger-subtle">
          <TriangleAlert className="size-8 text-danger" />
        </span>
        <h2 className="mt-4 text-title-3 text-ink">This page didn&apos;t load</h2>
        <p className="mt-1 text-body text-ink-2">
          It&apos;s not you. Try again. If it keeps happening, tell your admin the reference below so they can find it in the server log.
        </p>
        {error.digest && (
          <p className="mt-4 inline-flex items-center gap-2 rounded-md border border-line bg-sunken px-3 py-1.5 text-caption tabular-nums">
            <span className="text-ink-3">Ref</span>
            <span className="text-ink select-all">{error.digest}</span>
          </p>
        )}
        <div className="mt-6 flex flex-col-reverse justify-center gap-2 sm:flex-row">
          <Button asChild variant="outline">
            <Link href="/dashboard">Go to dashboard</Link>
          </Button>
          <Button onClick={reset}>
            <RotateCcw /> Try again
          </Button>
        </div>
      </div>
    </div>
  );
}
