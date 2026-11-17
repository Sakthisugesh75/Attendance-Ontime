"use client";

import { Download, Share } from "lucide-react";
import { useEffect, useState } from "react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

/** Chrome / Edge / Samsung Internet hand this over when the site can be installed. */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let saved: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== "undefined") {
  // Captured once for the whole page life, so the menu can offer it whenever it's opened.
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    saved = e as InstallPromptEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener("appinstalled", () => {
    saved = null;
    listeners.forEach((l) => l());
  });
}

const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);

/**
 * "Install app" in the account menu (PWA): shown only when this browser can install the app and it
 * isn't installed yet. iPhone Safari has no install prompt, so it explains Share → Add to Home Screen.
 */
export function InstallAppItem() {
  const [mode, setMode] = useState<"prompt" | "ios" | null>(null);
  const [iosHelp, setIosHelp] = useState(false);

  useEffect(() => {
    const update = () => setMode(isStandalone() ? null : saved ? "prompt" : isIos() ? "ios" : null);
    update();
    listeners.add(update);
    return () => void listeners.delete(update);
  }, []);

  if (!mode) return null;
  if (mode === "ios") {
    return (
      <DropdownMenuItem
        onSelect={(e) => {
          e.preventDefault();
          setIosHelp((v) => !v);
        }}
        className="flex-col items-start gap-1"
      >
        <span className="flex items-center gap-2">
          <Share /> Install app
        </span>
        {iosHelp && <span className="text-caption text-ink-3">In Safari tap Share, then &ldquo;Add to Home Screen&rdquo;.</span>}
      </DropdownMenuItem>
    );
  }
  return (
    <DropdownMenuItem
      onSelect={async () => {
        const event = saved;
        if (!event) return;
        await event.prompt();
        const { outcome } = await event.userChoice;
        if (outcome === "accepted") {
          saved = null;
          listeners.forEach((l) => l());
        }
      }}
    >
      <Download /> Install app
    </DropdownMenuItem>
  );
}
