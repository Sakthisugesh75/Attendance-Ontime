import { NextResponse } from "next/server";
import { androidApp } from "@/lib/mobile-app";

export const dynamic = "force-dynamic";

/**
 * The newest Android app version. Installed apps ask this at start-up and when they come back to
 * the screen, and offer the update if theirs is older (components/layout/app-update.tsx).
 * Public: it says nothing but the version.
 */
export async function GET() {
  const app = await androidApp();
  if (!app) return NextResponse.json({ available: false }, { headers: { "Cache-Control": "no-store" } });
  return NextResponse.json(
    { available: true, version: app.version, versionCode: app.versionCode, size: app.size, downloadUrl: "/api/app/android" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
