# Attendance Management System

Attendance for a small office (Coimbatore, Tamil Nadu). It replaces the monthly Excel log with one-tap punch in/out, approvals and reports. All business rules run in **India Standard Time**; instants are stored in UTC.

**Stack:** Next.js 15 (App Router, Server Actions), TypeScript (strict), MySQL 8 + Prisma, Auth.js v5, Tailwind CSS v4 + shadcn/ui, Zod, Vitest, Playwright.

## Status

| Phase | Scope | State |
|---|---|---|
| 1 | Project setup, Prisma schema, migrations, seed, auth + roles | ✅ Done |
| 3 | Punch in/out, `computeDayStatus()`, employee dashboard, PWA | ✅ Done |
| 2 | Employees, shifts, weekly-off policy, leave types, holidays, settings | ✅ Done |
| 4 | Leave / WFH / permission / on-duty / regularization requests + approvals | ✅ Done |
| 5 | Admin dashboard, muster roll, reports, Excel/PDF export, payroll summary | ✅ Done |
| 6 | Excel import with preview, auto-fixes, name matching and undo | ✅ Done |
| 7 | Notifications (bell + email), cron jobs, audit log, command palette | ✅ Done |
| 8 | Polish, more tests | Planned |

Phase 3 was brought forward at the owner's request.

## Run it locally

