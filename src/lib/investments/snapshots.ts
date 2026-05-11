import { db } from '@/lib/db';
import { portfolioSnapshots } from '@/lib/db/schema';
import { getPortfolioSummary } from '@/lib/db/queries/investments';

function todayIsoUtc(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Write a daily portfolio snapshot for the user. Idempotent: multiple
 * calls on the same day upsert via ON CONFLICT (user_id, snapshot_date)
 * — latest write wins. No-op for users with no investment accounts.
 *
 * Called from the sync dispatcher's success path after a successful
 * syncExternalItem. Failures should be caught at the call site so they
 * don't fail the sync; they get logged to error_log under
 * 'portfolio.snapshot'.
 */
export async function recordPortfolioSnapshot(userId: string): Promise<void> {
  const summary = await getPortfolioSummary(userId);
  if (summary.accountCount === 0) return;

  const snapshotDate = todayIsoUtc();
  await db
    .insert(portfolioSnapshots)
    .values({
      userId,
      snapshotDate,
      totalValue: String(summary.totalValue),
      totalCostBasis: String(summary.totalCost),
    })
    .onConflictDoUpdate({
      target: [portfolioSnapshots.userId, portfolioSnapshots.snapshotDate],
      set: {
        totalValue: String(summary.totalValue),
        totalCostBasis: String(summary.totalCost),
      },
    });
}
