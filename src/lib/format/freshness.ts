import { formatRelative } from './date';

export type FreshnessInput = {
  sources: Array<{ name: string; lastSyncAt: Date | null }>;
  now?: Date;
};

export type FreshnessText = {
  headline: string;
  caveat: string | null;
};

/** ≤ 12h per Phase 2 FRESHNESS_POLICY for balances; conservative default. */
const FRESH_WINDOW_MS = 12 * 60 * 60 * 1000;

/**
 * Canonical freshness pattern for R.2+. R.3 propagation contract — must
 * stay stable. Page-header, hero fineprint, and (later) section-level
 * freshness lines all read from this helper.
 *
 * Rules:
 *   - Empty sources: "No sources connected"
 *   - Any source never-synced: "Syncing · N sources" + caveat
 *   - All fresh: "Fresh Nh ago · N sources" — age = oldest source per
 *     Phase 5's conservative-anchor decision (don't flatter the freshest
 *     source while others lag)
 *   - Some stale: "Last sync Nh ago · N sources" — age = oldest
 */
export function formatFreshness(input: FreshnessInput): FreshnessText {
  const now = input.now ?? new Date();
  const { sources } = input;

  if (sources.length === 0) {
    return { headline: 'No sources connected', caveat: null };
  }

  const sourceLabel = sources.length === 1 ? 'source' : 'sources';

  const hasNeverSynced = sources.some((s) => s.lastSyncAt === null);
  if (hasNeverSynced) {
    return {
      headline: `Syncing · ${sources.length} ${sourceLabel}`,
      caveat: 'Numbers will fill in shortly',
    };
  }

  // All sources have a non-null lastSyncAt by here.
  const ages = sources.map((s) => now.getTime() - s.lastSyncAt!.getTime());
  const oldestAgeMs = Math.max(...ages);
  const oldestSync = new Date(now.getTime() - oldestAgeMs);

  const verb = oldestAgeMs <= FRESH_WINDOW_MS ? 'Fresh' : 'Last sync';

  return {
    headline: `${verb} ${formatRelative(oldestSync, now)} · ${sources.length} ${sourceLabel}`,
    caveat: null,
  };
}
