import { and, asc, eq, inArray, isNotNull, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  categories,
  financialAccounts,
  plaidItems,
  transactions,
} from '@/lib/db/schema';

export type CategoryOption = {
  /** ID when this option already has a row in the categories table. */
  id: string | null;
  /** Display + matching name. */
  name: string;
  /** Where this option came from — drives picker grouping + ordering. */
  source: 'user' | 'pfc';
};

/**
 * Returns the user's category-picker menu: existing user categories
 * (highest signal — they actively curate these) plus humanized Plaid
 * PFC strings observed on their transactions (virtual options that
 * become real `categories` rows on first use). Dedupes by lowercased
 * name so renaming a PFC to its canonical user category doesn't
 * surface both.
 *
 * The action layer find-or-creates by name, so the picker doesn't
 * need to distinguish "real" vs "virtual" at apply time.
 */
export async function getCategoryOptions(
  userId: string,
): Promise<CategoryOption[]> {
  const [userRows, pfcRows] = await Promise.all([
    db
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .where(eq(categories.userId, userId))
      .orderBy(asc(categories.name)),
    db
      .selectDistinct({ pfc: transactions.primaryCategory })
      .from(transactions)
      .innerJoin(
        financialAccounts,
        eq(financialAccounts.id, transactions.accountId),
      )
      .innerJoin(plaidItems, eq(plaidItems.id, financialAccounts.itemId))
      .where(
        and(eq(plaidItems.userId, userId), isNotNull(transactions.primaryCategory)),
      ),
  ]);

  const seen = new Set<string>();
  const out: CategoryOption[] = [];

  for (const r of userRows) {
    const key = r.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: r.id, name: r.name, source: 'user' });
  }

  const pfcNames = pfcRows
    .map((r) => humanizePfc(r.pfc!))
    .sort((a, b) => a.localeCompare(b));

  for (const name of pfcNames) {
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: null, name, source: 'pfc' });
  }

  return out;
}

/**
 * Resolve a category-by-name to an existing user-scoped row, or
 * create a fresh one. Returns the row id either way. Used by the
 * bulk-recategorize action so the picker can pass a name string and
 * not worry about pre-existence.
 */
export async function findOrCreateCategoryByName(
  userId: string,
  name: string,
): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Category name cannot be empty');

  const existing = await db
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(
        eq(categories.userId, userId),
        sql`lower(${categories.name}) = lower(${trimmed})`,
      ),
    )
    .limit(1);

  if (existing.length > 0) return existing[0].id;

  const [inserted] = await db
    .insert(categories)
    .values({ userId, name: trimmed })
    .returning({ id: categories.id });
  return inserted.id;
}

/**
 * Verify the caller owns each transaction id supplied. Returns the
 * subset that's actually theirs — used as a defense-in-depth check
 * before bulk updates so a forged tx id can't slip through.
 */
export async function filterOwnedTransactions(
  userId: string,
  txIds: string[],
): Promise<string[]> {
  if (txIds.length === 0) return [];
  const rows = await db
    .select({ id: transactions.id })
    .from(transactions)
    .innerJoin(
      financialAccounts,
      eq(financialAccounts.id, transactions.accountId),
    )
    .innerJoin(plaidItems, eq(plaidItems.id, financialAccounts.itemId))
    .where(
      and(eq(plaidItems.userId, userId), inArray(transactions.id, txIds)),
    );
  return rows.map((r) => r.id);
}

function humanizePfc(pfc: string): string {
  if (pfc === 'UNCATEGORIZED') return 'Uncategorized';
  return pfc
    .toLowerCase()
    .split('_')
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(' ');
}

// `or` re-export silences an unused-import warning if `or` is used in a
// future condition; harmless and keeps the typed import live.
void or;
