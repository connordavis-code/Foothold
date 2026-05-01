import { and, desc, eq, gte, lt, notInArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  financialAccounts,
  plaidItems,
  transactions,
} from '@/lib/db/schema';

/**
 * Account-type buckets. depository + investment count as assets in net
 * worth; credit + loan count as liabilities (their `current_balance`
 * represents the amount owed). `other` is rare and excluded from totals.
 */
export const ASSET_TYPES = ['depository', 'investment'] as const;
export const LIABILITY_TYPES = ['credit', 'loan'] as const;

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

export type DashboardSummary = {
  assets: number;
  liabilities: number;
  netWorth: number;
  investments: number;
  monthSpend: number;
  hasAnyItem: boolean;
};

/**
 * One round-trip-ish summary for the dashboard cards. All sums are scoped
 * to the user's plaid_items via JOIN — never trust client-side filtering.
 */
export async function getDashboardSummary(
  userId: string,
): Promise<DashboardSummary> {
  // Sum of current_balance grouped by type bucket, scoped to the user.
  const balancesByType = await db
    .select({
      type: financialAccounts.type,
      total: sql<string>`COALESCE(SUM(${financialAccounts.currentBalance}::numeric), 0)`,
    })
    .from(financialAccounts)
    .innerJoin(plaidItems, eq(plaidItems.id, financialAccounts.itemId))
    .where(eq(plaidItems.userId, userId))
    .groupBy(financialAccounts.type);

  let assets = 0;
  let liabilities = 0;
  let investments = 0;
  for (const row of balancesByType) {
    const n = Number(row.total);
    if ((ASSET_TYPES as readonly string[]).includes(row.type)) assets += n;
    if ((LIABILITY_TYPES as readonly string[]).includes(row.type))
      liabilities += n;
    if (row.type === 'investment') investments += n;
  }

  const { start, end } = currentMonthRange();
  const [spendRow] = await db
    .select({
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
        gte(transactions.date, start),
        lt(transactions.date, end),
        sql`${transactions.amount}::numeric > 0`,
        notInArray(financialAccounts.type, ['investment']),
        // primary_category may be null for old/unenriched txns; coalesce
        // so the NOT IN doesn't filter NULL rows (NULL NOT IN (...) → NULL → falsy).
        sql`COALESCE(${transactions.primaryCategory}, '') NOT IN ('TRANSFER_IN', 'TRANSFER_OUT', 'LOAN_PAYMENTS')`,
      ),
    );

  const [itemCheck] = await db
    .select({ id: plaidItems.id })
    .from(plaidItems)
    .where(eq(plaidItems.userId, userId))
    .limit(1);

  return {
    assets,
    liabilities,
    netWorth: assets - liabilities,
    investments,
    monthSpend: Number(spendRow?.total ?? 0),
    hasAnyItem: !!itemCheck,
  };
}

export type RecentTransaction = {
  id: string;
  name: string;
  merchantName: string | null;
  date: string;
  amount: number;
  primaryCategory: string | null;
  accountName: string;
  accountMask: string | null;
  pending: boolean;
};

/**
 * Most recent N transactions across all the user's accounts. Includes the
 * account name + mask so the row UI can show "Plaid Checking ····0000".
 */
export async function getRecentTransactions(
  userId: string,
  limit = 10,
): Promise<RecentTransaction[]> {
  const rows = await db
    .select({
      id: transactions.id,
      name: transactions.name,
      merchantName: transactions.merchantName,
      date: transactions.date,
      amount: transactions.amount,
      primaryCategory: transactions.primaryCategory,
      accountName: financialAccounts.name,
      accountMask: financialAccounts.mask,
      pending: transactions.pending,
    })
    .from(transactions)
    .innerJoin(
      financialAccounts,
      eq(financialAccounts.id, transactions.accountId),
    )
    .innerJoin(plaidItems, eq(plaidItems.id, financialAccounts.itemId))
    .where(eq(plaidItems.userId, userId))
    .orderBy(desc(transactions.date), desc(transactions.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    ...r,
    amount: Number(r.amount),
  }));
}
