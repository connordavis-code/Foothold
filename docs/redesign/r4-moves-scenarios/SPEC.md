# R.4 Moves + Scenario Unification — Design Spec

**Date locked**: 2026-05-13
**Phase**: R.4 (Moves data primitive + Goals Moves UI + Simulator rewire)
**Scope**: Promote "Moves" from a UX-layer abstraction over scenario overrides into a first-class DB primitive; ship the Goals Moves surface; rewire `/simulator` around the new primitive
**Status**: Spec locked, ready for plan phase
**Branch**: `worktree-r4-moves-scenario` (cut from `feat/redesign` tip `2022af9`); merges back to `feat/redesign` on ship
**Brainstorm source**: `.superpowers/brainstorm/86449-1778642873/content/all-locks.html` (9 decisions, 3 cross-cutting principles)
**Pre-kickoff scope brief**: [OVERVIEW.md](OVERVIEW.md)

---

## North star

R.3.5 introduced Moves as a UX layer — 8 named templates that emit raw `ScenarioOverrides` dicts. R.3.1 introduced `<GoalCard>` with a Moves slot filled by a placeholder coaching sentence. R.4 collapses both of those into one truth: **a Move is a database row, attached to either a goal (commitment) or a scenario (ephemeral exploration), and a single projection engine reads them.**

The user-facing shift is small — Moves keep the name, the catalog gains semantic coherence (3 picker tiles instead of 8), and Goals cards finally let users *do something* with the verdict. The architectural shift is large — `apply-overrides.ts` rewrites to consume `Move[]` instead of dict, the `scenarios.overrides` JSON column retires hard-cut, and the goal-impact projection becomes a side effect of the same engine that paints the simulator chart.

The instrument-voice constraint stays: Foothold *records observed reality* (drift, hike alerts) and *records user intent* (attached Moves), but never tells the user what they should want. Chip copy is flat factual ("Dining drifted +$87 vs. 3-mo avg") not prescriptive ("Trim dining").

---

## Locked decisions (2026-05-13)

| # | Decision | Choice | Rationale |
|---|---|---|---|
| 1 | Move attach semantics | Attaching a Move = commit. A row inserted into `goal_move` flows into the global override applier on next render. Removing the row undoes the delta. | Eliminates a separate "save" step; matches Foothold's instrument-records-observed-reality principle. No optimistic UI lag between attach and projection update. *(Brainstorm Q1)* |
| 2 | Engine + editor topology | Single `apply-overrides.ts` engine reads `goal_move` into baseline; simulator's ephemeral `scenario_move` rows layer on top. One shared `<MoveEditor>` parameterized by context (goals vs simulator). | One projection truth — no "with moves" and "without moves" baseline. One editor component to maintain. *(Brainstorm Q2)* |
| 3 | Move type catalog | 3 picker tiles (`adjust-recurring`, `reduce-category`, `income-event`) + 4 applier operations (same 3 + `skip-once`). `skip-once` is simulator-only — `goal_move` Zod schema rejects it at the boundary. | Folds R.3.5's 8 templates into 3 semantic categories: `adjust-recurring` subsumes cancel/edit/new-recurring/pause via params; `reduce-category` covers spend-cap deltas; `income-event` covers raise/loss/bonus/one-off. Permanent skip ("cancel subs") is `adjust-recurring` with `newAmount=0`. Committing to "skip one instance" is semantically incoherent; valid only in `/simulator`. *(Brainstorm Q3, revised post-Q3-v2)* |
| 4 | Simulator UX | Ephemeral draft by default. "Save as scenario" remains as a de-emphasized affordance. Goal-impact display reduces from a row of cards to a thin strip below the chart. | Reframes simulator from "scenario authoring" tool to "lightweight what-if explorer". Cards row was operator-tier; strip respects the data-density of the new minimal sandbox. *(Brainstorm Q4)* |
| 5 | Goal card layout density | Behind-pace goals expand by default (Moves visible inline). On-pace + hit goals stay compact (click-to-expand). Per-card sticky expansion state via lazy `useState(() => paceVerdict === 'behind')`. Compact state hides the "no moves attached" pill entirely. | Extends R.3.1's pace-leaderboard severity-sort pattern to layout density. Brand makes the right thing visible — it doesn't shape user behavior by gamifying healthy-goal interaction. *(Brainstorm Q5)* |
| 6 | MoveEditor chrome | vaul Drawer: bottom sheet on mobile, right-side panel at ≥md. Context-parameterized header ("Add a Move to Emergency fund" vs "Add a Move to this scenario"). | Reuses the vaul drawer pattern already in `<MoveTemplateDrawer>` from R.3.5. One component, two viewports, two contexts. *(Brainstorm Q6)* |
| 7 | Suggestion chips + source tracking | Drift alerts + hike alerts each surface as chip rows above the Moves list, capped at ≤3 each. `goal_move.source` ∈ `{'drift', 'hike', 'manual'}` records origin. Chip copy is instrument-voice flat factual: *"Dining drifted +$87 vs. 3-mo avg"* not *"Trim dining and free up $87"*. | Reuses existing `getDriftAnalysis` + `isHikeAlert` predicates. Source field unlocks future analytics ("how many user moves originated from drift?") without coupling the suggestion ranking to the applier. *(Brainstorm Q7)* |
| 8 | Data model — two tables, hard-cut migration | Two tables: `goal_move` (commitments, FK to `goal.id`) + `scenario_move` (ephemeral, FK to `scenario.id`). No shared `move` table — discriminated by FK ownership. **Hard-cut migration**: existing `scenarios.overrides` JSONB column drops on deploy. No translation script. | Discriminated cardinality avoids `attachedTo` polymorphism overhead. Hard-cut acceptable because (a) only one user (you) has saved scenarios pre-R.4 and (b) the override dict format isn't user-authored content worth preserving — it's UI-layer state. Documented in HANDOFF post-R.4. *(Brainstorm Q8)* |
| 9 | Ship plan — one PR, three commits, no flag | One PR off `worktree-r4-moves-scenario` into `feat/redesign`. Three commits: **C1** `goal_move` table + applier refactor + /goals UI; **C2** /simulator rewire + `scenario_move` table; **C3** final cleanup. No feature flag. | Each commit is a reviewable unit. No flag because /goals and /simulator surfaces share the rewired engine — partial rollout would require duplicating the engine. *(Brainstorm Q9)* |
| 10 | Terminology | "Moves" everywhere. No rename to "Actions" or "Plays". | R.3.5 already established "Moves" in the simulator vocabulary; consistency over per-surface domain-fit. Open question Q7 from OVERVIEW resolved by status-quo default. |

