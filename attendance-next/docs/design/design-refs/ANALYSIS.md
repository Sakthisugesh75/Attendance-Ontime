# Design reference analysis: Attendance Desk

## 1. Intro

This document compares six reference design-system extractions in `design-refs/`: **Linear**, **Cal.com**, **Airtable**, **Wise**, **Intercom** and **Notion**. The goal is an original design system for **Attendance Desk**, a multi-tenant attendance SaaS for small and mid-size Indian companies. It covers check-in/out, the daily register, late/early/absent tracking, leave approvals, shifts, monthly Excel/PDF reports and settings. Stack: Next.js + Tailwind.

Two user types drive every decision:

- **HR / admin / owner (desktop):** uses it daily for dense data review (registers, monthly grids), approvals and exports. Needs scan speed, tabular numbers, compact rows and clear status colour.
- **Employee (mobile, 360px+):** checks in and out with one tap, views their own attendance and applies for leave. Many are not tech-savvy. Needs large targets, plain labels, high contrast and no hidden gestures.

**Important caveat:** all six files describe **marketing sites**, not product UIs. Data tables, calendars, sidebars and bottom navigation are mostly absent or only "illustrative". Where a file says nothing, the table below says **not specified**. Contrast ratios marked *(computed)* are WCAG calculations on the file's hex values, not claims made by the files.

---

## 2. Reference summaries

**Linear:** a dark-only system.
- **Colours:** near-black canvas `#010102`, a four-step surface ladder (`#0f1011` → `#141516` → `#18191a` → `#191a1b`) and hairlines `#23252a` / `#34343a` / `#3e3e44`.
- **Text:** `#f7f8f8`, muted `#d0d6e0`, subtle `#8a8f98`, tertiary `#62666d`.
- **Accent:** a single lavender-blue `#5e6ad2` (hover `#828fff`), used only on the primary CTA, brand mark, focus ring and links. The only semantic colour is success `#27a644`.
- **Type:** proprietary Linear Display/Text/Mono, falling back to SF Pro Display; the file suggests Inter or Geist as free substitutes.
  - Body 16px/1.5, body-sm 14px, caption 12px, buttons 14px/500.
  - Display at weight 600, with tracking down to −3px at 80px.
- **Shape and spacing:** radii 4/6/8/12/16/24px plus pill (8px buttons and inputs, 12px cards). 4px spacing base; compact buttons (8px 14px).
- **Depth:** the surface ladder plus hairlines. The file says it "resists drop shadows on dark almost entirely".
- **Focus:** a 2px `#5e69d1` ring at 50% opacity.

**Cal.com:** white canvas `#ffffff` with a near-black primary.
- **Colours:** primary `#111111` (pressed `#242424`).
  - Text: body `#374151`, muted `#6b7280`, muted-soft `#898989`.
  - Surfaces: hairline `#e5e7eb`, card fill `#f5f5f5`, dark footer `#101010`.
  - Links: blue `#3b82f6`, used sparingly.
- **Semantic set:** success `#10b981`, warning `#f59e0b`, error `#ef4444`. Pastel badges: `#fb923c`, `#ec4899`, `#8b5cf6`, `#34d399`.
- **Type:** proprietary Cal Sans for display (600, −0.5 to −2px tracking) and Inter for all UI. Body 16px/1.5, buttons 14px/600, captions 13px/500.
- **Shape:** 8px buttons and inputs, 12px cards, 16px hero mockup, pill badges, full avatars. Buttons and inputs are 40px tall.
- **Depth:** soft, explicit shadows: `0 1px 2px rgba(0,0,0,0.05)` and `0 4px 12px rgba(0,0,0,0.08)`.
- **Signature component:** a segmented "nav-pill-group".

