import { createHash } from 'node:crypto';
import { count, eq, max } from 'drizzle-orm';
import { db } from '@/lib/db';
import { financialAccounts, externalItems, transactions } from '@/lib/db/schema';
import type { ScenarioOverrides } from './types';

/**
 * Inputs that capture "world state" for LLM cache invalidation:
 * - todayUtc: calendar day boundary; narrative must re-generate each day
 * - transactionCount: detects new transactions synced since last generation
 * - latestTransactionDate: catches date-only changes (e.g. delayed posting)
 * - latestSyncDate: invalidates when Plaid re-syncs even if tx count is same
 */
export type HistoryFingerprintInputs = {
  todayUtc: string;
  transactionCount: number;
  latestTransactionDate: string | null;
  latestSyncDate: string | null;
};

export function computeHistoryFingerprint(
  inputs: HistoryFingerprintInputs,
): string {
  return [
    inputs.todayUtc,
    `tx:${inputs.transactionCount}`,
    `latest:${inputs.latestTransactionDate ?? 'none'}`,
    `sync:${inputs.latestSyncDate ?? 'none'}`,
  ].join('|');
}

export function buildInputHash(
  overrides: ScenarioOverrides,
  fingerprint: string,
): string {
  return createHash('sha256')
    .update(JSON.stringify(overrides))
    .update('|')
    .update(fingerprint)
    .digest('hex');
}

export async function fetchFingerprintInputs(
  userId: string,
): Promise<HistoryFingerprintInputs> {
  const now = new Date();
  const todayUtc = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;

  const [txStats] = await db
    .select({
      count: count(transactions.id),
      latestDate: max(transactions.date),
    })
    .from(transactions)
    .innerJoin(financialAccounts, eq(financialAccounts.id, transactions.accountId))
    .innerJoin(externalItems, eq(externalItems.id, financialAccounts.itemId))
    .where(eq(externalItems.userId, userId));

  const [syncStats] = await db
    .select({ latestSync: max(externalItems.lastSyncedAt) })
    .from(externalItems)
    .where(eq(externalItems.userId, userId));

  const latestSyncDate = syncStats?.latestSync
    ? new Date(syncStats.latestSync).toISOString().slice(0, 10)
    : null;

  return {
    todayUtc,
    transactionCount: Number(txStats?.count ?? 0),
    latestTransactionDate: txStats?.latestDate
      ? String(txStats.latestDate).slice(0, 10)
      : null,
    latestSyncDate,
  };
}
