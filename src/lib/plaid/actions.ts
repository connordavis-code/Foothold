'use server';

import type { CountryCode, Products } from 'plaid';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { plaidItems } from '@/lib/db/schema';
import { env, plaidCountryCodes, plaidProducts } from '@/lib/env';
import { plaid } from './client';

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

  await db.insert(plaidItems).values({
    userId: session.user.id,
    plaidItemId: exchange.data.item_id,
    plaidInstitutionId: metadata.institution_id ?? null,
    institutionName: metadata.institution_name ?? null,
    accessToken: exchange.data.access_token,
  });
}
