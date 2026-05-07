import { and, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  financialAccounts,
  goals,
  externalItems,
  transactions,
} from '@/lib/db/schema';

export type GoalType = 'savings' | 'spend_cap';

export type SavingsGoalProgress = {
  type: 'savings';
  current: number;
  target: number;
  /** 0..1, may exceed 1 if over-target. */
  fraction: number;
  remaining: number;
  /**
   * Estimated monthly contribution to this goal's accounts based on the
   * trailing 90 days of transactions. Positive = adding, negative = depleting.
   */
  monthlyVelocity: number;
  /**
   * Months remaining at the current velocity. null if velocity is <= 0
   * (not on track at current pace) or target already hit.
   */
  monthsToTarget: number | null;
  /** ISO date (YYYY-MM-DD). null if monthsToTarget is null. */
  projectedDate: string | null;
};

export type SpendCapProgress = {
  type: 'spend_cap';
  /** Spending in scope so far this month. */
  spent: number;
  cap: number;
  /** 0..1, exceeds 1 once you go over the cap. */
  fraction: number;
  /** Negative when over cap. */
  remaining: number;
  /** Linear extrapolation: spent / day_of_month * days_in_month. */
  projectedMonthly: number;
};

export type GoalProgress = SavingsGoalProgress | SpendCapProgress;

export type GoalWithProgress = {
  id: string;
  name: string;
  type: GoalType;
  targetAmount: number | null;
  monthlyAmount: number | null;
  accountIds: string[] | null;
  categoryFilter: string[] | null;
  targetDate: string | null;
  isActive: boolean;
  createdAt: Date;
  /** Names of accounts the goal is scoped to (for display). */
  scopedAccountNames: string[];
  progress: GoalProgress;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** First/last day of the current calendar month as YYYY-MM-DD strings. */
function currentMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
    daysInMonth: Math.round((end.getTime() - start.getTime()) / DAY_MS),
    dayOfMonth: now.getDate(),
  };
}

/** Net monthly inflow on a set of accounts over the trailing 90 days. */
async function getMonthlyVelocity(
  userId: string,
  accountIds: string[],
): Promise<number> {
  if (accountIds.length === 0) return 0;
  const ninetyDaysAgo = new Date(Date.now() - 90 * DAY_MS)
    .toISOString()
    .slice(0, 10);

  const [row] = await db
    .select({
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
        inArray(transactions.accountId, accountIds),
        gte(transactions.date, ninetyDaysAgo),
      ),
    );

  // Plaid: positive = money out, negative = money in. Net inflow over 90
  // days is therefore −SUM, and the monthly rate is that divided by 3.
  return -Number(row?.total ?? 0) / 3;
}

/**
 * Load all of the user's goals with progress + projections computed.
 */
