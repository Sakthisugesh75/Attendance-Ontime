import { ArrowLeft, Download, Smartphone } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { fileSize } from "@/lib/file-size";
import { androidApp } from "@/lib/mobile-app";
import { formatDate, istDate } from "@/lib/time";

export const metadata = { title: "Get the app" };
export const dynamic = "force-dynamic";

/**
 * Public download page (open to everyone, signed in or not): the Android app file, how to
 * install it, and the iPhone fallback. Share the link /app with staff.
 */
export default async function GetAppPage() {
  const app = await androidApp();
  const ua = (await headers()).get("user-agent") ?? "";
  const iPhone = /iPhone|iPad|iPod/i.test(ua);

  return (
    <div className="space-y-6">
      <div className="space-y-1.5 text-center">
        <h1 className="text-[30px] leading-9 font-medium tracking-[-0.02em] text-ink">Get the app</h1>
        <p className="text-body text-ink-3">Punch in faster, get a reminder when you reach the office, and see your attendance.</p>
      </div>

      <section aria-labelledby="android-title" className="space-y-4">
        <h2 id="android-title" className="flex items-center gap-2 text-title-3 text-ink">
          <Smartphone aria-hidden className="size-[18px] text-ink-3" />
          Android
        </h2>
        {app ? (
          <>
            <Button asChild size="lg" variant={iPhone ? "outline" : "default"} className="h-[52px] w-full text-[15px]">
              <a href="/api/app/android" download>
                <Download aria-hidden />
                Download for Android
              </a>
            </Button>
            <p className="text-center text-caption text-ink-3 tabular-nums">
              Version {app.version} · {fileSize(app.size)} · updated {formatDate(istDate(new Date(app.uploadedAt)))}
            </p>
            <ol className="list-decimal space-y-1.5 pl-5 text-body text-ink-2 marker:text-ink-3 marker:tabular-nums">
              <li>Tap <span className="font-medium text-ink">Download for Android</span>, then open the file.</li>
              <li>If the phone asks, allow <span className="font-medium text-ink">Install unknown apps</span> for your browser. This is normal for apps that don&apos;t come from the Play Store.</li>
              <li>Open <span className="font-medium text-ink">Attendance</span> and sign in with your usual details.</li>
            </ol>
            <p className="text-caption text-ink-3">To update later, download again and install over the old app. You stay signed in.</p>
          </>
        ) : (
          <p className="rounded-lg bg-glass px-4 py-3 text-body text-ink-2 ring-1 ring-line ring-inset">The Android app isn&apos;t available yet. Ask HR, or use this site in your browser for now.</p>
        )}
      </section>

      <section aria-labelledby="iphone-title" className="space-y-2 border-t border-line pt-5">
        <h2 id="iphone-title" className="flex items-center gap-2 text-title-3 text-ink">
          <Smartphone aria-hidden className="size-[18px] text-ink-3" />
          iPhone
        </h2>
        <p className="text-body text-ink-2">
          Open this site in <span className="font-medium text-ink">Safari</span>, tap <span className="font-medium text-ink">Share</span>, then{" "}
          <span className="font-medium text-ink">Add to Home Screen</span>. The iPhone app will come through the App Store.
        </p>
      </section>

      <Button asChild variant="ghost" className="w-full">
        <Link href="/login">
          <ArrowLeft aria-hidden />
          Back to sign in
        </Link>
      </Button>
    </div>
  );
}
