'use client';

import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  type PlaidLinkOnSuccessMetadata,
  usePlaidLink,
} from 'react-plaid-link';
import { Button } from '@/components/ui/button';
import { createLinkToken, exchangePublicToken } from '@/lib/plaid/actions';

/**
 * Client component that renders a "Connect a bank" button and drives the
 * Plaid Link flow. Steps:
 *   1. On mount, request a link_token from the server (via server action).
 *   2. Pass it to usePlaidLink — gives back `open()` and `ready`.
 *   3. When the user completes Link, onSuccess fires with a public_token.
 *   4. Hand it to the server action to exchange + persist the item.
 *   5. router.refresh() so the connected-institutions list re-renders.
 */
export function ConnectBankButton() {
  const router = useRouter();
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [exchanging, setExchanging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    createLinkToken()
      .then((token) => {
        if (!cancelled) setLinkToken(token);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message ?? 'Failed to start Plaid Link');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const onSuccess = useCallback(
    async (publicToken: string, metadata: PlaidLinkOnSuccessMetadata) => {
      setExchanging(true);
      try {
        await exchangePublicToken(publicToken, {
          institution_id: metadata.institution?.institution_id,
          institution_name: metadata.institution?.name,
        });
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to connect');
      } finally {
        setExchanging(false);
      }
    },
    [router],
  );

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
  });

  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        onClick={() => open()}
        disabled={!ready || !linkToken || exchanging}
      >
        <Plus className="h-4 w-4" />
        {exchanging ? 'Connecting…' : 'Connect a bank'}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
