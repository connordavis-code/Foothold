import { and, eq, inArray, sql } from 'drizzle-orm';
import type {
  Holding as PlaidHolding,
  InvestmentTransaction as PlaidInvestmentTransaction,
  Security as PlaidSecurity,
} from 'plaid';
import { db } from '@/lib/db';
import {
  type FinancialAccount,
  type PlaidItem,
  financialAccounts,
  holdings,
  investmentTransactions,
  plaidItems,
  securities,
  transactions,
} from '@/lib/db/schema';
import { plaid } from './client';
import { syncRecurringForItem } from './recurring';

const num = (n: number | null | undefined): string | null =>
  n == null ? null : String(n);
const numRequired = (n: number): string => String(n);

const DAY_MS = 24 * 60 * 60 * 1000;
const INITIAL_BACKFILL_DAYS = 90;

export type SyncSummary = {
  accounts: number;
  transactions: { added: number; modified: number; removed: number };
  investments: { holdings: number; transactions: number; securities: number };
  recurring: { inflows: number; outflows: number };
};

/**
 * Full sync for one item.
 *
 * Order:
 *   1. Refresh accounts. Required first because transactions FK to them.
 *   2. Run transaction sync and investment sync in parallel — independent
 *      Plaid endpoints, independent DB writes (different tables).
 *
 * Each helper takes the already-loaded item + accounts so we don't
 * re-query the DB for the same rows in each step.
 */
export async function syncItem(itemId: string): Promise<SyncSummary> {
  const [item] = await db
    .select()
    .from(plaidItems)
    .where(and(eq(plaidItems.id, itemId), eq(plaidItems.status, 'active')));
  if (!item) throw new Error(`plaid_item ${itemId} not found or not active`);

  const accountsResult = await syncAccountsForItem(item);

  // Reload accounts now that the upsert may have added new rows. Both
  // downstream helpers need the plaid_account_id → financial_account.id map.
  const accs = await db
    .select()
    .from(financialAccounts)
    .where(eq(financialAccounts.itemId, item.id));

  // Recurring depends on transaction history, but the recurring endpoint
  // looks at server-side history Plaid already has — so it can run in
  // parallel with transactionsSync. Investments is independent.
  const [txns, inv, rec] = await Promise.all([
    syncTransactionsForItem(item, accs),
    syncInvestmentsForItem(item, accs),
    syncRecurringForItem(item, accs),
  ]);

  return {
    accounts: accountsResult.count,
    transactions: txns,
    investments: inv,
    recurring: rec,
  };
}

/**
 * Refresh financial_accounts. Single batched INSERT … ON CONFLICT DO
 * UPDATE FROM excluded — one round-trip regardless of account count.
 */
async function syncAccountsForItem(
  item: PlaidItem,
): Promise<{ count: number }> {
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
 * Each page does at most three round-trips: one batched upsert for
 * added + modified rows, one batched delete for removed, plus the
 * Plaid call.
 */
async function syncTransactionsForItem(
  item: PlaidItem,
  accs: FinancialAccount[],
): Promise<{ added: number; modified: number; removed: number }> {
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
 * Refresh investments — securities, holdings (current snapshot), and
 * investment transactions in the date window.
 *
 * Skipped entirely if the item has no investment-type accounts; that
 * avoids a needless API call AND the PRODUCTS_NOT_SUPPORTED error from
 * institutions that only expose depository accounts.
 *
 * The two Plaid endpoints (holdings + transactions) are called in
 * parallel — they're independent.
 */
async function syncInvestmentsForItem(
  item: PlaidItem,
  accs: FinancialAccount[],
): Promise<{ holdings: number; transactions: number; securities: number }> {
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

  // Fire both Plaid endpoints concurrently; they're independent.
  const [holdingsRes, firstTxPage] = await Promise.all([
    plaid.investmentsHoldingsGet({ access_token: item.accessToken }),
    plaid.investmentsTransactionsGet({
      access_token: item.accessToken,
      start_date: startStr,
      end_date: endStr,
      options: { count: 500, offset: 0 },
    }),
  ]);

  const allHoldings: PlaidHolding[] = holdingsRes.data.holdings;
  const securityIndex = new Map<string, PlaidSecurity>();
  for (const s of holdingsRes.data.securities) securityIndex.set(s.security_id, s);
  for (const s of firstTxPage.data.securities) {
    if (!securityIndex.has(s.security_id)) securityIndex.set(s.security_id, s);
  }

  const allTxs: PlaidInvestmentTransaction[] = [
    ...firstTxPage.data.investment_transactions,
  ];
  let offset = firstTxPage.data.investment_transactions.length;
  const total = firstTxPage.data.total_investment_transactions;
  while (offset < total) {
    const res = await plaid.investmentsTransactionsGet({
      access_token: item.accessToken,
      start_date: startStr,
      end_date: endStr,
      options: { count: 500, offset },
    });
    allTxs.push(...res.data.investment_transactions);
    for (const s of res.data.securities) {
      if (!securityIndex.has(s.security_id)) securityIndex.set(s.security_id, s);
    }
    if (res.data.investment_transactions.length === 0) break;
    offset += res.data.investment_transactions.length;
  }
  const allSecs = Array.from(securityIndex.values());

  // 1) Securities — single upsert; RETURNING populates the id map.
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

  // 2) Holdings + 3) investment_transactions — independent writes, run
  // concurrently. Both depend only on the maps populated above.
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

  await Promise.all([
    holdingRows.length > 0
      ? db
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
          })
      : Promise.resolve(),
    invTxRows.length > 0
      ? db
          .insert(investmentTransactions)
          .values(invTxRows)
          .onConflictDoNothing({
            target: investmentTransactions.plaidInvestmentTransactionId,
          })
      : Promise.resolve(),
  ]);

  return {
    holdings: allHoldings.length,
    transactions: allTxs.length,
    securities: allSecs.length,
  };
}
