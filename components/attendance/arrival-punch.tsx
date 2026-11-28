"use client";

import { BellRing, CircleAlert, Loader2, Settings } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { PUNCH_EVENT } from "@/components/layout/reminder-popup";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { punchIn } from "@/lib/actions/punch";
import { hapticTap, isNativeApp, listenNative, nativePlugin } from "@/lib/native";
import { formatTime } from "@/lib/time";
import { getLocation } from "./punch-card";

/** Mirrors OfficeArrivalPlugin (mobile/android … /OfficeArrivalPlugin.java, mobile/ios … /OfficeArrivalPlugin.swift). */
type ArrivalStatus = {
  enabled: boolean;
  /** "always" is needed for the notification to arrive while the app is closed. */
  location: "always" | "whenInUse" | "denied" | "prompt";
  notifications: "granted" | "denied" | "prompt";
};

type Office = { lat: number; lng: number; radiusMeters: number };

/**
 * Arrival reminder (native app only, DESIGN.md §4.1 rules for punch feedback).
 * The phone watches the office geofence; on arrival it shows "You're at the office. Tap to punch in."
 * Tapping opens the app, which lands here and punches in with a fresh location (no selfie; the
 * server re-checks the distance and records the punch as "Arrival notification").
 */
export function ArrivalPunch({ office, date, punchedIn }: { office: Office; date: string; punchedIn: boolean }) {
  const router = useRouter();
  const [native, setNative] = useState(false);
  const [status, setStatus] = useState<ArrivalStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [punching, setPunching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const punchedRef = useRef(punchedIn);
  punchedRef.current = punchedIn;

  const plugin = native ? nativePlugin("OfficeArrival") : undefined;

  useEffect(() => setNative(isNativeApp() && !!nativePlugin("OfficeArrival")), []);

  const refresh = useCallback(async () => {
    if (!plugin) return;
    try {
      setStatus((await plugin.getStatus()) as ArrivalStatus);
    } catch {
      setStatus(null);
    }
  }, [plugin]);

  // Punch in after the notification was tapped (cold start, resume, or while open).
  const consume = useCallback(async () => {
    if (!plugin) return;
    const { pending } = (await plugin.consumePending().catch(() => ({ pending: false }))) as { pending: boolean };
    if (!pending || punchedRef.current) return;
    setPunching(true);
    setError(null);
    try {
      const location = await getLocation();
      const res = await punchIn({ location, selfie: null, via: "arrival" });
      if (!res.ok) throw new Error(res.error);
      punchedRef.current = true;
      plugin.setPunchedIn({ date }).catch(() => {});
      hapticTap();
      toast.success(res.message, { description: `Recorded at ${formatTime(new Date())} IST, from the arrival notification` });
      window.dispatchEvent(new Event(PUNCH_EVENT));
      router.refresh();
    } catch (err) {
      setError((err as Error).message || "Couldn't punch in. Use the punch card above.");
    } finally {
      setPunching(false);
    }
  }, [plugin, date, router]);

  // Keep the phone's copy of the office area and today's punch state current.
  useEffect(() => {
    if (!plugin) return;
    refresh();
    plugin.updateOffice({ lat: office.lat, lng: office.lng, radius: office.radiusMeters }).catch(() => {});
    if (punchedIn) plugin.setPunchedIn({ date }).catch(() => {});
  }, [plugin, office.lat, office.lng, office.radiusMeters, date, punchedIn, refresh]);

  useEffect(() => {
    if (!plugin) return;
    consume();
    const stops = [
      listenNative(plugin, "arrivalTapped", () => void consume()),
      listenNative(nativePlugin("App"), "resume", () => {
        refresh();
        consume();
      }),
    ];
    return () => stops.forEach((stop) => stop());
  }, [plugin, consume, refresh]);

  if (!native || !status) return null;

  const toggle = async (on: boolean) => {
    if (!plugin) return;
    setBusy(true);
    setError(null);
    try {
      const next = (on
        ? await plugin.enable({ lat: office.lat, lng: office.lng, radius: office.radiusMeters, punchedInDate: punchedIn ? date : null })
        : await plugin.disable()) as ArrivalStatus;
      setStatus(next);
      if (on && next.location === "denied") setError("Location is blocked for this app. Allow it in your phone settings.");
    } catch (err) {
      setError((err as Error).message || "Couldn't change the arrival reminder.");
    } finally {
      setBusy(false);
    }
  };

  const needsAlways = status.enabled && status.location !== "always";
  const needsNotifications = status.enabled && status.notifications === "denied";

  return (
    <section aria-labelledby="arrival-title" className="rounded-xl bg-surface p-5 shadow-card">
      <div className="flex items-center gap-4">
        <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-glass text-ink-2 ring-1 ring-line ring-inset">
          {punching ? <Loader2 className="size-5 animate-spin" /> : <BellRing className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <h3 id="arrival-title" className="text-title-3 text-ink">
            Arrival reminder
          </h3>
          <p className="text-m-caption text-ink-2" aria-live="polite">
            {punching
              ? "Punching you in…"
              : status.enabled
                ? "On. When you reach the office, tap the notification to punch in."
                : "Get a notification when you reach the office. Tap it to punch in."}
          </p>
        </div>
        <Switch checked={status.enabled} disabled={busy || punching} onCheckedChange={toggle} aria-label="Arrival reminder" aria-busy={busy} />
      </div>

      {(needsAlways || needsNotifications) && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg bg-glass px-4 py-3 text-m-caption text-ink-2 ring-1 ring-line ring-inset">
          <CircleAlert aria-hidden className="size-4 shrink-0 text-warning" />
          <p className="min-w-0 flex-1">
            {needsAlways
              ? "Set location to “Allow all the time” so the reminder works while the app is closed."
              : "Notifications are off for this app, so the reminder can't show."}
          </p>
          <Button size="sm" variant="outline" onClick={() => plugin?.openSettings().catch(() => {})}>
            <Settings aria-hidden />
            Open settings
          </Button>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-4 flex items-start gap-2 rounded-lg bg-danger-subtle px-4 py-3 text-m-caption text-danger">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}
    </section>
  );
}
