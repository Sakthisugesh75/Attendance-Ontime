"use client";

import { CircleAlert, Download, HardDriveDownload, Loader2, RotateCcw, Save, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
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
import { deleteBackup, saveBackupNow } from "@/lib/actions/backup";
import type { StoredBackup } from "@/lib/backup";
import { formatDate, formatTime, istDate } from "@/lib/time";
import { SettingsCard, SettingsSection } from "./section";

const KIND_LABEL: Record<StoredBackup["kind"], string> = { daily: "Daily (automatic)", manual: "Saved by hand", "pre-restore": "Before a restore" };

const size = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);
const when = (iso: string) => `${formatDate(istDate(new Date(iso)))}, ${formatTime(iso)}`;

type RestoreSource = { kind: "file"; file: File } | { kind: "stored"; name: string; createdAt: string };

export function BackupSection({ backups, isSuperAdmin }: { backups: StoredBackup[]; isSuperAdmin: boolean }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [restore, setRestore] = useState<RestoreSource | null>(null);
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [restoring, setRestoring] = useState(false);
  const [pending, start] = useTransition();

  if (!isSuperAdmin) {
    return (
      <SettingsSection title="Backup and restore" description="Backups hold every record, including sign-in details, so only a Super Admin can make or restore them.">
        <SettingsCard>
          <p className="text-body text-ink-2">Ask a Super Admin if you need a backup or a restore.</p>
        </SettingsCard>
      </SettingsSection>
    );
  }

  const run = (fn: () => Promise<{ ok: true; message: string } | { ok: false; error: string }>) =>
    start(async () => {
      const res = await fn();
      if (res.ok) {
        toast.success(res.message);
        router.refresh();
      } else toast.error(res.error);
    });

  const doRestore = async () => {
    if (!restore) return;
    setError("");
    setRestoring(true);
    const form = new FormData();
    form.set("confirm", confirm);
    if (restore.kind === "file") form.set("file", restore.file);
    else form.set("stored", restore.name);
    try {
      const res = await fetch("/api/backup/restore", { method: "POST", body: form });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; counts?: Record<string, number>; backupCreatedAt?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "The restore failed and nothing was changed.");
        setRestoring(false);
        return;
      }
      toast.success(`Restored the backup from ${when(data.backupCreatedAt!)}: ${data.counts?.Employee ?? 0} employees, ${data.counts?.AttendanceRecord ?? 0} attendance days.`);
      // Everything changed underneath the app; a full reload picks it up (or asks to sign in again).
      window.location.href = "/dashboard";
    } catch {
      setError("Couldn't reach the server. Check your connection; the data was not changed.");
      setRestoring(false);
    }
  };

  return (
    <div className="space-y-8">
      <SettingsSection
        title="Back up your data"
        description="A backup holds every employee, punch, request, leave balance, setting and audit entry. Keep it somewhere safe: it also holds sign-in details. Photos and selfies aren't included; copy the storage folder for those."
      >
        <SettingsCard>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <a href="/api/backup" download>
                <Download /> Download backup
              </a>
            </Button>
            <Button variant="outline" onClick={() => run(saveBackupNow)} disabled={pending} aria-busy={pending || undefined}>
              {pending ? <Loader2 className="animate-spin" /> : <Save />} Save a copy on the server
            </Button>
          </div>
          <p className="text-caption text-ink-3">The server also saves a copy every night and keeps the last 14.</p>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="Backups on the server" description="Download one, or put the data back the way it was at that moment.">
        <div className="overflow-hidden rounded-xl bg-surface shadow-card">
          {backups.length === 0 ? (
            <p className="p-4 text-body text-ink-2 sm:p-6">No copies on the server yet. Use “Save a copy on the server”, or wait for tonight&apos;s automatic backup.</p>
          ) : (
            <ul className="divide-y divide-line">
              {backups.map((b) => (
                <li key={b.name} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
                  <HardDriveDownload aria-hidden className="size-[18px] shrink-0 text-ink-3" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-body font-medium text-ink tabular-nums">{when(b.createdAt)}</span>
                    <span className="block text-caption text-ink-3">
                      {KIND_LABEL[b.kind]} · <span className="tabular-nums">{size(b.size)}</span>
                    </span>
                  </span>
                  <span className="flex gap-1">
                    <Button variant="ghost" size="icon" asChild aria-label={`Download the backup from ${when(b.createdAt)}`}>
                      <a href={`/api/backup?file=${encodeURIComponent(b.name)}`} download>
                        <Download />
                      </a>
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setRestore({ kind: "stored", name: b.name, createdAt: b.createdAt })}>
                      <RotateCcw /> Restore
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-danger"
                      aria-label={`Delete the backup from ${when(b.createdAt)}`}
                      disabled={pending}
                      onClick={() => run(() => deleteBackup(b.name))}
                    >
                      <Trash2 />
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SettingsSection>

      <SettingsSection title="Restore from a file" description="Replaces all current data with a backup file you downloaded earlier. A copy of the current data is saved on the server first, so you can go back.">
        <SettingsCard
          footer={
            <Button variant="destructive" disabled={!file} onClick={() => file && setRestore({ kind: "file", file })}>
              <RotateCcw /> Restore this backup
            </Button>
          }
        >
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" onClick={() => fileInput.current?.click()}>
              <Upload /> Choose backup file
            </Button>
            <span className="min-w-0 truncate text-body text-ink-2">{file ? `${file.name} · ${size(file.size)}` : "No file chosen"}</span>
            <input
              ref={fileInput}
              type="file"
              accept=".gz,.json,application/gzip,application/json"
              className="hidden"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
          </div>
        </SettingsCard>
      </SettingsSection>

      <AlertDialog
        open={!!restore}
        onOpenChange={(o) => {
          if (!o && !restoring) {
            setRestore(null);
            setConfirm("");
            setError("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-title-3 text-ink">Replace all data with this backup?</AlertDialogTitle>
            <AlertDialogDescription className="text-body text-ink-2">
              {restore?.kind === "stored" ? `Everything goes back to how it was on ${when(restore.createdAt)}.` : `Everything is replaced with the contents of ${restore?.kind === "file" ? restore.file.name : "the file"}.`}{" "}
              Punches, requests and changes made since then are lost (a safety copy of today&apos;s data is saved first). Everyone may need to sign in again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="restore-confirm">
              Type <span className="font-semibold">RESTORE</span> to confirm
            </Label>
            <Input id="restore-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" disabled={restoring} />
          </div>
          {error && (
            <p role="alert" className="flex items-start gap-2 rounded-md bg-danger-subtle px-3 py-2.5 text-body text-danger">
              <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              {error}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoring}>Cancel</AlertDialogCancel>
            <Button variant="destructive" onClick={doRestore} disabled={restoring || confirm.trim().toUpperCase() !== "RESTORE"} aria-busy={restoring || undefined}>
              {restoring && <Loader2 className="animate-spin" />}
              {restoring ? "Restoring…" : "Restore"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
