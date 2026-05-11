# Foothold Redesign — Phase R.3.1 Goals

**Date locked**: 2026-05-10
**Parent spec**: [docs/redesign/SPEC.md](../SPEC.md) (R.0 master), R.3 line item "Per-page sweep: Goals first"
**Bundle reference**: [claude-design-context/foothold-goals.jsx](../../../claude-design-context/foothold-goals.jsx)
**Branch**: `feat/r3-1-goals` (cut from `feat/redesign` post-R.2 merge)
**Status**: Decisions locked via brainstorming session 2026-05-10; ready for plan

---

## Scope

R.3.1 is the first of six R.3 sub-phases (Goals → Recurring → Transactions → Investments → Simulator → Settings per master SPEC). Rewrites `/goals` to adopt the prototype's rich card-per-goal IA. Deletes `/goals/[id]` deep-dive page. Restyles the two surviving form routes (`/goals/new`, `/goals/[id]/edit`).

This is the first R.3 phase that consumes R.2's freshness propagation seam (`formatFreshness`) on a non-dashboard surface. The pattern locked here propagates to R.3.2–R.3.6.

## North star (inherited from R.0)

> *"Where you stand, mapped honestly."*

For Goals specifically: each card is a *self-contained answer* to "am I on track for this goal?" — the card IS the goal experience. The IA shift commits to "goal-as-plan" over "summary-then-drill," anticipating R.4's Moves feature without prematurely scaffolding it.

---

## Locked decisions (2026-05-10 brainstorming session)

| # | Decision | Choice | Rationale |
|---|---|---|---|
| 1 | IA reconciliation (prototype vs current) | Adopt prototype IA wholesale | Card-per-goal with title/intent/status/4-cell number grid/progress/coaching. Most ambitious option; commits fully to the prototype's "goal-as-plan" register. |
| 2 | Fate of `/goals/[id]` detail page | Delete entirely | `/goals/[id]/page.tsx` removed. Edit reachable via existing `/goals/[id]/edit` route. Trajectory chart + contributing feed + coaching card all delete; `composeCoaching` prose relocates into the card. |
| 3 | Moves slot pre-R.4 | Fill with coaching sentence | `composeCoaching` from Phase 3-pt3 renders as the card's bottom prose line. Reuses existing discriminated-union logic; gives the card narrative completeness without faking Moves. Transitions cleanly when R.4 adds Moves above/below. |
| 4 | Archived goals UX | "Show archived (N)" toggle below active list | Active goals render as the main card list. Subtle reveal-toggle exposes archived cards below. Preserves un-archive lifecycle without cluttering the active view. Reuses `getGoalsWithProgress({ includeInactive: true })` from Phase 3-pt3.b. |
| 5 | Freshness annotation placement | Page-meta strip only, mirroring R.2 `<PageHeader>` | Right-side of header carries `Fresh Nh ago · N sources` via R.2's `formatFreshness()`. No per-card freshness — all goals derive from the same source set. Establishes the R.3 propagation pattern. |

---

## Surface changes — what survives, what dies

### Routes

| Route | Fate | Redirect |
|---|---|---|
| `/goals` | Rewritten to prototype rich-card IA | — |
| `/goals/[id]` | DELETED | `/goals/:id → /goals` permanent (covers external bookmarks for previously deep-linked goals) |
| `/goals/[id]/edit` | KEPT, visually restyled (T6) | — |
| `/goals/new` | KEPT, visually restyled (T6) | — |

### Lost affordances (accepted regressions)

- **Trajectory chart** on the detail page — the cumulative-actual vs ideal-pace Recharts viz. Replaced by the per-card progress bar with position-dot + tick marks (less precise but more glanceable).
- **Contributing-data feed** (per-goal top-20 transactions for spend-cap, weekly net deltas for savings). No on-card replacement; transactions remain editable from `/transactions` + dashboard recent activity.
- **Goal-context transaction edit half-sheet** (`<TransactionDetailSheet>` mounted via `<SpendCapFeed>`). Transactions still editable from other surfaces.

### Preserved logic

