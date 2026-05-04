import { env } from '@/lib/env';

/**
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET` on every
 * scheduled invocation. Returns true iff the request bears that header.
 *
 * Without this guard, /api/cron/* would be world-callable — anyone
 * could trigger the nightly sync loop or the AI insight generation,
 * costing real money.
 */
export function isAuthorizedCronRequest(request: Request): boolean {
  return request.headers.get('authorization') === `Bearer ${env.CRON_SECRET}`;
}
