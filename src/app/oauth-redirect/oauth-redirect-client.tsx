'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  type PlaidLinkOnSuccessMetadata,
  usePlaidLink,
} from 'react-plaid-link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  exchangePublicToken,
  markItemReconnected,
  syncItemAction,
} from '@/lib/plaid/actions';
import {
  type OAuthHandoff,
  clearOAuthHandoff,
  loadOAuthHandoff,
} from '@/lib/plaid/oauth-handoff';

/**
 * OAuth re-entry client. Two-component split:
 *
 *  - `OAuthRedirectClient` (this) handles handoff loading + the
 *    error / loading UI. Does NOT call usePlaidLink, so visiting the
 *    page directly (no handoff in storage) renders the error block
 *    cleanly with no side-effects.
 *  - `LinkRunner` is mounted only when a handoff is present. It
 *    owns the usePlaidLink call, the receivedRedirectUri, and the
 *    onSuccess / onExit handlers. This isolates the library's
 *    init-time onExit-on-failure behavior — without the split, the
 *    error UI would briefly paint then onExit would push the user
 *    to /settings before they could click anything.
 */
export function OAuthRedirectClient() {
  const [handoff, setHandoff] = useState<OAuthHandoff | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const loaded = loadOAuthHandoff();
    if (!loaded) {
      setErrorMessage(
        'Could not find your in-progress connection. Try Connect again from Settings.',
      );
      return;
    }
    setHandoff(loaded);
  }, []);

  if (errorMessage) {
    return <ErrorPanel message={errorMessage} />;
  }

  if (!handoff) {
    return <LoadingPanel label="Picking up where you left off…" />;
  }

  return (
    <LinkRunner handoff={handoff} onError={setErrorMessage} />
  );
}

type LinkPhase = 'opening' | 'exchanging' | 'syncing' | 'reconnecting' | 'done';

function LinkRunner({
  handoff,
  onError,
}: {
  handoff: OAuthHandoff;
  onError: (msg: string) => void;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<LinkPhase>('opening');

  const onSuccess = useCallback(
    async (publicToken: string, metadata: PlaidLinkOnSuccessMetadata) => {
      clearOAuthHandoff();

      if (handoff.intent.kind === 'connect') {
        setPhase('exchanging');
        let itemId: string;
        try {
          const result = await exchangePublicToken(publicToken, {
            institution_id: metadata.institution?.institution_id,
            institution_name: metadata.institution?.name,
          });
          itemId = result.itemId;
        } catch (e) {
          onError(e instanceof Error ? e.message : 'Failed to connect');
          return;
        }

        setPhase('syncing');
        try {
          await syncItemAction(itemId);
        } catch {
          toast.error(
            'Connected, but initial sync failed. Use Sync now on Settings to retry.',
          );
        }
        setPhase('done');
        router.push('/settings');
        router.refresh();
      } else {
        setPhase('reconnecting');
        try {
          await markItemReconnected(handoff.intent.itemId);
        } catch (e) {
          onError(e instanceof Error ? e.message : 'Reconnect failed');
          return;
        }
        setPhase('done');
        router.push('/settings');
        router.refresh();
      }
    },
    [handoff, onError, router],
  );

  const onExit = useCallback(() => {
    // User dismissed Link before completing. Wipe the handoff so a
    // fresh attempt from /settings starts clean, then bounce them
    // back. Distinct from the error path — onExit runs only when
    // Link actually opened (token + URL state both valid).
    clearOAuthHandoff();
    router.push('/settings');
  }, [router]);

  const { open, ready } = usePlaidLink({
    token: handoff.linkToken,
    receivedRedirectUri:
      typeof window !== 'undefined' ? window.location.href : undefined,
    onSuccess,
    onExit,
  });

  // Auto-open the moment usePlaidLink reports ready. Plaid takes the
  // OAuth state from `receivedRedirectUri` and finishes inline.
  useEffect(() => {
    if (phase === 'opening' && ready) {
      open();
    }
  }, [phase, ready, open]);

  return <LoadingPanel label={phaseLabel(phase)} />;
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <h1 className="text-lg font-semibold tracking-tight">
        Connection couldn&apos;t finish
      </h1>
      <p className="text-sm text-muted-foreground">{message}</p>
      <Button asChild>
        <Link href="/settings">Back to Settings</Link>
      </Button>
    </div>
  );
}

function LoadingPanel({ label }: { label: string }) {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <div
        aria-hidden
        className="h-1 w-32 overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full w-1/2 animate-pulse bg-foreground/60" />
      </div>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

function phaseLabel(phase: LinkPhase): string {
  switch (phase) {
    case 'opening':
      return 'Finishing the bank handoff…';
    case 'exchanging':
      return 'Connecting your account…';
    case 'syncing':
      return 'Loading your data…';
    case 'reconnecting':
      return 'Restoring your connection…';
    case 'done':
      return 'All set. Redirecting…';
  }
}
