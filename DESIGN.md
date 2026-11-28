# Attendance Desk Design System · v4 "Glass"

> **v4 (approved 12 Nov 2026), visual reference `docs/design/design-v4.html`.** Frosted-glass cards on a warm canvas lit by soft
> butter, peach and mint light; ink-black pill buttons; butter yellow for "yes" (Approve) and today; Outfit font;
> the working day drawn as a strip. **§0 overrides any older value below** (Indigo, Royal Blue, Inter, Plus Jakarta,
> "hairline only", small radii). Status colours, accessibility rules and component anatomy are unchanged.

## 0. v4 quick reference

| Token | Light | Dark | Use |
|---|---|---|---|
| `--brand` / `--brand-fg` | `#151410` / `#FFF` | `#F6F1E6` / `#15130F` | Primary pill buttons, active nav pill, active dock circle, now line/dot |
| `--mint` (butter) / `--mint-fg` | `#F7CF6B` / `#3B2A00` | `#F7CF6B` / `#2E2100` | **Approve**, today, India-time card, worked-time fill (Tailwind `bg-butter`, `text-on-butter`, button `variant="mint"`) |
| `--canvas` + glows | `#F5ECD6` + `#FFD66B` / `#FFBE98` / `#BFE6D4` | `#15130F` + dim | Body background: three fixed radial lights |
| `--surface` (glass) | `rgba(255,255,255,.6)` | `rgba(40,36,30,.58)` | Cards (always with `shadow-card`, which adds the blur + white edge) |
| `--glass-2` | `rgba(255,255,255,.78)` | `rgba(52,47,39,.72)` | Inputs, chips, inner tiles, inactive dock circles (`bg-glass`) |
| `--surface-raised` | `#FFFDF8` | `#2B2720` | Opaque: dialogs, sheets, menus, sticky table cells |
| `--surface-sunken` | `#F6EFDF` | `#24211B` | Table headers, quiet fills |
| `--border` | `rgba(21,20,16,.09)` | `rgba(255,255,255,.08)` | Dividers, chip/input outlines |
| `--text` / `-secondary` / `-muted` | `#151410` / `#4F4B42` / `#6E6858` | `#F6F1E6` / `#CDC5B3` / `#A0977F` | Text |

