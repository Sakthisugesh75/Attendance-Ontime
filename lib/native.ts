/**
 * Talks to the native Android/iOS shell (mobile/, Capacitor) when the web app runs inside it.
 *
 * The shell injects `window.Capacitor`, so this file needs no npm packages and does nothing in a
 * normal browser: every helper falls back to the web behaviour.
 */

type PluginFn = (options?: Record<string, unknown>) => Promise<unknown>;
type ListenerHandle = { remove: () => Promise<void> | void };
type Plugin = Record<string, PluginFn> & {
  /** Returns the handle itself through window.Capacitor.Plugins, a Promise of it through registerPlugin. */
  addListener?: (event: string, cb: (data: Record<string, unknown>) => void) => ListenerHandle | Promise<ListenerHandle>;
};
type CapacitorGlobal = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  registerPlugin?: (name: string) => Plugin;
  Plugins?: Record<string, Plugin | undefined>;
};

declare global {
  interface Window {
    Capacitor?: CapacitorGlobal;
  }
}

/** True inside the Attendance Android/iOS app, false in any browser (including the installed PWA). */
export function isNativeApp(): boolean {
  return typeof window !== "undefined" && window.Capacitor?.isNativePlatform?.() === true;
}

export function nativePlatform(): "android" | "ios" | "web" {
  const p = typeof window !== "undefined" ? window.Capacitor?.getPlatform?.() : undefined;
  return p === "android" || p === "ios" ? p : "web";
}

const plugins = new Map<string, Plugin>();

/** A native plugin by name (Haptics, Share, …), or undefined in a browser. */
export function nativePlugin(name: string): Plugin | undefined {
  if (!isNativeApp()) return undefined;
  const cap = window.Capacitor!;
  if (!plugins.has(name)) {
    const p = cap.Plugins?.[name] ?? cap.registerPlugin?.(name);
    if (!p) return undefined;
    plugins.set(name, p);
  }
  return plugins.get(name);
}

/**
 * Listens to a native plugin event. Returns a function that stops listening (for effect cleanup).
 * Works whether the plugin hands back the handle or a Promise of it.
 */
export function listenNative(plugin: Plugin | undefined, event: string, cb: (data: Record<string, unknown>) => void): () => void {
  if (!plugin?.addListener) return () => {};
  const handle = Promise.resolve(plugin.addListener(event, cb));
  return () => {
    handle.then((h) => h?.remove?.()).catch(() => {});
  };
}

/** A short tap on success (punch recorded). Native haptics in the app, vibrate() in browsers. */
export function hapticTap() {
  const haptics = nativePlugin("Haptics");
  if (haptics?.impact) {
    haptics.impact({ style: "LIGHT" }).catch(() => {});
    return;
  }
  if (typeof navigator !== "undefined") navigator.vibrate?.(20);
}

function filenameFrom(res: Response, url: URL, hint?: string | null) {
  const cd = res.headers.get("content-disposition") ?? "";
  const star = cd.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  if (star?.[1]) return decodeURIComponent(star[1]);
  const plain = cd.match(/filename\s*=\s*"?([^";]+)"?/i);
  if (plain?.[1]) return plain[1];
  if (hint) return hint;
  return decodeURIComponent(url.pathname.split("/").pop() || "download");
}

function toBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * App WebViews can't download files or open PDFs. Fetches the file with the signed-in session,
 * saves it in the app's cache and opens the system share sheet ("Save to Files", Drive, WhatsApp, Excel…).
 */
export async function saveAndShareFile(href: string, filenameHint?: string | null) {
  const fs = nativePlugin("Filesystem");
  const share = nativePlugin("Share");
  if (!fs || !share) throw new Error("This needs the Attendance app.");
  const url = new URL(href, window.location.href);
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(res.status === 403 ? "You don't have access to this file." : "Couldn't get the file. Try again.");
  const name = filenameFrom(res, url, filenameHint).replace(/[\\/:*?"<>|]+/g, "-");
  const data = await toBase64(await res.blob());
  const written = (await fs.writeFile({ path: name, data, directory: "CACHE", recursive: true })) as { uri: string };
  try {
    await share.share({ title: name, files: [written.uri] });
  } catch (err) {
    // Closing the share sheet without picking anything is not an error.
    if (!/cancel/i.test(String((err as Error)?.message ?? err))) throw err;
  }
}

/** Opens an address outside the app (help pages, maps…) in the in-app system browser. */
export async function openExternal(href: string) {
  const browser = nativePlugin("Browser");
  if (browser?.open) await browser.open({ url: href });
  else window.open(href, "_blank", "noopener");
}