**Airtable:** white canvas `#ffffff`, with near-black `#181d26` as both ink and primary CTA (pressed `#0d1218`).
- **Neutrals:** body `#333840`, muted `#41454d`, hairline `#dddddd`, soft surface `#f8fafc`, strong surface `#e0e2e6`.
- **Accent colours:** links `#1b61c9`, info `#254fad` / `#458fff`, success `#006400` / `#39bf45`.
- **Signature cards:** large colour cards punctuate the page (coral `#aa2d00`, forest `#0a2e0e`, cream `#f5e9d4`, plus peach, mint, yellow and mustard).
- **Type:** proprietary Haas Groot Disp / Haas Grotesk at modest weights (display 400–500). Body 14px/1.25, buttons 16px/500. Pricing uses a separate Inter Display (475) sub-system.
- **Shape:** 2px legal, 6px inputs, 10px content cards, 12px primary buttons and big cards; pill only on pricing. Primary buttons ≥48px, inputs 44px.
- **Depth:** "colour-block first, shadow second", with a 2px blue focus ring.
- **Most app-like parts:** a 240px left filter rail, and a pricing comparison table with 12px rows and plan headers that stay visible when scrolling horizontally.

**Wise:** a lime-green primary `#9fe870` with dark text `#0e0f0c`.
- **Colours:** active `#cdffad`, neutral `#c5edab`, pale `#e2f6d5`. Sage canvas `#e8ebe6` with white `#ffffff` cards. Ink `#0e0f0c`, body `#454745`, mute `#868685`.
- **Semantic palette (the richest of the six):**
  - Positive `#2ead4b` / `#054d28`.
  - Warning `#ffd11a` / `#b86700`, with content colour `#4a3b1c`.
  - Negative `#d03238` / `#a72027` / `#a7000d`, with background `#320707`.
- **Type:** proprietary Wise Sans at weight 900 for heroes (64–126px); Inter 600 for sub-displays; Inter for all body (16px/24px, 14px/20px, caption 12px/16px, buttons 16px/600).
- **Shape:** radii 8/12/16/24px plus pill. **24px is the canonical button and card radius**; inputs are 12px. Buttons are ~48px tall.
- **Depth and borders:** elevation is surface contrast (white on sage). Inputs and tertiary buttons use 1px ink borders.
- **Spacing:** 4px base, starting at 2px.
- **Unique content:** the only file with explicit positive/negative status badges; it also has an illustrative data-table cell and sidebar row.

**Intercom:** a warm cream canvas `#f5f1ec` with white `#ffffff` floating cards.
- **Colours:** alternate surface `#ebe7e1` (also used for "alt-row stripes"), warm hairline `#d3cec6`.
  - Text: charcoal `#111111` is the system primary; muted `#626260`, subtle `#7b7b78`, tertiary `#9c9fa5`.
  - Reserved and report colours: Fin Orange `#ff5600` is kept for one product. A "report palette" (`#65b5ff`, `#0bdf50`, `#ff2067`, `#b3e01c`, `#03b2cb`) appears only inside product mockups.
  - Semantic: error `#c41c1c`, success `#0bdf50`.
- **Type:** proprietary Saans / SaansMono; the file suggests Inter at 500 as the closest free substitute. Display weight 500 with tracking down to −2px. Body 16px/1.5, buttons 15px/500. Eyebrows are sentence case, never all-caps.
- **Shape:** 4px chips, 8px buttons and inputs, 12px cards, 16px mockups, pill tabs. 8px spacing base; buttons use 10px 18px padding.
- **Depth:** no drop shadows; white on cream.

**Notion:** a warm paper canvas `#f6f5f4` with white `#ffffff` cards and fields.
- **Colours:** hairline `#e6e6e6`, ink `#000000` (rendered at ~95% alpha), secondary text `#31302e`, muted `#615d59`, faint `#a39e98`.
- **Accent:** a single structural blue `#0075de` (pressed `#005bab`) for CTAs, links and active/focus states, plus a one-off indigo hero `#213183`.
- **Decoration:** a decorative-only "sticker" palette (sky `#62aef0`, purple `#d6b6f6`, pink `#ff64c8`, orange `#dd5b00`, teal `#2a9d99`, green `#1aae39`, brown `#523410`). The file states there is no semantic error/success palette.
- **Type:** NotionInter, a proprietary tuning of Inter, with `lnum` enabled. Headings 700 with tight tracking. Body 16px/1.5, a **15px/1.33 "dense body, table rows, nav"** role, captions 14px, eyebrows 12px/600.
- **Shape:** 4px inputs, 5px list rows and status pills, 8px utility buttons, 12px cards, 16px large containers, full pill CTAs. 8px spacing base, topping out at 32px.
- **Depth:** a hairline plus a barely-there multi-layer shadow. Level 1 ends at `rgba(0,0,0,0.04) 0 4px 18px`; Level 2 at `rgba(0,0,0,0.05) 0 23px 52px`.