---

## Cross-cutting principles

These three are constraints on every decision in the SPEC, not separate decisions:

- **Voice principle.** Foothold is an instrument, not an operator. Auto-detected signals describe what's happening; user-initiated affordances perform actions. Chip copy reads as observation, never as imperative. *Stored as feedback memory: [foothold-instrument-voice](#).*
- **Layout principle.** Severity-sort extends to layout density. Behind goals get expanded layout by default; on-pace goals stay compact. Brand makes the right thing visible — it doesn't shape user behavior toward more interaction.
- **Engine principle.** Single projection engine. `apply-overrides.ts` reads `goal_move` into the baseline; `/simulator`'s `scenario_move` rows layer on top. There is no "with moves" and "without moves" baseline. There is **one** baseline, and it includes commitments.

---

## Architecture

### Data model

Two new tables in [src/lib/db/schema.ts](../../../src/lib/db/schema.ts):

```typescript
// Commitments — attached to a goal, flow into baseline globally
export const goalMove = pgTable('goal_move', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  goalId: uuid('goal_id').references(() => goal.id, { onDelete: 'cascade' }).notNull(),
  templateKey: text('template_key').notNull(),        // 'adjust-recurring' | 'reduce-category' | 'income-event'
  params: jsonb('params').notNull(),                  // shape per templateKey, Zod-validated at boundary
  source: text('source').notNull().default('manual'), // 'manual' | 'drift' | 'hike'
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

// Ephemeral — attached to a scenario, isolated to simulator
export const scenarioMove = pgTable('scenario_move', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  scenarioId: uuid('scenario_id').references(() => scenario.id, { onDelete: 'cascade' }).notNull(),
  templateKey: text('template_key').notNull(),        // adds 'skip-once' to the goal_move set
  params: jsonb('params').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
});
```

Both tables get RLS enabled (`ALTER TABLE public.goal_move ENABLE ROW LEVEL SECURITY;` + same for `scenario_move`) per [CLAUDE.md](../../../CLAUDE.md) > "RLS on every public.* table".

**Hard-cut migration** drops `scenario.overrides` JSONB column in the same SQL deploy:

