import { and, eq, type SQL } from 'drizzle-orm';
import { externalItems } from '@/lib/db/schema';

export type SourceScope = 'active' | 'all';

/**
 * Central source visibility policy.
 *
 * Product/data reads should use `active` so disconnected or broken
 * institutions don't keep contributing balances, transactions, or goal
 * progress. Management surfaces such as Settings health use `all` so the
 * user can still see and repair non-active connections.
 */
export function sourceScopeWhere(
  userId: string,
  scope: SourceScope = 'active',
): SQL {
  const owned = eq(externalItems.userId, userId);
  return scope === 'all'
    ? owned
    : and(owned, eq(externalItems.status, 'active'))!;
}
