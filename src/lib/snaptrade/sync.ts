import { and, eq, sql } from 'drizzle-orm';
import { decryptToken } from '@/lib/crypto';
import { db } from '@/lib/db';
import {
  externalItems,
  financialAccounts,
  holdings,
  investmentTransactions,
  securities,
  snaptradeUsers,
} from '@/lib/db/schema';
import { snaptrade } from './client';

const num = (n: number | null | undefined): string | null =>
  n == null ? null : String(n);
const numRequired = (n: number): string => String(n);

const DAY_MS = 24 * 60 * 60 * 1000;
const INITIAL_BACKFILL_DAYS = 90;

export type SnaptradeSyncSummary = {
  accounts: number;
  holdings: number;
  activities: number;
  securities: number;
};

/**
 * Full sync for one SnapTrade brokerage authorization (= external_item).
 *
 * SnapTrade's data model: one user has many brokerage authorizations
 * (= our external_item). Each authorization owns multiple accounts. Each
 * account has positions + activities. Plaid's holdings + investments
 * tables are the natural target — we don't touch transactions /
 * recurring (brokerage feeds don't have bank-transaction analogs in
 * the SnapTrade taxonomy).
 *
 * Order:
 *   1. Resolve userSecret from snaptrade_user (per-USER credential).
 *   2. Fetch accounts under the authorization (real-time per-conn endpoint).
 *   3. Upsert financial_account rows for each.
 *   4. For each account: positions → securities + holdings; activities
 *      → investment_transactions. Run per-account fetches concurrently.
 *   5. Update external_item.lastSyncedAt.
 *
 * The plaidAccountId / plaidSecurityId / plaidInvestmentTransactionId
 * columns are reused as the SnapTrade-side stable id (UUIDs from
 * SnapTrade can't collide with Plaid's namespaced ids). Future cleanup
 * may rename to provider_*_id but isn't load-bearing.
 */
