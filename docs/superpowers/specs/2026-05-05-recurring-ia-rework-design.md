# /recurring IA rework — Design Brief

**Date:** 2026-05-05
**Skill:** impeccable shape (Round 1 + 1 clarifier complete)
**Status:** awaiting confirmation before craft / implementation
**Mirror of:** `2026-05-05-drift-ia-rework-design.md`,
`2026-05-05-goals-ia-rework-design.md`

---

## 1. Feature Summary

`/recurring` today is a 3-cell summary (monthly out / in / net) above a
single table sorted by amount desc, with a status badge per row. It
answers "list everything Plaid detected" but not PRODUCT.md's
animating question, *"what's quietly draining me?"* The rework
layers two different IA principles to answer that question from
both angles: **change-detection** (a conditional hike-alert section
above) for "what just got more expensive?" and
**constellation-mapping** (Plaid PFC-clustered subtotals as the body)
for "where does my money actually go in aggregate?" Monthly cost
remains the headline unit (operator cashflow lives in months);
the rework's value is the reorganization, not a unit reframe.

## 2. Primary User Action

**Read the constellation, react to the changes.** The user opens
`/recurring` to (a) confirm whether anything just spiked, then (b)
scan their cluster of subscriptions reframed in $/yr — the figure
that bites cognitively. Both patterns drill into receipts via
`/transactions?q=<merchantName>&from=<6mo>` when the merchant name
is non-empty.

## 3. Design Direction

- **Color strategy:** Restrained. Amber stays as the warning hue
  (`text-amber-700` / `bg-amber-500/15`) for the hike-alert section
  and the inline ⚠ glyph next to spiked rows in the body. Foreground
  / muted-foreground carry everything else. No new hues.
- **Theme scene sentence:** *"Operator at their desk midweek,
  half-recognizing a charge they don't remember signing up for and
  wanting to know what else might have crept up — warm-paper canvas,
  JetBrains Mono on every figure, the year-cost the cognitive bite."*
  Light by default; dark via existing parity-mapped tokens.
- **Anchor references:** Mercury statement-style line items (single
  hue, dense rows, no chrome), Linear settings → integrations
  (category-grouped sections with subtotals in eyebrow), Stripe
  subscription summary (monthly figure as the lead, frequency
  qualifier as supporting). Same operator vocabulary as /drift
  and /goals, applied to a steady-state surface instead of a
  flag-state one.
- **Visual probes:** Approved via the four ASCII previews in the
  Round 1 + clarifier rounds. The combined shape (hike alert above
  category clusters) is the brief's direction.

## 4. Scope

- **Fidelity:** Production-ready.
- **Breadth:** `/recurring` index page only. No `[id]` detail
  page (Plaid streams are read-only — there's no
  `src/lib/recurring/actions.ts`, no pause/edit/delete to gate).
- **Interactivity:** Whole-row stretched-`<Link>` drill on streams
  with non-empty `merchantName`. No filters, no keyboard nav, no
  bulk actions (consistent with /drift, /goals).
- **Time intent:** Polish until it ships. Atomic commits per the
  /goals cadence.

## 5. Layout Strategy

Top-to-bottom rhythm:

1. **Header** — eyebrow ("Plan") + h1 ("Recurring"). Preserved.
2. **Summary card** — preserved 3-cell composition + units.
   Monthly figures stay primary ("$2,148/mo out", "$7,500/mo in",
   "+$5,352/mo net"); the supporting line carries active stream
   counts. No unit reframe — the rework's value is the body
   reorganization, not the header.
3. **Hike alerts · N streams** section — conditional. Renders only
   when `analysis.hikes.length > 0`. Eyebrow + thin row stack
   showing each affected merchant + the lever (current vs prior +
   $/yr delta).
4. **Category clusters** — one section per Plaid PFC. Eyebrow:
   `<Humanized> · N stream{s} · $X/yr`. Body: stream rows sorted by
   $/yr desc. Category sections themselves sorted by total $/yr
   desc (so housing tops, micro-subscriptions bottom).
