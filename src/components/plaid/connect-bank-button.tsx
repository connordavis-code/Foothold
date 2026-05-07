'use client';

import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  type PlaidLinkOnSuccessMetadata,
  usePlaidLink,
} from 'react-plaid-link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  createLinkToken,
  exchangePublicToken,
  syncItemAction,
} from '@/lib/plaid/actions';
import {
  clearOAuthHandoff,
  saveOAuthHandoff,
} from '@/lib/plaid/oauth-handoff';

type Status = 'idle' | 'exchanging' | 'syncing';

/**
 * Client component that renders a "Connect a bank" button and drives the
 * Plaid Link flow. Steps:
 *   1. On mount, request a link_token from the server (via server action).
 *   2. Pass it to usePlaidLink — gives back `open()` and `ready`.
 *   3. When the user completes Link, onSuccess fires with a public_token.
 *   4. exchangePublicToken: encrypt + persist the item (returns itemId).
 *      Plaintext access_token lives in JS scope only for this step (~50ms).
 *   5. syncItemAction: re-decrypts the token from DB and runs the
 *      ~30s initial backfill. Decoupled from step 4 to shrink the
 *      first-time-seen-plaintext heap window — closes review W-04.
 *   6. router.refresh() so the connected-institutions list re-renders.
 *
 * Sync failure mode: the item is connected but has no data. We toast
 * the user; they can retry via the Sync now control on /settings (or
 * the next scheduled sync cron picks it up).
 */
export function ConnectBankButton() {
  const router = useRouter();
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('idle');
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
      // Successful Link end-state — no OAuth re-entry needed for this
      // flow. Clear the handoff so a future connect doesn't see stale
      // data. (For OAuth banks the /oauth-redirect re-entry path also
      // clears it on its own success.)
      clearOAuthHandoff();
      setStatus('exchanging');
      let itemId: string;
      try {
        const result = await exchangePublicToken(publicToken, {
          institution_id: metadata.institution?.institution_id,
          institution_name: metadata.institution?.name,
        });
        itemId = result.itemId;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to connect');
        setStatus('idle');
        return;
      }

      setStatus('syncing');
      try {
        await syncItemAction(itemId);
      } catch {
        // Item is connected; backfill failed. Don't block the user.
        toast.error(
          'Connected, but initial sync failed. Use Sync now on Settings to retry.',
        );
      } finally {
        setStatus('idle');
        router.refresh();
      }
    },
    [router],
  );

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
  });

  const handleOpen = useCallback(() => {
    if (!linkToken) return;
    // Persist the link_token so /oauth-redirect can re-instantiate Link
    // with the same token after the institution OAuth round-trip. No-op
    // for non-OAuth banks (Link finishes inline; clearOAuthHandoff in
    // onSuccess wipes the unused entry).
    saveOAuthHandoff({ linkToken, intent: { kind: 'connect' } });
    open();
  }, [linkToken, open]);

  const busy = status !== 'idle';
  const label =
    status === 'exchanging'
      ? 'Connecting…'
      : status === 'syncing'
        ? 'Loading your data…'
        : 'Connect a bank';

  return (
    <div className="flex flex-col items-end gap-2">
      <Button onClick={handleOpen} disabled={!ready || !linkToken || busy}>
        <Plus className="h-4 w-4" />
        {label}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
