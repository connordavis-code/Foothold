# R.4 — Resume Point (Moves + Scenario unification)

> Paste this into the top of the R.4 plan's Resume-point block, or attach it to the fresh session.
> A fresh agent should read this FIRST, then run the resume command below, then stop and confirm state before doing anything.

---

## Resume in one line

**C1 shipped, and C2 is shipped through T22** (scenario-move actions + disjoint guard, /simulator write-through rewire, and compare-route scenario_move overlay). **UAT-T19 by-hand DB verification PASSED** (2026-06, founder-run). Next task is **T23 — scenario-actions revision** (re-assess vs. the shipped write-through model; remove remaining `overrides` reads on the write path while keeping the disjoint carrier). T17 (the destructive column drop) remains deferred, not approved — `scenario.overrides` stays as the disjoint carrier.

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
  - `e2d490f` refactor: promoted `stableStringify` to `@/lib/json` — single equality source
  - `05dc1f2` docs(r4): commit RESUME.md as authoritative state doc + point PLAN.md at it
  - `c36f085` feat(r4): **T18** — scenario-move attach/detach + disjoint-stores guard (`moves/disjoint.ts` + `checkDisjointWithOverrides`, `findDuplicateScenarioMove`, `getScenarioMovesByScenarioId`)
  - `46ce255` feat(r4): **T19–T21** — /simulator write-through rewire (SimulatorClient state collapse, `<GoalImpactsStrip>` [=T20], page.tsx rewire, `<AttachedScenarioMoveRow>`, `moves/summary.ts`)
  - `a99cb97` feat(r4): **T22** — /simulator/compare scenario_move overlay + honest card caption (`describeScenarioChanges` helper, `<ScenarioCards scenarioMoveCount>`, compare projects both stores)
- **HEAD:** `a99cb97`. **Tests: 805/805** (68 files). **Origin:** `08127d3` pushed; `c36f085`+`46ce255` also pushed; `a99cb97` (T22) is **local-only** until next push.
- **Task-numbering note:** the shipped commits use PLAN's original T-numbers but under the **C2-minus-T17 remap** — T17 (DROP COLUMN) is skipped, so `scenario.overrides` still exists and T18 gained the disjoint-write guard. Shipped **through T22**. See PLAN.md § Task index for the remaining rows (T23, then C3 = T25–T31).
- **PR policy:** ONE PR off `worktree-r4-moves-scenario` → `feat/redesign`, rebase-and-merge, **only after C3 closes.** No merge-ready PR before then. Backup pushes and draft PRs are fine.

## Verified this session (C1 goal-side + C2 scenario-side)

- **Goal-side edit-flow is real and correct.** SELECT against `goal_move` after attach-then-edit returned ONE row, same `id`, `params.newAmount` = edited value, `source` preserved, `updated_at` diverged from `created_at`. Definitive in-place UPDATE, not delete+insert. Look-alike-success class closed on the goal side.
- **Scenario-side write-through PASSED UAT-T19** (`UAT-T19-write-through.md`). §2 parentage: newest `scenario_move` joins to the probe scenario; §3a: zero orphan/baseline writes; §3b: each move binds to the scenario selected at attach time; §3c: no-op gestures move neither count. This is the ONLY proof of DB write-through — all 799 vitest tests are pure helpers that never touch the write path.
- **UAT §4 (overrides precondition) outcome:** founder's saved data carries **1 lump-sum row** in `scenario.overrides` (non-empty). Confirms T25 must **KEEP** the lump-sum editor — do not delete the override stack. Matches the load-bearing decision below.

## ✓ Landed (verify via resume command)

1. **T18–T21 shipped** (`c36f085` + `46ce255`), 799 tests green, pushed to origin.
2. **UAT-T19 passed**; `UAT-T19-write-through.md` committed as the record.
3. Stale pre-T18 stray drafts (`moves.ts`/`moves.test.ts`) on the **main** checkout were deleted 2026-07-02 (they predated the `@/lib/json` promotion; canonical versions live in the branch).

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

- **C2-minus-T17 direction: founder-APPROVED and IMPLEMENTED through T21.** R.4 ships the four cleanly-mappable scenario_move templates (`reduce-category` cuts, `adjust-recurring` pause/edit, `skip-once`, `income-event`). `scenario.overrides` is retained as the disjoint carrier for capabilities the templates can't represent yet. T17 (DROP COLUMN) stays deferred — column drops only when all four un-mapped capabilities have scenario_move homes or are formally cut, and only by the founder by hand after a backup.
- **T18 disjoint-write rule shipped** in `c36f085` as `checkDisjointWithOverrides` (`src/lib/moves/disjoint.ts`, `DisjointViolationError` sentinel, per-kind match rules, env-aware error handling). Wired at the `attachScenarioMoveAction` boundary. 28 tests.

## Immediate next actions (in order)

1. Run the resume command; confirm branch, HEAD (`a99cb97`), dirty state (clean or only untracked docs), test count (805).
2. ~~**T22 — `/simulator/compare` adapter.**~~ ✅ DONE (`a99cb97`). Compare now overlays per-scenario `scenario_move` rows on top of the legacy `overrides` JSON (both stores), mirroring T21; `<ScenarioCards>` caption made honest via `describeScenarioChanges`. Note: compare still renders the OLD `<GoalImpacts>` (not the T20 `<GoalImpactsStrip>`) — intentional, swapped in T25 per founder decision 2026-07-02.
3. **T23 — `scenario-actions` revision (NEXT).** Re-assess against the write-through model shipped in T18–T22: attach persists individual `scenario_move` rows live (`createScenario` / `deleteScenario` are imported in `simulator-client.tsx` from `@/lib/forecast/scenario-actions` — that module DOES exist at that path; the T22 grep miss was a false negative). Confirm what create/update/delete-scenario do now and close any gap. Must remove remaining `scenario.overrides` reads on the write path while leaving the disjoint carrier intact for the un-mapped capabilities.
4. **C3 (T25–T31)** with the keep-lists below (T25 also swaps compare's `<GoalImpacts>` → `<GoalImpactsStrip>` and deletes `goal-impacts.tsx`): T25 KEEPS `lump-sum-overrides.tsx` (founder has 1 live lump-sum row per UAT §4), `hypothetical-goal-overrides.tsx`, `goal-target-overrides.tsx`, `recurring-overrides.tsx` (action='add'); T26 does NOT delete `ScenarioOverrides` type or `apply-overrides.ts` while `overrides` still carries data. See "LOAD-BEARING DECISION" above.

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
- HEAD: `46ce255 feat(r4): T19-T21 — /simulator write-through scenario_move rewire`
- dirty: empty (or only untracked docs under `docs/redesign/r4-moves-scenarios/`)
- remote: same `46ce255` SHA
- tests: `799 passed (799)`, `67 passed (67)` files
