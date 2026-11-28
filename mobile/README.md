# Attendance mobile app (Android + iOS)

A native app built with [Capacitor 8](https://capacitorjs.com). It loads the deployed web app
(`SERVER_URL`) in a native WebView and adds what a browser tab can't do well:

| | How |
|---|---|
| Punch location | Native location permission; the web app's `navigator.geolocation` works unchanged |
| Punch selfie | Native camera permission; the web app's camera dialog works unchanged |
| Downloads (reports, exports, backups, selfies, receipts) | Saved and handed to the share sheet (Save to Files, Drive, Excel…) by `components/layout/native-bridge.tsx` |
| Haptic tick on punch | `@capacitor/haptics` (iPhones have no `navigator.vibrate`) |
| Android back button | Closes an open dialog, then goes back, then leaves the app |
| Splash, icons, status bar | Generated from the web icon; status bar follows light/dark theme |
| **Arrival reminder** | Native geofence: "You're at the office. Tap to punch in." (see below) |
| No connection | Local "Can't reach Attendance" page (`www/offline.html`) that retries when back online |

Screens, logins and data all stay on the server, so **a web deploy updates the app too**. You only need a new
store release when you change something in `mobile/` (permissions, icons, plugins, `SERVER_URL`).

Web code can check `isNativeApp()` from `lib/native.ts`. The app also adds `AttendanceDeskApp` to its user agent.

## One-time setup

```bash
cd mobile
cp .env.example .env      # set SERVER_URL (https)
npm install
npm run sync
```

The server must be on **https**. Location and camera are refused on plain http. For a quick test on the office network,
`SERVER_URL="http://192.168.x.x:6001"` works on Android (cleartext is switched on automatically for http).

## Arrival reminder (one-tap punch-in)

When HR has set the office location (Settings → Punching → geofence), employees see an **Arrival reminder** card on the
dashboard in the app. When they switch it on:

1. The phone asks for location, then **Allow all the time**, then notifications.
2. The OS watches the office area (the radius from settings, at least 100 m), even when the app is closed. The app tracks
   nothing else and sends nothing to the server until the employee taps.
3. On arrival, the notification *You're at the office. Tap to punch in.* appears. It shows at most once every 3 hours,
   and never after that day's punch-in.
4. Tapping it opens the app, which takes a fresh GPS reading and punches in. The server re-checks the distance (with no
   WFH bypass), skips the selfie even when HR requires one, and saves the punch with source **Arrival notification**.
   HR sees this in the muster day sheet and the audit log. A tap older than 30 minutes is ignored.
5. Punch-out stays manual.

| Part | Where |
|---|---|
| Card and punch call | `components/attendance/arrival-punch.tsx` |
| Server rules | `lib/actions/punch.ts` (`via: "arrival"`), source `ARRIVAL` |
| Android | `android/app/src/main/java/com/attendancedesk/arrival/` (Play Services geofence, re-armed after reboot) |
| iOS | `ios/App/App/OfficeArrival*.swift` and `MainViewController.swift` (region monitoring) |

Limits:
- Android battery savers (Xiaomi, Oppo, Vivo, Samsung "deep sleep") can delay or block geofence alerts. Staff may need
  to set the app's battery use to *Unrestricted*.
- Alerts can arrive 1 to 3 minutes after the employee reaches the office, and location services must be on.
- **Play Store:** background location needs the *Location permissions* declaration in Play Console, with a short video
  that shows the reminder being switched on and the notification. Describe it as "Notifies employees when they arrive
  at their workplace so they can record attendance."
- **App Store:** the "Always" location wording is in `Info.plist`. Mention the arrival reminder in the review notes.

## Android

You need [Android Studio](https://developer.android.com/studio), which brings the JDK and SDK.

```bash
npm run android           # syncs, then opens Android Studio → Run ▶ on a phone or emulator
```

- **APK to share directly:** Android Studio → Build → Generate Signed App Bundle / APK → APK. Keep the keystore and
  its passwords safe: every later version must be signed with the same key, or phones refuse to update.
- **Let staff download it from the website:** upload the APK in **Settings → Mobile app** (any server), or run
  `npm run publish:apk` here when the server runs on this PC. It is stored in `storage/app/` and served at
  `/api/app/android`. Staff open **`/app`** (linked from the sign-in page and from a banner on Android phones),
  tap *Download for Android* and install it. To release an update, raise `versionCode` / `versionName` in
  `android/app/build.gradle`, build, and upload again.
- **Play Store:** the same menu → Android App Bundle (.aab), then upload it in Play Console. You also need a
  privacy policy URL, because the app uses location and camera.

## iOS

This needs a Mac with Xcode 16+ and an Apple Developer account ($99/year). The project uses Swift Package Manager, so CocoaPods isn't needed.

```bash
npm run ios               # syncs, then opens Xcode → pick your team under Signing → Run
```

- **TestFlight / App Store:** Product → Archive → Distribute App.
- **Building without a Mac:** use a cloud Mac build, such as [Ionic Appflow](https://ionic.io/appflow) or
  [Codemagic](https://codemagic.io) (it has a Capacitor template).
- Apple review: a login is required, so give the reviewer a demo employee account. Apple sometimes rejects apps that are
  "just a website". The native permissions, offline page, haptics and share sheet help, and push notifications
  (below) help most.

## Updates

- **Website changes reach every phone straight away.** Screens, features and fixes come from the server, so deploying
  the website updates the app. No new APK is needed.
- **A new APK is only needed when `mobile/` changes** (permissions, icon, native code). To release one:
  1. Raise `versionCode` (by 1) and `versionName` in `android/app/build.gradle`.
  2. Run `npm run release:android`. It builds the signed APK and publishes it when the server runs on this PC; for
     another server, upload `android/app/build/outputs/apk/release/app-release.apk` in **Settings → Mobile app**.
  3. Installed apps notice the new version when they open or come back to the screen, show **Update available**,
     download it and open Android's installer: the person taps **Install** and stays signed in. Android never lets
     an app outside the Play Store update itself silently, so that one tap is always needed. The first time, Android
     also asks to allow "Install unknown apps" for Attendance.
- The server reads the version from the APK and refuses test (debug) builds, other apps, older versions and builds
  that open localhost or another non-public address.
- Apps installed before the updater existed (and test builds signed with the debug key) can't update themselves:
  install the first release build by hand from `/app`. If a phone still has a test build, uninstall it first,
  because it was signed with a different key.
- If you later publish on the Play Store, the Play Store updates the app instead: remove the
  `REQUEST_INSTALL_PACKAGES` permission and `AppUpdatePlugin` first (Play policy doesn't allow self-updating).

## App id

The id is `com.attendancedesk.app`. To use your own (for example `com.yourcompany.attendance`), change it **before
the first store upload**, because it can't change after that:
- `capacitor.config.ts` → `appId`
- Android: `namespace` and `applicationId` in `android/app/build.gradle`, then move `MainActivity.java` to the matching
  folder and package. The `arrival/` folder can stay where it is.
- iOS: Xcode → App target → Signing & Capabilities → Bundle Identifier

## Changing things

| Change | Then |
|---|---|
| Web screens / server code | Deploy the web app as usual. Nothing to do here |
| `SERVER_URL`, `capacitor.config.ts`, plugins | `npm run sync`, then a new build |
| App icon or splash | Edit `scripts/make-assets.mjs`, `npm run assets`, then `npm run sync` |
| Version number | Android: `versionCode` / `versionName` in `android/app/build.gradle`. iOS: Xcode → General |

## Not done yet

- **Push notifications** (punch reminders, request approvals): add `@capacitor/push-notifications`, a Firebase
  project (Android) and an APNs key (iOS), and a server route that stores device tokens and sends through FCM.
- **Biometric unlock** (fingerprint / Face ID before opening the app).
- **Automatic punch-out** when leaving the office (left manual on purpose, to avoid false punch-outs).
