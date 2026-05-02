import { and, eq, ne } from 'drizzle-orm';
import { db } from '@/lib/db';
import { plaidItems } from '@/lib/db/schema';

/**
 * Items whose Plaid connection is anything other than 'active' — the
 * banner + settings page surface these for reauth.
 */
export async function getItemsNeedingReauth(userId: string) {
  return db
    .select({
      id: plaidItems.id,
      institutionName: plaidItems.institutionName,
      status: plaidItems.status,
    })
    .from(plaidItems)
    .where(
      and(eq(plaidItems.userId, userId), ne(plaidItems.status, 'active')),
    );
}
