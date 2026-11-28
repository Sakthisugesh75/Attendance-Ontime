"use client";

import { Download, Smartphone, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { isNativeApp } from "@/lib/native";

const DISMISS_KEY = "get-app-banner-dismissed";

/**
 * "Get the Android app" on the dashboard, only for Android phone browsers (not inside the app,
 * not on desktops or iPhones) and only until it's dismissed. The server renders it only when an
 * app file has been uploaded.
 */
export function GetAppBanner({ version }: { version: string }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const android = /Android/i.test(navigator.userAgent);
    const dismissed = localStorage.getItem(DISMISS_KEY) === version;
    setShow(android && !isNativeApp() && !dismissed);
  }, [version]);

  if (!show) return null;

  const dismiss = () => {
    // Remembered per version, so a new release is offered again.
    localStorage.setItem(DISMISS_KEY, version);
    setShow(false);
  };

  return (
    <section aria-labelledby="get-app-title" className="rise flex items-center gap-3 rounded-xl bg-surface p-4 shadow-card sm:gap-4 sm:p-5">
      <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-glass text-ink-2 ring-1 ring-line ring-inset">
        <Smartphone className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <h3 id="get-app-title" className="text-title-3 text-ink">
          Get the Android app
        </h3>
        <p className="text-m-caption text-ink-2">Punch in faster and get a reminder when you reach the office.</p>
      </div>
      <Button asChild variant="outline" className="shrink-0">
        <a href="/app">
          <Download aria-hidden />
          Get it
        </a>
      </Button>
      <Button variant="ghost" size="icon" className="-mr-1 size-11 shrink-0 rounded-full" onClick={dismiss} aria-label="Hide this">
        <X aria-hidden />
      </Button>
    </section>
  );
}
