import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import * as jose from 'jose';
import type { JWK } from 'jose';
import { db } from '@/lib/db';
import { externalItems } from '@/lib/db/schema';
import { plaid } from './client';
import { syncItem } from './sync';

/**
 * Plaid webhook handling. Two surfaces:
 *
 *   1. `verifyPlaidWebhook` — JWS verification of the `Plaid-Verification`
 *      header against the raw request body. Plaid signs each webhook with
 *      ES256; the JWT carries `request_body_sha256` plus `iat`. We verify
 *      signature, body hash, and an iat freshness window to bound replay.
 *
 *   2. `handlePlaidWebhook` — dispatch on (webhook_type, webhook_code).
 *      ITEM events update `plaid_item.status` so the reauth banner
 *      surfaces. TRANSACTIONS events trigger an inline `syncItem`. We
 *      ignore everything else — silently 200, don't bounce Plaid retries.
 *
 * Caller (the Next.js route) is responsible for:
 *   - reading the raw request text *before* JSON.parse (hash mismatch
 *     otherwise — JSON.stringify reorders keys);
 *   - returning 200 even on dispatch errors so Plaid stops retrying.
 */

// Verification keys are stable per `kid` for ~24h. Memoize so we don't
// hit Plaid's API on every webhook. Map lives in module scope; survives
// across requests on the same server instance, evicted on cold start.
//
// The size cap + negative caching here are anti-amplification defenses:
// the endpoint accepts anonymous POSTs (Plaid signs each call), so an
// attacker can craft JWTs with random `kid` values that each force an
// outbound `webhookVerificationKeyGet`. Without bounds, that's
// unbounded outbound API hits + unbounded map growth. Plaid's normal
// rotation churns ~1-3 kids per 24h, so 32 entries is far more headroom
// than legitimate operation needs.
const KEY_CACHE = new Map<string, { jwk: JWK | null; expiresAt: number }>();
const KEY_CACHE_MS = 24 * 60 * 60 * 1000;
const KEY_CACHE_NEGATIVE_MS = 5 * 60 * 1000;
const KEY_CACHE_MAX_ENTRIES = 32;

// iat freshness window. Plaid's example uses 5 min — anything older is
// almost certainly a replay.
const MAX_IAT_AGE_MS = 5 * 60 * 1000;

export async function verifyPlaidWebhook(
  rawBody: string,
  jwtHeader: string | null,
): Promise<boolean> {
  if (!jwtHeader) return false;

  let kid: string;
  try {
    const decoded = jose.decodeProtectedHeader(jwtHeader);
    if (decoded.alg !== 'ES256' || typeof decoded.kid !== 'string') {
      return false;
    }
    kid = decoded.kid;
  } catch {
    return false;
  }

  const jwk = await getVerificationKey(kid);
  if (!jwk) return false;

  let payload: jose.JWTPayload;
  try {
    const key = await jose.importJWK(jwk, 'ES256');
    const result = await jose.jwtVerify(jwtHeader, key, {
      algorithms: ['ES256'],
    });
    payload = result.payload;
  } catch {
    return false;
  }

  if (typeof payload.iat !== 'number') return false;
  if (Math.abs(Date.now() - payload.iat * 1000) > MAX_IAT_AGE_MS) return false;

  const expectedHash = (payload as { request_body_sha256?: unknown })
    .request_body_sha256;
  if (typeof expectedHash !== 'string') return false;
  const actualHash = createHash('sha256').update(rawBody).digest('hex');
  if (expectedHash !== actualHash) return false;

  return true;
}

async function getVerificationKey(kid: string): Promise<JWK | null> {
  const cached = KEY_CACHE.get(kid);
  if (cached && cached.expiresAt > Date.now()) return cached.jwk;
  try {
    const res = await plaid.webhookVerificationKeyGet({ key_id: kid });
    const jwk = res.data.key as unknown as JWK;
    cacheKey(kid, jwk, KEY_CACHE_MS);
    return jwk;
  } catch {
    // Negative-cache the failure so a flooder targeting the same kid
    // doesn't re-hit Plaid every request. Don't log here — the route
    // handler already logs `webhook.verification_failed` once we
    // return null, so logging again would double-count.
    cacheKey(kid, null, KEY_CACHE_NEGATIVE_MS);
    return null;
  }
}

