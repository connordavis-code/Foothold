'use server';

import { and, eq, inArray } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { decryptToken, encryptToken } from '@/lib/crypto';
import { db } from '@/lib/db';
import { externalItems, snaptradeUsers } from '@/lib/db/schema';
import { env } from '@/lib/env';
import { snaptrade, snaptradeConfigured } from './client';
import { partitionSnaptradeAuthsForReconcile } from './reconcile';

/**
 * Lazy-register the signed-in user with SnapTrade if not already.
 * Returns the per-user (snaptradeUserId, decryptedUserSecret) pair —
 * caller decrypts at the boundary, never persists plaintext past this
 * scope. Same pattern as Plaid's access_token decryption.
 */
async function ensureSnaptradeUser(userId: string): Promise<{
  snaptradeUserId: string;
  userSecret: string;
}> {
  const [existing] = await db
    .select()
    .from(snaptradeUsers)
    .where(eq(snaptradeUsers.userId, userId));
  if (existing) {
    return {
      snaptradeUserId: existing.snaptradeUserId,
      userSecret: decryptToken(existing.snaptradeUserSecret),
    };
  }

  // First-time SnapTrade registration. Use Foothold's user.id as the
  // SnapTrade userId — it's already a UUID and immutable.
  const res = await snaptrade().authentication.registerSnapTradeUser({
    userId,
  });
  const { userId: snaptradeUserId, userSecret } = res.data;
  if (!snaptradeUserId || !userSecret) {
    throw new Error('SnapTrade registerUser returned malformed response');
  }

  await db.insert(snaptradeUsers).values({
    userId,
    snaptradeUserId,
    snaptradeUserSecret: encryptToken(userSecret),
  });

  return { snaptradeUserId, userSecret };
}

/**
 * Mint a SnapTrade Connection Portal URL the browser redirects to.
 * `customRedirect` brings the user back to /snaptrade-redirect after
 * they finish at the brokerage; that route handler runs
 * `syncSnaptradeBrokeragesAction` to discover newly-authorized
 * connections and persist external_item rows.
 *
 * Throws if SnapTrade isn't configured. The picker UI hides the
 * SnapTrade button when keys aren't set, so this is a safety net.
 */
export async function createSnaptradeConnectUrlAction(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Unauthorized');
  if (!snaptradeConfigured()) {
    throw new Error('SnapTrade not configured on this deployment');
  }

  const { snaptradeUserId, userSecret } = await ensureSnaptradeUser(
    session.user.id,
  );

  const res = await snaptrade().authentication.loginSnapTradeUser({
    userId: snaptradeUserId,
    userSecret,
    customRedirect: `${env.NEXT_PUBLIC_APP_URL}/snaptrade-redirect`,
  });

  // Response shape: { redirectURI: string }
  const url = (res.data as { redirectURI?: string }).redirectURI;
  if (!url) throw new Error('SnapTrade loginUser returned no redirect URL');
  return url;
}

/**
 * Reconcile SnapTrade's authoritative connection list with our
 * external_item rows. Called by /snaptrade-redirect after the user
 * finishes the Connection Portal. Idempotent — re-running it after
 * a partial run won't double-insert, and re-running after a successful
 * reconnect won't re-flip an already-active row.
 *
 * Three classes of authorization in the reconcile:
 *   - **new** — providerItemId not yet in our DB → INSERT
 *   - **repair** — providerItemId known but row was non-active
 *     (login_required, error, etc.) OR institution metadata stale
 *     → UPDATE (status='active' + refresh metadata). The status-flip
 *     subset is what powers the user-facing "reconnected" tally.
 *   - **no-op** — already active + metadata current → silent skip
 *
 * Why repair matters: the SnapTrade reconnect button on /settings
 * routes through this same Connection Portal flow (SnapTrade has no
 * per-item update endpoint analogous to Plaid Link). Without the
 * repair branch, a successful re-auth would arrive here, see the
 * row is "known," and exit without flipping status — leaving the
 * row stuck in needs_reconnect.
 *
 * Returns counts plus the IDs to sync immediately so /snaptrade-redirect
 * can refresh holdings without waiting for the nightly cron.
 * `newItemIds` and `repairedItemIds` are returned separately so the
 * redirect UI can render appropriate copy ("Connected" vs "Reconnected").
 */
