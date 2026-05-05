# Phase 4-A: Engine + Persistence + Sidebar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the cash-forecast engine, scenario persistence, and sidebar grouping for Phase 4. Engine is fully tested. Scenarios save/load. Sidebar reorganized into Today/Plan/Records groups with brand fix. No `/simulator` page yet — that's Plan B.

**Architecture:** Pure `projectCash(input) → ProjectionResult` engine living in `src/lib/forecast/`. Composes baseline projection (recurring streams + trailing 3-month median for non-recurring) with deterministic override application in a fixed order. Scenarios persisted in a new `scenario` table; `forecast_narrative` table created here too (consumed by Plan B). Sidebar grouped via a `navGroups` array in `app-sidebar.tsx`.

**Tech Stack:** TypeScript · Drizzle ORM (Postgres jsonb) · Zod · Vitest (existing test runner from Phase 5 commit `5adf667`) · `node:crypto` for SHA-256 (Plan B) · Next.js 14 server actions.

**Spec reference:** `docs/superpowers/specs/2026-05-04-phase-4-predictive-layer-design.md`

---

## File Structure

```
src/lib/db/schema.ts                       MODIFY  add scenarios + forecastNarratives tables
src/lib/db/queries/forecast.ts             CREATE  history slice readers (no test — DB-bound)

src/lib/forecast/
  ├─ types.ts                              CREATE  ScenarioOverrides, ForecastHistory, MonthlyProjection, GoalImpact, ProjectionResult
  ├─ baseline.ts                           CREATE  baseline projection: recurring + trailing median
  ├─ baseline.test.ts                      CREATE  vitest unit tests
  ├─ apply-overrides.ts                    CREATE  apply{Categories,Income,Recurring,SkipRecurring,LumpSums}Override
  ├─ apply-overrides.test.ts               CREATE  vitest unit tests
  ├─ goal-projection.ts                    CREATE  computeGoalImpacts for real + hypothetical goals
  ├─ goal-projection.test.ts               CREATE  vitest unit tests
  ├─ engine.ts                             CREATE  projectCash entry point composing baseline + overrides + goals
  ├─ engine.test.ts                        CREATE  integration tests (all 7 override types stacked)
  ├─ scenario-zod.ts                       CREATE  zod schemas for ScenarioOverrides validation at action boundary
  └─ scenario-actions.ts                   CREATE  server actions: createScenario, updateScenario, deleteScenario

src/components/nav/app-sidebar.tsx         MODIFY  flat navItems → grouped navGroups; brand "Finance" → "Foothold"
```

Total: 1 modify (schema), 1 create (queries — no test), 11 creates in `forecast/` (5 source + 5 test + 1 zod + 1 actions = correction: 5 source + 5 test + 1 actions = 11; zod is part of the 5 source count), 1 modify (sidebar). 14 file changes total.

---

## Wave 1 — Foundation

### Task 1: Add `scenario` and `forecast_narrative` tables to schema

**Files:**
- Modify: `src/lib/db/schema.ts`
- Modify (briefly, then revert): `drizzle.config.ts` (flip `strict: true` → `false` for `db:push`)

**Why two tables in this plan when only `scenario` is used here?** Plan B's AI narration needs `forecast_narrative`. Adding both at once means one `db:push` cycle instead of two; lower friction for Plan B handoff.

- [ ] **Step 1: Read existing schema for conventions**

Run: `grep -n "ts(\|pgTable\|index()\|uniqueIndex()\|jsonb" src/lib/db/schema.ts | head -40`

Expected: see existing usage of `ts()` helper for timestamps (`timestamp with time zone`), `pgTable('table_name', {...}, (t) => ({...}))` shape, and how indexes are declared. Confirm the existing import block at top of file has `jsonb`, `uniqueIndex`, `index` available; if not, add them.

- [ ] **Step 2: Add the two table definitions**

Append to `src/lib/db/schema.ts` (place after `errorLog`, before any helper exports):

```ts
export const scenarios = pgTable(
  'scenario',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    overrides: jsonb('overrides').notNull().default({}),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => ({
    userUpdatedIdx: index().on(t.userId, t.updatedAt.desc()),
  }),
);

export type Scenario = typeof scenarios.$inferSelect;
export type ScenarioInsert = typeof scenarios.$inferInsert;

export const forecastNarratives = pgTable(
  'forecast_narrative',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    scenarioId: uuid('scenario_id')
      .notNull()
      .references(() => scenarios.id, { onDelete: 'cascade' }),
    inputHash: text('input_hash').notNull(),
    narrative: text('narrative').notNull(),
    generatedAt: ts('generated_at').notNull().defaultNow(),
  },
  (t) => ({
    scenarioHashIdx: uniqueIndex().on(t.scenarioId, t.inputHash),
  }),
);

export type ForecastNarrative = typeof forecastNarratives.$inferSelect;
```

Note: the `overrides` column is plain `jsonb` (not `jsonb('overrides').$type<ScenarioOverrides>()`) because the type lives in `src/lib/forecast/types.ts` (Task 2) and importing it into schema would create a circular concern. The type is enforced at server-action boundaries via zod (Task 12) instead.

- [ ] **Step 3: Run typecheck to confirm schema additions compile**

Run: `npm run typecheck`

Expected: PASS (no errors). If errors mention missing `jsonb`/`uniqueIndex`/`index` imports, add them to the existing `import { ... } from 'drizzle-orm/pg-core'` line at the top of `schema.ts`.

- [ ] **Step 4: Flip `strict: true` → `false` in drizzle.config.ts**

Per CLAUDE.md "Don't feed db:push via stdin when strict: true" lesson, the interactive arrow-key prompt blocks scripted input. Find the `strict: true` line in `drizzle.config.ts` and change to `strict: false`.

- [ ] **Step 5: Push schema to Supabase**

Run: `npm run db:push`

Expected: output mentions creating `scenario` and `forecast_narrative` tables; ends with success message. If it complains about existing data conflicts, abort and inspect — should not happen for new tables.

- [ ] **Step 6: Flip `strict` back to `true`**

Edit `drizzle.config.ts`: `strict: false` → `strict: true`. This matters: keeping strict on protects future schema changes from silent data loss.

- [ ] **Step 7: Verify in Supabase Studio (optional but recommended)**

Run: `npm run db:studio`

Open the URL shown; confirm `scenario` and `forecast_narrative` tables exist with the columns and indexes specified. Close studio when done.

- [ ] **Step 8: Commit**

```bash
git add src/lib/db/schema.ts drizzle.config.ts
git commit -m "feat(schema): add scenario + forecast_narrative tables (Phase 4-A)

Two new tables:
- scenario: stores named what-if scenarios with override JSON
- forecast_narrative: cache for AI summaries (consumed in Plan B)

Followed CLAUDE.md db:push lesson (flip strict false → push → flip back)."
```

---

### Task 2: Engine type definitions

**Files:**
- Create: `src/lib/forecast/types.ts`

No tests — pure type definitions. The first vitest task (Task 4) will exercise these types and surface any signature mistakes.

- [ ] **Step 1: Create the types file**

```ts
// src/lib/forecast/types.ts

/**
 * What the user can override when constructing a what-if scenario.
 * Persisted as jsonb in the `scenario.overrides` column.
 * Validated at server-action boundaries via zod (see scenario-zod.ts).
 */
export type ScenarioOverrides = {
  /** Default 12. Saved scenarios may carry their own preference. */
  horizonMonths?: number;

  /** Per-category monthly $ change. Negative = cut, positive = increase. */
  categoryDeltas?: Array<{
    categoryId: string;
    monthlyDelta: number;
    startMonth?: string; // YYYY-MM, default = next month after currentMonth
    endMonth?: string;   // YYYY-MM, default = horizon end
  }>;

  /** One-time cash events. */
  lumpSums?: Array<{
    id: string;     // client-generated stable id (React keys)
    label: string;
    amount: number; // positive = inflow, negative = outflow
    month: string;  // YYYY-MM
  }>;

  /** Recurring stream changes — pause/edit existing or add hypothetical. */
  recurringChanges?: Array<{
    streamId?: string; // existing stream id; null/undefined when action='add'
    action: 'pause' | 'edit' | 'add';
    label?: string;
    amount?: number;
    direction?: 'inflow' | 'outflow';
    cadence?: 'weekly' | 'biweekly' | 'monthly';
    startMonth?: string;
    endMonth?: string;
  }>;

  /** Income delta (separated from categoryDeltas because income isn't categorized). */
  incomeDelta?: { monthlyDelta: number; startMonth?: string; endMonth?: string };

  /** Hypothetical goals — don't exist in DB, live only inside the scenario. */
  hypotheticalGoals?: Array<{
    id: string;     // client-generated
    name: string;
    targetAmount: number;
    targetDate?: string; // YYYY-MM-DD
    monthlyContribution?: number;
  }>;

  /** Edits to existing real goals — DO NOT mutate the goal table; only override in projection. */
  goalTargetEdits?: Array<{
    goalId: string;
    newTargetAmount?: number;
    newTargetDate?: string;
    newMonthlyContribution?: number;
  }>;

  /** Skip specific upcoming recurring instances. */
  skipRecurringInstances?: Array<{
    streamId: string;
    skipMonth: string; // YYYY-MM
  }>;
};

/**
 * Read-only snapshot of the user's current state, prepared by
 * `src/lib/db/queries/forecast.ts` and passed into `projectCash`.
 */
export type ForecastHistory = {
  /** Sum of current liquid account balances (checking + savings). */
  currentCash: number;

  /** Active recurring streams with implied future occurrences. */
  recurringStreams: Array<{
    id: string;
    label: string;
    amount: number;            // always positive
    direction: 'inflow' | 'outflow';
    cadence: 'weekly' | 'biweekly' | 'monthly';
    nextDate: string;          // YYYY-MM-DD; first future occurrence
  }>;

  /** Per-category trailing monthly outflow totals. Last N months only (e.g. 3). */
  categoryHistory: Record<string, number[]>; // categoryId → [t-3, t-2, t-1]

  /** Trailing total non-recurring income per month (last N months). */
  nonRecurringIncomeHistory: number[];

  /** Existing real goals. */
  goals: Array<{
    id: string;
    name: string;
    targetAmount: number;
    targetDate: string | null;       // YYYY-MM-DD
    monthlyContribution: number | null;
    currentSaved: number;
  }>;

  /** Category metadata (id → display name) for output composition. */
  categories: Array<{ id: string; name: string }>;
};

/**
 * One row of the engine output. Each row covers one calendar month.
 */
export type MonthlyProjection = {
  month: string;       // YYYY-MM
  startCash: number;   // beginning-of-month
  inflows: number;
  outflows: number;
  endCash: number;     // end-of-month — primary chart series
  byCategory: Record<string, number>;       // outflow per category id
  goalProgress: Record<string, number>;     // dollars accumulated per goal id (real + "hypo:<id>")
};

/**
 * Per-goal summary of how this scenario shifts the ETA vs baseline.
 */
export type GoalImpact = {
  goalId: string;             // real goal id OR "hypo:<uuid>"
  name: string;
  baselineETA: string | null; // YYYY-MM, or null if "never within horizon"
  scenarioETA: string | null;
  shiftMonths: number;        // negative = sooner, positive = later, 0 = same
};

/**
 * Engine input — bundled so the function signature is stable as inputs evolve.
 */
export type ProjectCashInput = {
  history: ForecastHistory;
  overrides: ScenarioOverrides;
  /** Current month YYYY-MM. Passed in so the function stays pure (no Date.now). */
  currentMonth: string;
};

/**
 * Engine output — projection rows + per-goal impact summary.
 */
export type ProjectionResult = {
  projection: MonthlyProjection[];
  goalImpacts: GoalImpact[];
};
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/forecast/types.ts
git commit -m "feat(forecast): add type definitions for engine I/O

ScenarioOverrides matches the schema's jsonb column shape.
ForecastHistory is the read-only input prepared by query layer.
MonthlyProjection / GoalImpact / ProjectionResult are engine outputs."
```

