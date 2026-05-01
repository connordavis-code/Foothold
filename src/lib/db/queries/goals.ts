import { and, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  financialAccounts,
  goals,
  plaidItems,
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

/** First/last day of the current calendar month as YYYY-MM-DD strings. */
function currentMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

/**
 * Load all of the user's goals with progress computed for each. Done in
 * three queries total: goals, accounts (for both names + savings progress),
 * and a single grouped sum over this month's transactions for spend caps.
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
      .innerJoin(plaidItems, eq(plaidItems.id, financialAccounts.itemId))
      .where(eq(plaidItems.userId, userId)),
  ]);

  const accountById = new Map(accs.map((a) => [a.id, a]));

  // For spend_cap goals, fan out one query that totals spend per goal.
  // Cheaper to do a single query with WHEREs that capture every cap rather
  // than N queries.
  const spendCapGoals = rawGoals.filter((g) => g.type === 'spend_cap');
  const spendByGoalId = new Map<string, number>();

  if (spendCapGoals.length > 0) {
    const { start, end } = currentMonthRange();
    for (const g of spendCapGoals) {
      const conds = [
        eq(plaidItems.userId, userId),
        gte(transactions.date, start),
        lt(transactions.date, end),
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
        .innerJoin(plaidItems, eq(plaidItems.id, financialAccounts.itemId))
        .where(and(...conds));
      spendByGoalId.set(g.id, Number(row?.total ?? 0));
    }
  }

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
      // Sum the current_balance across the scoped accounts, treating only
      // depository + investment as positive contributions (a credit card
      // or loan account doesn't make sense as a savings target).
      const current = scopedAccounts.reduce((sum, a) => {
        if (a.currentBalance == null) return sum;
        if (a.type !== 'depository' && a.type !== 'investment') return sum;
        return sum + Number(a.currentBalance);
      }, 0);
      const fraction = target > 0 ? current / target : 0;
      progress = {
        type: 'savings',
        current,
        target,
        fraction,
        remaining: Math.max(0, target - current),
      };
    } else {
      const cap = g.monthlyAmount != null ? Number(g.monthlyAmount) : 0;
      const spent = spendByGoalId.get(g.id) ?? 0;
      const fraction = cap > 0 ? spent / cap : 0;
      progress = {
        type: 'spend_cap',
        spent,
        cap,
        fraction,
        remaining: cap - spent,
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

/**
 * Single goal lookup (for the edit form). Filters by userId so a malicious
 * id in the URL can't load someone else's goal.
 */
export async function getGoalById(userId: string, goalId: string) {
  const [row] = await db
    .select()
    .from(goals)
    .where(and(eq(goals.userId, userId), eq(goals.id, goalId)));
  return row ?? null;
}
