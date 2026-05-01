import { and, asc, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  financialAccounts,
  plaidItems,
  recurringStreams,
} from '@/lib/db/schema';

export type RecurringStreamRow = {
  id: string;
  plaidStreamId: string;
  direction: 'inflow' | 'outflow';
  description: string | null;
  merchantName: string | null;
  frequency: string;
  averageAmount: number | null;
  lastAmount: number | null;
  firstDate: string | null;
  lastDate: string | null;
  predictedNextDate: string | null;
  isActive: boolean;
  status: string;
  primaryCategory: string | null;
  accountName: string;
  accountMask: string | null;
};

/**
 * All recurring streams for the user, ordered with active outflows first
 * (largest first), then inflows, then inactive/tombstoned at the bottom.
 */
export async function getRecurringStreams(
  userId: string,
): Promise<RecurringStreamRow[]> {
  const rows = await db
    .select({
      id: recurringStreams.id,
      plaidStreamId: recurringStreams.plaidStreamId,
      direction: recurringStreams.direction,
      description: recurringStreams.description,
      merchantName: recurringStreams.merchantName,
      frequency: recurringStreams.frequency,
      averageAmount: recurringStreams.averageAmount,
      lastAmount: recurringStreams.lastAmount,
      firstDate: recurringStreams.firstDate,
      lastDate: recurringStreams.lastDate,
      predictedNextDate: recurringStreams.predictedNextDate,
      isActive: recurringStreams.isActive,
      status: recurringStreams.status,
      primaryCategory: recurringStreams.primaryCategory,
      accountName: financialAccounts.name,
      accountMask: financialAccounts.mask,
    })
    .from(recurringStreams)
    .innerJoin(
      financialAccounts,
      eq(financialAccounts.id, recurringStreams.accountId),
    )
    .innerJoin(plaidItems, eq(plaidItems.id, recurringStreams.itemId))
    .where(eq(plaidItems.userId, userId))
    .orderBy(
      // Active first
      desc(recurringStreams.isActive),
      // Outflows before inflows (subscriptions are the headline use case)
      desc(recurringStreams.direction),
      // Largest amount first
      desc(recurringStreams.averageAmount),
    );

  return rows.map((r) => ({
    ...r,
    direction: r.direction as 'inflow' | 'outflow',
    averageAmount: r.averageAmount != null ? Number(r.averageAmount) : null,
    lastAmount: r.lastAmount != null ? Number(r.lastAmount) : null,
  }));
}

/**
 * Estimated monthly outflow from active recurring subscriptions/bills.
 * Normalizes each frequency to a monthly equivalent.
 */
export async function getMonthlyRecurringOutflow(
  userId: string,
): Promise<number> {
  const rows = await db
    .select({
      frequency: recurringStreams.frequency,
      averageAmount: recurringStreams.averageAmount,
    })
    .from(recurringStreams)
    .innerJoin(plaidItems, eq(plaidItems.id, recurringStreams.itemId))
    .where(
      and(
        eq(plaidItems.userId, userId),
        eq(recurringStreams.direction, 'outflow'),
        eq(recurringStreams.isActive, true),
      ),
    );

  return rows.reduce((sum, r) => {
    if (r.averageAmount == null) return sum;
    const amount = Number(r.averageAmount);
    return sum + amount * frequencyToMonthlyMultiplier(r.frequency);
  }, 0);
}

/** Convert a Plaid frequency to "how many of these per month". */
export function frequencyToMonthlyMultiplier(freq: string): number {
  switch (freq) {
    case 'WEEKLY':
      return 52 / 12;
    case 'BIWEEKLY':
      return 26 / 12;
    case 'SEMI_MONTHLY':
      return 2;
    case 'MONTHLY':
      return 1;
    case 'ANNUALLY':
      return 1 / 12;
    default:
      // UNKNOWN — assume monthly as a reasonable default.
      return 1;
  }
}
