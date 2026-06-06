# R.4 — Resume Point (Moves + Scenario unification)

> Paste this into the top of the R.4 plan's Resume-point block, or attach it to the fresh session.
> A fresh agent should read this FIRST, then run the resume command below, then stop and confirm state before doing anything.

---

## Resume in one line

C1 shipped and the goal-side edit flow is DB-verified. Next gate is **C2 — but T17 (the destructive column drop) is deferred, not approved.** Before any C2 work, confirm the one open capability-usage question (bottom of this doc) and verify two possibly-unlanded items.

---

## Current state

- **Branch:** `worktree-r4-moves-scenario` (pushed to origin, no PR)
- **Worktree path:** `~/Desktop/Code/finance-tool/.claude/worktrees/r4-moves-scenario` — main checkout stays on `main`; you must `cd` into the worktree for any branch operations.
- **Commit ladder** (verify exact HEAD with the resume command):
  - `fa02131` feat(r4): C1 — T1–T16 (schema, helpers, server actions, components, /goals + /dashboard + /simulator wiring)
  - `321e604` fix(r4): edit-flow — `editingMoveId` plumbing, dispatches `updateGoalMoveAction`
  - `213dd03` fix(r4): UAT polish — picker layout, currency-input step, dashboard goal drilldown
  - `e5c4ad5` revert: dashboard-drilldown hunks from 213dd03 (improvised scope, no task ID)
  - `e1be65e` test: extracted `decideGoalMoveUpdate` + tests; action thinned to a caller
  - `e2d490f` refactor: promoted `stableStringify` to `@/lib/json` — single equality source for findDuplicateMove + decideGoalMoveUpdate
- **HEAD:** `e2d490f`. **Tests: 760/760.** **Origin: in sync** with local (last backup push fired after `e2d490f`).
- **PR policy (reconciled this session):** ONE PR off `worktree-r4-moves-scenario` → `feat/redesign`, carrying all three commits (C1+C2+C3), rebase-and-merge, **only after C3 closes.** No merge-ready PR before then. Backup pushes and draft PRs are fine.

## Verified this session

- **Edit-flow is real and correct.** SELECT against `goal_move` after attach-then-edit returned ONE row, same `id`, `params.newAmount` = edited value, `source` preserved, `updated_at` diverged from `created_at`. Definitive in-place UPDATE, not delete+insert or duplicate. The look-alike-success bug class is closed on the goal side.
- `findDuplicateMove` has 7 tests (from T7 review cleanup). `decideGoalMoveUpdate` has the 3 behavior tests (no-op / update / invalid; the union has no insert arm by construction).

## ✓ Landed this session (no action needed on resume — but verify via resume command)

1. **`stableStringify` promotion** → done in `e2d490f`. New file `src/lib/json.ts` exports the single helper; both `findDuplicateMove` (in `db/queries/moves.ts`) and `decideGoalMoveUpdate` (in `moves/update-decision.ts`) import it. Local copies deleted. 760 tests still pass.
2. **Backup push** → done. Local HEAD `e2d490f` matches origin. Resume command should show clean.

---

## 🔒 LOAD-BEARING DECISION — C2 / T17 (do not lose this)

**Do NOT run T17 (`ALTER TABLE scenario DROP COLUMN overrides`).** It is irreversible and was found to drop four real modeling capabilities that `scenario_move` cannot represent. Decision: **C2 proceeds WITHOUT the column drop.**

The four capabilities `scenario_move` can't carry today:
1. Category spend INCREASES (positive delta) — reduce-category is cuts-only
2. One-time lump sums (bonus, vacation, vet bill) — no one-shot template
3. Hypothetical NEW recurring streams (no `streamId`) — adjust-recurring needs an existing stream
4. Hypothetical goals + in-scenario goal-target edits

Why this matters: #2 (lump sums) is **explicitly required by the net-worth pivot brief** (Bonus, Lump sum, Big purchase are specified Moves). Dropping it now = re-add + re-migrate the moment the NW work lands. Data-migration risk is trivial (only the founder has pre-R.4 scenarios), but the issue is the permanent capability ceiling, not data loss.

