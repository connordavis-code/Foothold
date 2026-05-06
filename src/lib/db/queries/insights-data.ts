import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  financialAccounts,
  plaidItems,
  transactions,
} from '@/lib/db/schema';
import {
  type GoalProgress,
  type GoalType,
  getGoalsWithProgress,
} from './goals';
import {
  frequencyToMonthlyMultiplier,
  getRecurringStreams,
} from './recurring';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Plaid PFC categories we exclude from "spending" — these aren't really
 * discretionary outflows. Same list as dashboard.ts uses for the monthly
 * spend stat.
 */
const NON_SPEND_CATEGORIES = [
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'LOAN_PAYMENTS',
];

/** Shift a YYYY-MM-DD date by N days, in UTC to avoid DST hops. */
function shiftDate(yyyymmdd: string, deltaDays: number): string {
  const d = new Date(`${yyyymmdd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

export type CategorySpend = { category: string; total: number };
export type CategoryBaseline = { category: string; medianWeekly: number };

/**
 * Goal snapshot — strips identifiers (id, accountIds, scopedAccountNames)
 * and timestamps before crossing the wire to Anthropic. See the Privacy
 * boundary section of the plan: account names / masks / IDs do NOT leave
 * our infrastructure.
 */
export type GoalSnapshot = {
  name: string;
  type: GoalType;
  isActive: boolean;
  targetDate: string | null;
  progress: GoalProgress;
};

/** Outflow recurring stream, normalized for AI consumption. */
export type RecurringSnapshot = {
  merchantName: string | null;
  description: string | null;
  averageAmount: number | null;
  lastAmount: number | null;
  frequency: string;
  lastDate: string | null;
  status: string;
  primaryCategory: string | null;
  monthlyAmount: number | null;
  /**
   * True when the stream's lastDate falls inside [weekStart, weekEnd].
   * Lets Claude tell at a glance which recurring charges are already
   * included in this-week spending, so it doesn't double-mention them.
   */
  hitThisWeek: boolean;
};

export type InsightSnapshot = {
  weekStart: string;
  weekEnd: string;
  /** All three sources empty → action skips Anthropic and shows empty state. */
  isEmpty: boolean;
  spending: {
    totalThisWeek: number;
    byCategoryThisWeek: CategorySpend[];
    /** Median weekly per-category spend across the prior 4 weeks. */
    baselineByCategory: CategoryBaseline[];
  };
  goals: GoalSnapshot[];
  recurring: RecurringSnapshot[];
};

/**
 * Assemble the data snapshot fed to Claude.
 *
 * Window: [weekKey - 6 days, weekKey] inclusive — 7 calendar days ending
 * on weekKey (the action passes yesterday's date as weekKey).
 *
 * Drift baseline: median per-category weekly total across the 4 weeks
 * immediately preceding the window. Suppression rules (min baseline,
 * absolute floor, ≥1.5×) live in the prompt — we just hand Claude the
 * raw numbers.
 */
export async function collectSnapshot(
  userId: string,
  weekKey: string,
): Promise<InsightSnapshot> {
  const weekEnd = weekKey;
  const weekStart = shiftDate(weekKey, -6);
  const baselineStart = shiftDate(weekStart, -28);
  const baselineEnd = shiftDate(weekStart, -1);

  const [thisWeekRows, baselineRows, goals, allRecurring] = await Promise.all([
    db
      .select({
        category: sql<string>`COALESCE(${transactions.primaryCategory}, 'UNCATEGORIZED')`,
        total: sql<string>`COALESCE(SUM(${transactions.amount}::numeric), 0)`,
      })
      .from(transactions)
      .innerJoin(
        financialAccounts,
        eq(financialAccounts.id, transactions.accountId),
      )
      .innerJoin(plaidItems, eq(plaidItems.id, financialAccounts.itemId))
      .where(
        and(
          eq(plaidItems.userId, userId),
          gte(transactions.date, weekStart),
          lte(transactions.date, weekEnd),
          sql`${transactions.amount}::numeric > 0`,
          sql`${financialAccounts.type} != 'investment'`,
          sql`COALESCE(${transactions.primaryCategory}, '') NOT IN ('TRANSFER_IN', 'TRANSFER_OUT', 'LOAN_PAYMENTS')`,
        ),
      )
      .groupBy(sql`COALESCE(${transactions.primaryCategory}, 'UNCATEGORIZED')`),

    db
      .select({
        date: transactions.date,
        category: sql<string>`COALESCE(${transactions.primaryCategory}, 'UNCATEGORIZED')`,
        amount: transactions.amount,
      })
      .from(transactions)
      .innerJoin(
        financialAccounts,
        eq(financialAccounts.id, transactions.accountId),
      )
      .innerJoin(plaidItems, eq(plaidItems.id, financialAccounts.itemId))
      .where(
        and(
          eq(plaidItems.userId, userId),
          gte(transactions.date, baselineStart),
          lte(transactions.date, baselineEnd),
          sql`${transactions.amount}::numeric > 0`,
          sql`${financialAccounts.type} != 'investment'`,
          sql`COALESCE(${transactions.primaryCategory}, '') NOT IN ('TRANSFER_IN', 'TRANSFER_OUT', 'LOAN_PAYMENTS')`,
        ),
      ),

    getGoalsWithProgress(userId),
    getRecurringStreams(userId),
  ]);
  // NON_SPEND_CATEGORIES referenced for documentation; the literals are
  // inlined in the SQL above to keep parameter binding simple.
  void NON_SPEND_CATEGORIES;

  const byCategoryThisWeek: CategorySpend[] = thisWeekRows
    .map((r) => ({ category: r.category, total: Number(r.total) }))
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total);

  const totalThisWeek = byCategoryThisWeek.reduce((s, r) => s + r.total, 0);

  // Bucket prior-4-week rows into [w0..w3] per category, where w0 is the
  // week immediately before this one. Missing weeks remain 0 — a category
  // that spiked once in week 2 will have median 0 and get suppressed by
  // the drift rules in the prompt.
  const weekStartMs = new Date(`${weekStart}T00:00:00Z`).getTime();
  const weekly = new Map<string, [number, number, number, number]>();
  for (const row of baselineRows) {
    const dt = new Date(`${row.date}T00:00:00Z`).getTime();
    const daysBefore = Math.floor((weekStartMs - dt) / DAY_MS);
    if (daysBefore < 1 || daysBefore > 28) continue;
    const idx = Math.floor((daysBefore - 1) / 7);
    if (idx < 0 || idx > 3) continue;
    const arr = weekly.get(row.category) ?? [0, 0, 0, 0];
    arr[idx] += Number(row.amount);
    weekly.set(row.category, arr);
  }

  const baselineByCategory: CategoryBaseline[] = [];
  for (const [category, w] of weekly.entries()) {
    const sorted = [...w].sort((a, b) => a - b);
    const median = (sorted[1] + sorted[2]) / 2;
    if (median > 0) baselineByCategory.push({ category, medianWeekly: median });
  }
  baselineByCategory.sort((a, b) => b.medianWeekly - a.medianWeekly);

  const goalSnapshots: GoalSnapshot[] = goals.map((g) => ({
    name: g.name,
    type: g.type,
    isActive: g.isActive,
    targetDate: g.targetDate,
    progress: g.progress,
  }));

  const recurring: RecurringSnapshot[] = allRecurring
    .filter((r) => r.isActive && r.direction === 'outflow')
    .map((r) => ({
      merchantName: r.merchantName,
      description: r.description,
      averageAmount: r.averageAmount,
      lastAmount: r.lastAmount,
      frequency: r.frequency,
      lastDate: r.lastDate,
      status: r.status,
      primaryCategory: r.primaryCategory,
      monthlyAmount:
        r.averageAmount != null
          ? r.averageAmount * frequencyToMonthlyMultiplier(r.frequency)
          : null,
      hitThisWeek:
        r.lastDate != null &&
        r.lastDate >= weekStart &&
        r.lastDate <= weekEnd,
    }))
    .sort((a, b) => (b.monthlyAmount ?? 0) - (a.monthlyAmount ?? 0));

  // Tightened in W-fix C-02: a user with any active outflow stream or
  // any goal would previously trip isEmpty=false even with zero spending
  // and zero recurring hits this week, so Anthropic got asked to write a
  // weekly recap from an empty input set. The narrowest contract is:
  // empty if there's no real this-week activity (no transactions, no
  // recurring stream that hit). Goals on their own aren't summarizable.
  const isEmpty =
    byCategoryThisWeek.length === 0 &&
    !recurring.some((r) => r.hitThisWeek);

  return {
    weekStart,
    weekEnd,
    isEmpty,
    spending: {
      totalThisWeek,
      byCategoryThisWeek,
      baselineByCategory,
    },
    goals: goalSnapshots,
    recurring,
  };
}
