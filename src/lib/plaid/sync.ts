import { and, eq, inArray, sql } from 'drizzle-orm';
import type {
  Holding as PlaidHolding,
  InvestmentTransaction as PlaidInvestmentTransaction,
  Security as PlaidSecurity,
} from 'plaid';
import { decryptToken } from '@/lib/crypto';
import { db } from '@/lib/db';
import {
  type ExternalItem,
  type FinancialAccount,
  financialAccounts,
  holdings,
  investmentTransactions,
  externalItems,
  securities,
  transactions,
} from '@/lib/db/schema';
import { hasInvestmentAccounts } from './capabilities';
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
 * Plaid-specific narrowing of ExternalItem. The base shape leaves
 * `secret` nullable (SnapTrade rows store NULL), but every Plaid
 * helper requires a plaintext access_token in `secret`. Use this
 * type for any function that operates on a Plaid item.
 */
export type PlaidExternalItem = ExternalItem & { secret: string };

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
    .from(externalItems)
    .where(and(eq(externalItems.id, itemId), eq(externalItems.status, 'active')));
  if (!item) throw new Error(`external_item ${itemId} not found or not active`);
  if (item.provider !== 'plaid') {
    throw new Error(
      `external_item ${itemId} is provider=${item.provider}, expected 'plaid'`,
    );
  }
  if (!item.secret) {
    // SnapTrade rows allow secret=NULL (userSecret lives on
    // snaptrade_user). Plaid rows must always have an access_token.
    throw new Error(`external_item ${itemId} (provider=plaid) has NULL secret`);
  }

  // Narrow once for the helpers below — they all expect a non-null
  // plaintext secret. Cast safe here because of the guard above.
  const plaidItem = item as PlaidExternalItem;

  // Single decryption boundary: every helper below reads `plaidItem.secret`
  // and expects plaintext. Mutating once here keeps the call sites unchanged.
  plaidItem.secret = decryptToken(plaidItem.secret);

  // Wrap in try/finally to drop our last reference to the plaintext
  // access_token before this scope unwinds. Doesn't zero V8's underlying
  // string allocation (no userland API for that), but removes the strong
  // ref so GC can reclaim sooner — review W-04 hygiene.
  try {
    const accountsResult = await syncAccountsForItem(plaidItem);

    // Reload accounts now that the upsert may have added new rows. Both
    // downstream helpers need the provider_account_id → financial_account.id map.
    const accs = await db
      .select()
      .from(financialAccounts)
      .where(eq(financialAccounts.itemId, plaidItem.id));

    // Recurring depends on transaction history, but the recurring endpoint
    // looks at server-side history Plaid already has — so it can run in
    // parallel with transactionsSync. Investments is independent.
    const [txns, inv, rec] = await Promise.all([
      syncTransactionsForItem(plaidItem, accs),
      syncInvestmentsForItem(plaidItem, accs),
      syncRecurringForItem(plaidItem, accs),
    ]);

    return {
      accounts: accountsResult.count,
      transactions: txns,
      investments: inv,
      recurring: rec,
    };
  } finally {
    plaidItem.secret = '';
  }
}

/**
 * Refresh financial_accounts. Single batched INSERT … ON CONFLICT DO
 * UPDATE FROM excluded — one round-trip regardless of account count.
 */
async function syncAccountsForItem(
  item: PlaidExternalItem,
): Promise<{ count: number }> {
  const res = await plaid.accountsGet({ access_token: item.secret });
  if (res.data.accounts.length === 0) return { count: 0 };

  const rows = res.data.accounts.map((a) => ({
    itemId: item.id,
    providerAccountId: a.account_id,
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
      target: financialAccounts.providerAccountId,
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
  item: PlaidExternalItem,
  accs: FinancialAccount[],
): Promise<{ added: number; modified: number; removed: number }> {
  const acctIdByProviderId = new Map(accs.map((a) => [a.providerAccountId, a.id]));

  // Plaid /transactions/sync cursor lives in the provider_state JSONB blob
  // on external_item — see schema.ts comment on `providerState`. Narrowed
  // here at the read boundary; the rest of the function treats it as
  // a plain string.
  const providerState =
    (item.providerState as { transactionsCursor?: string } | null) ?? {};
  let cursor = providerState.transactionsCursor ?? '';
  let added = 0;
  let modified = 0;
  let removed = 0;
  let hasMore = true;

  while (hasMore) {
    const res = await plaid.transactionsSync({
      access_token: item.secret,
      cursor: cursor || undefined,
    });

    // Merge added + modified into one upsert. Plaid's distinction is
    // informational; ON CONFLICT DO UPDATE handles both naturally.
    const upserts = [...res.data.added, ...res.data.modified]
      .map((t) => {
        const accountId = acctIdByProviderId.get(t.account_id);
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
    .update(externalItems)
    .set({
      // Merge cursor into existing providerState — preserve any other
      // provider-specific keys we don't know about (forward-compatible).
      providerState: { ...providerState, transactionsCursor: cursor },
      lastSyncedAt: new Date(),
    })
    .where(eq(externalItems.id, item.id));

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
  item: PlaidExternalItem,
  accs: FinancialAccount[],
): Promise<{ holdings: number; transactions: number; securities: number }> {
  if (!hasInvestmentAccounts(accs)) {
    return { holdings: 0, transactions: 0, securities: 0 };
  }
  const acctIdByProviderId = new Map(accs.map((a) => [a.providerAccountId, a.id]));

  const endDate = new Date();
  const startDate = item.lastSyncedAt
    ? new Date(item.lastSyncedAt.getTime() - DAY_MS)
    : new Date(endDate.getTime() - INITIAL_BACKFILL_DAYS * DAY_MS);
  const startStr = startDate.toISOString().slice(0, 10);
  const endStr = endDate.toISOString().slice(0, 10);

  // Fire both Plaid endpoints concurrently; they're independent.
  const [holdingsRes, firstTxPage] = await Promise.all([
    plaid.investmentsHoldingsGet({ access_token: item.secret }),
    plaid.investmentsTransactionsGet({
      access_token: item.secret,
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
      access_token: item.secret,
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
  const secIdByProviderId = new Map<string, string>();
  if (allSecs.length > 0) {
    const secRows = allSecs.map((s) => ({
      providerSecurityId: s.security_id,
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
        target: securities.providerSecurityId,
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
        providerSecurityId: securities.providerSecurityId,
      });
    for (const r of inserted) secIdByProviderId.set(r.providerSecurityId, r.id);
  }

  // 2) Holdings + 3) investment_transactions — independent writes, run
  // concurrently. Both depend only on the maps populated above.
  const holdingRows = allHoldings
    .map((h) => {
      const accountId = acctIdByProviderId.get(h.account_id);
      const securityId = secIdByProviderId.get(h.security_id);
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
      const accountId = acctIdByProviderId.get(t.account_id);
      if (!accountId) return null;
      const securityId = t.security_id
        ? (secIdByProviderId.get(t.security_id) ?? null)
        : null;
      return {
        accountId,
        securityId,
        providerInvestmentTransactionId: t.investment_transaction_id,
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
            target: investmentTransactions.providerInvestmentTransactionId,
          })
      : Promise.resolve(),
  ]);

  return {
    holdings: allHoldings.length,
    transactions: allTxs.length,
    securities: allSecs.length,
  };
}
