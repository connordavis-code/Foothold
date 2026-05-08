import { formatRelative } from '@/lib/format/date';
import type { SourceHealth } from '@/lib/db/queries/health';

/**
 * Maximum length for a rendered classifier reason. Caps verbose
 * upstream error messages — SnapTrade's SDK in particular throws
 * errors whose `.message` includes the full HTTP response headers
 * dump verbatim, which floods the row otherwise. Full failure text
 * still lives in `error_log` for diagnostics.
 *
 * Exported so other rendering surfaces (e.g. dashboard `<TrustStrip>`)
 * apply the same cap. Each surface owns its own truncation boundary
 * because it owns its own layout constraints.
 */
export const MAX_REASON_LEN = 140;

export function truncateReason(s: string, max: number = MAX_REASON_LEN): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1).trimEnd()}…`;
}

/**
 * One-line summary for the secondary text on a source-health row in
 * the /settings panel.
 *
 *   - healthy → "Synced 5m ago"
 *   - everything else → the classifier's `reason` string, capped at
 *     MAX_REASON_LEN so a multi-kilobyte upstream error message
 *     doesn't blow up the row layout
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
  return truncateReason(source.reason);
}
