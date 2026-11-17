"use client";

import { Camera, CircleAlert, KeyRound, Loader2, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { deleteEmployee, resetEmployeePassword, uploadEmployeePhoto } from "@/lib/actions/employees";
import type { EmployeeDetail, EmployeeFormOptions } from "@/lib/employees";
import { EmployeeSheet, type RoleAccess } from "./employee-sheet";
import { TempPasswordDialog } from "./temp-password-dialog";

export function EmployeeActions({
  employee,
  options,
  access,
  canManageLogin,
  isSelf,
  openEdit,
}: {
  employee: EmployeeDetail;
  options: EmployeeFormOptions;
  access: RoleAccess;
  /** May reset the password / remove this person (server re-checks) */
  canManageLogin: boolean;
  isSelf: boolean;
  openEdit: boolean;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(openEdit);
  const [confirm, setConfirm] = useState<"delete" | "reset" | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [temp, setTemp] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Drop ?edit=1 once the sheet has opened so a refresh doesn't reopen it.
  useEffect(() => {
    if (openEdit) router.replace(`/employees/${employee.id}`, { scroll: false });
  }, [openEdit, employee.id, router]);

  const run = () =>
    start(async () => {
      setError("");
      if (confirm === "delete") {
        const res = await deleteEmployee(employee.id, reason);
        if (!res.ok) return setError(res.error);
        toast.success(res.message);
        router.push("/employees");
      } else {
        const res = await resetEmployeePassword(employee.id);
        if (!res.ok) return setError(res.error);
        setConfirm(null);
        setTemp(res.tempPassword ?? null);
      }
    });

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" onClick={() => setEditOpen(true)}>
        <Pencil /> Edit
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" aria-label="More actions">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {employee.user && canManageLogin && (
            <DropdownMenuItem onSelect={() => setConfirm("reset")}>
              <KeyRound /> Reset password
            </DropdownMenuItem>
          )}
          {!isSelf && canManageLogin && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setConfirm("delete")}>
                <Trash2 /> Remove employee
              </DropdownMenuItem>
            </>
          )}
          {!(employee.user && canManageLogin) && !(canManageLogin && !isSelf) && <DropdownMenuItem disabled>No other actions</DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>

      <EmployeeSheet open={editOpen} onOpenChange={setEditOpen} options={options} employee={employee} access={access} />

      <AlertDialog
        open={confirm !== null}
        onOpenChange={(o) => {
          if (!o) {
            setConfirm(null);
            setReason("");
            setError("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-title-3 text-ink">{confirm === "delete" ? `Remove ${employee.fullName}?` : `Reset ${employee.fullName}'s password?`}</AlertDialogTitle>
            <AlertDialogDescription className="text-body text-ink-2">
              {confirm === "delete"
                ? "They disappear from lists and can no longer sign in. Their attendance, requests and audit history are kept for reports."
                : "Their current password stops working. You'll get a temporary one to share, and they must change it when they sign in. This also unlocks a locked account."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {confirm === "delete" && (
            <div className="space-y-1.5">
              <Label htmlFor="reason">Reason</Label>
              <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Added by mistake, duplicate record" rows={3} />
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
            <Button variant={confirm === "delete" ? "destructive" : "default"} onClick={run} disabled={pending} aria-busy={pending || undefined}>
              {pending && <Loader2 className="animate-spin" />}
              {confirm === "delete" ? "Remove" : "Reset password"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <TempPasswordDialog
        password={temp}
        name={employee.fullName}
        onClose={() => {
          setTemp(null);
          router.refresh();
        }}
      />
    </div>
  );
}

/** Small camera button on the avatar; uploads straight away. */
export function PhotoButton({ id }: { id: number }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={pending}
        className="absolute -right-1 -bottom-1 grid size-8 place-items-center rounded-full border border-line-strong bg-surface text-ink-2 ring-2 ring-surface transition-colors duration-[120ms] outline-none hover:bg-sunken hover:text-ink focus-visible:ring-brand after:absolute after:-inset-1.5"
        aria-label="Change photo"
      >
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Camera className="size-3.5" />}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          if (file.size > 2 * 1024 * 1024) return void toast.error("The photo must be 2 MB or smaller.");
          const form = new FormData();
          form.set("photo", file);
          start(async () => {
            const res = await uploadEmployeePhoto(id, form);
            if (res.ok) {
              toast.success(res.message);
              router.refresh();
            } else toast.error(res.error);
          });
        }}
      />
    </>
  );
}