5. **Inflows** section — at the bottom, no clustering. Single
   section since users typically have 1-3 inflows (salary, side
   income).
6. **Cancelled** section — at the very bottom, only renders when at
   least one outflow stream has `status === 'TOMBSTONED'`. Compressed
   density (smaller font, no ⚠, no stretched-link). Forensic
   reference, not headline.

Hierarchy via vertical sequence + the `.text-eyebrow` recipe per
section. Editorial card recipe (`rounded-card border border-border
bg-surface-elevated`) wraps each section's row stack — flat
dividers between rows inside, no nested cards.

Spacing rhythm needs attention: hike-alert section visually small
(2-line rows, tight stack) so it doesn't feel weighty when empty
*and* doesn't get visually drowned by a 14-row category body.

## 6. Key States

- **Empty (zero streams)** — preserved. Existing "Not enough history
  yet · Plaid needs 60–90 days" empty state stays canonical.
- **No hikes detected** — hike-alert section omitted entirely. No
  zero-state stub ("Nothing spiked"); absence is the affordance.
  This is the typical week; design must not feel diminished by it.
- **Hikes only, no other change** — page reads as: header + summary
  + hike alerts + category clusters as usual. Hikes get visual
  primacy by sequence position.
- **All streams in one category** — single category section
  renders, eyebrow shows total. Ungrouped layout (inflows section)
  also handles 1-stream cases by default.
- **Null `primaryCategory`** — falls into a category bucket called
  "Other" sorted to the bottom of the cluster sequence regardless
  of $/yr.
- **No `merchantName`** — row renders with the existing pickLabel
  fallback (description → humanized category → "Recurring charge").
  Stretched-link drilldown is **not rendered** for these rows
  (a `q=` search on a humanized category would surface every
  category-mate, defeating the drill). Honest about Plaid sandbox
  data quality.
- **Loading** — existing `loading.tsx` preserved.

## 7. Interaction Model

### Pure analysis predicates

New `src/lib/recurring/analysis.ts`, vitest-tested:

```ts
export function hikeRatio(s: RecurringStreamRow): number | null;
export function isHikeAlert(s: RecurringStreamRow): boolean;
export function annualizedCost(s: RecurringStreamRow): number;
export function groupByCategory(
  streams: RecurringStreamRow[]
): { category: string | null; humanLabel: string; total: number; streams: RecurringStreamRow[] }[];
```

Rules:

- **`hikeRatio`:** `(lastAmount - averageAmount) / averageAmount`,
  only for active outflows with both fields non-null and
  `averageAmount > 0`. Returns `null` otherwise. Negative ratios
  (smaller-than-usual) included so callers can decide.
- **`isHikeAlert`:** `hikeRatio > 0.15` AND
  `(lastAmount - averageAmount) * monthlyMultiplier(frequency) >= 2`
  (i.e. the monthly-equivalent delta is at least $2/mo). The
  absolute floor prevents a $0.10 → $0.15 charge from surfacing as
  a 50% hike. Threshold defaults open for §10 calibration.
- **`monthlyCost`:** `Math.abs(averageAmount) *
  monthlyMultiplier(frequency)`. Uses `Math.abs` since Plaid's
  outflow streams report positive amounts but the function should
  remain sign-agnostic. (Replaces the earlier `annualizedCost`
  helper — sort/subtotal in monthly units throughout.)
- **`groupByCategory`:** groups active outflows only (inflows +
  cancelled handled in their own sections). Bucket by
  `primaryCategory`; null/empty → "Other". Within each bucket sort
  streams by `monthlyCost` desc. Across buckets sort by sum of
  `monthlyCost` desc. "Other" pinned to bottom regardless of
  total.

### Drilldown contract

Stream row → `<Link>` to:

```
/transactions?q=<merchantName>&from=<6moAgoIso>
```

with `<6moAgoIso>` = today minus 180 days, `YYYY-MM-DD`. Both the
hike-alert row variant and the regular cluster row use the same
contract. Cancelled-section rows do NOT drill (forensic, not
operational).

