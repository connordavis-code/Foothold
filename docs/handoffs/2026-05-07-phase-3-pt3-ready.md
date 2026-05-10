# Session handoff — 2026-05-07 evening

> Pick this up if you're resuming Foothold mid-evening on 2026-05-07.
> Pair with `CLAUDE.md` for general project context and the indexed
> spec + plan committed below.

## Where we are

Long, productive session. Six features shipped to `origin/main` plus a brainstorm-to-plan handoff for the next phase. Production is healthy except for the ongoing `cron.balance_refresh` 400 — which is now passively waiting on the 00:00 UTC scheduled run with the new structured-error logger live, so the next session can root-cause it from `error_log.context.responseBody` directly.

| Area | State |
|---|---|
| Plaid sync (WF + AmEx) | ✓ Healthy, last_synced ~today afternoon UTC |
| SnapTrade sync (Fidelity ROTH IRA + Individual + Traditional IRA) | ✓ Healthy |
| Multi-aggregator architecture | ✓ Stable (`external_item` + provider discriminator) |
| Provider-neutral column names | ✓ Renamed today (`provider_*_id`) |
| Dashboard sparkline | ✓ Honest empty-state (W-06 fixed; lying-trend bug closed) |
| `/snaptrade-redirect` inline sync | ✓ New brokerage connects render holdings instantly |
| Logger | ✓ Captures axios `responseBody` on 4xx — Plaid + SnapTrade error_codes finally legible |
| `cron.balance_refresh` | ✗ Still 400ing on both Plaid items. Waiting on 00:00 UTC cron tonight (next scheduled run with the new logger live) for ground-truth `error_code` |
| Phase 3-pt3 spec + plan | ✓ Brainstorm complete, spec written, plan committed; user chose **subagent-driven execution** for next session |

## What shipped this session (origin/main, oldest → newest)

```
05c12de  fix(logger): capture axios response body on errors
2e86e8d  fix(dashboard): scope sparkline to stable accounts (W-06)
1af7b07  feat(dashboard): empty state for sparkline when no stable accounts
052e034  chore(scripts): include external_item.created_at in diagnostic dump
d0b7de4  feat(snaptrade): inline sync after Connection Portal redirect
2b07c07  docs(claude.md): record evening session work + retire stale items
5deaf53  refactor(schema): rename plaid_*_id columns to provider_*_id
e3437b3  docs(spec): Phase 3-pt3 goal detail page design brief
d52add1  docs(spec): clarify coaching fallback + edit/delete location
f4ecc0c  docs(plan): Phase 3-pt3 goal detail page implementation plan
```

Plus this handoff doc.

**Migrations applied to live Supabase prod:**
- `docs/migrations/2026-05-07-provider-neutral-columns.sql` (column rename, applied + verified via information_schema dump)

## Open items, priority order for next session

### Highest priority — root-cause `cron.balance_refresh`

The 6h cron has been failing since 2026-05-07 06:00 UTC (right after the prod WF item was created at 03:31 UTC). Old logger only kept the AxiosError stack — the structured Plaid `error_code` was discarded and the prior session was guessing between three hypotheses (PRODUCTS_NOT_SUPPORTED / RATE_LIMIT / ITEM_LOGIN_REQUIRED).

**The new logger from `05c12de` is deployed.** The next scheduled `cron.balance_refresh` at 00:00 UTC will write the actual response body to `error_log.context.responseBody`.

**On next session start:**

```bash
node scripts/diagnose-balance-refresh.mjs
```

Look at the most recent `cron.balance_refresh.item` row in the output — `context.responseBody` will have `error_code` / `error_type` / `error_message` / `request_id`. The fix follows from the code:

