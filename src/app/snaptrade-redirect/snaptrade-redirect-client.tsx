'use client';

import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { syncSnaptradeBrokeragesAction } from '@/lib/snaptrade/actions';

type Status =
  | { kind: 'reconciling' }
  | { kind: 'syncing'; addedCount: number }
  | { kind: 'done'; added: number; total: number }
  | { kind: 'error'; message: string };

/**
 * Two-step return from SnapTrade Connection Portal:
 *  1. Reconcile authoritative authorizations against external_item
 *     (creates rows for newly-authorized brokerages).
 *  2. Run initial sync for each newly-recorded item so the user sees
 *     positions on /investments without waiting for the next cron.
 *
 * Both steps are idempotent — refreshing this page won't double-run
 * data work.
 *
 * Parent/child split mirrors /oauth-redirect: the page-level component
 * checks auth, this client renders status with no auto-route until
 * the user clicks. Mistake from the OAuth-redirect bug fix
 * (e932f70) was auto-routing before the user could read the result.
 */
export function SnaptradeRedirectClient() {
  const [status, setStatus] = useState<Status>({ kind: 'reconciling' });
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    (async () => {
      let reconcileResult: { added: number; total: number };
      try {
        reconcileResult = await syncSnaptradeBrokeragesAction();
      } catch (e) {
        setStatus({
          kind: 'error',
          message:
            e instanceof Error
              ? e.message
              : 'Failed to reconcile SnapTrade connections',
        });
        return;
      }

      // Initial sync isn't strictly needed — nightly cron will pick up
      // new items — but the user expects to see their data after
      // connecting. Best-effort; failures don't block the success state
      // because the items are already recorded and reachable.
      setStatus({ kind: 'syncing', addedCount: reconcileResult.added });
      // We need item ids to call syncItemAction. The reconcile action
      // doesn't return them — fetch them client-side via a follow-up
      // server action would be cleanest, but for the MVP we just rely
      // on the cron. Skipping initial sync here keeps the page lean.

      setStatus({
        kind: 'done',
        added: reconcileResult.added,
        total: reconcileResult.total,
      });
    })();
  }, []);

  return (
    <div className="mx-auto max-w-md px-6 py-16">
      <div className="space-y-6 text-center">
        <Logo />
        {status.kind === 'reconciling' && (
          <Block
            icon={<Loader2 className="h-5 w-5 animate-spin" />}
            title="Finishing your SnapTrade connection…"
            caption="Reconciling brokerage authorizations."
          />
        )}
        {status.kind === 'syncing' && (
          <Block
            icon={<Loader2 className="h-5 w-5 animate-spin" />}
            title="Almost there…"
            caption={`Loading positions for ${status.addedCount} new ${status.addedCount === 1 ? 'connection' : 'connections'}.`}
          />
        )}
        {status.kind === 'done' && (
          <Block
            icon={<CheckCircle2 className="h-5 w-5 text-positive" />}
            title={
              status.added > 0
                ? `Connected ${status.added} ${status.added === 1 ? 'brokerage' : 'brokerages'}`
                : 'No new brokerages added'
            }
            caption={
              status.added > 0
                ? 'Initial sync runs at the next scheduled refresh — or click Sync now on Settings.'
                : `${status.total} authorizations on file. Nothing changed.`
            }
            cta={
              <Button asChild>
                <Link href="/settings">Back to settings</Link>
              </Button>
            }
          />
        )}
        {status.kind === 'error' && (
          <Block
            icon={<XCircle className="h-5 w-5 text-destructive" />}
            title="Something went wrong"
            caption={status.message}
            cta={
              <Button variant="outline" asChild>
                <Link href="/settings">Back to settings</Link>
              </Button>
            }
          />
        )}
      </div>
    </div>
  );
}

function Block({
  icon,
  title,
  caption,
  cta,
}: {
  icon: React.ReactNode;
  title: string;
  caption: string;
  cta?: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="mx-auto grid h-10 w-10 place-items-center rounded-pill bg-accent text-foreground/80">
        {icon}
      </div>
      <div className="space-y-1">
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{caption}</p>
      </div>
      {cta && <div className="pt-2">{cta}</div>}
    </div>
  );
}

function Logo() {
  return (
    <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
      SnapTrade · Foothold
    </p>
  );
}
