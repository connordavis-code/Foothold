import { eq } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { isAuthorizedCronRequest } from '@/lib/cron/auth';
import { db } from '@/lib/db';
import { getForecastHistory } from '@/lib/db/queries/forecast';
import { externalItems, forecastSnapshots } from '@/lib/db/schema';
import { projectCash } from '@/lib/forecast/engine';
import { deriveSnapshotKeys } from '@/lib/forecast/snapshot';
import { logError, logRun } from '@/lib/logger';

// projectCash is pure but getForecastHistory uses postgres-js, which
// crashes the edge runtime — so node it is.
export const runtime = 'nodejs';
// Per-user work is fast (~hundreds of ms), but at N users serially
// the budget grows. 60s leaves headroom for a slow DB cold-start
// without changing strategy.
export const maxDuration = 60;

/**
 * Daily baseline-forecast snapshot cron. Schedule: 11:00 UTC daily
 * (after sync at 10:00 UTC, before digest at 14:00 UTC).
 *
 * For each user with at least one active external_item, computes the
 * BASELINE projection (no overrides) and upserts a snapshot row keyed
 * on (userId, snapshotDate). Idempotent — a manual same-day re-run
 * overwrites cleanly.
 *
 * Two consumers:
 *   1. Backtest accuracy module (PR 5) — calendar-gated, lights up
 *      ~30 days after this cron starts running.
 *   2. Dashboard trajectory line (Phase 1.5) — 90-days-back historical
 *      net-worth shape from `baselineProjection[0].endCash` per row.
 *
 * Per-user error isolation: one user's failure (corrupt history, DB
 * blip) does not abort the run; we logError and continue. The final
 * logRun summary surfaces the counts to the daily digest.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return new NextResponse('unauthorized', { status: 401 });
  }

  const startedAt = Date.now();
  const { currentMonth, snapshotDate } = deriveSnapshotKeys(new Date());
  const userIds = await getActiveUserIds();
  let snapshotted = 0;
  let failed = 0;

  for (const userId of userIds) {
    try {
      const history = await getForecastHistory(userId);
      const result = projectCash({ history, overrides: {}, currentMonth });
      await db
        .insert(forecastSnapshots)
        .values({
          userId,
          snapshotDate,
          baselineProjection: result.projection,
        })
        .onConflictDoUpdate({
          target: [forecastSnapshots.userId, forecastSnapshots.snapshotDate],
          set: {
            baselineProjection: result.projection,
            generatedAt: new Date(),
          },
        });
      snapshotted++;
    } catch (err) {
      failed++;
      await logError('cron.forecast_snapshot.failed', err, { userId });
    }
  }

  await logRun(
    'cron.forecast_snapshot',
    `${snapshotted} snapshotted, ${failed} failed`,
    {
      duration_ms: Date.now() - startedAt,
      users: userIds.length,
      snapshotted,
      failed,
      snapshotDate,
    },
  );

  return NextResponse.json({ snapshotted, failed, snapshotDate });
}

/** Users with at least one active external_item. Anyone else has no
 *  history to project from. Mirrors the insight cron's filter. */
async function getActiveUserIds(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ userId: externalItems.userId })
    .from(externalItems)
    .where(eq(externalItems.status, 'active'));
  return rows.map((r) => r.userId);
}