| `error_code` likely | Fix |
|---|---|
| `PRODUCTS_NOT_SUPPORTED` / `INVALID_PRODUCT` | The new `linkTokenCreate` config (`products: ['transactions']` + `additional_consented_products: ['investments']` from `fb0e421`) doesn't grant balance/get for AmEx-style credit-only items. Add `'auth'` to consented products OR filter accounts by type before calling `accountsBalanceGet`. |
| `ITEM_LOGIN_REQUIRED` | Reauth required. Surface the existing reconnect banner. Cron should treat as soft failure not error. |
| `RATE_LIMIT_EXCEEDED` | Plaid Production rate limits are real. Halve the cron frequency (every 12h instead of 6h) or stagger items. |
| `INSTITUTION_DOWN` / transient | Per-item try/catch already isolates this. Just stop logging it as ERROR. |

**Bundle with W-05** (deferred from the 2026-05-05 review): `cron/balances` UPDATE-WHERE clause has no `itemId` scope. Multi-item users with recycled `provider_account_id` values risk updating wrong rows. Same file as the root-cause fix (`src/app/api/cron/balances/route.ts`). Add `eq(financialAccounts.itemId, item.id)` to the WHERE clause.

### Next priority — execute Phase 3-pt3 plan

Spec: `docs/superpowers/specs/2026-05-07-phase-3-pt3-goal-detail-design.md`
Plan: `docs/superpowers/plans/2026-05-07-phase-3-pt3-goal-detail.md`

**User chose subagent-driven execution.** Per the writing-plans skill protocol, dispatch via `superpowers:subagent-driven-development` skill — fresh subagent per task, review between tasks. 13 tasks, ~50 steps total, ~10 new vitest cases, 14 new files, 1 modified file.

Six locked decisions (table at top of spec):
1. Both savings + spend-cap goals
2. Static template + heuristics for narrative (no LLM in MVP)
3. All five sections (header / projection / chart / contributing / coaching)
4. Chart shape A — cumulative actual vs ideal-pace dashed lines
5. Savings X-axis: campaign window (`created_at` → `target_date`, fallback +12mo)
6. Routed page at `/goals/[id]`

**Plan starts TDD-first** with two pure predicates (`walkBackTrajectory`, `composeCoaching`). Test count baseline at session end: **280**. After Tasks 1+2 the count should be 290.

### Lower priority

- **Phase 4-pt2** — investment what-if simulator. Deferred from Phase 4 by design; needs its own brainstorm focused on modeling depth (deterministic vs Monte Carlo, dividend handling, tax-advantaged accounts). Roadmap.
- **Plaid Production access for Fidelity** — recheck Plaid Dashboard > OAuth institutions every few months in case Plaid–Fidelity status changes. Currently Fidelity routes through SnapTrade.
- **CLAUDE.md > Architecture** still mentions `plaid_*_id` columns in the multi-aggregator section (lines 144-147). User edited CLAUDE.md mid-session per the system-reminder; those lines were intentionally kept stale (separate hygiene pass). Don't touch unless asked.

## Architecture pointers (the load-bearing stuff)

Most of these are unchanged but verify they still match the current code on resume:

