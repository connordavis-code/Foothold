import { and, eq, ne } from 'drizzle-orm';
import { db } from '@/lib/db';
import { externalItems } from '@/lib/db/schema';

/**
 * Items whose external connection is anything other than 'active' — the
 * banner + settings page surface these for reauth.
 */
export async function getItemsNeedingReauth(userId: string) {
  return db
    .select({
      id: externalItems.id,
      institutionName: externalItems.institutionName,
      status: externalItems.status,
    })
    .from(externalItems)
    .where(
      and(eq(externalItems.userId, userId), ne(externalItems.status, 'active')),
    );
}
