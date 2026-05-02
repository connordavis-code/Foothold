'use client';

import { Link2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, useTransition } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import { Button } from '@/components/ui/button';
import {
  createLinkTokenForUpdate,
  markItemReconnected,
} from '@/lib/plaid/actions';

/**
 * Drives Plaid Link in update mode for an item that needs reauth. Update
 * mode keeps the existing access_token — no public-token exchange. On
 * success we optimistically flip status + sync via `markItemReconnected`
 * so the UI shows green without waiting on the LOGIN_REPAIRED webhook.
 */
export function ReconnectButton({ itemId }: { itemId: string }) {
  const router = useRouter();
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    createLinkTokenForUpdate(itemId)
      .then((token) => {
        if (!cancelled) setLinkToken(token);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to start Plaid Link');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [itemId]);

  const onSuccess = useCallback(() => {
    startTransition(async () => {
      try {
        await markItemReconnected(itemId);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Reconnect failed');
      }
    });
  }, [itemId, router]);

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
  });

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="outline"
        size="sm"
        onClick={() => open()}
        disabled={!ready || !linkToken || isPending}
      >
        <Link2 className="h-3.5 w-3.5" />
        {isPending ? 'Reconnecting…' : 'Reconnect'}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
