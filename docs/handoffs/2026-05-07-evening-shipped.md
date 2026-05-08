# Session handoff — 2026-05-07 evening (~10:15pm PDT)

> Pick this up if you're resuming Foothold after the 2026-05-07 evening session.
> Pair with `CLAUDE.md` for project context. The prior session's entry-point doc was
> `docs/handoffs/2026-05-07-phase-3-pt3-ready.md` — that work is now shipped, plus more.

## Where we are

Two workstreams resolved this session, both pushed to `origin/main`:

| Area | State |
|---|---|
| **Phase 3-pt3** (`/goals/[id]` coaching detail page) | ✓ Live on Vercel. 16 commits. UAT confirmed by user. 4 items deferred to 3-pt3.b (documented in spec § 9 / plan "Out of scope") |
| **Reliability initiative Phase 1** (balance refresh hardening) | ✓ Phase 1 structural fix shipped + verified + Path B applied. Cron `INVALID_PRODUCT` for `balance` was the real root cause; swapped to `accountsGet` (cached). |
| **Reliability Phases 2 + 3** | ✓ Shipped by parallel agent. Health classification + DB query layer in place. |
| Plaid sync (WF + AmEx) | ✓ Healthy via nightly. Balance refresh now uses cached `accountsGet` until/unless Path A is taken. |
| SnapTrade sync (Fidelity 3 accounts) | ✓ Healthy. |

## What shipped this session (origin/main, oldest → newest)

```
a59d014  feat(goals): walkBackTrajectory pure predicate (Phase 3-pt3)
373a994  fix(goals): UTC date math + boundary test in walkBackTrajectory
c4293e4  feat(reliability): Phase 1 balance refresh hardening                [parallel agent]
60e32c4  feat(goals): composeCoaching predicate + formatCurrencyCompact helper
371a72e  feat(reliability): Phase 1 follow-up — wire route.ts + CLAUDE.md     [parallel agent]
46acdbf  feat(goals): getGoalDetail single-goal query with ownership scope
54270a9  feat(reliability): Phase 2 sync health classification (pure)        [parallel agent]
a654a91  feat(goals): getGoalTrajectory query reuses W-06 walk-back pattern
14dfe1f  feat(goals): getContributingFeed query (spend-cap top-20 + savings weekly)
b4ba8fd  feat(goals): detail-header component with status pill and edit/delete
d772e52  fix(goals): pair text-amber-700 with dark:text-amber-300 in detail-header
0f88ed3  feat(goals): projection-card with type-and-verdict-branched copy
a65d883  feat(goals): trajectory-chart Recharts client island
4a45236  fix(goals): YAxis tick formatter handles sub-$1k targets
4fc173f  feat(goals): spend-cap and savings contributing-feed components
3581d06  fix(reliability): degraded requires success-backed capability        [parallel agent]
53549a0  feat(goals): coaching-card renders composeCoaching output
c4dd619  feat(goals): /goals/[id] route with 5-section detail layout
7a6712c  feat(goals): drilldown both row types to /goals/[id]
d453b3c  fix(goals): external-review fixes — dark emerald, multi-cat link, drift action
51fe7d6  docs(goals): mark Phase 3-pt3 spec-drift items as 3-pt3.b deferrals
5ae6f7c  fix(goals): zero-fill trailing-3-month median for discretionary picker
ceb960c  fix(goals): drop zero-median categories from discretionary picker
5a2292b  fix(reliability): Phase 3 third review — three-branch SnapTrade resolution [parallel agent]
8c6039e  docs(claude.md): record Phase 3-pt3 shipped + currency convention update
c8f49a1  fix(cron): swap accountsBalanceGet → accountsGet (Plaid balance product not authorized)
```

This session's commits are interleaved with a parallel agent's reliability-initiative commits.
Filter ownership via commit-message scope: `(goals)` = mine, `(reliability)` = theirs, `(cron)` = mine.

## Test count

- Session start: 280 / 28 files
- Session end: 409 / 34 files (+129 across both workstreams)
- My direct contribution: +20 (10 from `walkBackTrajectory` + `composeCoaching`, 3 from `formatCurrencyCompact`, 7 from `pickTopDiscretionaryCategory`)

## Cron verification — already done

The 5pm PDT (00:00 UTC 2026-05-08) cron fired and confirmed both Plaid items still 400'd
with `INVALID_PRODUCT: client is not authorized to access ["balance"]`. Path B (`accountsGet`)
was shipped at `c8f49a1` ~9pm PDT. **Verify Path B at the next cron tick** (11pm PDT /
06:00 UTC) by re-running:

```bash
node scripts/diagnose-balance-refresh.mjs | grep -A1 "balance_refresh"
```

Expected output for the most recent cron row:

```
cron.balance_refresh: 2 items, ~12 accounts, 0 skipped, 0 failed
```

Plus two `cron.balance_refresh.item` info rows carrying `accountCount` + `updatedCount`.
If still failing — read `error_log.context.responseBody` (the structured-axios logger
from `05c12de` is live) and surface the `error_code`.

## Open items, priority order

### High — already passively waiting
- **Confirm Path B works at the 11pm PDT cron** — see verification block above. Should
  go from "2 items, 0 accounts, 2 failed" to "2 items, ~12 accounts, 0 failed".

