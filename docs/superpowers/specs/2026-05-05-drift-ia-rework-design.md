# /drift IA rework — Design Brief

**Date:** 2026-05-05
**Skill:** impeccable shape (Discovery rounds 1-2 complete)
**Status:** awaiting user confirmation before craft / implementation

---

## 1. Feature Summary

`/drift` surfaces categories spending materially above their 4-week
baseline against a methodology the user can read inline. The rework
reshapes the surface to serve **both** confirm-suspicion and open-scan
intents simultaneously: a bar-chart leaderboard for the open scan,
click-through tiles for the confirm-and-drill, and the existing flag
history table preserved as the forensic floor.

## 2. Primary User Action

**Identify what's running hot, then drill into the transactions that
drove it.** Every other element on the page exists in service of
getting the operator from "what changed?" to "show me the receipts."

## 3. Design Direction

- **Color strategy:** Restrained — per PRODUCT.md product-register
  default. Amber stays as the elevated-state hue (already established
  on tiles + `<DriftFlagsCard>`); current-week bars use `foreground/80`,
  baseline marks use `muted-foreground/60`. No additional palette.
- **Theme scene sentence:** *"Operator at their desk on a weekday
  morning, scanning their financial week to confirm or refute a budget
  hunch — warm-paper canvas under JetBrains Mono numerals, the answer
  one glance away."* Forces light by default (dark via existing
  parity-mapped tokens).
- **Anchor references:** Mercury account-detail (bar leaderboards over
  donuts), Linear cycle-burndown (bars + comparison line in same row),
  Stripe metric-comparison cards (current vs baseline as paired figures,
  no whitespace wasted on chrome).
- **Visual probes:** SKIPPED — Claude Code lacks native image
  generation. ASCII preview of the bar chart was approved in Round 2
  Q1 and serves as the direction probe.

## 4. Scope

- **Fidelity:** Production-ready. `/drift` is a daily-use surface,
  not a sketch.
- **Breadth:** Single page. Bar chart + elevated-tiles section
  reworked; flag history table preserved as-is; sparse-data and
  nothing-elevated empty states preserved.
- **Interactivity:** Shipped-quality client interactions (tile →
  `/transactions` filtered nav).
- **Time intent:** Polish until it ships. Atomic commits, browser
  walkthrough before merge.

## 5. Layout Strategy

Top-to-bottom rhythm follows the operator's mental model:

1. **Header** — eyebrow ("Today") + h1 ("Drift") + methodology
   paragraph. Preserved.
2. **Elevated this week** tile grid — already the headline; tiles
   become `<Link>` elements navigating to filtered `/transactions`.
   Empty state ("Nothing elevated") preserved when zero hot cats.
3. **This week vs baseline** bar leaderboard — replaces the line
   chart. One row per category above a baseline-spend floor (see Open
   Questions), bars showing current-week amount, baseline mark per
   row, ratio number trailing right. Sorted by ratio desc.
4. **Flag history** table — preserved as forensic floor. Unchanged.

Hierarchy via vertical sequence + the `.text-eyebrow` recipe per
section. No nested cards, no gauge widgets, no donut charts.

## 6. Key States

- **Default** (≥1 elevated category): tiles render at top, bar
  leaderboard below shows top N above floor, flag history shows
  historical flags.
- **Nothing elevated this week:** existing positive callout
  ("Every category is within MIN_RATIO×") preserved. Bar leaderboard
  still renders if any categories cross the spend floor — gives the
  open-scan operator something to read even on a calm week.
- **Sparse history (<4 weeks):** existing `<SparseEmptyState>`
  preserved unchanged.
- **Tile hover:** existing transition + amber-bg-shift preserved;
  cursor-pointer added (was `<div>`, becomes `<Link>`).
- **Bar leaderboard empty (no cat clears spend floor):** inline muted
  "Nothing material this week" — keeps the section visible even on a
  calm week, avoids a missing-section gap.

## 7. Interaction Model

- **Tile click** → `/transactions?category=<pfc>&from=<weekStart>&to=<weekEnd>`.
  weekStart/weekEnd derived from drift's existing week boundaries.
  Verify URL contract against `filter-row.tsx` during implementation.
- **Bar leaderboard rows** — read-only by default. Per-row click as a
  follow-on if useful; defer (tile already provides the entry point
  for elevated cats).
- **No new keyboard shortcuts.** Per Phase 6.7 cheatsheet, `/drift`
  currently has none; this rework doesn't add any unless a clear need
  surfaces during walkthrough.

## 8. Content Requirements

- **Section eyebrow** for the bar leaderboard: "This week vs baseline"
  (replaces "Weekly trend · top N categories").
- **Per-bar copy:** humanized category name on left, current-week
  amount in mono, baseline marker label "vs $X baseline" muted, ratio
  "1.7×" tail-aligned right.
- **Empty state for the bar leaderboard:** inline muted "Nothing
  material this week."
- **Tile click affordance:** tile becomes `<Link>` — focus ring +
  hover state per existing tokens. No "View transactions →" text
  needed; the whole tile is the affordance and the convention is
  established by `/insights` tiles.
- **Voice:** direct, specific. No "View detailed analysis." No em
  dashes (per impeccable copy rules + PRODUCT.md).

## 9. Recommended References

- `reference/product.md` — already loaded (register=product)
- `reference/spatial-design.md` (if it exists in the impeccable
  reference set) — leaderboard layout rhythm, bar-vs-baseline
  composition
- Skip motion reference — no new animations beyond existing
  hover/transition

## 10. Open Questions

To resolve at implementation time, with recommended defaults:

- **Bar leaderboard inclusion floor:** show only currently-elevated
  cats / top N by current spend regardless / all cats above some
  baseline floor (e.g., ≥$50/wk)?
  → **Recommend the third.** Gives "what's running hot" *and* "what's
  quietly meaningful" without demanding a threshold cross.
- **Category cap:** if using a baseline floor, cap at top 8 by ratio
  to avoid a 30-row scroll?
  → **Recommend yes, soft cap at ~8.**
- **Baseline visual encoding inside the bar:** reference tick mark on
  the bar / ghost bar behind the current-week bar / two paired thin
  bars stacked?
  → **Probe in code** — try the tick mark first (cheapest, reads as
  a "you-are-here" against the baseline reference).
- **`/transactions` URL params:** confirm `from`/`to` param names
  match `filter-row.tsx`'s URL contract.
  → Quick grep during implementation.
- **Color per category in the leaderboard:** preserve the line
  chart's per-cat hues, or single foreground hue?
  → **Recommend single hue.** The leaderboard's information IS the
  ranking, not the cat identity (already labelled). Less rainbow,
  more honest.

---

## Implementation handoff (for craft)

Once this brief is confirmed:

1. Read `src/app/(app)/drift/page.tsx`, `src/components/drift/trend-chart.tsx`,
   `src/components/transactions/filter-row.tsx`, `src/lib/db/queries/drift.ts`.
2. Build the new bar leaderboard component in
   `src/components/drift/leaderboard.tsx` (replaces TrendChart's role).
3. Convert `<ElevatedTile>` from `<div>` to `<Link>` with the URL
   contract above.
4. Resolve open questions inline (defaults provided).
5. Atomic commits, `npm run typecheck && npm test` after each.
6. Browser walkthrough at end.

Keep the `flag history` table and `<SparseEmptyState>` untouched.