---

## 3. Comparison table

| Topic | Linear | Cal.com | Airtable | Wise | Intercom | Notion | **Best for Attendance Desk** |
|---|---|---|---|---|---|---|---|
| **Color approach** | Dark-only. Canvas `#010102` plus a 4-step surface ladder. One accent, `#5e6ad2`. Only semantic colour is success `#27a644`. | White canvas, near-black primary `#111111`. Sparse blue `#3b82f6` for links. Semantic set `#10b981`/`#f59e0b`/`#ef4444`. Pastel badges. | White, near-black primary `#181d26`. Link blue `#1b61c9`. Loud full-bleed "signature" cards (coral `#aa2d00` etc.). | Lime primary `#9fe870` on sage `#e8ebe6`, white cards. Full semantic ramps (positive, warning, negative), each with deep/content variants. | Cream `#f5f1ec`, white cards. Charcoal primary `#111111`. Orange `#ff5600` reserved for one product. | Warm paper `#f6f5f4`. One structural blue `#0075de`. Decorative sticker palette. No semantic palette. | **HR:** Cal.com: neutral chrome, one action colour, semantic set ready for status. **Mobile:** Wise: explicit semantic ramps with deep text on a tint, ideal for Present/Late/Absent at a glance. |
| **Typography** | Proprietary Linear Display/Text. Body 16px, sm 14px, caption 12px. Display 600, tracking to −3px. | Cal Sans (proprietary) for display, Inter for UI. Body 16px, button 14px/600, caption 13px/500. | Proprietary Haas. Body **14px/1.25**. Display 400–500 (never bold). Pricing uses Inter Display 475. | Proprietary Wise Sans 900 for heroes. Inter for UI: 16/24, 14/20, 12/16. Buttons 16px/600. | Proprietary Saans. Display 500. Body 16px, button 15px/500. Sentence-case eyebrows. | NotionInter (Inter tuning), `lnum` on. Headings 700. Body 16px, **dense 15px/1.33 for table rows**, caption 14px. | **HR:** Notion: an explicit dense table-row size on an Inter base. **Mobile:** Wise: 16/24 body and 16px/600 buttons read clearly for non-technical users. |
| **Spacing** | 4px base. Tokens 4–48px, 96px section. Card padding 24px. Inputs 8px 12px. | 4px base. 4–48px, 96px section. Card padding 24–32px. Gutters 24px. | 4px base. 4–48px, 96px section. Card padding 16–48px. Gutters 24px/16px. | 4px base, from **2px**: 2/4/8/12/16/24/32/48. Card padding 24px. Section 48px. | 8px base. 4–48px, 96px section. Card padding 24–48px. | 8px base. 4/8/12/16/24/28/32. Card padding 24px. Inputs 6px. | **HR:** Linear: compact 4px scale with tight control padding. **Mobile:** Wise: a 2px micro-step and 48px max suit small screens better than 96px marketing gaps. |
| **Radius** | 4/6/8/12/16/24/pill. Buttons and inputs 8px, cards 12px. | 4/6/8/12/16/pill. Buttons and inputs 8px, cards 12px. "No radius beyond 16px on cards". | 2/6/10/12/pill. Inputs 6px, cards 10px, primary buttons 12px. | 8/12/16/24/pill. **24px canonical** for buttons and cards. Inputs 12px. | 4/6/8/12/16/24/pill. Buttons and inputs 8px, cards 12px. | 4/5/8/12/16/full. Inputs 4px, list rows 5px, utility buttons 8px, cards 12px. | **HR:** Cal.com/Linear: 8px controls and 12px cards look professional at density. **Mobile:** Wise-leaning: a larger radius (16px) on the check-in button and cards feels friendly and tappable. |
| **Shadows** | Almost none. Depth from the surface ladder and hairlines, plus a faint top-edge highlight. | Soft: `0 1px 2px rgba(0,0,0,.05)` and `0 4px 12px rgba(0,0,0,.08)` on elevated cards. | Minimal. Faint blue-tinted glow under the primary button. Colour-block depth. | None formal; white-on-sage contrast is the elevation. Examples mention shadows on modals and toasts without values. | None ("resists drop shadows"). White-on-cream contrast. | Hairline plus multi-layer micro-shadow (L1 ends `0 4px 18px @.04`, L2 ends `0 23px 52px @.05`). | **HR:** Notion: hairline by default, layered micro-shadow only for popovers and modals. **Mobile:** Cal.com: one small, explicit shadow lifts the check-in card without noise. |
| **Tables** | Not specified. Only a changelog row: 24px vertical padding, hairline bottom rule. | Not specified. Hairline `#e5e7eb` listed for "table dividers". | Pricing comparison row: **12px padding, hairline `#dddddd`**, 14px text. Scrolls horizontally below 1024px with plan headers kept visible. | Illustrative `ex-data-table-cell`: header bg `#e8ebe6`, header 12px caption, body 14px/20px, cell padding 12px 16px. | Not specified. `#ebe7e1` noted for "alt-row stripes". | Illustrative `ex-data-table-cell`: header `#f6f5f4`, 12px/600 eyebrow header, 15px body, padding 12px 16px, hairline rows. | **HR:** Airtable + Notion: 12px rows, hairline dividers, tinted header, headers that stay visible on horizontal scroll (monthly register). **Mobile:** none cover mobile tables. Convert rows to stacked cards, as Notion and Airtable do for pricing. |
| **Calendars / date pickers** | Not specified. | Calendar widgets shown only as product imagery in cards. The booking-widget spec is "out of scope". No tokens. | Not specified. | Not specified. | Not specified. | Not specified. | **Both:** no reference specifies one, so we design our own (see Synthesis). Cal.com only shows that calendar UI reads well inside 12–16px-radius cards. |
| **Forms** | Input bg `#0f1011`, 8px radius, 8px 12px padding. Focus 2px `#5e69d1` @50%. ≥44px on touch. Errors not documented. | White, 1px `#e5e7eb`, 8px radius, 10px 14px, **40px tall**. Focus border becomes `#111111`. Error `#ef4444`. | White, 1px `#dddddd`, 6px radius, 12px 16px, **44px tall**. Focus border `#458fff`. | White, **1px ink `#0e0f0c` border**, 12px radius, 12px 16px, 16px text. | White on cream, 8px radius, 10px 14px. ≥44px on touch. Errors not documented. | White, 1px `rgb(221,221,221)`, 4px radius, 6px padding, 15px. Focus adds a micro-shadow. | **HR:** Cal.com: 40px inputs, quiet hairline, clear focus. **Mobile:** Airtable/Wise: 44px+ height and 16px text, with a strong Wise-style border, for low-literacy users. |
| **Buttons** | `#5e6ad2`, 14px/500, 8px 14px, 8px radius. Hover `#828fff`. ≥40px. | `#111111`, 14px/600, 12px 20px, **40px**, 8px radius. Pressed `#242424`, disabled `#e5e7eb`. | `#181d26`, 16px/500, 16px 24px, 12px radius, **≥48px**. One primary per viewport. White outline secondary. | `#9fe870` with dark text, 16px/600, 12px 24px, 24px radius, **~48px**. Sage secondary, ink-outline tertiary. | `#111111`, 15px/500, 10px 18px, 8px radius. White hairline secondary. | `#0075de` full pill, 16px/500. Utility: 8px radius, 4px 14px, hairline. Press `scale(0.9)`. | **HR:** Cal.com: 40px, 8px radius, a clear primary/secondary/disabled set. **Mobile:** Wise/Airtable: 48px+, 16px/600 labels, one primary per screen. |
| **Status badges** | `status-badge`: bg `#141516`, text `#d0d6e0`, 12px, pill, 2px 8px. Monochrome. | `badge-pill`: `#f5f5f5` or pastel fill, text `#111111`, 13px/500, pill, 4px 12px. | Not specified as a component. Semantic info/success pairs only, plus a count badge on the filter rail. | `badge-positive`: bg `#e2f6d5`, text `#054d28`, 14px/600, pill, 4px 12px. `badge-negative`: bg `#320707`, white text. | Not specified. Radius token 4px for "chips, badges". | `badge-pill`: white bg, `#0075de` text, 12px/600, 4px 8px. Status pills at 5px radius. No semantic colours. | **Both:** Wise: a tinted background with deep same-hue text is the most legible status pattern. Use it for every attendance state, always with a text label. |
| **Navigation (desktop sidebar + mobile bottom nav)** | Top nav 56px; hamburger below 768px. Sidebar and bottom nav: not specified. | Top nav 64px. Segmented `nav-pill-group` (bg `#f8f9fa`, 6px padding, active white with shadow). Full-screen sheet below 768px. Sidebar and bottom nav: not specified. | Top nav 64px. **240px left `topic-filter-rail`** with a count badge. Full-screen sheet below 768px. Bottom nav: not specified. | Nav bar 12px 24px padding. Illustrative sidebar row: 8px radius, 12px 16px padding, active indicator `#9fe870`. Bottom nav: not specified. | Top nav 56px. Hamburger below 768px; the primary CTA stays visible. Sidebar and bottom nav: not specified. | Nav bar 16px padding, 15px text. Illustrative sidebar row: 5px radius, 12px 16px padding, active indicator `#0075de`. Bottom nav: not specified. | **HR:** Airtable's 240px rail width plus the Notion/Wise row spec (12px 16px, accent active indicator), with count badges for pending approvals. **Mobile:** no reference specifies a bottom nav. Use Cal.com's segmented control for in-page tabs (Today / History / Leave). |
| **Density** | Compact controls and a "dense, technical" voice, but marketing sections 96px apart. | Generous: "never densely packed lists", 32px card padding. | Tight 14px/1.25 body and 12px table rows, but 96px sections. | Spacious marketing scale: 48px sections, 24px card padding. | Airy: 96px sections, 24–48px cards. | Document-airy, but defines 15px/1.33 dense rows and 4px 14px utility buttons. | **HR:** Notion + Airtable: compact type and row specs. **Mobile:** Wise: roomy cards and big buttons. |
| **Accessibility** | CTAs ≥40px, tabs ≥36px (≥44px on touch), inputs ≥44px. Visible focus ring. Dark-only. | Buttons ≥40px. Icon buttons 36px (the file admits under 44). Inputs 40px. `#898989` captions ≈3.5:1 on white *(computed)*. | Buttons ≥48px ("above WCAG AAA 44"). Inputs 44px. Icon buttons 40px. 2px blue focus ring. | Buttons ~48px, "WCAG AAA at all widths". Dark text on lime. Mute `#868685` ≈3.4:1 on white *(computed)*. | CTAs ≥40px, tabs ≥40px, inputs ≥44px. | Aims for a 44×44 hit area. Faint `#a39e98` ≈2.7:1 on white *(computed)*, too low for text. | **HR:** Linear: an explicit 2px focus ring, essential for keyboard-heavy admins. **Mobile:** Wise/Airtable: 48px targets. Avoid the light-grey text tokens of Cal.com and Notion. |

