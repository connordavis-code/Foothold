'use server';

import { and, desc, eq, ilike, inArray, or } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import {
  filterOwnedTransactions,
  findOrCreateCategoryByName,
} from '@/lib/db/queries/categories';
import {
  type TransactionFilters,
  type TransactionListRow,
  getTransactions,
} from '@/lib/db/queries/transactions';
import {
  financialAccounts,
  externalItems,
  transactions,
} from '@/lib/db/schema';
import { escapeIlike } from '@/lib/utils/ilike-escape';

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

  // escapeIlike: a literal `%` or `_` in user input would otherwise act
  // as a SQL wildcard, so typing `%` matched every row.
  const pat = `%${escapeIlike(trimmed)}%`;
  const search = or(
    ilike(transactions.name, pat),
    ilike(transactions.merchantName, pat),
  );
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
    .innerJoin(externalItems, eq(externalItems.id, financialAccounts.itemId))
    .where(
      and(
        eq(externalItems.userId, session.user.id),
        ...(search ? [search] : []),
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

export type LoadMoreResult = {
  rows: TransactionListRow[];
  hasMore: boolean;
};

/**
 * Mobile infinite-scroll loader. Returns the next page of transaction
 * rows under the same filter contract the page renders with — the
 * sentinel observer in <MobileTransactionsShell> calls this when it
 * scrolls into view.
 *
 * Filter shape mirrors TransactionFilters minus userId (auth handles
 * scoping). `hasMore` is computed against the full count so the
 * client can stop observing once the tail is reached.
 */
export async function loadMoreTransactionsAction(
  filters: Omit<TransactionFilters, 'page'>,
  page: number,
): Promise<LoadMoreResult> {
  const session = await auth();
  if (!session?.user) throw new Error('Unauthorized');

  const result = await getTransactions(session.user.id, {
    ...filters,
    page,
  });
  return {
    rows: result.rows,
    hasMore: result.page < result.totalPages,
  };
}

export type TransferOverrideResult = {
  updated: number;
};

/**
 * Override the transfer classification of a single transaction. Tri-state:
 *   value = true  → force-treat as transfer (excluded from cash forecast)
 *   value = false → force-treat as NOT a transfer (re-included even if PFC is TRANSFER_*)
 *   value = null  → clear override, fall back to Plaid's PFC
 *
 * Defense-in-depth: filterOwnedTransactions whitelists the id before
 * writing, so a forged id from the client can't reach into someone else's
 * data. Revalidates every surface that consumes the forecast — the
 * dashboard hero (EOM projected) and the simulator both compute via the
 * same getForecastHistory path, and /goals' spend-cap-feed shares the
 * detail sheet that drives this action.
 */
export async function setTransactionTransferOverrideAction(
  txId: string,
  value: boolean | null,
): Promise<TransferOverrideResult> {
  const session = await auth();
  if (!session?.user) throw new Error('Unauthorized');

  // Normalize: anything but a real boolean or null becomes null (clear).
  // Defends against stale clients sending undefined or a stringified value.
  const normalized: boolean | null =
    value === true || value === false ? value : null;

  const owned = await filterOwnedTransactions(session.user.id, [txId]);
  if (owned.length === 0) return { updated: 0 };

  await db
    .update(transactions)
    .set({ isTransferOverride: normalized, updatedAt: new Date() })
    .where(inArray(transactions.id, owned));

  revalidatePath('/transactions');
  revalidatePath('/dashboard');
  revalidatePath('/simulator');
  revalidatePath('/goals');
  return { updated: owned.length };
}
