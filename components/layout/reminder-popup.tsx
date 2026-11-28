"use client";

import { BellRing, Clock3, Megaphone, NotebookPen, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { dismissPopup, openPopup, pendingPopups, type PendingPopups } from "@/lib/actions/popups";
import { formatDate } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Fired by the punch card after a punch, so the report nudge can show straight after punch-out. */
export const PUNCH_EVENT = "attendance:punched";

const POLL_MS = 2 * 60_000;
const SNOOZE_MIN = 30;
/** The built-in report nudge has no notification row; its snooze lives in this browser. */
const reportKey = (date: string) => `report-reminder:${date}`;

type Item =
  | { kind: "notice"; id: number; title: string; body: string; link: string | null; when: string }
  | { kind: "report"; date: string; punchedOut: boolean };

function reportMuted(date: string) {
  try {
    const v = localStorage.getItem(reportKey(date));
    return v === "off" || (!!v && Number(v) > Date.now());
  } catch {
    return false;
  }
}
function muteReport(date: string, until: number | "off") {
  try {
    localStorage.setItem(reportKey(date), String(until));
  } catch {
    // Private mode: it simply shows again on the next check.
  }
}

/**
 * Reminders as a pop-up card, wherever the person is in the app: reminders sent by HR or the
 * evening job, plus a built-in nudge to send today's report once the workday is over.
 * Checks every two minutes, when the tab comes back into view, after a punch and on navigation.
 */
export function ReminderPopup() {
  const router = useRouter();
  const pathname = usePathname();
  const [items, setItems] = useState<Item[]>([]);
  const [busy, start] = useTransition();
  const primary = useRef<HTMLButtonElement>(null);


  const check = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    let data: PendingPopups;
    try {
      data = await pendingPopups();
    } catch {
      return; // offline or signed out: try again on the next tick
    }
    const next: Item[] = data.notices.map((n) => ({ kind: "notice" as const, ...n }));
    const reportNoticePending = data.notices.some((n) => n.link?.startsWith("/daily-reports"));
    if (data.report && !reportNoticePending && !reportMuted(data.report.date)) next.push({ kind: "report", ...data.report });
    setItems(next);
  }, []);

  useEffect(() => {
    check();
    const id = setInterval(check, POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && check();
    const onPunch = () => setTimeout(check, 800);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(PUNCH_EVENT, onPunch);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(PUNCH_EVENT, onPunch);
    };
  }, [check]);
  useEffect(() => {
    check();
  }, [pathname, check]);

  const item = items[0];
  // Never interrupt the page the pop-up points to (they're already there), or a password change.
  const target = item?.kind === "report" ? "/daily-reports" : item?.link?.split("?")[0];
  const quiet = pathname.startsWith("/change-password") || (!!target && pathname.startsWith(target));
  const open = !!item && !quiet;
  const drop = () => setItems((list) => list.slice(1));

  const act = (what: "open" | "later" | "dismiss") => {
    if (!item) return;
    drop();
    start(async () => {
      if (item.kind === "report") {
        if (what === "later") muteReport(item.date, Date.now() + SNOOZE_MIN * 60_000);
        if (what === "dismiss") muteReport(item.date, "off");
        if (what === "open") router.push("/daily-reports?view=mine");
        return;
      }
      if (what === "open") {
        await openPopup(item.id);
        if (item.link) router.push(item.link);
      } else {
        await dismissPopup(item.id, what === "later" ? SNOOZE_MIN : undefined);
      }
    });
  };

  const view =
    item?.kind === "report"
      ? {
          icon: NotebookPen,
          eyebrow: `Daily report · ${formatDate(item.date)}`,
          title: "Send today's report",
          body: item.punchedOut
            ? "You've punched out. Before you go, note what you worked on, tomorrow's plan and anything blocking you. It takes a minute."
            : "Your shift is over. Note what you worked on, tomorrow's plan and anything blocking you. It takes a minute.",
          cta: "Write report now",
        }
      : item?.link?.startsWith("/announcements")
        ? {
            icon: Megaphone,
            eyebrow: `${item.title.startsWith("Updated:") ? "Announcement updated" : "New announcement"} · ${item.when}`,
            title: item.title.replace(/^(📣\s*|Updated:\s*)/u, ""),
            body: item.body,
            cta: "Read announcement",
          }
        : item
          ? {
              icon: item.link?.startsWith("/daily-reports") ? NotebookPen : BellRing,
              eyebrow: `Reminder · ${item.when}`,
              title: item.title,
              body: item.body,
              cta: item.link?.startsWith("/daily-reports") ? "Write report now" : item.link ? "Open" : "Got it",
            }
          : null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && act("dismiss")}>
      {view && (
        <DialogContent
          showCloseButton={false}
          // Focus the main action (Enter = do it), not the close button.
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            primary.current?.focus();
          }}
          className={cn(
            "gap-0 overflow-hidden rounded-xl border-line bg-raised p-0 shadow-lg sm:max-w-[440px]",
            // Phones: a card anchored to the bottom, within thumb reach, clear of the home indicator.
            "max-sm:top-auto max-sm:bottom-[max(1rem,var(--inset-bottom))] max-sm:translate-y-0",
          )}
        >
          <div className="relative px-6 pt-6">
            <button
              type="button"
              onClick={() => act("dismiss")}
              aria-label="Dismiss reminder"
              className="absolute top-3 right-3 grid size-11 place-items-center rounded-md text-ink-3 transition-colors duration-[120ms] outline-none hover:bg-sunken hover:text-ink focus-visible:ring-2 focus-visible:ring-brand md:size-9"
            >
              <X className="size-4" />
            </button>
            <span aria-hidden className="relative grid size-12 place-items-center rounded-full bg-sunken text-ink-2">
              <view.icon className="size-6 origin-top animate-[ring_1.6s_ease-in-out_2]" />
              <span className="absolute top-0 right-0 size-3 rounded-full bg-danger ring-2 ring-raised" />
            </span>
            <p className="mt-4 text-caption text-ink-3 tabular-nums">{view.eyebrow}</p>
            <DialogTitle className="mt-1 pr-8 text-title-3 text-ink">{view.title}</DialogTitle>
          </div>

          <div className="px-6 pt-2 pb-6">
            <DialogDescription className="text-body whitespace-pre-line text-ink-2">{view.body}</DialogDescription>
            <div className="mt-6 flex flex-col gap-2">
              <Button ref={primary} type="button" size="lg" disabled={busy} aria-busy={busy} onClick={() => act("open")} className="w-full md:h-11">
                {view.cta}
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" disabled={busy} onClick={() => act("later")} className="h-11">
                  <Clock3 /> In {SNOOZE_MIN} min
                </Button>
                <Button type="button" variant="ghost" disabled={busy} onClick={() => act("dismiss")} className="h-11">
                  Dismiss
                </Button>
              </div>
            </div>
            {items.length > 1 && <p className="mt-4 text-center text-caption text-ink-3 tabular-nums">{items.length - 1} more reminder{items.length > 2 ? "s" : ""} after this</p>}
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
