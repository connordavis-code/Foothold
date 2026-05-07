import { Snaptrade } from 'snaptrade-typescript-sdk';
import { env } from '@/lib/env';

/**
 * Server-only SnapTrade SDK client. Reads credentials from env.
 * Brokerage aggregator that complements Plaid — used for institutions
 * Plaid doesn't support (Fidelity, Schwab Gate-3, etc.).
 *
 * Never import this from client components — it carries the consumer key.
 *
 * Throws if env vars aren't set. The /settings connect picker hides
 * the SnapTrade option when SNAPTRADE_CLIENT_ID is missing, so this
 * code path is unreachable from the UI in that state — but the throw
 * is a load-bearing safety net for cron / direct server-action invocation.
 */
function buildClient(): Snaptrade {
  if (!env.SNAPTRADE_CLIENT_ID || !env.SNAPTRADE_CONSUMER_KEY) {
    throw new Error(
      'SnapTrade env vars not configured. Set SNAPTRADE_CLIENT_ID and ' +
        'SNAPTRADE_CONSUMER_KEY in .env.local (and Vercel) before invoking ' +
        'SnapTrade actions.',
    );
  }
  return new Snaptrade({
    clientId: env.SNAPTRADE_CLIENT_ID,
    consumerKey: env.SNAPTRADE_CONSUMER_KEY,
  });
}

// Lazy singleton: client only constructs on first access, so module
// load doesn't crash when keys aren't set yet (lets the rest of the
// app boot during local dev / preview deploys without SnapTrade keys).
let clientInstance: Snaptrade | null = null;
export function snaptrade(): Snaptrade {
  if (!clientInstance) clientInstance = buildClient();
  return clientInstance;
}

/** Cheap predicate for the UI to decide whether to surface the
 * SnapTrade connect option. */
export function snaptradeConfigured(): boolean {
  return !!(env.SNAPTRADE_CLIENT_ID && env.SNAPTRADE_CONSUMER_KEY);
}
