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
 * OAuth re-entry client. Reads the original link_token + intent from
 * sessionStorage (set by ConnectBankButton or ReconnectButton before
 * Link opened), re-instantiates Plaid Link with
 * `receivedRedirectUri: window.location.href`, and auto-opens to
 * complete the OAuth round-trip.
 *
 * Two intents:
 *  - 'connect': new item — exchange public_token, sync, route /settings
 *  - 'reconnect': update mode — markItemReconnected (no exchange),
 *    route /settings
 *
 * Failure modes (no handoff in storage, Link errors, action errors):
 * surface a non-blocking error message + a Back-to-Settings link so
 * the user can retry from the canonical surface.
 */
export function OAuthRedirectClient() {
  const router = useRouter();
  const [handoff, setHandoff] = useState<OAuthHandoff | null>(null);
  const [phase, setPhase] = useState<
    'reading' | 'opening' | 'exchanging' | 'syncing' | 'reconnecting' | 'done' | 'error'
  >('reading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Read handoff once on mount. If missing, the user landed here
  // without an active connect — surface a friendly error.
  useEffect(() => {
    const loaded = loadOAuthHandoff();
    if (!loaded) {
      setErrorMessage(
        'Could not find your in-progress connection. Try Connect again from Settings.',
      );
      setPhase('error');
      return;
    }
    setHandoff(loaded);
    setPhase('opening');
  }, []);

  const onSuccess = useCallback(
    async (publicToken: string, metadata: PlaidLinkOnSuccessMetadata) => {
      if (!handoff) return;
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
          setErrorMessage(
            e instanceof Error ? e.message : 'Failed to connect',
          );
          setPhase('error');
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
          setErrorMessage(
            e instanceof Error ? e.message : 'Reconnect failed',
          );
          setPhase('error');
          return;
        }
        setPhase('done');
        router.push('/settings');
        router.refresh();
      }
    },
    [handoff, router],
  );

  const onExit = useCallback(() => {
    // User dismissed Link without completing — clear the handoff so a
    // fresh attempt from /settings starts clean. Bounce them back.
    clearOAuthHandoff();
    router.push('/settings');
  }, [router]);

  const { open, ready } = usePlaidLink({
    token: handoff?.linkToken ?? null,
    receivedRedirectUri:
      typeof window !== 'undefined' ? window.location.href : undefined,
    onSuccess,
    onExit,
  });

  // Auto-open Plaid Link the moment usePlaidLink reports ready and we
  // have a handoff. Plaid takes the OAuth state from
  // `receivedRedirectUri` and finishes inline.
  useEffect(() => {
    if (phase === 'opening' && ready && handoff) {
      open();
    }
  }, [phase, ready, handoff, open]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      {phase === 'error' ? (
        <>
          <h1 className="text-lg font-semibold tracking-tight">
            Connection couldn&apos;t finish
          </h1>
          <p className="text-sm text-muted-foreground">
            {errorMessage ?? 'Something went wrong during the bank handoff.'}
          </p>
          <Button asChild>
            <Link href="/settings">Back to Settings</Link>
          </Button>
        </>
      ) : (
        <>
          <div
            aria-hidden
            className="h-1 w-32 overflow-hidden rounded-full bg-muted"
          >
            <div className="h-full w-1/2 animate-pulse bg-foreground/60" />
          </div>
          <p className="text-sm text-muted-foreground">{phaseLabel(phase)}</p>
        </>
      )}
    </div>
  );
}

function phaseLabel(phase: string): string {
  switch (phase) {
    case 'reading':
      return 'Picking up where you left off…';
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
    default:
      return 'Working…';
  }
}