---

## 4. What to take / what to avoid

### Linear
- **Take:** the surface-ladder idea for **dark mode**: 3–4 stepped surfaces plus hairlines instead of shadows.
- **Take:** a visible focus ring (2px accent at ~50% opacity) on every interactive element.
- **Take:** compact control padding (8px 14px buttons, 8px 12px inputs) for the HR desktop density mode.
- **Avoid:** dark-only, near-black `#010102` as the default. HR users work in daylight offices and need a light default.
- **Avoid:** using the single-accent rule to suppress semantic colour. Attendance status needs red, amber and green, which Linear's file explicitly avoids.

### Cal.com
- **Take:** a near-monochrome action layer (one dark or brand primary, a quiet secondary) plus a separate semantic set.
- **Take:** 40px buttons and inputs with an 8px radius, and 12px cards: the right weight for a desktop admin panel.
- **Take:** the segmented pill control (`nav-pill-group`) for Today / Week / Month and status filters.
- **Take:** small, explicit shadows (`0 1px 2px` / `0 4px 12px` at low alpha) for cards that must lift.
- **Avoid:** a proprietary display face (Cal Sans). Also avoid `#898989` text and 36px icon buttons, which fall short on contrast and target size.

### Airtable
- **Take:** the comparison-table spec: 12px row padding, hairline dividers, headers that stay visible when the table scrolls horizontally. This maps directly to the monthly register.
- **Take:** a 240px left rail with count badges, as a model for the HR sidebar (e.g. "Leave requests 4").
- **Take:** ≥48px primary buttons and 44px inputs for the mobile flows.
- **Avoid:** loud full-bleed signature cards (coral, forest) and pastel demo surfaces. They are marketing flourishes that would compete with the status colours.
- **Avoid:** a 14px/1.25 body as a general rule. It is too tight for paragraphs and for non-technical mobile readers.

