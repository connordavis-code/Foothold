import { and, desc, eq, gte, lte, notInArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  externalItems,
  financialAccounts,
  type Insight,
  insights,
  transactions,
} from '@/lib/db/schema';

/** Latest insight for a specific week, or null if none generated yet. */
export async function getInsightForWeek(
  userId: string,
  weekStart: string,
): Promise<Insight | null> {
  const [row] = await db
    .select()
    .from(insights)
    .where(and(eq(insights.userId, userId), eq(insights.weekStart, weekStart)));
  return row ?? null;
}

/** Most recent insight for the user across all weeks. */
export async function getLatestInsight(
  userId: string,
): Promise<Insight | null> {
  const [row] = await db
    .select()
    .from(insights)
    .where(eq(insights.userId, userId))
    .orderBy(desc(insights.weekStart))
    .limit(1);
  return row ?? null;
}

export type ArchiveEntry = {
  weekStart: string;
  weekEnd: string;
  generatedAt: Date;
  narrativePreview: string;
};

/**
 * Most recent insight rows for the earlier-weeks footer on /insights.
 * Returns up to `limit` rows ordered newest-first. Narrative is
 * truncated in SQL to 400 chars — enough for firstSentence() to
 * extract a one-line preview without pulling full bodies.
 */
export async function getInsightsForArchive(
  userId: string,
  limit: number = 6,
): Promise<ArchiveEntry[]> {
  const rows = await db
    .select({
      weekStart: insights.weekStart,
      weekEnd: insights.weekEnd,
      generatedAt: insights.generatedAt,
      narrativePreview: sql<string>`SUBSTRING(${insights.narrative} FROM 1 FOR 400)`,
    })
    .from(insights)
    .where(eq(insights.userId, userId))
    .orderBy(desc(insights.weekStart))
    .limit(limit);

  return rows;
}

export type WeeklyBriefStats = {
  spendCents: number;
  incomeCents: number;
  netCents: number;
};

/**
 * Spend / income / net totals across [weekStart, weekEnd] for the brief
 * stats grid. Same exclusion list as getDashboardSummary (TRANSFER_IN /
 * TRANSFER_OUT / LOAN_PAYMENTS) so numbers agree with the rest of the
 * dashboard. Plaid sign: positive amount = money out, negative = money in.
 */
export async function getWeeklyBriefStats(
  userId: string,
  weekStart: string,
  weekEnd: string,
): Promise<WeeklyBriefStats> {
  const [row] = await db
    .select({
      spend: sql<string>`COALESCE(SUM(CASE WHEN ${transactions.amount}::numeric > 0 THEN ${transactions.amount}::numeric ELSE 0 END), 0)`,
      income: sql<string>`COALESCE(SUM(CASE WHEN ${transactions.amount}::numeric < 0 THEN -${transactions.amount}::numeric ELSE 0 END), 0)`,
    })
    .from(transactions)
    .innerJoin(
      financialAccounts,
      eq(financialAccounts.id, transactions.accountId),
    )
    .innerJoin(externalItems, eq(externalItems.id, financialAccounts.itemId))
    .where(
      and(
        eq(externalItems.userId, userId),
        gte(transactions.date, weekStart),
        lte(transactions.date, weekEnd),
        notInArray(financialAccounts.type, ['investment']),
        sql`COALESCE(${transactions.primaryCategory}, '') NOT IN ('TRANSFER_IN', 'TRANSFER_OUT', 'LOAN_PAYMENTS')`,
      ),
    );

  const spendCents = Math.round(Number(row?.spend ?? 0) * 100);
  const incomeCents = Math.round(Number(row?.income ?? 0) * 100);
  return {
    spendCents,
    incomeCents,
    netCents: incomeCents - spendCents,
  };
}

/**
 * 1-indexed sequence number for "№ N" eyebrow on the weekly brief card.
 * Counts insights with week_start ≤ the supplied week.
 */
export async function getInsightSequenceNumber(
  userId: string,
  weekStart: string,
): Promise<number> {
  const [row] = await db
    .select({ count: sql<string>`COUNT(*)` })
    .from(insights)
    .where(and(eq(insights.userId, userId), lte(insights.weekStart, weekStart)));
  return Number(row?.count ?? 0);
}
