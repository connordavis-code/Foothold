import { formatRelative } from '@/lib/format/date';
import type { SourceHealth } from '@/lib/db/queries/health';

/**
 * One-line summary for the secondary text on a source-health row in
 * the /settings panel.
 *
 *   - healthy → "Synced 5m ago"
 *   - everything else → the classifier's `reason` string, which already
 *     reads as a complete sentence ("1 of 3 capabilities failing —
 *     transactions: rate_limit", "Reconnect required (login)", etc.)
 *
 * Healthy sources earn the briefer line because the operator-tier
 * intent is "silence reassures." When something is elevated, the
 * classifier-authored reason is more informative than a generic
 * "synced X ago" line and stays glanceable.
 *
 * Pure for testability — `now` is injectable.
 */
export function summarizeSourceHealth(
  source: Pick<SourceHealth, 'state' | 'reason' | 'lastSuccessfulSyncAt'>,
  now: Date = new Date(),
): string {
  if (source.state === 'healthy') {
    return source.lastSuccessfulSyncAt
      ? `Synced ${formatRelative(source.lastSuccessfulSyncAt, now)}`
      : 'Sync pending';
  }
  return source.reason;
}
