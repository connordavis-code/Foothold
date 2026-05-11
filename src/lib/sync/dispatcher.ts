import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { externalItems } from '@/lib/db/schema';
import { recordPortfolioSnapshot } from '@/lib/investments/snapshots';
import { logError } from '@/lib/logger';
import { syncItem as syncPlaidItem } from '@/lib/plaid/sync';
import { syncSnaptradeItem } from '@/lib/snaptrade/sync';

export type SyncDispatchResult =
  | { provider: 'plaid'; summary: Awaited<ReturnType<typeof syncPlaidItem>> }
  | {
      provider: 'snaptrade';
      summary: Awaited<ReturnType<typeof syncSnaptradeItem>>;
    };

/**
 * Provider-aware sync entry point. Routes to the correct
 * provider-specific orchestrator based on the `provider` discriminator
 * on external_item.
 *
 * After a successful per-provider sync, attempts a best-effort
 * portfolio snapshot write. Snapshot failures don't fail the sync;
 * they're logged to error_log under 'portfolio.snapshot' and surfaced
 * in the daily digest.
 *
 * Return shape is a discriminated union so callers can handle each
 * provider's summary appropriately. Cron and the /settings "Sync now"
 * button use this; the Plaid-Link-update-mode reconnect flow stays
 * Plaid-specific (markItemReconnected calls syncPlaidItem directly).
 */
export async function syncExternalItem(
  externalItemId: string,
): Promise<SyncDispatchResult> {
  const [row] = await db
    .select({
      provider: externalItems.provider,
      userId: externalItems.userId,
    })
    .from(externalItems)
    .where(eq(externalItems.id, externalItemId));
  if (!row) {
    throw new Error(`external_item ${externalItemId} not found`);
  }

  // Wrap the per-provider sync in a try/log/rethrow so SyncButton-
  // triggered failures land in error_log alongside cron failures.
  // Server actions in production wrap thrown errors in a generic
  // "An error occurred in the Server Components render" message that
  // strips the actual cause — without this we'd be flying blind.
  let result: SyncDispatchResult;
  try {
    switch (row.provider) {
      case 'plaid': {
        const summary = await syncPlaidItem(externalItemId);
        result = { provider: 'plaid', summary };
        break;
      }
      case 'snaptrade': {
        const summary = await syncSnaptradeItem(externalItemId);
        result = { provider: 'snaptrade', summary };
        break;
      }
      default:
        throw new Error(
          `external_item ${externalItemId} has unknown provider=${row.provider}`,
        );
    }
  } catch (err) {
    await logError('sync.dispatcher', err, {
      externalItemId,
      provider: row.provider,
    });
    throw err;
  }

  // Best-effort portfolio snapshot. Sync succeeded — try to capture a
  // daily totals row. Failures don't propagate; they're surfaced via
  // error_log + daily digest. recordPortfolioSnapshot itself no-ops
  // for users with no investment accounts.
  try {
    await recordPortfolioSnapshot(row.userId);
  } catch (snapshotErr) {
    await logError('portfolio.snapshot', snapshotErr, { userId: row.userId });
  }

  return result;
}
