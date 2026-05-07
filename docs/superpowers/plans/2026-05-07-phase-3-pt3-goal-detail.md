# Phase 3-pt3 — Per-Goal Coaching Detail Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a routed `/goals/[id]` detail page that shows trajectory, projection, contributing data, and a static-template coaching narrative for each savings + spend-cap goal — closes the "defer until real data flows" gate from the original /goals IA rework now that Plaid + SnapTrade data is live.

**Architecture:** RSC by default; pure-predicate testable helpers extracted for trajectory math + coaching sentence composition; data fetched in parallel via `Promise.all` in `page.tsx`; one client island (Recharts trajectory chart). Trajectory walks back from current sum through transactions, mirroring W-06's stable-anchor pattern from `getNetWorthSparkline`. No LLM in MVP.

**Tech Stack:** Next.js 14 (App Router) · TypeScript · Drizzle ORM · Recharts · shadcn/ui · Vitest 4. All conventions per `CLAUDE.md`.

**Spec:** `docs/superpowers/specs/2026-05-07-phase-3-pt3-goal-detail-design.md` (commits `e3437b3` + `d52add1`).

---

## File Structure

| Action | Path | Responsibility |
|---|---|---|
| Create | `src/lib/goals/trajectory.ts` | Pure `walkBackTrajectory` predicate. Same shape `walkBackSparkline` would have been if extracted from `getNetWorthSparkline` during W-06. |
| Create | `src/lib/goals/trajectory.test.ts` | Vitest tests for `walkBackTrajectory`. |
| Create | `src/lib/goals/coaching.ts` | Pure `composeCoaching` predicate that produces the two-sentence coaching output from numerical inputs. |
| Create | `src/lib/goals/coaching.test.ts` | Vitest tests for `composeCoaching`. |
| Create | `src/lib/db/queries/goal-detail.ts` | `getGoalDetail`, `getGoalTrajectory`, `getContributingFeed`. Each scoped via user-ownership JOIN. |
| Create | `src/components/goals/detail-header.tsx` | Server component. Goal name, eyebrow, type pill, current-vs-target headline, status pill, edit + delete affordances. |
| Create | `src/components/goals/projection-card.tsx` | Server component. Headline projection sentence; copy varies by type and verdict. |
| Create | `src/components/goals/trajectory-chart.tsx` | Client component (Recharts). Cumulative + ideal-pace + projected lines. |
| Create | `src/components/goals/spend-cap-feed.tsx` | Server component. Top 20 transactions matching the cap's filter, this month. |
| Create | `src/components/goals/savings-feed.tsx` | Server component. Weekly net deltas across contributing accounts. |
| Create | `src/components/goals/coaching-card.tsx` | Server component. Renders `composeCoaching` output. |
| Create | `src/app/(app)/goals/[id]/page.tsx` | Server route. Auth check, parallel data fetch, 5-section layout. |
| Create | `src/app/(app)/goals/[id]/not-found.tsx` | 404 chrome for missing/non-owned goal. |
| Modify | `src/components/goals/goal-row.tsx` | Replace existing spend-cap drilldown with `/goals/${id}`; add savings drilldown to same route. |

---

### Task 1: `walkBackTrajectory` pure predicate

**Files:**
- Create: `src/lib/goals/trajectory.ts`
- Create: `src/lib/goals/trajectory.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/goals/trajectory.test.ts
import { describe, expect, it } from 'vitest';
import { walkBackTrajectory } from './trajectory';

describe('walkBackTrajectory', () => {
  it('returns flat anchor across the window when no deltas exist', () => {
    const series = walkBackTrajectory({
      anchor: 1000,
      dailyDelta: new Map(),
      today: new Date('2026-05-07T12:00:00Z'),
      days: 5,
    });
    expect(series).toEqual([
      { date: '2026-05-03', cumulative: 1000 },
      { date: '2026-05-04', cumulative: 1000 },
      { date: '2026-05-05', cumulative: 1000 },
      { date: '2026-05-06', cumulative: 1000 },
      { date: '2026-05-07', cumulative: 1000 },
    ]);
  });

  it('walks backward subtracting today-relative deltas (positive=outflow)', () => {
    // Anchor at 1000 today. A $100 outflow happened today (positive amount)
    // and a $50 inflow yesterday (negative amount). So:
    //   today        : 1000
    //   yesterday    : 1000 + 100 = 1100  (re-add the outflow)
    //   day-before   : 1100 - 50  = 1050  (un-do the inflow)
    const deltas = new Map<string, number>([
      ['2026-05-07', 100],
      ['2026-05-06', -50],
    ]);
    const series = walkBackTrajectory({
      anchor: 1000,
      dailyDelta: deltas,
      today: new Date('2026-05-07T12:00:00Z'),
      days: 3,
    });
    expect(series).toEqual([
      { date: '2026-05-05', cumulative: 1050 },
      { date: '2026-05-06', cumulative: 1100 },
      { date: '2026-05-07', cumulative: 1000 },
    ]);
  });

  it('returns just today when days=1', () => {
    const series = walkBackTrajectory({
      anchor: 500,
      dailyDelta: new Map([['2026-05-07', 50]]),
      today: new Date('2026-05-07T12:00:00Z'),
      days: 1,
    });
    expect(series).toEqual([{ date: '2026-05-07', cumulative: 500 }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/goals/trajectory.test.ts`
Expected: FAIL — `Cannot find module './trajectory'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/goals/trajectory.ts

export type TrajectoryPoint = {
  /** YYYY-MM-DD */
  date: string;
  cumulative: number;
};

export type WalkBackInput = {
  /** Today's running value (e.g., sum of currentBalance for the goal's accounts). */
  anchor: number;
  /** Per-day net delta from transactions, keyed YYYY-MM-DD. Positive=outflow. */
  dailyDelta: ReadonlyMap<string, number>;
  /** Reference date — series ends here. */
  today: Date;
  /** Window length, inclusive. days=1 yields just today. */
  days: number;
};

/**
 * Walks backward day-by-day from `anchor` (today's value) by re-adding each
 * day's outflows and removing inflows. Returns oldest→newest.
 *
 * Same shape as the inline walk-back in `getNetWorthSparkline` post-W-06; pure
 * so the chart math is testable without a DB or Next runtime.
 *
 * Convention matches the rest of the codebase: transaction.amount > 0 means
 * money OUT, < 0 means money IN. So walking backward, we ADD positive amounts
 * back to the running total.
 */
export function walkBackTrajectory(
  input: WalkBackInput,
): TrajectoryPoint[] {
  const { anchor, dailyDelta, today, days } = input;
  const yyyymmdd = (d: Date) => d.toISOString().slice(0, 10);
  const series: TrajectoryPoint[] = [];
  let running = anchor;
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = yyyymmdd(d);
    series.push({ date: key, cumulative: running });
    running += dailyDelta.get(key) ?? 0;
  }
  return series.reverse();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/goals/trajectory.test.ts`
Expected: PASS — 3 tests pass.