---

### Task 3: Forecast queries module (history slice readers)

**Files:**
- Create: `src/lib/db/queries/forecast.ts`

No test — this module is DB-bound and the existing pattern (see `src/lib/db/queries/dashboard.ts`, `drift.ts`) is to manually verify in dev. Pure logic gets pulled out into the engine and tested there.

- [ ] **Step 1: Read existing query patterns**

Run: `cat src/lib/db/queries/dashboard.ts | head -50`

Note the conventions: `import { db } from '@/lib/db'`, named exports of async functions taking `userId`, returning typed shapes. No throwing on empty — return empty arrays. Use Drizzle's `eq`, `and`, `desc`, `gte` helpers.

- [ ] **Step 2: Implement `getForecastHistory`**

```ts
// src/lib/db/queries/forecast.ts
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  categories,
  financialAccounts,
  goals,
  recurringStreams,
  transactions,
} from '@/lib/db/schema';
import type { ForecastHistory } from '@/lib/forecast/types';

const TRAILING_MONTHS = 3;

/**
 * Build a snapshot of the user's current state for the forecast engine.
 *
 * - currentCash: sum of current balances on liquid accounts (checking + savings).
 *   Investment accounts excluded — Phase 4-pt2 territory.
 * - categoryHistory: for each category the user has spent in over the last
 *   TRAILING_MONTHS, an array of monthly outflow totals (oldest first).
 *   Recurring transactions are EXCLUDED so we don't double-count when the
 *   engine projects recurring streams separately.
 * - nonRecurringIncomeHistory: monthly totals of income not tied to a
 *   recurring stream.
 * - goals: all active goals with currentSaved derived from the same
 *   query the goals page uses.
 *
 * Returns empty arrays where data is missing — caller handles gracefully.
 */
export async function getForecastHistory(userId: string): Promise<ForecastHistory> {
  const now = new Date();
  const sinceDate = new Date(now.getFullYear(), now.getMonth() - TRAILING_MONTHS, 1);

  const [
    accountRows,
    streamRows,
    txRows,
    goalRows,
    categoryRows,
  ] = await Promise.all([
    db
      .select({ balance: financialAccounts.currentBalance, type: financialAccounts.type })
      .from(financialAccounts)
      .where(eq(financialAccounts.userId, userId)),
    db
      .select()
      .from(recurringStreams)
      .where(and(eq(recurringStreams.userId, userId), eq(recurringStreams.status, 'active'))),
    db
      .select({
        amount: transactions.amount,
        categoryId: transactions.categoryId,
        occurredAt: transactions.occurredAt,
        recurringStreamId: transactions.recurringStreamId,
      })
      .from(transactions)
      .where(and(eq(transactions.userId, userId), gte(transactions.occurredAt, sinceDate))),
    db.select().from(goals).where(eq(goals.userId, userId)),
    db.select({ id: categories.id, name: categories.name }).from(categories).where(eq(categories.userId, userId)),
  ]);

  const currentCash = accountRows
    .filter((a) => a.type === 'depository')
    .reduce((sum, a) => sum + Number(a.balance ?? 0), 0);

  // Bucket non-recurring transactions by (category, monthIndex) where monthIndex
  // is months-ago: 0 = current month, 1 = last month, 2 = month before, 3 = earliest.
  // We keep monthIndex 1..TRAILING_MONTHS as our trailing window.
  const categoryHistory: Record<string, number[]> = {};
  const incomeBuckets: number[] = Array(TRAILING_MONTHS).fill(0);

  for (const tx of txRows) {
    if (tx.recurringStreamId) continue; // engine projects these separately
    const txDate = new Date(tx.occurredAt);
    const monthsAgo =
      (now.getFullYear() - txDate.getFullYear()) * 12 +
      (now.getMonth() - txDate.getMonth());
    if (monthsAgo < 1 || monthsAgo > TRAILING_MONTHS) continue;
    const idx = TRAILING_MONTHS - monthsAgo; // 0 = oldest, last = most recent

    const amount = Number(tx.amount);
    // Sign convention: positive = outflow, negative = inflow (per CLAUDE.md).
    if (amount > 0) {
      // outflow → category bucket
      if (!tx.categoryId) continue;
      if (!categoryHistory[tx.categoryId]) {
        categoryHistory[tx.categoryId] = Array(TRAILING_MONTHS).fill(0);
      }
      categoryHistory[tx.categoryId][idx] += amount;
    } else {
      // inflow → non-recurring income bucket
      incomeBuckets[idx] += -amount;
    }
  }

  return {
    currentCash,
    recurringStreams: streamRows.map((s) => ({
      id: s.id,
      label: s.label,
      amount: Number(s.amount),
      direction: s.direction as 'inflow' | 'outflow',
      cadence: s.cadence as 'weekly' | 'biweekly' | 'monthly',
      nextDate: s.nextDate ? new Date(s.nextDate).toISOString().slice(0, 10) : '',
    })),
    categoryHistory,
    nonRecurringIncomeHistory: incomeBuckets,
    goals: goalRows.map((g) => ({
      id: g.id,
      name: g.name,
      targetAmount: Number(g.targetAmount),
      targetDate: g.targetDate ? new Date(g.targetDate).toISOString().slice(0, 10) : null,
      monthlyContribution: g.monthlyContribution !== null ? Number(g.monthlyContribution) : null,
      currentSaved: Number(g.currentSaved ?? 0),
    })),
    categories: categoryRows,
  };
}
```

- [ ] **Step 2.5: Verify schema column names exist**

The implementation above assumes `financialAccounts.currentBalance`, `financialAccounts.type`, `recurringStreams.status`, `recurringStreams.label`, `recurringStreams.nextDate`, `transactions.recurringStreamId`, `goals.currentSaved`, `goals.monthlyContribution`. Run:

```bash
grep -E "currentBalance|recurringStreamId|nextDate|currentSaved|monthlyContribution" src/lib/db/schema.ts
```

If any are missing or named differently, adjust the query to use the actual column names. Update the implementation accordingly.

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`

Expected: PASS. Fix any column name mismatches surfaced by the type checker.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/queries/forecast.ts
git commit -m "feat(forecast): add history slice query (3 trailing months)

Returns ForecastHistory: current liquid cash, active recurring streams,
per-category non-recurring monthly outflow totals, non-recurring
income totals, and active goals. Caller handles empty data gracefully."
```

---

## Wave 2 — Engine

### Task 4: Baseline projection (recurring + trailing median)

