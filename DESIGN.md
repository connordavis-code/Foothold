---
name: Foothold
description: Editorial-tier personal finance source-of-truth — warm-paper canvas, JetBrains Mono numerals, deep-green hero gradient
colors:
  # Brand surfaces (the warm-paper canvas + elevated cards)
  surface-paper: "#FAF8F0"
  surface-elevated: "#FFFFFF"
  surface-sunken: "#F0EFEA"
  hero-green-deep: "#1B402F"
  hero-green-mid: "#335547"
  # Foreground / neutrals
  foreground: "#0F172A"
  muted: "#F1F5F9"
  muted-foreground: "#64748B"
  border: "#E2E8F0"
  ring: "#A4B0C0"
  # Semantic
  positive: "#16A34A"
  negative: "#E03737"
  destructive: "#FF0000"
  elevated-amber: "#F59E0B"
  # Chart palette (160-hue greens + warm earth tones; matte, never neon)
  chart-1-forest: "#267452"
  chart-2-sage: "#5AAB89"
  chart-3-teal: "#428A8A"
  chart-4-gold: "#BF993F"
  chart-5-terracotta: "#C77445"
  chart-6-slate-blue: "#6F87B0"
typography:
  display:
    fontFamily: "Inter, var(--font-sans), system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Inter, var(--font-sans), system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.005em"
  title:
    fontFamily: "Inter, var(--font-sans), system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 500
    lineHeight: 1.4
  body:
    fontFamily: "Inter, var(--font-sans), system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Inter, var(--font-sans), system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.3
  eyebrow:
    fontFamily: "Inter, var(--font-sans), system-ui, sans-serif"
    fontSize: "10px"
    fontWeight: 500
    letterSpacing: "0.08em"
  numeral:
    fontFamily: "JetBrains Mono, var(--font-mono), ui-monospace, monospace"
    fontSize: "0.875rem"
    fontWeight: 500
    fontFeature: "'tnum' 1"
  narrative:
    fontFamily: "Source Serif 4, var(--font-serif), Georgia, serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.6
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  card: "12px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  card-editorial:
    backgroundColor: "{colors.surface-elevated}"
    rounded: "{rounded.card}"
    padding: "20px"
  card-hero-gradient:
    backgroundColor: "{colors.hero-green-deep}"
    textColor: "#FFFFFF"
    rounded: "{rounded.card}"
    padding: "24px"
  button-primary:
    backgroundColor: "{colors.foreground}"
    textColor: "{colors.surface-elevated}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "40px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "40px"
  pill-chip:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.muted-foreground}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  table-row-operator:
    backgroundColor: "{colors.surface-elevated}"
    typography: "{typography.numeral}"
---

# Design System: Foothold

## 1. Overview

**Creative North Star: "The Operator's Field Notebook"**

Foothold is a daily-use finance source-of-truth designed to feel like a
considered, hand-kept ledger — paper-canvas surfaces, JetBrains Mono on
every numeral, deep-green hero accents that recall ink on cream. It's not
a SaaS dashboard, not a Mint-style consumer wheel, and not a crypto-bro
terminal. It's an operator tool that respects type, density, and silence
in equal measure.

The tool disappears into the task. The only moments it asserts itself —
the hero card, the editorial receipts grid, the operator table — are
moments the operator has already chosen to enter. Everywhere else,
warm-paper neutrals and a single restrained accent let the data carry
the weight.

This system explicitly rejects: default shadcn / SaaS-cream uniformity
(white-on-white + Inter + slate palette without opinion), Mint /
Personal Capital donut-chart vocabularies, boilerplate AI-feature
treatments (sparkles, glow, gradient-text labels), Robinhood gamified
red/green saturation, and crypto-bro neon-on-black maximalism.

**Key Characteristics:**
- Warm-paper canvas (`#FAF8F0`) under elevated cards (`#FFFFFF`)
- Deep-green hero gradient (`160` hue family), never navy
- JetBrains Mono on every numeral, tabular figures forced via
  `font-feature-settings`
- Source Serif 4 reserved exclusively for `/insights` long-form narrative
- Operator-tier density: keyboard shortcuts (`?`, `j`/`k`, `⌘K`), ⌘K
  command palette, Mercury-grade tables
- Restrained accent floor; semantic color reserved for state, never
  decoration

## 2. Colors

The palette is two complementary families. The neutral family is a warm
paper-and-ink set — cream surfaces under near-black foreground —
intentionally tinted away from cool slate to refuse the SaaS-cream
default. The accent family is a deep-green 160-hue sequence, never blue,
that anchors hero cards and brand moments.

