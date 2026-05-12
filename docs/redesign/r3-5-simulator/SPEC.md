# R.3.5 Simulator — Design Spec

**Date locked**: 2026-05-11
**Phase**: R.3.5 (Simulator sweep within R.3 per-page restyle)
**Scope**: Wholesale visual + IA redesign of `/simulator` + restyle of `/simulator/compare`
**Status**: Spec locked, ready for plan phase
**Branch**: `feat/redesign` (long-lived; R.3.5 commits land here)

---

## North star

The simulator is the **protagonist of the app**. Where the rest of Foothold maps what already is, the simulator answers *what if* — and that question is what makes the product a planning tool rather than a tracking tool. R.3.5 transforms `/simulator` from a power-user editor into a surface where a non-power-user can ask "what happens if my income changes" and get a real answer in two clicks.

The mechanism is **Moves**: 8 named templates that abstract the override system. The user picks "Job loss" or "Cancel subs" and fills 1–3 inputs — they never need to know the simulator has 7 different override types. Power users keep the Comparison tab where the full override editor lives.

---

## Locked decisions (2026-05-11)

| # | Decision | Choice | Rationale |
|---|---|---|---|
| 1 | Scope boundary R.3.5 vs R.4 | Strict R.3.5 = visual + IA shell, Moves stays a UX layer over existing overrides | Moves data unification ships in R.4 per R.0 decision #7. R.3.5 ships the simpler UX without the data refactor. |
| 2 | Moves tab behavior | Guided template forms (1–3 inputs each) abstract the override editor | Per user direction: easy on-ramp for non-power-users; they shouldn't have to learn overrides. |
| 3 | Forecast horizon | Range tabs 1Y / 2Y, default 1Y | Mockup-faithful default + power-user 2Y option. URL-mirrored (`?range=`). Data window stays at 24mo; range tabs are a display slice. |
| 4 | Narrative panel disposition | Remove entirely from `/simulator` | Mockup-faithful. Anthropic Haiku spend on this surface drops to zero. Backend (`forecast_narrative` table + scenario-actions narrative code) survives untouched for R.4 resurfacing. |
| 5 | `/simulator/compare` route | Sweep in R.3.5 — restyle to new tokens, no IA change | Maintain visual consistency across simulator surfaces. Compare route's A-vs-B diff role is preserved for power users. |
| 6 | Scenario picker disposition | Keep `<ScenarioPicker>` as a small "Load…" dropdown in header + ship the new `<ScenarioCards>` row | Cards row is the primary affordance per mockup; dropdown handles >5 saved scenarios. Revisit in R.4 — delete if dropdown unused. |
| 7 | Architecture approach | Single `SimulatorClient` top-level + URL-state-mirrored tabs (`?view=`) | Refresh-safe, deep-linkable, back-button-friendly. Mirrors `/simulator/compare`'s URL pattern. Single state owner; no Zustand. |

---

## Architecture

### Page-level structure

`src/app/(app)/simulator/page.tsx` stays as the RSC entry point. Reads three URL params:

- `?view=empty|moves|comparison` — initial tab
- `?scenario=<id>` — saved scenario to load
- `?range=1Y|2Y` — chart range

All three validated server-side; invalid values fall back to defaults.

**Default `view` resolution (server-side):**

```
if (?view= is valid)                     → initialView = that value
else if (scenarios.length === 0)         → initialView = 'empty'
else                                     → initialView = 'comparison'
```

`'moves'` is **never auto-defaulted** — user must explicitly land via tab click or deep-link. Empty/Comparison is the auto-routing axis. Rationale: Empty shows the real baseline trajectory first; routing to Moves on first paint hides the financial state behind a template chooser.

### Client state model

`SimulatorClient` keeps existing state hooks unchanged in shape:

- `selectedScenarioId: string | null`
- `liveOverrides: ScenarioOverrides`
- `openSections: ReadonlySet<string>` (accordion state)
- `view: 'empty' | 'moves' | 'comparison'` — NEW
- `range: '1Y' | '2Y'` — NEW
- `activeMoveTemplate: MoveTemplateId | null` — NEW (drawer state, single-active by construction)

Derived (memoized):
- `selectedScenario` — looked up
- `isDirty` — `JSON.stringify(saved) !== JSON.stringify(live)`
- `engineResult` — `projectCash({ history, overrides: liveOverrides, currentMonth })`
- `baselineResult` — `projectCash({ history, overrides: {}, currentMonth })`
- `hasOverrides` — any override non-empty
- `chartMarkers` — `deriveChartMarkers(baselineResult.projection, engineResult.projection, engineResult.goalImpacts, currentMonth, range)`