### Wise
- **Take:** the semantic ramp structure: base, deep and content colours for positive, warning and negative. Badges use a tinted background with deep text (`#e2f6d5` / `#054d28`).
- **Take:** the rule "never repurpose the brand colour as success". Keep the brand colour and Present-green separate.
- **Take:** 48px-tall buttons with 16px/600 labels, and inputs with strong borders, for employees on phones.
- **Take:** a tinted table header, and a sidebar active indicator in the accent colour.
- **Avoid:** a 24px radius everywhere, weight-900 display type, and lime as the primary on white. Lime relies on dark text and reads as consumer fintech.

### Intercom
- **Take:** a warm-neutral canvas with white cards and depth without shadows. It is calm for all-day use.
- **Take:** sentence-case eyebrows (no tracked all-caps), which are friendlier for non-technical users.
- **Take:** the rule that a reserved product colour never appears with the primary CTA in the same view. The same applies to our export and check-in emphasis.
- **Avoid:** a cream canvas as warm as `#f5f1ec`, where the amber and green status tints lose clarity.
- **Avoid:** reliance on a proprietary face (Saans), and the lack of any documented error or validation styling.

### Notion
- **Take:** a 15px "dense body" role for table rows, and a tinted table header with a 12px/600 label.
- **Take:** a hairline by default, with multi-layer micro-shadows only for popovers, menus and modals.
- **Take:** a single structural accent for primary actions, links and active/focus states, with nothing decorative.
- **Take:** `lnum` (lining numerals). We extend this to `tnum` for registers.
- **Avoid:**
  - Having no semantic palette.
  - `#a39e98` faint text (≈2.7:1).
  - Inputs with 4px/6px padding, which are too small for touch.
  - Full-pill marketing CTAs inside an app.

