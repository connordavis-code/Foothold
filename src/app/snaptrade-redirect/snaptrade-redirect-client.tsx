'use client';

import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
// syncItemAction lives in plaid/actions.ts but its body is provider-
// neutral (auth + ownership check + dispatcher). Importing here avoids
// adding a redundant wrapper. Will move to src/lib/sync/actions.ts when
// the planned provider-neutral file rename happens.
import { syncItemAction } from '@/lib/plaid/actions';
import { syncSnaptradeBrokeragesAction } from '@/lib/snaptrade/actions';

type Status =
  | { kind: 'reconciling' }
  | { kind: 'syncing'; addedCount: number }
  | { kind: 'done'; added: number; total: number; syncFailed: number }
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
      let reconcileResult: {
        added: number;
        total: number;
        newItemIds: string[];
      };
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

      if (reconcileResult.newItemIds.length === 0) {
        setStatus({
          kind: 'done',
          added: reconcileResult.added,
          total: reconcileResult.total,
          syncFailed: 0,
        });
        return;
      }

      // Run initial sync per item so the user sees positions on
      // /investments immediately. Best-effort: items are already
      // recorded and the nightly cron will pick up anything that
      // fails here, so a sync failure doesn't promote to error UI.
      // We surface a toast (matching the OAuth-redirect pattern) so
      // the user can retry from Settings if they care about the gap.
      setStatus({ kind: 'syncing', addedCount: reconcileResult.added });

      const results = await Promise.allSettled(
        reconcileResult.newItemIds.map((id) => syncItemAction(id)),
      );
      const syncFailed = results.filter(
        (r) => r.status === 'rejected',
      ).length;

      if (syncFailed > 0) {
        toast.error(
          syncFailed === 1
            ? 'Connected, but one initial sync failed. Use Sync now on Settings to retry.'
            : `Connected, but ${syncFailed} initial syncs failed. Use Sync now on Settings to retry.`,
        );
      }

      setStatus({
        kind: 'done',
        added: reconcileResult.added,
        total: reconcileResult.total,
        syncFailed,
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
              status.added === 0
                ? `${status.total} authorizations on file. Nothing changed.`
                : status.syncFailed === status.added
                  ? 'Initial sync failed — your data will load at the next scheduled refresh.'
                  : status.syncFailed > 0
                    ? 'Holdings partially loaded. Retry from Settings to top up the rest.'
                    : 'Holdings are loaded — open Investments to see them.'
            }
            cta={
              status.added > 0 && status.syncFailed < status.added ? (
                <div className="flex flex-col items-center gap-2">
                  <Button asChild>
                    <Link href="/investments">View investments</Link>
                  </Button>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href="/settings">Back to settings</Link>
                  </Button>
                </div>
              ) : (
                <Button asChild>
                  <Link href="/settings">Back to settings</Link>
                </Button>
              )
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