**Files:**
- Create: `src/lib/forecast/baseline.ts`
- Create: `src/lib/forecast/baseline.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/forecast/baseline.test.ts
import { describe, expect, it } from 'vitest';
import { computeBaseline, median } from './baseline';
import type { ForecastHistory } from './types';

describe('median', () => {
  it('returns 0 for an empty array', () => {
    expect(median([])).toBe(0);
  });

  it('returns the only value for a single-element array', () => {
    expect(median([100])).toBe(100);
  });

  it('returns the middle value for an odd-length array', () => {
    expect(median([1, 5, 3])).toBe(3);
  });

  it('returns the average of the two middle values for an even-length array', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it('ignores order — same result regardless of input order', () => {
    expect(median([10, 1, 5, 3, 8])).toBe(5);
  });
});

describe('computeBaseline', () => {
  const baseHistory: ForecastHistory = {
    currentCash: 10_000,
    recurringStreams: [],
    categoryHistory: {},
    nonRecurringIncomeHistory: [],
    goals: [],
    categories: [],
  };

  it('returns a flat-cash projection when there is no history at all', () => {
    const result = computeBaseline(baseHistory, '2026-05', 3);
    expect(result).toHaveLength(3);
    expect(result[0].endCash).toBe(10_000);
    expect(result[1].endCash).toBe(10_000);
    expect(result[2].endCash).toBe(10_000);
  });

  it('projects category outflows using the trailing median', () => {
    const history: ForecastHistory = {
      ...baseHistory,
      categoryHistory: { dining: [200, 800, 200] }, // median = 200, mean = 400
      categories: [{ id: 'dining', name: 'Dining' }],
    };
    const result = computeBaseline(history, '2026-05', 1);
    expect(result[0].outflows).toBe(200); // median, not mean — outlier 800 ignored
    expect(result[0].byCategory.dining).toBe(200);
    expect(result[0].endCash).toBe(9_800);
  });

  it('projects recurring monthly outflow streams as-is', () => {
    const history: ForecastHistory = {
      ...baseHistory,
      recurringStreams: [
        {
          id: 's1',
          label: 'Rent',
          amount: 2000,
          direction: 'outflow',
          cadence: 'monthly',
          nextDate: '2026-05-01',
        },
      ],
    };
    const result = computeBaseline(history, '2026-05', 2);
    expect(result[0].outflows).toBe(2000);
    expect(result[1].outflows).toBe(2000);
  });

  it('uses median for non-recurring income too', () => {
    const history: ForecastHistory = {
      ...baseHistory,
      nonRecurringIncomeHistory: [500, 0, 500], // median = 500
    };
    const result = computeBaseline(history, '2026-05', 1);
    expect(result[0].inflows).toBe(500);
    expect(result[0].endCash).toBe(10_500);
  });

  it('chains startCash → endCash across months', () => {
    const history: ForecastHistory = {
      ...baseHistory,
      currentCash: 5000,
      categoryHistory: { dining: [100, 100, 100] },
      categories: [{ id: 'dining', name: 'Dining' }],
    };
    const result = computeBaseline(history, '2026-05', 3);
    expect(result[0].startCash).toBe(5000);
    expect(result[0].endCash).toBe(4900);
    expect(result[1].startCash).toBe(4900);
    expect(result[1].endCash).toBe(4800);
    expect(result[2].startCash).toBe(4800);
    expect(result[2].endCash).toBe(4700);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npm test -- baseline`

Expected: All FAIL with "computeBaseline is not a function" / "median is not a function" — module doesn't exist yet.

- [ ] **Step 3: Implement baseline**

```ts
// src/lib/forecast/baseline.ts
import type { ForecastHistory, MonthlyProjection } from './types';

/**
 * Outlier-robust central tendency. Empty array → 0.
 * One $800 vet bill in a 3-month window of [200, 800, 200] should not make
 * the projection think Veterinary is a $400/mo recurring spend. Median ignores it.
 */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Compute the baseline projection (no overrides applied).
 *
 * For each future month within the horizon:
 *   - recurring streams projected as-known (monthly cadence assumed for v1;
 *     weekly/biweekly approximated as 4.33×/2.17× monthly equivalent)
 *   - non-recurring outflows per category = trailing median
 *   - non-recurring income = trailing median
 *
 * @param history input snapshot from getForecastHistory
 * @param currentMonth YYYY-MM — engine never reads Date.now()
 * @param horizonMonths number of months ahead to project
 */
export function computeBaseline(
  history: ForecastHistory,
  currentMonth: string,
  horizonMonths: number,
): MonthlyProjection[] {
  // Pre-compute per-category and income medians (constant across months).
  const categoryBaseline: Record<string, number> = {};
  for (const [categoryId, monthly] of Object.entries(history.categoryHistory)) {
    categoryBaseline[categoryId] = median(monthly);
  }
  const incomeBaseline = median(history.nonRecurringIncomeHistory);

  // Pre-compute recurring totals per direction.
  let recurringMonthlyOutflow = 0;
  let recurringMonthlyInflow = 0;
  for (const stream of history.recurringStreams) {
    const monthlyEquivalent =
      stream.cadence === 'weekly'
        ? stream.amount * 4.333
        : stream.cadence === 'biweekly'
          ? stream.amount * 2.167
          : stream.amount;
    if (stream.direction === 'outflow') recurringMonthlyOutflow += monthlyEquivalent;
    else recurringMonthlyInflow += monthlyEquivalent;
  }

  const projection: MonthlyProjection[] = [];
  let runningCash = history.currentCash;

  for (let i = 0; i < horizonMonths; i++) {
    const month = addMonths(currentMonth, i + 1); // skip current month; project forward
    const startCash = runningCash;

    const inflows = recurringMonthlyInflow + incomeBaseline;
    const outflows =
      recurringMonthlyOutflow +
      Object.values(categoryBaseline).reduce((s, v) => s + v, 0);
    const endCash = startCash + inflows - outflows;

    projection.push({
      month,
      startCash,
      inflows,
      outflows,
      endCash,
      byCategory: { ...categoryBaseline },
      goalProgress: {}, // populated by goal-projection step (Task 10)
    });

    runningCash = endCash;
  }

  return projection;
}

/** Add `n` months to a YYYY-MM string. Pure. */
export function addMonths(month: string, n: number): string {
  const [yStr, mStr] = month.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  const total = y * 12 + (m - 1) + n;
  const newY = Math.floor(total / 12);
  const newM = (total % 12) + 1;
  return `${newY}-${String(newM).padStart(2, '0')}`;
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `npm test -- baseline`

Expected: All 11 tests PASS (5 median + 6 computeBaseline).

- [ ] **Step 5: Commit**

```bash
git add src/lib/forecast/baseline.ts src/lib/forecast/baseline.test.ts
git commit -m "feat(forecast): baseline projection (recurring + trailing median)

Pure function. Outlier-robust via median (vet bill spike doesn't
inflate steady-state projection). Recurring streams projected as
monthly equivalents (weekly × 4.333, biweekly × 2.167)."
```

---

### Task 5: Apply category deltas

**Files:**
- Create: `src/lib/forecast/apply-overrides.ts`
- Create: `src/lib/forecast/apply-overrides.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/forecast/apply-overrides.test.ts
import { describe, expect, it } from 'vitest';
import { applyCategoryDeltas } from './apply-overrides';
import type { MonthlyProjection } from './types';

function makeProjection(months: string[]): MonthlyProjection[] {
  return months.map((month) => ({
    month,
    startCash: 1000,
    inflows: 0,
    outflows: 100,
    endCash: 900,
    byCategory: { dining: 100 },
    goalProgress: {},
  }));
}

