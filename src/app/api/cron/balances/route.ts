import { and, eq } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { isAuthorizedCronRequest } from '@/lib/cron/auth';
import { decryptToken } from '@/lib/crypto';
import { db } from '@/lib/db';
import { financialAccounts, externalItems } from '@/lib/db/schema';
import { logError, logRun } from '@/lib/logger';
import {
  buildBalanceUpdate,
  selectRefreshableAccounts,
} from '@/lib/plaid/balance-refresh';
import { plaid } from '@/lib/plaid/client';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Intraday balance refresh. Schedule: every 6h (00/06/12/18 UTC).
 *
 * Calls Plaid `accounts/get` (cached — Plaid returns the balance from
 * its last bank fetch, which Plaid refreshes opportunistically). NOT
 * `accounts/balance/get`: that endpoint is gated on the `balance`
 * product, which the Plaid app is not authorized for in production
 * (returns INVALID_PRODUCT). Enabling `balance` requires Dashboard
 * approval + adding it to PLAID_PRODUCTS + reconnecting existing items
 * via Link update mode — see CLAUDE.md > Lessons learned for the full
 * fix path. Until then, "intraday freshness" is whatever Plaid's
 * cache holds; in practice that's hours-fresh for active institutions
 * and stale-since-nightly-sync for the rest. The reliability UI from
 * Phase 2/3 surfaces "as of X hours ago" honestly so this is acceptable
 * MVP behavior.
 *
 * Does NOT touch plaid_item.last_synced_at — that signal is reserved
 * for full syncs, and polluting it would break the "when did we last
 * see new transactions?" semantics elsewhere.
 *
 * New-account silently no-ops: accountsGet may surface accounts we
 * haven't seen yet, but the WHERE matches by providerAccountId so
 * unknown ones don't update anything. The nightly cron picks them up.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return new NextResponse('unauthorized', { status: 401 });
  }

  const startedAt = Date.now();
  // Plaid-only cron: accountsBalanceGet is a Plaid endpoint. SnapTrade
  // items refresh balances inside their own sync orchestrator.
  const items = await db
    .select({ id: externalItems.id, secret: externalItems.secret })
    .from(externalItems)
    .where(
      and(
        eq(externalItems.status, 'active'),
        eq(externalItems.provider, 'plaid'),
      ),
    );

  let refreshed = 0;
  let failed = 0;
  let skipped = 0;
  let accountsTouched = 0;

  for (const item of items) {
    try {
      if (!item.secret) {
        // Defensive: select filters provider='plaid' so this should be
        // unreachable. If it fires, schema invariant is broken upstream.
        throw new Error(`Plaid item ${item.id} has NULL secret`);
      }

      // Capability filter — investment/loan/other balances live in
      // different tables (holdings, etc.) and writing accountsGet's
      // values into financialAccounts.{currentBalance,availableBalance}
      // for those types would be semantically wrong. Pre-filter to
      // depository+credit and pass account_ids explicitly. See
      // balance-refresh.ts for the load-bearing rationale.
      const itemAccounts = await db
        .select({
          providerAccountId: financialAccounts.providerAccountId,
          type: financialAccounts.type,
        })
        .from(financialAccounts)
        .where(eq(financialAccounts.itemId, item.id));

      const refreshable = selectRefreshableAccounts(itemAccounts);
      if (refreshable.length === 0) {
        skipped++;
        await logRun(
          'cron.balance_refresh.skipped',
          `${item.id} has no refreshable accounts`,
          {
            externalItemId: item.id,
            reason: 'no_capable_accounts',
            account_total: itemAccounts.length,
          },
        );
        continue;
      }

      const accessToken = decryptToken(item.secret);
      const res = await plaid.accountsGet({
        access_token: accessToken,
        options: {
          account_ids: refreshable.map((a) => a.providerAccountId),
        },
      });

      let updatedThisItem = 0;
      for (const a of res.data.accounts) {
        // W-05: scope the UPDATE by itemId. providerAccountId is unique
        // across the table today, but anchoring on item too is correct
        // by construction and survives any future re-use (e.g. a
        // disconnect+reconnect where Plaid issues a new account_id but
        // a prior row still carries the old one until cleanup).
        //
        // buildBalanceUpdate omits any balance field that Plaid returned
        // as null — preserves the prior real value rather than writing
        // null over it. updatedAt always advances so error_log can
        // anchor "last successful refresh" off the per-item info row.
        const updated = await db
          .update(financialAccounts)
          .set({
            ...buildBalanceUpdate(a.balances),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(financialAccounts.itemId, item.id),
              eq(financialAccounts.providerAccountId, a.account_id),
            ),
          )
          .returning({ id: financialAccounts.id });
        updatedThisItem += updated.length;
      }
      accountsTouched += updatedThisItem;
      refreshed++;

      // Phase 3 health query reads this op to derive "last successful
      // balance refresh per item" — without the per-item info-level row,
      // there's no per-capability freshness signal in error_log.
      await logRun(
        'cron.balance_refresh.item',
        `${updatedThisItem} accounts refreshed`,
        {
          externalItemId: item.id,
          accountCount: refreshable.length,
          updatedCount: updatedThisItem,
        },
      );
    } catch (err) {
      failed++;
      await logError('cron.balance_refresh.item', err, {
        externalItemId: item.id,
      });
    }
  }

  await logRun(
    'cron.balance_refresh',
    `${refreshed} items, ${accountsTouched} accounts, ${skipped} skipped, ${failed} failed`,
    {
      duration_ms: Date.now() - startedAt,
      items_total: items.length,
      refreshed,
      accountsTouched,
      skipped,
      failed,
    },
  );

  return NextResponse.json({ refreshed, accountsTouched, skipped, failed });
}
