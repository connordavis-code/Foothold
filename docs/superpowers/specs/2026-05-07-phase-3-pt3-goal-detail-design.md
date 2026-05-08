# Phase 3-pt3 — per-goal coaching detail page

**Date:** 2026-05-07
**Skill:** brainstorming (locked decisions through visual + AskUserQuestion rounds)
**Status:** awaiting user spec review before invoking writing-plans

---

## 1. Feature Summary

`/goals` today renders a sectioned pace leaderboard (Behind / On-pace, severity-sorted) with stretched-`<Link>` drilldown wired only on **spend-cap** rows — they map cleanly to `/transactions?category=…&from=monthStart`. Savings rows are read-only because account-scope drilldowns surface paychecks and transfers as noise.

This phase adds a routed detail page at `/goals/[id]` that works for **both goal flavors** (savings + spend-cap), with shared chrome and a branched middle. The page answers the operator's four questions about a single goal: WHERE am I, WHAT contributed, WILL I make it, HOW do I improve.

The phase was originally deferred at the /goals IA rework with the note *"defer until real data flows."* Real Plaid + SnapTrade data has been flowing since 2026-05-07; this phase closes that loop.

## 2. Primary User Action

**Read pace at a glance, drill into the contributing data, leave with one concrete coaching takeaway.** Every section on the page exists in service of getting the operator from "is this goal in trouble?" to "what specific action would change that?" — without spending API tokens on AI inference (locked: static template + heuristics).

## 3. Locked Decisions (from brainstorm)

| # | Decision | Rationale (chosen vs alternatives) |
|---|---|---|
| 1 | Both savings + spend-cap in MVP | Chrome (header / projection / narrative) is shared across types; branching at component level avoids a second project |
| 2 | Static template + heuristics for narrative | Deterministic, free, instantly testable; LLM upgrade is its own follow-up phase. Avoids token-budget complexity in MVP |
| 3 | All five sections (header, projection, chart, contributing data, narrative) | Chart is consistent with `/drift` `/simulator` `/dashboard`; contributing data backs the narrative honestly |
| 4 | Chart shape: cumulative actual vs ideal-pace dashed lines | Tells the goal-pace story most directly; rejected per-period bars (less pace-focused) and big-numbers-only (loses visual story) |
| 5 | Savings X-axis: campaign window (`created_at` → `target_date`, fallback `created_at + 12mo`) | Frames the goal as a campaign rather than a rolling window. Spend-cap is intrinsically `month_start` → `month_end` |
| 6 | Routed page at `/goals/[id]` (not vaul drawer) | Browser back works, URL is shareable / deep-linkable for AI suggestions and email digests, mobile + desktop the same chrome |

## 4. Architecture

**Route:** `/goals/[id]` — Next 14 dynamic segment, RSC by default. Auth gate inherited from the `(app)/layout.tsx` `auth()` call.

**File layout:**

| Path | Role |
|---|---|
| `src/app/(app)/goals/[id]/page.tsx` | Server component. Owns data fetch (parallel `getGoalWithProgress` + `getGoalTrajectory` + `getContributingFeed`) and the 5-section layout |
| `src/app/(app)/goals/[id]/not-found.tsx` | Renders 404 chrome when goal is missing or not owned by the signed-in user |
| `src/lib/db/queries/goal-detail.ts` | New query module: `getGoalWithProgress(goalId, userId)`, `getGoalTrajectory(goalId, userId)`, `getContributingFeed(goalId, userId)`. Each scoped through the user-ownership JOIN — never trust the URL param |
| `src/lib/goals/coaching.ts` | Pure predicate `composeCoaching(input): CoachingOutput`. Tested in isolation, no DB or Next runtime |
| `src/lib/goals/trajectory.ts` | Pure predicate `walkBackTrajectory(anchor, deltas, window): TrajectoryPoint[]`. Same shape `walkBackSparkline` would have been if extracted from `getNetWorthSparkline` during W-06 |
| `src/components/goals/detail-header.tsx` | Server component. Goal name, type pill, current-vs-target headline, status pill (`paceVerdict`), edit + delete affordances (reuses existing AlertDialog gate from `/goals`) |
| `src/components/goals/projection-card.tsx` | Server component. Pulls projection from existing forecast engine output. Headline copy varies by goal type (see § 5) |
| `src/components/goals/trajectory-chart.tsx` | Client component (Recharts). Cumulative actual + ideal-pace + projected lines |
| `src/components/goals/contributing-feed.tsx` | Server component. Branches on `goal.type`: `<SpendCapFeed>` or `<SavingsFeed>` |
| `src/components/goals/coaching-card.tsx` | Server component. Renders the static coaching output |