- `getGoalsWithProgress(userId, { includeInactive })` — single source of truth for goal display data
- `paceVerdict` + `severityKey` in `src/lib/goals/pace.ts` — drives card status pill + sort
- `composeCoaching` in `src/lib/goals/coaching.ts` — relocates from `<CoachingCard>` into goal card
- `pickTopDiscretionaryCategory` in `src/lib/goals/discretionary.ts` — feeds `composeCoaching`'s behind-savings branch
- `getBehindSavingsCoachingCategory` in `src/lib/db/queries/goal-detail.ts` — survives if `composeCoaching`'s consumption path requires it
- `<GoalForm>`, `<ArchiveGoalButton>`, `<DeleteGoalButton>`, `<ProgressBar>` (the existing one, then deleted in T3 in favor of `<GoalProgress>`)
- All goal-related server actions (`createGoal`, `updateGoal`, `archiveGoal`, `deleteGoal`)

### Deleted logic

- `src/lib/goals/trajectory.ts` + `trajectory.test.ts` — `walkBackTrajectory` was only consumed by the deleted trajectory chart
- Functions in `src/lib/db/queries/goal-detail.ts` exclusive to deleted feeds (savings-feed, spend-cap-feed) — audit during T5

---

## Task sequence (T1–T7)

Each task = one atomic commit. Commit subject format: `feat(r3.1): <task summary>`.

### T1 — Page header + summary strip

**Ships:** `<GoalsPageHeader>` (eyebrow "Plan" + h1 "Goals" + right-meta freshness strip), `<GoalsSummaryStrip>` (4-stat row: Active goals · On track · Total saved · Total committed). Page-sub copy: "Targets you've committed to." (drops the Moves-referential second sentence from the prototype).

**Files:**
- Create: `src/components/goals/goals-page-header.tsx`
- Create: `src/components/goals/goals-summary-strip.tsx`
- Modify: `src/app/(app)/goals/page.tsx` — mount both, add `getSourceHealth` fetch + `formatFreshness` call

### T2 — `<GoalCard>` component

