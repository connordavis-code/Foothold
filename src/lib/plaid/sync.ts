import { and, eq, inArray, sql } from 'drizzle-orm';
import type {
  Holding as PlaidHolding,
  InvestmentTransaction as PlaidInvestmentTransaction,
  Security as PlaidSecurity,
} from 'plaid';
import { db } from '@/lib/db';
import {
  financialAccounts,
  holdings,
  investmentTransactions,
  plaidItems,
  securities,
  transactions,
} from '@/lib/db/schema';
import { plaid } from './client';

/**
 * Plaid returns amounts as JS numbers; Drizzle's `numeric` columns want
 * strings to preserve precision. Centralize the conversion.
 */
const num = (n: number | null | undefined): string | null =>
  n == null ? null : String(n);

const numRequired = (n: number): string => String(n);

const DAY_MS = 24 * 60 * 60 * 1000;

/** 90-day initial backfill window for /investments/transactions/get. */
const INITIAL_BACKFILL_DAYS = 90;

/**
 * Refresh financial_accounts for a Plaid item. One batched INSERT … ON
 * CONFLICT DO UPDATE FROM excluded — single round-trip regardless of how
 * many accounts the item has.
 *
 * Note: removed accounts are NOT pruned here — that needs richer state
 * tracking (Phase 5 cleanup). For now an account that disappears from Plaid
 * just becomes a stale row.
 */
export async function syncAccounts(itemId: string): Promise<{ count: number }> {
  const [item] = await db
    .select()
    .from(plaidItems)
    .where(eq(plaidItems.id, itemId));
  if (!item) throw new Error(`plaid_item ${itemId} not found`);

  const res = await plaid.accountsGet({ access_token: item.accessToken });
  if (res.data.accounts.length === 0) return { count: 0 };

  const rows = res.data.accounts.map((a) => ({
    itemId: item.id,
    plaidAccountId: a.account_id,
    name: a.name,
    officialName: a.official_name ?? null,
    mask: a.mask ?? null,
    type: a.type as string,
    subtype: (a.subtype as string | null) ?? null,
    currentBalance: num(a.balances.current),
    availableBalance: num(a.balances.available),
    isoCurrencyCode: a.balances.iso_currency_code ?? 'USD',
  }));

  await db
    .insert(financialAccounts)
    .values(rows)
    .onConflictDoUpdate({
      target: financialAccounts.plaidAccountId,
      set: {
        name: sql`excluded.name`,
        officialName: sql`excluded.official_name`,
        mask: sql`excluded.mask`,
        type: sql`excluded.type`,
        subtype: sql`excluded.subtype`,
        currentBalance: sql`excluded.current_balance`,
        availableBalance: sql`excluded.available_balance`,
        isoCurrencyCode: sql`excluded.iso_currency_code`,
        updatedAt: new Date(),
      },
    });

  return { count: rows.length };
}

/**
 * Cursor-based incremental transaction sync. On first call (cursor empty)
 * Plaid returns up to 24 months of history; subsequent calls return only
 * the diff. We loop until has_more is false.
 *
 * The cursor is only persisted AFTER the full pagination completes — so a
 * mid-loop crash doesn't skip pages on retry.
 *
 * Each page does at most three round-trips: one batched upsert for added
 * + modified rows, one batched delete for removed, plus the Plaid call.
 */