### Primary
- **Hero Green Deep** (`#1B402F`, HSL `160 40% 18%`): The starting stop
  of `--gradient-hero`, used on dashboard hero, brand mark fills, and
  ⌘K palette focus accents. Deep enough to read as "ink on paper" rather
  than "SaaS button blue."
- **Hero Green Mid** (`#335547`, HSL `160 30% 28%`): The ending stop of
  the hero gradient. Pairs with Deep at a 135° angle on the dashboard
  hero card.

### Neutral
- **Foreground Slate** (`#0F172A`, HSL `222.2 47.4% 11.2%`): All body
  text, headings, primary button fills. Read as near-black-with-tooth.
- **Surface Paper** (`#FAF8F0`, HSL `60 33% 97%`): The page canvas under
  card-feed pages. Warm bias (60-hue) — never `#fff` for body
  backgrounds.
- **Surface Elevated** (`#FFFFFF`, HSL `0 0% 100%`): Card fills that sit
  on the paper canvas. The contrast IS the affordance.
- **Surface Sunken** (`#F0EFEA`, HSL `60 20% 94%`): Active table rows,
  selected states, sidebar group dividers. Same hue family as paper,
  one step darker.
- **Muted** (`#F1F5F9`, HSL `210 40% 96.1%`): Cool-neutral chip fills,
  pill backgrounds, skeleton states.
- **Muted Foreground** (`#64748B`, HSL `215.4 16.3% 46.9%`): Secondary
  text, captions, baseline-tick marks on the drift leaderboard.
- **Border** (`#E2E8F0`, HSL `214.3 31.8% 91.4%`): Card borders, table
  row dividers, input outlines.

### Semantic (state, never decoration)
- **Positive** (`#16A34A`, HSL `142 71% 36%`): Income transactions,
  gains, on-pace goals. Muted-tasteful, never Robinhood-gamified.
- **Negative** (`#E03737`, HSL `0 72% 51%`): True over-state on
  spend-cap goals. Reserved for actual problems.
- **Destructive** (`#FF0000`, HSL `0 100% 50%`): Confirm-dialog
  destructive button. The most saturated hue in the system; appears
  only inside `<AlertDialog>`-gated actions.
- **Elevated Amber** (`#F59E0B`, Tailwind `amber-500`): The `/drift`
  flagged-this-week state. Tile borders, bar fills, ratio text.
  Single hue across the entire elevated-state vocabulary.

### Chart palette (matte, brand-derived)
A 6-step palette derived from the 160-hue gradient + 40-hue paper
canvas families, so multi-line charts read as Foothold rather than
default Tailwind:
- **Forest** (`#267452`), **Sage** (`#5AAB89`), **Teal** (`#428A8A`)
  — the three greens (160-180 hues)
- **Gold** (`#BF993F`), **Terracotta** (`#C77445`), **Slate Blue**
  (`#6F87B0`) — the three warm earth tones (40, 20, 220 hues)

Dark mode brightens each step ~20-30% lightness without changing hue.
No neon. See `--chart-1..6` in `globals.css`.

### Named Rules

**The 160 / 40 Rule.** All brand color belongs to the 160-hue green
family or the 40-hue warm-paper family. New chart series, status
chips, or accents that don't fit one of those two families are an
unintentional drift and should be reworked.

**The Single-Hue Elevated Rule.** The elevated state across `/drift`
tiles, leaderboard bars, ratio numbers, and `<DriftFlagsCard>` is
amber. Never two amber shades, never amber-plus-orange, never
amber-when-elevated-and-red-when-very-elevated. One hue, one meaning.

**The Restrained Floor Rule.** The accent (Hero Green or any
semantic color) covers ≤10% of any rendered surface. The dashboard
hero card is the lone exception by design.

## 3. Typography

**Display Font:** Inter (via `--font-sans`, with `system-ui` fallback)
**Mono Font:** JetBrains Mono (via `--font-mono`, with `ui-monospace`
fallback)
**Narrative Font:** Source Serif 4 (via `--font-serif`, with `Georgia`
fallback)

**Character:** Inter for everything UI; JetBrains Mono on every numeral
to give figures the weight of typeset financial data; Source Serif 4
reserved exclusively for the `/insights` weekly narrative — when Claude
speaks, it speaks as an editorial column, not as a chat bubble.

### Hierarchy

- **Display** (`1.875rem` / weight 600 / line-height 1.1): page-level
  H1, hero-card primary number.
- **Headline** (`1.25rem` / weight 600 / line-height 1.25): section
  headings within a page.
- **Title** (`1rem` / weight 500): card titles, dialog headers.
- **Body** (`0.875rem` / weight 400 / line-height 1.5): default UI
  copy, descriptions.
