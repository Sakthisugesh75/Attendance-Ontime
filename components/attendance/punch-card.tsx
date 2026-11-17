"use client";

import { ArrowRight, Camera, Check, ChevronsRight, CircleAlert, CircleCheck, Loader2, LogIn, LogOut, MapPin, Moon, NotebookPen, PartyPopper, RotateCcw, WifiOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { PUNCH_EVENT } from "@/components/layout/reminder-popup";
import { Illustration } from "@/components/ui/illustration";
import { punchIn, punchOut } from "@/lib/actions/punch";
import type { TodayInfo } from "@/lib/attendance/dashboard";
import { formatClock, formatDuration, formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { SelfieDialog } from "./selfie-dialog";
import { StatusChip } from "./status-chip";

const TZ = "Asia/Kolkata";
const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: TZ });
const dayFmt = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "2-digit", month: "short", timeZone: TZ });
/** How far the knob must travel (share of the track) before a slide counts as a punch. */
const SLIDE_DONE = 0.9;

/** Minutes since IST midnight for an instant. */
function istMinutes(d: Date) {
  const [h, m] = timeFmt.format(d).split(":").map(Number) as [number, number];
  return h * 60 + m;
}

/** "09:42:18 AM" in IST. */
function clockWithSeconds(d: Date) {
  const [hh, mm, ss] = timeFmt.format(d).split(":");
  const h = Number(hh);
  return `${String(h % 12 || 12).padStart(2, "0")}:${mm}:${ss} ${h >= 12 ? "PM" : "AM"}`;
}

/** Ticks every second; the shown time is only a guide. The server records the real punch time. */
function useNow() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/** Browser online/offline, so the card can warn before a punch that would fail. */
function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}

function getLocation(): Promise<{ lat: number; lng: number; accuracy: number }> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject(new Error("This device can't share its location."));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (err) => reject(new Error(err.code === err.PERMISSION_DENIED ? "Location permission is blocked. Allow it in your browser settings to punch." : "Couldn't get your location. Try again outdoors or near a window.")),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  });
}

function ContextChip({ icon: Icon, children, tone }: { icon: typeof MapPin; children: React.ReactNode; tone?: "danger" }) {
  return (
    <li className={cn("inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-m-caption", tone === "danger" ? "bg-danger-subtle text-danger" : "bg-glass text-ink-2 ring-1 ring-line ring-inset")}>
      <Icon aria-hidden className="size-3.5 shrink-0" />
      {children}
    </li>
  );
}

const hourLabel = (m: number) => {
  const h = Math.floor(m / 60) % 24;
  return { n: h % 12 || 12, ap: h >= 12 ? "PM" : "AM" };
};

/**
 * The working day as one strip (DESIGN.md §0): the shift window, the grace period, late minutes
 * hatched, the time worked, and the 3D art riding at "now". It replaces the separate timeline card.
 */