- [ ] **Step 5: Run full suite for no regressions**

Run: `npm test`
Expected: PASS — `Tests 283 passed (283)` (baseline 280 + 3 new).

- [ ] **Step 6: Commit**

```bash
git add src/lib/goals/trajectory.ts src/lib/goals/trajectory.test.ts
git commit -m "feat(goals): walkBackTrajectory pure predicate (Phase 3-pt3)"
```

---

### Task 2: `composeCoaching` pure predicate

**Files:**
- Create: `src/lib/goals/coaching.ts`
- Create: `src/lib/goals/coaching.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/goals/coaching.test.ts
import { describe, expect, it } from 'vitest';
import { composeCoaching } from './coaching';

describe('composeCoaching — savings', () => {
  it('returns ahead-of-pace status with no action sentence when on-pace', () => {
    const out = composeCoaching({
      kind: 'savings',
      verdict: 'on-pace',
      monthlyVelocity: 250,
      requiredMonthlyVelocity: 200,
      topDiscretionaryCategory: null,
    });
    expect(out.status).toBe("You're $50/mo ahead of pace.");
    expect(out.action).toBeNull();
  });

  it('returns behind status + action sentence pulling top category', () => {
    const out = composeCoaching({
      kind: 'savings',
      verdict: 'behind',
      monthlyVelocity: 100,
      requiredMonthlyVelocity: 313,
      topDiscretionaryCategory: { name: 'Dining', monthlyAmount: 620 },
    });
    expect(out.status).toBe("You're $213/mo behind pace.");
    expect(out.action).toBe(
      'Trim Dining (your largest discretionary at $620/mo) by $213 to recover.',
    );
  });

  it('omits action sentence when behind but no category data exists', () => {
    const out = composeCoaching({
      kind: 'savings',
      verdict: 'behind',
      monthlyVelocity: 100,
      requiredMonthlyVelocity: 313,
      topDiscretionaryCategory: null,
    });
    expect(out.status).toBe("You're $213/mo behind pace.");
    expect(out.action).toBeNull();
  });

  it('returns hit confirmation with no action', () => {
    const out = composeCoaching({
      kind: 'savings',
      verdict: 'hit',
      hitDate: '2026-04-15',
      overshoot: 200,
    });
    expect(out.status).toBe('You hit this goal Apr 15 — $200 ahead of target.');
    expect(out.action).toBeNull();
  });
});

describe('composeCoaching — spend_cap', () => {
  it('returns under-the-cap confirmation with no action', () => {
    const out = composeCoaching({
      kind: 'spend_cap',
      verdict: 'on-pace',
      cap: 700,
      spent: 200,
      projectedMonthly: 600,
      topMerchants: [],
    });
    expect(out.status).toBe('Tracking $100 under the cap.');
    expect(out.action).toBeNull();
  });

  it('returns projected-over status + top-3 merchants action', () => {
    const out = composeCoaching({
      kind: 'spend_cap',
      verdict: 'behind',
      cap: 700,
      spent: 400,
      projectedMonthly: 887,
      topMerchants: [
        { name: 'Starbucks', amount: 87 },
        { name: 'Sweetgreen', amount: 64 },
        { name: 'DoorDash', amount: 52 },
      ],
    });
    expect(out.status).toBe('Projected to overspend by $187 at this pace.');
    expect(out.action).toBe(
      'Skipping any one of Starbucks ($87), Sweetgreen ($64), DoorDash ($52) resets your pace.',
    );
  });

  it('returns already-over status + merchants action', () => {
    const out = composeCoaching({
      kind: 'spend_cap',
      verdict: 'over',
      cap: 700,
      spent: 787,
      projectedMonthly: 950,
      topMerchants: [
        { name: 'Sweetgreen', amount: 110 },
        { name: 'Uber Eats', amount: 78 },
      ],
    });
    expect(out.status).toBe('Already $87 over the cap.');
    expect(out.action).toBe(
      'Skipping any one of Sweetgreen ($110), Uber Eats ($78) resets your pace.',
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/goals/coaching.test.ts`
Expected: FAIL — `Cannot find module './coaching'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/goals/coaching.ts
import { formatCurrency } from '@/lib/utils';
import { humanizeDate } from '@/lib/format/date';

export type CoachingInput =
  | {
      kind: 'savings';
      verdict: 'on-pace';
      monthlyVelocity: number;
      requiredMonthlyVelocity: number;
      topDiscretionaryCategory: null;
    }
  | {
      kind: 'savings';
      verdict: 'behind';
      monthlyVelocity: number;
      requiredMonthlyVelocity: number;
      topDiscretionaryCategory: { name: string; monthlyAmount: number } | null;
    }
  | {
      kind: 'savings';
      verdict: 'hit';
      hitDate: string;
      overshoot: number;
    }
  | {
      kind: 'spend_cap';
      verdict: 'on-pace';
      cap: number;
      spent: number;
      projectedMonthly: number;
      topMerchants: ReadonlyArray<{ name: string; amount: number }>;
    }
  | {
      kind: 'spend_cap';
      verdict: 'behind';
      cap: number;
      spent: number;
      projectedMonthly: number;
      topMerchants: ReadonlyArray<{ name: string; amount: number }>;
    }
  | {
      kind: 'spend_cap';
      verdict: 'over';
      cap: number;
      spent: number;
      projectedMonthly: number;
      topMerchants: ReadonlyArray<{ name: string; amount: number }>;
    };

export type CoachingOutput = {
  status: string;
  action: string | null;
};

/**
 * Pure two-sentence coaching producer. Status sentence is mandatory; action
 * sentence is null on hit/on-pace/missed paths and on behind paths that lack
 * the data needed to suggest a concrete cut. No LLM — every output is a
 * deterministic function of numerical inputs (LLM upgrade is its own phase).
 */
export function composeCoaching(input: CoachingInput): CoachingOutput {
  if (input.kind === 'savings') {
    if (input.verdict === 'hit') {
      return {
        status: `You hit this goal ${humanizeDate(input.hitDate)} — ${formatCurrency(input.overshoot)} ahead of target.`,
        action: null,
      };
    }
    const deficit = input.requiredMonthlyVelocity - input.monthlyVelocity;
    if (input.verdict === 'on-pace') {
      const surplus = -deficit;
      return {
        status: `You're ${formatCurrency(surplus)}/mo ahead of pace.`,
        action: null,
      };
    }
    // behind
    const status = `You're ${formatCurrency(deficit)}/mo behind pace.`;
    if (!input.topDiscretionaryCategory) {
      return { status, action: null };
    }
    const cat = input.topDiscretionaryCategory;
    return {
      status,
      action: `Trim ${cat.name} (your largest discretionary at ${formatCurrency(cat.monthlyAmount)}/mo) by ${formatCurrency(deficit)} to recover.`,
    };
  }

  // spend_cap
  if (input.verdict === 'on-pace') {
    const margin = input.cap - input.projectedMonthly;
    return {
      status: `Tracking ${formatCurrency(margin)} under the cap.`,
      action: null,
    };
  }

  const overage =
    input.verdict === 'over'
      ? input.spent - input.cap
      : input.projectedMonthly - input.cap;
  const status =
    input.verdict === 'over'
      ? `Already ${formatCurrency(overage)} over the cap.`
      : `Projected to overspend by ${formatCurrency(overage)} at this pace.`;

  if (input.topMerchants.length === 0) {
    return { status, action: null };
  }
  const merchantList = input.topMerchants
    .slice(0, 3)
    .map((m) => `${m.name} (${formatCurrency(m.amount)})`)
    .join(', ');
  return {
    status,
    action: `Skipping any one of ${merchantList} resets your pace.`,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/goals/coaching.test.ts`
Expected: PASS — 7 tests pass.

- [ ] **Step 5: Run full suite for no regressions**

Run: `npm test`
Expected: PASS — `Tests 290 passed (290)` (baseline 283 after Task 1 + 7 new).

- [ ] **Step 6: Commit**

```bash
git add src/lib/goals/coaching.ts src/lib/goals/coaching.test.ts
git commit -m "feat(goals): composeCoaching pure predicate (Phase 3-pt3)"
```

---

### Task 3: `getGoalDetail` query

Single-goal lookup with ownership scoping. Returns the same `GoalWithProgress` shape as `getGoalsWithProgress` but for one row, or `null` if not found / not owned.

**Files:**
- Create: `src/lib/db/queries/goal-detail.ts`

- [ ] **Step 1: Write the implementation**

```ts
// src/lib/db/queries/goal-detail.ts
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { goals } from '@/lib/db/schema';
import {
  getGoalsWithProgress,
  type GoalWithProgress,
} from './goals';

/**
 * Single-goal lookup scoped to the signed-in user. Returns null when the
 * goal doesn't exist OR isn't owned by `userId` (the URL param is
 * untrusted — never short-circuit this check).
 *
 * Reuses getGoalsWithProgress's shape so detail components can consume the
 * same GoalWithProgress type as /goals' leaderboard.
 */
export async function getGoalDetail(
  goalId: string,
  userId: string,
): Promise<GoalWithProgress | null> {
  // First confirm the goal exists AND is owned by this user. Cheap guard
  // before computing the heavier progress aggregates.
  const [row] = await db
    .select({ id: goals.id })
    .from(goals)
    .where(and(eq(goals.id, goalId), eq(goals.userId, userId)));
  if (!row) return null;

  // Compute the user's full goal set with progress, then pick out this one.
  // Reused for shape parity with /goals; if N grows large enough that this
  // is a perf concern, factor out the per-goal progress computation.
  const all = await getGoalsWithProgress(userId);
  return all.find((g) => g.id === goalId) ?? null;
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS — no errors.

- [ ] **Step 3: Run full suite for no regressions**

Run: `npm test`
Expected: PASS — `Tests 290 passed (290)` (no change; this query has no unit test, integration via page UAT).

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/queries/goal-detail.ts
git commit -m "feat(goals): getGoalDetail single-goal query with ownership scope"
```

---

### Task 4: `getGoalTrajectory` query

Walks back from the goal's current value through transactions on the goal's contributing accounts, mirroring the W-06 stable-anchor pattern from `getNetWorthSparkline`. Uses `walkBackTrajectory` from Task 1 for the pure walk math.

**Files:**
- Modify: `src/lib/db/queries/goal-detail.ts:end-of-file`

- [ ] **Step 1: Write the implementation**

Append to `src/lib/db/queries/goal-detail.ts`:

```ts
import { gte, inArray, lte, notInArray, sql } from 'drizzle-orm';
import {
  financialAccounts,
  externalItems,
  transactions,
} from '@/lib/db/schema';
import {
  walkBackTrajectory,
  type TrajectoryPoint,
} from '@/lib/goals/trajectory';

const DAY_MS = 24 * 60 * 60 * 1000;

export type GoalTrajectory = {
  /** Oldest→newest, ready for Recharts. */
  series: TrajectoryPoint[];
  /** YYYY-MM-DD start of the window. */
  windowStart: string;
  /** YYYY-MM-DD end of the window (today, or campaign end if past target). */
  windowEnd: string;
};

/**
 * Trajectory data for the chart. Branches by goal type:
 *   - savings: cumulative balance sum across contributing accounts, walked
 *     back from today through credits/debits hitting those accounts.
 *   - spend_cap: cumulative spend in the current month, day-by-day.
 *
 * Investment-account drift is NOT captured (we lack price history). Savings
 * goals on investment accounts will only show contribution flows.
 * TODO: Approach B (goal_progress_snapshot table) when this becomes a
 * complaint.
 */
export async function getGoalTrajectory(
  goalId: string,
  userId: string,
): Promise<GoalTrajectory | null> {
  const goal = await getGoalDetail(goalId, userId);
  if (!goal) return null;

  if (goal.type === 'spend_cap') {
    return getSpendCapTrajectory(goal);
  }
  return getSavingsTrajectory(goal);
}

async function getSavingsTrajectory(
  goal: GoalWithProgress,
): Promise<GoalTrajectory> {
  // Window: created_at → target_date, fallback created_at + 12 months.
  const created = goal.createdAt;
  const target = goal.targetDate
    ? new Date(goal.targetDate + 'T00:00:00Z')
    : new Date(created.getTime() + 365 * DAY_MS);
  const windowStart = created.toISOString().slice(0, 10);
  const windowEnd = (target < new Date() ? target : new Date())
    .toISOString()
    .slice(0, 10);

  if (goal.progress.type !== 'savings') {
    // Defensive: caller already branched, but TS narrowing.
    return { series: [], windowStart, windowEnd };
  }
  const anchor = goal.progress.current;

  const accountIds = goal.accountIds ?? [];
  if (accountIds.length === 0) {
    return { series: [], windowStart, windowEnd };
  }

  const today = new Date();
  const daysFromCreated = Math.max(
    1,
    Math.ceil((today.getTime() - created.getTime()) / DAY_MS) + 1,
  );

  const rows = await db
    .select({
      date: transactions.date,
      total: sql<string>`COALESCE(SUM(${transactions.amount}::numeric), 0)`,
    })
    .from(transactions)
    .innerJoin(
      financialAccounts,
      eq(financialAccounts.id, transactions.accountId),
    )
    .innerJoin(externalItems, eq(externalItems.id, financialAccounts.itemId))
    .where(
      and(
        eq(externalItems.userId, goal.id /* placeholder — see below */),
        inArray(financialAccounts.id, accountIds),
        gte(transactions.date, windowStart),
        lte(financialAccounts.createdAt, created),
      ),
    )
    .groupBy(transactions.date);

  const dailyDelta = new Map<string, number>();
  for (const r of rows) dailyDelta.set(r.date, Number(r.total));

  const series = walkBackTrajectory({
    anchor,
    dailyDelta,
    today,
    days: daysFromCreated,
  });
  return { series, windowStart, windowEnd };
}

async function getSpendCapTrajectory(
  goal: GoalWithProgress,
): Promise<GoalTrajectory> {
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const windowStart = monthStart.toISOString().slice(0, 10);
  const windowEnd = monthEnd.toISOString().slice(0, 10);

  if (goal.progress.type !== 'spend_cap') {
    return { series: [], windowStart, windowEnd };
  }

  // For spend caps, "anchor" is the running cumulative spend so far this
  // month. We walk back removing this month's spend day by day so day 1
  // shows $0.
  const anchor = goal.progress.spent;
  const accountIds = goal.accountIds ?? [];
  const categoryFilter = goal.categoryFilter ?? [];

  const conditions = [
    eq(externalItems.userId, goal.id /* placeholder — see below */),
    gte(transactions.date, windowStart),
    sql`${transactions.amount}::numeric > 0`,
    sql`COALESCE(${transactions.primaryCategory}, '') NOT IN ('TRANSFER_IN', 'TRANSFER_OUT', 'LOAN_PAYMENTS')`,
  ];
  if (accountIds.length > 0) {
    conditions.push(inArray(financialAccounts.id, accountIds));
  }
  if (categoryFilter.length > 0) {
    conditions.push(inArray(transactions.primaryCategory, categoryFilter));
  }

  const rows = await db
    .select({
      date: transactions.date,
      total: sql<string>`COALESCE(SUM(${transactions.amount}::numeric), 0)`,
    })
    .from(transactions)
    .innerJoin(
      financialAccounts,
      eq(financialAccounts.id, transactions.accountId),
    )
    .innerJoin(externalItems, eq(externalItems.id, financialAccounts.itemId))
    .where(and(...conditions))
    .groupBy(transactions.date);

  const dailyDelta = new Map<string, number>();
  for (const r of rows) dailyDelta.set(r.date, Number(r.total));

  const daysSinceMonthStart = Math.max(
    1,
    Math.ceil((today.getTime() - monthStart.getTime()) / DAY_MS) + 1,
  );

  const series = walkBackTrajectory({
    anchor,
    dailyDelta,
    today,
    days: daysSinceMonthStart,
  });
  return { series, windowStart, windowEnd };
}
```

**IMPORTANT:** the `goal.id /* placeholder */` comments in both helpers above are intentionally wrong — I need the user's id, not the goal's. Step 2 fixes this.

- [ ] **Step 2: Fix the user-id placeholder by accepting userId through the call chain**

Update `getGoalTrajectory`'s signature (already takes userId) and pass it through to the helpers. Replace the two `eq(externalItems.userId, goal.id /* placeholder */)` lines:

```ts
// In getSavingsTrajectory + getSpendCapTrajectory: replace the userId
// placeholder by adding `userId: string` as a second helper parameter
// and propagating from getGoalTrajectory.
//
// Final shape:
async function getSavingsTrajectory(goal: GoalWithProgress, userId: string) {
  // ...
  .where(and(eq(externalItems.userId, userId), ...))
  // ...
}
async function getSpendCapTrajectory(goal: GoalWithProgress, userId: string) {
  // ...similar...
}

// And in getGoalTrajectory:
if (goal.type === 'spend_cap') {
  return getSpendCapTrajectory(goal, userId);
}
return getSavingsTrajectory(goal, userId);
```

Make those four edits.

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS — no errors. (If TypeScript flags `condition.push` types in `getSpendCapTrajectory`, change `const conditions = [...]` to `const conditions: SQL[] = [...]` and import `type SQL` from `drizzle-orm`.)

- [ ] **Step 4: Run full suite for no regressions**

Run: `npm test`
Expected: PASS — `Tests 290 passed (290)`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/queries/goal-detail.ts
git commit -m "feat(goals): getGoalTrajectory query reuses W-06 walk-back pattern"
```

---

### Task 5: `getContributingFeed` query

Top-20 transactions for spend-cap (sorted by amount desc), or weekly net delta rows for savings.

**Files:**
- Modify: `src/lib/db/queries/goal-detail.ts:end-of-file`

- [ ] **Step 1: Write the implementation**

Append:

```ts
export type SpendCapFeedRow = {
  id: string;
  date: string;
  name: string;
  merchantName: string | null;
  amount: number;
  category: string | null;
  accountName: string;
};

export type SavingsFeedRow = {
  /** Monday of the week, YYYY-MM-DD */
  weekStart: string;
  /** Sunday of the week, YYYY-MM-DD */
  weekEnd: string;
  netDelta: number;
  txnCount: number;
};

export type GoalContributingFeed =
  | { kind: 'spend_cap'; rows: SpendCapFeedRow[] }
  | { kind: 'savings'; rows: SavingsFeedRow[] }
  | { kind: 'empty' };

export async function getContributingFeed(
  goalId: string,
  userId: string,
): Promise<GoalContributingFeed> {
  const goal = await getGoalDetail(goalId, userId);
  if (!goal) return { kind: 'empty' };

  if (goal.type === 'spend_cap') {
    return getSpendCapFeed(goal, userId);
  }
  return getSavingsFeed(goal, userId);
}

async function getSpendCapFeed(
  goal: GoalWithProgress,
  userId: string,
): Promise<GoalContributingFeed> {
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
    .toISOString()
    .slice(0, 10);

  const accountIds = goal.accountIds ?? [];
  const categoryFilter = goal.categoryFilter ?? [];

  const conditions = [
    eq(externalItems.userId, userId),
    gte(transactions.date, monthStart),
    sql`${transactions.amount}::numeric > 0`,
    sql`COALESCE(${transactions.primaryCategory}, '') NOT IN ('TRANSFER_IN', 'TRANSFER_OUT', 'LOAN_PAYMENTS')`,
  ];
  if (accountIds.length > 0) {
    conditions.push(inArray(financialAccounts.id, accountIds));
  }
  if (categoryFilter.length > 0) {
    conditions.push(inArray(transactions.primaryCategory, categoryFilter));
  }

  const rows = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      name: transactions.name,
      merchantName: transactions.merchantName,
      amount: transactions.amount,
      category: transactions.primaryCategory,
      accountName: financialAccounts.name,
    })
    .from(transactions)
    .innerJoin(
      financialAccounts,
      eq(financialAccounts.id, transactions.accountId),
    )
    .innerJoin(externalItems, eq(externalItems.id, financialAccounts.itemId))
    .where(and(...conditions))
    .orderBy(sql`${transactions.amount}::numeric DESC`)
    .limit(20);

  return {
    kind: 'spend_cap',
    rows: rows.map((r) => ({
      id: r.id,
      date: r.date,
      name: r.name,
      merchantName: r.merchantName,
      amount: Number(r.amount),
      category: r.category,
      accountName: r.accountName,
    })),
  };
}

async function getSavingsFeed(
  goal: GoalWithProgress,
  userId: string,
): Promise<GoalContributingFeed> {
  const accountIds = goal.accountIds ?? [];
  if (accountIds.length === 0) {
    return { kind: 'savings', rows: [] };
  }
  const windowStart = goal.createdAt.toISOString().slice(0, 10);

  const rows = await db
    .select({
      // Postgres date_trunc('week') returns Monday. Cast to date so we get
      // a YYYY-MM-DD string out.
      weekStart: sql<string>`(date_trunc('week', ${transactions.date})::date)::text`,
      // Inflows are negative amounts in our convention; flip sign so the
      // feed reads "net deposit per week".
      netDelta: sql<string>`SUM(-${transactions.amount}::numeric)`,
      txnCount: sql<string>`COUNT(*)`,
    })
    .from(transactions)
    .innerJoin(
      financialAccounts,
      eq(financialAccounts.id, transactions.accountId),
    )
    .innerJoin(externalItems, eq(externalItems.id, financialAccounts.itemId))
    .where(
      and(
        eq(externalItems.userId, userId),
        inArray(financialAccounts.id, accountIds),
        gte(transactions.date, windowStart),
      ),
    )
    .groupBy(sql`date_trunc('week', ${transactions.date})`)
    .orderBy(sql`date_trunc('week', ${transactions.date}) DESC`)
    .limit(12);

  return {
    kind: 'savings',
    rows: rows.map((r) => {
      const start = new Date(r.weekStart + 'T00:00:00Z');
      const endDate = new Date(start);
      endDate.setUTCDate(start.getUTCDate() + 6);
      return {
        weekStart: r.weekStart,
        weekEnd: endDate.toISOString().slice(0, 10),
        netDelta: Number(r.netDelta),
        txnCount: Number(r.txnCount),
      };
    }),
  };
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Run full suite**

Run: `npm test`
Expected: PASS — `Tests 290 passed (290)`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/queries/goal-detail.ts
git commit -m "feat(goals): getContributingFeed query (spend-cap top-20 + savings weekly)"
```

---

### Task 6: Detail header component

**Files:**
- Create: `src/components/goals/detail-header.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/goals/detail-header.tsx
import { Pencil } from 'lucide-react';
import Link from 'next/link';
import { DeleteGoalButton } from '@/components/goals/delete-goal-button';
import { Button } from '@/components/ui/button';
import type { GoalWithProgress } from '@/lib/db/queries/goals';
import { humanizeDate } from '@/lib/format/date';
import { paceVerdict } from '@/lib/goals/pace';
import { cn, formatCurrency } from '@/lib/utils';

type Props = { goal: GoalWithProgress };

export function GoalDetailHeader({ goal }: Props) {
  const verdict = paceVerdict(goal);
  const kindLabel = goal.type === 'savings' ? 'Savings goal' : 'Spend cap';
  const created = humanizeDate(goal.createdAt.toISOString().slice(0, 10));
  const numbers =
    goal.progress.type === 'savings'
      ? `${formatCurrency(goal.progress.current)} of ${formatCurrency(goal.progress.target)}`
      : `${formatCurrency(goal.progress.spent)} of ${formatCurrency(goal.progress.cap)}`;
  const fractionPct = Math.round(goal.progress.fraction * 100);

  return (
    <header className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-eyebrow">
          {kindLabel} · Created {created}
          {!goal.isActive && (
            <span className="ml-2 text-amber-700">· Archived</span>
          )}
        </p>
        <div className="flex gap-0.5">
          <Button asChild variant="ghost" size="sm" className="h-8 w-8 p-0">
            <Link href={`/goals/${goal.id}/edit`} aria-label="Edit goal">
              <Pencil className="h-4 w-4" />
            </Link>
          </Button>
          <DeleteGoalButton goalId={goal.id} goalName={goal.name} />
        </div>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{goal.name}</h1>
          <p className="mt-1 font-mono text-sm tabular-nums text-muted-foreground">
            {numbers} · {fractionPct}%
          </p>
        </div>
        <StatusPill verdict={verdict} goal={goal} />
      </div>
    </header>
  );
}

function StatusPill({
  verdict,
  goal,
}: {
  verdict: ReturnType<typeof paceVerdict>;
  goal: GoalWithProgress;
}) {
  const { label, tone } = pillFor(verdict, goal);
  const cls = {
    over: 'bg-destructive/10 text-destructive border-destructive/30',
    warning: 'bg-amber-500/15 text-amber-700 border-amber-500/30',
    positive: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30',
    neutral: 'bg-accent text-foreground border-border',
  } as const;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-pill border px-2.5 py-1 text-xs font-medium',
        cls[tone],
      )}
    >
      {label}
    </span>
  );
}

function pillFor(
  verdict: ReturnType<typeof paceVerdict>,
  goal: GoalWithProgress,
): { label: string; tone: 'over' | 'warning' | 'positive' | 'neutral' } {
  if (verdict === 'over') return { label: 'Over', tone: 'over' };
  if (verdict === 'hit') return { label: 'Goal hit', tone: 'positive' };
  if (verdict === 'on-pace') return { label: 'On pace', tone: 'neutral' };
  if (goal.progress.type === 'spend_cap') {
    return { label: 'Trending over', tone: 'warning' };
  }
  if (goal.progress.monthlyVelocity <= 0) {
    return { label: 'Not contributing', tone: 'warning' };
  }
  return { label: 'Behind pace', tone: 'warning' };
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/goals/detail-header.tsx
git commit -m "feat(goals): detail-header component with status pill and edit/delete"
```

---

### Task 7: Projection card component

**Files:**
- Create: `src/components/goals/projection-card.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/goals/projection-card.tsx
import type { GoalWithProgress } from '@/lib/db/queries/goals';
import { humanizeDate } from '@/lib/format/date';
import { paceVerdict } from '@/lib/goals/pace';
import { formatCurrency } from '@/lib/utils';

type Props = { goal: GoalWithProgress };

/**
 * Headline projection sentence — varies by goal type AND whether projection
 * is favorable. All copy lives here (not in the predicate) because the
 * projection inputs come straight from goal.progress; no derived computation
 * worth extracting yet.
 */
export function GoalProjectionCard({ goal }: Props) {
  const verdict = paceVerdict(goal);
  const sentence = projectionSentence(goal, verdict);
  return (
    <section className="rounded-card border border-border bg-card p-5 sm:p-6">
      <p className="text-eyebrow mb-2">Projection</p>
      <p className="text-base leading-snug text-foreground">{sentence}</p>
    </section>
  );
}

function projectionSentence(
  goal: GoalWithProgress,
  verdict: ReturnType<typeof paceVerdict>,
): string {
  const p = goal.progress;
  if (p.type === 'spend_cap') {
    if (verdict === 'over') {
      const overage = p.spent - p.cap;
      const today = new Date();
      const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      const daysLeft = Math.max(
        0,
        monthEnd.getDate() - today.getDate(),
      );
      return `Already ${formatCurrency(overage)} over the ${formatCurrency(p.cap)} cap with ${daysLeft} day${daysLeft === 1 ? '' : 's'} left in the month.`;
    }
    if (verdict === 'behind') {
      const overage = p.projectedMonthly - p.cap;
      return `Projected month-end: ${formatCurrency(p.projectedMonthly)} (${formatCurrency(overage)} over the ${formatCurrency(p.cap)} cap).`;
    }
    const margin = p.cap - p.projectedMonthly;
    return `Projected month-end spend: ${formatCurrency(p.projectedMonthly)} — comfortably under the ${formatCurrency(p.cap)} cap (${formatCurrency(margin)} headroom).`;
  }

  // savings
  if (verdict === 'hit') {
    return `Hit ${formatCurrency(p.target)} — ${formatCurrency(p.current - p.target)} over target.`;
  }
  if (verdict === 'behind') {
    if (goal.targetDate && p.projectedDate) {
      return `At current pace, you'll be ${formatCurrency(p.target - estimatedAtTargetDate(p, goal.targetDate))} short of the ${humanizeDate(goal.targetDate)} target. ETA at this rate: ${humanizeDate(p.projectedDate)}.`;
    }
    return `At current pace (${formatCurrency(p.monthlyVelocity)}/mo), this goal is not yet on track.`;
  }
  // on-pace
  if (p.projectedDate) {
    return `Projected to hit ${formatCurrency(p.target)} by ${humanizeDate(p.projectedDate)}.`;
  }
  return `Tracking toward ${formatCurrency(p.target)} at ${formatCurrency(p.monthlyVelocity)}/mo.`;
}

