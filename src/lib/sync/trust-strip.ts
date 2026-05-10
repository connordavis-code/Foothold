import type { SourceHealth } from '@/lib/db/queries/health';
import { truncateReason } from '@/lib/sync/health-summary';

/**
 * Derived view-model for the dashboard trust strip. Pure — no DB,
 * no side effects. Consumes `getSourceHealth` output and reduces it
 * to one of four shapes the strip renders.
 *
 * Four kinds by precedence:
 *
 *   1. `elevated` — any source is `degraded`, `failed`, or
 *      `needs_reconnect`. The strip surfaces the offenders by name.
 *
 *   2. `no_signal` — every source is non-elevated AND no source has
 *      a successful sync timestamp yet (brand-new connections,
 *      pre-first-sync). Strip shows "Sync pending · N sources."
 *
 *   3. `healthy` — EVERY source state is literally `'healthy'`. Only
 *      then does the strip earn the word "Fresh." `freshAt` is the
 *      OLDEST per-source `lastSuccessfulSyncAt` — conservative
 *      anchor: "as of this point, every tracked source had reported
 *      in." Newest would flatter while other sources lag.
 *
 *   4. `quiet` — non-elevated but not all healthy. At least one
 *      source has reported successfully (`lastSuccessfulSyncAt`),
 *      and the rest are `stale` or `unknown` (silent per-source
 *      states that don't demand user action). The kind exists
 *      because rendering "Fresh X ago" while a source is classified
 *      `stale` is dishonest — `<StatePill>` would call it stale on
 *      /settings, the strip would call it fresh on /dashboard. The
 *      strip drops to "Synced X ago · N sources" (or "N of M sources
 *      reporting" when some have null `lastSuccessfulSyncAt`).
 *
 * `stale` and `unknown` per-source states are intentionally silent
 * here, mirroring the `<StatePill>` rule in `<SourceHealthRow>`:
 * neither demands user action. They count toward `sourceCount` but
 * don't trigger elevated; they DO downgrade `healthy` to `quiet`.
 *
 * The `empty` case (no sources connected) is handled by the
 * dashboard's existing `<EmptyState>`, so the trust strip never has
 * to render zero sources.
 */
export type TrustStripSummary =
  | { kind: 'no_signal'; sourceCount: number }
  | { kind: 'healthy'; sourceCount: number; freshAt: Date }
  | {
      kind: 'quiet';
      sourceCount: number;
      /** Sources with a non-null `lastSuccessfulSyncAt`. May be < sourceCount when some are `unknown` (never synced). */
      reportingCount: number;
      /** Oldest of the reporting sources' `lastSuccessfulSyncAt`. Same conservative anchor as `freshAt`. */
      syncedAt: Date;
    }
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
  // values. "X as of Y" reads honestly when Y is the WORST tracked
  // freshness across the strip, not the best.
  const oldestSuccess = new Date(
    Math.min(...successTimes.map((d) => d.getTime())),
  );

  // `healthy` requires EVERY source to be literally `'healthy'` —
  // otherwise "Fresh" would contradict the per-source classifier
  // (a stale source can't be fresh). Mixed silent states downgrade
  // to `quiet`.
  const allHealthy = sources.every((s) => s.state === 'healthy');
  if (allHealthy) {
    return {
      kind: 'healthy',
      sourceCount: sources.length,
      freshAt: oldestSuccess,
    };
  }

  return {
    kind: 'quiet',
    sourceCount: sources.length,
    reportingCount: successTimes.length,
    syncedAt: oldestSuccess,
  };
}
