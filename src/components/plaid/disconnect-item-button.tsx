'use client';

import { Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button, buttonVariants } from '@/components/ui/button';
import { disconnectExternalItemAction } from '@/lib/sync/actions';
import { cn } from '@/lib/utils';

/**
 * Disconnect a Plaid item. Destructive — removes the institution from
 * Plaid AND deletes every local row tied to it (accounts, transactions,
 * holdings, investment txns, recurring streams). Cascade chain in
 * schema.ts handles the dependent rows.
 *
 * Gates the action behind an AlertDialog (matches the /goals + /simulator
 * delete pattern). Toast on success/failure; router.refresh() so the
 * institutions list updates.
 */
export function DisconnectItemButton({
  itemId,
  institutionName,
}: {
  itemId: string;
  institutionName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleConfirm = () => {
    startTransition(async () => {
      try {
        await disconnectExternalItemAction(itemId);
        toast.success(`Disconnected ${institutionName}.`);
        setOpen(false);
        router.refresh();
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : 'Disconnect failed.',
        );
      }
    });
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        disabled={isPending}
        aria-label={`Disconnect ${institutionName}`}
        className="text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="h-4 w-4" />
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Disconnect {institutionName}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the institution and every account,
              transaction, holding, and recurring stream it provided.
              Plaid&apos;s connection will be revoked. To get this data
              back later you&apos;ll need to reconnect via Plaid Link
              and resync from scratch.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleConfirm();
              }}
              disabled={isPending}
              className={cn(buttonVariants({ variant: 'destructive' }))}
            >
              {isPending ? 'Disconnecting…' : 'Disconnect'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
