import type { CapacitorConfig } from "@capacitor/cli";

/**
 * The native app is a shell around the deployed web app: every screen, login and permission
 * check stays on the server, so a web deploy updates the app without a store release.
 *
 *   SERVER_URL  https address of the deployed app (same as APP_URL in the web .env)
 *
 * The app id (com.attendancedesk.app) is baked into android/ and ios/; see README "App id" to change it.
 *
 * Set it in mobile/.env (see .env.example) or the shell, then run `npm run sync`.
 */
import { readFileSync } from "node:fs";

function loadEnv() {
  try {
    for (const line of readFileSync(new URL("./.env", import.meta.url), "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/);
      if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2];
    }
  } catch {
    /* no .env: fall back to the shell */
  }
}
loadEnv();

const serverUrl = (process.env.SERVER_URL ?? "https://attendance.example.com").replace(/\/$/, "");
const isHttp = serverUrl.startsWith("http://");

const config: CapacitorConfig = {
  appId: "com.attendancedesk.app",
  appName: "Attendance",
  // Local files: only the "can't reach the server" page. Everything else loads from serverUrl.
  webDir: "www",
  server: {
    url: `${serverUrl}/dashboard`,
    // Plain http is only for testing on the office network; staff builds must use https
    // (phones refuse location and camera otherwise).
    cleartext: isHttp,
    errorPath: "offline.html",
    // Links to these hosts stay inside the app; any other host opens in the system browser.
    allowNavigation: [new URL(serverUrl).host],
  },
  // Lets the server and the web code tell the app apart from a browser.
  appendUserAgent: "AttendanceDeskApp",
  backgroundColor: "#F5ECD6",
  android: {
    allowMixedContent: false,
  },
  ios: {
    contentInset: "never",
  },
  plugins: {
    SplashScreen: {
      // The web app hides the splash as soon as the first screen has painted; this is the cap.
      launchShowDuration: 4000,
      launchAutoHide: true,
      backgroundColor: "#F5ECD6",
      showSpinner: false,
    },
    StatusBar: {
      overlaysWebView: true,
    },
  },
};

export default config;
