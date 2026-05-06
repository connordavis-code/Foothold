# /goals IA rework — Design Brief

**Date:** 2026-05-05
**Skill:** impeccable shape (Round 1 complete; user locked all three recommendations)
**Status:** awaiting confirmation before craft / implementation
**Mirror of:** `2026-05-05-drift-ia-rework-design.md`

---

## 1. Feature Summary

`/goals` today is an equal-weight 2-column tile grid where every goal
looks the same regardless of urgency. The page-level surface is
*less informationally ranked* than its dashboard companion
(`<GoalsStrip>`, which urgency-sorts and caps at 3) — backwards for
an operator triage page. The rework reshapes `/goals` into a pace
leaderboard with two sections (**Behind pace** above **On pace**),
each row showing progress against ideal pace and the lever (ETA date
or projected month-end). Spend-cap rows drill into filtered
`/transactions`; savings rows are read-only.

## 2. Primary User Action

**Read pace at a glance, then drill into receipts when a cap is over
or trending over.** Every other element on the page exists in
service of getting the operator from "am I on pace?" to (for caps)
"show me what drove it," and (for savings) "what do I need to
change?" — the latter answered by the inline lever copy, not a
drill-through.

## 3. Design Direction

- **Color strategy:** Restrained — per PRODUCT.md product-register
  default. **Amber** (`text-amber-700` / `bg-amber-500/15` /
  `border-amber-500/30`) carries the warning vocabulary: behind-pace
  savings rows AND projected-over caps. **Destructive**
  (`text-destructive`) reserved for already-over caps (`fraction > 1`).
  Default rows render in `foreground` / `muted-foreground`. No new
  hues.
- **Theme scene sentence:** *"Operator at their desk on a weekday
  morning, scanning whether last week's saving and spending kept
  their goals honest — warm-paper canvas, JetBrains Mono numerals,
  the verdict one glance away."* Forces light by default (dark via
  existing parity-mapped tokens).
- **Anchor references:** Mercury account-detail (single-column dense
  rows over multi-column equal-weight grids), Linear cycle-burndown
  (progress + comparison tick in same row), Stripe metric-comparison
  cards (current vs target as paired figures, no chrome waste).
  Mirrors the /drift anchor set deliberately — same operator
  vocabulary applied to a different signal.
- **Visual probes:** Approved via the four ASCII previews in the
  AskUserQuestion round. The "pace leaderboard, two sections" probe
  is the brief's direction.

## 4. Scope

- **Fidelity:** Production-ready.
- **Breadth:** `/goals` index page only. `/goals/new` and
  `/goals/[id]/edit` form pages stay untouched (out of scope).
- **Interactivity:** Static read for savings rows, drill `<Link>` for
  cap rows, edit/delete preserved inline.
- **Time intent:** Polish until it ships. Atomic commits per the
  /drift cadence (extract pace predicates → build leaderboard →
  wire drilldown → walkthrough).

## 5. Layout Strategy

Top-to-bottom rhythm:

1. **Header** — eyebrow ("Plan") + h1 ("Goals") + "New goal" button
   on the right. Preserved.
2. **Behind pace · N of M** section — eyebrow + leaderboard rows for
   goals where pace verdict is `'over'` or `'behind'`. Sorted by
   severity desc (see §7 for severity key). Single column, full
   width.
3. **On pace · N of M** section — eyebrow + leaderboard rows for
   goals where pace verdict is `'on-pace'` or `'hit'`. Sorted by
   completion proximity desc (highest fraction first → most
   satisfying scan). Single column, full width.
4. Sections render conditionally — "behind" hidden when zero
   off-pace, "on pace" hidden when zero on-pace.

`max-w-5xl` page (down from current `max-w-5xl` — preserved). Both
sections use the editorial card recipe to wrap their row stack:
`rounded-card border border-border bg-surface-elevated p-5 sm:p-6`.
The wrap is the brand recipe; rows inside are flat (border-bottom
between rows, no nested cards). One container per section, not one
per row.

Hierarchy via vertical sequence + the `.text-eyebrow` recipe per
section. No nested cards, no donut charts, no gauge widgets.

## 6. Key States

- **Empty (zero goals)** — preserved as-is. Existing `<EmptyState>`
  is canonical (Target icon, "Set a savings target or spend cap"
  headline, primary CTA). No change.
- **All on pace** — only the "On pace" section renders. No "0 behind"
  zero-state stub; absence is the affordance.
- **All behind / over** — only the "Behind pace" section renders.
  Same logic.
- **Mixed** — both sections render in vertical sequence with eyebrow
  counts.
- **Single goal** — section still renders with the same eyebrow + 1
  row. No special-case layout.
- **Goal with no progress data yet** (e.g., new account, no
  transactions in 90d) — savings progress reports `monthlyVelocity:
  0`, `monthsToTarget: null`, no `projectedDate`. Pace verdict
  defaults to `'on-pace'` if `targetDate` is null (per PRODUCT.md
  bug-fix in CLAUDE.md Phase 6.5: only `velocity ≤ 0 AND no
  targetDate` reports "behind"). Row shows "—" for ETA with reason.
