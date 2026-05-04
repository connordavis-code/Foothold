import { timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';

/**
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET` on every
 * scheduled invocation. Returns true iff the request bears that header.
 *
 * Without this guard, /api/cron/* would be world-callable — anyone
 * could trigger the nightly sync loop or the AI insight generation,
 * costing real money.
 *
 * Uses timingSafeEqual rather than `===` so per-byte comparison time
 * doesn't leak the secret. Practical exploitability over the public
 * internet is low (network jitter dwarfs the signal) but this is
 * standard hygiene for any guard fronting paid AI/Plaid/Resend calls.
 */
export function isAuthorizedCronRequest(request: Request): boolean {
  const header = request.headers.get('authorization');
  if (!header) return false;
  const expected = `Bearer ${env.CRON_SECRET}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
