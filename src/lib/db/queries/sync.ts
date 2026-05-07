import { eq, max, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { externalItems } from '@/lib/db/schema';

export type SyncStatus = {
  lastSyncedAt: Date | null;
  itemCount: number;
  reauthCount: number;
};

/**
 * Aggregate sync state for the top-bar pill: most recent sync across all
 * Plaid items, plus a count of items not in `active` status (drives the
 * amber "Reconnect" variant). One round-trip rather than one per item.
 */
export async function getSyncStatus(userId: string): Promise<SyncStatus> {
  const [row] = await db
    .select({
      lastSyncedAt: max(externalItems.lastSyncedAt),
      itemCount: sql<number>`count(*)::int`,
      reauthCount: sql<number>`count(*) filter (where ${externalItems.status} != 'active')::int`,
    })
    .from(externalItems)
    .where(eq(externalItems.userId, userId));

  return {
    lastSyncedAt: row?.lastSyncedAt ?? null,
    itemCount: row?.itemCount ?? 0,
    reauthCount: row?.reauthCount ?? 0,
  };
}
