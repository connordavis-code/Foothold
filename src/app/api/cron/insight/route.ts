import { and, count, desc, eq, gt } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { isAuthorizedCronRequest } from '@/lib/cron/auth';
import { db } from '@/lib/db';
import {
  financialAccounts,
  insights,
  externalItems,
  transactions,
} from '@/lib/db/schema';
import { generateInsightForUser } from '@/lib/insights/generate';
import { logError, logRun } from '@/lib/logger';

// AI calls + DB writes — must run on Node (postgres-js + Anthropic SDK
// both use APIs the edge runtime doesn't support).
export const runtime = 'nodejs';
// Default Vercel function timeout is 10s; an Anthropic generation can
// take 20-40s. Pro plan permits up to 300s for cron handlers.
export const maxDuration = 60;

/**
 * Weekly insight cron. Schedule: Monday 04:00 UTC (Sunday 9pm PT).
 *
 * For each user with an active plaid_item, smart-skip if no transactions
 * have landed in our DB since the last insight; otherwise generate.
 * Every outcome (skip / generate / error) writes one error_log row so
 * the daily digest can confirm the cron actually ran.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return new NextResponse('unauthorized', { status: 401 });
  }

  const startedAt = Date.now();
  const userIds = await getActiveUserIds();
  let generated = 0;
  let skipped = 0;
  let failed = 0;

  for (const userId of userIds) {
    try {
      if (!(await hasNewActivity(userId))) {
        skipped++;
        await logRun('cron.insight.skipped', 'no new transactions', { userId });
        continue;
      }
      await generateInsightForUser(userId);
      generated++;
    } catch (err) {
      // hasNewActivity gates on transactions.createdAt (when we inserted)
      // but collectSnapshot filters on transactions.date (when the txn
      // happened). A backfill of historical rows trips the gate but
      // produces an empty current week — surface that as a skip, not a
      // false-positive failure that poisons the digest.
      if (
        err instanceof Error &&
        err.message === 'Not enough data this week to summarize'
      ) {
        skipped++;
        await logRun('cron.insight.skipped', 'no current-week data', {
          userId,
        });
      } else {
        failed++;
        await logError('cron.insight.failed', err, { userId });
      }
    }
  }

  await logRun(
    'cron.insight',
    `${generated} generated, ${skipped} skipped, ${failed} failed`,
    {
      duration_ms: Date.now() - startedAt,
      users: userIds.length,
      generated,
      skipped,
      failed,
    },
  );

  return NextResponse.json({ generated, skipped, failed });
}

/** Users with at least one active plaid_item. Anyone else has nothing
 * to insight on. */
async function getActiveUserIds(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ userId: externalItems.userId })
    .from(externalItems)
    .where(eq(externalItems.status, 'active'));
  return rows.map((r) => r.userId);
}

/**
 * Smart-skip predicate: true iff at least one transaction has been
 * INSERTED into our DB since the user's last insight ran. We anchor on
 * `insight.generatedAt` (not `weekStart`) because re-runs within the
 * same week should still re-evaluate newness against the most recent
 * generation timestamp.
 *
 * If the user has no prior insight, return true — first-ever run for
 * a user always generates.
 */
async function hasNewActivity(userId: string): Promise<boolean> {
  const [latest] = await db
    .select({ generatedAt: insights.generatedAt })
    .from(insights)
    .where(eq(insights.userId, userId))
    .orderBy(desc(insights.generatedAt))
    .limit(1);

  if (!latest) return true;

  const [{ c }] = await db
    .select({ c: count() })
    .from(transactions)
    .innerJoin(
      financialAccounts,
      eq(transactions.accountId, financialAccounts.id),
    )
    .innerJoin(externalItems, eq(financialAccounts.itemId, externalItems.id))
    .where(
      and(
        eq(externalItems.userId, userId),
        gt(transactions.createdAt, latest.generatedAt),
      ),
    );

  return c > 0;
}