**Ships:** rich card per prototype. Title + intent + status pill (per `paceVerdict`) + 3 action icons (edit/archive/delete) in header. Type-dependent 4-cell number grid via per-type config (savings vs spend-cap). Coaching sentence in footer slot (replaces prototype's Moves section).

**Status pill mapping** (verified during T2 implementation):

| paceVerdict (savings) | Pill | Color |
|---|---|---|
| `hit` | "Hit target" | `--semantic-success` |
| `on-pace` | "On track" | neutral / `--text-2` |
| `behind` | "Behind pace" | `--semantic-caution` |

| paceVerdict (spend-cap) | Pill | Color |
|---|---|---|
| `hit` | "Under cap" | `--semantic-success` |
| `on-pace` | "On pace" | neutral |
| `behind` | "Projected over" | `--semantic-caution` |
| `over` | "Over cap" | `--semantic-caution` |

Pills carry a leading inline-style dot (mirrors R.2 position-dot motif).

**4-cell number grid** (type-dependent labels):

| Cell | Savings | Spend-cap |
|---|---|---|
| TARGET / CAP | `$X · by date` | `$X · this month` |
| SAVED / SPENT | `$X · $remaining to go` | `$X · $remaining left` |
| PROJECTED | `date · ↑Nmo ahead` or `↓Nmo behind` | `$X · over/under cap` |
| PACE | `$X / mo` | `$X / mo` |

All numerics IBM Plex Mono `tabular-nums`. Labels smallcaps `var(--text-3)`.

**Coaching slot** (replaces prototype Moves section):
- `composeCoaching()` output rendered as italic body text (NOT Fraunces — reserved for dashboard editorial brief per R.0)
- `text-sm text-[--text-2] italic`, top-bordered with `border-t border-[--hairline]`
- Empty/null coaching → slot disappears entirely

**Files:**
- Create: `src/components/goals/goal-card.tsx`
- Modify: `src/components/goals/archive-goal-button.tsx` — restyle for card icon-button context
- Modify: `src/components/goals/delete-goal-button.tsx` — restyle for card icon-button context

### T3 — `<GoalProgress>` (tick + position-dot bar)

**Ships:** prototype-shape progress bar — track + filled portion + hairline ticks at 25/50/75% + "you are here" position dot at fill-edge + 3-cell amount row below (current short · pct% · target short).

**Implementation:**
- Track: `bg-black/10 dark:bg-white/10` (matches R.2 bar tracks)
- Fill: 0 → `min(progress.fraction, 1) × 100%`. Color: `--semantic-success` for on-pace/hit, `--semantic-caution` for behind/over (resolved per goal's paceVerdict)
- Ticks at 25/50/75% — 1px wide vertical lines in `bg-[--text-3]`
- Position dot: 8px circle at fill-edge with halo (matches hero "you are here" dot pattern from R.2)
- Below: 3-cell flex row with short-form amounts (`$5.8k`-style abbreviation for compact display)

**Files:**
- Create: `src/components/goals/goal-progress.tsx`
- Delete: `src/components/goals/progress-bar.tsx` (superseded; used to be `<ProgressBar>`; consumers updated in T2)

### T4 — `/goals` route rewrite + archived toggle

**Ships:** `src/app/(app)/goals/page.tsx` fully rewritten to render new components in prototype order: header → summary strip → active card list → "Add a goal" bottom CTA → archived toggle. New `<ArchivedToggle>` client component reveals archived goals on click.

**Page data** (verified during brainstorming — no N+1 concern; `getBehindSavingsCoachingCategory(userId)` is user-scoped, `composeCoaching` is pure):

```ts
const [goals, sourceHealth, coachingCategory] = await Promise.all([
  getGoalsWithProgress(userId, { includeInactive: true }),
  getSourceHealth(userId),
  getBehindSavingsCoachingCategory(userId), // single fetch shared by all cards
]);
const active = goals.filter(g => g.isActive);
const archived = goals.filter(g => !g.isActive);
// coachingCategory passed to <GoalCard> as a prop; each card's composeCoaching
// call decides locally whether to consume it (only behind-savings goals do).
```

**ArchivedToggle behavior:**
- When `archived.length === 0`: render nothing
- Otherwise: render disclosure button `▾ Show archived (N)` / `▴ Hide archived` toggling visibility of an inline `<GoalCard>` list with archived prop (visual reduction: 70% opacity, archive icon swaps to unarchive)

**Files:**
- Rewrite: `src/app/(app)/goals/page.tsx`
- Create: `src/components/goals/archived-toggle.tsx` (`'use client'`)

### T5 — Delete `/goals/[id]` + obsolete components

**Ships:** detail page route deletion + cleanup of all components/queries it exclusively consumed.

**Deletes:**
- `src/app/(app)/goals/[id]/page.tsx` (the detail page itself; `[id]/edit/page.tsx` preserved)
- `src/components/goals/pace-leaderboard.tsx`
- `src/components/goals/goal-row.tsx`
- `src/components/goals/coaching-card.tsx`
- `src/components/goals/projection-card.tsx`
- `src/components/goals/trajectory-chart.tsx`
- `src/components/goals/savings-feed.tsx`
- `src/components/goals/spend-cap-feed.tsx`
- `src/components/goals/detail-header.tsx`
- `src/lib/goals/trajectory.ts` + `trajectory.test.ts`
- Functions in `src/lib/db/queries/goal-detail.ts` only consumed by deleted feeds (audit during T5)

**Adds:**
- Redirect in `next.config.js`: `/goals/:id → /goals` permanent
- Audit `revalidatePath('/goals/...')` calls in `src/lib/goals/actions.ts` — rewrite `/goals/${id}` invalidations to `/goals` where the specific path is gone
- Update CLAUDE.md roadmap entry: note /goals/[id] deleted in R.3.1, link this SPEC

**Files:** see "Deletes" above; modify `next.config.js`, `src/lib/goals/actions.ts` (probably), `CLAUDE.md`

### T6 — Restyle `/goals/new` + `/goals/[id]/edit` forms

**Ships:** visual restyle of `<GoalForm>` and the two pages that consume it. Foothold tokens (no rogue slate). Editorial page header (eyebrow "Plan" + h1 "New goal" / "Edit goal"). No logic changes.

**Files:**
- Modify: `src/components/goals/goal-form.tsx`
- Modify: `src/app/(app)/goals/new/page.tsx`
- Modify: `src/app/(app)/goals/[id]/edit/page.tsx`

### T7 — UAT polish

Reserved for fixes surfaced during browser walkthrough (per R.1/R.2 pattern).

---

## Final component map

```
src/components/goals/
  goals-page-header.tsx      [NEW T1]
  goals-summary-strip.tsx    [NEW T1]
  goal-card.tsx              [NEW T2]
  goal-progress.tsx          [NEW T3]   replaces progress-bar.tsx
  archived-toggle.tsx        [NEW T4]   'use client'
  archive-goal-button.tsx    [MOD T2]   icon-button restyle
  delete-goal-button.tsx     [MOD T2]   icon-button restyle
  goal-form.tsx              [MOD T6]   visual restyle

  pace-leaderboard.tsx       [DEL T5]
  goal-row.tsx               [DEL T5]
  coaching-card.tsx          [DEL T5]
  projection-card.tsx        [DEL T5]
  trajectory-chart.tsx       [DEL T5]
  savings-feed.tsx           [DEL T5]
  spend-cap-feed.tsx         [DEL T5]
  detail-header.tsx          [DEL T5]
  progress-bar.tsx           [DEL T3]

src/lib/goals/
  pace.ts                    KEEP
  coaching.ts                KEEP
  discretionary.ts           KEEP
  trajectory.ts              [DEL T5]
  trajectory.test.ts         [DEL T5]

src/lib/db/queries/
  goals.ts                   KEEP
  goal-detail.ts             [TRIM T5] — drop functions only used by deleted feeds

src/app/(app)/goals/
  page.tsx                   [REWRITE T4]
  [id]/page.tsx              [DEL T5]
  [id]/edit/page.tsx         [MOD T6]   visual restyle
  new/page.tsx               [MOD T6]   visual restyle

next.config.js               [MOD T5]   add /goals/:id → /goals redirect
src/lib/goals/actions.ts     [MOD T5]   revalidatePath audit
CLAUDE.md                    [MOD T5]   roadmap note
```

---

## Tests

Target: 542 → ~532 (no new pure helpers; only deletion of `trajectory.test.ts` cases).

| File | Change | Estimate |
|---|---|---|
| `src/lib/goals/trajectory.test.ts` | DELETE | −5 to −10 cases |
| `src/lib/goals/coaching.test.ts` | KEEP | unchanged |
| `src/lib/goals/discretionary.test.ts` | KEEP | unchanged |
| `src/lib/goals/pace.test.ts` | KEEP | unchanged |
| Component tests | none introduced | 0 |

No new pure logic introduced; T2's per-type label config is small + obvious + non-branching. UAT-validated.

---

## UAT criteria

Each item = manual browser check. T7 polish iterates until all pass.

### /goals page (T1, T4)
- [ ] Page header renders eyebrow ("Plan") + h1 ("Goals") + right-aligned freshness meta ("Fresh Nh ago · N sources")
- [ ] Page-sub copy renders "Targets you've committed to."
- [ ] Summary strip shows 4 stats: Active goals · On track · Total saved · Total committed (with mono numerals)
- [ ] Active goal cards render in vertical stack
- [ ] "Add a goal" bottom CTA renders with hint "A goal becomes real when you commit to it."
- [ ] Archived toggle absent when no archived goals; otherwise shows "Show archived (N)" disclosure button that expands inline
- [ ] Empty state (zero goals total) renders existing CTA + iconography

### GoalCard (T2)
- [ ] Card renders title + intent line in header
- [ ] Status pill renders correctly per `paceVerdict` × goal-type with dot prefix
- [ ] 4-cell number grid renders type-dependent labels (TARGET/CAP, SAVED/SPENT, PROJECTED, PACE)
- [ ] All numerics render in IBM Plex Mono with tabular-nums
- [ ] Edit icon links to `/goals/[id]/edit`
- [ ] Archive icon triggers existing archive action (with optimistic update or `revalidatePath('/goals')`)
- [ ] Delete icon triggers existing delete action with confirmation modal
- [ ] Coaching sentence renders below progress bar when `composeCoaching` returns non-null
- [ ] Coaching slot disappears when `composeCoaching` returns null
- [ ] Dark + light mode parity

### GoalProgress (T3)
- [ ] Track + fill renders proportional to `progress.fraction`
- [ ] Hairline ticks at 25/50/75%
- [ ] Position dot at fill-edge with halo
- [ ] Fill color: green for on-pace/hit, amber for behind/over
- [ ] Below-bar 3-cell row: current short · % · target short
- [ ] Edge: fraction > 1 (over-cap) renders bar fully filled, with position dot at right edge

### Forms (T6)
- [ ] `/goals/new` form renders with Foothold tokens
- [ ] `/goals/[id]/edit` form renders with Foothold tokens
- [ ] Form submit + cancel preserve existing behavior
- [ ] No logic regressions on goal CRUD

### Route deletion (T5)
- [ ] `/goals/[id]` returns 308 redirect to `/goals` for any id
- [ ] No console errors from missing component imports
- [ ] Existing goals server actions still revalidate the correct path

### Regression
- [ ] `/dashboard` goals card row unaffected
- [ ] `/goals/[id]/edit`, `/goals/new` unaffected by route fold
- [ ] Email digest / cron paths unaffected
- [ ] `prefers-reduced-motion` honored

---

## Risk register

| Risk | Severity | Mitigation |
|---|---|---|
| `composeCoaching` per-goal N+1 fetch | ~~Medium~~ Resolved | Verified during brainstorming: `composeCoaching` is pure/synchronous, `getBehindSavingsCoachingCategory(userId)` is user-scoped. Single fetch in T4's page `Promise.all`; passed as prop to each card. |
| External bookmarks to `/goals/[id]` | Low | next.config.js redirect `/goals/:id → /goals` permanent (308) |
| Detail page transaction-edit affordance lost | Low | Transactions remain editable from /transactions + dashboard recent activity; goal-scoped edit was a Phase 3-pt3 polish, not load-bearing |
| Test count drop from trajectory tests | Low | Documented in test plan; expected outcome |
| RSC boundary failure on new components (strike-3 risk per CLAUDE.md) | Low | `<ArchivedToggle>` is the only new `'use client'` component; receives only primitive props |
| paceVerdict 'hit' pill copy for spend-cap edge | Low | T2 + T7 verify "Under cap" reads correctly when goal period closes within cap |
| CLAUDE.md update churn | Low | T5 adds one Phase 6 status note + R.3.1 reference; surgical edit |

---

## Open questions for T7 polish

- **Card density**: prototype's cards are tall (4 number cells + progress + coaching ≈ 280px each). With 3+ active goals the page scrolls. Consider compact mode toggle? Defer — see how 3-card stack reads first.
- **Status pill `on-pace` color**: prototype shows muted/neutral; R.2 convention reserved `--semantic-success` for "explicit positive event" (e.g., hit target). On-pace might warrant a subtle green tint rather than fully neutral grey. Decide at T7 based on visual.
- **Per-card progress-bar position dot at fraction = 0**: dot at left edge looks like a generic indicator, not a "you are here" marker. Render differently? Or omit dot entirely when fraction < some floor (e.g., 5%).
- **Coaching slot for "hit" goals**: composeCoaching's `hit` branch may produce stale copy ("On track to hit by X" when X is past). Verify in T7.

---

## Cross-references

- Master spec: [docs/redesign/SPEC.md](../SPEC.md)
- R.2 SPEC (precedent for IA + freshness pattern): [docs/redesign/r2-dashboard/SPEC.md](../r2-dashboard/SPEC.md)
- Bundle reference: [claude-design-context/foothold-goals.jsx](../../../claude-design-context/foothold-goals.jsx)
- CLAUDE.md — `/goals` IA rework + Phase 3-pt3 + Phase 3-pt3.b for surviving logic context
