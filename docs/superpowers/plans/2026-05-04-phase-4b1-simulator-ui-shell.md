# Phase 4-B1: Simulator UI Shell — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the `/simulator` page on top of Plan A's engine. Override editor (7 collapsible sections), forecast chart (Recharts), goal diff cards. No AI narration yet — that's Plan B-2.

**Architecture:** Server component loads `getForecastHistory(userId)` + `listScenariosForUser(userId)`. Top-level client wrapper holds reactive state for the currently-edited overrides and recomputes `projectCash(input)` synchronously on every change (the engine is fast — sub-millisecond — so no debouncing needed). 7 override section components receive `(currentValue, onChange)` props. ScenarioHeader handles selector + Save via the existing `createScenario` / `updateScenario` server actions.

**Tech Stack:** Next.js 14 (App Router) · TypeScript · React 18 · Tailwind + shadcn/ui · Recharts · Plan A's `projectCash` engine + scenario CRUD actions.

**Spec reference:** `docs/superpowers/specs/2026-05-04-phase-4-predictive-layer-design.md` §6 (UI structure, balanced v3) and §1-§5 (engine context).

**Plan A foundation consumed:**
- `projectCash(input: ProjectCashInput) → ProjectionResult` from `src/lib/forecast/engine.ts`
- `getForecastHistory(userId) → Promise<ForecastHistory>` from `src/lib/db/queries/forecast.ts`
- `createScenario`, `updateScenario`, `deleteScenario` from `src/lib/forecast/scenario-actions.ts`
- `scenarioOverridesSchema`, `createScenarioInput`, `updateScenarioInput`, `deleteScenarioInput` from `src/lib/forecast/scenario-zod.ts`
- `Scenario`, `ScenarioOverrides`, `MonthlyProjection`, `GoalImpact` types from `src/lib/forecast/types.ts` and `src/lib/db/schema.ts`

---

## File Structure

```
src/lib/db/queries/scenarios.ts            CREATE  listScenariosForUser, getScenario (read-only)

src/app/(app)/simulator/
  ├─ page.tsx                              CREATE  server component; loads data; renders client wrapper
  └─ simulator-client.tsx                  CREATE  top-level client component; state + computation

src/components/simulator/
  ├─ scenario-header.tsx                   CREATE  title, dropdown selector, Save button, Reset link, ⋯ menu (with Delete)
  ├─ override-section.tsx                  CREATE  generic collapsible section primitive (accordion behavior)
  ├─ category-overrides.tsx                CREATE  categoryDeltas editor (add/remove/edit per-category $)
  ├─ lump-sum-overrides.tsx                CREATE  lumpSums editor (one-time events with month picker)
  ├─ recurring-overrides.tsx               CREATE  recurringChanges editor (pause existing / edit / add hypothetical)
  ├─ income-overrides.tsx                  CREATE  incomeDelta editor (single delta with optional bounds)
  ├─ hypothetical-goal-overrides.tsx       CREATE  hypotheticalGoals editor (add hypothetical savings goals)
  ├─ goal-target-overrides.tsx             CREATE  goalTargetEdits editor (modify existing real goals)
  ├─ skip-recurring-overrides.tsx          CREATE  skipRecurringInstances editor (skip a stream's specific month)
  ├─ forecast-chart.tsx                    CREATE  Recharts line chart: baseline + scenario lines
  └─ goal-diff-cards.tsx                   CREATE  2-col grid of GoalImpact cards with direction pills

src/lib/forecast/override-helpers.ts       CREATE  pure helpers for adding/removing items in override arrays
src/lib/forecast/override-helpers.test.ts  CREATE  vitest unit tests
```

Total: 14 creates + a few existing files referenced.

**Testing scope note:** UI components are verified manually via `npm run dev`. The project does not use React Testing Library. Pure-logic helpers (`override-helpers.ts`) get vitest unit tests. The engine itself is already 94 tests deep from Plan A; Plan B-1 inherits that coverage.

---

## Wave 1 — Foundation

### Task 1: Scenarios query module

**Files:**
- Create: `src/lib/db/queries/scenarios.ts`

No tests — DB-bound; verified via dev usage in later tasks.

- [ ] **Step 1: Read the existing pattern**

Run: `cat src/lib/db/queries/dashboard.ts | head -30`

Note: `import { db } from '@/lib/db'`, async functions take `userId`, return typed shapes via Drizzle `select(...)`, no throws on empty.

- [ ] **Step 2: Implement listScenariosForUser + getScenario**

```ts
// src/lib/db/queries/scenarios.ts
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { scenarios, type Scenario } from '@/lib/db/schema';

/**
 * List all scenarios owned by the user, most-recently-updated first.
 * Used by the /simulator page server component to populate the
 * scenario selector dropdown.
 */
export async function listScenariosForUser(userId: string): Promise<Scenario[]> {
  return db
    .select()
    .from(scenarios)
    .where(eq(scenarios.userId, userId))
    .orderBy(desc(scenarios.updatedAt));
}

/**
 * Load a single scenario by id, scoped to the user (so a malicious
 * id in the URL can't leak another user's scenario).
 * Returns null if not found OR not owned by this user.
 */
export async function getScenario(
  userId: string,
  scenarioId: string,
): Promise<Scenario | null> {
  const rows = await db
    .select()
    .from(scenarios)
    .where(and(eq(scenarios.id, scenarioId), eq(scenarios.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/queries/scenarios.ts
git commit -m "feat(scenarios): query module for list + get by id

Read-only: listScenariosForUser (most-recently-updated first) and
getScenario (user-scoped to prevent URL-id enumeration). Used by the
/simulator server component."
```

---

### Task 2: Override array helpers + tests

**Files:**
- Create: `src/lib/forecast/override-helpers.ts`
- Create: `src/lib/forecast/override-helpers.test.ts`

These are the small pure functions that mutate arrays inside `ScenarioOverrides` immutably. Used by every override section component to update its slice. Unit-tested because UI components consume them and a regression here is invisible until manual click-through.

- [ ] **Step 1: Write failing tests**

```ts
// src/lib/forecast/override-helpers.test.ts
import { describe, expect, it } from 'vitest';
import {
  addItem,
  removeItem,
  updateItem,
  setSingle,
  clearSingle,
} from './override-helpers';

describe('addItem', () => {
  it('appends an item to an undefined array (creates new array)', () => {
    const result = addItem<{ id: string }>(undefined, { id: 'a' });
    expect(result).toEqual([{ id: 'a' }]);
  });

  it('appends an item to an existing array', () => {
    const result = addItem([{ id: 'a' }], { id: 'b' });
    expect(result).toEqual([{ id: 'a' }, { id: 'b' }]);
  });

  it('does not mutate the input array', () => {
    const input = [{ id: 'a' }];
    addItem(input, { id: 'b' });
    expect(input).toEqual([{ id: 'a' }]);
  });
});

describe('removeItem', () => {
  it('returns undefined when removing the last item from a single-item array', () => {
    const result = removeItem([{ id: 'a' }], (i) => i.id === 'a');
    expect(result).toBeUndefined();
  });

  it('removes the matching item from a multi-item array', () => {
    const result = removeItem(
      [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      (i) => i.id === 'b',
    );
    expect(result).toEqual([{ id: 'a' }, { id: 'c' }]);
  });

  it('returns the same array when no item matches', () => {
    const input = [{ id: 'a' }];
    const result = removeItem(input, (i) => i.id === 'z');
    expect(result).toEqual([{ id: 'a' }]);
  });

  it('returns undefined for an undefined input', () => {
    const result = removeItem<{ id: string }>(undefined, () => true);
    expect(result).toBeUndefined();
  });
});

describe('updateItem', () => {
  it('updates the matching item with the partial patch', () => {
    const result = updateItem(
      [{ id: 'a', value: 1 }, { id: 'b', value: 2 }],
      (i) => i.id === 'b',
      { value: 99 },
    );
    expect(result).toEqual([{ id: 'a', value: 1 }, { id: 'b', value: 99 }]);
  });

  it('returns the same array when no item matches', () => {
    const input = [{ id: 'a', value: 1 }];
    const result = updateItem(input, (i) => i.id === 'z', { value: 99 });
    expect(result).toEqual([{ id: 'a', value: 1 }]);
  });

  it('returns undefined for an undefined input', () => {
    const result = updateItem<{ value: number }>(undefined, () => true, { value: 1 });
    expect(result).toBeUndefined();
  });

  it('does not mutate the input array', () => {
    const input = [{ id: 'a', value: 1 }];
    updateItem(input, (i) => i.id === 'a', { value: 99 });
    expect(input).toEqual([{ id: 'a', value: 1 }]);
  });
});

describe('setSingle / clearSingle', () => {
  it('setSingle returns the new value', () => {
    expect(setSingle({ x: 1 })).toEqual({ x: 1 });
  });

  it('clearSingle returns undefined', () => {
    expect(clearSingle()).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests, see them fail**

Run: `npm test -- override-helpers`
Expected: All FAIL with "is not a function".

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/forecast/override-helpers.ts
/**
 * Pure helpers for editing override arrays inside ScenarioOverrides.
 * Every helper:
 *   - Returns a NEW array/value (no mutation)
 *   - Treats `undefined` input as "no items yet"
 *   - Returns `undefined` (not an empty array) when removing the last item,
 *     so the override key gets stripped from the JSON payload entirely
 *
 * Used by the per-override-type editor components in
 * src/components/simulator/*-overrides.tsx.
 */

export function addItem<T>(arr: T[] | undefined, item: T): T[] {
  return [...(arr ?? []), item];
}

export function removeItem<T>(
  arr: T[] | undefined,
  match: (item: T) => boolean,
): T[] | undefined {
  if (!arr) return undefined;
  const next = arr.filter((i) => !match(i));
  if (next.length === 0) return undefined;
  return next;
}

export function updateItem<T>(
  arr: T[] | undefined,
  match: (item: T) => boolean,
  patch: Partial<T>,
): T[] | undefined {
  if (!arr) return undefined;
  return arr.map((i) => (match(i) ? { ...i, ...patch } : i));
}

export function setSingle<T>(value: T): T {
  return value;
}

export function clearSingle<T>(): T | undefined {
  return undefined;
}
```

