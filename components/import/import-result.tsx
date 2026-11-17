"use client";

import { CheckCircle2, Loader2, RotateCcw, Undo2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { revertImport } from "@/lib/actions/import";
import type { ImportPreview } from "@/lib/import/service";
import { formatDate, formatTime, istDate } from "@/lib/time";

export function ImportResultView({ preview }: { preview: ImportPreview }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  const { batch } = preview;
  const r = batch.result;
  const done = batch.status === "DONE";
  const when = (d: Date | null) => (d ? `${formatDate(istDate(d))}, ${formatTime(d)}` : "");

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-xl bg-surface shadow-card p-4 sm:flex-row sm:items-center sm:gap-5 sm:p-6">
        <span className={done ? "grid size-14 shrink-0 place-items-center rounded-full bg-st-present-tint text-st-present-fg" : "grid size-14 shrink-0 place-items-center rounded-full bg-sunken text-ink-2"}>
          {done ? <CheckCircle2 aria-hidden className="size-7" /> : <RotateCcw aria-hidden className="size-7" />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-title-2 text-ink">{done ? "Import finished" : batch.status === "UNDONE" ? "Import undone" : "Import failed"}</h2>
          <p className="mt-1 truncate text-body text-ink-2 tabular-nums">
            {batch.fileName} · {done ? `imported ${when(batch.committedAt)}` : batch.status === "UNDONE" ? `undone ${when(batch.undoneAt)}` : batch.error}
          </p>
        </div>
        {done && (
          <Button variant="outline" className="max-sm:w-full" onClick={() => setConfirm(true)}>
            <Undo2 /> Undo import
          </Button>
        )}
      </section>

      {r && (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {[
            ["Days added", r.counts.created],
            ["Days replaced", r.counts.updated],
            ["Existing days kept", r.counts.keptExisting],
            ["Outside employment dates", r.counts.outsideEmployment],
            ["Employees created", r.createdEmployeeIds.length],
          ].map(([k, v]) => (
            <div key={k} className="min-w-0 rounded-xl bg-surface shadow-card p-4">
              <dt className="text-label text-ink-2">{k}</dt>
              <dd className="mt-1 text-display text-ink tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      )}

      {done && (
        <section className="rounded-xl bg-surface shadow-card p-4 text-body sm:p-5">
          <h3 className="text-title-3 text-ink">Next steps</h3>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-ink-2 marker:text-ink-3">
            <li>
              <Link href="/employees" className="font-medium text-brand-ink hover:underline">
                Check the employees
              </Link>{" "}
              that were created: add their phone, email and department. Turn on &ldquo;Can sign in&rdquo; when you&apos;re ready to give them access.
            </li>
            <li>
              <Link href="/attendance" className="font-medium text-brand-ink hover:underline">
                Look through Attendance
              </Link>{" "}
              month by month. Days with no data count as absent unless they&apos;re holidays or weekly offs.
            </li>
          </ul>
        </section>
      )}

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-title-3 text-ink">Undo this import?</AlertDialogTitle>
            <AlertDialogDescription className="text-body text-ink-2">
              Days it added are removed and days it replaced get their old values back. Holidays and off days it added are removed. Employees it created are removed too, unless they&apos;ve since been given a sign-in or other data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={pending}
              aria-busy={pending || undefined}
              onClick={() =>
                start(async () => {
                  const res = await revertImport(batch.id);
                  setConfirm(false);
                  if (!res.ok) return void toast.error(res.error);
                  toast.success(res.message);
                  router.refresh();
                })
              }
            >
              {pending && <Loader2 className="animate-spin" />}
              Undo import
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
