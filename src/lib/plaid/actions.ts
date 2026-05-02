'use server';

import { and, eq } from 'drizzle-orm';
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

  const response = await plaid.linkTokenCreate({
    user: { client_user_id: session.user.id },
    client_name: env.PLAID_CLIENT_NAME,
    products: plaidProducts as Products[],
    country_codes: plaidCountryCodes as CountryCode[],
    language: 'en',
    // Webhook URL is baked into the item at creation; existing items keep
    // their original URL until itemWebhookUpdate is called. For local dev
    // this points at localhost — fine for /sandbox/item/fire_webhook
    // testing only, real Plaid traffic needs a tunnel or the deployed URL.
    webhook: `${env.NEXT_PUBLIC_APP_URL}/api/plaid/webhook`,
  });

  return response.data.link_token;
}

/**
 * After the user finishes Plaid Link in the browser, the SDK hands us a
 * short-lived `public_token`. Exchange it for a long-lived `access_token`
 * (which we store) and persist a plaid_item row so we know about this
 * institution connection.
 */
export async function exchangePublicToken(
  publicToken: string,
  metadata: {
    institution_id?: string | null;
    institution_name?: string | null;
  },
): Promise<void> {
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

  // Run the initial backfill inline. On a sandbox item this is a few
  // seconds; on a real institution with 24 months of history it can take
  // up to ~30s. The Plaid Link UI is already closed, so the user is just
  // staring at the connecting state on the button.
  await syncItem(inserted.id);
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

  const response = await plaid.linkTokenCreate({
    user: { client_user_id: session.user.id },
    client_name: env.PLAID_CLIENT_NAME,
    country_codes: plaidCountryCodes as CountryCode[],
    language: 'en',
    access_token: decryptToken(item.accessToken),
    webhook: `${env.NEXT_PUBLIC_APP_URL}/api/plaid/webhook`,
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
