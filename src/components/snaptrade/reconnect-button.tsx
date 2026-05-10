'use client';

import { Loader2, RotateCw } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { createSnaptradeConnectUrlAction } from '@/lib/snaptrade/actions';

/**
 * Reconnect a SnapTrade source. Asymmetric to Plaid's update-mode
 * flow: SnapTrade has no per-item update endpoint — re-authorization
 * routes through the same user-scoped Connection Portal that handles
 * new connections. The portal shows all the user's existing
 * brokerages and lets them re-authorize whichever one is broken.
 *
 * Hard navigation (window.location.href) because the portal needs a
 * top-level redirect (matches /connect-account-button's SnapTrade
 * branch).
 *
 * The component takes no itemId — the portal is user-scoped, not
 * connection-scoped. We rely on the user knowing which row they
 * clicked from to pick the right brokerage in the portal UI.
 */
export function SnaptradeReconnectButton() {
  const [isPending, startTransition] = useTransition();
  const [navigating, setNavigating] = useState(false);

  const handleClick = () => {
    startTransition(async () => {
      try {
        const url = await createSnaptradeConnectUrlAction();
        setNavigating(true);
        window.location.href = url;
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : 'Failed to open SnapTrade portal',
        );
      }
    });
  };

  const busy = isPending || navigating;

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={busy}
      aria-label="Reconnect SnapTrade brokerage"
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <RotateCw className="h-3.5 w-3.5" />
      )}
      Reconnect
    </Button>
  );
}