describe('applyCategoryDeltas', () => {
  it('returns input unchanged when no deltas are provided', () => {
    const proj = makeProjection(['2026-05', '2026-06']);
    const result = applyCategoryDeltas(proj, undefined);
    expect(result).toEqual(proj);
  });

  it('reduces a category outflow by the delta amount across all months by default', () => {
    const proj = makeProjection(['2026-05', '2026-06']);
    const result = applyCategoryDeltas(proj, [
      { categoryId: 'dining', monthlyDelta: -50 },
    ]);
    expect(result[0].byCategory.dining).toBe(50);
    expect(result[0].outflows).toBe(50);
    expect(result[0].endCash).toBe(950);
    expect(result[1].byCategory.dining).toBe(50);
    expect(result[1].endCash).toBe(950);
  });

  it('respects startMonth — delta only applies from startMonth forward', () => {
    const proj = makeProjection(['2026-05', '2026-06', '2026-07']);
    const result = applyCategoryDeltas(proj, [
      { categoryId: 'dining', monthlyDelta: -50, startMonth: '2026-06' },
    ]);
    expect(result[0].byCategory.dining).toBe(100); // unchanged
    expect(result[1].byCategory.dining).toBe(50);  // applied
    expect(result[2].byCategory.dining).toBe(50);  // applied
  });

  it('respects endMonth — delta does not apply past endMonth', () => {
    const proj = makeProjection(['2026-05', '2026-06', '2026-07']);
    const result = applyCategoryDeltas(proj, [
      { categoryId: 'dining', monthlyDelta: -50, endMonth: '2026-06' },
    ]);
    expect(result[0].byCategory.dining).toBe(50);  // applied
    expect(result[1].byCategory.dining).toBe(50);  // applied
    expect(result[2].byCategory.dining).toBe(100); // unchanged
  });

  it('chains endCash forward correctly when delta applied mid-horizon', () => {
    const proj = makeProjection(['2026-05', '2026-06', '2026-07']);
    const result = applyCategoryDeltas(proj, [
      { categoryId: 'dining', monthlyDelta: -50, startMonth: '2026-06' },
    ]);
    // Month 0: outflow stays 100, endCash 900
    // Month 1: outflow 50, but startCash should chain from month 0 endCash (900)
    //   then 900 + 0 - 50 = 850
    // Month 2: 850 + 0 - 50 = 800
    expect(result[0].endCash).toBe(900);
    expect(result[1].startCash).toBe(900);
    expect(result[1].endCash).toBe(850);
    expect(result[2].startCash).toBe(850);
    expect(result[2].endCash).toBe(800);
  });

  it('does not produce negative outflows even with a large positive delta input mistake', () => {
    const proj = makeProjection(['2026-05']);
    const result = applyCategoryDeltas(proj, [
      { categoryId: 'dining', monthlyDelta: -500 }, // larger than baseline
    ]);
    // Outflow can't go below 0 for a category
    expect(result[0].byCategory.dining).toBe(0);
    expect(result[0].outflows).toBe(0);
    expect(result[0].endCash).toBe(1000);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npm test -- apply-overrides`

Expected: FAIL with "applyCategoryDeltas is not a function".

- [ ] **Step 3: Implement applyCategoryDeltas**

```ts
// src/lib/forecast/apply-overrides.ts
import type { MonthlyProjection, ScenarioOverrides } from './types';

/**
 * Apply category deltas. Positive delta = increase that category's outflow
 * for affected months; negative = cut. Floor at 0 (a category can't have
 * negative outflow even if the user enters a delta larger than baseline).
 *
 * Recomputes endCash chain as the function progresses.
 */
export function applyCategoryDeltas(
  projection: MonthlyProjection[],
  deltas: ScenarioOverrides['categoryDeltas'],
): MonthlyProjection[] {
  if (!deltas || deltas.length === 0) return projection;

  const result: MonthlyProjection[] = [];
  let runningCash =
    projection.length > 0 ? projection[0].startCash : 0;

  for (const month of projection) {
    let outflowDelta = 0;
    const newByCategory = { ...month.byCategory };

    for (const d of deltas) {
      if (d.startMonth && month.month < d.startMonth) continue;
      if (d.endMonth && month.month > d.endMonth) continue;

      const current = newByCategory[d.categoryId] ?? 0;
      const adjusted = Math.max(0, current + d.monthlyDelta);
      const actualDelta = adjusted - current;
      newByCategory[d.categoryId] = adjusted;
      outflowDelta += actualDelta;
    }

    const newOutflows = month.outflows + outflowDelta;
    const startCash = runningCash;
    const endCash = startCash + month.inflows - newOutflows;
    result.push({
      ...month,
      startCash,
      outflows: newOutflows,
      endCash,
      byCategory: newByCategory,
    });
    runningCash = endCash;
  }

  return result;
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `npm test -- apply-overrides`

Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/forecast/apply-overrides.ts src/lib/forecast/apply-overrides.test.ts
git commit -m "feat(forecast): applyCategoryDeltas with month-range gating

Negative delta clamps category outflow at 0. endCash chain is
recomputed left-to-right so downstream months see the correct
startCash."
```

---

### Task 6: Apply income delta

**Files:**
- Modify: `src/lib/forecast/apply-overrides.ts`
- Modify: `src/lib/forecast/apply-overrides.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `src/lib/forecast/apply-overrides.test.ts`:

```ts
import { applyIncomeDelta } from './apply-overrides';

describe('applyIncomeDelta', () => {
  it('returns input unchanged when no income delta', () => {
    const proj = makeProjection(['2026-05']);
    expect(applyIncomeDelta(proj, undefined)).toEqual(proj);
  });

  it('adds positive monthlyDelta to inflows for all months by default', () => {
    const proj = makeProjection(['2026-05', '2026-06']);
    const result = applyIncomeDelta(proj, { monthlyDelta: 500 });
    expect(result[0].inflows).toBe(500); // baseline 0 + 500
    expect(result[0].endCash).toBe(1400); // 1000 + 500 - 100
    expect(result[1].inflows).toBe(500);
    expect(result[1].startCash).toBe(1400);
    expect(result[1].endCash).toBe(1800);
  });

  it('subtracts negative monthlyDelta from inflows (income drop)', () => {
    const proj = makeProjection(['2026-05']);
    const withIncome = proj.map((m) => ({ ...m, inflows: 1000, endCash: 1900 }));
    const result = applyIncomeDelta(withIncome, { monthlyDelta: -300 });
    expect(result[0].inflows).toBe(700);
    expect(result[0].endCash).toBe(1600); // 1000 + 700 - 100
  });

  it('respects startMonth/endMonth bounds', () => {
    const proj = makeProjection(['2026-05', '2026-06', '2026-07']);
    const result = applyIncomeDelta(proj, {
      monthlyDelta: 500,
      startMonth: '2026-06',
      endMonth: '2026-06',
    });
    expect(result[0].inflows).toBe(0);
    expect(result[1].inflows).toBe(500);
    expect(result[2].inflows).toBe(0);
  });

  it('clamps inflows at 0 (income can never be negative)', () => {
    const proj = makeProjection(['2026-05']);
    const result = applyIncomeDelta(proj, { monthlyDelta: -10_000 });
    expect(result[0].inflows).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests, see them fail**

Run: `npm test -- apply-overrides`

Expected: 5 new tests FAIL with "applyIncomeDelta is not a function".

- [ ] **Step 3: Implement applyIncomeDelta**

Append to `src/lib/forecast/apply-overrides.ts`:

```ts
export function applyIncomeDelta(
  projection: MonthlyProjection[],
  delta: ScenarioOverrides['incomeDelta'],
): MonthlyProjection[] {
  if (!delta) return projection;

  const result: MonthlyProjection[] = [];
  let runningCash = projection.length > 0 ? projection[0].startCash : 0;

  for (const month of projection) {
    const inRange =
      (!delta.startMonth || month.month >= delta.startMonth) &&
      (!delta.endMonth || month.month <= delta.endMonth);
    const newInflows = inRange
      ? Math.max(0, month.inflows + delta.monthlyDelta)
      : month.inflows;
    const startCash = runningCash;
    const endCash = startCash + newInflows - month.outflows;
    result.push({ ...month, startCash, inflows: newInflows, endCash });
    runningCash = endCash;
  }

  return result;
}
```

- [ ] **Step 4: Run tests, all green**

Run: `npm test -- apply-overrides`

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/forecast/apply-overrides.ts src/lib/forecast/apply-overrides.test.ts
git commit -m "feat(forecast): applyIncomeDelta with range bounds + clamp at 0"
```

---

### Task 7: Apply recurring stream changes (pause / edit / add)

**Files:**
- Modify: `src/lib/forecast/apply-overrides.ts`
- Modify: `src/lib/forecast/apply-overrides.test.ts`

This override is the trickiest because it can affect both inflows AND outflows AND the recurring baseline implicitly. Strategy: receive `recurringStreams` (the original baseline list) so the function can recompute the recurring contribution per month with overrides applied.

- [ ] **Step 1: Add failing tests**

Append to `src/lib/forecast/apply-overrides.test.ts`:

```ts
import { applyRecurringChanges } from './apply-overrides';
import type { ForecastHistory } from './types';

const baseStreams: ForecastHistory['recurringStreams'] = [
  { id: 'rent', label: 'Rent', amount: 2000, direction: 'outflow', cadence: 'monthly', nextDate: '2026-05-01' },
  { id: 'salary', label: 'Salary', amount: 5000, direction: 'inflow', cadence: 'monthly', nextDate: '2026-05-15' },
];

describe('applyRecurringChanges', () => {
  it('returns input unchanged when no changes', () => {
    const proj = makeProjection(['2026-05']);
    expect(applyRecurringChanges(proj, baseStreams, undefined)).toEqual(proj);
  });

  it('pause action: removes a stream from all months', () => {
    const proj: MonthlyProjection[] = [
      { month: '2026-05', startCash: 1000, inflows: 5000, outflows: 2000, endCash: 4000, byCategory: {}, goalProgress: {} },
    ];
    const result = applyRecurringChanges(proj, baseStreams, [
      { streamId: 'rent', action: 'pause' },
    ]);
    expect(result[0].outflows).toBe(0);
    expect(result[0].endCash).toBe(6000);
  });

  it('edit action: modifies amount on a stream', () => {
    const proj: MonthlyProjection[] = [
      { month: '2026-05', startCash: 1000, inflows: 5000, outflows: 2000, endCash: 4000, byCategory: {}, goalProgress: {} },
    ];
    const result = applyRecurringChanges(proj, baseStreams, [
      { streamId: 'rent', action: 'edit', amount: 1800 },
    ]);
    expect(result[0].outflows).toBe(1800);
  });

  it('add action: adds a hypothetical stream', () => {
    const proj: MonthlyProjection[] = [
      { month: '2026-05', startCash: 1000, inflows: 5000, outflows: 2000, endCash: 4000, byCategory: {}, goalProgress: {} },
    ];
    const result = applyRecurringChanges(proj, baseStreams, [
      {
        action: 'add',
        label: 'Gym',
        amount: 200,
        direction: 'outflow',
        cadence: 'monthly',
      },
    ]);
    expect(result[0].outflows).toBe(2200);
    expect(result[0].endCash).toBe(3800);
  });

  it('respects startMonth on pause/edit', () => {
    const proj: MonthlyProjection[] = [
      { month: '2026-05', startCash: 1000, inflows: 5000, outflows: 2000, endCash: 4000, byCategory: {}, goalProgress: {} },
      { month: '2026-06', startCash: 4000, inflows: 5000, outflows: 2000, endCash: 7000, byCategory: {}, goalProgress: {} },
    ];
    const result = applyRecurringChanges(proj, baseStreams, [
      { streamId: 'rent', action: 'pause', startMonth: '2026-06' },
    ]);
    expect(result[0].outflows).toBe(2000); // unchanged in May
    expect(result[1].outflows).toBe(0);    // paused June
  });
});
```

- [ ] **Step 2: Run tests, see them fail**

Run: `npm test -- apply-overrides`

Expected: 5 new tests FAIL.

- [ ] **Step 3: Implement applyRecurringChanges**

Append to `src/lib/forecast/apply-overrides.ts`:

```ts
import type { ForecastHistory } from './types';

const monthlyEquivalent = (
  amount: number,
  cadence: 'weekly' | 'biweekly' | 'monthly',
): number => {
  if (cadence === 'weekly') return amount * 4.333;
  if (cadence === 'biweekly') return amount * 2.167;
  return amount;
};

/**
 * Apply pause / edit / add changes to recurring streams.
 *
 * Strategy: for each month, compute the (positive or negative) delta to
 * inflows and outflows that the changes produce, then apply.
 *   - pause: subtract the stream's monthly equivalent from its direction
 *   - edit: subtract the original amount + add the new amount (both monthly equivalents)
 *   - add: add the new stream's monthly equivalent
 */
export function applyRecurringChanges(
  projection: MonthlyProjection[],
  baseStreams: ForecastHistory['recurringStreams'],
  changes: ScenarioOverrides['recurringChanges'],
): MonthlyProjection[] {
  if (!changes || changes.length === 0) return projection;

  const baseById = new Map(baseStreams.map((s) => [s.id, s]));
  const result: MonthlyProjection[] = [];
  let runningCash = projection.length > 0 ? projection[0].startCash : 0;

  for (const month of projection) {
    let inflowDelta = 0;
    let outflowDelta = 0;

    for (const change of changes) {
      const inRange =
        (!change.startMonth || month.month >= change.startMonth) &&
        (!change.endMonth || month.month <= change.endMonth);
      if (!inRange) continue;

      if (change.action === 'pause') {
        const original = baseById.get(change.streamId ?? '');
        if (!original) continue;
        const orig = monthlyEquivalent(original.amount, original.cadence);
        if (original.direction === 'outflow') outflowDelta -= orig;
        else inflowDelta -= orig;
      } else if (change.action === 'edit') {
        const original = baseById.get(change.streamId ?? '');
        if (!original) continue;
        const orig = monthlyEquivalent(original.amount, original.cadence);
        const newAmount = change.amount ?? original.amount;
        const newCadence = change.cadence ?? original.cadence;
        const newDirection = change.direction ?? original.direction;
        const next = monthlyEquivalent(newAmount, newCadence);
        // Remove original
        if (original.direction === 'outflow') outflowDelta -= orig;
        else inflowDelta -= orig;
        // Add new
        if (newDirection === 'outflow') outflowDelta += next;
        else inflowDelta += next;
      } else if (change.action === 'add') {
        const next = monthlyEquivalent(
          change.amount ?? 0,
          change.cadence ?? 'monthly',
        );
        if (change.direction === 'outflow') outflowDelta += next;
        else inflowDelta += next;
      }
    }

    const newInflows = Math.max(0, month.inflows + inflowDelta);
    const newOutflows = Math.max(0, month.outflows + outflowDelta);
    const startCash = runningCash;
    const endCash = startCash + newInflows - newOutflows;
    result.push({
      ...month,
      startCash,
      inflows: newInflows,
      outflows: newOutflows,
      endCash,
    });
    runningCash = endCash;
  }

  return result;
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- apply-overrides`

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/forecast/apply-overrides.ts src/lib/forecast/apply-overrides.test.ts
git commit -m "feat(forecast): applyRecurringChanges (pause / edit / add)

Each change produces a delta against the baseline recurring contribution,
applied per-month with range gating. Edit = remove original + add new."
```

---

### Task 8: Apply skipRecurringInstances + lumpSums

**Files:**
- Modify: `src/lib/forecast/apply-overrides.ts`
- Modify: `src/lib/forecast/apply-overrides.test.ts`

These two are mechanical — bundling them in one task to keep the wave count manageable.

- [ ] **Step 1: Add failing tests**

Append to `src/lib/forecast/apply-overrides.test.ts`:

```ts
import { applySkipRecurringInstances, applyLumpSums } from './apply-overrides';

describe('applySkipRecurringInstances', () => {
  it('returns input unchanged when no skips', () => {
    const proj = makeProjection(['2026-05']);
    expect(applySkipRecurringInstances(proj, baseStreams, undefined)).toEqual(proj);
  });

  it('subtracts a one-time outflow stream instance from the specified month', () => {
    const proj: MonthlyProjection[] = [
      { month: '2026-08', startCash: 5000, inflows: 0, outflows: 2000, endCash: 3000, byCategory: {}, goalProgress: {} },
    ];
    const result = applySkipRecurringInstances(proj, baseStreams, [
      { streamId: 'rent', skipMonth: '2026-08' },
    ]);
    expect(result[0].outflows).toBe(0); // Rent skipped — 2000 monthly equivalent removed
    expect(result[0].endCash).toBe(5000);
  });

  it('does not affect other months', () => {
    const proj: MonthlyProjection[] = [
      { month: '2026-08', startCash: 5000, inflows: 0, outflows: 2000, endCash: 3000, byCategory: {}, goalProgress: {} },
      { month: '2026-09', startCash: 3000, inflows: 0, outflows: 2000, endCash: 1000, byCategory: {}, goalProgress: {} },
    ];
    const result = applySkipRecurringInstances(proj, baseStreams, [
      { streamId: 'rent', skipMonth: '2026-08' },
    ]);
    expect(result[1].outflows).toBe(2000); // unchanged
    expect(result[1].startCash).toBe(5000); // chain forward from 5000
    expect(result[1].endCash).toBe(3000);
  });

  it('handles inflow stream skips (e.g. skipping a paycheck)', () => {
    const proj: MonthlyProjection[] = [
      { month: '2026-08', startCash: 5000, inflows: 5000, outflows: 0, endCash: 10000, byCategory: {}, goalProgress: {} },
    ];
    const result = applySkipRecurringInstances(proj, baseStreams, [
      { streamId: 'salary', skipMonth: '2026-08' },
    ]);
    expect(result[0].inflows).toBe(0);
    expect(result[0].endCash).toBe(5000);
  });
});

describe('applyLumpSums', () => {
  it('returns input unchanged when no lump sums', () => {
    const proj = makeProjection(['2026-05']);
    expect(applyLumpSums(proj, undefined)).toEqual(proj);
  });

  it('adds positive amount to inflows in the target month', () => {
    const proj: MonthlyProjection[] = [
      { month: '2026-04', startCash: 1000, inflows: 0, outflows: 0, endCash: 1000, byCategory: {}, goalProgress: {} },
    ];
    const result = applyLumpSums(proj, [
      { id: 'tax', label: 'Tax refund', amount: 2400, month: '2026-04' },
    ]);
    expect(result[0].inflows).toBe(2400);
    expect(result[0].endCash).toBe(3400);
  });

  it('adds negative amount to outflows in the target month', () => {
    const proj: MonthlyProjection[] = [
      { month: '2026-04', startCash: 1000, inflows: 0, outflows: 0, endCash: 1000, byCategory: {}, goalProgress: {} },
    ];
    const result = applyLumpSums(proj, [
      { id: 'vet', label: 'Vet bill', amount: -800, month: '2026-04' },
    ]);
    expect(result[0].outflows).toBe(800);
    expect(result[0].endCash).toBe(200);
  });

  it('ignores lump sums outside the projection range', () => {
    const proj: MonthlyProjection[] = [
      { month: '2026-04', startCash: 1000, inflows: 0, outflows: 0, endCash: 1000, byCategory: {}, goalProgress: {} },
    ];
    const result = applyLumpSums(proj, [
      { id: 'far-future', label: 'Bonus', amount: 10000, month: '2030-01' },
    ]);
    expect(result[0]).toEqual(proj[0]);
  });

  it('chains endCash through subsequent months after a lump sum', () => {
    const proj: MonthlyProjection[] = [
      { month: '2026-04', startCash: 1000, inflows: 0, outflows: 0, endCash: 1000, byCategory: {}, goalProgress: {} },
      { month: '2026-05', startCash: 1000, inflows: 0, outflows: 0, endCash: 1000, byCategory: {}, goalProgress: {} },
    ];
    const result = applyLumpSums(proj, [
      { id: 'tax', label: 'Tax refund', amount: 2400, month: '2026-04' },
    ]);
    expect(result[0].endCash).toBe(3400);
    expect(result[1].startCash).toBe(3400);
    expect(result[1].endCash).toBe(3400);
  });
});
```

- [ ] **Step 2: Run tests, see them fail**

Run: `npm test -- apply-overrides`

Expected: 8 new tests FAIL.

- [ ] **Step 3: Implement both**

Append to `src/lib/forecast/apply-overrides.ts`:

```ts
export function applySkipRecurringInstances(
  projection: MonthlyProjection[],
  baseStreams: ForecastHistory['recurringStreams'],
  skips: ScenarioOverrides['skipRecurringInstances'],
): MonthlyProjection[] {
  if (!skips || skips.length === 0) return projection;

  const baseById = new Map(baseStreams.map((s) => [s.id, s]));
  const result: MonthlyProjection[] = [];
  let runningCash = projection.length > 0 ? projection[0].startCash : 0;

  for (const month of projection) {
    let inflowDelta = 0;
    let outflowDelta = 0;

    for (const skip of skips) {
      if (skip.skipMonth !== month.month) continue;
      const stream = baseById.get(skip.streamId);
      if (!stream) continue;
      const monthly = monthlyEquivalent(stream.amount, stream.cadence);
      if (stream.direction === 'outflow') outflowDelta -= monthly;
      else inflowDelta -= monthly;
    }

    const newInflows = Math.max(0, month.inflows + inflowDelta);
    const newOutflows = Math.max(0, month.outflows + outflowDelta);
    const startCash = runningCash;
    const endCash = startCash + newInflows - newOutflows;
    result.push({
      ...month,
      startCash,
      inflows: newInflows,
      outflows: newOutflows,
      endCash,
    });
    runningCash = endCash;
  }

  return result;
}

export function applyLumpSums(
  projection: MonthlyProjection[],
  lumpSums: ScenarioOverrides['lumpSums'],
): MonthlyProjection[] {
  if (!lumpSums || lumpSums.length === 0) return projection;

  const result: MonthlyProjection[] = [];
  let runningCash = projection.length > 0 ? projection[0].startCash : 0;

  for (const month of projection) {
    let inflowDelta = 0;
    let outflowDelta = 0;

    for (const sum of lumpSums) {
      if (sum.month !== month.month) continue;
      if (sum.amount >= 0) inflowDelta += sum.amount;
      else outflowDelta += -sum.amount;
    }

    const newInflows = month.inflows + inflowDelta;
    const newOutflows = month.outflows + outflowDelta;
    const startCash = runningCash;
    const endCash = startCash + newInflows - newOutflows;
    result.push({
      ...month,
      startCash,
      inflows: newInflows,
      outflows: newOutflows,
      endCash,
    });
    runningCash = endCash;
  }

  return result;
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- apply-overrides`

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/forecast/apply-overrides.ts src/lib/forecast/apply-overrides.test.ts
git commit -m "feat(forecast): applySkipRecurringInstances + applyLumpSums

skip: subtracts one stream-instance equivalent from a target month.
lumpSums: positive amount → inflow; negative → outflow."
```

---

### Task 9: Goal projection module

**Files:**
- Create: `src/lib/forecast/goal-projection.ts`
- Create: `src/lib/forecast/goal-projection.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/lib/forecast/goal-projection.test.ts
import { describe, expect, it } from 'vitest';
import { computeGoalImpacts } from './goal-projection';
import type { ForecastHistory, MonthlyProjection, ScenarioOverrides } from './types';

const baseGoal: ForecastHistory['goals'][number] = {
  id: 'ef',
  name: 'Emergency fund',
  targetAmount: 10_000,
  targetDate: null,
  monthlyContribution: 500,
  currentSaved: 4000,
};

const noOverrides: ScenarioOverrides = {};

function flatProjection(months: string[], end = 1000): MonthlyProjection[] {
  return months.map((m) => ({
    month: m, startCash: end, inflows: 0, outflows: 0, endCash: end,
    byCategory: {}, goalProgress: {},
  }));
}

describe('computeGoalImpacts', () => {
  it('returns empty array when there are no goals', () => {
    const proj = flatProjection(['2026-05']);
    const result = computeGoalImpacts(proj, proj, [], noOverrides);
    expect(result).toEqual([]);
  });

  it('finds ETA = first month where (currentSaved + cumulative contribution) >= target', () => {
    // 4000 saved, 500/mo contribution, 10000 target → need 12 more months
    const proj = flatProjection(
      Array.from({ length: 14 }, (_, i) => `2026-${String((i % 12) + 1).padStart(2, '0')}`),
    );
    const result = computeGoalImpacts(proj, proj, [baseGoal], noOverrides);
    expect(result).toHaveLength(1);
    expect(result[0].goalId).toBe('ef');
    // 4000 + (500 * 12) = 10000 → hits target at end of month 12
    // months[0] is May 2026, month 12 (0-indexed 11) is April 2027
    expect(result[0].baselineETA).toBe('2027-04');
    expect(result[0].scenarioETA).toBe('2027-04');
    expect(result[0].shiftMonths).toBe(0);
  });

  it('returns null ETA when target is unreachable within horizon', () => {
    // Target 100000, saved 4000, 500/mo → would need 192 months
    const proj = flatProjection(['2026-05', '2026-06']);
    const goal = { ...baseGoal, targetAmount: 100_000 };
    const result = computeGoalImpacts(proj, proj, [goal], noOverrides);
    expect(result[0].baselineETA).toBeNull();
    expect(result[0].scenarioETA).toBeNull();
    expect(result[0].shiftMonths).toBe(0);
  });

  it('reports shiftMonths < 0 when scenario contribution is higher than baseline', () => {
    // Apply a goalTargetEdit raising monthlyContribution from 500 to 1000
    const baseline = flatProjection(
      Array.from({ length: 14 }, (_, i) => `2026-${String((i % 12) + 1).padStart(2, '0')}`),
    );
    const scenario = baseline; // same projection structure; goal-side change is via overrides
    const overrides: ScenarioOverrides = {
      goalTargetEdits: [{ goalId: 'ef', newMonthlyContribution: 1000 }],
    };
    const result = computeGoalImpacts(baseline, scenario, [baseGoal], overrides);
    // Baseline: 4000 + 500*12 = hits month 12 (Apr 2027)
    // Scenario: 4000 + 1000*6 = hits month 6 (Oct 2026)
    expect(result[0].baselineETA).toBe('2027-04');
    expect(result[0].scenarioETA).toBe('2026-10');
    expect(result[0].shiftMonths).toBe(-6);
  });

  it('includes hypothetical goals with id prefixed "hypo:"', () => {
    const proj = flatProjection(
      Array.from({ length: 14 }, (_, i) => `2026-${String((i % 12) + 1).padStart(2, '0')}`),
    );
    const overrides: ScenarioOverrides = {
      hypotheticalGoals: [
        { id: 'h1', name: 'House', targetAmount: 5000, monthlyContribution: 500 },
      ],
    };
    const result = computeGoalImpacts(proj, proj, [], overrides);
    expect(result).toHaveLength(1);
    expect(result[0].goalId).toBe('hypo:h1');
    expect(result[0].name).toBe('House');
    expect(result[0].baselineETA).toBeNull(); // hypothetical not in baseline
    // Scenario: 0 + 500*10 = 5000 → hits month 10 (Feb 2027)
    expect(result[0].scenarioETA).toBe('2027-02');
  });
});
```

- [ ] **Step 2: Run tests, see them fail**

Run: `npm test -- goal-projection`

Expected: 5 tests FAIL.

- [ ] **Step 3: Implement computeGoalImpacts**

```ts
// src/lib/forecast/goal-projection.ts
import type {
  ForecastHistory,
  GoalImpact,
  MonthlyProjection,
  ScenarioOverrides,
} from './types';

type EffectiveGoal = {
  id: string;
  name: string;
  targetAmount: number;
  monthlyContribution: number;
  startingSaved: number;
};

/**
 * Compute baseline + scenario ETAs for each goal (real + hypothetical).
 *
 * "ETA" = first month in the projection where cumulative contribution
 * (startingSaved + monthlyContribution × months) ≥ targetAmount.
 * Null if not reached within the projection's horizon.
 */
export function computeGoalImpacts(
  baselineProjection: MonthlyProjection[],
  scenarioProjection: MonthlyProjection[],
  realGoals: ForecastHistory['goals'],
  overrides: ScenarioOverrides,
): GoalImpact[] {
  const result: GoalImpact[] = [];

  // Build effective goal lists for baseline (no overrides) and scenario.
  const baselineGoals: EffectiveGoal[] = realGoals.map((g) => ({
    id: g.id,
    name: g.name,
    targetAmount: g.targetAmount,
    monthlyContribution: g.monthlyContribution ?? 0,
    startingSaved: g.currentSaved,
  }));

  const editsById = new Map(
    (overrides.goalTargetEdits ?? []).map((e) => [e.goalId, e]),
  );
  const scenarioGoals: EffectiveGoal[] = realGoals.map((g) => {
    const edit = editsById.get(g.id);
    return {
      id: g.id,
      name: g.name,
      targetAmount: edit?.newTargetAmount ?? g.targetAmount,
      monthlyContribution: edit?.newMonthlyContribution ?? g.monthlyContribution ?? 0,
      startingSaved: g.currentSaved,
    };
  });

  for (const hypo of overrides.hypotheticalGoals ?? []) {
    scenarioGoals.push({
      id: `hypo:${hypo.id}`,
      name: hypo.name,
      targetAmount: hypo.targetAmount,
      monthlyContribution: hypo.monthlyContribution ?? 0,
      startingSaved: 0,
    });
  }

  // For real goals, compute both ETAs and emit shift.
  for (const real of realGoals) {
    const baseGoal = baselineGoals.find((g) => g.id === real.id);
    const scnGoal = scenarioGoals.find((g) => g.id === real.id);
    const baselineETA = baseGoal ? findGoalETA(baseGoal, baselineProjection) : null;
    const scenarioETA = scnGoal ? findGoalETA(scnGoal, scenarioProjection) : null;
    result.push({
      goalId: real.id,
      name: real.name,
      baselineETA,
      scenarioETA,
      shiftMonths: monthsBetween(baselineETA, scenarioETA),
    });
  }

  // Hypothetical goals: baseline ETA is always null (don't exist there).
  for (const hypo of overrides.hypotheticalGoals ?? []) {
    const goal = scenarioGoals.find((g) => g.id === `hypo:${hypo.id}`);
    if (!goal) continue;
    const scenarioETA = findGoalETA(goal, scenarioProjection);
    result.push({
      goalId: `hypo:${hypo.id}`,
      name: hypo.name,
      baselineETA: null,
      scenarioETA,
      shiftMonths: 0,
    });
  }

  return result;
}

function findGoalETA(
  goal: EffectiveGoal,
  projection: MonthlyProjection[],
): string | null {
  let cumulative = goal.startingSaved;
  for (const month of projection) {
    cumulative += goal.monthlyContribution;
    if (cumulative >= goal.targetAmount) return month.month;
  }
  return null;
}

function monthsBetween(a: string | null, b: string | null): number {
  if (!a || !b) return 0;
  const [ay, am] = a.split('-').map(Number);
  const [by, bm] = b.split('-').map(Number);
  return (by * 12 + bm) - (ay * 12 + am);
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- goal-projection`

Expected: All 5 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/forecast/goal-projection.ts src/lib/forecast/goal-projection.test.ts
git commit -m "feat(forecast): computeGoalImpacts (real + hypothetical)

ETA = first projection month where cumulative contribution >= target.
goalTargetEdits override the real goal's contribution/target without
mutating the goal table. Hypothetical goals carry id prefix \"hypo:\"."
```

---

### Task 10: Engine integration — `projectCash`

**Files:**
- Create: `src/lib/forecast/engine.ts`
- Create: `src/lib/forecast/engine.test.ts`

- [ ] **Step 1: Write integration tests**

```ts
// src/lib/forecast/engine.test.ts
import { describe, expect, it } from 'vitest';
import { projectCash } from './engine';
import type { ForecastHistory, ProjectCashInput } from './types';

const baseHistory: ForecastHistory = {
  currentCash: 10_000,
  recurringStreams: [
    { id: 'salary', label: 'Salary', amount: 5000, direction: 'inflow', cadence: 'monthly', nextDate: '2026-05-15' },
    { id: 'rent', label: 'Rent', amount: 2000, direction: 'outflow', cadence: 'monthly', nextDate: '2026-05-01' },
  ],
  categoryHistory: { dining: [400, 400, 400], groceries: [600, 600, 600] },
  nonRecurringIncomeHistory: [0, 0, 0],
  goals: [
    { id: 'ef', name: 'Emergency fund', targetAmount: 10_000, targetDate: null, monthlyContribution: 500, currentSaved: 4000 },
  ],
  categories: [
    { id: 'dining', name: 'Dining' },
    { id: 'groceries', name: 'Groceries' },
  ],
};

describe('projectCash — integration', () => {
  it('returns horizon-length projection plus goal impacts', () => {
    const input: ProjectCashInput = {
      history: baseHistory,
      overrides: {},
      currentMonth: '2026-05',
    };
    const result = projectCash(input);
    expect(result.projection).toHaveLength(12); // default horizon
    expect(result.goalImpacts).toHaveLength(1);
  });

  it('respects overrides.horizonMonths', () => {
    const input: ProjectCashInput = {
      history: baseHistory,
      overrides: { horizonMonths: 3 },
      currentMonth: '2026-05',
    };
    expect(projectCash(input).projection).toHaveLength(3);
  });

  it('baseline scenario: cash grows by salary − rent − dining − groceries each month', () => {
    const input: ProjectCashInput = {
      history: baseHistory,
      overrides: { horizonMonths: 1 },
      currentMonth: '2026-05',
    };
    const result = projectCash(input);
    // 10000 + 5000 - 2000 - 400 - 600 = 12000
    expect(result.projection[0].endCash).toBe(12_000);
  });

  it('all 7 override types stacked produce a coherent projection', () => {
    const input: ProjectCashInput = {
      history: baseHistory,
      overrides: {
        horizonMonths: 12,
        categoryDeltas: [{ categoryId: 'dining', monthlyDelta: -200 }],
        incomeDelta: { monthlyDelta: 100 },
        recurringChanges: [{ streamId: 'rent', action: 'edit', amount: 1800 }],
        skipRecurringInstances: [{ streamId: 'salary', skipMonth: '2026-08' }],
        lumpSums: [{ id: 'tax', label: 'Tax refund', amount: 2400, month: '2026-04' }],
        hypotheticalGoals: [
          { id: 'travel', name: 'Travel fund', targetAmount: 3000, monthlyContribution: 250 },
        ],
        goalTargetEdits: [{ goalId: 'ef', newMonthlyContribution: 750 }],
      },
      currentMonth: '2026-05',
    };
    const result = projectCash(input);
    expect(result.projection).toHaveLength(12);

    // Dining cut → byCategory.dining = 200 (was 400)
    expect(result.projection[0].byCategory.dining).toBe(200);

    // Goal impacts include both real (ef) and hypothetical (hypo:travel)
    const ids = result.goalImpacts.map((g) => g.goalId).sort();
    expect(ids).toEqual(['ef', 'hypo:travel']);

    // ef: scenario contribution 750 should pull ETA earlier than baseline 500
    const ef = result.goalImpacts.find((g) => g.goalId === 'ef')!;
    expect(ef.shiftMonths).toBeLessThan(0);
  });

  it('handles empty history (just-connected user)', () => {
    const input: ProjectCashInput = {
      history: {
        currentCash: 0,
        recurringStreams: [],
        categoryHistory: {},
        nonRecurringIncomeHistory: [],
        goals: [],
        categories: [],
      },
      overrides: {},
      currentMonth: '2026-05',
    };
    const result = projectCash(input);
    expect(result.projection).toHaveLength(12);
    expect(result.projection[0].endCash).toBe(0);
    expect(result.goalImpacts).toEqual([]);
  });

  it('is deterministic — same input produces same output across calls', () => {
    const input: ProjectCashInput = {
      history: baseHistory,
      overrides: { horizonMonths: 6, lumpSums: [{ id: 'x', label: 'x', amount: 100, month: '2026-07' }] },
      currentMonth: '2026-05',
    };
    const a = projectCash(input);
    const b = projectCash(input);
    expect(a).toEqual(b);
  });
});
```

- [ ] **Step 2: Run tests, see them fail**

Run: `npm test -- engine`

Expected: 6 tests FAIL.

- [ ] **Step 3: Implement projectCash**

```ts
// src/lib/forecast/engine.ts
import {
  applyCategoryDeltas,
  applyIncomeDelta,
  applyLumpSums,
  applyRecurringChanges,
  applySkipRecurringInstances,
} from './apply-overrides';
import { computeBaseline } from './baseline';
import { computeGoalImpacts } from './goal-projection';
import type { ProjectCashInput, ProjectionResult } from './types';

const DEFAULT_HORIZON = 12;

/**
 * Engine entry point. Pure function:
 *   1. Compute baseline projection
 *   2. Apply overrides in a deterministic order
 *   3. Compute goal impacts (baseline vs scenario projection)
 *
 * Override application order (see spec §5.2) matters for mental modeling
 * but does NOT cause mathematical conflicts — each step targets a
 * different part of the model.
 */
export function projectCash(input: ProjectCashInput): ProjectionResult {
  const { history, overrides, currentMonth } = input;
  const horizon = overrides.horizonMonths ?? DEFAULT_HORIZON;

  // Step 1: baseline (no overrides)
  const baseline = computeBaseline(history, currentMonth, horizon);

  // Steps 2-6: apply overrides in deterministic order
  let scenario = baseline;
  scenario = applyCategoryDeltas(scenario, overrides.categoryDeltas);
  scenario = applyIncomeDelta(scenario, overrides.incomeDelta);
  scenario = applyRecurringChanges(scenario, history.recurringStreams, overrides.recurringChanges);
  scenario = applySkipRecurringInstances(scenario, history.recurringStreams, overrides.skipRecurringInstances);
  scenario = applyLumpSums(scenario, overrides.lumpSums);

  // Step 7: goal impacts
  const goalImpacts = computeGoalImpacts(baseline, scenario, history.goals, overrides);

  return { projection: scenario, goalImpacts };
}
```

- [ ] **Step 4: Run tests, all green**

Run: `npm test -- engine`

Expected: All 6 PASS.

- [ ] **Step 5: Run the full test suite to ensure no regressions in earlier code**

Run: `npm test`

Expected: All tests across all files PASS (including the Phase 5 ultrareview regressions).

- [ ] **Step 6: Commit**

```bash
git add src/lib/forecast/engine.ts src/lib/forecast/engine.test.ts
git commit -m "feat(forecast): projectCash entry point composing all overrides

Deterministic 7-step pipeline: baseline → category → income → recurring
→ skip → lumps → goal impacts. Pure function — no DB, no fetch, no
Date.now (currentMonth passed in). Same inputs → same outputs."
```

---

## Wave 3 — Persistence + Sidebar

### Task 11: Scenario zod schemas

**Files:**
- Create: `src/lib/forecast/scenario-zod.ts`

No tests — zod schemas are tested implicitly by Task 12's server-action tests (when those are written by Plan B). For now, just compile-check.

- [ ] **Step 1: Write the schemas**

```ts
// src/lib/forecast/scenario-zod.ts
import { z } from 'zod';

const monthString = z.string().regex(/^\d{4}-\d{2}$/, 'Expected YYYY-MM');
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

export const scenarioOverridesSchema = z.object({
  horizonMonths: z.number().int().positive().max(120).optional(),

  categoryDeltas: z.array(z.object({
    categoryId: z.string().uuid(),
    monthlyDelta: z.number(),
    startMonth: monthString.optional(),
    endMonth: monthString.optional(),
  })).optional(),

  lumpSums: z.array(z.object({
    id: z.string(),
    label: z.string().min(1).max(100),
    amount: z.number(),
    month: monthString,
  })).optional(),

  recurringChanges: z.array(z.object({
    streamId: z.string().uuid().optional(),
    action: z.enum(['pause', 'edit', 'add']),
    label: z.string().min(1).max(100).optional(),
    amount: z.number().nonnegative().optional(),
    direction: z.enum(['inflow', 'outflow']).optional(),
    cadence: z.enum(['weekly', 'biweekly', 'monthly']).optional(),
    startMonth: monthString.optional(),
    endMonth: monthString.optional(),
  })).optional(),

  incomeDelta: z.object({
    monthlyDelta: z.number(),
    startMonth: monthString.optional(),
    endMonth: monthString.optional(),
  }).optional(),

  hypotheticalGoals: z.array(z.object({
    id: z.string(),
    name: z.string().min(1).max(100),
    targetAmount: z.number().positive(),
    targetDate: dateString.optional(),
    monthlyContribution: z.number().nonnegative().optional(),
  })).optional(),

  goalTargetEdits: z.array(z.object({
    goalId: z.string().uuid(),
    newTargetAmount: z.number().positive().optional(),
    newTargetDate: dateString.optional(),
    newMonthlyContribution: z.number().nonnegative().optional(),
  })).optional(),

  skipRecurringInstances: z.array(z.object({
    streamId: z.string().uuid(),
    skipMonth: monthString,
  })).optional(),
});

export const createScenarioInput = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  overrides: scenarioOverridesSchema.default({}),
});

export const updateScenarioInput = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).optional(),
  overrides: scenarioOverridesSchema.optional(),
});

export const deleteScenarioInput = z.object({
  id: z.string().uuid(),
});
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/forecast/scenario-zod.ts
git commit -m "feat(forecast): zod schemas for scenario CRUD inputs

Validates ScenarioOverrides shape + CRUD action inputs at the server
boundary. Override schema mirrors src/lib/forecast/types.ts."
```

---

### Task 12: Scenario server actions (create / update / delete)

**Files:**
- Create: `src/lib/forecast/scenario-actions.ts`

Following the pattern in `src/lib/goals/actions.ts`. No tests — these are thin wrappers around DB writes; the engine and zod get the real coverage.

- [ ] **Step 1: Read the goals actions pattern**

Run: `cat src/lib/goals/actions.ts | head -60`

Note: `'use server'` directive at top, `auth()` for the session, `revalidatePath()` after mutations, returns a discriminated `{ ok: true, data } | { ok: false, error }` shape.

- [ ] **Step 2: Implement the three actions**

```ts
// src/lib/forecast/scenario-actions.ts
'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { scenarios } from '@/lib/db/schema';
import { logError } from '@/lib/logger';
import {
  createScenarioInput,
  deleteScenarioInput,
  updateScenarioInput,
} from './scenario-zod';

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function createScenario(
  rawInput: unknown,
): Promise<ActionResult<{ id: string }>> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Unauthorized' };

  const parsed = createScenarioInput.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  try {
    const [row] = await db
      .insert(scenarios)
      .values({
        userId: session.user.id,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        overrides: parsed.data.overrides,
      })
      .returning({ id: scenarios.id });
    revalidatePath('/simulator');
    return { ok: true, data: { id: row.id } };
  } catch (err) {
    await logError('scenario.create', err);
    return { ok: false, error: 'Could not save scenario' };
  }
}