function DayStrip({
  shiftStart,
  shiftEnd,
  lateMark,
  inMin,
  outMin,
  nowMin,
  late,
  progress,
  art,
}: {
  shiftStart: number | null;
  shiftEnd: number | null;
  lateMark: number | null;
  inMin: number | null;
  outMin: number | null;
  nowMin: number | null;
  late: boolean;
  progress: number;
  art: Parameters<typeof Illustration>[0]["name"];
}) {
  const lo = Math.min(shiftStart ?? 9 * 60, inMin ?? Infinity);
  const hi = Math.max(shiftEnd ?? 18 * 60, outMin ?? 0, nowMin ?? 0);
  const start = Math.max(0, Math.floor((lo - 60) / 120) * 120);
  const end = Math.min(24 * 60, Math.max(start + 8 * 60, Math.ceil((hi + 60) / 120) * 120));
  const pct = (m: number) => Math.min(100, Math.max(0, ((m - start) / (end - start)) * 100));
  const span = (from: number, to: number) => ({ left: `${pct(from)}%`, width: `${Math.max(0, pct(to) - pct(from))}%` });
  const ticks: number[] = [];
  for (let m = start; m <= end; m += 120) ticks.push(m);
  const until = outMin ?? nowMin;
  // The art stands at "now" while the day is open, and at the punch-out once it is closed.
  const artAt = outMin ?? nowMin;

  return (
    <div className="mt-6" role="progressbar" aria-label="Hours worked today" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
      <div aria-hidden className="relative pt-12">
        {artAt !== null && (
          <span className="absolute top-0 -translate-x-1/2 transition-[left] duration-700 ease-out" style={{ left: `${pct(artAt)}%` }}>
            <Illustration name={art} size={46} float={!outMin} />
          </span>
        )}
        <div className="relative h-10 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--ad-text)_7%,transparent)]">
          {shiftStart !== null && shiftEnd !== null && (
            <span className="absolute inset-y-1 rounded-full border border-dashed border-line-strong/50 bg-glass" style={span(shiftStart, shiftEnd)} />
          )}
          {/* Grace period after the shift starts */}
          {shiftStart !== null && lateMark !== null && lateMark > shiftStart && (
            <span className="absolute inset-y-1 bg-st-present-tint/80" style={span(shiftStart, lateMark)} />
          )}
          {late && inMin !== null && shiftStart !== null && (
            <span className="absolute inset-y-[11px] rounded-l-full bg-[repeating-linear-gradient(-45deg,var(--ad-late)_0_3px,transparent_3px_6px)] opacity-60" style={span(shiftStart, inMin)} />
          )}
          {inMin !== null && until !== null && (
            <span className="absolute inset-y-[9px] rounded-full bg-[linear-gradient(90deg,var(--ad-mint),var(--ad-late))] transition-[width] duration-500 ease-out" style={span(inMin, Math.max(until, inMin + 3))} />
          )}
          {nowMin !== null && !outMin && nowMin >= start && nowMin <= end && (
            <span className="absolute inset-y-1 -ml-px w-0.5 rounded-full bg-ink" style={{ left: `${pct(nowMin)}%` }} />
          )}
        </div>
        <div className="relative mt-2 h-4 text-[11px] text-ink-3 tabular-nums">
          {ticks.map((m, i) => {
            const { n, ap } = hourLabel(m);
            return (
              <span key={m} className={cn("absolute whitespace-nowrap", i === 0 ? "" : i === ticks.length - 1 ? "-translate-x-full" : "-translate-x-1/2")} style={{ left: `${pct(m)}%` }}>
                {n}
                <span className="max-sm:hidden"> {ap}</span>
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * Today (DESIGN.md §4.1, v4): one card. A headline that says where the day stands, the day strip
 * with the art at "now", a slide-to-punch control, then only the facts that exist so far.
 */
export function PunchCard({
  today,
  geofenceEnabled,
  selfieRequired,
  writesReports = true,
}: {
  today: TodayInfo;
  geofenceEnabled: boolean;
  selfieRequired: boolean;
  /** Show the "Write today's report" nudge once the day is closed. */
  writesReports?: boolean;
}) {
  const router = useRouter();
  const now = useNow();
  const online = useOnline();
  const [pending, start] = useTransition();
  const [selfieOpen, setSelfieOpen] = useState(false);
  const [step, setStep] = useState("");
  const [slide, setSlide] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [hint, setHint] = useState("");
  const [justDone, setJustDone] = useState<"IN" | "OUT" | null>(null);
  const [confirmed, setConfirmed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const drag = useRef<{ x: number; max: number } | null>(null);
  const lastPointer = useRef<string>("mouse");

  const punchedIn = !!today.punchInAt;
  const punchedOut = !!today.punchOutAt;
  const kind: "IN" | "OUT" | "DONE" = !punchedIn ? "IN" : !punchedOut ? "OUT" : "DONE";
  const offDay = today.holiday ?? (today.weeklyOff ? "Weekly off" : null);

  // Workday maths (all IST, minutes)
  const nowMin = now ? istMinutes(now) : null;
  const inMin = today.punchInAt ? istMinutes(new Date(today.punchInAt)) : null;
  const outMin = today.punchOutAt ? istMinutes(new Date(today.punchOutAt)) : null;
  const worked = punchedIn && now ? Math.max(0, Math.floor(((punchedOut ? new Date(today.punchOutAt!) : now).getTime() - new Date(today.punchInAt!).getTime()) / 60000)) : 0;
  const target = inMin !== null && today.expectedOut !== null ? Math.max(60, today.expectedOut - inMin) : 480;
  const progress = punchedIn ? Math.min(1, worked / target) : 0;
  const lateMark = today.shiftStart !== null ? today.shiftStart + today.graceMinutes : null;
  const late = today.lateMinutes > 0;

  const submit = (selfie: string | null) =>
    start(async () => {
      setError(null);
      try {
        let location = null;
        if (geofenceEnabled) {
          setStep("Checking your location…");
          location = await getLocation();
        }
        setStep(kind === "IN" ? "Punching in…" : "Punching out…");
        const res = await (kind === "IN" ? punchIn : punchOut)({ location, selfie });
        if (res.ok) {
          const at = clockWithSeconds(new Date());
          setJustDone(kind === "IN" ? "IN" : "OUT");
          setConfirmed(`${res.message}, recorded at ${at} IST`);
          setTimeout(() => setJustDone(null), 2400);
          toast.success(res.message, { description: `Recorded at ${formatTime(new Date())} IST` });
          window.dispatchEvent(new Event(PUNCH_EVENT));
          navigator.vibrate?.(20);
          router.refresh();
        } else {
          setError(res.error);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      } finally {
        setStep("");
        setSlide(0);
      }
    });

  const go = () => (selfieRequired ? setSelfieOpen(true) : submit(null));

  // Touch: slide the knob to the end (stops pocket taps). Mouse and keyboard: a normal click.
  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    lastPointer.current = e.pointerType;
    if (e.pointerType !== "touch" || pending || kind === "DONE") return;
    const rect = e.currentTarget.getBoundingClientRect();
    drag.current = { x: e.clientX, max: rect.width - 60 };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    setHint("");
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setSlide(Math.min(1, Math.max(0, (e.clientX - drag.current.x) / drag.current.max)));
  };
  const onPointerEnd = () => {
    if (!drag.current) return;
    drag.current = null;
    setDragging(false);
    if (slide >= SLIDE_DONE) {
      setSlide(1);
      navigator.vibrate?.(20);
      go();
    } else {
      setSlide(0);
      if (slide > 0.05) setHint(kind === "IN" ? "Slide all the way to punch in" : "Slide all the way to punch out");
    }
  };
  const onClick = () => {
    if (lastPointer.current === "touch") return; // handled by the slide
    go();
  };

  // The headline: the one number that matters right now, and a line that explains it.
  const [hh, mm] = now ? timeFmt.format(now).split(":") : ["--", "--"];
  const h12 = now ? String(Number(hh) % 12 || 12).padStart(2, "0") : "--";
  const ampm = now ? (Number(hh) >= 12 ? "PM" : "AM") : "";
  const hm = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
  const offDayIn = kind === "IN" && !!offDay;
  let big: string;
  let unit: string;
  let sub: React.ReactNode;
  let bigTone = "text-ink";
  if (offDayIn) {
    big = `${h12}:${mm}`;
    unit = ampm;
    sub = <>Today is {offDay}. Punching in counts as overtime.</>;
  } else if (kind === "IN" && lateMark !== null && nowMin !== null) {
    const left = lateMark - nowMin;
    if (left > 0) {
      big = formatDuration(left);
      unit = "to the late mark";
      sub = (
        <>
          Punch in by <span className="tabular-nums">{formatClock(lateMark)}</span> to be on time.
        </>
      );
    } else {
      big = formatDuration(-left);
      unit = "past the late mark";
      bigTone = "text-st-late-fg";
      sub = (
        <>
          The late mark was <span className="tabular-nums">{formatClock(lateMark)}</span>. Punch in now.
        </>
      );
    }
  } else if (kind === "IN") {
    big = `${h12}:${mm}`;
    unit = ampm;
    sub = "No shift is set for today.";
  } else if (kind === "OUT") {
    big = hm(worked);
    unit = "worked";
    const left = target - worked;
    sub =
      left > 0 ? (
        <>
          <b className="font-medium text-ink tabular-nums">{formatDuration(left)}</b> to go, out at <span className="tabular-nums">{today.expectedOut !== null ? formatClock(today.expectedOut) : "—"}</span>
        </>
      ) : (
        <>Day complete{worked - target > 0 ? <>, <b className="font-medium text-ink tabular-nums">{formatDuration(worked - target)}</b> extra</> : null}. Punch out when you leave.</>
      );
  } else {
    big = hm(worked);
    unit = "worked today";
    sub = "You're done for today. See you tomorrow!";
  }

  // Only the facts that exist so far (they replace the old timeline steps).
  const facts: { k: string; v: string; note?: string }[] =
    kind === "IN"
      ? [
          today.shiftStart !== null && { k: "Shift starts", v: formatClock(today.shiftStart) },
          lateMark !== null && { k: "Late after", v: formatClock(lateMark) },
          today.shiftEnd !== null && { k: "Shift ends", v: formatClock(today.shiftEnd) },
        ].filter((f): f is { k: string; v: string } => !!f)
      : kind === "OUT"
        ? [
            { k: "Punched in", v: formatTime(today.punchInAt), note: late ? `${formatDuration(today.lateMinutes)} late` : "On time" },
            { k: "Expected out", v: today.expectedOut !== null ? formatClock(today.expectedOut) : "—" },
            ...(today.shiftEnd !== null ? [{ k: "Shift ends", v: formatClock(today.shiftEnd) }] : []),
          ]
        : [
            { k: "Punched in", v: formatTime(today.punchInAt), note: late ? `${formatDuration(today.lateMinutes)} late` : "On time" },
            { k: "Punched out", v: formatTime(today.punchOutAt) },
            { k: "Worked", v: formatDuration(worked) },
          ];

  const label = kind === "IN" ? "Punch in" : kind === "OUT" ? "Punch out" : "Done for today";
  const ActionIcon = kind === "IN" ? (offDayIn ? (today.holiday ? PartyPopper : Moon) : LogIn) : LogOut;
  const art = offDayIn ? (today.holiday ? "party" : "moon") : kind === "IN" ? (lateMark !== null && nowMin !== null && nowMin > lateMark ? "snail" : "alarm") : kind === "OUT" ? "stopwatch" : "thumbs";
  const active = kind !== "DONE" && !justDone;

  return (
    <section className="flex flex-col rounded-xl bg-surface p-5 shadow-card sm:p-6" aria-label="Today's attendance">
      {/* Status and the live time, small: the headline below is what matters */}
      <div className="flex items-center justify-between gap-3">
        <div aria-live="polite">
          <StatusChip status={today.status} label={!today.status && offDay ? offDay : undefined} className="h-7 px-2.5 text-[13px]" />
        </div>
        <p className="text-m-caption text-ink-2 tabular-nums" suppressHydrationWarning>
          {now ? `${dayFmt.format(now)} · ${h12}:${mm} ${ampm}` : " "}
        </p>
      </div>

      {/* Headline (decorative copy of the facts below; screen readers get those) */}
      <div className="mt-5" suppressHydrationWarning>
        <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <span className={cn("text-[56px] leading-[0.95] font-light tracking-[-0.045em] tabular-nums sm:text-[72px]", bigTone)} suppressHydrationWarning>
            {big}
          </span>
          <span className="text-m-meta text-ink-2 sm:text-[17px]">{unit}</span>
        </p>
        <p className="mt-2 text-m-meta text-ink-2" suppressHydrationWarning>
          {sub}
        </p>
      </div>

      <DayStrip shiftStart={today.shiftStart} shiftEnd={today.shiftEnd} lateMark={lateMark} inMin={inMin} outMin={outMin} nowMin={nowMin} late={late} progress={progress} art={art} />

      {/* Facts that exist so far */}
      {facts.length > 0 && (
        <dl className="mt-4 grid grid-flow-col auto-cols-fr divide-x divide-line">
          {facts.map((f) => (
            <div key={f.k} className="min-w-0 px-3 first:pl-0 last:pr-0 sm:px-4">
              <dt className="truncate text-[12px] leading-4 text-ink-3">{f.k}</dt>
              <dd className="mt-1 truncate text-[16px] leading-6 font-medium text-ink tabular-nums sm:text-[18px]">{f.v}</dd>
              {f.note && <dd className={cn("truncate text-m-caption tabular-nums", f.note === "On time" ? "text-st-present-fg" : "text-st-late-fg")}>{f.note}</dd>}
            </div>
          ))}
        </dl>
      )}

      {/* Slide to punch (touch) / click (mouse, keyboard) */}
      <button
        type="button"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onKeyDown={() => (lastPointer.current = "keyboard")}
        onContextMenu={(e) => e.preventDefault()}
        onClick={onClick}
        disabled={pending || kind === "DONE"}
        aria-label={label}
        aria-busy={pending || undefined}
        className={cn(
          "group relative mt-6 flex h-[60px] w-full touch-none items-center overflow-hidden rounded-full outline-none select-none focus-visible:shadow-[var(--ad-focus)] disabled:cursor-not-allowed",
          justDone ? "bg-success text-surface" : kind === "DONE" ? "bg-glass text-ink-2 ring-1 ring-line ring-inset" : offDayIn ? "bg-glass text-ink ring-1 ring-line ring-inset" : "bg-brand text-on-brand shadow-brand",
          pending && kind !== "DONE" && "disabled:cursor-progress",
        )}
      >
        {/* Trail behind the knob */}
        {active && <span aria-hidden className={cn("absolute inset-y-0 left-0 rounded-full bg-butter/25", !dragging && "transition-[width] duration-300 ease-out")} style={{ width: `calc(${slide} * (100% - 60px) + 60px)` }} />}
        {/* The knob */}
        <span
          aria-hidden
          className={cn(
            "absolute top-1 grid size-[52px] place-items-center rounded-full",
            active ? (offDayIn ? "bg-brand text-on-brand" : "bg-butter text-on-butter") : "bg-transparent",
            !dragging && "transition-[left] duration-300 ease-out",
            active && !pending && "group-hover:translate-x-1",
          )}
          style={{ left: `calc(4px + ${slide} * (100% - 60px))` }}
        >
          {justDone ? (
            <Check className="size-6" strokeWidth={2.5} />
          ) : pending ? (
            <Loader2 className="size-6 animate-spin" />
          ) : kind === "DONE" ? (
            <CircleCheck className="size-6" />
          ) : (
            <ActionIcon className="size-6" />
          )}
        </span>
        <span className="relative flex-1 pl-12 text-center text-[17px] leading-6 font-medium transition-opacity" style={{ opacity: active ? Math.max(0, 1 - slide * 1.6) : 1 }}>
          {justDone ? (justDone === "IN" ? "Punched in" : "Punched out") : kind === "DONE" ? label : (
            <>
              <span className="[@media(pointer:coarse)]:hidden">{label}</span>
              <span className="hidden [@media(pointer:coarse)]:inline">Slide to {label.toLowerCase()}</span>
            </>
          )}
        </span>
        {active && !pending && <ChevronsRight aria-hidden className="relative mr-5 size-5 opacity-50" />}
      </button>

      {/* Error: plain words and one retry, right under the control */}
      {error && (
        <div role="alert" className="mt-3 flex items-start gap-2.5 rounded-lg bg-danger-subtle px-3.5 py-3 text-danger">
          <CircleAlert aria-hidden className="mt-0.5 size-5 shrink-0" />
          <p className="min-w-0 flex-1 text-m-caption text-ink">{error}</p>
          <button
            type="button"
            onClick={() => {
              setError(null);
              go();
            }}
            disabled={pending}
            className="-my-1.5 inline-flex h-11 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-m-caption font-semibold text-danger outline-none hover:underline focus-visible:shadow-[var(--ad-focus)]"
          >
            <RotateCcw aria-hidden className="size-4" /> Try again
          </button>
        </div>
      )}

      {/* Progress / hint line, and the persistent confirmation (the toast goes away; this doesn't) */}
      {(step || hint || confirmed) && (
        <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-m-caption text-ink-2 tabular-nums" aria-live="polite">
          {step ? (
            <>
              <Loader2 aria-hidden className="size-3.5 animate-spin" /> {step}
            </>
          ) : hint ? (
            <span className="text-ink">{hint}</span>
          ) : (
            <>
              <CircleCheck aria-hidden className="size-4 text-success" />
              {confirmed}
            </>
          )}
        </p>
      )}

      {/* Once the day is closed, nudge towards the end-of-day report. */}
      {kind === "DONE" && writesReports && (
        <Link
          href="/daily-reports?view=mine"
          data-testid="write-report-link"
          className="group mt-3 flex h-12 items-center justify-center gap-2 rounded-full bg-butter px-4 text-m-meta font-medium text-on-butter transition-colors duration-[120ms] outline-none hover:bg-mint-hover focus-visible:shadow-[var(--ad-focus)]"
        >
          <NotebookPen aria-hidden className="size-5" />
          Write today&apos;s report
          <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      )}

      {/* Context chips (only when relevant) */}
      {(geofenceEnabled || selfieRequired || !online) && (
        <ul className="mt-4 flex flex-wrap gap-2">
          {!online && (
            <ContextChip icon={WifiOff} tone="danger">
              Offline: will not record
            </ContextChip>
          )}
          {geofenceEnabled && <ContextChip icon={MapPin}>Location checked</ContextChip>}
          {selfieRequired && <ContextChip icon={Camera}>Selfie needed</ContextChip>}
        </ul>
      )}

      {selfieRequired && (
        <SelfieDialog
          open={selfieOpen}
          onOpenChange={(o) => {
            setSelfieOpen(o);
            if (!o) setSlide(0);
          }}
          title={kind === "IN" ? "Selfie to punch in" : "Selfie to punch out"}
          onCapture={(img) => {
            setSelfieOpen(false);
            submit(img);
          }}
        />
      )}
    </section>
  );
}
