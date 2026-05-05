import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  financialAccounts,
  plaidItems,
  transactions,
} from '@/lib/db/schema';
import type { InsightSupplements } from '@/lib/insights/types';
import { paceForGoal } from '@/lib/insights/pace';
import { getDriftAnalysis } from './drift';
import { getGoalsWithProgress } from './goals';
import {
  frequencyToMonthlyMultiplier,
  getRecurringStreams,
} from './recurring';

const DAY_MS = 24 * 60 * 60 * 1000;

function shiftDate(yyyymmdd: string, deltaDays: number): string {
  const d = new Date(`${yyyymmdd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

/**
 * Build the receipts payload that backs /insights's "What Claude saw"
 * section for a single week.
 *
 * Spending: same SQL idiom as collectSnapshot. We compute median
 * weekly per category across the prior 4 weeks for the deltaVsBaseline
 * line.
 *
 * Drift: delegated to getDriftAnalysis with endAnchor=weekEnd.
 *
 * Goals: getGoalsWithProgress + a pace-percent derivation per goal.
 *
 * Recurring: getRecurringStreams; monthlyTotal sums normalized
 * frequency multipliers, hitThisWeek* counts streams whose lastDate
 * falls inside [weekStart, weekEnd].
 */
export async function getInsightSupplements(
  userId: string,
  weekStart: string,
  weekEnd: string,
): Promise<InsightSupplements> {
  const baselineStart = shiftDate(weekStart, -28);
  const baselineEnd = shiftDate(weekStart, -1);

  const [thisWeekRows, baselineRows, drift, goals, recurring] = await Promise.all([
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

    getDriftAnalysis(userId, 8, weekEnd),
    getGoalsWithProgress(userId),
    getRecurringStreams(userId),
  ]);

  // ─── Spending ─────────────────────────────────────────────────────
  const totalThisWeek = thisWeekRows.reduce(
    (acc, r) => acc + Number(r.total),
    0,
  );
  const topCategories = thisWeekRows
    .map((r) => ({ category: r.category, total: Number(r.total) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 3);

  const baselineTotalsByWeek = new Map<number, number>();
  for (const r of baselineRows) {
    const weekIdx = Math.floor(
      (Date.parse(`${r.date}T00:00:00Z`) - Date.parse(`${baselineStart}T00:00:00Z`)) /
        (7 * DAY_MS),
    );
    baselineTotalsByWeek.set(
      weekIdx,
      (baselineTotalsByWeek.get(weekIdx) ?? 0) + Number(r.amount),
    );
  }
  const weeklyTotals = [0, 1, 2, 3].map((i) => baselineTotalsByWeek.get(i) ?? 0);
  const sortedTotals = [...weeklyTotals].sort((a, b) => a - b);
  // Median of 4 weeks = avg of the 2nd and 3rd values (sorted).
  const medianBaseline = (sortedTotals[1] + sortedTotals[2]) / 2;
  const deltaVsBaseline =
    baselineRows.length === 0 ? null : totalThisWeek - medianBaseline;

  // ─── Drift ───────────────────────────────────────────────────────
  const elevated = drift.currentlyElevated.map((f) => ({
    category: f.category,
    ratio: f.ratio,
    currentTotal: f.currentTotal,
    baselineWeekly: f.baselineWeekly,
  }));

  // ─── Goals ───────────────────────────────────────────────────────
  const activeGoals = goals.filter((g) => g.isActive);
  const goalNotable = activeGoals
    .map((g) => ({
      name: g.name,
      type: g.type,
      pacePct: paceForGoal(g),
    }))
    .sort((a, b) => a.pacePct - b.pacePct)
    .slice(0, 2);
  const onPaceCount = activeGoals.filter((g) => paceForGoal(g) >= 1).length;

  // ─── Recurring ───────────────────────────────────────────────────
  // RecurringStreamRow exposes `direction: 'inflow' | 'outflow'` and
  // `isActive: boolean`. Mirror getMonthlyRecurringOutflow's filter: only
  // active outflows count toward monthlyTotal. averageAmount is already
  // normalized to number | null in getRecurringStreams's mapping.
  const outflows = recurring.filter(
    (s) => s.direction === 'outflow' && s.isActive,
  );
  const monthlyTotal = outflows.reduce((acc, s) => {
    const avg = s.averageAmount ?? 0;
    return acc + avg * frequencyToMonthlyMultiplier(s.frequency);
  }, 0);
  const hitThisWeekStreams = outflows.filter(
    (s) => s.lastDate != null && s.lastDate >= weekStart && s.lastDate <= weekEnd,
  );
  const hitThisWeekTotal = hitThisWeekStreams.reduce(
    (acc, s) => acc + (s.lastAmount ?? 0),
    0,
  );

  return {
    spending: { totalThisWeek, deltaVsBaseline, topCategories },
    drift: { elevated, hasBaseline: !drift.baselineSparse },
    goals: {
      activeCount: activeGoals.length,
      onPaceCount,
      notable: goalNotable,
    },
    recurring: {
      hitThisWeekCount: hitThisWeekStreams.length,
      hitThisWeekTotal,
      monthlyTotal,
    },
  };
}

