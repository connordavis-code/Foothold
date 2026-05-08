import type { SourceHealth } from '@/lib/db/queries/health';
import { truncateReason } from '@/lib/sync/health-summary';

/**
 * Derived view-model for the dashboard trust strip. Pure — no DB,
 * no side effects. Consumes `getSourceHealth` output and reduces it
 * to one of three shapes the strip renders.
 *
 * Three states by precedence:
 *
 *   1. `elevated` — any source is `degraded`, `failed`, or
 *      `needs_reconnect`. The strip surfaces the offenders by name.
 *
 *   2. `no_signal` — every source is non-elevated AND no source has
 *      a successful sync timestamp yet (brand-new connections,
 *      pre-first-sync). Strip shows "Sync pending."
 *
 *   3. `healthy` — every source is non-elevated AND at least one has
 *      a `lastSuccessfulSyncAt`. Strip shows "Fresh X ago · N sources."
 *      `freshAt` is the OLDEST among per-source `lastSuccessfulSyncAt`
 *      values — the conservative reading: "as of this point, every
 *      tracked source had reported in." Using the newest would flatter
 *      ("synced 2 minutes ago!") even when other sources are 12 hours
 *      old.
 *
 * `stale` and `unknown` per-source states are intentionally silent
 * here, mirroring the `<StatePill>` rule in `<SourceHealthRow>`:
 * neither demands user action. They count toward the source total
 * but don't trigger the elevated branch.
 *
 * The `empty` case (no sources connected) is handled by the
 * dashboard's existing `<EmptyState>`, so the trust strip never has
 * to render zero sources.
 */
export type TrustStripSummary =
  | { kind: 'no_signal'; sourceCount: number }
  | { kind: 'healthy'; sourceCount: number; freshAt: Date }
  | {
      kind: 'elevated';
      sourceCount: number;
      elevated: ElevatedRow[];
    };

export type ElevatedRow = {
  itemId: string;
  institutionName: string;
  reason: string;
};

const ELEVATED_STATES = new Set(['degraded', 'failed', 'needs_reconnect']);

export function summarizeTrustStrip(
  sources: Pick<
    SourceHealth,
    'itemId' | 'institutionName' | 'state' | 'reason' | 'lastSuccessfulSyncAt'
  >[],
): TrustStripSummary {
  const elevated: ElevatedRow[] = [];
  for (const s of sources) {
    if (ELEVATED_STATES.has(s.state)) {
      elevated.push({
        itemId: s.itemId,
        institutionName: s.institutionName ?? 'Unknown institution',
        // Cap verbose upstream error messages (e.g. SnapTrade SDK
        // dumping full HTTP response headers into err.message). Same
        // cap as `<SourceHealthRow>`'s summarizer — see MAX_REASON_LEN
        // in health-summary.ts. Full text remains in error_log.
        reason: truncateReason(s.reason),
      });
    }
  }

  if (elevated.length > 0) {
    return {
      kind: 'elevated',
      sourceCount: sources.length,
      elevated,
    };
  }

  const successTimes = sources
    .map((s) => s.lastSuccessfulSyncAt)
    .filter((d): d is Date => d !== null);

  if (successTimes.length === 0) {
    return { kind: 'no_signal', sourceCount: sources.length };
  }

  // Conservative anchor: oldest of the per-source lastSuccessfulSyncAt
  // values. "Fresh as of X" reads honestly when X is the WORST tracked
  // freshness across the strip, not the best.
  const freshAt = new Date(
    Math.min(...successTimes.map((d) => d.getTime())),
  );

  return {
    kind: 'healthy',
    sourceCount: sources.length,
    freshAt,
  };
}