export async function getGoalsWithProgress(
  userId: string,
): Promise<GoalWithProgress[]> {
  const [rawGoals, accs] = await Promise.all([
    db
      .select()
      .from(goals)
      .where(and(eq(goals.userId, userId), eq(goals.isActive, true)))
      .orderBy(goals.createdAt),
    db
      .select({
        id: financialAccounts.id,
        name: financialAccounts.name,
        mask: financialAccounts.mask,
        type: financialAccounts.type,
        currentBalance: financialAccounts.currentBalance,
      })
      .from(financialAccounts)
      .innerJoin(externalItems, eq(externalItems.id, financialAccounts.itemId))
      .where(eq(externalItems.userId, userId)),
  ]);

  const accountById = new Map(accs.map((a) => [a.id, a]));

  // Spend-cap totals: one query per goal so each can have a different
  // account/category filter. Negligible at our scale.
  const monthRange = currentMonthRange();
  const spendCapGoals = rawGoals.filter((g) => g.type === 'spend_cap');
  const spendByGoalId = new Map<string, number>();

  for (const g of spendCapGoals) {
    const conds = [
      eq(externalItems.userId, userId),
      gte(transactions.date, monthRange.start),
      lt(transactions.date, monthRange.end),
      sql`${transactions.amount}::numeric > 0`,
    ];
    if (g.accountIds && g.accountIds.length > 0) {
      conds.push(inArray(transactions.accountId, g.accountIds));
    }
    if (g.categoryFilter && g.categoryFilter.length > 0) {
      conds.push(inArray(transactions.primaryCategory, g.categoryFilter));
    }
    const [row] = await db
      .select({
        total: sql<string>`COALESCE(SUM(${transactions.amount}::numeric), 0)`,
      })
      .from(transactions)
      .innerJoin(
        financialAccounts,
        eq(financialAccounts.id, transactions.accountId),
      )
      .innerJoin(externalItems, eq(externalItems.id, financialAccounts.itemId))
      .where(and(...conds));
    spendByGoalId.set(g.id, Number(row?.total ?? 0));
  }

  // Velocity for savings goals: also one query per goal because each is
  // scoped to different account_ids. Could batch with a CASE, but at our
  // scale parallel awaits are fine.
  const savingsGoals = rawGoals.filter((g) => g.type === 'savings');
  const velocityByGoalId = new Map<string, number>();
  await Promise.all(
    savingsGoals.map(async (g) => {
      const ids = g.accountIds ?? [];
      const v = await getMonthlyVelocity(userId, ids);
      velocityByGoalId.set(g.id, v);
    }),
  );

  return rawGoals.map((g): GoalWithProgress => {
    const accountIds = g.accountIds ?? null;
    const scopedAccounts = (accountIds ?? [])
      .map((id) => accountById.get(id))
      .filter((a): a is NonNullable<typeof a> => !!a);

    const scopedAccountNames = scopedAccounts.map((a) =>
      a.mask ? `${a.name} ····${a.mask}` : a.name,
    );

    let progress: GoalProgress;
    if (g.type === 'savings') {
      const target = g.targetAmount != null ? Number(g.targetAmount) : 0;
      const current = scopedAccounts.reduce((sum, a) => {
        if (a.currentBalance == null) return sum;
        if (a.type !== 'depository' && a.type !== 'investment') return sum;
        return sum + Number(a.currentBalance);
      }, 0);
      const fraction = target > 0 ? current / target : 0;
      const remaining = Math.max(0, target - current);
      const monthlyVelocity = velocityByGoalId.get(g.id) ?? 0;

      let monthsToTarget: number | null = null;
      let projectedDate: string | null = null;
      if (remaining > 0 && monthlyVelocity > 0) {
        monthsToTarget = remaining / monthlyVelocity;
        const t = new Date();
        t.setMonth(t.getMonth() + Math.ceil(monthsToTarget));
        projectedDate = t.toISOString().slice(0, 10);
      }

      progress = {
        type: 'savings',
        current,
        target,
        fraction,
        remaining,
        monthlyVelocity,
        monthsToTarget,
        projectedDate,
      };
    } else {
      const cap = g.monthlyAmount != null ? Number(g.monthlyAmount) : 0;
      const spent = spendByGoalId.get(g.id) ?? 0;
      const fraction = cap > 0 ? spent / cap : 0;
      const projectedMonthly =
        monthRange.dayOfMonth > 0
          ? (spent / monthRange.dayOfMonth) * monthRange.daysInMonth
          : 0;
      progress = {
        type: 'spend_cap',
        spent,
        cap,
        fraction,
        remaining: cap - spent,
        projectedMonthly,
      };
    }

    return {
      id: g.id,
      name: g.name,
      type: g.type as GoalType,
      targetAmount: g.targetAmount != null ? Number(g.targetAmount) : null,
      monthlyAmount: g.monthlyAmount != null ? Number(g.monthlyAmount) : null,
      accountIds,
      categoryFilter: g.categoryFilter ?? null,
      targetDate: g.targetDate ?? null,
      isActive: g.isActive,
      createdAt: g.createdAt,
      scopedAccountNames,
      progress,
    };
  });
}

export async function getGoalById(userId: string, goalId: string) {
  const [row] = await db
    .select()
    .from(goals)
    .where(and(eq(goals.userId, userId), eq(goals.id, goalId)));
  return row ?? null;
}
