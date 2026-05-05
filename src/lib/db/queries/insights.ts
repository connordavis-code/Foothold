import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { type Insight, insights } from '@/lib/db/schema';

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