export async function syncSnaptradeItem(
  externalItemId: string,
): Promise<SnaptradeSyncSummary> {
  const [item] = await db
    .select()
    .from(externalItems)
    .where(
      and(
        eq(externalItems.id, externalItemId),
        eq(externalItems.status, 'active'),
      ),
    );
  if (!item) {
    throw new Error(`external_item ${externalItemId} not found or not active`);
  }
  if (item.provider !== 'snaptrade') {
    throw new Error(
      `external_item ${externalItemId} is provider=${item.provider}, expected 'snaptrade'`,
    );
  }

  const [stUser] = await db
    .select()
    .from(snaptradeUsers)
    .where(eq(snaptradeUsers.userId, item.userId));
  if (!stUser) {
    throw new Error(
      `snaptrade_user row missing for userId=${item.userId} — Connection Portal flow leaked`,
    );
  }

  const userSecret = decryptToken(stUser.snaptradeUserSecret);
  const userId = stUser.snaptradeUserId;
  const authorizationId = item.providerItemId;

  try {
    // 1. Accounts under this connection.
    const accountsRes =
      await snaptrade().connections.listBrokerageAuthorizationAccounts({
        userId,
        userSecret,
        authorizationId,
      });
    const stAccounts = accountsRes.data ?? [];
    if (stAccounts.length === 0) {
      await db
        .update(externalItems)
        .set({ lastSyncedAt: new Date() })
        .where(eq(externalItems.id, item.id));
      return { accounts: 0, holdings: 0, activities: 0, securities: 0 };
    }

    // 2. Upsert financial_account rows. Reuse plaidAccountId column as
    // the unique provider-side id (SnapTrade UUIDs don't collide with
    // Plaid id namespace).
    const accountRows = stAccounts
      .filter((a) => typeof a.id === 'string')
      .map((a) => ({
        itemId: item.id,
        plaidAccountId: a.id as string,
        name: (a.name as string | undefined) ?? 'Brokerage account',
        officialName: (a.institution_name as string | undefined) ?? null,
        mask: (a.number as string | null | undefined) ?? null,
        // Brokerage accounts always count as 'investment' in our type column.
        type: 'investment',
        subtype: (a.meta?.type as string | undefined) ?? 'brokerage',
        currentBalance: num(
          (a.balance?.total?.amount as number | null | undefined) ?? null,
        ),
        availableBalance: null,
        isoCurrencyCode:
          (a.balance?.total?.currency as string | undefined) ?? 'USD',
      }));

    if (accountRows.length > 0) {
      await db
        .insert(financialAccounts)
        .values(accountRows)
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
    }

    // Re-read so we have local IDs for the new accounts.
    const dbAccounts = await db
      .select()
      .from(financialAccounts)
      .where(eq(financialAccounts.itemId, item.id));
    const acctIdByStId = new Map(
      dbAccounts.map((a) => [a.plaidAccountId, a.id]),
    );

    // 3. Positions + activities, per account, concurrently.
    const startDate = new Date(
      (item.lastSyncedAt?.getTime() ??
        Date.now() - INITIAL_BACKFILL_DAYS * DAY_MS) - DAY_MS,
    );
    const startStr = startDate.toISOString().slice(0, 10);
    const endStr = new Date().toISOString().slice(0, 10);

    const perAccountResults = await Promise.all(
      dbAccounts.map(async (acc) => {
        const [posRes, actRes] = await Promise.all([
          snaptrade().accountInformation.getUserAccountPositions({
            userId,
            userSecret,
            accountId: acc.plaidAccountId,
          }),
          snaptrade().transactionsAndReporting.getActivities({
            userId,
            userSecret,
            accounts: acc.plaidAccountId,
            startDate: startStr,
            endDate: endStr,
          }),
        ]);
        return {
          accountId: acc.id,
          positions: posRes.data ?? [],
          activities: actRes.data ?? [],
        };
      }),
    );

    // 4. Build dedup'd securities map across all positions + activities.
    type Sym = {
      id: string;
      ticker?: string | null;
      name?: string | null;
      type?: string | null;
      currency?: string | null;
    };
    const symbols = new Map<string, Sym>();
    const harvestSym = (raw: unknown): Sym | null => {
      const sym = raw as Record<string, unknown> | null | undefined;
      if (!sym) return null;
      // SnapTrade nests the canonical symbol under .symbol on Position
      // and under .symbol on UniversalActivity (with the same shape).
      const inner =
        (sym.symbol as Record<string, unknown> | undefined) ?? sym;
      const id =
        (inner.id as string | undefined) ?? (inner.symbol as string | undefined);
      if (!id) return null;
      return {
        id,
        ticker:
          (inner.symbol as string | undefined) ??
          (inner.raw_symbol as string | undefined) ??
          null,
        name: (inner.description as string | undefined) ?? null,
        type:
          ((inner.type as Record<string, unknown> | undefined)?.code as
            | string
            | undefined) ?? null,
        currency:
          ((inner.currency as Record<string, unknown> | undefined)?.code as
            | string
            | undefined) ?? null,
      };
    };
    for (const r of perAccountResults) {
      for (const p of r.positions) {
        const s = harvestSym(p.symbol);
        if (s && !symbols.has(s.id)) symbols.set(s.id, s);
      }
      for (const a of r.activities) {
        const s = harvestSym((a as Record<string, unknown>).symbol);
        if (s && !symbols.has(s.id)) symbols.set(s.id, s);
      }
    }

    // 5. Upsert securities; build local-id map.
    const secIdByStId = new Map<string, string>();
    if (symbols.size > 0) {
      const secRows = Array.from(symbols.values()).map((s) => ({
        plaidSecurityId: s.id,
        ticker: s.ticker ?? null,
        name: s.name ?? null,
        type: s.type ?? null,
        cusip: null,
        isin: null,
        closePrice: null,
        closePriceAsOf: null,
        isoCurrencyCode: s.currency ?? 'USD',
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
            updatedAt: new Date(),
          },
        })
        .returning({
          id: securities.id,
          plaidSecurityId: securities.plaidSecurityId,
        });
      for (const r of inserted) secIdByStId.set(r.plaidSecurityId, r.id);
    }

    // 6. Upsert holdings + investment_transactions concurrently.
    const holdingRows: Array<typeof holdings.$inferInsert> = [];
    const invTxRows: Array<typeof investmentTransactions.$inferInsert> = [];

    for (const r of perAccountResults) {
      for (const p of r.positions) {
        const sym = harvestSym(p.symbol);
        if (!sym) continue;
        const securityId = secIdByStId.get(sym.id);
        if (!securityId) continue;
        const units = (p.units as number | null | undefined) ?? null;
        if (units == null) continue;
        holdingRows.push({
          accountId: r.accountId,
          securityId,
          quantity: numRequired(units),
          costBasis: num(p.average_purchase_price as number | undefined),
          institutionValue:
            p.units != null && p.price != null
              ? num((p.units as number) * (p.price as number))
              : null,
          institutionPrice: num(p.price as number | undefined),
          institutionPriceAsOf: null,
          isoCurrencyCode: sym.currency ?? 'USD',
        });
      }
      for (const a of r.activities) {
        const ar = a as Record<string, unknown>;
        const id = ar.id as string | undefined;
        if (!id) continue;
        const sym = harvestSym(ar.symbol);
        const securityId = sym ? (secIdByStId.get(sym.id) ?? null) : null;
        const amount = (ar.amount as number | null | undefined) ?? null;
        if (amount == null) continue;
        const date = (ar.trade_date as string | undefined) ??
          (ar.settlement_date as string | undefined);
        if (!date) continue;
        invTxRows.push({
          accountId: r.accountId,
          securityId,
          plaidInvestmentTransactionId: id,
          // SnapTrade convention: amount > 0 = cash IN, < 0 = cash OUT.
          // Our convention (Plaid): amount > 0 = cash OUT. Flip the sign
          // so downstream display + math matches.
          amount: numRequired(-amount),
          quantity: num(ar.units as number | undefined),
          price: num(ar.price as number | undefined),
          fees: num(ar.fee as number | undefined),
          date: date.slice(0, 10),
          name: (ar.description as string | undefined) ?? null,
          type:
            ((ar.type as string | undefined) ?? '').toLowerCase() || null,
          subtype: null,
          isoCurrencyCode:
            ((ar.currency as Record<string, unknown> | undefined)?.code as
              | string
              | undefined) ?? 'USD',
        });
      }
    }

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

    await db
      .update(externalItems)
      .set({ lastSyncedAt: new Date() })
      .where(eq(externalItems.id, item.id));

    return {
      accounts: dbAccounts.length,
      holdings: holdingRows.length,
      activities: invTxRows.length,
      securities: symbols.size,
    };
  } finally {
    // Drop the strong reference to the plaintext userSecret. Same hygiene
    // pattern as Plaid's syncItem (review W-04).
    void userSecret;
  }
}
