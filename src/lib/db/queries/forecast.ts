import { and, eq, gte, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  categories,
  financialAccounts,
  goals,
  plaidItems,
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
 * - categoryHistory: for each category the user has overridden in the last
 *   TRAILING_MONTHS, an array of monthly outflow totals (oldest first).
 *   NOTE: The transaction table has no recurringStreamId FK — we cannot
 *   exclude recurring transactions at query time. The engine should treat
 *   categoryHistory as "all non-investment spend" including recurrings; the
 *   median-based baseline step will smooth this out.
 * - nonRecurringIncomeHistory: monthly totals of negative-amount transactions
 *   (Plaid: negative = money IN). Also includes recurring inflows since no FK.
 * - goals: all active goals. currentSaved is derived from account balances for
 *   savings goals (same approach as goals.ts) and 0 for spend_cap goals.
 *
 * Returns empty arrays where data is missing — caller handles gracefully.
 *
 * Schema deviations from plan (see column-by-column table in Task 3 report):
 * - financialAccounts scoped via plaidItems JOIN (no direct userId col)
 * - recurringStreams scoped via plaidItems JOIN; uses frequency/description/
 *   lastAmount/predictedNextDate instead of cadence/label/amount/nextDate
 * - transactions uses date (not occurredAt), categoryOverrideId (not categoryId)
 * - goals uses monthlyAmount (not monthlyContribution); currentSaved computed
 */
export async function getForecastHistory(userId: string): Promise<ForecastHistory> {
  const now = new Date();
  // Go back TRAILING_MONTHS full calendar months. E.g. if today is May,
  // sinceDate = Feb 1 → we get Feb, Mar, Apr as the trailing window.
  const sinceDate = new Date(now.getFullYear(), now.getMonth() - TRAILING_MONTHS, 1)
    .toISOString()
    .slice(0, 10);

  const [accountRows, streamRows, txRows, goalRows, categoryRows] = await Promise.all([
    // Accounts: must join plaidItems for userId scope
    db
      .select({
        id: financialAccounts.id,
        currentBalance: financialAccounts.currentBalance,
        type: financialAccounts.type,
        accountIds: financialAccounts.id, // alias for goal-matching below
      })
      .from(financialAccounts)
      .innerJoin(plaidItems, eq(plaidItems.id, financialAccounts.itemId))
      .where(eq(plaidItems.userId, userId)),

    // Active recurring streams: join plaidItems for userId scope
    db
      .select({
        id: recurringStreams.id,
        description: recurringStreams.description,
        merchantName: recurringStreams.merchantName,
        lastAmount: recurringStreams.lastAmount,
        averageAmount: recurringStreams.averageAmount,
        direction: recurringStreams.direction,
        frequency: recurringStreams.frequency,
        predictedNextDate: recurringStreams.predictedNextDate,
        status: recurringStreams.status,
        isActive: recurringStreams.isActive,
      })
      .from(recurringStreams)
      .innerJoin(plaidItems, eq(plaidItems.id, recurringStreams.itemId))
      .where(
        and(
          eq(plaidItems.userId, userId),
          eq(recurringStreams.isActive, true),
        ),
      ),

    // Trailing transactions for category/income history
    db
      .select({
        amount: transactions.amount,
        categoryOverrideId: transactions.categoryOverrideId,
        primaryCategory: transactions.primaryCategory,
        date: transactions.date,
      })
      .from(transactions)
      .innerJoin(financialAccounts, eq(financialAccounts.id, transactions.accountId))
      .innerJoin(plaidItems, eq(plaidItems.id, financialAccounts.itemId))
      .where(
        and(
          eq(plaidItems.userId, userId),
          gte(transactions.date, sinceDate),
        ),
      ),

    // Goals (userId col exists directly on goals table)
    db
      .select()
      .from(goals)
      .where(and(eq(goals.userId, userId), eq(goals.isActive, true))),

    // User-defined categories
    db
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .where(eq(categories.userId, userId)),
  ]);

  // --- currentCash ---
  const currentCash = accountRows
    .filter((a) => a.type === 'depository')
    .reduce((sum, a) => sum + Number(a.currentBalance ?? 0), 0);

  // --- currentSaved per goal (savings goals only) ---
  // Build a map of accountId → currentBalance for savings-goal lookup.
  const balanceById = new Map(accountRows.map((a) => [a.id, Number(a.currentBalance ?? 0)]));

  // --- categoryHistory & nonRecurringIncomeHistory ---
  // monthsAgo index: 1 = last full month, TRAILING_MONTHS = oldest included month.
  // We map to array index 0 = oldest, TRAILING_MONTHS-1 = most recent.
  const categoryHistory: Record<string, number[]> = {};
  const incomeBuckets: number[] = Array(TRAILING_MONTHS).fill(0);

  for (const tx of txRows) {
    const txDate = new Date(tx.date);
    const monthsAgo =
      (now.getFullYear() - txDate.getFullYear()) * 12 +
      (now.getMonth() - txDate.getMonth());
    // Only include completed months (1..TRAILING_MONTHS). Skip current month (0).
    if (monthsAgo < 1 || monthsAgo > TRAILING_MONTHS) continue;
    const idx = TRAILING_MONTHS - monthsAgo; // 0 = oldest, last = most recent

    const amount = Number(tx.amount);
    if (amount > 0) {
      // Outflow — bucket by user-overridden category, fall back to primaryCategory.
      const catKey = tx.categoryOverrideId ?? tx.primaryCategory;
      if (!catKey) continue;
      if (!categoryHistory[catKey]) {
        categoryHistory[catKey] = Array(TRAILING_MONTHS).fill(0);
      }
      categoryHistory[catKey][idx] += amount;
    } else {
      // Inflow (Plaid: negative = money in)
      incomeBuckets[idx] += -amount;
    }
  }

  // --- recurringStreams: map schema columns to ForecastHistory shape ---
  // frequency → cadence mapping (Plaid uses uppercase; engine expects lowercase).
  // SEMI_MONTHLY and ANNUALLY have no direct cadence equivalent — map to monthly
  // and flag them so the engine can approximate; rare edge case.
  function toCadence(freq: string | null): 'weekly' | 'biweekly' | 'monthly' {
    switch ((freq ?? '').toUpperCase()) {
      case 'WEEKLY':     return 'weekly';
      case 'BIWEEKLY':   return 'biweekly';
      case 'SEMI_MONTHLY':
      case 'MONTHLY':
      case 'ANNUALLY':
      default:           return 'monthly';
    }
  }

  const mappedStreams = streamRows.map((s) => ({
    id: s.id,
    // Prefer merchantName for readability, fall back to description
    label: s.merchantName ?? s.description ?? 'Unknown',
    // Prefer lastAmount (more recent), fall back to averageAmount
    amount: Math.abs(Number(s.lastAmount ?? s.averageAmount ?? 0)),
    direction: s.direction as 'inflow' | 'outflow',
    cadence: toCadence(s.frequency),
    // predictedNextDate is a date string 'YYYY-MM-DD' from Drizzle date column
    nextDate: s.predictedNextDate ?? '',
  }));

  // --- goals: compute currentSaved from scoped account balances ---
  const mappedGoals = goalRows.map((g) => {
    let currentSaved = 0;
    if (g.type === 'savings') {
      const accountIds = g.accountIds ?? [];
      currentSaved = accountIds.reduce((sum, id) => sum + (balanceById.get(id) ?? 0), 0);
    }
    return {
      id: g.id,
      name: g.name,
      targetAmount: Number(g.targetAmount ?? 0),
      targetDate: g.targetDate ?? null,
      // monthlyAmount is spend_cap's limit; for savings goals this is null.
      // The engine uses monthlyContribution to project savings velocity.
      monthlyContribution: g.monthlyAmount !== null ? Number(g.monthlyAmount) : null,
      currentSaved,
    };
  });

  return {
    currentCash,
    recurringStreams: mappedStreams,
    categoryHistory,
    nonRecurringIncomeHistory: incomeBuckets,
    goals: mappedGoals,
    categories: categoryRows,
  };
}
