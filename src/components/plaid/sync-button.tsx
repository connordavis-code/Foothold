'use client';

import { RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { syncItemAction } from '@/lib/plaid/actions';

type Status =
  | { kind: 'idle' }
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string };

export function SyncButton({ itemId }: { itemId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  function onClick() {
    setStatus({ kind: 'idle' });
    startTransition(async () => {
      try {
        const result = await syncItemAction(itemId);
        let parts: string[];
        if (result.provider === 'plaid') {
          const s = result.summary;
          parts = [`${s.accounts} accounts`];
          const t = s.transactions;
          if (t.added || t.modified || t.removed) {
            parts.push(`${t.added} new tx, ${t.modified} updated, ${t.removed} removed`);
          }
          if (s.investments.holdings || s.investments.transactions) {
            parts.push(
              `${s.investments.holdings} holdings, ${s.investments.transactions} inv tx`,
            );
          }
          if (s.recurring.inflows || s.recurring.outflows) {
            parts.push(`${s.recurring.outflows} subs, ${s.recurring.inflows} income streams`);
          }
        } else {
          // SnapTrade: brokerage-only data, no transactions/recurring
          const s = result.summary;
          parts = [`${s.accounts} accounts`];
          if (s.holdings || s.activities) {
            parts.push(`${s.holdings} holdings, ${s.activities} activities`);
          }
        }
        setStatus({ kind: 'success', message: parts.join(' · ') });
        router.refresh();
      } catch (e) {
        setStatus({
          kind: 'error',
          message: e instanceof Error ? e.message : 'Sync failed',
        });
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="outline"
        size="sm"
        onClick={onClick}
        disabled={isPending}
      >
        <RefreshCw
          className={`h-3.5 w-3.5 ${isPending ? 'animate-spin' : ''}`}
        />
        {isPending ? 'Syncing…' : 'Sync'}
      </Button>
      {status.kind === 'success' && (
        <p className="text-xs text-muted-foreground">{status.message}</p>
      )}
      {status.kind === 'error' && (
        <p className="text-xs text-destructive">{status.message}</p>
      )}
    </div>
  );
}