**C2 plan (agreed direction):**
- Migrate ONLY the cleanly-mappable capabilities to `scenario_move`: reduce-category (cuts), adjust-recurring (pause/edit), skip-once, income-event. This is R.4's unification value — ship it.
- Keep `scenario.overrides` as the carrier for the four un-mapped capabilities. `/simulator` reads BOTH.
- **Hard rule: stores are DISJOINT.** Each capability lives in exactly one store, never dual-written. (Overlap = bug farm.)
- Do NOT build lump-sum / hypothetical-recurring / category-increase templates in R.4. They belong to the **net-worth pivot workstream** (the brief already specs them). Bank there.
- Hypothetical goals + goal-target-edits (#4): candidate **scope cut** (ProjectionLab territory the brief cedes). Founder decides separately; don't delete the data path yet.
- **T25 adjustment:** do NOT delete `lump-sum-overrides.tsx`, `hypothetical-goal-overrides.tsx`, `goal-target-overrides.tsx`, or `recurring-overrides.tsx` (action='add') while `overrides` still carries their data.
- **Retirement condition for `overrides`:** drop the column only once all four capabilities have `scenario_move` homes (or are cut). When that day comes, founder runs the DROP by hand in Supabase after a backup.

---

## Standing policies (founder discipline — do not violate)

- **Verify DB state with SELECT, not the UI.** UI smoke can pass while the DB diverges (the look-alike-success class).
- **Migrations are run BY THE FOUNDER, by hand, in the Supabase SQL editor** — never `drizzle-kit push`, never unattended.
- **Destructive / irreversible steps require explicit founder go-ahead.** Stop and ask.
- **Gated execution for this phase.** Override the subagent-driven "continuous drive, no check-ins" default for destructive or gated steps — report at each stop and wait. Continuous drive is fine only within a confirmed non-destructive task block.
- Agents do not run unattended commits to `main`.

---

## Saved-scenario data — answered this session

Queried `scenario.overrides` for the founder's user (1 saved scenario named `puase`, last touched 2026-05-10).

**Important:** zero rows justifies "no data loss on non-migration" — NOT "remove the capability." Three distinct buckets:

| Capability | In current saved data? | Disposition |
|---|---|---|
| Hypothetical goals | **No** — zero rows | **Scope-CUT candidate** on product grounds (ProjectionLab territory the brief cedes). Founder decides separately; don't delete the data path yet. |
| Goal-target-edits | **No** — zero rows | **Scope-CUT candidate** (same product reasoning). Founder decides; data path stays for now. |
| Hypothetical new recurring (`recurringChanges[].action='add'`) | **No** — zero rows | **PLANNED net-worth pivot template** — "new recurring" is a documented Move in the design brief. Zero rows today = nothing to migrate, but the capability is roadmap-active. Same bucket as lump sums. |
| Lump sums | **Yes** — 1 entry | **Carried by `scenario.overrides`** until net-worth pivot ships the lump-sum Move template. Then migrate + drop from overrides. |
| Category increases (positive `monthlyDelta`) | **No** — zero rows | **PLANNED net-worth pivot template** — `reduce-category` is cuts-only; explicit increase template needed in the NW-pivot Move catalog. |

Mappable usage in current data (will migrate to `scenario_move` in C2):
- 2 `recurringChanges` (pause/edit) → `adjust-recurring`
- 1 `skipRecurringInstances` → `skip-once`

So `scenario.overrides`' disjoint bucket actively carries 1 row (the lump sum); the other planned-but-empty capabilities have no current data but stay in the roadmap.

## Strategy state

- **C2-minus-T17 direction: founder-APPROVED.** R.4 ships the four cleanly-mappable scenario_move templates (`reduce-category` cuts, `adjust-recurring` pause/edit, `skip-once`, `income-event`). `scenario.overrides` is retained as the disjoint carrier for capabilities the templates can't represent yet. T17 (DROP COLUMN) is deferred — column drops only when all four un-mapped capabilities have scenario_move homes or are formally cut, and only by the founder by hand after a backup.
- **Remaining in-session gate before T18:** the agent must present the concrete T18–T26 task adjustments (T19 hybrid state, T23 disjoint-write rule, T25 keep-list, T26 keep-list) for founder review. **Do not start T18 until that presentation is reviewed in the new session.** The transcript proposal from the prior session does not count as confirmed.

## Immediate next actions (in order)

1. Run the resume command; confirm branch, HEAD (`e2d490f`), dirty state (clean), test count (760).
2. Present the concrete T18–T26 task adjustment table for founder review (see "C2 plan" section above for the agreed direction; the agent expands each row into a specific scope statement).
3. Once founder reviews + confirms: begin T18 — implement `attachScenarioMoveAction` / `detachScenarioMoveAction` for the four scenario_move templates (the stubs from T9 throw `"not yet implemented — wired in C2"`). Enforce the disjoint-stores rule at the action boundary: scenario_move writes must not duplicate any capability that already lives in `scenario.overrides`.

## Deferred / banked (separate work items, not part of R.4 C2)

- **Goals negative-progress fix + on-brand card rules** — model-side (floor progress at zero, define behind-pace state, constrain savings-goal account-source to savings/investment type, not checking) + display rules (observational narrative, no imperatives, levers live in opt-in signal-driven chips, round projected/derived figures, keep user-set values exact). The -$589.30 was Plaid sandbox data; do NOT chase Plaid sync. Validate any goal-card work against realistic data (Vercel preview / realistic seed), not sandbox.
- **The four `scenario_move` capability templates** → net-worth pivot workstream.
- **Hypothetical-goals scope decision** → founder.

---

## Resume command

```bash
cd ~/Desktop/Code/finance-tool/.claude/worktrees/r4-moves-scenario && \
git rev-parse --abbrev-ref HEAD && \
git log --oneline -7 && \
echo "--- dirty ---" && git status -s && \
echo "--- remote sync ---" && git log --oneline -1 origin/worktree-r4-moves-scenario 2>&1 && \
echo "--- tests (expect 760/760) ---" && npm test 2>&1 | grep -E "Tests +[0-9]+ passed|Test Files" | head -3
```

Expected output:
- branch: `worktree-r4-moves-scenario`
- HEAD: `e2d490f refactor(r4): promote stableStringify to @/lib/json — single equality source`
- dirty: empty
- remote: same `e2d490f` SHA
- tests: `760 passed (760)`, `65 passed (65)` files
