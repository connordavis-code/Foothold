# Session handoff — 2026-05-08 (Phase 3-pt3.b shipped)

> Pick this up if you're resuming Foothold after the 2026-05-08 session.
> Pair with `CLAUDE.md` for project context. Prior handoff:
> `docs/handoffs/2026-05-07-evening-shipped.md`.

## Where we are

| Area | State |
|---|---|
| **Phase 3-pt3.b** (close the four 3-pt3 deferrals) | ✓ Shipped to `origin/main`. UAT pending on user's end. |
| Plaid sync (WF + AmEx) | Healthy via nightly + cached `accountsGet` for balances. |
| SnapTrade sync (Fidelity 3 accounts) | Healthy. |
| Reliability initiative | Phases 1–4 shipped (parallel agent's prior work). Phases 5 (dashboard trust strip) + 6 (freshness on numbers) are next. |

## What shipped this session

One commit on `main`:

- `feat(goals): close Phase 3-pt3.b deferrals (drift coaching · projected line · archived goals · mobile spend-cap edit)`

8 files changed, +281/-58.

### Item 1 — Drift query as primary coaching source

- New `getBehindSavingsCoachingCategory(userId)` in `src/lib/db/queries/goal-detail.ts`.
- Calls `getDriftAnalysis(userId)` first; picks `currentlyElevated[0]` (already sorted by ratio desc).
- Converts `currentTotal × 52/12 → monthlyAmount`. **Spike rate, not baseline** — the action sentence "Trim X at $Y/mo" should reflect what the user is *currently* spending, not their normal rate. User confirmed this rationale during planning.
- Falls back to existing `getTopDiscretionaryCategory(userId)` when drift has nothing flagged.
- `goals/[id]/page.tsx` swapped from the old helper to the new wrapper.
- Returns the same `TopDiscretionaryCategory | null` shape — no upstream churn.

### Item 2 — Projected continuation line

- Third dashed `<Line>` added to `src/components/goals/trajectory-chart.tsx`. Hue follows `isBehind` (foreground when on-pace, amber `--chart-3` when behind/over) so "where you're heading" matches the current-state color.
- New `projection` prop on the chart (nullable). `mergeByDate` extended to merge a third series.
- `computeProjection(goal, trajectory)` in `goals/[id]/page.tsx`:
  - **Savings:** `dailyRate = monthlyVelocity / 30.5`; `endValue = max(0, lastCumulative + daysRemaining × dailyRate)`. Floor at 0 prevents a negative-velocity savings goal from rendering below the axis.
  - **Spend-cap:** `endValue = projectedMonthly` (already the linear day-of-month extrapolation).
  - Returns `null` when `daysRemaining ≤ 0` (post-target savings goals, end-of-month spend caps).

### Item 3 — Archived goals

- `getGoalsWithProgress(userId, opts?: { includeInactive?: boolean })` — defaults false.
- `getGoalDetail` passes `includeInactive: true` so archived URLs stop 404-ing. The pre-existing `· Archived` eyebrow branch on `<GoalDetailHeader>` is now live (was dead code).
- `/goals` page also passes `includeInactive: true`. `<PaceLeaderboard>` partitions on `isActive` first, then verdict — adds a third "Archived" section beneath Behind/On pace, sorted by `createdAt` desc, wrapper `opacity-70`.
- **Drizzle typing pitfall (worth knowing):** the conditional `where` shape needs an explicit `: SQL` annotation + `and(...)!` non-null assertion. Without it, `and()` returns `SQL | undefined`, and the union-typed `where` arg cascades `any` onto the row tuple of `.select()`. Pattern matches `buildWhere(...)` in `src/lib/db/queries/transactions.ts:65-80`. I burned ~5 round-trips chasing this — written into CLAUDE.md > Roadmap > Done > "Phase 3-pt3.b" so future sessions don't repeat.

### Item 4 — Mobile tap-to-edit on spend-cap feed

- `<SpendCapFeed>` is now a client component holding `active` row state via `useState`.
- Mounts `<TransactionDetailSheet>` (the same picker `/transactions` and `<RecentActivityCard>` use). Maps `SpendCapFeedRow → DetailRow` inline at the open call.
- Query extended in `getSpendCapFeed`: added `pending`, `accountMask`, `overrideCategoryName` (left join `categories` on `transactions.categoryOverrideId`, mirroring `getTransactions`).
- `goals/[id]/page.tsx` adds `getCategoryOptions(userId)` to the `Promise.all` and passes `categoryOptions` through.
- Desktop stays presentational via `md:pointer-events-none md:cursor-default md:hover:bg-transparent` on the row button. Same pattern as `<RecentActivityCard>`.

## Verification status

- **Typecheck/test NOT run this session.** I had no node/npm in my shell environment. User authorized the push without local verification — they should run `npm run typecheck && npm test` post-pull and report any breakage.
- **Browser UAT NOT run this session.** Suggested checklist for the user (or the next session if the user defers it):
  - `/goals` — Archive a goal via edit form → confirm it lands in the new "Archived" section. Click → `/goals/[id]` renders with the "· Archived" eyebrow (no 404).
  - Behind-savings goal with a currently-elevated drift category → coaching action sentence quotes that category. Then check a behind-savings goal with no elevated drift → confirm fallback (median) still produces an action sentence.
  - Any active goal with ≥7 days of trajectory → chart shows three lines: solid actual, dashed muted ideal, dashed foreground/amber projected.
  - Spend-cap goal in mobile viewport (~390px) → tap a feed row → `<TransactionDetailSheet>` opens; re-categorize, confirm toast + Undo. At md+, rows are presentational.

## Plan amendments + non-obvious decisions

1. **Drift conversion uses `52/12` (≈4.33), not `4`.** Quoted as `WEEKS_PER_MONTH` in `goal-detail.ts`. Annual-weeks-divided-by-months is the canonical conversion; using 4 would understate the monthly equivalent by ~8%.
2. **Archived discovery via leaderboard section, not direct URL only.** User chose this during planning — they wanted archived goals to be browsable from `/goals`, not just findable by URL. The Archived section uses the muted eyebrow pattern from DESIGN.md (no new pill or chrome).
3. **Spec § 9 updated** to mark the four shipped items with `~~strikethrough~~` and a SHIPPED note. The other deferred-but-not-promised items (LLM coaching narrative, investment-account drift in savings trajectory, goal templates, coaching weekly digest hooks, per-goal narrative archive) remain open for future scope.

## Next up

Per CLAUDE.md > Roadmap > Next up:

1. **Reliability Phases 5 + 6** — natural continuation. Phase 5 is the dashboard trust strip ("All sources fresh as of 8:14 AM" / "1 source needs attention: AmEx"). Phase 6 is freshness context on key numbers (net worth / investments / forecast baseline). Both consume `getSourceHealth()` from Phase 3 (already shipped). Spec at `docs/reliability/implementation-plan.md` § 5–6.
2. **Phase 4-pt2** — investment what-if simulator. Deferred by design; needs its own brainstorm.

## Verify on next session start

```bash
# 1. Pull + read context
git pull
cat docs/handoffs/2026-05-08-phase-3-pt3b-shipped.md
# (CLAUDE.md > Roadmap > In progress / Next up is canonical for active state)

# 2. Confirm last-shipped commit + tree
git log --oneline -5
# Expect: most recent is the Phase 3-pt3.b feat commit.
git status
# Expect: working tree clean.

# 3. Validate the Phase 3-pt3.b code
npm run typecheck
npm test
# Expect: clean typecheck; tests still ~437/437 (no new tests added — the
# work is mostly query-layer wiring + small UI changes; existing predicate
# coverage still applies).

# 4. Confirm Plaid + SnapTrade syncs are healthy (carryover from prior)
node scripts/diagnose-balance-refresh.mjs | grep -A1 "balance_refresh" | head -10
node scripts/inspect-snaptrade-holdings.mjs | head -5
```

---

**Session end commits:**
- One commit covering all four 3-pt3.b items (see `git log -1`)
- This handoff file: `docs/handoffs/2026-05-08-phase-3-pt3b-shipped.md`

**Next session entry point:** Read this handoff → run verification block → start Reliability Phase 5 (dashboard trust strip) by reading `docs/reliability/implementation-plan.md` § 5.
