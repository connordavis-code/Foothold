# Handoff: Foothold — a quiet personal finance app

## Overview

**Foothold** is a personal finance app for people who want to feel grounded about their money — not gamified or hyped. The product's central metaphor is **terrain**: where you stand financially, mapped honestly, with a single position marker (the green dot) showing "you are here." Numbers are the protagonist; chrome is restrained; motion is purposeful and quiet.

This handoff covers a complete dashboard surface — seven distinct pages plus the global shell (sidebar, topbar, command palette, signature footer, theme system, tweaks panel).

## About the Design Files

The files in this bundle are **design references created in HTML, CSS, and React-via-Babel** — prototypes showing intended look and behavior. They are **not production code to copy directly**. Your task is to **recreate these designs in the target codebase's existing environment** (React/Next.js/SwiftUI/native/etc.) using its established patterns, component library, and conventions.

If no codebase environment exists yet, choose the most appropriate framework — for a fintech product, **Next.js + TypeScript + a real component library (Radix or Headless UI primitives + Tailwind, or shadcn/ui)** is a sensible default.

What to take from these files:
- **Visual fidelity** — colors, typography, spacing, layout, component anatomy
- **Interaction patterns** — hover states, transitions, the command palette behavior, the tweaks panel
- **Information architecture** — what lives on each page, how data is grouped, what's hierarchically important

