'use server';

import { and, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import {
  filterOwnedTransactions,
  findOrCreateCategoryByName,
} from '@/lib/db/queries/categories';
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

export type BulkRecategorizeResult = {
  updated: number;
};

/**
 * Bulk re-categorize the user's selected transactions. The category
 * is identified by name — find-or-create on the categories table for
 * this user. Pass `null` to clear an override (the row reverts to its
 * raw Plaid PFC for display).
 *
 * Defense-in-depth: we filter the supplied id list down to ones the
 * user actually owns before writing, so a forged id list from the
 * client can't reach into someone else's data.
 */
export async function updateTransactionCategoriesAction(
  txIds: string[],
  categoryName: string | null,
): Promise<BulkRecategorizeResult> {
  const session = await auth();
  if (!session?.user) throw new Error('Unauthorized');

  if (txIds.length === 0) return { updated: 0 };

  const owned = await filterOwnedTransactions(session.user.id, txIds);
  if (owned.length === 0) return { updated: 0 };

  const newCategoryId = categoryName
    ? await findOrCreateCategoryByName(session.user.id, categoryName)
    : null;

  await db
    .update(transactions)
    .set({ categoryOverrideId: newCategoryId, updatedAt: new Date() })
    .where(inArray(transactions.id, owned));

  revalidatePath('/transactions');
  return { updated: owned.length };
}
