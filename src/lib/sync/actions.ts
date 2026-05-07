'use server';

import { and, eq } from 'drizzle-orm';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { externalItems } from '@/lib/db/schema';
import { disconnectItemAction as disconnectPlaidItemAction } from '@/lib/plaid/actions';
import { disconnectSnaptradeItemAction } from '@/lib/snaptrade/actions';

/**
 * Provider-aware disconnect entry point. Both Plaid + SnapTrade
 * disconnect actions verify ownership and run their own best-effort
 * revoke; this wrapper just routes by provider after a single lookup.
 *
 * Lives in src/lib/sync/ rather than alongside the dispatcher because
 * 'use server' modules can only export server actions — dispatcher.ts
 * exports plain functions used inside other server actions and would
 * fail Next 14's RSC contract if marked 'use server'.
 */
export async function disconnectExternalItemAction(
  externalItemId: string,
): Promise<{ ok: true }> {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Unauthorized');

  const [row] = await db
    .select({ provider: externalItems.provider })
    .from(externalItems)
    .where(
      and(
        eq(externalItems.id, externalItemId),
        eq(externalItems.userId, session.user.id),
      ),
    );
  if (!row) throw new Error('Item not found');

  switch (row.provider) {
    case 'plaid':
      return disconnectPlaidItemAction(externalItemId);
    case 'snaptrade':
      return disconnectSnaptradeItemAction(externalItemId);
    default:
      throw new Error(
        `external_item ${externalItemId} has unknown provider=${row.provider}`,
      );
  }
}
