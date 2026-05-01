import { and, desc, eq } from 'drizzle-orm';
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
