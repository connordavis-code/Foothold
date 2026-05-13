import { and, eq, gte, isNull, notInArray, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  financialAccounts,
  goals,
  externalItems,
  recurringStreams,
  transactions,
} from '@/lib/db/schema';
import { INTERNAL_TRANSFER_CATEGORIES } from '@/lib/forecast/exclusions';
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
 * Map a Plaid frequency + per-occurrence amount to the engine's
 * ForecastHistory shape. The engine cadence enum has no SEMI_MONTHLY or
 * ANNUALLY slot — those collapse to 'monthly' AND the amount is rescaled
 * to the true monthly equivalent so downstream baseline math is correct.
 *
 * Without rescaling, a $1500 SEMI_MONTHLY paycheck gets projected as
 * $1500/mo (off by 50%) and a $1200 ANNUALLY domain renewal gets
 * projected as $1200/mo (off by 12x).
 */
export function mapStreamCadenceAndAmount(
  rawAmount: number,
  freq: string | null,
): { amount: number; cadence: 'weekly' | 'biweekly' | 'monthly' } {
  switch ((freq ?? '').toUpperCase()) {
    case 'WEEKLY':       return { amount: rawAmount, cadence: 'weekly' };
    case 'BIWEEKLY':     return { amount: rawAmount, cadence: 'biweekly' };
    case 'SEMI_MONTHLY': return { amount: rawAmount * 2, cadence: 'monthly' };
    case 'ANNUALLY':     return { amount: rawAmount / 12, cadence: 'monthly' };
    case 'MONTHLY':
    case 'UNKNOWN':
    default:             return { amount: rawAmount, cadence: 'monthly' };
  }
}

/**
 * Build a snapshot of the user's current state for the forecast engine.
 *
 * - currentCash: sum of current balances on liquid accounts (checking + savings).
 *   Investment accounts excluded — Phase 4-pt2 territory.
 * - categoryHistory: keys are Plaid Personal Finance Category strings (e.g.
 *   `FOOD_AND_DRINK`). Each value is an array of monthly outflow totals (oldest
 *   first, length = TRAILING_MONTHS). RAW totals — recurring transactions ARE
 *   included in their PFC bucket. The engine sums PFC categories as the full
 *   monthly outflow; recurring streams flow through `recurringStreams` for
 *   override appliers (pause/edit/skip) but are NOT separately added to baseline
 *   outflows. Closes review finding C-01: prior code subtracted recurring per
 *   PFC then re-added at the engine, but the per-month subtraction had a
 *   lifecycle off-by-one and a floor-at-0 information loss. User category
 *   overrides (transactions.categoryOverrideId) are still ignored here — can
 *   be incorporated in a future pass.
 * - incomeHistory: monthly totals of negative-amount transactions (Plaid:
 *   negative = money IN). RAW — recurring inflows are NOT subtracted. Same
 *   architectural posture as categoryHistory.
 * - goals: all active goals. currentSaved is derived from account balances for
 *   savings goals (same approach as goals.ts) and 0 for spend_cap goals.
 * - categories: metadata derived from observed PFC strings (in categoryHistory
 *   or active outflow streams), NOT the Foothold `categories` table. Each entry
 *   has `id` = PFC string and `name` = human-readable label.
 *
 * Returns empty arrays where data is missing — caller handles gracefully.
 *
 * Schema deviations from plan (see column-by-column table in Task 3 report):
 * - financialAccounts scoped via externalItems JOIN (no direct userId col)
 * - recurringStreams scoped via externalItems JOIN; uses frequency/description/
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
    // Accounts: must join externalItems for userId scope
    db
      .select({
        id: financialAccounts.id,
        currentBalance: financialAccounts.currentBalance,
        type: financialAccounts.type,
      })
      .from(financialAccounts)
      .innerJoin(externalItems, eq(externalItems.id, financialAccounts.itemId))
      .where(eq(externalItems.userId, userId)),

    // Active recurring streams: join externalItems for userId scope
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
      .innerJoin(externalItems, eq(externalItems.id, recurringStreams.itemId))
      .where(
        and(
          eq(externalItems.userId, userId),
          eq(recurringStreams.isActive, true),
        ),
      ),

    // Trailing transactions for category/income history.
    // Internal transfers (TRANSFER_IN/OUT) are excluded — they're asset
    // reallocations, not real cash outflows or inflows. Null-PFC rows
    // are preserved (they bucket as UNCATEGORIZED downstream).
    db
      .select({
        amount: transactions.amount,
        primaryCategory: transactions.primaryCategory,
        date: transactions.date,
      })
      .from(transactions)
      .innerJoin(financialAccounts, eq(financialAccounts.id, transactions.accountId))
      .innerJoin(externalItems, eq(externalItems.id, financialAccounts.itemId))
      .where(
        and(
          eq(externalItems.userId, userId),
          gte(transactions.date, sinceDate),
          or(
            isNull(transactions.primaryCategory),
            notInArray(transactions.primaryCategory, [...INTERNAL_TRANSFER_CATEGORIES]),
          ),
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

  // --- categoryHistory & incomeHistory (raw PFC totals) ---
  // monthsAgo index: 1 = last full month, TRAILING_MONTHS = oldest included month.
  // We map to array index 0 = oldest, TRAILING_MONTHS-1 = most recent.
  // No recurring subtraction — Architecture B per docs/superpowers/specs/
  // 2026-05-05-c01-forecast-recurring-subtraction-design.md.
  const categoryHistory: Record<string, number[]> = {};
  const incomeHistory: number[] = Array(TRAILING_MONTHS).fill(0);

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
      incomeHistory[idx] += -amount;
    }
  }

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
  const mappedStreams = streamRows.map((s) => {
    // Prefer lastAmount (more recent), fall back to averageAmount
    const rawAmount = Math.abs(Number(s.lastAmount ?? s.averageAmount ?? 0));
    const { amount, cadence } = mapStreamCadenceAndAmount(rawAmount, s.frequency);
    return {
      id: s.id,
      // Prefer merchantName for readability, fall back to description
      label: s.merchantName ?? s.description ?? 'Unknown',
      amount,
      direction: s.direction as 'inflow' | 'outflow',
      cadence,
      // predictedNextDate is a date string 'YYYY-MM-DD' from Drizzle date column
      nextDate: s.predictedNextDate ?? '',
    };
  });

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
    incomeHistory,
    goals: mappedGoals,
    categories: categoriesMetadata,
  };
}