What **not** to copy verbatim:
- The Babel-in-the-browser setup
- The single global stylesheet structure (use modules or a styling library appropriate to your stack)
- Inline `<script type="text/babel">` and the cross-file `Object.assign(window, …)` pattern
- The `__edit_mode_*` postMessage tweaks protocol (it's a prototyping affordance for the design tool)

## Fidelity

**High-fidelity.** Every screen is pixel-spec'd: final colors, typography, spacing, interactions, hover states, dark/light parity. Recreate pixel-perfectly using your codebase's libraries and patterns.

---

## Brand identity

### The Foothold mark

The logo is a **terrain contour** — three (sidebar) or five (full) gently undulating horizontal lines, with a single green dot positioned on the central ridge representing "you are here."

- **Sidebar/small**: 3 lines (top + middle + bottom), middle full opacity (1.0), top/bottom at 0.55, stroke width 3 / 3.4 / 3, dot on middle ridge — `<FootholdMark size={40} simplified/>`
- **Hero/large**: 5 lines with opacities `[0.4, 0.7, 0.95, 0.7, 0.4]`, stroke widths `[1.6, 1.6, 1.9, 1.6, 1.6]`, dot at coordinates `(2, -6)` with radius 4.5
- Render with `shapeRendering="geometricPrecision"`
- The dot is **always the brand green** (`--accent`); the lines are `currentColor` (adapt to theme)

### Voice & copy

Direct, calm, observational. Never hype-y. Examples from the product:
- Page subtitles read like quiet notes: *"Where your money is working. Quiet by design — markets move, but the plan doesn't."*
- Editorial moments use Fraunces italic for a literary, reflective feel ("This week, you held your line.")
- Empty states are poetic without being precious
- Footer signature: `42.3601° N · 71.0589° W · synced 19:17 EDT · v0.4` — cartographic, technical

---

## Design tokens

### Colors

Both themes share semantic role names; the values flip based on `data-theme` on `<html>`.

#### Dark theme (default)
```css
--bg:               #14130f   /* page background */
--bg-2:             #1c1a16   /* inset / sub-bg */
--surface:          #1f1d18   /* cards, surfaces */
--surface-2:        #25221c   /* elevated surfaces */
--text:             #ece7dc   /* primary text */
--text-2:           #b9b4a7   /* secondary text */
--text-3:           #807a6d   /* tertiary / muted */
--hairline:         rgba(236, 231, 220, 0.08)
--hairline-strong:  rgba(236, 231, 220, 0.16)
--accent:           #a8c298   /* brand green (the dot) */
--accent-strong:    #b6d3a3   /* hover / emphasis green */
```

#### Light theme
```css
--bg:               #f6f3ec
--bg-2:             #efece4
--surface:          #fbf9f3
--surface-2:        #f1ede4
--text:             #1d1c18
--text-2:           #57544c
--text-3:           #8a8579
--hairline:         rgba(29, 28, 24, 0.08)
--hairline-strong:  rgba(29, 28, 24, 0.18)
--accent:           #6f8c5c
--accent-strong:    #4d6c3c
```

#### Semantic accents
- **Warning / amber** — `#c08a4f` (used for drift alerts, danger zone, losses)
- **Cool / blue-gray** — `#9aacc4` (used for utilities, transportation, international stocks)
- **Status colors** — `connected` = brand green, `reauth` = amber, `disconnected` = `--text-3` at 50% opacity

### Typography

Three font families, used with strict purpose:

```css
--font-ui:      "Söhne", "Inter", system-ui, sans-serif;        /* UI chrome, labels */
--font-display: "Fraunces", "Iowan Old Style", Georgia, serif;   /* editorial moments only */
--font-mono:    "JetBrains Mono", "Söhne Mono", ui-monospace;    /* ALL numerals, codes */
```

**Usage rules:**
- **All numbers** (currency, percentages, dates, version strings) use `--font-mono` with `font-variant-numeric: tabular-nums` and `letter-spacing: -0.01em` to `-0.02em`
- **Fraunces italic** appears in: weekly brief, page section titles ("How it's distributed"), empty states, the signature footer's secondary text. Used as **editorial punctuation**, not for paragraphs.
- **Söhne/Inter** is the workhorse for everything else.
- **Page titles**: Fraunces 38–48px, italic, weight 400, letter-spacing -0.02em
- **Page eyebrow**: Söhne 11px, uppercase, letter-spacing 0.18em, color `--text-3`
- **Smallcaps utility**: Söhne 11px, uppercase, letter-spacing 0.14em, color `--text-3`, weight 500
- **Hero numerals** (dashboard, investments): mono `clamp(48px, 6.5vw, 72px)`, letter-spacing -0.035em, weight 400. Cents are 0.6em and `--text-2`. Dollar sign is `--text-3`.

### Spacing

Ad-hoc but consistent. Common values: `4 · 6 · 8 · 10 · 12 · 14 · 16 · 18 · 20 · 22 · 24 · 28 · 32 · 40`.

Page horizontal padding: `clamp(20px, 4vw, 40px)`.

### Border radius

```css
--r-card:   10px   /* cards, panels */
--r-btn:    6px    /* buttons, inputs */
--r-chip:   4px    /* category chips */
--r-pill:   11px   /* toggles */
```

### Shadows

Avoid. The app uses **hairline borders** (`1px solid var(--hairline)`) and **gentle elevations on hover only** (`0 1px 2px rgba(0,0,0,0.16)` on segment-control active states). No drop shadows on cards by default.

### Hairline rules

A defining visual element. Section dividers, card borders, table rows — all use 1px hairlines at low opacity. They create grid + rhythm without being heavy.

### Texture

Two subtle full-viewport background layers:
1. **Filmic grain** — fine fractal noise, `~10–13%` opacity, `mix-blend-mode: overlay` (dark) or `multiply` (light)
2. **Faint contour topography** — sweeping horizontal bands at `~7–9%` opacity, echoing the logo at page scale

These give the page a hand-printed quality without competing with content. Implement as fixed-position SVG or noise-PNG layers behind everything.

### Motion

- **Standard transitions**: 140–200ms, `ease` or `cubic-bezier(0.32, 0.72, 0.18, 1)`
- **Hero number count-up**: 1200ms on first paint, ease-out, mono digits animating from `$0` to final
- **Card stagger reveal**: 200ms each, 60ms intervals, `translateY(8px) → 0` + `opacity 0 → 1` on first paint
- **Position dot pulse**: 2s `box-shadow` halo expansion loop, brand green at 18% opacity
- **Hover lifts**: `translateY(-1px)` on buttons, `translateY(-2px)` on cards
- **Tab/segment-control**: `box-shadow` appears on the active pill; 140ms

---

## Layout & shell

### Sidebar (left, 220px)

Fixed-width vertical navigation.

- **Brand** at top: `<FootholdMark size={40} simplified/>` + wordmark
  - Variants: `serif` (Fraunces "Foothold"), `sans` (lowercase "foothold"), `mark-only`
  - Click triggers a 600ms pulse-and-lift animation on the contour
- **Nav groups**: Plan (Dashboard, Simulator, Goals, Recurring) and Records (Transactions, Investments, Settings)
  - Group label: smallcaps, `--text-3`, hairline above
  - Item: 13px `--text-2`, hover indents 2px + icon scales 1.05
  - Active: green dot at left edge (`8px` from edge), 10px additional left padding for icon, `--text` color
- **Footer area** at bottom: small status indicator

### Topbar

- **Crumb** — current page name, 13px `--text-2`
- **Search pill** — opens command palette on click. `<Icon name="search" size={14}/>` + placeholder "Search transactions, jump to a page…" + `⌘K` keyboard hint chip
- **Sync pill** — green pulsing dot + "Just now" timestamp
- **Theme toggle** — sun/moon icon button
- **Avatar** — single letter monogram

### Signature footer

Renders below page content. Hairline rule above, ~56px breathing room.

```
● connected · 3 sources          42.3601° N · 71.0589° W · synced 19:17 EDT · v0.4
```

- 11px mono, `--text-3`
- Pulsing green status dot on left
- Live time updates every 30s
- Wraps to two lines on narrow viewports

### Command palette (⌘K)

Modal overlay on `cmd/ctrl + K`.

- Centered, 580px wide, 60vh max
- Fuzzy-match across: pages (Dashboard, Simulator, Goals, …), recent transactions, common actions ("Toggle theme", "Disconnect Chase")
- Items grouped by section with smallcaps headers
- Arrow up/down navigate; enter activates; esc closes
- Backdrop is `rgba(0,0,0,0.4)` with backdrop-filter blur(8px)

---

## Pages

### 1. Dashboard

**Purpose**: At-a-glance financial state. The first thing the user sees.

**Layout** (top to bottom):
1. **Hero** — full-width card with terrain backdrop. Net worth as huge mono number. "You are here · {date}" caption next to pulsing dot. Delta (+$X.XX since last month) in green/amber.
2. **KPI strip** — 4 cards in a row: Cash flow this month · Drift index · Goals on track · Subscriptions active. Each: smallcaps label + mono number + tiny sparkline or trend arrow.
3. **Drift section** — list of unusual transactions Foothold flagged, with "Investigate" CTA per row. Editorial italic intro: "Three things broke pattern this week."
4. **Goals section** — top 3 goals with progress bars + ETA + "View all →" link
5. **Weekly Brief** — Fraunces italic editorial card with eyebrow "This week", lead paragraph, body text, sign-off. The emotional centerpiece.
6. **Recent activity** — list of last 5–6 transactions, hover indents

### 2. Simulator

**Purpose**: Project net worth forward under different scenarios.

**Layout**:
1. **Page head** — eyebrow "Forward look", title "Simulator"
2. **Hero** — Big number ($X.XX in 24 months), label, range
3. **Chart** — area chart, today's pulsing green dot at horizon, dotted vertical lines for goal milestones with small labels (e.g., "Emergency Fund · Feb '27"). Below the chart: scrubbable timeline.
4. **Scenario controls** — toggle which scenarios are layered: "Normal", "Trim recurring", "Big buy: $4k", "Job loss · 3mo", "Pause subscriptions"
5. **Assumptions panel** — disclosed inputs: monthly income, monthly spend baseline, savings rate, investment growth rate

### 3. Goals

**Purpose**: Long-term targets — emergency fund, down payment, sabbatical fund, etc.

**Layout**:
1. **Summary strip** — 4-column hairline-bordered: Active goals · Total target · Total saved · Avg progress
2. **Goal cards** — grid of goal cards, each with:
   - Title + emoji-free icon
   - Progress bar (segmented or smooth, brand green)
   - Mono current / target ($12,400 / $25,000)
   - ETA ("On track · arrives Mar 2027")
   - Status chip: "On track", "Behind", "Paused"
3. **+ New goal** card at end of grid

### 4. Recurring

**Purpose**: All recurring charges — known and detected.

**Layout**:
1. **Summary strip** — Monthly outflow ($X in green) · Annualized · Active count · Next charge date
2. **Tabs** — Active / Flagged / Snoozed
3. **Grouped list** by upcoming time window: "This week" → "Later this month" → "Next month", with subtotals per group
4. **Each row**: Merchant glyph (40px monogram square in brand color) · Name + category · Next charge date · Frequency · Mono amount · Trend arrow (↗/↘/—) · Inline action menu

Drift integration: flagged charges show inline notes ("not in subscription list").

### 5. Transactions

**Purpose**: Every charge, every credit. Searchable.

**Layout**:
1. **Summary strip** — Spend (4 columns: Spend · Income · Net · Showing count). Numerals are `nowrap` to prevent wrap of leading sign.
2. **Toolbar** — full-width search input + Category select + Account select
3. **Table** — date column (mono day + smallcaps weekday) · Merchant + raw uppercase descriptor · Color-coded category chip · Account · Mono amount (green for credits, default for debits, dimmed minus sign) · Flag column (recurring `↻`, flagged `!`, transfer `⇄`)
4. **Grouped by date** with day-net subtotal in each group header (gradient `var(--bg-2) → transparent`)

### 6. Investments

**Purpose**: Portfolio overview. Long-horizon, low-anxiety.

**Layout**:
1. **Hero** — portfolio value (mono hero-scale), gain/loss + % since cost basis, cost basis stat, holdings count
2. **Performance chart** — area chart, range tabs (1M/3M/6M/1Y/5Y), period change in green/amber
3. **Allocation** — segmented horizontal bar (US Stocks · International · Bonds · Cash) with hover-brighten, legend below with dot · name · % · $value
4. **Holdings** — toggleable Positions / Accounts view
   - **Positions table**: symbol · name · kind/account · shares · price · value · gain/loss with %
   - **Accounts cards**: one per brokerage, with totals + inline holdings list

### 7. Settings

**Purpose**: Preferences, connected institutions, account management.

**Layout**:
- **Two-column shell**: 220px sticky side-rail + body
- **Side rail**: 7 sections — Profile · Connected accounts · Notifications · Preferences · Privacy & security · Data & export · Danger zone (separated by hairline). Active item shows expanded brand green dot.
- **Section bodies** use cards with hairline borders, hairline-divided rows, and:
  - **Profile**: 72px gradient avatar + name/email/timezone fields, save/discard
  - **Connected accounts**: list of institutions with logo monogram + status pill (Synced/Needs reauth/Disconnected) + Manage/Reconnect button
  - **Notifications**: 5 toggles with descriptive subtext
  - **Preferences**: density segment, currency, date format, week-start, sync frequency
  - **Privacy & security**: biometric, 2FA toggles + active sessions / change password rows
  - **Data & export**: CSV export, tax package, JSON snapshot
  - **Danger zone**: amber-tinted card with disconnect / reset / delete actions

### Toggle switch

Custom switch component used throughout settings.

- 38×22px pill, 11px radius
- Background: `--hairline` (off) → `--accent-strong` (on)
- Knob: 18×18px circle, 1px shadow, translates 16px on activation
- 180ms `cubic-bezier(0.32, 0.72, 0.18, 1)` for the knob slide

---

## Interactions

- **Hover lifts** on every interactive card and button (1–2px translateY, +1 brightness on borders)
- **Active sidebar** route: green dot indicator at left edge + nav item indents
- **Position dot pulse**: 2s loop on the brand mark in hero contexts and the topbar sync pill
- **Search pill click**: opens command palette (also `cmd/ctrl + K`)
- **Theme toggle**: instant flip; persists to `localStorage` under key `foothold-theme`
- **Clickable logo**: 600ms pulse animation
- **Tweaks panel** (the floating panel): user-facing customization — primary color swatches, hero variant cycle, chart style. Implementation is design-tool-specific and can be omitted in production unless theming is a real product feature.

---

## State management

For each page, the state needed:

- **Dashboard**: `heroVariant` (visual variant cycle), data fetched from sync layer
- **Simulator**: `scenarios` (which are toggled on), `range`, `assumptions` object
- **Goals**: list of goal objects with `target`, `current`, `eta`, `status`
- **Recurring**: list of recurring rules with `merchant`, `amount`, `frequency`, `nextCharge`, `flagged`, `category`
- **Transactions**: filter state (`q`, `cat`, `acct`), paginated transaction list
- **Investments**: `range`, `view` (holdings vs accounts), holdings array
- **Settings**: forms state — profile, connected accounts, prefs object with toggles + selects
- **Global**: `theme` (dark/light), `route` (current page), `cmdkOpen` (boolean)

Real implementations should use the codebase's existing data layer (React Query, SWR, RTK Query, etc.) for sync state, and a router (Next.js routing or similar) for navigation.

---

## Assets

- **No external image assets.** All iconography is inline SVG (Lucide-style outline icons; see `foothold-shared.jsx` `Icon` component for the inventory). Production should use Lucide React or similar.
- **Fonts** — load Fraunces from Google Fonts (or licensed Söhne if available); JetBrains Mono from Google Fonts; system fallbacks for Söhne.
- **Logo** — recreate `FootholdMark` as a component in your stack. Two render modes: `simplified` (3 curves, sidebar use) and full (5 curves, hero use). See `foothold-shared.jsx` for exact path data.

---

## Files in this bundle

| File | Contents |
|---|---|
| `index.html` | Root document, font/script loading |
| `styles.css` | All visual tokens, layout CSS, component styles |
| `foothold-shared.jsx` | `FootholdMark`, `ContourBackdrop`, `Icon`, formatting helpers |
| `foothold-app.jsx` | Shell — sidebar, topbar, route switching, signature footer |
| `foothold-dashboard.jsx` | Dashboard page |
| `foothold-simulator.jsx` | Simulator page + chart |
| `foothold-goals.jsx` | Goals page |
| `foothold-recurring.jsx` | Recurring page |
| `foothold-transactions.jsx` | Transactions page |
| `foothold-investments.jsx` | Investments page + allocation + chart |
| `foothold-settings.jsx` | Settings page (all 7 sections) |
| `foothold-cmdk.jsx` | Command palette (⌘K) |
| `tweaks-panel.jsx` | Design-tool tweaks UI (omit in production) |
| `design-system.html` | **Standalone design-system reference** — all tokens, type, components, screens in one viewable doc. Open this first. |
| `screens/` | PNG screenshots of all seven pages (`01-dashboard.png` through `07-settings.png`) |

To view the prototype locally: open `index.html` in a browser. Babel + React are loaded from CDNs; no build step.

---

## Implementation notes

1. **Don't ship the texture as PNGs** — implement noise via SVG `<feTurbulence>` filter at low opacity, fixed-position. It's a few lines of CSS and avoids asset bloat.
2. **Tabular numerals are non-negotiable** — `font-variant-numeric: tabular-nums` on every monospace numeric element. The whole product breathes because numbers align in columns.
3. **The hairline aesthetic** depends on getting `1px solid` borders at the right opacity. Don't substitute with shadows; don't go darker.
4. **Italic Fraunces should appear sparingly** — overuse undoes its specialness. Roughly 1–2 instances per page, max.
5. **The position dot is the brand** — every screen needs at least one. Topbar sync pill, hero "you are here", active sidebar item, signature footer.
6. **Settings danger zone**: keep it amber-tinted, never red. Red is too aggressive for a calm product.
