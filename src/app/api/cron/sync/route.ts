import { eq } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { isAuthorizedCronRequest } from '@/lib/cron/auth';
import { db } from '@/lib/db';
import { externalItems } from '@/lib/db/schema';
import { logError, logRun } from '@/lib/logger';
import { syncItem } from '@/lib/plaid/sync';

export const runtime = 'nodejs';
// A fresh syncItem with full backfill can take 30s+. Pro permits up
// to 300s for cron handlers; size for sequential N items.
export const maxDuration = 300;

/**
 * Nightly safety-net sync. Schedule: 10:00 UTC (2am PT).
 *
 * Loops every active plaid_item and runs syncItem. The webhook handler
 * already keeps transactions current in real-time; this catches missed
 * webhook deliveries AND refreshes investments + recurring streams,
 * which Plaid doesn't send dependable webhooks for.
 *
 * Sequential rather than parallel: 1-3 items today, predictable timing,
 * no Plaid rate-limit risk. Switch to bounded parallelism if N > 5.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return new NextResponse('unauthorized', { status: 401 });
  }

  const startedAt = Date.now();
  const items = await db
    .select({ id: externalItems.id })
    .from(externalItems)
    .where(eq(externalItems.status, 'active'));

  let synced = 0;
  let failed = 0;

  for (const { id } of items) {
    try {
      const summary = await syncItem(id);
      synced++;
      await logRun(
        'cron.nightly_sync.item',
        `txns +${summary.transactions.added} ~${summary.transactions.modified} -${summary.transactions.removed}`,
        { externalItemId: id, summary },
      );
    } catch (err) {
      failed++;
      await logError('cron.nightly_sync.item', err, { externalItemId: id });
    }
  }

  await logRun(
    'cron.nightly_sync',
    `${synced} synced, ${failed} failed`,
    {
      duration_ms: Date.now() - startedAt,
      items_total: items.length,
      synced,
      failed,
    },
  );

  return NextResponse.json({ synced, failed });
}