---

## 5. Synthesis direction (original system, no brand copying)

1. **Light-first, warm-cool neutral base with a true dark mode.** An off-white app canvas (e.g. `#f7f7f5`), white cards and fields, and a soft hairline (~`#e4e4e0`). Dark mode uses a 3–4 step surface ladder with hairlines instead of shadows. Both themes ship from day one.
2. **One structural brand accent, distinct from every status colour.** Choose a confident, trustworthy hue that does not collide with green, amber or red, e.g. a deep indigo-blue (~`#3b4fd8`) or teal-blue (~`#0b6e99`). Use it only for the primary action, links, the active nav item and focus, never for status.
3. **A dedicated attendance status palette: tint background, deep text and a label.**
   - Present: green. Late: amber. Early-out: orange. Absent: red.
   - On leave: violet/blue. Holiday and Weekly off: neutral grey. Half-day: split or light amber.
   - Each status gets a base colour, a 10–15% tint and a deep text tone (≥4.5:1 on its tint).
   - Badges always carry text (or a one-letter code such as P/L/A in grids), never colour alone.
4. **A free font with real tabular figures.** Checked on 2026-11-06 against the Google Fonts TTF files:
   - **Inter**, **Geist**, **Manrope**, **Plus Jakarta Sans**, **Figtree** and **Onest** all have a `tnum` feature.
   - **IBM Plex Sans** digits are tabular by default (no `tnum`/`pnum` needed).
   - **DM Sans** has neither, and its digits are proportional, so avoid it for numeric UI.
   - Recommendation: **Inter** (or **Geist**) everywhere, with `font-variant-numeric: tabular-nums` (Tailwind `tabular-nums`) on all times, durations, counts and register cells. Display headings can optionally use Manrope or Plus Jakarta Sans.
   - Proprietary faces in the references (do not use): Linear Display/Text/Mono, Cal Sans, Haas Groot Disp / Haas Grotesk, Wise Sans, Saans / SaansMono, NotionInter. NotionInter is a tuned Inter, so plain Inter is fine.