- **External items + dispatcher** — `external_item.secret` is nullable (NULL for SnapTrade). `syncExternalItem(id)` in `src/lib/sync/dispatcher.ts` routes by provider. `disconnectExternalItemAction` in `src/lib/sync/actions.ts` (separate file because `'use server'` modules can only export server actions).
- **Provider-shared columns** — `provider_account_id` / `provider_security_id` / `provider_investment_transaction_id` hold both Plaid namespace IDs and SnapTrade UUIDs (UUIDs don't collide). Renamed today via `5deaf53`. JS field names are `providerAccountId` / `providerSecurityId` / `providerInvestmentTransactionId`.
- **W-06 stable-anchor pattern** — `getNetWorthSparkline` in `src/lib/db/queries/dashboard.ts:218-275` anchors on accounts that existed at window start (`lte(financialAccounts.createdAt, startDate)`) and applies the same filter to the transaction JOIN. Phase 3-pt3's `getGoalTrajectory` mirrors this exactly. Pattern is canonical for any time-series SQL that walks back from a current sum.
- **Logger response capture** — `logError(op, err, ctx)` in `src/lib/logger.ts` duck-types axios-shaped errors and persists `httpStatus` + `responseBody` to `error_log.context`. Use this for any new SDK call.
- **Goal type discriminated union** — `GoalWithProgress` in `src/lib/db/queries/goals.ts` with `goal.progress.type === 'savings' | 'spend_cap'`. `paceVerdict` returns `'over' | 'behind' | 'on-pace' | 'hit'` (no `'missed'` — past-target unhit goals fall under `'behind'`).

## Lessons captured (CLAUDE.md > Lessons learned)

No new entries this session — all the wins were forward-progress, not corrections of prior wrong moves. The W-06 fix applied a known pattern (stable-anchor) to a new query; the column rename was a planned cosmetic; the logger improvement was an obvious gap.

If the cron 400 root cause turns out to be the new `linkTokenCreate` product config blocking balance/get, that becomes a new lesson worth recording — *"Plaid `additional_consented_products` doesn't auto-grant balance/get; explicit `auth` consent required."* — only after the fix lands.

## Loose ends from prior session

`docs/handoffs/2026-05-07-snaptrade-shipped.md` flagged three open items at session start. Status now:

- **`cron.balance_refresh` HTTP 400s** — diagnosed as far as we can without the new logger live; logger shipped, waiting on next cron. **Resolved-pending**.
- **`/snaptrade-redirect` defers initial sync to nightly cron** — **Closed today** by `d0b7de4`.
- **Provider-neutral column rename** — **Closed today** by `5deaf53`.

Plus from `docs/handoffs/2026-05-06-plaid-cutover.md` (still untracked in working tree): the AmEx + Fidelity Link errors hypothesis was correct — AmEx fixed via product config split, Fidelity routed through SnapTrade. Both items resolved long ago; the handoff file can be deleted at user discretion (keeping it untracked for now since the user has been intentional about leaving it).

## Verify on next session start

```bash
# 1. Read this file plus the spec + plan
cat docs/handoffs/2026-05-07-phase-3-pt3-ready.md
cat docs/superpowers/specs/2026-05-07-phase-3-pt3-goal-detail-design.md
cat docs/superpowers/plans/2026-05-07-phase-3-pt3-goal-detail.md

# 2. Confirm SnapTrade holdings still healthy
node scripts/inspect-snaptrade-holdings.mjs
# Expected: 18+ rows showing "total (ok)" (a few false-positive PER-SHARE
# flags on small-share positions like SPY, V are fine)

# 3. Read the cron.balance_refresh root cause from error_log
node scripts/diagnose-balance-refresh.mjs
# Expected: most recent cron.balance_refresh.item rows now have
# context.responseBody populated with Plaid's structured error.
# Look for context.httpStatus + context.responseBody.error_code.

# 4. Confirm git is clean
git status
# Expected: working tree clean except potentially the carryover
# untracked files (AGENTS.md, docs/handoffs/2026-05-06-plaid-cutover.md,
# docs/reliability/, CLAUDE.md modifications). None are blockers.

# 5. Confirm tests still pass
npm test
# Expected: Tests 280 passed (280)
```

## Working tree state at session end

These were modified or created during the session by the user or another agent (NOT by me, per the in-session system-reminders) and are intentionally left in place:

- `CLAUDE.md` — modified (rolled back the hygiene update around lines 144-147 keeping `plaid_*_id` references; intentional separate pass)
- `AGENTS.md` — new untracked file
- `docs/reliability/` — new untracked directory
- `docs/handoffs/2026-05-06-plaid-cutover.md` — untracked carryover from prior session

Don't revert any of these without user instruction.

## Memory pointer

Auto-memory entries created this session would benefit from a fresh-look update on resume — particularly the project memory file noting "Plaid Production cutover resolved" should be extended to note "balance_refresh root cause pending 00:00 UTC cron". The mem-search skill can confirm what's there.

---

**Session end commit:** `f4ecc0c` (Phase 3-pt3 implementation plan).
**Next session entry point:** Read this file → run diagnose-balance-refresh.mjs → choose between (A) bundling W-05 + cron fix or (B) starting Phase 3-pt3 execution via subagent-driven-development. Both are unblocking work.
