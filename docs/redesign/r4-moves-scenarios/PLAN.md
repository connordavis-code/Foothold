# R.4 Moves + Scenario Unification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote "Moves" from a UX-layer abstraction over scenario overrides into a first-class DB primitive backed by two tables (`goal_move`, `scenario_move`). Ship the Goals Moves surface (replacing R.3.1's `composeCoaching` placeholder), rewire `/simulator` around the new minimal-sandbox model, and replace the `apply-overrides.ts` engine with a unified `apply-moves.ts` that reads `goal_move` into the baseline and overlays `scenario_move` on top.

**Architecture:** Three-commit ship plan per SPEC § Locked decision #9. **C1**: schema + engine refactor + /goals UI. **C2**: /simulator rewire + scenario_move + hard-cut migration. **C3**: cleanup + acceptance. Single PR from `worktree-r4-moves-scenario` → `feat/redesign`, merged via "Rebase and merge" to preserve the three commits in the redesign branch's history. No feature flag — surfaces are tightly coupled to the engine refactor.

**Tech Stack:** Next.js 14 App Router · TypeScript · Drizzle ORM · Tailwind + Foothold tokens · vaul drawers · Vitest (target +40 tests above post-R.3.6 baseline) · Zod boundary validation.

**Date**: 2026-05-13
**Depends on**: [SPEC.md](SPEC.md) (10 locked decisions + 3 cross-cutting principles), [OVERVIEW.md](OVERVIEW.md) (pre-kickoff scope brief), R.3.1 + R.3.5 + R.3.6 all shipped on `feat/redesign`
**Branch**: `worktree-r4-moves-scenario` (cut from `feat/redesign` tip `2022af9`)
**Estimate**: 1–2 weeks per milestone SPEC.md:190

---

## ▶ Resume point

**C1 shipped. C2 shipped through T21** (T18 scenario-move actions + disjoint guard; T19–T21 /simulator write-through rewire). **UAT-T19 DB verification PASSED.** See [RESUME.md](./RESUME.md) for the authoritative state doc — read it FIRST on resume, before running anything.

**State at a glance:**
- HEAD: `46ce255` · Tests: 799/799 (67 files) · Branch synced to origin · Working tree clean (or only untracked docs)
- Commit ladder: `fa02131` (C1 T1–T16) + edit-flow/test/stableStringify follow-ups → `e2d490f` → `05dc1f2` (docs) → `c36f085` (**T18**) → `46ce255` (**T19–T21**, includes T20 `<GoalImpactsStrip>`)

**Next task: T22 — `/simulator/compare` adapter.** `compare-client.tsx` still reads the per-scenario `overrides` shape; migrate to `goalMoves` + per-scenario `scenarioMoves`. Then T23 (scenario-actions revision — re-assess vs. the shipped write-through model; the actions module is NOT at the PLAN-assumed `src/lib/forecast/scenario-actions.ts`, locate it first), then C3 (T25–T31).

**C2-minus-T17 remap (load-bearing — governs remaining tasks):**
- T17 (`DROP COLUMN scenario.overrides`) is **skipped/deferred** — `scenario.overrides` survives as the disjoint carrier for the four un-mapped capabilities. T18 accordingly gained a disjoint-write guard (`checkDisjointWithOverrides`).
- **T25 keep-list** (do NOT delete): `lump-sum-overrides.tsx` (founder has 1 live lump-sum row per UAT §4), `hypothetical-goal-overrides.tsx`, `goal-target-overrides.tsx`, `recurring-overrides.tsx` (action='add').
- **T26 adjustment**: do NOT delete `ScenarioOverrides` type or `apply-overrides.ts` while `overrides` still carries data.

See RESUME.md for the saved-scenario capability table (scope-cut candidates vs. NW-pivot-roadmap templates vs. actively-carried), standing policies, and the verified resume command.

---

## Branching + commit rhythm

All work lands on `worktree-r4-moves-scenario`. **Three atomic commits**, one per SPEC § Decision #9 ship plan unit:

| Commit | Subject prefix | Contents | Tasks |
|---|---|---|---|
| C1 | `feat(r4):` | `goal_move` table + Move primitive + `apply-moves` engine + /goals UI + projection-consumer wire-up | T1–T16 |
| C2 | `feat(r4):` | `scenario_move` table + hard-cut migration + /simulator rewire | T17–T24 |
| C3 | `chore(r4):` | Cleanup obsolete components + acceptance gates | T25–T31 |

On ship: PR from `worktree-r4-moves-scenario` → `feat/redesign`. **Use "Rebase and merge"** in GitHub UI — the three commits survive into the redesign branch's history per Decision #9. Full milestone PRs to `main` after R.6.