Edge cases:

- **Empty merchantName** — no drilldown, row is a non-clickable
  `<li>`. The pickLabel fallback string would not search
  meaningfully via `q=`.
- **Inactive streams (within active outflows somehow)** — should
  be filtered out by `groupByCategory` before reaching rows; if any
  slip through they render without drilldown.

### Click region (stretched-link pattern, mirror /goals)

Whole row gets `<Link className="absolute inset-0">` as the
clickable background. No action buttons exist on /recurring rows
(no edit/delete — Plaid streams are read-only), so there's no
event-guard complexity to manage. Simpler than /goals.

### Keyboard

No new shortcuts. `?` cheatsheet (Phase 6.7) currently lists none
for /recurring; this rework doesn't add any.

## 8. Content Requirements

### Summary card eyebrow + figures
- Cell 1: eyebrow "Monthly outflow" → `$2,148/mo` (display) →
  sub `14 active subscriptions`
- Cell 2: eyebrow "Monthly inflow" → `$7,500/mo` (display) →
  sub `1 active stream`
- Cell 3: eyebrow "Monthly net" → `+$5,352/mo` (display) →
  sub blank or `${countOf(streams)} streams`. Negative net renders
  in `text-destructive`.

### Hike alert row
```
[merchantName]                    $19.99/mo (was $15.49)
+29% vs 12-mo avg · +$4.50/mo
```
Single eyebrow at top of section: `Hike alert · N stream{s}`.
Visually amber: `text-amber-700` on the percent + delta line.

### Category section eyebrow
`<HumanizedCategory> · N stream{s} · $X/mo`
e.g. "Streaming entertainment · 4 streams · $46/mo"

### Stream row
```
[merchantName]                          $19.99/mo
Monthly                                       ⚠
```
- merchantName: truncate, `text-sm font-medium`
- $/mo: `font-mono tabular-nums font-medium` (PRIMARY — the
  number that lives in operator cashflow)
- frequency (humanized: "Monthly", "Every 2 weeks", etc.):
  `text-xs text-muted-foreground`
- ⚠ (lucide AlertTriangle in amber-500): only when `isHikeAlert`,
  positioned to the far right

Two-line composition: name + $/mo on top, frequency + ⚠ on bottom.
Mirrors /goals' goal-row rhythm (header line + supporting line).
Decide single-line vs two-line during craft based on real-data row
counts in a category section.

### Inflows section
Eyebrow: `Inflows · N stream{s}`
Rows: same composition but $/mo in `text-positive`. No ⚠.
Drilldown: yes (same `q=<merchant>` contract); salary search is
search-friendly and the consistency wins over the marginal "but
the operator question for inflows is different" argument.

### Cancelled section
Eyebrow: `Recently cancelled · N stream{s}`
Rows: compressed (1-line, dim opacity). Show name + last hit date.
No drilldown.

### Numerals
All currency renders `font-mono tabular-nums whitespace-nowrap` per
DESIGN.md Mono Numeral Rule.

### Voice
Per PRODUCT.md: direct, specific. "+29% vs 12-mo avg" beats "Price
increased." "$548/yr" beats "Total $548." No em dashes; middle dot
separators per Foothold convention.

## 9. Recommended References

- `reference/product.md` — already loaded (register=product)
- DESIGN.md sections: Editorial Card Default, Single-Hue Elevated
  Rule, Mono Numeral Rule
- /drift implementation as the structural template for "two
  sections, one card-per-section":
  `src/app/(app)/drift/page.tsx`,
  `src/components/drift/leaderboard.tsx`
- /goals implementation as the structural template for stretched-
  link rows + section rhythm:
  `src/components/goals/goal-row.tsx`,
  `src/components/goals/pace-leaderboard.tsx`
- `src/lib/db/queries/recurring.ts` `frequencyToMonthlyMultiplier`
  — already exists, reuse it; do not duplicate

## 10. Open Questions

These resolve during implementation/UAT:

