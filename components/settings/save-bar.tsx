"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Sticky "Unsaved changes · Discard / Save" bar. Rendered while a form is dirty; it stays
 * pinned to the bottom of the viewport for as long as its form is on screen.
 */
export function SaveBar({ show, pending, onDiscard, form, label = "Save changes" }: { show: boolean; pending: boolean; onDiscard: () => void; form: string; label?: string }) {
  if (!show) return null;
  return (
    <div className="sticky bottom-3 z-20 mt-5 animate-in duration-200 fade-in slide-in-from-bottom-2 sm:bottom-5">
      <div role="status" className="flex items-center justify-between gap-3 rounded-lg border border-line bg-raised py-2 pr-2 pl-4 text-ink shadow-md">
        <span className="flex min-w-0 items-center gap-2 text-body font-medium">
          <span aria-hidden className="size-2 shrink-0 rounded-full bg-warning" />
          <span className="truncate">Unsaved changes</span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <Button type="button" variant="ghost" onClick={onDiscard} disabled={pending}>
            Discard
          </Button>
          <Button type="submit" form={form} disabled={pending} aria-busy={pending || undefined}>
            {pending && <Loader2 className="animate-spin" />}
            {label}
          </Button>
        </span>
      </div>
    </div>
  );
}