**Fixup commits** during execution: any per-task issues that surface mid-task get `fix(r4):` follow-ups rebased into the parent commit before the final push. Per `feedback_parallel_agent_branch_race.md`: chain `git rev-parse --abbrev-ref HEAD` checks before every commit since parallel agents could be active.

---

## Pre-flight (T1)

- [ ] **Confirm working branch (worktree)**

```bash
cd /Users/cdhome/Desktop/Code/finance-tool/.claude/worktrees/r4-moves-scenario
git rev-parse --abbrev-ref HEAD
```

Expected: `worktree-r4-moves-scenario`. If on a different branch, stop and reconcile.

- [ ] **Confirm working tree clean**

```bash
git status -s
```

Expected: only `?? docs/redesign/r4-moves-scenarios/` (the SPEC + PLAN + OVERVIEW added by this session). Stage and commit them as the SPEC commit before T2:

```bash
git add docs/redesign/r4-moves-scenarios/
git commit -m "$(cat <<'EOF'
docs(r4): lock SPEC + PLAN for moves + scenario unification

10 decisions locked from brainstorm session 86449-1778642873.
Three-commit ship plan per Decision #9.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Snapshot baseline test count + commit SHA**

```bash
npm test 2>&1 | tail -5 > /tmp/r4-baseline-tests.txt
git rev-parse HEAD > /tmp/r4-baseline-sha.txt
cat /tmp/r4-baseline-tests.txt
```

Record both numbers. Target at T31: baseline + ~40 new tests.

- [ ] **Confirm typecheck + build clean**

```bash
npm run typecheck
npm run build 2>&1 | tail -10
```

Both clean. **Do NOT run `npm run build` if `next dev` is running anywhere** — per CLAUDE.md Lessons learned.

- [ ] **Re-read SPEC end-to-end before T2**

Section "Architecture" governs all implementation. Section "Edge cases" pre-empts ambiguity. Section "Open items for plan phase" lists the 7 small decisions deferred from spec — resolve each inline as the relevant task hits.

---

## Open-items resolutions (apply during execution)

These were deferred from SPEC § Open items. Plan-phase decisions:

| # | Open item | Resolution |
|---|---|---|
| 1 | `<ChartRangeTabs>` (1Y/2Y) disposition | **Keep.** Power-user value preserved; visual cost is tiny. URL-mirroring already wired in R.3.5. |
| 2 | Suggestion chip ordering (drift + hike both apply) | **Stacked rows.** Drift row above hike row. Source label implicit by row position; visual hierarchy reads cleanly without per-chip badges. |
| 3 | Move row inline edit affordance | **Pencil → MoveDrawer in edit mode.** `<AttachedMoveRow>` gets an edit button; opens `<MoveDrawer>` pre-filled with the row's params. Submit calls `updateGoalMoveAction` (or scenario equivalent). |
| 4 | Confirm-discard dialog copy | **Lift verbatim from R.3.5's existing `<MobileScenarioSaveBar>` Reset flow.** No new copy. |
| 5 | Hard-cut migration developer comms | **One paragraph in HANDOFF post-R.4 doc only.** No README change — user is the only person affected; no public messaging needed. |
| 6 | `getGoalMoves`/`getScenarioMoves` query location | **Dedicated file** `src/lib/db/queries/moves.ts`. Matches the per-domain convention. |
| 7 | `goal_move.source` analytics surface | **Deferred to R.6 polish.** Field is written in R.4; no UI consumer yet. |

---

## Task index

| # | Task | Wave | Commit |
|---|---|---|---|
| T1 | Pre-flight + SPEC/PLAN commit | 1 | — |
| T2 | Schema — `goal_move` + `scenario_move` tables | 2 | C1 |
| T3 | Pure helper — `moves/validation.ts` (Zod schemas) | 2 | C1 |
| T4 | Pure helper — `moves/appliers.ts` (4 appliers) | 2 | C1 |
| T5 | Pure helper — `moves/apply.ts` (orchestrator + dedup + commutativity test port) | 2 | C1 |
| T6 | Engine refactor — `forecast/apply-moves.ts` replaces `apply-overrides.ts` | 3 | C1 |
| T7 | Query helper — `db/queries/moves.ts` | 2 | C1 |
| T8 | Pure helper — `goals/move-suggestions.ts` | 2 | C1 |
| T9 | Server actions — `moves/actions.ts` (goal-side only in C1) | 3 | C1 |
| T10 | `<MovePickerTiles>` + `<MoveForm>` + `<MoveEditor>` | 4 | C1 |
| T11 | `<MoveDrawer>` (vaul wrapper) | 4 | C1 |
| T12 | `<AttachedMoveRow>` + edit affordance | 4 | C1 |
| T13 | `<SuggestionChip>` | 4 | C1 |
| T14 | `<GoalCard>` refactor + `<GoalCardClient>` island | 5 | C1 |
| T15 | `/goals/page.tsx` rewire | 5 | C1 |
| T16 | Wire `goalMoves` through dashboard + /simulator + /simulator/compare + cron forecast-snapshot + COMMIT C1 | 5 | C1 |
| T17 | Hard-cut migration — `DROP COLUMN scenario.overrides` | 6 | C2 |
| T18 | Server actions — scenario-side in `moves/actions.ts` | 6 | C2 |
| T19 | `<SimulatorClient>` state-model collapse | 7 | C2 |
| T20 | `<GoalImpactsStrip>` (replaces cards row) | 7 | C2 |
| T21 | `/simulator/page.tsx` rewire | 7 | C2 |
| T22 | `/simulator/compare` adapter | 7 | C2 |
| T23 | `scenario-actions.ts` — create/update persist scenario_move rows | 7 | C2 |
| T24 | Commit C2 | 8 | C2 |
| T25 | Delete obsolete components (R.3.5 leftovers + overrides editor stack) | 9 | C3 |
| T26 | Delete `ScenarioOverrides` type + `apply-overrides.ts` + commutativity test | 9 | C3 |
| T27 | RSC boundary grep — strike-3 watch | 10 | C3 |
| T28 | Test count + typecheck + build acceptance | 10 | C3 |
| T29 | Browser UAT walk (per SPEC § Testing strategy) | 10 | C3 |
| T30 | HANDOFF doc — `docs/redesign/HANDOFF-YYYY-MM-DD-post-r4.md` | 10 | C3 |
| T31 | Commit C3 + final push | 10 | C3 |

---

## Commit 1 — `goal_move` + applier + /goals UI

### T2 — Schema: `goal_move` + `scenario_move` tables

**Files:** `src/lib/db/schema.ts` (modify)

- [ ] Add `goalMove` table per SPEC § Architecture > Data model
- [ ] Add `scenarioMove` table per SPEC § Architecture > Data model
- [ ] Add Drizzle relations to `goal`, `scenario`, `users`
- [ ] `npm run db:push` — per CLAUDE.md don't feed via stdin; expect strict:true interactive prompt; one-shot flip if needed
- [ ] Apply RLS manually via direct SQL: `ALTER TABLE public.goal_move ENABLE ROW LEVEL SECURITY;` + same for `scenario_move`. `drizzle-kit push` does NOT emit this.
- [ ] Verify tables exist via `npm run db:studio` or `psql \d goal_move \d scenario_move`

### T3 — `src/lib/moves/validation.ts`

**Files:** create `src/lib/moves/validation.ts`, `src/lib/moves/validation.test.ts`

- [ ] Define `MoveTemplateKey` literal union: `'adjust-recurring' | 'reduce-category' | 'income-event' | 'skip-once'`
- [ ] Define per-templateKey Zod `paramsSchema` (4 schemas)
- [ ] Export `goalMoveInputSchema` — Zod discriminated union on `templateKey`, rejecting `skip-once` at the discriminator
- [ ] Export `scenarioMoveInputSchema` — Zod discriminated union permitting all 4
- [ ] Export `goalMoveSourceSchema` — `'manual' | 'drift' | 'hike'`
- [ ] Tests: 8 cases per SPEC § Testing strategy

### T4 — `src/lib/moves/appliers.ts`

**Files:** create `src/lib/moves/appliers.ts`, `src/lib/moves/appliers.test.ts`

- [ ] `applyAdjustRecurring(baseline, params): Baseline` — handles cancel (newAmount=0), edit, range
- [ ] `applyReduceCategory(baseline, params): Baseline`
- [ ] `applyIncomeEvent(baseline, params): Baseline`
- [ ] `applySkipOnce(baseline, params): Baseline` — simulator-only; appliers themselves don't enforce, validation does
- [ ] Each applier: signed math, no clamping (clampForDisplay is the only clip — SPEC invariant)
- [ ] Tests: 12 cases (happy + edge for existing move on same key)

### T5 — `src/lib/moves/apply.ts`

**Files:** create `src/lib/moves/apply.ts`, `src/lib/moves/apply.test.ts`, `src/lib/moves/apply-commutativity.test.ts`

- [ ] `applyMoves(baseline, moves: Move[]): ProjectedMonth[]` — orchestrates applier dispatch
- [ ] Dedup pass: group by natural key per kind (`(streamId, month)` / `(categoryKey, month)` / `(startMonth)`); last-wins
- [ ] Tests: 6 orchestration + 4 commutativity cases (port from `apply-overrides-commutativity.test.ts`)

### T6 — Engine refactor: `forecast/apply-moves.ts`

**Files:** modify `src/lib/forecast/index.ts`; create `src/lib/forecast/apply-moves.ts`; old `apply-overrides.ts` stays in place until T26.

- [ ] Create `src/lib/forecast/apply-moves.ts` re-exporting `applyMoves` from `src/lib/moves/apply.ts` as the forecast-domain entry
- [ ] Modify `projectCash()` signature per SPEC § Architecture > Engine refactor — accepts `{ history, goalMoves, scenarioMoves, currentMonth }`
- [ ] Composition: `baseline = applyMoves(rawBaseline, goalMoves)` then `projection = applyMoves(baseline, scenarioMoves)`
- [ ] Verify forecast invariants preserved: signed math through chain, `clampForDisplay` only at render, order-independence (T5 commutativity test passes)
- [ ] Existing `apply-overrides.ts` callers updated to pass empty `goalMoves` / `scenarioMoves` arrays so the build stays green until /goals + /simulator finish migrating

### T7 — `src/lib/db/queries/moves.ts`

**Files:** create `src/lib/db/queries/moves.ts`

- [ ] `getGoalMoves(userId): Promise<GoalMoveRow[]>` — select all rows where `userId = $1`
- [ ] `getScenarioMoves(userId): Promise<ScenarioMoveRow[]>` — select all rows where `userId = $1`
- [ ] `getGoalMovesByGoalId(userId, goalId): Promise<GoalMoveRow[]>` — for granular fetches
- [ ] Helper `findDuplicateMove(input, existing)` used by server action for idempotent attach (SPEC edge case #16)
- [ ] No tests (integration; UAT covers)

### T8 — `src/lib/goals/move-suggestions.ts`

**Files:** create `src/lib/goals/move-suggestions.ts`, `src/lib/goals/move-suggestions.test.ts`

- [ ] `suggestFromDrift(driftAnalysis, goal, attachedMoves): MoveSuggestion[]` — cap at 3; suppress when category already covered (SPEC edge case #7)
- [ ] `suggestFromHikes(recurringStreams, goal, attachedMoves): MoveSuggestion[]` — cap at 3; suppress when streamId already covered (SPEC edge case #6)
- [ ] `MoveSuggestion` shape: `{ templateKey, params, displayCopy, source }` — instrument voice for `displayCopy`
- [ ] Tests: 8 cases — cap, category match, suppression-when-covered

### T9 — Server actions: `src/lib/moves/actions.ts` (goal-side only)

**Files:** create `src/lib/moves/actions.ts`

- [ ] `'use server'` module
- [ ] `attachGoalMoveAction(input)` — Zod-validate via `goalMoveInputSchema`, check duplicate via `findDuplicateMove`, INSERT into `goal_move`, `revalidatePath('/goals')`
- [ ] `detachGoalMoveAction(moveId)` — DELETE FROM `goal_move` WHERE id + userId, revalidate
- [ ] `updateGoalMoveAction(moveId, params)` — Zod-validate, UPDATE
- [ ] Scenario actions stubbed (`attachScenarioMoveAction`, `detachScenarioMoveAction`) but throw `not yet implemented` — C2 wires them
- [ ] `'use server'` modules export only async functions per Next 14 RSC constraints

### T10 — `<MovePickerTiles>` + `<MoveForm>` + `<MoveEditor>`

**Files:** create three under `src/components/moves/`

- [ ] `<MovePickerTiles>`: 3-tile responsive grid (or 4 in simulator context if `allowSkipOnce` prop is true). Each tile: icon + title + 1-line description. Click sets active template
- [ ] `<MoveForm>`: config-driven renderer. Reads template config (icon, title, fields) by `templateKey`; calls appropriate per-field validators; submits via callback prop
- [ ] `<MoveEditor>`: combines picker + form. Accepts `MoveEditorContext` per SPEC. Owns active-template state. On form submit, calls context-appropriate server action (goal) or state mutation (scenario)
- [ ] All three: `'use client'` per SPEC § RSC boundary

### T11 — `<MoveDrawer>`

**Files:** create `src/components/moves/move-drawer.tsx`

- [ ] vaul `<Drawer>` wrapper around `<MoveEditor>`
- [ ] Bottom sheet on mobile, right-side panel ≥md (vaul handles via `direction` prop + responsive switch)
- [ ] Context-parameterized header per SPEC
- [ ] Open/close controlled by parent

### T12 — `<AttachedMoveRow>`

**Files:** create `src/components/moves/attached-move-row.tsx`

- [ ] Renders one row in the inline moves list: template icon + summary text + detach button + edit (pencil) button
- [ ] Edit button opens `<MoveDrawer>` pre-filled with row's params (open-items resolution #3)
- [ ] Detach button calls `detachGoalMoveAction(row.id)` (or scenario equivalent in C2)
- [ ] Confirmation: detach immediate (no dialog); SPEC Decision #1 — attach = commit, detach = uncommit, semantically symmetric

### T13 — `<SuggestionChip>`

**Files:** create `src/components/moves/suggestion-chip.tsx`

- [ ] Renders one drift or hike chip: instrument-voice text + "Add" affordance
- [ ] On click: pre-fills `<MoveDrawer>` with the suggestion's `templateKey` + `params`; `source` set to `'drift'` or `'hike'`
- [ ] No imperative copy in default content; copy comes from the suggestion's `displayCopy` field (already instrument-voice from T8)

### T14 — `<GoalCard>` + `<GoalCardClient>`

**Files:** modify `src/components/goals/goal-card.tsx`; create `src/components/goals/goal-card-client.tsx`

- [ ] Extract expandable region into `<GoalCardClient>` (client island)
- [ ] `<GoalCardClient>` holds `useState(() => paceVerdict === 'behind')` per SPEC Decision #5
- [ ] Expanded branch: renders attached moves list (via `<AttachedMoveRow>`), drift chip row (≤3), hike chip row (≤3), "Add Move" button → opens `<MoveDrawer>`
- [ ] Compact branch: renders existing coaching sentence (no "0 moves attached" pill per Decision #5); whole region is click target
- [ ] Sticky state: no localStorage; per-mount only (Decision #5 — don't over-engineer)
- [ ] After move attach + revalidate, expansion state survives (per SPEC edge case #5)

### T15 — `/goals/page.tsx` rewire

**Files:** modify `src/app/(app)/goals/page.tsx`

- [ ] Add `getGoalMoves(userId)` to existing `Promise.all`
- [ ] Add `getDriftAnalysis(userId)` to existing `Promise.all` (if not already there)
- [ ] Add `getRecurringStreams(userId)` to existing `Promise.all` (if not already there)
- [ ] Per-goal: filter `goalMoves` to `goalId`, compute `driftChips` via `suggestFromDrift`, `hikeChips` via `suggestFromHikes`
- [ ] Pass into `<GoalCard>` as plain-data props (no functions — RSC discipline)
- [ ] `composeCoaching` sentence remains in compact view as click target; expanded view replaces it
- [ ] Run `npm run typecheck` + `npm test`

Commit C1 lands at the end of T16, not here — T16's dashboard/simulator/compare/cron wire-up has to ship in the same atomic unit for surface coherence.

---

### T16 — Wire `goalMoves` through all projection consumers + COMMIT C1

**Goal:** Engine refactor in T6 exposed `goalMoves` as an optional input to `projectCash`, but four call sites still pass an empty default. Until they thread `getGoalMoves(userId)` through, the dashboard / simulator / compare chart / forecast-snapshot cron silently project against a baseline that ignores the user's committed Moves — incoherent with /goals' card pace verdict and breaks the SPEC engine principle ("one baseline, includes commitments"). T16 closes the gap before C1 commits.

**Files:** 4 call sites, ~2 lines each.

- [ ] `src/app/(app)/dashboard/page.tsx` — add `getGoalMoves(userId)` to the existing `Promise.all`; pass `goalMoves` to the `projectCash({ … })` call. Verify the EOM Projected number in `<NetWorthHero>` / `<Kpis>` shifts when a Move is attached on /goals.
- [ ] `src/app/(app)/simulator/simulator-client.tsx` — accept `goalMoves` as a prop from page.tsx (page-side fetch added in T21 separately for the scenario-move side; goalMoves fetch lands here in C1 since /simulator chart must reflect committed Moves even pre-C2). Thread into both `projectCash` calls (live + baseline).
- [ ] `src/app/(app)/simulator/simulator/page.tsx` — add `getGoalMoves(userId)` to `Promise.all`; pass to `<SimulatorClient>` as `initialGoalMoves` (T21 will rename/extend when wiring scenarioMoves).
- [ ] `src/app/(app)/simulator/compare/compare-client.tsx` — adapt the two `projectCash` calls (baseline + scenario) to receive + pass `goalMoves`; ensure the A-vs-B diff is computed against the goal_move-augmented baseline so the diff reflects only scenario delta.
- [ ] `src/app/(app)/simulator/compare/page.tsx` — add `getGoalMoves(userId)` to its data fetch (or thread from the parent server component); pass to `<CompareClient>`.
- [ ] `src/app/api/cron/forecast-snapshot/route.ts` — fetch goal_moves per user inside the existing per-user loop; pass to `projectCash`. Stored daily baselines now reflect committed Moves; trend data stays coherent with the live dashboard projection.
- [ ] Run `npm run typecheck` + `npm test` — full suite stays green (additive change; engine already supports the new field).
- [ ] **Manual UAT smoke before commit:** load `/goals`, attach an `adjust-recurring` move with newAmount=0 to a recurring stream the user actually has. Reload `/dashboard` and confirm the EOM Projected number reflects the cancellation. If not, the wire-up missed somewhere.

- [ ] **COMMIT C1**:

```bash
git rev-parse --abbrev-ref HEAD  # verify worktree-r4-moves-scenario
git add src/lib/db/schema.ts \
        src/lib/forecast/types.ts \
        src/lib/forecast/engine.ts \
        src/lib/forecast/engine.test.ts \
        src/lib/moves/ \
        src/lib/db/queries/moves.ts \
        src/lib/goals/move-suggestions.ts \
        src/lib/goals/move-suggestions.test.ts \
        src/components/moves/ \
        src/components/goals/goal-card.tsx \
        src/components/goals/goal-card-client.tsx \
        src/app/\(app\)/goals/page.tsx \
        src/app/\(app\)/dashboard/page.tsx \
        src/app/\(app\)/simulator/page.tsx \
        src/app/\(app\)/simulator/simulator-client.tsx \
        src/app/\(app\)/simulator/compare/page.tsx \
        src/app/\(app\)/simulator/compare/compare-client.tsx \
        src/app/api/cron/forecast-snapshot/route.ts \
        docs/migrations/2026-05-13-r4-moves.sql
