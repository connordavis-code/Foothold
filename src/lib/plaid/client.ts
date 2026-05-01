import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';
import { env } from '@/lib/env';

/**
 * Server-only Plaid SDK client. Reads credentials from env and points at
 * the right base URL (sandbox / development / production).
 *
 * Never import this from client components — it carries the secret.
 */
const config = new Configuration({
  basePath: PlaidEnvironments[env.PLAID_ENV],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': env.PLAID_CLIENT_ID,
      'PLAID-SECRET': env.PLAID_SECRET,
      'Plaid-Version': '2020-09-14',
    },
  },
});

export const plaid = new PlaidApi(config);
