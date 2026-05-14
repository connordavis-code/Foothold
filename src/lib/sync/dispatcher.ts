import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { externalItems } from '@/lib/db/schema';
import { logError, logRun } from '@/lib/logger';
import { syncItem as syncPlaidItem } from '@/lib/plaid/sync';
import { syncSnaptradeItem } from '@/lib/snaptrade/sync';
import { applyTransferHeuristics } from '@/lib/transactions/apply-transfer-heuristics';

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

  // Phase 1c: heuristic transfer-override backfill. Runs at the user
  // level (not the item level) because mirror-image detection needs
  // cross-provider visibility — an outflow from Plaid checking matched
  // against an inflow into a SnapTrade brokerage is the prototypical
  // case. Fail-soft: provider sync succeeded; heuristic failure is
  // logged but doesn't poison the dispatch result.
  try {
    const { mirrorPairs, merchantMatches, details } =
      await applyTransferHeuristics(row.userId);
    if (mirrorPairs > 0 || merchantMatches > 0) {
      // Per-match details land in context.details — the smoke-test
      // surface for Phase 1c. Inspect with:
      //   SELECT context FROM error_log
      //   WHERE op = 'sync.heuristics.transfer-override'
      //   ORDER BY occurred_at DESC LIMIT 1;
      await logRun(
        'sync.heuristics.transfer-override',
        `Auto-classified ${mirrorPairs * 2 + merchantMatches} transfer(s)`,
        {
          userId: row.userId,
          externalItemId,
          mirrorPairs,
          merchantMatches,
          details,
        },
      );
    }
  } catch (heuristicErr) {
    await logError('sync.heuristics.transfer-override', heuristicErr, {
      userId: row.userId,
      externalItemId,
    });
  }

  return result;
}