- **Label** (`0.75rem` / weight 500): form labels, sub-captions.
- **Eyebrow** (`10px` / weight 500 / letter-spacing `0.08em` /
  uppercase / `muted-foreground / 0.7`): the canonical recipe at
  `.text-eyebrow` in `globals.css`. Sits above every page H1, every
  card group title, every section divider — single source of truth so
  the recipe can evolve in one place.
- **Numeral** (`0.875rem` / weight 500 / `tabular-nums`): JetBrains
  Mono on every dollar amount, percent, ratio, ticker symbol.
  Body-copy numerals included.
- **Narrative** (`1.0625rem` / weight 400 / line-height 1.6 / Source
  Serif 4): `/insights` weekly narrative ONLY. Never used for UI
  labels, descriptions, or copy outside that surface.

### Named Rules

**The Mono Numeral Rule.** Every numeral that lives in operator
context (tables, ratios, dollar figures, ticker symbols, page totals)
renders in JetBrains Mono with `tabular-nums`. No
`Inter-with-tabular-figures` shortcut — the mono is the affordance.

**The Source Serif Quarantine Rule.** Source Serif 4 belongs to the
`/insights` narrative and only there. New surfaces that want a serif
have not earned it; rework with Inter at the appropriate weight first.

**The Eyebrow Recipe Rule.** Section headers above the page H1 use
the `.text-eyebrow` utility, never an ad-hoc small-uppercase + mid-
gray combination. If you find yourself writing `text-[10px]
uppercase tracking-[0.08em] text-muted-foreground/80` inline, you're
duplicating the recipe — use the utility.

## 4. Elevation

Foothold is a **borders-not-shadows** system. The default shadcn `Card`
ships with `shadow-sm`, but the editorial card pattern used across the
app applies `border border-border bg-surface-elevated` instead. Depth
comes from the surface contrast (paper canvas under elevated cards),
not from cast light. The exception is the dashboard hero card, which
uses the deep-green gradient itself as the depth signal.

### Shadow Vocabulary (sparingly)
- **`shadow-sm`** (Tailwind default, `box-shadow: 0 1px 2px 0 rgb(0 0
  0 / 0.05)`): default `<Card>` primitive only — most usages override
  with the editorial pattern. Don't reach for it on net-new surfaces.
- **`shadow-lg`** (Tailwind default, `box-shadow: 0 10px 15px -3px
  rgb(0 0 0 / 0.1)`): Dialog content via shadcn primitive.
  Appropriate for floating modal layers.

### Named Rules

**The Borders-Not-Shadows Rule.** Editorial cards (`/dashboard`,
`/insights`, `/drift`, `/transactions`, etc.) use `rounded-card border
border-border bg-surface-elevated p-5 sm:p-6` — the border IS the
depth signal. Adding a shadow to one of these is an accidental drift.

**The Hero Card Exception.** The dashboard hero card uses the
`--gradient-hero` deep-green linear gradient (135°, `#1B402F → #335547`)
as its surface, with white foreground numerals. This is the only
surface in the app that uses the gradient as a fill rather than as
an accent.

## 5. Components

### Buttons
- **Shape:** `rounded-md` (6px = `calc(var(--radius) - 2px)`)
- **Primary** (`variant="default"`): `bg-primary text-primary-foreground
  hover:bg-primary/90`. Near-black slate on white text. The most-used
  CTA.
- **Outline** (`variant="outline"`): `border border-input bg-background
  hover:bg-accent`. The "Connect a brokerage" / secondary-CTA shape.
- **Ghost** (`variant="ghost"`): `hover:bg-accent
  hover:text-accent-foreground`. Inline actions inside cards (e.g.
  Cancel, Reset).
- **Destructive** (`variant="destructive"`): only inside `<AlertDialog>`
  confirms — gates `/goals` delete + `/simulator` scenario delete.
- **Sizes:** default (`h-10 px-4`), sm (`h-9 px-3`), lg (`h-11 px-8`),
  icon (`h-10 w-10`).

### Cards (the editorial pattern)

The canonical card recipe across operator pages:

```
rounded-card border border-border bg-surface-elevated p-5 sm:p-6
```

Twelve-pixel radius, no shadow, on the warm-paper canvas. Every card-
feed surface (`/dashboard`, `/insights` receipts grid, `/drift`
leaderboard wrapper, `/transactions` operator-table wrapper) uses this
shape. The default shadcn `<Card>` primitive (8px radius + shadow-sm)
is left for cases that genuinely want the shadcn look — there are
roughly zero of those in app code.

### Pills / Chips
- **Shape:** `rounded-pill` (9999px)
- **Default chip:** `bg-muted text-muted-foreground px-2 py-0.5
  text-[10px] uppercase tracking-wider` — used for "pending"
  transaction badges, account masks, status indicators.
