import { eq } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { isAuthorizedCronRequest } from '@/lib/cron/auth';
import { decryptToken } from '@/lib/crypto';
import { db } from '@/lib/db';
import { financialAccounts, plaidItems } from '@/lib/db/schema';
import { logError, logRun } from '@/lib/logger';
import { plaid } from '@/lib/plaid/client';

export const runtime = 'nodejs';
export const maxDuration = 60;

const num = (n: number | null | undefined): string | null =>
  n == null ? null : String(n);

/**
 * Intraday balance refresh. Schedule: every 6h (00/06/12/18 UTC).
 *
 * Calls Plaid `accounts/balance/get` (live read — may hit the bank
 * directly) instead of the cached `accounts/get` used by syncItem.
 * The whole point is intraday freshness, so paying the extra Plaid
 * quota is intentional.
 *
 * Does NOT touch plaid_item.last_synced_at — that signal is reserved
 * for full syncs, and polluting it would break the "when did we last
 * see new transactions?" semantics elsewhere.
 *
 * New-account silently no-ops: balance/get may surface accounts we
 * haven't seen yet, but the WHERE matches by plaidAccountId so unknown
 * ones don't update anything. The nightly cron picks them up.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return new NextResponse('unauthorized', { status: 401 });
  }

  const startedAt = Date.now();
  const items = await db
    .select({ id: plaidItems.id, accessToken: plaidItems.accessToken })
    .from(plaidItems)
    .where(eq(plaidItems.status, 'active'));

  let refreshed = 0;
  let failed = 0;
  let accountsTouched = 0;

  for (const item of items) {
    try {
      const accessToken = decryptToken(item.accessToken);
      const res = await plaid.accountsBalanceGet({ access_token: accessToken });

      for (const a of res.data.accounts) {
        const updated = await db
          .update(financialAccounts)
          .set({
            currentBalance: num(a.balances.current),
            availableBalance: num(a.balances.available),
            updatedAt: new Date(),
          })
          .where(eq(financialAccounts.plaidAccountId, a.account_id))
          .returning({ id: financialAccounts.id });
        accountsTouched += updated.length;
      }
      refreshed++;
    } catch (err) {
      failed++;
      await logError('cron.balance_refresh.item', err, {
        plaidItemId: item.id,
      });
    }
  }

  await logRun(
    'cron.balance_refresh',
    `${refreshed} items, ${accountsTouched} accounts, ${failed} failed`,
    {
      duration_ms: Date.now() - startedAt,
      items_total: items.length,
      refreshed,
      accountsTouched,
      failed,
    },
  );

  return NextResponse.json({ refreshed, accountsTouched, failed });
}
