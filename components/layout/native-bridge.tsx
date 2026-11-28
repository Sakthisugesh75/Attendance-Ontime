"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { isNativeApp, listenNative, nativePlugin, openExternal, saveAndShareFile } from "@/lib/native";

/**
 * Native glue for the Android/iOS app (mobile/). Renders nothing and does nothing in a browser.
 *  - Downloads (`<a download>`) and new-tab links to our own files go to the share sheet,
 *    because app WebViews can't download or show PDFs. Other sites open in the system browser.
 *  - Android back button: closes an open dialog or sheet first, then goes back, then leaves the app.
 *  - Status bar text follows the light/dark theme; the splash hides once the first screen is up.
 *  - The PWA service worker is not used inside the app (the app has its own offline page).
 */
export function NativeBridge() {
  useEffect(() => {
    if (!isNativeApp()) return;
    const cleanups: Array<() => void> = [];

    nativePlugin("SplashScreen")?.hide?.().catch(() => {});

    navigator.serviceWorker?.getRegistrations().then((regs) => regs.forEach((r) => r.unregister())).catch(() => {});

    // Links: download → share sheet; other sites → system browser.
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a) return;
      const url = new URL(a.href, window.location.href);
      if (url.protocol === "mailto:" || url.protocol === "tel:") return;
      const sameOrigin = url.origin === window.location.origin;
      if (!sameOrigin) {
        e.preventDefault();
        openExternal(url.href);
        return;
      }
      if (a.hasAttribute("download") || a.target === "_blank") {
        e.preventDefault();
        const id = toast.loading("Getting the file…");
        saveAndShareFile(url.href, a.getAttribute("download") || null)
          .then(() => toast.dismiss(id))
          .catch((err: Error) => toast.error(err.message || "Couldn't get the file. Try again.", { id }));
      }
    };
    document.addEventListener("click", onClick, true);
    cleanups.push(() => document.removeEventListener("click", onClick, true));

    // Android back button.
    const app = nativePlugin("App");
    cleanups.push(
      listenNative(app, "backButton", (data) => {
        const open = document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"]');
        if (open) {
          (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        } else if (data.canGoBack) {
          window.history.back();
        } else {
          app?.exitApp?.().catch(() => {});
        }
      }),
    );

    // Status bar icons: dark on the light canvas, light on the dark canvas.
    const statusBar = nativePlugin("StatusBar");
    const syncBar = () => {
      const dark = document.documentElement.classList.contains("dark");
      statusBar?.setStyle?.({ style: dark ? "DARK" : "LIGHT" }).catch(() => {});
    };
    syncBar();
    const themeWatch = new MutationObserver(syncBar);
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    cleanups.push(() => themeWatch.disconnect());

    return () => cleanups.forEach((fn) => fn());
  }, []);

  return null;
}