- **Loading** — existing `loading.tsx` preserved (no skeleton change
  needed; same shell).
- **Error** — Next 14 error boundary inherits; no goals-specific
  state.

## 7. Interaction Model

### Pace verdict (pure predicate)

New `src/lib/goals/pace.ts`, vitest-tested:

```ts
export type PaceVerdict = 'over' | 'behind' | 'on-pace' | 'hit';

export function paceVerdict(progress: GoalProgress): PaceVerdict;
```

Rules:
- **Spend cap:** `fraction > 1` → `'over'`; `projectedMonthly > cap`
  → `'behind'` (projected-over); else `'on-pace'`.
- **Savings:** `fraction >= 1` → `'hit'`;
  `velocity <= 0 AND fraction < 1` → `'behind'` (not contributing);
  `targetDate AND projectedDate AND projectedDate > targetDate` →
  `'behind'` (late ETA);
  else → `'on-pace'`.

### Severity sort (within "behind" section)

```ts
export function severityKey(progress: GoalProgress): number;
```

Higher = worse. Spend caps over: `(spent - cap) / cap` (so 200% of
cap > 110% of cap). Spend caps projected: `(projectedMonthly - cap)
/ cap`. Savings late: `(projectedDate - targetDate) / 30d` in
months, capped at +24 to avoid runaway sort. Savings dormant
(velocity ≤ 0, no projectedDate): assigned a fixed mid-severity
value so they sort below true "late ETA" but above "barely over
cap" (concrete: severity = 1.0 for dormant, vs `(months_late /
months_to_target)` for late savings, vs `(over_cap_fraction - 1)`
for over caps; calibrated in implementation against real data).

### Drilldown contract (caps only)

Spend-cap row → `<Link>` to:

```
/transactions?category=<PFC>&from=<monthStart>&to=<today>
```

with `<monthStart>` = first day of current calendar month
(YYYY-MM-DD), `<today>` = today (YYYY-MM-DD).

Edge cases:
- **Multiple `categoryFilter` elements:** /transactions filter-row
  contract uses single `category` query param (verify in §10). For
  multi-cat caps, drilldown uses the **first** filter element and
  surfaces this as a flagged open question; UAT the actual filter
  behavior in walkthrough.
- **No `categoryFilter` (= "all categories"):** drilldown drops the
  `category` param and adds `accountId=<X>&from=<monthStart>` per
  scoped account. If multiple scoped accounts, picks the first
  (same flag).
- **No drilldown for savings rows.** Click on a savings row is a
  no-op visually; row has no `<Link>`-shaped affordance (no caret,
  no hover transform). Account scope renders inline as text
  (preserved from current).

### Click region

The whole row IS the link (for caps). Edit/delete buttons
absolute-positioned in the row's right edge with `onClick`
calling `e.stopPropagation()` so click-on-pencil opens edit, not
drilldown. Mirrors the `<DriftElevatedTile>` whole-tile pattern
where appropriate.

For **savings rows** (no drill), the row is a non-clickable
`<article>` and edit/delete sit naturally in the right edge with no
event guard needed.

### Keyboard

No new shortcuts. `?` cheatsheet (Phase 6.7) currently lists no
/goals-specific bindings; this rework doesn't add any unless a clear
need surfaces during walkthrough.

## 8. Content Requirements

### Section eyebrows
- "Behind pace · 1 goal" / "Behind pace · 3 goals" (singular /
  plural rule)
- "On pace · 5 goals" / "On pace · 1 goal"

### Row composition (cap)

```
[Name]                          [$spent / $cap or projection]
[bar with fraction fill + projected tick]   [verdict pill]
[lever line: "projected $510 · over by $110" OR "4 days left"]
[scoped accounts inline if non-empty]
```

### Row composition (savings)

```
[Name]                                    [$current / $target]
[bar with fraction fill + ideal-pace tick if targetDate]
[lever line: "ETA Sep 2027 (4mo late)" OR "Adding ~$120/mo · need ~$220/mo to hit by Mar 2027" OR "No net contribution detected over the last 90 days"]
[scoped accounts inline if non-empty]
```

### Verdict pill copy
- `'over'` → "Over" (text-destructive)
- `'behind'` cap → "Trending over" (text-amber-700)
- `'behind'` savings (late ETA) → "Behind pace" (text-amber-700)
- `'behind'` savings (dormant) → "Not contributing" (text-amber-700)
- `'on-pace'` → "On pace" (text-muted-foreground)
- `'hit'` → "Goal hit" (text-positive)

### Numerals
All currency, percent, ratio, ETA-month renders as `font-mono
tabular-nums whitespace-nowrap` per the Mono Numeral Rule in
DESIGN.md.

### Voice
Per PRODUCT.md: "direct, specific, unflinching about what the
numbers mean." Show the work. "Trending over" beats "warning."
"Adding ~$120/mo · need ~$220/mo" beats a tooltip. No em dashes
(use middle dot `·` separators per Foothold convention).

## 9. Recommended References

- `reference/product.md` — already loaded (register=product)
- DESIGN.md sections: Components > Bar leaderboard, Components >
  Pills/Chips, Named Rules > Single-Hue Elevated, Named Rules >
  Mono Numeral
- /drift implementation as the structural template:
  `src/components/drift/leaderboard.tsx` for bar+tick composition;
  `src/app/(app)/drift/page.tsx` for section sequencing
- Skip motion reference — no new animations beyond existing
  `transition-colors duration-fast ease-out-quart` hovers

## 10. Open Questions

These resolve during implementation/UAT, not at brief-confirm time:

1. **/transactions multi-category filter** — does the filter-row
   support `?category=A,B` or only single? Implementation must read
   `src/components/transactions/filter-row.tsx` (or whatever owns
   the `useSearchParams` parse) and either (a) emit comma-separated
   if supported, or (b) emit first-cat-only with a follow-on note.
2. **/transactions account filter** — same verification for
   `?accountId=` shape. If unsupported, "all categories" caps with
   account scope drop their drilldown gracefully (row not clickable).
3. **Severity calibration for savings dormant vs late** — assign
   concrete numeric thresholds against the user's real goals
   (currently a hypothetical mid-value of 1.0). Adjust during
   walkthrough if sort order surprises.
4. **`<GoalsStrip>` on dashboard** — preserved unchanged. The
   dashboard shows top-3 by urgency; the page shows all. No code
   change to the strip; this is a non-question, flagged here so a
   future reader doesn't wonder.
5. **`<ProgressBar>` reuse** — current component
   (`src/components/goals/progress-bar.tsx`) is the right primitive
   for the new row. Implementation should reuse it, not rebuild;
   may need to extend with a `tickFraction` prop for the ideal-pace
   mark (cap-projected or savings-ideal). Confirm the API
   tweaks during craft.
6. **Per-row edit/delete event guarding** — verify
   `e.stopPropagation()` on the buttons inside a `<Link>`-wrapped
   row works under Next 14 RSC + the existing
   `<DeleteGoalButton>` AlertDialog client-component. If event
   bubbling fights the AlertDialog open-state, fall back to the
   alternative: drill region is the right two-thirds of the row
   only (bar + verdict + lever line); header (name + edit/delete)
   stays outside the `<Link>`.

## Implementation handoff (for craft)

**Atomic commit cadence (mirror /drift):**

1. `feat(goals): add pace verdict + severity predicates` —
   `src/lib/goals/pace.ts` + `pace.test.ts`. ~10-15 vitest specs
   (one per verdict combination, severity ordering for at least 4
   shapes).
2. `refactor(goals): extend ProgressBar with tickFraction prop` —
   if reuse path validates. May fold into commit 3 if trivial.
3. `feat(goals): leaderboard component with cap drilldown` —
   `src/components/goals/pace-leaderboard.tsx` +
   `src/components/goals/goal-row.tsx`. Render-only; no page
   integration yet.
4. `refactor(goals): page renders sectioned leaderboard` — replace
   inline `GoalTile` + grid in `src/app/(app)/goals/page.tsx` with
   the new components. EmptyState + header preserved verbatim.
5. `chore(goals): drop GoalTile + ProgressBlock inline functions` —
   cleanup of dead code from page.tsx if any survives commit 4.
6. (Optional) `chore(goals): walkthrough fixes` — copy
   adjustments, tick positioning, severity calibration from UAT.

**File list, net:**
- Created: `src/lib/goals/pace.ts`, `src/lib/goals/pace.test.ts`,
  `src/components/goals/pace-leaderboard.tsx`,
  `src/components/goals/goal-row.tsx`
- Modified: `src/app/(app)/goals/page.tsx`,
  `src/components/goals/progress-bar.tsx` (tickFraction prop, if
  needed)
- Untouched: `src/app/(app)/goals/new/page.tsx`,
  `src/app/(app)/goals/[id]/edit/page.tsx`,
  `src/components/goals/goal-form.tsx`,
  `src/components/goals/delete-goal-button.tsx`,
  `src/components/dashboard/goals-row.tsx` /
  `goals-strip.tsx` (whichever is the dashboard companion).

**Test count delta target:** +15-20 vitest specs (218 → 233-238).

**UAT script (against real Wells Fargo sandbox data):**
- Confirm at least one savings goal renders in each verdict bucket
  (hit / on-pace / behind-late / behind-dormant) by temporarily
  editing target/targetDate via `/goals/[id]/edit`.
- Confirm a spend cap with PFC filter drills to the right
  /transactions URL and that filtered rows match the cap's
  this-month spent figure within rounding.
- Confirm event propagation: pencil-click opens edit, delete-click
  opens AlertDialog, neither triggers drilldown.
- Confirm dark-mode parity (already mapped per token system; no
  surprises expected).
