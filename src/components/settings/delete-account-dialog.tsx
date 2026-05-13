'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { deleteAccountAction } from '@/lib/users/actions';

interface Props {
  userEmail: string;
}

export function DeleteAccountDialog({ userEmail }: Props) {
  const [open, setOpen] = useState(false);
  const [confirmInput, setConfirmInput] = useState('');
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const matches = confirmInput === userEmail;

  function onConfirm() {
    startTransition(async () => {
      const result = await deleteAccountAction({ confirmationEmail: confirmInput });
      if (result.ok) {
        toast.success('Account deleted.');
        router.push(result.data.redirectTo);
      } else {
        toast.error(result.error);
        setOpen(false);
      }
    });
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setConfirmInput('');
      }}
    >
      <AlertDialogTrigger asChild>
        <Button variant="destructive">Delete account</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete your account?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete your Foothold account and erase all
            data: transactions, connected institutions, goals, scenarios, and
            insights. You can&apos;t reverse this.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2 pt-2">
          <label className="text-xs text-muted-foreground" htmlFor="delete-confirm">
            Type your email to confirm:{' '}
            <span className="font-mono text-foreground">{userEmail}</span>
          </label>
          <Input
            id="delete-confirm"
            value={confirmInput}
            onChange={(e) => setConfirmInput(e.target.value)}
            placeholder={userEmail}
            autoComplete="off"
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={!matches || isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isPending ? 'Deleting…' : 'Delete account permanently'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