5. **Two type scales: dense desktop and comfortable mobile.**
   - Desktop: 14px UI body, 13–14px table cells, 12px/600 sentence-case column headers, 20–24px page titles at weight 600. Mild negative tracking only at ≥24px.
   - Mobile: 16px body and **16px input text** (prevents iOS zoom), 16px/600 buttons, 28–32px for the live clock and check-in time.
6. **Radius scale 6 / 8 / 12 / 16 / full.**
   - 8px buttons and inputs, 12px cards and panels, 16px for the mobile check-in hero card and bottom sheets.
   - Full pill for status badges and avatars.
   - No 24px radius everywhere and no pill CTAs on desktop.
7. **Elevation: hairline first.**
   - Cards: a 1px hairline, no shadow.
   - Sticky headers, dropdowns and popovers: a soft two-layer shadow (~`0 1px 2px rgba(0,0,0,.05), 0 4px 12px rgba(0,0,0,.08)`).
   - Modals and sheets: one deeper layer. Never heavy or coloured glows.
8. **Data tables for HR.**
   - Rows: 40px compact or 48px comfortable (user toggle), 12px 16px cell padding, hairline row dividers.
   - Header: tinted and sticky. The horizontally scrolling monthly register also has a sticky first column (employee name).
   - Numbers right-aligned with `tabular-nums`. Row hover tint, bulk-select checkboxes, inline approve/reject for leave.
   - Below 768px, rows become stacked cards.
9. **Mobile employee home: one giant action.**
   - A full-width check-in/out button, 56–64px tall (or a circular target of 120px+), shows the current state, the live time and the shift (e.g. "Check in · General shift 9:30").
   - Confirm with a success state and a timestamp that stays on screen, not a toast that vanishes.
   - All tap targets ≥48px; primary labels are plain words (no icon-only actions); one primary action per screen.
10. **Navigation.**
    - Desktop: a 240px collapsible left sidebar.
      - Rows 36–40px with 12px 16px padding and an accent active indicator (left bar or tinted fill).
      - Grouped sections: Today, Attendance, Leave, Shifts, Reports, Settings.
      - Count badges for pending approvals.
    - Mobile: a fixed bottom nav with 4–5 items (Home, History, Leave, Profile), ~64px tall plus the safe-area inset, with an icon *and* a text label on every item.
    - In-page views (Day/Week/Month, status filters) use a segmented pill control.
11. **Calendars and date pickers (none of the references specify one, so this is our own).**
    - Month grid cells: 40px on desktop, ≥44px on mobile.
    - Each day shows a status dot or letter in the status palette. Today has an accent ring. Weekends and holidays are filled muted grey.
    - A selected leave range is highlighted in the leave tint.
    - Pickers open as a popover on desktop and a bottom sheet on mobile, with quick chips ("Today", "Yesterday", "This month").
12. **Accessibility and trust baseline.**
    - Body text ≥4.5:1. Muted text no lighter than ~`#6b6b66` on white. Never use the very light greys seen in some references for readable text.
    - A visible 2px accent focus ring at ~50% opacity, with an offset.
    - Respect `prefers-reduced-motion`.
    - Indian formats: DD MMM YYYY, 12-hour time with AM/PM, ₹ where relevant.
    - Empty and error states in plain language, with a single next action.