git commit -m "$(cat <<'EOF'
feat(r4): C1 — goal_move primitive, apply-moves engine, /goals Moves UI

- Add goal_move + scenario_move tables (RLS-enabled; hard-cut migration in C2)
- New Move primitive + apply-moves engine (orchestrator + 4 set-appliers)
- projectCash accepts goalMoves + scenarioMoves additively (optional, default [])
- Goal_moves fold into baseline; scenarioMoves overlay on top per SPEC #engine
- /goals: behind goals expand by default, drift+hike chips, attach/detach moves
- /dashboard, /simulator, /simulator/compare, cron forecast-snapshot all thread
  goalMoves through projectCash so the projection surface stays coherent across
  every consumer the moment a Move is attached on /goals
- composeCoaching demoted to compact-view click target

scenario.overrides JSONB column survives this commit; C2's hard-cut drops it
alongside the /simulator rewire to scenarioMoves.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Commit 2 — `/simulator` rewire + `scenario_move`

### T17 — Hard-cut migration

**Files:** modify `src/lib/db/schema.ts`; manual SQL

- [ ] Remove `overrides` field from `scenario` table definition in schema.ts
- [ ] Run `ALTER TABLE public.scenario DROP COLUMN overrides;` directly against the DB (manual; `drizzle-kit push` won't drop columns safely on strict)
- [ ] Verify: `psql \d scenario` — `overrides` column absent

### T18 — Server actions: scenario-side

**Files:** modify `src/lib/moves/actions.ts`

- [ ] Implement `attachScenarioMoveAction(input)` — Zod-validate via `scenarioMoveInputSchema`, INSERT, `revalidatePath('/simulator')`
- [ ] Implement `detachScenarioMoveAction(moveId)` — DELETE, revalidate
- [ ] Remove the C1 stubs

### T19 — `<SimulatorClient>` state-model collapse

**Files:** modify `src/app/(app)/simulator/simulator-client.tsx`

- [ ] Collapse state from SPEC R.3.5's `{ selectedScenarioId, liveOverrides, openSections, view, range, activeMoveTemplate }` to R.4's `{ selectedScenarioId, draftMoves, range, editorOpen }`
- [ ] Remove URL-mirroring of `view` and active-tab params (range stays URL-mirrored)
- [ ] `draftMoves` initialized from selected scenario's `scenario_move` rows (filter `initialScenarioMoves` by `scenarioId`)
- [ ] On scenario switch: `isDirty` check; confirm-discard dialog (open-items resolution #4)
- [ ] Memoize `baseline = applyMoves(rawBaseline, goalMoves)`
- [ ] Memoize `projection = applyMoves(baseline, draftMoves)`
- [ ] Memoize `goalImpacts = computeGoalImpacts(...)` per SPEC § Data flow

### T20 — `<GoalImpactsStrip>`

**Files:** create `src/components/simulator/goal-impacts-strip.tsx`

- [ ] Thin horizontal strip below chart; one row per goal in `engineResult.goalImpacts`
- [ ] Each row: goal name + pace verdict pill + baseline-vs-projection delta in months
- [ ] Horizontal scroll on mobile; full-width strip ≥md per SPEC

### T21 — `/simulator/page.tsx` rewire

**Files:** modify `src/app/(app)/simulator/page.tsx`

- [ ] Replace `getScenarios(userId)` reads of `overrides` JSON with reads of `scenario_move` rows
- [ ] Add `getGoalMoves(userId)` and `getScenarioMoves(userId)` to `Promise.all`
- [ ] Drop `view` and `activeMoveTemplate` URL parsing
- [ ] Pass `initialGoalMoves`, `initialScenarioMoves` to `<SimulatorClient>`
- [ ] Freshness annotation (R.2 pattern) preserved

### T22 — `/simulator/compare` adapter

**Files:** modify `src/app/(app)/simulator/compare/compare-client.tsx` + `page.tsx`

- [ ] Compare route consumes `goalMoves` + per-scenario `scenarioMoves` (was per-scenario `overrides`)
- [ ] IA unchanged (still A-vs-B diff); only the engine input shape changes
- [ ] Verify A-vs-B diff still surfaces meaningful delta per scenario

### T23 — `scenario-actions.ts` revision

**Files:** modify `src/lib/forecast/scenario-actions.ts`

- [ ] `createScenarioAction(input)` — now creates `scenario` row + a batch of `scenario_move` rows from `draftMoves`
- [ ] `updateScenarioAction(scenarioId, draftMoves)` — DELETE existing `scenario_move` rows for scenarioId + INSERT new (simple replace; alternative diff-based update is over-engineering for the small N)
- [ ] `deleteScenarioAction(scenarioId)` — unchanged; FK `onDelete: 'cascade'` removes `scenario_move` rows
- [ ] Remove all references to `scenario.overrides`

### T24 — COMMIT C2

- [ ] Run `npm run typecheck` + `npm test`
- [ ] **COMMIT C2**:

```bash
git rev-parse --abbrev-ref HEAD
git add src/lib/db/schema.ts \
        src/lib/moves/actions.ts \
        src/lib/forecast/scenario-actions.ts \
        src/app/\(app\)/simulator/ \
        src/components/simulator/goal-impacts-strip.tsx
git commit -m "$(cat <<'EOF'
feat(r4): C2 — /simulator rewire + scenario_move + hard-cut migration

- /simulator collapses to minimal sandbox: scenario chooser + MoveEditor + chart + strip
- scenario_move table + actions; scenarios no longer carry overrides JSON
- /simulator/compare adapter for new engine input shape
- GoalImpactsStrip replaces GoalImpacts cards row

BREAKING: existing scenarios lose their overrides on deploy (hard-cut, per SPEC #8).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Commit 3 — Cleanup + acceptance

### T25 — Delete obsolete components

**Files:** delete

- [ ] `src/components/simulator/simulator-tabs.tsx`
- [ ] `src/components/simulator/moves/moves-grid.tsx` (R.3.5's 8-template grid)
- [ ] `src/components/simulator/empty-state-card.tsx`
- [ ] `src/components/simulator/overrides-panel.tsx` + 7 override section editors:
  - `category-overrides.tsx`, `lump-sum-overrides.tsx`, `recurring-overrides.tsx`, `income-overrides.tsx`, `hypothetical-goal-overrides.tsx`, `goal-target-overrides.tsx`, `skip-recurring-overrides.tsx`
- [ ] `src/components/simulator/moves/move-template-drawer.tsx` (renamed to `<MoveDrawer>` in C1)
- [ ] `src/components/simulator/moves/move-template-form.tsx` (renamed to `<MoveForm>` in C1)
- [ ] `src/components/simulator/goal-impacts.tsx` (cards row replaced by strip)
- [ ] `src/components/simulator/override-section.tsx`

### T26 — Delete obsolete types + engine

**Files:** modify / delete

- [ ] Delete `src/lib/forecast/apply-overrides.ts`
- [ ] Delete `src/lib/forecast/apply-overrides-commutativity.test.ts` (replaced by `apply-commutativity.test.ts` in T5)
- [ ] Delete `ScenarioOverrides` TypeScript type from `src/lib/forecast/types.ts`
- [ ] Grep for any straggler imports of deleted symbols; fix or delete

### T27 — RSC boundary acceptance

- [ ] **Grep server components for function-shaped props:**

```bash
grep -nE "onSelect|onChange|render=|onPick|onSubmit|onClick" \
  src/app/\(app\)/goals/page.tsx \
  src/app/\(app\)/simulator/page.tsx \
  src/components/goals/goal-card.tsx
```

Expected: zero hits OR only hits inside `'use client'` files. Hits inside server components fail acceptance.

- [ ] If strike-3 occurs (server component passing functions across boundary): document in CLAUDE.md Lessons and promote to architecture note per three-strike rule

### T28 — Test + build acceptance

- [ ] `npm test 2>&1 | tail -5` — record passing count
- [ ] Compare to `/tmp/r4-baseline-tests.txt` — expect baseline + ~40
- [ ] `npm run typecheck` — clean
- [ ] `npm run lint` — clean (or known-acceptable)
- [ ] `npm run build` — clean (verify all routes including `/goals`, `/simulator`, `/simulator/compare` build)

### T29 — Browser UAT walk

- [ ] Per SPEC § Testing strategy > Browser UAT axes — walk all 14 rows
- [ ] Record any UAT-only issues; fix as `fix(r4):` follow-ups rebased into C2 or C3 before final push
- [ ] Theme parity check: light + dark across goal cards + simulator chart + drawer chrome

### T30 — HANDOFF doc

**Files:** create `docs/redesign/HANDOFF-YYYY-MM-DD-post-r4.md`

- [ ] Match the cadence of `HANDOFF-2026-05-11-post-r3-4.md`, `HANDOFF-2026-05-11-post-r3-5.md`, `HANDOFF-2026-05-12-post-r3-6.md`
- [ ] Sections: What shipped · Architecture notes · Test count delta · UAT outcome · Next phase (R.5 mobile rebuild)
- [ ] One paragraph on hard-cut migration aftermath (open-items resolution #5)

### T31 — COMMIT C3 + push

- [ ] **COMMIT C3**:

```bash
git rev-parse --abbrev-ref HEAD
git add -A
git commit -m "$(cat <<'EOF'
chore(r4): C3 — cleanup, RSC grep, acceptance, HANDOFF

- Delete deprecated simulator components (tabs, moves-grid, overrides-panel + 7 editors)
- Delete apply-overrides.ts + commutativity test (engine renamed to apply-moves)
- Delete ScenarioOverrides type
- RSC strike-3 watch: clean
- Test count: <baseline>+<delta>, typecheck clean, build clean

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Push** (only when user confirms ready for PR):

```bash
git push -u origin worktree-r4-moves-scenario
```

- [ ] Open PR worktree-r4-moves-scenario → feat/redesign; use **"Rebase and merge"** in GitHub UI per Decision #9

---

## Test count target

| Module | Tests added |
|---|---|
| `moves/validation.ts` | ~8 |
| `moves/appliers.ts` | ~12 |
| `moves/apply.ts` + commutativity | ~10 |
| `goals/move-suggestions.ts` | ~8 |
| `moves/draft.ts` (if added in T18) | ~2 |

**Target:** baseline + ~40 tests at T28 acceptance.

---

## Acceptance gates (T27–T29 collected)

All must pass before C3 commit:

- [ ] **Typecheck** — `npm run typecheck` exits 0
- [ ] **Tests** — `npm test` passes; count = baseline + 35–45
- [ ] **Lint** — `npm run lint` clean
- [ ] **Build** — `npm run build` succeeds; all routes including `/goals`, `/simulator`, `/simulator/compare` present
- [ ] **RSC grep** — zero function-shaped props passing server→client in target files
- [ ] **Browser UAT** — 14-row walk clean (or remaining issues filed as known follow-ups in HANDOFF)
- [ ] **Hard-cut migration verification** — open a pre-R.4 scenario, confirm it renders empty (no client error from missing `overrides` field)

---

## Risk notes

- **Hard-cut migration blast radius is one user.** You. No multi-tenant fallout. If multi-user ships before R.4, this plan needs revisit per OVERVIEW open question Q5.
- **Engine refactor touches the most-tested module in the codebase** (`apply-overrides.test.ts` had +43 cases from the 2026-05-05 review). Commutativity test port (T5) is the safety net. If commutativity breaks, the new engine has an order-dependence bug — debug before proceeding.
- **Three-strike RSC watch is hot.** R.3.2 passed it; R.4 has multiple new client/server boundary surfaces (`<GoalCard>` + `<GoalCardClient>`, `<MoveDrawer>`, `<SimulatorClient>`). Treat T27 acceptance as load-bearing, not ceremonial.
- **Hard-cut migration is irreversible without restoring DB from backup.** Confirm the column drop step (T17) is acceptable before running it. The PR review should call this out specifically.

---

## Cross-references

- [SPEC.md](SPEC.md) — locked decisions + architecture
- [OVERVIEW.md](OVERVIEW.md) — pre-kickoff scope
- [docs/redesign/SPEC.md](../SPEC.md) — milestone master
- [docs/redesign/r3-1-goals/SPEC.md](../r3-1-goals/SPEC.md) — Moves slot R.4 replaces
- [docs/redesign/r3-5-simulator/SPEC.md](../r3-5-simulator/SPEC.md) — simulator architecture R.4 refactors
- [docs/redesign/r3-5-simulator/PLAN.md](../r3-5-simulator/PLAN.md) — plan-format precedent
- [CLAUDE.md](../../../CLAUDE.md) — forecast engine invariants, RSC lessons, dual-token rule, parallel-agent branch race
