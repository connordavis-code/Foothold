import { and, asc, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  financialAccounts,
  holdings,
  plaidItems,
  securities,
} from '@/lib/db/schema';

export type HoldingRow = {
  id: string;
  ticker: string | null;
  securityName: string | null;
  securityType: string | null;
  quantity: number;
  costBasis: number | null;
  institutionPrice: number | null;
  institutionValue: number | null;
};

export type AccountWithHoldings = {
  id: string;
  name: string;
  subtype: string | null;
  mask: string | null;
  currentBalance: number | null;
  totalValue: number;
  totalCost: number;
  /** Sum of (institution_value − cost_basis) for holdings where both are present. */
  totalGainLoss: number;
  /** Number of holdings for which we had a cost basis (so the GL number is meaningful). */
  costedHoldingsCount: number;
  holdings: HoldingRow[];
};

/**
 * All holdings for the user, grouped by investment account. One JOINed
 * query, then bucketed in JS — simpler than nested SQL aggregations.
 *
 * Accounts with no holdings (e.g., investment accounts that hold only
 * uncategorized cash sweeps) are still returned with an empty holdings
 * list and a totalValue derived from the account-level balance.
 */
export async function getHoldingsByAccount(
  userId: string,
): Promise<AccountWithHoldings[]> {
  // Pull all investment-type accounts so accounts without holdings still
  // appear (e.g., a brokerage holding only an uncategorized cash sweep).
  const investmentAccounts = await db
    .select({
      id: financialAccounts.id,
      name: financialAccounts.name,
      subtype: financialAccounts.subtype,
      mask: financialAccounts.mask,
      currentBalance: financialAccounts.currentBalance,
    })
    .from(financialAccounts)
    .innerJoin(plaidItems, eq(plaidItems.id, financialAccounts.itemId))
    .where(
      and(eq(plaidItems.userId, userId), eq(financialAccounts.type, 'investment')),
    )
    .orderBy(asc(financialAccounts.name));

  if (investmentAccounts.length === 0) return [];

  const rows = await db
    .select({
      accountId: holdings.accountId,
      holdingId: holdings.id,
      quantity: holdings.quantity,
      costBasis: holdings.costBasis,
      institutionPrice: holdings.institutionPrice,
      institutionValue: holdings.institutionValue,
      ticker: securities.ticker,
      securityName: securities.name,
      securityType: securities.type,
    })
    .from(holdings)
    .innerJoin(
      financialAccounts,
      eq(financialAccounts.id, holdings.accountId),
    )
    .innerJoin(plaidItems, eq(plaidItems.id, financialAccounts.itemId))
    .innerJoin(securities, eq(securities.id, holdings.securityId))
    .where(eq(plaidItems.userId, userId))
    .orderBy(desc(holdings.institutionValue));

  const holdingsByAccount = new Map<string, HoldingRow[]>();
  for (const r of rows) {
    const list = holdingsByAccount.get(r.accountId) ?? [];
    list.push({
      id: r.holdingId,
      ticker: r.ticker,
      securityName: r.securityName,
      securityType: r.securityType,
      quantity: Number(r.quantity),
      costBasis: r.costBasis != null ? Number(r.costBasis) : null,
      institutionPrice:
        r.institutionPrice != null ? Number(r.institutionPrice) : null,
      institutionValue:
        r.institutionValue != null ? Number(r.institutionValue) : null,
    });
    holdingsByAccount.set(r.accountId, list);
  }

  return investmentAccounts.map((acc) => {
    const items = holdingsByAccount.get(acc.id) ?? [];
    let totalValue = 0;
    let totalCost = 0;
    let totalGainLoss = 0;
    let costedHoldingsCount = 0;

    for (const h of items) {
      if (h.institutionValue != null) totalValue += h.institutionValue;
      if (h.costBasis != null && h.institutionValue != null) {
        totalCost += h.costBasis;
        totalGainLoss += h.institutionValue - h.costBasis;
        costedHoldingsCount++;
      }
    }

    return {
      ...acc,
      currentBalance:
        acc.currentBalance != null ? Number(acc.currentBalance) : null,
      totalValue,
      totalCost,
      totalGainLoss,
      costedHoldingsCount,
      holdings: items,
    };
  });
}