### URL state mirroring

- URL → state: one-way at mount only.
- State → URL: one-way on user action via `router.push('/simulator?view=…&scenario=…&range=…', { scroll: false })`.
- No reactive loop.
- Override edits **do not** mirror to URL — too granular; would spam history. Saving the scenario is the persistence boundary.

### RSC boundary discipline (three-strike watch)

Per redesign SPEC.md risks (forwardRef = strike 1, config-of-functions = strike 2), one more instance promotes from Lesson to architecture-level guard. R.3.5 risk surface:

- `<MoveTemplateDrawer>` config — Move templates live in a `'use client'` file (`moves/templates.ts`), imported only by client components. Appliers and validators are top-level functions imported by name, not closures passed across boundaries.
- `<MovesGrid>` — pure client component; no server props with functions.
- `<ChartGoalMarker>` — pure SVG; no functions in props.

**Plan task (P0):** acceptance grep that no server component constructs a component prop with a function-shaped value. Targets: `page.tsx`. Search keys: `onSelect`, `onChange`, `render`, `onPick`, `onSubmit`.

---

## Tab contents

### Empty tab

Lands here when user has no saved scenarios. Renders three things, top to bottom:

1. **Forecast chart** (1Y default), `showScenario={false}` — baseline-only line (dashed, `--text-2`). Position dot pulses at today's value. Y-axis + x-axis intact. Goal markers: only computed ones (runway depleted) since no scenario exists to derive arrivals.
2. **Centered card** with `<ContourBackdrop>` behind it: `<FootholdMark size={48} />` + `<h3>Start with where you stand.</h3>` + 2-sentence body explaining baseline + single CTA "Pick a Move" → `setView('moves')`.
3. No scenario cards row, no goal impacts row.

Header (page eyebrow "Plan" + title "Simulator" + Reset/Save-as buttons + tab strip) renders on every tab — it's the shell.

### Moves tab

Lands here on user click. Renders:

1. **Section head:** "Pick a Move" with subtitle "Each Move adds an override and re-runs the projection" + small "Cancel ×" link → `setView('empty')`.
2. **MovesGrid** — 4-column responsive grid (4 cols at ≥1024px, 2 at 640–1023px, 1 below) with 8 cards. Each card: icon + title + 1-line description, hover lifts 2px.
3. **Move-template drawer** — `vaul` `<Drawer>` (right-side desktop, bottom mobile) opens on card click with the template form for that Move. Drawer closes on submit or cancel.

**On submit:**
```
const next = template.applier(formValues, liveOverrides);
setLiveOverrides(next);
closeDrawer();
setView('comparison');
setOpenSections(prev => new Set([...prev, template.targetSection]));
```

The accordion section corresponding to the override type auto-expands so the user can see what was added — the UX bridge from the simple Moves layer to the expert Comparison editor.

**Move → override mapping:**

| Move | Inputs | Emits override | Target section |
|---|---|---|---|
| Income change | When (month), New monthly amount | `incomeDelta` | `income` |
| Big purchase | When (month), Amount | `lumpSums[]` (negative) | `lumpSums` |
| Pay raise | When (month), Increase $/mo | `incomeDelta` | `income` |
| Job loss | When (month), For how many months | `incomeDelta` (income → $0) | `income` |
| New recurring | When (month), Amount $/mo, Name | `recurringChanges[]` (new) | `recurring` |
| Pause recurring | Which charge (dropdown of `history.recurringStreams`), For how many months | `skipRecurringInstances[]` | `skipRecurring` |
| Bonus | When (month), Amount | `lumpSums[]` (positive) | `lumpSums` |
| Cancel subs | Which charge (dropdown) | `skipRecurringInstances[]` (permanent) | `skipRecurring` |

**Move conflict policy:**

- `incomeDelta` is **single-valued** (not array). Two income-affecting Moves silently overwrite (last-wins). R.3.5 documents this as a known limitation closed by R.4's Move primitive. Mitigation: drawer shows an inline notice when `liveOverrides.incomeDelta != null` AND the active Move emits income: *"This will replace your existing income override (raise of $500/mo starting Jul 2026)."* Confirm-to-proceed; cancel discards.
- Array-based overrides (`lumpSums`, `recurringChanges`, `skipRecurringInstances`, `categoryDeltas`, `hypotheticalGoals`, `goalTargetEdits`) coexist additively. **Applier-level dedup:** appliers for "Pause recurring" / "Cancel subs" / goal-target Moves must dedupe by natural key (e.g., `(streamId, month)` for skip-recurring; `(goalId)` for goal-target-edit) — running the same Move twice should update the existing entry, not stack duplicates. Each applier's unit test must cover this case.

