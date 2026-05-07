'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import type { CountryCode, Products } from 'plaid';
import { auth } from '@/auth';
import { decryptToken, encryptToken } from '@/lib/crypto';
import { db } from '@/lib/db';
import { plaidItems } from '@/lib/db/schema';
import { env, plaidCountryCodes, plaidProducts } from '@/lib/env';
import { plaid } from './client';
import { syncItem, type SyncSummary } from './sync';

/**
 * Mint a short-lived link_token that the browser-side Plaid Link UI uses
 * to authenticate the institution-connect flow. Tied to this user's id so
 * Plaid associates the eventual item correctly.
 */
export async function createLinkToken(): Promise<string> {
  const session = await auth();
  if (!session?.user) {
    throw new Error('Unauthorized');
  }

  // `products` is an AND filter at the institution-capability level —
  // every requested product must be supported by the institution or
  // Plaid Link refuses with "Plaid doesn't support connections between
  // {institution} and {app}". AmEx is credit-card-only (no investments),
  // so requiring both products excludes it. Required-minimum is just
  // `transactions`; everything else moves to `additional_consented_products`,
  // which Plaid initializes per-institution where supported and silently
  // skips where not. User consent to the full set is captured up-front
  // via the Link disclosure.
  const requiredProducts = ['transactions'] as Products[];
  const optionalProducts = (plaidProducts as Products[]).filter(
    (p) => !requiredProducts.includes(p),
  );

  const response = await plaid.linkTokenCreate({
    user: { client_user_id: session.user.id },
    client_name: env.PLAID_CLIENT_NAME,
    products: requiredProducts,
    additional_consented_products:
      optionalProducts.length > 0 ? optionalProducts : undefined,
    country_codes: plaidCountryCodes as CountryCode[],
    language: 'en',
    // Webhook URL is baked into the item at creation; existing items keep
    // their original URL until itemWebhookUpdate is called. For local dev
    // this points at localhost — fine for /sandbox/item/fire_webhook
    // testing only, real Plaid traffic needs a tunnel or the deployed URL.
    webhook: `${env.NEXT_PUBLIC_APP_URL}/api/plaid/webhook`,
    // OAuth-only banks (Wells Fargo, AmEx, Fidelity, Chase, Cap One, BofA…)
    // redirect the user to the institution and back to this URI to finish
    // Link. Production requires this URI be registered in Plaid Dashboard
    // → Team Settings → API → Allowed redirect URIs. Without it, those
    // banks fail Link entirely. The /oauth-redirect route re-instantiates
    // Link with `receivedRedirectUri` to complete the public-token exchange.
    redirect_uri: `${env.NEXT_PUBLIC_APP_URL}/oauth-redirect`,
  });

  return response.data.link_token;
}

/**
 * After the user finishes Plaid Link in the browser, the SDK hands us a
 * short-lived `public_token`. Exchange it for a long-lived `access_token`
 * (which we store, encrypted) and persist a plaid_item row.
 *
 * Does NOT run the initial sync inline — closes review W-04. The plaintext
 * `access_token` lives in JS heap only for the few milliseconds of the
 * encrypt-and-insert path; the caller (browser onSuccess) chains
 * `syncItemAction(itemId)` to do the backfill, which re-decrypts from DB.
 * The first-time-seen plaintext window collapses from ~30s to ~50ms.
 *
 * Returns the new item's id so the caller can chain into syncItemAction
 * without another round-trip to look it up.
 */
export async function exchangePublicToken(
  publicToken: string,
  metadata: {
    institution_id?: string | null;
    institution_name?: string | null;
  },
): Promise<{ itemId: string }> {
  const session = await auth();
  if (!session?.user) {
    throw new Error('Unauthorized');
  }

  const exchange = await plaid.itemPublicTokenExchange({
    public_token: publicToken,
  });

  const [inserted] = await db
    .insert(plaidItems)
    .values({
      userId: session.user.id,
      plaidItemId: exchange.data.item_id,
      plaidInstitutionId: metadata.institution_id ?? null,
      institutionName: metadata.institution_name ?? null,
      accessToken: encryptToken(exchange.data.access_token),
    })
    .returning({ id: plaidItems.id });

  return { itemId: inserted.id };
}

/**
 * Re-sync an item the user owns. Used by the "Sync now" button on /settings.
 * Verifies ownership before doing any work.
 */
export async function syncItemAction(itemId: string): Promise<SyncSummary> {
  const session = await auth();
  if (!session?.user) {
    throw new Error('Unauthorized');
  }

  const [item] = await db
    .select({ id: plaidItems.id })
    .from(plaidItems)
    .where(
      and(eq(plaidItems.id, itemId), eq(plaidItems.userId, session.user.id)),
    );
  if (!item) {
    throw new Error('Item not found');
  }

  return syncItem(item.id);
}

/**
 * Re-sync every Plaid item the signed-in user owns. Powers the top-bar
 * sync pill's "Sync now" click. Items in `login_required` / `error` /
 * etc. are skipped — `syncItem` only runs on active rows, and a stale
 * item just routes the user to /settings via the reauth pill anyway.
 */