- [ ] **Step 4: Run tests, all green**

Run: `npm test -- override-helpers`
Expected: All 13 tests PASS.

- [ ] **Step 5: Run full suite + typecheck**

Run: `npm test && npm run typecheck`
Expected: 107 total tests passing (94 from Plan A + 13 new). Typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/forecast/override-helpers.ts src/lib/forecast/override-helpers.test.ts
git commit -m "feat(forecast): pure helpers for override array editing

addItem / removeItem / updateItem / setSingle / clearSingle. Immutable.
Returning undefined (not []) when removing the last item lets the
override key be stripped from the JSON payload entirely so a scenario
with no active categoryDeltas doesn't carry an empty array."
```

---

### Task 3: `/simulator` page server component (data load only)

**Files:**
- Create: `src/app/(app)/simulator/page.tsx`

This is a **scaffold** task: load data on the server, render a placeholder shell that proves the page works. The full client UI lands in Task 4+.

- [ ] **Step 1: Implement the server component**

```tsx
// src/app/(app)/simulator/page.tsx
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getForecastHistory } from '@/lib/db/queries/forecast';
import { listScenariosForUser } from '@/lib/db/queries/scenarios';

/**
 * Simulator page — loads forecast history + saved scenarios on the server,
 * passes them to the client wrapper. Auth is enforced by the (app) layout
 * but we double-check here for defense in depth.
 *
 * The currentMonth is computed server-side (one of the few places a real
 * Date.now() is allowed — the engine itself stays pure).
 */
