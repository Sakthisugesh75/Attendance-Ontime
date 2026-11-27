"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Keeps a page's server data fresh without a reload: re-fetches every `seconds` while the tab
 * is visible, and straight away when the person comes back to the tab. New, withdrawn and
 * decided items appear (or leave) on their own. It waits while someone is typing or has a
 * dialog, sheet or menu open, so nothing they are working on moves under them.
 */
export function LiveRefresh({ seconds = 20 }: { seconds?: number }) {
  const router = useRouter();

  useEffect(() => {
    const busy = () => {
      const el = document.activeElement as HTMLElement | null;
      const typing = !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
      const overlay = !!document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"], [role="listbox"]');
      return typing || overlay;
    };
    const refresh = () => {
      if (document.visibilityState === "visible" && navigator.onLine && !busy()) router.refresh();
    };
    const timer = window.setInterval(refresh, seconds * 1000);
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", refresh);
    };
  }, [router, seconds]);

  return null;
}