```sql
ALTER TABLE public.scenario DROP COLUMN overrides;
```

No translation script. Pre-R.4 scenarios become empty containers; users re-author Moves on first re-visit. Acceptable per Decision #8.

### Engine refactor

Current shape ([src/lib/forecast/apply-overrides.ts](../../../src/lib/forecast/apply-overrides.ts)):

```typescript
applyOverrides(baseline, overrides: ScenarioOverrides) → ProjectedMonth[]
```

New shape:

```typescript
applyMoves(baseline, moves: Move[]) → ProjectedMonth[]
```

Where `Move` is a discriminated union:

```typescript
type Move =
  | { kind: 'adjust-recurring'; streamId: string; startMonth: string; endMonth?: string; newAmount: number }
  | { kind: 'reduce-category'; categoryKey: string; startMonth: string; endMonth?: string; deltaAmount: number }
  | { kind: 'income-event'; startMonth: string; endMonth?: string; monthlyAmount: number }
  | { kind: 'skip-once'; streamId: string; month: string };  // scenario-only
```

Engine entry point in [src/lib/forecast/index.ts](../../../src/lib/forecast/index.ts):

```typescript
projectCash({ history, goalMoves, scenarioMoves, currentMonth }):
  const baseline = applyMoves(rawBaseline, goalMoves);       // commitments folded in
  const projection = applyMoves(baseline, scenarioMoves);    // ephemeral overlay
  const goalImpacts = computeGoalImpacts(goals, baseline, projection);
  return { baseline, projection, goalImpacts };
```

**Invariants preserved from current engine** (per [CLAUDE.md](../../../CLAUDE.md)):
- Signed math through the chain; `clampForDisplay` only at render boundary
- Applier-level dedup by natural key (per Move kind: `streamId+month` for `adjust-recurring` / `skip-once`; `categoryKey+month` for `reduce-category`; `startMonth` for `income-event`)
- Order-independence proven via commutativity test (port `apply-overrides-commutativity.test.ts` to `apply-moves-commutativity.test.ts`)

### Goal Move source: drift + hike → Move

Two new helpers in `src/lib/goals/move-suggestions.ts`:

```typescript
function suggestFromDrift(driftAnalysis): MoveSuggestion[]      // ≤3 from currentlyElevated
function suggestFromHikes(recurringStreams): MoveSuggestion[]   // ≤3 from isHikeAlert
```

`MoveSuggestion = { templateKey, params, displayCopy, source: 'drift' | 'hike' }`. Display copy uses instrument voice. When user clicks "Attach", server action inserts `goal_move` row with `source` set accordingly.

### Goal card layout

`<GoalCard>` ([src/components/goals/goal-card.tsx](../../../src/components/goals/goal-card.tsx)) gains:

```typescript
const [expanded, setExpanded] = useState(() => paceVerdict === 'behind');
```