Needs Node 20+ and MySQL 8 (WAMP's MySQL works: `root`, no password).

```bash
npm install
cp .env.example .env          # set DATABASE_URL, AUTH_SECRET (npx auth secret), CRON_SECRET
mysql -uroot -e "CREATE DATABASE attendance_next CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
npx prisma migrate deploy     # create tables
npm run db:seed               # demo data (wipes the database in DATABASE_URL)
npm run prod                  # build + start the fast production server on http://localhost:6001
# npm run dev                 # development mode: only when changing code (each page 1–7 s slower)
```

### Demo sign-ins (seed)

| Role | Username / email | Phone | Password |
|---|---|---|---|
| Super Admin | **admin** (or admin@example.com) | 9876500000 | **admin** |
| HR / Manager | hr@example.com | 9876500001 | Hr@12345 |
| Employee | anitha@example.com (also karthik, meena, praveen, divya) | 98765000xx | Employee@123 |

All people in the seed are fictional. Seeded users skip the forced password change so the demo is quick to try. Users created later by HR get `mustChangePassword` and must set their own password on first sign-in.

## Environment variables

| Name | Purpose |
|---|---|
| `DATABASE_URL` | MySQL connection string |
| `AUTH_SECRET` | Signs session tokens. Generate with `npx auth secret` |
| `AUTH_TRUST_HOST` | `true` behind a proxy / on your own server |
| `APP_URL` | Public URL, used in emails and reset links |
| `CRON_SECRET` | Bearer token required by `/api/cron/*` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Outgoing email. With `SMTP_HOST` empty, emails are printed to the server log (handy in development for reset links) |

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build / server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Vitest unit tests (`computeDayStatus`, weekly offs, IST time helpers, geofence) |
| `npm run test:e2e` | Playwright against a production build: punch in → out → history; phone sign-in; lockout; role guards; add employee → temp password → forced change → edit → remove; photo upload. Uses its own `attendance_next_test` database and your installed Chrome |
| `npm run db:seed` | Reset + seed the database in `DATABASE_URL` |

## How attendance is computed

`lib/attendance/compute-status.ts` holds `computeDayStatus()`, a pure function and the only place that decides a day's status. It is fully unit-tested. Its inputs are the punches, employment dates, the holiday, the weekly-off rule in force, the shift timing for that weekday, approved requests and any HR override. The rules, in order:

1. Before joining or after exit, the day is **NOT_JOINED / EXITED**. It never counts as absent or leave.
2. An HR override wins. Approved full-day leave gives **LEAVE**.
3. With no punch: **HOLIDAY**, then **WEEKLY_OFF**, then **WFH / ON_DUTY**. Otherwise **ABSENT** once the day is over (a day still in progress shows "Not punched in").
4. Punched in but never out: **MISSING_PUNCH_OUT** after the day ends.
5. Late means arriving after shift start + grace (default 15 min); late minutes count from the shift start.
   - Worked < 4 h: **ABSENT**. Worked < the day's full-day minimum (8 h; 7 h on the shorter Saturday): **HALF_DAY**.
   - Otherwise **LATE** or **PRESENT**.
   - An approved permission covering the gap gives **PERMISSION**.
   - Overtime is time beyond shift end + 30 min. All work on an off day is overtime.

Weekly offs are dated rules (`WeeklyOffRule`), so changing the Saturday policy never rewrites past months. The seed uses **Sunday + 2nd & 4th Saturday** from 1 Jan 2026. Presets are all working, all off, 1st & 3rd, and 2nd & 4th. Per-day custom off/working dates handle "custom per month".

## Punching

- Times come from the **server clock**; the phone's clock is never used.
- Duplicate punch-ins and punch-out before punch-in are rejected. The `(employeeId, date)` unique index also guards against double taps.
- **Geofence** (setting `geofence`): when enabled, a punch must be within the radius of the office (plus up to 100 m of GPS accuracy). An approved WFH or on-duty for the day skips the check.
- **Selfie** (setting `punch.selfieRequired`): front-camera photo, downscaled to 480 px on the phone, stored under `storage/selfies/`.

## Scheduled jobs

| Route | When (IST) | UTC cron | What |
|---|---|---|---|
| `GET /api/cron/daily-summary` | 10:30 AM daily | `0 5 * * *` | Finds everyone expected today who hasn't punched in (holidays, weekly offs and approved leave / WFH / on duty are excluded) and sends HR and the Super Admin one bell notification + email with the names. Sends nothing when everyone is in. Returns `{ date, expected, punchedIn, notPunchedIn[], notified }` |
| `GET /api/cron/close-day` | 11:59 PM daily | `29 18 * * *` | Stores the final status for everyone employed that day (absent / holiday / weekly off). Flags open punches as **MISSING_PUNCH_OUT** and notifies the employee and HR (bell + email). `?date=YYYY-MM-DD` re-runs a past day |

Every call needs `Authorization: Bearer $CRON_SECRET`; without it the routes answer `401`. Emails use the branded HTML template in `lib/email-template.ts` (company name from Settings) with a plain-text part. Without `SMTP_HOST` they are printed to the server log.

- **Vercel:** `vercel.json` schedules both. Vercel sends the `CRON_SECRET` automatically.
- **Linux server** (clock in UTC), `crontab -e`:
  ```
  0 5 * * *   curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://your-host/api/cron/daily-summary
  29 18 * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://your-host/api/cron/close-day
  ```
- **Windows (WAMP):** Task Scheduler, from an elevated Command Prompt (times are the PC's local time, IST). `curl.exe` ships with Windows 10+:
  ```bat
  schtasks /Create /SC DAILY /ST 10:30 /TN "Attendance daily summary" /TR "curl.exe -fsS -H \"Authorization: Bearer <secret>\" http://localhost:6001/api/cron/daily-summary"
  schtasks /Create /SC DAILY /ST 23:59 /TN "Attendance close day" /TR "curl.exe -fsS -H \"Authorization: Bearer <secret>\" http://localhost:6001/api/cron/close-day"
  ```
  Run one now with `schtasks /Run /TN "Attendance daily summary"`; remove with `schtasks /Delete /TN "<name>" /F`.

## Phones over the internet (Cloudflare Tunnel)

Phones only allow installing the app, location and the camera on **https**. `npm run tunnel` puts the running app (port 6001) on a secure address with Cloudflare Tunnel, using `Attendance-private\tools\cloudflared\cloudflared.exe` (the private folder next to the project) (or `cloudflared` on the PATH).

1. Start the app: `npm run serve`. In a second window: `npm run tunnel`.
2. **Quick tunnel** (no account): prints a random `https://….trycloudflare.com` address that changes every time it starts. Fine for trying it out.
3. **Fixed address** (recommended for staff): in the Cloudflare dashboard (free account, your domain added to Cloudflare) go to Zero Trust → Networks → Tunnels → Create a tunnel → Cloudflared, add a public hostname such as `attendance.yourcompany.com` → `http://localhost:6001`, copy the token into `.env` as `CLOUDFLARE_TUNNEL_TOKEN="…"` and set `APP_URL="https://attendance.yourcompany.com"` (used in email links). `npm run tunnel` then always uses that address.

The PC must stay on with both windows open. Before going public, make sure no account still uses a default password.

## Mobile app (Android + iOS)

`mobile/` holds the native app (Capacitor). It opens the deployed site with native location, camera, haptics, downloads through the share sheet and an offline page. Web deploys update it automatically. See [mobile/README.md](mobile/README.md) to build it.

### Browser install (PWA, fallback)

The manifest, icons and service worker are included. On a phone, open the site in Chrome or Safari and choose **Add to Home screen**. Installing requires HTTPS (localhost is exempt). The service worker only runs in production builds. Pages are always loaded live, and an offline page is shown when the network is down.

## Deploy

**AWS (recommended):** step-by-step guide in [deploy/aws/DEPLOY-AWS.md](deploy/aws/DEPLOY-AWS.md) (Lightsail, Docker, automatic https, nightly backups). `npm run bundle` packs the code and `npm run export-db` exports the data with Linux table names.

### Docker Compose

```bash
cp .env.example .env    # set AUTH_SECRET, CRON_SECRET, APP_URL; DATABASE_URL is set by compose
docker compose up -d --build
docker compose exec app npx prisma db seed   # optional demo data
```

The app runs migrations on start and listens on port 6001. Selfies and uploads persist in the `storage` volume.

### Any Node host

```bash
npm ci && npx prisma migrate deploy && npm run build && npm start
```

## Project layout

```
app/(auth)/            login, forgot-password, reset-password
app/(dashboard)/       dashboard, attendance, employees + employees/[id]
app/change-password/   forced on first sign-in
app/api/cron/          scheduled jobs (secret-protected)
app/manifest.ts, app/icons/, public/sw.js, app/offline/   PWA
components/attendance/ punch card, timeline, calendar, team view
components/layout/     sidebar, top bar, notification bell
lib/attendance/        compute-status (pure), weekly-off, service (DB), dashboard view models
lib/actions/           server actions (auth, punch, notifications); each validates with Zod and checks the role
lib/auth.ts            Auth.js: credentials, lockout (5 tries → 15 min), remember-me, live role refresh
middleware.ts          sign-in, forced password change and role gates (pages re-check on the server)
prisma/                schema, migrations, seed
tests/unit, tests/e2e  Vitest and Playwright
```

## Tamil Nadu holidays

The seed's 2026 list covers the holidays named in the brief plus Good Friday. Festival dates that follow the lunar calendar should be checked against the Tamil Nadu Government order for the year. They are editable data, not code.