1. **Hike threshold (15% / +$2/mo) calibration.** Hypothetical
   until walked through against real sandbox + production data.
   May surface false positives (a quarterly bonus structure on a
   non-truly-recurring stream) or false negatives (a 5% creep on a
   $200/mo charge = $10/mo that the absolute floor catches but the
   ratio doesn't). Calibrate after first walkthrough.
2. **`/transactions?q=` semantics.** Verify `q` searches both
   `description` and `merchantName` columns (or `merchantName`
   alone). If only one, the drilldown contract may surface fewer
   transactions than expected for streams whose merchantName is
   noisy. Read `getTransactions` filter logic in
   `src/lib/db/queries/transactions.ts` during craft.
3. ~~Inflow drilldown~~ — resolved: yes, drill (same `q=<merchant>`
   contract) for consistency.
4. **`humanizeCategory` for category section eyebrows.** Reuse the
   shared module from `src/lib/format/category.ts` (Phase 6.7-
   followon). For null PFC, the literal string "Other" works.
5. **Cancelled-section threshold.** Show `TOMBSTONED` always, or
   only TOMBSTONED with `lastDate` within last 90d (truly
   "recently" cancelled)? Lean: last 90d, otherwise the section
   accumulates indefinitely. Confirm during craft.
6. **Stream-row composition (1-line vs 2-line).** 1-line is denser
   and matches Mercury's statement aesthetic; 2-line gives the
   $/yr more visual primacy and matches /goals' goal-row pattern.
   Decide during craft based on real-data row counts (a
   category section with 4 rows should feel scannable, not crowded).

## Implementation handoff (for craft)

**Atomic commit cadence (mirror /goals):**

1. `feat(recurring): analysis predicates with tests` —
   `src/lib/recurring/analysis.ts` + `analysis.test.ts`. ~12-15
   vitest specs covering hikeRatio, isHikeAlert, annualizedCost,
   groupByCategory ordering + null PFC fallback.
2. `feat(recurring): stream-row + recurring-overview components` —
   `src/components/recurring/stream-row.tsx`,
   `src/components/recurring/recurring-overview.tsx`. May fold the
   small hike-alert variant into stream-row via a `variant` prop
   rather than a separate component (composition decision during
   craft). Render-only; no page integration.
3. `refactor(recurring): page renders category-clustered overview`
   — replace inline StreamSection + table in
   `src/app/(app)/recurring/page.tsx` with the new components.
   Header + EmptyState preserved. Drop dead inline functions
   (StreamSection, StreamRow, StatusBadge, monthlyMultiplier
   duplicate, formatTxDate, humanizeFrequency).
4. (Optional) `chore(recurring): walkthrough fixes` — copy,
   threshold calibration, row-composition tweaks from UAT.

**File list, net:**
- Created: `src/lib/recurring/analysis.ts`,
  `src/lib/recurring/analysis.test.ts`,
  `src/components/recurring/stream-row.tsx`,
  `src/components/recurring/recurring-overview.tsx`
- Modified: `src/app/(app)/recurring/page.tsx`
- Untouched: `src/lib/db/queries/recurring.ts` (reuse all helpers),
  `src/components/dashboard/upcoming-recurring-card.tsx`
  (dashboard companion stays as-is)

**Test count delta target:** +12-15 vitest specs (238 → ~250-253).

**UAT script (against real Wells Fargo sandbox):**
- Confirm at least one stream qualifies as a hike alert by
  temporarily adjusting the threshold or finding a sandbox stream
  that already drifts; verify lever copy reads correctly
  ("+N% vs 12-mo avg · +$X/yr").
- Confirm category sections render in $/yr-desc order across
  categories AND within each category.
- Confirm "Other" pins to bottom regardless of total (test by
  finding or temporarily nulling a primaryCategory).
- Confirm stream-row drilldown URL contract works against
  `/transactions` filter — search results match the merchant +
  6-month window.
- Confirm rows with empty merchantName render the pickLabel
  fallback AND are non-clickable.
- Confirm dark-mode parity (already mapped per token system).
