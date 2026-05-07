'use client';

import { Building2, LineChart, Loader2, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  type PlaidLinkOnSuccessMetadata,
  usePlaidLink,
} from 'react-plaid-link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  createLinkToken,
  exchangePublicToken,
  syncItemAction,
} from '@/lib/plaid/actions';
import {
  clearOAuthHandoff,
  saveOAuthHandoff,
} from '@/lib/plaid/oauth-handoff';
import { createSnaptradeConnectUrlAction } from '@/lib/snaptrade/actions';

/**
 * Unified provider-picker connect button. Replaces the Plaid-only
 * ConnectBankButton — clicking opens a small dialog with two options:
 *
 *  - Bank / credit card → Plaid Link (existing flow, kept inline here
 *    so the Link token can be minted on mount and ready when the user
 *    picks).
 *  - Brokerage → SnapTrade Connection Portal (server action mints
 *    a redirectURI; we navigate to it).
 *
 * `snaptradeEnabled` is computed server-side via `snaptradeConfigured()`
 * and passed in as a prop — when false, the brokerage option is hidden.
 */
export function ConnectAccountButton({
  snaptradeEnabled,
}: {
  snaptradeEnabled: boolean;
}) {
  const router = useRouter();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [busy, setBusy] = useState<'idle' | 'plaid' | 'snaptrade' | 'syncing'>(
    'idle',
  );
  const [error, setError] = useState<string | null>(null);

  // Mint the Plaid link_token eagerly so usePlaidLink is ready by the
  // time the user picks. Lazy-minting on click adds ~500-1000ms of
  // perceived latency.
  useEffect(() => {
    let cancelled = false;
    createLinkToken()
      .then((t) => {
        if (!cancelled) setLinkToken(t);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message ?? 'Failed to start Plaid Link');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const onPlaidSuccess = useCallback(
    async (publicToken: string, metadata: PlaidLinkOnSuccessMetadata) => {
      clearOAuthHandoff();
      setBusy('plaid');
      let itemId: string;
      try {
        const result = await exchangePublicToken(publicToken, {
          institution_id: metadata.institution?.institution_id,
          institution_name: metadata.institution?.name,
        });
        itemId = result.itemId;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to connect');
        setBusy('idle');
        return;
      }

      setBusy('syncing');
      try {
        await syncItemAction(itemId);
      } catch {
        toast.error(
          'Connected, but initial sync failed. Use Sync now on Settings to retry.',
        );
      } finally {
        setBusy('idle');
        setPickerOpen(false);
        router.refresh();
      }
    },
    [router],
  );

  const { open: openPlaid, ready: plaidReady } = usePlaidLink({
    token: linkToken,
    onSuccess: onPlaidSuccess,
  });

  const onPickPlaid = useCallback(() => {
    if (!linkToken) return;
    saveOAuthHandoff({ linkToken, intent: { kind: 'connect' } });
    setPickerOpen(false);
    openPlaid();
  }, [linkToken, openPlaid]);

  const onPickSnaptrade = useCallback(async () => {
    setBusy('snaptrade');
    setError(null);
    try {
      const url = await createSnaptradeConnectUrlAction();
      // Hard navigation — SnapTrade's portal needs a top-level redirect.
      window.location.href = url;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to open SnapTrade');
      setBusy('idle');
    }
  }, []);

  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        onClick={() => setPickerOpen(true)}
        disabled={!plaidReady || !linkToken || busy !== 'idle'}
      >
        <Plus className="h-4 w-4" />
        {busy === 'plaid' || busy === 'syncing'
          ? busy === 'plaid'
            ? 'Connecting…'
            : 'Loading your data…'
          : busy === 'snaptrade'
            ? 'Opening SnapTrade…'
            : 'Add account'}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add an account</DialogTitle>
            <DialogDescription>
              Pick how you want to connect.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 pt-2">
            <ProviderOption
              icon={<Building2 className="h-5 w-5" />}
              title="Bank or credit card"
              caption="Checking, savings, credit cards. Powered by Plaid."
              onClick={onPickPlaid}
              disabled={busy !== 'idle'}
            />
            {snaptradeEnabled && (
              <ProviderOption
                icon={<LineChart className="h-5 w-5" />}
                title="Brokerage"
                caption="Fidelity, Schwab, Robinhood, etc. Powered by SnapTrade."
                onClick={onPickSnaptrade}
                disabled={busy !== 'idle'}
                trailing={busy === 'snaptrade' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProviderOption({
  icon,
  title,
  caption,
  onClick,
  disabled,
  trailing,
}: {
  icon: React.ReactNode;
  title: string;
  caption: string;
  onClick: () => void;
  disabled?: boolean;
  trailing?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group flex items-center gap-3 rounded-card border border-border bg-surface-elevated p-3 text-left transition-colors duration-fast ease-out-quart hover:bg-surface-sunken/60 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <span className="grid h-9 w-9 place-items-center rounded-pill bg-accent text-foreground/80">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{caption}</p>
      </div>
      {trailing}
    </button>
  );
}
