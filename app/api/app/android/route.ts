import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { writeAudit } from "@/lib/audit";
import { androidApp, ApkError, apkFileName, APK_PATH, MAX_APK_BYTES, removeAndroidApp, saveAndroidApp } from "@/lib/mobile-app";
import { routeUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET: downloads the Android app. Public on purpose: new staff install it before they can sign
 * in, installed apps download updates from here, and it holds no data (it only opens this site).
 */
export async function GET() {
  const app = await androidApp();
  if (!app) return NextResponse.json({ error: "The Android app hasn't been uploaded yet. Ask HR." }, { status: 404 });
  const stream = Readable.toWeb(createReadStream(APK_PATH)) as ReadableStream<Uint8Array>;
  return new NextResponse(stream, {
    headers: {
      "Content-Type": "application/vnd.android.package-archive",
      "Content-Disposition": `attachment; filename="${apkFileName(app.version)}"`,
      "Content-Length": String(app.size),
      // Always the newest upload; the file name carries the version.
      "Cache-Control": "no-cache",
      ETag: `"${app.sha256}"`,
    },
  });
}

async function manager() {
  const res = await routeUser("settings.manage");
  if ("status" in res) return { error: NextResponse.json({ error: res.status === 401 ? "Sign in first." : "Only people who manage settings can change the app." }, { status: res.status }) };
  return { user: res.user };
}

/**
 * POST (Settings → Mobile app): replaces the app file. Form field: file (.apk).
 * The version, and whether it's a real staff build, are read from the file itself.
 */
export async function POST(req: NextRequest) {
  const m = await manager();
  if (m.error) return m.error;
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Choose the .apk file." }, { status: 400 });
    if (file.size > MAX_APK_BYTES) return NextResponse.json({ error: "The app file is larger than 200 MB." }, { status: 400 });

    const before = await androidApp();
    const saved = await saveAndroidApp(Buffer.from(await file.arrayBuffer()));
    await writeAudit({
      actorId: m.user.id,
      action: "APP_UPLOAD",
      entity: "MobileApp",
      entityId: "android",
      before: before ? { version: before.version, versionCode: before.versionCode } : null,
      after: { version: saved.version, versionCode: saved.versionCode, size: saved.size, opens: saved.serverUrl, sha256: saved.sha256 },
    });
    revalidatePath("/app");
    revalidatePath("/settings");
    return NextResponse.json({ ok: true, app: saved });
  } catch (err) {
    if (err instanceof ApkError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error("apk upload failed", err);
    return NextResponse.json({ error: "Couldn't save the app file. Check the server log." }, { status: 500 });
  }
}

/** DELETE (Settings → Mobile app): takes the app off the download page. */
export async function DELETE() {
  const m = await manager();
  if (m.error) return m.error;
  const before = await androidApp();
  await removeAndroidApp();
  await writeAudit({ actorId: m.user.id, action: "APP_REMOVE", entity: "MobileApp", entityId: "android", before: before ? { version: before.version, versionCode: before.versionCode } : null, after: null });
  revalidatePath("/app");
  revalidatePath("/settings");
  return NextResponse.json({ ok: true });
}
