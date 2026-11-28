"use client";

import { useEffect } from "react";
import { isNativeApp } from "@/lib/native";

/** Registers /sw.js in production so the site opens offline in browsers. Skipped inside the native app. */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator) || isNativeApp()) return;
    navigator.serviceWorker.register("/sw.js").catch((err) => console.warn("Service worker registration failed", err));
  }, []);
  return null;
}
