import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Item = {
  id: string;
  institutionName: string | null;
  status: string;
};

/**
 * Surfaces Plaid items that aren't `active` (login_required, error, etc.)
 * so the user knows transactions/balances may be stale. Renders nothing
 * when all items are healthy. Status text is intentionally non-technical.
 */
export function ReauthBanner({ items }: { items: Item[] }) {
  if (items.length === 0) return null;

  const summary =
    items.length === 1
      ? `${items[0].institutionName ?? 'A connected bank'} needs to be reconnected`
      : `${items.length} connected banks need to be reconnected`;

  return (
    <div className="rounded-md border border-amber-500/50 bg-amber-500/10 px-4 py-3 flex items-start gap-3">
      <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{summary}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          New transactions and balances will be paused until you reconnect.
        </p>
      </div>
      <Button variant="outline" size="sm" asChild>
        <Link href="/settings">Reconnect</Link>
      </Button>
    </div>
  );
}

/**
 * Human-readable label for each status value. Kept here (not in schema)
 * because it's UI copy — schema cares about machine values.
 */
export function statusLabel(status: string): string {
  switch (status) {
    case 'login_required':
      return 'Login required';
    case 'pending_expiration':
      return 'Expiring soon';
    case 'permission_revoked':
      return 'Access revoked';
    case 'error':
      return 'Connection error';
    case 'active':
      return 'Active';
    default:
      return status;
  }
}