function cacheKey(kid: string, jwk: JWK | null, ttlMs: number): void {
  if (KEY_CACHE.size >= KEY_CACHE_MAX_ENTRIES && !KEY_CACHE.has(kid)) {
    // Map iteration order is insertion order; evict oldest first.
    const firstKey = KEY_CACHE.keys().next().value;
    if (firstKey !== undefined) KEY_CACHE.delete(firstKey);
  }
  KEY_CACHE.set(kid, { jwk, expiresAt: Date.now() + ttlMs });
}

// =============================================================================
// Dispatch
// =============================================================================

export type PlaidWebhookEvent = {
  webhook_type: string;
  webhook_code: string;
  item_id?: string;
  error?: { error_code?: string } | null;
  // Other fields vary by event; we don't use them in v1.
  [k: string]: unknown;
};

/**
 * Map ITEM webhook codes (and ITEM:ERROR error_codes) to plaid_item.status.
 * Values listed in [src/lib/db/schema.ts] — keep in sync.
 */
const ITEM_CODE_TO_STATUS: Record<string, string> = {
  PENDING_EXPIRATION: 'pending_expiration',
  PENDING_DISCONNECT: 'pending_expiration',
  USER_PERMISSION_REVOKED: 'permission_revoked',
  USER_ACCOUNT_REVOKED: 'permission_revoked',
  LOGIN_REPAIRED: 'active',
};

const ERROR_CODE_TO_STATUS: Record<string, string> = {
  ITEM_LOGIN_REQUIRED: 'login_required',
  PENDING_EXPIRATION: 'pending_expiration',
  PENDING_DISCONNECT: 'pending_expiration',
  USER_PERMISSION_REVOKED: 'permission_revoked',
};

export async function handlePlaidWebhook(
  event: PlaidWebhookEvent,
): Promise<void> {
  if (!event.item_id) return;

  // Resolve the internal id once. Plaid's item_id is the provider-side id
  // (external_item.provider_item_id when provider='plaid', not
  // external_item.id) — every helper below expects the internal one.
  const [row] = await db
    .select({ id: externalItems.id })
    .from(externalItems)
    .where(
      and(
        eq(externalItems.provider, 'plaid'),
        eq(externalItems.providerItemId, event.item_id),
      ),
    );
  if (!row) {
    console.warn(
      `[plaid:webhook] unknown item_id ${event.item_id} (${event.webhook_type}/${event.webhook_code})`,
    );
    return;
  }
  const internalId = row.id;

  switch (event.webhook_type) {
    case 'ITEM': {
      // ITEM:ERROR carries an `error.error_code` that disambiguates
      // login_required / permission_revoked / etc. ITEM:* codes other
      // than ERROR map directly to a status.
      let nextStatus: string | undefined;
      if (event.webhook_code === 'ERROR') {
        const code = event.error?.error_code;
        if (code) nextStatus = ERROR_CODE_TO_STATUS[code] ?? 'error';
        else nextStatus = 'error';
      } else {
        nextStatus = ITEM_CODE_TO_STATUS[event.webhook_code];
      }
      if (nextStatus) {
        await db
          .update(externalItems)
          .set({ status: nextStatus })
          .where(eq(externalItems.id, internalId));
      }
      // NEW_ACCOUNTS_AVAILABLE: existing accounts still flow; user opts
      // in to the new ones via Plaid Link update mode. No sync trigger.
      return;
    }

    case 'TRANSACTIONS': {
      // SYNC_UPDATES_AVAILABLE is the only code we act on under
      // /transactions/sync — INITIAL_UPDATE / HISTORICAL_UPDATE /
      // DEFAULT_UPDATE / TRANSACTIONS_REMOVED are legacy /transactions/get
      // events that don't apply to our cursor-based flow.
      // RECURRING_TRANSACTIONS_UPDATE is handled via the `recurring`
      // branch of syncItem already.
      if (
        event.webhook_code === 'SYNC_UPDATES_AVAILABLE' ||
        event.webhook_code === 'RECURRING_TRANSACTIONS_UPDATE'
      ) {
        await syncItem(internalId);
      }
      return;
    }

    default:
      // INVESTMENTS, HOLDINGS, ASSETS, etc. — not handled in v1.
      return;
  }
}
