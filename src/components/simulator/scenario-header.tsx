'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  createScenario,
  deleteScenario,
  updateScenario,
} from '@/lib/forecast/scenario-actions';
import type { Scenario } from '@/lib/db/schema';
import type { ScenarioOverrides } from '@/lib/forecast/types';
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
import { cn } from '@/lib/utils';

type Props = {
  scenarios: Scenario[];
  selectedScenarioId: string | null;
  liveOverrides: ScenarioOverrides;
  isDirty: boolean;
  onSelect: (id: string | null) => void;
};

/**
 * Top-of-page header. Scenario name + selector + actions.
 *
 * Save semantics:
 *   - No scenario selected (baseline): inline name input → createScenario.
 *   - Scenario selected and dirty: updateScenario in place.
 *
 * Sonner surfaces success/failure toasts; AlertDialog gates Delete.
 * After mutation, router.refresh() re-fetches the scenarios list. The
 * Save button doubles as a Cmd/Ctrl+S target via document keydown.
 */
export function ScenarioHeader({
  scenarios,
  selectedScenarioId,
  liveOverrides,
  isDirty,
  onSelect,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const selected = scenarios.find((s) => s.id === selectedScenarioId) ?? null;

  // Focus the name input the moment it appears so the user can just type.
  useEffect(() => {
    if (nameDraft !== null) nameInputRef.current?.focus();
  }, [nameDraft]);

  const persistUpdate = (id: string) => {
    startTransition(async () => {
      const result = await updateScenario({ id, overrides: liveOverrides });
      if (result.ok) {
        toast.success('Saved.');
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  const persistCreate = (name: string) => {
    if (!name.trim()) {
      toast.error("Name can't be empty.");
      return;
    }
    startTransition(async () => {
      const result = await createScenario({
        name: name.trim(),
        overrides: liveOverrides,
      });
      if (result.ok) {
        toast.success(`Saved "${name.trim()}".`);
        setNameDraft(null);
        onSelect(result.data.id);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  const handleSave = () => {
    if (!isDirty || isPending) return;
    if (selected) {
      persistUpdate(selected.id);
    } else {
      // Open the inline name editor instead of window.prompt.
      setNameDraft('');
    }
  };

  const handleDelete = () => {
    if (!selected) return;
    setConfirmDeleteOpen(true);
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

  const handleReset = () => {
    onSelect(selectedScenarioId);
  };

  // Cmd/Ctrl+S triggers Save. Listen at document level so the shortcut works
  // regardless of which input has focus inside the simulator page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isSave = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's';
      if (!isSave) return;
      e.preventDefault();
      handleSave();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // handleSave closes over isDirty/isPending/selected/liveOverrides, but
    // re-binding the listener on every keystroke would churn document
    // listeners. Reading current values via refs is overkill for this scope —
    // just re-bind on the deps that change save targets.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty, isPending, selected?.id, liveOverrides]);

  return (
    <header className="mb-6 flex items-baseline justify-between border-b border-border pb-4 md:mb-8">
      <div className="space-y-1.5">
        <p className="text-eyebrow">Plan</p>
        <h1 className="text-xl font-semibold tracking-tight">Simulator</h1>
        <div className="flex items-baseline gap-2 text-sm text-muted-foreground">
          <select
            value={selectedScenarioId ?? ''}
            onChange={(e) => onSelect(e.target.value || null)}
            className="-ml-1 cursor-pointer rounded border-0 bg-transparent px-1 py-0 hover:bg-accent"
            disabled={isPending}
          >
            <option value="">Baseline (no overrides)</option>
            {scenarios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {isDirty && (
            <span className="font-medium text-amber-600 dark:text-amber-400">
              · unsaved changes
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {nameDraft !== null ? (
          // Inline name editor — replaces window.prompt for new scenarios.
          <form
            onSubmit={(e) => {
              e.preventDefault();
              persistCreate(nameDraft);
            }}
            className="flex items-center gap-2"
          >
            <Input
              ref={nameInputRef}
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setNameDraft(null);
              }}
              placeholder="Scenario name"
              maxLength={120}
              disabled={isPending}
              className="h-9 w-48 text-sm"
            />
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? 'Saving…' : 'Save'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setNameDraft(null)}
              disabled={isPending}
            >
              Cancel
            </Button>
          </form>
        ) : (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              disabled={!isDirty || isPending}
            >
              Reset
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!isDirty || isPending}
              title={selected ? 'Save (⌘S)' : 'Save as new scenario (⌘S)'}
            >
              {isPending ? 'Saving…' : selected ? 'Save' : 'Save as…'}
            </Button>
            {selected && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDelete}
                disabled={isPending}
                className="text-muted-foreground hover:text-destructive"
              >
                Delete
              </Button>
            )}
          </>
        )}
      </div>

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
    </header>
  );
}
