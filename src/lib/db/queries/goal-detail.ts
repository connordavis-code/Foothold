import { and, eq, gte, inArray, lte, sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  externalItems,
  financialAccounts,
  goals,
  transactions,
} from '@/lib/db/schema';
import {
  walkBackTrajectory,
  type TrajectoryPoint,
} from '@/lib/goals/trajectory';
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
    return getSpendCapTrajectory(goal, userId);
  }
  return getSavingsTrajectory(goal, userId);
}

async function getSavingsTrajectory(
  goal: GoalWithProgress,
  userId: string,
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
        eq(externalItems.userId, userId),
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
  userId: string,
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

  const conditions: SQL[] = [
    eq(externalItems.userId, userId),
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