### Comparison tab

Default landed-on tab once a scenario exists. Two-column grid `[260px_1fr]` at ≥md.

**Left column — `<OverridesPanel>`:**

- `text-eyebrow` "Overrides" header
- 7 accordion sections (Categories / Lump sums / Recurring / Income / Hypothetical goals / Existing goal edits / Skip recurring) — same as today, restyled to new tokens, badge "N active" replaces the current count chip
- Single-open accordion on <md (current behavior preserved); independent on ≥md
- Each section's inner editor stays the same component, restyled internally

**Right column — top to bottom:**

1. **Forecast chart** with range tabs (1Y / 2Y) above. Baseline (dashed, `--text-2`) + scenario (solid, `--accent`). Position dot pulses on scenario at today's value. Goal markers as vertical dotted lines with smallcaps captions (`RUNWAY DEPLETED · baseline only` warn tone, `EMERGENCY FUND · target · Feb '27` goal tone). Hover crosshair + tooltip (date / baseline / scenario / delta). Above the chart: freshness annotation rendering `formatFreshness({ sources })` output — mirrors R.2 `<NetWorthHero>` / `<PageHeader>` pattern.
2. **Scenario cards row** — `<ScenarioCards>`. Baseline always first (read-only). Active scenario card filled bar on left edge, name from `selectedScenario?.name ?? 'Current scenario'`, hero-mono figure of projected end-cash, 1-line meta describing overrides. Additional saved scenarios render to the right; horizontal-scroll on mobile, wraps ≥md. Click switches scenario via `handleSelectScenario`.
3. **Goal impacts row** — `<GoalImpacts>`. Section eyebrow "Goal impacts" + subtitle "vs baseline projection" + 1 card per goal in `engineResult.goalImpacts`. **Sort order:** absolute month delta descending (biggest scenario impact first), then by goal name. **Cap:** 4 cards visible by default; "View all" surfaces remaining (overflow mechanism deferred to plan phase, see Open items #3). Each card: goal name + status pill (`faster` / `same` / `slower`), hero-mono projected arrival date ("2027 · 02"), delta row showing baseline date → signed month delta. Zero-impact goals render with `same` pill — they aren't filtered out (the mockup shows this: Food and Groceries displays as `same`).

---

## Components inventory

### New

| Component | Purpose | Location |
|---|---|---|
| `<SimulatorTabs>` | Empty / Moves / Comparison tab strip | `src/components/simulator/simulator-tabs.tsx` |
| `<MovesGrid>` | 4×2 template grid | `src/components/simulator/moves/moves-grid.tsx` |
| `<MoveTemplateDrawer>` | vaul drawer wrapping active Move's form | `src/components/simulator/moves/move-template-drawer.tsx` |
| `<MoveTemplateForm>` | Config-driven form renderer for all 8 templates | `src/components/simulator/moves/move-template-form.tsx` |
| `<EmptyStateCard>` | Centered "Start with where you stand" card on Empty tab | `src/components/simulator/empty-state-card.tsx` |
| `<ChartRangeTabs>` | 1Y / 2Y toggle above the chart | `src/components/simulator/chart-range-tabs.tsx` |
| `<GoalImpacts>` | Goal-impact cards row | `src/components/simulator/goal-impacts.tsx` |

### Pure helpers (new)

| Module | Exports |
|---|---|
| `src/lib/simulator/url-state.ts` | `parseView`, `parseRange`, `parseScenario`, `defaultView`, `buildSimulatorUrl` |
| `src/lib/simulator/moves/templates.ts` | `MOVE_TEMPLATES` (the 8 template configs: id, icon, title, description, fieldSchema, applier, targetSection), `MoveTemplateId` |
| `src/lib/simulator/moves/appliers.ts` | One pure function per Move (`applyIncomeChange`, `applyBigPurchase`, `applyPayRaise`, `applyJobLoss`, `applyNewRecurring`, `applyPauseRecurring`, `applyBonus`, `applyCancelSub`) |
| `src/lib/simulator/moves/validation.ts` | Per-field validators (required, positive amount, future month, in-range month) + `validateMoveForm(templateId, values)` |
| `src/lib/simulator/markers.ts` | `deriveChartMarkers`, `ChartMarker` type |

### Restyled (token sweep + targeted structural)

| Component | Change |
|---|---|
| `<ForecastChart>` | **Major rework.** Brand palette (`--chart-1..6`), dashed baseline (`--text-2`) + solid scenario (`--accent`), position dot pulse at today's anchor, goal markers, hover crosshair + tooltip. Accepts `range: '1Y' \| '2Y'` and slices projection. |
| `<ScenarioHeader>` | Token sweep. Layout: page eyebrow + title + right-cluster `[Reset]` + conditional `[Load…]` dropdown + `[Save as…]` + conditional `[Save]` (dirty) + conditional `[Delete]` (saved selected). |
| `<ScenarioDeltaCards>` → `<ScenarioCards>` | Rename + restyle + structural: Baseline always first card; saved scenarios + active scenario render after. Click switches. Horizontal-scroll on mobile. |
| `<OverrideSection>` | Token sweep, new badge style. Accordion behavior preserved. |
| 7 override editor components | Internal token sweep only. Same shape, same API, same tests pass. |
| `<MobileScenarioSaveBar>` | Token sweep, sticky-bottom behavior preserved. Visibility: only `view === 'comparison'`. |
| `<ScenarioPicker>` | Restyled, shrunk to a compact "Load…" dropdown surfacing all saved scenarios. Slated for R.4 deletion review. |

### Removed

| Component | Disposition |
|---|---|
| `<NarrativePanel>` | Delete from `/simulator`. Backend (`forecast_narrative` table + scenario-actions code) survives. |
| `<GoalDiffCards>` | Delete. Replaced by `<GoalImpacts>`. |
| `<GoalDiffMatrix>` | Delete. Matrix view not in mockup; operator-tier feature dropped per R.0 spirit. |

---

## Data flow

### Server-side prep (`simulator/page.tsx`)

```typescript
const view = parseView(params.view) ?? defaultView(scenarios, initialScenario);
const range = parseRange(params.range) ?? '1Y';
const initialScenario = parseScenario(params.scenario, scenarios) ?? scenarios[0] ?? null;
```

All three parsers are pure (`src/lib/simulator/url-state.ts`), unit-testable, no Next dependency.

### Forecast engine (unchanged)

`projectCash` untouched. `engineResult` and `baselineResult` keep current shape. `<ForecastChart>` consumes `baselineResult.projection` + `engineResult.projection`; `<GoalImpacts>` consumes `engineResult.goalImpacts`.

### Move → override emission

Each Move template's `applier` is a top-level pure function: `(formValues, currentOverrides) → nextOverrides`. Drawer submit handler:

```
const next = template.applier(formValues, liveOverrides);
setLiveOverrides(next);
closeDrawer();
setView('comparison');
setOpenSections(prev => new Set([...prev, template.targetSection]));
```

### Scenario CRUD

`scenario-actions.ts` server actions untouched (`createScenarioAction`, `updateScenarioAction`, `deleteScenarioAction`). `<ScenarioHeader>` continues to call them. `revalidatePath('/simulator')` after save/delete.

### URL state mirroring

On `view` / `scenario` / `range` change: `router.push('/simulator?…', { scroll: false })` with all three preserved. Build via `URLSearchParams`.

### Chart marker derivation

```typescript
type ChartMarker =
  | { kind: 'runwayDepleted'; monthIndex: number }
  | { kind: 'goalArrival'; monthIndex: number; goalName: string };

