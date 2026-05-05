'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { syncAllItemsAction } from '@/lib/plaid/actions';
import { cn } from '@/lib/utils';

type Props = {
  lastSyncedAt: string | null; // ISO string — Date doesn't cross server→client cleanly
  reauthCount: number;
};

/**
 * Top-bar sync status. Two states:
 *  - reauthCount > 0: amber "Reconnect" pill linking to /settings.
 *    Replaces the old <ReauthBanner> taking 60–80px of vertical space.
 *  - else: neutral pill showing relative timestamp + click-to-sync.
 *    Pending state spins the icon; toast surfaces success/failure.
 */
export function SyncPill({ lastSyncedAt, reauthCount }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (reauthCount > 0) {
    const summary =
      reauthCount === 1 ? 'Reconnect bank' : `Reconnect ${reauthCount} banks`;
    return (
      <Link
        href="/settings"
        className={cn(
          'inline-flex items-center gap-2 rounded-pill px-3 py-1.5 text-xs font-medium transition-colors duration-fast ease-out-quart',
          'border border-amber-500/40 bg-amber-500/10 text-amber-700 hover:bg-amber-500/15',
          'dark:text-amber-300 dark:border-amber-400/30 dark:bg-amber-400/10',
        )}
      >
        <AlertTriangle className="h-3.5 w-3.5" />
        {summary}
      </Link>
    );
  }

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          try {
            const { synced, failed } = await syncAllItemsAction();
            if (failed > 0) {
              toast.error(
                `Synced ${synced}, ${failed} failed. Try /settings.`,
              );
            } else if (synced === 0) {
              toast('No banks connected yet.');
            } else {
              toast.success(
                synced === 1 ? 'Bank synced.' : `Synced ${synced} banks.`,
              );
            }
            router.refresh();
          } catch {
            toast.error('Sync failed. Try again in a minute.');
          }
        });
      }}
      className={cn(
        'inline-flex items-center gap-2 rounded-pill px-3 py-1.5 text-xs text-muted-foreground transition-colors duration-fast ease-out-quart',
        'border border-border bg-surface-elevated hover:text-foreground hover:border-foreground/20',
        'disabled:opacity-60 disabled:cursor-default',
      )}
      aria-label="Sync now"
    >
      <RefreshCw
        className={cn('h-3.5 w-3.5', isPending && 'animate-spin')}
      />
      <span className="font-mono tabular tracking-tight">
        {formatRelative(lastSyncedAt)}
      </span>
    </button>
  );
}

// Compact relative timestamps. Anything older than 24h shows the date —
// "synced 9d ago" reads as neglected for a daily-use tool, and a date
// is more honest about staleness.
function formatRelative(iso: string | null): string {
  if (!iso) return 'Never synced';
  const then = new Date(iso).getTime();
  const now = Date.now();
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 60) return 'Just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}
