'use server';

import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import {
  financialAccounts,
  plaidItems,
  transactions,
} from '@/lib/db/schema';

export type TransactionSearchHit = {
  id: string;
  name: string;
  merchantName: string | null;
  date: string;
  amount: number;
  accountName: string;
  accountMask: string | null;
};

const MAX_HITS = 10;
const MIN_QUERY = 2;

/**
 * Lightweight transaction search for the ⌘K palette. Matches against
 * name + merchant via ilike, returns the most-recent N hits. Fast on
 * the indexed `transaction_date_idx` because the scan is bounded by
 * pagination, not full-table.
 *
 * Returns [] for queries shorter than MIN_QUERY chars to avoid
 * round-tripping every keystroke and to prevent "a%" / "of%" patterns
 * that match almost everything.
 */
export async function searchTransactionsAction(
  query: string,
): Promise<TransactionSearchHit[]> {
  const session = await auth();
  if (!session?.user) throw new Error('Unauthorized');

  const trimmed = query.trim();
  if (trimmed.length < MIN_QUERY) return [];

  const pat = `%${trimmed}%`;
  const rows = await db
    .select({
      id: transactions.id,
      name: transactions.name,
      merchantName: transactions.merchantName,
      date: transactions.date,
      amount: transactions.amount,
      accountName: financialAccounts.name,
      accountMask: financialAccounts.mask,
    })
    .from(transactions)
    .innerJoin(
      financialAccounts,
      eq(financialAccounts.id, transactions.accountId),
    )
    .innerJoin(plaidItems, eq(plaidItems.id, financialAccounts.itemId))
    .where(
      and(
        eq(plaidItems.userId, session.user.id),
        or(
          ilike(transactions.name, pat),
          ilike(transactions.merchantName, pat),
        ) ?? sql`true`,
      ),
    )
    .orderBy(desc(transactions.date), desc(transactions.createdAt))
    .limit(MAX_HITS);

  return rows.map((r) => ({ ...r, amount: Number(r.amount) }));
}
