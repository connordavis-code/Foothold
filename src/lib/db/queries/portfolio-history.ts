import { and, desc, eq, gte } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  externalItems,
  financialAccounts,
  holdings,
  investmentTransactions,
  portfolioSnapshots,
  securities,
} from '@/lib/db/schema';
import {
  walkbackPortfolio,
  type WalkbackPoint,
  type WalkbackTxn,
} from '@/lib/investments/walkback';

export type RangeKey = '1D' | '1M' | '3M' | '6M' | '1Y' | '5Y';

export type ChartPoint = {
  date: string;
  value: number;
  estimated: boolean;
};

export type RangeData = {
  points: ChartPoint[];
  seamDate: string | null;
  startValue: number | null;
  endValue: number | null;
  delta: number | null;
  deltaPct: number | null;
};

export type PortfolioHistory = {
  byRange: Record<RangeKey, RangeData>;
  hasAnyData: boolean;
};

const DAYS_BACK_BY_RANGE: Record<RangeKey, number> = {
  '1D': 1,
  '1M': 30,
  '3M': 90,
  '6M': 180,
  '1Y': 365,
  '5Y': 1825,
};

function toIsoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfUtcDay(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}

/**
 * Portfolio trajectory across 6 ranges. Merges real snapshot rows
 * (solid line in the chart) with walkback estimates (dashed line)
 * for dates earlier than the user's first snapshot. The seam date
 * is the earliest snapshot date in the range.
 *
 * 1D is special-cased: only 2 points — yesterday's close (computed
 * from securities.closePrice × current holdings.quantity) and today
 * (current institutionValue). The 1D range doesn't use the walkback
 * path; it reads directly from the holdings + securities join.
 */
export async function getPortfolioHistory(
  userId: string,
): Promise<PortfolioHistory> {
  const today = startOfUtcDay(new Date());
  const horizonStart = new Date(
    today.getTime() - DAYS_BACK_BY_RANGE['5Y'] * 86_400_000,
  );

  const [snapshotRows, txnRows, holdingRows] = await Promise.all([
    db
      .select({
        snapshotDate: portfolioSnapshots.snapshotDate,
        totalValue: portfolioSnapshots.totalValue,
      })
      .from(portfolioSnapshots)
      .where(
        and(
          eq(portfolioSnapshots.userId, userId),
          gte(portfolioSnapshots.snapshotDate, toIsoDate(horizonStart)),
        ),
      )
      .orderBy(desc(portfolioSnapshots.snapshotDate)),
    db
      .select({
        date: investmentTransactions.date,
        amount: investmentTransactions.amount,
        type: investmentTransactions.type,
      })
      .from(investmentTransactions)
      .innerJoin(
        financialAccounts,
        eq(financialAccounts.id, investmentTransactions.accountId),
      )
      .innerJoin(
        externalItems,
        eq(externalItems.id, financialAccounts.itemId),
      )
      .where(
        and(
          eq(externalItems.userId, userId),
          gte(investmentTransactions.date, toIsoDate(horizonStart)),
        ),
      ),
    db
      .select({
        quantity: holdings.quantity,
        institutionPrice: holdings.institutionPrice,
        institutionValue: holdings.institutionValue,
        closePrice: securities.closePrice,
      })
      .from(holdings)
      .innerJoin(
        financialAccounts,
        eq(financialAccounts.id, holdings.accountId),
      )
      .innerJoin(
        externalItems,
        eq(externalItems.id, financialAccounts.itemId),
      )
      .innerJoin(securities, eq(securities.id, holdings.securityId))
      .where(
        and(
          eq(externalItems.userId, userId),
          eq(financialAccounts.type, 'investment'),
        ),
      ),
  ]);

  // Today's anchor + yesterday's close (used for 1D special-case).
  let currentValue = 0;
  let yesterdayValue = 0;
  let yesterdayKnown = false;
  for (const h of holdingRows) {
    const value = h.institutionValue != null ? Number(h.institutionValue) : 0;
    currentValue += value;
    const close = h.closePrice != null ? Number(h.closePrice) : null;
    const qty = Number(h.quantity);
    if (close != null) {
      yesterdayValue += qty * close;
      yesterdayKnown = true;
    } else {
      // No closePrice → contribute current value (no day-delta signal
      // for this holding, but its value still counts toward yesterday's
      // total so the 1D total isn't artificially small).
      yesterdayValue += value;
    }
  }

  const snapshotIndex = new Map<string, number>();
  for (const s of snapshotRows) {
    snapshotIndex.set(s.snapshotDate, Number(s.totalValue));
  }
  const earliestSnapshotDate =
    snapshotRows.length > 0
      ? snapshotRows[snapshotRows.length - 1].snapshotDate
      : null;

  const walkbackTxns: WalkbackTxn[] = txnRows.map((r) => ({
    date: r.date,
    amount: Number(r.amount),
    type: r.type ?? '',
  }));

  const byRange: Record<RangeKey, RangeData> = {
    '1D': buildOneDayRange(today, currentValue, yesterdayValue, yesterdayKnown),
    '1M': buildRange(
      '1M',
      today,
      currentValue,
      walkbackTxns,
      snapshotIndex,
      earliestSnapshotDate,
    ),
    '3M': buildRange(
      '3M',
      today,
      currentValue,
      walkbackTxns,
      snapshotIndex,
      earliestSnapshotDate,
    ),
    '6M': buildRange(
      '6M',
      today,
      currentValue,
      walkbackTxns,
      snapshotIndex,
      earliestSnapshotDate,
    ),
    '1Y': buildRange(
      '1Y',
      today,
      currentValue,
      walkbackTxns,
      snapshotIndex,
      earliestSnapshotDate,
    ),
    '5Y': buildRange(
      '5Y',
      today,
      currentValue,
      walkbackTxns,
      snapshotIndex,
      earliestSnapshotDate,
    ),
  };

  const hasAnyData =
    currentValue > 0 || snapshotRows.length > 0 || walkbackTxns.length > 0;

  return { byRange, hasAnyData };
}