export async function updateScenario(
  rawInput: unknown,
): Promise<ActionResult<null>> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Unauthorized' };

  const parsed = updateScenarioInput.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  try {
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.description !== undefined) updates.description = parsed.data.description;
    if (parsed.data.overrides !== undefined) updates.overrides = parsed.data.overrides;

    const result = await db
      .update(scenarios)
      .set(updates)
      .where(and(eq(scenarios.id, parsed.data.id), eq(scenarios.userId, session.user.id)))
      .returning({ id: scenarios.id });

    if (result.length === 0) {
      return { ok: false, error: 'Scenario not found' };
    }
    revalidatePath('/simulator');
    return { ok: true, data: null };
  } catch (err) {
    await logError('scenario.update', err, { scenarioId: parsed.data.id });
    return { ok: false, error: 'Could not update scenario' };
  }
}

export async function deleteScenario(
  rawInput: unknown,
): Promise<ActionResult<null>> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Unauthorized' };

  const parsed = deleteScenarioInput.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  try {
    const result = await db
      .delete(scenarios)
      .where(and(eq(scenarios.id, parsed.data.id), eq(scenarios.userId, session.user.id)))
      .returning({ id: scenarios.id });

    if (result.length === 0) {
      return { ok: false, error: 'Scenario not found' };
    }
    revalidatePath('/simulator');
    return { ok: true, data: null };
  } catch (err) {
    await logError('scenario.delete', err, { scenarioId: parsed.data.id });
    return { ok: false, error: 'Could not delete scenario' };
  }
}
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/forecast/scenario-actions.ts
git commit -m "feat(forecast): server actions for scenario CRUD

