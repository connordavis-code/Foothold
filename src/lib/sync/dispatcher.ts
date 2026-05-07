import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { externalItems } from '@/lib/db/schema';
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
 * Return shape is a discriminated union so callers can handle each
 * provider's summary appropriately. Cron and the /settings "Sync now"
 * button use this; the Plaid-Link-update-mode reconnect flow stays
 * Plaid-specific (markItemReconnected calls syncPlaidItem directly).
 */
export async function syncExternalItem(
  externalItemId: string,
): Promise<SyncDispatchResult> {
  const [row] = await db
    .select({ provider: externalItems.provider })
    .from(externalItems)
    .where(eq(externalItems.id, externalItemId));
  if (!row) {
    throw new Error(`external_item ${externalItemId} not found`);
  }

  switch (row.provider) {
    case 'plaid': {
      const summary = await syncPlaidItem(externalItemId);
      return { provider: 'plaid', summary };
    }
    case 'snaptrade': {
      const summary = await syncSnaptradeItem(externalItemId);
      return { provider: 'snaptrade', summary };
    }
    default:
      throw new Error(
        `external_item ${externalItemId} has unknown provider=${row.provider}`,
      );
  }
}

