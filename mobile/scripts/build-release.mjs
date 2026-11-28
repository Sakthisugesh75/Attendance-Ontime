// Builds the signed Android app for staff and publishes it to the website's download page (/app).
//
//   npm run release:android
//
// Needs: SERVER_URL in mobile/.env set to the public https address, the signing key in
// Attendance-private/android-signing (created once), and JDK 21 (Android Studio's own Java 25 is too
// new for this Gradle). Raise versionCode / versionName in android/app/build.gradle for each update.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const mobile = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: "inherit", cwd: mobile, shell: process.platform === "win32", ...opts });
const fail = (msg) => {
  console.error(`\n✖  ${msg}\n`);
  process.exit(1);
};

// 1. The address staff phones will open.
const env = existsSync(path.join(mobile, ".env")) ? readFileSync(path.join(mobile, ".env"), "utf8") : "";
const url = (process.env.SERVER_URL ?? env.match(/^\s*SERVER_URL\s*=\s*"?([^"\r\n]*)"?/m)?.[1] ?? "").replace(/\/$/, "");
if (!/^https:\/\/[^/]+/.test(url) || /example\.com|trycloudflare\.com|localhost/.test(url)) {
  fail(`SERVER_URL in mobile/.env is "${url || "(empty)"}". Set it to your fixed public https address (not localhost, example.com or a trycloudflare.com quick tunnel).`);
}

// 2. The signing key.
const signing = process.env.ATTENDANCE_SIGNING ?? path.resolve(mobile, "..", "..", "Attendance-private", "android-signing", "signing.properties");
if (!existsSync(signing)) fail(`No signing key at ${signing}. Ask for it to be created, or set ATTENDANCE_SIGNING.`);

// 3. Java 21 for Gradle.
function findJdk21() {
  if (process.env.JAVA_HOME && /21/.test(process.env.JAVA_HOME)) return process.env.JAVA_HOME;
  const jdks = path.join(os.homedir(), ".jdks");
  const hit = existsSync(jdks) && readdirSync(jdks).find((d) => /^jdk-21|temurin-21|21\./.test(d));
  return hit ? path.join(jdks, hit) : null;
}
const javaHome = findJdk21();
if (!javaHome) fail("JDK 21 not found in ~/.jdks. Install Temurin 21 there (Android Studio can download it: Settings → Build Tools → Gradle → Gradle JDK).");
const androidHome = process.env.ANDROID_HOME ?? path.join(process.env.LOCALAPPDATA ?? "", "Android", "Sdk");

const gradle = readFileSync(path.join(mobile, "android", "app", "build.gradle"), "utf8");
const version = gradle.match(/versionName\s+"([^"]+)"/)?.[1] ?? "1.0";
console.log(`\nBuilding Attendance ${version} for ${url} …\n`);

run("node", ["scripts/write-server-url.mjs"], { env: { ...process.env, SERVER_URL: url } });
run("npx", ["cap", "sync", "android"], { env: { ...process.env, SERVER_URL: url } });
run(process.platform === "win32" ? "gradlew.bat" : "./gradlew", ["assembleRelease", "--console=plain"], {
  cwd: path.join(mobile, "android"),
  env: { ...process.env, JAVA_HOME: javaHome, ANDROID_HOME: androidHome, ATTENDANCE_SIGNING: signing },
});

const apk = path.join(mobile, "android", "app", "build", "outputs", "apk", "release", "app-release.apk");
if (!existsSync(apk)) fail("The build finished but app-release.apk is missing. Check the Gradle output above.");
run("node", ["scripts/publish-apk.mjs", apk]);
console.log(`\n✔  Done. Staff download it from ${url}/app (also uploadable in Settings → Mobile app on another server).\n`);