**Data flow:** all reads happen in `page.tsx` via `Promise.all`, props pushed down. The Recharts chart is the only client island that consumes data; everything else is server-rendered.

**`/goals` link wiring:** `<GoalRow>` in `src/components/goals/goal-row.tsx` is updated to wrap **both** savings and spend-cap rows in `<Link href={"/goals/"+id}>` (today only spend-cap is wrapped). The existing spend-cap "stretched-Link to filtered transactions" is **replaced** by this drill — the deeper detail page is a clean superset.

## 5. Section Breakdown

### 5.1 Header

```
┌─────────────────────────────────────────────────────────────┐
│ EYEBROW: Savings goal · Created 2025-09-12                  │
│                                                             │
│ Emergency fund                              [Edit] [Delete] │
│ $2,400 of $5,000 · 48%                  ┌──────────────┐    │
│                                          │ Behind pace  │    │
│                                          └──────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

- Eyebrow text: `${typeLabel} · Created ${humanizeDate(created_at)}` (uses existing `humanizeDate` from `src/lib/format/date.ts`).
- Status pill colors flow from the locked /goals palette (`text-amber-700` / `bg-amber-500/15` / `border-amber-500/30` for behind; `text-foreground` for on-pace; `text-destructive` for over-cap; muted for hit/missed).
- Edit + delete buttons appear on this detail page in addition to (not replacing) the existing /goals controls. Both surface the same AlertDialog gates and the same server actions (`updateGoalAction`, `deleteGoalAction` from `src/lib/goals/actions.ts`). The Edit button opens the existing edit form (currently a modal on /goals); no new edit form is created in this phase.

### 5.2 Projection card (HEADLINE)

The single most important section. Copy varies by goal type AND by whether projection is favorable:

**Savings, on-track:**
*"Projected to hit **$5,000** by **Aug 14, 2026** — 4.5 months ahead of your Dec 31 target."*

**Savings, behind:**
*"At current pace, you'll be **$1,200 short** of the Dec 31 target. ETA at this rate: **Mar 2027**."*

**Spend-cap, on-track:**
*"Projected month-end spend: **$623** — comfortably under the **$700** cap."*

**Spend-cap, projected over:**
*"Projected month-end: **$847** ($147 over the **$700** cap)."*

**Spend-cap, already over:**
*"Already **$87 over** the $700 cap with 12 days left in the month."*

Projection sourced from existing forecast engine — `projectCash` produces goal projections via the existing baseline + override pipeline. New helper in `goal-detail.ts` calls `projectCash` and extracts the relevant goal slice.

### 5.3 Trajectory chart (Recharts)

Three lines, locked shape from the brainstorm:

- **Solid foreground** — actual cumulative (savings: balance sum; spend-cap: cumulative spend).
- **Dashed muted-foreground** — linear ideal pace from $0 (or $cap_limit at month start, inverted for spend-cap) → target across the campaign window.
- **Dashed continuation in the foreground hue** — projected line from "today" forward at current velocity, ending at projected outcome.

Visual treatment: single foreground hue (operator-aesthetic per DESIGN.md restraint), amber when projected to miss, no fill.

**Empty state:** when goal is < 7 days old OR has zero contributing transactions, replace the chart with a small caption: *"Enough data to chart trajectory after a week of activity."* Same eyebrow-style as the W-06 sparkline empty state.

**Mobile:** Recharts `aspect-[16/10]` on `<md`, `aspect-[5/2]` on `md+`. Tooltip on tap (Recharts `trigger="click"` on mobile, hover on desktop — same pattern as `/simulator`'s `<ForecastChart>`).

### 5.4 Contributing data feed

Branches by `goal.type`:

**Spend-cap → `<SpendCapFeed>`:**
- Top 20 transactions in the current month matching `accountIds` + `categoryFilter`, sorted by `amount` desc.
- Tap-to-edit on mobile via existing `<TransactionDetailSheet>`; presentational on desktop (matches /transactions pattern).
- Footer link: *"View all in /transactions"* → `/transactions?category=${categoryFilter[0]}&from=${monthStart}`. (When `categoryFilter` has multiple categories or is null, the "View all" link uses `from=monthStart` only.)
- Empty state: *"No spending matched this cap yet this month."*

**Savings → `<SavingsFeed>`:**
- Balance-change feed grouped by week. Each row: week label ("Mar 24-30"), net delta across `accountIds` for that week, count of contributing transactions.
- No tap-to-edit (savings rows are read-only — surfacing tap-edit would conflict with the "asymmetric drill" decision from the /goals IA rework).
- Empty state: *"No activity on contributing accounts yet."*

### 5.5 Coaching card

Output from `composeCoaching(input)`. Two-sentence structure, type-aware:

**Pace status (sentence 1):**
- Savings, behind: *"You're **${monthlyDeficit}/mo behind** pace."*
- Savings, ahead: *"You're **${monthlySurplus}/mo ahead** of pace."*
- Savings, hit: *"You hit this goal **${humanizeDate(hitAt)}** — ${overshoot} ahead of target."*
- Spend-cap, projected over: *"Projected to overspend by **${overage}** at this pace."*
- Spend-cap, on-track: *"Tracking **${margin} under** the cap."*
- Spend-cap, already over: *"Already **${overage} over** the cap."*

**Action (sentence 2, only when behind/over):**
- Savings: pull `/drift`'s top elevated category for the user. If drift has nothing flagged, fall back to the largest non-recurring outflow category by trailing-3-month median (excluding `TRANSFER_IN`, `TRANSFER_OUT`, `LOAN_PAYMENTS` — same exclusions as `getDashboardSummary`'s `monthSpend` predicate). *"Trim ${categoryName} (your largest discretionary at ${monthlyAmount}/mo) by ${monthlyDeficit} to recover."*
- Spend-cap: top-3 contributing merchants this month from the feed. *"Skipping any one of ${m1} (${a1}), ${m2} (${a2}), ${m3} (${a3}) resets your pace."*

When on-track or hit, the action sentence is omitted — short positive confirmation only.

**Render:** italic foreground sentence + small muted-foreground action sentence below. No icons, no chrome ornament — matches the editorial-card register from DESIGN.md.

## 6. Trajectory computation

The locked approach:

**Approach A (MVP):** Walk back from current sum through transactions on `goal.accountIds`, mirroring `getNetWorthSparkline` from `src/lib/db/queries/dashboard.ts:218-268`. Same correctness model as W-06 — anchor on accounts that existed at window start, filter the transaction JOIN by `lte(financialAccounts.createdAt, windowStart)`.

**Limitations to document inline:** Investment accounts are excluded from the walk because we lack price-history. Savings goals on investment accounts (e.g., Roth IRA accumulation) will only show contribution-flow trajectory, not market-drift accumulation. A `// TODO: Approach B` comment in `goal-detail.ts` flags this for the eventual `goal_progress_snapshot` table when the gap becomes a real complaint.

