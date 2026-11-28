// Puts a built APK where the web app serves it (storage/app/), for a server running on this PC.
// `npm run release:android` runs this for you. For a remote server (AWS etc.) upload the file in
// Settings → Mobile app instead.
//
//   npm run publish:apk                     the release build (android/app/build/outputs/apk/release)
//   npm run publish:apk -- path/to/app.apk  a specific file
//
// The server reads the version from the file itself and checks it (test builds and builds that
// open localhost are hidden from staff, with the reason shown in Settings → Mobile app).
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const mobile = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const storage = path.join(mobile, "..", "storage", "app");

const candidates = [
  "android/app/build/outputs/apk/release/app-release.apk", // npm run release:android / gradlew assembleRelease
  "android/app/release/app-release.apk", // Android Studio → Generate Signed APK
].map((p) => path.join(mobile, p));

const given = process.argv[2] ? path.resolve(process.argv[2]) : null;
const found = given ? [given] : candidates.filter((p) => existsSync(p)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
const apk = found[0];
if (!apk || !existsSync(apk)) {
  console.error("No release APK found. Run npm run release:android (or pass the file's path).");
  process.exit(1);
}

const buf = readFileSync(apk);
if (buf.subarray(0, 4).toString("binary") !== "PK\x03\x04") {
  console.error(`${apk} isn't an APK.`);
  process.exit(1);
}
if (/debug/i.test(path.basename(apk))) {
  console.error("That's a test (debug) build; staff can't use it. Run npm run release:android.");
  process.exit(1);
}

mkdirSync(storage, { recursive: true });
copyFileSync(apk, path.join(storage, "attendance.apk"));
// Only the time: the server reads the version and runs its checks on first use.
writeFileSync(path.join(storage, "attendance.json"), JSON.stringify({ uploadedAt: new Date().toISOString() }, null, 2));
console.log(`Published ${path.relative(mobile, apk)} (${(buf.length / 1024 / 1024).toFixed(1)} MB). Check it in Settings → Mobile app.`);