- `expanded=true` (default for behind goals): renders Moves section inline — attached moves list + drift chips + hike chips + "Add Move" button
- `expanded=false` (default for on-pace + hit goals): renders only the existing coaching sentence + a click target to expand; **no** "0 moves attached" pill
- Click toggles state; state is sticky per-mount (lost on refresh — acceptable per Decision #5, prevents over-engineering with localStorage)

### MoveEditor + Drawer

`<MoveEditor>` ([src/components/moves/move-editor.tsx](../../../src/components/moves/move-editor.tsx)): the unified picker + form combination shared by goals and simulator. Three picker tiles top, drawer-form below on selection. Accepts:

```typescript
type MoveEditorContext =
  | { kind: 'goal'; goalId: string }
  | { kind: 'scenario'; scenarioId: string };
```

`<MoveDrawer>`: vaul drawer wrapper. Bottom sheet on mobile, right-side panel ≥md. Title resolves from context (`Add a Move to ${goalName}` vs `Add a Move to this scenario`).

### Simulator rewire

`/simulator` becomes the simplest of the three surfaces. The R.3.5 architecture (URL-mirrored tabs, scenario cards row, goal impacts row) reduces:

| R.3.5 element | R.4 disposition |
|---|---|
| Empty / Moves / Comparison tab strip | **Removed.** Single linear flow: scenario chooser at top, MoveEditor inline, chart below. |
| `<ScenarioCards>` row | **Kept**, restyled — still the primary affordance for switching scenarios + Baseline. |
| `<OverridesPanel>` (7-section accordion) | **Removed.** Replaced by inline `<MoveEditor>` + list of attached `scenario_move` rows. |
| 8-template `<MovesGrid>` | **Removed.** Folded into 3-tile `<MoveEditor>` picker. |
| `<MoveTemplateDrawer>` | **Promoted** to shared `<MoveDrawer>`. |
| `<ForecastChart>` | **Kept** — same hand-rolled SVG. `goalImpacts` reduces from cards row to thin strip below. |
| `<GoalImpacts>` cards row | **Reduced** to `<GoalImpactsStrip>` — single horizontal scroll-strip below chart, one row per goal. |
| `<NarrativePanel>` | **Stays removed** (R.3.5 already deleted). |
| `<MobileScenarioSaveBar>` | **Kept**, restyled. "Save as scenario" remains as de-emphasized CTA. |

`<SimulatorClient>` state model collapses:

```typescript
// R.3.5
{ selectedScenarioId, liveOverrides: ScenarioOverrides, openSections, view, range, activeMoveTemplate }

// R.4
{ selectedScenarioId, draftMoves: Move[], range, editorOpen: boolean }
```

`draftMoves` is the in-memory equivalent of `scenario_move` rows — what the user is building. On "Save as scenario", server action inserts rows and clears the draft. On scenario switch, `draftMoves` rehydrates from the selected scenario's `scenario_move` rows. No URL mirroring of move state — too granular.

### Server actions

New file `src/lib/moves/actions.ts`:

```typescript
'use server';

export async function attachGoalMoveAction(input: AttachGoalMoveInput): Promise<...>;
export async function detachGoalMoveAction(moveId: string): Promise<...>;
export async function updateGoalMoveAction(moveId: string, params: unknown): Promise<...>;

export async function attachScenarioMoveAction(input: AttachScenarioMoveInput): Promise<...>;
export async function detachScenarioMoveAction(moveId: string): Promise<...>;
// scenario_move updates happen via the draft model — no per-row update action
```

Zod schemas in `src/lib/moves/validation.ts`; `goalMoveInputSchema` rejects `kind: 'skip-once'` at the discriminator. `scenarioMoveInputSchema` permits all four kinds.

Every action calls `revalidatePath('/goals')` and/or `revalidatePath('/simulator')` per surface.

### Drift + hike read paths

`/goals` page already pulls drift in R.3.1's coaching path (`getBehindSavingsCoachingCategory` from [src/lib/db/queries/goal-detail.ts](../../../src/lib/db/queries/goal-detail.ts)). R.4 extends:

1. Page-level `Promise.all` gains `getDriftAnalysis(userId)` (already exists from R.2 `<DriftModule>`).
2. Page-level `Promise.all` gains `getRecurringStreams(userId)` (already exists — used by [src/app/(app)/recurring](../../../src/app/(app)/recurring/) and `<DashboardClient>`).
3. Pure helpers `suggestFromDrift` + `suggestFromHikes` derive chip rows per goal.
4. Chips render inside `<GoalCard>` when `expanded` and matching the goal's category.

No new DB queries beyond what `/goals` already executes plus what `/dashboard` already executes — both reads come from existing pages.

### RSC boundary discipline (strike-3 watch)

Per the running count: forwardRef (strike 1), config-of-functions (strike 2). One more promotes from Lesson to architecture-level guard. R.4 surfaces requiring vigilance:

- `<MoveEditor>` lives in a `'use client'` file. Picker tiles + applier registries imported by name, not closures from server props.
- `<GoalCard>` is mostly server-rendered; the expanded-state hook lives in a `<GoalCardClient>` child island. Suggestion data flows as plain values (no functions in suggestion objects).
- `<MoveDrawer>` accepts only string/data props from its caller; no `onSubmit`-style callbacks from a server component.

**Plan task (final wave):** acceptance grep that no server component constructs a component prop with a function-shaped value. Targets: `goals/page.tsx`, `simulator/page.tsx`, `<GoalCard>`. Search keys: `onSelect`, `onChange`, `render`, `onPick`, `onSubmit`, `onClick`.

---

## Components inventory

### New

| Component | Purpose | Location |
|---|---|---|
| `<MoveEditor>` | Shared picker + form for goal and scenario contexts | `src/components/moves/move-editor.tsx` |
| `<MoveDrawer>` | vaul drawer wrapping `<MoveEditor>` | `src/components/moves/move-drawer.tsx` |
| `<MovePickerTiles>` | 3-tile responsive grid | `src/components/moves/move-picker-tiles.tsx` |
| `<MoveForm>` | Config-driven form for the 3 (+1 simulator) templates | `src/components/moves/move-form.tsx` |
| `<AttachedMoveRow>` | One row in the inline moves list (goal or scenario) | `src/components/moves/attached-move-row.tsx` |
| `<SuggestionChip>` | Single drift/hike suggestion chip | `src/components/moves/suggestion-chip.tsx` |
| `<GoalCardClient>` | Client island holding expanded-state hook + suggestion handlers | `src/components/goals/goal-card-client.tsx` |
| `<GoalImpactsStrip>` | Thin horizontal strip below simulator chart | `src/components/simulator/goal-impacts-strip.tsx` |

### Pure helpers (new)

| Module | Exports |
|---|---|
| `src/lib/moves/validation.ts` | Zod schemas: `goalMoveInputSchema`, `scenarioMoveInputSchema`, `moveParamsSchema` per templateKey. |
| `src/lib/moves/appliers.ts` | `applyAdjustRecurring`, `applyReduceCategory`, `applyIncomeEvent`, `applySkipOnce` — pure `(baseline, params) → next`. |
| `src/lib/moves/apply.ts` | `applyMoves(baseline, moves)` — orchestrates applier dispatch + dedup. |
| `src/lib/goals/move-suggestions.ts` | `suggestFromDrift`, `suggestFromHikes` — pure derivation from existing query outputs. |
| `src/lib/moves/draft.ts` | `draftFromScenarioMoves`, `applyDraftToScenario` — helper for simulator's `draftMoves` rehydration. |

### Restyled / modified

| Component | Change |
|---|---|
| `<GoalCard>` | Add `<GoalCardClient>` wrapper around the expandable Moves section. Compact branch hides "no moves" pill. Expanded branch renders moves list + suggestion chips + "Add Move" button. |
| `<SimulatorClient>` | Major rewrite (state-model collapse). Removes URL-mirrored tabs; single linear flow. |
| `<ForecastChart>` | Unchanged. Consumes new engine output identically. |
| `<ScenarioCards>` | Slight restyle for the simpler simulator layout. |
| `<MobileScenarioSaveBar>` | Reads `draftMoves.length > 0` for dirty signal instead of `JSON.stringify` comparison. |
| `apply-overrides.ts` | **Replaced.** New `apply-moves.ts` with the engine principle baked in. |

### Removed

| Component | Disposition |
|---|---|
| `<SimulatorTabs>` (Empty / Moves / Comparison tab strip) | Delete. |
| `<MovesGrid>` (8-template) | Delete; replaced by `<MovePickerTiles>` (3-tile). |
| `<EmptyStateCard>` | Delete; no Empty tab anymore. |
| `<ChartRangeTabs>` | Delete *or keep* per plan-phase open item #1 below. |
| `<OverridesPanel>` + 7 override section editors | Delete all. The accordion-of-editors model retires with `ScenarioOverrides`. |
| `<MoveTemplateDrawer>` (R.3.5) | Renamed + promoted to `<MoveDrawer>`. |
| `<MoveTemplateForm>` (R.3.5) | Renamed + restructured to `<MoveForm>`. |
| `<GoalImpacts>` (cards row) | Delete; replaced by `<GoalImpactsStrip>`. |
| `composeCoaching` placeholder rendering on `<GoalCard>` | Replaced by Moves section when expanded; coaching sentence stays in compact view as the click target. |

---

## Data flow

### `/goals` page render

```
auth() → userId
↓
Promise.all([
  getGoalsWithProgress(userId, { includeInactive: true }),
  getDriftAnalysis(userId),
  getRecurringStreams(userId),
  getGoalMoves(userId),          // NEW — joins by userId, grouped by goalId in page
  getSourceHealth(userId),       // for freshness
])
↓
For each goal:
  paceVerdict = paceVerdict(goal, progress)
  attachedMoves = goalMoves.filter(m => m.goalId === goal.id)
  driftChips = suggestFromDrift(driftAnalysis, goal)   // ≤3
  hikeChips = suggestFromHikes(recurringStreams, goal) // ≤3
  → <GoalCard expanded-default={paceVerdict==='behind'} />
↓
<PaceLeaderboard> renders ordered groups (behind / on-pace / hit / archived)
```

### `/simulator` page render

```
auth() → userId
↓
Promise.all([
  getScenarios(userId),
  getForecastHistory(userId),
  getGoalsWithProgress(userId),
  getGoalMoves(userId),          // NEW — folded into baseline
  getScenarioMoves(userId),      // NEW — rehydrates selected scenario
  getSourceHealth(userId),
])
↓
<SimulatorClient
  history scenarios goals
  initialGoalMoves={goalMoves}
  initialScenarioMoves={scenarioMoves}
  initialScenarioId={parseScenario(searchParams)}
  range={parseRange(searchParams) ?? '1Y'}
  freshness={formatFreshness({ sources })}
/>
```

`SimulatorClient` derives:
- `baseline = applyMoves(rawBaseline, goalMoves)` — memoized
- `draftMoves` initialized from selected scenario's `scenarioMoves`
- `projection = applyMoves(baseline, draftMoves)` — memoized
- `goalImpacts = computeGoalImpacts(goals, baseline, projection)` — memoized
- `isDirty = !isEqual(draftMoves, selectedScenarioMoves)`

### Move attach (goal context)

```
User picks tile → form fills → "Attach"
↓
client-side: attachGoalMoveAction({ goalId, templateKey, params, source })
↓
server: Zod validate → INSERT into goal_move → revalidatePath('/goals')
↓
RSC re-renders /goals; engine re-runs with new goalMoves
↓
GoalCard reflects new pace verdict (Behind → On pace if delta was sufficient)
```

### Move attach (scenario context)

```
User picks tile → form fills → "Attach"
↓
client-side: setDraftMoves([...draftMoves, newMove])
↓
NO server call — pure in-memory state mutation
↓
Memoized projection recomputes; chart + GoalImpactsStrip re-render
↓
User clicks "Save as scenario" → server action persists draftMoves → revalidatePath('/simulator')
```

### Scenario switching

```
User clicks <ScenarioCard>
↓
setSelectedScenarioId(newId)
↓
useEffect: draftMoves = scenarioMoves.filter(m => m.scenarioId === newId)
↓
Projection re-runs
```

`isDirty` guard: if `draftMoves` differs from saved, confirm-discard before switching.

---

## Edge cases

| # | Case | Handling |
|---|---|---|
| 1 | User attaches a Move to a deleted goal | FK `onDelete: 'cascade'` — moves auto-removed by Postgres. UI reflects on next revalidate. |
| 2 | Two `adjust-recurring` moves on the same `streamId` + overlapping months | Applier dedup by `(streamId, month)` natural key — last-wins per month. Unit test required. |
| 3 | `goal_move` source field defaults | `'manual'` if not specified. Drift/hike chip attach passes `source` explicitly. |
| 4 | Compact goal card click target | The entire collapsed card-body region is the click target. Toggle on click, not on hover. |
| 5 | Pace verdict change after Move attach | Sticky expansion state does NOT auto-collapse if `behind → on-pace` transition occurs while card is open. User keeps their view. |
| 6 | Hike alert chip for a stream already covered by an attached `adjust-recurring` move | Suppress the chip (same streamId). Avoids redundant suggestion. |
| 7 | Drift chip for a category already covered by an attached `reduce-category` move | Suppress the chip (same categoryKey). |
| 8 | Scenario draft has `skip-once` moves; user clicks "Save as scenario" | `scenarioMoveInputSchema` permits — saves cleanly. |
| 9 | Goal draft (hypothetical) tries to insert `skip-once` | `goalMoveInputSchema` discriminator rejects at boundary. Server returns 400; client toast. |
| 10 | Mid-render: user attaches Move; engine hasn't re-run yet | Loading state on the "Attach" button (`Attaching...`); chart doesn't flicker because mutation runs via server action → revalidate → re-render (no optimistic UI). Decision #1 chose this over optimism. |
| 11 | Scenario picker switches mid-attach | Disable picker while attach-in-flight. |
| 12 | First-time user with zero scenarios | `/simulator` renders with `selectedScenarioId = null`, baseline-only chart, `draftMoves = []`. "Save as scenario" disabled until first move attached. |
| 13 | User with zero goal_moves at /goals | Behind goals still expand by default — show empty moves list + suggestions + Add Move CTA. Encourages first attach. |
| 14 | `hasNoData` (zero accounts/transactions) | Same as R.3.5 — render header + single info card; skip Move surfaces. |
| 15 | Move attached to a non-existent recurring stream (race condition) | Validation pulls `recurringStreams` server-side; rejects unknown `streamId` at boundary. |
| 16 | Two simultaneous `attachGoalMoveAction` calls (double-click) | Server action idempotent on (userId, goalId, templateKey, params hash) — second insert is a no-op via dedup check. Plan task: helper `findDuplicateMove(input, existing)`. |

---

## Testing strategy

### Pure-helper unit tests (Vitest)

| Module | Tests |
|---|---|
| `src/lib/moves/validation.ts` | Zod schema acceptance + rejection (incl. `skip-once` on goal). ~8 tests. |
| `src/lib/moves/appliers.ts` | 4 appliers × happy + edge (existing move on same key). ~12 tests. |
| `src/lib/moves/apply.ts` | `applyMoves` orchestration + dedup + order-independence (port commutativity test). ~6 tests. |
| `src/lib/goals/move-suggestions.ts` | `suggestFromDrift` + `suggestFromHikes` — cap at 3, category match, suppression-when-covered. ~8 tests. |
| `src/lib/moves/draft.ts` | `draftFromScenarioMoves` rehydration; `applyDraftToScenario` diff. ~4 tests. |
| `src/lib/goals/pace.ts` | Re-verify `paceVerdict` still works post-applier-refactor; baseline now includes commitments. ~2 regression tests. |

**Target:** +40 vitest tests above the post-R.3.6 baseline (record baseline at T1).

### Component tests

Skipped except where load-bearing. Move drawer + form interaction covered by manual UAT — too brittle for snapshot tests as form fields evolve.

### Browser UAT axes (deferred manual walk)

| Axis | Notes |
|---|---|
| Goal card asymmetric layout | Behind expands default; on-pace + hit compact default |
| Per-card sticky expansion | Click on compact expands; click again collapses; state survives within session |
| MoveEditor — goal context | All 3 tiles → forms → attach → server action → revalidate |
| MoveEditor — scenario context | All 4 tiles (skip-once present) → forms → draft state mutation |
| MoveDrawer responsive chrome | Bottom sheet <md; right-side panel ≥md |
| Drift chip rows on behind goals | ≤3 chips; suppressed when category already covered |
| Hike chip rows on behind goals | ≤3 chips; suppressed when streamId already covered |
| Chip attach action | Inserts `goal_move` with correct `source` field |
| Pace verdict transition after Move | Behind → On-pace updates badge; card stays expanded (no auto-collapse) |
| Simulator linear flow | No tabs; chooser → editor → chart → strip top-to-bottom |
| Scenario switch with dirty draft | Confirm-discard dialog |
| `GoalImpactsStrip` | Horizontal scroll on mobile; full-width strip ≥md |
| `MobileScenarioSaveBar` | `Save` disabled when `!isDirty` |
| Hard-cut migration | Pre-R.4 scenario opens with empty Moves list (no client error from missing `overrides`) |
| RSC boundary discipline | No "Functions cannot be passed directly to Client Components" errors |
| Theme parity | Light + dark — drawer chrome, chip surfaces, drawer backdrop |

---

## Out of scope

### Hard boundaries (R.4 does NOT touch)

| Area | Why |
|---|---|
| Investment what-if simulator (Phase 4-pt2) | Deferred per milestone SPEC.md:211; needs its own brainstorm on modeling depth. |
| Narrative panel resurrection on `/simulator` | R.3.5 SPEC.md:26 — backend survived R.3.5; conditional resurfacing is its own decision. |
| `<ScenarioPicker>` dropdown deletion | R.3.5 SPEC.md:28 deferred this; R.4 keeps it as scenario chooser fallback. |
| LLM-generated Move suggestions | Pure-deterministic catalog only; AI suggestions post-R.6 territory per OVERVIEW out-of-scope list. |
| Multi-user / RLS audit | Parallel concern per milestone SPEC.md:32–33. R.4 adds RLS-enabled empty-policy tables; no policy authoring. |
| AI eval framework | Out-of-scope per R.0 master SPEC. |
| Email digest | Stays hex-literal HTML per R.0. |
| Sync orchestration (Plaid/SnapTrade) | Untouched. |
| Forecast engine invariants | Signed math + clampForDisplay-only-at-render + PFC-totals untouched. Engine surface (`apply-overrides` → `apply-moves`) renames; invariants ride along. |

### Soft dependencies

| Item | Status |
|---|---|
| R.3.1 Goals (`<GoalCard>` IA + Moves slot) | ✓ Shipped — R.4 replaces the slot. |
| R.3.5 Simulator (Move templates + applier scaffolding) | ✓ Shipped — R.4 promotes the underlying data. |
| R.3.6 Settings (design system tokens + cards + eyebrows) | ✓ Shipped — R.4 consumes; no token churn. |
| `getDriftAnalysis` + `isHikeAlert` | ✓ Exist — R.4 reuses. |
| vaul drawers in codebase | ✓ Already in R.3.5 — R.4 reuses for `<MoveDrawer>`. |

---

## Open items for plan phase

1. **`<ChartRangeTabs>` (1Y/2Y range selector) disposition.** Currently part of R.3.5's `<ForecastChart>`. R.4's "minimal sandbox" framing suggests dropping it; the user-value of 2Y is small for ephemeral exploration. Plan-phase decision: keep, drop, or move to a compact icon toggle.
2. **Suggestion chip ordering when both drift and hike apply to the same goal.** Spec says cap at 3 each. Layout: stacked rows? Or interleaved single row with `source` badge? Determine in plan via mockup pass.
3. **Move row inline edit affordance.** Decision #1 says removal undoes; spec doesn't address mid-life parameter edits (e.g., user reduced dining by $50/mo, wants to bump to $80/mo). Options: (a) detach + re-attach, (b) inline pencil that opens `<MoveDrawer>` in edit mode. Plan-phase to decide; mid-life edit is common UX.
4. **Confirm-discard dialog copy.** "You have unsaved Moves on this scenario. Discard them?" — standard pattern from R.3.5's existing `<MobileScenarioSaveBar>` Reset flow. Lift verbatim.
5. **Hard-cut migration developer comms.** README + HANDOFF doc copy explaining "your existing simulator scenarios will appear empty after R.4 deploy — re-add Moves to restore them." Plan-phase to draft + place.
6. **Whether to write a `getGoalMoves(userId)` and `getScenarioMoves(userId)` query in `src/lib/db/queries/moves.ts`, or inline the SELECTs in the page-level `Promise.all`.** Pattern from other R.x phases: dedicated query file. Plan-phase to confirm location.
7. **Where the `goal_move.source` analytics surface lives (if at all in R.4).** Decision #7 says source is recorded; doesn't specify display. Could surface in dashboard ("3 of 5 attached Moves originated from drift suggestions"). Probably deferred to R.6.

---

## Cross-references

- Brainstorm artifacts: `.superpowers/brainstorm/86449-1778642873/content/` (9 files: `r4-orientation.html` → `all-locks.html`)
- Pre-kickoff scope brief: [OVERVIEW.md](OVERVIEW.md)
- Milestone-level decisions: [docs/redesign/SPEC.md](../SPEC.md) — locked decisions #6 (Goals Moves) and #7 (Move data model)
- Previous phase: [docs/redesign/r3-6-settings/SPEC.md](../r3-6-settings/SPEC.md)
- R.3.1 goals IA (Moves slot R.4 replaces): [docs/redesign/r3-1-goals/SPEC.md](../r3-1-goals/SPEC.md)
- R.3.5 simulator (architecture R.4 refactors): [docs/redesign/r3-5-simulator/SPEC.md](../r3-5-simulator/SPEC.md)
- Forecast engine invariants: [CLAUDE.md](../../../CLAUDE.md) > "Forecast engine consumes raw PFC totals" + "override appliers use signed math"
- RSC boundary lessons: [CLAUDE.md](../../../CLAUDE.md) > "Don't pass forwardRef components across the server→client boundary" + "Don't pass functions across the server→client boundary in config props"
- Voice principle source: feedback memory `feedback_foothold_instrument_voice.md`
- Current engine: [src/lib/forecast/apply-overrides.ts](../../../src/lib/forecast/apply-overrides.ts), [src/lib/forecast/apply-overrides-commutativity.test.ts](../../../src/lib/forecast/apply-overrides-commutativity.test.ts)
- Current scenario schema: [src/lib/db/schema.ts](../../../src/lib/db/schema.ts) > `scenario`
- Current goal schema: [src/lib/db/schema.ts](../../../src/lib/db/schema.ts) > `goal`
- Bundle reference: [claude-design-context/](../../../claude-design-context/) (R.4 doesn't have a Stitch mockup; design follows R.3.1 card patterns)