**Approach B (post-MVP):** `goal_progress_snapshot (goal_id, day, current_amount)` populated by nightly cron. Authoritative; handles market drift correctly. Deferred — schema work + cron extension not justified until investment-savings goals land.

**Approach C:** Per-render compute + per-day cache. Solves nothing A doesn't.

## 7. Edge cases

| Case | Behavior |
|---|---|
| Goal not found OR not owned by user | `notFound()` → `not-found.tsx` |
| `goal.isActive = false` | Render normally with muted "Archived" eyebrow |
| Brand-new goal, no transactions | Chart empty-state caption; feed shows empty-state row; coaching card encourages first action ("Add your first contribution / log first spend to start tracking") |
| Spend-cap at end-of-month | Projection card collapses to actual final spend; chart shows full month; "next month resets" footer link |
| Savings goal past `target_date` (still active, not hit) | Chart freezes at target date for the ideal-pace line; projection card says "Past target — short by ${shortfall}"; status pill shows Missed |
| `accountIds` empty or all-stale | Coaching card surfaces *"No contributing accounts configured. Edit this goal to add one."*; chart + feed render empty states |

## 8. Testing

Pure predicates extracted for vitest (matches Phase 5 pattern):

| Predicate | File | Coverage |
|---|---|---|
| `composeCoaching(input)` | `src/lib/goals/coaching.ts` | Savings/cap × behind/on-pace/hit/missed × hasTopCategory/no-data → ~12 cases |
| `walkBackTrajectory(anchor, deltas, window)` | `src/lib/goals/trajectory.ts` | Empty deltas → flat at anchor; single-day delta → step; mixed → known sequence; days=1 → just today |
| Existing `paceVerdict` from `src/lib/goals/pace.ts` | (already covered) | Reused — no new tests |