function buildOneDayRange(
  today: Date,
  currentValue: number,
  yesterdayValue: number,
  yesterdayKnown: boolean,
): RangeData {
  if (!yesterdayKnown || yesterdayValue === 0) {
    return {
      points: [],
      seamDate: null,
      startValue: null,
      endValue: null,
      delta: null,
      deltaPct: null,
    };
  }
  const yesterdayIso = toIsoDate(new Date(today.getTime() - 86_400_000));
  const todayIso = toIsoDate(today);
  const points: ChartPoint[] = [
    { date: yesterdayIso, value: yesterdayValue, estimated: false },
    { date: todayIso, value: currentValue, estimated: false },
  ];
  const delta = currentValue - yesterdayValue;
  return {
    points,
    seamDate: null,
    startValue: yesterdayValue,
    endValue: currentValue,
    delta,
    deltaPct: yesterdayValue !== 0 ? (delta / yesterdayValue) * 100 : null,
  };
}

function buildRange(
  range: RangeKey,
  today: Date,
  currentValue: number,
  walkbackTxns: WalkbackTxn[],
  snapshotIndex: Map<string, number>,
  earliestSnapshotDate: string | null,
): RangeData {
  const daysBack = DAYS_BACK_BY_RANGE[range];
  const walkbackPoints: WalkbackPoint[] = walkbackPortfolio(
    currentValue,
    walkbackTxns,
    daysBack,
    today,
  );

  // Replace walkback values with real snapshot values where available;
  // flip estimated→false for those dates.
  const merged: ChartPoint[] = walkbackPoints.map((p) => {
    const snapshot = snapshotIndex.get(p.date);
    if (snapshot != null) {
      return { date: p.date, value: snapshot, estimated: false };
    }
    return { date: p.date, value: p.value, estimated: true };
  });

  if (merged.length === 0) {
    return {
      points: [],
      seamDate: null,
      startValue: null,
      endValue: null,
      delta: null,
      deltaPct: null,
    };
  }

  const rangeStartDate = merged[0].date;
  const seamDate =
    earliestSnapshotDate != null && earliestSnapshotDate >= rangeStartDate
      ? earliestSnapshotDate
      : null;

  const startValue = merged[0].value;
  const endValue = merged[merged.length - 1].value;
  const delta = endValue - startValue;

  return {
    points: merged,
    seamDate,
    startValue,
    endValue,
    delta,
    deltaPct: startValue !== 0 ? (delta / startValue) * 100 : null,
  };
}
