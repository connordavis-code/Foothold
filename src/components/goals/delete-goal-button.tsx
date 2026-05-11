'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
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
  /** When true, renders as a 28px icon-only square (for use in <GoalCard> header). */
  iconOnly?: boolean;
};

/**
 * Confirmation-wrapped delete trigger for a single goal. Wraps the
 * deleteGoal server action behind a Radix AlertDialog so an accidental
 * click doesn't nuke a goal + its progress history. Sonner surfaces
 * success/failure; router.refresh re-renders the goals grid.
 */
export function DeleteGoalButton({ goalId, goalName, iconOnly }: Props) {
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
        {iconOnly ? (
          <button
            type="button"
            className="grid h-7 w-7 place-items-center rounded text-[--text-3] hover:bg-[--surface-2] hover:text-[--text]"
            aria-label={`Delete "${goalName}"`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-destructive"
          >
            Delete
          </Button>
        )}
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
