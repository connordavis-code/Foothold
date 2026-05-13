import type { SourceHealth } from '@/lib/db/queries/health';
import { formatRelative } from '@/lib/format/date';
import type { Provider } from '@/lib/sync/health';
import { summarizeSourceHealth } from '@/lib/sync/health-summary';
import { cn } from '@/lib/utils';
import { statePillKind } from './state-pill-kind';
import { DisconnectItemButton } from '@/components/plaid/disconnect-item-button';
import { ReconnectButton } from '@/components/plaid/reconnect-button';
import { SyncButton } from '@/components/plaid/sync-button';
import { SnaptradeReconnectButton } from '@/components/snaptrade/reconnect-button';

const PROVIDER_LABEL: Record<Provider, string> = {
  plaid: 'Plaid',
  snaptrade: 'SnapTrade',
};

/**
 * Header row for a connected source on /settings.
 *
 * Renders institution name + (optional) state pill + a secondary
 * line summarizing health, then the action buttons. The per-account
 * list rendered below each row is owned by the parent page — this
 * component is the institution-level header only.
 *
 * Visual restraint per DESIGN.md "Single-Hue Elevated Rule":
 * pills appear only for states that genuinely demand attention.
 * Healthy / stale / unknown / syncing render with no pill — the
 * secondary line carries enough signal. Amber for `degraded` and
 * `needs_reconnect`; destructive for hard `failed`.
 *
 * Action picker driven by `requiresUserAction` rather than raw
 * itemStatus: the health model is the source of truth for whether
 * the user must reconnect, so the button shape follows from it.
 */
export function SourceHealthRow({
  source,
  now = new Date(),
}: {
  source: SourceHealth;
  now?: Date;
}) {
  const summary = summarizeSourceHealth(source, now);
  const providerLabel = PROVIDER_LABEL[source.provider];

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium">
          <span className="truncate">
            {source.institutionName ?? 'Unknown institution'}
          </span>
          <StatePill state={source.state} />
        </p>
        <p className="mt-1 line-clamp-2 break-words text-xs text-muted-foreground">
          {providerLabel} · {summary}
        </p>
        {source.state !== 'healthy' && source.lastSuccessfulSyncAt && (
          // For elevated states, also show "last successful X ago" so
          // the operator knows how stale the underlying numbers are
          // without computing it from the reason string.
          <p className="mt-0.5 text-[11px] text-muted-foreground/70">
            Last successful sync {formatRelative(source.lastSuccessfulSyncAt, now)}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {source.requiresUserAction ? (
          // Plaid uses per-item update mode (Link token); SnapTrade
          // routes through the user-scoped Connection Portal. Two
          // genuinely different reconnect flows — branching here is
          // honest, not duplication.
          source.provider === 'snaptrade' ? (
            <SnaptradeReconnectButton />
          ) : (
            <ReconnectButton itemId={source.itemId} />
          )
        ) : (
          <SyncButton itemId={source.itemId} />
        )}
        <DisconnectItemButton
          itemId={source.itemId}
          institutionName={source.institutionName ?? 'this institution'}
          provider={source.provider}
        />
      </div>
    </div>
  );
}

function StatePill({ state }: { state: SourceHealth['state'] }) {
  // healthy / syncing / stale / unknown render as no-pill (the
  // secondary line carries the signal for stale + unknown; healthy
  // earns silence per the operator-tier intent).
  const kind = statePillKind(state);
  if (kind === 'caution') {
    return (
      <span
        className={cn(
          'inline-flex items-center rounded-full',
          'border bg-[var(--semantic-caution)]/10',
          'px-2 py-0.5 text-xs font-medium',
          'text-[var(--semantic-caution)]',
        )}
        style={{ borderColor: 'color-mix(in oklab, var(--semantic-caution) 50%, transparent)' }}
      >
        {state === 'degraded' ? 'Partial' : 'Reconnect'}
      </span>
    );
  }
  if (kind === 'destructive') {
    return (
      <span
        className={cn(
          'inline-flex items-center rounded-full',
          'border border-destructive/50 bg-destructive/10',
          'px-2 py-0.5 text-xs font-medium',
          'text-destructive',
        )}
      >
        Failed
      </span>
    );
  }
  return null;
}