deriveChartMarkers(baseline, scenario, goalImpacts, currentMonth, range): ChartMarker[]
```

- `runwayDepleted` computed against **baseline** (not scenario). Reason: the marker is a warning about the unmoved trajectory. Anchoring to scenario would punish the user for solving the problem.
- `goalArrival` capped at 3. Falls outside visible range dropped via `range` filter.

### 1Y / 2Y range slicing

Forecast engine always projects 24 months. `<ForecastChart>` slices `projection.slice(0, range === '1Y' ? 12 : 24)`. No backend change.

### Freshness annotation

Above the chart, render `formatFreshness({ sources })` headline (and caveat if present). Same pattern as R.2's `<NetWorthHero>` / `<PageHeader>`. Wiring:

1. `page.tsx` adds `getSourceHealth(userId)` to its `Promise.all`.
2. Server-side derives the `sources` array (same shape as `/dashboard/page.tsx:142`): `{ name, lastSyncAt }[]`.
3. Calls `formatFreshness({ sources })` server-side; result is a `FreshnessText` object (`{ headline, caveat }`).
4. Passes `freshness: FreshnessText` to `SimulatorClient` as a prop.
5. Client renders the headline above the chart subtitle; caveat (if any) on the next line in `--text-3`.

No client-side recomputation of freshness — same conservative-anchor decision as R.2 (Phase 5 trust strip).

---

## Edge cases

| # | Case | Handling |
|---|---|---|
| 1 | `hasNoData` (zero accounts/transactions) | Preserve current "No data yet" branch. Render header + single info card; skip tabs/grid. |
| 2 | First visit, no saved scenarios | Auto-route to `view='empty'`. Baseline-only chart. CTA "Pick a Move" is the only forward path. |
| 3 | URL has invalid `?scenario=` | Fall back to `scenarios[0] ?? null` server-side. No 404. |
| 4 | URL has invalid `?view=` or `?range=` | Parser returns null; default resolution applies. |
| 5 | Move conflict (incomeDelta overwrite) | Inline notice in drawer; confirm-to-proceed. |
| 6 | User switches tab while drawer open | Drawer closes via `useEffect` on `view`. Form values discarded. |
| 7 | Saved scenario deleted on another device | `selectedScenario` becomes undefined post-revalidate; fall back to `selectedScenarioId = null`, keep `liveOverrides` as in-progress new scenario. Toast: "This scenario was removed. Your edits are still here as a new scenario." |
| 8 | Range tab change with chart hover active | Reset hover index to rightmost on range change. |
| 9 | `engineResult.goalImpacts` empty | `<GoalImpacts>` renders nothing. Section is data-driven, not chrome. |
| 10 | No `history.recurringStreams` | "Pause recurring" + "Cancel subs" Move cards render disabled with tooltip. Other 6 work. |
| 11 | Reset button | Clears `liveOverrides` to selected scenario's saved overrides (or `{}` if no scenario). Confirmation dialog when `isDirty`. |
| 12 | Tab switch on mobile | Tab strip horizontally scrollable below `sm`; sticky top. |
| 13 | Drawer cancel | Discards form values; no side-effect. |
| 14 | Multiple drawers stacked | Forbidden by state machine — `activeMoveTemplate` is single-valued; picking a Move while drawer open replaces or is a no-op. |

---

## Testing strategy

### Pure-helper unit tests (Vitest)

| Module | Tests |
|---|---|
| `src/lib/simulator/url-state.ts` | parseView/parseRange/parseScenario/defaultView happy + edge. ~6 tests. |
| `src/lib/simulator/moves/appliers.ts` | 8 appliers × happy path + edge (existing override present). 16 tests. |
| `src/lib/simulator/moves/validation.ts` | Per-template field validation. ~10 tests. |
| `src/lib/simulator/markers.ts` | `deriveChartMarkers` — runway-depleted detection, goal-arrival range filter, capping, currentMonth offset. ~8 tests. |
| `src/components/simulator/scenario-cards.tsx` | `pickActiveCard(scenarios, selectedId, liveOverrides)` pure helper. ~4 tests. |
| `src/components/simulator/goal-impacts.tsx` | `formatGoalImpact(impact)` pure helper. ~6 tests. |

**Target:** +50 vitest tests (611 → ~661).

### Component tests

Skipped except where load-bearing. Chart SVG snapshots too brittle for Recharts version churn. Manual UAT covers chart visuals; unit tests cover data transforms.

### Browser UAT axes (deferred manual walk)

| Axis | Notes |
|---|---|
| Tab routing | Empty / Moves / Comparison + URL `?view=` reflection + back/forward + refresh |
| 8 Move drawer forms | Each emits correct override; auto-expand correct accordion section |
| Move conflict notice | Income override re-emit shows inline notice |
| Chart position dot pulse | 2.6s loop, brand-green halo at today's anchor |
| Chart goal markers | Warn tone for runway-depleted, goal tone for goal-arrival |
| Chart range tabs | URL-mirrored, slices projection correctly |
| Hover crosshair + tooltip | Date / baseline / scenario / delta |
| Scenario cards row | Baseline first, active scenario styled, switching reloads liveOverrides |
| Cards overflow with >4 scenarios | Horizontal scroll <md, wraps ≥md |
| GoalImpacts cards | One per goal, faster/same/slower semantic colors |
| Empty state | ContourBackdrop + FootholdMark + CTA routes to Moves |
| `<MobileScenarioSaveBar>` | Visible on Comparison only |
| `/simulator/compare` restyle | New tokens applied, IA unchanged |
| Theme parity | Light + dark; chart palette flips correctly |
| RSC boundary discipline | No "Functions cannot be passed directly to Client Components" errors |
| Freshness annotation | `formatFreshness(history.asOf)` above chart subtitle |

---

## Out of scope

### Hard boundaries (R.3.5 does NOT touch)

| Area | Why |
|---|---|
| Move data primitive | R.4 work per R.0 decision #7. R.3.5 emits existing override types from Move templates. |
| Forecast engine (`projectCash`, override appliers, signed-math, PFC-totals) | Pure library. R.3.5 is UI-only. Engine tests stay green. |
| Forecast data window | 24-month projection stays; range tabs are display slice only. |
| Mobile rebuild | R.5 territory. R.3.5 ships responsive defaults for new components; mobile-scenario-save-bar keeps current visual treatment. |
| `forecast_narrative` table + narrative code | Backend survives. Component deletes from page; cache + generation code stays for R.4 resurfacing. |
| Anthropic Haiku call site | Imports unhooked from `/simulator`, not deleted from lib. |
| Investment what-if (Phase 4-pt2) | Separately deferred. |
| Multi-user / auth / RLS / onboarding | Parallel track. No new tables/columns. |
| Email digest | Stays hex-literal HTML per SPEC R.0. |
| AI eval framework | Out-of-scope per SPEC R.0. |

### Soft dependencies + flags

| Item | Status |
|---|---|
| `wip/templates-paused` branch | **Plan-phase triage step:** diff the branch, salvage applier scaffolding or zod schemas if compatible, archive otherwise. Doesn't block spec. |
| Reliability Phase 6 freshness annotation | Included in this phase (lightweight) — `formatFreshness(history.asOf)` above chart subtitle. Mirrors R.2 dashboard pattern. |
| Brand-tinted `--chart-1..6` palette | R.3.4 already shipped. R.3.5 consumes. |
| Position-dot motif + `<FootholdMark>` | R.1 already shipped. R.3.5 consumes. |
| vaul drawers | Already in codebase. R.3.5 reuses for `<MoveTemplateDrawer>`. |

### Compare route boundary

`/simulator/compare` gets restyled in R.3.5 — token sweep + chart vocabulary alignment with new `<ForecastChart>`. **No IA changes**: still A-vs-B saved scenario diff, query unchanged, URL params (`?baseline=`, `?scenario=`) unchanged. ~2 plan tasks at end of R.3.5.

---

## Open items for plan phase

1. **`wip/templates-paused` branch triage** — diff, salvage, or archive.
2. **`<ScenarioPicker>` "Load…" affordance** — final placement in the header (right-cluster between Reset and Save as…); whether it's a select or a Radix dropdown.
3. **GoalImpacts "View all" overflow** — design of the disclosure (drawer? popover? deferred to R.4?).
4. **Reset button confirmation copy** — "Discard changes?" with description "Your unsaved overrides will be removed."
5. **`<ChartGoalMarker>` rendering when two markers overlap on the same month** — stack vertically, dot vertically, or merge into a combined caption.

---

## Cross-references

- Mockup screenshot: provided in conversation 2026-05-11
- Mockup JSX: [claude-design-context/foothold-simulator.jsx](../../claude-design-context/foothold-simulator.jsx)
- Design system contract: [claude-design-context/README.md](../../claude-design-context/README.md)
- Milestone-level decisions: [docs/redesign/SPEC.md](../SPEC.md)
- Previous phase: [docs/redesign/r3-4-investments/SPEC.md](../r3-4-investments/SPEC.md)
- Handoff into this phase: [docs/redesign/HANDOFF-2026-05-11-post-r3-4.md](../HANDOFF-2026-05-11-post-r3-4.md)
- Forecast engine invariants: [CLAUDE.md](../../../CLAUDE.md) > "Forecast engine consumes raw PFC totals" + "override appliers use signed math"
- RSC boundary lessons: [CLAUDE.md](../../../CLAUDE.md) > "Don't pass forwardRef components across the server→client boundary" + "Don't pass functions across the server→client boundary in config props"
- Reliability Phase 6 integration: [docs/reliability/implementation-plan.md](../../reliability/implementation-plan.md) § Phase 6
- Current simulator entry: [src/app/(app)/simulator/simulator-client.tsx](../../../src/app/(app)/simulator/simulator-client.tsx)
