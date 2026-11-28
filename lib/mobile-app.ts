import "server-only";
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { ApkReadError, apkProblem, readApk } from "@/lib/apk-info";

/**
 * The Android app file (built from mobile/) that staff download from /app, and that installed
 * apps check for updates (/api/app/android/latest).
 * Kept in storage/app/ so it survives deploys (storage is a volume on the server, and is left
 * out of the deploy bundle). Uploaded in Settings → Mobile app, or copied in by
 * `npm run release:android` / `npm run publish:apk` in mobile/ when the server runs on this PC.
 */
const DIR = path.join(process.cwd(), "storage", "app");
export const APK_PATH = path.join(DIR, "attendance.apk");
const META_PATH = path.join(DIR, "attendance.json");

export const MAX_APK_BYTES = 200 * 1024 * 1024;

export type AndroidApp = {
  /** versionName, shown to people (e.g. 1.0.3) */
  version: string;
  /** versionCode, what phones compare to decide whether to update */
  versionCode: number;
  size: number;
  uploadedAt: string;
  sha256: string;
  /** The address the app opens */
  serverUrl: string | null;
  /** Why staff can't use this file (test build, opens localhost…), or null */
  problem: string | null;
};

export class ApkError extends Error {}

/**
 * The current app file. Files staff can't use (uploaded before uploads were checked) are hidden
 * unless includeBroken is set (Settings shows them with the reason).
 */
export async function androidApp({ includeBroken = false }: { includeBroken?: boolean } = {}): Promise<AndroidApp | null> {
  const app = await readStoredApp();
  return app && (includeBroken || !app.problem) ? app : null;
}

async function readStoredApp(): Promise<AndroidApp | null> {
  let info;
  try {
    info = await stat(APK_PATH);
  } catch {
    return null;
  }
  const meta = await readFile(META_PATH, "utf8")
    .then((t) => JSON.parse(t) as Partial<AndroidApp>)
    .catch(() => ({}) as Partial<AndroidApp>);
  if (meta.versionCode && meta.sha256 && meta.problem !== undefined) {
    return { version: meta.version || String(meta.versionCode), versionCode: meta.versionCode, size: info.size, uploadedAt: meta.uploadedAt || info.mtime.toISOString(), sha256: meta.sha256, serverUrl: meta.serverUrl ?? null, problem: meta.problem };
  }
  // Uploaded before versions were read from the file: read it once and remember.
  try {
    const buf = await readFile(APK_PATH);
    const apk = readApk(buf);
    const fixed: AndroidApp = {
      version: apk.versionName,
      versionCode: apk.versionCode,
      size: buf.length,
      uploadedAt: meta.uploadedAt || info.mtime.toISOString(),
      sha256: createHash("sha256").update(buf).digest("hex"),
      serverUrl: apk.serverUrl,
      problem: apkProblem(apk),
    };
    await writeFile(META_PATH, JSON.stringify(fixed, null, 2)).catch(() => {});
    return fixed;
  } catch {
    return null;
  }
}

/**
 * Replaces the app file after checking it. The version comes from the file itself, so phones
 * never get offered an "update" that is really the same version. Written to a temp file first,
 * so a download in progress never gets half a file.
 */
export async function saveAndroidApp(buf: Buffer): Promise<AndroidApp> {
  if (buf.length > MAX_APK_BYTES) throw new ApkError("The app file is larger than 200 MB.");
  let apk;
  try {
    apk = readApk(buf);
  } catch (err) {
    throw new ApkError(err instanceof ApkReadError ? err.message : "That isn't an Android app file (.apk).");
  }
  const problem = apkProblem(apk);
  if (problem) throw new ApkError(problem);
  const current = await androidApp();
  // (A broken earlier upload doesn't count: it can always be replaced.)
  if (current && apk.versionCode < current.versionCode) {
    throw new ApkError(`This is version ${apk.versionName} (build ${apk.versionCode}), older than the current ${current.version} (build ${current.versionCode}). Phones can't install an older version over a newer one.`);
  }

  await mkdir(DIR, { recursive: true });
  const tmp = `${APK_PATH}.uploading`;
  await writeFile(tmp, buf);
  await rename(tmp, APK_PATH);
  const meta: AndroidApp = {
    version: apk.versionName,
    versionCode: apk.versionCode,
    size: buf.length,
    uploadedAt: new Date().toISOString(),
    sha256: createHash("sha256").update(buf).digest("hex"),
    serverUrl: apk.serverUrl,
    problem: null,
  };
  await writeFile(META_PATH, JSON.stringify(meta, null, 2));
  return meta;
}

/** Takes the app file off the download page. */
export async function removeAndroidApp() {
  await unlink(APK_PATH).catch(() => {});
  await unlink(META_PATH).catch(() => {});
}

/** File name the phone saves, e.g. Attendance-1.0.2.apk */
export const apkFileName = (version: string) => `Attendance-${version.replace(/[^0-9A-Za-z.\-]+/g, "-")}.apk`;
