# Session handoff — 2026-05-11 (mid-R.3.4)

> **Stopping point reached mid-execution.** R.3.4 is 8 of 14 tasks shipped.
> Resume with T9 (`<AllocationSection>`) per the PLAN.
>
> **This file supersedes** the original `HANDOFF-2026-05-11.md` (which framed
> picking up R.3.4 from scratch). Delete the old handoff after the next
> session reads this one.

---

## Why we paused

User flagged Vercel deployment failures (last 10 deploys errored; the live app at <https://usefoothold.com> is running ~2-day-old code). A separate agent is investigating on a `revert-zod-4` branch off `main`. R.3.4 work is purely additive on `feat/redesign` (which Vercel does not auto-deploy from), so pausing avoids stacking 6 more unrelated commits on top of an active production-fire diagnosis.

**R.3.4 work is not implicated in the Vercel issue** — my first R.3.4 commit landed ~30 minutes before the pause; the deploy failures started ~48 hours earlier. T1's schema migration **was applied to production Supabase** (additive table, no existing-data impact) but if the parallel agent is comparing DB state across deploys, surface this new variable to them.

## Where R.3.4 stands

**Branch:** `feat/redesign` (NOT yet on `feat/r3-4-investments` — branch cut was deferred to T9-T14 execution time to avoid earlier coordination friction with a parallel code-quality agent's WIP, which has since landed as `567a926 chore: address data quality review followups`).

**Commits on `feat/redesign` since R.3.3 merge:**

```
9cd1e3e feat(r3.4): T8 PerformanceChart client component (Recharts dual-line)
7d5dad4 feat(r3.4): T7 PortfolioHero server component
56cdafb feat(r3.4): T6 InvestmentsPageHeader server component
3fa1aad feat(r3.4): T5 recordPortfolioSnapshot + dispatcher integration
e23bf40 feat(r3.4): T4 getPortfolioHistory query
4a72d74 feat(r3.4): T3 classifyHolding + buildAllocation pure helpers
89b7364 feat(r3.4): T1 portfolio_snapshot table + RLS
567a926 chore: address data quality review followups   ← parallel agent
2f5b8db feat(r3.4): T2 walkbackPortfolio pure helper
5577f85 docs(r3.4): lock R.3.4 investments SPEC + PLAN
afceb13 docs(redesign): session handoff for R.3.4 pickup  ← old handoff
```

| Acceptance | Status |
|---|---|
| Typecheck | Clean |
| Tests | 611 / 611 (was 578; +13 walkback + 20 allocation) |
| Build | Not run yet — defer to T13's pre-commit gate |
| Working tree | Clean at pause |
| RSC boundary count | 8 server + 2 new client (PerformanceChart, HoldingsView-to-come). Strike-3 watch still safe — both client islands have plain-data-only prop contracts. |

## What shipped (T1-T8 summary)

**Data layer complete:**

- **T1 (`89b7364`)** — `portfolio_snapshot` table added to `schema.ts` (appended at bottom, after `snaptradeUsers`). 6 columns: `id`, `user_id`, `snapshot_date`, `total_value`, `total_cost_basis`, `created_at`. Unique index on `(user_id, snapshot_date)`. **Applied to production Supabase via `scripts/r3-4-create-portfolio-snapshot.mjs`** — bypasses `drizzle-kit push` (hangs on stdin even with `strict:false`) and psql (not installed locally). RLS enabled. Idempotent script; safe to re-run.
- **T2 (`2f5b8db`)** — `walkbackPortfolio` pure helper in `src/lib/investments/walkback.ts`. Allowed-type filter: `'transfer' | 'cash' | 'fee'` (per Plaid sign convention — buys/sells/dividends/cancels are internal asset class moves, zero-sum for portfolio total). End-of-day semantics (each chart point is the value AFTER that day's txns settle). 13 vitest cases.
- **T3 (`4a72d74`)** — `classifyHolding` + `buildAllocation` in `src/lib/investments/allocation.ts`. 6 AllocationClass values; `'Other'` is the safe-default fallthrough + always-pinned-last. 20 vitest cases.
- **T4 (`e23bf40`)** — `getPortfolioHistory(userId)` in `src/lib/db/queries/portfolio-history.ts`. Three parallel reads (snapshots, txns, holdings+closePrice). Merges walkback estimates with real snapshot values per range. 1D special-case bypasses walkback entirely (uses closePrice × quantity vs institutionPrice × quantity).
- **T5 (`3fa1aad`)** — `recordPortfolioSnapshot(userId)` in `src/lib/investments/snapshots.ts`, plus dispatcher integration in `src/lib/sync/dispatcher.ts`. Snapshot writes piggyback on `syncExternalItem` success path; failures are best-effort (logged to `error_log` under `portfolio.snapshot`, never propagated).

**Component layer (3 of 5 complete):**

- **T6 (`56cdafb`)** — `<InvestmentsPageHeader>` server component. Eyebrow "Long horizon" (diverges from sidebar group "Records" — first R.3 sub-phase to do so, per SPEC #6).
- **T7 (`7d5dad4`)** — `<PortfolioHero>` server component. Replaces `<PortfolioSummary>`. Day delta moved out (lives in chart's 1D tab now).
- **T8 (`9cd1e3e`)** — `<PerformanceChart>` client component (only client island in R.3.4 so far). Dual `<Line>` Recharts implementation; range tabs 1D/1M/3M/6M/1Y/5Y; sparse-data empty state; 1D-tab-disabled state when no closePrice data.

## What remains (T9-T14)

Read [PLAN.md](r3-4-investments/PLAN.md) tasks T9-T14 verbatim — fully self-contained, each step is bite-sized:

- **T9** — `<AllocationSection>` server component (bar + legend; consumes `buildAllocation` output)
- **T10** — `<HoldingsView>` client component (Positions/Accounts tab switcher; ~250-line file with embedded `PositionsList` + `AccountsList` sub-renders; plain-data-only props)
- **T11** — `<InvestmentTxnsTable>` token-swap restyle + date grouping via `groupTransactionsByDate` reuse + eyebrow rename to "Recent activity"
- **T12** — `<MobileInvestments>` shrinks to recent-activity-only (drops holdings `<MobileList>` consumer; responsive `<HoldingsView>` absorbs the mobile path)
- **T13** — Page wholesale rewrite + delete obsolete files (`group-by-toggle.tsx`, `holdings-table.tsx`, `portfolio-summary.tsx`) + audit `revalidatePath('/investments')` wiring on sync actions
- **T14** — UAT walk (manual browser walk against SPEC's UAT criteria + branch cut + merge `--no-ff` to `feat/redesign` + next-phase handoff)

## Pre-flight for the next session

Run BEFORE T9:

```bash
git fetch origin
git checkout feat/redesign                  # MUST be feat/redesign
git status                                  # MUST be clean
git log --oneline -3                        # confirm 9cd1e3e T8 is HEAD
git rev-parse --abbrev-ref HEAD             # MUST be feat/redesign

npm run typecheck                           # MUST be clean
npm run test 2>&1 | tail -3                 # MUST be 611 passed
```

If the working tree isn't clean (e.g., this handoff file is untracked — it was written from `revert-zod-4` mid-Vercel-investigation):

```bash
# Commit this handoff first
git add docs/redesign/HANDOFF-2026-05-11-mid-r3-4.md
git rm docs/redesign/HANDOFF-2026-05-11.md  # old handoff is now stale
git commit -m "docs(redesign): mid-r3.4 session handoff supersedes initial"
```

## Key gotchas for the next agent

### 1. Branch cut decision
The PLAN's T14 calls for a `feat/r3-4-investments` branch cut + `--no-ff` merge back at the end. **Branch cut was deferred** during the initial session because of a concurrent code-quality agent's WIP. That agent's work has landed (`567a926`), so cutting now is safe. Two paths:

- **(A) Cut now and rebase T1-T8 onto it.** Cleaner history (`feat/r3-4-investments` carries all R.3.4 commits) but rewrites SHAs which is mildly annoying.
- **(B) Leave commits on `feat/redesign` and skip the branch cut.** Simpler. Loses the per-phase branch-isolation pattern but matches the practical reality that 8 commits already landed there.

Recommendation: **B**. R.3.4 has effectively merged into `feat/redesign` incrementally already; preserving the merge-commit ceremony adds no value. Update T14 step 6 (merge `--no-ff`) to a no-op + update [README.md](README.md) phase table directly.

### 2. Drizzle-kit push hang
Per CLAUDE.md > Lessons learned, `drizzle-kit push` hangs on stdin even with `strict:false`. For any future DDL, use the established workaround in `scripts/r3-4-create-portfolio-snapshot.mjs` — postgres-js + raw SQL in a transaction. **No new DDL is required for T9-T14** (table already exists), so this is just a future-reference note.

### 3. Strike-3 RSC boundary watch
T10 adds the second new client component (`<HoldingsView>`). Both T8 and T10 have plain-data-only prop contracts — **do not add any function props or `forwardRef` components to either**. If you need state that wraps server children, follow R.3.2's `<RecurringTabs>` children-prop pattern.

T12's `<MobileInvestments>` keeps the existing `<MobileList>` consumer for recent activity — that's the existing strike-2 surface, not new. Don't add another `<MobileList>` consumer.

### 4. Day-1 chart will be sparse
T1's snapshot table is populated only when `syncExternalItem` runs. Until then, the chart's solid (real) line is empty for everyone — only the dashed (estimated) walkback line renders. **The first manual /settings sync after deployment will populate today's row.** Tomorrow's nightly sync adds another. The chart fills in real-data over time; T14 UAT should expect today's "solid line = single point at today" if you sync before the walk.

### 5. Vercel context
At pause time, **last 10 production deploys had been failing** (live app ~2 days stale). Coordinating agent may have made or be considering changes to `main`. My R.3.4 commits do not depend on `main` state and won't help or hurt their diagnosis. **Watch for**: if the Vercel fix involves a schema change or a sync-dispatcher hotpatch, my T1 schema addition and T5 dispatcher integration might overlap their work. Coordinate before merging `feat/redesign` to `main`.

### 6. `groupTransactionsByDate` reuse in T11
T11 reuses R.3.3's `groupTransactionsByDate` from `src/lib/transactions/group-by-date.ts`. Verify the helper's output shape (`{dateIso, dayName, dayNet, rows}`) matches the consumer's expectations in T11's code block. If R.3.3 used different field names, adjust the T11 consumer at write time.

## Memory cues for the next session

User auto-memory should already carry:
- "Foothold Redesign R.3.3 Transactions shipped (2026-05-11)"
- "Plaid Balance approved 2026-05-11, Path A rollout pending env+reconnect"

Worth saving (next agent at session start, if relevant):
- R.3.4 paused at T8 of 14 on 2026-05-11; resume per `HANDOFF-2026-05-11-mid-r3-4.md`
- `portfolio_snapshot` table live in prod Supabase as of 2026-05-11 (additive; safe but new)

---

**Session ends here.** Pick up by reading this file + running the pre-flight checks above.
