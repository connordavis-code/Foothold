import Link from 'next/link';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import type { SourceHealth } from '@/lib/db/queries/health';
import { summarizeTrustStrip } from '@/lib/sync/trust-strip';
import { formatRelative } from '@/lib/format/date';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Dashboard trust strip — sits above the hero card, summarizes
 * source-health into a single readable line.
 *
 * Render contract follows the locked design decisions:
 *
 *   - Healthy state: muted single line ("Fresh 5m ago · 5 sources").
 *     No border, no icon. Daily reassurance with near-zero visual
 *     cost. Earns silence on the headline number.
 *   - No-signal state (every source pre-first-sync): same muted
 *     line, copy is "Sync pending."
 *   - Elevated state (any source degraded/failed/needs_reconnect):
 *     amber-bordered block with AlertTriangle icon, sentence at N=1,
 *     mini-list at N≥2, "Open settings" CTA. Wraps below the message
 *     on `<sm`, sits to the right on `sm+`.
 *
 * Stale and unknown per-source states are intentionally silent here
 * — same restraint rule as `<SourceHealthRow>`'s state pill. Neither
 * demands user action.
 *
 * Body text uses regular foreground; amber tint is reserved for the
 * block border, icon, and tinted background. DESIGN.md "Single-Hue
 * Elevated Rule" — accent hue earns the attention budget; body copy
 * stays neutral so reasons remain legible.
 */
export function TrustStrip({
  sources,
  now = new Date(),
}: {
  sources: SourceHealth[];
  now?: Date;
}) {
  // The dashboard's <EmptyState> already handles zero-source case;
  // defensive return here keeps this component composable elsewhere.
  if (sources.length === 0) return null;

  const summary = summarizeTrustStrip(sources);

  if (summary.kind === 'healthy') {
    const sourceLabel = summary.sourceCount === 1 ? 'source' : 'sources';
    return (
      <p className="px-1 text-xs text-muted-foreground">
        Fresh {formatRelative(summary.freshAt, now)} · {summary.sourceCount}{' '}
        {sourceLabel}
      </p>
    );
  }

  if (summary.kind === 'quiet') {
    // "Synced" verb (not "Fresh") — at least one source is stale or
    // not yet reporting, so claiming "fresh" would contradict the
    // per-source classifier on /settings.
    const { sourceCount, reportingCount, syncedAt } = summary;
    const sourceLabel = sourceCount === 1 ? 'source' : 'sources';
    const countText =
      reportingCount < sourceCount
        ? `${reportingCount} of ${sourceCount} ${sourceLabel} reporting`
        : `${sourceCount} ${sourceLabel}`;
    return (
      <p className="px-1 text-xs text-muted-foreground">
        Synced {formatRelative(syncedAt, now)} · {countText}
      </p>
    );
  }

  if (summary.kind === 'no_signal') {
    const sourceLabel = summary.sourceCount === 1 ? 'source' : 'sources';
    return (
      <p className="px-1 text-xs text-muted-foreground">
        Sync pending · {summary.sourceCount} {sourceLabel}
      </p>
    );
  }

  const n = summary.elevated.length;
  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-card border px-4 py-3',
        'border-amber-500/50 bg-amber-500/5',
        'sm:flex-row sm:items-start sm:justify-between sm:gap-4',
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-2">
        <AlertTriangle
          className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400"
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          {n === 1 ? (
            <p className="break-words text-sm">
              <span className="font-medium">1 source needs attention:</span>{' '}
              {summary.elevated[0].institutionName},{' '}
              <span className="text-muted-foreground">
                {summary.elevated[0].reason}
              </span>
            </p>
          ) : (
            <>
              <p className="text-sm font-medium">
                {n} sources need attention:
              </p>
              <ul className="mt-1 space-y-0.5 text-sm">
                {summary.elevated.map((row) => (
                  <li key={row.itemId} className="break-words">
                    <span>{row.institutionName}</span>,{' '}
                    <span className="text-muted-foreground">{row.reason}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
      <Button asChild size="sm" variant="outline" className="self-start">
        <Link href="/settings" aria-label="Open settings to review source health">
          Open settings
          <ArrowRight className="ml-1 h-3.5 w-3.5" />
        </Link>
      </Button>
    </div>
  );
}