Goal of test count delta: ~+12 vitest cases, no DB or Next runtime required.

DB query layer (`goal-detail.ts`) is unit-light; integration via existing /goals smoke patterns (manual UAT at session-end).

## 9. Out of scope (Phase 3-pt3.b candidates)

> Updated 2026-05-07 evening — the four bolded entries below were originally
> unmarked as deferred but turned out to be plan→spec drift. External review
> caught them; documented here as Phase 3-pt3.b candidates.

- **LLM coaching narrative** — replace static template with Anthropic Haiku 4.5 call. Cache strategy TBD: stale-tolerant per-goal cache (matches `/simulator` `<NarrativePanel>`) or on-demand button (matches `/insights`).
- **Investment-account drift in savings trajectory** — Approach B `goal_progress_snapshot` table.
- **Drift query as primary source for behind-savings coaching action** — § 5.5 calls for "pull `/drift`'s top elevated category" first, with the trailing-3-month-median fallback. MVP ships only the fallback (`getTopDiscretionaryCategory` in `src/lib/db/queries/goal-detail.ts`); upgrade calls `getDriftAnalysis` first.
- **Projected continuation line on trajectory chart** — § 5.3 specifies three lines (actual, ideal pace, projected continuation in the foreground hue extending from "today" forward at current velocity). MVP ships only the first two; the chart still tells the pace story without the projected segment.
- **Archived goals (`isActive: false`) rendering with muted "Archived" eyebrow** — § 7 edge-case row promises this. `getGoalDetail` currently reuses `getGoalsWithProgress` which filters `isActive=true`, so archived goals return null and 404. Fix path: either add an `includeInactive` flag to `getGoalsWithProgress` OR factor out per-goal progress computation in `goal-detail.ts`.
- **Mobile tap-to-edit on spend-cap-feed rows via `<TransactionDetailSheet>`** — § 5.4 mobile section. MVP rows are presentational on both desktop and mobile.
- **Goal templates / duplicate-from-existing affordance** — UI only, not load-bearing.
- **Coaching subscription / weekly digest hooks** — would surface the same `composeCoaching` output in the Mon AM email digest.
- **Per-goal historical narrative archive** — track narratives over time the way `/insights` archives weekly reads.

## 10. Visual companion artifacts

- `chart-shape.html` (committed in `.superpowers/brainstorm/43658-1778191387/content/`) — three chart-shape options. Locked: A (cumulative-vs-ideal-pace).
