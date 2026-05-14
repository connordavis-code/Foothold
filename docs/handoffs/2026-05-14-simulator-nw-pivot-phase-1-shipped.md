# 2026-05-14 — Simulator Net-Worth Pivot Phase 1 shipped

> Session spanned multi-PR rollout of the manual transfer-override path
> plus its heuristic backfill, surfaced and resolved a meta-class bug
> that hid for ~1 day in production, shipped runbook discipline as
> structural antidote.

---

## What shipped to `main`

Three PRs merged in sequence:

| PR | Squash SHA | Title |
|---|---|---|
| **#16** | `93a8321` | feat(simulator): transfer-aware cash forecast (Phase 1) |
| **#18** | `1932a4b` | fix(transactions): reachable transfer-override path + foot-gun filter |
| **#17** | `91e0e37` | feat(simulator): heuristic transfer-override backfill (Phase 1c) |

Logical phase mapping:

- **Phase 1a** (in #16) — `INTERNAL_TRANSFER_CATEGORIES` exclusion list; PFC `TRANSFER_IN`/`TRANSFER_OUT` no longer hit the cash forecast.
- **Phase 1b/1** (in #16) — `is_transfer_override` boolean column added to `transaction`; tri-state SQL filter + JS predicate (`shouldTreatAsTransfer`) keep read-side semantics in lockstep.
- **Phase 1b/2** (in #16) — Manual user-override write path: `setTransactionTransferOverrideAction` + `TransactionDetailSheet` UI affordance.
- **#18 hotfix** — Desktop entry point for the detail sheet (was mobile-only); foot-gun filter on the category-write picker (`<CategoryWritePicker>` wrapper + source-agnostic filter).
- **Phase 1c** (in #17) — Sync-time auto-classification via two heuristics: mirror-image pair detector + merchant-vs-investment-institution matcher. Runs post-sync in `syncExternalItem`, user-level scope, fail-soft.

Test count: **552/552** across 45 files at #17 merge. Production build clean.

## Production state (verified 2026-05-14)

Cleanup SQL ran post-#18 merge. State as of session end:

- **6 rows** previously written to `category_override_id` with Transfer Out/In UUIDs (artifacts of pre-#18 buggy clicks): reverted to `NULL`.
- **1 legitimate row** preserved: Albert and Sybna with `category_override_id` set to the user's "Rent and Utilities" category — pre-#16, intentional, untouched by cleanup.
- **1 row** carries `is_transfer_override = true`: Amazon Marketplace row (id `015915d9-…`) from the #18 UAT verification. Confirmed invariant under #17's heuristic (the WHERE filter `IS NULL` cannot see it).

After #17 deploys + first cron sync, AmEx-pair rows in the user's data should flip to `is_transfer_override = true` automatically; manual smoke-test for the post-deploy state is the next conversation's first action.

## The bug class that almost shipped silently

PR #16 shipped a feature whose action code was correct but whose UI affordance was unreachable on desktop (the detail sheet was mounted only in `<MobileTransactionsShell>`). Reviewer (on desktop) reached for the visually-adjacent bulk-recategorize bar's category picker — which had `Transfer Out` / `Transfer In` listed as clickable options — clicked one, got a success-shaped toast, and concluded the test passed. The write went to `category_override_id` (a column the forecast filter never reads). Forecast didn't move; bug discovered only by querying the DB.

Three discipline failures stacked:

1. **Author-as-UAT-planner**: the agent that wrote `setTransactionTransferOverrideAction` also wrote the UAT plan, against the same mental model. *"Open a transaction in /transactions"* assumed reachability that didn't exist on desktop.
2. **UI-only verification**: toast + caption + apparent forecast move all looked correct because the look-alike path produced its own success states. None of those signals proved the intended column was written.
3. **Look-alike adjacent affordance**: the bulk recategorize bar's PFC entries provided a fake-success path to a completely different action.

Fixed in #18: desktop entry point (`bbfea96`), source-agnostic filter (`3da1c36`), new `docs/uat-runbook-template.md` enforcing reachability pre-check + DB-state SELECT verification + negative reachability check, three discipline-distinct entries added to `CLAUDE.md > Lessons learned` (each contributes its own first strike going forward).

## Architectural decisions (load-bearing)

- **`<CategoryWritePicker>` wrapper pattern** — every category-write boundary now mounts the wrapper, not the bare `<CategoryPicker>`. Future write surfaces inherit the filter for free; forgetting requires actively bypassing the wrapper.
- **Filter is source-agnostic** — drops `Transfer Out` / `Transfer In` regardless of `source: 'pfc'` vs `source: 'user'`. Real-data UAT 2026-05-14 surfaced that earlier buggy clicks created user-source rows with those names; preserving them would have re-created the foot-gun.
- **1c heuristics are PFC-agnostic by design** — mirror-image detector fires on data shape (sign + amount + date + account), not on `primaryCategory`. This is why it catches `LOAN_PAYMENTS` AmEx pairs without needing a category-list hack; a blanket `LOAN_PAYMENTS` exclusion would have hidden real mortgage/auto outflows.
- **1c runs at user-level, not item-level** — mirror-image needs cross-provider visibility (Plaid checking outflow paired with SnapTrade brokerage inflow is the prototypical case).
- **1c write is race-safe via re-asserted `IS NULL`** — the UPDATE's WHERE clause re-checks `is_transfer_override IS NULL`, so a concurrent user manual override during the heuristic pass wins.
- **90-day window for heuristics** — derived from `computeBaseline`'s trailing-3-complete-month consumption; anything older can't move a number the forecast surfaces.

## Open work / next conversation

- **Phase 1d (single-sided liability matching)** — deferred. Real-data signal will decide. Once #17 has run a few sync cycles in production, inspect `error_log.context.details` for un-paired `LOAN_PAYMENTS` outflows that the mirror-image heuristic missed (the partner inflow leg lives on a disconnected account). If those exist and the pattern is consistent, build 1d as a Phase 1c-style sibling heuristic.
- **DB-state regression test infrastructure (`@electric-sql/pglite`)** — deferred from #18 hotfix scope. Worthwhile pattern; would have caught the wrong-column bug class as an integration test. Build as own PR without incident pressure. Concerns to resolve: pglite edge cases vs real Postgres, `vi.mock` brittleness on the db module, whether to refactor the action to accept injected db.
- **R.4 Moves + scenario unification** — parallel-agent work in `worktree-r4-moves-scenario`; not part of this session. Leave that worktree alone.
- **First post-#17 sync verification** — confirm AmEx pairs flip to `is_transfer_override = true` and the `/simulator` forecast outflow drops accordingly. Pre-flight notes in the prior conversation; the 5-check + idempotency runbook applies.

## Cleanup recommendations (not auto-run)

Three merged-via-squash branches and their worktrees are stale. Safe to remove:

| Worktree | Branch | Status |
|---|---|---|
| `.claude/worktrees/simulator-nw-pivot` | `feat/simulator-nw-pivot` | Merged via #16 squash (`93a8321`) |
| `.claude/worktrees/hotfix-detail-entry` | `fix/transactions-detail-entry-desktop` | Merged via #18 squash (`1932a4b`) |
| `.claude/worktrees/simulator-1c` | `feat/sim-nw-pivot-1c-heuristics` | Merged via #17 squash (`91e0e37`) |

Cleanup commands (run from main repo, NOT from inside any worktree):

```bash
cd /Users/cdhome/Desktop/Code/finance-tool
git worktree remove .claude/worktrees/simulator-nw-pivot
git worktree remove .claude/worktrees/hotfix-detail-entry
git worktree remove .claude/worktrees/simulator-1c
git branch -D feat/simulator-nw-pivot fix/transactions-detail-entry-desktop feat/sim-nw-pivot-1c-heuristics
```

**Do NOT touch** `worktree-r4-moves-scenario` — that's another agent's in-progress workstream.

Local `main` may need a `git pull` to fast-forward to `91e0e37`.

## Discipline shipped this session (for future-Claude)

- `docs/uat-runbook-template.md` — reachability pre-check + action-UI assertion + DB-state SELECT verification + negative reachability check + idempotency check + authorship rule. Use this template for every future PR with a DB write or user-visible interaction.
- `CLAUDE.md > Lessons learned` — three new entries (author/UAT coupling, UI-only verification, look-alike-success-paths). Each tracked independently against the three-strike rule.

## Session timing

- Pre-#16 baseline state: simulator-NW-pivot Phase 1 staged in branch, ready for review.
- 2026-05-13 ~17:00 PDT: #16 merged after the AmEx-pair regression-test addition.
- 2026-05-13 ~22:00 PDT: real-data UAT surfaced wrong-column bug.
- 2026-05-13 ~23:00 PDT: root cause established (unreachable detail sheet on desktop + look-alike picker), #18 PR drafted.
- 2026-05-14 ~05:47 UTC: #18 UAT verified action correctness end-to-end.
- 2026-05-14 ~06:00 UTC: source-agnostic filter shipped on top of #18 after real-data picker-still-broken finding.
- 2026-05-14 ~07:00 UTC: #18 merged, cleanup SQL run, #17 rebased + out of draft.
- 2026-05-14 ~08:00 UTC: #17 merged. Session wrap.
