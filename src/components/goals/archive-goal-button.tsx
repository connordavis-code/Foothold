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
import { Button, buttonVariants } from '@/components/ui/button';
import { setGoalArchived } from '@/lib/goals/actions';
import { cn } from '@/lib/utils';

type Props = {
  goalId: string;
  goalName: string;
  /** True when the goal is currently archived; the button becomes Restore. */
  isArchived: boolean;
};

/**
 * Archive ↔ Restore toggle for a single goal. Soft-archive (flips
 * isActive=false) is the non-destructive sibling to <DeleteGoalButton>.
 *
 * Confirmation is gated through AlertDialog so accidental clicks don't
 * silently move a goal off the leaderboard. Restore is the inverse and
 * intentionally NOT confirmed (cheap to undo by re-archiving).
 */
export function ArchiveGoalButton({ goalId, goalName, isArchived }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const onArchive = () => {
    startTransition(async () => {
      try {
        await setGoalArchived(goalId, true);
        toast.success(`Archived "${goalName}".`, {
          action: {
            label: 'Undo',
            onClick: async () => {
              try {
                await setGoalArchived(goalId, false);
                toast.success('Restored.');
                router.refresh();
              } catch {
                toast.error('Undo failed.');
              }
            },
          },
        });
        setOpen(false);
        router.refresh();
      } catch {
        toast.error("Couldn't archive. Try again in a moment.");
      }
    });
  };

  const onRestore = () => {
    startTransition(async () => {
      try {
        await setGoalArchived(goalId, false);
        toast.success(`Restored "${goalName}".`);
        router.refresh();
      } catch {
        toast.error("Couldn't restore. Try again in a moment.");
      }
    });
  };

  if (isArchived) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground hover:text-foreground"
        onClick={onRestore}
        disabled={isPending}
      >
        {isPending ? 'Restoring…' : 'Restore'}
      </Button>
    );
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-foreground"
        >
          Archive
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Archive &ldquo;{goalName}&rdquo;?</AlertDialogTitle>
          <AlertDialogDescription>
            This goal will move out of your active leaderboard into the
            Archived section. Progress history is preserved — you can
            restore it any time.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              onArchive();
            }}
            disabled={isPending}
            className={cn(buttonVariants({ variant: 'default' }))}
          >
            {isPending ? 'Archiving…' : 'Archive goal'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