export async function syncTransactions(itemId: string): Promise<{
  added: number;
  modified: number;
  removed: number;
}> {
  const [item] = await db
    .select()
    .from(plaidItems)
    .where(eq(plaidItems.id, itemId));
  if (!item) throw new Error(`plaid_item ${itemId} not found`);

  const accs = await db
    .select()
    .from(financialAccounts)
    .where(eq(financialAccounts.itemId, item.id));
  const acctIdByPlaidId = new Map(accs.map((a) => [a.plaidAccountId, a.id]));

  let cursor = item.transactionsCursor ?? '';
  let added = 0;
  let modified = 0;
  let removed = 0;
  let hasMore = true;

  while (hasMore) {
    const res = await plaid.transactionsSync({
      access_token: item.accessToken,
      cursor: cursor || undefined,
    });

    // Merge added + modified into one upsert. Plaid's distinction is
    // informational; ON CONFLICT DO UPDATE handles both naturally.
    const upserts = [...res.data.added, ...res.data.modified]
      .map((t) => {
        const accountId = acctIdByPlaidId.get(t.account_id);
        if (!accountId) return null;
        return {
          accountId,
          plaidTransactionId: t.transaction_id,
          amount: numRequired(t.amount),
          isoCurrencyCode: t.iso_currency_code ?? 'USD',
          date: t.date,
          authorizedDate: t.authorized_date ?? null,
          name: t.name,
          merchantName: t.merchant_name ?? null,
          pending: t.pending,
          primaryCategory: t.personal_finance_category?.primary ?? null,
          detailedCategory: t.personal_finance_category?.detailed ?? null,
          paymentChannel: t.payment_channel,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    if (upserts.length > 0) {
      await db
        .insert(transactions)
        .values(upserts)
        .onConflictDoUpdate({
          target: transactions.plaidTransactionId,
          set: {
            accountId: sql`excluded.account_id`,
            amount: sql`excluded.amount`,
            isoCurrencyCode: sql`excluded.iso_currency_code`,
            date: sql`excluded.date`,
            authorizedDate: sql`excluded.authorized_date`,
            name: sql`excluded.name`,
            merchantName: sql`excluded.merchant_name`,
            pending: sql`excluded.pending`,
            primaryCategory: sql`excluded.primary_category`,
            detailedCategory: sql`excluded.detailed_category`,
            paymentChannel: sql`excluded.payment_channel`,
            updatedAt: new Date(),
          },
        });
      added += res.data.added.length;
      modified += res.data.modified.length;
    }

    const removedIds = res.data.removed
      .map((r) => r.transaction_id)
      .filter((id): id is string => !!id);
    if (removedIds.length > 0) {
      await db
        .delete(transactions)
        .where(inArray(transactions.plaidTransactionId, removedIds));
      removed += removedIds.length;
    }

    cursor = res.data.next_cursor;
    hasMore = res.data.has_more;
  }

  await db
    .update(plaidItems)
    .set({
      transactionsCursor: cursor,
      lastSyncedAt: new Date(),
    })
    .where(eq(plaidItems.id, item.id));

  return { added, modified, removed };
}

/**
 * Refresh investments data — securities, holdings (current snapshot), and
 * investment transactions in the date window.
 *
 * Skipped entirely if the item has no investment-type accounts; that
 * avoids a needless API call AND the PRODUCTS_NOT_SUPPORTED error from
 * institutions that only expose depository accounts.
 *
 * On first sync we look back 90 days. On subsequent syncs we look back to
 * (last_synced_at - 1 day) to catch any late-posting transactions.
 *
 * Each of the three writes (securities, holdings, investment_transactions)
 * is a single batched statement.
 */
export async function syncInvestments(itemId: string): Promise<{
  holdings: number;
  transactions: number;
  securities: number;
}> {
  const [item] = await db
    .select()
    .from(plaidItems)
    .where(eq(plaidItems.id, itemId));
  if (!item) throw new Error(`plaid_item ${itemId} not found`);

  const accs = await db
    .select()
    .from(financialAccounts)
    .where(eq(financialAccounts.itemId, item.id));
  if (!accs.some((a) => a.type === 'investment')) {
    return { holdings: 0, transactions: 0, securities: 0 };
  }
  const acctIdByPlaidId = new Map(accs.map((a) => [a.plaidAccountId, a.id]));

  const endDate = new Date();
  const startDate = item.lastSyncedAt
    ? new Date(item.lastSyncedAt.getTime() - DAY_MS)
    : new Date(endDate.getTime() - INITIAL_BACKFILL_DAYS * DAY_MS);
  const startStr = startDate.toISOString().slice(0, 10);
  const endStr = endDate.toISOString().slice(0, 10);

  const holdingsRes = await plaid.investmentsHoldingsGet({
    access_token: item.accessToken,
  });
  const allHoldings: PlaidHolding[] = holdingsRes.data.holdings;
  const securityIndex = new Map<string, PlaidSecurity>();
  for (const s of holdingsRes.data.securities) securityIndex.set(s.security_id, s);

  const allTxs: PlaidInvestmentTransaction[] = [];
  let offset = 0;
  let total = Infinity;
  while (offset < total) {
    const res = await plaid.investmentsTransactionsGet({
      access_token: item.accessToken,
      start_date: startStr,
      end_date: endStr,
      options: { count: 500, offset },
    });
    total = res.data.total_investment_transactions;
    allTxs.push(...res.data.investment_transactions);
    for (const s of res.data.securities) {
      if (!securityIndex.has(s.security_id)) securityIndex.set(s.security_id, s);
    }
    offset += res.data.investment_transactions.length;
    if (res.data.investment_transactions.length === 0) break;
  }
  const allSecs = Array.from(securityIndex.values());

  // 1) Securities — single upsert, RETURNING populates the id map for the
  // subsequent holdings/transactions inserts.
  const secIdByPlaidId = new Map<string, string>();
  if (allSecs.length > 0) {
    const secRows = allSecs.map((s) => ({
      plaidSecurityId: s.security_id,
      ticker: s.ticker_symbol ?? null,
      name: s.name ?? null,
      type: s.type ?? null,
      cusip: s.cusip ?? null,
      isin: s.isin ?? null,
      closePrice: num(s.close_price),
      closePriceAsOf: s.close_price_as_of ?? null,
      isoCurrencyCode: s.iso_currency_code ?? 'USD',
    }));
    const inserted = await db
      .insert(securities)
      .values(secRows)
      .onConflictDoUpdate({
        target: securities.plaidSecurityId,
        set: {
          ticker: sql`excluded.ticker`,
          name: sql`excluded.name`,
          type: sql`excluded.type`,
          closePrice: sql`excluded.close_price`,
          closePriceAsOf: sql`excluded.close_price_as_of`,
          updatedAt: new Date(),
        },
      })
      .returning({
        id: securities.id,
        plaidSecurityId: securities.plaidSecurityId,
      });
    for (const r of inserted) secIdByPlaidId.set(r.plaidSecurityId, r.id);
  }

  // 2) Holdings — batched upsert.
  const holdingRows = allHoldings
    .map((h) => {
      const accountId = acctIdByPlaidId.get(h.account_id);
      const securityId = secIdByPlaidId.get(h.security_id);
      if (!accountId || !securityId) return null;
      return {
        accountId,
        securityId,
        quantity: numRequired(h.quantity),
        costBasis: num(h.cost_basis),
        institutionValue: num(h.institution_value),
        institutionPrice: num(h.institution_price),
        institutionPriceAsOf: h.institution_price_as_of ?? null,
        isoCurrencyCode: h.iso_currency_code ?? 'USD',
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (holdingRows.length > 0) {
    await db
      .insert(holdings)
      .values(holdingRows)
      .onConflictDoUpdate({
        target: [holdings.accountId, holdings.securityId],
        set: {
          quantity: sql`excluded.quantity`,
          costBasis: sql`excluded.cost_basis`,
          institutionValue: sql`excluded.institution_value`,
          institutionPrice: sql`excluded.institution_price`,
          institutionPriceAsOf: sql`excluded.institution_price_as_of`,
          updatedAt: new Date(),
        },
      });
  }

  // 3) Investment transactions — batched insert; on conflict do nothing
  // (these are immutable once posted).
  const invTxRows = allTxs
    .map((t) => {
      const accountId = acctIdByPlaidId.get(t.account_id);
      if (!accountId) return null;
      const securityId = t.security_id
        ? (secIdByPlaidId.get(t.security_id) ?? null)
        : null;
      return {
        accountId,
        securityId,
        plaidInvestmentTransactionId: t.investment_transaction_id,
        amount: numRequired(t.amount),
        quantity: num(t.quantity),
        price: num(t.price),
        fees: num(t.fees),
        date: t.date,
        name: t.name ?? null,
        type: t.type ?? null,
        subtype: t.subtype != null ? String(t.subtype) : null,
        isoCurrencyCode: t.iso_currency_code ?? 'USD',
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (invTxRows.length > 0) {
    await db
      .insert(investmentTransactions)
      .values(invTxRows)
      .onConflictDoNothing({
        target: investmentTransactions.plaidInvestmentTransactionId,
      });
  }

  return {
    holdings: allHoldings.length,
    transactions: allTxs.length,
    securities: allSecs.length,
  };
}

export type SyncSummary = {
  accounts: number;
  transactions: { added: number; modified: number; removed: number };
  investments: { holdings: number; transactions: number; securities: number };
};

/**
 * Full sync for one item: accounts → transactions → investments. Order
 * matters: accounts must be in the DB before transactions can FK to them.
 */
export async function syncItem(itemId: string): Promise<SyncSummary> {
  const [item] = await db
    .select()
    .from(plaidItems)
    .where(and(eq(plaidItems.id, itemId), eq(plaidItems.status, 'active')));
  if (!item) throw new Error(`plaid_item ${itemId} not found or not active`);

  const accounts = await syncAccounts(itemId);
  const txns = await syncTransactions(itemId);
  const inv = await syncInvestments(itemId);
  return {
    accounts: accounts.count,
    transactions: txns,
    investments: inv,
  };
}
