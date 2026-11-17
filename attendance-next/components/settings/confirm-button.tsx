"use client";

import { CircleAlert, Loader2 } from "lucide-react";
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

type Result = { ok: true; message: string } | { ok: false; error: string };

/** A button that asks for confirmation in an AlertDialog, runs a server action and toasts the result. */
export function ConfirmButton({
  title,
  description,
  confirmLabel,
  action,
  onDone,
  children,
  variant = "outline",
  size = "default",
  disabled,
  blockedReason,
  className,
  "aria-label": ariaLabel,
}: {
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  action: () => Promise<Result>;
  onDone?: () => void;
  children: React.ReactNode;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  disabled?: boolean;
  /** When set, the dialog explains why the action is not possible instead of offering it. */
  blockedReason?: string;
  className?: string;
  "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const run = () =>
    start(async () => {
      setError("");
      const res = await action();
      if (!res.ok) return setError(res.error);
      toast.success(res.message);
      setOpen(false);
      onDone?.();
    });

  return (
    <>
      <Button type="button" variant={variant} size={size} className={className} disabled={disabled} aria-label={ariaLabel} onClick={() => setOpen(true)}>
        {children}
      </Button>
      <AlertDialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setError("");
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-title-3 text-ink">{blockedReason ? title.replace(/\?$/, "").replace(/^Delete /, "Can't delete ") : title}</AlertDialogTitle>
            <AlertDialogDescription className="text-body text-ink-2">{blockedReason ?? description}</AlertDialogDescription>
          </AlertDialogHeader>
          {error && (
            <p role="alert" className="flex items-start gap-2 rounded-md bg-danger-subtle px-3 py-2.5 text-body text-danger">
              <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              {error}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>{blockedReason ? "OK" : "Cancel"}</AlertDialogCancel>
            {!blockedReason && (
              <Button variant="destructive" onClick={run} disabled={pending} aria-busy={pending || undefined}>
                {pending && <Loader2 className="animate-spin" />}
                {confirmLabel}
              </Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
