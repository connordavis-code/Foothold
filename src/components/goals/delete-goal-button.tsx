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
import { deleteGoal } from '@/lib/goals/actions';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Props = {
  goalId: string;
  goalName: string;
};

/**
 * Confirmation-wrapped delete trigger for a single goal. Wraps the
 * deleteGoal server action behind a Radix AlertDialog so an accidental
 * click doesn't nuke a goal + its progress history. Sonner surfaces
 * success/failure; router.refresh re-renders the goals grid.
 */
export function DeleteGoalButton({ goalId, goalName }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const onConfirm = () => {
    startTransition(async () => {
      try {
        await deleteGoal(goalId);
        toast.success(`Deleted "${goalName}".`);
        setOpen(false);
        router.refresh();
      } catch {
        toast.error("Couldn't delete. Try again in a moment.");
      }
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-destructive"
        >
          Delete
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete &ldquo;{goalName}&rdquo;?</AlertDialogTitle>
          <AlertDialogDescription>
            This goal and its progress history will be removed. You&apos;ll
            need to recreate it from scratch if you want it back.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              // Prevent the dialog from closing before the transition finishes;
              // setOpen(false) runs in onConfirm's try block on success.
              e.preventDefault();
              onConfirm();
            }}
            disabled={isPending}
            className={cn(buttonVariants({ variant: 'destructive' }))}
          >
            {isPending ? 'Deleting…' : 'Delete goal'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