export async function syncAllItemsAction(): Promise<{
  synced: number;
  failed: number;
}> {
  const session = await auth();
  if (!session?.user) {
    throw new Error('Unauthorized');
  }

  const items = await db
    .select({ id: plaidItems.id })
    .from(plaidItems)
    .where(
      and(
        eq(plaidItems.userId, session.user.id),
        eq(plaidItems.status, 'active'),
      ),
    );

  // Bounded fan-out: a single user has 1–5 items in practice, and
  // syncItem already serializes per-endpoint inside. No global rate-limit
  // risk worth a queue.
  const results = await Promise.allSettled(items.map((i) => syncItem(i.id)));

  return {
    synced: results.filter((r) => r.status === 'fulfilled').length,
    failed: results.filter((r) => r.status === 'rejected').length,
  };
}

/**
 * Mint a link_token for Plaid Link in *update mode* — used to repair an
 * item whose connection is `login_required` / `pending_expiration` /
 * etc. Update mode keeps the same `access_token`, so there's no
 * `exchangePublicToken` step on the way back; the
 * `markItemReconnected` action below handles the post-success state
 * flip + resync.
 *
 * Note: omit `products` in update mode (Plaid rejects it).
 */
export async function createLinkTokenForUpdate(itemId: string): Promise<string> {
  const session = await auth();
  if (!session?.user) {
    throw new Error('Unauthorized');
  }

  const [item] = await db
    .select({ accessToken: plaidItems.accessToken })
    .from(plaidItems)
    .where(
      and(eq(plaidItems.id, itemId), eq(plaidItems.userId, session.user.id)),
    );
  if (!item) {
    throw new Error('Item not found');
  }

  // Plaintext access_token passed inline so we don't hold an extra
  // userland reference. Plaid's SDK retains its own ref through the call;
  // there's no portable way to zero V8's underlying string allocation —
  // this is hygiene, not defense. Heap-dump exposure during the call is
  // accepted in the threat model (review W-04).
  const response = await plaid.linkTokenCreate({
    user: { client_user_id: session.user.id },
    client_name: env.PLAID_CLIENT_NAME,
    country_codes: plaidCountryCodes as CountryCode[],
    language: 'en',
    access_token: decryptToken(item.accessToken),
    webhook: `${env.NEXT_PUBLIC_APP_URL}/api/plaid/webhook`,
    // Update mode also redirects through the institution for OAuth banks
    // — same /oauth-redirect re-entry route, different intent (no
    // public-token exchange; markItemReconnected on success).
    redirect_uri: `${env.NEXT_PUBLIC_APP_URL}/oauth-redirect`,
  });

  return response.data.link_token;
}

/**
 * Called after Plaid Link update-mode finishes successfully. Optimistic:
 * flips status to 'active' immediately and runs syncItem so fresh data
 * lands without waiting for Plaid's LOGIN_REPAIRED webhook (which we
 * also handle, but webhook timing is best-effort and we want the user
 * to see green on the next page render).
 */
export async function markItemReconnected(
  itemId: string,
): Promise<SyncSummary> {
  const session = await auth();
  if (!session?.user) {
    throw new Error('Unauthorized');
  }

  const [item] = await db
    .select({ id: plaidItems.id })
    .from(plaidItems)
    .where(
      and(eq(plaidItems.id, itemId), eq(plaidItems.userId, session.user.id)),
    );
  if (!item) {
    throw new Error('Item not found');
  }

  await db
    .update(plaidItems)
    .set({ status: 'active' })
    .where(eq(plaidItems.id, item.id));

  return syncItem(item.id);
}

/**
 * Permanently disconnect a Plaid item the user owns. Calls Plaid's
 * itemRemove to invalidate the access_token at Plaid's end, then
 * deletes the local plaid_item row. The schema's cascade chain
 * (plaid_item → financial_account → transaction / holding /
 * investment_transaction) tears down all derived data automatically.
 *
 * Idempotent against Plaid: if itemRemove fails because the item is
 * already gone at Plaid (or a transient network blip), we still
 * delete locally — leaving the row would just confuse the user. The
 * worst case from a Plaid-side success-but-local-fail is a stale
 * access_token sitting in their system, which itemRemove is meant
 * to clean up; harmless on our side.
 *
 * Used by the Disconnect button on /settings AND as the canonical
 * "wipe sandbox before flipping PLAID_ENV=production" path.
 */
export async function disconnectItemAction(
  itemId: string,
): Promise<{ ok: true }> {
  const session = await auth();
  if (!session?.user) {
    throw new Error('Unauthorized');
  }

  const [item] = await db
    .select({
      id: plaidItems.id,
      accessToken: plaidItems.accessToken,
    })
    .from(plaidItems)
    .where(
      and(eq(plaidItems.id, itemId), eq(plaidItems.userId, session.user.id)),
    );
  if (!item) {
    throw new Error('Item not found');
  }

  // Best-effort revoke at Plaid. Don't block the local delete on this:
  // if Plaid's API is down or the item is already gone, we still want
  // the local DB to reflect the user's intent.
  try {
    await plaid.itemRemove({ access_token: decryptToken(item.accessToken) });
  } catch {
    // swallow — local delete proceeds regardless
  }

  await db.delete(plaidItems).where(eq(plaidItems.id, item.id));

  revalidatePath('/settings');
  revalidatePath('/dashboard');
  return { ok: true };
}
