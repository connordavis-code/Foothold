import {
  and,
  desc,
  eq,
  gte,
  ilike,
  lte,
  or,
  type SQL,
  sql,
} from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  categories,
  financialAccounts,
  plaidItems,
  transactions,
} from '@/lib/db/schema';
import { escapeIlike } from '@/lib/utils/ilike-escape';

export type TransactionFilters = {
  accountId?: string;
  category?: string;
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string; // YYYY-MM-DD
  search?: string;
  page?: number;
  pageSize?: number;
};

export type TransactionListRow = {
  id: string;
  name: string;
  merchantName: string | null;
  date: string;
  amount: number;
  primaryCategory: string | null;
  detailedCategory: string | null;
  pending: boolean;
  paymentChannel: string | null;
  accountId: string;
  accountName: string;
  accountMask: string | null;
  accountType: string;
  /** Set when the user has manually re-categorized this row. */
  overrideCategoryId: string | null;
  overrideCategoryName: string | null;
};

export type TransactionListResult = {
  rows: TransactionListRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

/**
 * Build the WHERE conditions shared between the rows query and the count
 * query so they can never get out of sync.
 */
function buildWhere(userId: string, f: TransactionFilters): SQL {
  const conds: SQL[] = [eq(plaidItems.userId, userId)];
  if (f.accountId) conds.push(eq(transactions.accountId, f.accountId));
  if (f.category) conds.push(eq(transactions.primaryCategory, f.category));
  if (f.dateFrom) conds.push(gte(transactions.date, f.dateFrom));
  if (f.dateTo) conds.push(lte(transactions.date, f.dateTo));
  if (f.search) {
    const pat = `%${escapeIlike(f.search)}%`;
    const search = or(
      ilike(transactions.name, pat),
      ilike(transactions.merchantName, pat),
    );
    if (search) conds.push(search);
  }
  return and(...conds)!;
}

/**
 * Paginated, filterable list of the user's transactions. Ordered by
 * date descending (then created_at desc as a stable tiebreaker).
 */
export async function getTransactions(
  userId: string,
  f: TransactionFilters = {},
): Promise<TransactionListResult> {
  const page = Math.max(1, f.page ?? 1);
  const pageSize = Math.max(
    1,
    Math.min(MAX_PAGE_SIZE, f.pageSize ?? DEFAULT_PAGE_SIZE),
  );
  const where = buildWhere(userId, f);

  const [rows, countRows] = await Promise.all([
    db
      .select({
        id: transactions.id,
        name: transactions.name,
        merchantName: transactions.merchantName,
        date: transactions.date,
        amount: transactions.amount,
        primaryCategory: transactions.primaryCategory,
        detailedCategory: transactions.detailedCategory,
        pending: transactions.pending,
        paymentChannel: transactions.paymentChannel,
        accountId: transactions.accountId,
        accountName: financialAccounts.name,
        accountMask: financialAccounts.mask,
        accountType: financialAccounts.type,
        overrideCategoryId: transactions.categoryOverrideId,
        overrideCategoryName: categories.name,
      })
      .from(transactions)
      .innerJoin(
        financialAccounts,
        eq(financialAccounts.id, transactions.accountId),
      )
      .innerJoin(plaidItems, eq(plaidItems.id, financialAccounts.itemId))
      .leftJoin(categories, eq(categories.id, transactions.categoryOverrideId))
      .where(where)
      .orderBy(desc(transactions.date), desc(transactions.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ count: sql<string>`COUNT(*)::text` })
      .from(transactions)
      .innerJoin(
        financialAccounts,
        eq(financialAccounts.id, transactions.accountId),
      )
      .innerJoin(plaidItems, eq(plaidItems.id, financialAccounts.itemId))
      .where(where),
  ]);

  const totalCount = Number(countRows[0]?.count ?? 0);

  return {
    rows: rows.map((r) => ({ ...r, amount: Number(r.amount) })),
    totalCount,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
  };
}

/** Distinct primary_category values across the user's transactions, for filter UI. */
export async function getDistinctCategories(userId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ category: transactions.primaryCategory })
    .from(transactions)
    .innerJoin(
      financialAccounts,
      eq(financialAccounts.id, transactions.accountId),
    )
    .innerJoin(plaidItems, eq(plaidItems.id, financialAccounts.itemId))
    .where(
      and(
        eq(plaidItems.userId, userId),
        sql`${transactions.primaryCategory} IS NOT NULL`,
      ),
    )
    .orderBy(transactions.primaryCategory);
  return rows.map((r) => r.category!).filter(Boolean);
}

export type AccountOption = {
  id: string;
  name: string;
  mask: string | null;
  type: string;
  subtype: string | null;
};

/** Lightweight list of accounts for the filter dropdown. */
export async function getUserAccounts(userId: string): Promise<AccountOption[]> {
  return db
    .select({
      id: financialAccounts.id,
      name: financialAccounts.name,
      mask: financialAccounts.mask,
      type: financialAccounts.type,
      subtype: financialAccounts.subtype,
    })
    .from(financialAccounts)
    .innerJoin(plaidItems, eq(plaidItems.id, financialAccounts.itemId))
    .where(eq(plaidItems.userId, userId))
    .orderBy(financialAccounts.type, financialAccounts.name);
}