function estimatedAtTargetDate(
  p: Extract<GoalWithProgress['progress'], { type: 'savings' }>,
  targetDateIso: string,
): number {
  const target = new Date(targetDateIso + 'T00:00:00Z');
  const today = new Date();
  const monthsRemaining = Math.max(
    0,
    (target.getTime() - today.getTime()) / (30 * 24 * 60 * 60 * 1000),
  );
  return p.current + p.monthlyVelocity * monthsRemaining;
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/goals/projection-card.tsx
git commit -m "feat(goals): projection-card with type-and-verdict-branched copy"
```

---

### Task 8: Trajectory chart (Recharts client island)

**Files:**
- Create: `src/components/goals/trajectory-chart.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/goals/trajectory-chart.tsx
'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TrajectoryPoint } from '@/lib/goals/trajectory';
import { formatCurrency } from '@/lib/utils';

type Props = {
  series: TrajectoryPoint[];
  windowStart: string;
  windowEnd: string;
  /** Goal target ($) or cap ($) — drawn as a horizontal reference line. */
  target: number;
  /** Behind/over → amber fill; on-pace → foreground hue. */
  isBehind: boolean;
};

/**
 * Cumulative-vs-ideal-pace chart per the locked design from
 * 2026-05-07-phase-3-pt3-goal-detail-design.md § 5.3.
 *
 * Solid line = actual cumulative. Dashed line = linear ideal pace from
 * window start to target at window end. Reference line at target/cap.
 *
 * Empty state (series.length < 7) is rendered by the caller — this
 * component assumes there's enough data to chart.
 */
export function GoalTrajectoryChart({
  series,
  windowStart,
  windowEnd,
  target,
  isBehind,
}: Props) {
  // Compute the ideal-pace line as a synthetic series of just two points
  // (start at $0, end at $target across the window). Recharts plots a
  // straight line between them.
  const idealPace = [
    { date: windowStart, ideal: 0 },
    { date: windowEnd, ideal: target },
  ];
  // Merge actual + ideal into a unified data array keyed by date. Any date
  // missing one half renders as a gap which Recharts handles with
  // connectNulls.
  const data = mergeByDate(series, idealPace);

  const lineColor = isBehind ? 'hsl(var(--chart-3))' : 'hsl(var(--foreground))';
  const fillColor = isBehind ? 'hsl(var(--chart-3))' : 'hsl(var(--foreground))';

  return (
    <div className="aspect-[16/10] w-full md:aspect-[5/2]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
        >
          <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
          <XAxis
            dataKey="date"
            tickFormatter={(d: string) => d.slice(5)}
            tick={{ fontSize: 11 }}
            stroke="hsl(var(--muted-foreground))"
          />
          <YAxis
            tickFormatter={(v: number) => `$${Math.round(v / 1000)}k`}
            tick={{ fontSize: 11 }}
            stroke="hsl(var(--muted-foreground))"
            width={40}
          />
          <Tooltip
            contentStyle={{
              background: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: 6,
              fontSize: 12,
            }}
            formatter={(v: number, name) => [formatCurrency(v), name]}
          />
          <ReferenceLine
            y={target}
            stroke="hsl(var(--muted-foreground))"
            strokeDasharray="4 3"
            label={{ value: 'Target', position: 'right', fontSize: 10 }}
          />
          <Area
            type="monotone"
            dataKey="cumulative"
            name="Actual"
            stroke={lineColor}
            fill={fillColor}
            fillOpacity={0.12}
            strokeWidth={2}
            connectNulls
          />
          <Line
            type="linear"
            dataKey="ideal"
            name="Ideal pace"
            stroke="hsl(var(--muted-foreground))"
            strokeDasharray="3 3"
            strokeWidth={1.5}
            dot={false}
            connectNulls
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

type MergedRow = {
  date: string;
  cumulative?: number;
  ideal?: number;
};

function mergeByDate(
  actual: TrajectoryPoint[],
  ideal: { date: string; ideal: number }[],
): MergedRow[] {
  const map = new Map<string, MergedRow>();
  for (const p of actual) {
    map.set(p.date, { date: p.date, cumulative: p.cumulative });
  }
  for (const p of ideal) {
    const existing = map.get(p.date);
    if (existing) existing.ideal = p.ideal;
    else map.set(p.date, { date: p.date, ideal: p.ideal });
  }
  return Array.from(map.values()).sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/goals/trajectory-chart.tsx
git commit -m "feat(goals): trajectory-chart Recharts client island"
```

---

### Task 9: Contributing feed components (spend-cap + savings)

**Files:**
- Create: `src/components/goals/spend-cap-feed.tsx`
- Create: `src/components/goals/savings-feed.tsx`

- [ ] **Step 1: Write `spend-cap-feed.tsx`**

```tsx
// src/components/goals/spend-cap-feed.tsx
import Link from 'next/link';
import type { SpendCapFeedRow } from '@/lib/db/queries/goal-detail';
import { humanizeCategory } from '@/lib/format/category';
import { humanizeDate } from '@/lib/format/date';
import { formatCurrency } from '@/lib/utils';

type Props = {
  rows: SpendCapFeedRow[];
  /** First categoryFilter entry, or null for "all categories". */
  categoryHref: string | null;
};

export function SpendCapFeed({ rows, categoryHref }: Props) {
  if (rows.length === 0) {
    return (
      <section className="rounded-card border border-border bg-card p-5">
        <p className="text-eyebrow mb-2">This month</p>
        <p className="text-sm text-muted-foreground">
          No spending matched this cap yet this month.
        </p>
      </section>
    );
  }
  const monthStart = new Date();
  monthStart.setDate(1);
  const fromIso = monthStart.toISOString().slice(0, 10);
  const viewAllHref = categoryHref
    ? `/transactions?category=${categoryHref}&from=${fromIso}`
    : `/transactions?from=${fromIso}`;
  return (
    <section className="rounded-card border border-border bg-card">
      <header className="flex items-baseline justify-between border-b border-border px-5 py-3">
        <p className="text-eyebrow">
          Top transactions · this month
        </p>
        <Link
          href={viewAllHref}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          View all →
        </Link>
      </header>
      <ul className="divide-y divide-border">
        {rows.map((r) => (
          <li
            key={r.id}
            className="flex items-baseline justify-between gap-3 px-5 py-3"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {r.merchantName ?? r.name}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {humanizeDate(r.date)}
                {r.category && ` · ${humanizeCategory(r.category)}`}
                {' · '}
                {r.accountName}
              </p>
            </div>
            <p className="shrink-0 font-mono text-sm tabular-nums text-foreground">
              {formatCurrency(r.amount)}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 2: Write `savings-feed.tsx`**

```tsx
// src/components/goals/savings-feed.tsx
import type { SavingsFeedRow } from '@/lib/db/queries/goal-detail';
import { humanizeDate } from '@/lib/format/date';
import { cn, formatCurrency } from '@/lib/utils';

type Props = { rows: SavingsFeedRow[] };

export function SavingsFeed({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <section className="rounded-card border border-border bg-card p-5">
        <p className="text-eyebrow mb-2">Weekly contributions</p>
        <p className="text-sm text-muted-foreground">
          No activity on contributing accounts yet.
        </p>
      </section>
    );
  }
  return (
    <section className="rounded-card border border-border bg-card">
      <header className="border-b border-border px-5 py-3">
        <p className="text-eyebrow">Weekly contributions</p>
      </header>
      <ul className="divide-y divide-border">
        {rows.map((r) => {
          const isPositive = r.netDelta > 0;
          return (
            <li
              key={r.weekStart}
              className="flex items-baseline justify-between gap-3 px-5 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {humanizeDate(r.weekStart)} – {humanizeDate(r.weekEnd)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {r.txnCount} {r.txnCount === 1 ? 'transaction' : 'transactions'}
                </p>
              </div>
              <p
                className={cn(
                  'shrink-0 font-mono text-sm tabular-nums',
                  isPositive
                    ? 'text-emerald-700'
                    : r.netDelta < 0
                      ? 'text-amber-700'
                      : 'text-muted-foreground',
                )}
              >
                {isPositive ? '+' : ''}
                {formatCurrency(r.netDelta)}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/goals/spend-cap-feed.tsx src/components/goals/savings-feed.tsx
git commit -m "feat(goals): spend-cap and savings contributing-feed components"
```

---

### Task 10: Coaching card

**Files:**
- Create: `src/components/goals/coaching-card.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/goals/coaching-card.tsx
import type { CoachingOutput } from '@/lib/goals/coaching';

type Props = { coaching: CoachingOutput };

export function GoalCoachingCard({ coaching }: Props) {
  return (
    <section className="rounded-card border border-border bg-card p-5 sm:p-6">
      <p className="text-eyebrow mb-3">Coaching</p>
      <p className="text-base italic text-foreground">{coaching.status}</p>
      {coaching.action && (
        <p className="mt-2 text-sm text-muted-foreground">{coaching.action}</p>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/goals/coaching-card.tsx
git commit -m "feat(goals): coaching-card renders composeCoaching output"
```

---

### Task 11: Page route + not-found

**Files:**
- Create: `src/app/(app)/goals/[id]/not-found.tsx`
- Create: `src/app/(app)/goals/[id]/page.tsx`

- [ ] **Step 1: Write `not-found.tsx`**

```tsx
// src/app/(app)/goals/[id]/not-found.tsx
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function GoalNotFound() {
  return (
    <div className="mx-auto max-w-md px-6 py-16 text-center">
      <h1 className="text-lg font-semibold tracking-tight">Goal not found</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        This goal doesn&apos;t exist or isn&apos;t visible to your account.
      </p>
      <Button asChild className="mt-6">
        <Link href="/goals">
          <ArrowLeft className="h-4 w-4" />
          Back to goals
        </Link>
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Write `page.tsx`**

```tsx
// src/app/(app)/goals/[id]/page.tsx
import { notFound } from 'next/navigation';
import { auth } from '@/auth';
import { GoalCoachingCard } from '@/components/goals/coaching-card';
import { GoalDetailHeader } from '@/components/goals/detail-header';
import { GoalProjectionCard } from '@/components/goals/projection-card';
import { SavingsFeed } from '@/components/goals/savings-feed';
import { SpendCapFeed } from '@/components/goals/spend-cap-feed';
import { GoalTrajectoryChart } from '@/components/goals/trajectory-chart';
import type { GoalWithProgress } from '@/lib/db/queries/goals';
import {
  getContributingFeed,
  getGoalDetail,
  getGoalTrajectory,
} from '@/lib/db/queries/goal-detail';
import { composeCoaching, type CoachingInput } from '@/lib/goals/coaching';
import { paceVerdict } from '@/lib/goals/pace';

type Props = {
  params: { id: string };
};

export default async function GoalDetailPage({ params }: Props) {
  const session = await auth();
  if (!session?.user) return null;
  const userId = session.user.id;

  // Fetch detail first; if missing, 404 before doing the heavier queries.
  const goal = await getGoalDetail(params.id, userId);
  if (!goal) notFound();

  const [trajectory, feed] = await Promise.all([
    getGoalTrajectory(params.id, userId),
    getContributingFeed(params.id, userId),
  ]);

  const verdict = paceVerdict(goal);
  const coaching = composeCoaching(buildCoachingInput(goal, verdict, feed));

  const target =
    goal.progress.type === 'savings' ? goal.progress.target : goal.progress.cap;
  const isBehind = verdict === 'behind' || verdict === 'over';
  const showChart = (trajectory?.series.length ?? 0) >= 7;

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-8 sm:py-8">
      <GoalDetailHeader goal={goal} />
      <GoalProjectionCard goal={goal} />
      {showChart && trajectory ? (
        <section className="rounded-card border border-border bg-card p-5 sm:p-6">
          <p className="text-eyebrow mb-3">Trajectory</p>
          <GoalTrajectoryChart
            series={trajectory.series}
            windowStart={trajectory.windowStart}
            windowEnd={trajectory.windowEnd}
            target={target}
            isBehind={isBehind}
          />
        </section>
      ) : (
        <section className="rounded-card border border-border bg-card p-5 sm:p-6">
          <p className="text-eyebrow mb-2">Trajectory</p>
          <p className="text-sm text-muted-foreground">
            Enough data to chart trajectory after a week of activity.
          </p>
        </section>
      )}
      {feed.kind === 'spend_cap' && (
        <SpendCapFeed
          rows={feed.rows}
          categoryHref={goal.categoryFilter?.[0] ?? null}
        />
      )}
      {feed.kind === 'savings' && <SavingsFeed rows={feed.rows} />}
      <GoalCoachingCard coaching={coaching} />
    </div>
  );
}

/**
 * Bridges the DB shape (GoalWithProgress + feed) to the coaching predicate's
 * discriminated union. Keeps composeCoaching pure of database concerns.
 *
 * topDiscretionaryCategory is null in MVP — drift integration is a follow-on
 * (would call getDriftAnalysis for the user's top elevated category here).
 * Behind-savings still gets the status sentence; the action sentence just
 * stays null until that wiring lands.
 */
function buildCoachingInput(
  goal: GoalWithProgress,
  verdict: ReturnType<typeof paceVerdict>,
  feed: Awaited<ReturnType<typeof getContributingFeed>>,
): CoachingInput {
  const p = goal.progress;
  if (p.type === 'savings') {
    if (verdict === 'hit') {
      return {
        kind: 'savings',
        verdict: 'hit',
        hitDate: new Date().toISOString().slice(0, 10),
        overshoot: p.current - p.target,
      };
    }
    // requiredMonthlyVelocity = remaining / months until target. If no target
    // date OR the target is past, fall back to monthly velocity needed to
    // reach target in 12 months from now.
    const required = computeRequiredMonthlyVelocity(goal);
    if (verdict === 'on-pace') {
      return {
        kind: 'savings',
        verdict: 'on-pace',
        monthlyVelocity: p.monthlyVelocity,
        requiredMonthlyVelocity: required,
        topDiscretionaryCategory: null,
      };
    }
    return {
      kind: 'savings',
      verdict: 'behind',
      monthlyVelocity: p.monthlyVelocity,
      requiredMonthlyVelocity: required,
      // TODO follow-on: pull from getDriftAnalysis; for now no action.
      topDiscretionaryCategory: null,
    };
  }
  // spend_cap
  const topMerchants =
    feed.kind === 'spend_cap'
      ? feed.rows
          .map((r) => ({ name: r.merchantName ?? r.name, amount: r.amount }))
          .slice(0, 3)
      : [];
  if (verdict === 'over') {
    return {
      kind: 'spend_cap',
      verdict: 'over',
      cap: p.cap,
      spent: p.spent,
      projectedMonthly: p.projectedMonthly,
      topMerchants,
    };
  }
  if (verdict === 'behind') {
    return {
      kind: 'spend_cap',
      verdict: 'behind',
      cap: p.cap,
      spent: p.spent,
      projectedMonthly: p.projectedMonthly,
      topMerchants,
    };
  }
  return {
    kind: 'spend_cap',
    verdict: 'on-pace',
    cap: p.cap,
    spent: p.spent,
    projectedMonthly: p.projectedMonthly,
    topMerchants,
  };
}

function computeRequiredMonthlyVelocity(goal: GoalWithProgress): number {
  if (goal.progress.type !== 'savings') return 0;
  const remaining = goal.progress.remaining;
  if (!goal.targetDate) return remaining / 12;
  const target = new Date(goal.targetDate + 'T00:00:00Z');
  const today = new Date();
  const monthsRemaining = Math.max(
    1,
    (target.getTime() - today.getTime()) / (30 * 24 * 60 * 60 * 1000),
  );
  return remaining / monthsRemaining;
}
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/goals/\[id\]
git commit -m "feat(goals): /goals/[id] route with 5-section detail layout"
```

---

### Task 12: Wire `/goals` row drilldown to the new route

**Files:**
- Modify: `src/components/goals/goal-row.tsx` (entire `drilldownHref` helper)

- [ ] **Step 1: Find and update the `drilldownHref` helper**

Open `src/components/goals/goal-row.tsx`. Find the `drilldownHref` function (likely below the main component). Replace its body so that **both** savings and spend-cap goals point at `/goals/${goal.id}` instead of the current spend-cap-only `/transactions?...` URL:

```ts
function drilldownHref(
  goal: GoalWithProgress,
  v: ReturnType<typeof paceVerdict>,
): string | null {
  // Both goal types now drill into the rich detail page (Phase 3-pt3).
  // Spend-cap rows previously linked to /transactions filtered by category;
  // that link now lives on the detail page's "View all" CTA in the
  // contributing feed. Savings rows had no drill before — they get one now.
  void v;
  return `/goals/${goal.id}`;
}
```

(The `void v;` mute is intentional — we still accept the verdict argument for callsite consistency in case future variants need it.)

- [ ] **Step 2: Update the aria-label on the stretched Link**

In the same file, find the `<Link>` with `absolute inset-0` (the stretched anchor). Change its `aria-label` so it reads correctly for both goal types:

```tsx
<Link
  href={drilldown}
  className="absolute inset-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
  aria-label={`Open ${goal.name} detail`}
/>
```

- [ ] **Step 3: Run typecheck + tests**

Run: `npm run typecheck && npm test`
Expected: PASS — `Tests 290 passed (290)`.

- [ ] **Step 4: Commit**

```bash
git add src/components/goals/goal-row.tsx
git commit -m "feat(goals): drilldown both row types to /goals/[id]"
```

---

### Task 13: Manual UAT walkthrough + final wrap

**Files:** none.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Expected: starts at `http://localhost:3000`.

- [ ] **Step 2: Walk through each goal**

For each goal currently in the DB:
- Navigate to `/goals`. Click a row. Expect to land on `/goals/[id]`.
- Verify the header shows: name, eyebrow ("Savings goal · Created Mar 14" or similar), current/target/percentage, status pill matching `/goals` row's pill.
- Verify the projection card sentence reads correctly for the goal's verdict.
- Verify the chart renders (or shows the empty-state caption if goal is <7 days old).
- For spend-caps: verify the contributing feed lists transactions ordered by amount desc, with "View all →" linking to the right `/transactions` filter.
- For savings: verify the contributing feed shows weekly net deltas with positive/negative coloring.
- Verify the coaching card status sentence matches what the predicate would produce for the verdict; action sentence appears for behind/over and is null for on-pace/hit.
- Test edit + delete buttons; both should mirror the /goals row behavior.

- [ ] **Step 3: Confirm fresh test count + final clean state**

Run: `npm run typecheck && npm test`
Expected: PASS — typecheck clean, `Tests 290 passed (290)`.

- [ ] **Step 4: Verify no leftover changes outside scope**

Run: `git status`
Expected: clean working tree (all task commits landed; no stray modifications).

---

## Out of scope (future Phase 3-pt3.b)

- LLM coaching narrative (Anthropic Haiku 4.5)
- Investment-account drift in savings trajectory (Approach B `goal_progress_snapshot` table)
- Drift integration for `topDiscretionaryCategory` in savings coaching (currently always `null` so action sentence is omitted on behind-savings)
- Goal templates / duplicate-from-existing
- Coaching subscription / weekly digest hooks
- Per-goal historical narrative archive

---

**Total: 13 tasks · ~50 steps · ~+10 vitest cases · ~14 new files · 1 modified file.**