export async function syncSnaptradeBrokeragesAction(): Promise<{
  added: number;
  repaired: number;
  total: number;
  newItemIds: string[];
  repairedItemIds: string[];
}> {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Unauthorized');
  if (!snaptradeConfigured()) {
    throw new Error('SnapTrade not configured on this deployment');
  }

  const { snaptradeUserId, userSecret } = await ensureSnaptradeUser(
    session.user.id,
  );

  const authsRes = await snaptrade().connections.listBrokerageAuthorizations({
    userId: snaptradeUserId,
    userSecret,
  });
  const auths = authsRes.data;

  if (!Array.isArray(auths) || auths.length === 0) {
    return {
      added: 0,
      repaired: 0,
      total: 0,
      newItemIds: [],
      repairedItemIds: [],
    };
  }

  // Existing external_item rows for this user under SnapTrade — keyed
  // by providerItemId (= brokerageAuthorizationId). Carrying status +
  // metadata lets the partition helper decide insert vs repair vs
  // no-op without a second DB round-trip.
  const known = await db
    .select({
      id: externalItems.id,
      providerItemId: externalItems.providerItemId,
      status: externalItems.status,
      institutionName: externalItems.institutionName,
      providerInstitutionId: externalItems.providerInstitutionId,
    })
    .from(externalItems)
    .where(
      and(
        eq(externalItems.userId, session.user.id),
        eq(externalItems.provider, 'snaptrade'),
      ),
    );
  const existingByProviderId = new Map(
    known.map((k) => [
      k.providerItemId,
      {
        id: k.id,
        status: k.status,
        institutionName: k.institutionName,
        providerInstitutionId: k.providerInstitutionId,
      },
    ]),
  );

  const decision = partitionSnaptradeAuthsForReconcile(
    auths,
    existingByProviderId,
  );

  // INSERT new rows.
  let newItemIds: string[] = [];
  if (decision.toInsert.length > 0) {
    const newRows = decision.toInsert.map((r) => ({
      userId: session.user!.id,
      provider: 'snaptrade',
      providerItemId: r.providerItemId,
      providerInstitutionId: r.providerInstitutionId,
      institutionName: r.institutionName,
      // Per-connection secret stays NULL for SnapTrade — userSecret
      // lives on snaptrade_user, looked up at sync time.
      secret: null,
      providerState: { snaptradeUserId },
    }));
    const inserted = await db
      .insert(externalItems)
      .values(newRows)
      .returning({ id: externalItems.id });
    newItemIds = inserted.map((row) => row.id);
  }

  // UPDATE existing rows that need repair. Always set status='active'
  // (the auth came back from SnapTrade — by definition it's authorized
  // again) and refresh metadata. Only count toward `repairedItemIds`
  // when the status actually flipped from non-active; metadata-only
  // refreshes are silent maintenance.
  const repairedItemIds: string[] = [];
  for (const r of decision.toRepair) {
    await db
      .update(externalItems)
      .set({
        status: 'active',
        institutionName: r.institutionName,
        providerInstitutionId: r.providerInstitutionId,
      })
      .where(eq(externalItems.id, r.id));
    if (r.statusChanged) repairedItemIds.push(r.id);
  }

  if (newItemIds.length > 0 || decision.toRepair.length > 0) {
    revalidatePath('/settings');
    revalidatePath('/dashboard');
    revalidatePath('/transactions');
  }

  return {
    added: newItemIds.length,
    repaired: repairedItemIds.length,
    total: auths.length,
    newItemIds,
    repairedItemIds,
  };
}

/**
 * Permanently disconnect a SnapTrade brokerage authorization. Mirrors
 * Plaid's disconnectItemAction: best-effort revoke at SnapTrade,
 * always proceed with local delete.
 */
export async function disconnectSnaptradeItemAction(
  itemId: string,
): Promise<{ ok: true }> {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Unauthorized');

  const [item] = await db
    .select({
      id: externalItems.id,
      provider: externalItems.provider,
      providerItemId: externalItems.providerItemId,
    })
    .from(externalItems)
    .where(
      and(
        eq(externalItems.id, itemId),
        eq(externalItems.userId, session.user.id),
      ),
    );
  if (!item) throw new Error('Item not found');
  if (item.provider !== 'snaptrade') {
    throw new Error(`Item ${itemId} is provider=${item.provider}, expected 'snaptrade'`);
  }

  const { snaptradeUserId, userSecret } = await ensureSnaptradeUser(
    session.user.id,
  );

  try {
    await snaptrade().connections.removeBrokerageAuthorization({
      userId: snaptradeUserId,
      userSecret,
      authorizationId: item.providerItemId,
    });
  } catch {
    // Swallow — local delete proceeds. Same pattern as Plaid disconnect.
  }

  await db.delete(externalItems).where(eq(externalItems.id, item.id));

  revalidatePath('/settings');
  revalidatePath('/dashboard');
  return { ok: true };
}

// inArray import preserved for future bulk-disconnect; suppress unused warning.
void inArray;