createScenario / updateScenario / deleteScenario. Auth-gated,
zod-validated, logErrors on failure (surfaces in daily digest).
Pattern mirrors src/lib/goals/actions.ts."
```

---

### Task 13: Sidebar grouping + brand fix

**Files:**
- Modify: `src/components/nav/app-sidebar.tsx`

This task is intentionally separated as the spec calls for a separate small commit so it can be reverted independently.

- [ ] **Step 1: Read current sidebar**

Run: `cat src/components/nav/app-sidebar.tsx`

Note the existing `navItems` flat array and "Finance" brand text at the top.

- [ ] **Step 2: Replace `navItems` with `navGroups` and update render**

Edit `src/components/nav/app-sidebar.tsx` — replace the flat `navItems` constant and the rendering block. The `LineChart` icon needs to be added to the lucide-react import.

```ts
import {
  Activity,
  LayoutDashboard,
  LineChart,
  Repeat,
  Sparkles,
  TrendingUp,
  Receipt,
  Target,
  Settings,
} from 'lucide-react';
import Link from 'next/link';
import { auth } from '@/auth';
import { SignOutButton } from './sign-out-button';

const navGroups = [
  {
    label: 'Today',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/insights', label: 'Insights', icon: Sparkles },
      { href: '/drift', label: 'Drift', icon: Activity },
    ],
  },
  {
    label: 'Plan',
    items: [
      { href: '/goals', label: 'Goals', icon: Target },
      { href: '/recurring', label: 'Recurring', icon: Repeat },
      { href: '/simulator', label: 'Simulator', icon: LineChart },
    ],
  },
  {
    label: 'Records',
    items: [
      { href: '/transactions', label: 'Transactions', icon: Receipt },
      { href: '/investments', label: 'Investments', icon: TrendingUp },
    ],
  },
] as const;

