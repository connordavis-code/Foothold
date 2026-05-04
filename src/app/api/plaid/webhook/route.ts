import { type NextRequest, NextResponse } from 'next/server';
import { logError } from '@/lib/logger';
import {
  handlePlaidWebhook,
  type PlaidWebhookEvent,
  verifyPlaidWebhook,
} from '@/lib/plaid/webhook';

// Force Node runtime: handlePlaidWebhook calls syncItem which uses the
// postgres-js driver (Node TCP, not edge-safe).
export const runtime = 'nodejs';

/**
 * Plaid webhook endpoint. Plaid POSTs JSON; we verify the
 * `Plaid-Verification` JWS header against the raw body (hash check is
 * order-sensitive so we MUST NOT re-stringify) before doing any work.
 *
 * Always returns 200 once verified — Plaid retries on 4xx/5xx and we
 * don't want our own bugs to cause a retry storm. Verification failure
 * returns 401 on purpose: that *should* be rare and worth alerting on.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const jwt = request.headers.get('plaid-verification');

  const ok = await verifyPlaidWebhook(rawBody, jwt);
  if (!ok) {
    // Skip the DB write when no JWS header is present at all — that's
    // the dominant anonymous-probe shape on a public endpoint, and
    // logging each one would let any flood balloon error_log unbounded
    // (route is exempt from the session gate; see middleware).
    if (jwt) {
      await logError(
        'webhook.verification_failed',
        new Error('JWS verification failed'),
        { jwtPresent: true },
      );
    }
    return new NextResponse('unauthorized', { status: 401 });
  }

  let event: PlaidWebhookEvent;
  try {
    event = JSON.parse(rawBody) as PlaidWebhookEvent;
  } catch (err) {
    await logError('webhook.invalid_json', err);
    return new NextResponse('invalid json', { status: 400 });
  }

  try {
    await handlePlaidWebhook(event);
  } catch (err) {
    // Single-user app — log and 200 so Plaid stops retrying. We can
    // replay manually via "Sync now" on /settings if a sync was missed.
    await logError('webhook.handler', err, {
      webhook_type: event.webhook_type,
      webhook_code: event.webhook_code,
      item_id: event.item_id,
    });
  }

  return NextResponse.json({ ok: true });
}