- **Elevated chip:** `bg-amber-500/15 text-amber-700` — `/drift`
  ratio pill, sync-pill warning state. Same shape, semantic color.

### Tables (operator-tier)
- **Shape:** `overflow-hidden rounded-card border border-border
  bg-surface-elevated`
- **Sticky header:** `sticky top-0 z-10 bg-surface-elevated/95
  backdrop-blur` with the eyebrow recipe applied to column labels
- **Row:** `border-b border-border/60 transition-colors duration-fast
  ease-out-quart hover:bg-surface-sunken/60 last:border-b-0`
- **Numerals:** all dollar / quantity / price / ratio cells render
  as `font-mono tabular-nums whitespace-nowrap`
- **Selected row** (multi-select): `bg-accent/40 hover:bg-accent/50`
- **Active row** (j/k navigation): `bg-surface-sunken`

### Inputs
- **Shape:** `rounded-md` (6px), `border border-input`, `h-10 px-3 py-2`
- **Focus:** `focus-visible:outline-none focus-visible:ring-2
  focus-visible:ring-ring focus-visible:ring-offset-2` — visible ring
  is the universal focus affordance, never browser-default.

### Bar leaderboard (`/drift`)
- **Track:** `bg-muted h-2.5 rounded-pill` full-width
- **Fill:** absolute-positioned, single-hue (`bg-foreground/70`); amber
  (`bg-amber-500/80`) for `isElevated` rows
- **Baseline tick:** absolute 1px vertical mark in `bg-muted-foreground/70`
  positioned at the baseline / max ratio. Renders the comparison
  literally.

### Named Rules

**The Editorial Card Default.** Net-new card surfaces use the editorial
recipe (`rounded-card border border-border bg-surface-elevated`), not
the shadcn `<Card>` primitive. The primitive stays for compatibility
with shadcn-shaped expectations; the editorial pattern is the brand.

**The Mono-Aligned Numeral Rule.** Every number in a table, card, or
inline figure renders with `font-mono tabular-nums whitespace-nowrap`.
Numbers are never wrapped in display fonts; never shortened with
non-tabular figures (which jitter on update).

## 6. Do's and Don'ts

### Do
- **Do** start every page with the eyebrow recipe + H1 + (optional)
  one-line description. Same rhythm across `/dashboard`, `/drift`,
  `/insights`, `/transactions`, `/investments`, `/goals`,
  `/recurring`, `/simulator`.
- **Do** wrap card content in `rounded-card border border-border
  bg-surface-elevated p-5 sm:p-6`. The 12px radius + warm-paper
  contrast is the brand recipe.
- **Do** use JetBrains Mono with `tabular-nums` on every numeral —
  including secondary captions like "vs $190 baseline."
- **Do** reserve amber for the elevated state, positive for income
  /gains, negative for true over-state, ghost for inline actions.
- **Do** show your work: render baseline values inline next to current
  values rather than burying methodology in a tooltip.
- **Do** prefer "—" with a reason ("No cost basis from Plaid yet")
  over `$0.00` — see PRODUCT.md design principle #3.

### Don't
- **Don't** use the default shadcn `<Card>` primitive on new surfaces;
  use the editorial recipe.
- **Don't** introduce shadows for depth on operator cards. Borders
  carry depth here.
- **Don't** use Inter for numerals, even with tabular figures — the
  mono is the affordance.
- **Don't** use Source Serif 4 outside `/insights` narrative. New
  surfaces that "want a serif" haven't earned it.
- **Don't** add Sparkles or "AI" iconography on AI-touched surfaces.
  Sparkles is reserved for the `/insights` Generate action and the
  nav route. AI shows up as receipts (structured tiles), not
  iconography.
- **Don't** introduce a third surface neutral. The canvas is
  paper / elevated / sunken — three steps, one hue family.
- **Don't** use `#000000` or `#FFFFFF` for text or borders — both
  are absent from the palette. Foreground is `#0F172A`; surface
  contrast carries the high end.
- **Don't** use em dashes in copy; use commas, colons, semicolons,
  periods, or parentheses (impeccable copy rule + brand voice in
  PRODUCT.md).
- **Don't** add donut charts, gauge widgets, or candy-colored gain/
  loss cells (the Mint / Personal Capital / Robinhood reflexes
  PRODUCT.md anti-references rule out).

---

*This file follows the [Stitch DESIGN.md format](https://stitch.withgoogle.com/docs/design-md/format/).
Pair with [PRODUCT.md](PRODUCT.md) (strategy, voice, anti-references)
for the full brief.*