export async function AppSidebar() {
  const session = await auth();

  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-border bg-card">
      <div className="px-6 py-5 border-b border-border">
        <Link href="/dashboard" className="block text-base font-semibold tracking-tight">
          Foothold
        </Link>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-4">
        {navGroups.map((group) => (
          <div key={group.label}>
            <div className="px-3 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground/70">
              {group.label}
            </div>
            <div className="space-y-1">
              {group.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        ))}

        <div className="pt-2 border-t border-border">
          <Link
            href="/settings"
            className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <Settings className="h-4 w-4" />
            Settings
          </Link>
        </div>
      </nav>

      <div className="border-t border-border p-3 space-y-2">
        {session?.user?.email && (
          <div className="px-3 py-1">
            <p className="text-xs text-muted-foreground truncate">{session.user.email}</p>
          </div>
        )}
        <SignOutButton />
      </div>
    </aside>
  );
}
```

Note: the `/simulator` link will 404 until Plan B builds the page. That's expected for this commit — Plan B fills it in.

- [ ] **Step 3: Verify in dev**

Run: `npm run dev` (in another terminal if not running) and visit any page. Confirm the sidebar shows three group labels (TODAY / PLAN / RECORDS) with the right items under each, brand says "Foothold", Settings is at the bottom under a separator. Click each link and verify they all navigate (Simulator → 404, expected).

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Run full test suite**

Run: `npm test`

Expected: All tests PASS — sidebar change has no test impact.

- [ ] **Step 6: Commit**

```bash
git add src/components/nav/app-sidebar.tsx
git commit -m "feat(nav): group sidebar into Today/Plan/Records + brand to Foothold