- **Font:** Outfit 300–700 (`--font-app`). Big numbers (timer, tiles) are **light (300)** with −0.04em tracking; headings 500.
- **Shape:** buttons, inputs, selects, chips, tabs, nav items = **full pills**; cards `rounded-xl` (28px), tiles `rounded-lg` (22px), textareas 20px.
- **Glass:** any card = `bg-surface shadow-card` (no border/ring). `.glass` utility = the same for custom elements. Anything that must hide content behind it (sticky cells, dialogs, the phone menu) uses `bg-raised`. On touch phones and tablets, cards in the page flow skip the backdrop blur for smooth scrolling; floating `.glass` elements (dock, chips) and the top bar keep it.
- **Safe areas:** use `var(--inset-top|bottom|left|right)` (set in `app/globals.css`), never `env(safe-area-inset-*)` directly, so the Android app's status and gesture bars are respected.
- **Buttons:** `default` ink pill (one per view) · `mint` butter pill (Approve / yes) · `outline`/`soft` glass pills · `ghost` · `destructive` · `link`.
- **Day strip:** shift window (glass, dashed) · worked time (butter → amber fill on the phone; status colour per person for HR) · late minutes hatched amber · ink "now" dot/line. Used in the punch card and the HR **Live register** (`components/attendance/team-today.tsx`).
- **Today card** (`components/attendance/punch-card.tsx`, replaces §4.1's clock hero and the old timeline card): status chip + small live time · a **headline** with the one number that matters (time to / past the late mark, hours worked) and one line explaining it · the day strip with the 3D art riding at "now" (alarm → snail once late → stopwatch → thumbs) · only the facts that exist so far (shift starts / late after / shift ends → punched in / expected out → in / out / worked), no "—" tiles · a **slide-to-punch** pill (ink track, butter knob; touch slides, mouse and keyboard click; accessible name stays "Punch in" / "Punch out"). On the dashboard it sits beside the quick actions (2 × 2).
- **Navigation:** floating glass sidebar (`variant="floating"`), active item = ink pill; butter India-time card at the bottom. Phone: floating glass **dock** of 48px circles, active = ink circle; labels are `sr-only` (names kept for screen readers).
- **Charts:** sequential scales use butter → amber, never the ink action colour.
- **3D art (v5, approved 12 Nov 2026, reference `docs/design/design-v5-3d.html`):** Microsoft Fluent 3D illustrations (MIT, `public/illustrations/`), rendered with `<Illustration name=… />` (`components/ui/illustration.tsx`). Decorative only (`alt=""`); the words beside them always carry the meaning. **One meaning per picture:** check = present · snail = late · palm = leave · hourglass = permission · house = WFH · briefcase = on duty · clipboard = punch fix · zzz = not punched in · party = holiday · moon = weekly off / evening · thumbs = done / nothing to fix · mailbox = no requests · memo = daily report · bell = notifications / announcements · alarm / stopwatch = before / during the shift · wave = greeting. Use them on quick-action tiles (title + art + pill), today's count tiles, request rows, the punch card and friendly empty states (`EmptyState art=…`). **Never** in buttons, the menu, the dock, tables or chips; those keep lucide line icons. Gentle float (`float` prop, `.art-float`) only on one hero picture per screen.
- **Don't:** keyboard emoji characters in text, uppercase labels, gradients other than the canvas lights and the butter fill, blue accents.

> Read this before writing any UI. Use only the tokens and component patterns defined here.
> Never introduce new colours, fonts or shadows. Tokens live in `app/styles/design-tokens.css`.
> The preview of every token and component is in `docs/design/design-preview.html`.

---

## 1. Visual Theme & Atmosphere

**Calm ledger, confident action.** Attendance Desk replaces an Excel sheet, so the interface should feel like a perfectly kept register: quiet, neutral surfaces, crisp hairlines and numbers that line up. On top of that sits **one** confident colour, Indigo Ink, which only ever means "you can act here".

Principles, in priority order:

1. **Readable at a glance.** Times, dates and statuses are the product. They get tabular figures, high contrast, and a colour + icon + word triple. Nothing decorative competes with them.
2. **One meaning per colour.** Indigo is for action (buttons, links, active nav, focus). Status colours are for attendance states. Neither is ever used for the other job.
3. **Two densities, one system.**
   - **HR desktop:** compact and dense, keyboard-friendly, many rows on screen.
   - **Employee mobile:** roomy and thumb-sized, one obvious action per screen, plain words.
4. **Fast, not flashy.** Hairlines instead of shadows, short 120–180ms transitions, skeletons instead of spinners, no gradients or glows.
5. **Trustworthy.** Every punch and decision shows *who* and *when*. Confirmations persist rather than flash away. Empty and error states speak plainly and offer one next step.

Personality words: *precise · calm · friendly · trustworthy · quick*. Not: playful, loud, glossy, "techy".

---

## 2. Color Palette & Roles

All values are WCAG-checked. Body text pairs are ≥4.5:1 (most ≥7:1). Non-text UI (input borders, status dots, focus rings) is ≥3:1.

### 2.1 Brand: Indigo Ink

| Token | Light | Dark | Use |
|---|---|---|---|
| `--brand` | `#4338E0` | `#8B8BFF` | Primary button fill, active nav indicator, focus ring, selected states |
| `--brand-hover` | `#372CC0` | `#A3A3FF` | Primary hover/pressed |
| `--brand-fg` | `#FFFFFF` | `#0E0E11` | Text/icons on `--brand` (7.29:1 light · 6.64:1 dark) |
| `--brand-text` | `#3A2FD0` | `#A9A9FF` | Links and brand-coloured text on surfaces (8.41:1 · 8.36:1) |
| `--brand-subtle` | `#EEEDFD` | `#23224A` | Selected row, active nav background, today highlight (brand-text on it: 7.27:1 · 7.01:1) |

Brand scale (for illustrations and charts only, never status): 50 `#EEEDFD` · 100 `#E0DEFC` · 200 `#C5C1F9` · 300 `#A39CF4` · 400 `#7C73EE` · 500 `#5B50E6` · **600 `#4338E0`** · 700 `#372CC0` · 800 `#2D249B` · 900 `#231C75`.

### 2.2 Neutral scale (cool-warm grey)

| Step | Hex | Step | Hex |
|---|---|---|---|
| 0 | `#FFFFFF` | 500 | `#7A7A82` |
| 25 | `#FBFBFA` | 600 | `#63646B` |
| 50 | `#F7F7F5` | 700 | `#45464D` |
| 100 | `#F1F1EE` | 800 | `#2C2D33` |
| 150 | `#E9E9E5` | 850 | `#1F2025` |
| 200 | `#E4E4E0` | 900 | `#17171A` |
| 300 | `#CFCFC9` | 925 | `#16171B` |
| 400 | `#8A8B93` | 950 | `#0E0E11` |

### 2.3 Semantic surface & text roles

| Token | Light | Dark | Notes |
|---|---|---|---|
| `--canvas` | `#F7F7F5` | `#0E0E11` | App background behind cards |
| `--surface` | `#FFFFFF` | `#16171B` | Cards, tables, inputs, sheets |
| `--surface-sunken` | `#F1F1EE` | `#1D1E23` | Table header, segmented-control track, hover rows |
| `--surface-raised` | `#FFFFFF` | `#26272D` | Popovers, menus, modals (dark mode lifts by lightness) |
| `--border` | `#E4E4E0` | `#2C2D33` | Hairlines: card edges, row dividers |
| `--border-strong` | `#8A8B93` | `#6E6F78` | Input/checkbox boundaries (3.39:1 · 3.59:1) |
| `--text` | `#17171A` | `#F2F2F4` | Primary text (17.9:1 · 16.0:1) |
| `--text-secondary` | `#45464D` | `#C6C7CE` | Secondary text, table body (9.4:1 · 10.6:1) |
| `--text-muted` | `#63646B` | `#9A9BA3` | Captions, hints, column headers (5.9:1 · 6.5:1). **Never lighter than this for readable text.** |
| `--text-disabled` | `#A1A1A8` | `#5F6068` | Disabled labels only (exempt from contrast) |
| `--danger` | `#C81E1E` | `#F87171` | Errors, destructive actions (5.7:1 · 6.5:1) |
| `--danger-subtle` | `#FDE8E8` | `#3A1517` | Error field background, destructive confirm |
| `--success` | `#1A8C4B` | `#34C774` | Success toasts/confirmations (not attendance) |
| `--warning` | `#B07D00` | `#F2B21B` | Non-attendance warnings |
| `--info` | `#2F8FDB` | `#4AA8EE` | Info banners |

### 2.4 Attendance status colours

Each status has a **tint** (background), a **fg** (text on tint and on surface, AA or better everywhere) and a **solid** (dot, calendar-cell edge, chart; ≥3:1 on surface). **A status is never shown by colour alone.** It always carries its icon and its word, or its letter code in dense grids.

| Status | Letter | Icon (lucide) | Light tint / fg / solid | Dark tint / fg / solid | fg-on-tint contrast (L · D) |
|---|---|---|---|---|---|
| **Present** | P | `circle-check` | `#E3F5E9` / `#14532D` / `#1A8C4B` | `#12321F` / `#86E5A9` / `#34C774` | 8.0 · 9.2 |
| **Absent** | A | `circle-x` | `#FDE8E8` / `#9B1C1C` / `#DC2626` | `#3A1517` / `#FCA5A5` / `#F05252` | 6.9 · 8.5 |
| **Late** | L | `clock-alert` | `#FEF3D6` / `#7A4A00` / `#B07D00` | `#352708` / `#F8CF62` / `#F2B21B` | 6.8 · 9.8 |
| **Half-day** | H | `circle-dot-dashed` | `#FFEBDD` / `#8A3A00` / `#EA6A0A` | `#3A1F0C` / `#FDBA8C` / `#F7873A` | 6.8 · 9.1 |
| **On Leave** | LV | `tree-palm` | `#DDF4F3` / `#0F5757` / `#0E9494` | `#0F3131` / `#7ADBD8` / `#2DBDBA` | 7.3 · 8.6 |
| **Holiday** | HO | `party-popper` | `#E1F0FD` / `#0B4A7A` / `#2F8FDB` | `#0E2A42` / `#8CC8F5` / `#4AA8EE` | 8.0 · 8.2 |
| **Weekly Off** | WO | `moon` | `#EFEFEC` / `#4B4C53` / `#8E8F96` | `#24252A` / `#B4B5BC` / `#7C7D86` | 7.4 · 7.5 |
| **Pending approval** | ? | `hourglass` | `#F6E9F7` / `#6B2170` / `#B0459F` | `#33173A` / `#E9AEEA` / `#D06BCB` | 8.6 · 8.8 |

**Variant statuses**: these reuse a core palette (no new colours) and are told apart by icon and code:

| Status | Code | Icon | Palette | Why |
|---|---|---|---|---|
| WFH | WFH | `house` | Present | A worked day, away from office |
| On duty | OD | `briefcase` | Present | A worked day, at a client or site |
| Permission | PR | `timer` | On Leave | Approved short absence (hours) |
| Missing punch-out | M | `triangle-alert` | Absent | Needs fixing; the day can't count yet |

Request states use the same system: **Pending / Cancellation requested** = Pending (dashed, `hourglass`), **Approved** = Present (`circle-check`), **Rejected** = Absent (`circle-x`), **Cancelled** = neutral sunken (`ban`). The single source in code is `lib/status.ts` (`STATUS_META`: label, short, icon, dot/chip/cell classes) and `REQUEST_STATUS_META` in `lib/validations/requests.ts`.

Colour-blind safety:
- Red/green (Absent vs Present) differ in **icon shape** (✓ vs ✕) and letter.
- Late vs Half-day differ in icon (clock vs half circle) and letter.
- Holiday and Weekly Off differ by hue (blue vs grey) *and* icon (party vs moon).
- Pending is the only **dashed-border** pill, so it is recognisable even in greyscale.

Extra marks (not statuses):
- **Missing punch-out:** Present/Late pill + an `alert-triangle` suffix icon in `--danger`.
- **Edited by HR:** a 6px `--text-muted` dot in the top-right of the cell, with a tooltip.

---

## 3. Typography Rules

**Font: Inter** (Google Fonts, variable, weights 400/500/600/700). It is free, highly legible at small sizes, and has true tabular figures (`tnum`).
- Load with `next/font/google` (`display: swap`). Fallback: `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`.
- **Numbers:** every time, date, duration, count, ID and table cell uses `font-variant-numeric: tabular-nums` (Tailwind `tabular-nums`), so `09:05` and `11:11` align in a column.
- **Slashed zero** (`zero`) is used only in employee codes (`EMP001`).
- Case: sentence case everywhere. No all-caps labels, except two-letter status codes in grids.
- No second typeface. Hierarchy comes from size and weight only.

### 3.1 Desktop / admin scale (base 14px)

| Token | Size / line | Weight | Tracking | Use |
|---|---|---|---|---|
| `display` | 32 / 40 | 600 | −0.02em | Stat card value, report total |
| `title-1` | 24 / 32 | 600 | −0.01em | Page title |
| `title-2` | 18 / 26 | 600 | −0.005em | Section / panel title |
| `title-3` | 16 / 24 | 600 | 0 | Card title, drawer title |
| `body` | 14 / 20 | 400 | 0 | Default UI text |
| `body-strong` | 14 / 20 | 500 | 0 | Names in tables, emphasised values |
| `cell` | 13 / 18 | 400 | 0 | Dense table cells (compact mode) |
| `label` | 13 / 18 | 500 | 0 | Form labels, buttons (sm), tabs |
| `caption` | 12 / 16 | 500 | 0 | Hints, helper text, timestamps |
| `col-header` | 12 / 16 | 600 | 0.01em | Table column headers (sentence case, `--text-muted`) |
| `code` | 12 / 16 | 600 | 0.02em | Status letters in calendar cells, employee codes |

### 3.2 Mobile / employee scale (base 16px, never smaller than 13px)

| Token | Size / line | Weight | Use |
|---|---|---|---|
| `clock` | 44 / 48 | 600, −0.02em, tnum | Live time on the check-in hero |
| `m-title` | 22 / 28 | 600 | Screen title, greeting |
| `m-section` | 18 / 24 | 600 | Section heading |
| `m-body` | 16 / 24 | 400 | Body, **all input text** (prevents iOS zoom) |
| `m-button` | 16 / 24 | 600 | Buttons |
| `m-meta` | 14 / 20 | 500 | Times under list items, chips |
| `m-caption` | 13 / 18 | 500 | Helper text (minimum size on mobile) |

---

## 4. Component Stylings

Every interactive component defines **default · hover · focus-visible · active · disabled · error · loading**.

Global states:
- **Focus-visible:** `box-shadow: 0 0 0 2px var(--surface), 0 0 0 4px var(--brand)`. It never disappears, including on touch devices using keyboards.
- **Disabled:** `opacity` is not used. Swap to `--surface-sunken` fill, `--text-disabled` text, `cursor: not-allowed`, and keep the layout identical.
- **Loading:** keep the label width and replace the icon with a 16px spinner (or a skeleton for regions). The control becomes `aria-busy="true"`.
- **Error:** a 1px `--danger` border, `--danger` helper text with a `circle-alert` icon, and `aria-invalid`.
- **Motion:** `--dur-fast` 120ms for hover/press and `--dur-base` 180ms for open/close, eased with `--ease-out` `cubic-bezier(.2,.7,.2,1)`. All motion is disabled under `prefers-reduced-motion`.

### 4.1 ★ Check-in / Check-out hero (mobile, most important)

The first thing an employee sees. One card, one action, zero ambiguity.

**Anatomy, top to bottom, in a `--surface` card with `radius-xl` (16px), 20px padding and a 1px `--border`:**
1. **Status line:** a status pill showing today's state, plus a shift chip, e.g. `General · 9:30 AM – 6:30 PM`. Before check-in the pill reads *Not checked in* in neutral style.
2. **Live clock:** `clock` type (44px, tnum) showing `hh:mm`, with seconds as a 16px `--text-muted` suffix and `AM/PM` beside it. Below it: `Friday, 06 Nov 2026`.
3. **Hero button:** full width, **64px tall**, `radius-lg` (12px), 18px/600 label with a leading 24px icon.

   | State | Fill | Label | Icon |
   |---|---|---|---|
   | Not checked in | `--brand` / `--brand-fg` | **Check in** | `log-in` |
   | Checked in | `--text` (ink) / `--surface` | **Check out** | `log-out` |
   | Day complete | `--surface-sunken` / `--text-secondary`, disabled | **Done for today** | `circle-check` |
   | Holiday / Weekly off | `--surface-sunken` | **No shift today** + the holiday name | `party-popper` / `moon` |
   | Working (sub-line) | n/a | Under the label, 13px: `Checked in at 09:42 AM · 6h 18m so far` | n/a |

4. **Today's numbers:** a 3-up row of mini stats (`m-meta` label, 18px/600 tnum value): *Checked in* `09:42 AM` · *Worked* `6h 18m` · *Expected out* `6:42 PM`. A thin 6px progress bar shows worked vs required hours: `--brand` while working, `--success` once complete.
5. **Context chips** (only when relevant): `map-pin` *At office* / *Outside office (120 m)*, `camera` *Selfie needed*, `wifi-off` *Offline: will not record*.

**Interaction:**
- **Touch:** press-and-hold for **600ms** to confirm, so pocket taps don't count. A fill sweeps left→right in `--brand-hover`, the helper text says "Keep holding…", and releasing early cancels. Mouse and keyboard click once.
- **Success:** the button becomes a green check state for 2.4s. A persistent confirmation line stays under it (`Checked in at 09:42:18 AM · Recorded by server`) and haptic feedback fires (`navigator.vibrate(20)`).
- **Error:** an inline `--danger-subtle` banner directly under the button, with the reason in plain words and a single retry action, e.g. *You're 1.2 km from the office. Move closer or ask HR for an on-duty request.* Never only a toast.
- **Loading:** the label is kept, a spinner replaces the icon and the button is `aria-busy`. Double taps are ignored.
- **Accessibility:** `aria-label` names the action. The live clock is `aria-hidden`; the status is a live region (`aria-live="polite"`).

### 4.2 ★ Daily attendance register (desktop table, most important)

**Toolbar** (a sticky 56px bar on `--surface` with a bottom hairline):
- A date stepper `‹ 06 Nov 2026 ›` with a calendar popover and a **Today** chip.
- A search box (240px, `search` icon, placeholder *Search name or code*; `/` focuses it).
- Filters: department select, shift select, and status filter chips (each chip = status pill + count, toggleable, multi-select).
- Right side: a density toggle (Comfortable 48px / Compact 40px), **Export** (secondary), and **Mark attendance** (primary).

**Table:**
- **Header:** sticky (`top: 56px` under the toolbar), `--surface-sunken`, `col-header` type, 40px tall, and a `--shadow-sm` once scrolled. Sortable columns show a `chevrons-up-down` icon that becomes `chevron-up` / `chevron-down` when active.
- **Columns:** ☐ select (40px) · **Employee** (avatar 28px + name `body-strong` + code `caption` mono-zero; sticky left with a right hairline when scrolling horizontally) · Department · Shift · **In** · **Out** · **Worked** · **Status** · Late by · Actions (kebab).
- **Cells:**
  - 12px vertical / 16px horizontal padding; `body` (comfortable) or `cell` (compact).
  - Times use the tnum `hh:mm AM` format, right-aligned in a fixed 88px column, so all times line up.
  - Empty values show `—` in `--text-muted`.
  - Late times turn `--text` + bold, with a `late` fg suffix `+12m`.
- **Rows:**
  - Hairline dividers.
  - Hover: `--surface-sunken`. Selected: `--brand-subtle` with a 2px `--brand` left edge.
  - Zebra striping is not used; hover and dividers are enough.
- **Status column:** a status pill (§4.4) with optional suffix marks (missing punch-out ⚠, edited •).
- **Bulk actions:** when ≥1 row is selected, the toolbar turns into a bulk bar (`--brand-subtle` background, `--brand-text` text). It shows *3 selected*, the actions *Mark present*, *Mark absent*, *Add remark* and *Export selected*, and a **Clear** link. Destructive bulk actions open a confirm dialog that requires a reason.
- **Row actions:** the kebab menu offers *Edit punches*, *Mark as…*, *View history*, *Open profile*. Double-clicking a row opens the day drawer (§4.8).
- **Pagination footer:** sticky bottom with *1–50 of 186*, page-size select and prev/next. Below 300 rows, prefer virtual scroll over paging.
- **States:**
  - **Loading:** 8 skeleton rows with exact column widths. A shimmer runs unless reduced motion is on.
  - **Empty day (holiday):** an empty state with the `party-popper` illustration, *"Diwali: no attendance expected"*.
  - **No search results:** *"No one matches 'ravi'"* + a **Clear search** button.
  - **Error:** an inline banner above the table with **Retry**.
- **Responsive:**
  - Below 1024px, Department and Shift collapse into the Employee cell.
  - Below 768px, each row becomes a card: name + status pill on top, then In / Out / Worked in a 3-column tnum row.

### 4.3 ★ Monthly attendance calendar grid (employee × date)

The spreadsheet replacement. It must be scannable for 50+ employees × 31 days.

**Layout:**
- A sticky first column (220px: avatar + name + code).
- A sticky header row (weekday initial over the date number, e.g. `M` over `03`).
- A sticky right summary column (P / A / L / LV counts, tnum).

**Cells:**
- 36×36px desktop (32px compact) with a 2px gap, `radius-xs` (4px), and the status **tint** fill.
- The status **letter** is centred in `code` type, in the status **fg**.
- **Today's column:** a `--brand-subtle` background strip, plus a 2px `--brand` ring on the header date.
- **Weekly-off and holiday columns:** the header text turns `--text-muted`. Cells use the Weekly Off / Holiday tints, with a subtle 45° hatch (`repeating-linear-gradient` with `--border`) for weekly-off, so the difference holds even in greyscale.
- **Future days:** an empty `--surface` cell with a dashed `--border`.
- **Before joining / after exit:** `--surface-sunken`, no letter, with the tooltip *Not employed*.
- **Edited by HR:** a 5px `--text-muted` corner dot. **Missing punch-out:** a 2px `--danger` bottom bar.

**Interaction:**
- Hover shows a tooltip: date, status word, In/Out times, worked hours and remark.
- Clicking a cell opens the day drawer (§4.8). Keyboard: arrow keys move between cells, Enter opens the drawer.
- Shift-click selects a range for bulk marking.

**Toolbar:** a month stepper `‹ November 2026 ›` (popover with a 12-month grid and year arrows), search, a department filter, the legend, and **Export Excel / PDF**.

**Legend:** always visible above the grid. All 8 statuses are shown as tint squares with letter + word, plus the extra marks.

**Employee self-view (mobile):**
- A 7-column month calendar with ≥44px cells.
- Each cell shows the date number (tnum) and a 6px status dot. The full status word appears in the list below the grid when a day is tapped.
- Today has a 2px `--brand` ring.

### 4.4 Status pill

- A pill (`radius-full`), 22px tall (desktop) / 28px (mobile), with 2px 8px padding.
- Content: a 14px icon + `caption` 12px/600 word, in status **fg** on status **tint**, with no border.
- Pending approval adds a 1px dashed `solid` border.
- The compact variant is the letter only, inside a 20px square with `radius-xs` (for grids). Its `aria-label` is the full word.

### 4.5 Leave request card + approve/reject flow

**Card** (`--surface`, `radius-lg`, 16px padding, hairline border):
- **Header:** employee avatar + name + code, the leave type chip (e.g. *Casual leave*), and a status pill (Pending / Approved / Rejected / Cancelled).
- **Dates:** a large `title-3` tnum line: `14 – 16 Jan 2027 · 3 days` (half day: `14 Jan 2027 · First half`). The balance impact sits underneath: `Balance 12 → 9`, with a warning colour if it goes negative.
- **Reason** is quoted in `--text-secondary`, clamped to 3 lines with *More*. Any attachment is a chip with a `paperclip` icon.
- **Conflicts** appear as a `--warning`-tinted note, e.g. *2 others from Operations are on leave these days*.
- **Actions (approver):** **Approve** (primary) + **Reject** (secondary, danger text) + an optional comment field revealed on Reject (required for Reject).
- **States:**
  - Deciding: buttons enter the loading state.
  - Decided: the card collapses to a one-line outcome, e.g. *Approved by Lakshmi N · 06 Nov, 10:42 AM*.
  - Undo is offered in a toast for 6s.

**Flow:**
1. **Inbox:** a list of cards sorted oldest first, with tabs *Pending (4) / Approved / Rejected / All*.
2. **Bulk approve:** checkbox select, then the bulk bar shows *Approve 3*.
3. **Detail:** opens in a drawer (desktop) or a full-screen sheet (mobile), showing the request, balances, a mini team calendar for the dates and the audit history.
4. **Employee side:** the same card without actions. Pending shows *Waiting for Lakshmi N* and a **Cancel request** link.

### 4.6 Stat cards (present today, absent, late, on leave)

- **Card:** `--surface`, `radius-lg`, 16px padding, hairline border, min-width 160px.
- **Content:**
  - Top row: label (`label`, `--text-secondary`) and a 32px rounded-square icon tile in the status tint with the status icon in its fg.
  - Value: `display` 32px/600 tnum. Context line: `caption`, e.g. `of 48 employees` or `+3 vs yesterday`. Trend arrows use `--success` / `--danger` text with an arrow icon, never colour alone.
- **Clickable:** the whole card filters the register by that status. Hover lifts the border to `--border-strong`, with a focus ring.
- **Loading:** a skeleton value bar (72×32).
- **Grid:** 4 across on desktop and 2×2 on mobile, with a 12px gap.

### 4.7 Forms, selects, date & time pickers

**Inputs:**
- Height 40px desktop / **48px mobile**, `radius-md` (8px), 1px `--border-strong`, `--surface` background, 12px horizontal padding.
- Text is `body` on desktop and `m-body` (16px) on mobile. The placeholder uses `--text-muted`.
- **Label:** above the field, `label` type, with a 6px gap. Required fields show a ` *` in `--danger` plus "(required)" for screen readers.
- **Helper text:** below the field in `caption`, `--text-muted`. On error it is replaced by the error message.
- **States:** hover → `--text-muted` border; focus → `--brand` border + focus ring; error → `--danger` border + message; disabled → `--surface-sunken`.

**Select:** an input-styled trigger with `chevron-down`.
- The menu is a popover on desktop (max 320px tall, searchable at more than 8 options) and a bottom sheet on mobile.
- Selected option: a `check` icon + `--brand-subtle` row.

**Checkbox and radio:** 18px boxes (hit area 44px on mobile), `radius-xs`. Checked fill is `--brand` with a `--brand-fg` mark.

**Switch:** 36×20px; the on state is `--brand`.

**Segmented control** (Day/Week/Month, One day/Several days):
- `--surface-sunken` track, 4px padding, 32px desktop / 40px mobile.
- The active segment is `--surface` with `--shadow-sm` and `--text`.

**Date picker:**
- Desktop: a popover. Mobile: a bottom sheet.
- Month grid: 36px cells on desktop, 44px on mobile.
  - Today: a ring.
  - Selected: a `--brand` fill.
  - A range is `--brand-subtle` between `--brand` endpoints.
  - Holidays and weekly offs show a status dot beneath the number.
- Quick chips above the grid: *Today · Yesterday · This week · This month*.
- Typing is allowed in `DD MMM YYYY` or `DD-MM-YYYY` and is parsed leniently.
- Display format everywhere: `06 Nov 2026`.

**Time picker:**
- A 12-hour input `09:42 AM` with hour/minute steppers. Mobile uses the native `type="time"` wheel.
- Common shift times appear as chips.
- Shown in tnum. Storage is always 24-hour IST.

**Validation:** on blur and on submit, never on every keystroke. Messages say how to fix, e.g. "End time must be after 9:30 AM", not "Invalid".

### 4.8 Modals, drawers, sheets

- **Modal** (confirmations and short forms):
  - Max-width 440px, `radius-xl`, `--surface-raised`, `--shadow-lg`, 24px padding.
  - Overlay `rgba(14,14,17,.45)` with no blur. Title is `title-3`.
  - Actions sit right-aligned: secondary, then primary. In destructive modals the primary uses the `--danger` fill.
- **Drawer** (desktop detail, e.g. day editor or leave detail):
  - Right side, 440px (560px for forms), full height, with a hairline left edge and `--shadow-lg`.
  - A sticky header (title + close) and a sticky footer for actions.
- **Bottom sheet** (mobile): `radius-xl` top corners, a drag handle (36×4px, `--border-strong`), max 90vh, and a safe-area bottom inset.
- **All of them:** focus trap, Esc closes, focus returns to the trigger, and the open animation is 180ms (fade + 8px slide).

### 4.9 Tabs, toasts, empty states, skeletons

- **Tabs** (page sections):
  - Text tabs with a 2px `--text` underline when active, `label` type, 40px tall.
  - A count badge (`caption`, `--surface-sunken` pill) is allowed, e.g. "Pending 4".
- **Toasts:**
  - Bottom-right on desktop; on mobile, top-centre, above the bottom bar.
  - Style: `--surface-raised`, `--shadow-md`, `radius-lg`, 14px text, a leading status icon (success/danger/info).
  - Auto-dismiss after 4s (6s with an action such as Undo). Never the *only* place a result is shown for punches or approvals.
- **Empty states:** centred inside the panel.
  - A 40px icon in a 64px `--surface-sunken` circle, a title (`title-3`) and one line of plain help (`--text-secondary`).
  - At most **one** primary action. Example: "No leave requests yet" / "When your team applies for leave, it shows up here."
- **Skeletons:**
  - `--surface-sunken` blocks with exact final dimensions, `radius-xs`.
  - A 1.4s shimmer of `--border` → `--surface-sunken`, disabled under reduced motion.
  - Shown after 150ms (no flash for fast loads).

### 4.10 Buttons

| Variant | Fill / text | Border | Use |
|---|---|---|---|
| **Primary** | `--brand` / `--brand-fg` | none | The single main action per view |
| **Secondary** | `--surface` / `--text` | 1px `--border-strong` | Other actions |
| **Ghost** | transparent / `--text-secondary` | none | Toolbars, icon buttons |
| **Danger** | `--danger` / `#FFFFFF` | none | Destructive confirm only |
| **Link** | transparent / `--brand-text`, underline on hover | n/a | Inline navigation |

- **Sizes:**
  - `sm`: 32px, 12px padding, 13px.
  - `md`: 40px, 16px padding, 14px/500 (desktop default).
  - `lg`: 48px, 20px padding, 16px/600 (mobile default).
  - `hero`: 64px (check-in only).
- **Radius:** `radius-md`, except the hero, which uses `radius-lg`.
- **Icons:** 16px (`sm`/`md`), 20px (`lg`), 24px (`hero`), with an 8px gap. Icon-only buttons are square, always have an `aria-label` and a tooltip, and have a ≥44px hit area on touch.
- **States:**
  - Hover: primary → `--brand-hover`; secondary/ghost → `--surface-sunken`.
  - Active: translateY(1px).
  - Focus: ring.
  - Disabled: sunken style.
  - Loading: spinner and fixed width.

### 4.11 Navigation

**Desktop sidebar:**
- 248px wide (collapsible to a 64px icon rail), `--surface`, with a hairline right border.
- **Top:** company switcher (logo 28px + company name + role, opens a tenant menu).
- **Groups:** *Workspace* (Dashboard, Register, Calendar), *People* (Employees, Leave, Shifts, Holidays), *Insights* (Reports), *Admin* (Settings, Roles, Audit log). Group labels use `caption` in `--text-muted`.
- **Item:**
  - 36px tall, 8px 12px padding, `radius-md`, 18px icon + `label`.
  - Hover: `--surface-sunken`. Active: `--brand-subtle` background with `--brand-text` text and icon.
  - Count badges are right-aligned, e.g. Leave **4**: a `--brand` pill with `--brand-fg` text.
- **Bottom:** a live IST clock chip and the user menu.

**Mobile bottom tab bar** (employee view, below 768px):
- Fixed, 64px + `env(safe-area-inset-bottom)`, `--surface`, with a hairline top border.
- **4 tabs:** Home (`house`) · Attendance (`calendar-days`) · Leave (`tree-palm`) · Me (`user`).
- **Each tab:** 24px icon above a 12px/600 label, minimum 64×56px. The **label is always visible**.
- **Active tab:** `--brand-text` icon and label, plus a 24×3px `--brand` bar on the top edge. Inactive tabs use `--text-muted`.
- Badge dot: an 8px `--danger` dot on the icon for unread items.
- Admin users on mobile get a top app bar with a menu button that opens the sidebar as a sheet. The bottom bar is for the employee experience.

---

## 5. Layout Principles

### 5.1 Spacing scale (4px base)

`--space-0` 0 · `1` 2px · `2` 4px · `3` 6px · `4` 8px · `5` 12px · `6` 16px · `7` 20px · `8` 24px · `9` 32px · `10` 40px · `11` 48px · `12` 64px.

Rules:
- Inside components use 4–16px.
- Between related blocks use 16–24px.
- Between page sections use 32px (desktop) / 24px (mobile).
- Page gutter is 32px desktop, 24px tablet and **16px mobile**.

### 5.2 Grid

- **Desktop:** sidebar 248px + content (max 1440px, fluid), 12-column grid with a 24px gutter.
- **Tablet:** 8 columns, 16px gutter.
- **Mobile:** 4 columns, 16px side gutter, 12px gap. Minimum supported width is **360px**.

### 5.3 Page templates

| Page | Template |
|---|---|
| **Admin dashboard** | Page title + date. **Stat row** (4 cards: Present · Absent · Late · On leave). Then a 2-column split: *Today's register preview* (top 8 rows + "Open register") on the left (8 cols), *Pending approvals* card list and *Who's out today* on the right (4 cols). Then a full-width 30-day attendance trend chart. |
| **Attendance register** | Sticky toolbar (§4.2) → status chip filter row → full-width table. Bulk bar replaces the toolbar on selection. The day drawer opens on the right. |
| **Employee list** | Title + **Add employee** (primary) + Import. Filter row (search, department, status tabs *Active / On notice / Exited*). Table with avatar, name, code, department, shift, sign-in status, joined date. Row click opens the profile. |
| **Employee detail** | Header card (avatar 64px, name `title-1`, code, role, department, status pill, actions *Edit* / *Record leave*). Tabs: *Overview* (this month's stats + mini calendar), *Attendance* (monthly calendar + day list), *Leave* (balances + history), *Details* (personal and job fields), *Activity* (audit). |
| **Reports** | Left rail list of reports (Monthly summary, Late arrivals, Leave, Overtime, Payroll). Main area: filter bar (date range with presets, department, employee) → summary stat row → table → sticky **Export Excel / PDF** buttons top-right. |
| **Settings** | Left sub-nav (Company, Working week, Shifts, Leave types, Policies, Punching, Holidays, Roles). The main column (max 720px) holds section cards, each with a title, a one-line description and fields. Changes save per card with a **Save** button and a dirty-state indicator. |
| **Employee mobile home** | Greeting (`m-title`) + date → **check-in hero** (§4.1) → *This week* strip (7 day dots with letters) → *My leave balance* chips → *Requests* card (latest 2) → bottom tab bar. One primary action on screen: the hero button. |

---

## 6. Depth & Elevation

Hairline-first: most things are flat with a 1px `--border`. Shadows are reserved for things that **float above** content.

| Level | Token | Light value | Dark value | Use |
|---|---|---|---|---|
| 0 | none | 1px `--border` | 1px `--border` | Cards, tables, inputs, sidebar |
| 1 | `--shadow-sm` | `0 1px 2px rgba(23,23,26,.06)` | `0 1px 2px rgba(0,0,0,.4)` | Sticky table header (when scrolled), active segment |
| 2 | `--shadow-md` | `0 1px 2px rgba(23,23,26,.05), 0 4px 12px rgba(23,23,26,.08)` | `0 1px 2px rgba(0,0,0,.4), 0 4px 12px rgba(0,0,0,.45)` | Popovers, menus, toasts, tooltips |
| 3 | `--shadow-lg` | `0 2px 6px rgba(23,23,26,.06), 0 16px 40px rgba(23,23,26,.14)` | `0 2px 6px rgba(0,0,0,.5), 0 16px 40px rgba(0,0,0,.6)` | Modals, drawers, bottom sheets |

- In dark mode, elevation is expressed mainly by **surface lightness**: canvas `#0E0E11` → surface `#16171B` → sunken `#1D1E23` → raised `#26272D`, with hairlines always present.
- The z-index scale: sticky 10 · header 20 · drawer 40 · modal 50 · toast 60 · tooltip 70.

---

## 7. Do's and Don'ts

**Do**
- Use `tabular-nums` on every number, time and date.
- Pair every status colour with its icon and word (or letter in grids).
- Keep **one** primary (indigo) button per view. Everything else is secondary or ghost.
- Show *who* and *when* on every punch, edit and approval.
- Use Indian formats: `06 Nov 2026`, `09:42 AM`, `₹1,25,000`, Monday-first weeks unless the company sets otherwise.
- Write plain, kind microcopy. Use "Check in", not "Punch-in event".
- Use skeletons that match the final layout, shown after 150ms.
- Test at 360px, at 200% zoom, in both themes and in greyscale.

**Don't**
- Don't use indigo for statuses, or status colours for buttons and links.
- Don't show colour-only states (no bare dots without a word nearby).
- Don't add new colours, fonts, shadows, gradients, glows or emoji in UI chrome.
- Don't go lighter than `--text-muted` for readable text, or below 13px on mobile / 12px on desktop.
- Don't use icon-only actions in the employee mobile view. Always add a label.
- Don't put confirmations only in toasts for punches or approvals.
- Don't use all-caps labels, centred table numbers, or zebra stripes.
- Don't use hover-only affordances on touch screens.
- Don't use spinners for whole pages; use skeletons.

---

## 8. Responsive Behavior

| Breakpoint | Width | Admin (desktop-first) | Employee (mobile-first) |
|---|---|---|---|
| `xs` | 360–479 | Top bar + sidebar as sheet. Tables become cards. | **Primary target.** Bottom tab bar, hero card full-width, 16px gutters |
| `sm` | 480–767 | Same as `xs` | Same; cards max 520px |
| `md` | 768–1023 | Sidebar collapses to a 64px rail. Register hides Department and Shift columns. | Bottom bar → sidebar rail; two-column cards |
| `lg` | 1024–1279 | Full sidebar, full register | Same layout as admin |
| `xl` | ≥1280 | Content max 1440px; dashboard right column widens | n/a |

Rules:
- **Touch targets ≥44×44px** (48px for primary mobile actions, 64px for the check-in hero), with ≥8px between adjacent targets.
- **Mobile inputs:** 16px text (prevents iOS zoom), 48px height, with the native keyboards `inputmode="numeric"` / `type="tel"` / `type="email"`.
- **Monthly grid on mobile:** HR gets horizontal scroll with the sticky name column. Employees get the 7-column personal calendar instead.
- **Safe areas:** respect `env(safe-area-inset-*)` on the bottom bar, sheets and the hero.
- **Orientation:** the employee view is portrait-locked in the PWA manifest; the admin view is free.

---

## 9. Agent Prompt Guide

### 9.1 Token quick reference

```
Font        Inter (next/font/google) · tabular-nums on all numbers
Brand       --brand #4338E0 (dark #8B8BFF) · hover #372CC0 · on-brand #FFF · link --brand-text #3A2FD0 · subtle #EEEDFD
Canvas      --canvas #F7F7F5 / #0E0E11 · --surface #FFF / #16171B · --surface-sunken #F1F1EE / #1D1E23
Text        --text #17171A · --text-secondary #45464D · --text-muted #63646B (min for readable text)
Lines       --border #E4E4E0 (hairline) · --border-strong #8A8B93 (inputs)
Status      present P #E3F5E9/#14532D · absent A #FDE8E8/#9B1C1C · late L #FEF3D6/#7A4A00
            half-day H #FFEBDD/#8A3A00 · leave LV #DDF4F3/#0F5757 · holiday HO #E1F0FD/#0B4A7A
            weekly-off WO #EFEFEC/#4B4C53 · pending ? #F6E9F7/#6B2170 (dashed border)
Radius      xs 4 · sm 6 · md 8 (controls) · lg 12 (cards) · xl 16 (hero, sheets, modals) · full
Space       4px base: 2 4 6 8 12 16 20 24 32 40 48 64
Shadow      none (hairline) · sm (sticky) · md (popover/toast) · lg (modal/drawer)
Sizes       desktop control 40px · mobile control 48px · check-in hero 64px · row 48/40px
Motion      120ms hover · 180ms open · cubic-bezier(.2,.7,.2,1) · off under reduced-motion
Tailwind    bg-canvas bg-surface bg-sunken bg-raised text-ink text-ink-2 text-ink-3 border-line border-line-strong
            bg-brand hover:bg-brand-hover text-on-brand text-brand-ink bg-brand-subtle text-danger bg-danger-subtle
            bg-st-present-tint text-st-present-fg bg-st-present … (present|absent|late|halfday|leave|holiday|weeklyoff|pending)
            rounded-xs|sm|md|lg|xl shadow-sm|md|lg
```

### 9.2 Example prompts

- *"Build the employee mobile home per DESIGN.md §5.3 and §4.1. Use the check-in hero with hold-to-confirm, live clock in `clock` type, the 3-up today's numbers and the bottom tab bar. Tokens only."*
- *"Create the daily register table per DESIGN.md §4.2: sticky toolbar with date stepper, search, status filter chips; sticky header; tnum right-aligned In/Out/Worked columns; bulk bar on selection; skeleton, empty and error states; cards below 768px."*
- *"Implement the monthly calendar grid per DESIGN.md §4.3: sticky name column and header, 36px tinted cells with status letters, today column highlight, hatched weekly-off, tooltip on hover, keyboard navigation, legend above."*
- *"Make a StatusPill component that takes a status key and renders icon + word on its tint (or letter-only compact variant) exactly per §2.4 and §4.4."*
- *"Design the leave approval drawer per §4.5 with balance impact, team conflicts, approve/reject with a required reject comment, and the decided collapsed state."*

### 9.3 Checklist before shipping any screen

- [ ] Only tokens; no raw hex, no new shadows or fonts.
- [ ] Every number is `tabular-nums`; dates read `06 Nov 2026`, times `09:42 AM`.
- [ ] Every status has an icon + word (or letter) and passes in greyscale.
- [ ] One primary button per view.
- [ ] Loading, empty, error and disabled states exist.
- [ ] Works at 360px, has ≥44px targets, keyboard focus is visible, and it works in both themes.
