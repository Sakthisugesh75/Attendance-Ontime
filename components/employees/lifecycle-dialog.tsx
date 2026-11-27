"use client";

import { CircleAlert, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { deleteEmployee, purgeEmployee, restoreEmployee } from "@/lib/actions/employees";

export type LifecycleAction = "remove" | "restore" | "purge";
export type LifecycleTarget = { action: LifecycleAction; id: number; fullName: string; code: string };

const COPY: Record<LifecycleAction, { title: (n: string) => string; body: string; button: string; destructive: boolean }> = {
  remove: {
    title: (n) => `Remove ${n}?`,
    body: "They disappear from lists and can no longer sign in. Their attendance, requests and audit history are kept, and you can restore them from the Removed tab.",
    button: "Remove",
    destructive: true,
  },
  restore: {
    title: (n) => `Restore ${n}?`,
    body: "They come back to the employee list with their full history. Their sign-in stays off until you turn it on in Edit.",
    button: "Restore",
    destructive: false,
  },
  purge: {
    title: (n) => `Delete ${n} permanently?`,
    body: "Their attendance, requests, leave balances, daily reports, photos and selfies are deleted for good. Reports for past months will no longer include them. This can't be undone.",
    button: "Delete permanently",
    destructive: true,
  },
};

/** Confirm dialog for removing, restoring or permanently deleting an employee. */
export function LifecycleDialog({ target, onClose }: { target: LifecycleTarget | null; onClose: () => void }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  useEffect(() => {
    setText("");
    setError("");
  }, [target]);

  const copy = target ? COPY[target.action] : null;
  const ready = !target || target.action === "restore" || (target.action === "remove" ? text.trim().length >= 3 : text.trim().toUpperCase() === target.code.toUpperCase());

  const run = () =>
    target &&
    start(async () => {
      setError("");
      const res =
        target.action === "remove" ? await deleteEmployee(target.id, text) : target.action === "restore" ? await restoreEmployee(target.id) : await purgeEmployee(target.id, text);
      if (!res.ok) return setError(res.error);
      toast.success(res.message);
      onClose();
      router.refresh();
    });

  return (
    <AlertDialog open={!!target} onOpenChange={(o) => !o && !pending && onClose()}>
      <AlertDialogContent>
        {target && copy && (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle className="text-title-3 text-ink">{copy.title(target.fullName)}</AlertDialogTitle>
              <AlertDialogDescription className="text-body text-ink-2">{copy.body}</AlertDialogDescription>
            </AlertDialogHeader>
            {target.action === "remove" && (
              <div className="space-y-1.5">
                <Label htmlFor="lifecycle-reason">Reason</Label>
                <Textarea id="lifecycle-reason" value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Added by mistake, duplicate record" rows={3} />
              </div>
            )}
            {target.action === "purge" && (
              <div className="space-y-1.5">
                <Label htmlFor="lifecycle-code">
                  Type <span className="font-semibold tabular-nums [font-feature-settings:'zero']">{target.code}</span> to confirm
                </Label>
                <Input id="lifecycle-code" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" className="tabular-nums" />
              </div>
            )}
            {error && (
              <p role="alert" className="flex items-start gap-2 rounded-md bg-danger-subtle px-3 py-2.5 text-body text-danger">
                <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                {error}
              </p>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
              <Button variant={copy.destructive ? "destructive" : "default"} onClick={run} disabled={pending || !ready} aria-busy={pending || undefined}>
                {pending && <Loader2 className="animate-spin" />}
                {copy.button}
              </Button>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