Lifts the flat 9-item list into 3 small clusters by intent:
- Today: Dashboard, Insights, Drift (current state)
- Plan: Goals, Recurring, Simulator (decisions)
- Records: Transactions, Investments (history)

Settings stays separated at bottom. Brand text Finance → Foothold
(matches usefoothold.com domain). /simulator link 404s until Plan B."
```

---

### Task 14: Update CLAUDE.md roadmap

**Files:**
- Modify: `CLAUDE.md` (Roadmap section)

This is the closing housekeeping commit for Plan A.

- [ ] **Step 1: Read current Roadmap section**

Run: `grep -n "^### Done\|^### In progress\|^### Next up" CLAUDE.md`

Note the line numbers; you'll add a new entry under "Done" and update "Next up" to reflect Plan B as next.

- [ ] **Step 2: Add Plan A entry under "Done"**

Add as the last item in `### Done` (after the Phase 5 / Test infrastructure entries):

```markdown
- **Phase 4-A — Predictive engine + persistence + sidebar grouping**
  (2026-XX-XX) — pure `projectCash()` engine in `src/lib/forecast/`
  with full vitest coverage; `scenario` + `forecast_narrative` tables;
  scenario CRUD server actions; sidebar reorganized into Today/Plan/
  Records groups; brand text "Finance" → "Foothold". `/simulator` page
  builds in Plan B.
```

(Date filled in at commit time.)

- [ ] **Step 3: Update "Next up" to reference Plan B**

Replace the existing first item or add at top:

```markdown
- **Phase 4-B — Simulator UI + AI narration** — builds /simulator page
  on top of Plan A's engine. Includes the override editor (7 sections),
  forecast chart (Recharts), goal diff cards, AI coaching narrative
  via Anthropic Haiku 4.5 with caching. Spec: `docs/superpowers/specs/
  2026-05-04-phase-4-predictive-layer-design.md`.
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude.md): record Phase 4-A shipment + queue Phase 4-B"
```

---

## Self-Review Checklist (run mentally after writing all tasks)

This is for me, the planner — leaving the checklist visible for whoever picks up plan editing.

- ✅ **Spec coverage:** Every spec section that's in scope for Plan A has a task. (Plan B covers UI + AI narration + history-fingerprint + prompt builder.)
- ✅ **No placeholders:** Each step has either a concrete file edit or a runnable command. No "TBD", "implement later", or vague instructions.
- ✅ **Type consistency:** `ScenarioOverrides`, `ForecastHistory`, `MonthlyProjection`, `GoalImpact`, `ProjectionResult`, `ProjectCashInput`, `EffectiveGoal` all defined exactly once and referenced consistently across tasks. Function signatures (`projectCash`, `computeBaseline`, `applyCategoryDeltas`, etc.) match between definition and usage.
- ✅ **Bite-sized:** Each step is one action (write tests, run, implement, run, commit). No multi-action steps.
- ✅ **TDD throughout:** Every code-bearing task starts with failing tests (where the code is testable as a unit). Schema and CRUD tasks lack tests — explicitly justified.
- ✅ **Frequent commits:** Each task ends with a focused commit message; no task has multiple commits or no commits.

---

## Appendix — Plan B preview (not included here)

Plan B will add (after Plan A ships):

1. History fingerprint module (`src/lib/forecast/history-fingerprint.ts` + tests)
2. Prompt builder (`src/lib/anthropic/forecast-prompt.ts` + tests)
3. AI narration server action + Anthropic call (`src/lib/anthropic/forecast-narrative.ts`)
4. `/simulator` server component (`src/app/(app)/simulator/page.tsx`)
5. Top-level client wrapper (`simulator-client.tsx`)
6. Header + scenario selector
7. Generic `<OverrideSection>` accordion component
8. 7 specific override sections (categories, lump sums, recurring, income, hypothetical goals, goal target edits, skip recurring)
9. Forecast chart (Recharts wrapper)
10. Goal diff cards
11. Narrative panel
12. Empty / first-time states
13. Responsive single-column collapse below md breakpoint

Plan B will be written against the actual built foundation from Plan A so the function signatures and file paths match exactly what shipped.
