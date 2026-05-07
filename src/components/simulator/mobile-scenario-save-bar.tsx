'use client';

import { Trash2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Drawer } from 'vaul';
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
import { Input } from '@/components/ui/input';
import type { Scenario } from '@/lib/db/schema';
import {
  createScenario,
  deleteScenario,
  updateScenario,
} from '@/lib/forecast/scenario-actions';
import type { ScenarioOverrides } from '@/lib/forecast/types';
import { cn } from '@/lib/utils';

type Props = {
  scenarios: Scenario[];
  selectedScenarioId: string | null;
  liveOverrides: ScenarioOverrides;
  isDirty: boolean;
  onSelect: (id: string | null) => void;
};

/**
 * Mobile-only sticky save bar. Pinned `bottom-14` so it sits directly
 * above the 56px tab bar; safe-area inset handled by the bar's own
 * padding. Always visible — Save is disabled when nothing to save so
 * the user has a stable reference point for where save lives.
 *
 * "Save as…" (no scenario selected) opens a vaul Drawer with an
 * inline name input rather than a window.prompt or inline transform,
 * matching the rest of the mobile sheet vocabulary
 * (TransactionDetailSheet, MobileFilterSheet, More drawer).
 *
 * Hidden at md+ — desktop uses the action cluster in ScenarioHeader.
 */
export function MobileScenarioSaveBar({
  scenarios,
  selectedScenarioId,
  liveOverrides,
  isDirty,
  onSelect,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const selected = scenarios.find((s) => s.id === selectedScenarioId) ?? null;

  // Focus the name field as soon as the drawer opens.
  useEffect(() => {
    if (saveAsOpen) {
      setNameDraft('');
      // requestAnimationFrame because vaul focus-traps after mount.
      const r = requestAnimationFrame(() => nameInputRef.current?.focus());
      return () => cancelAnimationFrame(r);
    }
  }, [saveAsOpen]);

  const handleSave = () => {
    if (!isDirty || isPending) return;
    if (selected) {
      startTransition(async () => {
        const result = await updateScenario({
          id: selected.id,
          overrides: liveOverrides,
        });
        if (result.ok) {
          toast.success('Saved.');
          router.refresh();
        } else {
          toast.error(result.error);
        }
      });
    } else {
      setSaveAsOpen(true);
    }
  };

  const persistCreate = () => {
    const name = nameDraft.trim();
    if (!name) {
      toast.error("Name can't be empty.");
      return;
    }
    startTransition(async () => {
      const result = await createScenario({ name, overrides: liveOverrides });
      if (result.ok) {
        toast.success(`Saved "${name}".`);
        setSaveAsOpen(false);
        onSelect(result.data.id);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  const handleReset = () => {
    onSelect(selectedScenarioId);
  };

  const performDelete = () => {
    if (!selected) return;
    startTransition(async () => {
      const result = await deleteScenario({ id: selected.id });
      if (result.ok) {
        toast.success('Deleted.');
        setConfirmDeleteOpen(false);
        onSelect(null);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <>
      <div
        role="region"
        aria-label="Scenario actions"
        className={cn(
          // bottom-14 = above the 56px MobileTabBar; safe-area handled
          // by tab bar's own pb-[env(safe-area-inset-bottom)] so this
          // bar sits directly on top of it.
          'fixed inset-x-0 bottom-14 z-30 flex items-center gap-2 border-t border-border bg-surface-elevated/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-surface-elevated/80',
          'md:hidden',
        )}
      >
        <Button
          variant="ghost"
          onClick={handleReset}
          disabled={!isDirty || isPending}
          className="px-3"
        >
          Reset
        </Button>
        <Button
          onClick={handleSave}
          disabled={!isDirty || isPending}
          className="flex-1"
        >
          {isPending && !saveAsOpen
            ? 'Saving…'
            : selected
              ? 'Save'
              : 'Save as…'}
        </Button>
        {selected && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setConfirmDeleteOpen(true)}
            disabled={isPending}
            aria-label="Delete scenario"
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-5 w-5" />
          </Button>
        )}
      </div>

      <Drawer.Root open={saveAsOpen} onOpenChange={setSaveAsOpen}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-40 bg-foreground/40 backdrop-blur-[2px]" />
          <Drawer.Content
            aria-describedby={undefined}
            className={cn(
              'fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col',
              'rounded-t-card border-t border-border bg-surface-elevated',
              'pb-[env(safe-area-inset-bottom)]',
              'outline-none',
            )}
          >
            <div
              aria-hidden
              className="mx-auto mt-2 h-1 w-10 rounded-full bg-muted"
            />
            <header className="flex items-center justify-between px-5 py-3">
              <Drawer.Title className="text-sm font-semibold">
                Save scenario
              </Drawer.Title>
              <Drawer.Close asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Cancel"
                  disabled={isPending}
                >
                  <X className="h-5 w-5" />
                </Button>
              </Drawer.Close>
            </header>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                persistCreate();
              }}
              className="flex flex-col gap-3 px-5 pb-5"
            >
              <label className="flex flex-col gap-1.5">
                <span className="text-eyebrow">Name</span>
                <Input
                  ref={nameInputRef}
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  placeholder="e.g. Tight December"
                  maxLength={120}
                  disabled={isPending}
                  className="h-11"
                />
              </label>
              <Button type="submit" disabled={isPending} className="h-11">
                {isPending ? 'Saving…' : 'Save scenario'}
              </Button>
            </form>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>

      <AlertDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete &ldquo;{selected?.name ?? ''}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This scenario&apos;s overrides and any cached AI summary will
              be removed. The baseline forecast and your real goals are
              untouched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                performDelete();
              }}
              disabled={isPending}
              className={cn(buttonVariants({ variant: 'destructive' }))}
            >
              {isPending ? 'Deleting…' : 'Delete scenario'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
