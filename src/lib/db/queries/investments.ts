import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  financialAccounts,
  holdings,
  investmentTransactions,
  plaidItems,
  securities,
} from '@/lib/db/schema';

export type FlatHolding = {
  id: string;
  ticker: string | null;
  securityName: string | null;
  securityType: string | null;
  quantity: number;
  costBasis: number | null;
  institutionPrice: number | null;
  institutionValue: number | null;
  closePrice: number | null;
  /** Per-holding day delta in dollars; null when prices unavailable. */
  dayDelta: number | null;
  accountId: string;
  accountName: string;
  accountMask: string | null;
};

/**
 * Flat-across-accounts holdings list. Drives the dashboard's
 * group-by-flat default — the question "where am I overexposed across
 * everything?" lands faster from a flat list than from per-account
 * cards. Account name + mask travel with each row so the operator can
 * still see where each position lives.
 *
 * Day delta uses securities.closePrice as the prior reference and
 * holding.institutionPrice as the latest. When Plaid hasn't provided
 * closePrice (sandbox / new ticker / etc.) the delta is null and the
 * UI shows "—". When Plaid's two timestamps match (same-day update),
 * the delta is naturally 0 — that's honest, not a bug.
 */
export async function getHoldingsFlat(
  userId: string,
): Promise<FlatHolding[]> {
  const rows = await db
    .select({
      holdingId: holdings.id,
      quantity: holdings.quantity,
      costBasis: holdings.costBasis,
      institutionPrice: holdings.institutionPrice,
      institutionValue: holdings.institutionValue,
      ticker: securities.ticker,
      securityName: securities.name,
      securityType: securities.type,
      closePrice: securities.closePrice,
      accountId: financialAccounts.id,
      accountName: financialAccounts.name,
      accountMask: financialAccounts.mask,
    })
    .from(holdings)
    .innerJoin(
      financialAccounts,
      eq(financialAccounts.id, holdings.accountId),
    )
    .innerJoin(plaidItems, eq(plaidItems.id, financialAccounts.itemId))
    .innerJoin(securities, eq(securities.id, holdings.securityId))
    .where(
      and(
        eq(plaidItems.userId, userId),
        eq(financialAccounts.type, 'investment'),
      ),
    )
    .orderBy(desc(holdings.institutionValue));

  return rows.map((r) => {
    const quantity = Number(r.quantity);
    const institutionPrice =
      r.institutionPrice != null ? Number(r.institutionPrice) : null;
    const closePrice = r.closePrice != null ? Number(r.closePrice) : null;
    const dayDelta =
      institutionPrice != null && closePrice != null
        ? quantity * (institutionPrice - closePrice)
        : null;

    return {
      id: r.holdingId,
      ticker: r.ticker,
      securityName: r.securityName,
      securityType: r.securityType,
      quantity,
      costBasis: r.costBasis != null ? Number(r.costBasis) : null,
      institutionPrice,
      institutionValue:
        r.institutionValue != null ? Number(r.institutionValue) : null,
      closePrice,
      dayDelta,
      accountId: r.accountId,
      accountName: r.accountName,
      accountMask: r.accountMask,
    };
  });
}

export type PortfolioSummary = {
  totalValue: number;
  totalCost: number;
  unrealizedGainLoss: number;
  unrealizedGainLossPct: number | null;
  /** Sum of per-holding day deltas; null when no holding has a usable close price. */
  dayDelta: number | null;
  dayDeltaPct: number | null;
  costedHoldingsCount: number;
  accountCount: number;
};

/**
 * One-call portfolio summary for the operator grid. Aggregates from
 * the flat holdings list — single source of truth, same numbers the
 * holdings table renders. Month-Δ and YTD-Δ deltas are deferred until
 * a snapshot table exists; this phase ships total / day Δ / unrealized
 * gain in three cells.
 */
export async function getPortfolioSummary(
  userId: string,
): Promise<PortfolioSummary> {
  const [accountRows, flat] = await Promise.all([
    db
      .select({ id: financialAccounts.id })
      .from(financialAccounts)
      .innerJoin(plaidItems, eq(plaidItems.id, financialAccounts.itemId))
      .where(
        and(
          eq(plaidItems.userId, userId),
          eq(financialAccounts.type, 'investment'),
        ),
      ),
    getHoldingsFlat(userId),
  ]);

  let totalValue = 0;
  let totalCost = 0;
  let unrealizedGainLoss = 0;
  let costedHoldingsCount = 0;
  let dayDeltaSum = 0;
  let dayPriorValueSum = 0;
  let anyDayDelta = false;

  for (const h of flat) {
    if (h.institutionValue != null) totalValue += h.institutionValue;
    if (h.costBasis != null && h.institutionValue != null) {
      totalCost += h.costBasis;
      unrealizedGainLoss += h.institutionValue - h.costBasis;
      costedHoldingsCount++;
    }
    if (h.dayDelta != null && h.closePrice != null) {
      dayDeltaSum += h.dayDelta;
      dayPriorValueSum += h.quantity * h.closePrice;
      anyDayDelta = true;
    }
  }

  return {
    totalValue,
    totalCost,
    unrealizedGainLoss,
    unrealizedGainLossPct:
      totalCost > 0 ? unrealizedGainLoss / totalCost : null,
    dayDelta: anyDayDelta ? dayDeltaSum : null,
    dayDeltaPct:
      anyDayDelta && dayPriorValueSum > 0
        ? dayDeltaSum / dayPriorValueSum
        : null,
    costedHoldingsCount,
    accountCount: accountRows.length,
  };
}

export type RecentInvestmentTxn = {
  id: string;
  date: string;
  type: string | null;
  subtype: string | null;
  name: string | null;
  ticker: string | null;
  securityName: string | null;
  quantity: number | null;
  price: number | null;
  amount: number;
  fees: number | null;
  accountName: string;
  accountMask: string | null;
};

/**
 * Recent buys / sells / dividends / fees for the secondary table on
 * /investments. Mirrors the shape the operator transactions table
 * uses so the dashboard's recent-activity card pattern stays
 * consistent across surfaces.
 */
export async function getRecentInvestmentTransactions(
  userId: string,
  limit = 20,
): Promise<RecentInvestmentTxn[]> {
  const rows = await db
    .select({
      id: investmentTransactions.id,
      date: investmentTransactions.date,
      type: investmentTransactions.type,
      subtype: investmentTransactions.subtype,
      name: investmentTransactions.name,
      quantity: investmentTransactions.quantity,
      price: investmentTransactions.price,
      amount: investmentTransactions.amount,
      fees: investmentTransactions.fees,
      ticker: securities.ticker,
      securityName: securities.name,
      accountName: financialAccounts.name,
      accountMask: financialAccounts.mask,
    })
    .from(investmentTransactions)
    .innerJoin(
      financialAccounts,
      eq(financialAccounts.id, investmentTransactions.accountId),
    )
    .innerJoin(plaidItems, eq(plaidItems.id, financialAccounts.itemId))
    .leftJoin(
      securities,
      eq(securities.id, investmentTransactions.securityId),
    )
    .where(eq(plaidItems.userId, userId))
    .orderBy(desc(investmentTransactions.date), desc(investmentTransactions.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    ...r,
    amount: Number(r.amount),
    quantity: r.quantity != null ? Number(r.quantity) : null,
    price: r.price != null ? Number(r.price) : null,
    fees: r.fees != null ? Number(r.fees) : null,
  }));
}
