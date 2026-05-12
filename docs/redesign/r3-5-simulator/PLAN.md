# R.3.5 Simulator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform `/simulator` into the product's protagonist surface — a planning tool where non-power users ask "what if my income changes" via 8 guided Move templates while power users keep the existing override editor, all under a redesigned visual language with deep-linkable tabs (Empty / Moves / Comparison), a hand-rolled SVG chart with position-dot pulse and goal markers, scenario cards row, goal impacts row, and a token-swept `/simulator/compare` route.

**Architecture:** Single `SimulatorClient` top-level client component preserves existing state model (`selectedScenarioId`, `liveOverrides`, `openSections`, plus new `view`, `range`, `activeMoveTemplate`). Tab + range + scenario state mirror to URL (`?view=&range=&scenario=`) for deep-linking and refresh-safety. Moves emit existing override types via pure applier functions — no data-model change in R.3.5 (R.4 will introduce the Move primitive). `forecast_narrative` table + Anthropic Haiku code survive untouched on the backend; `<NarrativePanel>` deletes from the page.

**Tech Stack:** Next.js 14 App Router · TypeScript · Tailwind + shadcn/ui · vaul (drawers) · Drizzle ORM (no schema changes) · Vitest (50 new tests target) · hand-rolled SVG for the chart.

---

## Plan-time decisions + deviations from spec

Apply these inline as you implement; not load-bearing enough to re-spec but worth knowing.

1. **Pause recurring / Cancel subs Moves emit `recurringChanges` (with `action: 'pause'`), NOT `skipRecurringInstances`.** The data model's `recurringChanges` already supports a bounded pause via `startMonth` + `endMonth` — a single entry replaces what would be N `skipRecurringInstances` rows. "Pause for N months" emits one row with both months set; "Cancel" emits one row with only `startMonth` set (permanent). Same projection result, much cleaner state.
2. **`<ForecastChart>` is hand-rolled SVG, NOT Recharts.** The mockup's JSX in `claude-design-context/foothold-simulator.jsx` is essentially a working hand-rolled SVG implementation. Adapting it to TypeScript + Foothold tokens is more direct than coercing Recharts into supporting goal markers + position-dot pulse. R.3.4's `<PerformanceChart>` (Recharts) is a separate component with a different role.
3. **`wip/templates-paused` branch triage is T2 (the second task, not deferred).** Diff happens up front so any salvageable applier/schema work lands in subsequent pure-helper tasks instead of being re-derived.

---

## File structure

### New files

```
src/lib/simulator/
├── url-state.ts                 # URL param parsers (T3)
├── url-state.test.ts
├── markers.ts                   # Chart marker derivation (T4)
├── markers.test.ts
└── moves/
    ├── appliers.ts              # 8 pure applier functions (T5)
    ├── appliers.test.ts
    ├── validation.ts            # Per-template form validation (T6)
    ├── validation.test.ts
    └── templates.ts             # MOVE_TEMPLATES config array (T7)

src/components/simulator/
├── simulator-tabs.tsx           # Empty/Moves/Comparison tab strip (T18)
├── empty-state-card.tsx         # Empty tab centered card (T16)
├── chart-range-tabs.tsx         # 1Y/2Y toggle (T17)
├── goal-impacts.tsx             # Goal impacts cards row + formatGoalImpact (T10)
├── goal-impacts.test.ts
├── scenario-cards.tsx           # Scenario cards row + pickActiveCard (T9)
├── scenario-cards.test.ts
└── moves/
    ├── moves-grid.tsx           # 4x2 template grid (T13)
    ├── move-template-drawer.tsx # vaul drawer wrapper (T15)
    └── move-template-form.tsx   # Config-driven form renderer (T14)
```

### Modified files

```
src/app/(app)/simulator/page.tsx                # T20
src/app/(app)/simulator/simulator-client.tsx    # T19 (major rewrite)
src/app/(app)/simulator/compare/compare-client.tsx  # T23
src/components/simulator/forecast-chart.tsx     # T8 (major rework)
src/components/simulator/scenario-header.tsx    # T12
src/components/simulator/scenario-picker.tsx    # T11
src/components/simulator/override-section.tsx   # T21
src/components/simulator/mobile-scenario-save-bar.tsx  # T22
src/components/simulator/category-overrides.tsx        # T21
src/components/simulator/lump-sum-overrides.tsx        # T21
src/components/simulator/recurring-overrides.tsx       # T21
src/components/simulator/income-overrides.tsx          # T21
src/components/simulator/hypothetical-goal-overrides.tsx  # T21
src/components/simulator/goal-target-overrides.tsx     # T21
src/components/simulator/skip-recurring-overrides.tsx  # T21
```

### Deleted files

```
src/components/simulator/narrative-panel.tsx    # T24
src/components/simulator/goal-diff-cards.tsx    # T24
src/components/simulator/goal-diff-matrix.tsx   # T24
src/components/simulator/scenario-delta-cards.tsx  # T9 (renamed to scenario-cards.tsx)
```

---

## Task index

| # | Task | Wave |
|---|---|---|
| T1 | Plan scaffolding + branch baseline | 1 |
| T2 | `wip/templates-paused` triage | 1 |
| T3 | Pure helper — `url-state.ts` | 2 |
| T4 | Pure helper — `markers.ts` | 2 |
| T5 | Pure helper — `moves/appliers.ts` | 2 |
| T6 | Pure helper — `moves/validation.ts` | 2 |
| T7 | Move templates config — `moves/templates.ts` | 3 |
| T8 | `<ForecastChart>` hand-rolled SVG rework | 4 |
| T9 | `<ScenarioCards>` (renames scenario-delta-cards) | 4 |
| T10 | `<GoalImpacts>` + `formatGoalImpact` helper | 4 |
| T11 | `<ScenarioPicker>` shrink to "Load…" dropdown | 4 |
| T12 | `<ScenarioHeader>` restyle + layout change | 5 |
| T13 | `<MovesGrid>` presentational | 5 |
| T14 | `<MoveTemplateForm>` config-driven renderer | 5 |
| T15 | `<MoveTemplateDrawer>` vaul wrapper | 5 |
| T16 | `<EmptyStateCard>` | 5 |
| T17 | `<ChartRangeTabs>` | 5 |
| T18 | `<SimulatorTabs>` | 5 |
| T19 | `<SimulatorClient>` rewrite — wiring | 6 |
| T20 | `simulator/page.tsx` — URL parsing + freshness | 6 |
| T21 | Override editor + override-section token sweep | 7 |
| T22 | `<MobileScenarioSaveBar>` token sweep | 7 |
| T23 | `/simulator/compare` restyle | 7 |
| T24 | Delete obsolete components | 8 |
| T25 | RSC boundary grep + final acceptance | 9 |

---

## Task 1: Plan scaffolding + branch baseline

**Files:** N/A (verification only)

- [ ] **Step 1: Confirm branch**

```bash
git rev-parse --abbrev-ref HEAD
```

Expected: `feat/redesign`

- [ ] **Step 2: Confirm working tree clean**

```bash
git status -s
```

Expected: empty output (no modifications, no untracked files)

- [ ] **Step 3: Confirm tests pass at baseline**

```bash
npm test 2>&1 | tail -5
```

Expected: `Test Files  N passed (N)` and `Tests  611 passed (611)` (or whatever the current baseline is — record this number for comparison at T25).

- [ ] **Step 4: Confirm typecheck passes**

```bash
npm run typecheck
```

Expected: clean exit (no errors).

- [ ] **Step 5: Capture baseline test count**

Note the test count from Step 3. Target at T25 acceptance: baseline + ~50 (so ~661).

---

## Task 2: `wip/templates-paused` branch triage

**Files:** N/A (read-only diff)

**Goal:** Determine whether the parked Move/template work on `wip/templates-paused` is salvageable for T5–T7, or should be archived. Outcome shapes how T5–T7 are executed.

- [ ] **Step 1: List remote branches**

```bash
git fetch origin
git branch -a | grep templates-paused
```

Expected: either `remotes/origin/wip/templates-paused` exists or nothing matches. If nothing matches, branch was already deleted — skip to Step 5.

- [ ] **Step 2: Diff structure**

```bash
git log feat/redesign..origin/wip/templates-paused --oneline 2>&1 | head -20
git diff --stat feat/redesign..origin/wip/templates-paused 2>&1 | head -40
```

Capture: how many commits, which files changed.

- [ ] **Step 3: Read salvageable artifacts**

For each file that looks relevant (filename includes `moves`, `template`, `applier`, `scenario`), check it out at the branch state into `/tmp`:

```bash
git show origin/wip/templates-paused:src/lib/simulator/moves/appliers.ts > /tmp/wip-appliers.ts 2>/dev/null || echo "not present"
# Repeat for files of interest
```

Review the salvaged file(s). Decision criteria:
- If applier signatures match the spec's `(formValues, currentOverrides) → nextOverrides` shape, salvage as the T5 starting point.
- If zod schemas match the Move template field shapes, salvage as the T6 starting point.
- Otherwise treat as obsolete.

- [ ] **Step 4: Record decision in commit message of T3+**

If salvaged, T3–T6 commit messages reference the salvage. If not, no reference needed.

- [ ] **Step 5: No commit at this task**

Read-only triage; no file changes.

---

## Task 3: Pure helper — `url-state.ts`

**Files:**
- Create: `src/lib/simulator/url-state.ts`
- Test: `src/lib/simulator/url-state.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/lib/simulator/url-state.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  parseView,
  parseRange,
  parseScenario,
  defaultView,
  buildSimulatorUrl,
} from './url-state';

describe('parseView', () => {
  it('returns the value when valid', () => {
    expect(parseView('empty')).toBe('empty');
    expect(parseView('moves')).toBe('moves');
    expect(parseView('comparison')).toBe('comparison');
  });

  it('returns null for invalid input', () => {
    expect(parseView('something')).toBeNull();
    expect(parseView(undefined)).toBeNull();
    expect(parseView('')).toBeNull();
  });
});

describe('parseRange', () => {
  it('returns the value when valid', () => {
    expect(parseRange('1Y')).toBe('1Y');
    expect(parseRange('2Y')).toBe('2Y');
  });

  it('returns null for invalid input', () => {
    expect(parseRange('3Y')).toBeNull();
    expect(parseRange(undefined)).toBeNull();
    expect(parseRange('1y')).toBeNull(); // case-sensitive
  });
});

describe('parseScenario', () => {
  const scenarios = [
    { id: 'a', name: 'A', overrides: {} },
    { id: 'b', name: 'B', overrides: {} },
  ] as const;

  it('returns matching scenario id', () => {
    expect(parseScenario('a', scenarios as never)).toBe('a');
  });

  it('returns null for unknown id', () => {
    expect(parseScenario('missing', scenarios as never)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(parseScenario(undefined, scenarios as never)).toBeNull();
  });
});

describe('defaultView', () => {
  it("returns 'empty' when scenarios list is empty AND no initial scenario", () => {
    expect(defaultView([], null)).toBe('empty');
  });

  it("returns 'comparison' when scenarios exist", () => {
    expect(defaultView([{ id: 'a' }] as never, null)).toBe('comparison');
  });

  it("returns 'comparison' when an initial scenario is selected", () => {
    expect(defaultView([], { id: 'x' } as never)).toBe('comparison');
  });
});

describe('buildSimulatorUrl', () => {
  it('builds with all params', () => {
    expect(
      buildSimulatorUrl({ view: 'comparison', range: '1Y', scenarioId: 'abc' })
    ).toBe('/simulator?view=comparison&range=1Y&scenario=abc');
  });

  it('omits scenario when null', () => {
    expect(
      buildSimulatorUrl({ view: 'empty', range: '1Y', scenarioId: null })
    ).toBe('/simulator?view=empty&range=1Y');
  });

  it('builds for compare-tab targeting', () => {
    expect(
      buildSimulatorUrl({ view: 'moves', range: '2Y', scenarioId: null })
    ).toBe('/simulator?view=moves&range=2Y');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/simulator/url-state.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`src/lib/simulator/url-state.ts`:

```typescript
import type { Scenario } from '@/lib/db/schema';

export type ViewParam = 'empty' | 'moves' | 'comparison';
export type RangeParam = '1Y' | '2Y';

const VALID_VIEWS: readonly ViewParam[] = ['empty', 'moves', 'comparison'];
const VALID_RANGES: readonly RangeParam[] = ['1Y', '2Y'];

export function parseView(input: unknown): ViewParam | null {
  return typeof input === 'string' && (VALID_VIEWS as readonly string[]).includes(input)
    ? (input as ViewParam)
    : null;
}

export function parseRange(input: unknown): RangeParam | null {
  return typeof input === 'string' && (VALID_RANGES as readonly string[]).includes(input)
    ? (input as RangeParam)
    : null;
}

export function parseScenario(
  input: unknown,
  scenarios: Pick<Scenario, 'id'>[],
): string | null {
  if (typeof input !== 'string') return null;
  return scenarios.some((s) => s.id === input) ? input : null;
}

export function defaultView(
  scenarios: Pick<Scenario, 'id'>[],
  initialScenario: Pick<Scenario, 'id'> | null,
): ViewParam {
  return scenarios.length === 0 && !initialScenario ? 'empty' : 'comparison';
}

export type BuildUrlInput = {
  view: ViewParam;
  range: RangeParam;
  scenarioId: string | null;
};

