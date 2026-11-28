"use client";

import { CircleAlert, Copy, Download, Loader2, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { fileSize } from "@/lib/file-size";
import type { AndroidApp } from "@/lib/mobile-app";
import { formatDate, formatTime, istDate } from "@/lib/time";
import { SettingsCard, SettingsSection } from "./section";

/**
 * Settings → Mobile app: the Android app file staff download from /app. Installed apps offer
 * each newer upload as an update. The version and checks come from the file itself.
 */
export function MobileAppSection({ app, problem }: { app: AndroidApp | null; problem: string | null }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"upload" | "remove" | null>(null);

  const [pageUrl, setPageUrl] = useState("/app");
  useEffect(() => setPageUrl(`${window.location.origin}/app`), []);

  const upload = async () => {
    setError("");
    if (!file) return setError("Choose the .apk file.");
    if (!file.name.toLowerCase().endsWith(".apk")) return setError("Choose an .apk file (Android app).");
    setBusy("upload");
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch("/api/app/android", { method: "POST", body });
      const data = (await res.json().catch(() => ({}))) as { error?: string; app?: AndroidApp };
      if (!res.ok) throw new Error(data.error || "Upload failed. Try again.");
      toast.success(`Version ${data.app?.version} is ready`, { description: "Installed apps will offer the update next time they open." });
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    setError("");
    setBusy("remove");
    try {
      const res = await fetch("/api/app/android", { method: "DELETE" });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error || "Couldn't remove it. Try again.");
      toast.success("Removed from the download page");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(pageUrl);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy. Select the link and copy it.");
    }
  };

  return (
    <SettingsSection
      title="Android app"
      description="Upload the app file built from the mobile folder. Staff download it from the link below, and phones that already have the app are offered each newer version as an update."
    >
      <SettingsCard>
        <div className="space-y-1.5">
          <p className="text-label text-ink">Download page</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-full bg-glass px-4 py-2 text-body text-ink-2 ring-1 ring-line ring-inset">{pageUrl}</code>
            <Button variant="outline" onClick={copyLink}>
              <Copy aria-hidden />
              Copy link
            </Button>
          </div>
          <p className="text-caption text-ink-3">Anyone with the link can download the app. It holds no data; it only opens this site.</p>
        </div>

        <div className="rounded-lg bg-glass px-4 py-3 ring-1 ring-line ring-inset">
          {app ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-body font-medium text-ink tabular-nums">
                    Version {app.version} <span className="font-normal text-ink-3">· build {app.versionCode}</span>
                  </p>
                  <p className="text-caption text-ink-3 tabular-nums">
                    {fileSize(app.size)} · uploaded {formatDate(istDate(new Date(app.uploadedAt)))}, {formatTime(app.uploadedAt)}
                  </p>
                  {app.serverUrl && <p className="truncate text-caption text-ink-3">Opens {new URL(app.serverUrl).origin}</p>}
                </div>
                <div className="flex gap-1">
                  <Button asChild variant="ghost">
                    <a href="/api/app/android" download>
                      <Download aria-hidden />
                      Download
                    </a>
                  </Button>
                  <Button variant="ghost" onClick={remove} disabled={!!busy} aria-busy={busy === "remove"}>
                    {busy === "remove" ? <Loader2 className="animate-spin" aria-hidden /> : <Trash2 aria-hidden />}
                    Remove
                  </Button>
                </div>
              </div>
              {problem && (
                <p role="alert" className="flex items-start gap-2 rounded-md bg-danger-subtle px-3 py-2.5 text-body text-danger">
                  <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                  <span>Staff can&apos;t use this file. {problem} Remove it, or upload a release build to replace it.</span>
                </p>
              )}
            </div>
          ) : (
            <p className="text-body text-ink-2">No app uploaded yet, so the download page says it isn&apos;t available.</p>
          )}
        </div>

        <div className="min-w-0 space-y-1.5">
          <p className="text-label text-ink">{app ? "New version (.apk)" : "App file (.apk)"}</p>
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <Button type="button" variant="outline" className="shrink-0" onClick={() => fileInput.current?.click()}>
              <Upload aria-hidden /> Choose .apk file
            </Button>
            <span className="min-w-0 truncate text-body text-ink-2">{file ? `${file.name} · ${fileSize(file.size)}` : "No file chosen"}</span>
            <input
              ref={fileInput}
              type="file"
              accept=".apk,application/vnd.android.package-archive"
              className="hidden"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setError("");
              }}
            />
          </div>
          <p className="text-caption text-ink-3">
            Build it with <code>npm run release:android</code> in the mobile folder (raise versionCode in android/app/build.gradle first). The file is
            mobile/android/app/build/outputs/apk/release/app-release.apk. The version is read from the file; test builds and builds that open
            localhost are refused.
          </p>
        </div>

        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-md bg-danger-subtle px-3 py-2.5 text-body text-danger">
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            {error}
          </p>
        )}

        <div className="flex justify-end">
          <Button onClick={upload} disabled={!!busy || !file} aria-busy={busy === "upload"}>
            {busy === "upload" ? <Loader2 className="animate-spin" aria-hidden /> : <Upload aria-hidden />}
            {busy === "upload" ? "Uploading…" : app ? "Upload new version" : "Upload app"}
          </Button>
        </div>
      </SettingsCard>
    </SettingsSection>
  );
}