### Medium — user-facing decisions
- **Path A vs B decision** for balance refresh: B is the current shipped state (cached
  balances, ~hours-fresh). A would be live intraday refresh, requires Plaid Dashboard
  access changes + Link update-mode reconnects. CLAUDE.md > Lessons learned > "Don't
  ship a Plaid endpoint without verifying its product authorization" walks through the
  upgrade path. No urgency — current state is honest.

### Low — known deferrals (already documented)
- **Phase 3-pt3.b** — four spec-vs-plan-drift items deferred from Phase 3-pt3 (drift
  query as primary source for behind-savings coaching action, projected continuation
  line on trajectory chart, archived-goal rendering, mobile tap-to-edit on spend-cap-feed
  rows). See `docs/superpowers/specs/2026-05-07-phase-3-pt3-goal-detail-design.md` § 9.
- **Phase 4-pt2** — investment what-if simulator. Roadmap candidate.

### Reliability initiative — parallel-agent workstream
At session-end the parallel agent had uncommitted work in their tree:
- `src/app/(app)/settings/page.tsx` (modified)
- `src/lib/format/date.{ts,test.ts}` (modified)
- `src/components/sync/` (new directory)
- `src/lib/sync/health-summary.{ts,test.ts}` (new)

This is presumably **Reliability Phase 4 (Settings UI)** or **Phase 5 (Dashboard trust strip)**
landing — Phase 2 + Phase 3 shipped earlier today, and these files line up with surfacing
the health classification. Don't touch unless picking up that workstream explicitly.

## Plan amendments + non-obvious decisions worth knowing

1. **Phase 3-pt3 added a sibling currency formatter.** `formatCurrencyCompact` lives
   next to `formatCurrency` in `src/lib/utils.ts`. Drops trailing zeros for whole-dollar
   amounts ("$50" not "$50.00"). Use it for narrative prose, never tables/columns.
   `composeCoaching` is the only consumer in MVP. CLAUDE.md > Coding conventions
   updated.

2. **Phase 3-pt3 `getTopDiscretionaryCategory` extracted a pure helper.**
   `src/lib/goals/discretionary.ts` owns the trailing-3-complete-month median +
   zero-fill logic + zero-median rejection. 8 unit tests. The DB query is a thin
   wrapper. Pattern matches Phase 5's "extract pure predicates for vitest" discipline.

3. **Phase 3-pt3's plan deferred drift integration; MVP shipped a fallback.**
   Spec § 5.5 calls for `getDriftAnalysis` as primary source for behind-savings
   coaching action. Plan deferred all of that. External review caught the gap;
   we shipped only the trailing-3-complete-month-median fallback (`getTopDiscretionaryCategory`).
   Drift query as primary source remains 3-pt3.b.

4. **`accountsGet` instead of `accountsBalanceGet` is intentional.** See CLAUDE.md >
   Lessons learned > "Don't ship a Plaid endpoint without verifying its product
   authorization" for the diagnosis. Path A reverses this if/when Plaid Dashboard
   approves `balance`.

## Verify on next session start

```bash
# 1. Read this handoff + CLAUDE.md
cat docs/handoffs/2026-05-07-evening-shipped.md
# (CLAUDE.md > Roadmap > In progress is canonical for active work state)

# 2. Confirm Plaid sync (Path B) is healthy
node scripts/diagnose-balance-refresh.mjs | grep -A1 "balance_refresh" | head -10
# Expect: most recent run shows "0 failed" and per-item rows have accountCount/updatedCount

# 3. Confirm SnapTrade is still flowing
node scripts/inspect-snaptrade-holdings.mjs | head -5
# Expect: ~18 holdings, "total (ok)" or known false-positive PER-SHARE rows

# 4. Confirm tests + types
npm run typecheck
npm test
# Expect: clean typecheck, ~409+ tests passing (count grows as parallel agent ships)

# 5. Confirm git state
git status
# Expect: working tree may have parallel agent's WIP (settings/page.tsx,
#         src/components/sync/, src/lib/sync/health-summary.*) — leave alone
git log --oneline -10
# Expect: most recent is c8f49a1 or later
```

## Working tree state at session end

These were modified or created during the session by the parallel agent (NOT by me) and
are intentionally left in place:

- `src/app/(app)/settings/page.tsx` — modified
- `src/lib/format/date.ts` + `date.test.ts` — modified
- `src/components/sync/` — new untracked directory
- `src/lib/sync/health-summary.ts` + `.test.ts` — new untracked

Plus the carryover untracked files from prior sessions:
- `AGENTS.md` — new untracked file
- `docs/handoffs/2026-05-06-plaid-cutover.md` — untracked carryover

Don't revert any of these without user instruction.

---

**Session end commits:**
- `c8f49a1` (Path B: cron accountsGet swap) — most recent
- `8c6039e` (CLAUDE.md Phase 3-pt3 record)
- This file: `docs/handoffs/2026-05-07-evening-shipped.md`

**Next session entry point:** Read this file → run the verification block above →
choose between (A) closing the Path B verification loop at the next cron tick, (B)
picking up Reliability Phase 4/5 (parallel agent's workstream), (C) starting
Phase 3-pt3.b, (D) Phase 4-pt2 brainstorm.
