"use client";

import { CircleAlert, Download, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { fileSize } from "@/lib/file-size";
import { isNativeApp, listenNative, nativePlatform, nativePlugin } from "@/lib/native";

type Latest = { available: boolean; version: string; versionCode: number; size: number; downloadUrl: string };
type Step = "ask" | "downloading" | "permission" | "installing";

/** "Later" hides the offer for this long (per version). */
const SNOOZE_MS = 24 * 60 * 60 * 1000;
/** Don't ask the server more often than this while the app keeps coming back to the screen. */
const CHECK_EVERY_MS = 30 * 60 * 1000;
const snoozeKey = (code: number) => `app-update-snoozed-${code}`;

/**
 * In-app updates for the Android app (it is installed from the company's own /app page, not the
 * Play Store). At start-up and when the app comes back to the screen it compares its own build
 * number with the newest upload (/api/app/android/latest). If there's a newer one it offers it:
 * download with progress, then Android's installer (the person taps Install; Android never lets
 * an app update itself silently outside the Play Store). Nothing happens in browsers or on iOS.
 */
export function AppUpdate() {
  const [latest, setLatest] = useState<Latest | null>(null);
  const [installed, setInstalled] = useState<string>("");
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("ask");
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const lastCheck = useRef(0);
  const stepRef = useRef<Step>("ask");
  stepRef.current = step;

  const plugin = typeof window !== "undefined" && isNativeApp() && nativePlatform() === "android" ? nativePlugin("AppUpdate") : undefined;

  const check = useCallback(async () => {
    if (!plugin || Date.now() - lastCheck.current < CHECK_EVERY_MS) return;
    lastCheck.current = Date.now();
    try {
      const mine = (await plugin.getInfo()) as { versionCode: number; versionName: string };
      const res = await fetch("/api/app/android/latest", { cache: "no-store" });
      if (!res.ok) return;
      const next = (await res.json()) as Latest;
      if (!next.available || next.versionCode <= mine.versionCode) return;
      const snoozedUntil = Number(localStorage.getItem(snoozeKey(next.versionCode)) ?? 0);
      if (Date.now() < snoozedUntil) return;
      setInstalled(mine.versionName);
      setLatest(next);
      setStep("ask");
      setError(null);
      setOpen(true);
    } catch {
      // Offline or an old app without the updater: try again next time.
    }
  }, [plugin]);

  const install = useCallback(async () => {
    if (!plugin) return;
    setStep("installing");
    try {
      const r = (await plugin.install()) as { needsPermission?: boolean };
      // Android opened "Install unknown apps" for this app; finish when the person comes back.
      setStep(r.needsPermission ? "permission" : "installing");
    } catch (err) {
      setError((err as Error).message || "Couldn't open the installer.");
      setStep("ask");
    }
  }, [plugin]);

  useEffect(() => {
    if (!plugin) return;
    check();
    const stops = [
      listenNative(nativePlugin("App"), "resume", () => {
        // Back from the "Install unknown apps" page: carry on with the install.
        if (stepRef.current === "permission") install();
        else check();
      }),
      listenNative(plugin, "progress", (d) => setPercent(Number(d.percent) || 0)),
    ];
    return () => stops.forEach((stop) => stop());
  }, [plugin, check, install]);

  if (!plugin || !latest) return null;

  const update = async () => {
    setError(null);
    setPercent(0);
    setStep("downloading");
    try {
      await plugin.download({ url: new URL(latest.downloadUrl, window.location.href).href });
      await install();
    } catch (err) {
      setError((err as Error).message || "The download stopped. Check your internet and try again.");
      setStep("ask");
    }
  };

  const later = () => {
    localStorage.setItem(snoozeKey(latest.versionCode), String(Date.now() + SNOOZE_MS));
    setOpen(false);
  };

  const busy = step === "downloading" || step === "installing";

  return (
    <AlertDialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Update available</AlertDialogTitle>
          <AlertDialogDescription className="tabular-nums">
            Version {latest.version} ({fileSize(latest.size)}) is ready{installed ? `; you have ${installed}` : ""}. You stay signed in, and it takes under a
            minute.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {step === "downloading" && (
          <div className="space-y-1.5" aria-live="polite">
            <Progress value={percent} aria-label="Download progress" />
            <p className="text-caption text-ink-3 tabular-nums">Downloading… {percent}%</p>
          </div>
        )}
        {step === "installing" && <p className="text-body text-ink-2">Tap Install on the next screen.</p>}
        {step === "permission" && (
          <p className="text-body text-ink-2">
            Turn on <span className="font-medium text-ink">Allow from this source</span> for Attendance, then come back here. The install carries on by
            itself.
          </p>
        )}
        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-md bg-danger-subtle px-3 py-2.5 text-body text-danger">
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            {error}
          </p>
        )}

        <AlertDialogFooter>
          {step === "ask" && (
            <Button variant="outline" onClick={later}>
              Later
            </Button>
          )}
          {step === "permission" ? (
            <Button onClick={install}>Install</Button>
          ) : (
            <Button onClick={update} disabled={busy} aria-busy={busy}>
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />}
              {step === "downloading" ? "Downloading…" : step === "installing" ? "Opening installer…" : "Update"}
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