export default async function SimulatorPage({
  searchParams,
}: {
  searchParams: { scenario?: string };
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const userId = session.user.id;
  const [history, scenarios] = await Promise.all([
    getForecastHistory(userId),
    listScenariosForUser(userId),
  ]);

  const now = new Date();
  const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

  // Determine initial scenario: ?scenario=<id> param > most-recently-updated > null (baseline).
  const requestedId = searchParams?.scenario;
  const initialScenario =
    (requestedId && scenarios.find((s) => s.id === requestedId)) ||
    scenarios[0] ||
    null;

  return (
    <div className="px-6 py-8 max-w-6xl">
      <h1 className="text-2xl font-semibold tracking-tight mb-6">Simulator</h1>
      <pre className="text-xs bg-muted p-4 rounded">
        {JSON.stringify(
          {
            scenarios: scenarios.length,
            currentMonth,
            initialScenarioName: initialScenario?.name ?? '(baseline)',
            historyCash: history.currentCash,
            historyStreams: history.recurringStreams.length,
            historyGoals: history.goals.length,
          },
          null,
          2,
        )}
      </pre>
      <p className="text-sm text-muted-foreground mt-4">
        Scaffold only — client UI lands in Task 4.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Verify in dev**

Start dev (if not already running): `npm run dev` in another terminal.
Navigate to `http://localhost:3000/simulator`.
Expected: page renders with the JSON dump showing your scenarios count (probably 0), currentMonth like `2026-05`, current cash, etc. No console errors.

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/simulator/page.tsx
git commit -m "feat(simulator): scaffold /simulator page with server data load

Server component loads history + scenarios in parallel, computes
currentMonth (UTC). Renders a JSON debug shell — full client UI in
Task 4. Sidebar's /simulator link no longer 404s."
```

---

### Task 4: Top-level client wrapper with state

**Files:**
- Create: `src/app/(app)/simulator/simulator-client.tsx`
- Modify: `src/app/(app)/simulator/page.tsx` (replace JSON debug with `<SimulatorClient ... />`)

Holds the reactive state. Recomputes `projectCash` synchronously on every override change.

- [ ] **Step 1: Implement the client wrapper**

```tsx
// src/app/(app)/simulator/simulator-client.tsx
'use client';

import { useMemo, useState } from 'react';
import type { Scenario } from '@/lib/db/schema';
import { projectCash } from '@/lib/forecast/engine';
import type { ForecastHistory, ScenarioOverrides } from '@/lib/forecast/types';

type Props = {
  history: ForecastHistory;
  scenarios: Scenario[];
  currentMonth: string;
  initialScenario: Scenario | null;
};

/**
 * Top-level simulator client. Owns:
 *   - selectedScenarioId (which saved scenario is loaded; null = baseline)
 *   - liveOverrides (the in-progress edit; equals selected scenario's overrides until edited)
 *   - engineResult (memoized projectCash output, recomputes when liveOverrides changes)
 *
 * isDirty is computed: liveOverrides differs from the loaded scenario's overrides.
 * Save / Delete actions live in ScenarioHeader; they call the server actions
 * and trigger a router refresh to re-fetch the scenarios list.
 */
export function SimulatorClient({
  history,
  scenarios,
  currentMonth,
  initialScenario,
}: Props) {
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(
    initialScenario?.id ?? null,
  );
  const [liveOverrides, setLiveOverrides] = useState<ScenarioOverrides>(
    (initialScenario?.overrides as ScenarioOverrides | undefined) ?? {},
  );

  const selectedScenario = scenarios.find((s) => s.id === selectedScenarioId) ?? null;

  const isDirty = useMemo(() => {
    const saved = (selectedScenario?.overrides as ScenarioOverrides | undefined) ?? {};
    return JSON.stringify(saved) !== JSON.stringify(liveOverrides);
  }, [selectedScenario, liveOverrides]);

  const engineResult = useMemo(
    () => projectCash({ history, overrides: liveOverrides, currentMonth }),
    [history, liveOverrides, currentMonth],
  );

  const handleSelectScenario = (id: string | null) => {
    const scn = id ? scenarios.find((s) => s.id === id) : null;
    setSelectedScenarioId(id);
    setLiveOverrides((scn?.overrides as ScenarioOverrides | undefined) ?? {});
  };

  return (
    <div className="px-6 py-8 max-w-6xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Simulator</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {selectedScenario?.name ?? 'Baseline'} · {isDirty ? 'edited' : 'saved'}
        </p>
      </header>

      {/* Scaffold view — proves engine runs reactively. Real layout in Task 5+. */}
      <div className="grid grid-cols-2 gap-6">
        <div className="bg-muted/40 border border-border rounded-lg p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
            Scenarios
          </div>
          <ul className="space-y-1 text-sm">
            <li>
              <button
                onClick={() => handleSelectScenario(null)}
                className={selectedScenarioId === null ? 'font-semibold' : 'text-muted-foreground'}
              >
                (Baseline)
              </button>
            </li>
            {scenarios.map((s) => (
              <li key={s.id}>
                <button
                  onClick={() => handleSelectScenario(s.id)}
                  className={selectedScenarioId === s.id ? 'font-semibold' : 'text-muted-foreground'}
                >
                  {s.name}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-muted/40 border border-border rounded-lg p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
            Engine result (live)
          </div>
          <pre className="text-xs overflow-x-auto">
            {JSON.stringify(
              {
                projectionMonths: engineResult.projection.length,
                endCashMonth0: engineResult.projection[0]?.endCash,
                goalImpacts: engineResult.goalImpacts.map((g) => ({
                  name: g.name,
                  scenarioETA: g.scenarioETA,
                  shiftMonths: g.shiftMonths,
                })),
                isDirty,
              },
              null,
              2,
            )}
          </pre>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update the page to use the client wrapper**

Replace `src/app/(app)/simulator/page.tsx` contents with:

```tsx
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getForecastHistory } from '@/lib/db/queries/forecast';
import { listScenariosForUser } from '@/lib/db/queries/scenarios';
import { SimulatorClient } from './simulator-client';

export default async function SimulatorPage({
  searchParams,
}: {
  searchParams: { scenario?: string };
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const userId = session.user.id;
  const [history, scenarios] = await Promise.all([
    getForecastHistory(userId),
    listScenariosForUser(userId),
  ]);

  const now = new Date();
  const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

  const requestedId = searchParams?.scenario;
  const initialScenario =
    (requestedId && scenarios.find((s) => s.id === requestedId)) ||
    scenarios[0] ||
    null;

  return (
    <SimulatorClient
      history={history}
      scenarios={scenarios}
      currentMonth={currentMonth}
      initialScenario={initialScenario}
    />
  );
}
```

- [ ] **Step 3: Verify in dev**

Navigate to `/simulator`. Expected: scaffold shows scenario list (probably just "Baseline") + engine result JSON. Click "Baseline" — should select it. Engine result should populate.

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/simulator/simulator-client.tsx src/app/\(app\)/simulator/page.tsx
git commit -m "feat(simulator): client wrapper with reactive engine state

Holds selectedScenarioId + liveOverrides; recomputes projectCash via
useMemo on override changes. Scaffold view shows scenario list +
engine output JSON to prove reactivity. Real layout in Task 5+."
```

---

## Wave 2 — Layout primitives

### Task 5: ScenarioHeader (selector dropdown + Save + Reset + ⋯)

**Files:**
- Create: `src/components/simulator/scenario-header.tsx`
- Modify: `src/app/(app)/simulator/simulator-client.tsx` (replace inline scenario list with `<ScenarioHeader ... />`)

Uses native `<select>` for the dropdown (avoids needing a new shadcn install). Save / Reset / Delete are styled buttons.

- [ ] **Step 1: Implement ScenarioHeader**

```tsx
// src/components/simulator/scenario-header.tsx
'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  createScenario,
  deleteScenario,
  updateScenario,
} from '@/lib/forecast/scenario-actions';
import type { Scenario } from '@/lib/db/schema';
import type { ScenarioOverrides } from '@/lib/forecast/types';

type Props = {
  scenarios: Scenario[];
  selectedScenarioId: string | null;
  liveOverrides: ScenarioOverrides;
  isDirty: boolean;
  onSelect: (id: string | null) => void;
};

/**
 * Top-of-page header. Scenario name + selector + actions.
 *
 * Save semantics:
 *   - If no scenario is selected (baseline): prompt for a name, createScenario.
 *   - If a scenario is selected and dirty: updateScenario in place.
 *   - If not dirty: button is visually disabled but page allows (no harm in a no-op).
 *
 * After any mutation, router.refresh() re-fetches the scenarios list from
 * the server component. selectedScenarioId is preserved (or set to the
 * just-created id).
 */
export function ScenarioHeader({
  scenarios,
  selectedScenarioId,
  liveOverrides,
  isDirty,
  onSelect,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const selected = scenarios.find((s) => s.id === selectedScenarioId) ?? null;

  const handleSave = () => {
    startTransition(async () => {
      if (!selected) {
        // Create a new scenario
        const name = window.prompt('Name this scenario:', 'Untitled scenario');
        if (!name) return;
        const result = await createScenario({ name, overrides: liveOverrides });
        if (result.ok) {
          onSelect(result.data.id);
          router.refresh();
        } else {
          window.alert(`Save failed: ${result.error}`);
        }
      } else {
        const result = await updateScenario({
          id: selected.id,
          overrides: liveOverrides,
        });
        if (result.ok) {
          router.refresh();
        } else {
          window.alert(`Save failed: ${result.error}`);
        }
      }
    });
  };

  const handleDelete = () => {
    if (!selected) return;
    if (!window.confirm(`Delete scenario "${selected.name}"?`)) return;
    startTransition(async () => {
      const result = await deleteScenario({ id: selected.id });
      if (result.ok) {
        onSelect(null);
        router.refresh();
      } else {
        window.alert(`Delete failed: ${result.error}`);
      }
    });
  };

  const handleReset = () => {
    onSelect(selectedScenarioId); // re-selecting the current scenario reloads its saved overrides
  };

  return (
    <header className="flex items-baseline justify-between mb-8 pb-4 border-b border-border">
      <div>
        <div className="text-2xl font-semibold tracking-tight text-foreground">
          Simulator
        </div>
        <div className="flex items-baseline gap-2 mt-1 text-sm text-muted-foreground">
          <select
            value={selectedScenarioId ?? ''}
            onChange={(e) => onSelect(e.target.value || null)}
            className="bg-transparent border-0 -ml-1 px-1 py-0 hover:bg-accent rounded cursor-pointer"
            disabled={isPending}
          >
            <option value="">Baseline (no overrides)</option>
            {scenarios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {isDirty && <span className="text-amber-600">· edited</span>}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={handleReset}
          disabled={!isDirty || isPending}
          className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          Reset
        </button>
        <button
          onClick={handleSave}
          disabled={!isDirty || isPending}
          className="bg-foreground text-background px-3 py-1.5 rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? 'Saving…' : selected ? 'Save' : 'Save as…'}
        </button>
        {selected && (
          <button
            onClick={handleDelete}
            disabled={isPending}
            className="text-sm text-muted-foreground hover:text-destructive disabled:opacity-50"
          >
            Delete
          </button>
        )}
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Wire ScenarioHeader into simulator-client.tsx**

Replace the existing `<header>` + scenario-list block at the top of `SimulatorClient`'s return with:

```tsx
import { ScenarioHeader } from '@/components/simulator/scenario-header';

// Inside the component's return, replace the previous header + scenarios list:
return (
  <div className="px-6 py-8 max-w-6xl">
    <ScenarioHeader
      scenarios={scenarios}
      selectedScenarioId={selectedScenarioId}
      liveOverrides={liveOverrides}
      isDirty={isDirty}
      onSelect={handleSelectScenario}
    />

    {/* Engine result debug — replaced in Wave 4 */}
    <div className="bg-muted/40 border border-border rounded-lg p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
        Engine result (live)
      </div>
      <pre className="text-xs overflow-x-auto">
        {JSON.stringify(
          {
            projectionMonths: engineResult.projection.length,
            endCashMonth0: engineResult.projection[0]?.endCash,
            goalImpacts: engineResult.goalImpacts,
            isDirty,
          },
          null,
          2,
        )}
      </pre>
    </div>
  </div>
);
```

- [ ] **Step 3: Verify in dev**

Navigate to `/simulator`. Expected: dropdown shows "Baseline (no overrides)". Save button disabled (no dirty state). Reset disabled. No Delete button (no scenario selected).

Test save flow: there's no override editor yet, so manually contrive dirty state by editing `liveOverrides` initial value temporarily — OR skip this test until Task 7+ adds editors. Just verify the dropdown changes the URL/state correctly.

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/simulator/scenario-header.tsx src/app/\(app\)/simulator/simulator-client.tsx
git commit -m "feat(simulator): scenario header with selector + save/delete

Native select dropdown for scenario picker (avoids new shadcn deps).
Save flow: createScenario for baseline, updateScenario for an existing
selection. router.refresh() reloads the scenarios list from server.
Reset reverts liveOverrides to the saved values. Delete prompts confirm."
```

---

### Task 6: Generic OverrideSection accordion primitive

**Files:**
- Create: `src/components/simulator/override-section.tsx`

The 7 override editor components all share the same outer shell: a header row (label + count badge), a chevron, and an expandable body. Pulling this into one primitive keeps each editor focused on its own field UI.

- [ ] **Step 1: Implement OverrideSection**

```tsx
// src/components/simulator/override-section.tsx
'use client';

import { useState, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

type Props = {
  label: string;
  count: number;             // active items in this section (badge)
  defaultOpen?: boolean;
  children: ReactNode;
};

/**
 * Collapsible section with header showing label + active-item count.
 * Uses local useState for expanded; no global accordion coordination
 * (each section opens independently — reader can compare two simultaneously).
 *
 * Visual: bottom border separator, lightweight chrome. Matches the
 * "balanced v3" mockup quietness — no heavy backgrounds, just a thin
 * accent on the active state.
 */
export function OverrideSection({
  label,
  count,
  defaultOpen = false,
  children,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const isEmpty = count === 0;

  return (
    <div className="border-b border-border/60 py-2.5">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between text-sm hover:text-foreground transition-colors"
      >
        <span className="flex items-center gap-1.5 text-foreground">
          <ChevronRight
            className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? 'rotate-90' : ''}`}
          />
          {label}
        </span>
        <span className={isEmpty ? 'text-muted-foreground/60' : 'text-muted-foreground'}>
          {isEmpty ? '—' : count}
        </span>
      </button>
      {open && <div className="mt-3 pl-5 text-sm">{children}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/simulator/override-section.tsx
git commit -m "feat(simulator): generic OverrideSection accordion primitive

Header shows label + count badge (or '—' when empty). Chevron rotates
on expand. Each section is independent — no accordion coordination,
so reader can compare multiple sections simultaneously."
```

---

## Wave 3 — Override editors (7 sections, one per task)

Each editor follows the same shape: receives `(value, onChange)` props, where `value` is the typed override slice (e.g., `categoryDeltas?: Array<...>`) and `onChange` accepts the new value (or undefined to clear). All 7 editors live inside their own `<OverrideSection>` instance.

For each task: implement the editor, wire it into `simulator-client.tsx`, verify in dev.

### Task 7: CategoryOverrides editor

**Files:**
- Create: `src/components/simulator/category-overrides.tsx`
- Modify: `src/app/(app)/simulator/simulator-client.tsx`

- [ ] **Step 1: Implement CategoryOverrides**

```tsx
// src/components/simulator/category-overrides.tsx
'use client';

import { Plus, X } from 'lucide-react';
import {
  addItem,
  removeItem,
  updateItem,
} from '@/lib/forecast/override-helpers';
import type { ScenarioOverrides } from '@/lib/forecast/types';

type Props = {
  value: ScenarioOverrides['categoryDeltas'];
  onChange: (next: ScenarioOverrides['categoryDeltas']) => void;
  /** Plaid PFC strings observed in the user's history, with prettified names. */
  knownCategories: Array<{ id: string; name: string }>;
};

export function CategoryOverrides({ value, onChange, knownCategories }: Props) {
  const items = value ?? [];
  const usedIds = new Set(items.map((i) => i.categoryId));
  const availableCategories = knownCategories.filter((c) => !usedIds.has(c.id));

  return (
    <div className="space-y-2">
      {items.map((item) => {
        const cat = knownCategories.find((c) => c.id === item.categoryId);
        return (
          <div key={item.categoryId} className="flex items-center gap-2">
            <span className="flex-1 text-foreground">{cat?.name ?? item.categoryId}</span>
            <span className="text-muted-foreground">$</span>
            <input
              type="number"
              value={item.monthlyDelta}
              onChange={(e) =>
                onChange(
                  updateItem(
                    items,
                    (i) => i.categoryId === item.categoryId,
                    { monthlyDelta: Number(e.target.value) },
                  ),
                )
              }
              className="w-24 bg-background border border-border rounded px-2 py-1 text-right text-foreground"
            />
            <span className="text-muted-foreground text-xs">/mo</span>
            <button
              onClick={() =>
                onChange(removeItem(items, (i) => i.categoryId === item.categoryId))
              }
              className="p-1 text-muted-foreground hover:text-destructive"
              aria-label="Remove"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}

      {availableCategories.length > 0 ? (
        <select
          value=""
          onChange={(e) => {
            const id = e.target.value;
            if (!id) return;
            onChange(addItem(items, { categoryId: id, monthlyDelta: 0 }));
          }}
          className="w-full bg-background border border-dashed border-border rounded px-2 py-1.5 text-muted-foreground hover:text-foreground"
        >
          <option value="">+ add category override</option>
          {availableCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      ) : (
        <div className="text-xs text-muted-foreground/60 italic">
          All known categories already overridden.
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire into simulator-client.tsx**

Add a left column with `<OverrideSection>` wrapping `<CategoryOverrides>`. Replace the existing single-pane layout with a 2-column grid (overrides on left, debug on right):

```tsx
// At top of simulator-client.tsx, add imports:
import { OverrideSection } from '@/components/simulator/override-section';
import { CategoryOverrides } from '@/components/simulator/category-overrides';

// Replace the JSON-debug return body with this 2-column layout:
return (
  <div className="px-6 py-8 max-w-6xl">
    <ScenarioHeader
      scenarios={scenarios}
      selectedScenarioId={selectedScenarioId}
      liveOverrides={liveOverrides}
      isDirty={isDirty}
      onSelect={handleSelectScenario}
    />

    <div className="grid grid-cols-[260px_1fr] gap-10">
      {/* Left: override editor */}
      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3">
          Overrides
        </div>
        <OverrideSection label="Categories" count={liveOverrides.categoryDeltas?.length ?? 0}>
          <CategoryOverrides
            value={liveOverrides.categoryDeltas}
            onChange={(next) =>
              setLiveOverrides((o) => ({ ...o, categoryDeltas: next }))
            }
            knownCategories={history.categories}
          />
        </OverrideSection>
        {/* More sections in Tasks 8-13 */}
      </div>

      {/* Right: debug for now (chart + cards in Wave 4) */}
      <div>
        <div className="bg-muted/40 border border-border rounded-lg p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
            Engine result (live)
          </div>
          <pre className="text-xs overflow-x-auto">
            {JSON.stringify(
              {
                projectionEndCash: engineResult.projection.map((m) => m.endCash),
                goalImpacts: engineResult.goalImpacts,
                liveOverrides,
              },
              null,
              2,
            )}
          </pre>
        </div>
      </div>
    </div>
  </div>
);
```

- [ ] **Step 3: Verify in dev**

Navigate to `/simulator`. Expand "Categories". Expected: dropdown shows your real Plaid PFC categories. Add one (e.g., "Food and drink"), edit the $ value to `-300`. The right-pane JSON should immediately reflect: `liveOverrides.categoryDeltas: [{categoryId:'FOOD_AND_DRINK', monthlyDelta:-300}]` and the projection's `byCategory` for that PFC should show the change. Save button should now show "Save as…" and be enabled.

If you have no Plaid history yet (`knownCategories` is empty), you'll see the "All known categories already overridden" placeholder — that's expected.

- [ ] **Step 4: Run typecheck + tests**

Run: `npm run typecheck && npm test`
Expected: typecheck PASS. All 107 tests pass (no regressions).

- [ ] **Step 5: Commit**

```bash
git add src/components/simulator/category-overrides.tsx src/app/\(app\)/simulator/simulator-client.tsx
git commit -m "feat(simulator): CategoryOverrides editor + 2-column layout shell

Per-category $ delta with month-bound defaults. Uses Plaid PFC strings
from history.categories (matches engine's keyspace). Layout splits to
[260px overrides | 1fr right-pane]. Right pane still JSON debug —
chart + cards in Wave 4."
```

---

### Task 8: LumpSumOverrides editor

**Files:**
- Create: `src/components/simulator/lump-sum-overrides.tsx`
- Modify: `src/app/(app)/simulator/simulator-client.tsx` (add the section)

- [ ] **Step 1: Implement LumpSumOverrides**

```tsx
// src/components/simulator/lump-sum-overrides.tsx
'use client';

import { X } from 'lucide-react';
import {
  addItem,
  removeItem,
  updateItem,
} from '@/lib/forecast/override-helpers';
import type { ScenarioOverrides } from '@/lib/forecast/types';

type Props = {
  value: ScenarioOverrides['lumpSums'];
  onChange: (next: ScenarioOverrides['lumpSums']) => void;
  /** YYYY-MM strings the user can pick from (= projection horizon months). */
  availableMonths: string[];
};

const newLumpId = () => `lump-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export function LumpSumOverrides({ value, onChange, availableMonths }: Props) {
  const items = value ?? [];

  const addNew = () => {
    onChange(
      addItem(items, {
        id: newLumpId(),
        label: 'Lump sum',
        amount: 0,
        month: availableMonths[0] ?? '2026-01',
      }),
    );
  };

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.id} className="flex items-center gap-2">
          <input
            type="text"
            value={item.label}
            onChange={(e) =>
              onChange(updateItem(items, (i) => i.id === item.id, { label: e.target.value }))
            }
            className="flex-1 bg-background border border-border rounded px-2 py-1 text-foreground"
            placeholder="Label"
          />
          <select
            value={item.month}
            onChange={(e) =>
              onChange(updateItem(items, (i) => i.id === item.id, { month: e.target.value }))
            }
            className="bg-background border border-border rounded px-2 py-1 text-foreground"
          >
            {availableMonths.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <input
            type="number"
            value={item.amount}
            onChange={(e) =>
              onChange(updateItem(items, (i) => i.id === item.id, { amount: Number(e.target.value) }))
            }
            className="w-24 bg-background border border-border rounded px-2 py-1 text-right text-foreground"
          />
          <button
            onClick={() => onChange(removeItem(items, (i) => i.id === item.id))}
            className="p-1 text-muted-foreground hover:text-destructive"
            aria-label="Remove"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <button
        onClick={addNew}
        className="w-full text-left text-muted-foreground hover:text-foreground bg-background border border-dashed border-border rounded px-2 py-1.5"
      >
        + add lump sum
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Wire into simulator-client.tsx**

Add this section beneath the Categories section. Also derive `availableMonths` from the engine result:

```tsx
import { LumpSumOverrides } from '@/components/simulator/lump-sum-overrides';

// Inside the component, near other useMemo:
const availableMonths = useMemo(
  () => engineResult.projection.map((m) => m.month),
  [engineResult],
);

// Add inside the override editor column, after CategoryOverrides section:
<OverrideSection label="Lump sums" count={liveOverrides.lumpSums?.length ?? 0}>
  <LumpSumOverrides
    value={liveOverrides.lumpSums}
    onChange={(next) =>
      setLiveOverrides((o) => ({ ...o, lumpSums: next }))
    }
    availableMonths={availableMonths}
  />
</OverrideSection>
```

- [ ] **Step 3: Verify in dev**

Add a lump sum: label "Tax refund", month from the dropdown, amount 2400. Engine result's `endCash` for that month should jump up. Negative amount (-800 "Vet bill") should subtract. Multiple lump sums in same month should accumulate.

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/simulator/lump-sum-overrides.tsx src/app/\(app\)/simulator/simulator-client.tsx
git commit -m "feat(simulator): LumpSumOverrides editor

Label + month picker (constrained to projection horizon) + signed amount.
Positive → inflow, negative → outflow. Stable client-generated id for
React keys."
```

---

### Task 9: RecurringOverrides editor (most complex — pause/edit/add)

**Files:**
- Create: `src/components/simulator/recurring-overrides.tsx`
- Modify: `src/app/(app)/simulator/simulator-client.tsx`

- [ ] **Step 1: Implement RecurringOverrides**

```tsx
// src/components/simulator/recurring-overrides.tsx
'use client';

import { X } from 'lucide-react';
import {
  addItem,
  removeItem,
  updateItem,
} from '@/lib/forecast/override-helpers';
import type { ForecastHistory, ScenarioOverrides } from '@/lib/forecast/types';

type Props = {
  value: ScenarioOverrides['recurringChanges'];
  onChange: (next: ScenarioOverrides['recurringChanges']) => void;
  /** Real recurring streams from history; used for the pause/edit dropdown. */
  baseStreams: ForecastHistory['recurringStreams'];
};

const changeKey = (
  c: NonNullable<ScenarioOverrides['recurringChanges']>[number],
  i: number,
) => `${c.action}-${c.streamId ?? 'new'}-${i}`;

export function RecurringOverrides({ value, onChange, baseStreams }: Props) {
  const items = value ?? [];

  const addPause = () => {
    if (baseStreams.length === 0) return;
    onChange(addItem(items, { streamId: baseStreams[0].id, action: 'pause' }));
  };
  const addEdit = () => {
    if (baseStreams.length === 0) return;
    onChange(
      addItem(items, {
        streamId: baseStreams[0].id,
        action: 'edit',
        amount: baseStreams[0].amount,
      }),
    );
  };
  const addNew = () => {
    onChange(
      addItem(items, {
        action: 'add',
        label: 'New stream',
        amount: 100,
        direction: 'outflow',
        cadence: 'monthly',
      }),
    );
  };

  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={changeKey(item, i)} className="bg-muted/30 rounded p-2 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">
              {item.action}
            </span>
            <button
              onClick={() => onChange(removeItem(items, (_, idx) => idx === i))}
              className="p-0.5 text-muted-foreground hover:text-destructive"
              aria-label="Remove"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {(item.action === 'pause' || item.action === 'edit') && (
            <select
              value={item.streamId ?? ''}
              onChange={(e) =>
                onChange(updateItem(items, (_, idx) => idx === i, { streamId: e.target.value }))
              }
              className="w-full bg-background border border-border rounded px-2 py-1 text-foreground"
            >
              {baseStreams.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label} (${s.amount} {s.cadence})
                </option>
              ))}
            </select>
          )}

          {(item.action === 'edit' || item.action === 'add') && (
            <div className="flex gap-1.5">
              {item.action === 'add' && (
                <input
                  type="text"
                  value={item.label ?? ''}
                  onChange={(e) =>
                    onChange(updateItem(items, (_, idx) => idx === i, { label: e.target.value }))
                  }
                  placeholder="Label"
                  className="flex-1 bg-background border border-border rounded px-2 py-1 text-foreground"
                />
              )}
              <input
                type="number"
                value={item.amount ?? 0}
                onChange={(e) =>
                  onChange(updateItem(items, (_, idx) => idx === i, { amount: Number(e.target.value) }))
                }
                className="w-20 bg-background border border-border rounded px-2 py-1 text-right text-foreground"
              />
              <select
                value={item.cadence ?? 'monthly'}
                onChange={(e) =>
                  onChange(
                    updateItem(items, (_, idx) => idx === i, {
                      cadence: e.target.value as 'weekly' | 'biweekly' | 'monthly',
                    }),
                  )
                }
                className="bg-background border border-border rounded px-2 py-1 text-foreground"
              >
                <option value="weekly">weekly</option>
                <option value="biweekly">biweekly</option>
                <option value="monthly">monthly</option>
              </select>
              {item.action === 'add' && (
                <select
                  value={item.direction ?? 'outflow'}
                  onChange={(e) =>
                    onChange(
                      updateItem(items, (_, idx) => idx === i, {
                        direction: e.target.value as 'inflow' | 'outflow',
                      }),
                    )
                  }
                  className="bg-background border border-border rounded px-2 py-1 text-foreground"
                >
                  <option value="outflow">out</option>
                  <option value="inflow">in</option>
                </select>
              )}
            </div>
          )}
        </div>
      ))}

      <div className="flex gap-1.5">
        <button
          onClick={addPause}
          disabled={baseStreams.length === 0}
          className="flex-1 text-muted-foreground hover:text-foreground bg-background border border-dashed border-border rounded px-2 py-1 disabled:opacity-50 text-xs"
        >
          + pause
        </button>
        <button
          onClick={addEdit}
          disabled={baseStreams.length === 0}
          className="flex-1 text-muted-foreground hover:text-foreground bg-background border border-dashed border-border rounded px-2 py-1 disabled:opacity-50 text-xs"
        >
          + edit
        </button>
        <button
          onClick={addNew}
          className="flex-1 text-muted-foreground hover:text-foreground bg-background border border-dashed border-border rounded px-2 py-1 text-xs"
        >
          + add new
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire into simulator-client.tsx**

```tsx
import { RecurringOverrides } from '@/components/simulator/recurring-overrides';

// Add the section beneath Lump sums:
<OverrideSection label="Recurring" count={liveOverrides.recurringChanges?.length ?? 0}>
  <RecurringOverrides
    value={liveOverrides.recurringChanges}
    onChange={(next) =>
      setLiveOverrides((o) => ({ ...o, recurringChanges: next }))
    }
    baseStreams={history.recurringStreams}
  />
</OverrideSection>
```

- [ ] **Step 3: Verify in dev**

Test all three actions: pause an existing stream (rent → 0 outflow), edit one (rent amount → 1500), add a hypothetical (gym $50/mo outflow). Engine result should reflect each.

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/simulator/recurring-overrides.tsx src/app/\(app\)/simulator/simulator-client.tsx
git commit -m "feat(simulator): RecurringOverrides editor (pause/edit/add)

Three add buttons for the three action types. Edit requires picking
an existing stream; add lets you create a hypothetical with full
direction/amount/cadence. Pause/edit hide the label field; add shows it."
```

---

### Task 10: IncomeOverrides editor

**Files:**
- Create: `src/components/simulator/income-overrides.tsx`
- Modify: `src/app/(app)/simulator/simulator-client.tsx`

- [ ] **Step 1: Implement IncomeOverrides**

```tsx
// src/components/simulator/income-overrides.tsx
'use client';

import type { ScenarioOverrides } from '@/lib/forecast/types';

type Props = {
  value: ScenarioOverrides['incomeDelta'];
  onChange: (next: ScenarioOverrides['incomeDelta']) => void;
  availableMonths: string[];
};

export function IncomeOverrides({ value, onChange, availableMonths }: Props) {
  if (!value) {
    return (
      <button
        onClick={() => onChange({ monthlyDelta: 0 })}
        className="w-full text-left text-muted-foreground hover:text-foreground bg-background border border-dashed border-border rounded px-2 py-1.5"
      >
        + add income delta
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">Monthly Δ $</span>
        <input
          type="number"
          value={value.monthlyDelta}
          onChange={(e) => onChange({ ...value, monthlyDelta: Number(e.target.value) })}
          className="flex-1 bg-background border border-border rounded px-2 py-1 text-right text-foreground"
        />
        <button
          onClick={() => onChange(undefined)}
          className="text-xs text-muted-foreground hover:text-destructive"
        >
          remove
        </button>
      </div>
      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground">From</span>
        <select
          value={value.startMonth ?? ''}
          onChange={(e) => onChange({ ...value, startMonth: e.target.value || undefined })}
          className="bg-background border border-border rounded px-2 py-1 text-foreground"
        >
          <option value="">always</option>
          {availableMonths.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <span className="text-muted-foreground">to</span>
        <select
          value={value.endMonth ?? ''}
          onChange={(e) => onChange({ ...value, endMonth: e.target.value || undefined })}
          className="bg-background border border-border rounded px-2 py-1 text-foreground"
        >
          <option value="">end of horizon</option>
          {availableMonths.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire in**

```tsx
import { IncomeOverrides } from '@/components/simulator/income-overrides';

<OverrideSection
  label="Income"
  count={liveOverrides.incomeDelta ? 1 : 0}
>
  <IncomeOverrides
    value={liveOverrides.incomeDelta}
    onChange={(next) =>
      setLiveOverrides((o) => ({ ...o, incomeDelta: next }))
    }
    availableMonths={availableMonths}
  />
</OverrideSection>
```

- [ ] **Step 3: Verify in dev**

Add an income delta of +500/mo. Engine `inflows` should bump up that amount. Set range bounds; only those months reflect the change.

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/simulator/income-overrides.tsx src/app/\(app\)/simulator/simulator-client.tsx
git commit -m "feat(simulator): IncomeOverrides editor

Single delta with optional startMonth/endMonth bounds. 'always' / 'end
of horizon' as the empty-string sentinels."
```

---

### Task 11: HypotheticalGoalOverrides editor

**Files:**
- Create: `src/components/simulator/hypothetical-goal-overrides.tsx`
- Modify: `src/app/(app)/simulator/simulator-client.tsx`

- [ ] **Step 1: Implement HypotheticalGoalOverrides**

```tsx
// src/components/simulator/hypothetical-goal-overrides.tsx
'use client';

import { X } from 'lucide-react';
import {
  addItem,
  removeItem,
  updateItem,
} from '@/lib/forecast/override-helpers';
import type { ScenarioOverrides } from '@/lib/forecast/types';

type Props = {
  value: ScenarioOverrides['hypotheticalGoals'];
  onChange: (next: ScenarioOverrides['hypotheticalGoals']) => void;
};

const newGoalId = () => `hyp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export function HypotheticalGoalOverrides({ value, onChange }: Props) {
  const items = value ?? [];

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.id} className="bg-muted/30 rounded p-2 space-y-1.5">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={item.name}
              onChange={(e) =>
                onChange(updateItem(items, (i) => i.id === item.id, { name: e.target.value }))
              }
              placeholder="Goal name"
              className="flex-1 bg-background border border-border rounded px-2 py-1 text-foreground"
            />
            <button
              onClick={() => onChange(removeItem(items, (i) => i.id === item.id))}
              className="p-1 text-muted-foreground hover:text-destructive"
              aria-label="Remove"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Target $</span>
            <input
              type="number"
              value={item.targetAmount}
              onChange={(e) =>
                onChange(updateItem(items, (i) => i.id === item.id, {
                  targetAmount: Number(e.target.value),
                }))
              }
              className="w-24 bg-background border border-border rounded px-2 py-1 text-right text-foreground"
            />
            <span className="text-muted-foreground">@ $</span>
            <input
              type="number"
              value={item.monthlyContribution ?? 0}
              onChange={(e) =>
                onChange(updateItem(items, (i) => i.id === item.id, {
                  monthlyContribution: Number(e.target.value),
                }))
              }
              className="w-20 bg-background border border-border rounded px-2 py-1 text-right text-foreground"
            />
            <span className="text-muted-foreground">/mo</span>
          </div>
        </div>
      ))}
      <button
        onClick={() =>
          onChange(addItem(items, {
            id: newGoalId(),
            name: 'New goal',
            targetAmount: 1000,
            monthlyContribution: 100,
          }))
        }
        className="w-full text-left text-muted-foreground hover:text-foreground bg-background border border-dashed border-border rounded px-2 py-1.5"
      >
        + add hypothetical goal
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Wire in**

```tsx
import { HypotheticalGoalOverrides } from '@/components/simulator/hypothetical-goal-overrides';

<OverrideSection
  label="Hypothetical goals"
  count={liveOverrides.hypotheticalGoals?.length ?? 0}
>
  <HypotheticalGoalOverrides
    value={liveOverrides.hypotheticalGoals}
    onChange={(next) =>
      setLiveOverrides((o) => ({ ...o, hypotheticalGoals: next }))
    }
  />
</OverrideSection>
```

- [ ] **Step 3: Verify in dev**

Add a hypothetical goal: "House" target 30000 @ 500/mo. Engine result `goalImpacts` should include `hypo:<id>` with computed `scenarioETA`.

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/simulator/hypothetical-goal-overrides.tsx src/app/\(app\)/simulator/simulator-client.tsx
git commit -m "feat(simulator): HypotheticalGoalOverrides editor

Add named goals with target amount + monthly contribution. Stable
client-generated ids; engine prefixes them with 'hypo:' in goalImpacts."
```

---

### Task 12: GoalTargetOverrides editor

**Files:**
- Create: `src/components/simulator/goal-target-overrides.tsx`
- Modify: `src/app/(app)/simulator/simulator-client.tsx`

- [ ] **Step 1: Implement GoalTargetOverrides**

```tsx
// src/components/simulator/goal-target-overrides.tsx
'use client';

import { X } from 'lucide-react';
import {
  addItem,
  removeItem,
  updateItem,
} from '@/lib/forecast/override-helpers';
import type { ForecastHistory, ScenarioOverrides } from '@/lib/forecast/types';

type Props = {
  value: ScenarioOverrides['goalTargetEdits'];
  onChange: (next: ScenarioOverrides['goalTargetEdits']) => void;
  realGoals: ForecastHistory['goals'];
};

export function GoalTargetOverrides({ value, onChange, realGoals }: Props) {
  const items = value ?? [];
  const usedIds = new Set(items.map((i) => i.goalId));
  const availableGoals = realGoals.filter((g) => !usedIds.has(g.id));

  return (
    <div className="space-y-2">
      {items.map((item) => {
        const goal = realGoals.find((g) => g.id === item.goalId);
        return (
          <div key={item.goalId} className="bg-muted/30 rounded p-2 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-medium text-foreground text-sm">
                {goal?.name ?? '(unknown)'}
              </span>
              <button
                onClick={() => onChange(removeItem(items, (i) => i.goalId === item.goalId))}
                className="p-1 text-muted-foreground hover:text-destructive"
                aria-label="Remove"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Target $</span>
              <input
                type="number"
                value={item.newTargetAmount ?? goal?.targetAmount ?? 0}
                onChange={(e) =>
                  onChange(updateItem(items, (i) => i.goalId === item.goalId, {
                    newTargetAmount: Number(e.target.value),
                  }))
                }
                className="w-24 bg-background border border-border rounded px-2 py-1 text-right text-foreground"
              />
              <span className="text-muted-foreground">@ $</span>
              <input
                type="number"
                value={item.newMonthlyContribution ?? goal?.monthlyContribution ?? 0}
                onChange={(e) =>
                  onChange(updateItem(items, (i) => i.goalId === item.goalId, {
                    newMonthlyContribution: Number(e.target.value),
                  }))
                }
                className="w-20 bg-background border border-border rounded px-2 py-1 text-right text-foreground"
              />
              <span className="text-muted-foreground">/mo</span>
            </div>
          </div>
        );
      })}

      {availableGoals.length > 0 ? (
        <select
          value=""
          onChange={(e) => {
            const id = e.target.value;
            if (!id) return;
            onChange(addItem(items, { goalId: id }));
          }}
          className="w-full bg-background border border-dashed border-border rounded px-2 py-1.5 text-muted-foreground hover:text-foreground"
        >
          <option value="">+ edit a real goal</option>
          {availableGoals.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      ) : realGoals.length === 0 ? (
        <div className="text-xs text-muted-foreground/60 italic">
          No real goals to edit yet.
        </div>
      ) : (
        <div className="text-xs text-muted-foreground/60 italic">
          All real goals already have edits.
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire in**

```tsx
import { GoalTargetOverrides } from '@/components/simulator/goal-target-overrides';

<OverrideSection
  label="Existing goal edits"
  count={liveOverrides.goalTargetEdits?.length ?? 0}
>
  <GoalTargetOverrides
    value={liveOverrides.goalTargetEdits}
    onChange={(next) =>
      setLiveOverrides((o) => ({ ...o, goalTargetEdits: next }))
    }
    realGoals={history.goals}
  />
</OverrideSection>
```

- [ ] **Step 3: Verify in dev**

Pick a real goal from the dropdown. Edit target amount or monthly contribution. The engine's `goalImpacts` for that goal should show shifted ETA.

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/simulator/goal-target-overrides.tsx src/app/\(app\)/simulator/simulator-client.tsx
git commit -m "feat(simulator): GoalTargetOverrides editor

Override targetAmount + monthlyContribution on existing real goals
without mutating the goal table. Pre-fills inputs with the goal's
current values for easy comparison."
```

---

### Task 13: SkipRecurringOverrides editor

**Files:**
- Create: `src/components/simulator/skip-recurring-overrides.tsx`
- Modify: `src/app/(app)/simulator/simulator-client.tsx`

- [ ] **Step 1: Implement SkipRecurringOverrides**

```tsx
// src/components/simulator/skip-recurring-overrides.tsx
'use client';

import { X } from 'lucide-react';
import {
  addItem,
  removeItem,
  updateItem,
} from '@/lib/forecast/override-helpers';
import type { ForecastHistory, ScenarioOverrides } from '@/lib/forecast/types';

type Props = {
  value: ScenarioOverrides['skipRecurringInstances'];
  onChange: (next: ScenarioOverrides['skipRecurringInstances']) => void;
  baseStreams: ForecastHistory['recurringStreams'];
  availableMonths: string[];
};

export function SkipRecurringOverrides({
  value, onChange, baseStreams, availableMonths,
}: Props) {
  const items = value ?? [];

  return (
    <div className="space-y-2">
      {items.map((item, i) => {
        const stream = baseStreams.find((s) => s.id === item.streamId);
        return (
          <div key={`${item.streamId}-${item.skipMonth}-${i}`} className="flex items-center gap-2">
            <select
              value={item.streamId}
              onChange={(e) =>
                onChange(updateItem(items, (_, idx) => idx === i, { streamId: e.target.value }))
              }
              className="flex-1 bg-background border border-border rounded px-2 py-1 text-foreground"
            >
              {baseStreams.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
            <span className="text-xs text-muted-foreground">in</span>
            <select
              value={item.skipMonth}
              onChange={(e) =>
                onChange(updateItem(items, (_, idx) => idx === i, { skipMonth: e.target.value }))
              }
              className="bg-background border border-border rounded px-2 py-1 text-foreground"
            >
              {availableMonths.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <button
              onClick={() => onChange(removeItem(items, (_, idx) => idx === i))}
              className="p-1 text-muted-foreground hover:text-destructive"
              aria-label="Remove"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
      {baseStreams.length > 0 ? (
        <button
          onClick={() =>
            onChange(addItem(items, {
              streamId: baseStreams[0].id,
              skipMonth: availableMonths[0] ?? '2026-01',
            }))
          }
          className="w-full text-left text-muted-foreground hover:text-foreground bg-background border border-dashed border-border rounded px-2 py-1.5"
        >
          + add skip
        </button>
      ) : (
        <div className="text-xs text-muted-foreground/60 italic">
          No recurring streams to skip.
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire in**

```tsx
import { SkipRecurringOverrides } from '@/components/simulator/skip-recurring-overrides';

<OverrideSection
  label="Skip recurring"
  count={liveOverrides.skipRecurringInstances?.length ?? 0}
>
  <SkipRecurringOverrides
    value={liveOverrides.skipRecurringInstances}
    onChange={(next) =>
      setLiveOverrides((o) => ({ ...o, skipRecurringInstances: next }))
    }
    baseStreams={history.recurringStreams}
    availableMonths={availableMonths}
  />
</OverrideSection>
```

- [ ] **Step 3: Verify in dev**

Add a skip: pick a stream + a month. Engine result for that month should show one fewer instance subtracted.

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/simulator/skip-recurring-overrides.tsx src/app/\(app\)/simulator/simulator-client.tsx
git commit -m "feat(simulator): SkipRecurringOverrides editor

Stream + month picker. Each row removes one stream-instance for the
selected month. All 7 override editors now live; right pane still
shows engine debug — chart + cards in Wave 4."
```

---

## Wave 4 — Display components

### Task 14: ForecastChart (Recharts)

**Files:**
- Create: `src/components/simulator/forecast-chart.tsx`
- Modify: `src/app/(app)/simulator/simulator-client.tsx`

Mirrors the pattern in `src/components/drift/trend-chart.tsx` (existing Recharts wrapper). Renders TWO series: baseline (gray dashed) + scenario (solid black).

The baseline projection requires running `projectCash` AGAIN with no overrides — cheap, sub-millisecond.

- [ ] **Step 1: Implement ForecastChart**

```tsx
// src/components/simulator/forecast-chart.tsx
'use client';

import { useMemo } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { MonthlyProjection } from '@/lib/forecast/types';
import { formatCurrency } from '@/lib/utils';

type Props = {
  baseline: MonthlyProjection[];
  scenario: MonthlyProjection[];
};

export function ForecastChart({ baseline, scenario }: Props) {
  const data = useMemo(() => {
    return scenario.map((m, i) => ({
      month: m.month,
      scenario: m.endCash,
      baseline: baseline[i]?.endCash ?? 0,
    }));
  }, [baseline, scenario]);

  const finalEndCash = scenario[scenario.length - 1]?.endCash ?? 0;
  const lastMonth = scenario[scenario.length - 1]?.month ?? '';

  return (
    <section>
      <header className="flex items-baseline justify-between mb-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Cash forecast
          </div>
          <div className="text-sm text-foreground mt-0.5">
            {scenario.length} months · {lastMonth} projected {formatCurrency(finalEndCash)}
          </div>
        </div>
        <div className="text-[11px] text-muted-foreground">
          <span className="inline-block w-3 h-px bg-muted-foreground/50 align-middle mr-1.5"></span>
          baseline
          <span className="inline-block w-3 h-px bg-foreground align-middle ml-3 mr-1.5"></span>
          scenario
        </div>
      </header>
      <div className="h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 4 }}>
            <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.4} vertical={false} />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => formatCurrency(v, { compact: true })}
            />
            <Tooltip
              contentStyle={{
                background: 'hsl(var(--background))',
                border: '1px solid hsl(var(--border))',
                fontSize: 12,
              }}
              formatter={(value: number) => formatCurrency(value)}
            />
            <Line
              type="monotone"
              dataKey="baseline"
              stroke="hsl(var(--muted-foreground))"
              strokeOpacity={0.5}
              strokeWidth={1.25}
              strokeDasharray="3 3"
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="scenario"
              stroke="hsl(var(--foreground))"
              strokeWidth={1.5}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Wire into simulator-client.tsx**

Add a baseline computation memo + replace the right-pane debug with the chart:

```tsx
import { ForecastChart } from '@/components/simulator/forecast-chart';

// Add a baseline memo (separate from engineResult so the chart can compare):
const baselineResult = useMemo(
  () => projectCash({ history, overrides: {}, currentMonth }),
  [history, currentMonth],
);

// Replace the right-pane debug block with:
<div className="space-y-8">
  <ForecastChart
    baseline={baselineResult.projection}
    scenario={engineResult.projection}
  />
  {/* Goal diff cards in Task 15 */}
</div>
```

- [ ] **Step 3: Verify in dev**

Navigate to `/simulator`. Expected: chart appears with two lines. Adjust an override (e.g., add categoryDelta) — scenario line should shift while baseline stays put. Hover for tooltips.

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/simulator/forecast-chart.tsx src/app/\(app\)/simulator/simulator-client.tsx
git commit -m "feat(simulator): ForecastChart with baseline + scenario lines

Recharts LineChart, 220px tall. Baseline (gray dashed) + scenario
(solid foreground) overlay. Tooltips format as currency. Header shows
horizon length + final endCash. Computes baselineResult separately
(zero overrides) so the chart can render the comparison."
```

---

### Task 15: GoalDiffCards

**Files:**
- Create: `src/components/simulator/goal-diff-cards.tsx`
- Modify: `src/app/(app)/simulator/simulator-client.tsx`

- [ ] **Step 1: Implement GoalDiffCards**

```tsx
// src/components/simulator/goal-diff-cards.tsx
import type { GoalImpact } from '@/lib/forecast/types';

type Props = {
  goalImpacts: GoalImpact[];
};

function shiftPill(impact: GoalImpact): { text: string; tone: 'sooner' | 'later' | 'same' | 'hypo' | 'unreachable' } | null {
  if (impact.baselineETA === null && impact.scenarioETA === null) {
    return { text: 'unreachable', tone: 'unreachable' };
  }
  if (impact.baselineETA === null) {
    return { text: 'hypo', tone: 'hypo' };
  }
  if (impact.shiftMonths < 0) {
    return { text: `↓ ${Math.abs(impact.shiftMonths)} mo`, tone: 'sooner' };
  }
  if (impact.shiftMonths > 0) {
    return { text: `↑ ${impact.shiftMonths} mo`, tone: 'later' };
  }
  return { text: 'same', tone: 'same' };
}

const toneStyles: Record<string, string> = {
  sooner: 'bg-sky-50 text-sky-700',
  later: 'bg-amber-50 text-amber-700',
  same: 'bg-muted text-muted-foreground',
  hypo: 'bg-amber-50 text-amber-700',
  unreachable: 'bg-muted text-muted-foreground/70',
};

export function GoalDiffCards({ goalImpacts }: Props) {
  if (goalImpacts.length === 0) {
    return (
      <section>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3">
          Goals impact
        </div>
        <p className="text-sm text-muted-foreground italic">
          No goals yet. Add real goals from /goals or hypothetical goals on the left.
        </p>
      </section>
    );
  }

  return (
    <section>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3">
        Goals impact
      </div>
      <div className="grid grid-cols-2 gap-3">
        {goalImpacts.map((g) => {
          const pill = shiftPill(g);
          return (
            <article
              key={g.goalId}
              className="bg-muted/40 border border-border/60 rounded-lg p-3.5"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="text-sm text-foreground font-medium">{g.name}</div>
                {pill && (
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full tracking-wide ${toneStyles[pill.tone]}`}
                  >
                    {pill.text}
                  </span>
                )}
              </div>
              <div className="text-lg font-semibold text-foreground">
                {g.scenarioETA ?? '—'}
              </div>
              {g.baselineETA && g.baselineETA !== g.scenarioETA && (
                <div className="text-xs text-muted-foreground mt-0.5">
                  was {g.baselineETA}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Wire into simulator-client.tsx**

```tsx
import { GoalDiffCards } from '@/components/simulator/goal-diff-cards';

// Inside the right-column space-y-8:
<GoalDiffCards goalImpacts={engineResult.goalImpacts} />
```

- [ ] **Step 3: Verify in dev**

With at least one real goal in `/goals`, the card shows ETA. Add a hypothetical goal with `monthlyContribution > 0` — second card appears with "hypo" pill. Apply a categoryDelta that frees up cash + a goalTargetEdit raising contribution — sooner pill appears.

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/simulator/goal-diff-cards.tsx src/app/\(app\)/simulator/simulator-client.tsx
git commit -m "feat(simulator): GoalDiffCards 2-column grid with direction pills

Pill colors: sky for sooner, amber for later/hypo, muted for same/
unreachable. Scenario ETA is the headline (18px); baseline shown as
'was X' footnote when shifted. Empty state when no goals exist yet."
```

---

## Wave 5 — Integration + polish

### Task 16: Empty + first-time states

**Files:**
- Modify: `src/app/(app)/simulator/simulator-client.tsx`

Two distinct empty states to handle:
1. User has zero saved scenarios AND zero history (just-connected user).
2. User has history but no scenarios (typical first-visit state).

State 2 should NOT show an empty page — the chart + cards already render the baseline. Just need a quiet hint that there are no saved scenarios yet.

State 1 needs a friendly "you'll see forecasts once your transactions sync" message instead of a degenerate flat-cash chart.

- [ ] **Step 1: Add the empty-state handling**

In `simulator-client.tsx`, near the top of the return JSX (after `<ScenarioHeader>` but before the grid):

```tsx
const hasNoData =
  history.currentCash === 0 &&
  history.recurringStreams.length === 0 &&
  Object.keys(history.categoryHistory).length === 0;

if (hasNoData) {
  return (
    <div className="px-6 py-8 max-w-6xl">
      <ScenarioHeader
        scenarios={scenarios}
        selectedScenarioId={selectedScenarioId}
        liveOverrides={liveOverrides}
        isDirty={isDirty}
        onSelect={handleSelectScenario}
      />
      <div className="bg-muted/40 border border-border rounded-lg p-8 text-center">
        <h2 className="text-lg font-semibold text-foreground mb-2">No data yet</h2>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          The simulator forecasts forward from your synced transactions and
          recurring streams. Once Plaid finishes its first sync (typically
          within a few minutes of connecting), the forecast will fill in here.
        </p>
      </div>
    </div>
  );
}
```

Wrap the rest of the JSX in `else { return ... }` or restructure as one return with conditional. Below the ScenarioHeader (when data IS present), if `scenarios.length === 0`, add a one-liner hint:

```tsx
{scenarios.length === 0 && (
  <p className="text-xs text-muted-foreground -mt-4 mb-6">
    You're viewing the baseline forecast. Add overrides on the left and click
    "Save as…" to keep a scenario for later.
  </p>
)}
```

- [ ] **Step 2: Verify in dev**

Test the no-data path locally: temporarily comment out the `getForecastHistory` call and pass an empty history. Confirm the friendly message renders. Restore.

For the no-scenarios path: with real Plaid data but no saved scenarios, confirm the hint appears and the chart still renders the baseline.

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/simulator/simulator-client.tsx
git commit -m "feat(simulator): empty-state handling for no-data + no-scenarios

Two cases: (1) user has zero history → friendly 'wait for sync' card
instead of a degenerate chart. (2) user has data but no saved scenarios
→ a one-liner hint pointing at the Save button."
```

---

### Task 17: Responsive single-column collapse

**Files:**
- Modify: `src/app/(app)/simulator/simulator-client.tsx`

Below `md` breakpoint (768px), the 2-column grid should stack: override editor on top, chart + goal cards below. No fancy bottom-sheet — just stack and let the user scroll.

- [ ] **Step 1: Replace the grid class with a responsive variant**

In `simulator-client.tsx`, find the grid div and update:

```tsx
// Before:
<div className="grid grid-cols-[260px_1fr] gap-10">

// After:
<div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-6 md:gap-10">
```

Also reduce header bottom margin on small screens:

```tsx
// In ScenarioHeader: change "mb-8" → "mb-6 md:mb-8"
```

- [ ] **Step 2: Verify in dev**

Resize browser to <768px. Expected: override editor stacks above the chart. Above 768px: side-by-side as before.

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/simulator/simulator-client.tsx
git commit -m "feat(simulator): responsive single-column collapse below md breakpoint

Override editor stacks above chart on mobile. No bespoke mobile UI —
just graceful single-column flow until usage data warrants a redesign."
```

---

### Task 18: Update CLAUDE.md roadmap

**Files:**
- Modify: `CLAUDE.md` (Roadmap section)

- [ ] **Step 1: Add Plan B-1 entry under "Done"**

Add as the last item in `### Done`:

```markdown
- **Phase 4-B1 — Simulator UI shell** (2026-XX-XX) — `/simulator`
  page on top of Plan A's engine. Override editor (7 collapsible
  sections: categories, lump sums, recurring changes, income,
  hypothetical goals, goal target edits, skip recurring). Forecast
  chart (Recharts, baseline + scenario overlay). Goal diff cards
  with direction pills. Scenario header with selector + Save +
  Delete via existing scenario CRUD actions. No AI narration yet —
  Plan B-2 next.
```

(Replace `2026-XX-XX` with today's date when committing.)

- [ ] **Step 2: Update "Next up" to point to Plan B-2**

Replace the "Phase 4-B" entry with:

```markdown
- **Phase 4-B2 — AI coaching narrative for simulator** — adds
  AI-generated 3-5 sentence summary panel to /simulator. Anthropic
  Haiku 4.5 via existing `src/lib/anthropic/client.ts`. Cache key =
  SHA-256 of (overrides + history fingerprint). New `forecast_narrative`
  table already exists from Plan A Task 1. Spec §7 covers prompt
  shape, model, caching, failure handling.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude.md): record Phase 4-B1 shipment + queue Phase 4-B2"
```

---

## Self-Review Checklist (run mentally after writing all tasks)

- ✅ **Spec coverage:** Every spec section in scope for Plan B-1 has a task. (Spec §6 UI structure → Tasks 5-15. §7 AI narration deferred to Plan B-2 explicitly.)
- ✅ **No placeholders:** Every step has concrete code or a runnable command. The single date placeholder in Task 18 is clearly marked for substitution at commit time.
- ✅ **Type consistency:** `ScenarioOverrides`, `ForecastHistory`, `GoalImpact`, `MonthlyProjection`, `Scenario`, `ProjectionResult` all referenced consistently from Plan A. Component prop types referenced consistently across the wiring tasks.
- ✅ **Bite-sized:** Each step is one action.
- ✅ **TDD where applicable:** Override helpers (Task 2) get vitest tests. UI components verified manually per project convention (no RTL).
- ✅ **Frequent commits:** Each task ends with a focused commit; no task without a commit.

---

## Appendix — Plan B-2 preview (not in this plan)

After Plan B-1 ships, Plan B-2 will add:

1. History fingerprint module (`src/lib/forecast/history-fingerprint.ts` + tests)
2. Forecast prompt builder (`src/lib/anthropic/forecast-prompt.ts` + tests)
3. AI narration server action + Anthropic call (`src/lib/anthropic/forecast-narrative.ts`)
4. Cache lookup + write logic (in the same file, using the existing `forecast_narrative` table)
5. NarrativePanel UI component
6. Wire panel into simulator-client.tsx (pass `engineResult` + scenario id; manual Generate button + cached prose display)

Approximately 5-6 tasks. Will be written against the actual built B-1 foundation.
