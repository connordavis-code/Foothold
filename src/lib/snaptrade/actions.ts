'use server';

import { and, eq, inArray } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { decryptToken, encryptToken } from '@/lib/crypto';
import { db } from '@/lib/db';
import { externalItems, snaptradeUsers } from '@/lib/db/schema';
import { env } from '@/lib/env';
import { snaptrade, snaptradeConfigured } from './client';

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
 * a partial run won't double-insert.
 *
 * Returns the count of newly-recorded connections plus their generated
 * external_item ids so the redirect page can chain into per-item sync
 * and the user sees holdings immediately rather than waiting for the
 * nightly cron.
 */
export async function syncSnaptradeBrokeragesAction(): Promise<{
  added: number;
  total: number;
  newItemIds: string[];
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
    return { added: 0, total: 0, newItemIds: [] };
  }

  // Existing external_item rows for this user under SnapTrade — keyed
  // by providerItemId (= brokerageAuthorizationId).
  const known = await db
    .select({ providerItemId: externalItems.providerItemId })
    .from(externalItems)
    .where(
      and(
        eq(externalItems.userId, session.user.id),
        eq(externalItems.provider, 'snaptrade'),
      ),
    );
  const knownIds = new Set(known.map((k) => k.providerItemId));

  const newRows = auths
    .filter((a) => a.id && !knownIds.has(a.id))
    .map((a) => ({
      userId: session.user!.id,
      provider: 'snaptrade',
      providerItemId: a.id as string,
      providerInstitutionId: a.brokerage?.slug ?? null,
      institutionName: a.brokerage?.name ?? null,
      // Per-connection secret stays NULL for SnapTrade — userSecret
      // lives on snaptrade_user, looked up at sync time.
      secret: null,
      providerState: { snaptradeUserId },
    }));

  let newItemIds: string[] = [];
  if (newRows.length > 0) {
    const inserted = await db
      .insert(externalItems)
      .values(newRows)
      .returning({ id: externalItems.id });
    newItemIds = inserted.map((row) => row.id);
    revalidatePath('/settings');
    revalidatePath('/dashboard');
  }

  return { added: newRows.length, total: auths.length, newItemIds };
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
