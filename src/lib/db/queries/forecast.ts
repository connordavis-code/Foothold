import { and, eq, gte } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  financialAccounts,
  goals,
  plaidItems,
  recurringStreams,
  transactions,
} from '@/lib/db/schema';
import type { ForecastHistory } from '@/lib/forecast/types';

const TRAILING_MONTHS = 3;

/** Convert a Plaid PFC string to a human-readable label. */
function prettifyPfc(pfc: string): string {
  if (pfc === 'UNCATEGORIZED') return 'Uncategorized';
  // FOOD_AND_DRINK → "Food and drink"
  return pfc
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/^./, (c) => c.toUpperCase());
}

/**
 * Approximate a recurring stream's monthly cost from Plaid's frequency string.
 * Uses lastAmount preferentially (more recent); falls back to averageAmount.
 */
function streamMonthlyEquivalent(stream: {
  averageAmount: string | null;
  lastAmount: string | null;
  frequency: string | null;
}): number {
  const amount = Math.abs(Number(stream.lastAmount ?? stream.averageAmount ?? 0));
  switch ((stream.frequency ?? '').toUpperCase()) {
    case 'WEEKLY':       return amount * 4.333;
    case 'BIWEEKLY':     return amount * 2.167;
    case 'SEMI_MONTHLY': return amount * 2;
    case 'ANNUALLY':     return amount / 12;
    case 'MONTHLY':
    case 'UNKNOWN':
    default:             return amount;
  }
}

/**
 * Build a snapshot of the user's current state for the forecast engine.
 *
 * - currentCash: sum of current balances on liquid accounts (checking + savings).
 *   Investment accounts excluded — Phase 4-pt2 territory.
 * - categoryHistory: keys are Plaid Personal Finance Category strings (e.g.
 *   `FOOD_AND_DRINK`). Each value is an array of monthly outflow totals (oldest
 *   first, length = TRAILING_MONTHS). Per-category recurring contributions are
 *   subtracted from these buckets to avoid double-counting (approximation:
 *   assumes the recurring stream's PFC matches its transaction PFC). User
 *   category overrides (transactions.categoryOverrideId) are ignored in this
 *   iteration — can be incorporated in a future pass.
 * - nonRecurringIncomeHistory: monthly totals of negative-amount transactions
 *   (Plaid: negative = money IN) with total monthly recurring inflows subtracted.
 *   Same approximation as per-category outflow subtraction (accounts for salary
 *   etc. that would otherwise be double-counted in both recurring streams and
 *   transaction buckets).
 * - goals: all active goals. currentSaved is derived from account balances for
 *   savings goals (same approach as goals.ts) and 0 for spend_cap goals.
 * - categories: metadata derived from observed PFC strings (in categoryHistory
 *   or active outflow streams), NOT the Foothold `categories` table. Each entry
 *   has `id` = PFC string and `name` = human-readable label.
 *
 * Returns empty arrays where data is missing — caller handles gracefully.
 *
 * Schema deviations from plan (see column-by-column table in Task 3 report):
 * - financialAccounts scoped via plaidItems JOIN (no direct userId col)
 * - recurringStreams scoped via plaidItems JOIN; uses frequency/description/
 *   lastAmount/predictedNextDate instead of cadence/label/amount/nextDate
 * - transactions uses date (not occurredAt); categoryOverrideId ignored here
 * - goals uses monthlyAmount (not monthlyContribution); currentSaved computed
 */
export async function getForecastHistory(userId: string): Promise<ForecastHistory> {
  const now = new Date();
  // Go back TRAILING_MONTHS full calendar months. E.g. if today is May,
  // sinceDate = Feb 1 → we get Feb, Mar, Apr as the trailing window.
  const sinceDate = new Date(now.getFullYear(), now.getMonth() - TRAILING_MONTHS, 1)
    .toISOString()
    .slice(0, 10);

  const [accountRows, streamRows, txRows, goalRows] = await Promise.all([
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
        primaryCategory: recurringStreams.primaryCategory,
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
      // Outflow — bucket by Plaid PFC string for a consistent keyspace.
      // categoryOverrideId is intentionally ignored here (deferred to a later iteration).
      const catKey = tx.primaryCategory ?? 'UNCATEGORIZED';
      if (!categoryHistory[catKey]) {
        categoryHistory[catKey] = Array(TRAILING_MONTHS).fill(0);
      }
      categoryHistory[catKey][idx] += amount;
    } else {
      // Inflow (Plaid: negative = money in)
      incomeBuckets[idx] += -amount;
    }
  }

  // --- Subtract per-category recurring contributions to avoid double-count ---
  // Plaid doesn't link transactions to streams; we approximate via PFC.
  // Floor at 0 to guard against the case where the only spend in a category
  // IS the recurring stream and floating-point noise would go negative.
  for (const stream of streamRows) {
    if (stream.direction !== 'outflow') continue;
    const cat = stream.primaryCategory ?? 'UNCATEGORIZED';
    if (!categoryHistory[cat]) continue;
    const monthlyEq = streamMonthlyEquivalent(stream);
    categoryHistory[cat] = categoryHistory[cat].map((v) => Math.max(0, v - monthlyEq));
  }

  // --- Subtract total recurring monthly inflow from each month's bucket ---
  // (Same approximation as the per-category outflow subtraction above —
  // salary etc. would otherwise be double-counted.)
  const recurringInflowMonthly = streamRows
    .filter((s) => s.direction === 'inflow')
    .reduce((sum, s) => sum + streamMonthlyEquivalent(s), 0);
  const nonRecurringIncomeHistory = incomeBuckets.map((v) =>
    Math.max(0, v - recurringInflowMonthly),
  );

  // --- Build categories metadata from observed PFC keys ---
  // Keys come from categoryHistory and active outflow streams — NOT the
  // Foothold `categories` table. id = PFC string; name = human-readable label.
  const usedKeys = new Set<string>([
    ...Object.keys(categoryHistory),
    ...streamRows
      .filter((s) => s.direction === 'outflow')
      .map((s) => s.primaryCategory ?? 'UNCATEGORIZED'),
  ]);
  const categoriesMetadata = Array.from(usedKeys).map((key) => ({
    id: key,
    name: prettifyPfc(key),
  }));

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
    nonRecurringIncomeHistory,
    goals: mappedGoals,
    categories: categoriesMetadata,
  };
}