export function buildSimulatorUrl({ view, range, scenarioId }: BuildUrlInput): string {
  const params = new URLSearchParams();
  params.set('view', view);
  params.set('range', range);
  if (scenarioId) params.set('scenario', scenarioId);
  return `/simulator?${params.toString()}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/simulator/url-state.test.ts
```

Expected: all 17 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/simulator/url-state.ts src/lib/simulator/url-state.test.ts
git commit -m "feat(r3.5): T3 url-state parsers for simulator tab + range routing"
```

---

## Task 4: Pure helper — `markers.ts`

**Files:**
- Create: `src/lib/simulator/markers.ts`
- Test: `src/lib/simulator/markers.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/lib/simulator/markers.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { deriveChartMarkers } from './markers';
import type { MonthlyProjection, GoalImpact } from '@/lib/forecast/types';

function projection(months: { month: string; endCash: number }[]): MonthlyProjection[] {
  return months.map((m) => ({
    month: m.month,
    startCash: 0,
    inflows: 0,
    outflows: 0,
    endCash: m.endCash,
    byCategory: {},
    goalProgress: {},
  }));
}

describe('deriveChartMarkers', () => {
  const baseline = projection([
    { month: '2026-06', endCash: 5000 },
    { month: '2026-07', endCash: 3000 },
    { month: '2026-08', endCash: 1000 },
    { month: '2026-09', endCash: -500 }, // depletion here
    { month: '2026-10', endCash: -2000 },
    { month: '2026-11', endCash: -3500 },
  ]);
  const scenario = projection([
    { month: '2026-06', endCash: 5000 },
    { month: '2026-07', endCash: 4000 },
    { month: '2026-08', endCash: 3000 },
    { month: '2026-09', endCash: 2500 },
    { month: '2026-10', endCash: 2000 },
    { month: '2026-11', endCash: 1500 },
  ]);

  it('emits runway-depleted marker against baseline only', () => {
    const markers = deriveChartMarkers(baseline, scenario, [], '2026-06', '1Y');
    expect(markers.filter((m) => m.kind === 'runwayDepleted')).toHaveLength(1);
    expect(markers.find((m) => m.kind === 'runwayDepleted')).toMatchObject({
      kind: 'runwayDepleted',
      monthIndex: 3, // 2026-09 is index 3 from 2026-06
    });
  });

  it('omits runway-depleted when baseline never goes negative in the visible range', () => {
    const safe = projection([
      { month: '2026-06', endCash: 5000 },
      { month: '2026-07', endCash: 4500 },
    ]);
    const markers = deriveChartMarkers(safe, safe, [], '2026-06', '1Y');
    expect(markers.filter((m) => m.kind === 'runwayDepleted')).toHaveLength(0);
  });

  it('emits goal-arrival markers in visible range', () => {
    const goalImpacts: GoalImpact[] = [
      { goalId: 'g1', name: 'Emergency Fund', baselineETA: '2027-09', scenarioETA: '2027-02', shiftMonths: -7 },
    ];
    const markers = deriveChartMarkers(baseline, scenario, goalImpacts, '2026-06', '2Y');
    const arrivals = markers.filter((m) => m.kind === 'goalArrival');
    expect(arrivals).toHaveLength(1);
    expect(arrivals[0]).toMatchObject({
      kind: 'goalArrival',
      goalName: 'Emergency Fund',
    });
  });

  it('drops goal-arrival markers outside the visible range', () => {
    const goalImpacts: GoalImpact[] = [
      { goalId: 'g1', name: 'Far Goal', baselineETA: '2028-09', scenarioETA: '2028-02', shiftMonths: -7 },
    ];
    // 1Y from 2026-06 = visible through 2027-05; 2028 falls outside.
    const markers = deriveChartMarkers(baseline, scenario, goalImpacts, '2026-06', '1Y');
    expect(markers.filter((m) => m.kind === 'goalArrival')).toHaveLength(0);
  });

  it('caps goal-arrival markers at 3', () => {
    const goalImpacts: GoalImpact[] = Array.from({ length: 5 }, (_, i) => ({
      goalId: `g${i}`,
      name: `Goal ${i}`,
      baselineETA: '2027-03',
      scenarioETA: '2027-03',
      shiftMonths: 0,
    }));
    const markers = deriveChartMarkers(baseline, scenario, goalImpacts, '2026-06', '2Y');
    expect(markers.filter((m) => m.kind === 'goalArrival')).toHaveLength(3);
  });

  it('drops goals with null scenarioETA', () => {
    const goalImpacts: GoalImpact[] = [
      { goalId: 'g1', name: 'Unreachable', baselineETA: null, scenarioETA: null, shiftMonths: 0 },
    ];
    const markers = deriveChartMarkers(baseline, scenario, goalImpacts, '2026-06', '2Y');
    expect(markers.filter((m) => m.kind === 'goalArrival')).toHaveLength(0);
  });

  it('handles empty baseline', () => {
    expect(() => deriveChartMarkers([], [], [], '2026-06', '1Y')).not.toThrow();
    expect(deriveChartMarkers([], [], [], '2026-06', '1Y')).toEqual([]);
  });

  it('orders markers by monthIndex ascending', () => {
    const goalImpacts: GoalImpact[] = [
      { goalId: 'g1', name: 'Late', baselineETA: '2027-04', scenarioETA: '2027-04', shiftMonths: 0 },
      { goalId: 'g2', name: 'Early', baselineETA: '2026-12', scenarioETA: '2026-12', shiftMonths: 0 },
    ];
    const markers = deriveChartMarkers(baseline, scenario, goalImpacts, '2026-06', '2Y');
    const indices = markers.map((m) => m.monthIndex);
    expect([...indices].sort((a, b) => a - b)).toEqual(indices);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/simulator/markers.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`src/lib/simulator/markers.ts`:

```typescript
import type { MonthlyProjection, GoalImpact } from '@/lib/forecast/types';
import type { RangeParam } from './url-state';

export type ChartMarker =
  | { kind: 'runwayDepleted'; monthIndex: number }
  | { kind: 'goalArrival'; monthIndex: number; goalName: string };

const RANGE_TO_MONTHS: Record<RangeParam, number> = { '1Y': 12, '2Y': 24 };
const GOAL_ARRIVAL_CAP = 3;

/**
 * Builds the markers rendered on `<ForecastChart>`. Two kinds:
 *   - runwayDepleted: first baseline-projection month where endCash crosses
 *     below zero. Anchored to baseline (not scenario) so the marker reads
 *     as "what you're escaping" not "what you're now headed toward".
 *   - goalArrival: one per goal whose scenarioETA falls inside the visible
 *     window. Capped at 3 to keep the chart legible.
 *
 * `currentMonth` is the leftmost x-axis position. monthIndex = months
 * elapsed since currentMonth.
 */
export function deriveChartMarkers(
  baseline: MonthlyProjection[],
  _scenario: MonthlyProjection[], // reserved for future scenario-specific markers
  goalImpacts: GoalImpact[],
  currentMonth: string,
  range: RangeParam,
): ChartMarker[] {
  if (baseline.length === 0) return [];

  const horizonMonths = RANGE_TO_MONTHS[range];
  const visibleBaseline = baseline.slice(0, horizonMonths);

  const markers: ChartMarker[] = [];

  // Runway depleted: first month endCash < 0 in visible baseline
  const depletedIndex = visibleBaseline.findIndex((m) => m.endCash < 0);
  if (depletedIndex !== -1) {
    markers.push({ kind: 'runwayDepleted', monthIndex: depletedIndex });
  }

  // Goal arrivals: scenarioETA must exist + fall within visible range
  const arrivals = goalImpacts
    .filter((g) => g.scenarioETA !== null)
    .map((g) => ({
      goal: g,
      monthIndex: monthDiff(currentMonth, g.scenarioETA!),
    }))
    .filter(({ monthIndex }) => monthIndex >= 0 && monthIndex < horizonMonths)
    .slice(0, GOAL_ARRIVAL_CAP);

  for (const { goal, monthIndex } of arrivals) {
    markers.push({ kind: 'goalArrival', monthIndex, goalName: goal.name });
  }

  return markers.sort((a, b) => a.monthIndex - b.monthIndex);
}

function monthDiff(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/simulator/markers.test.ts
```

Expected: all 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/simulator/markers.ts src/lib/simulator/markers.test.ts
git commit -m "feat(r3.5): T4 chart marker derivation (runway-depleted + goal-arrival)"
```

---

## Task 5: Pure helper — `moves/appliers.ts`

**Files:**
- Create: `src/lib/simulator/moves/appliers.ts`
- Test: `src/lib/simulator/moves/appliers.test.ts`

**Context:** Each applier is a pure function `(formValues, currentOverrides) → nextOverrides`. Eight appliers cover the 8 Move templates. Conflict policy per spec: `incomeDelta` is single-valued (last-wins); array-based overrides dedupe by natural key (so re-running the same Move with the same target updates rather than stacks).

- [ ] **Step 1: Write the failing tests**

`src/lib/simulator/moves/appliers.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  applyIncomeChange,
  applyBigPurchase,
  applyPayRaise,
  applyJobLoss,
  applyNewRecurring,
  applyPauseRecurring,
  applyBonus,
  applyCancelSub,
} from './appliers';
import type { ScenarioOverrides } from '@/lib/forecast/types';

describe('applyIncomeChange', () => {
  it('sets incomeDelta on an empty scenario', () => {
    const next = applyIncomeChange(
      { when: '2026-07', newMonthlyAmount: 500 },
      {},
    );
    expect(next.incomeDelta).toEqual({ monthlyDelta: 500, startMonth: '2026-07' });
  });

  it('overwrites existing incomeDelta (last-wins)', () => {
    const next = applyIncomeChange(
      { when: '2026-08', newMonthlyAmount: -200 },
      { incomeDelta: { monthlyDelta: 500, startMonth: '2026-07' } },
    );
    expect(next.incomeDelta).toEqual({ monthlyDelta: -200, startMonth: '2026-08' });
  });
});

describe('applyBigPurchase', () => {
  it('appends a negative lump sum', () => {
    const next = applyBigPurchase({ when: '2026-09', amount: 4000 }, {});
    expect(next.lumpSums).toHaveLength(1);
    expect(next.lumpSums![0]).toMatchObject({
      label: 'Big purchase',
      amount: -4000,
      month: '2026-09',
    });
    expect(next.lumpSums![0].id).toBeTruthy();
  });

  it('coexists with existing lump sums', () => {
    const next = applyBigPurchase(
      { when: '2026-10', amount: 1000 },
      { lumpSums: [{ id: 'a', label: 'Old', amount: -500, month: '2026-07' }] },
    );
    expect(next.lumpSums).toHaveLength(2);
  });
});

describe('applyPayRaise', () => {
  it('sets incomeDelta with positive monthlyDelta', () => {
    const next = applyPayRaise({ when: '2026-08', increaseMonthly: 800 }, {});
    expect(next.incomeDelta).toEqual({ monthlyDelta: 800, startMonth: '2026-08' });
  });
});

describe('applyJobLoss', () => {
  it('sets incomeDelta to negative average + bounded by months', () => {
    const next = applyJobLoss(
      { when: '2026-09', months: 3, currentMonthlyIncome: 5000 },
      {},
    );
    expect(next.incomeDelta).toEqual({
      monthlyDelta: -5000,
      startMonth: '2026-09',
      endMonth: '2026-11',
    });
  });

  it('omits endMonth when months is 0 (permanent)', () => {
    const next = applyJobLoss(
      { when: '2026-09', months: 0, currentMonthlyIncome: 5000 },
      {},
    );
    expect(next.incomeDelta).toEqual({
      monthlyDelta: -5000,
      startMonth: '2026-09',
    });
  });
});

describe('applyNewRecurring', () => {
  it('appends a recurring add', () => {
    const next = applyNewRecurring(
      { when: '2026-07', amount: 50, name: 'New gym', direction: 'outflow' },
      {},
    );
    expect(next.recurringChanges).toHaveLength(1);
    expect(next.recurringChanges![0]).toMatchObject({
      action: 'add',
      label: 'New gym',
      amount: 50,
      direction: 'outflow',
      cadence: 'monthly',
      startMonth: '2026-07',
    });
  });
});

describe('applyPauseRecurring', () => {
  it('appends a bounded pause', () => {
    const next = applyPauseRecurring(
      { streamId: 'stream-1', startMonth: '2026-07', months: 3 },
      {},
    );
    expect(next.recurringChanges).toHaveLength(1);
    expect(next.recurringChanges![0]).toMatchObject({
      streamId: 'stream-1',
      action: 'pause',
      startMonth: '2026-07',
      endMonth: '2026-09',
    });
  });

  it('dedupes by streamId (updates existing pause for same stream)', () => {
    const next = applyPauseRecurring(
      { streamId: 'stream-1', startMonth: '2026-08', months: 1 },
      {
        recurringChanges: [
          { streamId: 'stream-1', action: 'pause', startMonth: '2026-07', endMonth: '2026-09' },
        ],
      },
    );
    expect(next.recurringChanges).toHaveLength(1);
    expect(next.recurringChanges![0]).toMatchObject({
      streamId: 'stream-1',
      startMonth: '2026-08',
      endMonth: '2026-08',
    });
  });

  it('preserves unrelated existing changes', () => {
    const next = applyPauseRecurring(
      { streamId: 'stream-2', startMonth: '2026-09', months: 2 },
      {
        recurringChanges: [
          { streamId: 'stream-1', action: 'pause', startMonth: '2026-07', endMonth: '2026-08' },
        ],
      },
    );
    expect(next.recurringChanges).toHaveLength(2);
  });
});

describe('applyBonus', () => {
  it('appends a positive lump sum', () => {
    const next = applyBonus({ when: '2026-12', amount: 2000 }, {});
    expect(next.lumpSums).toHaveLength(1);
    expect(next.lumpSums![0]).toMatchObject({
      label: 'Bonus',
      amount: 2000,
      month: '2026-12',
    });
  });
});

describe('applyCancelSub', () => {
  it('appends a permanent pause (startMonth set, endMonth omitted)', () => {
    const next = applyCancelSub(
      { streamId: 'stream-1', startMonth: '2026-07' },
      {},
    );
    expect(next.recurringChanges).toHaveLength(1);
    expect(next.recurringChanges![0]).toMatchObject({
      streamId: 'stream-1',
      action: 'pause',
      startMonth: '2026-07',
    });
    expect(next.recurringChanges![0].endMonth).toBeUndefined();
  });

  it('dedupes by streamId', () => {
    const next = applyCancelSub(
      { streamId: 'stream-1', startMonth: '2026-08' },
      {
        recurringChanges: [
          { streamId: 'stream-1', action: 'pause', startMonth: '2026-07', endMonth: '2026-09' },
        ],
      },
    );
    expect(next.recurringChanges).toHaveLength(1);
    expect(next.recurringChanges![0]).toMatchObject({
      streamId: 'stream-1',
      action: 'pause',
      startMonth: '2026-08',
    });
    expect(next.recurringChanges![0].endMonth).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/simulator/moves/appliers.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`src/lib/simulator/moves/appliers.ts`:

```typescript
import type { ScenarioOverrides } from '@/lib/forecast/types';

// ----------------------------------------------------------------
// Income-affecting Moves — single-valued incomeDelta (last-wins).
// ----------------------------------------------------------------

export type IncomeChangeForm = {
  when: string;                // YYYY-MM
  newMonthlyAmount: number;    // signed delta vs current income
};

export function applyIncomeChange(
  form: IncomeChangeForm,
  current: ScenarioOverrides,
): ScenarioOverrides {
  return {
    ...current,
    incomeDelta: {
      monthlyDelta: form.newMonthlyAmount,
      startMonth: form.when,
    },
  };
}

export type PayRaiseForm = {
  when: string;
  increaseMonthly: number;    // expected positive
};

export function applyPayRaise(
  form: PayRaiseForm,
  current: ScenarioOverrides,
): ScenarioOverrides {
  return {
    ...current,
    incomeDelta: {
      monthlyDelta: form.increaseMonthly,
      startMonth: form.when,
    },
  };
}

export type JobLossForm = {
  when: string;
  months: number;             // 0 = permanent
  currentMonthlyIncome: number; // for the delta calculation
};

export function applyJobLoss(
  form: JobLossForm,
  current: ScenarioOverrides,
): ScenarioOverrides {
  const endMonth = form.months > 0 ? addMonths(form.when, form.months - 1) : undefined;
  return {
    ...current,
    incomeDelta: {
      monthlyDelta: -form.currentMonthlyIncome,
      startMonth: form.when,
      ...(endMonth ? { endMonth } : {}),
    },
  };
}

// ----------------------------------------------------------------
// Lump-sum Moves — array, additive (no dedup; each is a distinct event).
// ----------------------------------------------------------------

export type BigPurchaseForm = {
  when: string;
  amount: number;             // expected positive; emitted as negative
};

export function applyBigPurchase(
  form: BigPurchaseForm,
  current: ScenarioOverrides,
): ScenarioOverrides {
  return {
    ...current,
    lumpSums: [
      ...(current.lumpSums ?? []),
      {
        id: generateId(),
        label: 'Big purchase',
        amount: -Math.abs(form.amount),
        month: form.when,
      },
    ],
  };
}

export type BonusForm = {
  when: string;
  amount: number;             // expected positive; emitted as positive
};

export function applyBonus(
  form: BonusForm,
  current: ScenarioOverrides,
): ScenarioOverrides {
  return {
    ...current,
    lumpSums: [
      ...(current.lumpSums ?? []),
      {
        id: generateId(),
        label: 'Bonus',
        amount: Math.abs(form.amount),
        month: form.when,
      },
    ],
  };
}

// ----------------------------------------------------------------
// Recurring-changes Moves — array, dedupe by streamId for pause/cancel.
// ----------------------------------------------------------------

export type NewRecurringForm = {
  when: string;
  amount: number;
  name: string;
  direction: 'inflow' | 'outflow';
};

export function applyNewRecurring(
  form: NewRecurringForm,
  current: ScenarioOverrides,
): ScenarioOverrides {
  return {
    ...current,
    recurringChanges: [
      ...(current.recurringChanges ?? []),
      {
        action: 'add',
        label: form.name,
        amount: form.amount,
        direction: form.direction,
        cadence: 'monthly',
        startMonth: form.when,
      },
    ],
  };
}

export type PauseRecurringForm = {
  streamId: string;
  startMonth: string;
  months: number;             // >0 expected
};

export function applyPauseRecurring(
  form: PauseRecurringForm,
  current: ScenarioOverrides,
): ScenarioOverrides {
  const endMonth = addMonths(form.startMonth, form.months - 1);
  const others = (current.recurringChanges ?? []).filter(
    (rc) => !(rc.streamId === form.streamId && rc.action === 'pause'),
  );
  return {
    ...current,
    recurringChanges: [
      ...others,
      {
        streamId: form.streamId,
        action: 'pause',
        startMonth: form.startMonth,
        endMonth,
      },
    ],
  };
}

export type CancelSubForm = {
  streamId: string;
  startMonth: string;         // typically currentMonth
};

export function applyCancelSub(
  form: CancelSubForm,
  current: ScenarioOverrides,
): ScenarioOverrides {
  const others = (current.recurringChanges ?? []).filter(
    (rc) => !(rc.streamId === form.streamId && rc.action === 'pause'),
  );
  return {
    ...current,
    recurringChanges: [
      ...others,
      {
        streamId: form.streamId,
        action: 'pause',
        startMonth: form.startMonth,
        // endMonth omitted → permanent per data model
      },
    ],
  };
}

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

function addMonths(yyyymm: string, n: number): string {
  const [y, m] = yyyymm.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

function generateId(): string {
  return `mv_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/simulator/moves/appliers.test.ts
```

Expected: 16 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/simulator/moves/appliers.ts src/lib/simulator/moves/appliers.test.ts
git commit -m "feat(r3.5): T5 pure appliers for 8 Move templates"
```

---

## Task 6: Pure helper — `moves/validation.ts`

**Files:**
- Create: `src/lib/simulator/moves/validation.ts`
- Test: `src/lib/simulator/moves/validation.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/lib/simulator/moves/validation.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  validateMonthField,
  validateAmountField,
  validateMonthsField,
  validateStreamId,
} from './validation';

describe('validateMonthField', () => {
  it('accepts a valid YYYY-MM in future or current', () => {
    expect(validateMonthField('2026-07', '2026-07')).toBeNull();
    expect(validateMonthField('2027-12', '2026-07')).toBeNull();
  });

  it('rejects malformed input', () => {
    expect(validateMonthField('2026-7', '2026-07')).toMatch(/format/);
    expect(validateMonthField('', '2026-07')).toMatch(/required/);
    expect(validateMonthField('abcd-ef', '2026-07')).toMatch(/format/);
  });

  it('rejects past months', () => {
    expect(validateMonthField('2025-12', '2026-07')).toMatch(/past/);
  });
});

describe('validateAmountField', () => {
  it('accepts positive amounts', () => {
    expect(validateAmountField(100)).toBeNull();
    expect(validateAmountField(0.01)).toBeNull();
  });

  it('rejects zero and negative', () => {
    expect(validateAmountField(0)).toMatch(/positive/);
    expect(validateAmountField(-50)).toMatch(/positive/);
  });

  it('rejects non-finite', () => {
    expect(validateAmountField(Number.NaN)).toMatch(/positive/);
    expect(validateAmountField(Number.POSITIVE_INFINITY)).toMatch(/positive/);
  });
});

describe('validateMonthsField', () => {
  it('accepts positive integers', () => {
    expect(validateMonthsField(1)).toBeNull();
    expect(validateMonthsField(12)).toBeNull();
  });

  it('rejects zero unless 0 is explicitly allowed', () => {
    expect(validateMonthsField(0)).toMatch(/at least 1/);
    expect(validateMonthsField(0, { allowZero: true })).toBeNull();
  });

  it('rejects non-integer values', () => {
    expect(validateMonthsField(1.5)).toMatch(/integer/);
  });
});

describe('validateStreamId', () => {
  it('accepts non-empty', () => {
    expect(validateStreamId('stream-1')).toBeNull();
  });

  it('rejects empty / undefined', () => {
    expect(validateStreamId('')).toMatch(/required/);
    expect(validateStreamId(undefined)).toMatch(/required/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/simulator/moves/validation.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`src/lib/simulator/moves/validation.ts`:

```typescript
/**
 * Per-field validators returning null on success or a user-facing error
 * string on failure. Composed in templates.ts into per-template validators.
 */

export function validateMonthField(
  value: string | undefined,
  currentMonth: string,
): string | null {
  if (!value) return 'Required';
  if (!/^\d{4}-\d{2}$/.test(value)) return 'Format must be YYYY-MM';
  if (value < currentMonth) return 'Must not be in the past';
  return null;
}

export function validateAmountField(value: number): string | null {
  if (!Number.isFinite(value) || value <= 0) return 'Must be positive';
  return null;
}

type MonthsOptions = { allowZero?: boolean };

export function validateMonthsField(
  value: number,
  options: MonthsOptions = {},
): string | null {
  if (!Number.isInteger(value)) return 'Must be a whole number (integer)';
  const min = options.allowZero ? 0 : 1;
  if (value < min) return options.allowZero ? 'Must be at least 0' : 'Must be at least 1';
  return null;
}

export function validateStreamId(value: string | undefined): string | null {
  if (!value) return 'Required';
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/simulator/moves/validation.test.ts
```

Expected: 11 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/simulator/moves/validation.ts src/lib/simulator/moves/validation.test.ts
git commit -m "feat(r3.5): T6 per-field validators for Move template forms"
```

---

## Task 7: Move templates config — `moves/templates.ts`

**Files:**
- Create: `src/lib/simulator/moves/templates.ts`

**Context:** This is the static config wiring icon/copy/fields/applier/section together for all 8 Moves. No tests — it's pure data (the appliers + validators are tested independently).

- [ ] **Step 1: Write the implementation**

`src/lib/simulator/moves/templates.ts`:

```typescript
import type { LucideIcon } from 'lucide-react';
import {
  TrendingUp,
  ShoppingBag,
  Sparkles,
  CircleSlash,
  Repeat,
  PauseCircle,
  Gift,
  XCircle,
} from 'lucide-react';
import type { ScenarioOverrides } from '@/lib/forecast/types';
import {
  applyIncomeChange,
  applyBigPurchase,
  applyPayRaise,
  applyJobLoss,
  applyNewRecurring,
  applyPauseRecurring,
  applyBonus,
  applyCancelSub,
} from './appliers';
import {
  validateMonthField,
  validateAmountField,
  validateMonthsField,
  validateStreamId,
} from './validation';

export type MoveTemplateId =
  | 'incomeChange'
  | 'bigPurchase'
  | 'payRaise'
  | 'jobLoss'
  | 'newRecurring'
  | 'pauseRecurring'
  | 'bonus'
  | 'cancelSub';

export type MoveFieldKind =
  | { kind: 'month'; label: string; helpText?: string }
  | { kind: 'currency'; label: string; helpText?: string }
  | { kind: 'integerMonths'; label: string; helpText?: string }
  | { kind: 'streamPicker'; label: string; direction?: 'outflow' | 'inflow' }
  | { kind: 'text'; label: string; helpText?: string }
  | { kind: 'directionToggle'; label: string };

export type OverrideSectionKey =
  | 'categories'
  | 'lumpSums'
  | 'recurring'
  | 'income'
  | 'hypotheticalGoals'
  | 'goalTargetEdits'
  | 'skipRecurring';

export type MoveTemplate = {
  id: MoveTemplateId;
  icon: LucideIcon;
  title: string;
  description: string;
  fields: Record<string, MoveFieldKind>;
  applier: (formValues: Record<string, unknown>, current: ScenarioOverrides) => ScenarioOverrides;
  validator: (formValues: Record<string, unknown>, currentMonth: string) => Record<string, string | null>;
  targetSection: OverrideSectionKey;
  conflictsWith?: (current: ScenarioOverrides) => string | null; // returns warning message or null
};

/**
 * Eight Move templates. Each is a fully self-contained config: presentation
 * (icon, title, description), inputs (fields), behavior (applier + validator),
 * and post-submit hint (targetSection — which accordion to auto-expand).
 *
 * NEVER reference these from a server component. The applier + validator
 * functions are CLOSURES in this file's module scope and cannot cross the
 * RSC boundary. Strike-3 watch in effect — see CLAUDE.md.
 */
export const MOVE_TEMPLATES: MoveTemplate[] = [
  {
    id: 'incomeChange',
    icon: TrendingUp,
    title: 'Income change',
    description: 'Raise, side income, or stipend',
    fields: {
      when: { kind: 'month', label: 'When' },
      newMonthlyAmount: { kind: 'currency', label: 'Change ($/mo)', helpText: 'Signed: positive for an increase, negative for a decrease.' },
    },
    applier: (v, current) =>
      applyIncomeChange({ when: v.when as string, newMonthlyAmount: v.newMonthlyAmount as number }, current),
    validator: (v, currentMonth) => ({
      when: validateMonthField(v.when as string, currentMonth),
      newMonthlyAmount: validateAmountField(Math.abs((v.newMonthlyAmount as number) ?? 0)),
    }),
    targetSection: 'income',
    conflictsWith: (current) =>
      current.incomeDelta
        ? `This will replace your existing income override (${formatMoney(current.incomeDelta.monthlyDelta)}/mo starting ${current.incomeDelta.startMonth ?? 'soon'}).`
        : null,
  },

  {
    id: 'bigPurchase',
    icon: ShoppingBag,
    title: 'Big purchase',
    description: 'Lump sum that hits one month',
    fields: {
      when: { kind: 'month', label: 'When' },
      amount: { kind: 'currency', label: 'Amount' },
    },
    applier: (v, current) =>
      applyBigPurchase({ when: v.when as string, amount: v.amount as number }, current),
    validator: (v, currentMonth) => ({
      when: validateMonthField(v.when as string, currentMonth),
      amount: validateAmountField(v.amount as number),
    }),
    targetSection: 'lumpSums',
  },

  {
    id: 'payRaise',
    icon: Sparkles,
    title: 'Pay raise',
    description: 'Recurring increase from date',
    fields: {
      when: { kind: 'month', label: 'Starts' },
      increaseMonthly: { kind: 'currency', label: 'Increase ($/mo)' },
    },
    applier: (v, current) =>
      applyPayRaise({ when: v.when as string, increaseMonthly: v.increaseMonthly as number }, current),
    validator: (v, currentMonth) => ({
      when: validateMonthField(v.when as string, currentMonth),
      increaseMonthly: validateAmountField(v.increaseMonthly as number),
    }),
    targetSection: 'income',
    conflictsWith: (current) =>
      current.incomeDelta
        ? `This will replace your existing income override.`
        : null,
  },

  {
    id: 'jobLoss',
    icon: CircleSlash,
    title: 'Job loss',
    description: 'Pause income for N months',
    fields: {
      when: { kind: 'month', label: 'Starts' },
      months: { kind: 'integerMonths', label: 'For how many months', helpText: '0 = permanent' },
    },
    applier: (v, current) =>
      applyJobLoss(
        {
          when: v.when as string,
          months: v.months as number,
          currentMonthlyIncome: (v.currentMonthlyIncome as number) ?? 0, // supplied by drawer
        },
        current,
      ),
    validator: (v, currentMonth) => ({
      when: validateMonthField(v.when as string, currentMonth),
      months: validateMonthsField(v.months as number, { allowZero: true }),
    }),
    targetSection: 'income',
    conflictsWith: (current) =>
      current.incomeDelta
        ? `This will replace your existing income override.`
        : null,
  },

  {
    id: 'newRecurring',
    icon: Repeat,
    title: 'New recurring',
    description: 'Add monthly charge',
    fields: {
      when: { kind: 'month', label: 'Starts' },
      amount: { kind: 'currency', label: 'Amount ($/mo)' },
      name: { kind: 'text', label: 'Name' },
      direction: { kind: 'directionToggle', label: 'In or out' },
    },
    applier: (v, current) =>
      applyNewRecurring(
        {
          when: v.when as string,
          amount: v.amount as number,
          name: v.name as string,
          direction: v.direction as 'inflow' | 'outflow',
        },
        current,
      ),
    validator: (v, currentMonth) => ({
      when: validateMonthField(v.when as string, currentMonth),
      amount: validateAmountField(v.amount as number),
      name: (v.name as string)?.trim() ? null : 'Required',
    }),
    targetSection: 'recurring',
  },

  {
    id: 'pauseRecurring',
    icon: PauseCircle,
    title: 'Pause recurring',
    description: 'Skip a known charge',
    fields: {
      streamId: { kind: 'streamPicker', label: 'Which charge', direction: 'outflow' },
      startMonth: { kind: 'month', label: 'Starting' },
      months: { kind: 'integerMonths', label: 'For how many months' },
    },
    applier: (v, current) =>
      applyPauseRecurring(
        {
          streamId: v.streamId as string,
          startMonth: v.startMonth as string,
          months: v.months as number,
        },
        current,
      ),
    validator: (v, currentMonth) => ({
      streamId: validateStreamId(v.streamId as string),
      startMonth: validateMonthField(v.startMonth as string, currentMonth),
      months: validateMonthsField(v.months as number),
    }),
    targetSection: 'recurring',
  },

  {
    id: 'bonus',
    icon: Gift,
    title: 'Bonus',
    description: 'One-time cash inflow',
    fields: {
      when: { kind: 'month', label: 'When' },
      amount: { kind: 'currency', label: 'Amount' },
    },
    applier: (v, current) =>
      applyBonus({ when: v.when as string, amount: v.amount as number }, current),
    validator: (v, currentMonth) => ({
      when: validateMonthField(v.when as string, currentMonth),
      amount: validateAmountField(v.amount as number),
    }),
    targetSection: 'lumpSums',
  },

  {
    id: 'cancelSub',
    icon: XCircle,
    title: 'Cancel subs',
    description: 'Trim recurring outflow',
    fields: {
      streamId: { kind: 'streamPicker', label: 'Which charge', direction: 'outflow' },
      startMonth: { kind: 'month', label: 'Starting' },
    },
    applier: (v, current) =>
      applyCancelSub(
        { streamId: v.streamId as string, startMonth: v.startMonth as string },
        current,
      ),
    validator: (v, currentMonth) => ({
      streamId: validateStreamId(v.streamId as string),
      startMonth: validateMonthField(v.startMonth as string, currentMonth),
    }),
    targetSection: 'recurring',
  },
];

export function findTemplate(id: MoveTemplateId): MoveTemplate | null {
  return MOVE_TEMPLATES.find((t) => t.id === id) ?? null;
}

function formatMoney(amount: number): string {
  const sign = amount < 0 ? '-' : '+';
  return `${sign}$${Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
```

- [ ] **Step 2: Verify typecheck passes**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/simulator/moves/templates.ts
git commit -m "feat(r3.5): T7 MOVE_TEMPLATES config — 8 templates wiring icons/forms/appliers"
```

---

## Task 8: `<ForecastChart>` hand-rolled SVG rework

**Files:**
- Modify (full rewrite): `src/components/simulator/forecast-chart.tsx`

**Context:** Full replacement of the Recharts implementation with a hand-rolled SVG that matches the mockup's anatomy: dashed baseline, solid scenario, position-dot pulse at today's anchor, goal markers as vertical dotted lines with smallcaps captions, hover crosshair + tooltip showing date / baseline / scenario / delta. Accepts a `range` prop that slices the projection.

- [ ] **Step 1: Replace the file**

`src/components/simulator/forecast-chart.tsx`:

```typescript
'use client';

import { useCallback, useMemo, useState } from 'react';
import type { MonthlyProjection } from '@/lib/forecast/types';
import type { ChartMarker } from '@/lib/simulator/markers';
import type { RangeParam } from '@/lib/simulator/url-state';
import { formatCurrency } from '@/lib/utils';

type Props = {
  baseline: MonthlyProjection[];
  scenario: MonthlyProjection[];
  markers: ChartMarker[];
  range: RangeParam;
  showScenario?: boolean;
  /** "12 months · 2027-05 projected" headline above the chart. Derived by parent. */
  subtitle?: string;
  /** Freshness annotation rendered below the title. */
  freshnessHeadline?: string;
  freshnessCaveat?: string | null;
};

const RANGE_TO_MONTHS: Record<RangeParam, number> = { '1Y': 12, '2Y': 24 };

export function ForecastChart({
  baseline,
  scenario,
  markers,
  range,
  showScenario = true,
  subtitle,
  freshnessHeadline,
  freshnessCaveat,
}: Props) {
  const horizonMonths = RANGE_TO_MONTHS[range];
  const visibleBaseline = baseline.slice(0, horizonMonths);
  const visibleScenario = scenario.slice(0, horizonMonths);

  const W = 1000;
  const H = 320;
  const padL = 56;
  const padR = 24;
  const padT = 20;
  const padB = 36;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const allVals = useMemo(() => {
    const vs: number[] = [];
    for (const m of visibleBaseline) vs.push(m.endCash);
    if (showScenario) for (const m of visibleScenario) vs.push(m.endCash);
    return vs;
  }, [visibleBaseline, visibleScenario, showScenario]);

  const { lo, hi } = useMemo(() => {
    if (allVals.length === 0) return { lo: -1000, hi: 1000 };
    const min = Math.min(...allVals);
    const max = Math.max(...allVals);
    const pad = Math.max(100, (max - min) * 0.15);
    return { lo: min - pad, hi: max + pad };
  }, [allVals]);

  const months = visibleBaseline.map((m) => m.month);

  const x = useCallback(
    (i: number) =>
      months.length > 1
        ? padL + (i / (months.length - 1)) * innerW
        : padL + innerW / 2,
    [months.length, innerW],
  );
  const y = useCallback(
    (v: number) => (hi === lo ? padT + innerH / 2 : padT + innerH - ((v - lo) / (hi - lo)) * innerH),
    [hi, lo, innerH],
  );

  const baselinePath = useMemo(() => {
    if (visibleBaseline.length === 0) return '';
    return visibleBaseline
      .map((m, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(m.endCash).toFixed(1)}`)
      .join(' ');
  }, [visibleBaseline, x, y]);

  const scenarioPath = useMemo(() => {
    if (!showScenario || visibleScenario.length === 0) return '';
    return visibleScenario
      .map((m, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(m.endCash).toFixed(1)}`)
      .join(' ');
  }, [visibleScenario, showScenario, x, y]);

  // Y-axis ticks — pick 5 evenly spaced rounded values
  const ticks = useMemo(() => buildTicks(lo, hi, 5), [lo, hi]);

  // Hover state
  const [hover, setHover] = useState<number | null>(null);
  const onMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const localX = ((e.clientX - rect.left) / rect.width) * W;
      const ratio = (localX - padL) / innerW;
      const idx = Math.round(ratio * (months.length - 1));
      setHover(Math.max(0, Math.min(months.length - 1, idx)));
    },
    [months.length, innerW],
  );

  const tipBaseline = hover !== null ? visibleBaseline[hover]?.endCash ?? null : null;
  const tipScenario =
    hover !== null && showScenario ? visibleScenario[hover]?.endCash ?? null : null;
  const tipDelta =
    tipBaseline !== null && tipScenario !== null ? tipScenario - tipBaseline : null;

  return (
    <div className="rounded-card border border-hairline bg-surface p-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-medium text-foreground">Cash forecast</h3>
          {subtitle && (
            <p className="font-mono text-xs text-text-3 tabular-nums" style={{ marginTop: 4 }}>
              {subtitle}
            </p>
          )}
          {freshnessHeadline && (
            <p className="text-eyebrow" style={{ marginTop: 6 }}>
              {freshnessHeadline}
            </p>
          )}
          {freshnessCaveat && (
            <p className="text-xs text-text-3" style={{ marginTop: 2 }}>
              {freshnessCaveat}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-text-2">
          <span className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-block h-px w-4"
              style={{
                backgroundImage:
                  'repeating-linear-gradient(to right, currentColor 0 3px, transparent 3px 6px)',
                color: 'var(--text-2)',
              }}
            />
            baseline
          </span>
          {showScenario && (
            <span className="flex items-center gap-2">
              <span
                aria-hidden
                className="inline-block h-[2px] w-4 rounded-full"
                style={{ background: 'hsl(var(--accent))' }}
              />
              scenario
            </span>
          )}
        </div>
      </div>

      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="w-full h-[280px] cursor-crosshair"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          {/* Gridlines */}
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={padL}
                x2={W - padR}
                y1={y(t)}
                y2={y(t)}
                stroke="var(--hairline)"
                strokeDasharray={t === 0 ? '0' : '2 4'}
                strokeWidth={t === 0 ? 1 : 0.8}
                opacity={t === 0 ? 1 : 0.7}
              />
              <text
                x={padL - 8}
                y={y(t) + 4}
                textAnchor="end"
                style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fill: 'var(--text-3)' }}
              >
                {formatTick(t)}
              </text>
            </g>
          ))}

          {/* X labels */}
          {months.map((m, i) =>
            i % Math.max(1, Math.floor(months.length / 6)) === 0 || i === months.length - 1 ? (
              <text
                key={`xl-${i}`}
                x={x(i)}
                y={H - 12}
                textAnchor="middle"
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  fill: 'var(--text-3)',
                  letterSpacing: '0.05em',
                }}
              >
                {m}
              </text>
            ) : null,
          )}

          {/* Goal / runway markers */}
          {markers.map((mk, mi) => {
            if (mk.monthIndex < 0 || mk.monthIndex >= months.length) return null;
            const mx = x(mk.monthIndex);
            const isWarn = mk.kind === 'runwayDepleted';
            const stroke = isWarn ? 'var(--semantic-caution)' : 'hsl(var(--accent))';
            const label = isWarn ? 'RUNWAY DEPLETED' : (mk.kind === 'goalArrival' ? mk.goalName.toUpperCase() : '');
            const sub = isWarn ? 'baseline only' : (mk.kind === 'goalArrival' ? months[mk.monthIndex] : '');
            return (
              <g key={`marker-${mi}`} opacity={isWarn ? 0.55 : 0.9}>
                <line
                  x1={mx}
                  x2={mx}
                  y1={padT + 30}
                  y2={H - padB}
                  stroke={stroke}
                  strokeWidth={1}
                  strokeDasharray="2 4"
                />
                <circle cx={mx} cy={padT + 30} r={2.5} fill={stroke} />
                <text
                  x={mx}
                  y={padT + 14}
                  textAnchor={mk.monthIndex > months.length - 3 ? 'end' : 'middle'}
                  style={{
                    fontFamily: 'var(--font-ui)',
                    fontSize: 10,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    fill: stroke,
                    fontWeight: 500,
                  }}
                >
                  {label}
                </text>
                <text
                  x={mx}
                  y={padT + 26}
                  textAnchor={mk.monthIndex > months.length - 3 ? 'end' : 'middle'}
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 9.5,
                    fill: 'var(--text-3)',
                  }}
                >
                  {sub}
                </text>
              </g>
            );
          })}

          {/* Baseline line — dashed */}
          {baselinePath && (
            <path
              d={baselinePath}
              fill="none"
              stroke="var(--text-2)"
              strokeWidth={1.4}
              strokeDasharray="3 5"
              strokeLinecap="round"
              opacity={0.65}
            />
          )}

          {/* Scenario line — solid */}
          {showScenario && scenarioPath && (
            <path
              d={scenarioPath}
              fill="none"
              stroke="hsl(var(--accent))"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* "You are here" position dot at today */}
          {months.length > 0 && (() => {
            const tx0 = x(0);
            const ty0 = y(
              (showScenario ? visibleScenario[0]?.endCash : visibleBaseline[0]?.endCash) ?? 0,
            );
            return (
              <g pointerEvents="none">
                <circle cx={tx0} cy={ty0} r={7} fill="hsl(var(--accent))" opacity={0.18}>
                  <animate attributeName="r" values="5;10;5" dur="2.6s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.28;0.05;0.28" dur="2.6s" repeatCount="indefinite" />
                </circle>
                <circle cx={tx0} cy={ty0} r={3.5} fill="hsl(var(--accent))" />
                <circle cx={tx0} cy={ty0} r={1.5} fill="var(--bg)" />
              </g>
            );
          })()}

          {/* Hover crosshair + dots */}
          {hover !== null && (
            <>
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1={padT}
                y2={H - padB}
                stroke="var(--hairline-strong)"
                strokeWidth={1}
                strokeDasharray="2 3"
              />
              {tipBaseline !== null && (
                <circle cx={x(hover)} cy={y(tipBaseline)} r={3} fill="var(--text-2)" />
              )}
              {tipScenario !== null && (
                <circle cx={x(hover)} cy={y(tipScenario)} r={3.5} fill="hsl(var(--accent))" />
              )}
            </>
          )}
        </svg>

        {/* Tooltip */}
        {hover !== null && (
          <div
            className="absolute top-2 rounded-md border border-hairline bg-surface-elevated p-3 text-xs shadow-sm"
            style={{
              left: `${(x(hover) / W) * 100}%`,
              transform:
                x(hover) > W * 0.7 ? 'translateX(-110%)' : 'translateX(10%)',
              pointerEvents: 'none',
            }}
          >
            <div className="text-eyebrow mb-1">{months[hover]}</div>
            {tipBaseline !== null && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-text-3">baseline</span>
                <span className="font-mono tabular-nums text-text-2">
                  {formatCurrency(tipBaseline)}
                </span>
              </div>
            )}
            {tipScenario !== null && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-text-3">scenario</span>
                <span className="font-mono tabular-nums" style={{ color: 'hsl(var(--accent))' }}>
                  {formatCurrency(tipScenario)}
                </span>
              </div>
            )}
            {tipDelta !== null && (
              <div className="mt-1 flex items-center justify-between gap-3 border-t border-hairline pt-1">
                <span className="text-text-3">delta</span>
                <span className="font-mono tabular-nums" style={{ color: 'hsl(var(--accent))' }}>
                  {tipDelta >= 0 ? '+' : ''}
                  {formatCurrency(tipDelta)}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function buildTicks(lo: number, hi: number, count: number): number[] {
  if (hi === lo) return [lo];
  const step = (hi - lo) / (count - 1);
  return Array.from({ length: count }, (_, i) => roundNice(lo + i * step));
}

function roundNice(n: number): number {
  const abs = Math.abs(n);
  if (abs < 100) return Math.round(n / 10) * 10;
  if (abs < 1000) return Math.round(n / 100) * 100;
  return Math.round(n / 1000) * 1000;
}

function formatTick(t: number): string {
  if (t === 0) return '$0';
  const abs = Math.abs(t);
  if (abs >= 1000) return `${t < 0 ? '-' : ''}$${(abs / 1000).toFixed(0)}K`;
  return `${t < 0 ? '-' : ''}$${abs.toFixed(0)}`;
}
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors. Existing callers of `<ForecastChart>` (in `simulator-client.tsx`) will break — that's expected, T19 fixes them.

- [ ] **Step 3: Commit**

```bash
git add src/components/simulator/forecast-chart.tsx
git commit -m "feat(r3.5): T8 hand-rolled SVG ForecastChart with position dot + goal markers + range"
```

Note: builds may fail until T19 rewires the call site. That's fine — commit progresses.

---

## Task 9: `<ScenarioCards>` + `pickActiveCard` helper

**Files:**
- Create: `src/components/simulator/scenario-cards.tsx`
- Create: `src/components/simulator/scenario-cards.test.ts`
- Delete (at T24): `src/components/simulator/scenario-delta-cards.tsx`

- [ ] **Step 1: Write the failing tests**

`src/components/simulator/scenario-cards.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { pickActiveCard } from './scenario-cards';
import type { ScenarioOverrides } from '@/lib/forecast/types';

const empty: ScenarioOverrides = {};
const some: ScenarioOverrides = { lumpSums: [{ id: 'a', label: 'x', amount: -100, month: '2026-09' }] };

const scenarios = [
  { id: 's1', name: 'Trim recurring' },
  { id: 's2', name: 'Big buy' },
];

describe('pickActiveCard', () => {
  it("returns 'baseline' when no scenario selected AND no overrides", () => {
    expect(pickActiveCard(scenarios as never, null, empty)).toBe('baseline');
  });

  it('returns the selected scenario id when set', () => {
    expect(pickActiveCard(scenarios as never, 's1', empty)).toBe('s1');
  });

  it("returns 'unsaved' when overrides exist but no scenario selected", () => {
    expect(pickActiveCard(scenarios as never, null, some)).toBe('unsaved');
  });

  it("returns the selected scenario id even when overrides differ (dirty)", () => {
    expect(pickActiveCard(scenarios as never, 's1', some)).toBe('s1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/components/simulator/scenario-cards.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`src/components/simulator/scenario-cards.tsx`:

```typescript
'use client';

import type { Scenario } from '@/lib/db/schema';
import type {
  ScenarioOverrides,
  MonthlyProjection,
} from '@/lib/forecast/types';
import { cn, formatCurrency } from '@/lib/utils';

export type ActiveCardId = 'baseline' | 'unsaved' | string;

export function pickActiveCard(
  scenarios: Pick<Scenario, 'id' | 'name'>[],
  selectedScenarioId: string | null,
  liveOverrides: ScenarioOverrides,
): ActiveCardId {
  if (selectedScenarioId) return selectedScenarioId;
  const hasAny = Boolean(
    liveOverrides.categoryDeltas?.length ||
      liveOverrides.lumpSums?.length ||
      liveOverrides.recurringChanges?.length ||
      liveOverrides.skipRecurringInstances?.length ||
      liveOverrides.incomeDelta ||
      liveOverrides.hypotheticalGoals?.length ||
      liveOverrides.goalTargetEdits?.length,
  );
  return hasAny ? 'unsaved' : 'baseline';
}

type Props = {
  scenarios: Pick<Scenario, 'id' | 'name'>[];
  selectedScenarioId: string | null;
  liveOverrides: ScenarioOverrides;
  baselineEndCash: number;
  scenarioEndCash: number;
  baselineLabel: string;
  scenarioLabel: string | null;
  onSelect: (id: string | null) => void;
};

export function ScenarioCards({
  scenarios,
  selectedScenarioId,
  liveOverrides,
  baselineEndCash,
  scenarioEndCash,
  baselineLabel,
  scenarioLabel,
  onSelect,
}: Props) {
  const activeId = pickActiveCard(scenarios, selectedScenarioId, liveOverrides);
  const delta = scenarioEndCash - baselineEndCash;

  return (
    <div className="flex flex-wrap gap-4 md:flex-nowrap md:overflow-x-auto md:gap-6">
      <Card
        active={activeId === 'baseline'}
        accent="baseline"
        name="Baseline"
        deltaLabel={null}
        figure={baselineEndCash}
        meta={baselineLabel}
        onClick={() => onSelect(null)}
      />

      <Card
        active={activeId !== 'baseline'}
        accent="scenario"
        name={scenarioLabel ?? 'Current scenario'}
        deltaLabel={formatDelta(delta)}
        figure={scenarioEndCash}
        meta={describeOverrides(liveOverrides)}
        onClick={() => {/* current scenario already active */}}
      />

      {scenarios
        .filter((s) => s.id !== selectedScenarioId)
        .map((s) => (
          <Card
            key={s.id}
            active={false}
            accent="saved"
            name={s.name}
            deltaLabel={null}
            figure={null}
            meta="Saved scenario"
            onClick={() => onSelect(s.id)}
          />
        ))}
    </div>
  );
}

type CardProps = {
  active: boolean;
  accent: 'baseline' | 'scenario' | 'saved';
  name: string;
  deltaLabel: string | null;
  figure: number | null;
  meta: string;
  onClick: () => void;
};

function Card({ active, accent, name, deltaLabel, figure, meta, onClick }: CardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative min-w-[260px] flex-1 rounded-card border border-hairline bg-surface p-5 text-left transition-all hover:-translate-y-0.5',
        active && 'border-text-3 shadow-sm',
      )}
    >
      {active && (
        <span
          aria-hidden
          className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r"
          style={{
            background:
              accent === 'baseline'
                ? 'var(--text-2)'
                : 'hsl(var(--accent))',
          }}
        />
      )}
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 text-foreground">
          <span
            aria-hidden
            className={cn(
              'h-2 w-2 rounded-full',
              accent === 'baseline' ? 'bg-text-3' : '',
            )}
            style={{
              background:
                accent === 'baseline' ? 'var(--text-2)' : 'hsl(var(--accent))',
            }}
          />
          {name}
        </span>
        {deltaLabel && (
          <span
            className="font-mono tabular-nums text-xs"
            style={{
              color: deltaLabel.startsWith('+')
                ? 'hsl(var(--accent))'
                : 'var(--semantic-caution)',
            }}
          >
            {deltaLabel}
          </span>
        )}
      </div>
      {figure !== null && (
        <div className="font-mono text-2xl tabular-nums text-foreground" style={{ letterSpacing: '-0.02em' }}>
          {formatCurrency(figure)}
        </div>
      )}
      <div className="mt-2 text-xs text-text-3">{meta}</div>
    </button>
  );
}

function formatDelta(d: number): string {
  return d >= 0 ? `+${formatCurrency(d)}` : `${formatCurrency(d)}`;
}

function describeOverrides(o: ScenarioOverrides): string {
  const bits: string[] = [];
  if (o.incomeDelta) bits.push('income adj');
  if (o.lumpSums?.length) bits.push(`${o.lumpSums.length} lump sum${o.lumpSums.length === 1 ? '' : 's'}`);
  if (o.recurringChanges?.length) bits.push(`${o.recurringChanges.length} recurring change${o.recurringChanges.length === 1 ? '' : 's'}`);
  if (o.categoryDeltas?.length) bits.push(`${o.categoryDeltas.length} category adj`);
  if (o.hypotheticalGoals?.length) bits.push(`${o.hypotheticalGoals.length} hypothetical goal${o.hypotheticalGoals.length === 1 ? '' : 's'}`);
  if (o.goalTargetEdits?.length) bits.push(`${o.goalTargetEdits.length} goal edit`);
  if (bits.length === 0) return 'no overrides';
  return bits.join(' · ');
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/components/simulator/scenario-cards.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/simulator/scenario-cards.tsx src/components/simulator/scenario-cards.test.ts
git commit -m "feat(r3.5): T9 ScenarioCards + pickActiveCard helper"
```

---

## Task 10: `<GoalImpacts>` + `formatGoalImpact` helper

**Files:**
- Create: `src/components/simulator/goal-impacts.tsx`
- Create: `src/components/simulator/goal-impacts.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/components/simulator/goal-impacts.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { formatGoalImpact, sortGoalImpacts } from './goal-impacts';
import type { GoalImpact } from '@/lib/forecast/types';

const sample = (overrides: Partial<GoalImpact> = {}): GoalImpact => ({
  goalId: 'g1',
  name: 'Emergency Fund',
  baselineETA: '2027-09',
  scenarioETA: '2027-02',
  shiftMonths: -7,
  ...overrides,
});

describe('formatGoalImpact', () => {
  it('formats faster outcome', () => {
    expect(formatGoalImpact(sample())).toEqual({
      statusKey: 'faster',
      arrivalLabel: '2027 · 02',
      baselineLabel: '2027-09',
      deltaLabel: '− 7 months',
    });
  });

  it('formats slower outcome', () => {
    expect(formatGoalImpact(sample({ scenarioETA: '2027-11', shiftMonths: 2 }))).toEqual({
      statusKey: 'slower',
      arrivalLabel: '2027 · 11',
      baselineLabel: '2027-09',
      deltaLabel: '+ 2 months',
    });
  });

  it('formats same outcome', () => {
    expect(formatGoalImpact(sample({ scenarioETA: '2027-09', shiftMonths: 0 }))).toEqual({
      statusKey: 'same',
      arrivalLabel: '2027 · 09',
      baselineLabel: '2027-09',
      deltaLabel: 'same as baseline',
    });
  });

  it('handles null scenarioETA', () => {
    expect(formatGoalImpact(sample({ scenarioETA: null, shiftMonths: 0 }))).toMatchObject({
      statusKey: 'same',
      arrivalLabel: 'never',
    });
  });

  it('handles null baselineETA', () => {
    expect(formatGoalImpact(sample({ baselineETA: null, shiftMonths: -3 }))).toMatchObject({
      baselineLabel: 'never',
    });
  });
});

describe('sortGoalImpacts', () => {
  it('orders by abs(shiftMonths) descending, then name', () => {
    const impacts: GoalImpact[] = [
      sample({ goalId: 'a', name: 'A', shiftMonths: -1 }),
      sample({ goalId: 'b', name: 'B', shiftMonths: -7 }),
      sample({ goalId: 'c', name: 'C', shiftMonths: 0 }),
    ];
    const sorted = sortGoalImpacts(impacts);
    expect(sorted.map((i) => i.goalId)).toEqual(['b', 'a', 'c']);
  });

  it('sorts ties by name ascending', () => {
    const impacts: GoalImpact[] = [
      sample({ goalId: 'z', name: 'Zebra', shiftMonths: 0 }),
      sample({ goalId: 'a', name: 'Apple', shiftMonths: 0 }),
    ];
    const sorted = sortGoalImpacts(impacts);
    expect(sorted.map((i) => i.goalId)).toEqual(['a', 'z']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/components/simulator/goal-impacts.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`src/components/simulator/goal-impacts.tsx`:

```typescript
'use client';

import type { GoalImpact } from '@/lib/forecast/types';
import { cn } from '@/lib/utils';

export type FormattedGoalImpact = {
  statusKey: 'faster' | 'same' | 'slower';
  arrivalLabel: string;
  baselineLabel: string;
  deltaLabel: string;
};

export function formatGoalImpact(impact: GoalImpact): FormattedGoalImpact {
  const statusKey: FormattedGoalImpact['statusKey'] =
    impact.shiftMonths < 0 ? 'faster' : impact.shiftMonths > 0 ? 'slower' : 'same';
  const arrivalLabel =
    impact.scenarioETA === null ? 'never' : formatEra(impact.scenarioETA);
  const baselineLabel =
    impact.baselineETA === null ? 'never' : impact.baselineETA;
  const deltaLabel =
    impact.shiftMonths === 0
      ? 'same as baseline'
      : `${impact.shiftMonths < 0 ? '−' : '+'} ${Math.abs(impact.shiftMonths)} month${Math.abs(impact.shiftMonths) === 1 ? '' : 's'}`;
  return { statusKey, arrivalLabel, baselineLabel, deltaLabel };
}

function formatEra(yyyymm: string): string {
  const [y, m] = yyyymm.split('-');
  return `${y} · ${m}`;
}

export function sortGoalImpacts(impacts: GoalImpact[]): GoalImpact[] {
  return [...impacts].sort((a, b) => {
    const ad = Math.abs(a.shiftMonths);
    const bd = Math.abs(b.shiftMonths);
    if (ad !== bd) return bd - ad;
    return a.name.localeCompare(b.name);
  });
}

const CAP_DEFAULT = 4;

type Props = {
  goalImpacts: GoalImpact[];
};

export function GoalImpacts({ goalImpacts }: Props) {
  if (goalImpacts.length === 0) return null;

  const sorted = sortGoalImpacts(goalImpacts);
  const visible = sorted.slice(0, CAP_DEFAULT);
  const overflow = sorted.length - visible.length;

  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-base font-medium text-foreground">Goal impacts</h3>
        <span className="text-xs text-text-3">vs baseline projection</span>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {visible.map((impact) => (
          <GoalImpactCard key={impact.goalId} impact={impact} />
        ))}
      </div>
      {overflow > 0 && (
        <p className="mt-3 text-xs text-text-3">
          {overflow} more goal{overflow === 1 ? '' : 's'} affected — view all coming soon.
        </p>
      )}
    </section>
  );
}

function GoalImpactCard({ impact }: { impact: GoalImpact }) {
  const f = formatGoalImpact(impact);
  return (
    <div className="rounded-card border border-hairline bg-surface p-5">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="text-foreground">{impact.name}</span>
        <Pill statusKey={f.statusKey} />
      </div>
      <div className="font-mono text-xl tabular-nums text-foreground" style={{ letterSpacing: '-0.02em' }}>
        {f.arrivalLabel}
      </div>
      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="text-text-3">from {f.baselineLabel}</span>
        <span
          className="font-mono tabular-nums"
          style={{
            color:
              f.statusKey === 'faster'
                ? 'hsl(var(--accent))'
                : f.statusKey === 'slower'
                ? 'var(--semantic-caution)'
                : 'var(--text-3)',
          }}
        >
          {f.deltaLabel}
        </span>
      </div>
    </div>
  );
}

function Pill({ statusKey }: { statusKey: FormattedGoalImpact['statusKey'] }) {
  const label = statusKey === 'faster' ? 'faster' : statusKey === 'slower' ? 'slower' : 'same';
  const color =
    statusKey === 'faster'
      ? 'hsl(var(--accent))'
      : statusKey === 'slower'
      ? 'var(--semantic-caution)'
      : 'var(--text-3)';
  return (
    <span
      className={cn(
        'rounded-full border px-2 py-0.5 text-xs',
      )}
      style={{ color, borderColor: color }}
    >
      {label}
    </span>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/components/simulator/goal-impacts.test.ts
```

Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/simulator/goal-impacts.tsx src/components/simulator/goal-impacts.test.ts
git commit -m "feat(r3.5): T10 GoalImpacts cards + formatGoalImpact + sortGoalImpacts helpers"
```

---

## Task 11: `<ScenarioPicker>` shrink to "Load…" dropdown

**Files:**
- Modify: `src/components/simulator/scenario-picker.tsx`

**Context:** Currently a 100-line picker. Reduce to a compact "Load…" button that opens a dropdown listing all saved scenarios with the active one marked.

- [ ] **Step 1: Read the current file** (skip; just rewrite)

- [ ] **Step 2: Replace the file**

`src/components/simulator/scenario-picker.tsx`:

```typescript
'use client';

import { useState, useRef, useEffect } from 'react';
import type { Scenario } from '@/lib/db/schema';
import { cn } from '@/lib/utils';

type Props = {
  scenarios: Pick<Scenario, 'id' | 'name'>[];
  selectedScenarioId: string | null;
  onSelect: (id: string | null) => void;
};

export function ScenarioPicker({ scenarios, selectedScenarioId, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  if (scenarios.length === 0) return null;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 rounded-btn border border-hairline px-3 py-1.5 text-sm text-text-2 hover:text-foreground hover:border-text-3"
      >
        Load…
        <span aria-hidden className="text-xs">▾</span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 w-56 rounded-card border border-hairline bg-surface-elevated p-1 shadow-sm"
        >
          <button
            role="menuitem"
            onClick={() => { onSelect(null); setOpen(false); }}
            className={cn(
              'block w-full rounded px-3 py-1.5 text-left text-sm hover:bg-bg-2',
              selectedScenarioId === null && 'text-foreground',
              selectedScenarioId !== null && 'text-text-2',
            )}
          >
            Baseline
          </button>
          {scenarios.map((s) => (
            <button
              key={s.id}
              role="menuitem"
              onClick={() => { onSelect(s.id); setOpen(false); }}
              className={cn(
                'block w-full rounded px-3 py-1.5 text-left text-sm hover:bg-bg-2',
                selectedScenarioId === s.id ? 'text-foreground' : 'text-text-2',
              )}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck
```

Expected: clean. Existing callers (ScenarioHeader, MobileScenarioSaveBar) may break — T12 + T22 fix them.

- [ ] **Step 4: Commit**

```bash
git add src/components/simulator/scenario-picker.tsx
git commit -m "feat(r3.5): T11 ScenarioPicker shrinks to 'Load…' dropdown"
```

---

## Task 12: `<ScenarioHeader>` restyle + layout change

**Files:**
- Modify (full rewrite): `src/components/simulator/scenario-header.tsx`

**Context:** Mockup layout is page eyebrow "Plan" + title "Simulator" + right-cluster `[Reset]` + `[Load…]` + `[Save as…]` + conditional `[Save]` + conditional `[Delete]`. Adopts new tokens. The Reset button gets a confirmation dialog when `isDirty`.

- [ ] **Step 1: Replace the file**

`src/components/simulator/scenario-header.tsx`:

```typescript
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Scenario } from '@/lib/db/schema';
import type { ScenarioOverrides } from '@/lib/forecast/types';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  createScenarioAction,
  updateScenarioAction,
  deleteScenarioAction,
} from '@/lib/forecast/scenario-actions';
import { ScenarioPicker } from './scenario-picker';
import { toast } from 'sonner';

type Props = {
  scenarios: Pick<Scenario, 'id' | 'name'>[];
  selectedScenarioId: string | null;
  liveOverrides: ScenarioOverrides;
  isDirty: boolean;
  onSelect: (id: string | null) => void;
  onReset: () => void;
};

export function ScenarioHeader({
  scenarios,
  selectedScenarioId,
  liveOverrides,
  isDirty,
  onSelect,
  onReset,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saveAsName, setSaveAsName] = useState('');
  const [saveAsOpen, setSaveAsOpen] = useState(false);

  const saveCurrent = () => {
    if (!selectedScenarioId) return;
    startTransition(async () => {
      try {
        await updateScenarioAction(selectedScenarioId, { overrides: liveOverrides });
        toast.success('Scenario saved');
        router.refresh();
      } catch (e) {
        toast.error('Save failed');
      }
    });
  };

  const saveAs = () => {
    const name = saveAsName.trim();
    if (!name) return;
    startTransition(async () => {
      try {
        const created = await createScenarioAction({ name, overrides: liveOverrides });
        toast.success(`Saved "${name}"`);
        setSaveAsOpen(false);
        setSaveAsName('');
        onSelect(created.id);
        router.refresh();
      } catch (e) {
        toast.error('Save failed');
      }
    });
  };

  const deleteCurrent = () => {
    if (!selectedScenarioId) return;
    startTransition(async () => {
      try {
        await deleteScenarioAction(selectedScenarioId);
        toast.success('Scenario deleted');
        onSelect(null);
        router.refresh();
      } catch (e) {
        toast.error('Delete failed');
      }
    });
  };

  return (
    <header className="mb-6 flex items-start justify-between gap-4">
      <div>
        <p className="text-eyebrow">Plan</p>
        <h1
          className="mt-1 font-display italic text-3xl text-foreground md:text-4xl"
          style={{ letterSpacing: '-0.02em' }}
        >
          Simulator
        </h1>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {isDirty ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm">Reset</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Discard changes?</AlertDialogTitle>
                <AlertDialogDescription>
                  Your unsaved overrides will be removed. The loaded scenario stays selected.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onReset}>Discard</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          <Button variant="ghost" size="sm" onClick={onReset} disabled={!isDirty}>Reset</Button>
        )}

        <ScenarioPicker
          scenarios={scenarios}
          selectedScenarioId={selectedScenarioId}
          onSelect={onSelect}
        />

        <AlertDialog open={saveAsOpen} onOpenChange={setSaveAsOpen}>
          <AlertDialogTrigger asChild>
            <Button variant="default" size="sm" disabled={pending}>Save as…</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Save scenario</AlertDialogTitle>
              <AlertDialogDescription>Name this what-if so you can return to it.</AlertDialogDescription>
            </AlertDialogHeader>
            <div className="my-2">
              <input
                className="w-full rounded-btn border border-hairline bg-surface px-3 py-2 text-sm"
                placeholder="e.g. Trim recurring"
                value={saveAsName}
                onChange={(e) => setSaveAsName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') saveAs(); }}
                autoFocus
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={saveAs} disabled={!saveAsName.trim() || pending}>Save</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {selectedScenarioId && isDirty && (
          <Button variant="default" size="sm" onClick={saveCurrent} disabled={pending}>Save</Button>
        )}

        {selectedScenarioId && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" disabled={pending}>Delete</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete scenario?</AlertDialogTitle>
                <AlertDialogDescription>
                  This removes the saved scenario but keeps your current overrides in the editor as unsaved work.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={deleteCurrent}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/simulator/scenario-header.tsx
git commit -m "feat(r3.5): T12 ScenarioHeader restyle + Reset confirmation dialog"
```

---

## Task 13: `<MovesGrid>` presentational

**Files:**
- Create: `src/components/simulator/moves/moves-grid.tsx`

- [ ] **Step 1: Write the implementation**

`src/components/simulator/moves/moves-grid.tsx`:

```typescript
'use client';

import { MOVE_TEMPLATES, type MoveTemplateId } from '@/lib/simulator/moves/templates';
import { cn } from '@/lib/utils';

type Props = {
  onPick: (templateId: MoveTemplateId) => void;
  disabledTemplates?: ReadonlySet<MoveTemplateId>;
};

export function MovesGrid({ onPick, disabledTemplates }: Props) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {MOVE_TEMPLATES.map((t) => {
        const Icon = t.icon;
        const disabled = disabledTemplates?.has(t.id) ?? false;
        return (
          <button
            key={t.id}
            type="button"
            disabled={disabled}
            onClick={() => onPick(t.id)}
            className={cn(
              'group flex items-center gap-3 rounded-card border border-hairline bg-surface p-4 text-left transition-all',
              disabled
                ? 'cursor-not-allowed opacity-50'
                : 'hover:-translate-y-0.5 hover:border-text-3',
            )}
            title={disabled ? 'Connect accounts first — needs at least one recurring charge.' : undefined}
          >
            <span
              aria-hidden
              className="flex h-10 w-10 items-center justify-center rounded-card border border-hairline bg-bg-2 text-text-2"
            >
              <Icon size={18} />
            </span>
            <span>
              <span className="block text-sm text-foreground">{t.title}</span>
              <span className="block text-xs text-text-3">{t.description}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/simulator/moves/moves-grid.tsx
git commit -m "feat(r3.5): T13 MovesGrid presentational 4x2 template grid"
```

---

## Task 14: `<MoveTemplateForm>` config-driven renderer

**Files:**
- Create: `src/components/simulator/moves/move-template-form.tsx`

**Context:** Renders the field schema of any MoveTemplate. One renderer handles all 8 templates by dispatching on each field's `kind`.

- [ ] **Step 1: Write the implementation**

`src/components/simulator/moves/move-template-form.tsx`:

```typescript
'use client';

import { useMemo, useState } from 'react';
import type { MoveTemplate, MoveFieldKind } from '@/lib/simulator/moves/templates';

type Props = {
  template: MoveTemplate;
  currentMonth: string;
  availableMonths: string[];
  recurringStreams: Array<{ id: string; label: string; direction: 'inflow' | 'outflow' }>;
  conflictMessage: string | null;
  onSubmit: (values: Record<string, unknown>) => void;
  onCancel: () => void;
};

export function MoveTemplateForm({
  template,
  currentMonth,
  availableMonths,
  recurringStreams,
  conflictMessage,
  onSubmit,
  onCancel,
}: Props) {
  const [values, setValues] = useState<Record<string, unknown>>(() => seedDefaults(template, currentMonth));
  const [submitting, setSubmitting] = useState(false);

  const errors = useMemo(
    () => template.validator(values, currentMonth),
    [template, values, currentMonth],
  );
  const hasErrors = Object.values(errors).some((e) => e !== null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (hasErrors) return;
    setSubmitting(true);
    onSubmit(values);
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-1">
      {conflictMessage && (
        <div className="rounded-btn border border-hairline bg-bg-2 p-3 text-xs text-text-2">
          ⚠ {conflictMessage}
        </div>
      )}

      {Object.entries(template.fields).map(([key, field]) => (
        <Field
          key={key}
          name={key}
          field={field}
          value={values[key]}
          error={errors[key]}
          availableMonths={availableMonths}
          recurringStreams={recurringStreams}
          onChange={(v) => setValues((p) => ({ ...p, [key]: v }))}
        />
      ))}

      <div className="mt-2 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-btn border border-hairline px-3 py-1.5 text-sm text-text-2 hover:text-foreground"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={hasErrors || submitting}
          className="rounded-btn border border-hairline bg-foreground px-3 py-1.5 text-sm text-bg disabled:opacity-50"
        >
          Apply
        </button>
      </div>
    </form>
  );
}

function seedDefaults(template: MoveTemplate, currentMonth: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(template.fields)) {
    if (field.kind === 'month') out[key] = currentMonth;
    else if (field.kind === 'currency') out[key] = 0;
    else if (field.kind === 'integerMonths') out[key] = 3;
    else if (field.kind === 'streamPicker') out[key] = '';
    else if (field.kind === 'text') out[key] = '';
    else if (field.kind === 'directionToggle') out[key] = 'outflow';
  }
  return out;
}

type FieldProps = {
  name: string;
  field: MoveFieldKind;
  value: unknown;
  error: string | null;
  availableMonths: string[];
  recurringStreams: Array<{ id: string; label: string; direction: 'inflow' | 'outflow' }>;
  onChange: (v: unknown) => void;
};

function Field({ name, field, value, error, availableMonths, recurringStreams, onChange }: FieldProps) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-eyebrow">{field.label}</span>
      {field.kind === 'month' && (
        <select
          value={value as string}
          onChange={(e) => onChange(e.target.value)}
          className="rounded-btn border border-hairline bg-surface px-3 py-2 text-sm"
        >
          {availableMonths.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      )}
      {field.kind === 'currency' && (
        <input
          type="number"
          inputMode="decimal"
          value={value as number}
          onChange={(e) => onChange(Number(e.target.value))}
          className="rounded-btn border border-hairline bg-surface px-3 py-2 text-sm font-mono tabular-nums"
        />
      )}
      {field.kind === 'integerMonths' && (
        <input
          type="number"
          inputMode="numeric"
          value={value as number}
          onChange={(e) => onChange(parseInt(e.target.value, 10))}
          className="rounded-btn border border-hairline bg-surface px-3 py-2 text-sm font-mono tabular-nums"
        />
      )}
      {field.kind === 'text' && (
        <input
          type="text"
          value={value as string}
          onChange={(e) => onChange(e.target.value)}
          className="rounded-btn border border-hairline bg-surface px-3 py-2 text-sm"
        />
      )}
      {field.kind === 'directionToggle' && (
        <div className="inline-flex rounded-btn border border-hairline">
          {(['outflow', 'inflow'] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => onChange(d)}
              className={`px-3 py-1.5 text-sm ${value === d ? 'bg-foreground text-bg' : 'text-text-2'}`}
            >
              {d === 'outflow' ? 'Outflow' : 'Inflow'}
            </button>
          ))}
        </div>
      )}
      {field.kind === 'streamPicker' && (
        <select
          value={value as string}
          onChange={(e) => onChange(e.target.value)}
          className="rounded-btn border border-hairline bg-surface px-3 py-2 text-sm"
        >
          <option value="">Select…</option>
          {recurringStreams
            .filter((s) => !field.direction || s.direction === field.direction)
            .map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
        </select>
      )}
      {('helpText' in field) && field.helpText && !error && (
        <span className="text-xs text-text-3">{field.helpText}</span>
      )}
      {error && <span className="text-xs" style={{ color: 'var(--semantic-caution)' }}>{error}</span>}
    </label>
  );
}
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/simulator/moves/move-template-form.tsx
git commit -m "feat(r3.5): T14 MoveTemplateForm config-driven field renderer"
```

---

## Task 15: `<MoveTemplateDrawer>` vaul wrapper

**Files:**
- Create: `src/components/simulator/moves/move-template-drawer.tsx`

- [ ] **Step 1: Write the implementation**

`src/components/simulator/moves/move-template-drawer.tsx`:

```typescript
'use client';

import { Drawer } from 'vaul';
import type { ScenarioOverrides, ForecastHistory } from '@/lib/forecast/types';
import { findTemplate, type MoveTemplateId } from '@/lib/simulator/moves/templates';
import { MoveTemplateForm } from './move-template-form';

type Props = {
  activeTemplateId: MoveTemplateId | null;
  history: ForecastHistory;
  liveOverrides: ScenarioOverrides;
  currentMonth: string;
  availableMonths: string[];
  onSubmit: (templateId: MoveTemplateId, values: Record<string, unknown>) => void;
  onClose: () => void;
};

export function MoveTemplateDrawer({
  activeTemplateId,
  history,
  liveOverrides,
  currentMonth,
  availableMonths,
  onSubmit,
  onClose,
}: Props) {
  const template = activeTemplateId ? findTemplate(activeTemplateId) : null;
  const open = Boolean(template);

  if (!template) return null;

  const conflictMessage = template.conflictsWith?.(liveOverrides) ?? null;

  return (
    <Drawer.Root
      open={open}
      onOpenChange={(v) => { if (!v) onClose(); }}
      direction="right"
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
        <Drawer.Content className="fixed right-0 top-0 z-50 flex h-full w-full flex-col bg-surface-elevated p-6 md:w-[420px]">
          <Drawer.Title className="mb-1 text-base font-medium text-foreground">
            {template.title}
          </Drawer.Title>
          <p className="mb-4 text-xs text-text-3">{template.description}</p>
          <MoveTemplateForm
            template={template}
            currentMonth={currentMonth}
            availableMonths={availableMonths}
            recurringStreams={history.recurringStreams.map((s) => ({
              id: s.id,
              label: s.label,
              direction: s.direction,
            }))}
            conflictMessage={conflictMessage}
            onSubmit={(values) => onSubmit(template.id, values)}
            onCancel={onClose}
          />
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/simulator/moves/move-template-drawer.tsx
git commit -m "feat(r3.5): T15 MoveTemplateDrawer vaul wrapper"
```

---

## Task 16: `<EmptyStateCard>`

**Files:**
- Create: `src/components/simulator/empty-state-card.tsx`

- [ ] **Step 1: Write the implementation**

`src/components/simulator/empty-state-card.tsx`:

```typescript
'use client';

import { Plus } from 'lucide-react';
import { FootholdMark } from '@/components/brand/foothold-mark';
import { ContourBackdrop } from '@/components/brand/contour-backdrop';

type Props = {
  onPickMove: () => void;
};

export function EmptyStateCard({ onPickMove }: Props) {
  return (
    <div className="relative overflow-hidden rounded-card border border-hairline bg-surface p-10 text-center">
      <div className="pointer-events-none absolute inset-0 opacity-60" style={{ color: 'hsl(var(--accent))' }}>
        <ContourBackdrop strokeWidth={0.7} density={6} opacity={0.5} />
      </div>
      <div className="relative">
        <div className="mb-3 flex justify-center text-foreground">
          <FootholdMark size={48} />
        </div>
        <h3
          className="font-display italic text-2xl text-foreground"
          style={{ letterSpacing: '-0.02em' }}
        >
          Start with where you stand.
        </h3>
        <p className="mx-auto mt-3 max-w-md text-sm text-text-2">
          The baseline shows your trajectory if nothing changes for the next 12 months. Add a Move to see how a single decision shifts the line.
        </p>
        <button
          type="button"
          onClick={onPickMove}
          className="mt-5 inline-flex items-center gap-2 rounded-btn border border-hairline bg-foreground px-4 py-2 text-sm text-bg hover:opacity-90"
        >
          <Plus size={14} />
          Pick a Move
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify `<FootholdMark>` + `<ContourBackdrop>` paths**

```bash
ls src/components/brand/ 2>&1
```

Expected: `foothold-mark.tsx` and `contour-backdrop.tsx` both exist (from R.1 foundation). If paths differ, adjust imports in Step 1.

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/simulator/empty-state-card.tsx
git commit -m "feat(r3.5): T16 EmptyStateCard with ContourBackdrop + FootholdMark"
```

---

## Task 17: `<ChartRangeTabs>`

**Files:**
- Create: `src/components/simulator/chart-range-tabs.tsx`

- [ ] **Step 1: Write the implementation**

`src/components/simulator/chart-range-tabs.tsx`:

```typescript
'use client';

import type { RangeParam } from '@/lib/simulator/url-state';
import { cn } from '@/lib/utils';

type Props = {
  range: RangeParam;
  onChange: (r: RangeParam) => void;
};

const RANGES: RangeParam[] = ['1Y', '2Y'];

export function ChartRangeTabs({ range, onChange }: Props) {
  return (
    <div className="inline-flex rounded-pill border border-hairline">
      {RANGES.map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => onChange(r)}
          className={cn(
            'rounded-pill px-3 py-1 text-xs',
            r === range
              ? 'bg-foreground text-bg'
              : 'text-text-2 hover:text-foreground',
          )}
        >
          {r}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/simulator/chart-range-tabs.tsx
git commit -m "feat(r3.5): T17 ChartRangeTabs 1Y/2Y toggle"
```

---

## Task 18: `<SimulatorTabs>`

**Files:**
- Create: `src/components/simulator/simulator-tabs.tsx`

- [ ] **Step 1: Write the implementation**

`src/components/simulator/simulator-tabs.tsx`:

```typescript
'use client';

import type { ViewParam } from '@/lib/simulator/url-state';
import { cn } from '@/lib/utils';

type Props = {
  view: ViewParam;
  onChange: (v: ViewParam) => void;
};

const TABS: { value: ViewParam; label: string }[] = [
  { value: 'empty', label: 'Empty' },
  { value: 'moves', label: 'Moves' },
  { value: 'comparison', label: 'Comparison' },
];

export function SimulatorTabs({ view, onChange }: Props) {
  return (
    <div className="mb-6 inline-flex gap-1 border-b border-hairline">
      {TABS.map((t) => {
        const active = t.value === view;
        return (
          <button
            key={t.value}
            type="button"
            onClick={() => onChange(t.value)}
            className={cn(
              'relative px-3 py-2 text-sm transition-colors',
              active ? 'text-foreground' : 'text-text-2 hover:text-foreground',
            )}
          >
            {active && (
              <span
                aria-hidden
                className="absolute left-3 top-1/2 -translate-y-1/2 -translate-x-3 h-1.5 w-1.5 rounded-full"
                style={{ background: 'hsl(var(--accent))' }}
              />
            )}
            <span className={cn(active && 'pl-3')}>{t.label}</span>
            {active && (
              <span
                aria-hidden
                className="absolute -bottom-px left-0 right-0 h-[2px]"
                style={{ background: 'hsl(var(--accent))' }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/simulator/simulator-tabs.tsx
git commit -m "feat(r3.5): T18 SimulatorTabs strip with active-state position dot"
```

---

## Task 19: `<SimulatorClient>` rewrite — wiring everything together

**Files:**
- Modify (full rewrite): `src/app/(app)/simulator/simulator-client.tsx`

**Context:** This is the linchpin task. Wires the existing override editor (preserved structurally) + new tab system + URL state mirroring + Moves flow + new chart + scenario cards + goal impacts. Removes `<NarrativePanel>` + `<GoalDiffCards>` imports.

- [ ] **Step 1: Replace the file**

`src/app/(app)/simulator/simulator-client.tsx`:

```typescript
'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Scenario } from '@/lib/db/schema';
import { projectCash } from '@/lib/forecast/engine';
import type { FreshnessText } from '@/lib/format/freshness';
import type { ForecastHistory, ScenarioOverrides } from '@/lib/forecast/types';
import { buildSimulatorUrl, type RangeParam, type ViewParam } from '@/lib/simulator/url-state';
import { deriveChartMarkers } from '@/lib/simulator/markers';
import type { MoveTemplateId } from '@/lib/simulator/moves/templates';
import { findTemplate } from '@/lib/simulator/moves/templates';

import { ScenarioHeader } from '@/components/simulator/scenario-header';
import { SimulatorTabs } from '@/components/simulator/simulator-tabs';
import { OverrideSection } from '@/components/simulator/override-section';
import { CategoryOverrides } from '@/components/simulator/category-overrides';
import { LumpSumOverrides } from '@/components/simulator/lump-sum-overrides';
import { RecurringOverrides } from '@/components/simulator/recurring-overrides';
import { IncomeOverrides } from '@/components/simulator/income-overrides';
import { HypotheticalGoalOverrides } from '@/components/simulator/hypothetical-goal-overrides';
import { GoalTargetOverrides } from '@/components/simulator/goal-target-overrides';
import { SkipRecurringOverrides } from '@/components/simulator/skip-recurring-overrides';
import { ForecastChart } from '@/components/simulator/forecast-chart';
import { ChartRangeTabs } from '@/components/simulator/chart-range-tabs';
import { ScenarioCards } from '@/components/simulator/scenario-cards';
import { GoalImpacts } from '@/components/simulator/goal-impacts';
import { EmptyStateCard } from '@/components/simulator/empty-state-card';
import { MovesGrid } from '@/components/simulator/moves/moves-grid';
import { MoveTemplateDrawer } from '@/components/simulator/moves/move-template-drawer';
import { MobileScenarioSaveBar } from '@/components/simulator/mobile-scenario-save-bar';

type Props = {
  history: ForecastHistory;
  scenarios: Scenario[];
  currentMonth: string;
  initialScenario: Scenario | null;
  initialView: ViewParam;
  initialRange: RangeParam;
  freshness: FreshnessText;
};

export function SimulatorClient({
  history,
  scenarios,
  currentMonth,
  initialScenario,
  initialView,
  initialRange,
  freshness,
}: Props) {
  const router = useRouter();

  // State -----------------------------------------------------------------
  const [view, setViewState] = useState<ViewParam>(initialView);
  const [range, setRangeState] = useState<RangeParam>(initialRange);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(
    initialScenario?.id ?? null,
  );
  const [liveOverrides, setLiveOverrides] = useState<ScenarioOverrides>(
    (initialScenario?.overrides as ScenarioOverrides | undefined) ?? {},
  );
  const [openSections, setOpenSections] = useState<ReadonlySet<string>>(() => new Set());
  const [activeMoveTemplate, setActiveMoveTemplate] = useState<MoveTemplateId | null>(null);

  const selectedScenario = scenarios.find((s) => s.id === selectedScenarioId) ?? null;

  const isDirty = useMemo(() => {
    const saved = (selectedScenario?.overrides as ScenarioOverrides | undefined) ?? {};
    return JSON.stringify(saved) !== JSON.stringify(liveOverrides);
  }, [selectedScenario, liveOverrides]);

  const engineResult = useMemo(
    () => projectCash({ history, overrides: liveOverrides, currentMonth }),
    [history, liveOverrides, currentMonth],
  );

  const baselineResult = useMemo(
    () => projectCash({ history, overrides: {}, currentMonth }),
    [history, currentMonth],
  );

  const availableMonths = useMemo(
    () => engineResult.projection.map((m) => m.month),
    [engineResult],
  );

  const chartMarkers = useMemo(
    () =>
      deriveChartMarkers(
        baselineResult.projection,
        engineResult.projection,
        engineResult.goalImpacts,
        currentMonth,
        range,
      ),
    [baselineResult, engineResult, currentMonth, range],
  );

  const currentMonthlyIncome = useMemo(() => {
    const incomeHistory = history.incomeHistory ?? [];
    if (incomeHistory.length === 0) return 0;
    return incomeHistory.reduce((a, b) => a + b, 0) / incomeHistory.length;
  }, [history.incomeHistory]);

  // URL mirroring --------------------------------------------------------
  const pushUrl = useCallback(
    (next: { view?: ViewParam; range?: RangeParam; scenarioId?: string | null }) => {
      const url = buildSimulatorUrl({
        view: next.view ?? view,
        range: next.range ?? range,
        scenarioId: next.scenarioId === undefined ? selectedScenarioId : next.scenarioId,
      });
      router.push(url, { scroll: false });
    },
    [router, view, range, selectedScenarioId],
  );

  const setView = useCallback(
    (next: ViewParam) => {
      setViewState(next);
      pushUrl({ view: next });
      // Drawer closes when leaving Moves
      if (next !== 'moves') setActiveMoveTemplate(null);
    },
    [pushUrl],
  );

  const setRange = useCallback(
    (next: RangeParam) => {
      setRangeState(next);
      pushUrl({ range: next });
    },
    [pushUrl],
  );

  const handleSelectScenario = useCallback(
    (id: string | null) => {
      const scn = id ? scenarios.find((s) => s.id === id) : null;
      setSelectedScenarioId(id);
      setLiveOverrides((scn?.overrides as ScenarioOverrides | undefined) ?? {});
      pushUrl({ scenarioId: id });
    },
    [scenarios, pushUrl],
  );

  // Override accordion ---------------------------------------------------
  const toggleSection = useCallback((key: string) => {
    setOpenSections((prev) => {
      const isMobile =
        typeof window !== 'undefined' &&
        window.matchMedia('(max-width: 767px)').matches;
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        if (isMobile) next.clear();
        next.add(key);
      }
      return next;
    });
  }, []);

  // Move submit ----------------------------------------------------------
  const handleMoveSubmit = useCallback(
    (templateId: MoveTemplateId, values: Record<string, unknown>) => {
      const template = findTemplate(templateId);
      if (!template) return;
      // Inject derived current monthly income for job-loss applier
      const derived = templateId === 'jobLoss'
        ? { ...values, currentMonthlyIncome }
        : values;
      const next = template.applier(derived, liveOverrides);
      setLiveOverrides(next);
      setActiveMoveTemplate(null);
      setView('comparison');
      setOpenSections((prev) => new Set([...prev, template.targetSection]));
    },
    [liveOverrides, currentMonthlyIncome, setView],
  );

  // Reset ----------------------------------------------------------------
  const handleReset = useCallback(() => {
    const saved = (selectedScenario?.overrides as ScenarioOverrides | undefined) ?? {};
    setLiveOverrides(saved);
  }, [selectedScenario]);

  // Empty-data guard -----------------------------------------------------
  const hasNoData =
    history.currentCash === 0 &&
    history.recurringStreams.length === 0 &&
    Object.keys(history.categoryHistory).length === 0;

  if (hasNoData) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-8">
        <ScenarioHeader
          scenarios={scenarios}
          selectedScenarioId={selectedScenarioId}
          liveOverrides={liveOverrides}
          isDirty={isDirty}
          onSelect={handleSelectScenario}
          onReset={handleReset}
        />
        <div className="rounded-card border border-hairline bg-surface p-8 text-center">
          <h2 className="mb-2 text-lg font-medium text-foreground">No data yet</h2>
          <p className="mx-auto max-w-md text-sm text-text-2">
            The simulator forecasts forward from your synced transactions and recurring streams.
            Once Plaid finishes its first sync, the forecast will fill in here.
          </p>
        </div>
      </div>
    );
  }

  // Disable Pause/Cancel Moves when no recurring streams exist
  const disabledMoves = new Set<MoveTemplateId>();
  if (history.recurringStreams.length === 0) {
    disabledMoves.add('pauseRecurring');
    disabledMoves.add('cancelSub');
  }

  // Chart subtitle (12mo · 2027-05 projected -$X)
  const lastVisible = (range === '1Y' ? 11 : 23);
  const horizonProjected =
    engineResult.projection[lastVisible]?.endCash ?? engineResult.projection.at(-1)?.endCash ?? 0;
  const horizonMonth =
    engineResult.projection[lastVisible]?.month ?? engineResult.projection.at(-1)?.month ?? '';
  const subtitle = `${range === '1Y' ? '12' : '24'} months · ${horizonMonth} projected`;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 pb-24 sm:px-8 sm:py-8 md:pb-8">
      <ScenarioHeader
        scenarios={scenarios}
        selectedScenarioId={selectedScenarioId}
        liveOverrides={liveOverrides}
        isDirty={isDirty}
        onSelect={handleSelectScenario}
        onReset={handleReset}
      />

      <SimulatorTabs view={view} onChange={setView} />

      {view === 'empty' && (
        <div className="space-y-6">
          <ForecastChart
            baseline={baselineResult.projection}
            scenario={[]}
            markers={chartMarkers}
            range={range}
            showScenario={false}
            subtitle={subtitle}
            freshnessHeadline={freshness.headline}
            freshnessCaveat={freshness.caveat}
          />
          <EmptyStateCard onPickMove={() => setView('moves')} />
        </div>
      )}

      {view === 'moves' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-medium text-foreground">Pick a Move</h2>
              <p className="text-xs text-text-3">Each Move adds an override and re-runs the projection</p>
            </div>
            <button
              type="button"
              onClick={() => setView('empty')}
              className="text-xs text-text-2 hover:text-foreground"
            >
              Cancel ×
            </button>
          </div>
          <MovesGrid
            onPick={(id) => setActiveMoveTemplate(id)}
            disabledTemplates={disabledMoves}
          />
          <MoveTemplateDrawer
            activeTemplateId={activeMoveTemplate}
            history={history}
            liveOverrides={liveOverrides}
            currentMonth={currentMonth}
            availableMonths={availableMonths}
            onSubmit={handleMoveSubmit}
            onClose={() => setActiveMoveTemplate(null)}
          />
        </div>
      )}

      {view === 'comparison' && (
        <div className="space-y-8">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-[260px_1fr] md:gap-10">
            <div>
              <p className="text-eyebrow mb-3">Overrides</p>
              <OverrideSection
                label="Categories"
                count={liveOverrides.categoryDeltas?.length ?? 0}
                open={openSections.has('categories')}
                onToggle={() => toggleSection('categories')}
              >
                <CategoryOverrides
                  value={liveOverrides.categoryDeltas}
                  onChange={(next) => setLiveOverrides((o) => ({ ...o, categoryDeltas: next }))}
                  knownCategories={history.categories}
                />
              </OverrideSection>
              <OverrideSection
                label="Lump sums"
                count={liveOverrides.lumpSums?.length ?? 0}
                open={openSections.has('lumpSums')}
                onToggle={() => toggleSection('lumpSums')}
              >
                <LumpSumOverrides
                  value={liveOverrides.lumpSums}
                  onChange={(next) => setLiveOverrides((o) => ({ ...o, lumpSums: next }))}
                  availableMonths={availableMonths}
                />
              </OverrideSection>
              <OverrideSection
                label="Recurring"
                count={liveOverrides.recurringChanges?.length ?? 0}
                open={openSections.has('recurring')}
                onToggle={() => toggleSection('recurring')}
              >
                <RecurringOverrides
                  value={liveOverrides.recurringChanges}
                  onChange={(next) => setLiveOverrides((o) => ({ ...o, recurringChanges: next }))}
                  baseStreams={history.recurringStreams}
                />
              </OverrideSection>
              <OverrideSection
                label="Income"
                count={liveOverrides.incomeDelta ? 1 : 0}
                open={openSections.has('income')}
                onToggle={() => toggleSection('income')}
              >
                <IncomeOverrides
                  value={liveOverrides.incomeDelta}
                  onChange={(next) => setLiveOverrides((o) => ({ ...o, incomeDelta: next }))}
                  availableMonths={availableMonths}
                />
              </OverrideSection>
              <OverrideSection
                label="Hypothetical goals"
                count={liveOverrides.hypotheticalGoals?.length ?? 0}
                open={openSections.has('hypotheticalGoals')}
                onToggle={() => toggleSection('hypotheticalGoals')}
              >
                <HypotheticalGoalOverrides
                  value={liveOverrides.hypotheticalGoals}
                  onChange={(next) => setLiveOverrides((o) => ({ ...o, hypotheticalGoals: next }))}
                />
              </OverrideSection>
              <OverrideSection
                label="Existing goal edits"
                count={liveOverrides.goalTargetEdits?.length ?? 0}
                open={openSections.has('goalTargetEdits')}
                onToggle={() => toggleSection('goalTargetEdits')}
              >
                <GoalTargetOverrides
                  value={liveOverrides.goalTargetEdits}
                  onChange={(next) => setLiveOverrides((o) => ({ ...o, goalTargetEdits: next }))}
                  realGoals={history.goals}
                />
              </OverrideSection>
              <OverrideSection
                label="Skip recurring"
                count={liveOverrides.skipRecurringInstances?.length ?? 0}
                open={openSections.has('skipRecurring')}
                onToggle={() => toggleSection('skipRecurring')}
              >
                <SkipRecurringOverrides
                  value={liveOverrides.skipRecurringInstances}
                  onChange={(next) => setLiveOverrides((o) => ({ ...o, skipRecurringInstances: next }))}
                  baseStreams={history.recurringStreams}
                  availableMonths={availableMonths}
                />
              </OverrideSection>
            </div>

            <div className="space-y-6">
              <div className="flex items-center justify-end">
                <ChartRangeTabs range={range} onChange={setRange} />
              </div>
              <ForecastChart
                baseline={baselineResult.projection}
                scenario={engineResult.projection}
                markers={chartMarkers}
                range={range}
                showScenario={true}
                subtitle={subtitle}
                freshnessHeadline={freshness.headline}
                freshnessCaveat={freshness.caveat}
              />
              <ScenarioCards
                scenarios={scenarios}
                selectedScenarioId={selectedScenarioId}
                liveOverrides={liveOverrides}
                baselineEndCash={baselineResult.projection[lastVisible]?.endCash ?? 0}
                scenarioEndCash={horizonProjected}
                baselineLabel={`Projected ${horizonMonth} · no overrides`}
                scenarioLabel={selectedScenario?.name ?? null}
                onSelect={handleSelectScenario}
              />
              <GoalImpacts goalImpacts={engineResult.goalImpacts} />
            </div>
          </div>
        </div>
      )}

      {view === 'comparison' && (
        <MobileScenarioSaveBar
          scenarios={scenarios}
          selectedScenarioId={selectedScenarioId}
          liveOverrides={liveOverrides}
          isDirty={isDirty}
          onSelect={handleSelectScenario}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: probable errors from `page.tsx` (not yet updated) and `MobileScenarioSaveBar` (not yet aware of new props). T20 + T22 will fix these.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(app\)/simulator/simulator-client.tsx
git commit -m "feat(r3.5): T19 SimulatorClient rewrite — tabs + URL mirroring + Moves wiring"
```

---

## Task 20: `simulator/page.tsx` — URL parsing + freshness wiring

**Files:**
- Modify (full rewrite): `src/app/(app)/simulator/page.tsx`

- [ ] **Step 1: Replace the file**

`src/app/(app)/simulator/page.tsx`:

```typescript
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getForecastHistory } from '@/lib/db/queries/forecast';
import { listScenariosForUser } from '@/lib/db/queries/scenarios';
import { getSourceHealth } from '@/lib/db/queries/health';
import { formatFreshness } from '@/lib/format/freshness';
import {
  parseView,
  parseRange,
  parseScenario,
  defaultView,
} from '@/lib/simulator/url-state';
import { SimulatorClient } from './simulator-client';

export default async function SimulatorPage({
  searchParams,
}: {
  searchParams: Promise<{ scenario?: string; view?: string; range?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const userId = session.user.id;
  const [params, history, scenarios, sourceHealth] = await Promise.all([
    searchParams,
    getForecastHistory(userId),
    listScenariosForUser(userId),
    getSourceHealth(userId),
  ]);

  const now = new Date();
  const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

  const initialScenarioId = parseScenario(params.scenario, scenarios);
  const initialScenario = initialScenarioId
    ? scenarios.find((s) => s.id === initialScenarioId) ?? null
    : scenarios[0] ?? null;

  const initialView = parseView(params.view) ?? defaultView(scenarios, initialScenario);
  const initialRange = parseRange(params.range) ?? '1Y';

  const sources = sourceHealth.map((s) => ({
    name: s.institutionName,
    lastSyncAt: s.lastSuccessfulSyncAt,
  }));
  const freshness = formatFreshness({ sources, now });

  return (
    <SimulatorClient
      history={history}
      scenarios={scenarios}
      currentMonth={currentMonth}
      initialScenario={initialScenario}
      initialView={initialView}
      initialRange={initialRange}
      freshness={freshness}
    />
  );
}
```

- [ ] **Step 2: Verify `getSourceHealth` return shape**

```bash
grep -n "institutionName\|lastSuccessfulSyncAt" src/lib/db/queries/health.ts | head -5
```

Expected: both fields exist on the returned shape. If field names differ, adapt the `sources` mapping above.

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors (or only errors in T22 territory).

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/simulator/page.tsx
git commit -m "feat(r3.5): T20 page.tsx URL param parsing + freshness wiring via getSourceHealth"
```

---

## Task 21: Override editor + override-section token sweep

**Files:**
- Modify: `src/components/simulator/override-section.tsx`
- Modify: `src/components/simulator/category-overrides.tsx`
- Modify: `src/components/simulator/lump-sum-overrides.tsx`
- Modify: `src/components/simulator/recurring-overrides.tsx`
- Modify: `src/components/simulator/income-overrides.tsx`
- Modify: `src/components/simulator/hypothetical-goal-overrides.tsx`
- Modify: `src/components/simulator/goal-target-overrides.tsx`
- Modify: `src/components/simulator/skip-recurring-overrides.tsx`

**Context:** Token sweep — replace old surface/border/text classes with new Foothold tokens. No logic changes. Per CLAUDE.md > "Foothold Redesign" dual-token gotcha: complete-color tokens use `var(--text-3)` directly; HSL-fragment tokens use `hsl(var(--accent))` or Tailwind config names. The arbitrary-value `bg-[--accent]/12` syntax generates invalid CSS — avoid.

Substitution map for this task:

| Old | New |
|---|---|
| `bg-surface-elevated` | `bg-surface` (or `bg-surface-elevated` per Foothold tokens; align with neighboring R.3 component) |
| `border-border` | `border-hairline` |
| `text-muted-foreground` | `text-text-3` |
| `text-foreground` | `text-foreground` (unchanged — semantic) |
| `rounded-md` for cards | `rounded-card` |
| `rounded-md` for buttons | `rounded-btn` |
| Hardcoded amber/red for danger | `text-[var(--semantic-caution)]` (inline style) |

- [ ] **Step 1: For each file, open and apply substitutions**

For each of the 8 files listed above, perform a token sweep. As an illustrative pattern, for `category-overrides.tsx`:

```bash
# Inspect first
sed -n '1,40p' src/components/simulator/category-overrides.tsx
```

Apply substitutions: replace `bg-surface-elevated` → `bg-surface`, `border-border` → `border-hairline`, `text-muted-foreground` → `text-text-3`, `rounded-md` → `rounded-card` (cards) or `rounded-btn` (inputs/buttons).

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors (token classes are valid CSS).

- [ ] **Step 3: Run tests**

```bash
npm test 2>&1 | tail -5
```

Expected: all tests still pass (no logic changes).

- [ ] **Step 4: Commit**

```bash
git add src/components/simulator/override-section.tsx \
        src/components/simulator/category-overrides.tsx \
        src/components/simulator/lump-sum-overrides.tsx \
        src/components/simulator/recurring-overrides.tsx \
        src/components/simulator/income-overrides.tsx \
        src/components/simulator/hypothetical-goal-overrides.tsx \
        src/components/simulator/goal-target-overrides.tsx \
        src/components/simulator/skip-recurring-overrides.tsx
git commit -m "feat(r3.5): T21 override editor + override-section token sweep"
```

---

## Task 22: `<MobileScenarioSaveBar>` token sweep + visibility gate

**Files:**
- Modify: `src/components/simulator/mobile-scenario-save-bar.tsx`

**Context:** Restyle to new tokens. The component already renders only on mobile via CSS; from T19, the parent additionally only mounts it on `view === 'comparison'`. The internal state hooks stay the same.

- [ ] **Step 1: Open and apply same token substitutions as T21**

```bash
sed -n '1,80p' src/components/simulator/mobile-scenario-save-bar.tsx
```

Apply: `border-border` → `border-hairline`, `bg-surface-elevated` → `bg-surface-elevated` (the elevated variant is intended for the sticky overlay), `text-muted-foreground` → `text-text-3`.

- [ ] **Step 2: Update Props if ScenarioPicker call site shape changed**

The `MobileScenarioSaveBar` currently calls `<ScenarioPicker>`. After T11's shrink-to-dropdown, the `ScenarioPicker` is much smaller. Confirm the call site still works or replace with the inline picker behavior native to this bar.

- [ ] **Step 3: Run typecheck + tests**

```bash
npm run typecheck && npm test 2>&1 | tail -5
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/simulator/mobile-scenario-save-bar.tsx
git commit -m "feat(r3.5): T22 MobileScenarioSaveBar token sweep"
```

---

## Task 23: `/simulator/compare` restyle

**Files:**
- Modify: `src/app/(app)/simulator/compare/compare-client.tsx`
- Modify: `src/app/(app)/simulator/compare/page.tsx` (only if header layout needs Foothold-token application)

**Context:** Token sweep + swap to new `<ForecastChart>` for the side-by-side scenario comparison. IA unchanged: A vs B saved scenarios, query unchanged, URL params unchanged.

- [ ] **Step 1: Read compare-client.tsx structure**

```bash
sed -n '1,40p' src/app/\(app\)/simulator/compare/compare-client.tsx
```

- [ ] **Step 2: Apply token substitutions**

Same map as T21. Replace any direct Recharts import with `<ForecastChart>` if the compare layout still uses Recharts directly (otherwise the chart is already routed through `<ForecastChart>`, no swap needed).

- [ ] **Step 3: Adapt header + page eyebrow**

Mirror `<ScenarioHeader>`'s new layout pattern (page eyebrow "Plan" + Fraunces italic title "Compare scenarios").

- [ ] **Step 4: Run typecheck + tests**

```bash
npm run typecheck && npm test 2>&1 | tail -5
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/simulator/compare/
git commit -m "feat(r3.5): T23 /simulator/compare restyle to new tokens"
```

---

## Task 24: Delete obsolete components

**Files:**
- Delete: `src/components/simulator/narrative-panel.tsx`
- Delete: `src/components/simulator/goal-diff-cards.tsx`
- Delete: `src/components/simulator/goal-diff-matrix.tsx`
- Delete: `src/components/simulator/scenario-delta-cards.tsx`

- [ ] **Step 1: Confirm no remaining imports**

```bash
grep -rn "NarrativePanel\|GoalDiffCards\|GoalDiffMatrix\|ScenarioDeltaCards" src/ 2>&1 | grep -v "^Binary"
```

Expected: no matches. If anything matches, fix the import first (the only remaining consumer should be `simulator-client.tsx`, which T19 already cleaned).

- [ ] **Step 2: Delete the files**

```bash
git rm src/components/simulator/narrative-panel.tsx \
       src/components/simulator/goal-diff-cards.tsx \
       src/components/simulator/goal-diff-matrix.tsx \
       src/components/simulator/scenario-delta-cards.tsx
```

- [ ] **Step 3: Confirm backend narrative code survives**

```bash
grep -n "forecast_narrative\|generateNarrative" src/lib/forecast/scenario-actions.ts | head -5
```

Expected: still present. We're NOT touching backend.

- [ ] **Step 4: Run typecheck + build**

```bash
npm run typecheck && npm run build 2>&1 | tail -10
```

Expected: clean build, all 28+ routes compile.

- [ ] **Step 5: Commit**

```bash
git commit -m "chore(r3.5): T24 delete obsolete components (narrative-panel, goal-diff-cards, goal-diff-matrix, scenario-delta-cards)"
```

---

## Task 25: RSC boundary grep + final acceptance

**Files:** N/A (verification only)

- [ ] **Step 1: RSC boundary grep — explicit acceptance for strike-3 watch**

Per CLAUDE.md > "Don't pass functions across the server→client boundary in config props" — verify no server component passes a function-shaped prop to a client component.

```bash
# Pages that mount client components (server side)
grep -n "onSelect=\|onChange=\|onPick=\|onSubmit=\|render=" src/app/\(app\)/simulator/page.tsx src/app/\(app\)/simulator/compare/page.tsx 2>&1
```

Expected: no matches. Server pages only pass primitives + plain data.

- [ ] **Step 2: Run full vitest suite**

```bash
npm test 2>&1 | tail -5
```

Expected: `Tests  ~661 passed (~661)` — baseline (611 from T1) + ~50 from T3/T4/T5/T6/T9/T10.

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 4: Run prod build**

```bash
npm run build 2>&1 | tail -15
```

Expected: all routes compile, `/simulator` route size reported. No RSC serialization errors in build output.

- [ ] **Step 5: Push branch**

Before pushing, verify the branch (parallel-agent race protection):

```bash
git rev-parse --abbrev-ref HEAD && git push origin feat/redesign
```

Expected: `feat/redesign` + push succeeds.

- [ ] **Step 6: Capture commit count for handoff doc**

```bash
git log --oneline origin/feat/redesign | head -25 | grep "r3.5\|r3\.5"
```

Record: commit count for R.3.5 handoff doc.

---

## Self-review

After completing all tasks, run a final pass against the spec:

**Spec coverage checklist:**

- [ ] Locked decision #1 (Strict R.3.5 = visual + IA shell): T7 keeps Move templates as a presentation layer over existing override types; appliers in T5 emit existing `ScenarioOverrides` shape; no schema changes.
- [ ] Locked decision #2 (Guided template forms): T13 + T14 + T15 deliver MovesGrid + MoveTemplateForm + MoveTemplateDrawer with 8 templates.
- [ ] Locked decision #3 (Range tabs 1Y/2Y): T17 ChartRangeTabs + T8 chart slices projection + T20 URL parsing.
- [ ] Locked decision #4 (Narrative panel removed): T24 deletes NarrativePanel; T19 omits NarrativePanel import.
- [ ] Locked decision #5 (/simulator/compare swept): T23.
- [ ] Locked decision #6 (Scenario picker as Load… dropdown + ScenarioCards row): T11 + T9 + T12 wiring.
- [ ] Locked decision #7 (URL-state-driven tabs): T3 parsers + T19 mirroring + T20 server-side parsing.
- [ ] Empty/Moves/Comparison tab contents: T18 + T19 (tab strip + branches).
- [ ] Position dot pulse: T8 chart SVG.
- [ ] Goal markers (runwayDepleted + goalArrival): T4 deriveChartMarkers + T8 rendering.
- [ ] Scenario cards row with Baseline-first: T9.
- [ ] GoalImpacts cards (sort + cap + pill): T10.
- [ ] Reset confirmation dialog: T12.
- [ ] RSC boundary grep: T25 step 1.
- [ ] Freshness annotation via formatFreshness: T20 + T8 chart prop.
- [ ] hasNoData branch preserved: T19.
- [ ] Move conflict notice (incomeDelta): T7 + T14 (template config carries conflictsWith).

**Placeholder scan:**

- [ ] No "TODO", "TBD", "implement later" markers in any commit code.
- [ ] Every step that changes code has the actual code, not a description.
- [ ] No "similar to Task N" cross-references.

**Type consistency check:**

- [ ] `ScenarioOverrides` shape from `src/lib/forecast/types.ts:6` matches usage in T5 appliers + T7 templates + T9 ScenarioCards + T19 SimulatorClient.
- [ ] `MoveTemplate.applier` signature `(values, current) → next` matches usage in T15 drawer + T19 submit handler.
- [ ] `ViewParam` / `RangeParam` types from T3 url-state used consistently in T17, T18, T19, T20, T8.
- [ ] `ChartMarker` discriminated union from T4 used consistently in T8 chart render.
- [ ] `GoalImpact` type from `src/lib/forecast/types.ts:119` used in T4 markers + T10 GoalImpacts + T19 wiring.

**Out-of-scope items confirmed not touched:**

- [ ] `src/lib/forecast/engine.ts` — not modified
- [ ] `src/lib/forecast/scenario-actions.ts` — not modified
- [ ] `forecast_narrative` table — not modified (Drizzle schema untouched)
- [ ] Anthropic Haiku call sites — not removed from lib/
- [ ] Mobile rebuild deferred to R.5

---

## Notes

- **Test count target:** ~50 new tests (T3: 17, T4: 8, T5: 16, T6: 11, T9: 4, T10: 7). Baseline 611 → ~661.
- **Browser UAT:** deferred per R.3.4 pattern (auth-gated dev server). User to walk axes per spec § Testing strategy.
- **Strike-3 watch:** T25 step 1 is the acceptance gate. If strike 3 happens during execution, promote the lesson to architecture note + add a lint rule before continuing.
- **Dual-token gotcha (R.3.4 polish commits):** Use `hsl(var(--accent))` for HSL-fragment tokens; use `var(--text-3)` for complete-color tokens. NEVER use Tailwind arbitrary-value `bg-[--accent]/12` — emits invalid CSS.
